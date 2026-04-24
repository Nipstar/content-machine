# Social Cards Generator

Generate neo-brutalist branded social media image cards from a blog post. Renders PNG files at 3 aspect ratios via Puppeteer — no Blotato API dependency, instant generation, fully on-brand.

5 card types: stat, quote, tip, listicle, cta
3 sizes: landscape (1200×628), square (1080×1080), portrait (1080×1350)

Output: `output/cards/[slug]_[type]_[size].png`

## Flags

- **`--url <url>`** — specific blog post URL (default: latest from RSS)
- **`--sizes <list>`** — comma-separated sizes to render: `landscape,square,portrait` (default: all three)
- **`--types <list>`** — comma-separated card types to include: `stat,quote,tip,listicle,cta` (default: all applicable)
- **`--count <n>`** — max number of cards to generate before the mandatory CTA card (default: 6)

## Steps

### Phase 1: Fetch blog content

1. **If `--url` was provided:** Fetch the page with WebFetch. Extract title and full article body (strip nav, footer, sidebar — keep all stats, data, and practical advice).

   **If no `--url`:** Fetch the RSS feed from `https://blog.antekautomation.com/rss/`. Use the most recent article URL. Fetch its full content with WebFetch.

2. Generate a URL-safe slug from the article title:
   ```
   slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").substring(0, 40)
   ```

3. Log: `Generating cards from: "[article title]" → slug: "${slug}"`

---

### Phase 2: Generate card content

4. Import the prompt builder:
   ```typescript
   import { buildCardsPrompt, parseCardContents } from "./generate-cards.js";
   ```

5. Call `buildCardsPrompt(blogTitle, blogContent)` to get the extraction prompt.

6. **Reason through the blog post yourself** — do NOT call an external AI API. You are the content extractor. Following the prompt as your brief:
   - Find the single most compelling stat (a number that stops the scroll). If none, skip the stat card.
   - Find the most insightful or provocative quote from the article (max 20 words).
   - Extract 2-3 actionable tips from the article's practical sections (max 15 words each, starts with a verb).
   - Build 1 listicle from the article's main points (title + 3-4 bullets, max 8 words each).
   - Always include 1 CTA card: `{ "type": "cta" }`.

   Rules:
   - British English throughout
   - All text must be self-contained — no context assumed
   - Stat must come from the actual post — do not invent numbers
   - Tip cards numbered as a series (01/03, 02/03, 03/03) if 3 or more tips
   - topic_tag in UPPERCASE (e.g. "VOICE AI", "AUTOMATION", "LEAD CAPTURE")
   - Total cards (excluding CTA): respect `--count` flag (default: 6 max)

7. Apply `--types` filter if provided: only include cards whose type is in the list. Always include the CTA card regardless of `--types`.

8. Write the card content JSON to `files/cards-content.json`. Validate with `parseCardContents(jsonStr)`. If validation throws, fix the issue and retry.

---

### Phase 3: Render PNG cards

9. Apply `--sizes` filter: only render the specified sizes (default: all three).

10. Create `files/cards-render-run.ts`:
    ```typescript
    import "dotenv/config";
    import { renderAllCards } from "./cards-render.js";
    import type { CardContent, CardSize } from "./cards-types.js";
    import { readFileSync, writeFileSync } from "fs";

    const contents = JSON.parse(readFileSync("cards-content.json", "utf-8")) as CardContent[];
    const sizes = JSON.parse(process.argv[2]) as CardSize[];
    const slug = process.argv[3];
    const outputs = await renderAllCards(contents, sizes, slug);
    writeFileSync("cards-output.json", JSON.stringify(outputs));
    console.log(`CARDS_DONE count=${outputs.length}`);
    ```

11. Run: `cd files && npx tsx cards-render-run.ts '["landscape","square","portrait"]' '<slug>'`
    (Pass only the requested sizes in the first argument.)

12. Read `files/cards-output.json` to get the list of generated PNG paths.

13. Delete `files/cards-render-run.ts`.

---

### Phase 4: Clean up and report

14. Delete temp files: `cards-content.json`, `cards-output.json`

15. Print results:

```
✅  Social cards generated

  Source:  "[article title]"
  Slug:    [slug]
  Output:  files/output/cards/

  Generated N cards (N types × N sizes):

  STAT CARD
    ✓ [slug]_stat_landscape.png  (1200×628)
    ✓ [slug]_stat_square.png     (1080×1080)
    ✓ [slug]_stat_portrait.png   (1080×1350)

  QUOTE CARD
    ✓ [slug]_quote_landscape.png
    ...

  TIP CARD (01/03)
    ✓ [slug]_tip_landscape.png
    ...

  LISTICLE CARD
    ...

  CTA CARD
    ✓ [slug]_cta_landscape.png
    ...

  To use these cards with /schedule:
  Pass the image paths as mediaUrls when calling blotato_create_post,
  or upload to R2 first and use the CDN URL.
```

---

## Using generated cards with /schedule or /run

To use a locally generated card as the image for a social post instead of a Blotato template:
1. Optionally upload the PNG to R2 using the `uploadToR2` function from `gbp-image-gen.ts` (or any R2 helper in the project).
2. Pass the R2 URL as `mediaUrls` in the `blotato_create_post` call instead of using `blotato_create_visual`.
3. Alternatively, pass the local file path directly to Blotato's `blotato_create_source` (if it supports file uploads).

Tip cards numbered as a series (01/03, 02/03, 03/03) are designed for carousel posts on LinkedIn — each tip is a separate slide image.

---

## Important

- Neo-brutalist design: no rounded corners on anything. Sharp edges only.
- All templates consistent with Shorts frames and GBP images — same brand palette, same visual language
- Landscape (1200×628): optimised for LinkedIn — text large enough to read without clicking
- Square (1080×1080): safe zone 40px from edges — works for Instagram grid and X/Twitter
- Portrait (1080×1350): use extra height for breathing room, not more content
- CTA card content is always hardcoded — never extracted from the blog post
- Tip cards with matching tip_number values create a natural carousel sequence
- Puppeteer loads Inter from Google Fonts — internet connection required during rendering
- `dotenv` must be installed in `files/`: `npm install dotenv`
- No database queuing — cards are generated on demand and used directly
