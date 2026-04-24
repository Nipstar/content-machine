/**
 * GBP Image Generator — Puppeteer Edition
 *
 * Renders neo-brutalist branded cards for GBP posts using Puppeteer.
 * Uploads to Cloudflare R2 (S3-compatible API via Cloudflare REST).
 *
 * 4 template variants:
 *   1. Stat card  — sage bg, coral stat, cream card with offset shadow
 *   2. Tip card   — charcoal bg, coral TIP block, cream card
 *   3. Quote card — cream bg, coral left strip, giant quote mark
 *   4. Question card — charcoal bg, coral accent block, massive question
 *
 * All include antekautomation.com + 0333 038 9960 footer.
 * 1200x900px PNG at 2x device scale. Neo-brutalist: no rounded corners,
 * no gradients, thick borders, offset shadows, overlapping geometric blocks.
 */

import puppeteer, { type Browser } from "puppeteer";
import type {
  GBPPost,
  StatImageData,
  TipImageData,
  QuoteImageData,
  QuestionImageData,
} from "./gbp-types.js";

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

// ── Template 1: STAT CARD ────────────────────────────────────
function statCardHtml(data: StatImageData): string {
  return `<div style="width:1200px;height:900px;background:${SAGE};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- Offset shadow -->
  <div style="position:absolute;left:88px;top:88px;width:960px;height:560px;background:${CHARCOAL}"></div>
  <!-- Main card -->
  <div style="position:absolute;left:72px;top:72px;width:960px;height:560px;background:${CREAM};border:3px solid ${CHARCOAL}">
    <!-- Coral top bar -->
    <div style="height:12px;background:${CORAL}"></div>
    <!-- Content -->
    <div style="padding:40px 60px">
      <div style="font-size:130px;font-weight:900;color:${CORAL};letter-spacing:-6px;line-height:1">${escapeHtml(data.stat_number)}</div>
      <div style="font-size:30px;font-weight:700;color:${CHARCOAL};margin-top:10px">${escapeHtml(data.stat_context)}</div>
      <div style="width:400px;height:4px;background:${CORAL};margin:30px 0"></div>
      <div style="font-size:22px;font-weight:500;color:${CHARCOAL}">${escapeHtml(data.supporting_line_1)}</div>
      <div style="font-size:22px;font-weight:500;color:${CHARCOAL};margin-top:8px">${escapeHtml(data.supporting_line_2)}</div>
    </div>
    <!-- Coral triangle accent -->
    <div style="position:absolute;bottom:0;right:0;width:0;height:0;border-bottom:140px solid ${CORAL};border-left:140px solid transparent;opacity:0.3"></div>
  </div>
  <!-- Footer bar -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:110px;background:${CHARCOAL};display:flex;align-items:center;justify-content:space-between;padding:0 72px">
    <div style="font-size:24px;font-weight:700;color:${CREAM}">antekautomation.com</div>
    <div style="font-size:22px;font-weight:500;color:${SAGE}">0333 038 9960</div>
  </div>
</div>`;
}

// ── Template 2: TIP CARD ─────────────────────────────────────
function tipCardHtml(data: TipImageData): string {
  return `<div style="width:1200px;height:900px;background:${CHARCOAL};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- Coral block top-left -->
  <div style="position:absolute;top:0;left:0;width:300px;height:180px;background:${CORAL};display:flex;align-items:center;justify-content:center">
    <div style="font-size:56px;font-weight:900;color:${CREAM};letter-spacing:10px">TIP</div>
  </div>
  <!-- Card offset shadow -->
  <div style="position:absolute;left:88px;top:228px;width:960px;height:420px;background:${CHARCOAL};border:4px solid ${CORAL}"></div>
  <!-- Main card -->
  <div style="position:absolute;left:72px;top:212px;width:960px;height:420px;background:${CREAM};border:4px solid ${CORAL}">
    <div style="padding:50px 70px">
      <div style="font-size:38px;font-weight:800;color:${CHARCOAL};line-height:1.3">${escapeHtml(data.tip_headline)}</div>
      <div style="font-size:24px;font-weight:500;color:${CHARCOAL};opacity:0.7;margin-top:30px">${escapeHtml(data.tip_detail_1)}</div>
      <div style="font-size:24px;font-weight:500;color:${CHARCOAL};opacity:0.7;margin-top:8px">${escapeHtml(data.tip_detail_2)}</div>
      <div style="width:360px;height:6px;background:${CORAL};margin-top:30px"></div>
    </div>
  </div>
  <!-- Sage geometric accents bottom-right -->
  <div style="position:absolute;bottom:120px;right:40px;width:240px;height:140px;background:${SAGE};opacity:0.4"></div>
  <div style="position:absolute;bottom:90px;right:0;width:200px;height:110px;background:${SAGE};opacity:0.6"></div>
  <!-- Footer bar (coral) -->
  <div style="position:absolute;bottom:0;left:0;width:840px;height:110px;background:${CORAL};display:flex;align-items:center;justify-content:space-between;padding:0 72px">
    <div style="font-size:24px;font-weight:700;color:${CREAM}">antekautomation.com</div>
    <div style="font-size:20px;font-weight:500;color:${CREAM};opacity:0.8">0333 038 9960</div>
  </div>
</div>`;
}

