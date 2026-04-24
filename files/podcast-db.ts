/**
 * Podcast Queue — PostgreSQL operations
 *
 * Tracks podcast episodes through their full lifecycle:
 *   queued → uploaded → distributed → (or failed)
 *
 * Distribution tracking:
 *   ghost_embedded    — audio player prepended to the source Ghost post
 *   rsscom_published  — episode uploaded and created on RSS.com
 *   youtube_queued    — YouTube background video generated and queued
 *
 * Follows the same pg client pattern as shorts-db.ts and gbp-db.ts.
 */

import pg from "pg";
import type { PodcastDbRecord, PodcastStatus } from "./podcast-types.js";

const { Client } = pg;

function createClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
}

export async function initPodcastTable(): Promise<void> {
  const client = createClient();
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS podcast_queue (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        episode_title     TEXT NOT NULL,
        episode_description TEXT,
        episode_slug      TEXT NOT NULL,
        audio_path        TEXT NOT NULL,
        r2_url            TEXT,
        rsscom_episode_id TEXT,
        rsscom_audio_id   TEXT,
        youtube_video_path TEXT,
        youtube_r2_url    TEXT,
        blog_source_url   TEXT,
        ghost_post_id     TEXT,
        duration_seconds  INTEGER,
        file_size_bytes   INTEGER,
        ghost_embedded    BOOLEAN NOT NULL DEFAULT false,
        rsscom_published  BOOLEAN NOT NULL DEFAULT false,
        youtube_queued    BOOLEAN NOT NULL DEFAULT false,
        status            TEXT DEFAULT 'queued',
        created_at        TIMESTAMPTZ DEFAULT now(),
        published_at      TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS podcast_queue_status_idx
        ON podcast_queue (status, created_at);
    `);

    // Migrations for tables created before this schema version
    const migrations = [
      `ALTER TABLE podcast_queue ADD COLUMN IF NOT EXISTS episode_slug TEXT`,
      `ALTER TABLE podcast_queue ADD COLUMN IF NOT EXISTS episode_number INTEGER`,
      `ALTER TABLE podcast_queue ADD COLUMN IF NOT EXISTS rsscom_episode_id TEXT`,
      `ALTER TABLE podcast_queue ADD COLUMN IF NOT EXISTS rsscom_audio_id TEXT`,
      `ALTER TABLE podcast_queue ADD COLUMN IF NOT EXISTS rsscom_published BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE podcast_queue ADD COLUMN IF NOT EXISTS ghost_post_id TEXT`,
      `ALTER TABLE podcast_queue ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER`,
      `ALTER TABLE podcast_queue ADD COLUMN IF NOT EXISTS youtube_video_path TEXT`,
      `ALTER TABLE podcast_queue ADD COLUMN IF NOT EXISTS youtube_r2_url TEXT`,
      `ALTER TABLE podcast_queue ADD COLUMN IF NOT EXISTS ghost_embedded BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE podcast_queue ADD COLUMN IF NOT EXISTS youtube_queued BOOLEAN NOT NULL DEFAULT false`,
    ];
    for (const sql of migrations) {
      await client.query(sql);
    }

    console.log("  ✅  podcast_queue table ready");
  } finally {
    await client.end();
  }
}

export async function queueEpisode(
  record: Omit<PodcastDbRecord, "id" | "created_at">
): Promise<string> {
  const client = createClient();
  try {
    await client.connect();
    const result = await client.query(
      `INSERT INTO podcast_queue
        (episode_title, episode_description, episode_slug, episode_number, audio_path, r2_url,
         rsscom_episode_id, rsscom_audio_id, blog_source_url, ghost_post_id,
         duration_seconds, file_size_bytes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        record.episode_title,
        record.episode_description ?? null,
        record.episode_slug,
        record.episode_number ?? null,
        record.audio_path,
        record.r2_url ?? null,
        record.rsscom_episode_id ?? null,
        record.rsscom_audio_id ?? null,
        record.blog_source_url ?? null,
        record.ghost_post_id ?? null,
        record.duration_seconds ?? null,
        record.file_size_bytes ?? null,
        record.status,
      ]
    );
    return result.rows[0].id as string;
  } finally {
    await client.end();
  }
}

export async function markUploaded(id: string, r2Url: string): Promise<void> {
  const client = createClient();
  try {
    await client.connect();
    await client.query(
      `UPDATE podcast_queue SET status = 'uploaded', r2_url = $1 WHERE id = $2`,
      [r2Url, id]
    );
  } finally {
    await client.end();
  }
}

