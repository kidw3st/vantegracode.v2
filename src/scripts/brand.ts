/**
 * Надпись VANTEGRA после первого экрана (BrandWordmark.astro). Прорисовку ведёт прокрутка:
 * - в момент остановки линия выстреливает из вспышки (взрыв вихря пыли рисует disc.ts);
 * - во время остановки в центре экрана (доля q): контуры букв обводятся от середины слова к краям,
 *   буквы заливаются мелом, контур и линия гаснут.
 * Толщина контура и линии — 1 px экрана при любой ширине надписи (--sw в единицах viewBox).
 * Двигаем только transform (линия), stroke-dashoffset и opacity.
 */
import { landingScroll, smooth } from './hero-scroll.ts';
import { onPage, prefersReducedMotion } from './lifecycle.ts';

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const ease = (value: number) => smooth(clamp(value));

onPage(() => {
  const track = document.querySelector<HTMLElement>('[data-brand-track]');
  const stage = track?.querySelector<HTMLElement>('[data-brand-stage]');
  const mark = track?.querySelector<HTMLElement>('[data-brand]');
  const svg = mark?.querySelector('svg');
  if (!track || !stage || !mark || !svg) return;

  const vbWidth = Number(mark.dataset.vbWidth) || 1710;
  const strokes = new ResizeObserver(() => {
    const width = svg.getBoundingClientRect().width || 1;
    mark.style.setProperty('--sw', (vbWidth / width).toFixed(3));
  });
  strokes.observe(svg);
  if (prefersReducedMotion()) return () => strokes.disconnect();

  const line = svg.querySelector<SVGElement>('[data-brand-line]');
  const letters = [...svg.querySelectorAll<SVGGElement>('[data-letter]')].map((group) => ({
    order: Number(group.dataset.order) || 0,
    fill: group.querySelector<SVGElement>('.brand-mark__fill'),
    outline: group.querySelector<SVGElement>('.brand-mark__outline'),
  }));

  /** Длина остановки, px: высота отрезка ::after у дорожки */
  let pin = 1;
  const measure = () => {
    pin = Math.max(1, parseFloat(getComputedStyle(track, '::after').height) || 1);
  };

  let raf = 0;
  const apply = () => {
    raf = 0;
    const q = clamp((window.scrollY - landingScroll()) / pin);
    if (line) {
      // линия выстреливает из вспышки, как только надпись встала (взрыв — disc.ts), и гаснет, когда буквы залиты
      line.classList.toggle('is-on', window.scrollY >= landingScroll());
      line.style.setProperty('--line-fade', (1 - ease((q - 0.7) / 0.25)).toFixed(3));
    }
    for (const letter of letters) {
      const shift = 0.09 * letter.order;
      const drawn = ease((q - 0.04 - shift) / 0.36);
      const filled = ease((q - 0.3 - shift) / 0.3);
      const gone = ease((q - 0.68 - 0.04 * letter.order) / 0.2);
      if (letter.outline) {
        letter.outline.style.strokeDashoffset = (1 - drawn).toFixed(4);
        letter.outline.style.opacity = (1 - gone).toFixed(3);
      }
      if (letter.fill) letter.fill.style.opacity = filled.toFixed(3);
    }
  };

  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(apply);
  };
  const onResize = () => {
    measure();
    onScroll();
  };

  measure();
  apply();
  const sizes = new ResizeObserver(onResize);
  sizes.observe(document.body);
  window.addEventListener('scroll', onScroll, { passive: true });

  return () => {
    strokes.disconnect();
    sizes.disconnect();
    window.removeEventListener('scroll', onScroll);
    cancelAnimationFrame(raf);
  };
});
