/**
 * Carousel slide renderer (local, no Blotato).
 *
 * Reads content.json, renders each idea's `carousel_slides` as 1080x1080
 * PNGs in the Antek quote-card brand style (see assets/brand-examples/),
 * uploads each slide to R2, and writes carousel-image-urls.json keyed by
 * idea_id -> [slideUrl, ...].
 *
 * Run: cd files && npx tsx carousel-render.ts [--no-upload]
 *
 * Design: kicker (ANTEK / AUTOMATION) + coral quote mark + ultra-bold
 * two-tone headline + meta footer. Backgrounds alternate dark/light.
 * Palette from brand.ts.
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import puppeteer, { type Browser } from "puppeteer";
import { BRAND } from "./brand.js";
import { uploadToR2 } from "./gbp-image-gen.js";

const NO_UPLOAD = process.argv.includes("--no-upload");
const SIZE = 1080;
const OUT_DIR = join(process.cwd(), "output", "carousels");

interface Idea {
  idea_id: string;
  carousel_slides?: string[];
}

let browser: Browser | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browser;
}

function fontSize(text: string): number {
  const n = text.length;
  if (n <= 36) return 96;
  if (n <= 60) return 78;
  if (n <= 90) return 64;
  if (n <= 120) return 54;
  return 46;
}

// Split a slide into a lead part (primary colour) and an emphasis tail (coral).
function twoTone(text: string): { lead: string; tail: string } {
  const t = text.trim();
  // Prefer a sentence boundary near the end.
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { lead: parts.slice(0, -1).join(" "), tail: parts[parts.length - 1] };
  }
  // No boundary: colour roughly the last third of the words.
  const words = t.split(/\s+/);
  if (words.length >= 4) {
    const cut = Math.ceil(words.length * 0.6);
    return { lead: words.slice(0, cut).join(" "), tail: words.slice(cut).join(" ") };
  }
  return { lead: t, tail: "" };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Build the headline HTML. If the slide uses **markers**, those spans render
// coral and the rest renders fg (hand-tuned). Otherwise fall back to the
// auto lead/tail two-tone split.
function headlineHTML(text: string, fg: string): string {
  if (text.includes("**")) {
    const segs = text.split("**");
    return segs
      .map((seg, i) => (i % 2 === 1
        ? `<span style="color:${BRAND.coral}">${esc(seg)}</span>`
        : `<span style="color:${fg}">${esc(seg)}</span>`))
      .join("");
  }
  const { lead, tail } = twoTone(text);
  return `<span style="color:${fg}">${esc(lead)}</span>${tail ? ` <span style="color:${BRAND.coral}">${esc(tail)}</span>` : ""}`;
}

// Plain text length (markers stripped) for font sizing.
function plain(text: string): string {
  return text.replace(/\*\*/g, "");
}

function slideHTML(text: string, dark: boolean, isAttribution: boolean): string {
  const bg = dark ? BRAND.charcoal : BRAND.cream;
  const fg = dark ? BRAND.cream : BRAND.ink;
  const grid = dark ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.04)";
  const fs = fontSize(plain(text));
  const lh = isAttribution ? "1.0" : "0.98";
  const headline = `<div style="font-family:'Outfit',sans-serif;font-weight:900;font-size:${fs}px;line-height:${lh};letter-spacing:-0.5px;text-transform:uppercase">${headlineHTML(text, fg)}</div>`;

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@800;900&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet">
</head><body style="margin:0">
<div style="width:${SIZE}px;height:${SIZE}px;background:${bg};position:relative;font-family:'DM Sans',system-ui,sans-serif;overflow:hidden;
  background-image:linear-gradient(${grid} 1px,transparent 1px),linear-gradient(90deg,${grid} 1px,transparent 1px);background-size:90px 90px">

  <div style="position:absolute;top:64px;left:80px;font-family:'JetBrains Mono',monospace;font-size:26px;font-weight:700;letter-spacing:6px;color:${BRAND.grey};text-transform:uppercase">ANTEK / AUTOMATION</div>

  <div style="position:absolute;top:150px;left:74px;font-size:150px;font-weight:900;color:${BRAND.coral};line-height:1;font-family:Georgia,serif">&ldquo;</div>

  <div style="position:absolute;left:80px;right:80px;top:300px;bottom:170px;display:flex;flex-direction:column;justify-content:center">
    ${headline}
  </div>

  ${isAttribution
    ? `<div style="position:absolute;bottom:80px;left:80px"><div style="width:70px;height:10px;background:${BRAND.coral};margin-bottom:18px"></div></div>`
    : ""}

  <div style="position:absolute;bottom:64px;right:80px;font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;letter-spacing:3px;color:${dark ? BRAND.cream : BRAND.ink};text-transform:uppercase">BESPOKE AUTOMATION <span style="color:${BRAND.coral}">&bull;</span> SMBs <span style="color:${BRAND.coral}">&bull;</span> ANDOVER</div>
</div>
</body></html>`;
}

async function renderSlide(text: string, dark: boolean, isAttribution: boolean): Promise<Buffer> {
  const b = await getBrowser();
  const page = await b.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.setContent(slideHTML(text, dark, isAttribution), { waitUntil: "networkidle0" });
  const el = await page.$("div");
  const buf = (await (el ?? page).screenshot({ type: "png" })) as Buffer;
  await page.close();
  return buf;
}

async function main() {
  const ideas: Idea[] = JSON.parse(readFileSync(join(process.cwd(), "content.json"), "utf-8"));
  // Slides live in a standalone file (CLI generate strips unknown fields from content.json).
  let slideMap: Record<string, string[]> = {};
  try {
    slideMap = JSON.parse(readFileSync(join(process.cwd(), "carousel-slides.json"), "utf-8"));
  } catch {
    console.log("ℹ️  no carousel-slides.json — falling back to content.json carousel_slides");
  }
  const urls: Record<string, string[]> = {};

  for (const idea of ideas) {
    const slides = slideMap[idea.idea_id] ?? idea.carousel_slides ?? [];
    if (!slides.length) continue;
    const dir = join(OUT_DIR, idea.idea_id);
    mkdirSync(dir, { recursive: true });
    urls[idea.idea_id] = [];
    console.log(`\n${idea.idea_id}: ${slides.length} slides`);

    for (let i = 0; i < slides.length; i++) {
      const dark = i % 2 === 0;
      const isAttribution = i === slides.length - 1;
      const buf = await renderSlide(slides[i], dark, isAttribution);
      const file = join(dir, `slide_${String(i + 1).padStart(2, "0")}.png`);
      writeFileSync(file, buf);
      let url = file;
      if (!NO_UPLOAD) {
        try {
          url = await uploadToR2(buf, `carousels/${idea.idea_id}_${String(i + 1).padStart(2, "0")}.png`);
        } catch (e) {
          console.log(`  ⚠️  upload failed (slide ${i + 1}): ${(e as Error).message} — keeping local path`);
        }
      }
      urls[idea.idea_id].push(url);
      console.log(`  ✅ slide ${i + 1} ${dark ? "dark" : "light"}${isAttribution ? " [attribution]" : ""}`);
    }
  }

  writeFileSync(join(process.cwd(), "carousel-image-urls.json"), JSON.stringify(urls, null, 2));
  console.log(`\n✅ ${Object.keys(urls).length} carousels rendered → carousel-image-urls.json`);
  if (browser) await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
