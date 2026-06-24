import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
await p.goto('file://' + process.cwd() + '/keynote-short.html', { waitUntil: 'load' });
await p.evaluate(() => { const h=document.getElementById('help'); if(h) h.style.display='none'; });
await p.waitForTimeout(900);
const n = await p.evaluate(() => document.querySelectorAll('.slide').length);
for (let i = 1; i <= n; i++) {
  await p.evaluate(j => window.show(j - 1), i);
  await p.waitForTimeout(350);
  await p.screenshot({ path: 'slides_png/slide-' + String(i).padStart(2,'0') + '.png' });
}
console.log('rendered', n);
await b.close();
