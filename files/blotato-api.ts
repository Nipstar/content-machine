/**
 * Blotato REST API client — direct HTTP, no MCP dependency.
 *
 * Base:   https://backend.blotato.com/v2
 * Auth:   header `blotato-api-key: <BLOTATO_API_KEY>`
 * Docs:   contract reverse-verified against the live API (2026-08).
 *
 * Post body shape (POST /v2/posts):
 *   {
 *     post: {
 *       accountId: "<id>",
 *       target:  { targetType, pageId?, mediaType?, title?, privacyStatus?, shouldNotifySubscribers? },
 *       content: { text, platform, mediaUrls: [] }
 *     },
 *     scheduledTime?: "<ISO 8601>"   // OMIT = publish immediately
 *   }
 *
 * ⚠️  A create call WITHOUT scheduledTime publishes instantly. Always pass a
 *     future scheduledTime unless you truly mean "post now".
 */
import "dotenv/config";

const BASE = "https://backend.blotato.com/v2";

function apiKey(): string {
  const k = process.env.BLOTATO_API_KEY;
  if (!k) throw new Error("BLOTATO_API_KEY not set in environment");
  return k;
}

function headers(hasBody: boolean): Record<string, string> {
  const h: Record<string, string> = { "blotato-api-key": apiKey() };
  // Only advertise a JSON body when one is actually sent — the API rejects
  // GET/DELETE that carry Content-Type: application/json with no body.
  if (hasBody) h["Content-Type"] = "application/json";
  return h;
}

async function req(method: string, path: string, body?: unknown): Promise<any> {
  const hasBody = body !== undefined;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(hasBody),
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Blotato ${method} ${path} failed (${res.status}): ${text}`);
  }
  return json;
}

// ── Flat post params (as produced by plan-schedule / manifest) ──────────────
export interface FlatPost {
  accountId: string | number;
  platform: string; // twitter | facebook | instagram | linkedin | youtube | tiktok | pinterest | threads | bluesky
  text: string;
  mediaUrls?: string[];
  scheduledTime?: string; // ISO 8601; omit for immediate publish
  // target-only extras (routed into `target`):
  pageId?: string;
  mediaType?: string; // instagram/facebook: reel | story
  title?: string; // youtube/pinterest/tiktok
  privacyStatus?: string; // youtube: public | private | unlisted
  shouldNotifySubscribers?: boolean; // youtube
  boardId?: string; // pinterest
  firstComment?: string; // facebook/instagram
  link?: string; // facebook/pinterest
  altText?: string; // instagram/pinterest
}

// Keys that belong inside `target` (everything else platform-specific stays out of content).
// Mirrors the per-platform target fields in the Blotato API reference.
const TARGET_KEYS = [
  "pageId",
  "mediaType",
  "title",
  "privacyStatus",
  "shouldNotifySubscribers",
  "boardId",
  "firstComment",
  "link",
  "altText",
] as const;

/** Build the nested REST body from flat params. */
export function buildPostBody(p: FlatPost): Record<string, unknown> {
  const target: Record<string, unknown> = { targetType: p.platform };
  for (const k of TARGET_KEYS) {
    if (p[k] !== undefined) target[k] = p[k];
  }
  const body: Record<string, unknown> = {
    post: {
      accountId: String(p.accountId),
      target,
      content: {
        text: p.text,
        platform: p.platform,
        mediaUrls: p.mediaUrls ?? [],
      },
    },
  };
  if (p.scheduledTime) body.scheduledTime = p.scheduledTime;
  return body;
}

/**
 * Schedule a post. Returns { postSubmissionId }.
 *
 * SCHEDULE-ONLY by policy: a future `scheduledTime` is REQUIRED. A body without
 * scheduledTime publishes instantly on Blotato's side, so this function refuses
 * to send one — preventing accidental immediate posts. Missing or past times
 * throw before any network call.
 */
export async function createPost(p: FlatPost): Promise<{ postSubmissionId: string }> {
  if (!p.scheduledTime) {
    throw new Error(`createPost: scheduledTime is required (schedule-only; direct publish is disabled)`);
  }
  const t = Date.parse(p.scheduledTime);
  if (Number.isNaN(t)) {
    throw new Error(`createPost: scheduledTime is not a valid ISO 8601 timestamp: ${p.scheduledTime}`);
  }
  if (t <= Date.now()) {
    throw new Error(`createPost: scheduledTime must be in the future (got ${p.scheduledTime})`);
  }
  return req("POST", "/posts", buildPostBody(p));
}

/** Get publish/schedule status of a submission. */
export async function getPostStatus(postSubmissionId: string): Promise<any> {
  return req("GET", `/posts/${postSubmissionId}`);
}

/** List future scheduled posts (paginated). */
export async function listSchedules(limit = 50, cursor?: string): Promise<{ items: any[]; nextCursor?: string }> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (cursor) q.set("cursor", cursor);
  return req("GET", `/schedules?${q.toString()}`);
}

/** Delete a scheduled post by schedule id (cancels the publish job). */
export async function deleteSchedule(id: string): Promise<void> {
  await req("DELETE", `/schedules/${id}`);
}

/** Remaining credits + account email. */
export async function getCredits(): Promise<{ creditsRemaining: number; accountEmail: string }> {
  return req("GET", "/credits");
}

/** Authenticated user profile. */
export async function getUser(): Promise<any> {
  return req("GET", "/users/me");
}

/** List connected social accounts: items[].{id, platform, fullname, username}. */
export async function listAccounts(): Promise<{ items: any[] }> {
  return req("GET", "/users/me/accounts");
}

/** List Facebook/LinkedIn sub-accounts (pages). items[].id → use as target.pageId. */
export async function listSubaccounts(accountId: string): Promise<{ items: any[] }> {
  return req("GET", `/users/me/accounts/${accountId}/subaccounts`);
}

/**
 * Upload media from a PUBLIC url into Blotato hosting → returns { url }.
 * Only needed when a platform rejects the raw source URL; public R2 URLs can
 * usually be passed straight into content.mediaUrls without this step.
 * (POST /media, 30 req/min)
 */
export async function uploadMediaFromUrl(url: string): Promise<{ url: string }> {
  return req("POST", "/media", { url });
}
