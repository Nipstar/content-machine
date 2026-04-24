/**
 * Personal content pipeline CLI.
 *
 * Reads personal-content.json (written by Claude Code via /personal command),
 * applies scheduling, writes enriched JSON, opens HTML preview.
 *
 * Usage (from files/):
 *   npm run personal                    # schedule + preview
 *   npm run personal -- --preview-only  # preview without re-scheduling
 *   npm run personal -- --start 2026-05-01
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseArgs } from 'util';
import { exec } from 'child_process';
import type { PersonalContentIdea, ContentFormat } from './personal-types.js';

const FORMAT_ROTATION: ContentFormat[] = ['text', 'reel', 'carousel', 'youtube_video'];
const FORMAT_LABELS: Record<ContentFormat, string> = {
  text:          '📝 Text Post',
  reel:          '🎬 Reel',
  carousel:      '🖼️  Carousel',
  youtube_video: '📺 YouTube Video',
};

const PERSONAL_FILE = join(process.cwd(), 'personal-content.json');
const PREVIEW_FILE  = join(process.cwd(), 'personal-preview.html');

// ── Args ───────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    start:          { type: 'string' },
    'preview-only': { type: 'boolean', default: false },
  },
  strict: false,
});

// ── Scheduling ─────────────────────────────────────────────────────────────

function buildSchedule(count: number, startDate?: string) {
  const slots: { iso: string; display: string }[] = [];
  const base = startDate ? new Date(startDate + 'T00:00:00') : new Date();
  if (!startDate) base.setDate(base.getDate() + 1);
  base.setHours(0, 0, 0, 0);

  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    d.setHours(8, 0, 0, 0);
    const display =
      d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' }) +
      ' at 8:00';
    slots.push({ iso: d.toISOString(), display });
  }
  return slots;
}

// ── Load + enrich ──────────────────────────────────────────────────────────

function loadAndSchedule(): PersonalContentIdea[] {
  if (!existsSync(PERSONAL_FILE)) {
    console.error('\n❌  personal-content.json not found.');
    console.error('    Run /personal in Claude Code to generate content first.\n');
    process.exit(1);
  }

  const raw: PersonalContentIdea[] = JSON.parse(readFileSync(PERSONAL_FILE, 'utf-8'));
  if (!Array.isArray(raw)) throw new Error('personal-content.json must be a JSON array');

  const slots = buildSchedule(raw.length, args.start as string | undefined);
  const platforms = ['personal_linkedin', 'twitter', 'facebook', 'instagram'] as const;

  return raw.map((idea, i) => {
    const slot = slots[i] ?? slots[slots.length - 1];
    // Assign format from 4-day rotation (text/reel/carousel/youtube_video)
    idea.content_format = idea.content_format ?? FORMAT_ROTATION[i % 4];
    idea.scheduled_at = slot.iso;
    idea.scheduled_display = slot.display;
    for (const p of platforms) {
      if (idea.variants?.[p]) {
        idea.variants[p].scheduled_at = slot.iso;
        idea.variants[p].scheduled_display = slot.display;
      }
    }
    return idea;
  });
}

// ── HTML Preview ───────────────────────────────────────────────────────────

const PLATFORM_LIMITS: Record<string, number> = {
  personal_linkedin: 1300,
  twitter: 280,
  facebook: 500,
  instagram: 2200,
};

const PLATFORM_LABELS: Record<string, string> = {
  personal_linkedin: '👤 LinkedIn (Personal)',
  twitter: '𝕏 Twitter / X',
  facebook: '📘 Facebook',
  instagram: '📷 Instagram',
};

function charColour(len: number, limit: number): string {
  const pct = len / limit;
  if (pct > 1) return '#e53e3e';
  if (pct > 0.9) return '#dd6b20';
  return '#38a169';
}

function buildPreview(ideas: PersonalContentIdea[]): string {
  const platforms = ['personal_linkedin', 'twitter', 'facebook', 'instagram'] as const;

  const tabs = platforms
    .map((p, i) => `<button class="tab${i === 0 ? ' active' : ''}" onclick="showTab('${p}')">${PLATFORM_LABELS[p]}</button>`)
    .join('');

  const panels = platforms.map(p => {
    const limit = PLATFORM_LIMITS[p];
    const cards = ideas.map((idea, i) => {
      const v = idea.variants[p];
      const len = v?.body?.length ?? 0;
      const colour = charColour(len, limit);
      return `
        <div class="card">
          <div class="card-header">
            <strong>${i + 1}. ${idea.topic}</strong>
            <span style="display:flex;gap:8px;align-items:center">
              <span style="font-size:11px;background:#2C2C2C;color:#E8DCC8;padding:3px 8px;font-weight:700">${FORMAT_LABELS[idea.content_format ?? 'text']}</span>
              <span class="scheduled">${v?.scheduled_display ?? ''}</span>
            </span>
          </div>
          <div class="source"><a href="${idea.source_url}" target="_blank">${idea.source_url}</a></div>
          <div class="body">${(v?.body ?? '').replace(/\n/g, '<br>')}</div>
          ${v?.first_comment ? `<div class="comment">💬 ${v.first_comment}</div>` : ''}
          ${v?.hashtags?.length ? `<div class="hashtags">${v.hashtags.join(' ')}</div>` : ''}
          <div class="meta" style="color:${colour}">${len}/${limit} chars</div>
        </div>`;
    }).join('');

    return `<div class="panel" id="panel-${p}" style="display:${p === 'personal_linkedin' ? 'block' : 'none'}">${cards}</div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Personal Content Preview</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #E8DCC8; color: #2C2C2C; }
  h1   { background: #CD5C3C; color: #E8DCC8; margin: 0; padding: 16px 24px; font-size: 20px; }
  .tabs { display: flex; gap: 4px; padding: 12px 24px 0; background: #2C2C2C; }
  .tab  { padding: 8px 16px; border: none; cursor: pointer; font-weight: 700; font-size: 13px;
          background: #444; color: #ccc; border-radius: 4px 4px 0 0; }
  .tab.active { background: #E8DCC8; color: #2C2C2C; }
  .content { padding: 24px; }
  .card { background: white; border: 3px solid #2C2C2C; margin-bottom: 16px; padding: 16px;
          box-shadow: 4px 4px 0 #2C2C2C; }
  .card-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
  .scheduled { font-size: 12px; color: #CD5C3C; font-weight: 700; }
  .source { font-size: 11px; color: #888; margin-bottom: 8px; }
  .body { white-space: pre-wrap; line-height: 1.6; }
  .comment { margin-top: 8px; font-size: 13px; color: #555; background: #f5f5f5; padding: 8px; }
  .hashtags { margin-top: 6px; font-size: 12px; color: #888; }
  .meta { margin-top: 8px; font-size: 12px; font-weight: 700; }
</style>
</head>
<body>
<h1>Personal Content Preview — ${ideas.length} posts</h1>
<div class="tabs">${tabs}</div>
<div class="content">${panels}</div>
<script>
function showTab(id) {
  document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + id).style.display = 'block';
  event.target.classList.add('active');
}
</script>
</body>
</html>`;
}

// ── Main ───────────────────────────────────────────────────────────────────

const ideas = loadAndSchedule();

if (!args['preview-only']) {
  writeFileSync(PERSONAL_FILE, JSON.stringify(ideas, null, 2));
  console.log(`✅  Scheduled ${ideas.length} ideas → personal-content.json`);
}

writeFileSync(PREVIEW_FILE, buildPreview(ideas));
console.log(`🌐  Opening preview...`);

const open = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
exec(`${open} "${PREVIEW_FILE}"`);
