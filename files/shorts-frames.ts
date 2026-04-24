/**
 * YouTube Shorts Frame Renderer — Puppeteer Edition
 *
 * Renders neo-brutalist branded slides for YouTube Shorts at 1080×1920 (9:16).
 * Outputs ordered PNG files for FFmpeg stitching.
 *
 * 4 template types:
 *   1. Hook   — Full-bleed CORAL, bold question/stat in CREAM, CHARCOAL offset block
 *   2. Tip    — CREAM bg, oversized CORAL tip number, SAGE left strip, CHARCOAL footer
 *   3. Summary — CHARCOAL bg, CORAL header block, CREAM summary text
 *   4. CTA    — Hardcoded Antek branding, CHARCOAL/CORAL split
 *
 * All templates: no rounded corners, no gradients, 4px borders minimum,
 * offset shadows via overlapping rectangles, 900-weight Inter, asymmetric layouts.
 */

import puppeteer, { type Browser } from "puppeteer";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import type { ShortScript, ShortSlide } from "./shorts-types.js";

// ── Brand colours ────────────────────────────────────────────
const CORAL = "#CD5C3C";
const CREAM = "#E8DCC8";
const SAGE = "#C8D8D0";
const CHARCOAL = "#2C2C2C";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Template 1: HOOK SLIDE ───────────────────────────────────
// Full-bleed CORAL background. Oversized bold question or stat in CREAM.
// CHARCOAL geometric block bleeds off the right edge. "@AntekAutomation" at bottom.
function hookTemplate(slide: ShortSlide): string {
  return `<div style="width:1080px;height:1920px;background:${CORAL};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- CHARCOAL offset block bleeds right edge (asymmetric) -->
  <div style="position:absolute;top:0;right:-40px;width:380px;height:520px;background:${CHARCOAL}"></div>
  <!-- CREAM thin vertical strip left -->
  <div style="position:absolute;top:0;left:0;width:20px;height:1920px;background:${CREAM}"></div>
  <!-- HOOK label block top-left (on CREAM strip side) -->
  <div style="position:absolute;top:120px;left:60px;background:${CHARCOAL};padding:16px 36px">
    <div style="font-size:28px;font-weight:900;color:${CREAM};letter-spacing:8px">QUICK TIPS</div>
  </div>
  <!-- Main hook text — large, 900-weight, asymmetric placement -->
  <div style="position:absolute;top:340px;left:60px;right:80px">
    <div style="font-size:96px;font-weight:900;color:${CREAM};line-height:1.05;letter-spacing:-3px">${escapeHtml(slide.text)}</div>
  </div>
  <!-- CREAM accent bar -->
  <div style="position:absolute;bottom:320px;left:60px;width:280px;height:8px;background:${CREAM}"></div>
  <!-- Source label -->
  <div style="position:absolute;bottom:240px;left:60px;font-size:26px;font-weight:600;color:${CREAM};opacity:0.7">antekautomation.com</div>
  <!-- Bottom CHARCOAL footer bar -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:160px;background:${CHARCOAL}">
    <!-- Coral accent square inside footer -->
    <div style="position:absolute;top:0;right:0;width:160px;height:160px;background:${CORAL}"></div>
    <div style="position:absolute;top:48px;left:60px;font-size:36px;font-weight:900;color:${CREAM}">@AntekAutomation</div>
  </div>
</div>`;
}

