# GBP Post Generator

Generate Google Business Profile posts from blog RSS, create branded neo-brutalist images via Puppeteer, upload to R2, and queue in PostgreSQL for n8n to post.

## Flags

- `--count N` (default 14) — number of GBP posts to generate
- `--frequency daily|alternate` (default alternate) — post every day or every 2 days
- `--start YYYY-MM-DD` (default tomorrow) — first post date

## Steps

### Phase 1: Fetch blog content

1. Fetch the RSS feed from `https://blog.antekautomation.com/rss/`
2. Fetch full article content from each blog URL using WebFetch
3. Collect article titles, URLs, and key content for post generation

### Phase 2: Generate GBP posts

4. Generate $ARGUMENTS posts (default 14) from the blog articles, 2-4 different angles per article:
   - **Stat highlight**: Lead with a specific number, percentage, or data point from the article
   - **Practical tip**: Extract an actionable takeaway the reader can use immediately
   - **Question hook**: Open with a question that the article answers
   - **CTA-driven**: Focus on a specific outcome or benefit, drive to the blog post

5. Each post MUST follow these GBP content rules:
   - Max 1500 characters
   - Strong opening line (this shows in Google search results)
   - Include specific data, numbers, tool names from the blog articles
   - Informative, not salesy — same voice as `files/CLAUDE.md`
   - Andy's persona: direct, practical, UK English throughout
   - NO phone numbers in post text (Google rejects these)
   - NO em-dashes (use hyphens or rewrite)
   - Include local keywords naturally: "UK small business", "service business", location-relevant terms
   - End with a clear call to action
   - CTA mapping: blog links = LEARN_MORE, phone-related = CALL, booking-related = BOOK
   - These are "What's New" type GBP update posts

6. Rotate content across:
   - All 3 pillars (ai_automation, voice_ai, growth_digital)
   - Multiple verticals (accountants, plumbers, dentists, solicitors, etc.)
   - Different post angles (stat, tip, question, CTA)

7. Assign `template_variant` rotating through: `stat`, `tip`, `quote`, `question`

8. Assign scheduling: every day or every 2 days at 08:00 UK time, starting from tomorrow (or --start date)

9. For each post, generate an `image_data` object matching its `template_variant`:

   **stat** template:
   ```json
   { "stat_number": "73%", "stat_context": "of missed calls never ring back", "supporting_line_1": "That's revenue walking out the door.", "supporting_line_2": "An AI receptionist catches every one." }
   ```

   **tip** template:
   ```json
   { "tip_headline": "Check your missed call log from last Tuesday.", "tip_detail_1": "Count the ones that came in while you", "tip_detail_2": "were with a client. That's your number." }
   ```

   **quote** template:
   ```json
   { "quote_line_1": "I spent 30 years watching", "quote_line_2": "service businesses lose money", "quote_line_3": "to missed calls.", "continuation_1": "AI finally makes the fix affordable", "continuation_2": "for a one-person operation." }
   ```

   **question** template:
   ```json
   { "question_line_1": "What happens to", "question_line_2": "your enquiries", "question_line_3": "after 5pm?", "supporting_line_1": "62% of customer calls to small", "supporting_line_2": "businesses happen outside office hours." }
   ```

   CRITICAL: The image_data content MUST be derived from the actual blog articles - real data, real stats, real tips. Not generic filler. Keep lines short enough to fit the card layouts.

10. Write all posts to `files/gbp-queue.json` using the GBPPost schema:
    ```json
    {
      "id": "uuid",
      "post_text": "the full post text",
      "image_url": "",
      "cta_type": "LEARN_MORE",
      "cta_url": "https://blog.antekautomation.com/...",
      "source_url": "https://blog.antekautomation.com/...",
      "scheduled_date": "2026-03-29T07:00:00.000Z",
      "scheduled_display": "Sat 29 Mar at 08:00",
      "status": "queued",
      "topic": "Article title",
      "pillar": "ai_automation",
      "template_variant": "stat",
      "image_data": { ... }
    }
    ```

### Phase 3: Generate branded images with Puppeteer

11. Create a temporary runner script (`files/gbp-run.ts`) that:
    - Loads `.env` variables
    - Reads `gbp-queue.json`
    - For each post, calls `renderGBPImage(post)` from `files/gbp-image-gen.ts`
    - Uploads the PNG buffer to R2 via `uploadToR2(buffer, filename)`
    - Updates each post's `image_url` with the R2 public URL
    - Writes updated `gbp-queue.json` back to disk

12. Run the script: `npx tsx gbp-run.ts` from the `files/` directory

13. The image generator uses Puppeteer to render HTML/CSS templates at 1200x900px (2x device scale). It loads Inter from Google Fonts. 4 neo-brutalist template variants:
    - **Stat card**: Sage background, cream card with charcoal offset shadow, massive coral stat number
    - **Tip card**: Charcoal background, coral TIP block, cream card with coral border
    - **Quote card**: Cream background, coral left strip, giant faded quote mark, attribution
    - **Question card**: Charcoal background, coral accent block with "?", massive question in cream/coral

14. Delete the runner script after completion

### Phase 4: Queue in PostgreSQL

15. Ensure the `gbp_post_queue` table exists (auto-creates if missing, includes `template_variant` column)
16. Clear any existing `queued` posts to avoid duplicates
17. Insert all posts into PostgreSQL

To insert into the database, use the functions from `files/gbp-db.ts`:
```
import { ensureGBPTable, insertGBPPosts } from "./gbp-db.js";
```

### Phase 5: Report

18. Show a summary table with columns: scheduled_date | topic | template_variant | cta_type | image_url | status
19. Report: "X posts queued from [start_date] to [end_date]. n8n WF7 will post them automatically."

## Important

- All content follows voice, tone, and persona rules in `files/CLAUDE.md` — Andy's voice, UK English, informative not salesy
- GBP posts are separate from social media posts — different content, different scheduling, different rules
- The GBP API posting itself is handled by n8n WF7, not this project
- Images are rendered via Puppeteer from HTML/CSS templates — neo-brutalist style, no rounded corners, no gradients
- Brand palette: coral #CD5C3C, cream #E8DCC8, sage #C8D8D0, charcoal #2C2C2C
- R2 environment variables must be set: R2_ACCOUNT_ID, R2_API_TOKEN, R2_BUCKET_NAME, R2_PUBLIC_URL
- DATABASE_URL must be set for PostgreSQL insertion
