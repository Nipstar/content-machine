/**
 * Blotato poster CLI — schedules posts from a manifest via the direct REST API
 * (no MCP). Replaces the "Claude Code posts via Blotato MCP" step.
 *
 * Usage:
 *   tsx blotato-post-cli.ts --dry-run                 # print what would post, no API calls
 *   tsx blotato-post-cli.ts                           # schedule everything in the manifest
 *   tsx blotato-post-cli.ts --file my-manifest.json   # use a different manifest
 *   tsx blotato-post-cli.ts --limit 3                 # only the first 3 entries
 *   tsx blotato-post-cli.ts --check                   # just print credits + user, exit
 *
 * Manifest format (array):
 *   [{ idea, platform, params: { accountId, platform, text, mediaUrls, scheduledTime, pageId? ... } }]
 *
 * SAFETY: every entry MUST carry a future `scheduledTime`. Entries without one,
 * or with a past time, are SKIPPED (never published immediately) unless you pass
 * --allow-now, which is intentionally verbose to avoid accidents.
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { createPost, getCredits, getUser, type FlatPost } from "./blotato-api.js";

interface ManifestEntry {
  idea?: string;
  platform: string;
  params: FlatPost;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const dryRun = flag("dry-run");
  const allowNow = flag("allow-now");
  const check = flag("check");
  const file = arg("file") || "blotato-schedule-manifest.json";
  const limit = arg("limit") ? parseInt(arg("limit")!, 10) : Infinity;

  // Credit / auth check
  const [user, credits] = await Promise.all([getUser(), getCredits()]);
  console.log(`👤 ${credits.accountEmail} — ${credits.creditsRemaining} credits — sub: ${user.subscriptionStatus}`);
  if (check) return;

  const manifest: ManifestEntry[] = JSON.parse(readFileSync(file, "utf-8"));
  const now = Date.now();

  const queue: ManifestEntry[] = [];
  const skipped: string[] = [];

  for (const e of manifest) {
    const p = e.params;
    const label = `${e.idea ?? "?"}:${e.platform}`;
    const t = p.scheduledTime ? Date.parse(p.scheduledTime) : NaN;

    if (!p.scheduledTime && !allowNow) {
      skipped.push(`${label} — no scheduledTime (use --allow-now to publish immediately)`);
      continue;
    }
    if (p.scheduledTime && t <= now && !allowNow) {
      skipped.push(`${label} — scheduledTime in the past (${p.scheduledTime})`);
      continue;
    }
    queue.push(e);
  }

  console.log(`\n📋 ${queue.length} to schedule, ${skipped.length} skipped (of ${manifest.length})`);
  if (skipped.length) skipped.forEach((s) => console.log(`  ⏭️  ${s}`));

  const toRun = queue.slice(0, limit);
  console.log(`\n${dryRun ? "🧪 DRY RUN — " : ""}processing ${toRun.length} entries...\n`);

  let ok = 0;
  const fails: string[] = [];

  // POST /posts is rate-limited to 30 req/min → space calls ~2.1s apart.
  const THROTTLE_MS = 2100;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < toRun.length; i++) {
    const e = toRun[i];
    const label = `${e.idea ?? "?"}:${e.platform}`;
    const when = e.params.scheduledTime ?? "NOW";
    if (dryRun) {
      console.log(`  🧪 ${label} @ ${when} — ${(e.params.text || "").slice(0, 60).replace(/\n/g, " ")}...`);
      continue;
    }
    try {
      const r = await createPost(e.params);
      console.log(`  ✅ ${label} @ ${when} — ${r.postSubmissionId}`);
      ok++;
    } catch (err: any) {
      console.log(`  ❌ ${label} — ${err.message}`);
      fails.push(label);
    }
    if (i < toRun.length - 1) await sleep(THROTTLE_MS);
  }

  if (!dryRun) {
    console.log(`\n━━━ done: ${ok} scheduled, ${fails.length} failed ━━━`);
    if (fails.length) {
      console.log("failed:", fails.join(", "));
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
