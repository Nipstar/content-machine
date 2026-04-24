/**
 * Social Cards Pipeline — Type definitions
 */

export type CardType = "stat" | "quote" | "tip" | "listicle" | "cta";

export type CardSize = "landscape" | "square" | "portrait";

// ── Per-card content interfaces ───────────────────────────────

export interface StatContent {
  type: "stat";
  number: string;           // e.g. "62%", "3x", "£1,200"
  supporting_text: string;  // e.g. "of business calls go unanswered"
  source: string;           // e.g. "Source: Antek Automation" — keep short
}

export interface QuoteContent {
  type: "quote";
  quote_text: string;  // max 20 words — the most insightful/provocative line
  attribution: string; // e.g. "Andy Norman, Antek Automation"
}

export interface TipContent {
  type: "tip";
  tip_text: string;     // max 15 words
  tip_number?: string;  // e.g. "01/05" — present for carousel series
  topic_tag: string;    // e.g. "VOICE AI" or "AUTOMATION" — uppercase
}

export interface ListicleContent {
  type: "listicle";
  title: string;    // e.g. "3 Ways AI Saves You Time"
  items: string[];  // 3-4 items, each max 8 words
}

export interface CTAContent {
  type: "cta";
  // No fields — content is always the hardcoded Antek brand closer
}

export type CardContent =
  | StatContent
  | QuoteContent
  | TipContent
  | ListicleContent
  | CTAContent;

// ── Output types ──────────────────────────────────────────────

export interface CardOutput {
  type: CardType;
  size: CardSize;
  imagePath: string;
  slug: string;
}

/** All size variants of a single card (same content, 3 aspect ratios) */
export type CardSet = CardOutput[];
