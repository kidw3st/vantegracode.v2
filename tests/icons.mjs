/** Контракт SVG и манифеста, геометрия через встроенный SVG DOM Chromium. */
import { readdir, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const dir = 'src/assets/icons';
const manifest = JSON.parse(await readFile(dir + '/manifest.json', 'utf8'));
const files = (await readdir(dir)).filter((file) => file.endsWith('.svg')).sort();
const errors = [];
const fail = (file, rule) => errors.push(file + ' — ' + rule);
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
const inputs = await Promise.all(files.map(async (file) => {
  const source = await readFile(dir + '/' + file, 'utf8');
  if (!/^[a-z]+(?:-[a-z]+)*\.svg$/.test(file)) fail(file, 'имя не kebab-case');
  if (Buffer.byteLength(source) > 1024) fail(file, 'размер больше 1 КБ');
  if (source.trim().includes('\n') || source.includes('<!--')) fail(file, 'нужна одна строка без комментариев');
  if (!names.has(file.slice(0, -4))) fail(file, 'нет в манифесте');
  return { file, source };
}));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const geometryErrors = await page.evaluate((inputs) => {
    const failures = [];
    const fail = (file, rule) => failures.push(file + ' — ' + rule);
    const rootAttrs = { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.25', 'stroke-linecap': 'square', 'stroke-linejoin': 'miter' };
    const common = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'];
    const attrs = {
      svg: Object.keys(rootAttrs), path: ['d'], line: ['x1', 'y1', 'x2', 'y2'],
      polyline: ['points'], polygon: ['points'], rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
      circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry', 'transform'], g: [],
    };
    const quarter = (number) => Number.isFinite(number) && Math.abs(number * 4 - Math.round(number * 4)) < 1e-7;
    const straightAngles = (d) => {
      const tokens = d.match(/[MLHVACQSTZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
      const arity = { M: 2, L: 2, H: 1, V: 1, A: 7, C: 6, Q: 4, S: 4, T: 2 };
      let index = 0, command = '', x = 0, y = 0, startX = 0, startY = 0;
      const valid = (nx, ny) => Math.abs(nx - x) < .001 || Math.abs(ny - y) < .001 || Math.abs(Math.abs(nx - x) - Math.abs(ny - y)) < .001;
      while (index < tokens.length) {
        if (/^[a-z]$/i.test(tokens[index])) command = tokens[index++];
        const kind = command.toUpperCase();
        if (kind === 'Z') {
          if (!valid(startX, startY)) return false;
          x = startX; y = startY; command = ''; continue;
        }
        const count = arity[kind];
        if (!count || index + count > tokens.length) return false;
        const values = tokens.slice(index, index + count).map(Number); index += count;
        if (values.some((n) => !Number.isFinite(n))) return false;
        const relative = command === command.toLowerCase();
        let nx = x, ny = y;
        if (kind === 'H') nx = values[0] + (relative ? x : 0);
        else if (kind === 'V') ny = values[0] + (relative ? y : 0);
        else { nx = values[count - 2] + (relative ? x : 0); ny = values[count - 1] + (relative ? y : 0); }
        if (['L', 'H', 'V'].includes(kind) && !valid(nx, ny)) return false;
        x = nx; y = ny;
        if (kind === 'M') { startX = x; startY = y; command = relative ? 'l' : 'L'; }
      }
      return true;
    };
    for (const { file, source } of inputs) {
      const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
      const svg = parsed.documentElement;
      if (svg.localName !== 'svg' || parsed.querySelector('parsererror')) { fail(file, 'некорректный SVG'); continue; }
      for (const [key, value] of Object.entries(rootAttrs)) if (svg.getAttribute(key) !== value) fail(file, 'корневой атрибут ' + key);
      document.body.append(document.importNode(svg, true));
      const live = document.body.lastElementChild;
      let dots = 0, orbits = 0;
      for (const element of [live, ...live.querySelectorAll('*')]) {
        const tag = element.localName;
        if (!Object.hasOwn(attrs, tag)) { fail(file, 'запрещённый элемент ' + tag); continue; }
        if (tag !== 'svg' && element.textContent.trim()) fail(file, 'текст внутри SVG');
        if (element.hasAttribute('stroke-width') && element.getAttribute('stroke-width') !== '1.25') fail(file, 'толщина линии');
        if (element.hasAttribute('stroke-linecap') && element.getAttribute('stroke-linecap') !== 'square') fail(file, 'концы линий');
        if (element.hasAttribute('stroke-linejoin') && element.getAttribute('stroke-linejoin') !== 'miter') fail(file, 'соединения линий');
        for (const attribute of element.attributes) {
          const { name, value } = attribute;
          const allowed = attrs[tag].includes(name) || (tag !== 'svg' && common.includes(name));
          if (!allowed) fail(file, 'запрещённый атрибут ' + name);
          if (['fill', 'stroke'].includes(name) && !['none', 'currentColor'].includes(value)) fail(file, 'цвет ' + value);
          if (name === 'transform') {
            if (tag !== 'ellipse' || value !== `rotate(-12 ${element.getAttribute('cx')} ${element.getAttribute('cy')})`) fail(file, 'transform');
          }
          if (['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height'].includes(name)) {
            const number = Number(value);
            if (!Number.isFinite(number) || number < 0) fail(file, 'нечисловая или отрицательная геометрия');
            if (!(name === 'ry' && tag === 'ellipse' && element.hasAttribute('transform')) && !quarter(number)) fail(file, 'не кратно 0,25: ' + name);
            if (['r', 'rx', 'ry', 'width', 'height'].includes(name) && number <= 0) fail(file, 'неположительный размер');
          }
          if (['d', 'points'].includes(name)) {
            const numbers = value.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
            if (!numbers.every((value) => quarter(Number(value)))) fail(file, 'координаты пути не кратны 0,25');
            if (name === 'd' && /[^MLHVACQSTZ\d\s.,+e-]/i.test(value)) fail(file, 'неизвестная команда пути');
            // Исключение — бумажный самолётик telegram: его крылья не строятся из углов 0°, 45° и 90°.
            if (name === 'd' && file !== 'telegram.svg' && !straightAngles(value)) fail(file, 'прямые отрезки должны идти под 0°, 45° или 90°');
          }
        }
        if (element.getAttribute('fill') === 'currentColor') {
          const r = Number(element.getAttribute('r'));
          if (tag !== 'circle' || r < .75 || r > 1.25 || element.getAttribute('stroke') !== 'none') fail(file, 'заливка только у точки-ядра');
          dots++;
        }
        if (tag === 'ellipse' && element.hasAttribute('transform')) {
          orbits++;
          const rx = Number(element.getAttribute('rx')), ry = Number(element.getAttribute('ry'));
          if (Math.abs(ry - rx * .306) > .010001) fail(file, 'пропорции орбиты');
        }
        if (tag === 'ellipse' && !element.hasAttribute('transform') && Math.abs(Number(element.getAttribute('ry')) - Number(element.getAttribute('rx')) * .306) > .010001) fail(file, 'пропорции эллипса');
        if (tag === 'rect' && element.hasAttribute('rx') && Number(element.getAttribute('rx')) > 2) fail(file, 'слишком большое скругление');
        if (!['svg', 'g'].includes(tag)) {
          const box = element.getBBox();
          // getBBox не учитывает transform: применяем матрицу к четырём углам.
          let points = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]];
          if (element.hasAttribute('transform')) {
            const matrix = element.transform.baseVal.consolidate().matrix;
            points = points.map(([x,y]) => [matrix.a*x + matrix.c*y + matrix.e, matrix.b*x + matrix.d*y + matrix.f]);
          }
          if (points.some(([x,y]) => x < 2 - .001 || x > 22 + .001 || y < 2 - .001 || y > 22 + .001)) fail(file, 'геометрия выходит за 2…22');
        }
      }
      if (dots > 2) fail(file, 'больше двух точек-ядер');
      if (orbits > 1) fail(file, 'больше одной орбиты');
      live.remove();
    }
    return failures;
  }, inputs);
  errors.push(...geometryErrors);
} finally { await browser.close(); }
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('✓ ' + files.length + ' иконок');
