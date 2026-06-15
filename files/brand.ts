/**
 * Canonical Antek Automation brand palette.
 *
 * Single source of truth for image generation across all renderers
 * (cards, gbp, shorts, personal, youtube, podcast, banner).
 *
 * Derived from the quote-card reference set in assets/brand-examples/
 * (sampled 2026-06-15). Prefer importing these constants over hardcoding
 * hex strings in new renderers.
 */

export const BRAND = {
  /** Vivid coral-orange — primary accent, emphasis headline lines, quote mark, rules, bullets */
  coral: "#FF5C3A",
  /** Warm off-white — light backgrounds and primary text on dark */
  cream: "#F0EBE0",
  /** Warm near-black — dark backgrounds and primary text on light */
  charcoal: "#2B2B2B",
  /** Darker charcoal for crisp text on cream backgrounds (used in reference light cards) */
  ink: "#1C1C1C",
  /** Muted warm grey — kicker / eyebrow text, faint grid lines (replaces the retired sage) */
  grey: "#97958F",
} as const;

/** Background modes used by the quote-card system. */
export const BG = {
  dark: BRAND.charcoal,
  light: BRAND.cream,
} as const;

export type BrandColor = keyof typeof BRAND;
