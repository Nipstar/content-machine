/**
 * Re-patch batch-2 episode covers with the current podcast-cover.ts style/fonts.
 *
 * Renders a fresh cover per episode (podcast-cover.ts → Outfit/JetBrains Mono,
 * dark minimalist) and PATCHes the RSS.com episode's cover_upload_id. Use after
 * a cover template/font change to bring already-scheduled episodes up to date.
 *
 * Run: cd files && npx tsx podcast-recover-batch2.ts [--only ep_21]
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { renderCoverArt } from "./podcast-cover.js";

const RSS = "https://api.rss.com";
const PID = process.env.RSS_COM_PODCAST_ID!;
const H = { "X-Api-Key": process.env.RSS_COM_API_KEY!, "Content-Type": "application/json" };
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

interface Ep { idea_id: string; episode_slug: string; episode_title: string; }

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
  const eps: Ep[] = JSON.parse(readFileSync(join(process.cwd(), "podcast-narration-batch2.json"), "utf-8")).episodes;
  const results: Record<string, { episodeNumber?: number; rsscom?: { episode_id?: number } }> =
    JSON.parse(readFileSync(join(process.cwd(), "podcast-results-batch2.json"), "utf-8"));

  const failed: string[] = [];
  for (const ep of eps) {
    if (ONLY && ep.idea_id !== ONLY) continue;
    const rec = results[ep.idea_id];
    const episodeId = rec?.rsscom?.episode_id;
    if (!episodeId) { console.log(`  ⏭  ${ep.idea_id}: not scheduled yet — skip`); continue; }
    try {
      const cover = await renderCoverArt(ep.episode_title, ep.episode_slug, rec?.episodeNumber);
      const uploadId = await uploadCover(cover, `${ep.episode_slug}-cover.png`);
      await patchCover(episodeId, uploadId);
      console.log(`  ✅ ${ep.idea_id} (episode ${episodeId}) cover re-patched`);
    } catch (e) {
      failed.push(ep.idea_id);
      console.log(`  ❌ ${ep.idea_id} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n✅ re-patch done${failed.length ? ` (failed: ${failed.join(", ")})` : ""}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
