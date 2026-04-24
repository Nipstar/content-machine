/**
 * YouTube Shorts — Fish Audio TTS voiceover generator
 *
 * Generates per-slide MP3 voiceover clips via the Fish Audio S2 Pro API.
 * Uses ffprobe to measure exact audio duration for voice-driven slide timing.
 *
 * Returns null on any failure so the pipeline can fall back to silent mode
 * (5 seconds per slide with no voiceover).
 *
 * Rate limit: 500ms delay between API calls.
 */

import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import type { ShortScript, SlideAudio } from "./shorts-types.js";

const FISH_API_URL = "https://api.fish.audio/v1/tts";

// CTA voiceover split into two parts with a 5s silence gap between them.
// Part 1 ends after the website address; Part 2 is the phone number.
// This prevents the phone number being clipped by any duration cap.
const CTA_VOICEOVER_PART1 =
  "Follow Antek Automation for more tips like this. Visit antek automation dot com.";
const CTA_VOICEOVER_PART2 =
  "Or call oh three three three, oh three eight, nine nine six oh.";

// Prepended to every voiceover text sent to Fish Audio to set delivery tone
const TONE_TAG = "[professional broadcast tone] ";

/**
 * Calls the Fish Audio API for a single slide's voiceover text.
 * Returns the saved MP3 path and its exact duration in seconds, or null on failure.
 */
async function generateSlideVoiceover(
  text: string,
  tempDir: string,
  index: number
): Promise<{ audioPath: string; durationSeconds: number } | null> {
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  if (!apiKey) return null;

  const referenceId = process.env.FISH_AUDIO_VOICE_ID || undefined;

  const body: Record<string, unknown> = {
    text: `${TONE_TAG}${text}`,
    temperature: 0.7,
    top_p: 0.7,
    prosody: {
      speed: 1.05,
      volume: 0,
      normalize_loudness: true,
    },
    format: "mp3",
    sample_rate: 44100,
    mp3_bitrate: 128,
    latency: "normal",
  };

  if (referenceId) {
    body.reference_id = referenceId;
  }

  try {
    const res = await fetch(FISH_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model: "s2-pro",
      } as HeadersInit,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`  [voice] slide ${index} Fish Audio error ${res.status}: ${errText}`);
      return null;
    }

    const audioBytes = Buffer.from(await res.arrayBuffer());
    const audioPath = join(tempDir, `voice-${String(index).padStart(2, "0")}.mp3`);
    writeFileSync(audioPath, audioBytes);

    const durationSeconds = getAudioDuration(audioPath);
    return { audioPath, durationSeconds };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  [voice] slide ${index} request failed: ${msg}`);
    return null;
  }
}

/**
 * Uses ffprobe to measure the exact duration of an audio file in seconds.
 * Falls back to 5s if ffprobe is unavailable or the file can't be probed.
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
 * Generates voiceover audio for every slide in the script.
 *
 * Returns an array of SlideAudio (one per slide, durations clamped to 3–8s),
 * or null if ANY slide fails — the pipeline then falls back to silent mode.
 */
export async function generateAllVoiceovers(
  script: ShortScript,
  outDir?: string
): Promise<SlideAudio[] | null> {
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  if (!apiKey) {
    console.warn("  [voice] FISH_AUDIO_API_KEY not set — falling back to silent mode (5s/slide)");
    return null;
  }

  const dir = outDir ?? join(tmpdir(), `shorts-voice-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });

  const results: SlideAudio[] = [];

  for (let i = 0; i < script.slides.length; i++) {
    const slide = script.slides[i];

    // CTA slide: generate two TTS clips with a 5s silence gap in between.
    // Part 1: "Follow Antek Automation... Visit antek automation dot com."
    // Silence: 5s
    // Part 2: "Or call oh three three three..."
    // Concatenated via ffmpeg into a single MP3. No duration cap — CTA plays in full.
    if (slide.type === "cta") {
      console.log(`  [voice] ${i + 1}/${script.slides.length} CTA: generating part 1...`);
      const part1 = await generateSlideVoiceover(CTA_VOICEOVER_PART1, dir, -1);
      if (!part1) {
        console.warn(`  [voice] CTA part 1 failed — falling back to silent mode`);
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));

      console.log(`  [voice] ${i + 1}/${script.slides.length} CTA: generating part 2...`);
      const part2 = await generateSlideVoiceover(CTA_VOICEOVER_PART2, dir, -2);
      if (!part2) {
        console.warn(`  [voice] CTA part 2 failed — falling back to silent mode`);
        return null;
      }

      const silencePath = join(dir, `voice-cta-silence.mp3`);
      // Silence must be mono to match Fish Audio's mono output
      execSync(
        `ffmpeg -y -f lavfi -i anullsrc=channel_layout=mono:sample_rate=44100 -t 5 -c:a libmp3lame -b:a 128k -ac 1 "${silencePath}"`,
        { stdio: "pipe" }
      );

      const ctaPath = join(dir, `voice-${String(i).padStart(2, "0")}.mp3`);
      // Use filter_complex concat + aformat to normalise to s16 before encoding.
      // FFmpeg 8 / libmp3lame errors on fltp planar audio without this conversion.
      execSync(
        `ffmpeg -y -i "${part1.audioPath}" -i "${silencePath}" -i "${part2.audioPath}" ` +
        `-filter_complex "[0:a][1:a][2:a]concat=n=3:v=0:a=1[aout];[aout]aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=mono[final]" ` +
        `-map "[final]" -c:a libmp3lame -b:a 128k "${ctaPath}"`,
        { stdio: "pipe" }
      );

      const totalDuration = getAudioDuration(ctaPath);
      results.push({ slideIndex: i, audioPath: ctaPath, durationSeconds: totalDuration });
      console.log(`  [voice] ${i + 1}/${script.slides.length} ✅  CTA → ${totalDuration.toFixed(2)}s (part1 + 5s gap + part2)`);
      continue;
    }

    const voiceText = slide.voiceover_text;

    if (!voiceText) {
      console.warn(`  [voice] slide ${i} (${slide.type}) has no voiceover_text — aborting voiceover`);
      return null;
    }

    console.log(
      `  [voice] ${i + 1}/${script.slides.length} generating: "${voiceText.substring(0, 55)}${voiceText.length > 55 ? "…" : ""}"`
    );

    const result = await generateSlideVoiceover(voiceText, dir, i);

    if (!result) {
      console.warn(`  [voice] slide ${i} failed — falling back to silent mode`);
      return null;
    }

    const clamped = Math.max(3, Math.min(8, result.durationSeconds));
    results.push({
      slideIndex: i,
      audioPath: result.audioPath,
      durationSeconds: clamped,
    });

    console.log(
      `  [voice] ${i + 1}/${script.slides.length} ✅  raw=${result.durationSeconds.toFixed(2)}s → clamped=${clamped.toFixed(2)}s`
    );

    // Rate-limit: 500ms between calls
    if (i < script.slides.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

export { CTA_VOICEOVER_PART1, CTA_VOICEOVER_PART2 };
