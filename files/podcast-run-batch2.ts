/**
 * Podcast batch 2 runner — ONE-TAKE voice + per-episode cover art, scheduled to RSS.com.
 *
 * Mirrors podcast-run.ts but:
 *  - reads podcast-narration-batch2.json (the 7 new episodes)
 *  - renders a per-episode 3000x3000 cover (podcast-cover.ts) and attaches it
 *  - schedules on a FIXED 2-day cadence from --start (default 2026-08-13) at 07:00Z,
 *    continuing the existing every-other-day slot pattern (last existing ep = Aug 11)
 *  - tracks results in podcast-results-batch2.json (idempotent resume)
 *
 * Run: cd files && npx tsx podcast-run-batch2.ts [--dry-run] [--only ep_21] [--start 2026-08-13]
 */
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { uploadToRSSCom } from "./podcast-upload.js";
import { renderCoverArt } from "./podcast-cover.js";

const FISH_URL = "https://api.fish.audio/v1/tts";
const OUT = join(process.cwd(), "output", "podcasts");
const RESULTS = join(process.cwd(), "podcast-results-batch2.json");
const DRY = process.argv.includes("--dry-run");
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const START = process.argv.includes("--start") ? process.argv[process.argv.indexOf("--start") + 1] : "2026-08-13";
const EPISODE_NUMBER_BASE = 29; // existing RSS.com episodes use numbers up to 28

interface Ep {
  idea_id: string; episode_slug: string; episode_title: string; episode_description: string;
  source_blog_url: string; source_blog_title: string; seo_keywords: string[];
  tips: { text: string }[]; narration: string;
}

async function oneTakeVoice(narration: string, raw: string, out: string): Promise<number> {
  let buf: Buffer | null = null;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(FISH_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}`, "Content-Type": "application/json", model: "s2-pro" },
        body: JSON.stringify({ text: `[professional broadcast tone] ${narration}`, reference_id: process.env.FISH_AUDIO_VOICE_ID, format: "mp3", mp3_bitrate: 128 }),
      });
      if (!res.ok) throw new Error(`Fish ${res.status}: ${(await res.text()).slice(0, 160)}`);
      buf = Buffer.from(await res.arrayBuffer());
      break;
    } catch (e) {
      lastErr = e;
      console.log(`    Fish attempt ${attempt}/4 failed: ${e instanceof Error ? e.message : String(e)} — retrying...`);
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
  if (!buf) throw new Error(`Fish failed after 4 attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  writeFileSync(raw, buf);
  const dur = parseFloat(JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_entries format=duration "${raw}"`).toString()).format.duration);
  const foStart = Math.max(0, dur - 1.4).toFixed(2);
  execSync(`ffmpeg -y -i "${raw}" -af "afade=t=in:st=0:d=0.4,afade=t=out:st=${foStart}:d=1.4" -c:a libmp3lame -b:a 128k -ac 1 "${out}"`, { stdio: "ignore" });
  return parseFloat(JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_entries format=duration "${out}"`).toString()).format.duration);
}

function scheduleFor(i: number): string {
  // 2-day cadence from START at 07:00Z (08:00 BST)
  const [y, m, d] = START.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d, 7, 0, 0);
  return new Date(base + i * 2 * 86400000).toISOString();
}

async function main() {
  const eps: Ep[] = JSON.parse(readFileSync(join(process.cwd(), "podcast-narration-batch2.json"), "utf-8")).episodes;
  mkdirSync(OUT, { recursive: true });
  const results: Record<string, unknown> = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, "utf-8")) : {};

  console.log(`\n${DRY ? "🧪 DRY RUN — " : ""}${eps.length} episodes, cadence 2-day from ${START} 07:00Z\n`);

  let i = 0;
  const failed: string[] = [];
  for (const ep of eps) {
    const idx = i++;
    if (ONLY && ep.idea_id !== ONLY) continue;
    const sched = scheduleFor(idx);
    const epNum = EPISODE_NUMBER_BASE + idx;
    console.log(`\n[${idx + 1}/${eps.length}] #${epNum} ${ep.episode_title}  →  ${sched}`);

    const prior = results[ep.idea_id] as { rsscom?: { episode_id?: number } } | undefined;
    if (prior?.rsscom?.episode_id) {
      console.log(`  ⏭  already on RSS.com (id=${prior.rsscom.episode_id}) — skipping`);
      continue;
    }
    if (DRY) {
      console.log(`  🧪 would render cover #${epNum}, generate voice, upload scheduled ${sched}`);
      continue;
    }
    try {
      const raw = join(OUT, `${ep.episode_slug}.raw.mp3`);
      const mp3 = join(OUT, `${ep.episode_slug}.mp3`);
      const dur = await oneTakeVoice(ep.narration, raw, mp3);
      console.log(`  🎙  one-take voice: ${(dur / 60).toFixed(2)} min`);

      const coverPath = await renderCoverArt(ep.episode_title, ep.episode_slug, epNum);

      const script = {
        episode_slug: ep.episode_slug,
        episode_title: ep.episode_title,
        episode_description: ep.episode_description,
        source_blog_url: ep.source_blog_url,
        source_blog_title: ep.source_blog_title,
        seo_keywords: ep.seo_keywords,
        tips: ep.tips,
      };
      const r = await uploadToRSSCom(mp3, script as never, {
        scheduleDatetime: sched,
        coverArtPath: coverPath,
        seasonNumber: 1,
        episodeNumber: epNum,
      });
      results[ep.idea_id] = { title: ep.episode_title, slug: ep.episode_slug, episodeNumber: epNum, durationMin: +(dur / 60).toFixed(2), scheduled: sched, cover: coverPath, rsscom: r };
      writeFileSync(RESULTS, JSON.stringify(results, null, 2));
      console.log(`  ✅ RSS.com episode id=${(r as { episode_id?: number })?.episode_id ?? "?"} scheduled ${sched}`);
    } catch (e) {
      failed.push(ep.idea_id);
      console.log(`  ❌ ${ep.idea_id} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n✅ done -> podcast-results-batch2.json (${eps.length - failed.length}/${eps.length} ok${failed.length ? `, failed: ${failed.join(", ")}` : ""})`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
