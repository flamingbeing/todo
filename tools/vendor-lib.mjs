// Vendored libraries: an npm package at one exact version, bundled with the repo's esbuild into a single minified ESM
// file under app/public/vendor/<name>/<version>/, with its licence. The app loads it from its own address (the service
// worker keeps it for offline) and only when a screen needs it (lazyModules). Each library is listed in LIBS below:
// the entry it is built from (a package subpath: chrono-node's English parsers only) and the file it becomes. The
// index.d.ts beside each file is written by hand (the parts the app uses) and is kept when the bundle is rebuilt.
//   node tools/vendor-lib.mjs <name>             download and bundle the version in LIBS
//   node tools/vendor-lib.mjs --check            no network: each library's folder holds its file, licence and types
// After a version change: update LIBS and modules.json's entry, then run node tools/modules.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'app/public/vendor');

/** @type {Record<string, { version: string, entry: string, file: string, licence: string, deps?: Record<string, string> }>} */
export const LIBS = {
  'chrono-node': { version: '2.10.3', entry: 'dist/esm/locales/en/index.js', file: 'chrono.js', licence: 'LICENSE.txt' },
  rrule: { version: '2.8.1', entry: 'dist/esm/index.js', file: 'rrule.js', licence: 'LICENCE', deps: { tslib: '2.8.1' } },
};

/** the folder a library's version lives in @param {string} name */
export const dirOf = name => path.join(VENDOR, name, LIBS[name].version);

/** @param {string} cwd @param {string} spec @returns {string} the unpacked package folder */
function unpack(cwd, spec) {
  const out = execFileSync('npm', ['pack', spec, '--silent'], { cwd, encoding: 'utf8' }).trim().split('\n').at(-1) ?? '';
  const into = path.join(cwd, spec.replace(/[@/]/g, '_'));
  fs.mkdirSync(into, { recursive: true });
  execFileSync('tar', ['xzf', path.join(cwd, out), '-C', into]);
  return path.join(into, 'package');
}

/** @param {string} name */
export function vendor(name) {
  const lib = LIBS[name];
  if (!lib) throw new Error(`unknown library ${name} (known: ${Object.keys(LIBS).join(', ')})`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-lib-'));
  try {
    const pkg = unpack(tmp, `${name}@${lib.version}`);
    // a dependency goes where node's resolution finds it, so the bundle takes it in
    for (const [dep, v] of Object.entries(lib.deps ?? {})) {
      const at = path.join(pkg, 'node_modules', dep);
      fs.mkdirSync(path.dirname(at), { recursive: true });
      fs.renameSync(unpack(tmp, `${dep}@${v}`), at);
    }
    const dir = dirOf(name);
    fs.mkdirSync(dir, { recursive: true });
    execFileSync(path.join(ROOT, 'node_modules/.bin/esbuild'), [path.join(pkg, lib.entry), '--bundle', '--format=esm', '--minify',
      '--legal-comments=none', `--outfile=${path.join(dir, lib.file)}`], { stdio: 'inherit' });
    fs.copyFileSync(path.join(pkg, lib.licence), path.join(dir, 'LICENSE'));
    // an older version's folder goes
    for (const v of fs.readdirSync(path.join(VENDOR, name))) if (v !== lib.version) fs.rmSync(path.join(VENDOR, name, v), { recursive: true });
    console.log(`${name} ${lib.version} -> ${path.relative(ROOT, path.join(dir, lib.file))}`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/** throws on the first library whose folder is not complete */
export function check() {
  for (const [name, lib] of Object.entries(LIBS)) {
    const dir = dirOf(name);
    for (const f of [lib.file, 'LICENSE', 'index.d.ts']) if (!fs.existsSync(path.join(dir, f))) throw new Error(`${path.relative(ROOT, path.join(dir, f))} is missing (node tools/vendor-lib.mjs ${name})`);
    const dirs = fs.readdirSync(path.join(VENDOR, name));
    if (dirs.join() !== lib.version) throw new Error(`app/public/vendor/${name}/ should hold only ${lib.version}, it holds ${dirs.join(', ')}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--check') { check(); console.log('vendored libraries: ok'); }
  else if (args.length) for (const a of args) vendor(a);
  else { console.error('usage: node tools/vendor-lib.mjs <name>... | --check'); process.exit(1); }
}
