/**
 * Дневная и ночная темы (решение владельца). Тема — data-theme на <html>: 'dark' по умолчанию, 'light' — день;
 * выбор хранится в localStorage и ставится до первой отрисовки (инлайн-скрипт в BaseLayout).
 * Смена темы раскрывается кругом от переключателя (View Transitions); холсты (3D-знак, пыль, неон)
 * перекрашиваются по событию 'vantegra:theme'. При prefers-reduced-motion — сразу, без анимации.
 *
 * Переключатель (ThemeToggle.astro) можно нажать или перетащить ручку: тянется за пальцем,
 * при отпускании защёлкивается к ближайшей стороне или по направлению броска.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

export type Theme = 'dark' | 'light';

const KEY = 'vantegra-theme';
const META = { dark: '#111111', light: '#F4F2EE' } as const;

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

function sync(theme: Theme): void {
  document.querySelector('meta[data-theme-color]')?.setAttribute('content', META[theme]);
  for (const toggle of document.querySelectorAll('[data-theme-toggle]')) {
    toggle.setAttribute('aria-checked', String(theme === 'light'));
  }
}

/** Сменить тему; origin — точка, от которой раскрывается новая тема (центр переключателя) */
export function setTheme(theme: Theme, origin?: { x: number; y: number }): void {
  if (theme === currentTheme()) return;
  const root = document.documentElement;
  const apply = () => {
    root.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* приватный режим: тема живёт до перезагрузки */
    }
    sync(theme);
    window.dispatchEvent(new CustomEvent<Theme>('vantegra:theme', { detail: theme }));
  };

  if (!origin || prefersReducedMotion() || !('startViewTransition' in document)) {
    apply();
    return;
  }
  root.classList.add('theme-switching');
  const transition = document.startViewTransition(apply);
  const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y));
  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`] },
        { duration: 700, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => {});
  transition.finished.finally(() => root.classList.remove('theme-switching'));
}

onPage(() => {
  sync(currentTheme());
  const toggles = [...document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')];
  if (!toggles.length) return;
  const ac = new AbortController();
  const { signal } = ac;

  for (const toggle of toggles) {
    const knob = toggle.querySelector<HTMLElement>('[data-theme-knob]');
    if (!knob) continue;

    const centre = () => {
      const box = toggle.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    };
    const travel = () => Math.max(1, toggle.clientWidth - knob.offsetWidth - 2 * knob.offsetLeft);

    let pointerId = -1;
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
      toggle.style.removeProperty('--x');
      toggle.style.removeProperty('--p');
      pointerId = -1;
    };

    toggle.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button !== 0) return;
        pointerId = event.pointerId;
        startX = lastX = event.clientX;
        lastTime = event.timeStamp;
        startPos = pos = currentTheme() === 'light' ? travel() : 0;
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

    const finish = (event: PointerEvent) => {
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
      setTheme(light ? 'light' : 'dark', centre());
    };
    toggle.addEventListener('pointerup', finish, { signal });
    toggle.addEventListener('pointercancel', finish, { signal });

    toggle.addEventListener(
      'click',
      (event) => {
        if (suppressClick) {
          suppressClick = false;
          event.preventDefault();
          return;
        }
        setTheme(currentTheme() === 'light' ? 'dark' : 'light', centre());
      },
      { signal },
    );
  }

  return () => ac.abort();
});
