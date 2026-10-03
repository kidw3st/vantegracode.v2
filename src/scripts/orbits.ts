/**
 * Эхо-орбиты в покое: покачивание — CSS, здесь только пауза вне экрана
 * и параллакс от курсора до 8 px (только pointer: fine), сглаживание через rAF.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

const MAX_SHIFT = 8;
const EASE = 0.08;

interface Layer {
  el: HTMLElement | SVGElement;
  field: HTMLElement;
  depth: number;
  x: number;
  y: number;
}

onPage(() => {
  const fields = [...document.querySelectorAll<HTMLElement>('[data-orbits]')];
  if (!fields.length) return;

  const ac = new AbortController();
  let raf = 0;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) entry.target.classList.toggle('is-paused', !entry.isIntersecting);
    },
    { rootMargin: '10% 0px' },
  );
  for (const field of fields) observer.observe(field);

  const fine = window.matchMedia('(pointer: fine)').matches;
  if (fine && !prefersReducedMotion()) {
    const layers: Layer[] = fields
      .filter((field) => field.hasAttribute('data-parallax'))
      .flatMap((field) =>
        [...field.querySelectorAll<SVGElement>('.orbit')].map((el) => ({
          el,
          field,
          depth: Number.parseFloat(getComputedStyle(el).getPropertyValue('--depth')) || 1,
          x: 0,
          y: 0,
        })),
      );

    if (layers.length) {
      let targetX = 0;
      let targetY = 0;

      const tick = () => {
        let moving = false;
        for (const layer of layers) {
          if (layer.field.classList.contains('is-paused')) continue;
          const goalX = targetX * MAX_SHIFT * layer.depth;
          const goalY = targetY * MAX_SHIFT * layer.depth;
          layer.x += (goalX - layer.x) * EASE;
          layer.y += (goalY - layer.y) * EASE;
          if (Math.abs(goalX - layer.x) > 0.05 || Math.abs(goalY - layer.y) > 0.05) moving = true;
          layer.el.style.translate = `${layer.x.toFixed(2)}px ${layer.y.toFixed(2)}px`;
        }
        raf = moving ? requestAnimationFrame(tick) : 0;
      };

      window.addEventListener(
        'pointermove',
        (event) => {
          targetX = (event.clientX / window.innerWidth) * 2 - 1;
          targetY = (event.clientY / window.innerHeight) * 2 - 1;
          if (!raf) raf = requestAnimationFrame(tick);
        },
        { passive: true, signal: ac.signal },
      );
    }
  }

  return () => {
    ac.abort();
    observer.disconnect();
    cancelAnimationFrame(raf);
  };
});
