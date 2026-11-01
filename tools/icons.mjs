// Dev tool: the app's icon. Writes app/public/icons/icon.svg (a rounded square in the accent with a white circle and
// tick, Lucide's circle-check) and renders the PNGs the manifest and iOS ask for with Playwright's Chromium:
// icon-192.png, icon-512.png, icon-maskable-512.png (full bleed, the mark inside the safe zone) and
// apple-touch-icon.png (180, square: iOS rounds it). Run it again after a change of colour or mark.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium node tools/icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'app/public/icons');
const ACCENT = '#dc4c3e';
// Lucide circle-check (ISC licence), on a 24 grid
const MARK = '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>';

/** @param {{ rx: number, scale: number }} o  the corner radius and the mark's size, on a 512 square */
const svg = ({ rx, scale }) => {
  const at = (512 - 24 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="${ACCENT}"/>`
    + `<g transform="translate(${at} ${at}) scale(${scale})" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${MARK}</g></svg>`;
};

const icon = svg({ rx: 112, scale: 13 }), square = svg({ rx: 0, scale: 13 }), maskable = svg({ rx: 0, scale: 10.5 });
fs.writeFileSync(path.join(OUT, 'icon.svg'), `${icon}\n`);

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  for (const [file, size, art] of /** @type {[string, number, string][]} */ ([
    ['icon-192.png', 192, icon], ['icon-512.png', 512, icon], ['icon-maskable-512.png', 512, maskable], ['apple-touch-icon.png', 180, square],
  ])) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${art}`);
    await page.screenshot({ path: path.join(OUT, file), omitBackground: true });
    console.log(`icons: ${file}`);
  }
} finally { await browser.close(); }
