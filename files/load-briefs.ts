/**
 * Brief loader — PostgreSQL mode
 *
 * Pulls approved article briefs from the articles table (populated by WF2).
 * Converts each brief into a ContentIdea seed for generate-content.ts.
 *
 * DB schema (articles table):
 *   id, title, url, source, summary, status, brief (JSONB), relevance_score
 *
 * Brief JSON shape (from WF2):
 *   proposed_title, meta_description, angle, key_points[], target_keyword,
 *   estimated_word_count, cta
 */

import pg from "pg";
import type { ContentIdea, Pillar, ContentCategory } from "./types.js";

const { Client } = pg;

export interface ArticleBrief {
  id: string;
  title: string;
  url: string;
  source: string;
  proposed_title: string;
  meta_description: string;
  angle: string;
  key_points: string[];
  target_keyword: string;
  cta: string;
}

function inferPillar(brief: ArticleBrief): Pillar {
  const text = `${brief.proposed_title} ${brief.angle} ${brief.target_keyword}`.toLowerCase();
  if (text.includes("voice") || text.includes("phone") || text.includes("call") || text.includes("chatbot") || text.includes("receptionist")) {
    return "voice_ai";
  }
  if (text.includes("seo") || text.includes("website") || text.includes("google") || text.includes("search") || text.includes("online") || text.includes("digital")) {
    return "growth_digital";
  }
  return "ai_automation"; // default
}

const CATEGORY_ROTATION: ContentCategory[] = [
  "how_to",
  "tip",
  "thought_leadership",
  "case_study",
  "news",
  "comparison",
  "tutorial",
  "quick_win",
  "product_feature",
  "industry_news",
  "video_content",
];

export async function loadApprovedBriefs(limit = 14): Promise<ArticleBrief[]> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const result = await client.query(
      `SELECT id, title, url, source, brief
       FROM articles
       WHERE status = 'approved'
       ORDER BY relevance_score DESC
       LIMIT $1`,
      [limit]
    );

    if (result.rows.length === 0) {
      console.log("  ℹ️  No approved briefs found in database.");
      return [];
    }

    return result.rows.map((row) => {
      let briefData: Record<string, unknown> = {};
      try {
        briefData = typeof row.brief === "string" ? JSON.parse(row.brief) : row.brief || {};
      } catch {
        briefData = {};
      }

      return {
        id: row.id,
        title: row.title || "",
        url: row.url || "",
        source: row.source || "",
        proposed_title: (briefData.proposed_title as string) || row.title || "",
        meta_description: (briefData.meta_description as string) || "",
        angle: (briefData.angle as string) || "",
        key_points: (briefData.key_points as string[]) || [],
        target_keyword: (briefData.target_keyword as string) || "",
        cta: (briefData.cta as string) || "",
      };
    });
  } finally {
    await client.end();
  }
}

export async function markBriefsAsQueued(ids: string[]): Promise<void> {
  if (!ids.length) return;

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    await client.query(
      `UPDATE articles SET status = 'social_queued' WHERE id IN (${placeholders})`,
      ids
    );
    console.log(`  ✅  Marked ${ids.length} articles as social_queued in DB`);
  } finally {
    await client.end();
  }
}

/**
 * Convert ArticleBrief[] into partial ContentIdea[] seeds.
 * These are passed to generateIdeasFromBriefs() in generate-content.ts
 * which fills in the platform variants and image/video prompts.
 */
export function briefsToIdeaSeeds(briefs: ArticleBrief[]): Array<{
  brief: ArticleBrief;
  pillar: Pillar;
  content_category: ContentCategory;
}> {
  return briefs.map((brief, i) => ({
    brief,
    pillar: inferPillar(brief),
    content_category: CATEGORY_ROTATION[i % CATEGORY_ROTATION.length],
  }));
}
