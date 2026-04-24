# Podcast Episode Generator

Generate a 6-7 minute "Quick Tips" audio episode from a blog post: fetch article → generate structured podcast script with mid-episode CTAs → produce MP3 via Fish Audio TTS (section by section) → mix optional music bed → render per-episode 3000×3000 cover art → upload to Cloudflare R2 → upload audio + cover + metadata to RSS.com → optionally embed audio player in Ghost post → optionally generate YouTube video → queue to PostgreSQL.

RSS.com is the podcast host — it handles audio hosting, RSS feed generation, directory distribution (Apple Podcasts, Spotify, Google Podcasts, Amazon Music), analytics, and scheduling. We upload the MP3, cover art, keywords, location, and metadata via their API.

The narrator is Andy Norman (Antek Automation). British English throughout. Conversational, practical, no corporate speak.

## Flags

- **`--url <url>`** — process a specific blog post URL (default: latest unprocessed post from RSS)
- **`--no-music`** — skip the background music bed even if `assets/music/podcast-bed.mp3` exists
- **`--no-upload`** — skip all uploads (R2 + RSS.com — useful for testing locally)
- **`--no-ghost`** — skip embedding the audio player in the Ghost blog post
- **`--no-youtube`** — skip generating the YouTube background video
- **`--no-rsscom`** — skip RSS.com upload (keeps R2 upload for Ghost embed)
- **`--no-cover`** — skip per-episode cover art generation (use podcast default cover)
- **`--schedule "2026-04-05T10:00:00Z"`** — schedule the episode on RSS.com for a future date/time instead of publishing immediately
- **`--audio-only`** — equivalent to `--no-ghost --no-youtube --no-rsscom` (just produce the MP3)

## Steps

### Phase 1: Fetch blog content

1. **If `--url` was provided:** Fetch the page content with WebFetch. Extract the article title and full body text (strip nav, footer, and sidebar boilerplate — keep all data, stats, and tips).

   **If no `--url`:** Fetch the RSS feed from `https://blog.antekautomation.com/rss/`. Take the most recent article URL. Check the DB for already-processed posts:

   Create `files/podcast-urls-run.ts`:
   ```typescript
   import "dotenv/config";
   import { initPodcastTable } from "./podcast-db.js";
   import { writeFileSync } from "fs";
   import pg from "pg";
   const { Client } = pg;

   await initPodcastTable();
   const client = new Client({
     connectionString: process.env.DATABASE_URL,
     ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
   });
   await client.connect();
   const result = await client.query("SELECT DISTINCT blog_source_url FROM podcast_queue");
   const urls = result.rows.map((r: { blog_source_url: string }) => r.blog_source_url);
   await client.end();
   writeFileSync("podcast-processed-urls.json", JSON.stringify(urls));
   console.log(`PROCESSED=${urls.length}`);
   ```
   Run: `cd files && npx tsx podcast-urls-run.ts`
   Read `files/podcast-processed-urls.json`. If the latest RSS article is already processed, pick the next unprocessed one. If none found, report "No new posts to process" and stop.
   Delete `files/podcast-urls-run.ts`.

2. Log: `Generating episode from: "[article title]" — [URL]`

---

### Phase 2: Generate podcast script

3. Import prompt builder:
   ```typescript
   import { buildPodcastPrompt, parsePodcastScript } from "./generate-podcast.js";
   ```

4. Call `buildPodcastPrompt(blogTitle, blogContent)` to get the generation prompt.

5. **Reason through the blog post yourself** — do NOT call an external AI API. You are the content generator. Following the prompt as your brief:
   - Write the intro (20-30 seconds, starts with "Hey, it's Andy from Antek Automation." and includes a hook)
   - Write the context (40-60 seconds, two paragraphs painting a vivid scenario with real data)
   - Write 5-7 tips as objects with tip_number and text (each 2-4 sentences, deeply practical, weave in natural Antek mentions)
   - Write the recap (20-30 seconds, starts with "So to recap:")
   - Use the hardcoded blog_cta, mid_cta, and outro exactly — DO NOT paraphrase them
   - Generate 5-8 SEO keywords for podcast discovery
   - Write a 3-5 sentence episode description packed with keywords for Apple Podcasts/Spotify search

   Tone rules (non-negotiable):
   - British English: colour, organise, whilst, realise, licence, ring, sort out, mobile
   - Conversational — sounds like advice over a cuppa, not a TED talk
   - Specific and actionable — real scenarios, real business types, real numbers from the article
   - Never: "leverage", "synergy", "game-changing", "revolutionary", "empower"
   - Numbers as words: "sixty-two percent" not "62%"
   - Weave in natural Antek Automation breadcrumbs: "this is exactly what we set up for clients", "I've seen this work brilliantly for a plumber we work with" — educational, not salesy

