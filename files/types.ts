/**
 * Social Content Machine — Type definitions
 */

export type Pillar = "ai_automation" | "voice_ai" | "growth_digital";

export type Platform = "linkedin" | "twitter" | "facebook" | "instagram";

export type ContentCategory =
  | "how_to"
  | "tutorial"
  | "tip"
  | "quick_win"
  | "thought_leadership"
  | "case_study"
  | "product_feature"
  | "news"
  | "industry_news"
  | "comparison"
  | "video_content";

export interface PlatformPost {
  body: string;
  first_comment?: string;
  hashtags?: string[];
  scheduled_at: string;      // ISO 8601
  scheduled_display: string; // human-readable, e.g. "Mon 14 Apr at 8:00"
}

export interface ContentIdea {
  idea_id: string;
  pillar: Pillar;
  content_category: ContentCategory;
  topic: string;
  hook: string;
  variants: {
    linkedin: PlatformPost;
    twitter: PlatformPost;
    facebook: PlatformPost;
    instagram: PlatformPost;
  };
  image_prompt_landscape: string;
  image_prompt_square: string;
  video_motion_prompt: string;
  /** Blotato template name assigned by template-mapping.ts */
  blotato_template?: string;
}
