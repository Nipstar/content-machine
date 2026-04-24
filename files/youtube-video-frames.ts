/**
 * YouTube Video Frame Renderer — Landscape 1920×1080 (16:9)
 *
 * Neo-brutalist branded slides for ~2-minute YouTube videos.
 * 9 slide types: intro, context, point (×5), takeaway, cta.
 *
 * Same brand system as Shorts: CORAL #CD5C3C, CREAM #E8DCC8, SAGE #C8D8D0, CHARCOAL #2C2C2C
 * No rounded corners, no gradients, thick borders, offset shadows, Inter 900-weight.
 */

import puppeteer, { type Browser } from "puppeteer";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import type { YTVideoScript, YTSlide } from "./youtube-video-types.js";

const CORAL    = "#CD5C3C";
const CREAM    = "#E8DCC8";
const SAGE     = "#C8D8D0";
const CHARCOAL = "#2C2C2C";

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const WRAP = (body: string) => `<!DOCTYPE html><html><head>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;900&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter','Arial Black',sans-serif}</style>
</head><body style="background:#000">${body}</body></html>`;

// ── INTRO ─────────────────────────────────────────────────────────────────────
// Full CORAL background. Left: "ANDY NORMAN" stacked label. Right: episode title.
function introTemplate(slide: YTSlide): string {
  return `<div style="width:1920px;height:1080px;background:${CORAL};position:relative;overflow:hidden">
  <!-- CHARCOAL offset shadow block top-left -->
  <div style="position:absolute;top:0;left:0;width:560px;height:1080px;background:${CHARCOAL}"></div>
  <!-- Left panel content -->
  <div style="position:absolute;top:0;left:0;width:560px;height:1080px;display:flex;flex-direction:column;justify-content:center;padding:60px">
    <div style="font-size:14px;font-weight:900;color:${SAGE};letter-spacing:6px;margin-bottom:20px">ANDY NORMAN</div>
    <div style="font-size:14px;font-weight:600;color:${CREAM};opacity:0.7;letter-spacing:3px">ANTEK AUTOMATION</div>
    <div style="width:80px;height:4px;background:${CORAL};margin:32px 0"></div>
    <div style="font-size:13px;font-weight:900;color:${CREAM};letter-spacing:4px;opacity:0.6">QUICK TIPS</div>
  </div>
  <!-- Vertical divider line -->
  <div style="position:absolute;top:80px;left:560px;width:4px;height:920px;background:${CREAM};opacity:0.2"></div>
  <!-- Right: main title -->
  <div style="position:absolute;top:0;left:580px;right:0;bottom:120px;display:flex;align-items:center;padding:60px">
    <div style="font-size:100px;font-weight:900;color:${CREAM};line-height:1.05;letter-spacing:-3px">${esc(slide.text)}</div>
  </div>
  <!-- CREAM bottom strip -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:80px;background:${CREAM};display:flex;align-items:center;padding:0 60px;justify-content:space-between">
    <div style="font-size:20px;font-weight:900;color:${CHARCOAL}">antekautomation.com</div>
    <div style="font-size:20px;font-weight:600;color:${CHARCOAL};opacity:0.6">0333 038 9960</div>
  </div>
</div>`;
}

// ── CONTEXT ───────────────────────────────────────────────────────────────────
// CHARCOAL background. CORAL full-width header. CREAM large text body.
function contextTemplate(slide: YTSlide): string {
  return `<div style="width:1920px;height:1080px;background:${CHARCOAL};position:relative;overflow:hidden">
  <!-- CORAL header strip -->
  <div style="position:absolute;top:0;left:0;right:0;height:100px;background:${CORAL};display:flex;align-items:center;padding:0 80px">
    <div style="font-size:28px;font-weight:900;color:${CREAM};letter-spacing:8px">THE SITUATION</div>
  </div>
  <!-- SAGE thin right strip -->
  <div style="position:absolute;top:0;right:0;width:16px;height:1080px;background:${SAGE};opacity:0.3"></div>
  <!-- Main text -->
  <div style="position:absolute;top:160px;left:80px;right:120px;bottom:140px;display:flex;align-items:center">
    <div style="font-size:76px;font-weight:900;color:${CREAM};line-height:1.15;letter-spacing:-2px">${esc(slide.text)}</div>
  </div>
  <!-- Geometric CORAL accents bottom-right -->
  <div style="position:absolute;bottom:160px;right:80px;width:60px;height:60px;background:${CORAL}"></div>
  <div style="position:absolute;bottom:160px;right:160px;width:60px;height:60px;background:${CORAL};opacity:0.5"></div>
  <!-- Bottom branding -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:80px;background:${CORAL};display:flex;align-items:center;padding:0 80px">
    <div style="font-size:20px;font-weight:900;color:${CREAM}">@AntekAutomation</div>
  </div>
</div>`;
}

