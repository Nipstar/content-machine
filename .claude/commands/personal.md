# /personal — 28-Day Personal Social Content Calendar

Scans blog sitemap → generates 28 days of mixed-format content across personal LinkedIn, X, Instagram, Facebook, and YouTube.

4-format rotation (repeating):
- **Day 1, 5, 9, 13, 17, 21, 25** → TEXT POST (all platforms)
- **Day 2, 6, 10, 14, 18, 22, 26** → REEL (YouTube Shorts + IG Reels + FB Reels — vertical 9:16)
- **Day 3, 7, 11, 15, 19, 23, 27** → CAROUSEL (personal LinkedIn + Instagram — multi-image)
- **Day 4, 8, 12, 16, 20, 24, 28** → YOUTUBE VIDEO (landscape 16:9, ~2 min — YouTube only)

**Personal LinkedIn posts to Andy's personal profile — NO pageId.**
Same Blotato account (14687) but omit `pageId` for personal feed.

---

## STEP 1 — Parse flags

- `--count N` — total posts (default: 28, must be multiple of 4 for clean rotation)
- `--url <url>` — single post, single format (specify format with --format)
- `--format text|reel|carousel|youtube_video` — force format (single-URL mode only)
- `--start YYYY-MM-DD` — scheduling start date (default: tomorrow)
- `--text-only` — skip all video/reel/carousel; generate text posts only
- `--reels-only` — only generate Reels (uses shorts pipeline)
- `--yt-only` — only generate YouTube landscape videos

---

## STEP 2 — Get blog post URLs from sitemap

Fetch `https://blog.antekautomation.com/sitemap-posts.xml`.
Parse all `<loc>` URLs. Filter out URLs containing `parse-error`.
Sort by `<lastmod>` descending (newest first).
Take the first N URLs (where N = --count, default 28).

Each URL gets ONE format based on its index in the list (0-based):
```
index % 4 === 0 → text
index % 4 === 1 → reel
index % 4 === 2 → carousel
index % 4 === 3 → youtube_video
```

Fetch each blog post's full content with WebFetch. Extract title, body, stats, tips.

---

## STEP 3 — Generate personal-content.json (all 28 posts)

Write `files/personal-content.json` as a JSON array of 28 PersonalContentIdea objects.

**Each idea covers ALL text platform variants regardless of format.**
The format field determines what VIDEO/CAROUSEL content will be produced in later steps.

### Schema:

```json
[
  {
    "idea_id": "personal_0",
    "source_url": "https://blog.antekautomation.com/post-slug/",
    "slug": "post-slug",
    "topic": "One-line topic",
    "hook": "Opening line — scroll-stopping",
    "pillar": "ai_automation",
    "content_category": "tip",
    "content_format": "text",
    "variants": {
      "personal_linkedin": {
        "body": "Personal LinkedIn post (max 1,300 chars) — see personal voice rules below",
        "first_comment": "Full article: https://blog.antekautomation.com/post-slug/",
        "hashtags": ["#AI", "#SmallBusiness"],
        "scheduled_at": "",
        "scheduled_display": ""
      },
      "twitter": { "body": "280-char X post", "scheduled_at": "", "scheduled_display": "" },
      "facebook": { "body": "Personal FB post, warm, ends with question", "scheduled_at": "", "scheduled_display": "" },
      "instagram": {
        "body": "Caption 150-300 chars visible",
        "first_comment": "#AI #SmallBusiness #UKBusiness #AIAutomation",
        "scheduled_at": "",
        "scheduled_display": ""
      }
    }
  }
]
```

Generate all 28 ideas before moving to the next step. Leave `scheduled_at` and `scheduled_display` empty.

---

## PERSONAL CONTENT VOICE RULES

Andy speaks as a PERSON, not "Antek Automation". Personal profile = personal perspective.

