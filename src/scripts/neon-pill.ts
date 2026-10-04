/**
 * Неон по контуру кнопки-капсулы (Button neon, решение владельца: «как на линии под VANTEGRA», neon.ts).
 * Два импульса обегают капсулу по линии рамки: в покое медленно, при наведении и фокусе — быстрее и ярче
 * (как планеты в фактах «О студии»). Импульс — сердцевина и ореолы вдоль контура, к концам гаснет;
 * ночью свет складывается, днём — тёмный штрих без широкого ореола (тёмное свечение на светлом — тень).
 * Canvas шире кнопки на запас под свечение (--neon-bleed в Button.astro), плотность — пиксели экрана.
 * Рисуем, только пока кнопка на экране; при prefers-reduced-motion неона нет.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

const CHALK = '244, 242, 238'; // те же тона, что у неона под VANTEGRA
const SOOT = '17, 17, 17';
const LENGTH = 0.22; // длина импульса — доля контура
const CALM = 1 / 7; // кругов в секунду в покое
const FAST = 1 / 2.2; // при наведении
const RISE = 0.35; // разгон, с
const FALL = 1.1; // торможение, с
const BANDS = 5; // ступени угасания к концам импульса
const isLight = () => document.documentElement.dataset.theme === 'light';

/** Слои импульса: ширина линии и яркость в центре; ночью — с широким ореолом, днём — без */
const NIGHT = [
  { width: 18, alpha: 0.06 },
  { width: 8, alpha: 0.16 },
  { width: 3.2, alpha: 0.38 },
  { width: 1.2, alpha: 0.95 },
];
const DAY = [
  { width: 5, alpha: 0.07 },
  { width: 2.4, alpha: 0.3 },
  { width: 1.3, alpha: 0.9 },
];

interface Pill {
  x: number;
  y: number;
  r: number;
  straight: number;
  total: number;
}

/** Точка контура капсулы на расстоянии s от начала верхней прямой, по часовой */
function at(pill: Pill, s: number): [number, number] {
  const { x, y, r, straight, total } = pill;
  let d = ((s % total) + total) % total;
  const arc = Math.PI * r;
  if (d < straight) return [x + r + d, y];
  d -= straight;
  if (d < arc) {
    const a = -Math.PI / 2 + d / r;
    return [x + r + straight + r * Math.cos(a), y + r + r * Math.sin(a)];
  }
  d -= arc;
  if (d < straight) return [x + r + straight - d, y + 2 * r];
  d -= straight;
  const a = Math.PI / 2 + d / r;
  return [x + r + r * Math.cos(a), y + r + r * Math.sin(a)];
}

/** Отрезок контура длиной length с центром в center — ломаная с шагом ~2 px */
function trace(ctx: CanvasRenderingContext2D, pill: Pill, center: number, length: number) {
  const steps = Math.max(8, Math.ceil(length / 2));
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const [px, py] = at(pill, center - length / 2 + (length * i) / steps);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function pulse(ctx: CanvasRenderingContext2D, pill: Pill, center: number, power: number, light: boolean) {
  const tone = light ? SOOT : CHALK;
  const length = pill.total * LENGTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const layer of light ? DAY : NIGHT) {
    ctx.lineWidth = layer.width;
    // вложенные отрезки короче к центру: свет складывается и к концам гаснет ступенями
    for (let band = 0; band < BANDS; band++) {
      ctx.strokeStyle = `rgba(${tone}, ${((layer.alpha * power) / BANDS).toFixed(4)})`;
      trace(ctx, pill, center, length * (1 - band / BANDS));
    }
  }
  // горячая точка в центре импульса
  const [hx, hy] = at(pill, center);
  const hot = ctx.createRadialGradient(hx, hy, 0, hx, hy, light ? 4 : 7);
  hot.addColorStop(0, `rgba(${tone}, ${(0.85 * power).toFixed(3)})`);
  hot.addColorStop(1, `rgba(${tone}, 0)`);
  ctx.fillStyle = hot;
  ctx.beginPath();
  ctx.arc(hx, hy, light ? 4 : 7, 0, Math.PI * 2);
  ctx.fill();
}

onPage(() => {
  if (prefersReducedMotion()) return;
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>('[data-neon-pill]')];
  if (!canvases.length) return;
  const cleanups: (() => void)[] = [];

  for (const canvas of canvases) {
    const ctx = canvas.getContext('2d');
    const button = canvas.closest<HTMLElement>('.btn');
    if (!ctx || !button) continue;

    let width = 1;
    let height = 1;
    let ratio = 1;
    let pill: Pill = { x: 0, y: 0, r: 1, straight: 0, total: 1 };
    const resize = () => {
      ratio = Math.min(2, window.devicePixelRatio || 1);
      const box = canvas.getBoundingClientRect();
      const btn = button.getBoundingClientRect();
      width = Math.max(1, box.width);
      height = Math.max(1, box.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      // контур — по середине волоса рамки
      const r = (btn.height - 1) / 2;
      const straight = Math.max(0, btn.width - 1 - 2 * r);
      pill = { x: btn.left - box.left + 0.5, y: btn.top - box.top + 0.5, r, straight, total: 2 * straight + 2 * Math.PI * r };
    };

    let hot = false;
    let speed = CALM;
    let phase = 0;
    let last = 0;
    let raf = 0;
    let visible = false;
    const frame = (now: number) => {
      raf = 0;
      if (!visible) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const goal = hot ? FAST : CALM;
      speed += (goal - speed) * (1 - Math.exp(-dt / (goal > speed ? RISE : FALL)));
      phase = (phase + speed * dt) % 1;
      const power = 0.8 + 0.2 * ((speed - CALM) / (FAST - CALM));

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, width, height);
      const light = isLight();
      ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
      pulse(ctx, pill, phase * pill.total, power, light);
      pulse(ctx, pill, (phase + 0.5) * pill.total, power, light);
      raf = requestAnimationFrame(frame);
    };

    const heat = (value: boolean) => () => {
      hot = value;
    };
    const ac = new AbortController();
    button.addEventListener('pointerenter', heat(true), { signal: ac.signal });
    button.addEventListener('pointerleave', heat(false), { signal: ac.signal });
    button.addEventListener('focus', heat(true), { signal: ac.signal });
    button.addEventListener('blur', heat(false), { signal: ac.signal });

    const sizes = new ResizeObserver(resize);
    sizes.observe(canvas);
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible && !raf) raf = requestAnimationFrame(frame);
    });
    observer.observe(canvas);
    resize();

    cleanups.push(() => {
      cancelAnimationFrame(raf);
      ac.abort();
      sizes.disconnect();
      observer.disconnect();
    });
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
});
