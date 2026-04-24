/**
 * Podcast Episode Uploader
 *
 * Handles uploads to TWO destinations:
 *
 * 1. Cloudflare R2 — for Ghost blog embed audio source + backup.
 *    Uses the same REST API pattern as shorts-video.ts / gbp-image-gen.ts.
 *    Path convention: episodes/[slug].mp3
 *
 * 2. RSS.com — for podcast hosting and distribution to Apple Podcasts,
 *    Spotify, Google Podcasts, Amazon Music. RSS.com handles feed generation,
 *    directory submissions, analytics, and scheduling.
 *
 * RSS.com API v4 flow (from https://api.rss.com/v4/openapi.json):
 *   Step 1: POST /v4/podcasts/{podcast_id}/assets/presigned-uploads
 *           → returns { id, url } (presigned S3 URL)
 *   Step 2: PUT file bytes to the presigned url
 *   Step 3: POST /v4/podcasts/{podcast_id}/episodes
 *           → pass audio_upload_id from step 1 + title/description/etc.
 *           → returns Episode object with id, status, audio_url
 *
 * Auth: X-Api-Key header with RSS_COM_API_KEY from .env
 * Env:  RSS_COM_API_KEY, RSS_COM_PODCAST_ID
 */

import { existsSync, readFileSync, statSync } from "fs";
import type { PodcastScript, RSSComEpisodeResult } from "./podcast-types.js";

const RSSCOM_BASE = "https://api.rss.com";

// ── Cloudflare R2 ────────────────────────────────────────────

/**
 * Uploads a podcast episode MP3 to Cloudflare R2.
 *
 * @param localPath   - Absolute path to the local MP3 file
 * @param episodeSlug - URL-safe slug used for the R2 object key
 * @returns           - Public CDN URL, or null if credentials are missing
 */
export async function uploadToR2(
  localPath: string,
  episodeSlug: string
): Promise<string | null> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const apiToken = process.env.R2_API_TOKEN;
  const bucket = process.env.R2_BUCKET_NAME || "gbp-images";
  const publicUrl = process.env.R2_PUBLIC_URL || "";

  if (!accountId || !apiToken) {
    console.warn(
      "  [podcast-upload] R2_ACCOUNT_ID or R2_API_TOKEN not set — skipping R2 upload. Local file still saved."
    );
    return null;
  }

  const filename = `episodes/${episodeSlug}.mp3`;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${filename}`;

  const buffer = readFileSync(localPath);

  const res = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "audio/mpeg",
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 upload failed (${res.status}): ${text}`);
  }

  const cdnUrl = publicUrl
    ? `${publicUrl.replace(/\/$/, "")}/${filename}`
    : filename;

  console.log(`  [podcast-upload] R2 uploaded → ${cdnUrl}`);
  return cdnUrl;
}

/**
 * Uploads a YouTube MP4 to Cloudflare R2.
 * Path convention: podcast/youtube/[slug]-[timestamp].mp4
 */
export async function uploadVideoToR2(
  localPath: string,
  r2Key: string
): Promise<string | null> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const apiToken = process.env.R2_API_TOKEN;
  const bucket = process.env.R2_BUCKET_NAME || "gbp-images";
  const publicUrl = process.env.R2_PUBLIC_URL || "";

  if (!accountId || !apiToken) {
    console.warn("  [podcast-upload] R2 credentials missing — skipping video upload");
    return null;
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${r2Key}`;
  const buffer = readFileSync(localPath);

  const res = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "video/mp4",
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 video upload failed (${res.status}): ${text}`);
  }

  const cdnUrl = publicUrl
    ? `${publicUrl.replace(/\/$/, "")}/${r2Key}`
    : r2Key;

  console.log(`  [podcast-upload] R2 video uploaded → ${cdnUrl}`);
  return cdnUrl;
}

// ── RSS.com ──────────────────────────────────────────────────

// ── RSS.com helpers ──────────────────────────────────────────

interface PresignedResult {
  id: string;
  url: string;
  asset_type: string;
  expected_mime: string;
  filename: string;
}

/**
 * Requests a presigned upload URL from RSS.com and uploads a file to it.
 * Returns the presigned result (containing the upload_id).
 */
