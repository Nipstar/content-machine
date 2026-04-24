/**
 * Shorts Queue — PostgreSQL operations
 *
 * Tracks the status of generated Shorts after Blotato MCP scheduling.
 * One row per platform per video — queueShort() inserts a row for each
 * target platform from a single PlatformMeta[].
 *
 * Blotato MCP is the primary handoff; this table is for audit/tracking only.
 */

import pg from "pg";
import type { ShortDbRecord, ShortsPlatform, PlatformMeta } from "./shorts-types.js";

const { Client } = pg;

function createClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
}

export async function initShortsTable(): Promise<void> {
  const client = createClient();
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS shorts_queue (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        video_path      TEXT NOT NULL,
        platform        TEXT NOT NULL,
        title           TEXT,
        description     TEXT,
        caption         TEXT,
        tags            TEXT[],
        blog_source_url TEXT,
        status          TEXT DEFAULT 'queued',
        created_at      TIMESTAMPTZ DEFAULT now(),
        published_at    TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS shorts_queue_status_idx
        ON shorts_queue (status, created_at);
    `);
    console.log("  ✅  shorts_queue table ready");
  } finally {
    await client.end();
  }
}

/**
 * Inserts one row per platform for a single video.
 * Returns the UUIDs of all inserted rows in the same order as platformMetas.
 */
export async function queueShort(
  baseRecord: { video_path: string; blog_source_url: string },
  platformMetas: PlatformMeta[]
): Promise<string[]> {
  const client = createClient();
  try {
    await client.connect();
    const ids: string[] = [];
    for (const meta of platformMetas) {
      const result = await client.query(
        `INSERT INTO shorts_queue
          (video_path, platform, title, description, caption, tags, blog_source_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          baseRecord.video_path,
          meta.platform,
          meta.title || null,
          meta.description || null,
          meta.caption || null,
          meta.hashtags,
          baseRecord.blog_source_url,
        ]
      );
      ids.push(result.rows[0].id as string);
    }
    return ids;
  } finally {
    await client.end();
  }
}

export async function getNextShort(): Promise<ShortDbRecord | null> {
  const client = createClient();
  try {
    await client.connect();
    const result = await client.query(
      `SELECT * FROM shorts_queue
       WHERE status = 'queued'
       ORDER BY created_at ASC
       LIMIT 1`
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      video_path: row.video_path,
      platform: row.platform as ShortsPlatform,
      title: row.title ?? undefined,
      description: row.description ?? undefined,
      caption: row.caption ?? undefined,
      tags: row.tags ?? undefined,
      blog_source_url: row.blog_source_url ?? undefined,
      status: row.status,
      created_at: row.created_at,
      published_at: row.published_at ?? undefined,
    };
  } finally {
    await client.end();
  }
}

export async function markScheduled(id: string): Promise<void> {
  const client = createClient();
  try {
    await client.connect();
    await client.query(
      `UPDATE shorts_queue
       SET status = 'scheduled', published_at = now()
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
      `UPDATE shorts_queue SET status = 'failed' WHERE id = $1`,
      [id]
    );
  } finally {
    await client.end();
  }
}

/**
 * Returns all blog_source_url values already in the queue (any status).
 * Used by batch mode to skip posts that have already been processed.
 */
export async function getProcessedUrls(): Promise<string[]> {
  const client = createClient();
  try {
    await client.connect();
    const result = await client.query(
      `SELECT DISTINCT blog_source_url FROM shorts_queue`
    );
    return result.rows.map((r) => r.blog_source_url as string);
  } finally {
    await client.end();
  }
}
