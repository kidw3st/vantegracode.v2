/**
 * Надпись VANTEGRA после первого экрана (BrandWordmark.astro).
 * - Толщина контура и линии — 1 px экрана при любой ширине надписи (--sw в единицах viewBox).
 * - Прорисовка (.is-drawn) запускается, когда надпись входит в среднюю полосу экрана —
 *   в этот момент на её среднюю линию ложится пыль первого экрана (disc.ts). Один раз.
 */
import { onPage } from './lifecycle.ts';

onPage(() => {
  const mark = document.querySelector<HTMLElement>('[data-brand]');
  const svg = mark?.querySelector('svg');
  if (!mark || !svg) return;

  const vbWidth = Number(mark.dataset.vbWidth) || 1710;
  const resize = new ResizeObserver(() => {
    const width = svg.getBoundingClientRect().width || 1;
    mark.style.setProperty('--sw', (vbWidth / width).toFixed(3));
  });
  resize.observe(svg);

  if (mark.classList.contains('is-drawn') || !('IntersectionObserver' in window)) {
    mark.classList.add('is-drawn');
    return () => resize.disconnect();
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return;
      mark.classList.add('is-drawn');
      observer.disconnect();
    },
    // средние 40 % экрана: надпись почти в центре, пыль на подлёте
    { rootMargin: '-30% 0px -30% 0px' },
  );
  observer.observe(svg);

  return () => {
    resize.disconnect();
    observer.disconnect();
  };
});
