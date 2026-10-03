// Headless screenshots and scripted driving: node tools/shot.mjs <name> <hash> [scenario.json]
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const [name = 'shot', hash = '', scenarioArg = ''] = process.argv.slice(2);
const width = Number(process.env.W ?? 1280);
const height = Number(process.env.H ?? 720);
const port = process.env.PORT ?? '8787';
const out = path.join(root, 'tmp', 'shots');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(`http://127.0.0.1:${port}/?t=${Date.now()}#${hash}`);
await page.waitForFunction(() => window.dev || window.game || document.querySelector('#status')?.textContent?.startsWith('ERROR'), null, { timeout: 120000 });
await page.waitForTimeout(1500);
const steps = scenarioArg ? JSON.parse(await readFile(scenarioArg, 'utf8')) : [];
let shotIndex = 0;
for (const s of steps) {
  if (s.key) await page.keyboard.down(s.key);
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.key && !s.hold) await page.keyboard.up(s.key);
  if (s.up) await page.keyboard.up(s.up);
  if (s.eval) logs.push('eval: ' + JSON.stringify(await page.evaluate(s.eval)));
  if (s.shot) await page.screenshot({ path: path.join(out, `${name}-${shotIndex++}.png`) });
}
await page.screenshot({ path: path.join(out, `${name}.png`) });
const info = await page.evaluate(() => {
  const e = window.dev?.engine ?? window.game?.engine;
  if (!e) return null;
  const i = e.renderer.info;
  return { calls: i.render.calls, tris: i.render.triangles, status: document.querySelector('#status')?.textContent };
});
await writeFile(path.join(out, `${name}.log`), logs.join('\n'));
console.log(JSON.stringify({ shot: `${name}.png`, info, logs: logs.slice(-8) }));
await browser.close();
