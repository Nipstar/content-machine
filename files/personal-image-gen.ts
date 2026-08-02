/**
 * Personal Post Image Generator
 *
 * Renders a branded "hook card" for each personal social post.
 * Two sizes:
 *   landscape 1200×628  — LinkedIn feed
 *   square    1080×1080 — Instagram / Facebook / X
 *
 * Design: neo-brutalist, same system as Shorts frames and GBP images.
 * Coral/cream/sage/charcoal. No rounded corners. No gradients.
 * Thick borders, offset shadows, 900-weight Inter, asymmetric blocks.
 *
 * Upload: Cloudflare R2 via REST API (same as GBP images).
 */

import puppeteer, { type Browser } from "puppeteer";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import "dotenv/config";
import { BRAND } from "./brand.js";

// Brand colours (canonical source: brand.ts)
const CORAL    = BRAND.coral;
const CREAM    = BRAND.cream;
const SAGE     = BRAND.grey;
const CHARCOAL = BRAND.charcoal;

function esc(t: string): string {
  return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;900&display=swap" rel="stylesheet">`;

// ── LANDSCAPE 1200×628 ─────────────────────────────────────────────────────
// CORAL left panel (60%), CHARCOAL right panel (40%).
// Hook text dominates left side. "Andy Norman / Antek Automation" bottom bar.
function landscapeHtml(hook: string, topic: string): string {
  // Adaptive font size: shorter hook = bigger text
  const len = hook.length;
  const fontSize = len < 60 ? 68 : len < 100 ? 54 : len < 140 ? 44 : 36;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${FONT}
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter','Arial Black',sans-serif}</style>
</head><body>
<div style="width:1200px;height:628px;background:${CORAL};position:relative;overflow:hidden;display:flex">
  <!-- Shadow offset block -->
  <div style="position:absolute;top:12px;left:12px;width:720px;height:604px;background:${CHARCOAL};opacity:0.15"></div>
  <!-- Left coral panel -->
  <div style="width:720px;height:628px;position:relative;display:flex;flex-direction:column;justify-content:center;padding:52px 56px;z-index:2">
    <!-- Top label -->
    <div style="background:${CHARCOAL};display:inline-block;padding:8px 18px;margin-bottom:28px;align-self:flex-start">
      <span style="font-size:12px;font-weight:900;color:${CREAM};letter-spacing:5px">ANDY NORMAN</span>
    </div>
    <!-- Hook text -->
    <div style="font-size:${fontSize}px;font-weight:900;color:${CREAM};line-height:1.1;letter-spacing:-1px">${esc(hook)}</div>
    <!-- Rule -->
    <div style="width:80px;height:4px;background:${CREAM};margin-top:28px;opacity:0.6"></div>
  </div>
  <!-- Right CHARCOAL panel -->
  <div style="width:480px;height:628px;background:${CHARCOAL};position:relative;display:flex;flex-direction:column;justify-content:center;padding:48px 44px">
    <!-- SAGE accent top-right -->
    <div style="position:absolute;top:0;right:0;width:120px;height:120px;background:${SAGE};opacity:0.15"></div>
    <!-- Topic text -->
    <div style="font-size:18px;font-weight:600;color:${SAGE};line-height:1.5;margin-bottom:32px">${esc(topic)}</div>
    <!-- Coral square accent -->
    <div style="width:48px;height:48px;background:${CORAL}"></div>
    <div style="width:48px;height:48px;background:${CORAL};opacity:0.4;margin-top:8px;margin-left:16px"></div>
    <!-- Bottom: site -->
    <div style="position:absolute;bottom:40px;left:44px">
      <div style="font-size:14px;font-weight:900;color:${CREAM};opacity:0.7">antekautomation.com</div>
    </div>
  </div>
  <!-- Bottom bar across full width -->
  <div style="position:absolute;bottom:0;left:0;width:720px;height:52px;background:${CHARCOAL};display:flex;align-items:center;padding:0 56px">
    <span style="font-size:14px;font-weight:900;color:${CREAM};letter-spacing:1px">Antek Automation · AI for UK Service Businesses</span>
  </div>
</div>
</body></html>`;
}

// ── SQUARE 1080×1080 ───────────────────────────────────────────────────────
// CREAM background. Bold CORAL top strip + oversized hook text. CHARCOAL footer.
function squareHtml(hook: string, topic: string): string {
  const len = hook.length;
  const fontSize = len < 60 ? 80 : len < 100 ? 64 : len < 140 ? 52 : 42;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${FONT}
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter','Arial Black',sans-serif}</style>
</head><body>
<div style="width:1080px;height:1080px;background:${CREAM};position:relative;overflow:hidden">
  <!-- CORAL top strip -->
  <div style="position:absolute;top:0;left:0;right:0;height:120px;background:${CORAL}"></div>
  <!-- CHARCOAL offset behind top strip -->
  <div style="position:absolute;top:12px;left:12px;right:-12px;height:120px;background:${CHARCOAL};opacity:0.12"></div>
  <!-- Top label in coral strip -->
  <div style="position:absolute;top:0;left:0;right:0;height:120px;display:flex;align-items:center;padding:0 60px;z-index:2">
    <div style="background:${CHARCOAL};padding:10px 20px">
      <span style="font-size:13px;font-weight:900;color:${CREAM};letter-spacing:6px">ANDY NORMAN</span>
    </div>
    <div style="margin-left:auto;font-size:13px;font-weight:600;color:${CREAM};opacity:0.7;letter-spacing:2px">ANTEK AUTOMATION</div>
  </div>
  <!-- SAGE thin left strip -->
  <div style="position:absolute;top:120px;left:0;width:20px;bottom:100px;background:${SAGE}"></div>
  <!-- Main hook text -->
  <div style="position:absolute;top:160px;left:60px;right:60px;bottom:160px;display:flex;align-items:center">
    <div style="font-size:${fontSize}px;font-weight:900;color:${CHARCOAL};line-height:1.15;letter-spacing:-2px">${esc(hook)}</div>
  </div>
  <!-- Coral geometric accent bottom-right -->
  <div style="position:absolute;bottom:140px;right:60px;width:60px;height:60px;background:${CORAL}"></div>
  <div style="position:absolute;bottom:140px;right:140px;width:60px;height:60px;background:${CORAL};opacity:0.4"></div>
  <!-- CHARCOAL footer bar -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:100px;background:${CHARCOAL};display:flex;align-items:center;padding:0 60px;justify-content:space-between">
    <div style="font-size:16px;font-weight:900;color:${CREAM}">${esc(topic.substring(0, 55))}${topic.length > 55 ? '...' : ''}</div>
    <div style="font-size:14px;font-weight:600;color:${SAGE}">antekautomation.com</div>
  </div>
</div>
</body></html>`;
}

// ── Puppeteer ──────────────────────────────────────────────────────────────
let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!_browser?.connected) {
    _browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox","--disable-setuid-sandbox"] });
  }
  return _browser;
}

