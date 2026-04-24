/**
 * Social Cards Renderer — Puppeteer Edition
 *
 * Renders 5 neo-brutalist card templates in 3 sizes for social media:
 *   Landscape 1200×628  — LinkedIn feed
 *   Square    1080×1080 — Instagram, Facebook, X/Twitter
 *   Portrait  1080×1350 — Instagram feed (taller)
 *
 * Design system (matches Shorts frames and GBP images exactly):
 *   - No rounded corners, no gradients, no soft shadows
 *   - Brand colours: coral #CD5C3C, cream #E8DCC8, sage #C8D8D0, charcoal #2C2C2C
 *   - Thick borders (3-4px), offset drop shadows via overlapping rectangles
 *   - 900-weight Inter headings, 600-weight body
 *   - Asymmetric layouts, overlapping geometric blocks that bleed to edges
 *
 * Output: PNG files in output/cards/ named [slug]_[type]_[size].png
 *
 * System requirement: Chromium via Puppeteer (installed with `npm install puppeteer`)
 */

import puppeteer, { type Browser } from "puppeteer";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type {
  CardContent,
  CardSize,
  CardType,
  CardOutput,
  StatContent,
  QuoteContent,
  TipContent,
  ListicleContent,
} from "./cards-types.js";

// ── Brand colours ─────────────────────────────────────────────
const CORAL = "#CD5C3C";
const CREAM = "#E8DCC8";
const SAGE = "#C8D8D0";
const CHARCOAL = "#2C2C2C";

// ── Viewport dimensions ───────────────────────────────────────
const DIMS: Record<CardSize, { w: number; h: number }> = {
  landscape: { w: 1200, h: 628 },
  square:    { w: 1080, h: 1080 },
  portrait:  { w: 1080, h: 1350 },
};

// ── Output directory ──────────────────────────────────────────
const CARDS_OUT_DIR = join(process.cwd(), "output", "cards");

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── HTML wrapper (loads Inter from Google Fonts) ──────────────
const htmlWrap = (body: string) => `<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
  <style>* { margin: 0; padding: 0; box-sizing: border-box; }</style>
</head>
<body style="background:#000">${body}</body>
</html>`;

// ── Reusable branding block ───────────────────────────────────
// Used in landscape top-right and portrait bottom sections.
// Returns an absolutely positioned CHARCOAL block with "ANTEK AUTOMATION" text.
function brandingBlock(
  top: number,
  right: number,
  width: number,
  onDark: boolean
): string {
  const textColour = onDark ? CREAM : CHARCOAL;
  const barColour = CORAL;
  return `<div style="position:absolute;top:${top}px;right:${right}px;width:${width}px;text-align:right">
  <div style="font-size:${Math.round(width * 0.115)}px;font-weight:900;color:${textColour};letter-spacing:1px;line-height:1.1">ANTEK</div>
  <div style="font-size:${Math.round(width * 0.115)}px;font-weight:900;color:${textColour};letter-spacing:1px;line-height:1.1">AUTOMATION</div>
  <div style="margin-top:8px;height:4px;background:${barColour}"></div>
</div>`;
}

// ── Footer bar (used by most templates) ──────────────────────
function footerBar(height: number, url = "antekautomation.com", phone = "0333 038 9960"): string {
  return `<div style="position:absolute;bottom:0;left:0;right:0;height:${height}px;background:${CHARCOAL};display:flex;align-items:center;justify-content:space-between;padding:0 ${height}px">
  <div style="font-size:${Math.round(height * 0.28)}px;font-weight:700;color:${CREAM}">${url}</div>
  <div style="font-size:${Math.round(height * 0.25)}px;font-weight:500;color:${SAGE}">${phone}</div>
</div>`;
}

// ════════════════════════════════════════════════════════════
// TEMPLATE 1: STAT CARD
// ════════════════════════════════════════════════════════════

