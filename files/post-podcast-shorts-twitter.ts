/**
 * Extends the batch-2 podcast reel campaign (reels 101-106, episodes 23-28)
 * to also post to X/Twitter, on the same schedule as the existing
 * youtube/instagram/facebook/linkedin reels.
 *
 * Reads shorts-manifest.json (platform_meta.twitter, added alongside the
 * other platforms) for r2_url + caption + scheduledTime, inserts one new
 * shorts_queue row per episode (platform='twitter'), and posts to Blotato
 * via the direct REST API (blotato-api.ts), never the MCP.
 *
 * Does NOT touch podcast_queue or the existing youtube/instagram/facebook/
 * linkedin shorts_queue rows/posts.
 *
 * SCHEDULE-ONLY: every createPost() call carries the reel's UTC scheduledTime
 * (same value as the episode's other platform posts). Rate limit: 30 posts/min
 * -> ~2.1s between calls.
 *
 * On success: new shorts_queue row -> status='scheduled', blotato_post_id=<id>.
 * On failure: new shorts_queue row -> status='failed', error_message=<msg>;
 * continues to the next episode. (Uses shorts-db.ts's markShortErrored, which
 * writes status='failed' — the established convention in this codebase for a
 * failed Blotato call; no other status string is used for failures anywhere
 * in shorts_queue.)
 *
 * Usage: npx tsx post-podcast-shorts-twitter.ts [--dry-run]
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { createPost, type FlatPost } from "./blotato-api.js";
import { queueShort, markShortScheduled, markShortErrored } from "./shorts-db.js";

const DRY_RUN = process.argv.includes("--dry-run");
const THROTTLE_MS = 2100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TWITTER_ACCOUNT_ID = process.env.TWITTER_ACCOUNT_ID || "13863";

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

console.log(`\n${reels.length} reels to post to X (reel 101-106)${DRY_RUN ? " [DRY RUN]" : ""}\n`);

function videoPathFor(reel: number): string {
  return `${process.cwd()}/output/shorts-batch/reel-${reel}.mp4`;
}

function buildPost(reel: ManifestEntry): FlatPost {
  const meta = reel.platform_meta.twitter;
  return {
    accountId: TWITTER_ACCOUNT_ID,
    platform: "twitter",
    text: meta.caption,
    mediaUrls: [reel.r2_url],
    scheduledTime: reel.utc,
  };
}

async function main() {
  let ok = 0;
  const fails: string[] = [];
  const results: { reel: number; date: string; scheduled: string; status: string; detail: string }[] = [];

  for (const reel of reels) {
    console.log(`\n${"═".repeat(60)}\nREEL ${reel.reel}  ${reel.utc}  ${reel.source_url}\n${"═".repeat(60)}`);
    const label = `reel${reel.reel}:twitter`;

    if (!reel.platform_meta.twitter) {
      console.log(`  ⏭️  ${label} — no platform_meta.twitter, skipping`);
      results.push({ reel: reel.reel, date: reel.date, scheduled: reel.utc, status: "skipped", detail: "no platform_meta.twitter" });
      continue;
    }

    const post = buildPost(reel);

    if (DRY_RUN) {
      console.log(`  🧪 ${label} @ ${post.scheduledTime} accountId=${post.accountId} — ${(post.text || "").slice(0, 60).replace(/\n/g, " ")}...`);
      continue;
    }

    // Insert the new shorts_queue row for this episode's twitter post.
    let dbId: string | undefined;
    try {
      const ids = await queueShort(
        {
          video_path: videoPathFor(reel.reel),
          blog_source_url: reel.source_url,
          r2_url: reel.r2_url,
          scheduled_at: reel.utc,
        },
        [
          {
            platform: "twitter",
            title: reel.platform_meta.twitter.title,
            description: reel.platform_meta.twitter.description,
            caption: reel.platform_meta.twitter.caption,
            hashtags: reel.platform_meta.twitter.hashtags,
          },
        ]
      );
      dbId = ids[0];
    } catch (err: any) {
      console.log(`  ❌ ${label} — failed to insert shorts_queue row: ${err.message}`);
      fails.push(label);
      results.push({ reel: reel.reel, date: reel.date, scheduled: reel.utc, status: "db-insert-failed", detail: err.message });
      await sleep(THROTTLE_MS);
      continue;
    }

    try {
      const r = await createPost(post);
      console.log(`  ✅ ${label} — ${r.postSubmissionId}`);
      await markShortScheduled(dbId, r.postSubmissionId);
      ok++;
      results.push({ reel: reel.reel, date: reel.date, scheduled: reel.utc, status: "scheduled", detail: r.postSubmissionId });
    } catch (err: any) {
      console.log(`  ❌ ${label} — ${err.message}`);
      await markShortErrored(dbId, err.message);
      fails.push(label);
      results.push({ reel: reel.reel, date: reel.date, scheduled: reel.utc, status: "failed", detail: err.message });
    }
    await sleep(THROTTLE_MS);
  }

  console.log(`\n━━━ done: ${ok} scheduled, ${fails.length} failed ━━━`);
  if (fails.length) console.log("failed:", fails.join(", "));

  if (!DRY_RUN) {
    console.log("\nepisode | date | X scheduled | status");
    for (const r of results) {
      console.log(`reel${r.reel} | ${r.date} | ${r.scheduled} | ${r.status}${r.status !== "scheduled" ? " (" + r.detail + ")" : ""}`);
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