6. Output a valid JSON object exactly matching the `PodcastScript` type:
   ```json
   {
     "episode_title": "Missed Calls Are Costing You — 5 Tips to Stop the Leak",
     "episode_description": "Andy Norman from Antek Automation shares five practical ways UK service businesses can stop losing enquiries to missed calls. Based on real data from small businesses, this episode covers AI receptionists, automated follow-ups, and simple phone settings that most owners overlook. If you run a trades, health, or professional services business in the UK, these tips could save you three or more lost leads every week.",
     "source_blog_url": "https://blog.antekautomation.com/...",
     "source_blog_title": "...",
     "intro": "Hey, it's Andy from Antek Automation. Today I want to talk about...",
     "context": "Two paragraphs painting a vivid scenario with real data...",
     "tips": [
       { "tip_number": 1, "text": "Right, tip number one..." },
       { "tip_number": 2, "text": "Number two, and this is a big one..." },
       { "tip_number": 3, "text": "Tip three..." },
       { "tip_number": 4, "text": "Now, number four..." },
       { "tip_number": 5, "text": "Five, and this is the one most people skip..." }
     ],
     "blog_cta": "If you're finding this useful, by the way, there's a full written guide on the Antek Automation blog. I'll drop the link in the show notes. Worth a read if you want the detail behind these tips.",
     "mid_cta": "Quick reminder, if any of this is making you think about your own business, we help UK service businesses set this stuff up every day at Antek Automation. Have a look at antek automation dot com, or just drop us a message.",
     "recap": "So to recap: ...",
     "outro": "That's your quick tip for today. If you want to see how AI automation can help your business, head to antek automation dot com, or give us a bell on oh three three three, oh three eight, nine nine six oh. Cheers.",
     "seo_keywords": ["ai receptionist for small business", "missed calls uk", "antek automation", "service business tips", "ai automation uk"]
   }
   ```

7. Write the validated JSON to `files/podcast-script.json`. Call `parsePodcastScript(jsonStr)` to validate. If validation throws, fix the issue and retry.

---

### Phase 3: Generate episode audio

**Skip if `FISH_AUDIO_API_KEY` is not set in `.env` — report the missing key and stop.**

8. Create `files/podcast-voice-run.ts`:
   ```typescript
   import "dotenv/config";
   import { generateEpisodeAudio } from "./podcast-voice.js";
   import { readFileSync, writeFileSync } from "fs";

   const script = JSON.parse(readFileSync("podcast-script.json", "utf-8"));
   const addMusicBed = process.argv[2] !== "--no-music";
   const result = await generateEpisodeAudio(script, { addMusicBed });
   writeFileSync("podcast-audio-output.json", JSON.stringify(result));
   console.log(`AUDIO_DONE duration=${result.durationSeconds}s`);
   ```

9. Run: `cd files && npx tsx podcast-voice-run.ts` (append `--no-music` if flag was passed)

10. Read `files/podcast-audio-output.json` to get `{ audioPath, durationSeconds }`.

11. Delete `files/podcast-voice-run.ts`.

---

### Phase 4: Get episode number + render cover art

12. Create `files/podcast-meta-run.ts`:
    ```typescript
    import "dotenv/config";
    import { initPodcastTable, getNextEpisodeNumber } from "./podcast-db.js";
    import { renderCoverArt } from "./podcast-cover.js";
    import { readFileSync, writeFileSync } from "fs";

    const script = JSON.parse(readFileSync("podcast-script.json", "utf-8"));
    const skipCover = process.argv[2] === "--no-cover";

    await initPodcastTable();
    const episodeNumber = await getNextEpisodeNumber();

    let coverPath: string | null = null;
    if (!skipCover) {
      coverPath = await renderCoverArt(script.episode_title, script.episode_slug, episodeNumber);
    }

    writeFileSync("podcast-meta-output.json", JSON.stringify({ episodeNumber, coverPath }));
    console.log(`META_DONE episode=${episodeNumber} cover=${coverPath ?? "skipped"}`);
    ```

13. Run: `cd files && npx tsx podcast-meta-run.ts` (append `--no-cover` if flag was passed)

14. Read `files/podcast-meta-output.json` for `{ episodeNumber, coverPath }`.

15. Delete `files/podcast-meta-run.ts`.

---

### Phase 5: Upload to R2

**Skip if `--no-upload` was passed.**

16. Create `files/podcast-upload-run.ts`:
    ```typescript
    import "dotenv/config";
    import { uploadToR2 } from "./podcast-upload.js";
    import { readFileSync, writeFileSync } from "fs";

    const { audioPath } = JSON.parse(readFileSync("podcast-audio-output.json", "utf-8"));
    const slug = process.argv[2];
    const r2Url = await uploadToR2(audioPath, slug);
    writeFileSync("podcast-r2-output.json", JSON.stringify({ r2Url }));
    console.log(r2Url ? `R2_URL=${r2Url}` : "UPLOAD_SKIPPED");
    ```