function statTemplate(c: StatContent, size: CardSize): string {
  const { w, h } = DIMS[size];
  const esc = escapeHtml;

  if (size === "landscape") {
    // Horizontal: huge stat left, supporting text centre-left, branding right on CHARCOAL strip
    return `<div style="width:${w}px;height:${h}px;background:${CREAM};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- CHARCOAL right strip, bleeds off edge -->
  <div style="position:absolute;top:0;right:0;width:320px;height:${h}px;background:${CHARCOAL}"></div>
  <!-- CORAL top accent bar -->
  <div style="position:absolute;top:0;left:0;right:320px;height:14px;background:${CORAL}"></div>
  <!-- Stat number -->
  <div style="position:absolute;top:70px;left:80px;font-size:210px;font-weight:900;color:${CORAL};line-height:1;letter-spacing:-8px">${esc(c.number)}</div>
  <!-- Supporting text -->
  <div style="position:absolute;bottom:130px;left:80px;right:360px;font-size:40px;font-weight:900;color:${CHARCOAL};line-height:1.2">${esc(c.supporting_text)}</div>
  <!-- Source -->
  <div style="position:absolute;bottom:88px;left:80px;font-size:20px;font-weight:500;color:${CHARCOAL};opacity:0.45">${esc(c.source)}</div>
  <!-- Branding on CHARCOAL strip -->
  ${brandingBlock(80, 30, 260, true)}
  <!-- CORAL accent square bottom-right on CHARCOAL -->
  <div style="position:absolute;bottom:80px;right:0;width:120px;height:120px;background:${CORAL}"></div>
  ${footerBar(80)}
</div>`;
  }

  if (size === "square") {
    // Full-bleed CORAL background, CREAM stat number, centred
    return `<div style="width:${w}px;height:${h}px;background:${CORAL};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- CHARCOAL left strip -->
  <div style="position:absolute;top:0;left:0;width:20px;height:${h}px;background:${CHARCOAL}"></div>
  <!-- CREAM offset block top-right (geometric accent) -->
  <div style="position:absolute;top:-40px;right:-40px;width:320px;height:320px;background:${CREAM};opacity:0.12"></div>
  <!-- Stat number: massive CREAM -->
  <div style="position:absolute;top:160px;left:0;right:0;text-align:center;font-size:320px;font-weight:900;color:${CREAM};line-height:1;letter-spacing:-12px">${esc(c.number)}</div>
  <!-- Rule -->
  <div style="position:absolute;top:540px;left:80px;right:80px;height:6px;background:${CHARCOAL}"></div>
  <!-- Supporting text -->
  <div style="position:absolute;top:570px;left:80px;right:80px;text-align:center;font-size:46px;font-weight:900;color:${CHARCOAL};line-height:1.2">${esc(c.supporting_text)}</div>
  <!-- Source -->
  <div style="position:absolute;bottom:130px;left:0;right:0;text-align:center;font-size:22px;font-weight:500;color:${CHARCOAL};opacity:0.55">${esc(c.source)}</div>
  <!-- Footer -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:100px;background:${CHARCOAL};display:flex;align-items:center;padding:0 80px;justify-content:space-between">
    <div style="font-size:28px;font-weight:900;color:${CREAM}">ANTEK AUTOMATION</div>
    <div style="font-size:22px;font-weight:500;color:${SAGE}">antekautomation.com</div>
  </div>
</div>`;
  }

  // portrait
  return `<div style="width:${w}px;height:${h}px;background:${CHARCOAL};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- CORAL header block top -->
  <div style="position:absolute;top:0;left:0;right:0;height:200px;background:${CORAL}">
    <div style="position:absolute;bottom:20px;left:80px;font-size:26px;font-weight:900;color:${CREAM};letter-spacing:8px">QUICK STAT</div>
  </div>
  <!-- Oversized ghost number behind main stat (decorative) -->
  <div style="position:absolute;top:120px;right:-20px;font-size:560px;font-weight:900;color:${CORAL};opacity:0.07;line-height:1;letter-spacing:-20px">${esc(c.number)}</div>
  <!-- Stat number: CORAL, bold -->
  <div style="position:absolute;top:240px;left:80px;font-size:260px;font-weight:900;color:${CORAL};line-height:1;letter-spacing:-10px">${esc(c.number)}</div>
  <!-- Rule -->
  <div style="position:absolute;top:600px;left:80px;width:400px;height:6px;background:${CREAM}"></div>
  <!-- Supporting text -->
  <div style="position:absolute;top:640px;left:80px;right:80px;font-size:58px;font-weight:900;color:${CREAM};line-height:1.2">${esc(c.supporting_text)}</div>
  <!-- Source -->
  <div style="position:absolute;bottom:160px;left:80px;font-size:24px;font-weight:500;color:${CREAM};opacity:0.45">${esc(c.source)}</div>
  <!-- SAGE accent square -->
  <div style="position:absolute;bottom:100px;right:80px;width:100px;height:100px;background:${SAGE};opacity:0.4"></div>
  ${footerBar(100)}
</div>`;
}

