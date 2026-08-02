/**
 * Shorts Batch Runner
 *
 * For each script in shorts-scripts/ matching the schedule range:
 *   1. Validate via parseShortScript()
 *   2. Generate audio via Fish Audio TTS
 *   3. Render 6 PNG frames via Puppeteer
 *   4. Stitch MP4 via FFmpeg
 *   5. Upload MP4 to R2
 *   6. Generate per-platform PlatformMeta (5 platforms: youtube, instagram, facebook, linkedin, twitter)
 *   7. Queue rows in shorts_queue (one per platform per reel)
 *   8. Write manifest JSON with R2 URL + meta + scheduled UTC per reel
 *
 * Blotato scheduling is done AFTERWARDS by Claude Code reading the manifest
 * and calling blotato_create_post per platform per reel.
 *
 * Usage: npx tsx shorts-batch-run.ts [--from N] [--to M] [--dry-run]
 *   --from N    First reel number to process (default 1)
 *   --to M      Last reel number (inclusive, default last in schedule)
 *   --dry-run   Validate only, no audio/render/upload
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parseShortScript, generatePlatformMeta } from "./generate-shorts.js";
import { generateAllVoiceovers } from "./shorts-voice.js";
import { renderFrames } from "./shorts-frames.js";
import { stitchVideo, uploadVideoToR2 } from "./shorts-video.js";
import { renderShortHyperframes } from "./shorts-hyperframes.js";
import { initShortsTable, queueShort } from "./shorts-db.js";
import type { ShortsPlatform, PlatformMeta } from "./shorts-types.js";
import { computeLocalPlan, AssetDedup } from "./local-seo.js";

const ALL_PLATFORMS: ShortsPlatform[] = ["youtube", "instagram", "facebook", "linkedin", "twitter"];

/** Max anti-duplication re-rolls before accepting a reel's metadata as-is. */
const MAX_DEDUP_SALT = 6;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const fromIdx = args.indexOf("--from");
const toIdx = args.indexOf("--to");
const FROM = fromIdx !== -1 ? parseInt(args[fromIdx + 1], 10) : 1;
const TO = toIdx !== -1 ? parseInt(args[toIdx + 1], 10) : 9999;
// Visual renderer: "legacy" (Puppeteer slides + zoompan) or "hyperframes"
// (animated motion graphics). Default legacy until opted in per run.
const rendererIdx = args.indexOf("--renderer");
const RENDERER = rendererIdx !== -1 ? args[rendererIdx + 1] : "legacy";
if (RENDERER !== "legacy" && RENDERER !== "hyperframes") {
  console.error(`Invalid --renderer "${RENDERER}" (expected: legacy | hyperframes)`);
  process.exit(1);
}
// Schedule file: default shorts-schedule.json, override with --schedule <file>.
const scheduleIdx = args.indexOf("--schedule");
const SCHEDULE_FILE = scheduleIdx !== -1 ? args[scheduleIdx + 1] : "shorts-schedule.json";

interface ScheduleReel {
  reel: number;
  script_file: string;
  date: string;
  time_uk: string;
  utc: string;
  status: string;
  source_url: string;
}

interface ManifestEntry {
  reel: number;
  date: string;
  utc: string;
  source_url: string;
  r2_url: string;
  video_local_path: string;
  duration_seconds: number;
  has_voiceover: boolean;
  db_ids: string[];
  platform_meta: Record<string, unknown>;
}

const schedulePath = join(process.cwd(), SCHEDULE_FILE);
const scheduleRaw = JSON.parse(readFileSync(schedulePath, "utf-8"));
const allReels: ScheduleReel[] = scheduleRaw.reels;
const reelsToProcess = allReels.filter((r) => r.reel >= FROM && r.reel <= TO);

// Target platforms come from the schedule's "platforms" list when present
// (e.g. ["youtube","instagram"]), else all five. Metadata is generated only
// for these — the same MP4 is still reused across them.
const PLATFORMS: ShortsPlatform[] = Array.isArray(scheduleRaw.platforms) && scheduleRaw.platforms.length > 0
  ? ALL_PLATFORMS.filter((p) => (scheduleRaw.platforms as string[]).includes(p))
  : ALL_PLATFORMS;

console.log(`\nProcessing reels ${FROM}-${Math.min(TO, allReels.length)} (${reelsToProcess.length} reels) [renderer: ${RENDERER}] [platforms: ${PLATFORMS.join(",")}] [schedule: ${SCHEDULE_FILE}] ${DRY_RUN ? "[DRY RUN]" : ""}\n`);

const manifest: ManifestEntry[] = [];
const failures: { reel: number; error: string }[] = [];

const outputDir = join(process.cwd(), "output", "shorts-batch");
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

