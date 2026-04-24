/**
 * Types for personal social content pipeline.
 * Used by /personal slash command — personal LinkedIn, X, IG, FB, YouTube Reels.
 */

import type { Pillar, ContentCategory } from './types.js';

/** 4-format rotation used across the 28-day personal calendar */
export type ContentFormat = "text" | "reel" | "carousel" | "youtube_video";

export interface PersonalVariant {
  body: string;
  first_comment?: string;  // blog URL for linkedin; hashtags for instagram
  hashtags?: string[];
  scheduled_at: string;    // ISO 8601
  scheduled_display: string;
}

/**
 * One blog post → one PersonalContentIdea with platform variants.
 *
 * personal_linkedin posts to personal profile (accountId 14687, NO pageId).
 * twitter / facebook / instagram use existing account IDs.
 *
 * Reels (YouTube/IG/FB video) are generated separately via the shorts pipeline
 * using the same source_url.
 */
export interface PersonalContentIdea {
  idea_id: string;
  source_url: string;
  slug: string;
  topic: string;
  hook: string;
  pillar: Pillar;
  content_category: ContentCategory;
  /** Assigned by personal-cli.ts based on 4-day rotation */
  content_format: ContentFormat;
  /** Populated by personal-cli.ts — leave empty when generating */
  scheduled_at?: string;
  scheduled_display?: string;
  variants: {
    personal_linkedin: PersonalVariant;
    twitter: PersonalVariant;
    facebook: PersonalVariant;
    instagram: PersonalVariant;
  };
}