// ════════════════════════════════════════════════════════════
// TEMPLATE 2: QUOTE CARD
// ════════════════════════════════════════════════════════════

function quoteTemplate(c: QuoteContent, size: CardSize): string {
  const { w, h } = DIMS[size];
  const esc = escapeHtml;

  if (size === "landscape") {
    return `<div style="width:${w}px;height:${h}px;background:${CREAM};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- CORAL left strip, thick -->
  <div style="position:absolute;top:0;left:0;width:36px;height:${h}px;background:${CORAL}"></div>
  <!-- CHARCOAL header bar -->
  <div style="position:absolute;top:0;left:36px;right:0;height:80px;background:${CHARCOAL}"></div>
  <!-- Ghost quote mark -->
  <div style="position:absolute;top:60px;left:80px;font-family:Georgia,serif;font-size:320px;font-weight:700;color:${CORAL};opacity:0.1;line-height:1">&ldquo;</div>
  <!-- Quote text -->
  <div style="position:absolute;top:130px;left:100px;right:80px;font-size:58px;font-weight:900;color:${CHARCOAL};line-height:1.18;letter-spacing:-1px">${esc(c.quote_text)}</div>
  <!-- CORAL rule -->
  <div style="position:absolute;bottom:140px;left:100px;width:120px;height:5px;background:${CORAL}"></div>
  <!-- Attribution -->
  <div style="position:absolute;bottom:94px;left:100px;font-size:24px;font-weight:700;color:${CORAL}">&mdash; ${esc(c.attribution)}</div>
  <!-- SAGE block bottom-right -->
  <div style="position:absolute;bottom:0;right:0;width:260px;height:180px;background:${SAGE}"></div>
  <div style="position:absolute;bottom:0;right:0;width:200px;height:130px;background:${CHARCOAL};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
    <div style="font-size:18px;font-weight:700;color:${CREAM}">ANTEK AUTOMATION</div>
    <div style="font-size:16px;font-weight:500;color:${SAGE}">antekautomation.com</div>
  </div>
</div>`;
  }

  if (size === "square") {
    return `<div style="width:${w}px;height:${h}px;background:${CHARCOAL};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- CORAL left strip -->
  <div style="position:absolute;top:0;left:0;width:28px;height:${h}px;background:${CORAL}"></div>
  <!-- SAGE geometric block top-right (accent) -->
  <div style="position:absolute;top:0;right:0;width:280px;height:280px;background:${SAGE};opacity:0.15"></div>
  <!-- Ghost quote mark -->
  <div style="position:absolute;top:40px;left:60px;font-family:Georgia,serif;font-size:400px;font-weight:700;color:${CORAL};opacity:0.08;line-height:1">&ldquo;</div>
  <!-- CORAL accent quote label -->
  <div style="position:absolute;top:100px;left:80px;background:${CORAL};padding:10px 24px">
    <div style="font-size:22px;font-weight:900;color:${CREAM};letter-spacing:6px">QUOTE</div>
  </div>
  <!-- Quote text -->
  <div style="position:absolute;top:220px;left:80px;right:80px;font-size:62px;font-weight:900;color:${CREAM};line-height:1.15;letter-spacing:-1px">${esc(c.quote_text)}</div>
  <!-- CORAL rule + attribution -->
  <div style="position:absolute;bottom:180px;left:80px;width:100px;height:5px;background:${CORAL}"></div>
  <div style="position:absolute;bottom:130px;left:80px;font-size:26px;font-weight:700;color:${CORAL}">&mdash; ${esc(c.attribution)}</div>
  ${footerBar(100)}
</div>`;
  }

  // portrait
  return `<div style="width:${w}px;height:${h}px;background:${CREAM};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- CORAL left strip -->
  <div style="position:absolute;top:0;left:0;width:28px;height:${h}px;background:${CORAL}"></div>
  <!-- CHARCOAL top header -->
  <div style="position:absolute;top:0;left:28px;right:0;height:100px;background:${CHARCOAL}"></div>
  <!-- Ghost oversized quote mark -->
  <div style="position:absolute;top:80px;left:60px;font-family:Georgia,serif;font-size:520px;font-weight:700;color:${CORAL};opacity:0.07;line-height:1">&ldquo;</div>
  <!-- CORAL accent label -->
  <div style="position:absolute;top:140px;left:80px;background:${CORAL};padding:14px 30px">
    <div style="font-size:26px;font-weight:900;color:${CREAM};letter-spacing:8px">IN THEIR WORDS</div>
  </div>
  <!-- Quote text: large, centre of card -->
  <div style="position:absolute;top:280px;left:80px;right:80px;font-size:70px;font-weight:900;color:${CHARCOAL};line-height:1.15;letter-spacing:-2px">${esc(c.quote_text)}</div>
  <!-- CHARCOAL bottom section -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:260px;background:${CHARCOAL}"></div>
  <!-- CORAL rule -->
  <div style="position:absolute;bottom:205px;left:80px;width:120px;height:5px;background:${CORAL}"></div>
  <!-- Attribution -->
  <div style="position:absolute;bottom:155px;left:80px;font-size:28px;font-weight:700;color:${CORAL}">&mdash; ${esc(c.attribution)}</div>
  <div style="position:absolute;bottom:100px;left:80px;font-size:26px;font-weight:700;color:${CREAM}">ANTEK AUTOMATION</div>
  <div style="position:absolute;bottom:60px;left:80px;font-size:22px;font-weight:500;color:${SAGE}">antekautomation.com</div>
</div>`;
}

