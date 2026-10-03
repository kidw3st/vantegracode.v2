/**
 * Кнопка «Наверх» (ScrollTop.astro): видна ниже первого экрана, кольцо — доля прокрутки страницы.
 * Плавная прокрутка наверх; при prefers-reduced-motion — сразу. С клавиатуры фокус уходит на логотип в шапке,
 * чтобы не потеряться, когда кнопка спрячется.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

onPage(() => {
  const button = document.querySelector<HTMLButtonElement>('[data-to-top]');
  const progress = button?.querySelector<SVGElement>('[data-to-top-progress]');
  if (!button) return;
  const ac = new AbortController();
  const { signal } = ac;

  let raf = 0;
  const update = () => {
    raf = 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const y = window.scrollY;
    button.classList.toggle('is-shown', y > window.innerHeight * 0.9);
    if (progress) progress.style.strokeDashoffset = (1 - (max > 0 ? Math.min(1, y / max) : 0)).toFixed(4);
  };
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true, signal });
  window.addEventListener('resize', onScroll, { passive: true, signal });
  button.addEventListener(
    'click',
    (event) => {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      // нажали с клавиатуры (detail === 0) — фокус на логотип, кнопка сейчас спрячется
      if (event.detail === 0) document.querySelector<HTMLElement>('[data-header-logo]')?.focus({ preventScroll: true });
    },
    { signal },
  );
  update();

  return () => {
    cancelAnimationFrame(raf);
    ac.abort();
  };
});
