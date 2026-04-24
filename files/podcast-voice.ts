/**
 * Podcast Episode Audio Generator — Fish Audio TTS
 *
 * Generates a full-episode MP3 from a PodcastScript by:
 *   1. Splitting each section into sentences
 *   2. Calling Fish Audio S2 Pro for each sentence (avoids the ~8s output cap)
 *   3. Concatenating sentences within each section
 *   4. Interleaving sections with 0.8s silence gaps
 *   5. Applying 0.5s fade-in and 1.5s fade-out
 *   6. Optionally mixing in a music bed from assets/music/podcast-bed.mp3 at -28dB
 *
 * Uses the same FISH_AUDIO_API_KEY and FISH_AUDIO_VOICE_ID env vars as the Shorts pipeline.
 * Retries each Fish Audio call once after 2 seconds before failing.
 *
 * Output: single MP3 in output/podcast/
 *
 * System requirement: FFmpeg + ffprobe (brew install ffmpeg)
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import type { PodcastScript } from "./podcast-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FISH_API_URL = "https://api.fish.audio/v1/tts";
const SILENCE_GAP = 0.8; // seconds between sections

// Emotion tags per section type
const EMOTION_TAGS: Record<string, string> = {
  intro:    "[friendly, upbeat] ",
  context:  "[professional, conversational] ",
  tip:      "[confident, clear] ",
  blog_cta: "[casual, conversational] ",
  recap:    "[professional] ",
  outro:    "[friendly, warm] ",
};

/**
 * Splits text into sentences on boundary punctuation (. ! ?) followed by a capital.
 * Handles common cases well enough for natural TTS input.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Uses ffprobe to measure the exact duration of an audio file in seconds.
 */
function getAudioDuration(filePath: string): number {
  try {
    const output = execSync(
      `ffprobe -v quiet -print_format json -show_entries format=duration "${filePath}"`,
      { encoding: "utf-8" }
    );
    const data = JSON.parse(output) as { format?: { duration?: string } };
    const raw = parseFloat(data.format?.duration ?? "5");
    return isNaN(raw) ? 5 : raw;
  } catch {
    return 5;
  }
}

/**
 * Calls Fish Audio API for one text chunk.
 * Retries once after 2 seconds on any failure before throwing.
 */
async function callFishAudio(
  text: string,
  emotionTag: string,
  tempDir: string,
  clipId: string
): Promise<string> {
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  if (!apiKey) throw new Error("FISH_AUDIO_API_KEY not set");

  const referenceId = process.env.FISH_AUDIO_VOICE_ID || undefined;

  const body: Record<string, unknown> = {
    text: `${emotionTag}${text}`,
    temperature: 0.7,
    top_p: 0.7,
    prosody: { speed: 1.0, volume: 0, normalize_loudness: true },
    format: "mp3",
    sample_rate: 44100,
    mp3_bitrate: 128,
    latency: "normal",
  };
  if (referenceId) body.reference_id = referenceId;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    model: "s2-pro",
  } as HeadersInit;

  async function attempt(): Promise<string> {
    const res = await fetch(FISH_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Fish Audio ${res.status}: ${errText}`);
    }
    const audioBytes = Buffer.from(await res.arrayBuffer());
    const audioPath = join(tempDir, `clip-${clipId}.mp3`);
    writeFileSync(audioPath, audioBytes);
    return audioPath;
  }

  try {
    return await attempt();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `  [podcast-voice] clip ${clipId} failed (${msg}), retrying in 2s...`
    );
    await new Promise((r) => setTimeout(r, 2000));
    return await attempt(); // throws if retry also fails
  }
}

/**
 * Generates audio for one script section.
 * Splits into sentences, calls Fish Audio per sentence, concatenates.
 * Returns the path to the section's MP3 file.
 */
async function generateSectionAudio(
  text: string,
  emotionTag: string,
  tempDir: string,
  sectionLabel: string
): Promise<string> {
  const sentences = splitSentences(text);
  const clipPaths: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const clipId = `${sectionLabel}-${i}`;
    console.log(
      `  [podcast-voice] ${sectionLabel} (${i + 1}/${sentences.length}): "${sentences[i].substring(0, 60)}${sentences[i].length > 60 ? "…" : ""}"`
    );
    const clipPath = await callFishAudio(sentences[i], emotionTag, tempDir, clipId);
    clipPaths.push(clipPath);
    if (i < sentences.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (clipPaths.length === 1) return clipPaths[0];

  // Concatenate multiple sentence clips into one section file
  const sectionPath = join(tempDir, `section-${sectionLabel}.mp3`);
  const inputArgs = clipPaths.map((p) => `-i "${p}"`).join(" ");
  const filterInputs = clipPaths.map((_, i) => `[${i}:a]`).join("");
  execSync(
    `ffmpeg -y ${inputArgs} ` +
      `-filter_complex "${filterInputs}concat=n=${clipPaths.length}:v=0:a=1[aout];` +
      `[aout]aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=mono[final]" ` +
      `-map "[final]" -c:a libmp3lame -b:a 128k "${sectionPath}"`,
    { stdio: "pipe" }
  );
  return sectionPath;
}

/**
 * Generates a complete episode MP3 from a validated PodcastScript.
 *
 * @param script       - Validated PodcastScript (from parsePodcastScript)
 * @param options.outDir      - Output directory (default: output/podcast/)
 * @param options.addMusicBed - Mix podcast-bed.mp3 at -28dB (default: true if file exists)
 */