// ════════════════════════════════════════════════════════════
// TEMPLATE 3: TIP CARD
// ════════════════════════════════════════════════════════════

function tipTemplate(c: TipContent, size: CardSize): string {
  const { w, h } = DIMS[size];
  const esc = escapeHtml;
  const numLabel = c.tip_number
    ? `<div style="font-size:28px;font-weight:900;color:${CREAM};letter-spacing:4px">${esc(c.tip_number)}</div>`
    : "";

  if (size === "landscape") {
    return `<div style="width:${w}px;height:${h}px;background:${CHARCOAL};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- CORAL TIP block top-left -->
  <div style="position:absolute;top:0;left:0;background:${CORAL};padding:28px 50px 28px 80px;display:inline-flex;gap:24px;align-items:center">
    <div style="font-size:44px;font-weight:900;color:${CREAM};letter-spacing:8px">TIP</div>
    ${numLabel}
  </div>
  <!-- SAGE topic tag -->
  <div style="position:absolute;top:20px;right:80px;background:${SAGE};padding:10px 22px">
    <div style="font-size:22px;font-weight:900;color:${CHARCOAL};letter-spacing:4px">${esc(c.topic_tag)}</div>
  </div>
  <!-- Tip text: large CREAM -->
  <div style="position:absolute;top:160px;left:80px;right:100px;font-size:64px;font-weight:900;color:${CREAM};line-height:1.15;letter-spacing:-2px">${esc(c.tip_text)}</div>
  <!-- CORAL accent bar bottom -->
  <div style="position:absolute;bottom:90px;left:80px;width:280px;height:5px;background:${CORAL}"></div>
  <!-- SAGE geometric accent bottom-right -->
  <div style="position:absolute;bottom:0;right:0;width:220px;height:180px;background:${SAGE};opacity:0.2"></div>
  ${footerBar(80)}
</div>`;
  }

  if (size === "square") {
    return `<div style="width:${w}px;height:${h}px;background:${CREAM};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- SAGE left strip -->
  <div style="position:absolute;top:0;left:0;width:48px;height:${h}px;background:${SAGE}"></div>
  <!-- Oversized ghost tip number (decorative) -->
  ${c.tip_number ? `<div style="position:absolute;top:60px;left:-30px;font-size:500px;font-weight:900;color:${CORAL};opacity:0.07;line-height:1">${esc(c.tip_number.split("/")[0])}</div>` : ""}
  <!-- CORAL + number label -->
  <div style="position:absolute;top:180px;left:80px;background:${CORAL};padding:16px 36px;display:inline-flex;gap:24px;align-items:center">
    <div style="font-size:36px;font-weight:900;color:${CREAM};letter-spacing:6px">TIP</div>
    ${c.tip_number ? `<div style="font-size:32px;font-weight:900;color:${CREAM}">${esc(c.tip_number)}</div>` : ""}
  </div>
  <!-- Topic tag -->
  <div style="position:absolute;top:186px;right:80px;background:${CHARCOAL};padding:12px 24px">
    <div style="font-size:20px;font-weight:900;color:${SAGE};letter-spacing:4px">${esc(c.topic_tag)}</div>
  </div>
  <!-- Tip text -->
  <div style="position:absolute;top:340px;left:80px;right:80px;font-size:72px;font-weight:900;color:${CHARCOAL};line-height:1.12;letter-spacing:-2px">${esc(c.tip_text)}</div>
  <!-- CORAL rule -->
  <div style="position:absolute;bottom:160px;left:80px;width:300px;height:6px;background:${CORAL}"></div>
  ${footerBar(120)}
</div>`;
  }

  // portrait
  return `<div style="width:${w}px;height:${h}px;position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- CORAL top ~42% -->
  <div style="position:absolute;top:0;left:0;right:0;height:560px;background:${CORAL}"></div>
  <!-- CHARCOAL bottom -->
  <div style="position:absolute;top:560px;left:0;right:0;bottom:0;background:${CHARCOAL}"></div>
  <!-- TIP label + number in CREAM on CORAL top -->
  <div style="position:absolute;top:100px;left:80px">
    <div style="font-size:44px;font-weight:900;color:${CREAM};letter-spacing:10px">TIP</div>
    ${c.tip_number ? `<div style="font-size:200px;font-weight:900;color:${CREAM};line-height:1;opacity:0.9;margin-top:-20px;letter-spacing:-8px">${esc(c.tip_number.split("/")[0])}</div>` : ""}
  </div>
  <!-- CHARCOAL overlap card in the middle (spans the seam) -->
  <div style="position:absolute;top:420px;left:60px;right:60px;height:540px;background:${CREAM};border:4px solid ${CHARCOAL}">
    <!-- CHARCOAL card offset shadow -->
  </div>
  <div style="position:absolute;top:436px;left:76px;right:44px;height:540px;background:${CHARCOAL};border:4px solid ${CORAL};z-index:0"></div>
  <!-- Tip text on CREAM card -->
  <div style="position:absolute;top:460px;left:100px;right:80px;z-index:1;font-size:66px;font-weight:900;color:${CHARCOAL};line-height:1.12;letter-spacing:-2px">${esc(c.tip_text)}</div>
  <!-- Topic tag -->
  <div style="position:absolute;top:810px;left:100px;background:${CORAL};padding:10px 24px;z-index:1">
    <div style="font-size:22px;font-weight:900;color:${CREAM};letter-spacing:4px">${esc(c.topic_tag)}</div>
  </div>
  <!-- Fraction if tip_number has a total (e.g. "01/05") -->
  ${c.tip_number?.includes("/") ? `<div style="position:absolute;top:100px;right:80px;font-size:36px;font-weight:900;color:${CREAM};opacity:0.7">${esc(c.tip_number)}</div>` : ""}
  ${footerBar(100)}
</div>`;
}

