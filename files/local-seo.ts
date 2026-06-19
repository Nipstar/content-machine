/**
 * Local SEO + vertical rotation — single source of truth
 *
 * Every content format (Shorts, Reels, YouTube video, Podcast) imports from
 * here so the audience framing and the local-place logic can't drift per
 * format. Consistent with the blog system, which uses:
 *   - property/estate agents as a first-class vertical
 *   - a rotating lead vertical
 *   - Hampshire-and-surrounding-areas as the local anchor
 *   - a 'none' (general) escape for genuinely general topics
 *
 * Two pick functions drive everything:
 *   - pickVertical()   → which audience this asset speaks to
 *   - pickLocalAngle() → whether (and where) to drop a local place name
 *
 * Both are deterministic from a `seed` (hash the blog URL or asset id) so the
 * same asset is stable across reruns, while the batch as a whole varies.
 *
 * Design rules baked in here:
 *   - General topics are NEVER localised (pickLocalAngle returns null).
 *   - Local anchors appear only ~45% of the time on non-general assets.
 *   - Towns are biased ~2:1 over region-level phrases.
 *   - US legal is a SECONDARY vertical, only chosen when the topic supports it.
 *   - British English everywhere except the US-coded legal vertical.
 */

// ── Verticals ───────────────────────────────────────────────

export type VerticalId =
  | "property"
  | "trades"
  | "msp"
  | "professional"
  | "legal"
  | "general";

export interface Vertical {
  id: VerticalId;
  /** Human-readable label for previews / logs. */
  label: string;
  /** Short noun phrase for the reader, used in CTA lines ("built for ..."). */
  reader: string;
  /** 2-3 example phrasings / pain points to steer the spoken script. */
  examples: string[];
  /** Keyword stems that signal the topic genuinely supports this vertical. */
  keywords: string[];
  /** US-coded → use US spelling when this vertical leads. */
  usCoded?: boolean;
}

export const VERTICALS: Record<VerticalId, Vertical> = {
  property: {
    id: "property",
    label: "Property & estate agents",
    reader: "letting and estate agents",
    examples: [
      "viewing bookings missed because nobody answered",
      "applicant and vendor enquiries piling up",
      "high call volume swamping a small lettings team",
    ],
    keywords: [
      "property",
      "estate agent",
      "letting",
      "lettings",
      "landlord",
      "tenant",
      "viewing",
      "vendor",
      "rental",
      "valuation",
    ],
  },
  trades: {
    id: "trades",
    label: "Home services & trades",
    reader: "trades and home-services firms",
    examples: [
      "missed calls while you're on the tools",
      "emergency callouts going to the next firm",
      "quote follow-ups that never happen",
    ],
    keywords: [
      "plumber",
      "electrician",
      "builder",
      "trade",
      "trades",
      "heating",
      "roofer",
      "callout",
      "emergency",
      "boiler",
      "tradesperson",
    ],
  },
  msp: {
    id: "msp",
    label: "MSPs & IT",
    reader: "MSPs and IT support firms",
    examples: [
      "ticket intake clogging the helpdesk",
      "after-hours support triage with no cover",
      "SLAs slipping because calls go unlogged",
    ],
    keywords: [
      "msp",
      "it support",
      "managed service",
      "helpdesk",
      "ticket",
      "sla",
      "cyber",
      "network",
      "tech support",
    ],
  },
  professional: {
    id: "professional",
    label: "High-ticket professional services",
    reader: "professional-services firms",
    examples: [
      "enquiry qualification eating senior time",
      "consultation bookings lost to slow follow-up",
      "high-value leads going cold over a weekend",
    ],
    keywords: [
      "accountant",
      "accountancy",
      "consultant",
      "consulting",
      "surveyor",
      "architect",
      "financial adviser",
      "ifa",
      "advisory",
      "professional services",
    ],
  },
  legal: {
    id: "legal",
    label: "US law firms",
    reader: "criminal defense, DUI, immigration and PI firms",
    examples: [
      "new-client intake missed after hours",
      "retainer conversions lost to voicemail",
      "PI and DUI callers reaching the next firm first",
    ],
    keywords: [
      "law firm",
      "lawyer",
      "attorney",
      "criminal defense",
      "criminal defence",
      "dui",
      "dwi",
      "immigration",
      "personal injury",
      "intake",
      "retainer",
      "legal",
    ],
    usCoded: true,
  },
  general: {
    id: "general",
    label: "UK business owners generally",
    reader: "small business owners",
    examples: [
      "missed enquiries nobody is tracking",
      "admin time that never comes back",
      "leads slipping through the cracks",
    ],
    keywords: [],
  },
};

