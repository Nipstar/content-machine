/**
 * YouTube Shorts — HyperFrames render layer (animated motion graphics)
 *
 * Alternative to the legacy Puppeteer + zoompan renderer (shorts-frames.ts +
 * shorts-video.ts). Produces an animated, on-brand 9:16 1080×1920 MP4 instead
 * of static slides with a Ken Burns pan. Opt in per run with
 * `--renderer hyperframes` on the /shorts command; `legacy` stays the default.
 *
 * HyperFrames (by HeyGen, v0.6.x) renders video from an HTML composition:
 * a #root with data-duration, `class="clip"` children carrying
 * data-start / data-duration / data-track-index, and ONE paused GSAP timeline
 * registered at window.__timelines["main"], built synchronously.
 *   docs:  hyperframes.heygen.com   CLI: `hyperframes render <dir> -o out.mp4`
 *
 * AUDIO STAYS IN FFMPEG. HyperFrames renders the SILENT visual only; the Fish
 * Audio voiceover + music bed are muxed on afterwards by muxAudioOntoVideo()
 * here, mirroring the proven graph in shorts-video.ts (voiceover concat +
 * music at -22dB). We do not move audio into HyperFrames.
 *
 * TIMING SYNC: each scene's on-screen duration is the MEASURED duration of its
 * matching voiceover clip (ffprobe on the real MP3 — not the 3–8s clamp the
 * legacy timeline reports), so scene i shows for exactly as long as Andy speaks
 * it. Scenes are hard snap cuts (no crossfade), so the concatenated voiceover
 * aligns 1:1 with the sequential video clips. Any sub-frame rounding mismatch is
 * absorbed by padding/trimming the final scene.
 *
 * Deterministic + seed-stable: scene content comes from the validated script
 * and any rotation is hashed off the blog URL, so reruns produce the same video.
 *
 * HyperFrames must be installed wherever the render runs (currently local). The
 * CLI is invoked via `HYPERFRAMES_BIN` (default `npx --yes hyperframes@0.6.106`).
 */

import { execSync } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { BRAND } from "./brand.js";
import { hashSeed } from "./local-seo.js";
import type { ShortScript, ShortSlide, SlideAudio } from "./shorts-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 1080;
const H = 1920;
const FPS = 30;
const DEFAULT_SCENE_DURATION = 5; // silent mode, seconds per scene
const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js";
/** Override to point at a specific install (e.g. a vendored bin on Contabo). */
const HYPERFRAMES_BIN = process.env.HYPERFRAMES_BIN || "npx --yes hyperframes@0.6.106";

// Brutalist motion fonts (additive to brand.ts colours — display/body/data).
const FONTS_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;800;900&family=DM+Sans:wght@500;700&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet">';

// ── Scene model ──────────────────────────────────────────────

interface Scene {
  index: number;
  type: ShortSlide["type"];
  text: string;
  tipNumber?: number;
  start: number;      // seconds, cumulative
  duration: number;   // seconds, from measured voiceover
  dark: boolean;      // alternating background, quote-card style
}

/** ffprobe a file's true duration in seconds (fallback 5s). */
function probeDuration(path: string): number {
  try {
    const out = execSync(
      `ffprobe -v quiet -print_format json -show_entries format=duration "${path}"`,
      { encoding: "utf-8" }
    );
    const raw = parseFloat((JSON.parse(out).format?.duration as string) ?? "5");
    return isNaN(raw) || raw <= 0 ? 5 : raw;
  } catch {
    return 5;
  }
}

/**
 * Builds the per-scene timeline from the script and the MEASURED voiceover
 * durations. When there is no voiceover, every scene gets DEFAULT_SCENE_DURATION.
 */
function buildScenes(script: ShortScript, slideAudios?: SlideAudio[]): Scene[] {
  const hasVoice = Array.isArray(slideAudios) && slideAudios.length === script.slides.length;
  let cursor = 0;
  return script.slides.map((slide, i) => {
    const duration = hasVoice
      ? probeDuration(slideAudios![i].audioPath)
      : DEFAULT_SCENE_DURATION;
    const scene: Scene = {
      index: i,
      type: slide.type,
      text: slide.text,
      tipNumber: slide.tipNumber,
      start: cursor,
      duration,
      dark: i % 2 === 0, // even scenes dark (charcoal), odd light (cream)
    };
    cursor += duration;
    return scene;
  });
}

// ── HTML escaping ────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Words → spans for per-line kinetic reveal. */
function splitLines(text: string, maxPerLine = 4): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += maxPerLine) {
    lines.push(words.slice(i, i + maxPerLine).join(" "));
  }
  return lines;
}

