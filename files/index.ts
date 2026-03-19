#!/usr/bin/env node
/**
 * Antek Automation — Social Content Machine v6
 *
 * Content preparation + preview CLI.
 * Media creation and scheduling are handled by Claude Code via Blotato MCP.
 *
 * Usage:
 *   npm run generate                          # Load content.json, assign templates, preview
 *   npm run generate -- --count 7
 *   npm run generate -- --platforms linkedin,facebook
 *   npm run generate -- --pillar voice_ai
 *   npm run generate -- --category tip
 *   npm run generate -- --start 2026-03-20
 *   npm run generate:from-db                  # Pull briefs from PostgreSQL
 *   npm run preview:fast                      # Preview only (no template assignment)
 */

import { join } from "path";
import { writeFileSync } from "fs";
import { generateIdeas, generateIdeasFromBriefs } from "./generate-content.js";
import { loadApprovedBriefs, briefsToIdeaSeeds, markBriefsAsQueued } from "./load-briefs.js";
import { generatePreview, openPreview } from "./preview.js";
import { mapToTemplate } from "./template-mapping.js";
import type { Pillar, Platform, ContentCategory } from "./types.js";

// ── CLI args ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (f: string) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined; };
const hasFlag = (f: string) => args.includes(f);

const COUNT          = parseInt(getArg("--count") || "14", 10);
const FORCE_PILLAR   = getArg("--pillar") as Pillar | undefined;
const FORCE_CATEGORY = getArg("--category") as ContentCategory | undefined;
const PREVIEW_ONLY   = hasFlag("--preview-only");
const FROM_DB        = hasFlag("--from-db");
const START_DATE     = getArg("--start"); // YYYY-MM-DD
const ALL_PLATFORMS: Platform[] = ["linkedin", "twitter", "facebook", "instagram"];
const PLATFORMS: Platform[] = getArg("--platforms")
  ? (getArg("--platforms")!.split(",") as Platform[])
  : ALL_PLATFORMS;

// ── Helpers ─────────────────────────────────────────────────────
function hr(c = "─", w = 64) { return c.repeat(w); }

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log();
  console.log(hr("═"));
  console.log("  🤖  Antek Automation — Social Content Machine");
  console.log(hr("═"));
  console.log();

  const totalPosts = COUNT * PLATFORMS.length;
  console.log(`  📋  ${COUNT} ideas × ${PLATFORMS.length} platforms = ${totalPosts} posts`);
  console.log(`  📡  Platforms: ${PLATFORMS.join(", ")}`);
  console.log(`  🎨  Media: Blotato MCP (templates assigned below)`);
  console.log(`  🗓️   ${Math.ceil(COUNT / 2)} days per platform at 8:00am + 12:00pm`);
  console.log();

  // ── Phase 1: Content ─────────────────────────────────────────
  let ideas;

  if (FROM_DB) {
    console.log(`📝  Phase 1: Loading approved briefs from PostgreSQL...`);
    console.log(hr());
    if (!process.env.DATABASE_URL) { console.error("❌  DATABASE_URL not set"); process.exit(1); }
    const briefs = await loadApprovedBriefs(COUNT);
    if (!briefs.length) {
      console.error("\n❌  No approved briefs in DB. Run WF2 or approve briefs first.");
      process.exit(1);
    }
    console.log(`  ✅  ${briefs.length} approved briefs found`);
    console.log(`\n📝  Generating platform variants from briefs...`);
    console.log(hr());
    const seeds = briefsToIdeaSeeds(briefs);
    ideas = await generateIdeasFromBriefs(seeds);
  } else {
    console.log(`📝  Phase 1: Loading ${COUNT} content ideas from content.json...`);
    console.log(hr());
    ideas = await generateIdeas(COUNT, FORCE_PILLAR, FORCE_CATEGORY, START_DATE);
  }

  if (!ideas.length) { console.error("\n❌  No ideas loaded."); process.exit(1); }
  console.log(`\n✅  ${ideas.length} ideas × 4 platform variants = ${ideas.length * 4} posts\n`);

  // ── Phase 2: Template mapping ────────────────────────────────
  console.log(`🎨  Phase 2: Assigning Blotato templates...`);
  console.log(hr());

  for (const idea of ideas) {
    idea.blotato_template = mapToTemplate(idea);
    console.log(`  📌  ${idea.content_category.padEnd(20)} → ${idea.blotato_template}`);
  }

  // Write enriched content back for Claude Code to use
  const enrichedPath = join(process.cwd(), "content.json");
  writeFileSync(enrichedPath, JSON.stringify(ideas, null, 2));
  console.log(`\n✅  Templates assigned. Enriched content.json saved.\n`);

  // ── Phase 3: Preview ─────────────────────────────────────────
  console.log(`👁️   Phase 3: Generating preview...`);
  const previewPath = join(process.cwd(), "preview.html");
  generatePreview(ideas, previewPath);
  openPreview(previewPath);
  console.log(`  ✅  ${previewPath}`);
  console.log(`  🌐  Opening in browser...\n`);

  // ── Done ──────────────────────────────────────────────────────
  console.log(hr("═"));
  console.log("  ✅  CONTENT PREPARED");
  console.log(hr("─"));
  console.log(`  Ideas:      ${ideas.length}`);
  console.log(`  Platforms:  ${PLATFORMS.join(", ")}`);
  console.log(`  Templates:  ${new Set(ideas.map(i => i.blotato_template)).size} unique`);
  console.log(hr("═"));
  console.log();
  console.log("  Next: Ask Claude Code to create media + schedule via Blotato MCP.");
  console.log("  Example: \"Create media and schedule all posts from content.json\"\n");
}

main().catch((err) => { console.error("\n❌  Fatal:", err); process.exit(1); });
