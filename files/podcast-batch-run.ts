/**
 * Podcast Batch Runner
 *
 * Processes all episode scripts in podcast-scripts/ directory:
 *   1. Validate with parsePodcastScript()
 *   2. Generate audio via Fish Audio TTS
 *   3. Upload MP3 to R2
 *   4. Upload to RSS.com (with cover art, keywords, location, episode numbering)
 *   5. Queue to PostgreSQL
 *
 * Usage: npx tsx podcast-batch-run.ts
 *   --dry-run     Validate scripts only, no audio/upload
 *   --skip-to N   Start from episode N (e.g. --skip-to 5)
 */

import "dotenv/config";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { parsePodcastScript, generateSlug } from "./generate-podcast.js";
import { generateEpisodeAudio } from "./podcast-voice.js";
import { uploadToR2, uploadToRSSCom } from "./podcast-upload.js";
import { renderCoverArt } from "./podcast-cover.js";
import {
  initPodcastTable,
  getNextEpisodeNumber,
  queueEpisode,
  markRsscomPublished,
} from "./podcast-db.js";

// ── CLI args ────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const skipIdx = args.indexOf("--skip-to");
const SKIP_TO = skipIdx !== -1 ? parseInt(args[skipIdx + 1], 10) : 0;

// ── Schedule from podcast-schedule.json ─────────────────────
interface ScheduleEntry {
  episode: number;
  utc: string;
  status: string;
}

const schedule: ScheduleEntry[] = JSON.parse(
  readFileSync(join(process.cwd(), "podcast-schedule.json"), "utf-8")
).episodes;

// ── Main ────────────────────────────────────────────────────
async function main() {
  const scriptsDir = join(process.cwd(), "podcast-scripts");
  const files = readdirSync(scriptsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  console.log(`\n  Found ${files.length} episode scripts in podcast-scripts/\n`);

  if (!DRY_RUN) {
    await initPodcastTable();
  }

  const results: Array<{
    file: string;
    title: string;
    status: string;
    duration?: number;
    rsscomId?: number;
    dbId?: string;
    error?: string;
  }> = [];

  for (const file of files) {
    const epNum = parseInt(file.replace(/\D/g, ""), 10);
    if (epNum < SKIP_TO) {
      console.log(`  Skipping ${file} (< ${SKIP_TO})`);
      continue;
    }

    const scheduleEntry = schedule.find((s) => s.episode === epNum);
    if (!scheduleEntry) {
      console.log(`  ⚠️  No schedule entry for episode ${epNum}, skipping`);
      continue;
    }
    if (scheduleEntry.status === "SCHEDULED") {
      console.log(`  ✅  ${file} already scheduled, skipping`);
      continue;
    }

    console.log(`\n${"═".repeat(64)}`);
    console.log(`  EPISODE ${epNum}: ${file}`);
    console.log(`  Scheduled: ${scheduleEntry.utc}`);
    console.log(`${"═".repeat(64)}\n`);

    try {
      // Step 1: Validate
      const raw = readFileSync(join(scriptsDir, file), "utf-8");
      const script = parsePodcastScript(raw);
      const slug = script.episode_slug || generateSlug(script.episode_title);
      const words = [
        script.intro,
        script.context,
        ...script.tips.map((t) => t.text),
        script.recap,
      ]
        .join(" ")
        .split(/\s+/).length;

      console.log(`  ✅  Script valid: "${script.episode_title}"`);
      console.log(`      ${script.tips.length} tips, ${words} words, ${script.seo_keywords.length} keywords`);

      if (DRY_RUN) {
        results.push({ file, title: script.episode_title, status: "validated" });
        continue;
      }

      // Step 2: Generate audio
      console.log(`\n  🎙  Generating audio...`);
      const { audioPath, durationSeconds } = await generateEpisodeAudio(script);
      console.log(`  ✅  Audio: ${durationSeconds}s`);

      // Step 3: Get episode number
      const episodeNumber = await getNextEpisodeNumber();
      console.log(`  🔢  Episode number: ${episodeNumber}`);

      // Step 4: Render cover art
      let coverPath: string | null = null;
      try {
        coverPath = await renderCoverArt(script.episode_title, slug, episodeNumber);
      } catch {
        console.log(`  ⚠️  Cover art failed, using default`);
      }

      // Step 5: Upload to R2
      console.log(`  ☁️   Uploading to R2...`);
      const r2Url = await uploadToR2(audioPath, slug);

      // Step 6: Upload to RSS.com
      console.log(`  📡  Uploading to RSS.com...`);
      const rssResult = await uploadToRSSCom(audioPath, script, {
        scheduleDatetime: scheduleEntry.utc,
        coverArtPath: coverPath ?? undefined,
        episodeNumber,
        seasonNumber: 1,
      });

      // Step 7: Queue to DB
      console.log(`  🗄   Queuing to database...`);
      const fileSizeBytes = statSync(audioPath).size;
      const dbId = await queueEpisode({
        episode_title: script.episode_title,
        episode_description: script.episode_description,
        episode_slug: slug,
        episode_number: episodeNumber,
        audio_path: audioPath,
        r2_url: r2Url ?? undefined,
        rsscom_episode_id: rssResult?.episode_id?.toString() ?? undefined,
        rsscom_audio_id: rssResult?.audio_upload_id ?? undefined,
        blog_source_url: script.source_blog_url,
        duration_seconds: durationSeconds,
        file_size_bytes: fileSizeBytes,
        ghost_embedded: false,
        rsscom_published: !!rssResult,
        youtube_queued: false,
        status: "uploaded",
      });

      if (rssResult) {
        await markRsscomPublished(
          dbId,
          rssResult.episode_id.toString(),
          rssResult.audio_upload_id
        );
      }

      results.push({
        file,
        title: script.episode_title,
        status: "done",
        duration: durationSeconds,
        rsscomId: rssResult?.episode_id,
        dbId,
      });

      console.log(`\n  ✅  Episode ${epNum} complete: RSS.com id=${rssResult?.episode_id}, DB=${dbId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n  ❌  Episode ${epNum} FAILED: ${msg}`);
      results.push({ file, title: file, status: "failed", error: msg });
    }
  }

  // ── Summary ──────────────────────────────────────────────
  console.log(`\n\n${"═".repeat(64)}`);
  console.log(`  BATCH COMPLETE`);
  console.log(`${"═".repeat(64)}\n`);

  const done = results.filter((r) => r.status === "done");
  const failed = results.filter((r) => r.status === "failed");
  const validated = results.filter((r) => r.status === "validated");

  if (validated.length > 0) {
    console.log(`  ✅  Validated: ${validated.length}`);
    for (const r of validated) console.log(`      ${r.file}: ${r.title}`);
  }
  if (done.length > 0) {
    console.log(`\n  ✅  Published: ${done.length}`);
    for (const r of done) {
      console.log(
        `      ${r.file}: ${r.title} (${r.duration}s, RSS.com #${r.rsscomId})`
      );
    }
  }
  if (failed.length > 0) {
    console.log(`\n  ❌  Failed: ${failed.length}`);
    for (const r of failed) console.log(`      ${r.file}: ${r.error}`);
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err);
  process.exit(1);
});
