// Bundles a Node test that imports game modules (they use bare 'three') and runs it: node tools/run.mjs tools/test-x.mjs [args]
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const [entry, ...args] = process.argv.slice(2);
const out = path.join(root, 'tmp', 'node-tests', path.basename(entry).replace(/\.mjs$/, '.bundle.mjs'));
await mkdir(path.dirname(out), { recursive: true });
await build({ entryPoints: [path.resolve(entry)], outfile: out, bundle: true, platform: 'node', format: 'esm', nodePaths: [path.join(root, 'tools', 'node_modules')], logLevel: 'warning', external: ['playwright'] });
const r = spawnSync(process.execPath, [out, ...args], { stdio: 'inherit' });
process.exit(r.status ?? 1);
