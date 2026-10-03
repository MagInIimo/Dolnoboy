import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const game = path.join(root, 'game');
const dev = process.argv.includes('--dev');

const stripGlsl = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\r\n]*/g, '$1');
const isShader = (t) => /void main|#include|#ifdef|#define|gl_FragColor|varying |uniform /.test(t);
const shaderStrip = {
  name: 'strip-shader-comments',
  setup(b) {
    b.onLoad({ filter: /\.js$/ }, async ({ path: file }) => {
      let source = await readFile(file, 'utf8');
      if (/node_modules[\\/]three/.test(file) || file.startsWith(path.join(game, 'src'))) {
        source = source.replace(/`(?:\\[\s\S]|[^`\\])*`/g, (t) => (isShader(t) ? '`' + stripGlsl(t.slice(1, -1)) + '`' : t));
      }
      return { contents: source, loader: 'js' };
    });
  },
};

const result = await build({
  entryPoints: [path.join(game, 'src', 'main.js')],
  outfile: path.join(game, 'app.js'),
  bundle: true,
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  format: 'esm',
  target: ['es2020', 'safari15'],
  legalComments: 'none',
  nodePaths: [path.join(root, 'tools', 'node_modules')],
  plugins: [shaderStrip],
  metafile: true,
  logLevel: 'warning',
});
const out = Object.entries(result.metafile.outputs).find(([k]) => k.endsWith('app.js'));
console.log(JSON.stringify({ app: out ? out[1].bytes : 'built', dev }));
await writeFile(path.join(root, 'tmp', 'bundle-meta.json'), JSON.stringify(result.metafile));
