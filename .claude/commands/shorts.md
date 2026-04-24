# YouTube Shorts / Reels Generator

Generate ~30-second short-form videos from blog posts: fetch articles → generate 6-slide scripts with on-screen text and voiceover text → generate Fish Audio TTS clips per slide → render 1080×1920 PNG frames via Puppeteer → stitch MP4s with voice-driven timing + Ken Burns + crossfades via FFmpeg → upload to R2 → schedule to each target platform via Blotato MCP → track in PostgreSQL.

The video file is rendered **once** and reused across all target platforms. Platform-specific metadata (title, description, caption, hashtags) is generated per platform and stored as separate rows in `shorts_queue`.

## Flags

- **`--url <url>`** — process a single specific blog post URL (default: all new RSS posts)
- **`--no-voice`** — skip Fish Audio TTS; all slides display for exactly 5 seconds each
- **`--platforms <list>`** — comma-separated target platforms (default: `youtube`)
  - Valid values: `youtube`, `instagram`, `facebook`
  - Shorthand: `--platforms all` → `youtube,instagram,facebook`
  - Shorthand: `--platforms reels` → `instagram,facebook`
  - Examples: `--platforms youtube,instagram`, `--platforms all`

## Steps

### Phase 1: Determine which posts to process

1. **Parse flags** before anything else:
   - If `--platforms` is provided, expand shorthands:
     - `all` → `["youtube", "instagram", "facebook"]`
     - `reels` → `["instagram", "facebook"]`
     - Otherwise split on comma: `"youtube,instagram"` → `["youtube", "instagram"]`
   - Default (no flag): `["youtube"]`
   - Store as `targetPlatforms: string[]` for use in Phase 6.

