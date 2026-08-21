/**
 * i18n accessor layer (US-004) — locale routing + string accessors (manual §10).
 *
 * EN is the build default at `/` (unprefixed); ES lives at `/es/`
 * (astro.config i18n `prefixDefaultLocale: false`). This module is the single
 * place that knows how locale maps to route, so layouts/pages/components never
 * hand-roll `/es/` string surgery.
 *
 * - `pick(locale, field)` reads the active half of a bilingual `{es,en}` field
 *   (the US-003 cv shape) — the helper the US-003 log asked US-004 to expose,
 *   so sections stop scattering raw `.en` / `.es`.
 * - `loadStrings(locale)` returns one locale's chrome bundle from the
 *   `site-strings` content collection — the only sanctioned source of
 *   translatable chrome text (P8; no hardcoded literals in components).
 *
 * The seed file keeps `defaultLocale: "es"` frozen (P8); the EN-default policy
 * lives HERE and in astro.config, never by editing the data.
 */
import { getEntry } from 'astro:content';

/** Build locale order (EN first = default). The seed file's order is frozen separately. */
export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];

/** EN default at the root, per manual §10 (overrides the seed `defaultLocale`). */
export const defaultLocale: Locale = 'en';

/**
 * localStorage key for the visitor's explicit locale choice. Written only when
 * the toggle is used (an explicit choice); read by the first-visit redirect,
 * which must never override it (US-004 AC / manual §10).
 */
export const LOCALE_STORAGE_KEY = 'preferred-locale';

/** A bilingual prose field as produced by US-003 (cv/research/hobbies data). */
export interface Localized {
  es: string;
  en: string;
}

/** Type guard: is an arbitrary string one of our build locales? */
export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** The opposite locale (binary toggle). */
export function otherLocale(locale: Locale): Locale {
  return locale === 'en' ? 'es' : 'en';
}

/** Read the active-locale half of a bilingual `{es,en}` field (US-003). */
export function pick(locale: Locale, field: Localized): string {
  return field[locale];
}

/**
 * Root-relative path for `pathname` rendered in `locale`, preserving any
 * shared sub-path. Default locale (EN) is unprefixed; others get a `/<locale>`
 * prefix. Drives the locale toggle's hrefs.
 *
 *   localizedPath('/',    'es') -> '/es/'
 *   localizedPath('/es/', 'en') -> '/'
 *   localizedPath('/es/', 'es') -> '/es/'
 */
export function localizedPath(pathname: string, locale: Locale): string {
  // Strip any existing non-default locale prefix down to the shared sub-path.
  let rest = pathname;
  for (const l of locales) {
    if (l === defaultLocale) continue;
    if (rest === `/${l}` || rest.startsWith(`/${l}/`)) {
      rest = rest.slice(l.length + 1) || '/';
      break;
    }
  }
  if (!rest.startsWith('/')) rest = `/${rest}`;
  if (locale === defaultLocale) return rest;
  // `/es` + '/' -> '/es/'; `/es` + '/foo/' -> '/es/foo/'.
  return `/${locale}${rest}`;
}

/** One locale's chrome bundle (nav/sections/cta/locale/switcher) from `site-strings`. */
export async function loadStrings(locale: Locale) {
  const entry = await getEntry('site-strings', 'site-strings');
  if (!entry) throw new Error('site-strings content collection entry missing');
  return entry.data[locale];
}
