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
npm run build                         # compile TypeScript → dist/
npm run preview:fast                  # fastest test: content-only preview
npm run generate                      # load content.json, assign templates, preview
npm run generate:from-db              # pull approved briefs from PostgreSQL
npm run generate -- --count 7         # custom idea count
npm run generate -- --platforms linkedin,facebook
npm run generate -- --pillar voice_ai
npm run generate -- --category tip    # force content category
npm run generate -- --start 2026-03-20  # custom start date
npm run generate -- --preview-only    # preview without template assignment
```

---

## SLASH COMMANDS

| Command | What it does |
|---------|-------------|
| `/run` | Full pipeline: fetch RSS, generate content.json, build, preview, create visuals, schedule all posts |
| `/content` | Content only: fetch RSS, generate content.json, verify UK grammar |
| `/schedule` | Visuals + scheduling only: create media from templates, schedule posts via Blotato MCP |

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
5. LinkedIn `first_comment` includes the full blog URL

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

Primary: UK service-based businesses, 1-50 staff, owner-operated or founder-led, aged 30-60.

Verticals (rotate across content — trades are ONE vertical, not the whole focus):
- Professional services: accountants, solicitors, surveyors, consultants, IFAs
- Property and facilities: letting agents, property managers
- Health and wellness: physio clinics, dental practices, vets, beauty salons
- Trades and construction: plumbers, electricians, builders
- Business services: recruitment, IT support, training companies, cleaning contractors
- Hospitality: restaurants, hotels, catering, coffee shops
- Care and education: nurseries, care homes, tutoring centres

Pain points: time-poor, sceptical of AI, missing enquiries, admin overload, staff costs.

---

## VOICE & TONE

### Non-negotiables
- **UK English always**: colour, organise, whilst, realise, licence, programme, maths, practise, enquiry
- Contractions fine: "I've", "it's", "you're", "won't"
- No em-dashes — LinkedIn/mobile renders them poorly
- Never: "game-changing", "revolutionary", "leverage", "synergy", "empower", "unleash"
- Never: "In today's fast-paced world", "I'm excited to share", "Let that sink in."
- Never: "utilise" (use "use"), "solution" when you can name the actual thing
- Never: American spellings

### Words that work
- "miss", "missed", "gone to a competitor"
- "saves you", "gets you back", "means you can"
- Specific numbers: "3 missed enquiries", "4 hours a week", "£200 in lost jobs"
- "small business", "service business", "your team", "your clients"
- "after hours", "while you're with a client", "when you're busy"

---

## CONTENT PILLARS

| Pillar | Topics | Andy's angle |
|--------|--------|-------------|
| ai_automation | Missed enquiries, follow-up automation, admin reduction, CRM, quote automation | "30 years watching service businesses struggle with the same problems. AI is finally the affordable fix." |
| voice_ai | AI receptionist, call handling, 24/7 availability, never miss a lead, chatbots | Certified Retell AI Partner — builds these for real businesses, not demos. |
| growth_digital | Local SEO, Google rankings, website conversion, GEO, AI content | Built these systems for clients and seen the before/after firsthand. |

---

## PLATFORM RULES

| Platform | Limit | Style | Links | Hashtags |
|----------|-------|-------|-------|----------|
| LinkedIn | 1,300 chars | Professional but human. Short paragraphs. Hook must compel "see more" click. | NO links in body (kills reach). Links in `first_comment` only. | Max 5 at end |
| X (Twitter) | 280 chars HARD | Single idea. Punchy. First 5 words must land. | Fine in body | 1-2 max or none |
| Facebook | ~40-100 words | Warm, conversational. Direct question at end. 1-2 emojis max. | Fine in body | 1-3 or none |
| Instagram | 150-300 visible | Visual-first. Caption supports image. 2-3 emojis natural. | N/A | 5-10 in `first_comment` |

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
    "image_prompt_landscape": "Flat vector illustration of a ringing phone going unanswered on a desk, warm cream background #E8DCC8, coral red accent #CD5C3C, sage green elements #C8D8D0, charcoal details #2C2C2C, no text, no faces, clean minimal style",
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
Always include: "Flat vector illustration, minimal and clean, professional business graphic, colour palette coral red #CD5C3C warm cream #E8DCC8 sage green #C8D8D0 dark charcoal #2C2C2C, no text overlaid, no faces or people, no photography, modern UK business aesthetic."

---

## BRAND PALETTE

- Coral/rust: #CD5C3C (primary)
- Cream: #E8DCC8 (background)
- Sage green: #C8D8D0 (secondary)
- Charcoal: #2C2C2C (text/elements)

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
| `DATABASE_URL` | PostgreSQL connection (--from-db mode only) |
| `DATABASE_SSL` | Set "false" to disable SSL (default: enabled) |

---

## INTEGRATION CONTEXT

This project is part of a larger content pipeline:
- **WF1/WF2**: RSS discovery → brief generation → approval
- **This project**: approved briefs → social posts → Blotato MCP media + scheduling
- **WF3**: full blog post → Ghost CMS
