/**
 * Появление при прокрутке: [data-reveal] поднимается на 16 px и проявляется один раз.
 * Порог 0,15; у высоких блоков — 15 % высоты экрана, чтобы блок длиннее экрана тоже появлялся.
 */
import { onPage } from './lifecycle.ts';

const THRESHOLD = 0.15;

onPage(() => {
  const elements = [...document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)')];
  if (!elements.length) return;

  if (!('IntersectionObserver' in window)) {
    for (const el of elements) el.classList.add('is-in');
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const visibleShare = entry.intersectionRect.height / window.innerHeight;
        if (entry.intersectionRatio >= THRESHOLD || visibleShare >= THRESHOLD) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: [0, 0.05, THRESHOLD, 0.3, 0.6, 1] },
  );

  for (const el of elements) observer.observe(el);
  return () => observer.disconnect();
});
