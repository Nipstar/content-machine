/**
 * Podcast batch runner — ONE-TAKE voice, schedule to RSS.com.
 *
 * For each episode in podcast-narration.json:
 *  - generates the WHOLE narration in a single Fish Audio call (one take —
 *    consistent tone/volume, per Andy's standing rule; no music, voice only)
 *  - applies gentle fade in/out
 *  - uploads to RSS.com (presigned) and creates a scheduled episode
 *
 * Run: cd files && npx tsx podcast-run.ts [--only idea_0] [--start 2026-06-16]
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { uploadToRSSCom } from "./podcast-upload.js";

const FISH_URL = "https://api.fish.audio/v1/tts";
const OUT = join(process.cwd(), "output", "podcasts");
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const START = process.argv.includes("--start") ? process.argv[process.argv.indexOf("--start") + 1] : "2026-06-16";

interface Ep {
  idea_id: string; episode_slug: string; episode_title: string; episode_description: string;
  source_blog_url: string; source_blog_title: string; seo_keywords: string[];
  tips: { text: string }[]; narration: string;
}

async function oneTakeVoice(narration: string, raw: string, out: string): Promise<number> {
  // Fish drops the connection mid-generation on longer scripts (ECONNRESET / "terminated").
  // Retry the whole call a few times with backoff — one flaky request must not kill the batch.
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
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`    Fish attempt ${attempt}/4 failed: ${msg} — retrying...`);
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
  if (!buf) throw new Error(`Fish failed after 4 attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  writeFileSync(raw, buf);
  // gentle fade in/out, re-encode clean
  const dur = parseFloat(JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_entries format=duration "${raw}"`).toString()).format.duration);
  const foStart = Math.max(0, dur - 1.4).toFixed(2);
  execSync(`ffmpeg -y -i "${raw}" -af "afade=t=in:st=0:d=0.4,afade=t=out:st=${foStart}:d=1.4" -c:a libmp3lame -b:a 128k -ac 1 "${out}"`, { stdio: "ignore" });
  return parseFloat(JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_entries format=duration "${out}"`).toString()).format.duration);
}

function scheduleFor(i: number): string {
  // one per day from START at 07:00Z (08:00 BST)
  const [y, m, d] = START.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d, 7, 0, 0);
  return new Date(base + i * 86400000).toISOString();
}

async function main() {
  const eps: Ep[] = JSON.parse(readFileSync(join(process.cwd(), "podcast-narration.json"), "utf-8")).episodes;
  mkdirSync(OUT, { recursive: true });
  const results: Record<string, unknown> = existsSync(join(process.cwd(), "podcast-results.json"))
    ? JSON.parse(readFileSync(join(process.cwd(), "podcast-results.json"), "utf-8")) : {};

  let i = 0;
  const failed: string[] = [];
  for (const ep of eps) {
    const idx = i++;
    if (ONLY && ep.idea_id !== ONLY) continue;
    console.log(`\n[${idx + 1}/${eps.length}] ${ep.episode_title}`);
    // Idempotent resume: skip episodes already uploaded to RSS.com in a prior run.
    const prior = results[ep.idea_id] as { rsscom?: { episode_id?: number } } | undefined;
    if (prior?.rsscom?.episode_id) {
      console.log(`  ⏭  already on RSS.com (id=${prior.rsscom.episode_id}) — skipping`);
      continue;
    }
    try {
      const raw = join(OUT, `${ep.episode_slug}.raw.mp3`);
      const mp3 = join(OUT, `${ep.episode_slug}.mp3`);
      const dur = await oneTakeVoice(ep.narration, raw, mp3);
      console.log(`  one-take voice: ${(dur / 60).toFixed(2)} min`);

      const script = {
        episode_slug: ep.episode_slug,
        episode_title: ep.episode_title,
        episode_description: ep.episode_description,
        source_blog_url: ep.source_blog_url,
        source_blog_title: ep.source_blog_title,
        seo_keywords: ep.seo_keywords,
        tips: ep.tips,
      };
      const sched = scheduleFor(idx);
      const r = await uploadToRSSCom(mp3, script as never, { scheduleDatetime: sched, seasonNumber: 1 });
      results[ep.idea_id] = { title: ep.episode_title, slug: ep.episode_slug, durationMin: +(dur / 60).toFixed(2), scheduled: sched, rsscom: r };
      writeFileSync(join(process.cwd(), "podcast-results.json"), JSON.stringify(results, null, 2));
      console.log(`  ✅ RSS.com episode id=${(r as { episode_id?: number })?.episode_id ?? "?"} scheduled ${sched}`);
    } catch (e) {
      // One episode failing must not abort the batch — log, record, keep going. Re-run to fill gaps.
      failed.push(ep.idea_id);
      console.log(`  ❌ ${ep.idea_id} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n✅ done -> podcast-results.json (${eps.length - failed.length}/${eps.length} ok${failed.length ? `, failed: ${failed.join(", ")}` : ""})`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
