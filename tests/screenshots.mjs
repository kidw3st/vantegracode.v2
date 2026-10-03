/**
 * Скриншоты страниц из dist/ на 375, 768, 1440, 1920 (reducedMotion: 'reduce') → docs/screenshots/.
 *   npm run build && npm run shots
 *   npm run shots -- --pages=/,/styleguide/ --widths=375,1440
 *   npm run shots -- --theme=light — дневная тема, к имени файла добавляется -light
 * Первый экран главной дополнительно снимается в 1440×900 и 390×844.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { serve } from './serve.mjs';

const PORT = 4329;
const BASE = `http://localhost:${PORT}`;
const OUT = path.resolve('docs/screenshots');

const ALL_PAGES = [
  '/',
  '/uslugi/',
  '/uslugi/sajty/',
  '/uslugi/audit-sajta/',
  '/ceny/',
  '/raboty/',
  '/o-studii/',
  '/blog/',
  '/blog/core-web-vitals/',
  '/voprosy/',
  '/kontakty/',
  '/politika-konfidencialnosti/',
  '/soglasie/',
  '/styleguide/',
  '/404.html',
];
const HEIGHTS = { 375: 812, 390: 844, 768: 1024, 1440: 900, 1920: 1080 };

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const pages = arg('pages')?.split(',') ?? ALL_PAGES;
const widths = (arg('widths') ?? '375,768,1440,1920').split(',').map(Number);
const heroOnly = process.argv.includes('--hero');
const theme = arg('theme') === 'light' ? 'light' : 'dark';
const suffix = theme === 'light' ? '-light' : '';

/** Тема до первой отрисовки — как у посетителя, который выбрал её раньше */
const useTheme = (context) =>
  context.addInitScript((value) => {
    try {
      localStorage.setItem('vantegra-theme', value);
    } catch {
      /* без хранилища — тёмная тема */
    }
  }, theme);

const slug = (page) =>
  page === '/' ? 'home' : page.replace(/^\/|\/$/g, '').replace(/\.html$/, '').replace(/\//g, '-');

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-reveal]')) el.classList.add('is-in');
  });
  await page.waitForTimeout(350);
}

const server = await serve(PORT);

try {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  if (!heroOnly) {
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: HEIGHTS[width] ?? 900 },
        reducedMotion: 'reduce',
        deviceScaleFactor: 1,
      });
      await useTheme(context);
      const page = await context.newPage();
      for (const url of pages) {
        await page.goto(BASE + url, { waitUntil: 'load' });
        await settle(page);
        const file = path.join(OUT, `${slug(url)}${suffix}-${width}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log('✓', path.relative(process.cwd(), file));
      }
      await context.close();
    }
  }

  if (pages.includes('/')) {
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await useTheme(context);
      const page = await context.newPage();
      await page.goto(BASE + '/', { waitUntil: 'load' });
      await settle(page);
      const file = path.join(OUT, `home-hero${suffix}-${width}x${height}.png`);
      await page.screenshot({ path: file });
      const fits = await page.evaluate(() => {
        const hero = document.querySelector('.hero');
        return hero ? Math.round(hero.getBoundingClientRect().height) <= window.innerHeight + 1 : false;
      });
      console.log('✓', path.relative(process.cwd(), file), fits ? '— первый экран помещается' : '— НЕ помещается');
      await context.close();
    }
  }

  await browser.close();
} finally {
  server.close();
}
