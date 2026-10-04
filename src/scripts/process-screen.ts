/**
 * «Экран собирается» в блоке «Как работаем» (ProcessScreen.astro).
 * Прокрутка ведёт общий прогресс 0…4: какой этап сейчас читают и какая его доля уже прочитана.
 * Линия чтения — середина экрана на десктопе; на телефоне — чуть ниже прилипшего окна.
 * Окно получает состояние этапа (data-step) и подробности внутри этапа:
 *   01 — галочки брифа по одной;  02 — прорисовка каркаса (--draw) и курсор по сценарию;
 *   03 — три итерации дизайна (data-iter), каждую отмечает вспышка «Демо»;
 *   04 — адрес печатается, затем «Онлайн» (data-live), полоса света (--sweep) и «Поддержка» (data-support).
 * Прогресс сглажен (без рывков от колёсика); при reduced motion этап сразу показывает собранное окно.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

/** Сглаживание прогресса, с */
const SMOOTH = 0.12;
/** Путь курсора по каркасу (сетка 640 × 400): кнопка → карточка → пункт меню */
const CURSOR: { at: number; x: number; y: number }[] = [
  { at: 0, x: 88, y: 219 },
  { at: 0.4, x: 88, y: 219 },
  { at: 0.7, x: 320, y: 318 },
  { at: 0.95, x: 470, y: 36 },
];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

onPage(() => {
  const root = document.querySelector<HTMLElement>('[data-pscreen]');
  const stage = root?.querySelector<HTMLElement>('[data-pscreen-stage]');
  if (!root || !stage) return;
  const steps = [...root.querySelectorAll<HTMLElement>('[data-pscreen-step]')];
  const checks = [...stage.querySelectorAll<HTMLElement>('[data-pscreen-check]')];
  const segs = [...stage.querySelectorAll<HTMLElement>('[data-pscreen-seg]')];
  const url = stage.querySelector<HTMLElement>('[data-pscreen-url]');
  const cursor = stage.querySelector<HTMLElement>('[data-pscreen-cursor]');
  const demo = stage.querySelector<HTMLElement>('[data-pscreen-demo]');
  const body = stage.querySelector<HTMLElement>('.win__body');
  const urlText = url?.dataset.text ?? '';
  const desktop = window.matchMedia('(min-width: 1024px)');
  const reduced = prefersReducedMotion();

  let target = 0;
  let current = 0;
  let iterShown = 0;
  let pulseTimer = 0;

  /** Общий прогресс по прокрутке: номер этапа + доля прочитанного в нём */
  const measure = () => {
    const vh = window.innerHeight;
    let line = vh * 0.5;
    if (!desktop.matches) {
      const r = stage.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(stage).top) || 0;
      stage.classList.toggle('is-stuck', Math.abs(r.top - top) < 1);
      line = r.bottom + (vh - r.bottom) * 0.35;
    } else stage.classList.remove('is-stuck');
    let progress = 0;
    steps.forEach((step, i) => {
      const r = step.getBoundingClientRect();
      if (line >= r.top) progress = i + clamp01((line - r.top) / r.height);
    });
    target = Math.min(steps.length, progress);
  };

  const apply = (g: number) => {
    const index = Math.min(steps.length - 1, Math.floor(g));
    const p = reduced ? 1 : clamp01(g - index);
    const step = index + 1;
    stage.dataset.step = String(step);

    // 01 — галочки брифа по одной
    const checked = step > 1 ? checks.length : Math.min(checks.length, Math.floor(p * (checks.length + 0.6)));
    checks.forEach((check, i) => check.classList.toggle('is-on', i < checked));

    // 02 — каркас прорисовывается, курсор идёт по сценарию
    const draw = step < 2 ? 0 : step === 2 ? clamp01(p / 0.55) : 1;
    stage.style.setProperty('--draw', draw.toFixed(3));
    if (cursor && body && step === 2) {
      let k = 0;
      while (k < CURSOR.length - 2 && p > CURSOR[k + 1]!.at) k++;
      const a = CURSOR[k]!;
      const b = CURSOR[k + 1]!;
      const t = ease(clamp01((p - a.at) / (b.at - a.at)));
      const x = ((a.x + (b.x - a.x) * t) / 640) * body.clientWidth;
      const y = ((a.y + (b.y - a.y) * t) / 400) * body.clientHeight;
      cursor.style.transform = `translate(${(x - 3).toFixed(1)}px, ${(y - 3).toFixed(1)}px)`;
    }

    // 03 — три итерации дизайна, каждую отмечает вспышка «Демо»
    const iter = step < 3 ? 0 : step > 3 ? 3 : p < 0.12 ? 0 : p < 0.42 ? 1 : p < 0.72 ? 2 : 3;
    if (iter) stage.dataset.iter = String(iter);
    else delete stage.dataset.iter;
    if (iter > iterShown && step === 3 && demo && !reduced) {
      demo.classList.remove('is-pulse');
      void demo.offsetWidth;
      demo.classList.add('is-pulse');
      window.clearTimeout(pulseTimer);
      pulseTimer = window.setTimeout(() => demo.classList.remove('is-pulse'), 900);
    }
    iterShown = iter;

    // 04 — адрес печатается, «Онлайн», полоса света, «Поддержка»
    if (url) {
      const chars = step === 4 ? Math.round(clamp01((p - 0.05) / 0.35) * urlText.length) : 0;
      if (url.textContent?.length !== chars) url.textContent = urlText.slice(0, chars);
    }
    if (step === 4 && p >= 0.45) stage.dataset.live = '';
    else delete stage.dataset.live;
    if (step === 4 && p >= 0.8) stage.dataset.support = '';
    else delete stage.dataset.support;
    const sweep = step === 4 ? clamp01((p - 0.45) / 0.4) : 0;
    stage.style.setProperty('--sweep', sweep.toFixed(3));
    // полоса светлеет к середине пробега и гаснет к концу
    stage.style.setProperty('--sweep-a', (0.08 * Math.sin(Math.PI * sweep)).toFixed(3));

    // прогресс под окном и этап в фокусе
    segs.forEach((seg, i) => seg.style.setProperty('--f', clamp01(g - i).toFixed(3)));
    steps.forEach((item, i) => item.classList.toggle('is-active', i === index));
  };

  let raf = 0;
  let last = 0;
  const frame = (now: number) => {
    raf = 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    current += (target - current) * (1 - Math.exp(-dt / SMOOTH));
    if (Math.abs(target - current) < 0.0005) current = target;
    apply(current);
    if (current !== target) raf = requestAnimationFrame(frame);
    else last = 0;
  };
  const kick = () => {
    if (reduced) {
      current = target;
      apply(current);
      return;
    }
    if (!raf) raf = requestAnimationFrame(frame);
  };

  /** Окно на десктопе — по центру экрана, но не выше шапки */
  const place = () => {
    if (!desktop.matches) return;
    const header = parseFloat(getComputedStyle(root).getPropertyValue('--header-h')) || 80;
    const top = Math.max(header + 24, (window.innerHeight - stage.offsetHeight) / 2);
    root.style.setProperty('--stage-top', `${Math.round(top)}px`);
  };

  const ac = new AbortController();
  window.addEventListener(
    'scroll',
    () => {
      measure();
      kick();
    },
    { passive: true, signal: ac.signal },
  );
  const resize = new ResizeObserver(() => {
    place();
    measure();
    current = target;
    apply(current);
  });
  resize.observe(root);
  place();
  measure();
  current = target;
  apply(current);

  return () => {
    ac.abort();
    resize.disconnect();
    cancelAnimationFrame(raf);
    window.clearTimeout(pulseTimer);
  };
});
