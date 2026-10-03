/**
 * Плашка cookie и Яндекс Метрика. Плашка есть только если номер счётчика заполнен.
 * Счётчик загружается после «Принять» (выбор запоминается) и инициализируется с defer:
 * просмотры отправляются вручную на каждом astro:page-load — без двойного учёта первой загрузки.
 */
import { onPage } from './lifecycle.ts';

const KEY = 'vantegra-cookie-consent';
const TAG = 'https://mc.yandex.ru/metrika/tag.js';

let loadedId: number | null = null;
let lastUrl: string | null = null;

function readChoice(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function saveChoice(value: 'accepted' | 'declined'): void {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    /* хранилище недоступно — спросим в следующий раз */
  }
}

function loadMetrika(id: number): void {
  if (loadedId === id) return;
  loadedId = id;
  type Ym = NonNullable<Window['ym']> & { a?: unknown[][]; l?: number };
  const queue: Ym = Object.assign(
    (...args: unknown[]) => {
      (queue.a ??= []).push(args);
    },
    { l: Date.now() },
  );
  window.ym = window.ym ?? queue;
  if (!document.querySelector(`script[src="${TAG}"]`)) {
    const script = document.createElement('script');
    script.async = true;
    script.src = TAG;
    document.head.append(script);
  }
  window.ym(id, 'init', { defer: true, clickmap: true, trackLinks: true, accurateTrackBounce: true });
}

function hit(id: number): void {
  const url = window.location.href;
  if (url === lastUrl) return;
  window.ym?.(id, 'hit', url, { referer: lastUrl ?? document.referrer, title: document.title });
  lastUrl = url;
}

onPage(() => {
  const notice = document.querySelector<HTMLElement>('[data-cookie]');
  const id = Number(notice?.dataset.metrikaId);
  if (!notice || !id) return;

  const choice = readChoice();
  if (choice === 'accepted') {
    loadMetrika(id);
    hit(id);
    return;
  }
  if (choice === 'declined') return;

  notice.hidden = false;
  const ac = new AbortController();
  notice.querySelector('[data-cookie-accept]')?.addEventListener(
    'click',
    () => {
      saveChoice('accepted');
      notice.hidden = true;
      loadMetrika(id);
      hit(id);
    },
    { signal: ac.signal },
  );
  notice.querySelector('[data-cookie-decline]')?.addEventListener(
    'click',
    () => {
      saveChoice('declined');
      notice.hidden = true;
    },
    { signal: ac.signal },
  );
  return () => ac.abort();
});