export async function generateEpisodeAudio(
  script: PodcastScript,
  options: { outDir?: string; addMusicBed?: boolean } = {}
): Promise<{ audioPath: string; durationSeconds: number }> {
  if (!process.env.FISH_AUDIO_API_KEY) {
    throw new Error("FISH_AUDIO_API_KEY not set — cannot generate podcast audio");
  }

  const tempDir = join(tmpdir(), `podcast-${randomUUID()}`);
  mkdirSync(tempDir, { recursive: true });

  // Build ordered list of [text, emotionTag, sectionLabel]
  // Insert blog_cta after tip 3 and mid_cta after tip 5 (if enough tips)
  const sections: Array<[string, string, string]> = [
    [script.intro,   EMOTION_TAGS.intro,   "intro"],
    [script.context, EMOTION_TAGS.context, "context"],
  ];
  for (let i = 0; i < script.tips.length; i++) {
    sections.push([script.tips[i].text, EMOTION_TAGS.tip, `tip${i + 1}`]);
    // Insert casual blog mention after tip 3
    if (i === 2 && script.blog_cta) {
      sections.push([script.blog_cta, EMOTION_TAGS.blog_cta, "blog_cta"]);
    }
  }
  sections.push([script.recap, EMOTION_TAGS.recap, "recap"]);
  sections.push([script.outro, EMOTION_TAGS.outro, "outro"]);

  // Generate each section's audio
  console.log(`\n  Generating ${sections.length} sections via Fish Audio...\n`);
  const sectionPaths: string[] = [];
  for (const [text, emotionTag, label] of sections) {
    const sectionPath = await generateSectionAudio(text, emotionTag, tempDir, label);
    sectionPaths.push(sectionPath);
    // Brief rate-limit gap between sections
    await new Promise((r) => setTimeout(r, 500));
  }

  // Generate 0.8s silence gap
  const silencePath = join(tempDir, "silence.mp3");
  execSync(
    `ffmpeg -y -f lavfi -i anullsrc=channel_layout=mono:sample_rate=44100 ` +
      `-t ${SILENCE_GAP} -c:a libmp3lame -b:a 128k -ac 1 "${silencePath}"`,
    { stdio: "pipe" }
  );

  // Interleave sections with silence: [s1, silence, s2, silence, ..., sN]
  const interleaved: string[] = [];
  for (let i = 0; i < sectionPaths.length; i++) {
    interleaved.push(sectionPaths[i]);
    if (i < sectionPaths.length - 1) interleaved.push(silencePath);
  }

  // Concatenate all interleaved clips into raw episode
  const rawPath = join(tempDir, "episode-raw.mp3");
  const inputArgs = interleaved.map((p) => `-i "${p}"`).join(" ");
  const filterInputs = interleaved.map((_, i) => `[${i}:a]`).join("");
  execSync(
    `ffmpeg -y ${inputArgs} ` +
      `-filter_complex "${filterInputs}concat=n=${interleaved.length}:v=0:a=1[aout];` +
      `[aout]aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=mono[final]" ` +
      `-map "[final]" -c:a libmp3lame -b:a 128k "${rawPath}"`,
    { stdio: "pipe" }
  );

  const rawDuration = getAudioDuration(rawPath);

  // Apply fade-in (0.5s) and fade-out (1.5s)
  const fadeOutStart = Math.max(0, rawDuration - 1.5).toFixed(3);
  const fadedPath = join(tempDir, "episode-faded.mp3");
  execSync(
    `ffmpeg -y -i "${rawPath}" ` +
      `-af "afade=t=in:st=0:d=0.5,afade=t=out:st=${fadeOutStart}:d=1.5" ` +
      `-c:a libmp3lame -b:a 128k "${fadedPath}"`,
    { stdio: "pipe" }
  );

  let finalPath = fadedPath;

  // Optional music bed
  const musicBedPath = join(__dirname, "..", "assets", "music", "podcast-bed.mp3");
  const useMusicBed = options.addMusicBed !== false && existsSync(musicBedPath);
  if (useMusicBed) {
    const withMusicPath = join(tempDir, "episode-music.mp3");
    execSync(
      `ffmpeg -y -i "${fadedPath}" -stream_loop -1 -i "${musicBedPath}" ` +
        `-filter_complex "[1:a]volume=-28dB[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]" ` +
        `-map "[aout]" -c:a libmp3lame -b:a 128k "${withMusicPath}"`,
      { stdio: "pipe" }
    );
    finalPath = withMusicPath;
    console.log(`  [podcast-voice] music bed mixed at -28dB`);
  }

  // Copy to output directory
  const outDir = options.outDir ?? join(process.cwd(), "output", "podcast");
  mkdirSync(outDir, { recursive: true });
  const slug = script.episode_title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .substring(0, 50);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
  const outputPath = join(outDir, `${slug}-${timestamp}.mp3`);

  const audioBuffer = readFileSync(finalPath);
  writeFileSync(outputPath, audioBuffer);

  const duration = getAudioDuration(outputPath);
  console.log(`\n  ✅  Episode audio: ${outputPath}  (${duration.toFixed(1)}s)\n`);
  return { audioPath: outputPath, durationSeconds: Math.round(duration) };
}
