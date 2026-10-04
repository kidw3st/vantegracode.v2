import fs from 'node:fs';
import path from 'node:path';
import { getCollection, type CollectionEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';

export type Service = CollectionEntry<'services'>;
export type Price = CollectionEntry<'prices'>;
export type FaqItem = CollectionEntry<'faq'>;
export type Post = CollectionEntry<'blog'>;

export async function getServices(): Promise<Service[]> {
  return (await getCollection('services')).sort((a, b) => a.data.order - b.data.order);
}

/** Цены с проверкой: услуга существует, пункты состава взяты из её includes */
export async function getPrices(): Promise<Price[]> {
  const [prices, services] = await Promise.all([getCollection('prices'), getServices()]);
  const byId = new Map(services.map((service) => [service.id, service]));
  const priceIds = new Set(prices.map((price) => price.id));

  for (const price of prices) {
    const service = byId.get(price.data.service);
    if (!service) {
      throw new Error(`prices.yaml: «${price.id}» ссылается на неизвестную услугу «${price.data.service}»`);
    }
    for (const item of price.data.items) {
      if (!service.data.includes.includes(item)) {
        throw new Error(`prices.yaml: пункт «${item}» у «${price.id}» не найден в includes услуги «${service.id}»`);
      }
    }
  }
  for (const service of services) {
    if (!priceIds.has(service.data.priceKey)) {
      throw new Error(`Услуга «${service.id}»: priceKey «${service.data.priceKey}» не найден в prices.yaml`);
    }
  }
  return prices.sort((a, b) => a.data.order - b.data.order);
}

export async function getFaq(): Promise<FaqItem[]> {
  return (await getCollection('faq')).sort((a, b) => a.data.order - b.data.order);
}

/** 2–4 вопроса для страницы услуги: сначала с тегом самой услуги, потом остальные по порядку */
export async function getServiceFaq(service: Service, limit = 4): Promise<FaqItem[]> {
  const tags = new Set(service.data.faqTags);
  return (await getFaq())
    .filter((item) => item.data.tags.some((tag) => tags.has(tag)))
    .sort((a, b) => {
      const own = Number(b.data.tags.includes(service.id)) - Number(a.data.tags.includes(service.id));
      return own || a.data.order - b.data.order;
    })
    .slice(0, limit);
}

export async function getPosts(): Promise<Post[]> {
  return (await getCollection('blog', (post) => !post.data.draft)).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime() || a.data.title.localeCompare(b.data.title, 'ru'),
  );
}

/** Минуты чтения: 180 слов в минуту */
export function readingTime(body: string | undefined): number {
  const words = (body ?? '').replace(/[#>*_`|[\]()-]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

/** 03.10.2026 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow' }).format(date);
}

/* ---------- Кейсы ---------- */

export interface WorkResult {
  value: string;
  label: string;
}

export interface Work {
  id: string;
  title: string;
  client: string | null;
  year: number;
  services: string[];
  url: string | null;
  duration: string | null;
  featured: boolean;
  task: string;
  lead: string;
  done: string[];
  results: WorkResult[];
  stack: string[];
  cover: ImageMetadata;
  gallery: ImageMetadata[];
  order: number | null;
}

const images = import.meta.glob<ImageMetadata>('/cases/*/*.{jpg,jpeg,png,webp,avif}', {
  eager: true,
  import: 'default',
});

function caseImages(id: string): { cover?: ImageMetadata; gallery: ImageMetadata[] } {
  const prefix = `/cases/${id}/`;
  const files = Object.entries(images)
    .filter(([file]) => file.startsWith(prefix))
    .map(([file, meta]) => ({ name: file.slice(prefix.length).toLowerCase(), meta }));
  return {
    cover: files.find((f) => f.name.startsWith('cover.'))?.meta,
    gallery: files
      .filter((f) => /^0[1-6]\./.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => f.meta),
  };
}

/** Разделы тела кейса: «## Задача», «## Что сделали», «## Результат», «## Стек» */
function sections(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of body.split(/^##\s+/m).slice(1)) {
    const [heading = '', ...rest] = part.split('\n');
    map.set(heading.trim().toLowerCase(), rest.join('\n').trim());
  }
  return map;
}

const listItems = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean);

/** Есть ли в папке владельца хоть один кейс (папки на «_» не считаются) */
function hasCaseFolders(): boolean {
  const dir = path.resolve('cases');
  if (!fs.existsSync(dir)) return false;
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .some((entry) => entry.isDirectory() && !entry.name.startsWith('_') && fs.existsSync(path.join(dir, entry.name, 'index.md')));
}

/** Опубликованные кейсы: без заглушек [ ], с обложкой; новые первыми */
export async function getWorks(): Promise<Work[]> {
  if (!hasCaseFolders()) return [];
  const entries = await getCollection('works');
  const works: Work[] = [];

  for (const entry of entries) {
    const body = entry.body ?? '';
    if (`${JSON.stringify(entry.data)}\n${body}`.includes('[ ]')) continue;

    const { cover, gallery } = caseImages(entry.id);
    if (!cover) continue;

    const parts = sections(body);
    const task = parts.get('задача') ?? '';
    const lead = /^[^.!?…]*[.!?…]/.exec(task)?.[0] ?? task;
    const results = listItems(parts.get('результат') ?? '')
      .map((line) => {
        const [value = '', ...label] = line.split(/\s+—\s+/);
        return { value: value.trim(), label: label.join(' — ').trim() };
      })
      .filter((result) => result.value && result.label);

    works.push({
      id: entry.id,
      title: entry.data.title,
      client: entry.data.client ?? null,
      year: entry.data.year,
      services: entry.data.services,
      url: entry.data.url ?? null,
      duration: entry.data.duration ?? null,
      featured: entry.data.featured,
      task,
      lead,
      done: listItems(parts.get('что сделали') ?? ''),
      results,
      stack: (parts.get('стек') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      cover,
      gallery,
      order: entry.data.order ?? null,
    });
  }

  // порядок владельца, затем новые первыми
  return works.sort(
    (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || b.year - a.year || a.title.localeCompare(b.title, 'ru'),
  );
}
