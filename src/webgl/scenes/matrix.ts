/**
 * Matrix scene (US-009/US-010/US-011/US-012) — the iconic falling-glyph digital
 * rain, the global/default zone.
 *
 * As of US-042 the rain/terrain/post engine lives in the shared `createRainScene`
 * factory (scenes/rain-scene.ts); this file is the thin Matrix CONFIG: the
 * half-width-katakana glyph atlas (glyph-atlas.ts) and the full `--mx-*` green
 * ramp (palette.ts, P7). The Note-rain (scenes/note.ts) is the same factory with
 * the atlas swapped to musical notes — see rain-scene.ts for the engine.
 *
 * Matrix carries NO head accent (`accentStrength: 0`), so the rain shader's new
 * violet-accent mix is a no-op and the rain is byte-identical to pre-US-042.
 */
import { createRainScene, type RainSceneConfig } from './rain-scene';
import type { Scene } from '../core/scene-manager';
import { MX_VOID, MX_GREEN, MX_GREEN_MID, MX_GREEN_FAR, MX_GREEN_HI } from '../palette';
import {
  bakeGlyphAtlas,
  loadAtlasFont,
  ATLAS_COLS,
  ATLAS_ROWS,
  GLYPH_COUNT,
  FALLBACK_FONT_FAMILY,
} from '../atlas/glyph-atlas';

/**
 * The Matrix rain config. Exported so the airport scene (US-302) can reuse it
 * verbatim — at morph 0 the aeronautics zone IS the Matrix cruise, which is what
 * makes the zone-boundary handoff invisible (US-044 crossfades identical frames).
 */
export const MATRIX_CONFIG: RainSceneConfig = {
  id: 'matrix',
  debugKey: '__MATRIX__',
  atlas: {
    cols: ATLAS_COLS,
    rows: ATLAS_ROWS,
    glyphCount: GLYPH_COUNT,
    fallbackFamily: FALLBACK_FONT_FAMILY,
    bake: bakeGlyphAtlas,
    loadFont: loadAtlasFont,
  },
  palette: {
    void: MX_VOID,
    head: MX_GREEN_HI,
    body: MX_GREEN,
    trail: MX_GREEN_FAR,
    accent: MX_GREEN_HI, // unused (strength 0) — Matrix heads stay pure green
    accentStrength: 0,
    terrainLine: MX_GREEN_MID,
    terrainFog: MX_GREEN_FAR,
  },
};

export function createMatrixScene(): Scene {
  return createRainScene(MATRIX_CONFIG);
}