export async function markDistributed(id: string): Promise<void> {
  const client = createClient();
  try {
    await client.connect();
    await client.query(
      `UPDATE podcast_queue
       SET status = 'distributed', published_at = now()
       WHERE id = $1`,
      [id]
    );
  } finally {
    await client.end();
  }
}

export async function markFailed(id: string): Promise<void> {
  const client = createClient();
  try {
    await client.connect();
    await client.query(
      `UPDATE podcast_queue SET status = 'failed' WHERE id = $1`,
      [id]
    );
  } finally {
    await client.end();
  }
}

export async function markGhostEmbedded(id: string, ghostPostId?: string): Promise<void> {
  const client = createClient();
  try {
    await client.connect();
    await client.query(
      `UPDATE podcast_queue
       SET ghost_embedded = true, ghost_post_id = COALESCE($1, ghost_post_id)
       WHERE id = $2`,
      [ghostPostId ?? null, id]
    );
  } finally {
    await client.end();
  }
}

export async function markRsscomPublished(
  id: string,
  rsscomEpisodeId: string,
  rsscomAudioId?: string
): Promise<void> {
  const client = createClient();
  try {
    await client.connect();
    await client.query(
      `UPDATE podcast_queue
       SET rsscom_published = true,
           rsscom_episode_id = $1,
           rsscom_audio_id = COALESCE($2, rsscom_audio_id)
       WHERE id = $3`,
      [rsscomEpisodeId, rsscomAudioId ?? null, id]
    );
  } finally {
    await client.end();
  }
}

export async function markYoutubeQueued(
  id: string,
  youtubeVideoPath: string,
  youtubeR2Url?: string
): Promise<void> {
  const client = createClient();
  try {
    await client.connect();
    await client.query(
      `UPDATE podcast_queue
       SET youtube_queued = true, youtube_video_path = $1, youtube_r2_url = $2
       WHERE id = $3`,
      [youtubeVideoPath, youtubeR2Url ?? null, id]
    );
  } finally {
    await client.end();
  }
}

export async function getNextPending(): Promise<PodcastDbRecord | null> {
  const client = createClient();
  try {
    await client.connect();
    const result = await client.query(
      `SELECT * FROM podcast_queue
       WHERE r2_url IS NOT NULL
         AND ghost_embedded = false
       ORDER BY created_at ASC
       LIMIT 1`
    );
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0]);
  } finally {
    await client.end();
  }
}

export async function getAllPublished(): Promise<PodcastDbRecord[]> {
  const client = createClient();
  try {
    await client.connect();
    const result = await client.query(
      `SELECT * FROM podcast_queue
       WHERE r2_url IS NOT NULL
       ORDER BY created_at DESC`
    );
    return result.rows.map(mapRow);
  } finally {
    await client.end();
  }
}

/** Returns the next episode number (max existing + 1, or 1 if table is empty). */
export async function getNextEpisodeNumber(): Promise<number> {
  const client = createClient();
  try {
    await client.connect();
    const result = await client.query(
      `SELECT COALESCE(MAX(episode_number), 0) + 1 AS next FROM podcast_queue`
    );
    return result.rows[0].next as number;
  } finally {
    await client.end();
  }
}

// ── Row mapper ────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): PodcastDbRecord {
  return {
    id: row.id as string,
    episode_title: row.episode_title as string,
    episode_description: (row.episode_description as string) ?? undefined,
    episode_slug: (row.episode_slug as string) ?? "",
    episode_number: (row.episode_number as number) ?? undefined,
    audio_path: row.audio_path as string,
    r2_url: (row.r2_url as string) ?? undefined,
    rsscom_episode_id: (row.rsscom_episode_id as string) ?? undefined,
    rsscom_audio_id: (row.rsscom_audio_id as string) ?? undefined,
    youtube_video_path: (row.youtube_video_path as string) ?? undefined,
    youtube_r2_url: (row.youtube_r2_url as string) ?? undefined,
    blog_source_url: (row.blog_source_url as string) ?? undefined,
    ghost_post_id: (row.ghost_post_id as string) ?? undefined,
    duration_seconds: (row.duration_seconds as number) ?? undefined,
    file_size_bytes: (row.file_size_bytes as number) ?? undefined,
    ghost_embedded: (row.ghost_embedded as boolean) ?? false,
    rsscom_published: (row.rsscom_published as boolean) ?? false,
    youtube_queued: (row.youtube_queued as boolean) ?? false,
    status: row.status as PodcastStatus,
    created_at: row.created_at as Date,
    published_at: (row.published_at as Date) ?? undefined,
  };
}
