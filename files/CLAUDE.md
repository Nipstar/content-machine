# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Social Content Machine v6 — Antek Automation

Social media content preparation and scheduling for Antek Automation.
Generates weekly batches of posts for LinkedIn, X, Facebook, and Instagram.
Media creation and post scheduling are handled exclusively via **Blotato MCP** tool calls — never call Blotato REST API directly.

---

## BUILD & RUN

Source files live in the project root (no `src/` directory). TypeScript ESM — imports use `./module.js` paths.

```bash
npm install
npm run build                         # compile TypeScript → dist/ (tsc)
npm run preview:fast                  # fastest test: content-only preview (alias of preview)
npm run generate                      # load content.json, assign templates, preview
npm run generate:from-db             # pull approved briefs from PostgreSQL
npm run generate:from-db:preview     # briefs → preview only (no template step)
npm run generate:7                    # 7 ideas
npm run generate:linkedin-only        # linkedin platform only
npm run generate:voice               # pillar voice_ai (also :automation, :growth)
npm run gbp                          # GBP pipeline (gbp-cli.ts)
npm run gbp:preview                   # GBP preview only
npm run shorts                       # shorts-cli.ts
npm run cards                        # cards-cli.ts
npm run personal                      # personal-cli.ts → personal-preview.html
npm run personal:preview              # personal preview only (no template step)
npm start                            # run compiled dist/index.js
```

**Ad-hoc flags** (pass with `--` after the script): `--count N`, `--platforms linkedin,facebook`,
`--pillar voice_ai`, `--category tip`, `--start 2026-03-20`, `--preview-only`.

**One-off scripts (no npm alias):**
- `npx tsx generate-banner.ts` — generate `images/banner.png` (1280×640 GitHub repo banner)
- `npx tsx generate-youtube-video.ts` — landscape YouTube video script generator (used by `/personal`)
- `npx tsx personal-images-run.ts` — render + upload all 28 personal post hook cards to R2
- `npx tsx podcast-batch-run.ts [--dry-run] [--skip-to N]` — process every script in `podcast-scripts/` (audio + R2 + RSS.com + DB)

---

## SLASH COMMANDS

| Command | What it does |
|---------|-------------|
| `/run` | Full pipeline: fetch RSS, generate content.json, build, preview, create visuals, schedule all posts |
| `/content` | Content only: fetch RSS, generate content.json, verify UK grammar |
| `/schedule` | Visuals + scheduling only: create media from templates, schedule posts via Blotato MCP |
| `/gbp` | GBP posts: fetch RSS, generate posts, create branded images, upload to R2, queue in PostgreSQL |
| `/shorts` | Shorts/Reels: fetch RSS, generate 6-slide script, render 1080×1920 frames, stitch MP4 (once), upload to R2, schedule to each target platform via Blotato MCP |
| `/podcast` | Podcast episodes: fetch RSS, generate 6-7 min script, produce MP3 via Fish Audio TTS, upload to R2 + RSS.com, embed in Ghost, render YouTube video, queue in PostgreSQL |
| `/cards` | Social cards: fetch RSS, extract stats/quotes/tips, render branded PNG cards in 3 sizes via Puppeteer (no Blotato dependency) |
| `/personal` | 28-day personal calendar: sitemap scan → rotates 4 formats (LinkedIn/X/FB/IG text, hook-card image post, Reel, landscape YouTube video) → personal LinkedIn + Andy's other personal accounts |

---

## THREE-STEP WORKFLOW

1. **Claude Code generates content** → writes `content.json` (array of ContentIdea objects)
2. **User runs** `npm run generate` → CLI assigns Blotato templates, generates HTML preview
3. **Claude Code creates media + schedules** via Blotato MCP tool calls

---

## ARCHITECTURE

The CLI (`index.ts`) runs a 3-phase pipeline:

```
Phase 1 (Content)   → Read content.json + apply scheduling times (08:00 UK, 1/day over 14 days)
Phase 2 (Templates) → Map content_category → Blotato template, write enriched content.json
Phase 3 (Preview)   → HTML preview with platform tabs, template badges, char counts → opens browser
```

**Module responsibilities:**
- `index.ts` — CLI arg parsing, 3-phase orchestration
- `generate-content.ts` — Reads content.json, builds scheduling slots (1/day at 08:00), assembles ContentIdea[]
- `template-mapping.ts` — Maps ContentCategory → Blotato template (primary + fallback)
- `load-briefs.ts` — PostgreSQL: load approved briefs, infer pillar from keywords, rotate categories
- `preview.ts` — HTML preview with platform tabs, char count colour coding, template badges
- `types.ts` — TypeScript interfaces: ContentIdea, Pillar, Platform, ContentCategory, PlatformPost

**Key types** (from types.ts):
- `Pillar`: `"ai_automation" | "voice_ai" | "growth_digital"`
- `Platform`: `"linkedin" | "twitter" | "facebook" | "instagram"`
- `ContentCategory`: `"how_to" | "tutorial" | "tip" | "quick_win" | "thought_leadership" | "case_study" | "product_feature" | "news" | "industry_news" | "comparison" | "video_content"`

**Data flow for --from-db mode:**
`loadApprovedBriefs()` → `briefsToIdeaSeeds()` (infers pillar, rotates categories) → `generateIdeasFromBriefs()` → phases 2-3

---

## CONTENT SOURCING

