/**
 * Blotato template mapping.
 *
 * Maps each ContentCategory to a primary + fallback Blotato template.
 * Used by the CLI to assign templates before Claude Code creates media via MCP.
 */

import type { ContentCategory, ContentIdea } from "./types.js";

// ── Blotato template catalogue ────────────────────────────────

export const BLOTATO_TEMPLATES = {
  infographic: [
    "Newspaper Infographic",
    "Whiteboard Infographic",
    "Chalkboard Infographic",
    "Classroom Chalkboard Infographic",
    "Top Secret Infographic",
    "Book Page Infographic",
    "TV Wall Infographic",
    "Movie Theater Infographic",
    "Bus Ad Infographic",
    "Billboard Infographic",
    "Trail Marker Infographic",
    "Cave Painting Infographic",
    "Egyptian Hieroglyph Infographic",
    "Graffiti Mural Infographic",
    "Steampunk Infographic",
    "T-Shirt Infographic",
    "Manga Panel Infographic",
    "Constellation Infographic",
  ],
  carousel: [
    "Tweet Card Carousel with Minimal Style",
    "Tweet Card Carousel with Photo/Video Background",
    "Tutorial Carousel with Monocolor Background",
    "Tutorial Carousel with Minimalist Flat Style",
    "Quote Card Carousel with Paper Background and Highlight",
    "Quote Card Carousel with Monocolor Background",
    "Single Centered Text Quote",
    "When X then Y Text Slideshow",
  ],
  image: [
    "Image Slideshow with Text Overlays",
    "Image Slideshow with Prominent Text",
    "Futuristic Flyer",
    "Breaking News",
    "Product Scene Placement",
  ],
  video: [
    "AI Video with AI Voice",
    "AI Agent Visual Generator",
    "AI Selfie Talking Video with Consistent Character",
    "AI Avatar with AI Generated B-roll",
    "Video of Images and Text with Minimal Style",
    "Stunning Viral Realtor Video",
  ],
} as const;

// ── Category → template mapping ───────────────────────────────

export const TEMPLATE_MAP: Record<ContentCategory, [string, string]> = {
  how_to:             ["Newspaper Infographic", "Tutorial Carousel with Monocolor Background"],
  tutorial:           ["Newspaper Infographic", "Tutorial Carousel with Monocolor Background"],
  tip:                ["Chalkboard Infographic", "Single Centered Text Quote"],
  quick_win:          ["Chalkboard Infographic", "Single Centered Text Quote"],
  thought_leadership: ["Tweet Card Carousel with Minimal Style", "Quote Card Carousel with Monocolor Background"],
  case_study:         ["Top Secret Infographic", "Whiteboard Infographic"],
  product_feature:    ["Product Scene Placement", "Futuristic Flyer"],
  news:               ["Breaking News", "Newspaper Infographic"],
  industry_news:      ["Breaking News", "Newspaper Infographic"],
  comparison:         ["Whiteboard Infographic", "When X then Y Text Slideshow"],
  video_content:      ["AI Video with AI Voice", "AI Avatar with AI Generated B-roll"],
};

// ── Public helpers ────────────────────────────────────────────

export function mapToTemplate(idea: ContentIdea): string {
  const templates = TEMPLATE_MAP[idea.content_category];
  return templates[0];
}

export function getAlternateTemplate(idea: ContentIdea): string {
  const templates = TEMPLATE_MAP[idea.content_category];
  return templates[1];
}