**Personal LinkedIn (max 1,300 chars):**
- Open with a personal observation: "I've been thinking about..." / "Something I see constantly..."
- Share the insight or learning, not the service
- Have an opinion — agree or push back on received wisdom
- Specific data from the actual blog post (prices, percentages, tool names)
- Blog link in `first_comment` ONLY (never in body text)
- Max 5 hashtags at the very end of body
- Short paragraphs (2-3 lines max), generous white space

**X/Twitter (280 chars hard limit):**
- One sharp observation or counterintuitive point
- First 5 words decide whether anyone reads the rest
- Include the blog URL only if it fits within 280 chars

**Facebook (personal profile, NOT business page):**
- Warm, direct — like talking to a mate in a pub
- End with a genuine question to spark comments
- 40-80 words sweet spot
- 1-2 emojis max, only if natural

**Instagram:**
- Visual-first (the Reel or carousel image carries the message)
- Caption supports and expands, doesn't repeat
- 2-3 natural emojis
- Hashtags in `first_comment` (not body)

**Banned in ALL personal content:**
- Em-dashes
- "game-changing", "revolutionary", "leverage", "synergy", "empower"
- "In today's fast-paced world", "I'm excited to share"
- American spellings
- "Antek Automation offers..." (no company promo on personal profile)

---

## STEP 4 — Run personal-cli.ts

```bash
cd files && npm run personal
```

This assigns:
- Scheduling (08:00 UK, 1/day from tomorrow)
- Format rotation (text/reel/carousel/youtube_video based on index)

Opens `personal-preview.html`. Review character counts, voice, scheduling dates.
Proceed when content looks right.

---

## STEP 5 — Schedule TEXT POSTS (all 28) via Blotato MCP

Read enriched `personal-content.json`. Schedule text posts for ALL 28 ideas regardless of format.
The format determines what additional VIDEO content is made — text posts go out every day.

**Personal LinkedIn (NO pageId — personal profile):**
```
blotato_create_post({
  accountId: 14687,
  platform: "linkedin",
  text: idea.variants.personal_linkedin.body,
  scheduledTime: idea.variants.personal_linkedin.scheduled_at
})
```

**X/Twitter:**
```
blotato_create_post({ accountId: 13863, platform: "twitter", text: idea.variants.twitter.body, scheduledTime: ... })
```

**Facebook (personal — NO pageId):**
```
blotato_create_post({ accountId: 22303, platform: "facebook", text: idea.variants.facebook.body, scheduledTime: ... })
```

**Instagram:**
```
blotato_create_post({ accountId: 34604, platform: "instagram", text: idea.variants.instagram.body, scheduledTime: ... })
```

---

## STEP 6 — REELS (days 2, 6, 10, 14, 18, 22, 26 — 7 posts)

For each idea where `content_format === "reel"`, run the Shorts pipeline:

```bash
cd files && npm run shorts -- --url <source_url> --platforms youtube,instagram,facebook
```

This produces a vertical 1080×1920 MP4, uploads to R2, and schedules to YouTube Shorts, IG Reels, FB Reels via Blotato.

**Reel scheduling:** Schedule 1 day AFTER the text post for the same article (so the text post gets Day N, the Reel gets Day N — they share the same slot since different platforms, or offset by 1 day if you prefer separation).

---

## STEP 7 — CAROUSELS (days 3, 7, 11, 15, 19, 23, 27 — 7 posts)

For each idea where `content_format === "carousel"`:

### 7a — Generate card content

Use the cards pipeline to create 5-6 tip cards from the blog post:

```bash
cd files && npm run cards -- --url <source_url> --types tip,stat,cta --count 5 --sizes square
```

Cards save to `files/output/cards/<slug>_tip_01_square.png` etc.

### 7b — Upload cards to R2

Create a temporary runner `files/carousel-upload-run.ts`:

