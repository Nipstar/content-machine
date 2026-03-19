/**
 * HTML preview generator.
 *
 * Creates a self-contained HTML file with:
 *   - Tabbed view per content idea (LinkedIn / X / Facebook / Instagram)
 *   - Character count badges (green / orange / red)
 *   - Blotato template assignment display
 *   - Scheduled time display
 *   - Pillar and content category tags
 *
 * Opens the file in the default browser.
 */

import { writeFileSync } from "fs";
import { exec } from "child_process";
import type { ContentIdea, Platform } from "./types.js";

const CHAR_LIMITS: Record<Platform, number> = {
  linkedin: 1300,
  twitter: 280,
  facebook: 500,
  instagram: 300,
};

const PLATFORM_LABELS: Record<Platform, string> = {
  linkedin: "LinkedIn",
  twitter: "X / Twitter",
  facebook: "Facebook",
  instagram: "Instagram",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function generatePreview(ideas: ContentIdea[], outputPath: string): void {
  const platforms: Platform[] = ["linkedin", "twitter", "facebook", "instagram"];

  const cards = ideas
    .map((idea, i) => {
      const tabButtons = platforms
        .map(
          (p) =>
            `<button class="tab-btn" data-p="${p}" onclick="switchTab(this,${i})">${PLATFORM_LABELS[p]}</button>`,
        )
        .join("");

      const panels = platforms
        .map((p) => {
          const v = idea.variants[p];
          if (!v) return "";
          const chars = v.body.length;
          const limit = CHAR_LIMITS[p];
          const pct = Math.round((chars / limit) * 100);
          const status = chars > limit ? "over" : pct > 90 ? "warn" : "ok";

          return `<div class="panel" data-p="${p}" style="display:none">
  <pre class="body">${escapeHtml(v.body)}</pre>
  ${v.first_comment ? `<div class="fc"><b>First comment:</b> ${escapeHtml(v.first_comment)}</div>` : ""}
  <div class="meta">
    <span class="cc ${status}">${chars}/${limit} chars (${pct}%)</span>
    <span class="sched">${v.scheduled_display || ""}</span>
  </div>
</div>`;
        })
        .join("");

      return `<div class="card" id="c${i}">
  <div class="hdr">
    <span class="num">#${i + 1}</span>
    <span class="pill p-${idea.pillar}">${idea.pillar}</span>
    <span class="fmt">${idea.content_category}</span>
    ${idea.blotato_template ? `<span class="tmpl">${escapeHtml(idea.blotato_template)}</span>` : ""}
    <div class="topic">${escapeHtml(idea.topic)}</div>
  </div>
  <div class="tabs">${tabButtons}</div>
  <div class="panels">${panels}</div>
</div>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Social Content Machine - Preview</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f5f5;padding:24px;color:#2C2C2C}
h1{text-align:center;margin-bottom:6px}
.sub{text-align:center;color:#666;margin-bottom:32px}
.card{background:#fff;border-radius:12px;margin-bottom:24px;box-shadow:0 2px 8px rgba(0,0,0,.1);overflow:hidden}
.hdr{padding:16px 20px;border-bottom:1px solid #eee}
.topic{margin-top:8px;font-size:15px;font-weight:600}
.num{font-weight:700;color:#CD5C3C;margin-right:8px}
.pill{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;margin-right:6px}
.p-ai_automation{background:#E8DCC8;color:#2C2C2C}
.p-voice_ai{background:#C8D8D0;color:#2C2C2C}
.p-growth_digital{background:#CD5C3C;color:#fff}
.fmt{font-size:12px;color:#888;margin-right:6px}
.tmpl{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;background:#e3f2fd;color:#1565c0}
.tabs{display:flex;border-bottom:2px solid #eee}
.tab-btn{flex:1;padding:10px;border:none;background:none;cursor:pointer;font-weight:600;color:#888;font-size:13px;transition:.2s}
.tab-btn.active{color:#CD5C3C;border-bottom:2px solid #CD5C3C;margin-bottom:-2px}
.panel{padding:20px}
.body{white-space:pre-wrap;line-height:1.6;font-size:14px;margin-bottom:12px;font-family:inherit;background:none;border:none}
.fc{background:#f9f9f9;padding:12px;border-radius:8px;font-size:13px;margin-bottom:12px;color:#555}
.meta{display:flex;justify-content:space-between;font-size:12px;color:#888}
.cc.ok{color:#4CAF50}
.cc.warn{color:#FF9800;font-weight:600}
.cc.over{color:#f44336;font-weight:700}
.sched{color:#666}
.foot{text-align:center;padding:20px;color:#666;font-size:14px}
</style>
</head>
<body>
<h1>Social Content Machine - Preview</h1>
<p class="sub">${ideas.length} ideas x 4 platforms = ${ideas.length * 4} posts</p>
${cards}
<p class="foot">Review above, then ask Claude Code to create media + schedule via Blotato MCP.</p>
<script>
function switchTab(btn,idx){
  var c=document.getElementById("c"+idx);
  c.querySelectorAll(".tab-btn").forEach(function(b){b.classList.remove("active")});
  c.querySelectorAll(".panel").forEach(function(p){p.style.display="none"});
  btn.classList.add("active");
  var p=btn.dataset.p;
  c.querySelector('.panel[data-p="'+p+'"]').style.display="block";
}
document.querySelectorAll(".card").forEach(function(c,i){
  var b=c.querySelector(".tab-btn");
  if(b)switchTab(b,i);
});
</script>
</body>
</html>`;

  writeFileSync(outputPath, html);
}

export function openPreview(path: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} "${path}"`);
}