async function rsscomPresignedUpload(
  podcastId: string,
  headers: Record<string, string>,
  localPath: string,
  assetType: "audio" | "image",
  mime: string,
  filename: string
): Promise<PresignedResult> {
  const presignedRes = await fetch(
    `${RSSCOM_BASE}/v4/podcasts/${podcastId}/assets/presigned-uploads`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        asset_type: assetType,
        expected_mime: mime,
        filename,
      }),
    }
  );

  if (!presignedRes.ok) {
    const text = await presignedRes.text();
    throw new Error(`RSS.com presigned upload (${assetType}) failed (${presignedRes.status}): ${text}`);
  }

  const presigned = (await presignedRes.json()) as PresignedResult;

  const buffer = readFileSync(localPath);
  const uploadRes = await fetch(presigned.url, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: new Uint8Array(buffer),
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`RSS.com ${assetType} upload failed (${uploadRes.status}): ${text}`);
  }

  return presigned;
}

/**
 * Ensures keywords exist on the RSS.com podcast and returns their IDs.
 * Creates any keywords that don't already exist.
 */
async function ensureKeywords(
  podcastId: string,
  headers: Record<string, string>,
  labels: string[]
): Promise<number[]> {
  // Fetch existing keywords
  const listRes = await fetch(
    `${RSSCOM_BASE}/v4/podcasts/${podcastId}/keywords`,
    { headers }
  );

  let existing: Array<{ id: number; label: string }> = [];
  if (listRes.ok) {
    existing = (await listRes.json()) as Array<{ id: number; label: string }>;
  }

  const ids: number[] = [];
  for (const label of labels) {
    const found = existing.find(
      (k) => k.label.toLowerCase() === label.toLowerCase()
    );
    if (found) {
      ids.push(found.id);
      continue;
    }

    // Create new keyword
    const createRes = await fetch(
      `${RSSCOM_BASE}/v4/podcasts/${podcastId}/keywords`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ label: label.substring(0, 250) }),
      }
    );
    if (createRes.ok) {
      const created = (await createRes.json()) as { id: number; label: string };
      ids.push(created.id);
      existing.push(created);
    }
  }

  return ids;
}

/**
 * Looks up a location on RSS.com by search string.
 * Returns the location ID or null if not found.
 */
async function lookupLocation(
  headers: Record<string, string>,
  query: string
): Promise<string | null> {
  const res = await fetch(
    `${RSSCOM_BASE}/v4/locations?filter=${encodeURIComponent(query)}`,
    { headers }
  );
  if (!res.ok) return null;
  const results = (await res.json()) as Array<{ id: string; name: string }>;
  return results.length > 0 ? results[0].id : null;
}

// ── RSS.com main upload ──────────────────────────────────────

export interface RSSComUploadOptions {
  /** ISO 8601 datetime to schedule. Omit for immediate publish. */
  scheduleDatetime?: string;
  /** Path to episode cover art (3000x3000 PNG). Omit for podcast default. */
  coverArtPath?: string;
  /** Episode number (auto-incremented if omitted). */
  episodeNumber?: number;
  /** Season number (default: 1). */
  seasonNumber?: number;
}

/**
 * Uploads audio (and optionally cover art) to RSS.com and creates an episode
 * with full SEO/GEO metadata: keywords, location, episode numbering, and
 * rich episode notes.
 *
 * Flow:
 *   1. Upload audio via presigned URL
 *   2. Upload cover art via presigned URL (if provided)
 *   3. Ensure keywords exist, get IDs
 *   4. Look up Andover, Hampshire location
 *   5. Build SEO-rich HTML episode notes
 *   6. Create episode with all metadata
 *
 * @returns RSS.com episode details, or null if credentials missing
 */
