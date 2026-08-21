/**
 * Audio-reactive bridge (US-043, manual §7.3 / US-G3) — the DORMANT wiring that
 * lets a playing episode light up the rain.
 *
 * This module lives in the lazily-imported engine chunk (engine.ts → here), so it
 * loads ONLY when the engine boots — and the SceneCanvas bootstrap never fetches
 * that chunk under `prefers-reduced-motion` (the P5 kill-switch) or on the
 * WebGL-failure poster path. So audio reactivity is structurally absent exactly
 * when motion is (no engine ⇒ no analyser ⇒ a static poster, the owner's path).
 *
 * It is OPTIONAL and INERT by construction (AC2): nothing happens until an
 * `<audio>`/`<video>` actually fires `play`. With no audio source — or in a
 * browser without Web Audio — the controller never builds an AudioContext, every
 * method is a guarded no-op, and the live `state` stays zeroed, so the rain runs
 * its procedural animation completely unaffected (and `createAudioReactiveController`
 * / `sample` / `destroy` never throw). The whole Web-Audio surface is wrapped
 * defensively: a context-creation, source-routing or CORS failure is swallowed and
 * leaves the controller inert, never bubbling an exception into the rAF loop.
 *
 * When audio plays, an AnalyserNode is attached to it and the smoothed `level`
 * (overall amplitude) + `bass` (low-frequency energy) feed `SceneContext.audio`;
 * the rain scene reads them each frame to lift rain density, head brightness and
 * the violet `--note-accent` intensity (rain-scene.ts). The smoothing is heavy and
 * the visual deltas are bounded so a percussive track swells the rain rather than
 * strobing it — no new flashing beyond the already frequency-capped rain (§15 /
 * WCAG 2.3.1).
 */

/** Live audio readout the active scene reads each frame (the scene-facing contract). */
export interface AudioReactiveState {
  /** Smoothed overall amplitude 0..1 of the currently-playing audio; 0 when silent/none. */
  level: number;
  /** Smoothed low-frequency (bass) energy 0..1; the frequency-derived companion to `level`. */
  bass: number;
}

export interface AudioReactiveController {
  /** Live, mutable audio readout — read every frame by the active scene. */
  readonly state: AudioReactiveState;
  /** Sample the analyser into `state` for this frame; called from the single rAF loop. */
  sample(): void;
  /** Tear down listeners + the AudioContext; restores the original audio routing implicitly. */
  destroy(): void;
}

/** A zeroed readout for manager/scene contexts that have no live controller (RM, tests). */
export function createZeroAudioState(): AudioReactiveState {
  return { level: 0, bass: 0 };
}

/** FFT size: 1024 samples → 512 frequency bins; cheap, ample resolution for amplitude/bass. */
const FFT_SIZE = 1024;
/** Fraction of the spectrum (from DC up) treated as "bass" for the density punch. */
const BASS_FRACTION = 1 / 8;

/**
 * Smoothing time-constants (seconds). The fall is slower than the rise so the rain
 * SWELLS with loud passages and eases back down — it can't strobe between beats
 * (flash-safety, §15 / WCAG 2.3.1). Frame-rate independent: applied as
 * `1 - exp(-dt/tau)` against a real-clock dt, so swiftshader's low fps behaves the
 * same as a 60 fps display.
 */
const ATTACK_TAU = 0.12;
const RELEASE_TAU = 0.35;

/** The `AudioContext` constructor, if Web Audio exists in this browser (else inert). */
function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Build the audio-reactive controller. Cheap and side-effect-light at construction:
 * it only adds a capturing `play` listener (the `play` event does not bubble) and
 * waits. The AudioContext + AnalyserNode are created lazily on the FIRST audio that
 * plays, so a page where nothing is ever played pays nothing and the readout stays
 * zeroed (AC2). Call only when motion is allowed (see the file header).
 */
