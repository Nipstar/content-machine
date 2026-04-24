/**
 * GBP Post Queue — PostgreSQL operations
 *
 * Manages the gbp_post_queue table used by n8n WF7 to post to Google Business Profile.
 * Follows the same pg client pattern as load-briefs.ts.
 */

import pg from "pg";
import type { GBPPost } from "./gbp-types.js";

const { Client } = pg;

function createClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
}

export async function ensureGBPTable(): Promise<void> {
  const client = createClient();
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS gbp_post_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_text TEXT NOT NULL,
        image_url TEXT,
        cta_type TEXT DEFAULT 'LEARN_MORE',
        cta_url TEXT,
        source_url TEXT,
        topic TEXT,
        pillar TEXT,
        template_variant TEXT,
        scheduled_date TIMESTAMPTZ NOT NULL,
        status TEXT DEFAULT 'queued',
        posted_at TIMESTAMPTZ,
        gbp_post_id TEXT,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_gbp_queue_status_date
        ON gbp_post_queue(status, scheduled_date);
    `);
    console.log("  ✅  gbp_post_queue table ready");
  } finally {
    await client.end();
  }
}

export async function insertGBPPosts(posts: GBPPost[]): Promise<number> {
  if (!posts.length) return 0;

  const client = createClient();
  try {
    await client.connect();

    const values: unknown[] = [];
    const rows: string[] = [];

    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      const offset = i * 10;
      rows.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`
      );
      values.push(
        p.post_text,
        p.image_url || null,
        p.cta_type,
        p.cta_url,
        p.source_url,
        p.topic,
        p.pillar,
        (p as any).template_variant || null,
        p.scheduled_date,
        p.status
      );
    }

    const query = `
      INSERT INTO gbp_post_queue (post_text, image_url, cta_type, cta_url, source_url, topic, pillar, template_variant, scheduled_date, status)
      VALUES ${rows.join(",\n")}
    `;

    await client.query(query, values);
    console.log(`  ✅  ${posts.length} GBP posts inserted into queue`);
    return posts.length;
  } finally {
    await client.end();
  }
}

export async function getNextQueuedPost(): Promise<GBPPost | null> {
  const client = createClient();
  try {
    await client.connect();
    const result = await client.query(
      `SELECT id, post_text, image_url, cta_type, cta_url, source_url,
              scheduled_date, topic, pillar, status
       FROM gbp_post_queue
       WHERE status = 'queued' AND scheduled_date <= now()
       ORDER BY scheduled_date ASC
       LIMIT 1`
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      post_text: row.post_text,
      image_url: row.image_url || "",
      cta_type: row.cta_type,
      cta_url: row.cta_url || "",
      source_url: row.source_url || "",
      scheduled_date: row.scheduled_date,
      scheduled_display: "",
      status: row.status,
      topic: row.topic || "",
      pillar: row.pillar || "ai_automation",
    };
  } finally {
    await client.end();
  }
}

export async function markAsPosted(id: string, gbpPostId: string): Promise<void> {
  const client = createClient();
  try {
    await client.connect();
    await client.query(
      `UPDATE gbp_post_queue SET status = 'posted', posted_at = now(), gbp_post_id = $1 WHERE id = $2`,
      [gbpPostId, id]
    );
  } finally {
    await client.end();
  }
}

export async function markAsFailed(id: string, error: string): Promise<void> {
  const client = createClient();
  try {
    await client.connect();
    await client.query(
      `UPDATE gbp_post_queue SET status = 'failed', error_message = $1 WHERE id = $2`,
      [error, id]
    );
  } finally {
    await client.end();
  }
}

export async function getQueueSummary(): Promise<{
  queued: number;
  posted: number;
  failed: number;
  next_date: string;
}> {
  const client = createClient();
  try {
    await client.connect();

    const counts = await client.query(`
      SELECT status, COUNT(*)::int as count
      FROM gbp_post_queue
      GROUP BY status
    `);

    const summary = { queued: 0, posted: 0, failed: 0, next_date: "" };
    for (const row of counts.rows) {
      if (row.status in summary) {
        (summary as Record<string, number | string>)[row.status] = row.count;
      }
    }

    const next = await client.query(`
      SELECT scheduled_date FROM gbp_post_queue
      WHERE status = 'queued'
      ORDER BY scheduled_date ASC
      LIMIT 1
    `);

    if (next.rows.length > 0) {
      summary.next_date = next.rows[0].scheduled_date;
    }

    return summary;
  } finally {
    await client.end();
  }
}
