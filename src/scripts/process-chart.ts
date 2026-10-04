/**
 * График «Траектория» в блоке «Как работаем» (ProcessChart.astro).
 * Светящаяся линия «готовность продукта» идёт через четыре зоны-этапа: медленный старт до сметы, подъём
 * к структуре прототипа, три ступени итераций с демо, рывок запуска и пунктир поддержки до края.
 * Кривая — монотонный кубический сплайн (без «перелётов» вниз). Под линией мерцает пыль, как на первом
 * экране: гуще у линии, к оси растворяется. Линия светится, как неон под надписью VANTEGRA
 * (тот же приём: тонкая сердцевина и слои свечения со сложением света; днём — тёмный штрих без свечения).
 *
 * Блок появился на экране — линия прорисовывается сама (2,6 с), за кончиком идёт планета, отметки
 * и номера этапов зажигаются по ходу. Дальше раз в несколько секунд по линии пробегает импульс-комета,
 * подсвечивая номера этапов, и планета отвечает кольцом. Наведение на этап (десктоп) подсвечивает его
 * участок линии и пыль. Рисуем, только пока блок на экране; при reduced motion — сразу готовый неподвижный график.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

type Point = [number, number];

/** Опорные точки: u — путь от идеи до запуска (зоны по 0,25), v — готовность продукта */
const POINTS: Point[] = [
  [0, 0.05],
  [0.13, 0.09],
  [0.25, 0.19], // смета
  [0.37, 0.27],
  [0.5, 0.38], // структура
  [0.545, 0.465],
  [0.585, 0.48], // демо
  [0.625, 0.565],
  [0.665, 0.58], // демо
  [0.705, 0.665],
  [0.745, 0.68], // демо
  [0.75, 0.69],
  [0.8, 0.85], // запуск — конец сплошной линии
  [0.9, 0.875],
  [1, 0.89],
];
/** Индекс точки запуска: дальше — пунктир поддержки */
const LAUNCH = 12;
const MARKS = [
  { at: 2, kind: 'ring', label: 'estimate', side: 'left' },
  { at: 4, kind: 'ring', label: 'structure', side: 'left' },
  { at: 6, kind: 'dot', label: 'demo', side: 'center' },
  { at: 8, kind: 'dot', label: 'demo', side: 'center' },
  { at: 10, kind: 'dot', label: 'demo', side: 'center' },
  { at: 12, kind: 'ring', label: 'launch', side: 'center' },
] as const;

const REVEAL_MS = 2600;
const PULSE_FIRST = 1400;
const PULSE_EVERY = 6500;
const PULSE_MS = 2200;
const COMET = 160;
const CHALK = '244, 242, 238';
const SOOT = '17, 17, 17';
const NS = 'http://www.w3.org/2000/svg';
/** Запас холста за краем графика (как --bleed в ProcessChart.astro): по бокам и сверху-снизу */
const BLEED_X = 16;
const BLEED_Y = 24;
/** Слои линии: [толщина, прозрачность]. Ночью — свечение со сложением света, днём — тёмный штрих */
const GLOW_DARK: [number, number][] = [
  [16, 0.03],
  [8, 0.06],
  [3.5, 0.2],
  [1.5, 0.95],
];
const GLOW_LIGHT: [number, number][] = [
  [5, 0.05],
  [2.5, 0.12],
  [1.5, 0.9],
];

const isLight = () => document.documentElement.dataset.theme === 'light';
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Монотонный кубический сплайн (Фритч — Карлсон): отрезки Безье */
function monotone(points: Point[]): [Point, Point, Point, Point][] {
  const n = points.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1]![0] - points[i]![0];
    m[i] = (points[i + 1]![1] - points[i]![1]) / dx[i]!;
  }
  const tangent: number[] = [m[0]!];
  for (let i = 1; i < n - 1; i++) tangent[i] = m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2;
  tangent[n - 1] = m[n - 2]!;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i]! / m[i]!;
    const b = tangent[i + 1]! / m[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      tangent[i] = k * a * m[i]!;
      tangent[i + 1] = k * b * m[i]!;
    }
  }
  return points.slice(0, -1).map((p, i) => {
    const q = points[i + 1]!;
    const h = dx[i]! / 3;
    return [p, [p[0] + h, p[1] + tangent[i]! * h], [q[0] - h, q[1] - tangent[i + 1]! * h], q];
  });
}

/** Детерминированный генератор — пыль одинаковая при каждой загрузке */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sample {
  x: number;
  y: number;
  len: number;
}

