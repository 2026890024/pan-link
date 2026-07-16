const { chromium } = require('playwright');
const path = require('path');

const PAGES = [
  { name: 'homepage', url: 'http://localhost:5173/' },
  { name: 'search', url: 'http://localhost:5173/search' },
  { name: 'category', url: 'http://localhost:5173/category/category-1' },
  { name: 'link-detail', url: 'http://localhost:5173/s/test-link' },
  { name: '404', url: 'http://localhost:5173/nonexistent-page' },
  { name: 'login', url: 'http://localhost:5173/admin-login' },
];

const ADMIN_PAGES = [
  { name: 'resources', url: 'http://localhost:5173/admin/resources' },
  { name: 'dashboard', url: 'http://localhost:5173/admin/dashboard' },
  { name: 'data', url: 'http://localhost:5173/admin/data' },
  { name: 'homepage-settings', url: 'http://localhost:5173/admin/homepage-settings' },
  { name: 'site-settings', url: 'http://localhost:5173/admin/site-settings' },
  { name: 'account', url: 'http://localhost:5173/admin/account' },
];

const SCREENSHOT_DIR = 'C:\\Users\\12104\\CodeBuddy\\20260423152307\\test-screenshots';

async function takeScreenshots(viewport, prefix) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: viewport.width <= 400 ? 3 : 1,
  });
  const page = await context.newPage();

  // Frontend pages
  for (const p of PAGES) {
    try {
      console.log(`Testing ${prefix}/${p.name}...`);
      await page.goto(p.url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${prefix}-${p.name}.png`),
        fullPage: true,
      });
      console.log(`  ✓ ${prefix}-${p.name}.png`);
    } catch (e) {
      console.log(`  ✗ ${p.name}: ${e.message}`);
    }
  }

  // Admin pages (need auth bypass)
  try {
    console.log(`\nLogging into admin for ${prefix}...`);
    await page.goto('http://localhost:5173/auth-bypass.html', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    
    for (const p of ADMIN_PAGES) {
      try {
        console.log(`Testing ${prefix}/${p.name}...`);
        await page.goto(p.url, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(1000);
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${prefix}-admin-${p.name}.png`),
          fullPage: true,
        });
        console.log(`  ✓ ${prefix}-admin-${p.name}.png`);
      } catch (e) {
        console.log(`  ✗ ${p.name}: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`  ✗ Admin auth failed: ${e.message}`);
  }

  await browser.close();
}

(async () => {
  console.log('=== Starting Mobile Testing (375x812) ===');
  await takeScreenshots({ width: 375, height: 812 }, 'mobile');
  
  console.log('\n=== Starting Tablet Testing (768x1024) ===');
  await takeScreenshots({ width: 768, height: 1024 }, 'tablet');
  
  console.log('\n=== All tests complete! ===');
})();