// ── Template 2: TIP SLIDE ────────────────────────────────────
// CREAM background. Oversized CORAL tip number left (asymmetric, bleeds off left edge).
// SAGE strip bleeds left edge. Bold tip text right-aligned to number.
// CHARCOAL footer bar.
function tipTemplate(slide: ShortSlide): string {
  const num = slide.tipNumber ?? 1;
  return `<div style="width:1080px;height:1920px;background:${CREAM};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- SAGE left strip bleeding to edge -->
  <div style="position:absolute;top:0;left:0;width:56px;height:1920px;background:${SAGE}"></div>
  <!-- CORAL offset block behind number -->
  <div style="position:absolute;top:248px;left:40px;width:500px;height:440px;background:${CORAL};opacity:0.12"></div>
  <!-- Oversized tip number (partially off-left, anchored to SAGE strip) -->
  <div style="position:absolute;top:180px;left:-20px;font-size:420px;font-weight:900;color:${CORAL};line-height:1;opacity:0.18">${num}</div>
  <!-- TIP NUMBER label -->
  <div style="position:absolute;top:220px;left:80px;background:${CORAL};padding:12px 28px">
    <div style="font-size:28px;font-weight:900;color:${CREAM};letter-spacing:4px">TIP ${num}</div>
  </div>
  <!-- Tip text — strong, punchy, left-anchored past SAGE strip -->
  <div style="position:absolute;top:560px;left:80px;right:60px">
    <div style="font-size:80px;font-weight:900;color:${CHARCOAL};line-height:1.1;letter-spacing:-2px">${escapeHtml(slide.text)}</div>
  </div>
  <!-- CORAL rule line -->
  <div style="position:absolute;bottom:280px;left:80px;width:320px;height:6px;background:${CORAL}"></div>
  <!-- CHARCOAL footer bar -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:160px;background:${CHARCOAL};display:flex;align-items:center;padding:0 80px;justify-content:space-between">
    <div style="font-size:30px;font-weight:700;color:${CREAM}">@AntekAutomation</div>
    <div style="width:12px;height:12px;background:${CORAL}"></div>
    <div style="font-size:24px;font-weight:500;color:${SAGE}">antekautomation.com</div>
  </div>
</div>`;
}

// ── Template 3: SUMMARY SLIDE ────────────────────────────────
// CHARCOAL background. CORAL "THE TAKEAWAY" header block (asymmetric, top-left).
// CREAM summary text, large. Coral geometric accents bottom-right.
function summaryTemplate(slide: ShortSlide): string {
  return `<div style="width:1080px;height:1920px;background:${CHARCOAL};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- CORAL header block top, bleeds left -->
  <div style="position:absolute;top:120px;left:0;width:760px;height:120px;background:${CORAL};display:flex;align-items:center;padding:0 60px">
    <div style="font-size:36px;font-weight:900;color:${CREAM};letter-spacing:10px">THE TAKEAWAY</div>
  </div>
  <!-- CREAM offset block behind header (shadow) -->
  <div style="position:absolute;top:136px;left:16px;width:760px;height:120px;background:${CREAM};opacity:0.06"></div>
  <!-- SAGE thin right strip -->
  <div style="position:absolute;top:0;right:0;width:20px;height:1920px;background:${SAGE};opacity:0.4"></div>
  <!-- Summary text — large, CREAM, slightly inset from SAGE strip -->
  <div style="position:absolute;top:440px;left:60px;right:80px">
    <div style="font-size:86px;font-weight:900;color:${CREAM};line-height:1.1;letter-spacing:-2px">${escapeHtml(slide.text)}</div>
  </div>
  <!-- Geometric coral accent squares bottom-right -->
  <div style="position:absolute;bottom:240px;right:60px;width:80px;height:80px;background:${CORAL}"></div>
  <div style="position:absolute;bottom:240px;right:160px;width:80px;height:80px;background:${CORAL};opacity:0.5"></div>
  <div style="position:absolute;bottom:160px;right:60px;width:80px;height:80px;background:${CORAL};opacity:0.25"></div>
  <!-- Bottom footer -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:160px;background:${CORAL};display:flex;align-items:center;padding:0 60px">
    <div style="font-size:34px;font-weight:900;color:${CREAM}">@AntekAutomation</div>
  </div>
</div>`;
}

