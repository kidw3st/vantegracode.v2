/**
 * Сборка превью для GitHub Pages: https://kidw3st.github.io/vantegracode.v2/
 *
 * Сайт рассчитан на корень домена (vantegracode.ru), а Pages отдаёт его из подпапки.
 * Скрипт собирает сайт с PUBLIC_PREVIEW=1 (noindex, имитация отправки формы — PHP на Pages нет)
 * и переписывает корневые пути в dist/ под подпапку. Исходники не меняются.
 *
 *   node tools/pages-build.mjs                       # база /vantegracode.v2/
 *   PAGES_BASE=/other/ node tools/pages-build.mjs
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.PAGES_BASE ?? '/vantegracode.v2/';
const PREFIX = BASE.replace(/\/$/, '');
const DIST = path.resolve('dist');

execSync('npx astro build', { stdio: 'inherit', env: { ...process.env, PUBLIC_PREVIEW: '1' } });

/** Корневой путь «/…» → «/vantegracode.v2/…»; протокол-относительные «//…» не трогаем */
const rebasePath = (value) => (value.startsWith('/') && !value.startsWith('//') ? PREFIX + value : value);

const rebaseCss = (text) => text.replace(/url\((["']?)\/(?!\/)/g, `url($1${PREFIX}/`);

const rebaseJs = (text) => text.replace(/(["'`])\/(_astro|media|api|fonts|og)\//g, `$1${PREFIX}/$2/`);

const rebaseHtml = (text) =>
  rebaseJs(
    rebaseCss(
      text
        .replace(/(\s(?:href|src|action|data-src|poster)=["'])\/(?!\/)/g, `$1${PREFIX}/`)
        .replace(/(\ssrcset=["'])([^"']+)(["'])/g, (_, open, list, close) =>
          open +
          list
            .split(',')
            .map((candidate) => {
              const [url, ...rest] = candidate.trim().split(/\s+/);
              return [rebasePath(url ?? ''), ...rest].join(' ');
            })
            .join(', ') +
          close,
        ),
    ),
  );

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

let changed = 0;
for (const file of walk(DIST)) {
  const ext = path.extname(file);
  const transform = ext === '.html' ? rebaseHtml : ext === '.css' ? rebaseCss : ext === '.js' ? rebaseJs : null;
  if (!transform) continue;
  const before = readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) {
    writeFileSync(file, after);
    changed += 1;
  }
}

// Превью закрыто от поисковиков; Jekyll на Pages не нужен (папка _astro)
writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
writeFileSync(path.join(DIST, '.nojekyll'), '');

console.log(`[pages] база ${BASE}: переписано файлов — ${changed}`);
