/**
 * Note-rain scene (US-042, manual §7.3 / US-G2) — the Music zone's world.
 *
 * "Same rain/terrain engine, glyph atlas swapped to musical notes" (AC1): this is
 * the shared `createRainScene` factory (scenes/rain-scene.ts) with the Note-rain
 * CONFIG — the musical-note atlas (note-atlas.ts) instead of katakana, and a
 * subtle violet head accent. The engine switches to this scene when the zone
 * observer flips `data-theme` to `note` (engine.ts), REPLACING the static Note
 * poster from US-028 while live (the poster stays the reduced-motion / fallback
 * rung — the engine never boots under RM).
 *
 * Palette is the VIOLET WebGL environment ramp (US-405): the rain heads, body,
 * trail and wireframe terrain/fog run on `--note-head`/`--note-accent`/`--note-mid`/
 * `--note-far` — the whole world from Music to the footer is violet, not green.
 * `accent`/`accentStrength` (0.4) are UNCHANGED, so the US-043 audio path stays
 * dormant-not-broken. Matrix keeps `accentStrength: 0` (the no-op accent rule),
 * so the Matrix rain is byte-identical.
 */
import { createRainScene, type RainSceneConfig } from './rain-scene';
import type { Scene } from '../core/scene-manager';
import { NOTE_VOID, NOTE_ACCENT, NOTE_HEAD, NOTE_MID, NOTE_FAR } from '../palette';
import {
  bakeNoteAtlas,
  loadNoteFont,
  NOTE_ATLAS_COLS,
  NOTE_ATLAS_ROWS,
  NOTE_GLYPH_COUNT,
  NOTE_FALLBACK_FONT_FAMILY,
} from '../atlas/note-atlas';

/** Subtle baseline violet on the bloomed note heads (procedural; US-043 modulates from audio). */
const NOTE_ACCENT_STRENGTH = 0.4;

const NOTE_CONFIG: RainSceneConfig = {
  id: 'note',
  debugKey: '__NOTE__',
  atlas: {
    cols: NOTE_ATLAS_COLS,
    rows: NOTE_ATLAS_ROWS,
    glyphCount: NOTE_GLYPH_COUNT,
    fallbackFamily: NOTE_FALLBACK_FONT_FAMILY,
    bake: bakeNoteAtlas,
    loadFont: loadNoteFont,
  },
  palette: {
    void: NOTE_VOID,
    head: NOTE_HEAD,
    body: NOTE_ACCENT,
    // Violet fade (US-405) — the whole environment runs on the --note-* violet
    // ramp now; the deep violet --note-far carries the trail tail + fog.
    trail: NOTE_FAR,
    accent: NOTE_ACCENT,
    accentStrength: NOTE_ACCENT_STRENGTH,
    terrainLine: NOTE_MID,
    terrainFog: NOTE_FAR,
  },
};

export function createNoteScene(): Scene {
  return createRainScene(NOTE_CONFIG);
}
