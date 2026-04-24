/**
 * Types for 2-minute landscape YouTube video pipeline.
 * Separate from Shorts (9:16 vertical) — this is 16:9 at 1920×1080.
 */

export type YTSlideType = "intro" | "context" | "point" | "takeaway" | "cta";

export interface YTSlide {
  type: YTSlideType;
  text: string;             // on-screen text (concise)
  voiceover_text: string;   // spoken version (conversational, British English)
  pointNumber?: number;     // only for type === "point"
}

export interface YTVideoScript {
  slides: YTSlide[];
  sourceBlogUrl: string;
  sourceBlogTitle: string;
  youtubeTitle: string;          // max 80 chars (longer format, not #Shorts)
  youtubeDescription: string;    // max 500 chars + blog URL
  youtubeTags: string[];         // 8-12 hashtags, NO #Shorts
}

export interface YTVideoOutput {
  mp4Path: string;
  r2Url: string;
  slug: string;
}