onPage(() => {
  const root = document.querySelector<HTMLElement>('[data-pchart]');
  const plot = root?.querySelector<HTMLElement>('[data-pchart-plot]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-pchart-canvas]');
  const svg = root?.querySelector<SVGSVGElement>('[data-pchart-svg]');
  const ctx = canvas?.getContext('2d');
  if (!root || !plot || !canvas || !svg || !ctx) return;
  const items = [...root.querySelectorAll<HTMLElement>('[data-pchart-step]')];
  const labels = JSON.parse(root.dataset.marks ?? '{}') as Record<string, string>;
  const reduced = prefersReducedMotion();
  const desktop = window.matchMedia('(min-width: 1024px)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');

  let W = 1;
  let H = 1;
  let ratio = 1;
  let base = 0;
  let samples: Sample[] = [];
  let total = 0;
  let main: Path2D | null = null;
  let tail: Path2D | null = null;
  let marks: { x: number; y: number; len: number; kind: 'ring' | 'dot' | 'none'; label?: SVGTextElement; at: number | null }[] = [];
  /** Толщина свечения: на узком графике тоньше, чтобы линия не расплывалась */
  let glowScale = 1;
  let dust: { x: number; y: number; r: number; a: number; phase: number; speed: number; len: number; zone: number }[] = [];

  let revealStart: number | null = reduced ? -Infinity : null;
  let reveal = reduced ? 1 : 0;
  let hover = -1;
  let pulseAt: number | null = null;
  let pingAt: number | null = null;
  let nextPulse = 0;
  let active = -2;

  /** Поиск по ломаной: точка по длине и длина над x (x вдоль линии только растёт) */
  const atLength = (len: number): Sample => {
    if (!samples.length) return { x: 0, y: 0, len: 0 };
    if (len <= 0) return samples[0]!;
    if (len >= total) return samples[samples.length - 1]!;
    let lo = 0;
    let hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid]!.len < len) lo = mid;
      else hi = mid;
    }
    const a = samples[lo]!;
    const b = samples[hi]!;
    const k = (len - a.len) / (b.len - a.len || 1);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, len };
  };
  const atX = (x: number): Sample => {
    let lo = 0;
    let hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid]!.x < x) lo = mid;
      else hi = mid;
    }
    const a = samples[lo]!;
    const b = samples[hi]!;
    const k = (x - a.x) / (b.x - a.x || 1);
    return { x, y: a.y + (b.y - a.y) * k, len: a.len + (b.len - a.len) * k };
  };
  const zoneOf = (x: number) => Math.min(3, Math.max(0, Math.floor((x / W) * 4)));

  const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    svg.append(node);
    return node;
  };

  const build = () => {
    const box = plot.getBoundingClientRect();
    W = Math.max(1, box.width);
    H = Math.max(1, box.height);
    ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round((W + BLEED_X * 2) * ratio);
    canvas.height = Math.round((H + BLEED_Y * 2) * ratio);
    glowScale = Math.min(1, Math.max(0.55, W / 1100));
    const named = W >= 560;
    const top = named ? 42 : 18;
    base = H - 0.5;
    // конец линии чуть раньше края — планета с кольцом помещается целиком
    const map = (u: number, v: number): Point => [u * (W - 12), base - v * (base - top)];

    // кривая: отрезки Безье → пути для холста и ломаная с длинами
    const segments = monotone(POINTS).map((seg) => seg.map(([u, v]) => map(u, v)) as [Point, Point, Point, Point]);
    const pathOf = (from: number, to: number) => {
      const path = new Path2D();
      path.moveTo(...segments[from]![0]);
      for (const [, c1, c2, p] of segments.slice(from, to)) path.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p[0], p[1]);
      return path;
    };
    main = pathOf(0, LAUNCH);
    tail = pathOf(LAUNCH, segments.length);
    samples = [];
    let len = 0;
    let prev: Point | null = null;
    for (const [p0, c1, c2, p1] of segments) {
      // у следующего отрезка первая точка совпадает с последней предыдущего
      const first: number = samples.length ? 1 : 0;
      for (let i = first; i <= 24; i++) {
        const t: number = i / 24;
        const mt: number = 1 - t;
        const x: number = mt * mt * mt * p0[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * p1[0];
        const y: number = mt * mt * mt * p0[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * p1[1];
        if (prev) len += Math.hypot(x - prev[0], y - prev[1]);
        samples.push({ x, y, len });
        prev = [x, y];
      }
    }
    total = len;

    // пыль под линией: гуще у линии, к оси реже и тусклее
    const random = mulberry32(0x5eed);
    const count = desktop.matches ? 950 : 420;
    dust = [];
    for (let i = 0; i < count; i++) {
      const x = random() * W;
      const point = atX(x);
      const depth = Math.pow(random(), 2.2);
      const y = point.y + 2 + depth * (base - 2 - point.y);
      dust.push({
        x,
        y,
        r: 0.45 + random() * 0.85,
        a: Math.pow(1 - depth, 1.4) * (0.35 + random() * 0.55),
        phase: random() * Math.PI * 2,
        speed: 0.6 + random() * 1.4,
        len: point.len,
        zone: zoneOf(x),
      });
    }

    // разметка поверх холста: ось со стрелкой, границы зон, подписи отметок
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${W.toFixed(2)} ${H.toFixed(2)}`);
    for (let i = 1; i < 4; i++) {
      const x = Math.round((W * i) / 4) + 0.5;
      svgEl('line', { class: 'pchart__zone', x1: x, y1: top - 18, x2: x, y2: base });
    }
    svgEl('line', { class: 'pchart__axis', x1: 0, y1: base, x2: W.toFixed(2), y2: base });
    svgEl('path', { class: 'pchart__axis', d: `M${(W - 7).toFixed(2)} ${base - 4}L${W.toFixed(2)} ${base}L${(W - 7).toFixed(2)} ${base + 4}` });
    marks = MARKS.map((mark) => {
      const [x, y] = map(...POINTS[mark.at]!);
      let label: SVGTextElement | undefined;
      if (named && labels[mark.label]) {
        const left = mark.side === 'left';
        label = svgEl('text', { class: 'pchart__label', x: (x + (left ? -14 : 0)).toFixed(2), y: (y - 16).toFixed(2), 'text-anchor': left ? 'end' : 'middle' });
        label.textContent = labels[mark.label]!;
      }
      return { x, y, len: atX(x).len, kind: mark.kind, label, at: reduced ? -Infinity : null };
    });
    if (named && labels.support) {
      const [x, y] = map(0.91, 0.878);
      const label = svgEl('text', { class: 'pchart__label', x: x.toFixed(2), y: (y - 16).toFixed(2), 'text-anchor': 'middle' });
      label.textContent = labels.support;
      marks.push({ x, y, len: atX(x).len, kind: 'none', label, at: reduced ? -Infinity : null });
    }
  };

  const strokeLayers = (path: Path2D, layers: [number, number][], tone: string, boost = 1) => {
    for (const [width, alpha] of layers) {
      ctx.lineWidth = width > 2 ? width * glowScale : width;
      ctx.strokeStyle = `rgba(${tone}, ${Math.min(1, alpha * boost)})`;
      ctx.stroke(path);
    }
  };

  const glowDot = (x: number, y: number, r: number, alpha: number, tone: string) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(${tone}, ${alpha})`);
    gradient.addColorStop(1, `rgba(${tone}, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  const draw = (now: number) => {
    if (!main || !tail) return;
    const light = isLight();
    const tone = light ? SOOT : CHALK;
    const paper = light ? '244, 242, 238' : '17, 17, 17';
    const layers = light ? GLOW_LIGHT : GLOW_DARK;
    ctx.setTransform(ratio, 0, 0, ratio, BLEED_X * ratio, BLEED_Y * ratio);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(-BLEED_X, -BLEED_Y, W + BLEED_X * 2, H + BLEED_Y * 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawn = reveal * total;
    const tip = atLength(drawn);
    const blend = light ? 'source-over' : 'lighter';

    // пыль
    ctx.globalCompositeOperation = blend;
    const seconds = now / 1000;
    for (const p of dust) {
      if (p.len > drawn) continue;
      const twinkle = reduced ? 1 : 0.65 + 0.35 * Math.sin(seconds * p.speed + p.phase);
      const lit = hover >= 0 && p.zone === hover ? 1.9 : 1;
      ctx.fillStyle = `rgba(${tone}, ${(p.a * twinkle * lit * (light ? 0.6 : 0.75)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // линия до кончика: сплошная до запуска, дальше пунктир поддержки
    ctx.save();
    ctx.beginPath();
    ctx.rect(-20, -40, tip.x + 20, H + 80);
    ctx.clip();
    strokeLayers(main, layers, tone);
    ctx.setLineDash([2, 7]);
    strokeLayers(tail, light ? [[1.5, 0.55]] : [[6, 0.04], [1.5, 0.6]], tone);
    ctx.setLineDash([]);
    // участок этапа под курсором — ярче
    if (hover >= 0) {
      ctx.beginPath();
      ctx.rect((W * hover) / 4, -40, W / 4, H + 80);
      ctx.clip();
      strokeLayers(main, layers, tone, 1.8);
    }
    ctx.restore();

    // импульс-комета: яркий хвост нарастает к голове
    let pulseZone = -1;
    if (pulseAt !== null) {
      const q = clamp01((now - pulseAt) / PULSE_MS);
      const head = easeInOut(q) * (total + COMET);
      const steps = 14;
      for (let i = 0; i < steps; i++) {
        const from = head - COMET + (COMET * i) / steps;
        const to = from + COMET / steps + 0.5;
        if (to <= 0 || from >= total) continue;
        const a = atLength(Math.max(0, from));
        const b = atLength(Math.min(total, to));
        const k = (i + 1) / steps;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        const mid = atLength(Math.min(total, (Math.max(0, from) + Math.min(total, to)) / 2));
        ctx.quadraticCurveTo(mid.x, mid.y, b.x, b.y);
        for (const [width, alpha] of light ? [[3, 0.25 * k] as [number, number]] : ([[10, 0.08 * k], [4, 0.3 * k], [2, k]] as [number, number][])) {
          ctx.lineWidth = width;
          ctx.strokeStyle = `rgba(${tone}, ${alpha.toFixed(3)})`;
          ctx.stroke();
        }
      }
      if (head > 0 && head < total) {
        const point = atLength(head);
        if (!light) glowDot(point.x, point.y, 14, 0.35, tone);
        pulseZone = zoneOf(point.x);
      }
      if (q >= 1) {
        pulseAt = null;
        pingAt = now;
        nextPulse = now + PULSE_EVERY;
      }
    }

    // отметки: вехи — кольца, демо — точки; проявляются, когда линия дошла
    ctx.globalCompositeOperation = 'source-over';
    for (const mark of marks) {
      if (mark.len > drawn) continue;
      if (mark.at === null) mark.at = now;
      const k = reduced ? 1 : easeInOut(clamp01((now - mark.at) / 450));
      mark.label?.classList.add('is-on');
      if (mark.kind === 'none') continue;
      if (!light) glowDot(mark.x, mark.y, 12, 0.18 * k, tone);
      ctx.beginPath();
      if (mark.kind === 'ring') {
        ctx.arc(mark.x, mark.y, 4.5 * (0.5 + 0.5 * k), 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${paper})`;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(${tone}, ${k})`;
        ctx.stroke();
      } else {
        ctx.arc(mark.x, mark.y, 3 * (0.5 + 0.5 * k), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tone}, ${k})`;
        ctx.fill();
      }
    }
    for (const mark of marks) if (mark.len > drawn) mark.label?.classList.remove('is-on');

    // планета на кончике: свечение, «дышащее» кольцо, точка; отклик кольцом после импульса
    if (drawn > 2) {
      if (!light) glowDot(tip.x, tip.y, 24, 0.28, tone);
      const breathe = reduced ? 0 : Math.sin(now / 900) * 1.5;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 10 + breathe, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${tone}, 0.3)`;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${tone})`;
      ctx.fill();
      if (pingAt !== null) {
        const k = clamp01((now - pingAt) / 1200);
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 6 + 24 * (1 - Math.pow(1 - k, 3)), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${tone}, ${(0.5 * (1 - k)).toFixed(3)})`;
        ctx.stroke();
        if (k >= 1) pingAt = null;
      }
    }

    // номер этапа: под курсором, под кончиком (пока рисуется) или под импульсом
    const revealing = reveal < 1;
    const next = hover >= 0 ? hover : revealing && drawn > 2 ? zoneOf(tip.x) : pulseZone;
    if (next !== active) {
      active = next;
      items.forEach((item, i) => item.classList.toggle('is-active', i === active));
    }
  };

  let raf = 0;
  let visible = false;
  const frame = (now: number) => {
    raf = 0;
    if (revealStart !== null && reveal < 1) reveal = easeInOut(clamp01((now - revealStart) / REVEAL_MS));
    if (!reduced && reveal >= 1 && pulseAt === null) {
      if (!nextPulse) nextPulse = now + PULSE_FIRST;
      if (now >= nextPulse) pulseAt = now;
    }
    draw(now);
    if (visible && !reduced) raf = requestAnimationFrame(frame);
  };
  const start = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      // прорисовка — когда график заметно на экране
      if (entry && entry.intersectionRatio >= 0.35 && revealStart === null) revealStart = performance.now();
      if (visible) start();
    },
    { threshold: [0, 0.35] },
  );
  observer.observe(plot);

  const ac = new AbortController();
  const { signal } = ac;
  root.addEventListener(
    'pointermove',
    (event) => {
      if (!fine.matches || !desktop.matches || event.pointerType !== 'mouse') return;
      const zone = zoneOf(event.clientX - plot.getBoundingClientRect().left);
      if (zone !== hover) {
        hover = zone;
        if (reduced) draw(performance.now());
      }
    },
    { signal },
  );
  root.addEventListener(
    'pointerleave',
    () => {
      hover = -1;
      if (reduced) draw(performance.now());
    },
    { signal },
  );
  // смена темы — перекрасить сразу
  window.addEventListener('vantegra:theme', () => draw(performance.now()), { signal });

  const resize = new ResizeObserver(() => {
    build();
    draw(performance.now());
  });
  resize.observe(plot);

  return () => {
    ac.abort();
    observer.disconnect();
    resize.disconnect();
    cancelAnimationFrame(raf);
  };
});
