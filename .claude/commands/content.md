# Generate Content Only

Generate content.json from blog RSS feed without building or scheduling.

## Steps

1. Fetch the RSS feed from `https://blog.antekautomation.com/rss/`
2. Fetch full article content from each blog URL using WebFetch
3. Generate 14 content ideas sourced from the real blog articles following all guidelines in `files/CLAUDE.md`
4. Each idea needs: topic, hook, pillar, content_category, source_url, 4 platform variants (linkedin, twitter, facebook, instagram), image prompts, video prompt
5. Include `source_url` field linking back to the blog post
6. LinkedIn `first_comment` includes the full blog URL
7. Instagram `first_comment` includes 5-10 hashtags
8. Write the array to `files/content.json`
9. Verify UK English grammar across all content
10. Show a summary table of all 14 ideas (pillar, category, topic)

## Important

- All content must follow voice, tone, and platform rules in `files/CLAUDE.md`
- Content must be informative, not salesy. Share real data from the blog articles.
- UK English throughout. No em-dashes. No hype words.
- Rotate across all 3 pillars and all content categories
- Rotate across verticals (not just trades)
