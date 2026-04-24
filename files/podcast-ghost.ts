/**
 * Podcast Ghost Embed
 *
 * Prepends an HTML5 audio player card to a Ghost blog post using the
 * Ghost Admin API. Uses JWT authentication (no third-party JWT library —
 * signed manually with Node's built-in crypto module).
 *
 * Ghost Admin API key format: "{key_id}:{hex_secret}"
 * Set via: GHOST_ADMIN_API_URL and GHOST_ADMIN_API_KEY in .env
 *
 * Post lookup supports:
 *   - Full blog URL: extracts the slug from the URL path
 *   - UUID: used directly
 *   - Slug string: used directly
 */

import { createHmac } from "crypto";

// ── JWT helper ────────────────────────────────────────────────

function base64url(input: Buffer | string): string {
  const b = typeof input === "string" ? Buffer.from(input) : input;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function makeGhostJwt(apiKey: string): string {
  const colonIdx = apiKey.indexOf(":");
  if (colonIdx === -1) throw new Error("GHOST_ADMIN_API_KEY must be in the format id:hex_secret");
  const id = apiKey.slice(0, colonIdx);
  const secret = apiKey.slice(colonIdx + 1);

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id }));
  const payload = base64url(JSON.stringify({ iat: now, exp: now + 300, aud: "/admin/" }));
  const data = `${header}.${payload}`;
  const sig = createHmac("sha256", Buffer.from(secret, "hex")).update(data).digest();
  return `${data}.${base64url(sig)}`;
}

// ── Post lookup ───────────────────────────────────────────────

/**
 * Extracts a Ghost slug from various input formats:
 *   - Full URL: https://blog.antekautomation.com/why-ai-agents-ask-questions/ → "why-ai-agents-ask-questions"
 *   - UUID: returned as-is (for direct ID lookup)
 *   - Plain slug: returned as-is
 */
function extractSlugOrId(input: string): { type: "slug" | "id"; value: string } {
  // UUID pattern
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) {
    return { type: "id", value: input };
  }
  // Full URL: extract last non-empty path segment
  if (input.startsWith("http")) {
    const url = new URL(input);
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = parts[parts.length - 1] || parts[parts.length - 2] || "";
    if (!slug) throw new Error(`Could not extract slug from URL: ${input}`);
    return { type: "slug", value: slug };
  }
  // Treat as plain slug
  return { type: "slug", value: input };
}

// ── Lexical content helpers ───────────────────────────────────

interface LexicalRoot {
  root: {
    children: LexicalNode[];
    direction: string;
    format: string;
    indent: number;
    type: "root";
    version: number;
  };
}

interface LexicalNode {
  type: string;
  version: number;
  [key: string]: unknown;
}

function buildAudioCardNode(audioUrl: string, episodeTitle: string, durationSeconds?: number): LexicalNode {
  const durationFormatted = durationSeconds
    ? `${Math.floor(durationSeconds / 60)}:${(durationSeconds % 60).toString().padStart(2, "0")}`
    : "";
  const durationLabel = durationFormatted ? ` (${durationFormatted})` : "";
  const safeTitle = episodeTitle.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const html = `<div style="background:#E8DCC8;border:3px solid #2C2C2C;padding:20px;margin-bottom:24px;">
  <p style="font-weight:900;font-size:16px;color:#2C2C2C;margin:0 0 4px 0;">
    🎧 PREFER TO LISTEN?${durationLabel}
  </p>
  <p style="font-size:13px;color:#555;margin:0 0 12px 0;">${safeTitle}</p>
  <audio controls preload="none" style="width:100%;" src="${audioUrl}">
    Your browser does not support the audio element.
  </audio>
</div>`;

  return { type: "html", version: 1, html };
}

function prependNodeToLexical(existing: string, node: LexicalNode): string {
  let lexical: LexicalRoot;
  try {
    lexical = JSON.parse(existing) as LexicalRoot;
  } catch {
    // Ghost post has no valid lexical content — create a fresh document
    lexical = {
      root: {
        children: [],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    };
  }
  lexical.root.children = [node, ...lexical.root.children];
  return JSON.stringify(lexical);
}

// ── Main export ───────────────────────────────────────────────

/**
 * Prepends an HTML5 audio player to a Ghost blog post.
 *
 * @param postRef         - Blog URL, post UUID, or Ghost slug
 * @param audioUrl        - Public R2 URL for the episode MP3
 * @param episodeTitle    - Human-readable episode title shown above the player
 * @param durationSeconds - Optional episode duration for display
 * @returns               - The Ghost post UUID
 */
export async function embedAudioPlayer(
  postRef: string,
  audioUrl: string,
  episodeTitle: string,
  durationSeconds?: number
): Promise<string> {
  const apiUrl = process.env.GHOST_ADMIN_API_URL;
  const apiKey = process.env.GHOST_ADMIN_API_KEY;

  if (!apiUrl || !apiKey) {
    throw new Error(
      "GHOST_ADMIN_API_URL and GHOST_ADMIN_API_KEY must be set in .env to embed audio players"
    );
  }

  const base = apiUrl.replace(/\/$/, "");
  const jwt = makeGhostJwt(apiKey);
  const headers = {
    Authorization: `Ghost ${jwt}`,
    "Content-Type": "application/json",
    "Accept-Version": "v5.0",
  };

  // Step 1: Fetch the post
  const ref = extractSlugOrId(postRef);
  const fetchUrl =
    ref.type === "id"
      ? `${base}/ghost/api/admin/posts/${ref.value}/?source=lexical&formats=lexical`
      : `${base}/ghost/api/admin/posts/slug/${ref.value}/?source=lexical&formats=lexical`;

  console.log(`  [ghost] fetching post: ${fetchUrl}`);
  const fetchRes = await fetch(fetchUrl, { headers });
  if (!fetchRes.ok) {
    const text = await fetchRes.text();
    throw new Error(`Ghost API fetch failed (${fetchRes.status}): ${text}`);
  }

  const fetchData = (await fetchRes.json()) as { posts: Array<{ id: string; updated_at: string; lexical?: string }> };
  const post = fetchData.posts?.[0];
  if (!post) throw new Error(`Ghost post not found for ref: ${postRef}`);

  const { id, updated_at, lexical = "" } = post;
  console.log(`  [ghost] found post id=${id}, updating lexical content...`);

  // Step 2: Build new lexical content with audio card prepended
  const audioNode = buildAudioCardNode(audioUrl, episodeTitle, durationSeconds);
  const newLexical = prependNodeToLexical(lexical, audioNode);

  // Step 3: Update the post (Ghost requires updated_at for optimistic locking)
  const updateUrl = `${base}/ghost/api/admin/posts/${id}/?source=lexical`;
  const updateRes = await fetch(updateUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      posts: [{ updated_at, lexical: newLexical }],
    }),
  });

  if (!updateRes.ok) {
    const text = await updateRes.text();
    throw new Error(`Ghost API update failed (${updateRes.status}): ${text}`);
  }

  console.log(`  [ghost] ✅ audio player embedded in post ${id}`);
  return id;
}
