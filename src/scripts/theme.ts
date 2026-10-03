/**
 * Дневная и ночная темы (решение владельца). Тема — data-theme на <html>: 'dark' по умолчанию, 'light' — день;
 * выбор хранится в localStorage и ставится до первой отрисовки (инлайн-скрипт в BaseLayout).
 * Холсты (3D-знак, пыль, неон) перекрашиваются по событию 'vantegra:theme'.
 *
 * Переключатель (ThemeToggle.astro): нажать или перетащить ручку — она идёт за пальцем, отпустили —
 * защёлкивается к ближайшей стороне или по направлению броска. Ручка едет сразу, не дожидаясь страницы.
 * Страница меняет тему через View Transitions:
 * - мышь и клавиатура — новая тема раскрывается кругом от переключателя; круг с первого кадра
 *   накрывает сам тумблер, поэтому ручка видна живой, а не застывшим снимком;
 * - касание — ручка доезжает, затем страница плавно проявляется (только прозрачность: анимацию
 *   clip-path телефоны считают без видеоускорения, и она дёргается).
 * Astro даёт <html> своё имя снимка (transition:animate), поэтому имя берём из стилей, а не 'root'.
 * При prefers-reduced-motion и без View Transitions — сразу, без анимации.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

export type Theme = 'dark' | 'light';
/** Центр переключателя и радиус круга, который накрывает его целиком */
type Origin = { x: number; y: number; reach: number };

const KEY = 'vantegra-theme';
const META = { dark: '#111111', light: '#F4F2EE' } as const;
/** Касание: страница начинает меняться, когда ручка доехала, мс */
const TOUCH_LEAD = 180;
const REVEAL_MS = 640;
const FADE_MS = 320;

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
const isTouch = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches;
const toggles = () => document.querySelectorAll<HTMLElement>('[data-theme-toggle]');

/** Тема, к которой уже едет ручка, пока страница ещё не сменилась */
let pending: Theme | null = null;
let timer = 0;
/** Номер последнего перехода: класс снимаем только за последним, если их запустили подряд */
let latest = 0;
let instant = 0;

function sync(theme: Theme): void {
  document.querySelector('meta[data-theme-color]')?.setAttribute('content', META[theme]);
  for (const toggle of toggles()) toggle.setAttribute('aria-checked', String(theme === 'light'));
}

/** Ручка — к стороне темы сразу; те же значения потом даёт CSS темы, движение не прерывается */
function aim(theme: Theme): void {
  for (const toggle of toggles()) {
    toggle.style.setProperty('--x', theme === 'light' ? 'var(--travel)' : '0px');
    toggle.style.setProperty('--p', theme === 'light' ? '1' : '0');
    toggle.setAttribute('aria-checked', String(theme === 'light'));
  }
}

function settle(): void {
  for (const toggle of toggles()) {
    if (toggle.classList.contains('is-dragging')) continue;
    toggle.style.removeProperty('--x');
    toggle.style.removeProperty('--p');
  }
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  // цвета меняются разом, без переходов цвета по всей странице (theme.css, .theme-instant);
  // снимаем через кадр, когда новые цвета уже посчитаны
  const mark = ++instant;
  root.classList.add('theme-instant');
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (mark === instant) root.classList.remove('theme-instant');
    }),
  );
  root.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* приватный режим: тема живёт до перезагрузки */
  }
  sync(theme);
  settle();
  window.dispatchEvent(new CustomEvent<Theme>('vantegra:theme', { detail: theme }));
}

/** Имя снимка страницы: Astro даёт <html> своё (transition:animate), без него — 'root' */
function rootGroup(): string {
  const name = getComputedStyle(document.documentElement).viewTransitionName;
  return name && name !== 'none' ? name : 'root';
}

