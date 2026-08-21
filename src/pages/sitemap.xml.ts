/**
 * /sitemap.xml (US-049; US-605 adds the reader pages) — every canonical route of
 * the site: the home page plus one reader page per published research chapter,
 * each in both locales, each carrying xhtml:link hreflang alternates so search
 * engines treat the locale pair as one localized page (manual §15). Hand-rolled
 * ("keep it light") and reads the locale list + route mapping from src/i18n and
 * the chapter list from the research-chapters collection, so the entry count is
 * DERIVED and never drifts from the toggle or the data.
 *
 * While SHOW_RESEARCH is off (2026-08-20) the reader routes emit no pages, so
 * the chapter <loc>s drop with them — the sitemap must never advertise a URL
 * that is not built. That leaves the two home routes; the count returns on its
 * own when the flag flips back.
 */
import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import type { Locale } from '../i18n';
import { locales, localizedPath, defaultLocale } from '../i18n';
import { SHOW_RESEARCH } from '../data/research-pipeline';

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://jctommasi.github.io');

  const research = await getEntry('research-chapters', 'research-chapters');
  if (!research) throw new Error('research-chapters content collection entry missing');
  // Canonical order (the explicit `order` field, US-031) for a stable sitemap.
  const chapterPaths = [...research.data.chapters]
    .sort((a, b) => a.order - b.order)
    .map((chapter) => `/research/${chapter.id}/`);

  // Locale-agnostic sub-paths; each expands to one <url> per locale below.
  const paths = ['/', ...(SHOW_RESEARCH ? chapterPaths : [])];

  const urls = paths
    .flatMap((path) => {
      const abs = (l: Locale) => new URL(localizedPath(path, l), base).href;
      // The alternate block is shared by this path's locale pair (each locale
      // points at all locales + x-default = the default-locale route).
      const alternates = [
        ...locales.map(
          (l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${abs(l)}"/>`,
        ),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(defaultLocale)}"/>`,
      ].join('\n');
      return locales.map(
        (l) => `  <url>\n    <loc>${abs(l)}</loc>\n${alternates}\n  </url>`,
      );
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
