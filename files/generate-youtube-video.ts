/**
 * YouTube Video Script Generator — ~2-minute landscape format
 *
 * Does NOT call the Claude API. The /personal slash command handles generation.
 * This module provides:
 *   buildYTVideoPrompt()   → extraction prompt for Claude Code
 *   parseYTVideoScript()   → validates Claude-generated JSON
 */

import type { YTVideoScript, YTSlide, YTSlideType } from "./youtube-video-types.js";

// Hardcoded CTA voiceover (never generated)
export const YT_CTA_VOICEOVER =
  "If you found this useful, please subscribe and hit the notification bell. Visit antek automation dot com for more guides like this, or call oh three three three, oh three eight, nine nine six oh.";

export const EXPECTED_SLIDE_TYPES: YTSlideType[] = [
  "intro",
  "context",
  "point", "point", "point", "point", "point",
  "takeaway",
  "cta",
];

export function buildYTVideoPrompt(title: string, content: string): string {
  return `You are generating a ~2-minute YouTube video script from a blog post. Output a single valid JSON object matching the YTVideoScript type. No markdown, no fences — just the JSON.

## Blog post
Title: ${title}

${content}

## Instructions

Create a 9-slide script for a ~2-minute educational YouTube video. This is NOT a Short — it's a full talking-head style video with on-screen text slides at 1920×1080. Viewers have chosen to watch, so go deeper than a Short.

### Slides (exact order)

1. **intro** — The episode title / hook. What will the viewer learn? Bold promise. Max 15 words. This IS the thumbnail text — make it benefit-led, not clickbait.

2. **context** — The problem or situation this post addresses. Two punchy sentences max, shown as one block. Max 25 words. This is the "if this is you..." moment.

3. **point** (pointNumber: 1) — First practical tip or insight from the post. Max 20 words. Start with a verb. Specific data or tool names preferred.

4. **point** (pointNumber: 2) — Second tip. Different angle from point 1. Max 20 words.

5. **point** (pointNumber: 3) — Third tip. Most actionable of all. Max 20 words.

6. **point** (pointNumber: 4) — Fourth tip. Could be a common mistake to avoid or a nuance. Max 20 words.

7. **point** (pointNumber: 5) — Fifth tip. The "bonus" insight — something they might not find elsewhere. Max 20 words.

8. **takeaway** — One definitive conclusion. What should the viewer do TODAY based on this video? Max 20 words.

9. **cta** — Leave text as empty string "". Set voiceover_text to exactly: "${YT_CTA_VOICEOVER}"

### voiceover_text rules

Each slide's voiceover_text is what Andy says while the slide is on screen. Target ~2 minutes total across all slides:

- intro: ~20 seconds spoken ("Today I want to talk about...")
- context: ~25 seconds ("Here's a situation I see all the time...")
- each point: ~14 seconds ("The first thing I'd recommend is...")
- takeaway: ~20 seconds ("So here's what I want you to take away...")
- cta: ~15 seconds (hardcoded — use exact text above)

Voiceover style:
- British English (colour, organise, whilst, practise)
- First person, from Andy's perspective — 30 years in service businesses
- Conversational, not scripted-sounding
- Numbers as words ("sixty-two percent", "three missed calls a week")
- Never: "game-changing", "revolutionary", "leverage", "synergy"
- Include specific data/numbers from the blog post where possible

### YouTube metadata

- **youtubeTitle**: 60-80 chars. Benefit-led. Keyword-first. NOT clickbait. No "You WON'T believe..."
- **youtubeDescription**: 300-500 chars. First line = hook sentence. Include 2-3 keywords naturally. End with "Full article: [blog URL]"
- **youtubeTags**: 8-12 tags. NO #Shorts. Include: #UKSmallBusiness, #AIAutomation, plus topic-specific tags.

### Output format

{
  "slides": [
    { "type": "intro",    "text": "...", "voiceover_text": "Today I want to talk about..." },
    { "type": "context",  "text": "...", "voiceover_text": "Here's what I see all the time..." },
    { "type": "point",    "text": "...", "pointNumber": 1, "voiceover_text": "The first thing I'd recommend is..." },
    { "type": "point",    "text": "...", "pointNumber": 2, "voiceover_text": "..." },
    { "type": "point",    "text": "...", "pointNumber": 3, "voiceover_text": "..." },
    { "type": "point",    "text": "...", "pointNumber": 4, "voiceover_text": "..." },
    { "type": "point",    "text": "...", "pointNumber": 5, "voiceover_text": "..." },
    { "type": "takeaway", "text": "...", "voiceover_text": "So here's what I want you to take away..." },
    { "type": "cta",      "text": "",   "voiceover_text": "${YT_CTA_VOICEOVER}" }
  ],
  "sourceBlogUrl": "...",
  "sourceBlogTitle": "...",
  "youtubeTitle": "...",
  "youtubeDescription": "...",
  "youtubeTags": ["#UKSmallBusiness", "#AIAutomation", "..."]
}`;
}

export function parseYTVideoScript(jsonStr: string): YTVideoScript {
  let raw: unknown;
  try { raw = JSON.parse(jsonStr); }
  catch (e: unknown) { throw new Error(`YTVideoScript JSON parse error: ${e instanceof Error ? e.message : e}`); }

  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.slides)) throw new Error("YTVideoScript: 'slides' must be an array");
  if (obj.slides.length !== 9) throw new Error(`YTVideoScript: expected 9 slides, got ${obj.slides.length}`);

  for (let i = 0; i < obj.slides.length; i++) {
    const s = obj.slides[i] as Record<string, unknown>;
    if (typeof s.text !== "string")           throw new Error(`YTVideoScript: slide[${i}].text must be string`);
    if (typeof s.voiceover_text !== "string") throw new Error(`YTVideoScript: slide[${i}].voiceover_text must be string`);
    if (s.type !== EXPECTED_SLIDE_TYPES[i])   throw new Error(`YTVideoScript: slide[${i}].type expected "${EXPECTED_SLIDE_TYPES[i]}", got "${s.type}"`);
    if (s.type === "point" && typeof s.pointNumber !== "number") throw new Error(`YTVideoScript: slide[${i}] type=point missing pointNumber`);
  }

  if (typeof obj.youtubeTitle !== "string")       throw new Error("YTVideoScript: youtubeTitle must be string");
  if (obj.youtubeTitle.length > 100)              throw new Error(`YTVideoScript: youtubeTitle too long (${obj.youtubeTitle.length} chars)`);
  if (typeof obj.youtubeDescription !== "string") throw new Error("YTVideoScript: youtubeDescription must be string");
  if (!Array.isArray(obj.youtubeTags))            throw new Error("YTVideoScript: youtubeTags must be array");
  if (typeof obj.sourceBlogUrl !== "string" || typeof obj.sourceBlogTitle !== "string")
    throw new Error("YTVideoScript: sourceBlogUrl and sourceBlogTitle required");

  // Always enforce hardcoded CTA voiceover
  const slides = obj.slides as YTSlide[];
  slides[8].voiceover_text = YT_CTA_VOICEOVER;

  return {
    slides,
    sourceBlogUrl: obj.sourceBlogUrl as string,
    sourceBlogTitle: obj.sourceBlogTitle as string,
    youtubeTitle: obj.youtubeTitle as string,
    youtubeDescription: obj.youtubeDescription as string,
    youtubeTags: obj.youtubeTags as string[],
  };
}
