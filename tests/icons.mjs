/**
 * Контракт иконок: набор Lucide под нашими именами (tools/icons-lucide.mjs), манифест и тип IconName совпадают,
 * у всех SVG один корневой стиль (сетка 24, линия 1,5, круглые концы), только контурные элементы цветом
 * currentColor, геометрия внутри сетки, рядом лежит лицензия Lucide. Геометрию меряет встроенный SVG DOM Chromium.
 */
import { access, readdir, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const dir = 'src/assets/icons';
const manifest = JSON.parse(await readFile(dir + '/manifest.json', 'utf8'));
const files = (await readdir(dir)).filter((file) => file.endsWith('.svg')).sort();
const errors = [];
const fail = (file, rule) => errors.push(file + ' — ' + rule);

await access(dir + '/LICENSE-lucide.txt').catch(() => fail('LICENSE-lucide.txt', 'нет лицензии Lucide рядом с иконками'));

const names = new Set();
const groups = new Set(['ui', 'contact', 'service', 'process', 'feature', 'brand']);
for (const item of manifest) {
  if (names.has(item.name)) fail('manifest.json', 'повтор имени ' + item.name);
  names.add(item.name);
  if (!groups.has(item.group) || typeof item.label !== 'string' || !item.label.trim()) fail('manifest.json', 'группа или подпись ' + item.name);
  if (!files.includes(item.name + '.svg')) fail('manifest.json', 'нет SVG ' + item.name);
}
const component = await readFile('src/components/Icon.astro', 'utf8');
const typeNames = [...component.matchAll(/^  \| '([^']+)'/gm)].map((match) => match[1]);
if (JSON.stringify([...names].sort()) !== JSON.stringify(typeNames.sort())) fail('Icon.astro', 'тип IconName не совпадает с манифестом');

const inputs = await Promise.all(
  files.map(async (file) => {
    const source = await readFile(dir + '/' + file, 'utf8');
    if (!/^[a-z]+(?:-[a-z]+)*\.svg$/.test(file)) fail(file, 'имя не kebab-case');
    if (Buffer.byteLength(source) > 2048) fail(file, 'размер больше 2 КБ');
    if (source.trim().includes('\n') || source.includes('<!--')) fail(file, 'нужна одна строка без комментариев');
    if (!names.has(file.slice(0, -4))) fail(file, 'нет в манифесте');
    return { file, source };
  }),
);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const geometryErrors = await page.evaluate((inputs) => {
    const failures = [];
    const fail = (file, rule) => failures.push(file + ' — ' + rule);
    const rootAttrs = {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.5',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    };
    const attrs = {
      svg: Object.keys(rootAttrs),
      path: ['d'],
      line: ['x1', 'y1', 'x2', 'y2'],
      polyline: ['points'],
      polygon: ['points'],
      rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
      circle: ['cx', 'cy', 'r'],
      ellipse: ['cx', 'cy', 'rx', 'ry'],
      g: [],
    };
    const colors = ['fill', 'stroke'];
    for (const { file, source } of inputs) {
      const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
      const svg = parsed.documentElement;
      if (svg.localName !== 'svg' || parsed.querySelector('parsererror')) {
        fail(file, 'некорректный SVG');
        continue;
      }
      for (const [key, value] of Object.entries(rootAttrs)) if (svg.getAttribute(key) !== value) fail(file, 'корневой атрибут ' + key);
      document.body.append(document.importNode(svg, true));
      const live = document.body.lastElementChild;
      for (const element of [live, ...live.querySelectorAll('*')]) {
        const tag = element.localName;
        if (!Object.hasOwn(attrs, tag)) {
          fail(file, 'запрещённый элемент ' + tag);
          continue;
        }
        if (tag !== 'svg' && element.textContent.trim()) fail(file, 'текст внутри SVG');
        for (const { name, value } of element.attributes) {
          const allowed = attrs[tag].includes(name) || (tag !== 'svg' && colors.includes(name));
          if (!allowed) fail(file, 'запрещённый атрибут ' + name);
          if (colors.includes(name) && !['none', 'currentColor'].includes(value)) fail(file, 'цвет ' + value);
        }
        if (!['svg', 'g'].includes(tag)) {
          const box = element.getBBox();
          if (box.x < -0.001 || box.y < -0.001 || box.x + box.width > 24.001 || box.y + box.height > 24.001) fail(file, 'геометрия выходит за сетку 24');
        }
      }
      live.remove();
    }
    return failures;
  }, inputs);
  errors.push(...geometryErrors);
} finally {
  await browser.close();
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log('✓ ' + files.length + ' иконок Lucide');
