/**
 * Generates + uploads branded images for all 28 personal posts.
 * Reads personal-content.json, renders landscape + square per idea,
 * uploads to R2, writes personal-image-urls.json.
 *
 * Run: cd files && npx tsx personal-images-run.ts
 */

import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { generatePersonalImages, closeBrowser } from "./personal-image-gen.js";

const ideas = JSON.parse(readFileSync("personal-content.json", "utf-8"));
const results: Record<string, { landscapeUrl: string; squareUrl: string }> = {};

console.log(`\nGenerating images for ${ideas.length} personal posts...\n`);

for (let i = 0; i < ideas.length; i++) {
  const idea = ideas[i];
  console.log(`[${i + 1}/${ideas.length}] ${idea.content_format} — ${idea.slug.substring(0, 50)}`);
  try {
    const urls = await generatePersonalImages(idea.slug, idea.hook, idea.topic);
    results[idea.idea_id] = urls;
  } catch (err) {
    console.error(`  ✗ FAILED: ${err instanceof Error ? err.message : err}`);
    results[idea.idea_id] = { landscapeUrl: "", squareUrl: "" };
  }
}

await closeBrowser();
writeFileSync("personal-image-urls.json", JSON.stringify(results, null, 2));

const ok  = Object.values(results).filter(r => r.landscapeUrl).length;
const err = Object.values(results).filter(r => !r.landscapeUrl).length;
console.log(`\nDone. ${ok} succeeded, ${err} failed.`);
console.log("URLs saved to personal-image-urls.json");
