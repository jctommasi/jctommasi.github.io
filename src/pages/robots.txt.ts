/**
 * /robots.txt (US-049) — allow all crawlers, point at the sitemap. The site is
 * now indexable (the BaseLayout `noindex` is gone). A static endpoint so the
 * origin stays DRY with astro.config's `site`.
 */
import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://jctommasi.github.io')).origin;
  const body = ['User-agent: *', 'Allow: /', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
