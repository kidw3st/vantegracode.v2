/**
 * «Экран собирается» в блоке «Процесс работы» (ProcessScreen.astro, сайт в окне — ProcessSite.astro).
 * Прокрутка ведёт общий прогресс 0…4: какой этап сейчас читают и какая его доля уже прочитана.
 * Линия чтения — середина экрана на десктопе; на телефоне — чуть ниже прилипшего окна.
 * Окно получает состояние этапа (data-step) и подробности внутри этапа:
 *   01 — галочки брифа по одной;  02 — прорисовка каркаса (--draw) и курсор по сценарию;
 *   03 — три итерации дизайна (data-iter), каждую отмечает вспышка «Демо»: на первой курсор тянет
 *        кегль заголовка за угол рамки (--fit), на второй гравюра проходит доску (--ink);
 *   04 — адрес печатается, «Онлайн» (data-live), готовый сайт листается (--scroll), «Поддержка» (data-support).
 * Прогресс сглажен (без рывков от колёсика); при reduced motion этап сразу показывает собранное окно.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';
import { CURSOR, SITE, TITLE } from '../lib/process-site.ts';

/** Сглаживание прогресса, с */
const SMOOTH = 0.12;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Ручка рамки заголовка (правый нижний угол) при масштабе s — в пикселях макета */
const handle = (s: number) => ({ x: TITLE.x + s * (TITLE.w + TITLE.pad), y: TITLE.y + s * (TITLE.h + TITLE.pad) });

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
  const spec = stage.querySelector<HTMLElement>('[data-site-spec]');
  const body = stage.querySelector<HTMLElement>('.win__body');
  const urlText = url?.dataset.text ?? '';
  // окно рядом с этапами: десктоп и широкий низкий экран — то же условие, что в ProcessScreen.astro
  const desktop = window.matchMedia('(min-width: 1024px), (min-width: 640px) and (max-height: 600px) and (orientation: landscape)');
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

    // 03 — три итерации дизайна, каждую отмечает вспышка «Демо»:
    // 1 — типографика (кегль заголовка тянут за угол), 2 — гравюра, 3 — детали
    const iter = step < 3 ? 0 : step > 3 ? 3 : p < 0.1 ? 0 : p < 0.42 ? 1 : p < 0.74 ? 2 : 3;
    if (iter) stage.dataset.iter = String(iter);
    else delete stage.dataset.iter;
    const fit = step < 3 ? 0 : step > 3 ? 1 : ease(clamp01((p - 0.12) / 0.26));
    const scale = mix(TITLE.from, 1, fit);
    stage.style.setProperty('--fit', fit.toFixed(3));
    stage.style.setProperty('--ink', (step < 3 ? 0 : step > 3 ? 1 : clamp01((p - 0.42) / 0.3)).toFixed(3));
    if (spec) {
      const label = `${spec.dataset.font} · ${Math.round(TITLE.size * scale)}`;
      if (spec.textContent !== label) spec.textContent = label;
    }

    // курсор — в пикселях макета: на прототипе по сценарию, на дизайне — к углу рамки заголовка и тянет его
    if (cursor && body && (step === 2 || step === 3)) {
      let x: number;
      let y: number;
      if (step === 2) {
        let k = 0;
        while (k < CURSOR.length - 2 && p > CURSOR[k + 1]!.at) k++;
        const a = CURSOR[k]!;
        const b = CURSOR[k + 1]!;
        const t = ease(clamp01((p - a.at) / (b.at - a.at)));
        x = mix(a.x, b.x, t);
        y = mix(a.y, b.y, t);
      } else {
        const from = CURSOR[CURSOR.length - 1]!;
        const grip = handle(TITLE.from);
        const t = ease(clamp01(p / 0.12));
        const end = handle(scale);
        x = p < 0.12 ? mix(from.x, grip.x, t) : end.x;
        y = p < 0.12 ? mix(from.y, grip.y, t) : end.y;
      }
      const px = (x / SITE.w) * body.clientWidth;
      const py = (y / SITE.h) * body.clientHeight;
      cursor.style.transform = `translate(${(px - 3).toFixed(1)}px, ${(py - 3).toFixed(1)}px)`;
    }
    if (iter > iterShown && step === 3 && demo && !reduced) {
      demo.classList.remove('is-pulse');
      void demo.offsetWidth;
      demo.classList.add('is-pulse');
      window.clearTimeout(pulseTimer);
      pulseTimer = window.setTimeout(() => demo.classList.remove('is-pulse'), 900);
    }
    iterShown = iter;

    // 04 — адрес печатается, «Онлайн», готовый сайт листается до коллекции и подвала, «Поддержка»
    if (url) {
      const chars = step === 4 ? Math.round(clamp01((p - 0.02) / 0.3) * urlText.length) : 0;
      if (url.textContent?.length !== chars) url.textContent = urlText.slice(0, chars);
    }
    if (step === 4 && p >= 0.36) stage.dataset.live = '';
    else delete stage.dataset.live;
    if (step === 4 && p >= 0.86) stage.dataset.support = '';
    else delete stage.dataset.support;
    stage.style.setProperty('--scroll', (step === 4 ? ease(clamp01((p - 0.42) / 0.4)) : 0).toFixed(4));

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
