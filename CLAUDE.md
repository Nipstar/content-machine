# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Social Content Machine v6** — Antek Automation's content pipeline. Generates social posts, GBP posts, YouTube Shorts/Reels, podcast episodes, and branded image cards from blog RSS. Media creation and post scheduling handled exclusively via **Blotato MCP** tool calls.

All source code lives in `files/`. There is no `src/` directory.

## Build & Run

All commands run from the `files/` directory:

```bash
cd files
npm install
npm run build                # tsc → dist/
npm run generate             # load content.json, assign Blotato templates, open HTML preview
npm run generate:from-db     # pull approved briefs from PostgreSQL instead of content.json
npm run preview:fast         # content-only preview (no template assignment)
npm run gbp                  # GBP post pipeline
npm run shorts               # YouTube Shorts/Reels pipeline
```

There are no tests. TypeScript ESM — all imports use `./module.js` extension paths. `tsconfig.json` targets ES2022/NodeNext.

### System dependencies

```bash
brew install ffmpeg    # required for Shorts and Podcast (includes ffprobe)
npm install dotenv     # must be in files/node_modules (runner scripts need it)
```

Puppeteer (bundled Chrome) is a project dependency — no separate install needed.

## Slash Commands

Custom Claude Code commands in `.claude/commands/`. Each command file contains the full step-by-step pipeline — read it before executing.

| Command | Pipeline |
|---------|----------|
| `/run` | Full: RSS → content.json → build → preview → Blotato visuals → schedule |
| `/content` | Content only: RSS → content.json → verify UK grammar |
| `/schedule` | Visuals + scheduling only: create media → schedule via Blotato MCP |
| `/gbp` | GBP: RSS → posts → Sharp images → R2 upload → PostgreSQL queue |
| `/shorts` | Shorts: RSS → 6-slide script → TTS → Puppeteer frames → FFmpeg MP4 → R2 → Blotato schedule |
| `/podcast` | Podcast: RSS → script → Fish Audio TTS → FFmpeg → R2 → RSS.com (distribution) → Ghost embed → YouTube video |
| `/cards` | Cards: RSS → extract content → Puppeteer PNGs in 3 sizes (no Blotato dependency) |
| `/personal` | Personal: sitemap scan → personal LinkedIn + X + FB + IG text posts → Reels via shorts pipeline |

## Architecture

### Core social content pipeline (3 phases)

```
Phase 1 (Content)   → Read content.json → apply scheduling (08:00 UK, 1/day, 14 days)
Phase 2 (Templates) → Map content_category → Blotato template (primary + fallback)
Phase 3 (Preview)   → HTML preview with platform tabs → opens browser
```

After preview approval, Claude Code creates media + schedules posts via Blotato MCP.

### Module map (files/)

| Module | Role |
|--------|------|
| `index.ts` | CLI entry: arg parsing, 3-phase orchestration |
| `generate-content.ts` | Reads content.json, builds scheduling slots, assembles ContentIdea[] |
| `template-mapping.ts` | ContentCategory → Blotato template (primary + fallback). Also exports `findLocalCard()` for /cards integration |
| `load-briefs.ts` | PostgreSQL: load approved briefs, infer pillar, rotate categories |
| `preview.ts` | HTML preview: platform tabs, char count colour coding, template badges |
| `types.ts` | Core interfaces: ContentIdea, Pillar, Platform, ContentCategory, PlatformPost |
| `sitemap-scanner.ts` | Fetches + parses `sitemap-posts.xml` → sorted URL list, filters parse-error drafts |
| `personal-types.ts` | PersonalContentIdea, PersonalVariant interfaces |
| `personal-cli.ts` | Reads `personal-content.json`, applies scheduling, opens `personal-preview.html` |
| `generate-gbp.ts` / `gbp-*.ts` | GBP pipeline: post generation, image rendering (Sharp), R2 upload, DB queue |
| `generate-shorts.ts` / `shorts-*.ts` | Shorts pipeline: script gen, TTS, Puppeteer frames, FFmpeg stitch, R2, Blotato scheduling |
| `generate-podcast.ts` / `podcast-*.ts` | Podcast pipeline: script gen, section-by-section TTS, R2 + RSS.com upload, Ghost embed, YouTube video |
| `generate-cards.ts` / `cards-*.ts` | Cards pipeline: content extraction, Puppeteer rendering (5 types x 3 sizes) |