// ── POINT ─────────────────────────────────────────────────────────────────────
// CREAM background. CORAL left sidebar with oversized number. CHARCOAL text right.
function pointTemplate(slide: YTSlide): string {
  const num = slide.pointNumber ?? 1;
  return `<div style="width:1920px;height:1080px;background:${CREAM};position:relative;overflow:hidden">
  <!-- SAGE thin top strip -->
  <div style="position:absolute;top:0;left:0;right:0;height:16px;background:${SAGE}"></div>
  <!-- CORAL left sidebar -->
  <div style="position:absolute;top:0;left:0;width:400px;height:1080px;background:${CORAL}"></div>
  <!-- Oversized number — behind sidebar content, bleeds -->
  <div style="position:absolute;top:-40px;left:-40px;font-size:600px;font-weight:900;color:${CHARCOAL};opacity:0.08;line-height:1">${num}</div>
  <!-- Left sidebar: point label -->
  <div style="position:absolute;top:0;left:0;width:400px;height:1080px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:16px">
    <div style="font-size:160px;font-weight:900;color:${CREAM};line-height:1">${num}</div>
    <div style="background:${CHARCOAL};padding:10px 24px">
      <div style="font-size:18px;font-weight:900;color:${CREAM};letter-spacing:6px">POINT ${num}</div>
    </div>
  </div>
  <!-- Right content -->
  <div style="position:absolute;top:0;left:440px;right:60px;bottom:100px;display:flex;align-items:center">
    <div style="font-size:80px;font-weight:900;color:${CHARCOAL};line-height:1.15;letter-spacing:-2px">${esc(slide.text)}</div>
  </div>
  <!-- CORAL rule line -->
  <div style="position:absolute;bottom:140px;left:440px;width:240px;height:5px;background:${CORAL}"></div>
  <!-- CHARCOAL footer -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:80px;background:${CHARCOAL};display:flex;align-items:center;padding:0 80px;justify-content:space-between">
    <div style="font-size:18px;font-weight:700;color:${CREAM}">@AntekAutomation</div>
    <div style="font-size:18px;font-weight:500;color:${SAGE}">antekautomation.com</div>
  </div>
</div>`;
}

// ── TAKEAWAY ──────────────────────────────────────────────────────────────────
// CHARCOAL bg. CORAL "THE TAKEAWAY" left panel. CREAM large text right.
function takeawayTemplate(slide: YTSlide): string {
  return `<div style="width:1920px;height:1080px;background:${CHARCOAL};position:relative;overflow:hidden">
  <!-- Left panel: CORAL -->
  <div style="position:absolute;top:0;left:0;width:480px;height:1080px;background:${CORAL};display:flex;flex-direction:column;justify-content:center;padding:60px">
    <div style="font-size:72px;font-weight:900;color:${CREAM};line-height:1;letter-spacing:-2px">THE<br>TAKE<br>AWAY</div>
    <div style="width:60px;height:6px;background:${CREAM};margin-top:32px"></div>
  </div>
  <!-- CHARCOAL overlap (shadow) -->
  <div style="position:absolute;top:40px;left:40px;width:480px;height:1080px;background:${CHARCOAL};opacity:0.15;z-index:0"></div>
  <!-- Right: summary text -->
  <div style="position:absolute;top:0;left:520px;right:60px;bottom:80px;display:flex;align-items:center">
    <div style="font-size:84px;font-weight:900;color:${CREAM};line-height:1.1;letter-spacing:-2px">${esc(slide.text)}</div>
  </div>
  <!-- SAGE geometric accents top-right -->
  <div style="position:absolute;top:60px;right:60px;width:80px;height:80px;background:${SAGE};opacity:0.2"></div>
  <div style="position:absolute;top:40px;right:100px;width:80px;height:80px;background:${SAGE};opacity:0.1"></div>
  <!-- Bottom strip -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:80px;background:${CORAL};display:flex;align-items:center;padding:0 80px">
    <div style="font-size:20px;font-weight:900;color:${CREAM}">Andy Norman — Antek Automation</div>
  </div>
</div>`;
}

