# Antek Automation — Social Content Machine v6

**Stack:** Claude Code (content) → Blotato MCP (media + scheduling) → LinkedIn / X / Facebook / Instagram

One command. Up to 14 ideas. 56 posts. 14 days. All four platforms queued.

---

## How It Works

```
npm run generate                       npm run generate:from-db
        │                                       │
        │ (invents from pillars)                │ (pulls from PostgreSQL)
        └──────────────┬────────────────────────┘
                       ↓
         Claude Code generates content.json
         4 platform variants per idea
         (LinkedIn / X / Facebook / Instagram)
         + image prompts + video prompt
                       ↓
         npm run generate
         → assigns Blotato templates
         → generates HTML preview
         → opens in browser
                       ↓
         Review preview (tabbed by platform, char counts)
                       ↓
         Claude Code uses Blotato MCP to:
         → create visuals from templates
         → schedule posts across all platforms
         1/day per platform at 08:00 UK time over 14 days
```

---

## Slash Commands (Claude Code)

| Command | What it does |
|---------|-------------|
| `/run` | Full pipeline: fetch RSS, generate content.json, build, preview, create visuals, schedule all posts |
| `/content` | Content only: fetch RSS, generate content.json, verify UK grammar |
| `/schedule` | Visuals + scheduling only: create media from templates, schedule posts via Blotato MCP |

Custom commands are defined in `.claude/commands/`.

---

## Content Sources

### From RSS feed (preferred for informative content)
Claude Code fetches blog articles from `https://blog.antekautomation.com/rss/`, reads the full content, and repurposes insights into value-first social posts with `source_url` linking back.

### From database: `npm run generate:from-db`
Reads approved article briefs from the PostgreSQL `articles` table (populated by WF2 in the blog pipeline). Each brief has an angle, key points, and target keyword. After scheduling, articles are marked `social_queued`.

**Requires:** `DATABASE_URL` in `.env`

### From pillars: `npm run generate`
Claude Code invents ideas fresh based on the three content pillars in `CLAUDE.md`. Use for opinion posts, polls, and awareness content not tied to a specific article.

---

## Setup

### 1. Install
```bash
cd files
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in your values
```

### 3. Required environment variables

| Variable | Where to get it | Required for |
|----------|----------------|-------------|
| `BLOTATO_API_KEY` | app.blotato.com → Settings → API | Media + scheduling |
| `LINKEDIN_ACCOUNT_ID` | Blotato → Connected Accounts → LinkedIn UUID | Scheduling |
| `TWITTER_ACCOUNT_ID` | Blotato → Connected Accounts → X UUID | Scheduling |
| `FACEBOOK_ACCOUNT_ID` | Blotato → Connected Accounts → Facebook UUID | Scheduling |
| `INSTAGRAM_ACCOUNT_ID` | Blotato → Connected Accounts → Instagram UUID | Scheduling |
| `DATABASE_URL` | PostgreSQL connection string | `--from-db` mode |
| `DATABASE_SSL` | Set "false" to disable SSL | `--from-db` mode |

### 4. Claude Code MCP
The `.claude/settings.json` file registers the Blotato MCP server. Claude Code uses this for all media creation and post scheduling — no direct API calls needed.

---

## Commands

| Command | What it does |
|---------|-------------|
| `npm run build` | Compile TypeScript → dist/ |
| `npm run generate` | Pillar-based: load content.json → assign templates → preview |
| `npm run generate:from-db` | DB-based: pull approved briefs → same pipeline |
| `npm run generate:from-db:preview` | DB briefs → preview only |
| `npm run preview` | Pillar-based generate + preview |
| `npm run preview:fast` | Content only, fastest test |
| `npm run generate:7` | 7 ideas instead of 14 |
| `npm run generate:linkedin-only` | LinkedIn only |
| `npm run generate:voice` | Voice AI pillar only |
| `npm run generate:automation` | AI Automation pillar only |
| `npm run generate:growth` | Growth & Digital pillar only |

### Custom flags
```bash
npm run generate -- --count 10
npm run generate -- --platforms linkedin,facebook
npm run generate -- --pillar voice_ai --count 7
npm run generate -- --category tip
npm run generate -- --start 2026-03-25
npm run generate -- --preview-only
```

---

## Platform Specs

| Platform | Max chars | Hashtags | Links in body |
|----------|-----------|---------|--------------|
| LinkedIn | 1,300 | 5 max, in post | No — first comment only |
| X/Twitter | **280 hard** | 1-2 inline | Yes |
| Facebook | ~500 sweet spot | 1-3 or none | Yes |
| Instagram | 150-300 visible | 5-10 in first comment | No |

---

## Image Style

All images: Flat vector illustration, brand palette (coral #CD5C3C / cream #E8DCC8 / sage #C8D8D0 / charcoal #2C2C2C), no faces, no text overlaid, no photography.

Blotato visual templates handle image/infographic/carousel creation based on content category.

---

## Your Weekly Routine

**Every two weeks:**
```bash
# Quickest option — one slash command does everything:
/run

# Or step by step:
/content                    # generates content.json from blog RSS
npm run generate            # assigns templates, opens preview
/schedule                   # creates visuals + schedules all posts
```

1. `/run` (or `/content`) generates `content.json` with 14 ideas across all platforms
2. `npm run generate` assigns templates, opens HTML preview
3. Review platform tabs, check char counts, confirm content
4. `/schedule` (or say "go for it") creates visuals + schedules all posts
5. Done for two weeks

**Ongoing:**
- Respond to comments (the machine posts, you engage)
- Check Blotato dashboard if anything flagged
- Monthly: review what performed, update `CLAUDE.md` with new angles

---

## Integration with WF1-WF6

```
WF1 (Research & Discovery)
  → scrapes RSS feeds, stores articles (status: discovered)

WF2 (Brief Generation & Approval)
  → generates briefs, emails Andy, awaits approval (status: approved)

Social Content Machine (this project)
  → npm run generate:from-db
  → pulls approved articles
  → generates + schedules social posts via Blotato MCP
  → marks articles status = 'social_queued'

WF3 (Article Write & Publish)
  → writes full blog post → Ghost CMS
```

---

## Troubleshooting

**"No approved briefs found"** — Run WF2 manually in n8n, or approve briefs from the email. Or use `npm run generate` (pillar mode) instead.

**X/Twitter posts over 280 chars** — The preview flags these in orange/red. Regenerate content with shorter X copy.

**Blotato MCP auth error** — Check `BLOTATO_API_KEY` in `.env` and `.claude/settings.json`.
