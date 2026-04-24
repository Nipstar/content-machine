/**
 * Generates the GitHub repository banner as a 1280x640 PNG.
 * Run from project root: npx tsx generate-banner.ts
 * Output: images/banner.png
 */
import puppeteer from 'puppeteer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1280px;
    height: 640px;
    background: #E8DCC8;
    font-family: 'Inter', sans-serif;
    overflow: hidden;
    position: relative;
  }

  /* Offset shadow blocks */
  .shadow-block-main {
    position: absolute;
    top: 58px;
    left: 38px;
    width: 820px;
    height: 200px;
    background: #2C2C2C;
    z-index: 1;
  }
  .main-card {
    position: absolute;
    top: 48px;
    left: 28px;
    width: 820px;
    height: 200px;
    background: #CD5C3C;
    border: 4px solid #2C2C2C;
    z-index: 2;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 40px;
  }
  .title {
    font-size: 72px;
    font-weight: 900;
    color: #E8DCC8;
    line-height: 1;
    letter-spacing: -2px;
    text-transform: uppercase;
  }
  .subtitle {
    font-size: 22px;
    font-weight: 600;
    color: #2C2C2C;
    margin-top: 12px;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  /* Feature pills row */
  .features {
    position: absolute;
    top: 290px;
    left: 28px;
    display: flex;
    gap: 12px;
    z-index: 3;
  }
  .pill-shadow {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 100%;
    height: 100%;
    background: #2C2C2C;
    z-index: -1;
  }
  .pill {
    position: relative;
    background: #E8DCC8;
    border: 3px solid #2C2C2C;
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 900;
    color: #2C2C2C;
    text-transform: uppercase;
    letter-spacing: 1px;
    white-space: nowrap;
  }
  .pill.accent {
    background: #C8D8D0;
  }

  /* Right panel */
  .right-shadow {
    position: absolute;
    top: 48px + 10px;
    right: 28px - 10px;
    width: 360px;
    height: 490px;
    background: #2C2C2C;
    z-index: 1;
  }
  .right-panel {
    position: absolute;
    top: 38px;
    right: 18px;
    width: 360px;
    height: 490px;
    background: #C8D8D0;
    border: 4px solid #2C2C2C;
    z-index: 2;
    padding: 28px;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .right-panel-title {
    font-size: 11px;
    font-weight: 900;
    color: #2C2C2C;
    text-transform: uppercase;
    letter-spacing: 3px;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 3px solid #2C2C2C;
  }
  .pipeline-item {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 12px 0;
    border-bottom: 2px solid rgba(44,44,44,0.2);
  }
  .pipeline-item:last-child { border-bottom: none; }
  .pipeline-num {
    font-size: 28px;
    font-weight: 900;
    color: #CD5C3C;
    line-height: 1;
    min-width: 32px;
  }
  .pipeline-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pipeline-name {
    font-size: 14px;
    font-weight: 900;
    color: #2C2C2C;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .pipeline-desc {
    font-size: 11px;
    font-weight: 600;
    color: #4a4a4a;
  }

  /* Bottom bar */
  .bottom-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 900px;
    height: 56px;
    background: #2C2C2C;
    z-index: 3;
    display: flex;
    align-items: center;
    padding: 0 28px;
    gap: 40px;
  }
  .bottom-tag {
    font-size: 12px;
    font-weight: 900;
    color: #E8DCC8;
    text-transform: uppercase;
    letter-spacing: 2px;
  }
  .bottom-tag span {
    color: #CD5C3C;
  }

  /* Decorative corner element */
  .corner-accent {
    position: absolute;
    bottom: 56px;
    left: 28px;
    width: 180px;
    height: 6px;
    background: #CD5C3C;
    z-index: 4;
  }
  .corner-accent-2 {
    position: absolute;
    bottom: 62px;
    left: 28px;
    width: 80px;
    height: 6px;
    background: #C8D8D0;
    z-index: 4;
  }
  .v-badge {
    position: absolute;
    top: 48px;
    left: 868px;
    background: #E8DCC8;
    border: 4px solid #2C2C2C;
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 900;
    color: #2C2C2C;
    z-index: 5;
  }
</style>
</head>
<body>

  <!-- Main title card -->
  <div class="shadow-block-main"></div>
  <div class="main-card">
    <div class="title">Social Content<br>Machine</div>
    <div class="subtitle">Antek Automation · Claude Code Pipeline</div>
  </div>

  <!-- v6 badge -->
  <div class="v-badge">V6</div>

  <!-- Feature pills -->
  <div class="features">
    <div class="pill" style="position:relative">
      <div class="pill-shadow"></div>
      /run
    </div>
    <div class="pill accent" style="position:relative">
      <div class="pill-shadow"></div>
      /content
    </div>
    <div class="pill" style="position:relative">
      <div class="pill-shadow"></div>
      /gbp
    </div>
    <div class="pill accent" style="position:relative">
      <div class="pill-shadow"></div>
      /shorts
    </div>
    <div class="pill" style="position:relative">
      <div class="pill-shadow"></div>
      /podcast
    </div>
    <div class="pill accent" style="position:relative">
      <div class="pill-shadow"></div>
      /cards
    </div>
  </div>

  <!-- Right panel -->
  <div style="position:absolute;top:48px;right:8px;width:360px;height:490px;background:#2C2C2C;z-index:1;"></div>
  <div class="right-panel">
    <div class="right-panel-title">Content Pipelines</div>
    <div class="pipeline-item">
      <div class="pipeline-num">01</div>
      <div class="pipeline-text">
        <div class="pipeline-name">Social Posts</div>
        <div class="pipeline-desc">RSS → LinkedIn · X · Facebook · Instagram</div>
      </div>
    </div>
    <div class="pipeline-item">
      <div class="pipeline-num">02</div>
      <div class="pipeline-text">
        <div class="pipeline-name">GBP Posts</div>
        <div class="pipeline-desc">Google Business Profile with branded images</div>
      </div>
    </div>
    <div class="pipeline-item">
      <div class="pipeline-num">03</div>
      <div class="pipeline-text">
        <div class="pipeline-name">YouTube Shorts</div>
        <div class="pipeline-desc">6-slide MP4 · TTS voiceover · Ken Burns</div>
      </div>
    </div>
    <div class="pipeline-item">
      <div class="pipeline-num">04</div>
      <div class="pipeline-text">
        <div class="pipeline-name">Podcast</div>
        <div class="pipeline-desc">Fish Audio TTS · RSS.com · Ghost embed</div>
      </div>
    </div>
    <div class="pipeline-item">
      <div class="pipeline-num">05</div>
      <div class="pipeline-text">
        <div class="pipeline-name">Social Cards</div>
        <div class="pipeline-desc">Puppeteer PNGs · 3 sizes · 5 card types</div>
      </div>
    </div>
  </div>

  <!-- Decorative accents -->
  <div class="corner-accent-2"></div>
  <div class="corner-accent"></div>

  <!-- Bottom bar -->
  <div class="bottom-bar">
    <div class="bottom-tag">RSS <span>→</span> AI Generation <span>→</span> Blotato MCP <span>→</span> Scheduled Posts</div>
    <div class="bottom-tag" style="margin-left:auto;color:#C8D8D0;">antekautomation.com</div>
  </div>

</body>
</html>`;

async function generateBanner() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 640 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  // Wait for Google Fonts
  await new Promise(r => setTimeout(r, 1500));

  const outputPath = join(__dirname, '..', 'images', 'banner.png');
  await page.screenshot({ path: outputPath, type: 'png' });
  await browser.close();

  console.log(`Banner saved: ${outputPath}`);
}

generateBanner().catch(console.error);
