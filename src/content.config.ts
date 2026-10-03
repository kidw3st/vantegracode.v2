import fs from 'node:fs';
import path from 'node:path';
import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** Услуги — 6 файлов Markdown */
const services = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/services' }),
  schema: z.object({
    title: z.string(),
    order: z.number().int().min(1),
    short: z.string(),
    lead: z.string(),
    includes: z.array(z.string()).min(3),
    forWhom: z.array(z.string()).length(3),
    priceKey: z.string(),
    image: z.string().optional(),
    faqTags: z.array(z.string()).default([]),
    seoTitle: z.string(),
    seoDescription: z.string().max(160),
  }),
});

/** Цены: число без «₽» или null; срок — в родительном падеже («2 недель») или null */
const prices = defineCollection({
  loader: file('./src/content/prices.yaml'),
  schema: z.object({
    title: z.string(),
    order: z.number().int(),
    price: z.number().int().positive().nullable(),
    term: z.string().nullable(),
    perMonth: z.boolean().default(false),
    service: z.string(),
    /** 3–4 пункта состава — только из includes услуги, проверяется при сборке */
    items: z.array(z.string()).min(3).max(4),
  }),
});

/** Вопросы: group — блок на странице, tags — для выборки на страницах услуг */
const faq = defineCollection({
  loader: file('./src/content/faq.yaml'),
  schema: z.object({
    order: z.number().int(),
    group: z.enum(['money', 'process', 'after']),
    q: z.string(),
    a: z.string(),
    tags: z.array(z.string()).min(1),
  }),
});

/** Статьи блога */
const blog = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    lead: z.string(),
    date: z.coerce.date(),
    tag: z.string(),
    /** Слаг профильной услуги */
    service: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

/**
 * Кейсы читаются прямо из папки владельца `cases/`: одна подпапка — один проект,
 * описание в `index.md`, обложка `cover.*`, галерея `01–06.*`.
 * Папки на `_` игнорируются. Нет папки или кейсов — коллекция пустая, это не ошибка.
 */
const CASES_DIR = './cases';
const hasCases =
  fs.existsSync(CASES_DIR) &&
  fs
    .readdirSync(CASES_DIR, { withFileTypes: true })
    .some(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith('_') &&
        fs.existsSync(path.join(CASES_DIR, entry.name, 'index.md')),
    );

const works = defineCollection({
  loader: hasCases
    ? glob({ pattern: ['*/index.md', '!_*/**'], base: CASES_DIR, generateId: ({ entry }) => entry.split('/')[0] ?? entry })
    : async () => [],
  schema: z.object({
    title: z.string(),
    /** Клиент; пусто — «Под NDA» */
    client: z.string().nullable().optional(),
    year: z.number().int(),
    /** Слаги услуг из src/content/services */
    services: z.array(z.string()).min(1),
    url: z.string().url().nullable().optional(),
    duration: z.string().nullable().optional(),
    featured: z.boolean().default(false),
  }),
});

export const collections = { services, prices, faq, blog, works };
