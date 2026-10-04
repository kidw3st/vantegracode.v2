/**
 * Иконки сайта — из набора Lucide (решение владельца, https://lucide.dev, лицензия ISC).
 * Скрипт берёт SVG из пакета lucide-static и кладёт их в src/assets/icons под нашими именами:
 * компоненты и данные ссылаются на свои имена (service-sites, step-brief…), а рисунок — Lucide.
 * Линия тоньше стандартной (1,5 вместо 2) — под тонкие линии сайта; концы и углы круглые, как у Lucide.
 * Каждый файл — одна строка без комментариев. Лицензия Lucide копируется рядом.
 *
 *   node tools/icons-lucide.mjs
 *
 * Новая иконка: добавить строку в MAP, имя и подпись — в manifest.json, имя — в тип IconName (Icon.astro).
 */
import { copyFile, readdir, readFile, unlink, writeFile } from 'node:fs/promises';

const SOURCE = 'node_modules/lucide-static/icons/';
const TARGET = 'src/assets/icons/';
const STROKE = '1.5';

/** Наше имя → имя в Lucide */
const MAP = {
  'arrow-right': 'arrow-right',
  'arrow-left': 'arrow-left',
  'arrow-up': 'arrow-up',
  'arrow-down': 'arrow-down',
  'arrow-up-right': 'arrow-up-right',
  'chevron-down': 'chevron-down',
  'chevron-up': 'chevron-up',
  'chevron-left': 'chevron-left',
  'chevron-right': 'chevron-right',
  plus: 'plus',
  minus: 'minus',
  close: 'x',
  check: 'check',
  menu: 'menu',
  search: 'search',
  filter: 'list-filter',
  copy: 'copy',
  link: 'link',
  share: 'share-2',
  download: 'download',
  telegram: 'send',
  mail: 'mail',
  phone: 'smartphone',
  chat: 'message-square',
  location: 'map-pin',
  globe: 'globe',
  earth: 'earth',
  clock: 'clock',
  calendar: 'calendar',
  document: 'file-text',
  lock: 'lock',
  shield: 'shield',
  user: 'user',
  'service-sites': 'app-window',
  'service-web-apps': 'layout-dashboard',
  'service-telegram-bots': 'bot-message-square',
  'service-mobile-games': 'gamepad-2',
  'service-audit': 'scan-search',
  'service-support': 'life-buoy',
  'step-brief': 'clipboard-list',
  'step-prototype': 'layout-template',
  'step-build': 'code-xml',
  'step-launch': 'rocket',
  'factor-scope': 'layers',
  'factor-logic': 'git-branch',
  'factor-integrations': 'workflow',
  'factor-content': 'image',
  route: 'route',
  estimate: 'receipt-text',
  crm: 'funnel',
  payment: 'credit-card',
  analytics: 'chart-line',
  seo: 'text-search',
  speed: 'gauge',
  security: 'shield-check',
  devices: 'monitor-smartphone',
  cms: 'sliders-horizontal',
  backup: 'archive',
  monitoring: 'activity',
  report: 'file-chart-column',
  api: 'braces',
  database: 'database',
  users: 'users',
  notification: 'bell',
  booking: 'calendar-check',
  orbit: 'orbit',
  sun: 'sun',
  moon: 'moon',
};

const ROOT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">`;

/** Только содержимое корневого svg, в одну строку */
function normalize(source, name) {
  const inner = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1];
  if (inner === undefined) throw new Error(`${name}: не найден <svg>`);
  const body = inner
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/\s*\/>/g, '/>')
    .trim();
  return `${ROOT}${body}</svg>`;
}

const keep = new Set(Object.keys(MAP).map((name) => `${name}.svg`));
for (const [ours, lucide] of Object.entries(MAP)) {
  const source = await readFile(`${SOURCE}${lucide}.svg`, 'utf8');
  await writeFile(`${TARGET}${ours}.svg`, normalize(source, lucide));
}
// иконки, которых больше нет в наборе
for (const file of await readdir(TARGET)) {
  if (file.endsWith('.svg') && !keep.has(file)) await unlink(`${TARGET}${file}`);
}
await copyFile('node_modules/lucide-static/LICENSE', `${TARGET}LICENSE-lucide.txt`);
console.log(`✓ ${keep.size} иконок Lucide → ${TARGET}`);
