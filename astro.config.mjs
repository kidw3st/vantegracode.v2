// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import { rehypeTypograf } from './src/lib/rehype-typograf.ts';

/** Служебные страницы, которых нет в sitemap */
const HIDDEN = ['/styleguide/', '/kontakty/spasibo/', '/kontakty/oshibka/', '/404/'];

export default defineConfig({
  site: 'https://vantegracode.ru',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  devToolbar: {
    enabled: false,
  },
  integrations: [
    sitemap({
      filter: (page) => !HIDDEN.some((path) => page.endsWith(path)),
    }),
  ],
  markdown: {
    // unified вместо Sätteri: нужен rehype-плагин типографа; кавычки ставит typograf, не smartypants
    processor: unified({ gfm: true, smartypants: false, rehypePlugins: [rehypeTypograf] }),
  },
});
