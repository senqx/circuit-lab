// Adapt the generated application at packaging time, keeping one editable UI.
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const shell = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(shell, '../..');
const source = path.join(root, 'dist/app');
const destination = path.join(root, 'dist/mobile');

try {
  const html = await readFile(path.join(source, 'index.html'), 'utf8');
  const entry = '<script type="module" src="app.js"></script>';
  if (!html.includes(entry)) throw new Error('The shared app entry could not be found.');
  await readFile(path.join(source, 'engine/generated/engine.wasm'));
  await mkdir(path.dirname(destination), { recursive: true });
  const stage = await mkdtemp(path.join(root, 'dist/mobile-'));
  try {
    await cp(source, stage, { recursive: true });
    await build({entryPoints:[path.join(shell,'entry.mjs')],outfile:path.join(stage,'native.mjs'),bundle:true,format:'esm',platform:'browser',target:'es2022',external:['./app.js','./platform.mjs']});
    await writeFile(path.join(stage, 'index.html'), html.replace(entry, '<script type="module" src="native.mjs"></script>'));
    await rm(destination, { recursive: true, force: true });
    await rename(stage, destination);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  const drawables = path.join(shell, 'android/app/src/main/res/drawable-nodpi');
  await mkdir(drawables, { recursive: true });
  await cp(path.join(source, 'icons/icon-512.png'), path.join(drawables, 'circuit_icon.png'));
  console.log(`Mobile bundle: ${destination}`);
} catch (error) {
  console.error(`Mobile preparation failed: ${error.message}\nBuild the shared app first: python3 scripts/build_app.py`);
  process.exitCode = 1;
}
