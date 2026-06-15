/**
 * Regenerate one-take podcast audio (longer scripts) and UPDATE the existing
 * RSS.com episodes in place — swaps the audio via presigned upload + PATCH,
 * keeping each episode's schedule and id.
 *
 * Run: cd files && npx tsx podcast-update.ts [--only idea_0]
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const FISH_URL = "https://api.fish.audio/v1/tts";
const RSS = "https://api.rss.com";
const OUT = join(process.cwd(), "output", "podcasts");
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

const PID = process.env.RSS_COM_PODCAST_ID!;
const H = { "X-Api-Key": process.env.RSS_COM_API_KEY!, "Content-Type": "application/json" };

interface Ep { idea_id: string; episode_slug: string; narration: string; }

async function oneTakeVoice(narration: string, raw: string, out: string): Promise<number> {
  const res = await fetch(FISH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}`, "Content-Type": "application/json", model: "s2-pro" },
    body: JSON.stringify({ text: `[professional broadcast tone] ${narration}`, reference_id: process.env.FISH_AUDIO_VOICE_ID, format: "mp3", mp3_bitrate: 128 }),
  });
  if (!res.ok) throw new Error(`Fish ${res.status}: ${(await res.text()).slice(0, 160)}`);
  writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  const dur = parseFloat(JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_entries format=duration "${raw}"`).toString()).format.duration);
  const fo = Math.max(0, dur - 1.4).toFixed(2);
  execSync(`ffmpeg -y -i "${raw}" -af "afade=t=in:st=0:d=0.4,afade=t=out:st=${fo}:d=1.4" -c:a libmp3lame -b:a 128k -ac 1 "${out}"`, { stdio: "ignore" });
  return parseFloat(JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_entries format=duration "${out}"`).toString()).format.duration);
}

async function reuploadAudio(localPath: string, filename: string): Promise<string> {
  const pre = await fetch(`${RSS}/v4/podcasts/${PID}/assets/presigned-uploads`, {
    method: "POST", headers: H, body: JSON.stringify({ asset_type: "audio", expected_mime: "audio/mpeg", filename }),
  });
  if (!pre.ok) throw new Error(`presigned ${pre.status}: ${(await pre.text()).slice(0, 160)}`);
  const pj = await pre.json() as { id: string; url: string };
  const put = await fetch(pj.url, { method: "PUT", headers: { "Content-Type": "audio/mpeg" }, body: new Uint8Array(readFileSync(localPath)) });
  if (!put.ok) throw new Error(`put ${put.status}`);
  return pj.id;
}

async function patchEpisode(episodeId: number, audioUploadId: string) {
  const r = await fetch(`${RSS}/v4/podcasts/${PID}/episodes/${episodeId}`, {
    method: "PATCH", headers: H, body: JSON.stringify({ audio_upload_id: audioUploadId }),
  });
  if (!r.ok) throw new Error(`patch ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function main() {
  const eps: Ep[] = JSON.parse(readFileSync(join(process.cwd(), "podcast-narration.json"), "utf-8")).episodes;
  const results: Record<string, { rsscom?: { episode_id?: number } }> = JSON.parse(readFileSync(join(process.cwd(), "podcast-results.json"), "utf-8"));
  mkdirSync(OUT, { recursive: true });

  for (const ep of eps) {
    if (ONLY && ep.idea_id !== ONLY) continue;
    const episodeId = results[ep.idea_id]?.rsscom?.episode_id;
    if (!episodeId) { console.log(`  ⚠️ ${ep.idea_id}: no episode_id, skipping`); continue; }
    console.log(`\n${ep.idea_id} (episode ${episodeId})`);
    const raw = join(OUT, `${ep.episode_slug}.raw.mp3`);
    const mp3 = join(OUT, `${ep.episode_slug}.mp3`);
    const dur = await oneTakeVoice(ep.narration, raw, mp3);
    const uploadId = await reuploadAudio(mp3, `${ep.episode_slug}.mp3`);
    await patchEpisode(episodeId, uploadId);
    console.log(`  ✅ ${(dur / 60).toFixed(2)} min — episode audio updated`);
  }
  console.log(`\n✅ done`);
}

main().catch((e) => { console.error(e); process.exit(1); });
