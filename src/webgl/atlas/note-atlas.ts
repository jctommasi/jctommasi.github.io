/**
 * Note-rain glyph atlas (US-042, manual §7.3 / US-G2) — the musical-note analogue
 * of the Matrix katakana atlas (glyph-atlas.ts).
 *
 * The Note-rain is the SAME rain engine with its falling glyphs swapped to
 * musical notes (♩ ♪ ♫ ♬ 𝄞 ♭ ♯); the shader is glyph-agnostic, so this only
 * changes which sheet it samples (the bake/grid maths are shared via
 * `bakeGlyphSheet`).
 *
 * Determinism (the US-009 rule): musical symbols don't render on a headless Linux
 * system font — and 𝄞 (U+1D11E) is an astral-plane glyph many fonts lack — so we
 * DON'T trust system fonts. A subset Noto Music woff2 (SIL OFL 1.1; fetched once
 * via the Google Fonts `text=` endpoint to exactly these 7 glyphs, ~3.5 KB) is
 * self-hosted and loaded via the FontFace API before the real bake. Until it
 * resolves we bake from a generic serif fallback so the scene is never blank;
 * `loadNoteFont()` resolves and the scene re-bakes (see the shared rain-scene
 * factory used by scenes/note.ts).
 */
import type { Texture } from 'three';
import { bakeGlyphSheet } from './glyph-atlas';
import fontUrl from './noto-music-subset.woff2?url';

/** The baked note set (US-042 AC1). An ARRAY — 𝄞 is a UTF-16 surrogate pair. */
export const NOTE_GLYPHS: readonly string[] = ['♩', '♪', '♫', '♬', '𝄞', '♭', '♯'];
export const NOTE_GLYPH_COUNT = NOTE_GLYPHS.length; // 7

/** Square-ish row-major grid that holds every note glyph; mirrored by the shader. */
export const NOTE_ATLAS_COLS = Math.ceil(Math.sqrt(NOTE_GLYPH_COUNT)); // 3
export const NOTE_ATLAS_ROWS = Math.ceil(NOTE_GLYPH_COUNT / NOTE_ATLAS_COLS); // 3

/** Family registered for the self-hosted face; the fallback used until it loads. */
const NOTE_FONT_FAMILY = 'NotoMusicAtlas';
export const NOTE_FALLBACK_FONT_FAMILY = 'serif';

/**
 * Bake the note sheet from `fontFamily` (the loaded face, or the fallback).
 * `cellPx` (US-048) sizes the texture to the device tier.
 */
export function bakeNoteAtlas(fontFamily: string, cellPx?: number): Texture {
  return bakeGlyphSheet(NOTE_GLYPHS, NOTE_ATLAS_COLS, NOTE_ATLAS_ROWS, fontFamily, cellPx);
}

let fontPromise: Promise<string> | null = null;

/**
 * Load the self-hosted Noto Music subset once and register it on `document.fonts`.
 * Resolves to the family to bake from, or to the serif fallback if the load fails
 * (the scene still renders). Idempotent (mirrors glyph-atlas.ts `loadAtlasFont`).
 */
export function loadNoteFont(): Promise<string> {
  if (fontPromise) return fontPromise;
  if (typeof FontFace === 'undefined') {
    fontPromise = Promise.resolve(NOTE_FALLBACK_FONT_FAMILY);
    return fontPromise;
  }
  const face = new FontFace(NOTE_FONT_FAMILY, `url(${fontUrl}) format('woff2')`);
  fontPromise = face
    .load()
    .then((loaded) => {
      document.fonts.add(loaded);
      return NOTE_FONT_FAMILY;
    })
    .catch(() => NOTE_FALLBACK_FONT_FAMILY);
  return fontPromise;
}
