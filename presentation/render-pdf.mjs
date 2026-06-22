import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
const url = 'file://' + process.cwd() + '/index.html';
await page.goto(url, { waitUntil: 'networkidle' });
// Give the QR image a moment (or its onerror fallback) to settle.
await page.waitForTimeout(1500);
await page.emulateMedia({ media: 'print' });
await page.pdf({
  path: 'Tax-AI-Infrastructure-TEI.pdf',
  width: '1280px',
  height: '720px',
  printBackground: true,
  pageRanges: '',
});
await browser.close();
console.log('PDF written');