```typescript
import "dotenv/config";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_API_TOKEN!.split(":")[0],
    secretAccessKey: process.env.R2_API_TOKEN!.split(":")[1],
  },
});

const slug = process.argv[2];
const cardsDir = join(process.cwd(), "output", "cards");
const files = readdirSync(cardsDir).filter(f => f.startsWith(slug) && f.endsWith("_square.png")).sort();

const urls: string[] = [];
for (const file of files) {
  const key = `carousels/${slug}/${file}`;
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: readFileSync(join(cardsDir, file)),
    ContentType: "image/png",
  }));
  urls.push(`${process.env.R2_PUBLIC_URL}/${key}`);
  console.log(`Uploaded: ${key}`);
}
writeFileSync("carousel-urls-output.json", JSON.stringify(urls));
console.log(`CAROUSEL_DONE=${urls.length}`);
```

Run: `cd files && npx tsx carousel-upload-run.ts '<slug>'`
Read `files/carousel-urls-output.json` to get the array of R2 image URLs.
Delete `files/carousel-upload-run.ts`.

### 7c — Schedule carousel via Blotato

LinkedIn carousel (multiple images = carousel post):
```
blotato_create_post({
  accountId: 14687,
  platform: "linkedin",
  text: idea.variants.personal_linkedin.body,
  mediaUrls: [url1, url2, url3, url4, url5],
  scheduledTime: idea.variants.personal_linkedin.scheduled_at
})
```

Instagram carousel:
```
blotato_create_post({
  accountId: 34604,
  platform: "instagram",
  text: idea.variants.instagram.body,
  mediaUrls: [url1, url2, url3, url4, url5],
  scheduledTime: idea.variants.instagram.scheduled_at
})
```

---

## STEP 8 — YOUTUBE LANDSCAPE VIDEOS (days 4, 8, 12, 16, 20, 24, 28 — 7 posts)

For each idea where `content_format === "youtube_video"`:

### 8a — Generate YT video script

Import the prompt builder:
```typescript
import { buildYTVideoPrompt, parseYTVideoScript } from "./generate-youtube-video.js";
```

Call `buildYTVideoPrompt(title, content)` and generate a 9-slide YTVideoScript JSON.
Validate with `parseYTVideoScript(jsonStr)`. Fix and retry if validation throws.

The 9 slides: intro → context → point 1-5 → takeaway → cta
Target: ~2 minutes total spoken time across all slides.

Write script to `files/yt-video-script.json`.

### 8b — Generate TTS voiceover

Create `files/yt-voice-run.ts`:
```typescript
import "dotenv/config";
import { generateAllVoiceovers } from "./shorts-voice.js";
import { readFileSync, writeFileSync } from "fs";

const script = JSON.parse(readFileSync("yt-video-script.json", "utf-8"));
// Adapt ShortScript shape for the voice module
const adapted = { slides: script.slides.map((s: any) => ({ ...s, type: s.type === "point" ? "tip" : s.type })) };
const slideAudios = await generateAllVoiceovers(adapted as any);
writeFileSync("yt-voice-output.json", JSON.stringify(slideAudios));
console.log(slideAudios ? "VOICE_DONE" : "VOICE_SILENT");
```

Run: `cd files && npx tsx yt-voice-run.ts`
Delete `files/yt-voice-run.ts`.

### 8c — Render frames (1920×1080 landscape)

Create `files/yt-frames-run.ts`:
```typescript
import "dotenv/config";
import { renderYTFrames } from "./youtube-video-frames.js";
import { readFileSync, writeFileSync } from "fs";

const script = JSON.parse(readFileSync("yt-video-script.json", "utf-8"));
const paths = await renderYTFrames(script);
writeFileSync("yt-frames-output.json", JSON.stringify(paths));
console.log("FRAMES_DONE");
```

Run: `cd files && npx tsx yt-frames-run.ts`
Delete `files/yt-frames-run.ts`.

### 8d — Stitch video + upload to R2

