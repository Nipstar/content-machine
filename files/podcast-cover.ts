/**
 * Podcast Episode Cover Art Generator
 *
 * Renders a 3000×3000 PNG per episode via Puppeteer — the same neo-brutalist
 * brand as Shorts frames, GBP images, and social cards.
 *
 * The episode title is overlaid on a branded background. If Puppeteer is not
 * available, falls back to the default cover at images/Podcast (3000 x 3000 px).png.
 *
 * Output: output/podcast/covers/[slug]-cover.png
 *
 * RSS.com recommendation: square, 3000×3000px, JPG or PNG, under 5MB.
 */

import puppeteer from "puppeteer";
import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { BRAND } from "./brand.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Brand colours (canonical source: brand.ts)
const CORAL = BRAND.coral;
const CREAM = BRAND.cream;
const SAGE = BRAND.grey;
const CHARCOAL = BRAND.charcoal;

/** Path to the default cover art (used when Puppeteer fails or as base layer) */
export const DEFAULT_COVER_PATH = join(
  __dirname, "..", "images", "Podcast (3000 x 3000 px).png"
);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildCoverHtml(episodeTitle: string, _episodeNumber?: number): string {
  // Dark minimalist "QUICK TIPS" layout (Andy's preferred style):
  // charcoal card, coral quote mark, QUICK (cream) TIPS (coral), title in cream,
  // ANDY NORMAN + coral dash bottom-left, antekautomation.com bottom-right.
  const title =
    episodeTitle.length > 70 ? episodeTitle.slice(0, 67) + "..." : episodeTitle;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@800;900&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 3000px; height: 3000px; overflow: hidden;
    background: #171614;
    font-family: 'DM Sans', sans-serif;
  }
  .card {
    position: absolute; inset: 60px;
    background: ${CHARCOAL};
    border-radius: 72px;
    padding: 220px 200px;
    display: flex;
    flex-direction: column;
  }
  .kicker {
    font-family: 'JetBrains Mono', monospace;
    font-size: 60px; font-weight: 700;
    color: ${SAGE};
    letter-spacing: 0.30em;
    text-transform: uppercase;
  }
  .quote {
    color: ${CORAL};
    font-family: 'Outfit', sans-serif;
    font-size: 300px; font-weight: 900;
    line-height: 0.7;
    margin-top: 90px; margin-bottom: 10px;
    height: 150px;
  }
  .qt {
    font-family: 'Outfit', sans-serif;
    font-size: 176px; font-weight: 900;
    letter-spacing: -0.01em;
    text-transform: uppercase;
    color: ${CREAM};
  }
  .qt .tips { color: ${CORAL}; }
  .title {
    font-family: 'Outfit', sans-serif;
    margin-top: 150px;
    font-size: 150px; font-weight: 900;
    line-height: 1.04;
    letter-spacing: -0.005em;
    text-transform: uppercase;
    color: ${CREAM};
    max-width: 2200px;
  }
  .spacer { flex: 1; }
  .footer {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
  }
  .sig-dash {
    width: 120px; height: 14px;
    background: ${CORAL};
    margin-bottom: 34px;
  }
  .sig-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 54px; font-weight: 700;
    color: ${CREAM};
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .site {
    font-family: 'JetBrains Mono', monospace;
    font-size: 48px; font-weight: 700;
    color: ${SAGE};
    letter-spacing: 0.10em;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="kicker">Antek&nbsp;&nbsp;/&nbsp;&nbsp;Automation</div>
    <div class="quote">&ldquo;</div>
    <div class="qt">Quick <span class="tips">Tips</span></div>
    <div class="title">${escapeHtml(title)}</div>
    <div class="spacer"></div>
    <div class="footer">
      <div>
        <div class="sig-dash"></div>
        <div class="sig-name">Andy Norman</div>
      </div>
      <div class="site">antekautomation.com</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Renders a 3000×3000 episode cover art PNG via Puppeteer.
 *
 * @param episodeTitle  - Episode title to display on the cover
 * @param slug          - URL-safe slug for the output filename
 * @param episodeNumber - Optional episode number for the label
 * @returns             - Absolute path to the generated PNG, or the default cover path
 */
export async function renderCoverArt(
  episodeTitle: string,
  slug: string,
  episodeNumber?: number
): Promise<string> {
  const outDir = join(process.cwd(), "output", "podcast", "covers");
  mkdirSync(outDir, { recursive: true });
  const outputPath = join(outDir, `${slug}-cover.png`);

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 3000, height: 3000, deviceScaleFactor: 1 });
      const html = buildCoverHtml(episodeTitle, episodeNumber);
      await page.setContent(html, { waitUntil: "networkidle0" });
      // Wait for Inter font
      await page.waitForFunction(
        () => document.fonts?.ready !== undefined ? document.fonts.ready.then(() => true) : true
      ).catch(() => {});
      await new Promise((r) => setTimeout(r, 800));
      await page.screenshot({ path: outputPath as `${string}.png`, type: "png" });
    } finally {
      await browser.close();
    }
    console.log(`  [podcast-cover] ✅ cover art rendered → ${outputPath}`);
    return outputPath;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  [podcast-cover] Puppeteer failed (${msg}), using default cover`);
    if (existsSync(DEFAULT_COVER_PATH)) return DEFAULT_COVER_PATH;
    throw new Error("No cover art available — Puppeteer failed and default cover not found");
  }
}