export function createAudioReactiveController(): AudioReactiveController {
  const state = createZeroAudioState();
  const AudioCtor = getAudioContextCtor();

  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  // Annotated <ArrayBuffer> (not the default <ArrayBufferLike>) so the analyser's
  // getByte*Data methods accept them under TS 5.9's generic typed arrays.
  let timeBuf: Uint8Array<ArrayBuffer> | null = null;
  let freqBuf: Uint8Array<ArrayBuffer> | null = null;
  // Elements already routed through the analyser — createMediaElementSource throws
  // if called twice on one element, so each is wired at most once.
  const wired = new WeakSet<HTMLMediaElement>();
  let sourceCount = 0;
  let lastSampleMs = 0;
  let destroyed = false;

  /** Lazily create the AudioContext + analyser on first use; null if Web Audio is absent. */
  function ensureGraph(): boolean {
    if (analyser) return true;
    if (!AudioCtor || destroyed) return false;
    try {
      ctx = new AudioCtor();
      analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.6; // the analyser's own light smoothing
      // The analyser taps the signal on its way to the speakers, so audio stays
      // audible (a MediaElementSource detaches the element from the default output).
      analyser.connect(ctx.destination);
      timeBuf = new Uint8Array(analyser.fftSize);
      freqBuf = new Uint8Array(analyser.frequencyBinCount);
      return true;
    } catch {
      // No usable AudioContext (autoplay lock without a gesture, exhausted contexts,
      // etc.): stay inert — the rain keeps animating procedurally.
      ctx = null;
      analyser = null;
      return false;
    }
  }

  /** Route a freshly-playing media element through the analyser (once). Never throws. */
  function attach(el: HTMLMediaElement): void {
    if (destroyed || wired.has(el)) return;
    if (!ensureGraph() || !ctx || !analyser) return;
    try {
      const source = ctx.createMediaElementSource(el);
      source.connect(analyser);
      wired.add(el);
      sourceCount++;
      // The context may start suspended (autoplay policy); a real play is a user
      // gesture, so resuming here is allowed. Ignore the promise / any rejection.
      void ctx.resume?.().catch(() => {});
    } catch {
      // createMediaElementSource can reject a cross-origin or already-tapped element;
      // leave it playing untouched (just not analysed) rather than throw.
    }
  }

  const onPlay = (e: Event): void => {
    const el = e.target;
    if (el instanceof HTMLMediaElement) attach(el);
  };
  // `play` does not bubble → listen in the capture phase so any <audio>/<video>
  // anywhere in the document is caught, including ones added after this runs.
  if (typeof document !== 'undefined') {
    document.addEventListener('play', onPlay, true);
  }

  // Debug observability (mirrors window.__SCROLL__): the live readout + how many
  // media elements the analyser has tapped. Present only when the engine ran, so
  // its absence under reduced-motion is itself the signal.
  const debug = {
    get level(): number {
      return state.level;
    },
    get bass(): number {
      return state.bass;
    },
    get sources(): number {
      return sourceCount;
    },
  };
  if (typeof window !== 'undefined') window.__AUDIO__ = debug;

  return {
    state,

    sample(): void {
      if (destroyed || !analyser || !timeBuf || !freqBuf) return;
      // Real-clock dt for frame-rate-independent smoothing.
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      const dt = lastSampleMs ? Math.max(0, (now - lastSampleMs) / 1000) : 0;
      lastSampleMs = now;

      // Amplitude: RMS of the time-domain waveform (centred at 128). Robust for any
      // signal — a pure tone reads its true loudness, unlike a spread-out spectrum
      // average. This is the primary `level`.
      analyser.getByteTimeDomainData(timeBuf);
      let sumSq = 0;
      for (let i = 0; i < timeBuf.length; i++) {
        const v = (timeBuf[i]! - 128) / 128;
        sumSq += v * v;
      }
      const rmsLevel = Math.min(1, Math.sqrt(sumSq / timeBuf.length) * Math.SQRT2);

      // Bass: average magnitude of the low-frequency bins (genuinely frequency-domain).
      analyser.getByteFrequencyData(freqBuf);
      const bassBins = Math.max(1, Math.floor(freqBuf.length * BASS_FRACTION));
      let bassSum = 0;
      for (let i = 0; i < bassBins; i++) bassSum += freqBuf[i]!;
      const rawBass = bassSum / bassBins / 255;

      // Asymmetric smoothing: rise on ATTACK_TAU, fall on the slower RELEASE_TAU.
      state.level += (rmsLevel - state.level) * approach(dt, rmsLevel > state.level);
      state.bass += (rawBass - state.bass) * approach(dt, rawBass > state.bass);
    },

    destroy(): void {
      destroyed = true;
      if (typeof document !== 'undefined') document.removeEventListener('play', onPlay, true);
      try {
        analyser?.disconnect();
        void ctx?.close?.().catch(() => {});
      } catch {
        // Closing an already-closed/never-started context can throw; ignore.
      }
      analyser = null;
      ctx = null;
      timeBuf = null;
      freqBuf = null;
      state.level = 0;
      state.bass = 0;
      if (typeof window !== 'undefined' && window.__AUDIO__ === debug) {
        delete window.__AUDIO__;
      }
    },
  };

  /** Per-sample lerp factor for a time-constant (rise vs fall), frame-rate independent. */
  function approach(dt: number, rising: boolean): number {
    if (dt <= 0) return rising ? 1 : 0; // first sample: snap up, never overshoot down
    return 1 - Math.exp(-dt / (rising ? ATTACK_TAU : RELEASE_TAU));
  }
}

/* Debug global is wired by the engine (it owns the controller + the source count). */

declare global {
  interface Window {
    /**
     * Debug: live audio-reactive readout (US-043) — `level`/`bass` (0..1) and
     * `sources` (analyser-wired media elements). Set only while the engine runs;
     * its absence (like `__SCROLL__`) signals the reduced-motion / poster path.
     */
    __AUDIO__?: {
      readonly level: number;
      readonly bass: number;
      readonly sources: number;
    };
  }
}