// ════════════════════════════════════════════════════════════
// TEMPLATE 4: LISTICLE CARD
// ════════════════════════════════════════════════════════════

function listicleTemplate(c: ListicleContent, size: CardSize): string {
  const { w, h } = DIMS[size];
  const esc = escapeHtml;

  const itemHtml = (item: string, i: number, fontSize: number, gap: number) =>
    `<div style="display:flex;align-items:flex-start;gap:${gap}px;margin-bottom:${Math.round(gap * 0.8)}px">
      <div style="flex-shrink:0;width:${fontSize + 12}px;height:${fontSize + 12}px;background:${CORAL};display:flex;align-items:center;justify-content:center;margin-top:4px">
        <span style="font-size:${Math.round(fontSize * 0.7)}px;font-weight:900;color:${CREAM}">${String(i + 1).padStart(2, "0")}</span>
      </div>
      <div style="font-size:${fontSize}px;font-weight:700;color:${CHARCOAL};line-height:1.2">${esc(item)}</div>
    </div>`;

  if (size === "landscape") {
    // Two-column layout for landscape
    const half = Math.ceil(c.items.length / 2);
    const col1 = c.items.slice(0, half);
    const col2 = c.items.slice(half);
    const col = (items: string[], start: number) =>
      items.map((item, i) => itemHtml(item, start + i, 32, 20)).join("");

    return `<div style="width:${w}px;height:${h}px;background:${CREAM};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- CHARCOAL header block (top, full width) -->
  <div style="position:absolute;top:0;left:0;right:0;height:130px;background:${CHARCOAL}">
    <!-- CORAL accent block inside header -->
    <div style="position:absolute;top:0;right:0;width:130px;height:130px;background:${CORAL}"></div>
    <div style="position:absolute;top:0;left:0;width:920px;height:130px;display:flex;align-items:center;padding:0 80px">
      <div style="font-size:44px;font-weight:900;color:${CREAM};line-height:1.1">${esc(c.title)}</div>
    </div>
  </div>
  <!-- Left column of items -->
  <div style="position:absolute;top:162px;left:80px;right:${w / 2 + 20}px">
    ${col(col1, 0)}
  </div>
  <!-- Right column of items -->
  <div style="position:absolute;top:162px;left:${w / 2 + 20}px;right:80px">
    ${col(col2, col1.length)}
  </div>
  <!-- SAGE geometric accent bottom-right -->
  <div style="position:absolute;bottom:80px;right:0;width:180px;height:100px;background:${SAGE};opacity:0.4"></div>
  ${footerBar(80)}
</div>`;
  }

  if (size === "square") {
    const items = c.items.map((item, i) => itemHtml(item, i, 38, 24)).join("");
    return `<div style="width:${w}px;height:${h}px;background:${CHARCOAL};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- CORAL header top -->
  <div style="position:absolute;top:0;left:0;right:0;height:180px;background:${CORAL};display:flex;align-items:center;padding:0 80px">
    <div style="font-size:50px;font-weight:900;color:${CREAM};line-height:1.1;max-width:860px">${esc(c.title)}</div>
  </div>
  <!-- CREAM card for items, with CHARCOAL offset shadow -->
  <div style="position:absolute;top:220px;left:96px;right:64px;bottom:120px;background:${CHARCOAL};border:3px solid ${CORAL}"></div>
  <div style="position:absolute;top:204px;left:80px;right:80px;bottom:136px;background:${CREAM};border:3px solid ${CHARCOAL}">
    <div style="padding:40px 48px">
      ${items}
    </div>
  </div>
  <!-- SAGE accent -->
  <div style="position:absolute;bottom:100px;right:0;width:160px;height:80px;background:${SAGE};opacity:0.3"></div>
  ${footerBar(100)}
</div>`;
  }

  // portrait
  const items = c.items.map((item, i) => itemHtml(item, i, 44, 28)).join("");
  return `<div style="width:${w}px;height:${h}px;background:${CREAM};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- SAGE left strip -->
  <div style="position:absolute;top:0;left:0;width:28px;height:${h}px;background:${SAGE}"></div>
  <!-- CHARCOAL title block top -->
  <div style="position:absolute;top:0;left:28px;right:0;height:220px;background:${CHARCOAL}">
    <!-- CORAL accent block -->
    <div style="position:absolute;top:0;right:0;width:220px;height:220px;background:${CORAL};opacity:0.8"></div>
    <div style="position:absolute;top:0;left:0;right:220px;height:220px;display:flex;align-items:center;padding:0 60px">
      <div style="font-size:54px;font-weight:900;color:${CREAM};line-height:1.1;max-width:760px">${esc(c.title)}</div>
    </div>
  </div>
  <!-- Items list -->
  <div style="position:absolute;top:260px;left:80px;right:80px">
    ${items}
  </div>
  <!-- CORAL accent rule -->
  <div style="position:absolute;bottom:160px;left:80px;width:280px;height:5px;background:${CORAL}"></div>
  <!-- Branding bottom-right -->
  ${brandingBlock(h - 140, 80, 280, false)}
  ${footerBar(100)}
</div>`;
}

