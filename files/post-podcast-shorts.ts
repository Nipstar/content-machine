/**
 * Posts the podcast-episode reels (schedule: podcast-episodes-shorts-schedule.json,
 * reels 101-106) to Blotato — youtube, instagram, facebook, linkedin (personal,
 * accountId 14687) — using the direct REST API (blotato-api.ts), never the MCP.
 *
 * Reads shorts-manifest.json (written by shorts-batch-run.ts) for r2_url,
 * platform_meta, and the shorts_queue db_ids (ordered youtube, instagram,
 * facebook, linkedin — matching PLATFORMS order in shorts-batch-run.ts).
 *
 * SCHEDULE-ONLY: every createPost() call carries the reel's UTC scheduledTime.
 * Rate limit: 30 posts/min → ~2.1s between calls.
 *
 * On success: shorts_queue row -> status='scheduled', blotato_post_id=<id>.
 * On failure: shorts_queue row -> status='failed', error_message=<msg>; continues.
 *
 * Usage: npx tsx post-podcast-shorts.ts [--dry-run]
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { createPost, type FlatPost } from "./blotato-api.js";
import { markShortScheduled, markShortErrored } from "./shorts-db.js";

const DRY_RUN = process.argv.includes("--dry-run");
const THROTTLE_MS = 2100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ACC = {
  linkedin: process.env.LINKEDIN_ACCOUNT_ID || "14687",
  facebook: process.env.FACEBOOK_ACCOUNT_ID || "22303",
  instagram: process.env.INSTAGRAM_ACCOUNT_ID || "34604",
  youtube: process.env.YOUTUBE_ACCOUNT_ID || "29641",
} as const;
const FB_PAGE = process.env.FACEBOOK_PAGE_ID || "999920689867882";

// PLATFORMS order in shorts-batch-run.ts (from schedule's "platforms" list,
// filtered from ALL_PLATFORMS) — db_ids in the manifest follow this same order.
const PLATFORM_ORDER = ["youtube", "instagram", "facebook", "linkedin"] as const;

interface ManifestEntry {
  reel: number;
  date: string;
  utc: string;
  source_url: string;
  r2_url: string;
  db_ids: string[];
  platform_meta: Record<string, { platform: string; title: string; description: string; hashtags: string[]; caption: string }>;
}

const manifest: { reels: ManifestEntry[] } = JSON.parse(readFileSync("shorts-manifest.json", "utf-8"));
const reels = manifest.reels.filter((r) => r.reel >= 101 && r.reel <= 106);

console.log(`\n${reels.length} reels to post (reel 101-106)${DRY_RUN ? " [DRY RUN]" : ""}\n`);

function buildPost(reel: ManifestEntry, platform: string): FlatPost {
  const meta = reel.platform_meta[platform];
  const base: FlatPost = {
    accountId: ACC[platform as keyof typeof ACC],
    platform,
    text: platform === "youtube" ? meta.description : meta.caption,
    mediaUrls: [reel.r2_url],
    scheduledTime: reel.utc,
  };
  if (platform === "youtube") {
    base.title = meta.title.slice(0, 100);
    base.privacyStatus = "public";
    base.shouldNotifySubscribers = false;
  }
  if (platform === "instagram") {
    base.mediaType = "reel";
  }
  if (platform === "facebook") {
    base.pageId = FB_PAGE;
  }
  return base;
}

async function main() {
  let ok = 0;
  const fails: string[] = [];

  for (const reel of reels) {
    console.log(`\n${"═".repeat(60)}\nREEL ${reel.reel}  ${reel.utc}  ${reel.source_url}\n${"═".repeat(60)}`);
    for (let i = 0; i < PLATFORM_ORDER.length; i++) {
      const platform = PLATFORM_ORDER[i];
      const dbId = reel.db_ids[i];
      const label = `reel${reel.reel}:${platform}`;
      if (!reel.platform_meta[platform]) {
        console.log(`  ⏭️  ${label} — no platform_meta, skipping`);
        continue;
      }
      const post = buildPost(reel, platform);
      if (DRY_RUN) {
        console.log(`  🧪 ${label} @ ${post.scheduledTime} accountId=${post.accountId} — ${(post.text || "").slice(0, 60).replace(/\n/g, " ")}...`);
        continue;
      }
      try {
        const r = await createPost(post);
        console.log(`  ✅ ${label} — ${r.postSubmissionId}`);
        if (dbId) await markShortScheduled(dbId, r.postSubmissionId);
        ok++;
      } catch (err: any) {
        console.log(`  ❌ ${label} — ${err.message}`);
        if (dbId) await markShortErrored(dbId, err.message);
        fails.push(label);
      }
      await sleep(THROTTLE_MS);
    }
  }

  console.log(`\n━━━ done: ${ok} scheduled, ${fails.length} failed ━━━`);
  if (fails.length) console.log("failed:", fails.join(", "));
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