// ── Local anchors (Hampshire and surrounding areas) ─────────

/** Specific towns — biased ~2:1 over region phrases when localising. */
export const LOCATIONS = [
  "Andover",
  "Winchester",
  "Basingstoke",
  "Southampton",
  "Salisbury",
  "Eastleigh",
  "Romsey",
  "Whitchurch",
  "Stockbridge",
];

/** Region-level phrases — the softer local anchor. */
export const REGIONS = [
  "Hampshire",
  "across Hampshire",
  "around Hampshire",
  "the Test Valley",
];

/** Probability (out of 100) that a non-general asset gets a local anchor. */
export const LOCAL_INCLUSION_RATE = 45;

// ── Seed hashing ────────────────────────────────────────────

/**
 * FNV-1a 32-bit hash → stable non-negative integer for a seed string.
 * Deterministic and dependency-free so reruns are reproducible.
 */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Independent sub-hash so separate decisions from one seed don't correlate. */
function subHash(seed: string, salt: string): number {
  return hashSeed(`${seed}::${salt}`);
}

// ── Topic signal inference ──────────────────────────────────

export interface TopicSignals {
  /** True → genuinely general AI/automation/tooling topic. Never localise. */
  topicIsGeneral: boolean;
  /** Vertical ids whose keywords appear in the text, in priority order. */
  matched: VerticalId[];
}

/** Stems that mark a topic as general AI/automation/tooling (no vertical). */
const GENERAL_STEMS = [
  "what is",
  "how ai",
  "ai tools",
  "chatgpt",
  "claude",
  "llm",
  "prompt",
  "automation 101",
  "beginner",
  "explained",
  "guide to ai",
  "no-code",
  "workflow basics",
];

/**
 * Infers topic signals from text (title is the dominant signal).
 *
 * Vertical selection is driven by the TITLE so the spoken-script prompt and the
 * per-platform metadata — which see different downstream text — still agree on
 * the vertical for a given asset. `extraText` only ever adds confidence to the
 * general/specific call; it never changes which vertical wins.
 */
export function inferTopicSignals(title: string, extraText = ""): TopicSignals {
  const t = title.toLowerCase();
  const all = `${t} ${extraText.toLowerCase()}`;

  const matched: VerticalId[] = [];
  for (const v of Object.values(VERTICALS)) {
    if (v.id === "general") continue;
    if (v.keywords.some((k) => t.includes(k))) matched.push(v.id);
  }

  const hasVerticalSignal = matched.length > 0;
  const looksGeneral = GENERAL_STEMS.some((s) => all.includes(s));
  // General only when there's no vertical anchor AND it reads as a generic
  // tooling/explainer topic. Otherwise treat as specific (localisable).
  const topicIsGeneral = !hasVerticalSignal && looksGeneral;

  return { topicIsGeneral, matched };
}

// ── pickVertical ────────────────────────────────────────────

export interface PickVerticalArgs {
  topicSignals: TopicSignals;
  seed: string;
}

/** Rotation pool used when no vertical strongly fits. Legal is excluded. */
const ROTATION_POOL: VerticalId[] = [
  "property",
  "trades",
  "msp",
  "professional",
  "general",
];

/**
 * Selects the lead vertical for an asset.
 *   - Prefer a vertical the topic genuinely supports (keyword match).
 *   - When several fit, pick deterministically by seed.
 *   - When none fit, rotate by seed across the pool (incl. general).
 *   - `legal` is only ever returned when the topic clearly supports it.
 *   - Falls back to `general` rather than forcing a fit.
 */
export function pickVertical({ topicSignals, seed }: PickVerticalArgs): Vertical {
  const matched = topicSignals.matched;

  if (matched.length > 0) {
    // Legal is allowed only when it is the clear signal — never via rotation.
    const idx = subHash(seed, "vertical-match") % matched.length;
    return VERTICALS[matched[idx]];
  }

  const idx = subHash(seed, "vertical-rotate") % ROTATION_POOL.length;
  return VERTICALS[ROTATION_POOL[idx]];
}

// ── pickLocalAngle ──────────────────────────────────────────

