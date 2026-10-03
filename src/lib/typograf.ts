import Typograf from 'typograf';

/**
 * Русская типографика при сборке: «ёлочки», тире с неразрывным пробелом,
 * неразрывные пробелы после коротких слов, между числом и единицей, в разрядах.
 * Только для текста: ссылки, телефоны, ID и код сюда не передаются.
 */
const tp = new Typograf({ locale: ['ru', 'en-US'], htmlEntity: { type: 'default' } });

for (const rule of [
  // строки обрабатываются фрагментами — пробелы по краям сохраняем сами
  'common/space/trimLeft',
  'common/space/trimRight',
  'common/space/delLeadingBlanks',
  'common/space/delTrailingBlanks',
  'common/space/insertFinalNewline',
  // заглушка [ ] должна остаться видимой
  'common/space/squareBracket',
  // HTML собирает Astro, типограф разметку не трогает
  'common/html/url',
  'common/html/e-mail',
  'common/html/p',
  'common/html/nbr',
  'common/html/stripTags',
  'common/html/escape',
  'common/html/processingAttrs',
  'ru/other/phone-number',
]) {
  tp.disableRule(rule);
}

for (const rule of ['common/nbsp/afterNumber', 'common/number/digitGrouping']) {
  tp.enableRule(rule);
}

const NBSP = ' ';
const cache = new Map<string, string>();

export function t(text: string): string;
export function t(text: string | null | undefined): string | null | undefined;
export function t(text: string | null | undefined): string | null | undefined {
  if (text == null || text === '') return text;
  const cached = cache.get(text);
  if (cached !== undefined) return cached;

  const lead = /^\s*/.exec(text)?.[0] ?? '';
  const trail = /\s*$/.exec(text)?.[0] ?? '';
  const core = text.slice(lead.length, text.length - trail.length);

  const out = core
    ? tp
        .execute(core)
        // узкий неразрывный пробел из разрядов — обычный неразрывный, как в Intl
        .replace(/ /g, NBSP)
        // число и единица: «2,5 с», «350 000 ₽»
        .replace(/(\d) (?=[^\s\d—–-])/g, `$1${NBSP}`)
    : core;

  const result = lead + out + trail;
  cache.set(text, result);
  return result;
}
