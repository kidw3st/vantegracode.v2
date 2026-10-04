/**
 * Планеты в карточках фактов «О студии» (FactCard.astro). Каждая крутится по своей орбите (круг — 12 с).
 * Навели мышь — планета разгоняется (круг — 2 с), хвост вытягивается в комету, орбита становится ярче;
 * увели — плавно, с инерцией, возвращается к спокойной скорости. Скорость тянется к цели экспоненциально:
 * без рывков, наведение можно прервать в любой момент. Касание пальцем разгона не включает.
 * Только stroke-dashoffset и opacity; рисуем, пока карточки на экране.
 * При prefers-reduced-motion планеты стоят (CSS), без JS орбиты крутятся на CSS без разгона.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

/** Скорость, кругов в секунду: спокойно и на разгоне */
const CALM = 1 / 12;
const FAST = 1 / 2;
/** Постоянная времени, с: разгон быстрый, торможение — долгое, с инерцией */
const RISE = 0.35;
const FALL = 1.1;
/** Длина хвоста и «кометы» на разгоне, доли орбиты (как stroke-dasharray в FactCard.astro) */
const TRAIL = 0.14;
const STREAK = 0.34;
/** Предел яркости кометы: вместе с хвостом не ярче орбит бренда в разы */
const STREAK_MAX = 0.7;

interface Orbit {
  card: HTMLElement;
  track: SVGElement;
  glow: SVGElement;
  streak: SVGElement;
  trail: SVGElement;
  planet: SVGElement;
  /** положение планеты, доля круга */
  pos: number;
  speed: number;
  hot: boolean;
}

onPage(() => {
  if (prefersReducedMotion()) return;
  const list = document.querySelector<HTMLElement>('[data-facts]');
  if (!list) return;

  const orbits: Orbit[] = [];
  for (const card of list.querySelectorAll<HTMLElement>('[data-fact]')) {
    const part = (name: string) => card.querySelector<SVGElement>(`[data-fact-${name}]`);
    const [track, glow, streak, trail, planet] = ['track', 'glow', 'streak', 'trail', 'planet'].map(part);
    if (!track || !glow || !streak || !trail || !planet) continue;
    orbits.push({ card, track, glow, streak, trail, planet, pos: Number(card.dataset.phase) || 0, speed: CALM, hot: false });
  }
  if (!orbits.length) return;

  const ac = new AbortController();
  const { signal } = ac;
  for (const orbit of orbits) {
    // только мышь: у пальца нет «наведения», тап не должен разгонять планету до следующего касания
    orbit.card.addEventListener(
      'pointerenter',
      (event) => {
        if (event.pointerType === 'mouse') orbit.hot = true;
      },
      { signal },
    );
    orbit.card.addEventListener(
      'pointerleave',
      () => {
        orbit.hot = false;
      },
      { signal },
    );
  }

  const paint = (orbit: Orbit) => {
    const heat = Math.min(1, Math.max(0, (orbit.speed - CALM) / (FAST - CALM)));
    orbit.planet.style.strokeDashoffset = `${(-orbit.pos).toFixed(4)}px`;
    orbit.trail.style.strokeDashoffset = `${(TRAIL - orbit.pos).toFixed(4)}px`;
    orbit.streak.style.strokeDashoffset = `${(STREAK - orbit.pos).toFixed(4)}px`;
    orbit.streak.style.opacity = (heat * STREAK_MAX).toFixed(3);
    // тонкая орбита плавно сменяется яркой: вместе не ярче одной яркой
    orbit.glow.style.opacity = heat.toFixed(3);
    orbit.track.style.opacity = (1 - heat).toFixed(3);
  };

  let raf = 0;
  let last = 0;
  let visible = false;
  const frame = (now: number) => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    for (const orbit of orbits) {
      const target = orbit.hot ? FAST : CALM;
      const tau = target > orbit.speed ? RISE : FALL;
      orbit.speed += (target - orbit.speed) * (1 - Math.exp(-dt / tau));
      orbit.pos = (orbit.pos + orbit.speed * dt) % 1;
      paint(orbit);
    }
    raf = visible ? requestAnimationFrame(frame) : 0;
  };

  const observer = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    if (visible && !raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  });
  observer.observe(list);
  for (const orbit of orbits) paint(orbit);

  return () => {
    ac.abort();
    observer.disconnect();
    cancelAnimationFrame(raf);
  };
});