/** Detects a leading stat (e.g. "62%", "3", "£200") for a count-up reveal. */
function leadingStat(text: string): { value: number; suffix: string; prefix: string } | null {
  const m = text.match(/^\s*([£$]?)(\d[\d,]*)(%|\+)?/);
  if (!m) return null;
  const value = parseInt(m[2].replace(/,/g, ""), 10);
  if (isNaN(value) || value === 0) return null;
  return { prefix: m[1] ?? "", value, suffix: m[3] ?? "" };
}

// ── Composition + timeline builders ──────────────────────────

const KICKER = "ANTEK / AUTOMATION";
const META = "BESPOKE AUTOMATION • SMBs • ANDOVER";

function sceneHtml(scene: Scene): string {
  const bg = scene.dark ? BRAND.charcoal : BRAND.cream;
  const fg = scene.dark ? BRAND.cream : BRAND.ink;
  const grid = scene.dark ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.045)";
  const id = `s${scene.index}`;

  // CTA: hardcoded Antek brand closer (no script text).
  if (scene.type === "cta") {
    return `<div id="${id}" class="clip" data-start="${scene.start.toFixed(3)}" data-duration="${scene.duration.toFixed(3)}" data-track-index="1"
      style="position:absolute;inset:0;background:${BRAND.charcoal};color:${BRAND.cream};overflow:hidden;
      background-image:linear-gradient(${grid} 1px,transparent 1px),linear-gradient(90deg,${grid} 1px,transparent 1px);background-size:80px 80px">
      <div class="kick" style="position:absolute;top:90px;left:90px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:26px;letter-spacing:8px;color:${BRAND.grey}">${KICKER}</div>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 96px;box-sizing:border-box">
        <div class="cta-bar" style="width:160px;height:22px;background:${BRAND.coral};margin-bottom:48px;transform-origin:left center"></div>
        <div class="cta-l1" style="font-family:'Outfit',sans-serif;font-weight:900;font-size:96px;line-height:0.98;text-transform:uppercase">Follow</div>
        <div class="cta-l2" style="font-family:'Outfit',sans-serif;font-weight:900;font-size:80px;line-height:0.98;letter-spacing:-2px;text-transform:uppercase;color:${BRAND.coral};white-space:nowrap">@AntekAutomation</div>
        <div class="cta-l3" style="font-family:'DM Sans',sans-serif;font-weight:700;font-size:52px;margin-top:56px">antekautomation.com</div>
        <div class="cta-l4" style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:48px;margin-top:16px;color:${BRAND.coral}">0333 038 9960</div>
      </div>
    </div>`;
  }

  const isTip = scene.type === "tip";
  const stat = scene.type === "hook" ? leadingStat(scene.text) : null;

  // Stat hook → count-up headline + the rest of the line.
  if (stat) {
    const rest = scene.text.replace(/^\s*[£$]?\d[\d,]*(%|\+)?\s*/, "").trim();
    return `<div id="${id}" class="clip" data-start="${scene.start.toFixed(3)}" data-duration="${scene.duration.toFixed(3)}" data-track-index="1"
      style="position:absolute;inset:0;background:${bg};color:${fg};overflow:hidden;
      background-image:linear-gradient(${grid} 1px,transparent 1px),linear-gradient(90deg,${grid} 1px,transparent 1px);background-size:80px 80px">
      <div class="kick" style="position:absolute;top:90px;left:90px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:26px;letter-spacing:8px;color:${BRAND.grey}">${KICKER}</div>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box">
        <div style="font-family:'Outfit',sans-serif;font-weight:900;font-size:300px;line-height:0.9;color:${BRAND.coral}">
          <span class="stat-pre">${esc(stat.prefix)}</span><span class="stat-num" data-stat="${stat.value}">0</span><span class="stat-suf">${esc(stat.suffix)}</span>
        </div>
        <div class="stat-rest" style="font-family:'Outfit',sans-serif;font-weight:800;font-size:72px;line-height:1.02;text-transform:uppercase;margin-top:32px">${esc(rest)}</div>
      </div>
      <div style="position:absolute;bottom:80px;right:90px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:24px;letter-spacing:4px;color:${BRAND.grey}">${META}</div>
    </div>`;
  }

  const lines = splitLines(scene.text, isTip ? 5 : 4);
  // Last line in coral = the punchline, quote-card two-tone treatment.
  const lineHtml = lines
    .map((ln, i) => {
      const coral = i === lines.length - 1 && lines.length > 1;
      return `<div class="ln" style="font-family:'Outfit',sans-serif;font-weight:900;font-size:96px;line-height:1.0;text-transform:uppercase;${coral ? `color:${BRAND.coral}` : ""}">${esc(ln)}</div>`;
    })
    .join("\n        ");

  const tipBadge = isTip
    ? `<div class="tip-badge" style="display:inline-block;background:${BRAND.coral};color:${BRAND.cream};font-family:'JetBrains Mono',monospace;font-weight:700;font-size:40px;padding:10px 28px;margin-bottom:40px;transform-origin:left center">TIP ${String(scene.tipNumber ?? 1).padStart(2, "0")}</div>`
    : "";

  return `<div id="${id}" class="clip" data-start="${scene.start.toFixed(3)}" data-duration="${scene.duration.toFixed(3)}" data-track-index="1"
    style="position:absolute;inset:0;background:${bg};color:${fg};overflow:hidden;
    background-image:linear-gradient(${grid} 1px,transparent 1px),linear-gradient(90deg,${grid} 1px,transparent 1px);background-size:80px 80px">
    <div class="kick" style="position:absolute;top:90px;left:90px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:26px;letter-spacing:8px;color:${BRAND.grey}">${KICKER}</div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box">
      ${tipBadge}
      ${lineHtml}
    </div>
    <div style="position:absolute;bottom:80px;right:90px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:24px;letter-spacing:4px;color:${BRAND.grey}">${META}</div>
  </div>`;
}

