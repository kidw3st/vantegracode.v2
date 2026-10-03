/**
 * Перетекание шапки в капсулу (правка владельца 03.10.2026).
 * Наверху шапка плоская; после прокрутки на 24 px форма «вытекает» из полосы в капсулу.
 * - движение по пружине: быстрый старт, лёгкий перелёт и мягкая посадка; прерывается без рывка;
 * - сначала проявляется подложка и закругляются углы, затем форма стягивается по ширине;
 * - меняется только пустая подложка; логотип, ссылки и кнопка двигаются сдвигом (translate);
 * - закругление капсулы не заходит в охранное поле логотипа (15 % ширины знака).
 * Состояние пружины живёт между переходами: шапка сохраняется (transition:persist).
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

const THRESHOLD = 24;
/** Пружина: ζ ≈ 0,7 — заметный, но тихий перелёт */
const STIFFNESS = 150;
const DAMPING = 18;
/** Доля ширины знака в горизонтальном блоке и охранное поле */
const MARK_SHARE = 962.81 / 2632.63;
const CLEARSPACE = 0.15;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

interface Geometry {
  flat: Box;
  capsule: Box;
  logoShift: number;
  actionsShift: number;
  shiftY: number;
}

interface Elements {
  header: HTMLElement;
  shape: HTMLElement;
  logo: HTMLElement;
  nav: HTMLElement | null;
  actions: HTMLElement;
}

let progress = 0;
let velocity = 0;
let target = 0;
let raf = 0;
let lastTime = 0;
let initialized = false;
let geometry: Geometry | null = null;
let els: Elements | null = null;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

function cssPx(name: string): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
}

/** Видимая кнопка справа: «Обсудить проект» от 1200 px, бургер — ниже */
function rightControl(actions: HTMLElement): HTMLElement {
  const candidates = [...actions.querySelectorAll<HTMLElement>('.header__cta, .header__burger, .header__fallback')];
  return candidates.find((el) => el.offsetWidth > 0) ?? actions;
}

/** Положение в раскладке шапки без учёта анимаций и сдвигов (offset* не видят transform) */
function layoutRect(el: HTMLElement, root: HTMLElement): { left: number; right: number; width: number; height: number } {
  let left = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    left += node.offsetLeft;
    node = node.offsetParent as HTMLElement | null;
  }
  return { left, right: left + el.offsetWidth, width: el.offsetWidth, height: el.offsetHeight };
}

function measure(): void {
  if (!els) return;
  const { header, logo, actions } = els;

  const vw = header.clientWidth;
  const headerH = cssPx('--header-h');
  const barH = cssPx('--bar-h');
  const barTop = cssPx('--bar-top');
  const lockup = logo.querySelector<HTMLElement>('.header__lockup') ?? logo;
  const logoRect = layoutRect(lockup, header);
  const control = layoutRect(rightControl(actions), header);

  // Отступ слева: охранное поле + выступ закругления на уровне верхнего края охранного поля
  const radius = barH / 2;
  const clear = CLEARSPACE * logoRect.width * MARK_SHARE;
  const clearTop = (barH - logoRect.height) / 2 - clear;
  const dy = Math.max(0, radius - clearTop);
  const bulge = dy > 0 ? radius - Math.sqrt(Math.max(0, radius * radius - dy * dy)) : 0;
  const padLeft = clear + bulge + 1;

  // Капсула симметрична; логотип остаётся на месте, если хватает места до края
  const left = Math.max(barTop, logoRect.left - padLeft);
  const right = vw - left;
  const controlInset = (barH - control.height) / 2;

  geometry = {
    flat: { x: 0, y: 0, w: vw, h: headerH, r: 0 },
    capsule: { x: left, y: barTop, w: right - left, h: barH, r: radius },
    logoShift: left + padLeft - logoRect.left,
    actionsShift: right - controlInset - control.right,
    shiftY: barTop + barH / 2 - headerH / 2,
  };
  render();
}

function render(): void {
  if (!els || !geometry) return;
  const { flat, capsule } = geometry;
  const t = progress;
  const tc = clamp01(t);
  // углы закругляются раньше, чем форма стягивается; подложка проявляется в начале
  const tr = clamp01(t * 1.6);
  const to = clamp01(t * 2.5);

  const { shape, logo, nav, actions } = els;
  shape.style.transform = `translate3d(${lerp(flat.x, capsule.x, t).toFixed(2)}px, ${lerp(flat.y, capsule.y, tc).toFixed(2)}px, 0)`;
  shape.style.width = `${lerp(flat.w, capsule.w, t).toFixed(2)}px`;
  shape.style.height = `${lerp(flat.h, capsule.h, tc).toFixed(2)}px`;
  shape.style.borderRadius = `${lerp(flat.r, capsule.r, tr).toFixed(2)}px`;
  shape.style.opacity = to.toFixed(3);

  const y = (geometry.shiftY * tc).toFixed(2);
  logo.style.translate = `${(geometry.logoShift * t).toFixed(2)}px ${y}px`;
  if (nav) nav.style.translate = `0 ${y}px`;
  actions.style.translate = `${(geometry.actionsShift * t).toFixed(2)}px ${y}px`;
}

function step(now: number): void {
  const dt = Math.min(0.032, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;
  const acceleration = STIFFNESS * (target - progress) - DAMPING * velocity;
  velocity += acceleration * dt;
  progress += velocity * dt;
  if (Math.abs(target - progress) < 0.0005 && Math.abs(velocity) < 0.0005) {
    progress = target;
    velocity = 0;
    raf = 0;
    render();
    return;
  }
  render();
  raf = requestAnimationFrame(step);
}

function setTarget(next: number, animate = true): void {
  els?.header.classList.toggle('is-scrolled', next === 1);
  if (next === target && (raf || progress === next)) return;
  target = next;
  if (!animate || prefersReducedMotion()) {
    cancelAnimationFrame(raf);
    raf = 0;
    progress = next;
    velocity = 0;
    render();
    return;
  }
  if (!raf) {
    lastTime = performance.now();
    raf = requestAnimationFrame(step);
  }
}

onPage(() => {
  const header = document.querySelector<HTMLElement>('[data-header]');
  const shape = header?.querySelector<HTMLElement>('[data-header-shape]');
  const logo = header?.querySelector<HTMLElement>('[data-header-logo]');
  const actions = header?.querySelector<HTMLElement>('.header__actions');
  if (!header || !shape || !logo || !actions) return;

  els = { header, shape, logo, nav: header.querySelector<HTMLElement>('.header__nav'), actions };
  const ac = new AbortController();
  const root = document.documentElement;

  const wanted = () => (!root.classList.contains('menu-open') && window.scrollY > THRESHOLD ? 1 : 0);

  measure();
  if (!initialized) {
    // первая загрузка: если страница открылась прокрученной — сразу капсула, без анимации
    initialized = true;
    setTarget(wanted(), false);
  } else {
    setTarget(wanted());
  }

  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        setTarget(wanted());
      });
    },
    { passive: true, signal: ac.signal },
  );

  const resize = new ResizeObserver(() => measure());
  resize.observe(header);
  document.fonts?.ready.then(() => measure());

  // меню открыли или закрыли — шапка становится плоской и обратно
  const classes = new MutationObserver(() => setTarget(wanted()));
  classes.observe(root, { attributes: true, attributeFilter: ['class'] });

  return () => {
    ac.abort();
    resize.disconnect();
    classes.disconnect();
  };
});
