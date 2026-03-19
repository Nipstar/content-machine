# Full Social Content Machine Run

Run the complete content pipeline: generate content from blog RSS, build preview, create visuals, and schedule all posts.

## Steps

### Phase 1: Generate content.json

1. Fetch the RSS feed from `https://blog.antekautomation.com/rss/`
2. Fetch full article content from each blog URL using WebFetch
3. Generate 14 content ideas sourced from the real blog articles following all guidelines in `files/CLAUDE.md`
4. Each idea needs: topic, hook, pillar, content_category, source_url, 4 platform variants (linkedin, twitter, facebook, instagram), image prompts, video prompt
5. Include `source_url` field linking back to the blog post
6. LinkedIn `first_comment` includes the full blog URL
7. Instagram `first_comment` includes 5-10 hashtags
8. Write the array to `files/content.json`
9. Verify UK English grammar across all content

### Phase 2: Build and preview

1. Run `cd files && npm run build` to compile TypeScript
2. Run `npm run generate` to assign Blotato templates and generate HTML preview
3. Tell the user the preview is open and wait for their approval before continuing

### Phase 3: Create visuals and schedule (only after user says "go for it" or similar)

1. Call `blotato_list_visual_templates` to get template IDs
2. Call `blotato_list_accounts` to confirm account IDs
3. Map each idea's `blotato_template` to the correct template ID
4. Create visuals for all 14 ideas using `blotato_create_visual` with the content from each idea
5. Poll `blotato_get_visual_status` until all visuals are done
6. Schedule all 56 posts (14 ideas x 4 platforms) using `blotato_create_post`:
   - LinkedIn: accountId 14687, pageId 110656388
   - Twitter/X: accountId 13863
   - Facebook: accountId 22303, pageId 999920689867882
   - Instagram: accountId 34604
   - Use `scheduledTime` from each variant's `scheduled_at`
   - Pass media URLs from the created visuals
7. Report the total posts scheduled, date range, and any failures

## Important

- All content must follow voice, tone, and platform rules in `files/CLAUDE.md`
- Content must be informative, not salesy. Share real data from the blog articles.
- UK English throughout. No em-dashes. No hype words.
- LinkedIn: no links in body (links go in first_comment only)
- X/Twitter: 280 char hard limit
- Wait for user approval after preview before scheduling
