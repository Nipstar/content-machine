/**
 * Podcast YouTube Video Generator
 *
 * Produces a 1920×1080 MP4 suitable for uploading as a podcast episode
 * on YouTube. The video is a branded still image (rendered via Puppeteer)
 * shown for the full duration of the podcast MP3.
 *
 * Pipeline:
 *   1. Render a 1920×1080 PNG background via Puppeteer (neo-brutalist brand)
 *   2. Stitch static PNG + podcast MP3 into H.264/AAC MP4 via FFmpeg (-loop 1)
 *   3. Upload the MP4 to Cloudflare R2 → returns public URL
 *
 * System requirements: FFmpeg + Puppeteer (both already project dependencies).
 * R2 env vars: R2_ACCOUNT_ID, R2_API_TOKEN, R2_BUCKET_NAME, R2_PUBLIC_URL.
 */

import puppeteer from "puppeteer";
import ffmpeg from "fluent-ffmpeg";
import { readFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { PodcastScript } from "./podcast-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Background frame renderer ────────────────────────────────

function buildBackgroundHtml(script: PodcastScript, durationSeconds: number): string {
  const mins = Math.floor(durationSeconds / 60);
  const secs = durationSeconds % 60;
  const durationLabel = `${mins}:${secs.toString().padStart(2, "0")}`;

  // Truncate title to ~50 chars for display
  const title = script.episode_title.length > 55
    ? script.episode_title.slice(0, 52) + "..."
    : script.episode_title;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1920px; height: 1080px; overflow: hidden;
    background: #E8DCC8;
    font-family: 'Inter', sans-serif;
    position: relative;
  }

  /* Coral left column */
  .col-left {
    position: absolute;
    left: 0; top: 0;
    width: 680px; height: 1080px;
    background: #CD5C3C;
    border-right: 4px solid #2C2C2C;
  }

  /* Brand mark */
  .brand {
    position: absolute;
    top: 60px; left: 60px;
    color: #E8DCC8;
    font-size: 22px; font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    line-height: 1.3;
  }

  /* QUICK TIPS label */
  .series-label {
    position: absolute;
    top: 160px; left: 60px;
    background: #2C2C2C;
    color: #E8DCC8;
    font-size: 18px; font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    padding: 8px 16px;
  }

  /* Podcast waveform decorative lines */
  .wave-lines {
    position: absolute;
    bottom: 120px; left: 60px; right: 60px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .wave-bar {
    background: rgba(232,220,200,0.4);
    width: 8px;
    border-radius: 0;
  }

  /* Duration badge */
  .duration {
    position: absolute;
    bottom: 60px; left: 60px;
    color: #E8DCC8;
    font-size: 18px; font-weight: 600;
    letter-spacing: 0.08em;
  }

  /* Right content area */
  .col-right {
    position: absolute;
    left: 684px; top: 0;
    right: 0; bottom: 0;
    padding: 80px 80px 80px 80px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .episode-tag {
    font-size: 16px; font-weight: 700;
    color: #CD5C3C;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-bottom: 28px;
  }

  .episode-title {
    font-size: 64px; font-weight: 900;
    color: #2C2C2C;
    line-height: 1.1;
    letter-spacing: -0.01em;
    margin-bottom: 40px;
    border-left: 8px solid #CD5C3C;
    padding-left: 28px;
  }

  .episode-desc {
    font-size: 24px; font-weight: 400;
    color: #444;
    line-height: 1.5;
    max-width: 920px;
    margin-bottom: 60px;
  }

  /* Bottom bar */
  .bottom-bar {
    position: absolute;
    bottom: 0; left: 684px; right: 0;
    height: 100px;
    background: #2C2C2C;
    border-top: 4px solid #2C2C2C;
    display: flex;
    align-items: center;
    padding: 0 80px;
    justify-content: space-between;
  }
  .bottom-url {
    color: #E8DCC8;
    font-size: 22px; font-weight: 700;
    letter-spacing: 0.05em;
  }
  .bottom-phone {
    color: #C8D8D0;
    font-size: 20px; font-weight: 600;
    letter-spacing: 0.05em;
  }

  /* Sage accent block */
  .accent-block {
    position: absolute;
    top: 0; right: 0;
    width: 220px; height: 220px;
    background: #C8D8D0;
    border-left: 4px solid #2C2C2C;
    border-bottom: 4px solid #2C2C2C;
  }
  .accent-inner {
    position: absolute;
    bottom: 16px; left: 16px;
    font-size: 15px; font-weight: 900;
    color: #2C2C2C;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    line-height: 1.4;
  }
</style>
</head>
<body>
  <div class="col-left">
    <div class="brand">Antek<br>Automation</div>
    <div class="series-label">Quick Tips Podcast</div>

    <!-- Decorative waveform bars -->
    <div class="wave-lines">
      ${[20,35,55,40,65,45,70,50,60,38,52,68,42,58,35,62,48,72,36,54,66,44]
        .map(h => `<div class="wave-bar" style="height:${h}px"></div>`).join("")}
    </div>

    <div class="duration">⏱ ${durationLabel}</div>
  </div>

  <div class="accent-block">
    <div class="accent-inner">New<br>Episode</div>
  </div>

  <div class="col-right">
    <div class="episode-tag">Podcast Episode</div>
    <div class="episode-title">${title.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    <div class="episode-desc">${script.episode_description.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
  </div>

  <div class="bottom-bar">
    <span class="bottom-url">antekautomation.com</span>
    <span class="bottom-phone">0333 038 9960</span>
  </div>
</body>
</html>`;
}

async function renderBackground(
  script: PodcastScript,
  durationSeconds: number,
  outputPath: string
): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    const html = buildBackgroundHtml(script, durationSeconds);
    await page.setContent(html, { waitUntil: "networkidle0" });
    // Wait for Inter font to load
    await page.waitForFunction(
      () => document.fonts?.ready !== undefined ? document.fonts.ready.then(() => true) : true
    ).catch(() => {});
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: outputPath as `${string}.png`, type: "png" });
  } finally {
    await browser.close();
  }
  console.log(`  [podcast-youtube] background rendered → ${outputPath}`);
}

// ── FFmpeg stitcher ───────────────────────────────────────────

function stitchVideo(
  imagePath: string,
  audioPath: string,
  outputPath: string,
  durationSeconds: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .inputOptions(["-loop", "1"])
      .input(audioPath)
      .complexFilter([
        `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,` +
        `pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v]`,
      ])
      .outputOptions([
        "-map [v]",
        "-map 1:a",
        "-c:v libx264",
        "-preset medium",
        "-crf 20",
        "-tune stillimage",
        "-c:a aac",
        "-b:a 192k",
        "-movflags +faststart",
        `-t ${durationSeconds}`,
      ])
      .output(outputPath)
      .on("start", (cmd: string) => console.log(`  [podcast-youtube] ffmpeg: ${cmd}`))
      .on("end", () => {
        console.log(`  [podcast-youtube] ✅ video stitched → ${outputPath}`);
        resolve(outputPath);
      })
      .on("error", (err: Error) => reject(new Error(`FFmpeg failed: ${err.message}`)))
      .run();
  });
}

// ── R2 uploader ───────────────────────────────────────────────

async function uploadToR2(localPath: string, r2Key: string): Promise<string | null> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const apiToken = process.env.R2_API_TOKEN;
  const bucket = process.env.R2_BUCKET_NAME || "gbp-images";
  const publicUrl = process.env.R2_PUBLIC_URL || "";

  if (!accountId || !apiToken) {
    console.warn("  [podcast-youtube] R2 credentials missing — skipping upload");
    return null;
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${r2Key}`;
  const buffer = readFileSync(localPath);

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

  const cdnUrl = publicUrl
    ? `${publicUrl.replace(/\/$/, "")}/${r2Key}`
    : r2Key;

  console.log(`  [podcast-youtube] uploaded → ${cdnUrl}`);
  return cdnUrl;
}

// ── Main export ───────────────────────────────────────────────

export interface PodcastYoutubeResult {
  videoPath: string;
  r2Url: string | null;
}

/**
 * Generates a YouTube-ready 1920×1080 MP4 from a podcast episode.
 *
 * @param script          - Validated PodcastScript (for title/description)
 * @param audioPath       - Local path to the podcast MP3
 * @param durationSeconds - Episode duration in seconds
 * @param slug            - URL-safe slug for output filenames
 * @returns               - Local video path and R2 URL (null if no credentials)
 */
export async function generateYoutubeVideo(
  script: PodcastScript,
  audioPath: string,
  durationSeconds: number,
  slug: string
): Promise<PodcastYoutubeResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
  const outputDir = join(__dirname, "output", "podcast");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const imagePath = join(outputDir, `${slug}-${timestamp}-bg.png`);
  const videoPath = join(outputDir, `${slug}-${timestamp}.mp4`);

  // Step 1: Render branded background
  await renderBackground(script, durationSeconds, imagePath);

  // Step 2: Stitch MP4
  await stitchVideo(imagePath, audioPath, videoPath, durationSeconds);

  // Clean up temp background PNG
  try { unlinkSync(imagePath); } catch {}

  // Step 3: Upload to R2
  const r2Key = `podcast/videos/${slug}-${timestamp}.mp4`;
  const r2Url = await uploadToR2(videoPath, r2Key);

  return { videoPath, r2Url };
}
