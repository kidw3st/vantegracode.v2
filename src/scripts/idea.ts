/**
 * Блок «Идея», схема «Орбита»: спутники-технологии медленно идут по эхо-орбите вокруг ядра.
 * Положение — параметрический эллипс −12°, ry / rx = 0,306 (как у эхо-орбит), оборот за 48 с.
 * Двигаем только transform и opacity: дальняя сторона орбиты бледнее и мельче.
 * Вне экрана — пауза, при prefers-reduced-motion спутники стоят на исходных местах.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

const PERIOD = 48; // секунд на оборот
const RATIO = 0.306;
const TILT = (-12 * Math.PI) / 180;

onPage(() => {
  if (prefersReducedMotion()) return;
  const figures = [...document.querySelectorAll<HTMLElement>('[data-idea-orbit]')];
  if (!figures.length) return;

  const cleanups: (() => void)[] = [];

  for (const figure of figures) {
    const cx = Number(figure.dataset.cx);
    const cy = Number(figure.dataset.cy);
    const a = Number(figure.dataset.a);
    const width = Number(figure.dataset.w);
    const sats = [...figure.querySelectorAll<HTMLElement>('[data-sat]')].map((el) => ({
      el,
      start: (Number(el.dataset.start) * Math.PI) / 180,
    }));

    const point = (angle: number) => {
      const x = a * Math.cos(angle);
      const y = a * RATIO * Math.sin(angle);
      return [cx + x * Math.cos(TILT) - y * Math.sin(TILT), cy + x * Math.sin(TILT) + y * Math.cos(TILT)] as const;
    };

    let scale = figure.clientWidth / width;
    let elapsed = 0;
    let last = 0;
    let raf = 0;

    const place = () => {
      const turn = (elapsed / PERIOD) * Math.PI * 2;
      for (const sat of sats) {
        const [x0, y0] = point(sat.start);
        const angle = sat.start + turn;
        const [x, y] = point(angle);
        // ближняя сторона орбиты — снизу (sin > 0): ярче и крупнее
        const near = 0.5 + 0.5 * Math.sin(angle);
        sat.el.style.transform = `translate(${((x - x0) * scale - 4).toFixed(2)}px, calc(-50% + ${((y - y0) * scale).toFixed(2)}px)) scale(${(0.86 + 0.14 * near).toFixed(3)})`;
        sat.el.style.setProperty('--depth', (0.45 + 0.55 * near).toFixed(3));
      }
    };

    const frame = (now: number) => {
      elapsed += last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      place();
      raf = requestAnimationFrame(frame);
    };

    const resize = new ResizeObserver(() => {
      scale = figure.clientWidth / width;
      place();
    });
    resize.observe(figure);

    const visibility = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        if (!raf) {
          last = 0;
          raf = requestAnimationFrame(frame);
        }
      } else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    visibility.observe(figure);

    cleanups.push(() => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      visibility.disconnect();
    });
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
});
