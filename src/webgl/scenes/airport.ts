/**
 * Airport (aeronautics) scene (US-302, PRD prd-aeronautics-airport-g1000) — the
 * Aeronautics zone's world, REPLACING the old Sky scene (US-040, removed here).
 *
 * The design: this is the SAME rain/terrain/scroll/post chassis as the Matrix
 * digital rain — it reuses `createRainScene(MATRIX_CONFIG)` verbatim, so at
 * morph 0 the aeronautics zone renders the byte-identical Matrix cruise. That is
 * the load-bearing property of the whole feature: because uMorph ≈ 0 at BOTH
 * theme-flip boundaries, the existing US-044 700 ms crossfade dissolves two
 * visually identical frames → the owner's "continuous morph, no cut" with ZERO
 * scene-manager changes. The G1000 synthetic-vision terrain morph (US-303), the
 * airport geometry (US-304), and the final-approach camera choreography (US-305)
 * grow the SVT + airport OUT of this Matrix cruise as the section is scrolled.
 *
 * The `aero: true` config flag makes the shared chassis publish `window.__AERO__`
 * (RainDebug + { morph, zoneProgress, cameraY }) instead of `__MATRIX__`.
 *
 * INTERIM (US-302 only): the aero zone shows the plain Matrix look until US-303
 * lands the SVT morph — the expected US-028→US-041 interim pattern.
 */
import { createRainScene, type RainSceneConfig } from './rain-scene';
import type { Scene } from '../core/scene-manager';
import { MATRIX_CONFIG } from './matrix';

const AIRPORT_CONFIG: RainSceneConfig = {
  ...MATRIX_CONFIG,
  id: 'airport',
  debugKey: '__AERO__',
  aero: true,
};

export function createAirportScene(): Scene {
  return createRainScene(AIRPORT_CONFIG);
}
