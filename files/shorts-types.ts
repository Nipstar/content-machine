/**
 * YouTube Shorts Pipeline — Type definitions
 */

export type SlideType = "hook" | "tip" | "summary" | "cta";

export type ShortStatus = "queued" | "scheduled" | "failed";

export type ShortsPlatform = "youtube" | "instagram" | "facebook";

export interface ShortSlide {
  type: SlideType;
  text: string;
  voiceover_text: string; // Natural spoken version for Fish Audio TTS
  tipNumber?: number;     // 1–3, only for type="tip"
}

export interface SlideAudio {
  slideIndex: number;
  audioPath: string;
  durationSeconds: number; // clamped 3–8s
}

export interface ShortScript {
  slides: ShortSlide[];
  sourceBlogUrl: string;
  sourceBlogTitle: string;
  youtubeTitle: string;        // max 60 chars
  youtubeDescription: string;  // max 200 chars
  youtubeTags: string[];       // exactly 5, must include #Shorts
}

export interface PlatformMeta {
  platform: ShortsPlatform;
  title: string;       // YouTube: max 100 chars. Insta/FB: not used (caption instead)
  description: string; // YouTube: max 5000. Insta: max 2200. FB: max 63206
  hashtags: string[];  // YouTube: max 15. Insta: max 30. FB: max 30
  caption: string;     // Insta/FB only — the post text that accompanies the Reel
}

export interface ShortVideo {
  outputPath: string;
  framePaths: string[];
  duration: number;
  has_voiceover: boolean;
  total_duration_seconds: number;
  r2Url?: string;
  platforms: ShortsPlatform[];
}

export interface ShortDbRecord {
  id: string;
  video_path: string;
  platform: ShortsPlatform; // one row per platform per video
  title?: string;
  description?: string;
  caption?: string;
  tags?: string[];
  blog_source_url?: string;
  status: ShortStatus;
  created_at: Date;
  published_at?: Date;
}