// ── Template 3: QUOTE CARD ───────────────────────────────────
function quoteCardHtml(data: QuoteImageData): string {
  return `<div style="width:1200px;height:900px;background:${CREAM};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- Coral left strip -->
  <div style="position:absolute;left:0;top:0;width:36px;height:900px;background:${CORAL}"></div>
  <!-- Charcoal header bar -->
  <div style="position:absolute;left:36px;top:0;right:0;height:90px;background:${CHARCOAL}"></div>
  <!-- Giant quote mark -->
  <div style="position:absolute;left:100px;top:100px;font-family:Georgia,serif;font-size:280px;font-weight:700;color:${CORAL};opacity:0.15;line-height:1">&ldquo;</div>
  <!-- Quote text -->
  <div style="position:absolute;left:140px;top:220px;right:200px">
    <div style="font-size:40px;font-weight:800;color:${CHARCOAL};line-height:1.25">${escapeHtml(data.quote_line_1)}</div>
    <div style="font-size:40px;font-weight:800;color:${CHARCOAL};line-height:1.25">${escapeHtml(data.quote_line_2)}</div>
    <div style="font-size:40px;font-weight:800;color:${CHARCOAL};line-height:1.25">${escapeHtml(data.quote_line_3)}</div>
    <div style="width:100px;height:6px;background:${CORAL};margin:30px 0"></div>
    <div style="font-size:24px;font-weight:500;color:${CHARCOAL};opacity:0.7">${escapeHtml(data.continuation_1)}</div>
    <div style="font-size:24px;font-weight:500;color:${CHARCOAL};opacity:0.7;margin-top:8px">${escapeHtml(data.continuation_2)}</div>
    <div style="margin-top:35px">
      <div style="font-size:22px;font-weight:700;color:${CORAL}">&mdash; Andy Norman</div>
      <div style="font-size:18px;font-weight:500;color:${CHARCOAL};opacity:0.6;margin-top:4px">Founder, Antek Automation</div>
    </div>
  </div>
  <!-- Geometric blocks bottom-right -->
  <div style="position:absolute;bottom:0;right:0;width:300px;height:200px;background:${SAGE}"></div>
  <div style="position:absolute;bottom:0;right:0;width:240px;height:150px;background:${CHARCOAL};display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div style="font-size:18px;font-weight:600;color:${CREAM}">antekautomation.com</div>
    <div style="font-size:16px;font-weight:400;color:${SAGE};margin-top:6px">0333 038 9960</div>
  </div>
</div>`;
}

