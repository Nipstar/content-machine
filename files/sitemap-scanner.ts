/**
 * Fetches and parses the Antek blog post sitemap.
 * Returns entries sorted newest-first, excluding parse-error drafts.
 */

export interface SitemapEntry {
  url: string;
  lastmod: Date;
  slug: string;
}

const POSTS_SITEMAP = 'https://blog.antekautomation.com/sitemap-posts.xml';

export async function fetchSitemapPosts(
  sitemapUrl = POSTS_SITEMAP,
): Promise<SitemapEntry[]> {
  const res = await fetch(sitemapUrl);
  if (!res.ok) throw new Error(`Sitemap fetch failed: ${res.status} ${sitemapUrl}`);
  const xml = await res.text();

  const entries: SitemapEntry[] = [];
  const blockRe = /<url>([\s\S]*?)<\/url>/g;
  let block: RegExpExecArray | null;

  while ((block = blockRe.exec(xml)) !== null) {
    const content = block[1];
    const locMatch = content.match(/<loc>(.*?)<\/loc>/);
    const lastmodMatch = content.match(/<lastmod>(.*?)<\/lastmod>/);
    if (!locMatch) continue;

    const url = locMatch[1].trim();
    const lastmod = lastmodMatch ? new Date(lastmodMatch[1].trim()) : new Date(0);
    const slug = new URL(url).pathname.replace(/^\/|\/$/g, '');

    if (slug.startsWith('parse-error')) continue;

    entries.push({ url, lastmod, slug });
  }

  return entries.sort((a, b) => b.lastmod.getTime() - a.lastmod.getTime());
}
