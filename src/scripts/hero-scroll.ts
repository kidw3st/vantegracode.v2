/**
 * Переход от первого экрана к надписи VANTEGRA: «орбита ложится в линию».
 * При прокрутке пылевой диск (disc.ts) сплющивается, выпрямляется в горизонталь и съезжает
 * на среднюю линию надписи — ровно к моменту, когда надпись встаёт в центр экрана.
 * Эхо-орбиты вокруг знака идут вместе с пылью: так же сплющиваются, выпрямляются и съезжают,
 * а гаснут одновременно с текстом первого экрана. Знак гаснет на месте, текст уходит с параллаксом.
 * Двигаем только transform и opacity; при prefers-reduced-motion перехода нет.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

/** Прокрутка, при которой центр надписи стоит в центре экрана (кэш, сброс при изменении размеров) */
let landing = 0;

function measureLanding(hero: HTMLElement): number {
  const target = document.querySelector<HTMLElement>('[data-disc-target]');
  if (!target) return hero.offsetHeight * 0.75;
  const rect = target.getBoundingClientRect();
  return Math.max(1, rect.top + rect.height / 2 + window.scrollY - window.innerHeight / 2);
}

export function resetLanding(): void {
  landing = 0;
}

/** Доля перехода: 0 — наверху, 1 — надпись в центре экрана */
export function heroProgress(hero: HTMLElement): number {
  if (!landing) landing = measureLanding(hero);
  return Math.min(1, Math.max(0, window.scrollY / landing));
}

/** Плавная кривая доли и раннее сплющивание: последние доли перехода скользит уже тонкая полоса */
export const smooth = (p: number) => p * p * (3 - 2 * p);
export const squashOf = (p: number) => smooth(Math.min(1, p / 0.7));
/** Текст первого экрана гаснет к 0,77 перехода; кольца гаснут так же */
export const fadeOf = (eased: number) => Math.max(0, 1 - 1.3 * eased);

onPage(() => {
  resetLanding();
  if (prefersReducedMotion()) return;

  const hero = document.querySelector<HTMLElement>('.hero');
  const logo = hero?.querySelector<HTMLElement>('.hero__logo');
  const orbits = logo?.querySelector<HTMLElement>('.orbits');
  const art = logo?.querySelector<HTMLElement>('.hero__art');
  const copy = hero?.querySelector<HTMLElement>('.hero__copy');
  const target = document.querySelector<HTMLElement>('[data-disc-target]');
  if (!hero || !logo || !copy) return;

  let raf = 0;
  let applied = -1;
  let drift = 0;

  /** Сдвиг колец вслед за пылью: от центра знака к средней линии надписи, px страницы */
  const measureDrift = () => {
    if (!target) return 0;
    const logoBox = logo.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    return targetBox.top + targetBox.height / 2 - (logoBox.top + logoBox.height / 2);
  };

  const apply = () => {
    raf = 0;
    const p = heroProgress(hero);
    if (Math.abs(p - applied) < 0.0005) return;
    applied = p;
    const e = smooth(p);
    const f = squashOf(p);
    const fade = fadeOf(e);
    const reset = p === 0;
    if (orbits) {
      orbits.style.transform = reset
        ? ''
        : `translate3d(0, ${(drift * e).toFixed(1)}px, 0) rotate(${(12 * f).toFixed(3)}deg) scaleY(${(1 - 0.96 * f).toFixed(4)})`;
      orbits.style.opacity = reset ? '' : fade.toFixed(4);
    }
    if (art) art.style.opacity = reset ? '' : Math.max(0, 1 - 1.4 * e).toFixed(4);
    copy.style.transform = reset ? '' : `translate3d(0, ${(e * hero.offsetHeight * 0.18).toFixed(1)}px, 0)`;
    copy.style.opacity = reset ? '' : fade.toFixed(4);
  };

  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(apply);
  };
  const onResize = () => {
    resetLanding();
    drift = measureDrift();
    applied = -1;
    onScroll();
  };

  drift = measureDrift();
  // высота страницы меняется (шрифты, картинки) — пересчитать точку посадки и сдвиг колец
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(document.body);
  window.addEventListener('scroll', onScroll, { passive: true });
  apply();

  return () => {
    resizeObserver.disconnect();
    window.removeEventListener('scroll', onScroll);
    cancelAnimationFrame(raf);
    for (const el of [orbits, art, copy]) {
      if (!el) continue;
      el.style.transform = '';
      el.style.opacity = '';
    }
  };
});
