#!/usr/bin/env node
/**
 * Weekly social-cards runner.
 *
 * Reads content.json (7 ideas), maps each idea to a hero CardContent,
 * renders 3 sizes per idea via cards-render.ts, uploads PNGs to R2 via
 * gbp-image-gen.ts uploadToR2(), and writes weekly-card-urls.json keyed by
 * idea_id → { landscape, square, portrait }.
 *
 * Usage: npx tsx weekly-cards-run.ts
 */

import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { renderCard, closeBrowser } from "./cards-render.js";
import { uploadToR2 } from "./gbp-image-gen.js";
import type { CardContent, CardSize } from "./cards-types.js";

interface IdeaCard {
  idea_id: string;
  slug: string;
  content: CardContent;
}

const SIZES: CardSize[] = ["landscape", "square", "portrait"];

const CARDS: IdeaCard[] = [
  {
    idea_id: "idea_0",
    slug: "law-firms-dont-need-code",
    content: {
      type: "quote",
      quote_text: "Was the phone answered when the case walked in?",
      attribution: "Andy Norman, Antek Automation",
    },
  },
  {
    idea_id: "idea_1",
    slug: "agentic-seo-for-law-firms",
    content: {
      type: "tip",
      tip_text: "Clients ask ChatGPT for lawyers. If you're not cited, you're invisible.",
      topic_tag: "AI SEARCH",
    },
  },
  {
    idea_id: "idea_2",
    slug: "legal-ai-vs-missed-calls",
    content: {
      type: "stat",
      number: "£5k",
      supporting_text: "PI retainer walking away every missed weekend call",
      source: "Antek Automation",
    },
  },
  {
    idea_id: "idea_3",
    slug: "content-engineering-law-firms",
    content: {
      type: "listicle",
      title: "Why your firm's blog isn't booking clients",
      items: [
        "Writing for lawyers, not searchers",
        "Topics chosen, not queries",
        "Blog posts instead of service pages",
      ],
    },
  },
  {
    idea_id: "idea_4",
    slug: "answering-as-infrastructure",
    content: {
      type: "quote",
      quote_text: "If losing it for an hour costs you a client, it's infrastructure.",
      attribution: "Andy Norman, Antek Automation",
    },
  },
  {
    idea_id: "idea_5",
    slug: "knowledge-graph-problem",
    content: {
      type: "stat",
      number: "£1,800",
      supporting_text: "spent on SEO each month with zero local rankings, usually a NAP mismatch",
      source: "Antek Automation",
    },
  },
  {
    idea_id: "idea_6",
    slug: "quote-fix-rule-feedback",
    content: {
      type: "tip",
      tip_text: "Quote the moment. Fix the line. Write the rule. That's how feedback fixes systems.",
      topic_tag: "OPERATIONS",
    },
  },
];

interface CardUrlSet {
  landscape: string;
  square: string;
  portrait: string;
}

async function main() {
  const out: Record<string, CardUrlSet> = {};
  const total = CARDS.length * SIZES.length;
  let n = 0;

  console.log(`\n  Rendering + uploading ${total} cards (${CARDS.length} ideas × ${SIZES.length} sizes)...\n`);

  try {
    for (const idea of CARDS) {
      const set: Partial<CardUrlSet> = {};
      for (const size of SIZES) {
        n++;
        const localPath = await renderCard(idea.content, size, idea.slug);
        const filename = `weekly/${idea.slug}_${idea.content.type}_${size}.png`;
        const buffer = readFileSync(localPath);
        const url = await uploadToR2(buffer, filename);
        set[size] = url;
        console.log(`  [${n}/${total}] ${idea.idea_id} ${size.padEnd(10)} → ${url}`);
      }
      out[idea.idea_id] = set as CardUrlSet;
    }
  } finally {
    await closeBrowser();
  }

  const outPath = join(process.cwd(), "weekly-card-urls.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\n  Wrote ${outPath}\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