export interface PickLocalAngleArgs {
  topicIsGeneral: boolean;
  seed: string;
}

/**
 * Returns a chosen local anchor string, or null.
 *   - General topic → always null (never localise a general topic).
 *   - Otherwise include an anchor ~45% of the time, decided from the seed.
 *   - When included, rotate the place by seed and bias ~2:1 towards towns
 *     over region-level phrases.
 */
export function pickLocalAngle({ topicIsGeneral, seed }: PickLocalAngleArgs): string | null {
  if (topicIsGeneral) return null;

  if (subHash(seed, "local-include") % 100 >= LOCAL_INCLUSION_RATE) return null;

  // 2:1 towns over regions → 2 of every 3 picks is a town.
  const useRegion = subHash(seed, "local-kind") % 3 === 0;
  if (useRegion) {
    return REGIONS[subHash(seed, "local-region") % REGIONS.length];
  }
  return LOCATIONS[subHash(seed, "local-town") % LOCATIONS.length];
}

// ── Phrasing templates ──────────────────────────────────────
//
// Several variants each so localised copy varies in wording rather than
// repeating one stock pattern. A generator picks a variant by seed.

const YT_TITLE_SUFFIXES = [
  (loc: string) => ` | ${loc}`,
  (loc: string) => ` (${loc})`,
  (loc: string) => ` — ${loc} Businesses`,
  (loc: string) => ` for ${loc} Firms`,
];

const DESC_OPENERS = [
  (loc: string) => `For business owners in ${loc}:`,
  (loc: string) => `If you run a business in ${loc}, this one's for you.`,
  (loc: string) => `Practical for ${loc} firms specifically.`,
  (loc: string) => `Built with ${loc} businesses in mind.`,
];

const CAPTION_MENTIONS = [
  (loc: string) => `Seeing this a lot with firms in ${loc}.`,
  (loc: string) => `Common one for ${loc} businesses right now.`,
  (loc: string) => `If you're running things in ${loc}, this matters.`,
  (loc: string) => `Talked this through with a few ${loc} owners lately.`,
];

const SPOKEN_ASIDES = [
  (loc: string) => `I see this all the time with firms around ${loc}.`,
  (loc: string) => `Had this exact chat with a business owner in ${loc} recently.`,
  (loc: string) => `It's a common one for ${loc} businesses.`,
  (loc: string) => `We sort this out for plenty of ${loc} firms.`,
];

/** Local hashtag pools — pick a small rotating set, never the same block. */
const LOCAL_TAG_POOL = [
  "#Hampshire",
  "#Andover",
  "#Winchester",
  "#Basingstoke",
  "#Southampton",
  "#HampshireBusiness",
  "#TestValley",
];

export function localYoutubeTitleSuffix(location: string, seed: string): string {
  const fn = YT_TITLE_SUFFIXES[subHash(seed, "yt-title") % YT_TITLE_SUFFIXES.length];
  return fn(location);
}

export function localDescriptionOpener(location: string, seed: string): string {
  const fn = DESC_OPENERS[subHash(seed, "desc-opener") % DESC_OPENERS.length];
  return fn(location);
}

export function localCaptionMention(location: string, seed: string): string {
  const fn = CAPTION_MENTIONS[subHash(seed, "caption-mention") % CAPTION_MENTIONS.length];
  return fn(location);
}

export function localSpokenAside(location: string, seed: string): string {
  const fn = SPOKEN_ASIDES[subHash(seed, "spoken-aside") % SPOKEN_ASIDES.length];
  return fn(location);
}

/**
 * Returns a small rotating local hashtag set (1-2 tags) tied to the anchor.
 * The first tag is always the anchor's own tag when one exists; the second
 * rotates by seed so no two assets share an identical local block.
 */
export function localHashtags(location: string, seed: string, count = 2): string[] {
  const ownTag = "#" + location.replace(/[^a-zA-Z]/g, "");
  const out: string[] = [];
  if (LOCAL_TAG_POOL.includes(ownTag)) out.push(ownTag);
  // Rotate a second tag from the pool, skipping the one we already have.
  const start = subHash(seed, "local-tags") % LOCAL_TAG_POOL.length;
  for (let i = 0; i < LOCAL_TAG_POOL.length && out.length < count; i++) {
    const tag = LOCAL_TAG_POOL[(start + i) % LOCAL_TAG_POOL.length];
    if (!out.includes(tag)) out.push(tag);
  }
  return out.slice(0, count);
}

