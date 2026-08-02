/**
 * Bold brand card — neo-brutalist, matches the reference pricing card.
 * Charcoal + faint grid, top kicker bar, edge-to-edge two-tone Anton headline,
 * bottom meta band, coral footer strip. 1080x1080.
 */
import puppeteer, { type Browser } from "puppeteer";

const CORAL = "#C8502E";   // reference uses a slightly muted coral on the headline
const CORAL_HI = "#FF5C3A"; // bright coral accents
const CREAM = "#EDE6D6";
const CHARCOAL = "#2B2B2B";
const CHARCOAL_D = "#222222";
const GREY = "#97958F";

export interface BoldCard {
  kickerRight: string;        // top-right coral label
  lines: Array<{ t: string; coral?: boolean }>; // headline lines, edge-to-edge
  headlineSize?: number;      // px, default 150
  bandLeft: string;           // big coral label bottom-left band
  metaLine1: string;          // grey meta row 1
  metaLine2: string;          // grey meta row 2
  footerLeft: string;         // coral footer strip, charcoal text
  footerRight: string;        // domain etc.
}

export function boldCardHtml(c: BoldCard): string {
  const hs = c.headlineSize ?? 150;
  const lines = c.lines
    .map(
      (l) =>
        `<div style="color:${l.coral ? CORAL : CREAM};font-size:${hs}px;line-height:0.9;letter-spacing:1px">${l.t}</div>`
    )
    .join("");
  return `<div style="width:1080px;height:1080px;background:${CHARCOAL};position:relative;font-family:'DM Sans',system-ui,sans-serif;overflow:hidden">
  <!-- faint grid -->
  <div style="position:absolute;inset:0;background-image:repeating-linear-gradient(0deg,transparent 0 59px,rgba(255,255,255,0.035) 59px 60px),repeating-linear-gradient(90deg,transparent 0 59px,rgba(255,255,255,0.035) 59px 60px)"></div>

  <!-- top kicker bar -->
  <div style="position:absolute;top:0;left:0;right:0;height:78px;display:flex;align-items:center;justify-content:space-between;padding:0 44px;border-bottom:1px solid rgba(255,255,255,0.12)">
    <div style="color:${GREY};font-family:'JetBrains Mono',monospace;font-size:21px;font-weight:700;letter-spacing:3px">ANTEK <span style="color:${GREY};opacity:0.5">/</span> AUTOMATION</div>
    <div style="color:${CORAL_HI};font-family:'JetBrains Mono',monospace;font-size:21px;font-weight:700;letter-spacing:3px">${c.kickerRight}</div>
  </div>

  <!-- headline -->
  <div style="position:absolute;top:78px;left:0;right:0;bottom:250px;display:flex;flex-direction:column;justify-content:center;padding:0 44px;font-family:'Outfit',sans-serif;font-weight:900;text-transform:uppercase">
    ${lines}
  </div>

  <!-- bottom meta band (brand strip, no price) -->
  <div style="position:absolute;left:0;right:0;bottom:72px;height:178px;background:${CHARCOAL_D};display:flex;align-items:center;padding:0 44px;gap:30px">
    <div style="width:18px;height:104px;background:${CORAL_HI}"></div>
    <div>
      <div style="color:${CREAM};font-family:'JetBrains Mono',monospace;font-size:27px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${c.metaLine1}</div>
      <div style="color:${GREY};font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-top:12px">${c.metaLine2}</div>
    </div>
  </div>

  <!-- coral footer strip -->
  <div style="position:absolute;left:0;right:0;bottom:0;height:72px;background:${CORAL_HI};display:flex;align-items:center;justify-content:space-between;padding:0 44px">
    <div style="color:${CHARCOAL};font-family:'JetBrains Mono',monospace;font-size:21px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${c.footerLeft}</div>
    <div style="color:${CHARCOAL};font-family:'JetBrains Mono',monospace;font-size:21px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${c.footerRight}</div>
  </div>
</div>`;
}

const WRAP = (body: string) => `<!DOCTYPE html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@800;900&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}</style></head><body>${body}</body></html>`;

let _b: Browser | null = null;
export async function renderBold(c: BoldCard): Promise<Buffer> {
  if (!_b || !_b.connected) _b = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await _b.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 });
  await page.setContent(WRAP(boldCardHtml(c)), { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 300)); // let Anton paint
  const buf = Buffer.from(await page.screenshot({ type: "png" }));
  await page.close();
  return buf;
}
export async function closeBold(): Promise<void> {
  if (_b && _b.connected) { await _b.close(); _b = null; }
}
