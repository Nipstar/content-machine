/**
 * YouTube Shorts Video Stitcher — FFmpeg Edition
 *
 * Stitches 6 PNG frames into a ~30-second H.264 MP4 at 1080×1920.
 *
 * Pipeline per frame:
 *   1. zoompan — slow 2% Ken Burns zoom over each slide's display duration
 *   2. xfade   — 0.3s crossfade transitions between all 6 clips
 *
 * Slide durations:
 *   - With voiceover: each slide displays for the duration of its audio clip
 *     (clamped to 3–8 seconds). Pass a SlideAudio[] as the third argument.
 *   - Without voiceover: all slides display for exactly 5 seconds each,
 *     producing a ~28.5s video.
 *
 * Audio:
 *   - With voiceover: per-slide MP3 clips are concatenated into one track.
 *     Background music (assets/music/*.mp3) is mixed underneath at -22dB.
 *   - Without voiceover: background music only, trimmed to video duration.
 *   - No audio at all: -an (silent MP4).
 *
 * Duration fix: each PNG is input at 1fps (-r 1 -loop 1) so FFmpeg sees a
 * real video stream. zoompan synthesises the 30fps output via its fps= param
 * and d= (total output frames). This avoids the "treating each PNG as a single
 * 1/30s frame" bug that produced 15-minute videos.
 *
 * Output: H.264, yuv420p, 30fps, CRF 18, +faststart — ready for YouTube Shorts.
 *
 * System requirement: FFmpeg + ffprobe must be installed (brew install ffmpeg).
 */

import ffmpeg from "fluent-ffmpeg";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { SlideAudio } from "./shorts-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Constants ────────────────────────────────────────────────
const FPS = 30;
const CROSSFADE_DURATION = 0.3;    // seconds between slides
const DEFAULT_SLIDE_DURATION = 5;  // seconds per slide in silent mode

/**
 * Builds the -filter_complex string for N input PNGs with variable durations.
 *
 * Input layout assumed by caller:
 *   [0..n-1]          → PNG frames (n = durations.length)
 *   [voiceStart..n+voiceStart-1] → voiceover MP3s (if voiceAudioStartIndex !== null)
 *   [musicIndex]      → background music (if musicInputIndex !== null)
 */
function buildFilterComplex(
  durations: number[],
  voiceAudioStartIndex: number | null,
  musicInputIndex: number | null
): string {
  const n = durations.length;
  const parts: string[] = [];

  // Total video duration — needed for audio trimming
  const totalVideoDuration =
    durations.reduce((a, b) => a + b, 0) - (n - 1) * CROSSFADE_DURATION;

  // Step 1: Ken Burns zoompan for each slide
  // Input is 1fps (-r 1 -loop 1 on each PNG), zoompan synthesises 30fps output.
  // d = output frame count; zoom increments by exactly 2% over d frames.
  for (let i = 0; i < n; i++) {
    const frames = Math.round(durations[i] * FPS);
    const zoomInc = (0.02 / frames).toFixed(8);
    parts.push(
      `[${i}:v]zoompan=` +
        `z='min(zoom+${zoomInc},1.02)':` +
        `x='iw/2-(iw/zoom/2)':` +
        `y='ih/2-(ih/zoom/2)':` +
        `d=${frames}:` +
        `s=1080x1920:` +
        `fps=${FPS}` +
        `[z${i}]`
    );
  }

  // Step 2: xfade chain with variable offsets
  // offset[i] = sum(durations[0..i]) - (i+1) * CROSSFADE_DURATION
  // This ensures each crossfade starts exactly CROSSFADE_DURATION seconds
  // before the current slide finishes, regardless of per-slide length.
  let cumulativeDuration = 0;
  for (let i = 0; i < n - 1; i++) {
    cumulativeDuration += durations[i];
    const offset = parseFloat(
      (cumulativeDuration - (i + 1) * CROSSFADE_DURATION).toFixed(4)
    );
    const input1 = i === 0 ? `[z0]` : `[xf${i}]`;
    const input2 = `[z${i + 1}]`;
    const output = i === n - 2 ? `[vout]` : `[xf${i + 1}]`;
    parts.push(
      `${input1}${input2}xfade=` +
        `transition=fade:` +
        `duration=${CROSSFADE_DURATION}:` +
        `offset=${offset}` +
        `${output}`
    );
  }

  // Step 3: Audio
  if (voiceAudioStartIndex !== null) {
    // Concat per-slide voiceover clips, trim to video length to avoid audio
    // running over the end (voice clips sum slightly longer than video due to
    // crossfade overlap).
    const audioInputs = Array.from({ length: n }, (_, i) =>
      `[${voiceAudioStartIndex + i}:a]`
    ).join("");
    parts.push(
      `${audioInputs}concat=n=${n}:v=0:a=1,` +
        `atrim=duration=${totalVideoDuration.toFixed(4)},` +
        `asetpts=PTS-STARTPTS` +
        `[concat_audio]`
    );

    if (musicInputIndex !== null) {
      parts.push(`[${musicInputIndex}:a]volume=-22dB[bgm]`);
      // duration=first → stops when voiceover (first input) ends
      parts.push(`[concat_audio][bgm]amix=inputs=2:duration=first[aout]`);
    } else {
      parts.push(`[concat_audio]asetpts=PTS-STARTPTS[aout]`);
    }
  } else if (musicInputIndex !== null) {
    // Silent mode — background music only, trimmed to video length
    parts.push(
      `[${musicInputIndex}:a]volume=-22dB,` +
        `atrim=duration=${totalVideoDuration.toFixed(4)},` +
        `asetpts=PTS-STARTPTS` +
        `[aout]`
    );
  }

  return parts.join(";");
}