// ── Template 4: QUESTION CARD ────────────────────────────────
function questionCardHtml(data: QuestionImageData): string {
  return `<div style="width:1200px;height:900px;background:${CHARCOAL};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- Coral block top-right -->
  <div style="position:absolute;top:0;right:0;width:340px;height:280px;background:${CORAL};overflow:hidden">
    <div style="position:absolute;top:10px;right:30px;font-family:Georgia,serif;font-size:260px;font-weight:700;color:${CREAM};opacity:0.25;line-height:1">?</div>
  </div>
  <!-- Question text -->
  <div style="position:absolute;left:90px;top:260px;right:100px">
    <div style="font-size:52px;font-weight:900;color:${CREAM};line-height:1.2">${escapeHtml(data.question_line_1)}</div>
    <div style="font-size:52px;font-weight:900;color:${CREAM};line-height:1.2">${escapeHtml(data.question_line_2)}</div>
    <div style="font-size:52px;font-weight:900;color:${CORAL};line-height:1.2">${escapeHtml(data.question_line_3)}</div>
    <div style="width:420px;height:6px;background:${CORAL};margin:25px 0"></div>
    <div style="font-size:24px;font-weight:400;color:${SAGE};margin-top:15px">${escapeHtml(data.supporting_line_1)}</div>
    <div style="font-size:24px;font-weight:400;color:${SAGE};margin-top:8px">${escapeHtml(data.supporting_line_2)}</div>
  </div>
  <!-- Sage bar bottom -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:130px;background:${SAGE}"></div>
  <!-- Charcoal overlap block bottom-left -->
  <div style="position:absolute;bottom:0;left:0;width:780px;height:130px;background:${CHARCOAL};display:flex;align-items:center;padding:0 90px">
    <div style="font-size:24px;font-weight:700;color:${CREAM}">antekautomation.com</div>
  </div>
  <!-- Phone on sage section -->
  <div style="position:absolute;bottom:45px;right:60px;font-size:22px;font-weight:600;color:${CHARCOAL}">0333 038 9960</div>
  <!-- Geometric square accents -->
  <div style="position:absolute;bottom:130px;left:740px;width:32px;height:32px;background:${CORAL}"></div>
  <div style="position:absolute;bottom:130px;left:780px;width:32px;height:32px;background:${CORAL};opacity:0.5"></div>
  <div style="position:absolute;bottom:98px;left:740px;width:32px;height:32px;background:${CORAL};opacity:0.3"></div>
</div>`;
}

// ── Puppeteer rendering ──────────────────────────────────────

const FULL_HTML_WRAPPER = (body: string) => `<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&display=swap" rel="stylesheet">
  <style>* { margin: 0; padding: 0; box-sizing: border-box; }</style>
</head>
<body>${body}</body>
</html>`;

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
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
  await page.setContent(FULL_HTML_WRAPPER(html), { waitUntil: "networkidle0" });
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

export async function renderStatCard(data: StatImageData): Promise<Buffer> {
  return renderTemplate(statCardHtml(data));
}

export async function renderTipCard(data: TipImageData): Promise<Buffer> {
  return renderTemplate(tipCardHtml(data));
}

export async function renderQuoteCard(data: QuoteImageData): Promise<Buffer> {
  return renderTemplate(quoteCardHtml(data));
}

export async function renderQuestionCard(data: QuestionImageData): Promise<Buffer> {
  return renderTemplate(questionCardHtml(data));
}

export async function renderGBPImage(post: GBPPost): Promise<Buffer> {
  switch (post.template_variant) {
    case "stat":
      return renderStatCard(post.image_data as StatImageData);
    case "tip":
      return renderTipCard(post.image_data as TipImageData);
    case "quote":
      return renderQuoteCard(post.image_data as QuoteImageData);
    case "question":
      return renderQuestionCard(post.image_data as QuestionImageData);
    default:
      throw new Error(`Unknown template variant: ${post.template_variant}`);
  }
}

export async function uploadToR2(buffer: Buffer, filename: string): Promise<string> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const apiToken = process.env.R2_API_TOKEN;
  const bucket = process.env.R2_BUCKET_NAME || "gbp-images";
  const publicUrl = process.env.R2_PUBLIC_URL || "";

  if (!accountId) throw new Error("R2_ACCOUNT_ID not set");
  if (!apiToken) throw new Error("R2_API_TOKEN not set");

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${filename}`;

  const res = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "image/png",
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 upload failed (${res.status}): ${text}`);
  }

  const url = publicUrl ? `${publicUrl.replace(/\/$/, "")}/${filename}` : filename;
  return url;
}

export async function generateAndUploadAll(posts: GBPPost[]): Promise<GBPPost[]> {
  console.log(`\n  Generating ${posts.length} branded images via Puppeteer...\n`);

  try {
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];

      try {
        const buffer = await renderGBPImage(post);
        const dateStr = post.scheduled_date.substring(0, 10).replace(/-/g, "");
        const filename = `gbp-${dateStr}-${post.template_variant}-${i}.png`;
        const url = await uploadToR2(buffer, filename);
        post.image_url = url;
        console.log(`  [${i + 1}/${posts.length}] ${post.template_variant} card -> ${filename}`);
      } catch (err: any) {
        console.error(`  [${i + 1}/${posts.length}] FAILED: ${err.message}`);
      }
    }
  } finally {
    await closeBrowser();
  }

  console.log(`\n  Image generation complete.\n`);
  return posts;
}