2. Create a temporary runner `files/shorts-urls-run.ts` to load already-processed URLs:
   ```typescript
   import "dotenv/config";
   import { initShortsTable, getProcessedUrls } from "./shorts-db.js";
   import { writeFileSync } from "fs";

   await initShortsTable();
   const urls = await getProcessedUrls();
   writeFileSync("shorts-processed-urls.json", JSON.stringify(urls));
   console.log(`PROCESSED=${urls.length}`);
   ```
   Run: `cd files && npx tsx shorts-urls-run.ts`
   Read `files/shorts-processed-urls.json` to get the list of already-processed URLs.
   Delete `files/shorts-urls-run.ts`.

   **If `--url` was provided:** skip this step — process that single URL only (regardless of whether it's already in the queue).

3. **Batch mode:** Fetch the RSS feed from `https://blog.antekautomation.com/rss/`.
   Collect all article URLs and titles from the feed.
   Filter out any URLs already in `shorts-processed-urls.json`.
   If nothing new: report "No new posts to process" and stop.

   **Single mode (`--url`):** Use that URL directly. Fetch the page with WebFetch, collect title and content.

4. For each unprocessed article URL, fetch its full content with WebFetch.
   Collect: title, URL, full body content (strip nav/footer boilerplate, keep all data/stats/tips).

   Log: `Found N new posts to process: [list of titles]`

---

Process each article in sequence. For **each article**, run Phases 2–6 below, then move to the next.

---

### Phase 2: Generate Short script (per article)

5. Import the prompt builder:
   ```typescript
   import { buildPrompt, parseShortScript } from "./generate-shorts.js";
   ```

6. Call `buildPrompt(title, content)` to get the extraction prompt.

7. **Reason through the blog post yourself** — do NOT call an external AI API. As Claude Code (Max plan), you are the content generator. Using the prompt as your brief:
   - Pull the single most surprising stat or the sharpest question for the hook (≤15 words)
   - Distil 3 numbered, actionable tips (≤12 words each, start with a verb)
   - Write a one-line summary takeaway (≤15 words)
   - Write `voiceover_text` for each slide — the natural spoken version (British English, conversational, numbers as words):
     - Hook: open with "Did you know..." or a punchy spoken question
     - Tips: "Tip one/two/three: [slightly expanded, conversational version]"
     - Summary: "So remember: [spoken recap]"
     - CTA: **DO NOT generate** — use the hardcoded constant from `generate-shorts.ts` exactly as-is. The parser enforces this automatically.
   - Generate YouTube metadata:
     - Title: max 60 chars, hook-first, includes main keyword
     - Description: max 200 chars, ends with "Full guide: [article URL]"
     - Tags: exactly 5 hashtags, must include #Shorts, mix broad + specific

8. Output a valid JSON object exactly matching the `ShortScript` type, then call `parseShortScript(jsonStr)` to validate it. If validation throws, fix the JSON and retry.

   Expected structure:
   ```json
   {
     "slides": [
       { "type": "hook", "text": "62% of calls go unanswered", "voiceover_text": "Did you know sixty-two percent of business calls go completely unanswered?" },
       { "type": "tip", "text": "Set up a missed call text-back", "tipNumber": 1, "voiceover_text": "Tip one: set up an automated text reply the moment a call goes unanswered." },
       { "type": "tip", "text": "Use AI to qualify leads overnight", "tipNumber": 2, "voiceover_text": "Tip two: let an AI chatbot qualify your after-hours enquiries so you wake up with answers." },
       { "type": "tip", "text": "Review your missed call log weekly", "tipNumber": 3, "voiceover_text": "Tip three: check your missed call log every week — the pattern tells you where leads are leaking." },
       { "type": "summary", "text": "Every missed call is a missed sale", "voiceover_text": "So remember: every missed call is a missed sale, and most of them are fixable." },
       { "type": "cta", "text": "", "voiceover_text": "Follow Antek Automation for more tips like this. Visit antek automation dot com or call oh three three three, oh three eight, nine nine six oh." }
     ],
     "sourceBlogUrl": "https://blog.antekautomation.com/...",
     "sourceBlogTitle": "...",
     "youtubeTitle": "...",
     "youtubeDescription": "...",
     "youtubeTags": ["#Shorts", "...", "...", "...", "..."]
   }
   ```

### Phase 3: Generate voiceover audio (per article)

**Skip this phase if `--no-voice` was passed OR if `FISH_AUDIO_API_KEY` is not set in `.env`.**
In either case, write `null` to `files/shorts-voice-output.json` and proceed to Phase 4.

9. Write the validated ShortScript JSON to `files/shorts-script.json`.

10. Create a temporary runner script `files/shorts-voice-run.ts`:
    ```typescript
    import "dotenv/config";
    import { generateAllVoiceovers } from "./shorts-voice.js";
    import { readFileSync, writeFileSync } from "fs";

    const script = JSON.parse(readFileSync("shorts-script.json", "utf-8"));
    const slideAudios = await generateAllVoiceovers(script);
    writeFileSync("shorts-voice-output.json", JSON.stringify(slideAudios));
    console.log(slideAudios ? "VOICE_DONE" : "VOICE_FAILED_SILENT_FALLBACK");
    ```

11. Run: `cd files && npx tsx shorts-voice-run.ts`

12. Read `files/shorts-voice-output.json`:
    - If the array is present (6 items): voiceover succeeded — use it in Phase 5
    - If `null`: Fish Audio failed — continue in silent mode (5s/slide)

13. Delete `files/shorts-voice-run.ts`.

### Phase 4: Render frames with Puppeteer (per article)

14. Create a temporary runner script `files/shorts-render-run.ts`:
    ```typescript
    import "dotenv/config";
    import { renderFrames } from "./shorts-frames.js";
    import { readFileSync, writeFileSync } from "fs";

    const script = JSON.parse(readFileSync("shorts-script.json", "utf-8"));
    const paths = await renderFrames(script);
    writeFileSync("shorts-frames-output.json", JSON.stringify(paths));
    console.log("FRAMES_DONE");
    ```

15. Run: `cd files && npx tsx shorts-render-run.ts`

16. Read `files/shorts-frames-output.json` to get the 6 PNG file paths.

17. Delete `files/shorts-render-run.ts`.

### Phase 5: Stitch video and upload to R2 (per article)

18. Generate a URL-safe slug from the article title (lowercase, hyphens, max 40 chars).

19. Create a temporary runner script `files/shorts-video-run.ts`:
    ```typescript
    import "dotenv/config";
    import { stitchVideo, uploadVideoToR2 } from "./shorts-video.js";
    import type { SlideAudio } from "./shorts-types.js";
    import { readFileSync, writeFileSync } from "fs";
    import { join } from "path";

    const framePaths = JSON.parse(readFileSync("shorts-frames-output.json", "utf-8")) as string[];
    const slideAudios = JSON.parse(readFileSync("shorts-voice-output.json", "utf-8")) as SlideAudio[] | null;
    const slug = process.argv[2] || "short";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
    const outputPath = join(process.cwd(), "output", "shorts", `${slug}-${timestamp}.mp4`);

    console.log("Stitching video...");
    const mp4Path = await stitchVideo(framePaths, outputPath, slideAudios ?? undefined);

    console.log("Uploading to R2...");
    const filename = `shorts/${slug}-${timestamp}.mp4`;
    const r2Url = await uploadVideoToR2(mp4Path, filename);

    writeFileSync("shorts-video-output.json", JSON.stringify({ mp4Path, r2Url }));
    console.log("VIDEO_DONE");
    ```

20. Run: `cd files && npx tsx shorts-video-run.ts '<slug>'`

21. Read `files/shorts-video-output.json` to get `mp4Path` and `r2Url`.

22. Delete `files/shorts-video-run.ts`.

### Phase 6: Generate platform metadata (per article)

23. Call `generatePlatformMeta(script, platform)` for each platform in `targetPlatforms`:

    ```typescript
    import { generatePlatformMeta } from "./generate-shorts.js";
    ```

    Collect results into `platformMetas: PlatformMeta[]`. This is a synchronous call — no runner script needed.

    Platform metadata overview:
    - **YouTube** — `title` (from youtubeTitle), `description` (blog URL first line + youtubeDescription), `hashtags` (youtubeTags), `caption` (empty)
    - **Instagram** — `caption` (hook + tip bullets + CTA + @AntekAutomation + antekautomation.com, then hashtag block on new line), 17 hashtags
    - **Facebook** — `caption` (conversational question hook + 1-2 tips + CTA question ending), 4 hashtags inline

    Review each caption and adjust if needed to match Andy's voice (UK English, direct, no hype). The Instagram caption hashtag block must appear after a blank line.

### Phase 7: Schedule via Blotato MCP and queue in PostgreSQL (per article)

The same `r2Url` MP4 is used for all platforms. Schedule each platform independently.

24. Call `blotato_list_accounts` once per batch to confirm account IDs. Expected:
    | Platform  | Account ID | Page ID           |
    |-----------|-----------|-------------------|
    | YouTube   | 29641      | —                 |
    | Instagram | 34604      | —                 |
    | Facebook  | 22303      | 999920689867882   |

25. For each platform in `targetPlatforms`, call `blotato_create_post`:
    - **YouTube**: `accountId: 29641`, `platform: "youtube"`, `text: platformMeta.description`, `title: platformMeta.title`, `mediaUrls: [r2Url]`, schedule at next slot (08:00 UK, 1 day apart per batch)
    - **Instagram**: `accountId: 34604`, `platform: "instagram"`, `text: platformMeta.caption`, `mediaUrls: [r2Url]`, same schedule slot
    - **Facebook**: `accountId: 22303`, `platform: "facebook"`, `text: platformMeta.caption`, `pageId: "999920689867882"`, `mediaUrls: [r2Url]`, same schedule slot

    If `blotato_create_post` requires a source/visual step first, call `blotato_create_source` with the R2 URL, poll `blotato_get_source_status` until done, then call `blotato_create_post` with the resulting source ID.

    Log each Blotato post ID to stdout: `[platform] Blotato ID: <id>`

26. Create a temporary runner `files/shorts-db-run.ts`:
    ```typescript
    import "dotenv/config";
    import { queueShort, markScheduled } from "./shorts-db.js";
    import type { PlatformMeta } from "./shorts-types.js";

    const { videoPath, blogSourceUrl, platformMetas } = JSON.parse(process.argv[2]);
    const ids = await queueShort(
      { video_path: videoPath, blog_source_url: blogSourceUrl },
      platformMetas as PlatformMeta[]
    );
    for (const id of ids) {
      await markScheduled(id);
    }
    console.log(`DB_IDS=${ids.join(",")}`);
    ```

27. Run: `cd files && npx tsx shorts-db-run.ts '<json>'`
    Pass: `JSON.stringify({ videoPath: mp4Path, blogSourceUrl: script.sourceBlogUrl, platformMetas })`

28. Delete `files/shorts-db-run.ts`.

29. Log progress: `[N/total] ✅ "<title>" → scheduled on: youtube, instagram, facebook`

    If any step fails for a post, log the error and continue to the next post — don't abort the whole batch.

---

### Phase 8: Final report

30. Clean up any remaining temp files:
    `shorts-script.json`, `shorts-voice-output.json`, `shorts-frames-output.json`, `shorts-video-output.json`, `shorts-processed-urls.json`

31. Print batch summary:

```
✅  Shorts batch complete

Generated N of N new posts:

  [1] "Article Title"
      🎙  Voiceover: yes (voice-driven timing)  — or: no (5s/slide)
      📹  output/shorts/<slug>-<timestamp>.mp4
      🌐  <r2_url>
      📋  Platforms scheduled: youtube | instagram | facebook
          youtube   → Blotato ID: <id>  |  Scheduled: <date>
          instagram → Blotato ID: <id>  |  Scheduled: <date>
          facebook  → Blotato ID: <id>  |  Scheduled: <date>

  [2] "Article Title"
      ...

  [X] "Article Title"  ❌ FAILED: <error message>

Total: N scheduled (across N×platforms), N failed
Next Short publishes: <earliest scheduled date>
```

## Important

- All content follows Andy's voice (UK English, direct, practical, no hype)
- **voiceover_text** is the spoken version — British English, numbers as words, conversational
- CTA voiceover is always the two hardcoded constants in `shorts-voice.ts` — never generate it, never use the voiceover_text field for CTA audio
- Neo-brutalist frames: no rounded corners, no gradients, brand palette coral/cream/sage/charcoal
- The MP4 is rendered **once** — the same file is used for YouTube, Instagram, and Facebook
- Instagram captions must include a blank line before the hashtag block
- Facebook captions must be conversational and end with a question to drive comments
- YouTube titles must include a relevant keyword (e.g. "AI Voice Agent", not just "3 Tips")
- All captions/descriptions in British English
- CTA in Instagram/Facebook captions references @AntekAutomation and antekautomation.com
- FFmpeg + ffprobe must be installed: `brew install ffmpeg`
- `dotenv` must be installed in `files/`: `npm install dotenv` (run once if missing)
- R2 env vars required: `R2_ACCOUNT_ID`, `R2_API_TOKEN`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `DATABASE_URL` required for PostgreSQL tracking
- Fish Audio env vars: `FISH_AUDIO_API_KEY` (required for voice), `FISH_AUDIO_VOICE_ID` (optional, currently set to `f449632487b740fdab7e44dc4a850948`)
- If Fish Audio fails or `--no-voice` is passed: silent mode (5s/slide, ~28.5s total)
- Background music: place a `.mp3` in `assets/music/` for automatic audio mixing at -22dB
- Schedule at 08:00 UK time — convert to UTC correctly (BST = UTC+1, GMT = UTC+0). Report time to user in UK local time.
- Batch posts are scheduled 1 day apart — first one tomorrow at 08:00 UK time, then +1 day each
- Failed posts are skipped and logged — they are NOT added to `shorts_queue` so they will be retried next batch run
- **Do NOT pass `-loop`, `-r`, or `-t` as input options on PNG frames in FFmpeg.** A PNG is 1 frame naturally. zoompan's `d` = frames per input frame — extra input frames multiply d and cause multi-minute videos.
- **CTA slide has no duration cap** — it runs ~12–15s (two TTS clips + 5s silence gap). All other slides clamped 3–8s.
