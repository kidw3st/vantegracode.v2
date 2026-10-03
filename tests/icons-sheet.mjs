/** Лист SVG-иконок: восемь в ряд, 24 и 48 px, плотность 2×. */
import { readdir, readFile, mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const files = (await readdir('src/assets/icons')).filter((file) => file.endsWith('.svg')).sort();
const cells = await Promise.all(files.map(async (file) => {
  const svg = await readFile('src/assets/icons/' + file, 'utf8');
  return `<article><div><span class="small">${svg}</span><span class="large">${svg}</span></div><p>${file.slice(0, -4)}</p></article>`;
}));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;padding:32px;background:#111111;color:#F4F2EE;font:11px system-ui}
  main{display:grid;grid-template-columns:repeat(8,1fr);gap:8px}article{padding:18px 4px;text-align:center}
  article div{height:56px;display:flex;align-items:center;justify-content:center;gap:16px}
  span{display:flex}.small svg{width:24px;height:24px}.large svg{width:48px;height:48px}
  p{margin:14px 0 0;color:#8C8984}
  </style></head><body><main>${cells.join('')}</main></body></html>`);
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/icons-sheet.png', fullPage: true });
  console.log('✓ docs/screenshots/icons-sheet.png');
} finally { await browser.close(); }
