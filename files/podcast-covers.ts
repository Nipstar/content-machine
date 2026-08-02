/**
 * Per-episode podcast cover art (3000x3000) + attach to RSS.com episodes.
 *
 * Renders a branded cover per episode (show name QUICK TIPS + episode title,
 * Antek quote-card style, new palette), then uploads each to RSS.com via
 * presigned image upload and PATCHes the episode's cover_upload_id.
 *
 * Run: cd files && npx tsx podcast-covers.ts [--render-only] [--only idea_0]
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import puppeteer, { type Browser } from "puppeteer";
import { BRAND } from "./brand.js";

const S = 3000;
const OUT = join(process.cwd(), "output", "podcast-covers");
const RSS = "https://api.rss.com";
const PID = process.env.RSS_COM_PODCAST_ID!;
const H = { "X-Api-Key": process.env.RSS_COM_API_KEY!, "Content-Type": "application/json" };
const RENDER_ONLY = process.argv.includes("--render-only");
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

let browser: Browser | null = null;
async function getBrowser() { if (!browser) browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] }); return browser; }
function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function titleSize(t: string) { const n = t.length; if (n <= 26) return 200; if (n <= 40) return 168; if (n <= 55) return 138; return 116; }

function coverHTML(title: string): string {
  const grid = "rgba(255,255,255,0.035)";
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@800;900&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet"></head>
<body style="margin:0"><div style="width:${S}px;height:${S}px;background:${BRAND.charcoal};position:relative;overflow:hidden;font-family:'DM Sans',system-ui,sans-serif;
  background-image:linear-gradient(${grid} 1px,transparent 1px),linear-gradient(90deg,${grid} 1px,transparent 1px);background-size:200px 200px">
  <div style="position:absolute;top:180px;left:200px;font-family:'JetBrains Mono',monospace;font-size:64px;font-weight:700;letter-spacing:18px;color:${BRAND.grey};text-transform:uppercase">ANTEK / AUTOMATION</div>
  <div style="position:absolute;top:320px;left:188px;font-size:380px;font-weight:900;color:${BRAND.coral};line-height:1;font-family:Georgia,serif">&ldquo;</div>
  <div style="position:absolute;top:560px;left:200px;font-family:'Outfit',sans-serif;font-size:150px;font-weight:900;letter-spacing:-2px;color:${BRAND.cream};text-transform:uppercase;line-height:0.95">QUICK <span style="color:${BRAND.coral}">TIPS</span></div>
  <div style="position:absolute;left:200px;right:200px;top:980px;font-family:'Outfit',sans-serif;font-weight:900;font-size:${titleSize(title)}px;line-height:1.02;letter-spacing:-1px;color:${BRAND.cream};text-transform:uppercase">${esc(title)}</div>
  <div style="position:absolute;bottom:230px;left:200px;width:180px;height:24px;background:${BRAND.coral}"></div>
  <div style="position:absolute;bottom:150px;left:200px;font-family:'JetBrains Mono',monospace;font-size:58px;font-weight:700;letter-spacing:10px;color:${BRAND.cream};text-transform:uppercase">ANDY NORMAN</div>
  <div style="position:absolute;bottom:150px;right:200px;font-family:'JetBrains Mono',monospace;font-size:48px;font-weight:700;letter-spacing:6px;color:${BRAND.grey};text-transform:uppercase">ANTEKAUTOMATION.COM</div>
</div></body></html>`;
}

async function render(title: string, out: string) {
  const b = await getBrowser();
  const page = await b.newPage();
  await page.setViewport({ width: S, height: S, deviceScaleFactor: 1 });
  await page.setContent(coverHTML(title), { waitUntil: "networkidle0" });
  const el = await page.$("div");
  await (el ?? page).screenshot({ type: "png", path: out });
  await page.close();
}

async function uploadCover(localPath: string, filename: string): Promise<string> {
  const pre = await fetch(`${RSS}/v4/podcasts/${PID}/assets/presigned-uploads`, {
    method: "POST", headers: H, body: JSON.stringify({ asset_type: "image", expected_mime: "image/png", filename }),
  });
  if (!pre.ok) throw new Error(`presigned ${pre.status}: ${(await pre.text()).slice(0, 160)}`);
  const pj = await pre.json() as { id: string; url: string };
  const put = await fetch(pj.url, { method: "PUT", headers: { "Content-Type": "image/png" }, body: new Uint8Array(readFileSync(localPath)) });
  if (!put.ok) throw new Error(`put ${put.status}`);
  return pj.id;
}

async function patchCover(episodeId: number, coverUploadId: string) {
  const r = await fetch(`${RSS}/v4/podcasts/${PID}/episodes/${episodeId}`, {
    method: "PATCH", headers: H, body: JSON.stringify({ cover_upload_id: coverUploadId }),
  });
  if (!r.ok) throw new Error(`patch ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function main() {
  const eps: { idea_id: string; episode_slug: string; episode_title: string }[] =
    JSON.parse(readFileSync(join(process.cwd(), "podcast-narration.json"), "utf-8")).episodes;
  const results: Record<string, { rsscom?: { episode_id?: number } }> =
    JSON.parse(readFileSync(join(process.cwd(), "podcast-results.json"), "utf-8"));
  mkdirSync(OUT, { recursive: true });

  for (const ep of eps) {
    if (ONLY && ep.idea_id !== ONLY) continue;
    const out = join(OUT, `${ep.episode_slug}.png`);
    await render(ep.episode_title, out);
    if (RENDER_ONLY) { console.log(`  rendered ${ep.episode_slug}`); continue; }
    const episodeId = results[ep.idea_id]?.rsscom?.episode_id;
    if (!episodeId) { console.log(`  ⚠️ ${ep.idea_id}: no episode_id`); continue; }
    const uploadId = await uploadCover(out, `${ep.episode_slug}-cover.png`);
    await patchCover(episodeId, uploadId);
    console.log(`  ✅ ${ep.idea_id} (episode ${episodeId}) cover attached`);
  }
  if (browser) await browser.close();
  console.log(`\n✅ covers done`);
}

main().catch((e) => { console.error(e); process.exit(1); });
