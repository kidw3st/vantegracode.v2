import { getCollection } from 'astro:content';
import { site } from '../data/site.ts';
import { t } from './typograf.ts';

/** Видимая заглушка для незаполненного значения внутри готового текста */
export const PLACEHOLDER = '[ ]';

const NBSP = ' ';

/** 350000 → «350 000» с неразрывным пробелом в разрядах */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value).replace(/[\s ]/g, NBSP);
}

interface PriceValue {
  price: number | null;
  term: string | null;
}

let pricesPromise: Promise<Map<string, PriceValue>> | null = null;

function loadPrices(): Promise<Map<string, PriceValue>> {
  pricesPromise ??= getCollection('prices').then(
    (entries) => new Map(entries.map((entry) => [entry.id, { price: entry.data.price, term: entry.data.term }])),
  );
  return pricesPromise;
}

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('ru-RU') + value.slice(1);

type Resolver = (arg: string | undefined, token: string) => string | null;

export type Fill = (text: string) => string;

/**
 * Подстановка токенов {…} при сборке.
 * null → [ ]; значение в начале предложения — с заглавной; неизвестный токен — ошибка сборки.
 */
export async function getFill(): Promise<Fill> {
  const prices = await loadPrices();

  const priceOf = (id: string | undefined, token: string): PriceValue => {
    const value = id ? prices.get(id) : undefined;
    if (!value) throw new Error(`Токен ${token}: нет позиции «${id ?? ''}» в src/content/prices.yaml`);
    return value;
  };

  const resolvers: Record<string, Resolver> = {
    responseTime: () => site.responseTime,
    hours: () => site.hours,
    payment: () => site.terms.payment,
    closingDocs: () => site.terms.closingDocs,
    guarantee: () => site.terms.guarantee,
    demoFrequency: () => site.terms.demoFrequency,
    prototypeEdits: () => site.terms.prototypeEdits,
    codeAccess: () => site.terms.codeAccess,
    nda: () => site.terms.nda,
    telegram: () => site.telegram.handle,
    year: () => String(new Date().getFullYear()),
    price: (id, token) => {
      const { price } = priceOf(id, token);
      return price == null ? null : formatNumber(price);
    },
    term: (id, token) => priceOf(id, token).term,
  };

  return (text: string) =>
    text.replace(/\{([^{}]*)\}/g, (token: string, inner: string, offset: number) => {
      const [name = '', arg] = inner.split(':');
      const resolve = resolvers[name];
      if (!resolve) throw new Error(`Неизвестный токен ${token} в тексте «${text}»`);
      const value = resolve(arg, token);
      if (value == null || value.trim() === '') return PLACEHOLDER;
      const before = text.slice(0, offset);
      const sentenceStart = before.trim() === '' || /[.!?…]\s*$/.test(before);
      return sentenceStart ? capitalize(value) : value;
    });
}

/** Токены + типограф: готовая строка для вывода */
export async function getText(): Promise<(text: string) => string> {
  const fill = await getFill();
  return (text: string) => t(fill(text));
}

/** Есть ли в тексте после подстановки незаполненные значения */
export function hasPlaceholder(text: string): boolean {
  return text.includes(PLACEHOLDER);
}
