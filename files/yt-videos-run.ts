/**
 * YouTube landscape video builder (one-take voice).
 *
 * For each idea:
 *  - renders 6 brand frames at 1920x1080 (quote-card style, from carousel-slides.json)
 *  - generates the FULL narration in ONE Fish Audio call (one take — consistent
 *    tone/volume, per Andy's standing rule)
 *  - times the 6 frames across that single audio track (proportional to slide words)
 *  - stitches a 1920x1080 H.264 MP4 with the single audio track
 *  - uploads to R2 -> yt-video-urls.json keyed by idea_id
 *
 * Run: cd files && npx tsx yt-videos-run.ts [--only idea_0]
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import puppeteer, { type Browser } from "puppeteer";
import { BRAND } from "./brand.js";
import { uploadToR2 } from "./gbp-image-gen.js";

const W = 1920, H = 1080;
const OUT = join(process.cwd(), "output", "yt");
const FISH_URL = "https://api.fish.audio/v1/tts";
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

let browser: Browser | null = null;
async function getBrowser() {
  if (!browser) browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  return browser;
}

function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function plain(s: string) { return s.replace(/\*\*/g, ""); }
function fontSize(t: string) { const n = plain(t).length; if (n <= 36) return 124; if (n <= 60) return 104; if (n <= 90) return 86; if (n <= 120) return 72; return 62; }
function headline(t: string, fg: string) {
  if (t.includes("**")) {
    return t.split("**").map((seg, i) => `<span style="color:${i % 2 ? BRAND.coral : fg}">${esc(seg)}</span>`).join("");
  }
  return `<span style="color:${fg}">${esc(t)}</span>`;
}

function frameHTML(text: string, dark: boolean, attribution: boolean) {
  const bg = dark ? BRAND.charcoal : BRAND.cream;
  const fg = dark ? BRAND.cream : BRAND.ink;
  const grid = dark ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.04)";
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@800;900&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet"></head>
<body style="margin:0"><div style="width:${W}px;height:${H}px;background:${bg};position:relative;overflow:hidden;font-family:'DM Sans',sans-serif;
  background-image:linear-gradient(${grid} 1px,transparent 1px),linear-gradient(90deg,${grid} 1px,transparent 1px);background-size:120px 120px">
  <div style="position:absolute;top:72px;left:120px;font-family:'JetBrains Mono',monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:${BRAND.grey};text-transform:uppercase">ANTEK / AUTOMATION</div>
  <div style="position:absolute;top:150px;left:112px;font-size:200px;font-weight:900;color:${BRAND.coral};line-height:1;font-family:Georgia,serif">&ldquo;</div>
  <div style="position:absolute;left:120px;right:120px;top:320px;bottom:170px;display:flex;flex-direction:column;justify-content:center">
    <div style="font-family:'Outfit',sans-serif;font-weight:900;font-size:${fontSize(text)}px;line-height:${attribution ? "1.05" : "1.0"};letter-spacing:-1px;text-transform:uppercase">${headline(text, fg)}</div>
  </div>
  ${attribution ? `<div style="position:absolute;bottom:96px;left:120px;width:90px;height:12px;background:${BRAND.coral}"></div>` : ""}
  <div style="position:absolute;bottom:72px;right:120px;font-family:'JetBrains Mono',monospace;font-size:26px;font-weight:700;letter-spacing:4px;color:${fg};text-transform:uppercase">BESPOKE AUTOMATION <span style="color:${BRAND.coral}">&bull;</span> SMBs <span style="color:${BRAND.coral}">&bull;</span> ANDOVER</div>
</div></body></html>`;
}

async function renderFrame(text: string, dark: boolean, attribution: boolean, out: string) {
  const b = await getBrowser();
  const page = await b.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.setContent(frameHTML(text, dark, attribution), { waitUntil: "networkidle0" });
  const el = await page.$("div");
  await (el ?? page).screenshot({ type: "png", path: out });
  await page.close();
}

async function oneTakeVoice(narration: string, out: string): Promise<number> {
  const res = await fetch(FISH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.FISH_AUDIO_API_KEY}`, "Content-Type": "application/json", model: "s2-pro" },
    body: JSON.stringify({ text: `[professional broadcast tone] ${narration}`, reference_id: process.env.FISH_AUDIO_VOICE_ID, format: "mp3", mp3_bitrate: 128 }),
  });
  if (!res.ok) throw new Error(`Fish ${res.status}: ${(await res.text()).slice(0, 160)}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  const probe = execSync(`ffprobe -v quiet -print_format json -show_entries format=duration "${out}"`).toString();
  return parseFloat(JSON.parse(probe).format.duration);
}

function durations(slides: string[], total: number): number[] {
  const w = slides.map((s) => Math.max(1, plain(s).split(/\s+/).length));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => Math.max(2.2, (x / sum) * total));
}

async function main() {
  const slidesMap: Record<string, string[]> = JSON.parse(readFileSync(join(process.cwd(), "carousel-slides.json"), "utf-8"));
  const narr: Record<string, { title: string; narration: string }> = JSON.parse(readFileSync(join(process.cwd(), "yt-narration.json"), "utf-8"));
  const urls: Record<string, { url: string; title: string; durationSeconds: number }> =
    existsSync(join(process.cwd(), "yt-video-urls.json")) ? JSON.parse(readFileSync(join(process.cwd(), "yt-video-urls.json"), "utf-8")) : {};

  for (const id of Object.keys(narr)) {
    if (ONLY && id !== ONLY) continue;
    const slides = slidesMap[id];
    const dir = join(OUT, id);
    mkdirSync(dir, { recursive: true });
    console.log(`\n${id}: ${narr[id].title}`);

    const audio = join(dir, "voice.mp3");
    const D = await oneTakeVoice(narr[id].narration, audio);
    console.log(`  one-take voice: ${D.toFixed(1)}s`);

    for (let i = 0; i < slides.length; i++) {
      await renderFrame(slides[i], i % 2 === 0, i === slides.length - 1, join(dir, `f${i + 1}.png`));
    }
    const durs = durations(slides, D);

    // concat demuxer list (last image repeated, no trailing duration)
    let list = "";
    for (let i = 0; i < slides.length; i++) list += `file 'f${i + 1}.png'\nduration ${durs[i].toFixed(3)}\n`;
    list += `file 'f${slides.length}.png'\n`;
    writeFileSync(join(dir, "list.txt"), list);

    const mp4 = join(dir, `${id}.mp4`);
    execSync(
      `cd "${dir}" && ffmpeg -y -f concat -safe 0 -i list.txt -i voice.mp3 ` +
      `-c:v libx264 -pix_fmt yuv420p -vf "scale=${W}:${H},fps=25,format=yuv420p" ` +
      `-c:a aac -b:a 192k -shortest "${mp4}"`,
      { stdio: "ignore" }
    );

    const buf = readFileSync(mp4);
    let url = mp4;
    try { url = await uploadToR2(buf, `yt/${id}.mp4`); } catch (e) { console.log(`  ⚠️ upload failed: ${(e as Error).message}`); }
    urls[id] = { url, title: narr[id].title, durationSeconds: Math.round(D) };
    console.log(`  ✅ ${(buf.length / 1e6).toFixed(1)}MB -> ${url}`);
    writeFileSync(join(process.cwd(), "yt-video-urls.json"), JSON.stringify(urls, null, 2));
  }
  if (browser) await browser.close();
  console.log(`\n✅ done -> yt-video-urls.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