// ── CTA ───────────────────────────────────────────────────────────────────────
// Hardcoded Antek branding. Left: CHARCOAL with handle+URL. Right: CORAL with subscribe CTA.
function ctaTemplate(): string {
  return `<div style="width:1920px;height:1080px;background:${CHARCOAL};position:relative;overflow:hidden">
  <!-- CREAM top strip -->
  <div style="position:absolute;top:0;left:0;right:0;height:12px;background:${CREAM}"></div>
  <!-- Right CORAL half -->
  <div style="position:absolute;top:0;right:0;width:800px;height:1080px;background:${CORAL}"></div>
  <!-- CHARCOAL overlap inside coral (asymmetric) -->
  <div style="position:absolute;bottom:80px;right:0;width:400px;height:340px;background:${CHARCOAL}"></div>
  <!-- Left content -->
  <div style="position:absolute;top:0;left:0;width:1120px;height:1080px;display:flex;flex-direction:column;justify-content:center;padding:80px">
    <div style="font-size:28px;font-weight:900;color:${CORAL};letter-spacing:4px;margin-bottom:24px">FOLLOW US</div>
    <div style="font-size:120px;font-weight:900;color:${CREAM};line-height:1;letter-spacing:-4px">@Antek<br>Automation</div>
    <div style="margin-top:40px;display:flex;flex-direction:column;gap:12px">
      <div style="font-size:36px;font-weight:700;color:${CREAM}">antekautomation.com</div>
      <div style="font-size:30px;font-weight:500;color:${CREAM};opacity:0.75">0333 038 9960</div>
    </div>
  </div>
  <!-- Right panel content -->
  <div style="position:absolute;top:0;right:0;width:800px;height:700px;display:flex;flex-direction:column;justify-content:center;padding:60px;z-index:2">
    <div style="font-size:52px;font-weight:900;color:${CREAM};line-height:1.1">Subscribe for AI tips built for UK small business</div>
    <div style="width:80px;height:6px;background:${CREAM};margin-top:32px"></div>
  </div>
  <!-- Bottom bar -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:80px;background:${CREAM};display:flex;align-items:center;padding:0 80px">
    <div style="font-size:20px;font-weight:900;color:${CHARCOAL}">AI Automation for UK Service Businesses — Andover, Hampshire</div>
  </div>
</div>`;
}

// ── Puppeteer singleton ────────────────────────────────────────────────────────
let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!_browser || !_browser.connected) {
    _browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  }
  return _browser;
}

async function renderSlide(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.setContent(WRAP(html), { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 500)); // font load buffer
  const shot = await page.screenshot({ type: "png" });
  await page.close();
  return Buffer.from(shot);
}

async function closeBrowser(): Promise<void> {
  if (_browser?.connected) { await _browser.close(); _browser = null; }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function renderYTFrames(script: YTVideoScript, outDir?: string): Promise<string[]> {
  const dir = outDir ?? join(tmpdir(), `yt-video-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  const paths: string[] = [];

  console.log(`\n  Rendering ${script.slides.length} YouTube video frames (1920×1080)...\n`);

  try {
    for (let i = 0; i < script.slides.length; i++) {
      const slide = script.slides[i];
      let html: string;
      switch (slide.type) {
        case "intro":    html = introTemplate(slide); break;
        case "context":  html = contextTemplate(slide); break;
        case "point":    html = pointTemplate(slide); break;
        case "takeaway": html = takeawayTemplate(slide); break;
        case "cta":      html = ctaTemplate(); break;
        default: throw new Error(`Unknown slide type: ${(slide as YTSlide).type}`);
      }

      const buf = await renderSlide(html);
      const filename = `frame-${String(i).padStart(2, "0")}-${slide.type}${slide.pointNumber ? slide.pointNumber : ""}.png`;
      const p = join(dir, filename);
      writeFileSync(p, buf);
      paths.push(p);
      console.log(`  [${i + 1}/${script.slides.length}] ${slide.type.padEnd(8)} → ${filename}`);
    }
  } finally {
    await closeBrowser();
  }

  console.log(`\n  Frame rendering complete. Output: ${dir}\n`);
  return paths;
}
