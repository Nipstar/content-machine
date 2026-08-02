import { readFileSync, writeFileSync, existsSync } from "fs";

// Blotato accounts (personal batch). Facebook posts ONLY to the company Page
// (Blotato can't post a personal FB profile) — pageId is required.
const ACC = { linkedin: 14687, twitter: 13863, facebook: 22303, instagram: 34604, youtube: 29641 } as const;
const FB_PAGE = "999920689867882";

type Post = {
  label: string;
  platform: keyof typeof ACC;
  accountId: number;
  text: string;
  scheduledTime: string;
  title?: string;
  mediaUrls?: string[];
  pageId?: string;
  privacyStatus?: string;
  shouldNotifySubscribers?: boolean;
  mediaType?: string;
};

const ideas = JSON.parse(readFileSync("personal-content.json", "utf-8"));
const reelManifest = existsSync("shorts-manifest.json") ? JSON.parse(readFileSync("shorts-manifest.json", "utf-8")).reels : [];
const carouselUrls: Record<string, string[]> = existsSync("carousel-urls.json") ? JSON.parse(readFileSync("carousel-urls.json", "utf-8")) : {};
const ytVideos = existsSync("yt-urls.json") ? JSON.parse(readFileSync("yt-urls.json", "utf-8")).videos : [];
const cards: Record<string, { landscapeUrl: string; squareUrl: string }> = existsSync("personal-image-urls.json") ? JSON.parse(readFileSync("personal-image-urls.json", "utf-8")) : {};

const at = (iso: string, hourZ: number) => iso.slice(0, 10) + `T${String(hourZ).padStart(2, "0")}:00:00.000Z`;
const first5Tags = (s = "") => s.trim().split(/\s+/).filter((t) => t.startsWith("#")).slice(0, 5).join(" ");

const posts: Post[] = [];
const warn: string[] = [];

for (const idea of ideas) {
  const fmt = idea.content_format;
  const v = idea.variants;
  const url = idea.source_url;
  const card = cards[idea.idea_id] || { landscapeUrl: "", squareUrl: "" };
  const land = card.landscapeUrl ? [card.landscapeUrl] : undefined;
  const sq = card.squareUrl ? [card.squareUrl] : undefined;
  const mediaTime = at(v.personal_linkedin.scheduled_at, 16); // 17:00 UK for reels/YT

  // ── TEXT posts (X + FB always; LI + IG skipped on carousel days — carousel carries the body) ──
  posts.push({ label: `${idea.idea_id}:x-text`, platform: "twitter", accountId: ACC.twitter, text: v.twitter.body, mediaUrls: land, scheduledTime: v.twitter.scheduled_at });
  posts.push({ label: `${idea.idea_id}:fb-text`, platform: "facebook", accountId: ACC.facebook, pageId: FB_PAGE, text: v.facebook.body, mediaUrls: land, scheduledTime: v.facebook.scheduled_at });
  if (fmt !== "carousel") {
    posts.push({ label: `${idea.idea_id}:li-text`, platform: "linkedin", accountId: ACC.linkedin, text: `${v.personal_linkedin.body}\n\nFull article: ${url}`, mediaUrls: land, scheduledTime: v.personal_linkedin.scheduled_at });
    const tags = first5Tags(v.instagram.first_comment);
    if (sq) posts.push({ label: `${idea.idea_id}:ig-text`, platform: "instagram", accountId: ACC.instagram, text: tags ? `${v.instagram.body}\n\n${tags}` : v.instagram.body, mediaUrls: sq, scheduledTime: v.instagram.scheduled_at });
    else warn.push(`${idea.idea_id}: no hook card → IG text post skipped`);
  }

  // ── MEDIA ──
  if (fmt === "reel") {
    const r = reelManifest.find((x: any) => x.source_url === url);
    if (!r) { warn.push(`${idea.idea_id}: no reel manifest`); continue; }
    const m = r.platform_meta || {};
    posts.push({ label: `${idea.idea_id}:yt-reel`, platform: "youtube", accountId: ACC.youtube, title: (m.youtube?.title || idea.topic).slice(0, 60), privacyStatus: "public", shouldNotifySubscribers: false, text: `${url}\n\n${m.youtube?.description || ""}`.trim(), mediaUrls: [r.r2_url], scheduledTime: mediaTime });
    posts.push({ label: `${idea.idea_id}:ig-reel`, platform: "instagram", accountId: ACC.instagram, mediaType: "reel", text: m.instagram?.caption || idea.hook, mediaUrls: [r.r2_url], scheduledTime: mediaTime });
    // Clean FB-reel caption (the auto-generated meta caption has em-dashes and ".." artifacts).
    posts.push({ label: `${idea.idea_id}:fb-reel`, platform: "facebook", accountId: ACC.facebook, pageId: FB_PAGE, text: `${idea.hook}\n\nFull guide on the blog: ${url}`, mediaUrls: [r.r2_url], scheduledTime: mediaTime });
    // Andy: "both" — LinkedIn also gets the reel at 17:00, SHORT caption so it doesn't dupe the noon text post.
    posts.push({ label: `${idea.idea_id}:li-reel`, platform: "linkedin", accountId: ACC.linkedin, text: `${idea.hook}\n\nFull article: ${url}`, mediaUrls: [r.r2_url], scheduledTime: mediaTime });
  } else if (fmt === "carousel") {
    const urls = carouselUrls[idea.idea_id];
    if (!urls?.length) { warn.push(`${idea.idea_id}: no carousel urls`); continue; }
    posts.push({ label: `${idea.idea_id}:li-carousel`, platform: "linkedin", accountId: ACC.linkedin, text: `${v.personal_linkedin.body}\n\nFull article: ${url}`, mediaUrls: urls, scheduledTime: v.personal_linkedin.scheduled_at });
    const tags = first5Tags(v.instagram.first_comment);
    posts.push({ label: `${idea.idea_id}:ig-carousel`, platform: "instagram", accountId: ACC.instagram, text: tags ? `${v.instagram.body}\n\n${tags}` : v.instagram.body, mediaUrls: urls, scheduledTime: v.instagram.scheduled_at });
  } else if (fmt === "youtube_video") {
    const yv = ytVideos.find((x: any) => x.idea_id === idea.idea_id);
    if (!yv) { warn.push(`${idea.idea_id}: no yt video`); continue; }
    posts.push({ label: `${idea.idea_id}:yt-video`, platform: "youtube", accountId: ACC.youtube, title: (yv.youtube_title || idea.topic).slice(0, 60), privacyStatus: "public", shouldNotifySubscribers: false, text: `${yv.source_url}\n\n${yv.youtube_description || ""}`.trim(), mediaUrls: [yv.r2_url], scheduledTime: mediaTime });
  }
}

// Belt-and-braces: strip any em-dash from every post (banned in all Antek copy).
for (const p of posts) {
  p.text = p.text.replace(/\s*—\s*/g, ", ");
  if (p.title) p.title = p.title.replace(/\s*—\s*/g, ", ");
}

writeFileSync("schedule-plan.json", JSON.stringify(posts, null, 2));
const byPlat = posts.reduce((a: Record<string, number>, p) => ((a[p.platform] = (a[p.platform] || 0) + 1), a), {});
console.log(`PLAN: ${posts.length} posts | by platform: ${JSON.stringify(byPlat)}`);
console.log(`  with media: ${posts.filter((p) => p.mediaUrls).length} | no media: ${posts.filter((p) => !p.mediaUrls).length}`);
if (warn.length) console.log("WARNINGS:\n  " + warn.join("\n  "));
