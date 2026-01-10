
import path from 'path';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

export async function launchBrowser(req, res) {

  const userDataDir = path.resolve('tmp');
  console.log('User Data Dir:', userDataDir);

  chromium.use(stealth());

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',        // real Google Chrome
    headless: false,          // REQUIRED for CF
    viewport: null,           // use real window size
    chromiumSandbox: false,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/121.0.6167.85 Safari/537.36',

    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check',
      '--no-first-run',
      '--flag-switches-begin',
      '--flag-switches-end',
      '--origin-trial-disabled-features=CanvasTextNg|WebAssemblyCustomDescriptors',
      '--no-sandbox',         // May help in some environments
      '--disable-web-security', // Not recommended for production use
      '--disable-infobars',    // Prevent infobars
      '--disable-extensions',   // Disable extensions
      '--start-maximized',      // Start maximized
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--profile-directory=Profile 3', // specify the profile directory
    ],
    ignoreDefaultArgs: ['--disable-component-extensions-with-background-pages']
  });

  const page = await context.newPage();

  console.log('Navigating...');
  await page.goto('https://chatgpt.com', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  // Give Cloudflare time to inject JS
  await page.waitForTimeout(4000);

  // --- Cloudflare / Turnstile detection ---
  const isCloudflare = await page.evaluate(() => {
    return (
      document.title.includes('Just a moment') ||
      document.querySelector('iframe[src*="challenges.cloudflare.com"]') ||
      document.body.innerText.toLowerCase().includes('checking your browser')
    );
  });

  if (isCloudflare) {
    console.log('⚠️ Cloudflare challenge detected');
    console.log('👉 Please solve the CAPTCHA manually in the opened browser');

    // Wait until CF clears (cookie cf_clearance appears)
    await page.waitForFunction(
      () => document.cookie.includes('cf_clearance'),
      { timeout: 0 } // wait indefinitely
    );

    console.log('✅ Cloudflare clearance cookie detected');
  }

  console.log('Page ready, session stored');
}