async function renderHtml(html: string, w: number, h: number): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 600));
  const buf = await page.screenshot({ type: "png" });
  await page.close();
  return Buffer.from(buf);
}

export async function closeBrowser(): Promise<void> {
  if (_browser?.connected) { await _browser.close(); _browser = null; }
}

// ── R2 upload (REST, same as GBP) ─────────────────────────────────────────
async function uploadToR2(buffer: Buffer, key: string): Promise<string> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const apiToken  = process.env.R2_API_TOKEN;
  const bucket    = process.env.R2_BUCKET_NAME || "gbp-images";
  const publicUrl = process.env.R2_PUBLIC_URL  || "";

  if (!accountId) throw new Error("R2_ACCOUNT_ID not set");
  if (!apiToken)  throw new Error("R2_API_TOKEN not set");

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${key}`;
  const res = await fetch(endpoint, {
    method: "PUT",
    headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": "image/png" },
    body: new Uint8Array(buffer), // Buffer extends Uint8Array; DOM lib's BodyInit type doesn't know that
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`R2 upload failed (${res.status}): ${txt}`);
  }
  return `${publicUrl}/${key}`;
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface PersonalImageUrls {
  landscapeUrl: string;
  squareUrl: string;
}

/**
 * Render + upload two branded images for a personal post.
 * Returns R2 public URLs for both sizes.
 */
export async function generatePersonalImages(
  slug: string,
  hook: string,
  topic: string,
): Promise<PersonalImageUrls> {
  const id = slug.substring(0, 40).replace(/[^a-z0-9-]/g, "-");
  const ts = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);

  console.log(`  Rendering images for: ${id}`);

  const [landscapeBuf, squareBuf] = await Promise.all([
    renderHtml(landscapeHtml(hook, topic), 1200, 628),
    renderHtml(squareHtml(hook, topic),    1080, 1080),
  ]);

  const landscapeKey = `personal/${id}-${ts}-landscape.png`;
  const squareKey    = `personal/${id}-${ts}-square.png`;

  const [landscapeUrl, squareUrl] = await Promise.all([
    uploadToR2(landscapeBuf, landscapeKey),
    uploadToR2(squareBuf,    squareKey),
  ]);

  console.log(`  ✓ landscape: ${landscapeUrl}`);
  console.log(`  ✓ square:    ${squareUrl}`);

  return { landscapeUrl, squareUrl };
}
