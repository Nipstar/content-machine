/**
 * Fixes a scheduling mistake on the batch-2 podcast episode reels (23-28,
 * shorts-manifest.json reels 101-106): they were scheduled every 3-4 days
 * (Aug 12/15/19/22/26/29 2026) instead of daily. Correct schedule is one
 * episode per day, Aug 12-17 2026.
 *
 * Blotato has no PATCH /schedules endpoint (only POST /posts and
 * DELETE /schedules/{id}), so a reschedule is: look up the live schedule id
 * for the wrong date (GET /schedules, matched by scheduledAt+accountId+platform
 * since blotato_post_id in our DB is the postSubmissionId, not the schedule
 * id), delete it, then create a fresh post with the corrected scheduledTime
 * (which mints a new postSubmissionId), then update shorts_queue.
 *
 * ep23/reel101 is already at the correct date (Aug 12) and is left untouched.
 * Only ep24-28/reels 102-106 move.
 *
 * SCHEDULE-ONLY: every createPost() call carries a future scheduledTime.
 * Rate limit: 30 posts/min → ~2.1s between calls (deletes + creates both count).
 * Processes one episode/platform at a time; DB is updated immediately after
 * each successful Blotato call so state stays consistent if interrupted.
 *
 * Usage: npx tsx reschedule-podcast-batch2-daily.ts [--dry-run]
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { createPost, deleteSchedule, listSchedules, type FlatPost } from "./blotato-api.js";
import { rescheduleShort } from "./shorts-db.js";
import { rescheduleGBPPost } from "./gbp-db.js";

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

// reel -> corrected daily date (16:00 UTC = 17:00 UK, matching existing convention)
const NEW_DATE: Record<number, string> = {
  102: "2026-08-13T16:00:00.000Z",
  103: "2026-08-14T16:00:00.000Z",
  104: "2026-08-15T16:00:00.000Z",
  105: "2026-08-16T16:00:00.000Z",
  106: "2026-08-17T16:00:00.000Z",
};

// gbp_post_queue row id -> corrected daily date (07:00 UTC = 07:00 UK)
const GBP_RESCHEDULE: { id: string; topic: string; scheduledDate: string }[] = [
  { id: "1ade857c-3c15-408f-a550-c393e3ce13ca", topic: "Where The Next Generation Of Clients Will Find You", scheduledDate: "2026-08-13T07:00:00.000Z" },
  { id: "c25ecca2-2633-4e01-be0f-fbe175fdaaca", topic: "Follow-Ups That Actually Happen", scheduledDate: "2026-08-14T07:00:00.000Z" },
  { id: "3351d7ed-a4e0-4b1d-9fd2-f45f1fd86da0", topic: "Answering Every Caller Without Hiring Another Receptionist", scheduledDate: "2026-08-15T07:00:00.000Z" },
  { id: "65057f0b-dfa9-4493-afcb-0ed5c0c543f8", topic: "The Visibility Myth That's Wasting Your Time", scheduledDate: "2026-08-16T07:00:00.000Z" },
  { id: "92af885f-06f1-4369-ae14-f3ebe445aa6a", topic: "The Hidden Hours Your Team Loses Every Week", scheduledDate: "2026-08-17T07:00:00.000Z" },
];

const reels = manifest.reels.filter((r) => r.reel in NEW_DATE);

function buildPost(reel: ManifestEntry, platform: string, scheduledTime: string): FlatPost {
  const meta = reel.platform_meta[platform];
  const base: FlatPost = {
    accountId: ACC[platform as keyof typeof ACC],
    platform,
    text: platform === "youtube" ? meta.description : meta.caption,
    mediaUrls: [reel.r2_url],
    scheduledTime,
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

/** Finds the live Blotato schedule id for a (scheduledAt, accountId, platform) triple. */
async function findScheduleId(scheduledAt: string, accountId: string, platform: string): Promise<string | null> {
  let cursor: string | undefined;
  for (let i = 0; i < 50; i++) {
    const page: any = await listSchedules(50, cursor);
    for (const item of page.items) {
      if (
        item.scheduledAt === scheduledAt &&
        String(item.draft?.accountId) === String(accountId) &&
        item.draft?.target?.targetType === platform
      ) {
        return item.id;
      }
    }
    cursor = (page as any).cursor;
    if (!cursor || page.items.length === 0) break;
  }
  return null;
}

async function main() {
  let ok = 0;
  const fails: string[] = [];

  console.log(`\n${reels.length} episodes to reschedule to daily slots${DRY_RUN ? " [DRY RUN]" : ""}\n`);

  for (const reel of reels) {
    const newUtc = NEW_DATE[reel.reel];
    console.log(`\n${"═".repeat(60)}\nREEL ${reel.reel}  ${reel.utc} -> ${newUtc}  ${reel.source_url}\n${"═".repeat(60)}`);
    for (let i = 0; i < PLATFORM_ORDER.length; i++) {
      const platform = PLATFORM_ORDER[i];
      const dbId = reel.db_ids[i];
      const accountId = ACC[platform];
      const label = `reel${reel.reel}:${platform}`;
      if (!reel.platform_meta[platform]) {
        console.log(`  ⏭️  ${label} — no platform_meta, skipping`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`  🧪 ${label} would delete old schedule @ ${reel.utc} and recreate @ ${newUtc} accountId=${accountId}`);
        continue;
      }

      try {
        const scheduleId = await findScheduleId(reel.utc, String(accountId), platform);
        if (!scheduleId) throw new Error(`no live Blotato schedule found for ${label} @ ${reel.utc} (accountId=${accountId})`);

        await deleteSchedule(scheduleId);
        console.log(`  🗑️  ${label} — deleted schedule ${scheduleId} (was @ ${reel.utc})`);
        await sleep(THROTTLE_MS);

        const post = buildPost(reel, platform, newUtc);
        const r = await createPost(post);
        console.log(`  ✅ ${label} — recreated ${r.postSubmissionId} @ ${newUtc}`);
        await sleep(THROTTLE_MS);

        if (dbId) await rescheduleShort(dbId, newUtc, r.postSubmissionId);
        ok++;
      } catch (err: any) {
        console.log(`  ❌ ${label} — ${err.message}`);
        fails.push(label);
        await sleep(THROTTLE_MS);
      }
    }
  }

  console.log(`\n${"═".repeat(60)}\nGBP queue: ${GBP_RESCHEDULE.length} rows to reschedule\n${"═".repeat(60)}`);
  for (const g of GBP_RESCHEDULE) {
    if (DRY_RUN) {
      console.log(`  🧪 gbp:${g.topic} -> ${g.scheduledDate}`);
      continue;
    }
    try {
      await rescheduleGBPPost(g.id, g.scheduledDate);
      console.log(`  ✅ gbp:${g.topic} -> ${g.scheduledDate}`);
    } catch (err: any) {
      console.log(`  ❌ gbp:${g.topic} — ${err.message}`);
      fails.push(`gbp:${g.topic}`);
    }
  }

  console.log(`\n━━━ done: ${ok} reels rescheduled, ${fails.length} failed ━━━`);
  if (fails.length) console.log("failed:", fails.join(", "));
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
