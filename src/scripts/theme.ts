/**
 * Дневная и ночная темы (решение владельца). Тема — data-theme на <html>: 'dark' по умолчанию, 'light' — день;
 * выбор хранится в localStorage и ставится до первой отрисовки (инлайн-скрипт в BaseLayout).
 * Холсты (3D-знак, пыль, неон) перекрашиваются по событию 'vantegra:theme'.
 *
 * Переключатель (ThemeToggle.astro): нажать или перетащить ручку — она идёт за пальцем, отпустили —
 * защёлкивается к ближайшей стороне или по направлению броска. Ручка едет сразу.
 * Тап и клик мышью срабатывают по отпусканию (pointerup), не по click: после протяжки пальцем
 * браузер иногда не присылает click, и тап терялся. click остаётся для клавиатуры и экранного диктора.
 * Новая тема выходит из переключателя кругом и плавно накрывает страницу (View Transitions):
 * круг с первого кадра накрывает сам тумблер — ручка видна живой, без двойного снимка.
 * На это время выключены переходы цвета по всей странице (theme.css, .theme-instant) —
 * перекрашивание идёт одним снимком, без перерисовки десятков элементов по кадрам.
 * Astro даёт <html> своё имя снимка (transition:animate), поэтому имя берём из стилей, а не 'root'.
 * При prefers-reduced-motion и без View Transitions — сразу, без анимации.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

export type Theme = 'dark' | 'light';
/** Центр переключателя и радиус круга, который накрывает его целиком */
type Origin = { x: number; y: number; reach: number };

const KEY = 'vantegra-theme';
const META = { dark: '#111111', light: '#F4F2EE' } as const;

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
const toggles = () => document.querySelectorAll<HTMLElement>('[data-theme-toggle]');

/** Тема, к которой едет ручка, пока смена ждёт снимка страницы */
let desired: Theme | null = null;
/** Смена запущена, снимок ещё не сделан: следующее нажатие только меняет выбранную тему */
let queued = false;
/** Номер последнего перехода: класс снимаем только за последним, если их запустили подряд */
let latest = 0;
let instant = 0;

/** Цвет панели браузера; при раскрытии кругом — когда круг дошёл до краёв */
const setMeta = (theme: Theme) => document.querySelector('meta[data-theme-color]')?.setAttribute('content', META[theme]);

function sync(theme: Theme): void {
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
  // цвета меняются разом, без переходов цвета по всей странице; снимаем через кадр, когда новые цвета посчитаны
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

/** Новая тема выходит кругом из переключателя: старый снимок стоит, новый открывается растущим кругом */
function reveal(origin: Origin): void {
  const root = document.documentElement;
  const pseudoElement = `::view-transition-new(${rootGroup()})`;
  const id = ++latest;
  queued = true;
  root.classList.add('theme-switching');
  const change = document.startViewTransition(() => {
    queued = false;
    // пока снимали старый кадр, могли нажать ещё раз — берём последнюю выбранную тему
    const theme = desired ?? currentTheme();
    desired = null;
    apply(theme);
  });
  change.updateCallbackDone
    .catch(() => {})
    .finally(() => {
      queued = false;
    });
  const { x, y, reach } = origin;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  // скорость фронта одна на любом экране: телефон ~0,55 с, большой экран ~0,7 с
  const duration = Math.round(Math.min(760, Math.max(520, 300 + radius * 0.28)));
  change.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(${reach}px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration, easing: 'cubic-bezier(0.5, 0, 0.2, 1)', pseudoElement },
      );
    })
    .catch(() => {});
  change.finished.finally(() => {
    if (id !== latest) return;
    root.classList.remove('theme-switching');
    setMeta(currentTheme());
  });
}

/** Сменить тему; origin — переключатель, из которого выходит круг (без него — сразу) */
export function setTheme(theme: Theme, origin?: Origin): void {
  desired = theme;
  aim(theme);
  // смена уже ждёт снимка — она возьмёт последнюю выбранную тему
  if (queued) return;
  if (theme === currentTheme()) {
    // передумали — ручка просто возвращается
    desired = null;
    settle();
    return;
  }
  if (!origin || prefersReducedMotion() || !('startViewTransition' in document)) {
    desired = null;
    apply(theme);
    setMeta(theme);
    return;
  }
  reveal(origin);
}

onPage(() => {
  desired = null;
  sync(currentTheme());
  setMeta(currentTheme());
  const list = [...toggles()];
  if (!list.length) return;
  const ac = new AbortController();
  const { signal } = ac;
  const shown = (): Theme => desired ?? currentTheme();

  for (const toggle of list) {
    const knob = toggle.querySelector<HTMLElement>('[data-theme-knob]');
    if (!knob) continue;

    const origin = (): Origin => {
      const box = toggle.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2, reach: Math.hypot(box.width, box.height) / 2 + 4 };
    };
    const travel = () => Math.max(1, toggle.clientWidth - knob.offsetWidth - 2 * knob.offsetLeft);

    let pointerId = -1;
    /** Сдвиг, после которого нажатие считается перетаскиванием: палец дрожит сильнее мыши */
    let slop = 4;
    /** Когда нажатие обработано по pointerup: click следом за ним — то же нажатие */
    let handledAt = -Infinity;
    let startX = 0;
    let startPos = 0;
    let pos = 0;
    let moved = false;
    let lastX = 0;
    let lastTime = 0;
    let velocity = 0;

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
        slop = event.pointerType === 'mouse' ? 4 : 8;
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
        if (!moved && Math.abs(dx) > slop) {
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
        const dragged = moved;
        release();
        handledAt = event.timeStamp;
        if (!dragged) {
          // тап или клик: отпустили над тумблером (с запасом под палец) — переключаем
          const box = toggle.getBoundingClientRect();
          const inside =
            event.clientX > box.left - 16 && event.clientX < box.right + 16 && event.clientY > box.top - 16 && event.clientY < box.bottom + 16;
          if (inside) setTheme(shown() === 'light' ? 'dark' : 'light', origin());
          return;
        }
        // бросок решает направление, иначе — ближайшая сторона
        const share = pos / travel();
        const light = velocity > 0.25 ? true : velocity < -0.25 ? false : share > 0.5;
        setTheme(light ? 'light' : 'dark', origin());
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
        if (!queued) settle();
      },
      { signal },
    );

    toggle.addEventListener(
      'click',
      (event) => {
        // палец и мышь уже обработаны по pointerup; сюда доходят клавиатура (detail 0) и экранный диктор
        if (event.detail !== 0 && event.timeStamp - handledAt < 800) {
          event.preventDefault();
          return;
        }
        setTheme(shown() === 'light' ? 'dark' : 'light', origin());
      },
      { signal },
    );
  }

  return () => ac.abort();
});
