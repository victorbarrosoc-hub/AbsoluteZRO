// Captures the homepage hero as the 1200 × 630 social card (marca-fechada/og-site.png).
// Usage: node scripts/capture-og.mjs [url]   (default: production)
// Navigation links, buttons and the proof line are hidden: a shared image cannot be clicked.
import { chromium } from 'playwright';
const url = process.argv[2] || 'https://quasar.absolutezro.com/';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  ...(process.env.HTTPS_PROXY && url.startsWith('https:')
    ? { proxy: { server: process.env.HTTPS_PROXY } }
    : {}),
});
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.goto(url, { waitUntil: 'load', timeout: 90000 });
await page.addStyleTag({
  content: `.ns-nav nav, .ns-nav-actions, .home-hero-proof, .ns-actions, .nav-progress { display: none !important }
    .ns-nav { justify-content: center !important; width: 300px !important; padding: 0 !important }
    .chrome-site .home-hero-copy > p { margin-bottom: 8px !important }`,
});
// Let the light lines settle into a full frame.
await page.waitForTimeout(3500);
await page.screenshot({ path: 'marca-fechada/og-site.png', scale: 'css' });
await browser.close();
console.log('Saved marca-fechada/og-site.png');