17. Run: `cd files && npx tsx podcast-upload-run.ts '<slug>'`

18. Read `files/podcast-r2-output.json` for `r2Url`.

19. Delete `files/podcast-upload-run.ts`.

---

### Phase 6: Upload to RSS.com

**Skip if `--no-rsscom`, `--audio-only`, or `--no-upload`.**

20. Create `files/podcast-rsscom-run.ts`:
    ```typescript
    import "dotenv/config";
    import { uploadToRSSCom } from "./podcast-upload.js";
    import { readFileSync, writeFileSync } from "fs";

    const { audioPath } = JSON.parse(readFileSync("podcast-audio-output.json", "utf-8"));
    const script = JSON.parse(readFileSync("podcast-script.json", "utf-8"));
    const { episodeNumber, coverPath } = JSON.parse(readFileSync("podcast-meta-output.json", "utf-8"));
    const scheduleDatetime = process.argv[2] !== "null" ? process.argv[2] : undefined;

    const result = await uploadToRSSCom(audioPath, script, {
      scheduleDatetime,
      coverArtPath: coverPath ?? undefined,
      episodeNumber,
      seasonNumber: 1,
    });
    writeFileSync("podcast-rsscom-output.json", JSON.stringify(result));
    console.log(result ? `RSSCOM_DONE id=${result.episode_id}` : "RSSCOM_SKIPPED");
    ```

21. Run: `cd files && npx tsx podcast-rsscom-run.ts '<schedule_datetime_or_null>'`
    - If `--schedule` was passed with a datetime, use that value
    - Otherwise pass `"null"` for immediate publishing

22. Read `files/podcast-rsscom-output.json` for the RSS.com result (may be null).

23. Delete `files/podcast-rsscom-run.ts`.

---

### Phase 7: Queue to PostgreSQL

24. Create `files/podcast-db-run.ts`:
    ```typescript
    import "dotenv/config";
    import { initPodcastTable, queueEpisode, markRsscomPublished } from "./podcast-db.js";
    import { statSync } from "fs";

    const { script, audioPath, durationSeconds, r2Url, rsscomResult, episodeNumber } = JSON.parse(process.argv[2]);
    await initPodcastTable();
    const fileSizeBytes = statSync(audioPath).size;
    const id = await queueEpisode({
      episode_title: script.episode_title,
      episode_description: script.episode_description,
      episode_slug: script.episode_slug ?? "",
      episode_number: episodeNumber,
      audio_path: audioPath,
      r2_url: r2Url ?? undefined,
      rsscom_episode_id: rsscomResult?.episode_id?.toString() ?? undefined,
      rsscom_audio_id: rsscomResult?.audio_upload_id ?? undefined,
      blog_source_url: script.source_blog_url,
      duration_seconds: durationSeconds,
      file_size_bytes: fileSizeBytes,
      ghost_embedded: false,
      rsscom_published: !!rsscomResult,
      youtube_queued: false,
      status: "uploaded",
    });
    if (rsscomResult) {
      await markRsscomPublished(id, rsscomResult.episode_id.toString(), rsscomResult.audio_upload_id);
    }
    console.log(`DB_ID=${id}`);
    ```

25. Run: `cd files && npx tsx podcast-db-run.ts '<json>'`
    Pass: `JSON.stringify({ script, audioPath, durationSeconds, r2Url, rsscomResult, episodeNumber })`

26. Delete `files/podcast-db-run.ts`. Store the returned `DB_ID` for phases 8-9.

---

### Phase 8: Ghost embed

**Skip if `--no-ghost`, `--audio-only`, `--no-upload`, or `GHOST_ADMIN_API_KEY` is not set.**
**Skip if `r2Url` is null.**

27. Create `files/podcast-ghost-run.ts`:
    ```typescript
    import "dotenv/config";
    import { embedAudioPlayer } from "./podcast-ghost.js";
    import { markGhostEmbedded } from "./podcast-db.js";
    import { writeFileSync } from "fs";

    const { dbId, blogSourceUrl, r2Url, episodeTitle, durationSeconds } = JSON.parse(process.argv[2]);
    const ghostPostId = await embedAudioPlayer(blogSourceUrl, r2Url, episodeTitle, durationSeconds);
    await markGhostEmbedded(dbId, ghostPostId);
    writeFileSync("podcast-ghost-output.json", JSON.stringify({ ghostPostId }));
    console.log(`GHOST_DONE id=${ghostPostId}`);
    ```

