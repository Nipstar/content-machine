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

const __dirname = dirname(fileURLToPath(import.meta.url));

// Brand colours
const CORAL = "#CD5C3C";
const CREAM = "#E8DCC8";
const SAGE = "#C8D8D0";
const CHARCOAL = "#2C2C2C";

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

function buildCoverHtml(episodeTitle: string, episodeNumber?: number): string {
  const epLabel = episodeNumber ? `EPISODE ${episodeNumber}` : "NEW EPISODE";
  // Truncate title for display
  const title =
    episodeTitle.length > 60
      ? episodeTitle.slice(0, 57) + "..."
      : episodeTitle;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 3000px; height: 3000px; overflow: hidden;
    background: ${CREAM};
    font-family: 'Inter', sans-serif;
    position: relative;
  }

  /* Coral left column */
  .col-left {
    position: absolute;
    left: 0; top: 0;
    width: 1200px; height: 3000px;
    background: ${CORAL};
    border-right: 8px solid ${CHARCOAL};
  }

  /* Brand name */
  .brand {
    position: absolute;
    top: 160px; left: 120px;
    font-size: 72px; font-weight: 900;
    color: ${CREAM};
    letter-spacing: 0.1em;
    text-transform: uppercase;
    line-height: 1.2;
  }

  /* Series label */
  .series {
    position: absolute;
    top: 420px; left: 120px;
    background: ${CHARCOAL};
    padding: 20px 40px;
    font-size: 48px; font-weight: 700;
    color: ${CREAM};
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  /* Large decorative "A" */
  .deco-a {
    position: absolute;
    bottom: 200px; left: 100px;
    font-size: 800px; font-weight: 900;
    color: rgba(232,220,200,0.15);
    line-height: 1;
  }

  /* Episode label */
  .ep-label {
    position: absolute;
    top: 160px; left: 1360px;
    font-size: 40px; font-weight: 700;
    color: ${CORAL};
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  /* Episode title */
  .ep-title {
    position: absolute;
    top: 320px; left: 1360px; right: 160px;
    font-size: 120px; font-weight: 900;
    color: ${CHARCOAL};
    line-height: 1.1;
    letter-spacing: -0.01em;
    border-left: 16px solid ${CORAL};
    padding-left: 48px;
  }

  /* Sage accent block */
  .sage-block {
    position: absolute;
    top: 0; right: 0;
    width: 400px; height: 400px;
    background: ${SAGE};
    border-left: 8px solid ${CHARCOAL};
    border-bottom: 8px solid ${CHARCOAL};
  }

  /* Bottom bar */
  .bottom-bar {
    position: absolute;
    bottom: 0; left: 1208px; right: 0;
    height: 240px;
    background: ${CHARCOAL};
    border-top: 8px solid ${CHARCOAL};
    display: flex;
    align-items: center;
    padding: 0 120px;
    justify-content: space-between;
  }
  .bottom-url {
    color: ${CREAM};
    font-size: 52px; font-weight: 700;
    letter-spacing: 0.04em;
  }
  .bottom-phone {
    color: ${SAGE};
    font-size: 44px; font-weight: 600;
  }

  /* Waveform bars (decorative) */
  .wave {
    position: absolute;
    bottom: 400px; left: 1360px;
    display: flex;
    gap: 14px;
    align-items: flex-end;
  }
  .wave-bar {
    background: ${CORAL}; opacity: 0.3;
    width: 18px;
  }
</style>
</head>
<body>
  <div class="col-left">
    <div class="brand">Antek<br>Automation</div>
    <div class="series">Quick Tips Podcast</div>
    <div class="deco-a">A</div>
  </div>

  <div class="sage-block"></div>

  <div class="ep-label">${epLabel}</div>
  <div class="ep-title">${escapeHtml(title)}</div>

  <div class="wave">
    ${[40,65,90,55,110,70,95,50,80,100,60,85,45,75,105,55,90,65,80,50,70,95,60,85,45,110,75,90]
      .map(h => `<div class="wave-bar" style="height:${h * 3}px"></div>`).join("")}
  </div>

  <div class="bottom-bar">
    <span class="bottom-url">antekautomation.com</span>
    <span class="bottom-phone">0333 038 9960</span>
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