/** Смена страницы через View Transitions: старый снимок стоит, новый проявляется кругом или прозрачностью */
function transition(theme: Theme, origin: Origin, soft: boolean): void {
  const root = document.documentElement;
  const pseudoElement = `::view-transition-new(${rootGroup()})`;
  const id = ++latest;
  root.classList.add('theme-switching');
  const change = document.startViewTransition(() => apply(theme));
  change.ready
    .then(() => {
      if (soft) {
        root.animate({ opacity: [0, 1] }, { duration: FADE_MS, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)', pseudoElement });
        return;
      }
      const { x, y, reach } = origin;
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      root.animate(
        { clipPath: [`circle(${reach}px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: REVEAL_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement },
      );
    })
    .catch(() => {});
  change.finished.finally(() => {
    if (id === latest) root.classList.remove('theme-switching');
  });
}

/**
 * Сменить тему. origin — переключатель, от которого идёт анимация (без него — сразу);
 * soft — касание: ручка доезжает, потом страница проявляется прозрачностью.
 */
export function setTheme(theme: Theme, origin?: Origin, soft = isTouch()): void {
  window.clearTimeout(timer);
  aim(theme);
  if (theme === currentTheme()) {
    // передумали, пока страница не сменилась, — ручка просто возвращается
    pending = null;
    settle();
    return;
  }
  pending = theme;
  const reduced = prefersReducedMotion();
  const run = () => {
    pending = null;
    if (!origin || reduced || !('startViewTransition' in document)) apply(theme);
    else transition(theme, origin, soft);
  };
  if (origin && soft && !reduced) timer = window.setTimeout(run, TOUCH_LEAD);
  else run();
}

onPage(() => {
  pending = null;
  sync(currentTheme());
  const list = [...toggles()];
  if (!list.length) return;
  const ac = new AbortController();
  const { signal } = ac;
  const shown = (): Theme => pending ?? currentTheme();

  for (const toggle of list) {
    const knob = toggle.querySelector<HTMLElement>('[data-theme-knob]');
    if (!knob) continue;

    const origin = (): Origin => {
      const box = toggle.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2, reach: Math.hypot(box.width, box.height) / 2 + 4 };
    };
    const travel = () => Math.max(1, toggle.clientWidth - knob.offsetWidth - 2 * knob.offsetLeft);

    let pointerId = -1;
    let pointerType = '';
    let startX = 0;
    let startPos = 0;
    let pos = 0;
    let moved = false;
    let lastX = 0;
    let lastTime = 0;
    let velocity = 0;
    let suppressClick = false;

    const release = () => {
      toggle.classList.remove('is-pressed', 'is-dragging');
      pointerId = -1;
    };

    toggle.addEventListener(
      'pointerdown',
      (event) => {
        // второй палец во время перетаскивания не перехватывает ручку
        if (event.button !== 0 || pointerId !== -1) return;
        pointerId = event.pointerId;
        pointerType = event.pointerType;
        // после перетаскивания пальцем браузер не присылает click — сброс здесь, иначе следующий тап потеряется
        suppressClick = false;
        startX = lastX = event.clientX;
        lastTime = event.timeStamp;
        startPos = pos = shown() === 'light' ? travel() : 0;
        moved = false;
        velocity = 0;
        toggle.classList.add('is-pressed');
        toggle.setPointerCapture(pointerId);
      },
      { signal },
    );

    toggle.addEventListener(
      'pointermove',
      (event) => {
        if (event.pointerId !== pointerId) return;
        const dx = event.clientX - startX;
        if (!moved && Math.abs(dx) > 4) {
          moved = true;
          toggle.classList.add('is-dragging');
        }
        if (!moved) return;
        const limit = travel();
        pos = Math.min(limit, Math.max(0, startPos + dx));
        const dt = Math.max(1, event.timeStamp - lastTime);
        velocity = (event.clientX - lastX) / dt;
        lastX = event.clientX;
        lastTime = event.timeStamp;
        toggle.style.setProperty('--x', `${pos.toFixed(1)}px`);
        toggle.style.setProperty('--p', (pos / limit).toFixed(3));
      },
      { signal },
    );

    toggle.addEventListener(
      'pointerup',
      (event) => {
        if (event.pointerId !== pointerId) return;
        if (!moved) {
          release();
          return;
        }
        suppressClick = true;
        // бросок решает направление, иначе — ближайшая сторона
        const share = pos / travel();
        const light = velocity > 0.25 ? true : velocity < -0.25 ? false : share > 0.5;
        release();
        setTheme(light ? 'light' : 'dark', origin(), pointerType !== 'mouse');
      },
      { signal },
    );

    // браузер забрал жест (вертикальная прокрутка) — ручка возвращается, тема не меняется
    toggle.addEventListener(
      'pointercancel',
      (event) => {
        if (event.pointerId !== pointerId) return;
        release();
        aim(shown());
        if (!pending) settle();
      },
      { signal },
    );

    toggle.addEventListener(
      'click',
      (event) => {
        if (suppressClick) {
          suppressClick = false;
          event.preventDefault();
          return;
        }
        // с клавиатуры (detail 0) — по типу устройства, иначе — по пальцу или мыши, которыми нажали
        const soft = event.detail === 0 || !pointerType ? isTouch() : pointerType !== 'mouse';
        pointerType = '';
        setTheme(shown() === 'light' ? 'dark' : 'light', origin(), soft);
      },
      { signal },
    );
  }

  return () => {
    ac.abort();
    // уходим со страницы, пока ручка ехала, — тема применяется сразу, переход Astro её перенесёт
    window.clearTimeout(timer);
    if (pending) {
      const theme = pending;
      pending = null;
      apply(theme);
    }
  };
});
