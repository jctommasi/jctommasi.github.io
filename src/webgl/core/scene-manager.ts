/**
 * Scene manager (US-007) — the small engine API every scene plugs into.
 *
 * Owns the SINGLE `requestAnimationFrame` loop for the page (manual §7.4): the
 * loop drives only the active scene's `update`, which draws through the one
 * shared renderer. Scenes are registered once and swapped via `setActive`
 * (mount/unmount). Later stories build on this contract without changing it:
 *   - US-008 device-tier probe → exposed to scenes via `SceneContext.tier`
 *   - US-011 Lenis camera      → scene reads scroll/velocity inside `update`
 *   - US-013 offscreen pause    → `stop()`/`start()` on the active scene
 *
 * The per-frame delta is CLAMPED so a backgrounded tab returning after seconds
 * away can't produce a huge time-step jump (loop hygiene now; US-011 builds the
 * scroll camera on top, US-013 the visibility pause).
 */
import {
  Camera,
  Mesh,
  NoColorSpace,
  PlaneGeometry,
  Scene as ThreeScene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import type { WebGLRenderer } from 'three';
import type { DeviceTier } from './device-tier';
import type { ScrollState } from './scroll';
import type { AudioReactiveState } from './audio-reactive';
import { prefersReducedMotion } from '../../theme/motion';
import postVertexShader from '../shaders/post.vert.glsl?raw';
import crossfadeFragmentShader from '../shaders/crossfade.frag.glsl?raw';

/** Everything a scene needs from the engine at mount/update/resize time. */
export interface SceneContext {
  readonly renderer: WebGLRenderer;
  /** Quality tier chosen at load (US-008); scenes scale their work to it. */
  readonly tier: DeviceTier;
  /**
   * Where a scene's FINAL composited frame should land (US-044). `null` (the
   * default and the steady state) means the screen — the scene renders exactly as
   * before. During a theme-boundary crossfade the manager points this at an
   * offscreen render target before each scene's `update`, captures both worlds,
   * and dissolves them to the screen in one pass. Scenes pass it straight to
   * `post.render(...)` / use it as the final `setRenderTarget` argument; when it's
   * null the render path is byte-identical to pre-US-044.
   */
  outputTarget: WebGLRenderTarget | null;
  /**
   * Live scroll readout (US-011): a mutable object refreshed before every
   * `update` (see `onFrame`). Scenes capture this reference at mount and read
   * `progress`/`velocity`/`direction` each frame to drive the camera (§8).
   */
  readonly scroll: ScrollState;
  /**
   * Live audio readout (US-043): a mutable object refreshed before every `update`
   * (sampled in `onFrame`). Zeroed when nothing is playing, so the rain scene can
   * read `level`/`bass` each frame to lift density/brightness/accent — a no-op at
   * rest (dormant), live the moment an episode plays.
   */
  readonly audio: AudioReactiveState;
  width: number;
  height: number;
}

/** The contract a scene implements to plug into the shared engine. */
export interface Scene {
  readonly id: string;
  /** Create GPU/Three resources; called once when the scene becomes active. */
  mount(ctx: SceneContext): void;
  /** Dispose all resources created in `mount`. */
  unmount(): void;
  /** React to a viewport size change. */
  resize(width: number, height: number): void;
  /**
   * Advance and draw one frame through `ctx.renderer`. `deltaSeconds` is clamped
   * (0 on the first frame / a frozen render); `elapsedSeconds` is total active time.
   */
  update(deltaSeconds: number, elapsedSeconds: number): void;
}

/** Clamp ceiling: a tab refocus must not yield a multi-second delta (≈2 frames). */
const MAX_DELTA_SECONDS = 1 / 30;

/**
 * Scene-crossfade window (ms) — matches the US-029 token crossfade in theme.css
 * (`700ms ease`) so the WebGL worlds dissolve on the SAME schedule as the chrome
 * tokens at a theme boundary. Driven by real wall-clock time (not the loop's
 * clamped dt), so the dissolve always lasts ~700 ms regardless of frame rate.
 */
const CROSSFADE_MS = 700;

/**
 * Smoothstep ease applied to the linear blend progress. It is SYMMETRIC —
 * `smoothstep(1 - x) === 1 - smoothstep(x)` — which is what makes a reverse
 * mid-blend continuous: flipping the scenes and mirroring the progress to
 * `1 - progress` keeps the on-screen mix exactly where it was (AC4).
 */
function smoothstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/** Page-relative clock aligned with the rAF timestamp, so progress is wall-clock. */
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

/** GPU resources for the scene-crossfade composite (US-044); built lazily once. */
interface CrossfadeResources {
  /** The outgoing scene's frame this window. */
  readonly rtFrom: WebGLRenderTarget;
  /** The incoming scene's frame this window. */
  readonly rtTo: WebGLRenderTarget;
  readonly scene: ThreeScene;
  readonly camera: Camera;
  readonly geometry: PlaneGeometry;
  readonly material: ShaderMaterial;
}

export class SceneManager {
  private readonly scenes = new Map<string, Scene>();
  private readonly ctx: SceneContext;
  private active: Scene | null = null;
  private rafId = 0;
  private running = false;
  private lastTs = 0;
  private elapsed = 0;
  private frames = 0;

  // US-044 scene crossfade. At a theme boundary the OUTGOING scene stays mounted as
  // `fading` alongside the incoming `active` for ~700 ms; each renders to its own
  // target and the two dissolve to the screen. `crossfade` (the composite GPU
  // resources) is built lazily on the first boundary — a page that never leaves the
  // matrix zone pays nothing. `elapsed` stays continuous across the swap so the
  // outgoing scene's animation never jumps.
  private fading: Scene | null = null;
  private fadeStartMs = 0;
  private fadeProgress = 0; // linear 0..1; eased via smoothstep at composite time
  private crossfade: CrossfadeResources | null = null;

  /**
   * Optional per-frame pump run at the START of each tick, before the active
   * scene's `update` (US-011: the engine sets this to advance Lenis so the scroll
   * state is fresh when the scene reads it). Kept as a plain hook so the manager
   * stays decoupled from the scroll library. Receives the raw rAF timestamp (ms).
   */
  onFrame: ((timeMs: number) => void) | null = null;

  constructor(
    renderer: WebGLRenderer,
    width: number,
    height: number,
    tier: DeviceTier,
    scroll: ScrollState,
    audio: AudioReactiveState,
  ) {
    this.ctx = { renderer, tier, scroll, audio, width, height, outputTarget: null };
  }

  /** Register a scene by its id; does not mount it. */
  register(scene: Scene): void {
    this.scenes.set(scene.id, scene);
  }

  /**
   * Switch the active scene to `id` (US-040). The FIRST activation hard-mounts (no
   * outgoing scene to dissolve); every later switch CROSSFADES over CROSSFADE_MS
   * (US-044) — the outgoing scene stays mounted as `fading` and the two worlds
   * dissolve to the screen. `activeId` reports `id` immediately so the engine's
   * zone tracking is unchanged. Mid-crossfade re-targets are handled:
   *   - same as the incoming    → no-op (already heading there)
   *   - back to the outgoing     → reverse, mirroring progress (symmetric, AC4)
   *   - to a third zone          → settle the current blend, then start a fresh one
   */
  setActive(id: string): void {
    const next = this.scenes.get(id);
    if (!next) throw new Error(`SceneManager: no scene registered with id "${id}"`);

    if (this.fading) {
      if (this.active === next) return; // already dissolving toward it
      if (this.fading === next) {
        // Scroll-back to the outgoing zone: swap roles and mirror the LIVE progress
        // so the on-screen mix is continuous (smoothstep is symmetric — see above).
        const ts = now();
        const current = Math.min(1, Math.max(0, (ts - this.fadeStartMs) / CROSSFADE_MS));
        const previous = this.active!;
        this.active = this.fading;
        this.fading = previous;
        this.fadeProgress = 1 - current;
        this.fadeStartMs = ts - this.fadeProgress * CROSSFADE_MS;
        return;
      }
      // A third zone arrived mid-blend: settle the current one (the incoming
      // becomes the active baseline), then fall through to start a fresh crossfade.
      this.finishCrossfade();
    }

    if (this.active === next) return;

    // First mount ever, or crossfades disabled (reduced motion): hard cut — there is
    // nothing to dissolve, or the RM path must collapse to the poster fade (AC4).
    if (!this.active || !this.crossfadeEnabled) {
      this.active?.unmount();
      this.active = next;
      this.elapsed = 0;
      next.mount(this.ctx);
      next.resize(this.ctx.width, this.ctx.height);
      return;
    }

    // Start a crossfade: keep the outgoing scene mounted as `fading`, mount the
    // incoming as `active`, and run the blend over CROSSFADE_MS. `elapsed` is NOT
    // reset (continuous), so the outgoing scene's animation does not jump.
    this.fading = this.active;
    this.active = next;
    next.mount(this.ctx);
    next.resize(this.ctx.width, this.ctx.height);
    this.ensureCrossfade();
    this.fadeProgress = 0;
    this.fadeStartMs = now();
  }

  /**
   * Whether scene switches crossfade. The engine never boots when the visitor
   * opted into the calm version (the SceneCanvas kill-switch reads the same
   * `data-motion`), so this is effectively always true; the guard documents
   * intent and keeps a hard cut if the manager is ever driven in calm mode — the
   * calm boundary stays the ≤150 ms poster fade (US-030, AC4/P5).
   */
  private get crossfadeEnabled(): boolean {
    return !prefersReducedMotion();
  }

  /** Build the crossfade composite resources once, sized to the drawing buffer. */
  private ensureCrossfade(): CrossfadeResources {
    if (this.crossfade) return this.crossfade;
    const renderer = this.ctx.renderer;
    const buffer = renderer.getDrawingBufferSize(new Vector2());
    const makeTarget = (): WebGLRenderTarget => {
      // No depth: each target receives a scene's FINAL composited colour (the post
      // chain keeps its own depth internally; low/medium tiers write no depth).
      const rt = new WebGLRenderTarget(buffer.x, buffer.y, { depthBuffer: false });
      rt.texture.colorSpace = NoColorSpace; // raw sRGB pass-through (P7), like post.ts
      rt.texture.generateMipmaps = false;
      return rt;
    };
    const rtFrom = makeTarget();
    const rtTo = makeTarget();
    const geometry = new PlaneGeometry(2, 2);
    const material = new ShaderMaterial({
      vertexShader: postVertexShader,
      fragmentShader: crossfadeFragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uFrom: { value: rtFrom.texture },
        uTo: { value: rtTo.texture },
        uMix: { value: 0 },
      },
    });
    const quad = new Mesh(geometry, material);
    quad.frustumCulled = false;
    const scene = new ThreeScene();
    scene.add(quad);
    const camera = new Camera(); // identity; the passthrough vertex shader ignores it
    this.crossfade = { rtFrom, rtTo, scene, camera, geometry, material };
    return this.crossfade;
  }

  /** Render both worlds to their targets and dissolve them to the screen (US-044). */
  private renderCrossfade(ts: number, deltaSeconds: number): void {
    const cf = this.crossfade!;
    const fading = this.fading!;
    const active = this.active!;

    // Progress over REAL wall-clock (not the clamped dt) so the dissolve always
    // lasts ~700 ms — the same window as the US-029 token crossfade.
    const progress = Math.min(1, Math.max(0, (ts - this.fadeStartMs) / CROSSFADE_MS));
    this.fadeProgress = progress;

    // Both worlds advance on the same continuous `elapsed`, each to its own target.
    this.ctx.outputTarget = cf.rtFrom;
    fading.update(deltaSeconds, this.elapsed);
    this.ctx.outputTarget = cf.rtTo;
    active.update(deltaSeconds, this.elapsed);

    // Dissolve to the screen with the symmetric smoothstep ease.
    this.ctx.outputTarget = null;
    cf.material.uniforms.uMix!.value = smoothstep(progress);
    this.ctx.renderer.setRenderTarget(null);
    this.ctx.renderer.render(cf.scene, cf.camera);

    if (progress >= 1) this.finishCrossfade();
  }

  /** End the crossfade: unmount the outgoing scene (it wastes no GPU thereafter). */
  private finishCrossfade(): void {
    if (!this.fading) return;
    this.fading.unmount();
    this.fading = null;
    this.fadeProgress = 1;
    this.ctx.outputTarget = null;
  }

  /** Release the crossfade composite resources. */
  private disposeCrossfade(): void {
    if (!this.crossfade) return;
    this.crossfade.rtFrom.dispose();
    this.crossfade.rtTo.dispose();
    this.crossfade.geometry.dispose();
    this.crossfade.material.dispose();
    this.crossfade = null;
  }

  /** Propagate a viewport resize to the shared renderer and the active scene. */
  resize(width: number, height: number): void {
    this.ctx.width = width;
    this.ctx.height = height;
    // updateStyle=false: CSS sizes the canvas to 100%; we only set the buffer.
    this.ctx.renderer.setSize(width, height, false);
    this.active?.resize(width, height);
    // During a crossfade the outgoing scene + the composite targets resize too.
    this.fading?.resize(width, height);
    if (this.crossfade) {
      const buffer = this.ctx.renderer.getDrawingBufferSize(new Vector2());
      this.crossfade.rtFrom.setSize(buffer.x, buffer.y);
      this.crossfade.rtTo.setSize(buffer.x, buffer.y);
    }
  }

  /** Draw a single frozen frame without starting the loop (reduced-motion / paused rungs). */
  renderOnce(): void {
    this.ctx.outputTarget = null; // a frozen frame always goes straight to the screen
    this.active?.update(0, this.elapsed);
  }

  /** Begin the rAF loop (idempotent). */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTs = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  /** Stop the rAF loop (idempotent). */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** The id of the currently-active scene, or null before the first setActive. */
  get activeId(): string | null {
    return this.active?.id ?? null;
  }

  /** True while a scene-to-scene crossfade is in flight (US-044 debug observable). */
  get transitioning(): boolean {
    return this.fading !== null;
  }

  /** The outgoing scene's id during a crossfade, else null. */
  get transitionFromId(): string | null {
    return this.fading?.id ?? null;
  }

  /** Eased blend factor 0→1 (0 = fully outgoing, 1 = fully incoming); 0 when idle. */
  get transitionProgress(): number {
    return this.fading ? smoothstep(this.fadeProgress) : 0;
  }

  /**
   * Total frames rendered since construction (US-013 debug counter). The loop is
   * the single place a frame is drawn, so a frozen count proves rendering has
   * stopped while paused (offscreen / hidden tab) — the AC's "debug counter".
   */
  get frameCount(): number {
    return this.frames;
  }

  /**
   * Rebuild the active scene's GPU resources on a freshly-restored context
   * (US-047 — runtime WebGL context-loss recovery). A context loss invalidates
   * every texture / buffer / render target; Three re-initialises the renderer on
   * `webglcontextrestored`, and this remounts the active scene so all of its
   * resources are recreated against the new context. Any in-flight crossfade is
   * dropped first — it cannot complete across the loss. This reuses the very same
   * unmount→mount cycle `setActive` runs on every zone switch, so it is safe by
   * construction; the engine calls it inside a try/catch (poster on failure).
   */
  reload(): void {
    // Drop a half-finished crossfade: its targets + outgoing scene are gone.
    this.fading?.unmount();
    this.fading = null;
    this.fadeProgress = 1;
    this.disposeCrossfade();
    const scene = this.active;
    if (!scene) return;
    this.ctx.outputTarget = null;
    scene.unmount();
    this.elapsed = 0;
    scene.mount(this.ctx);
    scene.resize(this.ctx.width, this.ctx.height);
  }

  /** Stop the loop and tear down the active (and any fading) scene. */
  dispose(): void {
    this.stop();
    this.fading?.unmount();
    this.fading = null;
    this.active?.unmount();
    this.active = null;
    this.disposeCrossfade();
  }

  private readonly tick = (ts: number): void => {
    if (!this.running) return;
    // ts is a DOMHighResTimeStamp in ms. First tick has no reference → dt 0.
    const dt = this.lastTs ? Math.min((ts - this.lastTs) / 1000, MAX_DELTA_SECONDS) : 0;
    this.lastTs = ts;
    this.elapsed += dt;
    // Advance scroll (Lenis) + sample audio BEFORE the scenes read them. The raw
    // `ts` keeps Lenis' own smoothing in real time; scene motion uses the CLAMPED
    // `dt` above, so a tab refocus can't jump.
    this.onFrame?.(ts);

    if (this.fading && this.crossfade) {
      // US-044: a theme boundary is in progress — render both worlds and dissolve.
      this.renderCrossfade(ts, dt);
    } else {
      // Steady state: render the active scene straight to the screen. outputTarget
      // stays null so the path is byte-identical to pre-US-044.
      this.ctx.outputTarget = null;
      this.active?.update(dt, this.elapsed);
    }

    this.frames++; // US-013: per-frame render tally; frozen while the loop is paused.
    this.rafId = requestAnimationFrame(this.tick);
  };
}
