/**
 * GBP Post Generator
 *
 * Reads blog RSS feed, generates GBP-optimised posts from article content.
 * Each article produces 2-4 posts from different angles (stat, tip, question, CTA).
 * Writes gbp-queue.json for review before DB insertion.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type { Pillar } from "./types.js";
import type { GBPPost, GBPCTAType } from "./gbp-types.js";

const PILLAR_ROTATION: Pillar[] = ["ai_automation", "voice_ai", "growth_digital"];

function inferPillar(title: string, content: string): Pillar {
  const text = `${title} ${content}`.toLowerCase();
  if (text.includes("voice") || text.includes("phone") || text.includes("call") || text.includes("chatbot") || text.includes("receptionist")) {
    return "voice_ai";
  }
  if (text.includes("seo") || text.includes("website") || text.includes("google") || text.includes("search") || text.includes("online") || text.includes("digital")) {
    return "growth_digital";
  }
  return "ai_automation";
}

function inferCTAType(content: string): GBPCTAType {
  const text = content.toLowerCase();
  if (text.includes("book") || text.includes("appointment") || text.includes("demo") || text.includes("consultation")) {
    return "BOOK";
  }
  if (text.includes("call") || text.includes("phone") || text.includes("ring")) {
    return "CALL";
  }
  if (text.includes("sign up") || text.includes("register") || text.includes("subscribe")) {
    return "SIGN_UP";
  }
  return "LEARN_MORE";
}

function buildSchedule(
  count: number,
  frequency: "daily" | "alternate",
  startDate?: string
): { date: string; display: string }[] {
  const start = startDate ? new Date(startDate) : new Date();
  if (!startDate) {
    start.setDate(start.getDate() + 1); // default: tomorrow
  }
  // Set to 08:00 UK time (approximate: set UTC to 08:00, adjust for BST if needed)
  start.setHours(8, 0, 0, 0);

  const step = frequency === "daily" ? 1 : 2;
  const slots: { date: string; display: string }[] = [];

  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i * step);

    const iso = d.toISOString();
    const display = d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    slots.push({ date: iso, display });
  }

  return slots;
}

/**
 * Generate GBP posts from pre-fetched article data.
 * Called by the /gbp slash command which handles RSS fetching and article content retrieval.
 *
 * @param articles - Array of { title, url, content } from the blog RSS feed
 * @param count - Target number of posts to generate
 * @param frequency - "daily" or "alternate" scheduling
 * @param startDate - Optional ISO date string for first post
 */
export function generateGBPPosts(
  articles: Array<{ title: string; url: string; content: string }>,
  count: number,
  frequency: "daily" | "alternate",
  startDate?: string
): GBPPost[] {
  const schedule = buildSchedule(count, frequency, startDate);
  const posts: GBPPost[] = [];

  // Distribute posts across articles, 2-4 per article
  let slotIdx = 0;
  let pillarIdx = 0;

  for (const article of articles) {
    if (slotIdx >= count) break;

    const postsPerArticle = Math.min(
      Math.max(2, Math.ceil((count - slotIdx) / Math.max(1, articles.length - articles.indexOf(article)))),
      4,
      count - slotIdx
    );

    const pillar = inferPillar(article.title, article.content);
    const ctaType = inferCTAType(article.content);

    for (let j = 0; j < postsPerArticle && slotIdx < count; j++) {
      const slot = schedule[slotIdx];
      posts.push({
        id: randomUUID(),
        post_text: "", // Populated by Claude Code during /gbp execution
        image_url: "",
        cta_type: ctaType,
        cta_url: article.url,
        source_url: article.url,
        scheduled_date: slot.date,
        scheduled_display: slot.display,
        status: "queued",
        topic: article.title,
        pillar: pillar || PILLAR_ROTATION[pillarIdx % PILLAR_ROTATION.length],
      });
      slotIdx++;
      pillarIdx++;
    }
  }

  return posts;
}

export function saveGBPQueue(posts: GBPPost[]): string {
  const outPath = join(process.cwd(), "gbp-queue.json");
  writeFileSync(outPath, JSON.stringify(posts, null, 2));
  console.log(`  ✅  ${posts.length} GBP posts written to gbp-queue.json`);
  return outPath;
}

export function loadGBPQueue(): GBPPost[] {
  const filePath = join(process.cwd(), "gbp-queue.json");
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as GBPPost[];
  } catch {
    console.error("❌  Could not read gbp-queue.json. Run /gbp to generate it first.");
    return [];
  }
}