Create `files/yt-video-run.ts`:
```typescript
import "dotenv/config";
import { stitchVideo, uploadVideoToR2 } from "./shorts-video.js";
import type { SlideAudio } from "./shorts-types.js";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { mkdirSync } from "fs";

const framePaths = JSON.parse(readFileSync("yt-frames-output.json", "utf-8")) as string[];
const slideAudios = JSON.parse(readFileSync("yt-voice-output.json", "utf-8")) as SlideAudio[] | null;
const slug = process.argv[2] || "yt-video";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
const outDir = join(process.cwd(), "output", "youtube");
mkdirSync(outDir, { recursive: true });
const outputPath = join(outDir, `${slug}-${timestamp}.mp4`);

const mp4Path = await stitchVideo(framePaths, outputPath, slideAudios ?? undefined);
const r2Url = await uploadVideoToR2(mp4Path, `youtube/${slug}-${timestamp}.mp4`);

writeFileSync("yt-video-output.json", JSON.stringify({ mp4Path, r2Url }));
console.log(`VIDEO_DONE r2=${r2Url}`);
```

Run: `cd files && npx tsx yt-video-run.ts '<slug>'`
Read `files/yt-video-output.json`.
Delete `files/yt-video-run.ts`.

### 8e — Schedule to YouTube via Blotato

```
blotato_create_post({
  accountId: 29641,
  platform: "youtube",
  title: script.youtubeTitle,
  text: script.sourceBlogUrl + "\n\n" + script.youtubeDescription,
  mediaUrls: [r2Url],
  scheduledTime: idea.variants.personal_linkedin.scheduled_at
})
```

Clean up: `yt-video-script.json`, `yt-voice-output.json`, `yt-frames-output.json`, `yt-video-output.json`

---

## STEP 9 — Final report

```
✅  28-day Personal Content Calendar Complete

TEXT POSTS (×28 across all platforms):
  LinkedIn personal: 28 scheduled  ✅
  X/Twitter:         28 scheduled  ✅
  Facebook:          28 scheduled  ✅
  Instagram:         28 scheduled  ✅

REELS (×7):
  YouTube Shorts:    7 scheduled   ✅
  Instagram Reels:   7 scheduled   ✅
  Facebook Reels:    7 scheduled   ✅

CAROUSELS (×7):
  LinkedIn:          7 scheduled   ✅
  Instagram:         7 scheduled   ✅

YOUTUBE VIDEOS (×7, ~2 min each):
  YouTube:           7 scheduled   ✅

Total posts scheduled: 168 across all platforms
Calendar runs: <start date> → <end date>
First post: <date> at 08:00 UK time
```

---

## BLOTATO ACCOUNT REFERENCE

| Platform | Account ID | pageId | Target |
|----------|-----------|--------|--------|
| LinkedIn personal | 14687 | NONE | Andy's personal profile |
| LinkedIn company  | 14687 | 110656388 | Antek Automation company page |
| X/Twitter | 13863 | — | @AntekAutomation |
| Facebook personal | 22303 | NONE | Andy's personal profile |
| Facebook page | 22303 | 999920689867882 | Antek Automation FB page |
| Instagram | 34604 | — | @AntekAutomation |
| YouTube | 29641 | — | Antek Automation YouTube |

## CRITICAL FFMPEG RULES

- **NO `-loop`, `-r`, or `-t` on PNG inputs** — a PNG is 1 frame; zoompan `d` controls duration
- CTA slide has NO upper duration cap (~12-15s)
- All other slides clamped 3-8s
- `aformat=sample_fmts=s16` required for FFmpeg 8 / libmp3lame audio concat

## NOTES

- `@aws-sdk/client-s3` may need installing: `cd files && npm install @aws-sdk/client-s3`
- R2_API_TOKEN in `.env` must be in format `<access_key_id>:<secret_access_key>` for the carousel upload runner — adjust split if your format differs
- If Fish Audio is unavailable: silent mode (5s/slide), still schedules normally
- YouTube videos are NOT auto-published — they're scheduled via Blotato for manual upload if needed, or direct publish if YouTube MCP account is connected
- Process batches of 7 per format rather than all 28 at once to avoid timeout issues