### Data flow modes

1. **RSS (default)**: Fetch `https://blog.antekautomation.com/rss/` → WebFetch articles → repurpose into posts
2. **Database** (`--from-db`): `loadApprovedBriefs()` → `briefsToIdeaSeeds()` → `generateIdeasFromBriefs()`
3. **Pillar-based**: Claude generates fresh from content pillars (opinion posts, polls)

### Key types (types.ts)

- `Pillar`: `"ai_automation" | "voice_ai" | "growth_digital"`
- `Platform`: `"linkedin" | "twitter" | "facebook" | "instagram"`
- `ContentCategory`: 11 values — `how_to`, `tutorial`, `tip`, `quick_win`, `thought_leadership`, `case_study`, `product_feature`, `news`, `industry_news`, `comparison`, `video_content`

## Content Rules (Non-Negotiable)

### Voice & persona

Andy Norman — founder of Antek Automation, Andover, Hampshire, UK. 30+ years in managed print services. Direct, practical, trusted local expert. First person. UK English always.

### UK English enforcement

Use: colour, organise, whilst, realise, licence, programme, maths, practise, enquiry.
Never: American spellings, "utilize" (use "use"), "solution" (name the actual thing).

### Banned patterns

- No em-dashes (renders poorly on LinkedIn/mobile)
- Never: "game-changing", "revolutionary", "leverage", "synergy", "empower", "unleash"
- Never: "In today's fast-paced world", "I'm excited to share", "Let that sink in."
- No "DM me" CTAs — use "full guide on the blog" with actual blog URLs
- No hype — share real data, specific prices, tool names, limitations

### Platform limits

| Platform | Limit | Links | Key rule |
|----------|-------|-------|----------|
| LinkedIn | 1,300 chars | NO links in body (kills reach) — links in `first_comment` only | Hook must compel "see more" click |
| X/Twitter | 280 chars HARD | Fine in body | Single idea, first 5 words must land |
| Facebook | ~40-100 words | Fine in body | Warm, conversational, direct question at end |
| Instagram | 150-300 visible | N/A | Visual-first, hashtags in `first_comment` |

### Scheduling

- 14 ideas = 14 days x 1 post/day per platform
- Post time: **08:00 UK time** (BST = UTC+1 in summer, GMT = UTC+0 in winter)
- Pillar rotation: ai_automation → voice_ai → growth_digital → repeat
- Category rotation: cycle all 11 categories, no back-to-back repeats
- Rotate verticals (accountants, plumbers, dentists, solicitors — trades are ONE vertical, not the whole focus)

## Blotato MCP

Registered in `.claude/settings.json` (HTTP transport). Never call Blotato REST API directly.

### Platform account IDs

| Platform | Account ID | Page ID |
|----------|-----------|---------|
| LinkedIn | 14687 | 110656388 |
| Twitter/X | 13863 | — |
| Facebook | 22303 | 999920689867882 |
| Instagram | 34604 | — |
| YouTube | 29641 | — |

### Workflow

1. Read enriched `content.json` (CLI has added `blotato_template` + `scheduled_at`)
2. `blotato_create_visual` per idea using template ID + content
3. Poll `blotato_get_visual_status` → capture `mediaUrl`/`imageUrls`
4. `blotato_create_post` per idea x platform with media URLs + scheduled time

### Personal vs company posting

Same account ID (14687) for both LinkedIn targets:
- **No `pageId`** → posts to Andy's personal LinkedIn feed
- **`pageId: "110656388"`** → posts to Antek Automation company page

Same applies to Facebook (22303):
- **No `pageId`** → Andy's personal Facebook
- **`pageId: "999920689867882"`** → Antek Automation Facebook page

