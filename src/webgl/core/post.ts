/**
 * Post-processing pipeline (US-012, manual §7.1 / §14, US-C3) — the tier-gated
 * depth-of-field + CRT signature for the Matrix scene.
 *
 * Hand-rolled rather than via Three's `EffectComposer`/`BokehPass`: the scene
 * draws through CUSTOM vertex shaders (the rain quad emits clip space directly;
 * the terrain is GPU-displaced), so a stock depth pre-pass with an override
 * material would compute the wrong depth. Instead the scene renders once into an
 * RT (with a DepthTexture when DOF is on), and one or two full-screen passes
 * composite to the screen. Keeping it to ONE signature (a couple of cheap full-
 * screen passes) is both the manual's instruction ("not a pile of effects") and
 * the performance budget (US-009/US-048; the ≥55 fps target is owner-measured on
 * a real GPU).
 *
 * The passes are chosen by the device tier (US-008):
 *   - high   → DOF + CRT  (scene → DOF → CRT → screen)
 *   - medium → CRT only   (scene → CRT → screen)
 *   - low    → no pipeline (`createPostPipeline` returns null; the scene renders
 *              direct to the screen exactly as before US-012 — AC: low tier
 *              disables DOF/post-FX with no layout or visual break)
 *
 * Colour management: the scene's bare ShaderMaterials write raw sRGB-encoded
 * values (no output colour management), the render targets are `NoColorSpace`,
 * and the post passes are ShaderMaterials too — so values pass through unchanged
 * and the screen shows the same `--mx-*` hexes as a direct render (P7).
 */