// ════════════════════════════════════════════════════════════
// TEMPLATE 5: CTA CARD (hardcoded Antek brand closer)
// ════════════════════════════════════════════════════════════

function ctaTemplate(size: CardSize): string {
  const { w, h } = DIMS[size];

  if (size === "landscape") {
    // Split: CHARCOAL left 55%, CORAL right 45%
    const split = Math.round(w * 0.55);
    return `<div style="width:${w}px;height:${h}px;position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <div style="position:absolute;top:0;left:0;width:${split}px;height:${h}px;background:${CHARCOAL}"></div>
  <div style="position:absolute;top:0;left:${split}px;right:0;height:${h}px;background:${CORAL}"></div>
  <!-- CREAM thin top strip -->
  <div style="position:absolute;top:0;left:0;right:0;height:12px;background:${CREAM}"></div>
  <!-- Headline: left on CHARCOAL -->
  <div style="position:absolute;top:100px;left:80px;width:${split - 120}px">
    <div style="font-size:56px;font-weight:900;color:${CREAM};line-height:1.1;letter-spacing:-1px">Ready to stop<br>missing calls?</div>
  </div>
  <!-- Sub-text -->
  <div style="position:absolute;bottom:160px;left:80px;width:${split - 120}px;font-size:26px;font-weight:600;color:${CREAM};opacity:0.75;line-height:1.35">AI automation for UK<br>service businesses.</div>
  <!-- Right side: big handle + contact -->
  <div style="position:absolute;top:80px;left:${split + 60}px;right:60px">
    <div style="font-size:80px;font-weight:900;color:${CREAM};line-height:1;letter-spacing:-3px">@Antek<br>Automation</div>
  </div>
  <div style="position:absolute;bottom:160px;left:${split + 60}px;right:60px">
    <div style="font-size:28px;font-weight:700;color:${CREAM}">antekautomation.com</div>
    <div style="font-size:24px;font-weight:500;color:${CREAM};opacity:0.85;margin-top:8px">0333 038 9960</div>
  </div>
  ${footerBar(80)}
</div>`;
  }

  if (size === "square") {
    // Matches the CTA template from Shorts — CHARCOAL top, CORAL bottom split
    return `<div style="width:${w}px;height:${h}px;background:${CHARCOAL};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- CREAM thin top strip -->
  <div style="position:absolute;top:0;left:0;right:0;height:16px;background:${CREAM}"></div>
  <!-- CORAL large block bottom half -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:540px;background:${CORAL}"></div>
  <!-- CHARCOAL overlap rect inside coral zone (asymmetric) -->
  <div style="position:absolute;bottom:140px;left:0;width:500px;height:240px;background:${CHARCOAL}"></div>
  <!-- SAGE geometric accent top-right -->
  <div style="position:absolute;top:80px;right:60px;width:220px;height:220px;background:${SAGE};opacity:0.15"></div>
  <!-- "FOLLOW US" label -->
  <div style="position:absolute;top:120px;left:80px;background:${CORAL};padding:14px 32px">
    <div style="font-size:28px;font-weight:900;color:${CREAM};letter-spacing:6px">READY?</div>
  </div>
  <!-- Headline on CHARCOAL -->
  <div style="position:absolute;top:240px;left:80px;right:80px;font-size:72px;font-weight:900;color:${CREAM};line-height:1.1;letter-spacing:-2px">Stop missing calls today.</div>
  <!-- Big handle on CORAL section -->
  <div style="position:absolute;bottom:280px;left:80px;right:60px">
    <div style="font-size:80px;font-weight:900;color:${CREAM};line-height:1;letter-spacing:-3px">@Antek<br>Automation</div>
  </div>
  <!-- URL + phone -->
  <div style="position:absolute;bottom:160px;left:80px">
    <div style="font-size:30px;font-weight:700;color:${CREAM}">antekautomation.com</div>
    <div style="font-size:26px;font-weight:500;color:${CREAM};opacity:0.85;margin-top:8px">0333 038 9960</div>
  </div>
  ${footerBar(100)}
</div>`;
  }

  // portrait — resembles the Shorts CTA slide closely
  return `<div style="width:${w}px;height:${h}px;background:${CHARCOAL};position:relative;font-family:'Inter',system-ui,sans-serif;overflow:hidden">
  <!-- CREAM thin top strip -->
  <div style="position:absolute;top:0;left:0;right:0;height:16px;background:${CREAM}"></div>
  <!-- CORAL large block bottom section -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:820px;background:${CORAL}"></div>
  <!-- CHARCOAL overlap rect inside coral zone -->
  <div style="position:absolute;bottom:200px;left:0;width:500px;height:320px;background:${CHARCOAL}"></div>
  <!-- SAGE accent top-right -->
  <div style="position:absolute;top:80px;right:60px;width:240px;height:240px;background:${SAGE};opacity:0.12"></div>
  <!-- Headline top of card -->
  <div style="position:absolute;top:120px;left:80px;right:80px">
    <div style="font-size:88px;font-weight:900;color:${CREAM};line-height:1.05;letter-spacing:-3px">Ready to stop<br>missing calls?</div>
  </div>
  <!-- "FOLLOW US" label -->
  <div style="position:absolute;top:460px;left:80px;background:${CORAL};padding:14px 32px">
    <div style="font-size:28px;font-weight:900;color:${CREAM};letter-spacing:6px">FOLLOW US</div>
  </div>
  <!-- Big handle on CORAL section -->
  <div style="position:absolute;top:560px;left:80px;right:60px">
    <div style="font-size:110px;font-weight:900;color:${CREAM};line-height:1;letter-spacing:-4px">@Antek<br>Automation</div>
  </div>
  <!-- URL + phone -->
  <div style="position:absolute;bottom:490px;left:80px">
    <div style="font-size:44px;font-weight:700;color:${CREAM}">antekautomation.com</div>
  </div>
  <div style="position:absolute;bottom:430px;left:80px">
    <div style="font-size:36px;font-weight:500;color:${CREAM};opacity:0.85">0333 038 9960</div>
  </div>
  <!-- Bottom bar -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:180px;background:${CHARCOAL};display:flex;align-items:center;padding:0 80px">
    <div style="font-size:28px;font-weight:700;color:${SAGE}">AI Automation for UK Small Business</div>
  </div>
</div>`;
}