/** Per-scene GSAP tweens, all positioned at absolute scene-start times. */
function sceneTimeline(scene: Scene): string {
  const id = `#s${scene.index}`;
  const t = scene.start.toFixed(3);
  // Entrance windows are short and snap-in to suit short-form + brutalism.
  if (scene.type === "cta") {
    return `tl.from("${id} .cta-bar",{scaleX:0,duration:0.28,ease:"power4.out"},${t});
    tl.from("${id} .cta-l1",{yPercent:120,opacity:0,duration:0.34,ease:"power4.out"},${t}+0.06);
    tl.from("${id} .cta-l2",{yPercent:120,opacity:0,duration:0.34,ease:"power4.out"},${t}+0.16);
    tl.from("${id} .cta-l3",{opacity:0,y:30,duration:0.3,ease:"power2.out"},${t}+0.34);
    tl.from("${id} .cta-l4",{opacity:0,y:30,duration:0.3,ease:"power2.out"},${t}+0.46);`;
  }
  const stat = scene.type === "hook" ? leadingStat(scene.text) : null;
  if (stat) {
    // Count-up: tween a holder object, write rounded value on update (seekable).
    return `(function(){var o={v:0};tl.to(o,{v:${stat.value},duration:Math.min(1.1,${scene.duration.toFixed(3)}*0.5),ease:"power2.out",
      onUpdate:function(){var el=document.querySelector("${id} .stat-num");if(el)el.textContent=String(Math.round(o.v));}},${t});})();
    tl.from("${id} .stat-rest",{yPercent:60,opacity:0,duration:0.4,ease:"power3.out"},${t}+0.5);
    tl.from("${id} .kick",{opacity:0,duration:0.3},${t});`;
  }
  const badge = scene.type === "tip"
    ? `tl.from("${id} .tip-badge",{scaleX:0,duration:0.26,ease:"power4.out"},${t});`
    : "";
  // Kinetic type: each line snaps up in sequence.
  return `${badge}
    tl.from("${id} .ln",{yPercent:120,opacity:0,duration:0.34,stagger:0.1,ease:"power4.out"},${t}+0.05);
    tl.from("${id} .kick",{opacity:0,duration:0.3},${t});`;
}