import {
  Camera,
  DepthTexture,
  Mesh,
  NoColorSpace,
  PlaneGeometry,
  Scene as ThreeScene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import postVertexShader from '../shaders/post.vert.glsl?raw';
import dofFragmentShader from '../shaders/dof.frag.glsl?raw';
import crtFragmentShader from '../shaders/crt.frag.glsl?raw';

export interface PostOptions {
  /** Enable the depth-of-field far-field blur (high tier). */
  readonly dof: boolean;
  /** Enable the CRT bloom/scanline/chromatic signature (high + medium tiers). */
  readonly postFx: boolean;
  /** Camera near plane (for DOF depth linearisation). */
  readonly near: number;
  /** Camera far plane (for DOF depth linearisation). */
  readonly far: number;
}

export interface PostPipeline {
  readonly dof: boolean;
  readonly postFx: boolean;
  /**
   * Render `scene`/`camera` through the active passes to `outputTarget` (a render
   * target during a US-044 scene crossfade) or — the default and steady state —
   * to the screen (`null`).
   */
  render(scene: ThreeScene, camera: Camera, outputTarget?: WebGLRenderTarget | null): void;
  /** Resize the render targets + resolution-derived uniforms (drawing-buffer px). */
  resize(width: number, height: number): void;
  dispose(): void;
}

/* ── DOF tuning ──────────────────────────────────────────────────────────────
 * Distances are view-space world units. The terrain TRACKS the camera (US-011),
 * so its depth distribution is scroll-invariant — a fixed focus stays correct
 * through the whole flight ("focus distance roughly fixed"). First-pass values;
 * retune with section framings (US-045) and the perf budget (US-048). */
const DOF_FOCUS = 120;
const DOF_RANGE = 230;
const DOF_MAX_BLUR = 6.0; // px (far-field softening; restrained, owner-retuned on real HW)

/* ── CRT tuning (all restrained + capped; the pass is time-invariant) ───────── */
const CRT_SCAN_INTENSITY = 0.08; // faint
const CRT_SCAN_CSS_PX = 3.0; // ~one scanline per 3 CSS px (resolution-independent)
const CRT_CHROMA_PX = 1.6; // slight edge
const CRT_BLOOM = 0.6;
const CRT_BLOOM_THRESH = 0.55;

/** Scanline cycles across the height, derived from CSS px so density is DPR-stable. */
function scanCount(renderer: WebGLRenderer, bufferHeight: number): number {
  const dpr = renderer.getPixelRatio() || 1;
  return bufferHeight / dpr / CRT_SCAN_CSS_PX;
}

/**
 * Build the post pipeline for a tier, or return null when neither pass is
 * enabled (low tier → the caller renders direct to the screen). `width`/`height`
 * are the renderer's drawing-buffer size in physical px.
 */
export function createPostPipeline(
  renderer: WebGLRenderer,
  width: number,
  height: number,
  options: PostOptions,
): PostPipeline | null {
  if (!options.dof && !options.postFx) return null;

  const { dof, postFx, near, far } = options;

  // Scene target: colour + depth. A DepthTexture is attached only when DOF needs
  // to read per-pixel depth (medium/CRT-only never allocates one).
  const sceneTarget = new WebGLRenderTarget(width, height, { depthBuffer: true });
  sceneTarget.texture.colorSpace = NoColorSpace;
  sceneTarget.texture.generateMipmaps = false;
  if (dof) {
    sceneTarget.depthTexture = new DepthTexture(width, height);
  }

  // Intermediate target only needed when BOTH passes run (DOF → CRT).
  const midTarget =
    dof && postFx ? new WebGLRenderTarget(width, height, { depthBuffer: false }) : null;
  if (midTarget) {
    midTarget.texture.colorSpace = NoColorSpace;
    midTarget.texture.generateMipmaps = false;
  }

  // One full-screen quad reused for every pass (material swapped per pass).
  const quadGeometry = new PlaneGeometry(2, 2);
  const quadScene = new ThreeScene();
  const quadCamera = new Camera(); // identity; the passthrough vertex shader ignores it
  const quadMesh = new Mesh(quadGeometry);
  quadMesh.frustumCulled = false;
  quadScene.add(quadMesh);

  const texel = new Vector2(1 / width, 1 / height);

  const dofMaterial = dof
    ? new ShaderMaterial({
        vertexShader: postVertexShader,
        fragmentShader: dofFragmentShader,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uColor: { value: sceneTarget.texture },
          uDepth: { value: sceneTarget.depthTexture },
          uTexel: { value: texel.clone() },
          uNear: { value: near },
          uFar: { value: far },
          uFocus: { value: DOF_FOCUS },
          uRange: { value: DOF_RANGE },
          uMaxBlur: { value: DOF_MAX_BLUR },
        },
      })
    : null;

  const crtMaterial = postFx
    ? new ShaderMaterial({
        vertexShader: postVertexShader,
        fragmentShader: crtFragmentShader,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uColor: { value: sceneTarget.texture },
          uTexel: { value: texel.clone() },
          uScanCount: { value: scanCount(renderer, height) },
          uScanIntensity: { value: CRT_SCAN_INTENSITY },
          uChroma: { value: CRT_CHROMA_PX },
          uBloom: { value: CRT_BLOOM },
          uBloomThresh: { value: CRT_BLOOM_THRESH },
        },
      })
    : null;

  return {
    dof,
    postFx,

    render(scene, camera, outputTarget = null) {
      // The final pass targets `outputTarget` (an RT during a US-044 crossfade) or
      // the screen (`null`, the default + steady state — byte-identical to before).
      // Pass 0: scene → scene target (autoClear handles colour + depth clear).
      renderer.setRenderTarget(sceneTarget);
      renderer.render(scene, camera);

      // Pass 1 (DOF): scene target → mid target (if CRT follows) or the output.
      if (dof && dofMaterial) {
        quadMesh.material = dofMaterial;
        renderer.setRenderTarget(postFx ? midTarget : outputTarget);
        renderer.render(quadScene, quadCamera);
      }

      // Pass 2 (CRT): (DOF output | scene) → the output.
      if (postFx && crtMaterial) {
        // When DOF ran, midTarget is guaranteed (created iff dof && postFx).
        crtMaterial.uniforms.uColor!.value = dof ? midTarget!.texture : sceneTarget.texture;
        quadMesh.material = crtMaterial;
        renderer.setRenderTarget(outputTarget);
        renderer.render(quadScene, quadCamera);
      }

      renderer.setRenderTarget(null);
    },

    resize(w, h) {
      sceneTarget.setSize(w, h); // resizes the attached DepthTexture too
      midTarget?.setSize(w, h);
      const t = new Vector2(1 / w, 1 / h);
      if (dofMaterial) (dofMaterial.uniforms.uTexel!.value as Vector2).copy(t);
      if (crtMaterial) {
        (crtMaterial.uniforms.uTexel!.value as Vector2).copy(t);
        crtMaterial.uniforms.uScanCount!.value = scanCount(renderer, h);
      }
    },

    dispose() {
      sceneTarget.depthTexture?.dispose();
      sceneTarget.dispose();
      midTarget?.dispose();
      dofMaterial?.dispose();
      crtMaterial?.dispose();
      quadGeometry.dispose();
    },
  };
}