// ── Template dispatcher ────────────────────────────────────────

function buildTemplate(content: CardContent, size: CardSize): string {
  switch (content.type) {
    case "stat":      return statTemplate(content, size);
    case "quote":     return quoteTemplate(content, size);
    case "tip":       return tipTemplate(content, size);
    case "listicle":  return listicleTemplate(content, size);
    case "cta":       return ctaTemplate(size);
  }
}

// ── Puppeteer singleton ────────────────────────────────────────

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

async function renderHtml(html: string, width: number, height: number): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(htmlWrap(html), { waitUntil: "networkidle0" });
  const screenshot = await page.screenshot({ type: "png" });
  await page.close();
  return Buffer.from(screenshot);
}

export async function closeBrowser(): Promise<void> {
  if (_browser && _browser.connected) {
    await _browser.close();
    _browser = null;
  }
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Renders a single card and saves it as a PNG.
 *
 * @param content   - Card content (type determines which template is used)
 * @param size      - Output dimensions (landscape | square | portrait)
 * @param slug      - Blog slug used for file naming (e.g. "missed-calls-guide")
 * @param outDir    - Output directory (default: output/cards/)
 * @returns         - Absolute path to the saved PNG
 */
export async function renderCard(
  content: CardContent,
  size: CardSize,
  slug: string,
  outDir?: string
): Promise<string> {
  const { w, h } = DIMS[size];
  const html = buildTemplate(content, size);
  const buffer = await renderHtml(html, w, h);

  const dir = outDir ?? CARDS_OUT_DIR;
  mkdirSync(dir, { recursive: true });

  const filename = `${slug}_${content.type}_${size}.png`;
  const filePath = join(dir, filename);
  writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Renders all combinations of contents × sizes and saves them as PNGs.
 *
 * @param contents  - Array of CardContent objects to render
 * @param sizes     - Array of sizes to render each card at
 * @param slug      - Blog slug used for file naming
 * @param outDir    - Output directory (default: output/cards/)
 * @returns         - Array of CardOutput with type, size, and imagePath
 */
export async function renderAllCards(
  contents: CardContent[],
  sizes: CardSize[],
  slug: string,
  outDir?: string
): Promise<CardOutput[]> {
  const dir = outDir ?? CARDS_OUT_DIR;
  mkdirSync(dir, { recursive: true });

  const outputs: CardOutput[] = [];
  let count = 0;
  const total = contents.length * sizes.length;

  console.log(`\n  Rendering ${total} cards (${contents.length} types × ${sizes.length} sizes)...\n`);

  try {
    for (const content of contents) {
      for (const size of sizes) {
        count++;
        const imagePath = await renderCard(content, size, slug, dir);
        outputs.push({ type: content.type as CardType, size, imagePath, slug });
        console.log(`  [${count}/${total}] ${content.type.padEnd(9)} ${size.padEnd(10)} → ${imagePath.split("/").pop()}`);
      }
    }
  } finally {
    await closeBrowser();
  }

  console.log(`\n  Card rendering complete. Output: ${dir}\n`);
  return outputs;
}