export async function uploadToRSSCom(
  localPath: string,
  script: PodcastScript,
  options: RSSComUploadOptions = {}
): Promise<RSSComEpisodeResult | null> {
  const apiKey = process.env.RSS_COM_API_KEY;
  const podcastId = process.env.RSS_COM_PODCAST_ID;

  if (!apiKey) {
    console.warn(
      "  [rss.com] RSS_COM_API_KEY not set — skipping RSS.com upload."
    );
    return null;
  }
  if (!podcastId) {
    console.warn(
      "  [rss.com] RSS_COM_PODCAST_ID not set — skipping RSS.com upload."
    );
    return null;
  }

  const headers = {
    "X-Api-Key": apiKey,
    "Content-Type": "application/json",
  };

  // Step 1: Upload audio
  console.log("  [rss.com] Uploading audio...");
  const audioFilename = `${script.episode_slug}.mp3`;
  const audioPresigned = await rsscomPresignedUpload(
    podcastId, headers, localPath, "audio", "audio/mpeg", audioFilename
  );
  console.log(`  [rss.com] Audio uploaded (upload_id: ${audioPresigned.id})`);

  // Step 2: Upload cover art (optional)
  let coverUploadId: string | undefined;
  if (options.coverArtPath && existsSync(options.coverArtPath)) {
    console.log("  [rss.com] Uploading episode cover art...");
    const coverFilename = `${script.episode_slug}-cover.png`;
    const coverPresigned = await rsscomPresignedUpload(
      podcastId, headers, options.coverArtPath, "image", "image/png", coverFilename
    );
    coverUploadId = coverPresigned.id;
    console.log(`  [rss.com] Cover art uploaded (upload_id: ${coverUploadId})`);
  }

  // Step 3: Ensure keywords
  let keywordIds: number[] = [];
  if (script.seo_keywords && script.seo_keywords.length > 0) {
    console.log(`  [rss.com] Setting up ${script.seo_keywords.length} keywords...`);
    keywordIds = await ensureKeywords(podcastId, headers, script.seo_keywords);
    console.log(`  [rss.com] Keywords ready: ${keywordIds.length} IDs`);
  }

  // Step 4: Look up location (Andover, Hampshire)
  let locationIds: Record<string, string | null> | undefined;
  const creatorLocation = await lookupLocation(headers, "Andover, Hampshire");
  if (creatorLocation) {
    locationIds = { creator: creatorLocation, subject: null };
    console.log(`  [rss.com] Location set: Andover, Hampshire (${creatorLocation})`);
  }

  // Step 5: Build SEO-rich HTML episode notes
  // RSS.com episode description supports HTML — use it for structured notes
  const tipsSummary = script.tips
    .map((t) => `<li>${t.text.split(".")[0]}.</li>`)
    .join("\n      ");

  const htmlDescription = `<p>${script.episode_description}</p>

<h3>In This Episode</h3>
<p>Andy Norman from Antek Automation shares practical tips sourced from the blog post: <a href="${script.source_blog_url}">${script.source_blog_title}</a>.</p>

<h3>Tips Covered</h3>
<ul>
      ${tipsSummary}
</ul>

<h3>Links</h3>
<ul>
  <li>Full blog post: <a href="${script.source_blog_url}">${script.source_blog_url}</a></li>
  <li>Antek Automation: <a href="https://antekautomation.com">antekautomation.com</a></li>
  <li>Call us: 0333 038 9960</li>
</ul>

<p><em>Produced by Antek Automation — AI automation for UK small businesses.</em></p>`.substring(0, 4000);

  // Step 6: Create the episode
  console.log("  [rss.com] Creating episode with full metadata...");

  const scheduleValue = options.scheduleDatetime ?? new Date().toISOString();

  const episodeBody: Record<string, unknown> = {
    title: script.episode_title.substring(0, 250),
    description: htmlDescription,
    audio_upload_id: audioPresigned.id,
    itunes_episode_type: "full",
    itunes_explicit: false,
    itunes_season: options.seasonNumber ?? 1,
    ai_content: true,
    schedule_datetime: scheduleValue,
  };

  if (options.episodeNumber) {
    episodeBody.itunes_episode = options.episodeNumber;
  }
  if (script.source_blog_url) {
    episodeBody.custom_link = script.source_blog_url.substring(0, 500);
  }
  if (coverUploadId) {
    episodeBody.cover_upload_id = coverUploadId;
  }
  if (keywordIds.length > 0) {
    episodeBody.keyword_ids = keywordIds;
  }
  if (locationIds) {
    episodeBody.location_ids = locationIds;
  }

  const episodeRes = await fetch(
    `${RSSCOM_BASE}/v4/podcasts/${podcastId}/episodes`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(episodeBody),
    }
  );

  if (!episodeRes.ok) {
    const text = await episodeRes.text();
    throw new Error(`RSS.com episode creation failed (${episodeRes.status}): ${text}`);
  }

  const episode = (await episodeRes.json()) as {
    id: number;
    title: string;
    status: string;
    audio_url: string | null;
    dashboard_url?: string;
    website_url?: string;
  };

  console.log(
    `  [rss.com] ✅ Episode created: id=${episode.id}, status=${episode.status}`
  );
  if (episode.dashboard_url) {
    console.log(`  [rss.com]    Dashboard: ${episode.dashboard_url}`);
  }

  return {
    episode_id: episode.id,
    status: episode.status,
    audio_url: episode.audio_url,
    audio_upload_id: audioPresigned.id,
    cover_upload_id: coverUploadId,
    dashboard_url: episode.dashboard_url,
    website_url: episode.website_url,
  };
}