/**
 * Finds the first .mp3 file in assets/music/ relative to this module.
 * Returns null if the directory doesn't exist or contains no mp3 files.
 */
function findMusicFile(): string | null {
  const musicDir = join(__dirname, "..", "assets", "music");
  if (!existsSync(musicDir)) return null;
  const mp3s = readdirSync(musicDir).filter((f) => f.toLowerCase().endsWith(".mp3"));
  return mp3s.length > 0 ? join(musicDir, mp3s[0]) : null;
}

/**
 * Stitches PNG frames into a YouTube Shorts MP4.
 *
 * @param framePaths  - Exactly 6 absolute paths to 1080×1920 PNG files, in order
 * @param outputPath  - Absolute path for the output .mp4 file
 * @param slideAudios - Optional per-slide audio clips (from generateAllVoiceovers).
 *                      When omitted or undefined, silent mode is used (5s/slide).
 * @returns The output path on success
 */
export async function stitchVideo(
  framePaths: string[],
  outputPath: string,
  slideAudios?: SlideAudio[]
): Promise<string> {
  if (framePaths.length !== 6) {
    throw new Error(`stitchVideo expects exactly 6 frames, got ${framePaths.length}`);
  }

  mkdirSync(dirname(outputPath), { recursive: true });

  const hasVoice = Array.isArray(slideAudios) && slideAudios.length === framePaths.length;

  // Per-slide display durations (seconds)
  const durations: number[] = hasVoice
    // CTA slide (last slide, index 5) has no cap — its audio includes a 5s silence gap
    // so it intentionally runs longer than 8s. All other slides clamped to 3–8s.
    ? slideAudios!.map((a, i) =>
        i === slideAudios!.length - 1
          ? Math.max(3, a.durationSeconds)
          : Math.max(3, Math.min(8, a.durationSeconds))
      )
    : Array(framePaths.length).fill(DEFAULT_SLIDE_DURATION);

  const totalDuration =
    durations.reduce((a, b) => a + b, 0) - (durations.length - 1) * CROSSFADE_DURATION;

  const musicPath = findMusicFile();

  // Input index layout:
  //   0–5      PNG frames
  //   6–11     voiceover MP3s (when hasVoice)
  //   6 or 12  background music (when present)
  const voiceAudioStartIndex: number | null = hasVoice ? 6 : null;
  const musicInputIndex: number | null =
    musicPath !== null ? (hasVoice ? 12 : 6) : null;

  const hasAudio = voiceAudioStartIndex !== null || musicInputIndex !== null;
  const filterComplex = buildFilterComplex(durations, voiceAudioStartIndex, musicInputIndex);

  console.log(`\n  Stitching ${framePaths.length} frames into MP4...`);
  console.log(`  Mode: ${hasVoice ? "voiceover" : "silent (5s/slide)"}`);
  console.log(`  Slide durations: ${durations.map((d) => `${d.toFixed(1)}s`).join(" | ")}`);
  console.log(`  Total: ~${totalDuration.toFixed(1)}s`);
  if (musicPath) console.log(`  Background music: ${musicPath} (-22dB)`);

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg();

    // PNG inputs — no input options needed. A PNG is a single frame naturally.
    // zoompan with d=<frames>:fps=30 produces exactly d output frames from
    // that 1 input frame, giving the correct per-slide duration.
    // DO NOT add -loop, -r, or -t here: extra input frames multiply d,
    // causing absurdly long output (e.g. 16 input frames × d=431 = 3.8 minutes).
    for (const framePath of framePaths) {
      cmd = cmd.input(framePath);
    }

    // Voiceover audio inputs
    if (hasVoice && slideAudios) {
      for (const sa of slideAudios) {
        cmd = cmd.input(sa.audioPath);
      }
    }

    // Background music (looped indefinitely; amix/atrim handles trimming)
    if (musicPath !== null) {
      cmd = cmd.input(musicPath).inputOptions(["-stream_loop", "-1"]);
    }

    const outputOptions: string[] = [
      "-filter_complex", filterComplex,
      "-map", "[vout]",
      ...(hasAudio ? ["-map", "[aout]"] : []),
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-r", String(FPS),
      "-movflags", "+faststart",
      ...(hasAudio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"]),
    ];

    cmd
      .outputOptions(outputOptions)
      .output(outputPath)
      .on("start", () => {
        console.log(`  FFmpeg started`);
      })
      .on("progress", (progress: { percent?: number }) => {
        if (progress.percent) {
          process.stdout.write(`  Progress: ${Math.round(progress.percent)}%\r`);
        }
      })
      .on("end", () => {
        process.stdout.write("\n");
        console.log(
          `  ✅  Video stitched -> ${outputPath}  (~${totalDuration.toFixed(1)}s | voiceover: ${hasVoice ? "yes" : "no"})\n`
        );
        resolve(outputPath);
      })
      .on("error", (err: Error) => {
        reject(new Error(`FFmpeg error: ${err.message}`));
      })
      .run();
  });
}

/**
 * Uploads a video file to Cloudflare R2 via the REST API.
 * Returns the public URL of the uploaded file.
 */
export async function uploadVideoToR2(
  filePath: string,
  filename: string
): Promise<string> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const apiToken = process.env.R2_API_TOKEN;
  const bucket = process.env.R2_BUCKET_NAME || "gbp-images";
  const publicUrl = process.env.R2_PUBLIC_URL || "";

  if (!accountId) throw new Error("R2_ACCOUNT_ID not set");
  if (!apiToken) throw new Error("R2_API_TOKEN not set");

  const buffer = readFileSync(filePath);
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${filename}`;

  const res = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "video/mp4",
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 upload failed (${res.status}): ${text}`);
  }

  return publicUrl
    ? `${publicUrl.replace(/\/$/, "")}/${filename}`
    : filename;
}
