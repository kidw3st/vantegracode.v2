/**
 * Переход от первого экрана к надписи VANTEGRA: «орбита ложится в линию».
 * При прокрутке пылевой диск (disc.ts) сначала выпрямляется из −12° в горизонталь, затем
 * сплющивается в тонкую линию и ровно съезжает в центр экрана — туда, где остановится надпись.
 * Эхо-орбиты вокруг знака идут вместе с пылью (так же выпрямляются, сплющиваются, съезжают)
 * и гаснут одновременно с текстом. Знак гаснет на месте; текст гаснет и чуть уменьшается,
 * не сдвигаясь вниз — край первого экрана его не обрезает.
 * Двигаем только transform и opacity; при prefers-reduced-motion перехода нет.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

/** Центр надписи на странице в момент, когда она встаёт в центр экрана и останавливается, px */
let targetY = 0;

export function targetCenter(): number {
  if (targetY) return targetY;
  const track = document.querySelector<HTMLElement>('[data-brand-track]');
  const brand = track?.querySelector<HTMLElement>('[data-brand-stage]');
  if (!track || !brand) return 0;
  const padding = parseFloat(getComputedStyle(track).paddingTop) || 0;
  targetY = track.getBoundingClientRect().top + window.scrollY + padding + brand.offsetHeight / 2;
  return targetY;
}

export function resetTarget(): void {
  targetY = 0;
}

/** Прокрутка, при которой надпись останавливается в центре экрана */
export function landingScroll(): number {
  const center = targetCenter();
  return center ? Math.max(1, center - window.innerHeight / 2) : 1;
}

/** Доля перехода: 0 — наверху, 1 — надпись в центре экрана */
export function heroProgress(): number {
  return Math.min(1, Math.max(0, window.scrollY / landingScroll()));
}

export const smooth = (p: number) => p * p * (3 - 2 * p);
/** Сначала выпрямляется (к 0,45 перехода), потом сплющивается (к 0,6) — уходит ровной линией */
export const straightOf = (p: number) => smooth(Math.min(1, p / 0.45));
export const squashOf = (p: number) => smooth(Math.min(1, p / 0.6));
/** Текст первого экрана гаснет к 0,77 перехода; кольца гаснут так же */
export const fadeOf = (eased: number) => Math.max(0, 1 - 1.3 * eased);

onPage(() => {
  resetTarget();
  if (prefersReducedMotion()) return;

  const hero = document.querySelector<HTMLElement>('.hero');
  const logo = hero?.querySelector<HTMLElement>('.hero__logo');
  const orbits = logo?.querySelector<HTMLElement>('.orbits');
  const art = logo?.querySelector<HTMLElement>('.hero__art');
  const copy = hero?.querySelector<HTMLElement>('.hero__copy');
  if (!hero || !logo || !copy) return;

  let raf = 0;
  let applied = -1;
  let logoY = 0;

  /** Центр знака на странице: от него кольца съезжают к центру надписи */
  const measure = () => {
    resetTarget();
    const box = logo.getBoundingClientRect();
    logoY = box.top + window.scrollY + box.height / 2;
  };

  const apply = () => {
    raf = 0;
    const p = heroProgress();
    if (Math.abs(p - applied) < 0.0005) return;
    applied = p;
    const e = smooth(p);
    const fade = fadeOf(e);
    const reset = p === 0;
    if (orbits) {
      const drift = (targetCenter() - logoY) * e;
      orbits.style.transform = reset
        ? ''
        : `translate3d(0, ${drift.toFixed(1)}px, 0) rotate(${(12 * straightOf(p)).toFixed(3)}deg) scaleY(${(1 - 0.97 * squashOf(p)).toFixed(4)})`;
      orbits.style.opacity = reset ? '' : fade.toFixed(4);
    }
    if (art) art.style.opacity = reset ? '' : Math.max(0, 1 - 1.4 * e).toFixed(4);
    copy.style.transform = reset ? '' : `scale(${(1 - 0.04 * e).toFixed(4)})`;
    copy.style.opacity = reset ? '' : fade.toFixed(4);
  };

  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(apply);
  };
  const onResize = () => {
    measure();
    applied = -1;
    onScroll();
  };

  measure();
  // высота страницы меняется (шрифты, картинки) — пересчитать точку посадки
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
