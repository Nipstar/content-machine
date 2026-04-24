# /personal — Personal Social Content Pipeline

Scans the blog sitemap, generates personal LinkedIn + X + Facebook + Instagram text posts,
then generates Reels (YouTube Shorts / Instagram Reels / Facebook Reels) for each post.

**Personal LinkedIn posts to Andy's personal profile — NOT the company page.**
Same Blotato account (14687) but NO pageId in the API call.

---

## STEP 1 — Parse flags

Supported flags (passed after the command):
- `--count N` — number of blog posts to process (default: 7)
- `--url <url>` — process a single specific blog post (skip sitemap scan)
- `--start YYYY-MM-DD` — override scheduling start date (default: tomorrow)
- `--text-only` — skip Reels generation (text posts only)
- `--reels-only` — skip text posts (Reels only, uses existing shorts pipeline)
- `--platforms youtube,instagram,facebook` — which platforms for Reels (default: youtube,instagram,facebook)

---

## STEP 2 — Get blog post URLs

### If --url was passed:
Use that single URL. Skip to Step 3.

### Otherwise — scan sitemap:
Fetch `https://blog.antekautomation.com/sitemap-posts.xml`.
Parse all `<loc>` URLs. Filter out any containing `parse-error`.
Sort by `<lastmod>` descending (newest first).
Take the first N URLs (where N = --count value).

---

## STEP 3 — Fetch blog post content

For each URL, use WebFetch to read the full blog post.
Extract: title, main body, key stats/data points, practical tips, any specific numbers or tool names.

---

## STEP 4 — Generate personal-content.json

Write `files/personal-content.json` as a JSON array of PersonalContentIdea objects.

**One idea per blog post URL.**

### Schema (exact):

```json
[
  {
    "idea_id": "personal_0",
    "source_url": "https://blog.antekautomation.com/post-slug/",
    "slug": "post-slug",
    "topic": "One-line description of the post topic",
    "hook": "The opening line — must compel the scroll-stop",
    "pillar": "ai_automation",
    "content_category": "tip",
    "variants": {
      "personal_linkedin": {
        "body": "Full personal LinkedIn post — see rules below",
        "first_comment": "Full article: https://blog.antekautomation.com/post-slug/",
        "hashtags": ["#AI", "#SmallBusiness", "#UKBusiness"],
        "scheduled_at": "",
        "scheduled_display": ""
      },
      "twitter": {
        "body": "280-char max X post",
        "scheduled_at": "",
        "scheduled_display": ""
      },
      "facebook": {
        "body": "Personal Facebook post — warm, conversational, ends with question",
        "scheduled_at": "",
        "scheduled_display": ""
      },
      "instagram": {
        "body": "Instagram caption — visual-first, 150-300 chars visible",
        "first_comment": "#AI #SmallBusiness #UKBusiness #AIAutomation #ServiceBusiness",
        "scheduled_at": "",
        "scheduled_display": ""
      }
    }
  }
]
```

Do NOT populate `scheduled_at` or `scheduled_display` — the CLI fills these.

---

## PERSONAL CONTENT RULES

### Voice — more personal than company page

Andy speaks as a person, not as "Antek Automation". This is his personal profile.

**DO:**
- "I've been thinking about..." / "Something I noticed this week..."
- "In my experience running businesses..." / "I've seen this firsthand..."
- Share the learning, not the service
- Disagree with things. Have a take.
- Reference 30 years in managed print when it adds credibility
- First person throughout

**DON'T:**
- "Antek Automation offers..." — no company promotion
- Generic "AI is transforming..." openers
- Salesy CTAs — "check us out" / "book a call" are wrong here
- Em-dashes
- American spellings

### Personal LinkedIn (1,300 chars max)
- Hook line must work WITHOUT "see more" context — it IS the preview
- Short paragraphs (2-3 lines max)
- White space is engagement
- Personal opinion or surprising insight in first line
- Blog link ONLY in first_comment, never in body
- Max 5 hashtags, placed at the very end of body

### X/Twitter (280 chars hard limit — count every character)
- One sharp observation or counterintuitive point
- First 5 words decide whether anyone reads the rest
- Include blog URL if it fits — if not, skip it

### Facebook (personal, NOT business page)
- Warm and direct — like talking to a mate
- End with a genuine question to spark comments
- 40-80 words sweet spot
- 1-2 emojis maximum, only if natural

### Instagram
- Visual-first caption — the image carries the message
- Caption supports and expands, doesn't repeat
- 2-3 natural emojis
- Hashtags go in first_comment (not body)

---

## STEP 5 — Run personal CLI

```bash
cd files && npm run personal
```

This applies scheduling (08:00 UK, 1/day from tomorrow) and opens `personal-preview.html` in the browser.

Check: character counts, tone matches Andy's personal voice, scheduling dates look correct.

---

## STEP 6 — Schedule text posts via Blotato MCP

Read enriched `personal-content.json` (now has `scheduled_at` values).

For each idea, call `blotato_create_post` per platform:

### Personal LinkedIn (CRITICAL — no pageId)
```
blotato_create_post({
  accountId: 14687,
  platform: "linkedin",
  // NO pageId — this posts to personal profile, not company page
  text: idea.variants.personal_linkedin.body,
  scheduledTime: idea.variants.personal_linkedin.scheduled_at
})
```

If first_comment exists, create a follow-up post or note it for manual addition.

### X/Twitter
```
blotato_create_post({
  accountId: 13863,
  platform: "twitter",
  text: idea.variants.twitter.body,
  scheduledTime: idea.variants.twitter.scheduled_at
})
```

### Facebook (personal profile, not page)
```
blotato_create_post({
  accountId: 22303,
  platform: "facebook",
  // NO pageId — personal profile
  text: idea.variants.facebook.body,
  scheduledTime: idea.variants.facebook.scheduled_at
})
```

### Instagram
```
blotato_create_post({
  accountId: 34604,
  platform: "instagram",
  text: idea.variants.instagram.body,
  scheduledTime: idea.variants.instagram.scheduled_at
})
```

---

## STEP 7 — Generate Reels (skip if --text-only)

For each source_url, run the Shorts pipeline to produce a Reel:

```bash
cd files && npm run shorts -- --url <source_url> --platforms youtube,instagram,facebook
```

This produces a 6-slide vertical MP4 (1080×1920), uploads to R2, and schedules to YouTube Shorts,
Instagram Reels, and Facebook Reels via Blotato MCP.

**Reel scheduling offset:** Schedule Reels 1 day after the text post for the same article,
so the video gets separate algorithmic reach rather than competing with the text post.

If `--reels-only` was passed, run this step for all URLs and skip Steps 4-6.

---

## STEP 8 — Report

Tell Andy:
- How many text posts scheduled (per platform)
- How many Reels generated and scheduled
- Date range covered
- Any failures with the specific error

---

## BLOTATO ACCOUNT REFERENCE

| Platform | Account ID | pageId | Where it posts |
|----------|-----------|--------|----------------|
| LinkedIn personal | 14687 | NONE | Andy's personal LinkedIn feed |
| LinkedIn company | 14687 | 110656388 | Antek Automation company page |
| X/Twitter | 13863 | — | @AntekAutomation |
| Facebook personal | 22303 | NONE | Andy's personal FB profile |
| Facebook page | 22303 | 999920689867882 | Antek Automation FB page |
| Instagram | 34604 | — | @AntekAutomation |
| YouTube | 29641 | — | Antek Automation YouTube |