28. Run: `cd files && npx tsx podcast-ghost-run.ts '<json>'`

29. Delete `files/podcast-ghost-run.ts`.

---

### Phase 9: YouTube video

**Skip if `--no-youtube`, `--audio-only`, or `--no-upload`.**

30. Create `files/podcast-youtube-run.ts`:
    ```typescript
    import "dotenv/config";
    import { generateYoutubeVideo } from "./podcast-youtube.js";
    import { markYoutubeQueued } from "./podcast-db.js";
    import { readFileSync, writeFileSync } from "fs";

    const { dbId, audioPath, durationSeconds, slug } = JSON.parse(process.argv[2]);
    const script = JSON.parse(readFileSync("podcast-script.json", "utf-8"));
    const result = await generateYoutubeVideo(script, audioPath, durationSeconds, slug);
    await markYoutubeQueued(dbId, result.videoPath, result.r2Url ?? undefined);
    writeFileSync("podcast-youtube-output.json", JSON.stringify(result));
    console.log(`YOUTUBE_DONE path=${result.videoPath}`);
    ```

31. Run: `cd files && npx tsx podcast-youtube-run.ts '<json>'`

32. Delete `files/podcast-youtube-run.ts`.

---

### Phase 10: Clean up and report

33. Delete temp files:
    `podcast-script.json`, `podcast-audio-output.json`, `podcast-r2-output.json`,
    `podcast-processed-urls.json`, `podcast-rsscom-output.json`, `podcast-meta-output.json`,
    `podcast-ghost-output.json`, `podcast-youtube-output.json`

34. Print results:

```
✅  Podcast episode generated — Episode [N]

  📰  Source:      "[article title]"
  🎙  Title:       "[episode title]"
  🔢  Episode:     S1 E[N]
  ⏱  Duration:    Xs (~N minutes)
  📁  Local MP3:   output/podcast/[slug]-[timestamp].mp3
  🌐  R2 Audio:    https://...
  🎨  Cover Art:   output/podcast/covers/[slug]-cover.png

  Distribution:
    📡  RSS.com:       ✅ episode id=[id], status=[status]
                       Keywords: [keyword list]
                       Dashboard: [dashboard_url]
    👻  Ghost embed:   ✅ post id=[uuid]  — or: skipped
    🎬  YouTube video: ✅ output/podcast/[slug].mp4 → [r2 url]  — or: skipped

  🗄  DB ID: [uuid]

SEO Keywords: [keyword1], [keyword2], ...

Episode description:
"[episode_description]"
```

---

## Important

- **6-7 minute episodes** — target 850-950 words of generated script (excluding hardcoded CTAs and outro)
- **5-7 tips** (not 3-4) — this is the core content, make them deeply practical
- **Mid-episode CTAs** — `blog_cta` is inserted after tip 3, `mid_cta` after tip 5. Both are hardcoded constants in `generate-podcast.ts`. Never paraphrase them.
- **Natural Antek breadcrumbs in tips** — weave in brand mentions ("this is what we set up for clients", "I've seen this work for a letting agent we help") — educational, not salesy
- The outro is always the hardcoded constant from `generate-podcast.ts` — never paraphrase
- British English throughout — colour, organise, whilst, realise, mobile, ring
- Script must start with "Hey, it's Andy from Antek Automation." and recap must start with "So to recap:"
- Tips are objects with `tip_number` (1-indexed integer) and `text` (the spoken content)
- `seo_keywords` array (5-8 items) drives RSS.com keywords AND Apple Podcasts discovery
- `episode_description` should be 3-5 sentences, packed with natural keywords for podcast search
- **Episode cover art** — 3000×3000 PNG rendered via Puppeteer per episode, branded with episode title. Falls back to default at `images/Podcast (3000 x 3000 px).png`
- **Episode numbering** — auto-incremented from `podcast_queue` table. Season always 1.
- **Location** — automatically set to "Andover, Hampshire" (creator location) via RSS.com Locations API
- **AI content flag** — always set to `true` on RSS.com (honest disclosure)
- **HTML episode notes** — RSS.com description field gets structured HTML with tip summary, blog link, and Antek links
- Fish Audio generates audio section by section, with blog_cta and mid_cta inserted at the correct positions
- Music bed: place `podcast-bed.mp3` in `assets/music/` for automatic -28dB mixing
- Ghost embed uses R2 audio URL (not RSS.com URL) for reliable direct MP3 playback
- RSS.com env vars: `RSS_COM_API_KEY`, `RSS_COM_PODCAST_ID`
- `DATABASE_URL` required for PostgreSQL queue
- `FISH_AUDIO_API_KEY` required (optional: `FISH_AUDIO_VOICE_ID`)
- FFmpeg must be installed: `brew install ffmpeg`