// ── Template 4: CTA SLIDE ────────────────────────────────────
// Hardcoded Antek branding. CHARCOAL top, CORAL bottom split.
// "@AntekAutomation" dominates. URL + phone below.
function ctaTemplate(): string {
  return `<div style="width:1080px;height:1920px;background:${CHARCOAL};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- CREAM thin top strip -->
  <div style="position:absolute;top:0;left:0;right:0;height:16px;background:${CREAM}"></div>
  <!-- CORAL large block bottom half -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:860px;background:${CORAL}"></div>
  <!-- CHARCOAL overlap rect inside coral zone (asymmetric) -->
  <div style="position:absolute;bottom:200px;left:0;width:440px;height:300px;background:${CHARCOAL}"></div>
  <!-- SAGE geometric accent top-right -->
  <div style="position:absolute;top:100px;right:60px;width:200px;height:200px;background:${SAGE};opacity:0.2"></div>
  <div style="position:absolute;top:60px;right:100px;width:200px;height:200px;background:${SAGE};opacity:0.1"></div>
  <!-- "FOLLOW US" label top -->
  <div style="position:absolute;top:160px;left:60px;background:${CORAL};padding:14px 32px">
    <div style="font-size:28px;font-weight:900;color:${CREAM};letter-spacing:6px">FOLLOW US</div>
  </div>
  <!-- Main handle — massive -->
  <div style="position:absolute;top:360px;left:60px;right:60px">
    <div style="font-size:110px;font-weight:900;color:${CREAM};line-height:1;letter-spacing:-4px">@Antek<br>Automation</div>
  </div>
  <!-- URL on CORAL section -->
  <div style="position:absolute;bottom:540px;left:60px;right:60px">
    <div style="font-size:44px;font-weight:700;color:${CREAM}">antekautomation.com</div>
  </div>
  <!-- Phone number -->
  <div style="position:absolute;bottom:440px;left:60px">
    <div style="font-size:36px;font-weight:500;color:${CREAM};opacity:0.85">0333 038 9960</div>
  </div>
  <!-- Bottom CHARCOAL bar -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:180px;background:${CHARCOAL};display:flex;align-items:center;padding:0 60px">
    <div style="font-size:28px;font-weight:700;color:${SAGE}">AI Automation for UK Small Business</div>
  </div>
</div>`;
}

// ── HTML wrapper ─────────────────────────────────────────────
const FULL_HTML_WRAPPER = (body: string) => `<!DOCTYPE html>
<html>
<head>
  <style>* { margin: 0; padding: 0; box-sizing: border-box; }</style>
</head>
<body style="background:#000">${body}</body>
</html>`;

// ── Puppeteer singleton ──────────────────────────────────────
let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!_browser || !_browser.connected) {
    _browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return _browser;
}

async function renderTemplate(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  // 1080×1920 at 1x — CSS px = output px
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.setContent(FULL_HTML_WRAPPER(html), { waitUntil: "domcontentloaded" });
  const screenshot = await page.screenshot({ type: "png" });
  await page.close();
  return Buffer.from(screenshot);
}

async function closeBrowser(): Promise<void> {
  if (_browser && _browser.connected) {
    await _browser.close();
    _browser = null;
  }
}

// ── Public API ───────────────────────────────────────────────

/**
 * Renders all slides from a ShortScript to PNG files.
 * Returns an array of absolute file paths, ordered by slide sequence.
 * Files are written to a temp directory (or outDir if specified).
 */
export async function renderFrames(script: ShortScript, outDir?: string): Promise<string[]> {
  const dir = outDir ?? join(tmpdir(), `shorts-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });

  const paths: string[] = [];

  console.log(`\n  Rendering ${script.slides.length} Shorts frames via Puppeteer...\n`);

  try {
    for (let i = 0; i < script.slides.length; i++) {
      const slide = script.slides[i];

      let html: string;
      switch (slide.type) {
        case "hook":
          html = hookTemplate(slide);
          break;
        case "tip":
          html = tipTemplate(slide);
          break;
        case "summary":
          html = summaryTemplate(slide);
          break;
        case "cta":
          html = ctaTemplate();
          break;
        default:
          throw new Error(`Unknown slide type: ${(slide as ShortSlide).type}`);
      }

      const buffer = await renderTemplate(html);
      const filename = `frame-${String(i).padStart(2, "0")}-${slide.type}.png`;
      const filePath = join(dir, filename);
      writeFileSync(filePath, buffer);
      paths.push(filePath);
      console.log(`  [${i + 1}/${script.slides.length}] ${slide.type.padEnd(8)} -> ${filename}`);
    }
  } finally {
    await closeBrowser();
  }

  console.log(`\n  Frame rendering complete. Output: ${dir}\n`);
  return paths;
}
