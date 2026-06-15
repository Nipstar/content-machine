/**
 * Generate + upload landscape + square hook cards for every idea in content.json.
 * Reuses generatePersonalImages from personal-image-gen.ts.
 * Output: content-image-urls.json keyed by idea_id.
 *
 * Run: cd files && npx tsx content-images-run.ts
 */

import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { generatePersonalImages, closeBrowser } from "./personal-image-gen.js";

interface ContentIdea {
  idea_id: string;
  topic: string;
  hook: string;
  source_url: string;
}

const ideas: ContentIdea[] = JSON.parse(readFileSync("content.json", "utf-8"));
const out: Record<string, { landscapeUrl: string; squareUrl: string }> = {};

console.log(`\nGenerating images for ${ideas.length} content ideas...\n`);

for (let i = 0; i < ideas.length; i++) {
  const idea = ideas[i];
  const slug = `content-${idea.idea_id.replace(/[^a-z0-9-]/g, "-")}`;
  console.log(`[${i + 1}/${ideas.length}] ${idea.idea_id} — ${idea.hook.slice(0, 60)}`);
  try {
    const urls = await generatePersonalImages(slug, idea.hook, idea.topic);
    out[idea.idea_id] = urls;
    console.log(`  ✅  L=${urls.landscapeUrl}`);
    console.log(`      S=${urls.squareUrl}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌  ${msg}`);
  }
}

await closeBrowser();
writeFileSync("content-image-urls.json", JSON.stringify(out, null, 2));
console.log(`\n✅  Wrote content-image-urls.json with ${Object.keys(out).length} entries.`);
