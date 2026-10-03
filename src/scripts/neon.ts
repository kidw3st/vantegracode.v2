/**
 * Неоновые импульсы на линии-разделителе под надписью VANTEGRA (SectionHeader neon, решение владельца,
 * по мотивам Neon Border). Рисуем на canvas в плотности пикселей экрана — без размытия CSS-фильтром,
 * поэтому края чистые на любом экране.
 * Импульс: тонкая яркая сердцевина, горячая точка в центре и три эллиптических ореола со сложением света.
 * Два импульса скользят навстречу друг другу от края до края (разгон и торможение), сходятся в центре.
 * На дневной теме импульс — тёмный штрих без широкого ореола (тёмное свечение на светлом читается как тень).
 * Рисуем, только пока линия на экране и уже прорисовалась; при prefers-reduced-motion импульсов нет.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

const PERIOD = 5.6; // секунд на круг: туда и обратно
const LENGTH = 0.34; // длина импульса — доля длины линии
const CHALK = '244, 242, 238';
const SOOT = '17, 17, 17';
const isLight = () => document.documentElement.dataset.theme === 'light';

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Положение центра импульса 0…1 по линии: туда за половину круга, обратно за вторую */
function glide(phase: number): number {
  const p = ((phase % 1) + 1) % 1;
  const t = p < 0.5 ? easeInOut(p * 2) : 1 - easeInOut((p - 0.5) * 2);
  return LENGTH / 2 + t * (1 - LENGTH);
}

/** Эллиптическое свечение: радиальный градиент в растянутой по горизонтали системе координат */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha: number, tone: string) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  gradient.addColorStop(0, `rgba(${tone}, ${alpha})`);
  gradient.addColorStop(0.35, `rgba(${tone}, ${alpha * 0.45})`);
  gradient.addColorStop(1, `rgba(${tone}, 0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function pulse(ctx: CanvasRenderingContext2D, cx: number, mid: number, width: number, light: boolean) {
  const length = width * LENGTH;
  const tone = light ? SOOT : CHALK;
  // ореолы: широкий бледный, средний, плотный у линии; днём — только узкие и слабее
  glow(ctx, cx, mid, length * 0.62, 30, light ? 0 : 0.1, tone);
  glow(ctx, cx, mid, length * 0.55, 13, light ? 0.07 : 0.22, tone);
  glow(ctx, cx, mid, length * 0.46, 3.6, light ? 0.32 : 0.5, tone);
  // сердцевина: отрезок в 1 px с мягкими концами
  const core = ctx.createLinearGradient(cx - length / 2, 0, cx + length / 2, 0);
  core.addColorStop(0, `rgba(${tone}, 0)`);
  core.addColorStop(0.5, `rgba(${tone}, 0.95)`);
  core.addColorStop(1, `rgba(${tone}, 0)`);
  ctx.fillStyle = core;
  ctx.fillRect(cx - length / 2, mid - 0.5, length, 1);
  // горячая точка в центре
  glow(ctx, cx, mid, length * 0.09, 1.4, 0.9, tone);
}

onPage(() => {
  if (prefersReducedMotion()) return;
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>('[data-neon]')];
  if (!canvases.length) return;
  const cleanups: (() => void)[] = [];

  for (const canvas of canvases) {
    const ctx = canvas.getContext('2d');
    const header = canvas.closest<HTMLElement>('.sh');
    if (!ctx || !header) continue;

    let width = 1;
    let height = 1;
    let ratio = 1;
    const resize = () => {
      ratio = Math.min(2, window.devicePixelRatio || 1);
      const box = canvas.getBoundingClientRect();
      width = Math.max(1, box.width);
      height = Math.max(1, box.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    };

    let raf = 0;
    let visible = false;
    const frame = (now: number) => {
      raf = 0;
      if (!visible) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, width, height);
      // импульсы проявляются, когда линия прорисовалась (класс .is-in у заголовка)
      if (header.classList.contains('is-in')) {
        const light = isLight();
        ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
        const phase = now / 1000 / PERIOD;
        const mid = height / 2;
        pulse(ctx, glide(phase) * width, mid, width, light);
        pulse(ctx, glide(phase + 0.5) * width, mid, width, light);
      }
      raf = requestAnimationFrame(frame);
    };

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
      sizes.disconnect();
      observer.disconnect();
    });
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
});
