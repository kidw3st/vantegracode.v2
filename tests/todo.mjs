/**
 * Собирает TODO.md: все незаполненные значения (null) с файлом и строкой + пункты для проверки владельцем.
 *   npm run todo
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const lines = (file) => readFileSync(file, 'utf8').split(/\r?\n/);
const items = [];

// src/data/site.ts — поля со значением null и пояснением в комментарии строкой выше
{
  const file = 'src/data/site.ts';
  const src = lines(file);
  src.forEach((line, i) => {
    const m = /^\s*(\w+):\s*null\b/.exec(line);
    if (!m) return;
    const comment = /\/\*\*\s*(.+?)\s*\*\//.exec(src[i - 1] ?? '')?.[1] ?? m[1];
    items.push({ group: 'Контакты и условия', text: `${comment} — \`${m[1]}\``, where: `${file}:${i + 1}` });
  });
}

// src/content/prices.yaml — цены и сроки
{
  const file = 'src/content/prices.yaml';
  const src = lines(file);
  let id = '';
  let title = '';
  src.forEach((line, i) => {
    const idMatch = /^- id:\s*(\S+)/.exec(line);
    if (idMatch) id = idMatch[1];
    const titleMatch = /^\s+title:\s*(.+)$/.exec(line);
    if (titleMatch) title = titleMatch[1];
    if (/^\s+price:\s*null\b/.test(line)) items.push({ group: 'Цены и сроки', text: `${title}: цена от`, where: `${file}:${i + 1}` });
    if (/^\s+term:\s*null\b/.test(line) && id !== 'support') items.push({ group: 'Цены и сроки', text: `${title}: срок от (родительный падеж: «2 недель»)`, where: `${file}:${i + 1}` });
  });
}

// faq.yaml — пометки «проверь»
{
  const file = 'src/content/faq.yaml';
  lines(file).forEach((line, i) => {
    if (/проверьте формулировку/i.test(line)) {
      items.push({ group: 'Проверить владельцу', text: 'Ответ «Может ли цена вырасти в процессе?» — подтвердить формулировку', where: `${file}:${i + 1}` });
    }
  });
}

// site.ts — почта
{
  const file = 'src/data/site.ts';
  const n = lines(file).findIndex((l) => /email:\s*'/.test(l));
  if (n >= 0) items.push({ group: 'Проверить владельцу', text: 'Почта hello@vantegra.ru — домен vantegra.ru отличается от домена сайта vantegracode.ru', where: `${file}:${n + 1}` });
}

// Кейсы
const hasCases =
  existsSync('cases') &&
  readdirSync('cases', { withFileTypes: true }).some((d) => d.isDirectory() && !d.name.startsWith('_'));
if (!hasCases) {
  items.push({
    group: 'Контент',
    text: 'Кейсов нет: блок «Работы» на главной не выводится (главная из 6 блоков), /raboty/ — пустое состояние. Добавить кейсы в cases/',
    where: 'cases/',
  });
}

const manual = [
  { group: 'Контент', text: 'Команды в материалах нет — блок «Команда» на «О студии» не делался', where: 'src/pages/o-studii.astro' },
  { group: 'Контент', text: 'Изображения из п. 4.6 задания на сайте не используются (решение владельца) — блоки сделаны без них', where: 'PLAN.md' },
  {
    group: 'Проверить владельцу',
    text: 'Значения из шаблона КП (оплата 50/50, документы по этапам, гарантия 1 месяц, демо каждую неделю, правки прототипа бесплатно, код и доступы — клиенту, поддержка от 25 000 ₽) — если актуальны, внести в site.ts и prices.yaml',
    where: 'docs/Vantegra-KP.pdf',
  },
];

const all = [...items, ...manual];
const groups = [...new Set(all.map((item) => item.group))];
const out = [
  '# TODO',
  '',
  'Всё, что осталось заглушкой или требует проверки владельцем. Файл собирается командой `npm run todo`.',
  'Незаполненное значение — `null`: внутри готового текста на сайте видно `[ ]`, отдельные поля не выводятся.',
  '',
  ...groups.flatMap((group) => [
    `## ${group}`,
    '',
    ...all.filter((item) => item.group === group).map((item) => `- [ ] ${item.text} — \`${item.where}\``),
    '',
  ]),
].join('\n');

writeFileSync('TODO.md', out);
console.log(`TODO.md: ${all.length} пунктов`);