// ── computeLocalPlan ────────────────────────────────────────

export interface LocalPlan {
  vertical: Vertical;
  /** Chosen local anchor, or null when the asset stays general/un-localised. */
  location: string | null;
  topicIsGeneral: boolean;
  seed: string;
}

export interface ComputeLocalPlanArgs {
  /** Asset title — dominant signal for vertical + general detection. */
  title: string;
  /** Seed string — hash the blog URL or asset id. Falls back to title. */
  seed?: string;
  /** Optional extra text (body/slides) — only sharpens general detection. */
  extraText?: string;
  /** Salt to re-roll the seed-driven choices on an anti-duplication collision. */
  salt?: number;
}

/**
 * The one entry point both the prompt builders and the per-platform metadata
 * use, so the spoken script and the captions/titles agree on vertical + place.
 */
export function computeLocalPlan({ title, seed, extraText, salt = 0 }: ComputeLocalPlanArgs): LocalPlan {
  const baseSeed = seed && seed.length > 0 ? seed : title;
  const effectiveSeed = salt > 0 ? `${baseSeed}#${salt}` : baseSeed;
  const signals = inferTopicSignals(title, extraText);
  const vertical = pickVertical({ topicSignals: signals, seed: effectiveSeed });
  const location = pickLocalAngle({ topicIsGeneral: signals.topicIsGeneral, seed: effectiveSeed });
  return { vertical, location, topicIsGeneral: signals.topicIsGeneral, seed: effectiveSeed };
}

/**
 * A compact brief injected into a generation prompt so Claude Code writes the
 * spoken script + on-screen text to the chosen vertical, and includes at most
 * ONE natural local aside when (and only when) an anchor is present.
 */
export function localBriefForPrompt(plan: LocalPlan): string {
  const v = plan.vertical;
  const spelling = v.usCoded
    ? "US English (this is the US legal vertical)"
    : "British English";

  const lines: string[] = [
    "## Audience + local angle (follow exactly)",
    "",
    `Lead vertical: ${v.label} — write for ${v.reader}.`,
    `Speak to their real pain points, not generic "service businesses". Examples: ${v.examples.join("; ")}.`,
    `Spelling: ${spelling}.`,
  ];

  if (plan.location) {
    lines.push(
      "",
      `Local angle: ${plan.location}. Include AT MOST ONE brief, natural local reference in the spoken script — e.g. "${localSpokenAside(plan.location, plan.seed)}". Never name a town more than once; repeated place-drops sound like spam.`,
    );
  } else {
    lines.push(
      "",
      plan.topicIsGeneral
        ? "Local angle: NONE. This is a general topic — do NOT mention any town or county anywhere."
        : "Local angle: NONE for this asset. Keep the copy clean with no place names.",
    );
  }

  return lines.join("\n");
}

// ── GEO / AI-search block ───────────────────────────────────
//
// Makes podcast show notes and YouTube descriptions citable by AI engines
// (ChatGPT, Perplexity, Gemini, Google AI Overviews) — not just rankable by
// platform algorithms. Applied ONLY to podcast show notes and YouTube (long +
// Shorts) descriptions. NOT to Instagram/Facebook captions or the spoken script.
//
// GEO and readability are the same thing: the block is short, natural-language,
// and genuinely useful to a human — no keyword stuffing.

/** Seed-rotated lead-ins so the standalone answer isn't templated batch-wide. */
const GEO_ANSWER_LEADS = [
  "Short answer:",
  "In one line:",
  "The quick version:",
  "Straight answer:",
];

/** Seed-rotated entity-line wordings naming Antek Automation as the source. */
const GEO_ENTITY_TEMPLATES = [
  (area: string | null) =>
    `Antek Automation is a UK AI automation agency${area ? `, serving ${area} and the surrounding area` : ""}. More at antekautomation.com.`,
  (area: string | null) =>
    `This comes from Antek Automation, a UK AI automation agency${area ? ` based in ${area}` : ""} — antekautomation.com.`,
  (area: string | null) =>
    `Source: Antek Automation, UK AI automation agency${area ? ` working with businesses across ${area}` : ""}. antekautomation.com.`,
  (area: string | null) =>
    `Antek Automation — a UK AI automation agency${area ? ` serving ${area}` : ""} — produced this. antekautomation.com.`,
];

