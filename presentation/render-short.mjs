import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('file://' + process.cwd() + '/keynote-short.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await p.emulateMedia({ media: 'print' });
await p.pdf({ path: 'Tax-AI-Keynote-10.pdf', width: '1280px', height: '720px', printBackground: true });
await b.close(); console.log('PDF written');
