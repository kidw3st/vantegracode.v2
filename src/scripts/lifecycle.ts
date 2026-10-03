/**
 * Жизненный цикл скриптов при переходах через ClientRouter:
 * инициализация на astro:page-load, очистка обработчиков, observers и rAF на astro:before-swap.
 */

export type Cleanup = () => void;
type Init = () => Cleanup | void;

const inits: Init[] = [];
let cleanups: Cleanup[] = [];
let started = false;

function teardown(): void {
  for (const cleanup of cleanups.splice(0)) {
    try {
      cleanup();
    } catch (error) {
      console.error(error);
    }
  }
}

function setup(): void {
  teardown();
  for (const init of inits) {
    try {
      const cleanup = init();
      if (cleanup) cleanups.push(cleanup);
    } catch (error) {
      console.error(error);
    }
  }
}

/** Зарегистрировать модуль страницы */
export function onPage(init: Init): void {
  inits.push(init);
}

export function start(): void {
  if (started) return;
  started = true;
  document.addEventListener('astro:page-load', setup);
  document.addEventListener('astro:before-swap', teardown);
  // ClientRouter переносит атрибуты <html> новой страницы — возвращаем класс .js до отрисовки
  document.addEventListener('astro:after-swap', () => {
    document.documentElement.classList.add('js');
  });
}

export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