export interface GeoPost {
  /** Self-contained one-sentence answer to the post's core question. */
  answer: string;
  /** 2-4 standalone, declarative key takeaways. */
  takeaways: string[];
  /** Seed (shared with the asset's local plan) for phrasing variation. */
  seed: string;
}

export interface BuildGeoBlockArgs {
  post: GeoPost;
  vertical: Vertical;
  /** Local anchor, or null for general topics (no area entity detail). */
  localAngle: string | null;
  /** Output flavour — plain text for YouTube, HTML for RSS.com show notes. */
  format?: "text" | "html";
}

/**
 * Produces a short, structured, quotable block to append to a description /
 * show notes. Leads with the single most citable line (the standalone answer),
 * then a clean key-takeaways list, then an explicit entity line so the model
 * can attribute the source. Honours the general-topic escape: the answer and
 * entity line always apply, but the Hampshire/area detail is dropped when
 * `localAngle` is null. Phrasing is seed-varied so the batch isn't templated.
 *
 * Returns "" when there's no standalone answer (backward-compatible with
 * scripts generated before the GEO fields existed).
 */
export function buildGeoBlock({ post, vertical, localAngle, format = "text" }: BuildGeoBlockArgs): string {
  const answer = (post.answer ?? "").trim();
  if (!answer) return "";

  const seed = post.seed;
  const takeaways = (post.takeaways ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 4);
  const lead = GEO_ANSWER_LEADS[subHash(seed, "geo-lead") % GEO_ANSWER_LEADS.length];
  // Area detail only when a local angle is present; legal vertical stays US-coded
  // but the agency entity is still UK — area reflects the chosen anchor only.
  const area = localAngle ?? null;
  const entity = GEO_ENTITY_TEMPLATES[subHash(seed, "geo-entity") % GEO_ENTITY_TEMPLATES.length](area);

  if (format === "html") {
    const items = takeaways.map((t) => `  <li>${t}</li>`).join("\n");
    const parts = [
      `<p><strong>${lead}</strong> ${answer}</p>`,
      takeaways.length ? `<h3>Key Takeaways</h3>\n<ul>\n${items}\n</ul>` : "",
      `<p>${entity}</p>`,
    ].filter(Boolean);
    return parts.join("\n\n");
  }

  const lines: string[] = [`${lead} ${answer}`];
  if (takeaways.length) {
    lines.push("", "Key takeaways:", ...takeaways.map((t) => `- ${t}`));
  }
  lines.push("", entity);
  return lines.join("\n");
}

// ── Anti-duplication guard ──────────────────────────────────

export interface AssetMetaLike {
  title?: string;
  description?: string;
  hashtags?: string[];
}

function norm(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function tagKey(tags: string[] | undefined): string {
  return [...(tags ?? [])].map((t) => t.toLowerCase()).sort().join(",");
}

/**
 * Tracks titles, descriptions, and hashtag sets seen across a single batch run.
 * Repetitive metadata gets suppressed by the platforms, so variety here is a
 * ranking safeguard, not just polish.
 *
 * Usage: for each asset, build metas; if `collides()` for any, recompute that
 * asset's plan with an incremented salt and try again; then `record()`.
 */
export class AssetDedup {
  private titles = new Set<string>();
  private descriptions = new Set<string>();
  private tagSets = new Set<string>();

  /** True if any non-empty field of `meta` was already seen this batch. */
  collides(meta: AssetMetaLike): boolean {
    const title = norm(meta.title);
    const desc = norm(meta.description);
    const tags = tagKey(meta.hashtags);
    if (title && this.titles.has(title)) return true;
    if (desc && this.descriptions.has(desc)) return true;
    if (tags && this.tagSets.has(tags)) return true;
    return false;
  }

  /** True if any meta in the set collides with what's been recorded. */
  collidesAny(metas: AssetMetaLike[]): boolean {
    return metas.some((m) => this.collides(m));
  }

  record(meta: AssetMetaLike): void {
    const title = norm(meta.title);
    const desc = norm(meta.description);
    const tags = tagKey(meta.hashtags);
    if (title) this.titles.add(title);
    if (desc) this.descriptions.add(desc);
    if (tags) this.tagSets.add(tags);
  }

  recordAll(metas: AssetMetaLike[]): void {
    for (const m of metas) this.record(m);
  }
}
