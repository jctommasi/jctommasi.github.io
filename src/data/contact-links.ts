/**
 * Contact — FREQUENCY BANDS data (2026-08-09 redesign; the "05" concept).
 *
 * The Contact section renders THREE professional routes as stacked band links
 * (LinkedIn → GitHub → Medium / Blog — the mandated order lives in the channel
 * spec below). This module is the section's dedicated data source, and it
 * AUTHORS NOTHING (P3):
 *
 *   - `label` + `href` are the cv.json `contact.social[]` entry VERBATIM
 *     (language-agnostic proper nouns / URLs, US-003 — no pick(), zero P8
 *     strings);
 *   - `handle` is DERIVED from the URL's own path (`linkedin.com/in/jctommasi`
 *     → `jctommasi`, `github.com/jctommasi` → `@jctommasi`,
 *     `medium.com/@hackthebox` → `@hackthebox`) — the platform's own
 *     handle convention (`handlePrefix`) is presentation, the identifier is
 *     the URL's;
 *   - the two-digit index the section shows is array position, never data.
 *
 * Email + Instagram are deliberately NOT part of the channel spec — this
 * section reads only the three routes above (the P1-by-omission idiom).
 * cv.json itself is untouched: SeoHead's Person JSON-LD (sameAs = all 4
 * social URLs + the mailto email) still derives from the full CV record —
 * head metadata is a different surface from the Contact section.
 *
 * A channel missing from cv.json (or with an unparseable URL) renders
 * NOTHING — honest degradation, never a fabricated handle or an href="#".
 * Scaling: a new route is one entry here + its cv.json source; the section
 * template maps over whatever this returns (no duplicated markup).
 */

export type ContactChannelId = 'linkedin' | 'github' | 'medium';

export interface ContactLink {
  id: ContactChannelId;
  /** Channel name, verbatim from cv.json (e.g. "Medium / Blog"). */
  label: string;
  /** Visible handle, derived from the cv.json URL path — never authored. */
  handle: string;
  /** The cv.json URL, verbatim. */
  href: string;
  /** Icon.astro glyph name (decorative — the text carries the accname). */
  icon: string;
  /** Every band is an external route (target="_blank" rel="noopener"). */
  external: true;
}

interface ChannelSpec {
  id: ContactChannelId;
  /** cv.json URL hostname that identifies the channel (www. stripped). */
  host: string;
  icon: string;
  /**
   * The platform's handle convention: '@' prefixes the path segment when the
   * URL itself doesn't carry one (GitHub); LinkedIn profiles are bare slugs.
   */
  handlePrefix: '' | '@';
}

/** Mandated order: LinkedIn, GitHub, Medium / Blog. */
const CHANNELS: readonly ChannelSpec[] = [
  { id: 'linkedin', host: 'linkedin.com', icon: 'linkedin', handlePrefix: '' },
  { id: 'github', host: 'github.com', icon: 'github', handlePrefix: '@' },
  { id: 'medium', host: 'medium.com', icon: 'book', handlePrefix: '@' },
];

interface SocialEntry {
  label: string;
  url: string;
}

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

/** Last non-empty path segment of a URL — the platform's own identifier. */
const pathSlug = (url: string): string | null => {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : null;
  } catch {
    return null;
  }
};

export const buildContactLinks = (social: readonly SocialEntry[]): ContactLink[] =>
  CHANNELS.flatMap((spec): ContactLink[] => {
    const entry = social.find((s) => hostOf(s.url) === spec.host);
    if (!entry) return [];
    const slug = pathSlug(entry.url);
    if (!slug) return [];
    // A slug that already carries '@' (Medium) keeps it; otherwise the
    // platform convention decides — either way the identifier is the URL's.
    const handle = slug.startsWith('@') ? slug : `${spec.handlePrefix}${slug}`;
    return [
      {
        id: spec.id,
        label: entry.label,
        handle,
        href: entry.url,
        icon: spec.icon,
        external: true,
      },
    ];
  });