async function main() {
  if (!DRY_RUN) await initShortsTable();

  // Anti-duplication: no two reels in this batch may share an identical title,
  // description, or hashtag set. On collision we re-roll the seed-driven local
  // choices (salt) for the later reel until its metadata is unique.
  const dedup = new AssetDedup();

  for (const reel of reelsToProcess) {
    const scriptPath = join(process.cwd(), "shorts-scripts", reel.script_file);
    console.log(`\n${"═".repeat(64)}`);
    console.log(`  REEL ${reel.reel}: ${reel.script_file}`);
    console.log(`  Scheduled: ${reel.utc} (${reel.date} ${reel.time_uk} UK)`);
    console.log(`${"═".repeat(64)}\n`);

    try {
      const raw = readFileSync(scriptPath, "utf-8");
      const script = parseShortScript(raw);
      console.log(`  ✅  Script valid: "${script.sourceBlogTitle}"`);

      // Share one local plan across the reel's platforms; re-roll on collision.
      let platformMetas: PlatformMeta[] = [];
      let salt = 0;
      for (; salt <= MAX_DEDUP_SALT; salt++) {
        const plan = computeLocalPlan({
          title: script.sourceBlogTitle,
          seed: script.sourceBlogUrl,
          salt,
        });
        platformMetas = PLATFORMS.map((p) => generatePlatformMeta(script, p, { plan }));
        if (!dedup.collidesAny(platformMetas)) break;
      }
      dedup.recordAll(platformMetas);
      const dedupNote = salt > 0 ? ` (re-rolled ${salt}× for uniqueness)` : "";
      console.log(`  📝  Platform metas: ${platformMetas.map((m) => m.platform).join(", ")}${dedupNote}`);

      if (DRY_RUN) {
        console.log(`  [dry-run] skipping audio/render/upload`);
        continue;
      }

      const reelTmpDir = join(tmpdir(), `shorts-reel-${reel.reel}-${Date.now()}`);
      mkdirSync(reelTmpDir, { recursive: true });

      console.log(`  🎙  Generating voiceovers...`);
      const slideAudios = await generateAllVoiceovers(script, reelTmpDir);
      const hasVoiceover = slideAudios !== null;
      console.log(`  ${hasVoiceover ? "✅" : "⚠️"}  Voiceover: ${hasVoiceover ? `${slideAudios!.length} clips` : "skipped (silent fallback)"}`);

      const videoOutPath = join(outputDir, `reel-${String(reel.reel).padStart(2, "0")}.mp4`);
      if (RENDERER === "hyperframes") {
        // Animated motion graphics. HyperFrames renders the SILENT visual; the
        // module muxes the same Fish Audio voiceover + music via FFmpeg after.
        console.log(`  🎞   Rendering via HyperFrames...`);
        await renderShortHyperframes(script, videoOutPath, slideAudios ?? undefined);
      } else {
        console.log(`  🖼   Rendering 6 frames...`);
        const framePaths = await renderFrames(script, reelTmpDir);
        console.log(`  ✅  Frames: ${framePaths.length}`);

        console.log(`  🎬  Stitching video...`);
        await stitchVideo(framePaths, videoOutPath, slideAudios ?? undefined);
      }
      console.log(`  ✅  Video: ${videoOutPath}`);

      console.log(`  ☁️   Uploading to R2...`);
      const r2Filename = `shorts/reel-${String(reel.reel).padStart(2, "0")}-${Date.now()}.mp4`;
      const r2Url = await uploadVideoToR2(videoOutPath, r2Filename);
      console.log(`  ✅  R2: ${r2Url}`);

      // youtube/instagram/facebook/linkedin all get shorts_queue rows (platform is a
      // free-text column, no DB constraint). twitter still gets a manifest entry for
      // Blotato but is excluded from DB tracking here (not part of this pipeline's targets).
      const dbMetas = platformMetas.filter((m) => ["youtube", "instagram", "facebook", "linkedin"].includes(m.platform));
      console.log(`  🗄   Queuing to DB (${dbMetas.length} rows)...`);
      const dbIds = await queueShort(
        { video_path: videoOutPath, blog_source_url: reel.source_url, r2_url: r2Url, scheduled_at: reel.utc },
        dbMetas
      );
      console.log(`  ✅  DB rows: ${dbIds.length}`);

      const platformMetaObj: Record<string, unknown> = {};
      for (const m of platformMetas) platformMetaObj[m.platform] = m;

      manifest.push({
        reel: reel.reel,
        date: reel.date,
        utc: reel.utc,
        source_url: reel.source_url,
        r2_url: r2Url,
        video_local_path: videoOutPath,
        duration_seconds: 0,
        has_voiceover: hasVoiceover,
        db_ids: dbIds,
        platform_meta: platformMetaObj,
      });
      console.log(`  ✅  Reel ${reel.reel} ready for Blotato scheduling`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌  Reel ${reel.reel} FAILED: ${msg}`);
      failures.push({ reel: reel.reel, error: msg });
    }
  }

  const manifestPath = join(process.cwd(), "shorts-manifest.json");
  let existing: ManifestEntry[] = [];
  if (existsSync(manifestPath)) {
    try { existing = JSON.parse(readFileSync(manifestPath, "utf-8")).reels || []; } catch {}
  }
  const merged = [
    ...existing.filter((e) => !manifest.find((m) => m.reel === e.reel)),
    ...manifest,
  ].sort((a, b) => a.reel - b.reel);
  writeFileSync(manifestPath, JSON.stringify({ reels: merged }, null, 2));
  console.log(`\n  📋  Manifest written: ${manifestPath}`);

  console.log(`\n${"═".repeat(64)}`);
  console.log(`  BATCH COMPLETE`);
  console.log(`${"═".repeat(64)}`);
  console.log(`  ✅  Rendered + uploaded: ${manifest.length}`);
  if (failures.length > 0) {
    console.log(`  ❌  Failed: ${failures.length}`);
    for (const f of failures) console.log(`      Reel ${f.reel}: ${f.error}`);
  }
  for (const m of manifest) {
    console.log(`  REEL ${m.reel}  ${m.utc}  ${m.r2_url}`);
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err);
  process.exit(1);
});