### Mode 1: RSS feed (preferred for informative content)
1. Fetch RSS feed: `https://blog.antekautomation.com/rss/`
2. Fetch full article content from each blog URL using WebFetch
3. Repurpose real article insights into value-first social posts (NOT salesy)
4. Include `source_url` field linking back to the blog post
5. LinkedIn `body` ends with the full blog URL (Andy's directive 2026-05-22 — overrides old "links in first_comment only" rule). `first_comment` may be empty or hashtags only.

### Mode 2: Database briefs (`npm run generate:from-db`)
Pulls from PostgreSQL `articles` table where `status = 'approved'`.
Each article has a `brief` JSONB blob with: `proposed_title`, `angle`, `key_points[]`, `target_keyword`, `cta`.

### Mode 3: Pillar-based (top-of-funnel)
Claude generates ideas fresh from content pillars. Use for opinion posts, polls, and content not tied to a specific article.

---

## CONTENT STYLE (NON-NEGOTIABLE)

- **Informative, not salesy** — share facts, numbers, comparisons, practical tips from actual articles
- **No "DM me" CTAs** — use "full guide on the blog" with actual blog URLs
- **Honest assessments** — include limitations, cheaper alternatives, "when NOT to buy" advice
- **Real data** — specific prices, tool names, comparisons from the articles
- **Actionable** — give readers something to do ("check your missed call log", "do this calculation")

---

## ANDY'S PERSONA

**Who:** Andy, founder of Antek Automation, Andover, Hampshire, UK
**Background:** 30+ years in managed print services (field engineer → service operations manager).
Not a tech bro. A practical operator who lived the frustrations of running service businesses.
**Business:** UK AI automation agency. AI voice agents (Certified Retell AI Partner), chatbots, n8n workflow automation.
**Tone archetype:** Trusted local expert. Direct. Practical. Straight answer, not the polished pitch.

---

## TARGET AUDIENCE

**Primary (current focus): US law firms** — solo / small partnership, after-hours intake pain:
- Personal Injury (PI)
- DUI / DWI defence
- Criminal Defence
- Immigration

**Secondary: UK service-based businesses**, 1-50 staff, owner-operated or founder-led, 30-60.

Verticals (rotate — trades are ONE vertical, not the whole focus):
- Professional services: accountants, solicitors, surveyors, consultants, IFAs
- Property and facilities: letting agents, property managers
- Health and wellness: physio clinics, dental practices, vets, beauty salons
- Trades and construction: plumbers, electricians, builders
- Business services: recruitment, IT support, training companies, cleaning contractors
- Hospitality: restaurants, hotels, catering, coffee shops
- Care and education: nurseries, care homes, tutoring centres

Pain points: missed callers, after-hours leads going to competitors, intake delays, admin overload, staff costs. **Frame as outcomes, never as "AI" or "automation" problems.**

---

## VOICE & TONE

### Voice & tone profile

- **Formality:** Highly conversational and informal. Andy writes the way he talks — contractions, short sentences, everyday language. No corporate jargon, buzzwords, or marketing-department phrasing. Reads like a real person writing for real people.
- **Energy:** High energy and punchy. Grabs attention fast, moves at pace, keeps posts tight. Bold, provocative, or blunt when the content calls for it. Enthusiasm for AI and automation is genuine and infectious, never over the top.
- **Personality:** Grounded and authentic, not performatively personal. No oversharing or vulnerability-for-engagement. Knowledge, opinions, and results do the talking. Personality shows through wit, directness, and the occasional well-placed challenge to conventional thinking.
- **Overall:** Direct, energetic, down-to-earth. Speaks like a knowledgeable mate who happens to be an AI expert — never a corporate vendor. Content feels like a conversation, not a pitch. Earns trust through honesty, clarity, and a genuine desire to help founders win.

### Outcome-led, not tech-led (top rule)

Outreach and social copy sells the **outcome**, not the tech. Never name the mechanism — name what the firm / business **gets**: caller answered, lead captured, intake booked, after-hours coverage, time back, fewer missed cases.

**Banned in outreach copy** (these reveal the mechanism, not the outcome):
- "AI", "artificial intelligence"
- "automation", "automated"
- "voice agent", "voice AI", "AI receptionist", "AI answering"
- "chatbot", "bot"
- "n8n", "workflow", "Retell", any vendor / platform name
- "agent" used in the technical sense

**Say instead:** "24/7 answering service", "after-hours intake", "we catch the callers your firm misses", "answers every call, books the consultation", "covers the calls you can't take", "your firm never misses an after-hours caller again".

Internal docs, code, DB columns, pillar keys → tech terms fine. **Outreach / social / GBP / shorts captions → outcome language only.**

### Non-negotiables
- **UK English always** (even for US law firm copy): colour, organise, whilst, realise, licence, programme, maths, practise, enquiry
- Contractions fine: "I've", "it's", "you're", "won't"
- No em-dashes — LinkedIn / mobile renders them poorly
- Never: "game-changing", "revolutionary", "leverage", "synergy", "empower", "unleash"
- Never: "In today's fast-paced world", "I'm excited to share", "Let that sink in."
- Never: "utilise" (use "use"), "solution" when you can name the actual thing
- Never: American spellings
- Never: any banned term in the outcome-led list above (in outreach copy)

### Words that work
- "miss", "missed", "gone to a competitor", "the case walked"
- "answered", "covered", "caught", "captured", "booked"
- "saves you", "gets you back", "means you can"
- Specific numbers: "3 missed callers a week", "4 hours back", "£200 in lost jobs", "one PI case pays for it for a year"
- "small firm", "service business", "your team", "your clients"
- "after hours", "while you're in court", "while you're with a client", "when the office is closed"

---

## CONTENT PILLARS

Pillar keys (`ai_automation`, `voice_ai`, `growth_digital`) are **internal code identifiers** — they route templates and DB rows. The **outreach copy** under each pillar must follow the outcome-led rule above (no AI / automation / voice agent / bot vocabulary).

| Pillar key | Topics (outcome framing) | Andy's angle (outcome-led) |
|------------|--------------------------|----------------------------|
| ai_automation | Missed enquiries recovered, follow-ups that actually happen, admin time clawed back, faster quote turnaround | "30 years watching service businesses lose work to slow follow-up. The fix is finally affordable for small firms." |
| voice_ai | After-hours answering, every caller answered, intake booked while you're in court, 24/7 cover, never miss a case | "Most PI / DUI / criminal / immigration calls come after hours. If you don't answer, the next firm does. We answer." |
| growth_digital | Local rankings, more inbound enquiries, website that converts, getting found by the right clients | "Built these systems for real firms — seen the before / after on caseload, not just traffic." |

### Content themes (rotate as topic seeds)

Five recurring themes drive idea generation. Rotate across them when building `content.json` — each is a content angle, not a pillar key (themes still map to the three pillar keys above for templating).

**1. AI Automation Wins** — concrete real-world results + ROI stories from professional-services deployments. Lead with numbers, outcomes, before/after. *Why:* social proof for sceptical founders; makes value tangible not theoretical.
- £12k recovered in missed enquiries (UK solicitors)
- Before/after: accountancy practice automated appointment booking
- 3 real results from firms live in under 2 weeks
- ROI breakdown: chatbot admin-hours saved for a consulting firm
- Recruitment agency stopped losing candidates to voicemail

**2. Founder Pain Points** — speak empathetically to daily frustrations of UK professional-services founders. Make them feel seen before any solution. Relatability over promotion. *Why:* emotional resonance + trust; understood founders engage and enquire.
- Lost that client because nobody answered at 5:31pm
- Receptionist spends 3 hrs/day on tasks a bot does in seconds
- Hidden cost of admin overload
- Missed calls = silent revenue killer
- How many leads fell through the cracks last month from slow follow-up?

**3. AI Myths Busted** — challenge fears/misconceptions blocking adoption. Confident, clear, occasionally irreverent. Data + logic, never condescending. *Why:* removes psychological barriers; hesitation → curiosity.
- Voice agents don't sound like robots anymore
- Myth: AI only for big budgets
- Truth about AI "replacing" staff
- Myth: setup takes months — reality, live in days
- 5 things UK founders get wrong about chatbots

**4. Automation 101** — educate founder buyers on how tools/systems work. Plain English, zero jargon. *Why:* positions Andy as accessible expert not salesperson; understanding → next step.
- What happens when a client calls your voice agent (step-by-step)
- Chatbot vs voice agent, plain English
- How workflow automation connects phone, CRM, calendar without IT
- What is an AI agent? no-nonsense explainer
- 3 types of automation every professional-services firm should know

**5. Fast-ROI Playbooks** — repeatable step-by-step strategies for quick wins. Actionable, results-focused, low technical/investment barrier. *Why:* low-risk path to start; expertise + generosity build trust → clients.
- 48-hour voice agent launch playbook
- Automate client intake this week (no IT team)
- Quick-win automation stack under £500/mo
- 5 automation moves that pay for themselves within 30 days
- Your first AI workflow: plain-English getting-started guide

**Theme vs outcome-led tension:** these theme titles name "AI", "automation", "voice agent", "chatbot" openly. The outcome-led ban (above) governs pure outreach/sales copy. For educational/social content — especially themes 3 (Myths) and 4 (101) — naming the mechanism is the point and is allowed. For Wins / Pain / Playbooks, keep the theme intent but lead the platform `body`/`hook` with outcomes (answered, captured, booked, £ recovered, hours back, after-hours cover).

---

## PLATFORM RULES

| Platform | Limit | Style | Links | Hashtags |
|----------|-------|-------|-------|----------|
| LinkedIn | 1,300 chars | Professional but human. Short paragraphs. Hook must compel "see more" click. | Blog URL goes IN BODY at the end (per Andy's direction 2026-05-22). Do not bury link in first_comment. | Max 5 at end |
| X (Twitter) | 280 chars HARD | Single idea. Punchy. First 5 words must land. | Fine in body | 1-2 max or none |
| Facebook | ~40-100 words | Warm, conversational. Direct question at end. 1-2 emojis max. | Fine in body | 1-3 or none |
| Instagram | 150-300 visible | Visual-first. Caption supports image. 2-3 emojis natural. | N/A | Max **5 in body** — Blotato MCP rejects more (no separate first_comment field). Keep best 5. |

---

## TEMPLATE MAPPING

Each content category maps to a Blotato visual template (see `template-mapping.ts` for full catalogue):

| Category | Use for | Primary Template | Fallback |
|----------|---------|-----------------|----------|
| how_to | Step-by-step guides | Newspaper Infographic | Tutorial Carousel with Monocolor Background |
| tutorial | Detailed walkthroughs | Newspaper Infographic | Tutorial Carousel with Monocolor Background |
| tip | Quick wins, single insights | Chalkboard Infographic | Single Centered Text Quote |
| quick_win | Fast actionable advice | Chalkboard Infographic | Single Centered Text Quote |
| thought_leadership | Opinion, industry perspective | Tweet Card Carousel with Minimal Style | Quote Card Carousel with Monocolor Background |
| case_study | Client stories, before/after | Top Secret Infographic | Whiteboard Infographic |
| product_feature | Tool/service spotlight | Product Scene Placement | Futuristic Flyer |
| news / industry_news | Breaking developments, sector trends | Breaking News | Newspaper Infographic |
| comparison | A vs B analysis | Whiteboard Infographic | When X then Y Text Slideshow |
| video_content | Video-first content | AI Video with AI Voice | AI Avatar with AI Generated B-roll |

---

## SCHEDULING

- 14 content ideas = 14 days x 1 post/day per platform
- Post time: **08:00** UK time
- Start: tomorrow, Day 1
- Pillar rotation: ai_automation → voice_ai → growth_digital → repeat
- Category rotation: cycle through all 11 categories to avoid repetition

---

## GENERATING CONTENT.JSON

When asked to generate content, follow this process:

### 1. Write as Andy
Every post is in Andy's voice. First person. UK English. Direct. Practical. No hype.

### 2. Use this schema exactly

Do NOT populate `scheduled_at`, `scheduled_display`, or `blotato_template` — the CLI fills these.

```json
[
  {
    "idea_id": "idea_0",
    "pillar": "ai_automation",
    "content_category": "tip",
    "topic": "Why most small businesses lose 3+ enquiries a week without knowing",
    "hook": "You're losing enquiries. Right now. And you probably don't even know it.",
    "source_url": "https://blog.antekautomation.com/missed-enquiries/",
    "variants": {
      "linkedin": {
        "body": "You're losing enquiries. Right now...\n\n[full LinkedIn post, max 1300 chars]",
        "first_comment": "Full guide on the blog: https://blog.antekautomation.com/missed-enquiries/",
        "hashtags": ["#SmallBusiness", "#AIAutomation"],
        "scheduled_at": "",
        "scheduled_display": ""
      },
      "twitter": {
        "body": "Most service businesses lose 3+ enquiries a week to missed calls. An AI receptionist costs less than one lost job.",
        "scheduled_at": "",
        "scheduled_display": ""
      },
      "facebook": {
        "body": "Quick question for anyone running a service business...\n\n[warm, conversational, 40-100 words]",
        "scheduled_at": "",
        "scheduled_display": ""
      },
      "instagram": {
        "body": "3 missed calls = 3 lost jobs. Every week.\n\n[150-300 chars visible]",
        "first_comment": "#SmallBusiness #AIAutomation #MissedCalls #ServiceBusiness #UKBusiness",
        "scheduled_at": "",
        "scheduled_display": ""
      }
    },
    "image_prompt_landscape": "Flat vector illustration of a ringing phone going unanswered on a desk, warm cream background #F0EBE0, coral accent #FF5C3A, charcoal details #2B2B2B, muted grey #97958F, no text, no faces, clean minimal style",
    "image_prompt_square": "Same scene as landscape but composed for square 1:1 format",
    "video_motion_prompt": "Casual podcast clip: Andy explains why small businesses lose enquiries without realising, with real numbers"
  }
]
```

### 3. Content variety rules
- Rotate across all 3 pillars
- Rotate across content categories (no back-to-back repeats)
- Rotate across verticals (accountants, plumbers, dentists, etc. — not just trades)
- Each platform variant is NATIVE to that platform, not copy-paste resized

### 4. Image prompt rules
Always include: "Flat vector illustration, minimal and clean, professional business graphic, colour palette coral #FF5C3A warm cream #F0EBE0 dark charcoal #2B2B2B muted grey #97958F, no text overlaid, no faces or people, no photography, modern UK business aesthetic."

---

## BRAND PALETTE

Canonical palette lives in `brand.ts` (`import { BRAND, BG } from "./brand.js"`). Prefer those constants over hardcoded hex in new renderers. Sampled from the quote-card reference set in `assets/brand-examples/` (2026-06-15).

| Token | Hex | Use |
|-------|-----|-----|
| coral | `#FF5C3A` | Primary accent: emphasis headline lines, quote mark, rules, bullet separators |
| cream | `#F0EBE0` | Light backgrounds; primary text on dark |
| charcoal | `#2B2B2B` | Dark backgrounds; primary text on light |
| ink | `#1C1C1C` | Crisp text on cream backgrounds |
| grey | `#97958F` | Kicker/eyebrow text, faint grid lines |

**Retired (2026-06-15):** old coral `#CD5C3C`, cream `#E8DCC8`, charcoal `#2C2C2C`, and sage `#C8D8D0`. Sage is dropped entirely — accents are coral + grey only. All renderer `.ts` files were repointed to the new hexes; only colours changed, layouts unchanged.

### Image dimensions (reference set)
- Ghost / landscape header: **2400×1260** (~1.9:1)
- Square card: **1080×1080**

### Quote-card design system

The reference cards in `assets/brand-examples/` define the target look. Structure (top to bottom):

1. **Kicker** top-left — `ANTEK / AUTOMATION`, uppercase, wide letter-spacing, grey `#97958F`, medium weight.
2. **Quote mark** — large coral `#FF5C3A` opening double-quote (“) below the kicker, left-aligned.
3. **Headline** — massive ultra-bold (≈900) grotesk caps, tight leading, edge-to-edge. Two-tone: lead lines in cream (on dark) or ink (on light); the punchline line(s) in coral.
4. **Attribution** bottom-left — short coral underline rule, then `ANDY NORMAN` uppercase, wide-tracked.
5. **Meta** bottom-right — `BESPOKE AUTOMATION • SMBs • ANDOVER` uppercase tracked, coral bullet separators.

Two background modes: **dark** (`#2B2B2B`) or **light** (`#F0EBE0`), each with a faint grid overlay (one step off the background). Flat — no rounded corners, no drop/offset shadows.

---

## BLOTATO MCP — FULL WORKFLOW

After `npm run generate` and preview review, use Blotato MCP tools (registered in `.claude/settings.json`).

### Platform account IDs

| Platform | Account ID | Page ID |
|----------|-----------|---------|
| LinkedIn | 14687 | 110656388 |
| Twitter/X | 13863 | — |
| Facebook | 22303 | 999920689867882 |
| Instagram | 34604 | — |
| YouTube | 29641 | — |

### Step 1: Read enriched content.json
The CLI has added `blotato_template` and `scheduled_at` to each idea.

### Blotato template IDs

| Template Name | Template ID |
|--------------|-------------|
| Chalkboard Infographic | `fcd64907-b103-46f8-9f75-51b9d1a522f5` |
| Newspaper Infographic | `07a5b5c5-387c-49e3-86b1-de822cd2dfc7` |
| Top Secret Infographic | `b8707b58-a106-44af-bb12-e30507e561af` |
| Whiteboard Infographic | `ae868019-820d-434c-8fe1-74c9da99129a` |
| Breaking News | `8800be71-52df-4ac7-ac94-df9d8a494d0f` |
| Tweet Card Carousel Minimal | `/base/v2/tweet-card/ba413be6-a840-4e60-8fd6-0066d3b427df/v1` |
| Product Scene Placement | `f524614b-ba01-448c-967a-ce518c52a700` |

### Step 2: Create media for each idea
Call `blotato_create_visual` with the template ID from the table above + content from the idea's topic/hook/body.
Poll `blotato_get_visual_status` until done — capture `mediaUrl` or `imageUrls`.

### Step 3: Schedule posts for each platform
Call `blotato_create_post` for each idea x platform:
- `accountId`: from table above
- `platform`: linkedin/twitter/facebook/instagram
- `text`: `idea.variants[platform].body`
- `mediaUrls`: URLs from step 2
- `scheduledTime`: `idea.variants[platform].scheduled_at` (ISO 8601)
- Facebook requires `pageId: "999920689867882"`
- LinkedIn company page requires `pageId: "110656388"`

### Step 4: Report results
Tell the user how many posts were scheduled, any failures, and the date range.

---

## GBP (GOOGLE BUSINESS PROFILE)

### /gbp slash command

Generates GBP-optimised posts from blog RSS, creates branded images, uploads to Cloudflare R2, and queues in PostgreSQL for n8n WF7 to post automatically.

Flags: `--count N` (default 14), `--frequency daily|alternate` (default alternate), `--start YYYY-MM-DD` (default tomorrow)

### GBP post content rules

- Max 1500 characters per post
- Strong opening line (shows in Google search results)
- Informative, not salesy — same voice as social posts
- Andy's persona: direct, practical, UK English throughout
- Include specific data, numbers, tool names from blog articles
- NO phone numbers in post text (Google rejects these)
- NO em-dashes
- Include local keywords: "UK small business", "service business"
- End with a clear CTA mapped to a GBP CTA button type
- CTA types: `LEARN_MORE` (blog links), `CALL` (phone-related), `BOOK` (booking-related), `ORDER`, `SIGN_UP`
- These are "What's New" type GBP update posts

### GBP image specs

- 1200x900px PNG (Google minimum 720x540)
- Brand colours: coral #FF5C3A, cream #F0EBE0, charcoal #2B2B2B, grey #97958F (see `brand.ts`)
- 4 template variants (rotate): stat card, tip card, quote card, question card
- All include "antekautomation.com | 0333 038 9960" footer
- Neo-brutalist style: no gradients, no rounded corners, bold geometric shapes
- Generated with Sharp, uploaded to Cloudflare R2

### gbp_post_queue table schema

```sql
gbp_post_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_text       TEXT NOT NULL,
  image_url       TEXT,
  cta_type        TEXT DEFAULT 'LEARN_MORE',
  cta_url         TEXT,
  source_url      TEXT,
  topic           TEXT,
  pillar          TEXT,
  scheduled_date  TIMESTAMPTZ NOT NULL,
  status          TEXT DEFAULT 'queued',  -- queued → posted | failed
  posted_at       TIMESTAMPTZ,
  gbp_post_id     TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
)
```

### GBP posting

Posting is handled by **n8n WF7**, not this project. This project only:
1. Generates post content from blog RSS
2. Creates branded images with Sharp
3. Uploads images to Cloudflare R2
4. Queues posts in PostgreSQL `gbp_post_queue`

### R2 environment variables

| Variable | Purpose |
|----------|---------|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_API_TOKEN` | Cloudflare R2 API token |
| `R2_BUCKET_NAME` | Bucket name (default: "gbp-images") |
| `R2_PUBLIC_URL` | Public URL prefix (e.g. https://gbp-images.antekautomation.com) |

---

## DATABASE SCHEMA (--from-db mode)

```sql
articles (
  id              UUID PRIMARY KEY,
  title           TEXT,
  url             TEXT,
  source          TEXT,
  summary         TEXT,
  relevance_score FLOAT,
  status          TEXT,   -- discovered → brief_ready → awaiting_approval → approved → social_queued → published
  brief           JSONB   -- { proposed_title, meta_description, angle, key_points[], target_keyword, cta }
)
```

Query: `SELECT * FROM articles WHERE status = 'approved' LIMIT 14`
After scheduling: `UPDATE articles SET status = 'social_queued' WHERE id = $1`

---

## ENVIRONMENT VARIABLES

| Variable | Purpose |
|----------|---------|
| `BLOTATO_API_KEY` | Blotato MCP auth |
| `LINKEDIN_ACCOUNT_ID` | Blotato connected account UUID |
| `TWITTER_ACCOUNT_ID` | Blotato connected account UUID |
| `FACEBOOK_ACCOUNT_ID` | Blotato connected account UUID |
| `INSTAGRAM_ACCOUNT_ID` | Blotato connected account UUID |
| `DATABASE_URL` | PostgreSQL connection (--from-db mode and GBP queue) |
| `DATABASE_SSL` | Set "false" to disable SSL (default: enabled) |
| `R2_ACCOUNT_ID` | Cloudflare account ID (GBP images + Shorts video) |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret key |
| `R2_BUCKET_NAME` | R2 bucket name (default: "gbp-images") |
| `R2_PUBLIC_URL` | R2 public URL prefix |
| `FISH_AUDIO_API_KEY` | Fish Audio TTS API key (Shorts voiceover + Podcast) |
| `FISH_AUDIO_VOICE_ID` | Fish Audio voice model ID (optional — omit for default voice) |
| `GHOST_ADMIN_API_URL` | Ghost site URL for podcast audio player embed (e.g. `https://blog.antekautomation.com`) |
| `GHOST_ADMIN_API_KEY` | Ghost Admin API key in `{id}:{hex_secret}` format |
| `RSS_COM_API_KEY` | RSS.com API key (Network plan required) |
| `RSS_COM_PODCAST_ID` | RSS.com podcast/show ID |

---

---

## YOUTUBE SHORTS

### /shorts slash command

Generates ~30-second short-form videos from blog RSS for YouTube Shorts, Instagram Reels, and/or Facebook Reels. Renders 6 neo-brutalist slides as 1080×1920 PNGs via Puppeteer, generates per-slide voiceover audio via Fish Audio TTS, stitches them into a single MP4 with voice-driven slide timing + Ken Burns zoom + crossfade transitions via FFmpeg, uploads to Cloudflare R2. The **same MP4** is then scheduled to each target platform via Blotato MCP with platform-specific metadata. Status tracked in PostgreSQL (one row per platform per video).

**Flags:**
- `--url <url>` — process a single specific blog post (default: all new RSS posts)
- `--no-voice` — skip Fish Audio TTS; all slides display for exactly 5 seconds each
- `--platforms <list>` — comma-separated target platforms (default: `youtube`)
  - Valid values: `youtube`, `instagram`, `facebook`
  - Shorthand: `--platforms all` → all three platforms
  - Shorthand: `--platforms reels` → `instagram,facebook`

**Pipeline:**
1. Fetch blog post from RSS or `--url`
2. Claude Code generates script: 1 hook + 3 tips + 1 summary + 1 CTA slide, each with `text` (on-screen) and `voiceover_text` (spoken)
3. Fish Audio S2 Pro generates one MP3 per slide; ffprobe measures exact duration
4. Puppeteer renders 6 slides at 1080×1920 → PNG files in /tmp/
5. FFmpeg stitches PNGs + per-slide audio → H.264 MP4 with voice-driven timing, Ken Burns, crossfades
6. MP4 uploaded to Cloudflare R2 → public URL
7. `generatePlatformMeta(script, platform)` called for each target platform → produces `PlatformMeta` (title, description, hashtags, caption per platform)
8. Blotato MCP `blotato_create_post` called once per platform with that platform's metadata and the shared R2 URL
9. `queueShort()` inserts one row per platform into `shorts_queue`

**Platform metadata differences:**
| Platform  | title | description | caption | hashtags |
|-----------|-------|-------------|---------|----------|
| YouTube   | youtubeTitle (max 60 chars) | blog URL + youtubeDescription | — | 5 (from youtubeTags, includes #Shorts) |
| Instagram | — | — | hook → tip bullets → CTA → blank line → hashtag block | 17 UK SMB/AI/automation tags |
| Facebook  | — | — | conversational question hook → 1–2 tips → CTA → question ending | 4 inline only |

**Files:**
| File | Purpose |
|------|---------|
| `shorts-types.ts` | TypeScript interfaces: SlideType, ShortSlide, SlideAudio, ShortScript, ShortVideo, ShortDbRecord, **ShortsPlatform**, **PlatformMeta** |
| `generate-shorts.ts` | `buildPrompt()` + `parseShortScript()` + **`generatePlatformMeta(script, platform)`** — structures per-platform metadata from validated script |
| `shorts-voice.ts` | Fish Audio S2 Pro TTS: `generateAllVoiceovers()` → SlideAudio[]; ffprobe duration measurement |
| `shorts-frames.ts` | Puppeteer renderer: 4 neo-brutalist templates at 1080×1920 |
| `shorts-video.ts` | FFmpeg stitcher: voice-driven slide durations, zoompan Ken Burns, xfade, audio concat + music mix |
| `shorts-db.ts` | Postgres tracking: `initShortsTable()`, `queueShort()`, `markScheduled()`, `markFailed()` |

**System dependencies:** `brew install ffmpeg` (includes ffprobe)

**Slide structure (6 slides, voice-driven duration, ~40–50s total with CTA):**
1. **hook** — Bold question or stat pulled from the blog post
2. **tip** (×3) — Numbered actionable tips (max 12 words each)
3. **summary** — One-line takeaway
4. **cta** — Hardcoded Antek branding (@AntekAutomation, antekautomation.com, 0333 038 9960)

**Each slide has two text fields:**
- `text` — the on-screen words (concise)
- `voiceover_text` — the spoken version: conversational, British English, numbers as words. CTA voiceover_text is a reference only — `shorts-voice.ts` generates it from the two hardcoded constants, never from this field.

**Fish Audio TTS:**
- API: `POST https://api.fish.audio/v1/tts` with model `s2-pro` (passed as a header, not in body)
- `[professional broadcast tone]` is prepended to every voiceover_text before sending
- Response: raw MP3 bytes, saved directly to temp dir
- ffprobe measures exact duration → drives slide display time
- 500ms delay between API calls (rate limit)
- If Fish Audio is down or `FISH_AUDIO_API_KEY` is missing → silent fallback (5s/slide)

**CTA slide audio (special handling):**
- NOT a single TTS clip — split into two parts with a 5s silence gap between them
- Part 1: "Follow Antek Automation for more tips like this. Visit antek automation dot com."
- Part 2: "Or call oh three three three, oh three eight, nine nine six oh."
- Parts concatenated via ffmpeg `filter_complex` with `aformat=sample_fmts=s16` (required for FFmpeg 8 / libmp3lame compatibility)
- CTA slide has NO upper duration cap — it runs for however long the concatenated audio measures (~12–15s)
- All other slides clamped to 3–8s

**Timing model:**
- With voiceover: slides 0–4 display for their audio duration (clamped 3–8s); slide 5 (CTA) uncapped
- Without voiceover (`--no-voice` or no API key): all slides = 5s → total ~28.5s
- Crossfade: 0.3s between slides

**FFmpeg duration (critical — do not change):**
- PNGs are passed to FFmpeg with NO input options (no `-loop`, `-r`, or `-t`)
- A PNG is naturally a single frame; zoompan's `d` parameter = output frames *per input frame*
- With 1 input frame and `d=N`, zoompan produces exactly N frames = correct duration
- Adding `-loop 1 -r 1 -t X` feeds X input frames → multiplies d by X → minutes-long video

**Audio mixing:**
- Voiceover clips are concatenated and trimmed to video duration
- Background music (`assets/music/*.mp3`) is looped and mixed at -22dB underneath the voice
- Without voice but with music: music only, trimmed to video length at -22dB
- Silent mode (no voice, no music): `-an` (video-only MP4)

**dotenv:** `dotenv` must be installed in `files/` — run `npm install dotenv` if runner scripts fail with `ERR_MODULE_NOT_FOUND: Cannot find package 'dotenv'`.

**Design system:** Same neo-brutalist brand as GBP — no rounded corners, no gradients, coral/cream/sage/charcoal, 900-weight Inter, thick borders, offset shadows via overlapping rectangles, asymmetric layouts.

### shorts_queue table schema

One row per platform per video. `queueShort()` inserts all rows in a single call; `markScheduled()` is called for each row after Blotato confirmation.

```sql
shorts_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_path      TEXT NOT NULL,
  platform        TEXT NOT NULL,   -- 'youtube' | 'instagram' | 'facebook'
  title           TEXT,            -- YouTube only (max 60 chars)
  description     TEXT,            -- YouTube: blog URL + description. Insta/FB: not used
  caption         TEXT,            -- Instagram/Facebook post caption
  tags            TEXT[],          -- hashtags as array
  blog_source_url TEXT,
  status          TEXT DEFAULT 'queued',  -- queued → scheduled | failed
  created_at      TIMESTAMPTZ DEFAULT now(),
  published_at    TIMESTAMPTZ
)
```

### Shorts scheduling

Blotato MCP is the handoff mechanism — the `/shorts` slash command calls `blotato_create_post` once per target platform using the shared R2 URL and per-platform metadata. The `shorts_queue` table is for audit/tracking only.

| Platform  | Blotato account ID | Page ID           |
|-----------|--------------------|-------------------|
| YouTube   | 29641              | —                 |
| Instagram | 34604              | —                 |
| Facebook  | 22303              | 999920689867882   |

---

## PODCAST EPISODES

### /podcast slash command

Generates 6-7 minute "Quick Tips" audio episodes from blog posts. Andy's voice via Fish Audio TTS. Section-by-section generation for prosody control and to avoid Fish Audio's ~8s output cap. Optional background music bed. Distributed via RSS.com (podcast hosting), Ghost (blog embed), and YouTube (branded video). Status tracked in PostgreSQL.

**Flags:**
- `--url <url>` — process a specific blog post URL (default: latest unprocessed RSS post)
- `--no-music` — skip background music bed (even if `assets/music/podcast-bed.mp3` exists)
- `--no-upload` — skip all uploads (R2 + RSS.com — useful for testing locally)
- `--no-ghost` — skip embedding the audio player in the Ghost blog post
- `--no-youtube` — skip generating the YouTube background video
- `--no-rsscom` — skip RSS.com upload (keeps R2 upload for Ghost embed)
- `--schedule "2026-04-05T10:00:00Z"` — schedule the episode on RSS.com for a future date/time instead of publishing immediately
- `--audio-only` — equivalent to `--no-ghost --no-youtube --no-rsscom` (just produce the MP3)

**Episode structure (~6-7 minutes):**
1. **Intro** (~20-30s) — "Hey, it's Andy from Antek Automation. Today I want to talk about [topic]..."
2. **Context** (~40-60s) — Two paragraphs painting a vivid scenario with real data from the post.
3. **Tips 1-3** (~90s) — Array of `{ tip_number, text }` objects. 2-4 sentences each. Deeply practical, with natural Antek breadcrumbs.
4. **Blog CTA** (hardcoded) — Mid-episode CTA after tip 3. Drives traffic to the blog post. Never regenerated.
5. **Tips 4-5** (~60s) — More tips.
6. **Mid CTA** (hardcoded) — Second mid-episode CTA after tip 5. Brand mention + website. Never regenerated.
7. **Tips 6-7** (optional, ~30-60s) — Final tips if 6 or 7 total.
8. **Recap** (~20-30s) — "So to recap: [2-3 key takeaways]."
9. **Outro** (~10-15s) — Always the hardcoded constant from `generate-podcast.ts`. Never regenerated.

**Pipeline:**
1. Fetch blog post from RSS or `--url`
2. Claude Code generates PodcastScript: intro + context + 3-4 tips + recap + hardcoded outro
3. Fish Audio S2 Pro generates audio per section, split into sentences to avoid ~8s clip limit
4. FFmpeg concatenates sections with 0.8s silence gaps, applies 0.5s fade-in + 1.5s fade-out
5. Optional: mix `assets/music/podcast-bed.mp3` at -28dB
6. MP3 uploaded to Cloudflare R2 → `episodes/[slug].mp3`
7. MP3 uploaded to RSS.com via presigned URL → episode created with metadata
8. Audio player embedded in Ghost blog post (uses R2 URL, not RSS.com URL)
9. YouTube video rendered (1920×1080 branded background + MP3 → MP4) → R2
10. Metadata queued to PostgreSQL `podcast_queue`

**Files:**
| File | Purpose |
|------|---------|
| `podcast-types.ts` | TypeScript interfaces: PodcastScript, PodcastTip, PodcastEpisode, RSSComEpisodeResult, PodcastDbRecord |
| `generate-podcast.ts` | `buildPodcastPrompt()` + `parsePodcastScript()` + `generateSlug()` + hardcoded CTAs (BLOG_CTA, MID_CTA, PODCAST_OUTRO) |
| `podcast-cover.ts` | Per-episode 3000×3000 cover art via Puppeteer (falls back to default in `images/`) |
| `podcast-voice.ts` | Fish Audio TTS: section-by-section generation, sentence splitting, FFmpeg concat + fades + music bed |
| `podcast-upload.ts` | `uploadToR2()` + `uploadToRSSCom()` (presigned URL flow) + `uploadVideoToR2()` |
| `podcast-db.ts` | Postgres: `initPodcastTable()`, `queueEpisode()`, `markRsscomPublished()`, `markGhostEmbedded()`, `markYoutubeQueued()` |
| `podcast-ghost.ts` | Ghost Admin API: JWT auth, prepend HTML5 audio player card to blog post Lexical content |
| `podcast-youtube.ts` | Puppeteer 1920×1080 branded background + FFmpeg MP4 stitch + R2 upload |

**Fish Audio TTS — emotion tags per section:**
| Section | Emotion tag |
|---------|-------------|
| Intro | `[friendly, upbeat]` |
| Context | `[professional, conversational]` |
| Tips | `[confident, clear]` |
| Recap | `[professional]` |
| Outro | `[friendly, warm]` |

**Sentence splitting:** Each section is split on sentence boundaries (`.` `!` `?` followed by capital) and sent to Fish Audio as individual calls. This avoids the ~8s clip cap. Clips are concatenated with FFmpeg `aformat=sample_fmts=s16` (same pattern as CTA in Shorts).

**Retry policy:** Each Fish Audio call retries once after 2 seconds on failure, then throws a clear error.

**Music bed:** Place any MP3 named `podcast-bed.mp3` in `assets/music/` for automatic -28dB mixing underneath the voice. Pass `--no-music` to skip.

**Script limits:** Target 850-950 words across intro + context + tips + recap (excluded: hardcoded CTAs and outro). At natural pace (~150 wpm) plus the ~60s of hardcoded CTAs/outro, this gives 6-7 minute episodes.

**R2 path convention:** `episodes/[episode-slug].mp3` — uses same bucket as GBP and Shorts.

### RSS.com integration

RSS.com is the podcast host. It handles RSS feed generation, directory distribution (Apple Podcasts, Spotify, Google Podcasts, Amazon Music), analytics, and episode scheduling.

**API flow (v4):**
1. `POST /v4/podcasts/{podcast_id}/assets/presigned-uploads` with `{ asset_type: "audio", expected_mime: "audio/mpeg", filename }` → returns `{ id, url }`
2. `PUT` MP3 bytes to the presigned `url`
3. `POST /v4/podcasts/{podcast_id}/episodes` with `{ title, description, audio_upload_id: id, schedule_datetime, itunes_episode_type: "full", ai_content: true }` → returns Episode

**Auth:** `X-Api-Key` header with `RSS_COM_API_KEY` from `.env`

**Scheduling:** `schedule_datetime` field — set to `new Date().toISOString()` for immediate publish, or a future ISO 8601 datetime to schedule. Exposed via `--schedule` flag.

**Why not RSS.com's YouTube feature:** RSS.com has built-in audio-to-YouTube video publishing, but we generate our own branded neo-brutalist video via `podcast-youtube.ts` for better brand consistency.

**One-time setup:** Create the podcast show on RSS.com dashboard first, set up show artwork (1400×1400, neo-brutalist, "ANTEK AUTOMATION QUICK TIPS"), copy the podcast ID and API key to `.env`.

### podcast_queue table schema

```sql
podcast_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_title     TEXT NOT NULL,
  episode_description TEXT,
  episode_slug      TEXT NOT NULL,
  episode_number    INTEGER,
  audio_path        TEXT NOT NULL,
  r2_url            TEXT,
  rsscom_episode_id TEXT,
  rsscom_audio_id   TEXT,
  youtube_video_path TEXT,
  youtube_r2_url    TEXT,
  blog_source_url   TEXT,
  ghost_post_id     TEXT,
  duration_seconds  INTEGER,
  file_size_bytes   INTEGER,
  ghost_embedded    BOOLEAN DEFAULT false,
  rsscom_published  BOOLEAN DEFAULT false,
  youtube_queued    BOOLEAN DEFAULT false,
  status            TEXT DEFAULT 'queued',  -- queued → uploaded → distributed | failed
  created_at        TIMESTAMPTZ DEFAULT now(),
  published_at      TIMESTAMPTZ
)
```

### Podcast distribution pipeline

After audio is generated and uploaded to R2, `/podcast` runs three optional distribution phases:

**RSS.com** (`podcast-upload.ts` → `uploadToRSSCom()`)
- Presigned URL upload + episode creation via RSS.com API v4
- Handles all downstream distribution: Apple Podcasts, Spotify, Google Podcasts, Amazon Music
- Requires `RSS_COM_API_KEY` and `RSS_COM_PODCAST_ID` in `.env`
- Marks `rsscom_published = true` in DB

**Ghost embed** (`podcast-ghost.ts`)
- Requires `GHOST_ADMIN_API_URL` and `GHOST_ADMIN_API_KEY` in `.env`
- Key format: `{id}:{hex_secret}` — Ghost Admin → Integrations → Custom Integration
- Fetches the source blog post by slug (extracted from `source_blog_url`)
- Prepends an HTML5 `<audio>` card with neo-brutalist styling (cream background, thick border)
- Uses the R2 audio URL — NOT the RSS.com URL — for reliable direct MP3 playback
- Updates the post via Ghost Admin API v5 (PUT with `updated_at` for optimistic locking)
- Marks `ghost_embedded = true` in DB

**YouTube video** (`podcast-youtube.ts`)
- Renders a 1920×1080 branded background PNG via Puppeteer (same neo-brutalist brand)
- Stitches static background + podcast MP3 → H.264/AAC MP4 via FFmpeg
- Uploaded to R2 at `podcast/videos/[slug]-[timestamp].mp4`
- NOT uploaded to YouTube by this pipeline — queued to Postgres for n8n or manual upload
- Marks `youtube_queued = true` in DB

### Podcast env vars

| Variable | Purpose |
|----------|---------|
| `GHOST_ADMIN_API_URL` | Ghost site URL (e.g. `https://blog.antekautomation.com`) |
| `GHOST_ADMIN_API_KEY` | Admin API key in `{id}:{hex_secret}` format |
| `RSS_COM_API_KEY` | RSS.com API key (Network plan — dashboard → API Access) |
| `RSS_COM_PODCAST_ID` | RSS.com podcast/show ID |

---

## SOCIAL CARDS

### /cards slash command

Generates neo-brutalist branded social media image cards from blog posts using Puppeteer. Self-hosted alternative to Blotato image templates — no API dependency, instant generation, fully on-brand. Same design system as Shorts frames and GBP images.

**Flags:**
- `--url <url>` — specific blog post URL (default: latest from RSS)
- `--sizes landscape,square,portrait` — which sizes to render (default: all three)
- `--types stat,quote,tip,listicle,cta` — which card types to include (default: all applicable)
- `--count <n>` — max cards to generate before the mandatory CTA card (default: 6)

**Output sizes:**
| Size | Dimensions | Target platform |
|------|-----------|----------------|
| `landscape` | 1200×628px | LinkedIn feed posts |
| `square` | 1080×1080px | Instagram feed, Facebook, X/Twitter |
| `portrait` | 1080×1350px | Instagram feed (taller, more real estate) |

**Card types (5 templates):**
| Type | Content | Notes |
|------|---------|-------|
| `stat` | Large number + supporting text + source | Only if post has a compelling stat |
| `quote` | Pull quote (max 20 words) + attribution | "— Andy Norman, Antek Automation" |
| `tip` | Tip text (max 15 words) + topic tag | Numbered (01/03) for carousel series |
| `listicle` | Title + 3-4 bullet points | Landscape: 2-column layout |
| `cta` | Hardcoded Antek brand closer | Always included, never extracted from post |

**Pipeline:**
1. Fetch blog post from RSS or `--url`
2. Claude Code extracts: 1 stat (if compelling), 1 quote, 2-3 tips, 1 listicle, 1 CTA
3. Validate with `parseCardContents()`
4. `renderAllCards()` renders each card × each size via Puppeteer → PNG
5. PNGs saved to `output/cards/[slug]_[type]_[size].png`

**Files:**
| File | Purpose |
|------|---------|
| `cards-types.ts` | TypeScript interfaces: CardType, CardSize, StatContent, QuoteContent, TipContent, ListicleContent, CTAContent, CardOutput |
| `generate-cards.ts` | `buildCardsPrompt()` + `parseCardContents()` — extracts and validates card content from blog |
| `cards-render.ts` | Puppeteer rendering engine: 5 templates × 3 size layouts, `renderCard()`, `renderAllCards()` |

**Design system (consistent with Shorts frames and GBP images):**
- No rounded corners anywhere — sharp edges only
- Brand palette: coral #CD5C3C, cream #E8DCC8, sage #C8D8D0, charcoal #2C2C2C
- Thick borders (3-4px), offset shadows via overlapping rectangles
- Inter font at 900-weight headings, 600-weight body (loaded from Google Fonts)
- Asymmetric layouts, geometric blocks bleed to edges
- Antek branding block present on every card

**Using cards with /run or /schedule:**
Generated PNGs can replace Blotato media creation. `template-mapping.ts` exports:
- `LOCAL_CARDS_DIR` — path to `output/cards/`
- `findLocalCard(slug, size, type?)` — returns matching PNG path if it exists

To use: upload card PNG to R2, then pass the CDN URL as `mediaUrls` in `blotato_create_post` instead of calling `blotato_create_visual`. Tip cards numbered as a series are designed for LinkedIn carousel posts.

**File naming convention:** `[blog-slug]_[type]_[size].png`
Example: `missed-calls-guide_stat_landscape.png`

---

## PERSONAL PIPELINE

### /personal slash command

28-day personal social calendar for Andy's **personal** LinkedIn / X / Facebook / Instagram (not company pages). Reads `https://blog.antekautomation.com/sitemap-posts.xml`, rotates four content formats across 28 days, produces a unified preview, and hands off media + scheduling to Blotato MCP.

**Four-format rotation (one per day, cycles):**
1. **Text post** — LinkedIn / X / Facebook / Instagram caption (no media)
2. **Image post** — same caption + branded hook card (landscape 1200×628 LinkedIn, square 1080×1080 IG/FB/X)
3. **Reel / Short** — vertical 1080×1920 video via the existing shorts pipeline
4. **Landscape YouTube video** — ~2-minute 1920×1080 video via `generate-youtube-video.ts` + `youtube-video-frames.ts`

**Posting target:** Andy's personal accounts via Blotato — same `accountId` as company (14687 LI, 22303 FB) but **NO `pageId`** → posts hit personal feed instead of company page. Twitter/Instagram have no page split.

**Key files:**
| File | Purpose |
|------|---------|
| `personal-types.ts` | `PersonalContentIdea`, `PersonalVariant`, `content_format` enum |
| `personal-cli.ts` | Reads `personal-content.json`, applies scheduling (08:00 UK, 28 days), opens `personal-preview.html` |
| `sitemap-scanner.ts` | Fetches + parses `sitemap-posts.xml`, returns sorted URL list, filters drafts |
| `personal-image-gen.ts` | Puppeteer rendering of landscape + square hook cards, R2 upload |
| `personal-images-run.ts` | Standalone runner: reads `personal-content.json` → generates + uploads all 28 hook cards → writes `personal-image-urls.json` |
| `youtube-video-types.ts` | `YTVideoScript`, `YTSlide`, `YTSlideType` |
| `generate-youtube-video.ts` | Prompt + `parseYTVideoScript()` validator + hardcoded `YT_CTA_VOICEOVER` |
| `youtube-video-frames.ts` | Puppeteer renderer for 1920×1080 landscape slide PNGs |

**Workflow:**
1. `/personal` (slash command) scans sitemap, generates 28 ideas in 4-format rotation → writes `personal-content.json`
2. `npx tsx personal-images-run.ts` generates + uploads all hook cards → `personal-image-urls.json`
3. `npm run personal` opens `personal-preview.html` for review
4. For Reels / YouTube videos: invoke shorts pipeline + `generate-youtube-video.ts` per applicable idea
5. Blotato MCP `blotato_create_post` per idea × platform — **omit `pageId`** to post to personal accounts

---

## ONE-OFF UTILITIES

| Script | Output |
|--------|--------|
| `generate-banner.ts` | `images/banner.png` — 1280×640 neo-brutalist GitHub repo banner |
| `podcast-batch-run.ts` | Batch-processes every JSON in `podcast-scripts/`: validate → Fish Audio → R2 → RSS.com → DB. Flags: `--dry-run`, `--skip-to N` |
| `content-images-run.ts` | Reads `content.json`, renders landscape + square hook cards per idea via `personal-image-gen.ts`, uploads to R2 → `content-image-urls.json` keyed by `idea_id` |
| `weekly-cards-run.ts` | Reads `content.json` (7 ideas), renders 3 sizes per idea via `cards-render.ts`, uploads to R2 → `weekly-card-urls.json` keyed by `idea_id` |
| `personal-images-run.ts` | Renders + uploads all 28 personal hook cards → `personal-image-urls.json` |
| `shorts-batch-run.ts` | Batch-processes every script in `shorts-scripts/` |

---

## INTEGRATION CONTEXT

This project is part of a larger content pipeline:
- **WF1/WF2**: RSS discovery → brief generation → approval
- **This project**: approved briefs → social posts → Blotato MCP media + scheduling
- **WF3**: full blog post → Ghost CMS
