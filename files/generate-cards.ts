/**
 * Social Cards Generator — Prompt builder and content parser
 *
 * Does NOT call the Claude API. The /cards slash command (Claude Code)
 * handles content extraction. This module provides:
 *   - buildCardsPrompt()   → returns the extraction prompt for the slash command
 *   - parseCardContents()  → validates and parses the Claude-generated JSON
 */

import type {
  CardContent,
  StatContent,
  QuoteContent,
  TipContent,
  ListicleContent,
} from "./cards-types.js";

/**
 * Returns the extraction prompt for Claude Code to derive social card content
 * from a blog post. Claude Code responds with a JSON array of CardContent objects.
 */
export function buildCardsPrompt(blogTitle: string, blogContent: string): string {
  return `You are extracting social media card content from a blog post for Antek Automation. Output a single valid JSON array of CardContent objects. No markdown fences, no extra text — just the JSON array.

## Blog post
Title: ${blogTitle}

${blogContent}

## Instructions

Extract 5-7 cards from this blog post. Every card must be shareable on its own — no context assumed.

### Required cards

**1. stat** (include only if the post has a genuinely compelling number — a stat that makes someone stop scrolling):
- \`number\`: the stat itself (e.g. "62%", "3x", "£1,200/month") — keep it punchy
- \`supporting_text\`: what the stat means (max 10 words, e.g. "of service business calls go unanswered")
- \`source\`: short attribution (e.g. "Source: Antek survey" or "Antek Automation, 2024")

**2. quote** (one per post — the most insightful, provocative, or quotable line):
- \`quote_text\`: verbatim or lightly edited pull quote, max 20 words. Must be punchy. Choose the sharpest line.
- \`attribution\`: always "Andy Norman, Antek Automation"

**3–5. tip** (2-3 tips extracted from the article's practical advice):
- \`tip_text\`: single actionable tip, max 15 words, starts with a verb
- \`tip_number\`: if generating multiple tips, number them "01/03", "02/03", "03/03" etc.
- \`topic_tag\`: uppercase category tag relevant to the tip (e.g. "VOICE AI", "AUTOMATION", "LEAD CAPTURE", "FOLLOW-UP", "CRM", "OPERATIONS")

**6. listicle** (one per post — a "N things" list from the article's main points):
- \`title\`: e.g. "3 Reasons Businesses Miss Calls" or "5 Ways AI Saves Service Teams Time"
- \`items\`: 3-4 bullet points, each max 8 words. Start each with a verb or number.

**7. cta** (always include exactly one — it's a hardcoded brand closer card):
- Just: \`{ "type": "cta" }\`

### Output format

\`\`\`json
[
  { "type": "stat", "number": "62%", "supporting_text": "of business calls go unanswered", "source": "Source: Antek Automation" },
  { "type": "quote", "quote_text": "Every missed call is a missed sale — and most of them are fixable.", "attribution": "Andy Norman, Antek Automation" },
  { "type": "tip", "tip_text": "Set up a missed call text-back within 60 seconds", "tip_number": "01/03", "topic_tag": "LEAD CAPTURE" },
  { "type": "tip", "tip_text": "Use AI to qualify leads outside business hours", "tip_number": "02/03", "topic_tag": "AUTOMATION" },
  { "type": "tip", "tip_text": "Check your missed call log every Friday morning", "tip_number": "03/03", "topic_tag": "OPERATIONS" },
  { "type": "listicle", "title": "3 Reasons Service Businesses Miss Calls", "items": ["No one available — call goes to voicemail", "After-hours enquiries with no follow-up system", "No text-back when calls are missed"] },
  { "type": "cta" }
]
\`\`\`

### Rules
- British English throughout
- All text is tweetable — if it would bore someone on LinkedIn, rewrite it
- stat number must be from the actual blog post — don't make one up
- quote_text must be from or directly inspired by the blog post
- tip items must be genuinely actionable, specific, and directly from the post
- listicle items max 8 words each
- No corporate speak: no "leverage", "synergy", "game-changing", "empower"
- Omit the stat card if there is no compelling number in the post`;
}

/**
 * Validates and parses the Claude-generated JSON into a CardContent array.
 * Throws a descriptive error if structure is invalid.
 */
export function parseCardContents(output: string): CardContent[] {
  let raw: unknown;
  try {
    raw = JSON.parse(output);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`CardContent JSON parse error: ${msg}`);
  }

  if (!Array.isArray(raw)) {
    throw new Error("CardContent validation: output must be a JSON array");
  }
  if (raw.length < 3 || raw.length > 8) {
    throw new Error(
      `CardContent validation: expected 3-8 cards, got ${raw.length}`
    );
  }

  const cards: CardContent[] = [];

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown>;

    if (typeof item.type !== "string") {
      throw new Error(`CardContent validation: card[${i}].type must be a string`);
    }

    switch (item.type) {
      case "stat": {
        if (typeof item.number !== "string")
          throw new Error(`CardContent validation: stat card[${i}].number must be a string`);
        if (typeof item.supporting_text !== "string")
          throw new Error(`CardContent validation: stat card[${i}].supporting_text must be a string`);
        if (typeof item.source !== "string")
          throw new Error(`CardContent validation: stat card[${i}].source must be a string`);
        cards.push(item as StatContent);
        break;
      }
      case "quote": {
        if (typeof item.quote_text !== "string")
          throw new Error(`CardContent validation: quote card[${i}].quote_text must be a string`);
        if (typeof item.attribution !== "string")
          throw new Error(`CardContent validation: quote card[${i}].attribution must be a string`);
        const words = (item.quote_text as string).split(/\s+/).length;
        if (words > 25) {
          throw new Error(
            `CardContent validation: quote card[${i}].quote_text too long (${words} words, max 20)`
          );
        }
        cards.push(item as QuoteContent);
        break;
      }
      case "tip": {
        if (typeof item.tip_text !== "string")
          throw new Error(`CardContent validation: tip card[${i}].tip_text must be a string`);
        if (typeof item.topic_tag !== "string")
          throw new Error(`CardContent validation: tip card[${i}].topic_tag must be a string`);
        cards.push(item as TipContent);
        break;
      }
      case "listicle": {
        if (typeof item.title !== "string")
          throw new Error(`CardContent validation: listicle card[${i}].title must be a string`);
        if (!Array.isArray(item.items) || item.items.length < 2 || item.items.length > 5)
          throw new Error(
            `CardContent validation: listicle card[${i}].items must be an array of 2-5 strings`
          );
        cards.push(item as ListicleContent);
        break;
      }
      case "cta": {
        cards.push({ type: "cta" });
        break;
      }
      default:
        throw new Error(
          `CardContent validation: card[${i}].type "${item.type}" is not a valid CardType`
        );
    }
  }

  return cards;
}