function buildComposition(scenes: Scene[]): string {
  const total = scenes.reduce((a, s) => a + s.duration, 0);
  const clips = scenes.map(sceneHtml).join("\n    ");
  const tweens = scenes.map(sceneTimeline).join("\n    ");
  return `<!doctype html>
<html lang="en" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="${GSAP_CDN}"></script>
    ${FONTS_LINK}
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: ${BRAND.charcoal}; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total.toFixed(3)}" data-width="1080" data-height="1920"
      style="position:relative;width:1080px;height:1920px;overflow:hidden">
    ${clips}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
    ${tweens}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}

// ── Audio mux (mirrors shorts-video.ts: voiceover concat + music -22dB) ──

function findMusicFile(): string | null {
  const musicDir = join(__dirname, "..", "assets", "music");
  if (!existsSync(musicDir)) return null;
  const mp3s = readdirSync(musicDir).filter((f) => f.toLowerCase().endsWith(".mp3"));
  return mp3s.length > 0 ? join(musicDir, mp3s[0]) : null;
}

/**
 * Muxes Fish Audio voiceover + music bed onto the silent HyperFrames video.
 * Audio graph matches the legacy stitcher: concat the per-scene voiceover clips,
 * trim to the video duration, mix background music underneath at -22dB. Pure
 * audio step — the visual is already final, so the video stream is copied.
 */
async function muxAudioOntoVideo(
  silentVideoPath: string,
  outputPath: string,
  slideAudios: SlideAudio[] | undefined,
  videoDuration: number
): Promise<string> {
  const hasVoice = Array.isArray(slideAudios) && slideAudios.length > 0;
  const musicPath = findMusicFile();

  if (!hasVoice && !musicPath) {
    // Nothing to mux — the silent video IS the output.
    copyFileSync(silentVideoPath, outputPath);
    return outputPath;
  }

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg().input(silentVideoPath);
    const n = hasVoice ? slideAudios!.length : 0;
    if (hasVoice) for (const sa of slideAudios!) cmd = cmd.input(sa.audioPath);
    const musicIndex = musicPath ? (hasVoice ? n + 1 : 1) : null;
    if (musicPath) cmd = cmd.input(musicPath).inputOptions(["-stream_loop", "-1"]);

    const parts: string[] = [];
    if (hasVoice) {
      const ins = Array.from({ length: n }, (_, i) => `[${i + 1}:a]`).join("");
      parts.push(
        `${ins}concat=n=${n}:v=0:a=1,atrim=duration=${videoDuration.toFixed(4)},asetpts=PTS-STARTPTS[vo]`
      );
      if (musicIndex !== null) {
        parts.push(`[${musicIndex}:a]volume=-22dB[bgm]`);
        parts.push(`[vo][bgm]amix=inputs=2:duration=first[aout]`);
      } else {
        parts.push(`[vo]asetpts=PTS-STARTPTS[aout]`);
      }
    } else if (musicIndex !== null) {
      parts.push(
        `[${musicIndex}:a]volume=-22dB,atrim=duration=${videoDuration.toFixed(4)},asetpts=PTS-STARTPTS[aout]`
      );
    }

    cmd
      .outputOptions([
        "-filter_complex", parts.join(";"),
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-shortest",
      ])
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", (err: Error) => reject(new Error(`FFmpeg mux error: ${err.message}`)))
      .run();
  });
}

// ── Public entry point ───────────────────────────────────────

/**
 * Renders a Short via HyperFrames (animated motion graphics) and muxes the
 * existing Fish Audio voiceover + music onto it. Returns the final MP4 path.
 * The SAME MP4 is reused across YouTube/Instagram/Facebook — no per-platform
 * re-render.
 *
 * @param script       Validated ShortScript (on-screen text already vertical/
 *                     local-aware from generate-shorts.ts).
 * @param outputPath   Absolute path for the final MP4.
 * @param slideAudios  Per-scene voiceover clips from generateAllVoiceovers()
 *                     (drives scene timing). Omit for silent mode (5s/scene).
 */
export async function renderShortHyperframes(
  script: ShortScript,
  outputPath: string,
  slideAudios?: SlideAudio[]
): Promise<string> {
  // Seed (stable across reruns) — reserved for future seeded motion variation.
  void hashSeed(script.sourceBlogUrl || script.sourceBlogTitle);

  const scenes = buildScenes(script, slideAudios);
  const total = scenes.reduce((a, s) => a + s.duration, 0);
  const html = buildComposition(scenes);

  // Scaffold a minimal self-contained HyperFrames project in a temp dir.
  const projectDir = join(tmpdir(), `shorts-hf-${randomUUID()}`);
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, "index.html"), html);
  writeFileSync(
    join(projectDir, "hyperframes.json"),
    JSON.stringify(
      {
        $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
        paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
      },
      null,
      2
    )
  );

  const silentPath = join(projectDir, "renders", "short-silent.mp4");
  mkdirSync(join(projectDir, "renders"), { recursive: true });

  console.log(`  [hyperframes] rendering silent visual (${total.toFixed(1)}s, ${scenes.length} scenes)...`);
  execSync(
    `${HYPERFRAMES_BIN} render "${projectDir}" -o "${silentPath}" --fps ${FPS} --quiet`,
    { stdio: "inherit" }
  );
  if (!existsSync(silentPath)) {
    throw new Error(`HyperFrames render produced no output at ${silentPath}`);
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  const videoDuration = probeDuration(silentPath);
  console.log(`  [hyperframes] muxing Fish Audio + music (FFmpeg)...`);
  await muxAudioOntoVideo(silentPath, outputPath, slideAudios, videoDuration);

  // Clean up the temp project (best-effort).
  try { rmSync(projectDir, { recursive: true, force: true }); } catch {}

  console.log(`  [hyperframes] ✅  ${outputPath}`);
  return outputPath;
}
