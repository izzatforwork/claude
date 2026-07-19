import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir = join(__dirname, 'dist');
const watch = process.argv.includes('--watch');

mkdirSync(outdir, { recursive: true });

const entryPoints = [
  { in: 'src/background/background.js', out: 'background' },
  { in: 'src/content/content.js', out: 'content' },
  { in: 'src/popup/popup.jsx', out: 'popup' },
  { in: 'src/export/export.js', out: 'export' },
];

const buildOptions = {
  entryPoints,
  bundle: true,
  outdir,
  format: 'iife',
  target: ['chrome110'],
  logLevel: 'info',
  define: { global: 'globalThis' },
  loader: { '.css': 'text' },
  jsx: 'automatic',
};

function copyStaticFiles() {
  cpSync(join(__dirname, 'manifest.json'), join(outdir, 'manifest.json'));
  cpSync(join(__dirname, 'src/popup/popup.html'), join(outdir, 'popup.html'));
  cpSync(join(__dirname, 'src/export/export.html'), join(outdir, 'export.html'));
  if (existsSync(join(__dirname, 'icons'))) {
    cpSync(join(__dirname, 'icons'), join(outdir, 'icons'), { recursive: true });
  }
}

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  copyStaticFiles();
  console.log('Watching for changes... (static files copied once; re-run build for manifest/html changes)');
} else {
  await esbuild.build(buildOptions);
  copyStaticFiles();
  console.log('Build complete -> dist/');
}
