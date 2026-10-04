/**
 * Планеты в карточках фактов «О студии» (FactCard.astro). Каждая крутится по своей орбите (круг — 12 с).
 * Навели мышь — планета разгоняется (круг — 2 с), хвост вытягивается в комету, орбита становится ярче;
 * увели — плавно, с инерцией, возвращается к спокойной скорости. Скорость тянется к цели экспоненциально:
 * без рывков, наведение можно прервать в любой момент. Касание пальцем разгона не включает.
 * Только stroke-dashoffset и opacity; рисуем, пока карточки на экране.
 * При prefers-reduced-motion планеты стоят (CSS), без JS орбиты крутятся на CSS без разгона.
 * На телефоне ряд фактов — лента (ribbon.ts): у её копий карточек тот же data-phase, и положение планеты
 * хранится по нему — копия крутится вместе со своей карточкой, на стыке ленты планета не перескакивает.
 * Видимость — по окну ленты: сам ряд в режиме ленты сдвинут за край экрана.
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

/** Движение планеты одной карточки — общее для карточки и её копий в ленте */
interface Orbit {
  /** положение планеты, доля круга */
  pos: number;
  speed: number;
  hot: boolean;
}

interface Card {
  orbit: Orbit;
  track: SVGElement;
  glow: SVGElement;
  streak: SVGElement;
  trail: SVGElement;
  planet: SVGElement;
}

onPage(() => {
  if (prefersReducedMotion()) return;
  const list = document.querySelector<HTMLElement>('[data-facts]');
  if (!list) return;

  const orbits = new Map<string, Orbit>();
  let cards: Card[] = [];
  let count = -1;

  /** Карточки ряда вместе с копиями ленты; пересобираем, когда лента добавила или убрала копии */
  const collect = () => {
    count = list.children.length;
    cards = [];
    for (const el of list.querySelectorAll<HTMLElement>('[data-fact]')) {
      const part = (name: string) => el.querySelector<SVGElement>(`[data-fact-${name}]`);
      const [track, glow, streak, trail, planet] = ['track', 'glow', 'streak', 'trail', 'planet'].map(part);
      if (!track || !glow || !streak || !trail || !planet) continue;
      const key = el.dataset.phase ?? '0';
      let orbit = orbits.get(key);
      if (!orbit) {
        orbit = { pos: Number(key) || 0, speed: CALM, hot: false };
        orbits.set(key, orbit);
      }
      cards.push({ orbit, track, glow, streak, trail, planet });
    }
  };
  collect();
  if (!cards.length) return;

  const ac = new AbortController();
  const { signal } = ac;
  const orbitOf = (target: EventTarget | null) => {
    const card = target instanceof Element ? target.closest<HTMLElement>('[data-fact]') : null;
    return card ? orbits.get(card.dataset.phase ?? '0') : undefined;
  };
  // только мышь: у пальца нет «наведения», тап не должен разгонять планету до следующего касания
  list.addEventListener(
    'pointerover',
    (event) => {
      const orbit = orbitOf(event.target);
      if (orbit && event.pointerType === 'mouse') orbit.hot = true;
    },
    { signal },
  );
  list.addEventListener(
    'pointerout',
    (event) => {
      const from = event.target instanceof Element ? event.target.closest('[data-fact]') : null;
      const to = event.relatedTarget instanceof Element ? event.relatedTarget.closest('[data-fact]') : null;
      const orbit = orbitOf(event.target);
      if (orbit && from !== to) orbit.hot = false;
    },
    { signal },
  );

  const paint = ({ orbit, track, glow, streak, trail, planet }: Card) => {
    const heat = Math.min(1, Math.max(0, (orbit.speed - CALM) / (FAST - CALM)));
    planet.style.strokeDashoffset = `${(-orbit.pos).toFixed(4)}px`;
    trail.style.strokeDashoffset = `${(TRAIL - orbit.pos).toFixed(4)}px`;
    streak.style.strokeDashoffset = `${(STREAK - orbit.pos).toFixed(4)}px`;
    streak.style.opacity = (heat * STREAK_MAX).toFixed(3);
    // тонкая орбита плавно сменяется яркой: вместе не ярче одной яркой
    glow.style.opacity = heat.toFixed(3);
    track.style.opacity = (1 - heat).toFixed(3);
  };

  let raf = 0;
  let last = 0;
  let visible = false;
  const frame = (now: number) => {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (list.children.length !== count) collect();
    for (const orbit of orbits.values()) {
      const target = orbit.hot ? FAST : CALM;
      const tau = target > orbit.speed ? RISE : FALL;
      orbit.speed += (target - orbit.speed) * (1 - Math.exp(-dt / tau));
      orbit.pos = (orbit.pos + orbit.speed * dt) % 1;
    }
    for (const card of cards) paint(card);
    raf = visible ? requestAnimationFrame(frame) : 0;
  };

  const observer = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    if (visible && !raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  });
  observer.observe(list.closest('.ribbon__viewport') ?? list);
  for (const card of cards) paint(card);

  return () => {
    ac.abort();
    observer.disconnect();
    cancelAnimationFrame(raf);
  };
});
