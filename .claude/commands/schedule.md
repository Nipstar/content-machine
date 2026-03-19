# Schedule Posts from content.json

Create visuals and schedule all posts from the existing content.json via Blotato MCP. Run this after `npm run generate` has assigned templates and you've reviewed the preview.

## Steps

1. Read `files/content.json` to get all ideas with their `blotato_template` and `scheduled_at` values
2. Call `blotato_list_visual_templates` to get template IDs
3. Call `blotato_list_accounts` to confirm account IDs
4. Map each idea's `blotato_template` to the correct template ID:
   - Chalkboard Infographic: `fcd64907-b103-46f8-9f75-51b9d1a522f5`
   - Tweet Card Carousel Minimal: `/base/v2/tweet-card/ba413be6-a840-4e60-8fd6-0066d3b427df/v1`
   - Newspaper Infographic: `07a5b5c5-387c-49e3-86b1-de822cd2dfc7`
   - Top Secret Infographic: `b8707b58-a106-44af-bb12-e30507e561af`
   - Whiteboard Infographic: `ae868019-820d-434c-8fe1-74c9da99129a`
   - Breaking News: `8800be71-52df-4ac7-ac94-df9d8a494d0f`
   - Product Scene Placement: `f524614b-ba01-448c-967a-ce518c52a700`
5. Create visuals for all ideas using `blotato_create_visual`
6. Poll `blotato_get_visual_status` until all visuals are done
7. Schedule all posts (ideas x 4 platforms) using `blotato_create_post`:
   - LinkedIn: accountId 14687, pageId 110656388
   - Twitter/X: accountId 13863
   - Facebook: accountId 22303, pageId 999920689867882
   - Instagram: accountId 34604
8. Report total posts scheduled, date range, and any failures
