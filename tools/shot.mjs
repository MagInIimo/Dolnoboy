// Headless screenshots and scripted scenarios (never opens a visible window).
// node tools/shot.mjs <name> [scenario.json]   env: W, H, PORT, MOBILE=1
// Scenario steps: {key, hold, wait, up, eval, shot, click}
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const [name = 'shot', scenarioArg = ''] = process.argv.slice(2);
const width = Number(process.env.W ?? 1280);
const height = Number(process.env.H ?? 720);
const port = process.env.PORT ?? '8787';
const out = path.join(root, 'tmp', 'shots');
await mkdir(out, { recursive: true });
const args = process.platform === 'win32' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
import { existsSync } from 'node:fs';
const linuxShell = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const executablePath = process.env.CHROME ?? (process.platform === 'linux' && existsSync(linuxShell) ? linuxShell : undefined);
const browser = await chromium.launch({ headless: true, executablePath, args });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: !!process.env.MOBILE, isMobile: !!process.env.MOBILE, locale: process.env.LOCALE ?? 'ru-RU' });
if (process.env.FRESH !== '0') await context.addInitScript(() => { if (!sessionStorage.getItem('__keep')) { localStorage.clear(); sessionStorage.setItem('__keep', '1'); } });
const page = await context.newPage();
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message + '\n' + e.stack));
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/?t=${Date.now()}`);
await page.waitForFunction(() => document.getElementById('loading')?.dataset.state === 'ready' || document.getElementById('loading')?.dataset.state === 'error', null, { timeout: 300000 });
const loadMs = Date.now() - t0;
await page.waitForTimeout(800);
const steps = scenarioArg ? JSON.parse(await readFile(scenarioArg, 'utf8')) : [];
let shotIndex = 0;
const evals = [];
for (const s of steps) {
  if (s.key) await page.keyboard.down(s.key);
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.key && !s.hold) await page.keyboard.up(s.key);
  if (s.up) await page.keyboard.up(s.up);
  if (s.click) await page.click(s.click);
  if (s.eval) evals.push(await page.evaluate(s.eval));
  if (s.shot) await page.screenshot({ path: path.join(out, `${name}-${s.shot === true ? shotIndex++ : s.shot}.png`) });
}
await page.screenshot({ path: path.join(out, `${name}.png`) });
const info = await page.evaluate(() => {
  const e = window.game?.engine;
  if (!e) return { state: document.getElementById('loading')?.dataset.state, stage: document.getElementById('lstage')?.textContent };
  const i = e.renderer.info;
  return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, cars: window.game.traffic.cars.length };
});
await writeFile(path.join(out, `${name}.log`), logs.join('\n'));
console.log(JSON.stringify({ shot: `${name}.png`, loadMs, info, evals, errors: logs.filter((l) => /^(error|pageerror)/.test(l)).slice(0, 6), warnings: logs.filter((l) => /^warning/.test(l)).length }));
await context.close();
await browser.close();