## Brand Palette

- Coral/rust: `#CD5C3C` (primary)
- Cream: `#E8DCC8` (background)
- Sage green: `#C8D8D0` (secondary)
- Charcoal: `#2C2C2C` (text/elements)

Neo-brutalist design system: no rounded corners, no gradients, thick borders, offset shadows, Inter 900-weight headings, asymmetric layouts.

## Critical FFmpeg Rules

- **Never add `-loop`, `-r`, or `-t` as input options on PNG frames.** A PNG is 1 frame — zoompan's `d` = frames per input frame. Extra input frames multiply d → multi-minute video.
- CTA slide has NO upper duration cap (~12-15s with two TTS clips + 5s silence gap). All other slides clamped 3-8s.
- Audio concatenation requires `aformat=sample_fmts=s16` for FFmpeg 8 / libmp3lame compatibility.

## Fish Audio TTS

- API: `POST https://api.fish.audio/v1/tts` with model `s2-pro` (header, not body)
- Prepend `[professional broadcast tone]` to all voiceover text
- CTA audio is NOT from voiceover_text field — uses two hardcoded constants in `shorts-voice.ts` / `podcast-voice.ts`
- Section-by-section generation with sentence splitting to avoid ~8s clip cap
- 500ms delay between API calls (rate limit)
- Retry once after 2s on failure, then throw

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `BLOTATO_API_KEY` | Blotato MCP auth |
| `LINKEDIN_ACCOUNT_ID` | Blotato connected account UUID (overrides hardcoded 14687) |
| `TWITTER_ACCOUNT_ID` | Blotato connected account UUID (overrides hardcoded 13863) |
| `FACEBOOK_ACCOUNT_ID` | Blotato connected account UUID (overrides hardcoded 22303) |
| `INSTAGRAM_ACCOUNT_ID` | Blotato connected account UUID (overrides hardcoded 34604) |
| `DATABASE_URL` | PostgreSQL (--from-db, GBP queue, Shorts queue, Podcast queue) |
| `DATABASE_SSL` | Set `"false"` to disable SSL (default: enabled) |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_API_TOKEN` | Cloudflare R2 API token |
| `R2_BUCKET_NAME` | R2 bucket name (default: `gbp-images`) |
| `R2_PUBLIC_URL` | R2 public URL prefix |
| `FISH_AUDIO_API_KEY` | Fish Audio TTS (Shorts voiceover + Podcast) |
| `FISH_AUDIO_VOICE_ID` | Fish Audio voice model (optional — `f449632487b740fdab7e44dc4a850948`) |
| `GHOST_ADMIN_API_URL` | Ghost site URL for podcast embed |
| `GHOST_ADMIN_API_KEY` | Ghost Admin API key (`{id}:{hex_secret}` format) |
| `RSS_COM_API_KEY` | RSS.com API key (Network plan required) |
| `RSS_COM_PODCAST_ID` | RSS.com podcast/show ID |

## Database Tables

All tables auto-create on first use via `init*Table()` functions.

- `articles` — content briefs (--from-db mode): `status` progresses `discovered → approved → social_queued → published`
- `gbp_post_queue` — GBP posts: `status` = `queued → posted | failed`. Posted by n8n WF7, not this project.
- `shorts_queue` — one row per platform per video: `status` = `queued → scheduled | failed`
- `podcast_queue` — episode metadata + distribution tracking (`ghost_embedded`, `rsscom_published`, `youtube_queued`)

## Podcast Episodes

### Pipeline overview

```
Blog post (RSS or --url)
→ Claude Code generates PodcastScript (JSON)
→ Fish Audio TTS per section → FFmpeg concat + music bed → single MP3
→ Upload to R2 (Ghost embed source + backup)
→ Upload to RSS.com (podcast distribution: Apple, Spotify, Google, Amazon)
→ Embed HTML5 audio player in Ghost blog post (uses R2 URL)
→ Render 1920×1080 branded video → upload to R2 (YouTube queue)
→ Queue metadata to PostgreSQL
```

### RSS.com as podcast host

RSS.com handles feed generation, directory distribution, analytics, and scheduling. We upload via their API v4:
1. `POST /v4/podcasts/{id}/assets/presigned-uploads` → get presigned URL + `upload_id`
2. `PUT` MP3 bytes to the presigned URL
3. `POST /v4/podcasts/{id}/episodes` with `audio_upload_id` + metadata → episode created

Auth: `X-Api-Key` header. `schedule_datetime` controls publish timing (ISO 8601 or now for immediate).

RSS.com has built-in audio-to-YouTube publishing, but we use our own branded neo-brutalist video instead for brand consistency.

**One-time setup:** Create the podcast show on RSS.com dashboard first, set up show artwork (1400x1400), copy the podcast ID and API key to `.env`.

### Episode structure (~6-7 minutes)

1. **Intro** (~20-30s) — "Hey, it's Andy from Antek Automation. Today I want to talk about..."
2. **Context** (~40-60s) — Vivid scenario with real data, two paragraphs
3. **Tips 1-3** (~90s) — Deeply practical, 2-4 sentences each, natural Antek breadcrumbs
4. **Blog CTA** — Hardcoded mid-roll: drives traffic to the blog post
5. **Tips 4-5** (~60s) — More tips
6. **Mid CTA** — Hardcoded mid-roll: brand mention + website
7. **Tips 6-7** (if present) — Final tips
8. **Recap** (~20-30s) — "So to recap: [2-3 key takeaways]"
9. **Outro** (~10-15s) — Always the hardcoded constant from `generate-podcast.ts`

### Key files

| File | Purpose |
|------|---------|
| `podcast-types.ts` | PodcastScript, PodcastTip, PodcastEpisode, RSSComEpisodeResult, PodcastDbRecord |
| `generate-podcast.ts` | `buildPodcastPrompt()` + `parsePodcastScript()` + `generateSlug()` + hardcoded CTAs (BLOG_CTA, MID_CTA, PODCAST_OUTRO) |
| `podcast-cover.ts` | Per-episode 3000x3000 cover art via Puppeteer (falls back to default in `images/`) |
| `podcast-voice.ts` | Fish Audio TTS: section-by-section with sentence splitting, FFmpeg concat + fades + music |
| `podcast-upload.ts` | `uploadToR2()` + `uploadToRSSCom()` (presigned URL flow) + `uploadVideoToR2()` |
| `podcast-ghost.ts` | Ghost Admin API: JWT auth, prepend HTML5 audio player to blog post Lexical content |
| `podcast-youtube.ts` | Puppeteer 1920x1080 background + FFmpeg MP4 stitch + R2 upload |
| `podcast-db.ts` | PostgreSQL: `podcast_queue` table with distribution tracking |

### Fish Audio emotion tags

| Section | Tag |
|---------|-----|
| Intro | `[friendly, upbeat]` |
| Context | `[professional, conversational]` |
| Tips | `[confident, clear]` |
| Recap | `[professional]` |
| Outro | `[friendly, warm]` |

## Integration Context

This project is part of a larger pipeline:
- **WF1/WF2**: RSS discovery → brief generation → approval (upstream)
- **This project**: approved briefs/RSS → social posts/GBP/Shorts/Podcast/Cards → Blotato MCP + R2 + PostgreSQL
- **WF3**: full blog post → Ghost CMS (parallel)
- **n8n WF7**: GBP posting from `gbp_post_queue` (downstream)

## Running Podcast and Cards Pipelines

No `npm run podcast` or `npm run cards` scripts exist — these run via slash commands only, which invoke `tsx` directly. Use `/podcast` and `/cards` in Claude Code, or run manually:

```bash
cd files
tsx podcast-cli.ts [--url <url>] [--no-music] [--no-upload] [--no-ghost] [--no-youtube]
tsx cards-cli.ts   [--url <url>] [--types stat,quote,tip] [--sizes landscape,square,portrait]
```
