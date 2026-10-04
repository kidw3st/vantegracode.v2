/**
 * Гравюра — иллюстрации макета сайта в блоке «Процесс работы» (ProcessSite.astro).
 * Предмет штрихуется горизонтальными линиями, и плотность штриха передаёт свет, как в резцовой гравюре.
 * Версий две, у каждой своя логика тона:
 *   ночь — светлые линии на тёмном: штрих ложится на освещённое (белая гравюра), тень остаётся фоном;
 *   день — тёмные линии на светлом: штрих ложится в тень (оттиск), свет остаётся бумагой.
 * Слои штриха: a — основные линии, b — линии между ними, c и d — их утолщение в самых плотных местах.
 * Сцена одна для всех предметов: свет сверху слева, камера смотрит чуть сверху, предметы стоят на полу.
 * Всё считается при сборке; на выходе — строки d для <path> в пикселях макета.
 */

type Vec = [number, number, number];
type Layer = 'a' | 'b' | 'c' | 'd';

export type Hatch = Record<Layer, string>;

export interface Engraved {
  width: number;
  height: number;
  /** контуры предметов — каждый отдельным путём, чтобы прорисовываться по stroke-dashoffset */
  contours: string[];
  night: Hatch;
  day: Hatch;
}

/** Плотность штриха в точке для каждой версии: 0 — пусто, 1 — гуще всего */
interface Tone {
  night: number;
  day: number;
}

/** Яркость поверхности предмета в точке экрана (0…1) или null — точка не на предмете */
type Surface = (x: number, y: number) => number | null;

/** Пол в своих координатах: x вправо, z к зрителю, от точки опоры предмета */
interface Floor {
  /** радиус пятна света вокруг предмета (ночная версия) */
  pool: number;
  /** сила тени в точке пола: 0…1 */
  shadow: (x: number, z: number) => number;
}

/* ---------- Камера и свет ---------- */

/** Камера смотрит чуть сверху: синус угла — во сколько раз круг на полу сжат в эллипс */
const TILT = 0.25;
const COS = Math.sqrt(1 - TILT ** 2);

const norm = (v: Vec): Vec => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const smoothstep = (from: number, to: number, x: number) => {
  const t = clamp01((x - from) / (to - from));
  return t * t * (3 - 2 * t);
};

/** Мир (x вправо, y вверх, z к зрителю) → вид (x вправо, y вниз, z к зрителю) */
const toView = ([x, y, z]: Vec): Vec => [x, -(y * COS - z * TILT), y * TILT + z * COS];

/** Свет сверху слева и чуть спереди (в мире) */
const SUN = norm([-0.45, 0.85, 0.3]);
const LIGHT = toView(SUN);
/** Контровой свет справа сзади — тонкая светлая кромка на теневой стороне (в виде) */
const RIM = norm([0.85, -0.25, -0.45]);
/** Тень на полу: направление (x, z) и длина на единицу высоты предмета */
const SHADOW = (() => {
  const h = Math.hypot(SUN[0], SUN[2]);
  return { x: -SUN[0] / h, z: -SUN[2] / h, k: h / SUN[1] };
})();

/** Яркость поверхности с нормалью n (в виде) */
function shade(n: Vec, albedo = 1): number {
  const diffuse = Math.max(0, (dot(n, LIGHT) + 0.2) / 1.2);
  const rim = Math.max(0, dot(n, RIM)) ** 4 * 0.75;
  const bounce = Math.max(0, n[1]) ** 2 * 0.12;
  return clamp01(albedo * (0.03 + 0.95 * diffuse) + rim + bounce);
}

/* ---------- Пол: пятно света и тени ---------- */

/** Тень-капсула: отрезок от (0, 0) вдоль направления тени длиной length, радиус r; к дальнему концу светлеет */
function capsule(x: number, z: number, from: number, to: number, r: number): number {
  const ax = SHADOW.x * from;
  const az = SHADOW.z * from;
  const bx = SHADOW.x * to;
  const bz = SHADOW.z * to;
  const dx = bx - ax;
  const dz = bz - az;
  const t = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1));
  const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
  const core = 1 - smoothstep(r * 0.8, r * 1.15, d);
  return core * (1 - 0.4 * t);
}

/** Затенение у самой опоры: кольцо шириной width снаружи от края основания */
const contact = (outside: number, width: number) => (outside < 0 ? 0 : 1 - smoothstep(0, width, outside));

/* ---------- Контуры ---------- */

const f = (n: number) => String(Math.round(n * 10) / 10);

const line = (x1: number, y1: number, x2: number, y2: number) => `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;

const circle = (cx: number, cy: number, r: number) =>
  `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`;

/** Видимые дуги эллипса: участки, которые не закрывает предмет спереди */
function ellipseArcs(cx: number, cy: number, rx: number, ry: number, hidden: (x: number, y: number) => boolean, from = 0, to = 2 * Math.PI): string[] {
  const N = 720;
  const at = (a: number) => [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as const;
  const visible = (a: number) => !hidden(...at(a));
  const arcs: string[] = [];
  let start: number | null = null;
  const flush = (end: number) => {
    if (start === null) return;
    const [x0, y0] = at(start);
    const [x1, y1] = at(end);
    const arc = (x: number, y: number, large: number) => `A${f(rx)} ${f(ry)} 0 ${large} 1 ${f(x)} ${f(y)}`;
    if (end - start > 2 * Math.PI - 1e-6) {
      // целый эллипс — двумя половинами: у дуги с совпадающими концами нет пути
      const [xm, ym] = at(start + Math.PI);
      arcs.push(`M${f(x0)} ${f(y0)}${arc(xm, ym, 0)}${arc(x0, y0, 0)}`);
    } else arcs.push(`M${f(x0)} ${f(y0)}${arc(x1, y1, end - start > Math.PI ? 1 : 0)}`);
    start = null;
  };
  for (let i = 0; i <= N; i++) {
    const a = from + ((to - from) * i) / N;
    if (visible(a)) start ??= a;
    else flush(a);
  }
  flush(to);
  return arcs;
}

/* ---------- Штрих ---------- */

/**
 * Шаг строк штриха, px макета. Четыре ступени тона: a — основные строки, b — строки между ними,
 * c и d — утолщение a и b там, где гуще всего. Порог у каждой строки чуть свой — концы штрихов
 * ложатся неровно, как у резца, и ступени тона не складываются в полосы
 */
const STEP = 8;
const LAYERS: { layer: Layer; min: number; row: number }[] = [
  { layer: 'a', min: 0.12, row: STEP / 2 },
  { layer: 'b', min: 0.34, row: STEP },
  { layer: 'c', min: 0.56, row: STEP / 2 },
  { layer: 'd', min: 0.78, row: STEP },
];
const JITTER = 0.07;
/** Короче — не штрих, а пыль */
const MIN_RUN = 3;

/** Детерминированный шум строки: −1…1 */
const noise = (y: number, salt: number) => {
  const s = Math.sin(y * 12.9898 + salt * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};

function engrave(width: number, height: number, scene: (x: number, y: number) => Tone | null, contours: string[]): Engraved {
  const out = { night: { a: '', b: '', c: '', d: '' }, day: { a: '', b: '', c: '', d: '' } };
  const rows = new Map<number, (Tone | null)[]>();
  const sample = (y: number) => {
    let row = rows.get(y);
    if (!row) {
      row = Array.from({ length: width }, (_, x) => scene(x + 0.5, y));
      rows.set(y, row);
    }
    return row;
  };
  for (const [salt, { layer, min, row: first }] of LAYERS.entries()) {
    for (let y = first; y < height; y += STEP) {
      const tones = sample(y);
      const threshold = min + JITTER * noise(y, salt);
      for (const side of ['night', 'day'] as const) {
        let start = -1;
        for (let x = 0; x <= width; x++) {
          const tone = tones[x];
          const on = x < width && tone != null && tone[side] >= threshold;
          if (on && start < 0) start = x;
          else if (!on && start >= 0) {
            if (x - start >= MIN_RUN) out[side][layer] += `M${start} ${f(y)}h${x - start}`;
            start = -1;
          }
        }
      }
    }
  }
  return { width, height, contours, ...out };
}

/** Сцена из предметов (спереди назад) на полу: предмет — по свету, пол — пятно света и тени */
function stage(width: number, height: number, surfaces: Surface[], ground: { x: number; y: number }, floor: Floor, contours: string[]): Engraved {
  return engrave(
    width,
    height,
    (x, y) => {
      for (const surface of surfaces) {
        const t = surface(x, y);
        // ночью полутона темнее — свет собирается в пятно, как под софитом
        if (t !== null) return { night: t ** 1.7, day: 1 - t };
      }
      const fx = x - ground.x;
      const fz = (y - ground.y) / TILT;
      const r = Math.hypot(fx, fz) / floor.pool;
      const pool = r < 1 ? (1 - r * r) ** 1.3 : 0;
      const shadow = clamp01(floor.shadow(fx, fz));
      const night = 0.44 * pool * (1 - 0.95 * shadow);
      const day = 0.9 * shadow;
      return night < 0.05 && day < 0.05 ? null : { night, day };
    },
    contours,
  );
}

/* ---------- Предметы ---------- */

/** Шар: центр (cx, cy) на экране, радиус r */
function ball(cx: number, cy: number, r: number): Surface {
  return (x, y) => {
    const dx = (x - cx) / r;
    const dy = (y - cy) / r;
    const q = dx * dx + dy * dy;
    return q > 1 ? null : shade([dx, dy, Math.sqrt(1 - q)]);
  };
}

/** Цилиндр: ось вертикальна, top / bottom — экранные y центров верхней грани и основания */
function drum(cx: number, top: number, bottom: number, rx: number, albedo: number, topShadow?: (x: number, z: number) => number): Surface {
  const ry = rx * TILT;
  const lid = shade(toView([0, 1, 0]), albedo);
  return (x, y) => {
    const u = (x - cx) / rx;
    if (Math.abs(u) > 1) return null;
    const front = ry * Math.sqrt(1 - u * u);
    const v = (y - top) / ry;
    if (u * u + v * v <= 1) return topShadow ? lid * (1 - 0.88 * clamp01(topShadow(x - cx, (y - top) / TILT))) : lid;
    if (y <= top || y > bottom + front) return null;
    const w = Math.sqrt(1 - u * u);
    return shade(toView([u, 0, w]), albedo);
  };
}

function drumContours(cx: number, top: number, bottom: number, rx: number, hidden: (x: number, y: number) => boolean = () => false): string[] {
  const ry = rx * TILT;
  return [
    ...ellipseArcs(cx, top, rx, ry, hidden),
    line(cx - rx, top, cx - rx, bottom),
    line(cx + rx, top, cx + rx, bottom),
    ...ellipseArcs(cx, bottom, rx, ry, () => false, 0, Math.PI),
  ];
}

/* ---------- Композиции ---------- */

/** Первый экран макета: шар на колонне, панель 628 × 724 */
export function sphereOnPedestal(): Engraved {
  const W = 628;
  const H = 724;
  const cx = 300;
  const bottom = 590;
  const height = 232;
  const top = bottom - height;
  const rx = 92;
  const r = 122;
  const cy = top - r * COS;
  const inBall = (x: number, y: number) => (x - cx) ** 2 + (y - cy) ** 2 < r * r;
  const sphereShadow = (x: number, z: number) => capsule(x, z, 0, 2 * r * SHADOW.k, r * 0.95);
  return stage(
    W,
    H,
    [ball(cx, cy, r), drum(cx, top, bottom, rx, 0.72, sphereShadow)],
    { x: cx, y: bottom },
    {
      pool: rx * 2.15,
      shadow: (x, z) =>
        Math.max(
          capsule(x, z, 0, height * SHADOW.k, rx),
          capsule(x, z, (height + r * 0.4) * SHADOW.k, (height + 2 * r) * SHADOW.k, r * 0.92),
          0.95 * contact(Math.hypot(x, z) - rx, rx * 0.14),
        ),
    },
    [circle(cx, cy, r), ...drumContours(cx, top, bottom, rx, inBall)],
  );
}

/** Карточка коллекции: 384 × 268, предмет стоит на полу в (192, 214) */
const CARD = { w: 384, h: 268, x: 192, y: 214 };

export function sphereCard(): Engraved {
  const r = 80;
  const cy = CARD.y - r * COS;
  return stage(
    CARD.w,
    CARD.h,
    [ball(CARD.x, cy, r)],
    { x: CARD.x, y: CARD.y },
    {
      pool: r * 2.1,
      shadow: (x, z) => Math.max(capsule(x, z, 0, 2 * r * SHADOW.k, r * 0.9), 0.95 * (1 - smoothstep(0, r * 0.55, Math.hypot(x, z)))),
    },
    [circle(CARD.x, cy, r)],
  );
}

export function cylinderCard(): Engraved {
  const rx = 62;
  const height = 150;
  const top = CARD.y - height;
  return stage(
    CARD.w,
    CARD.h,
    [drum(CARD.x, top, CARD.y, rx, 0.9)],
    { x: CARD.x, y: CARD.y },
    {
      pool: rx * 2.6,
      shadow: (x, z) => Math.max(capsule(x, z, 0, height * SHADOW.k, rx), 0.95 * contact(Math.hypot(x, z) - rx, rx * 0.16)),
    },
    drumContours(CARD.x, top, CARD.y, rx),
  );
}

/** Куб, повёрнутый на turn вокруг вертикали */
export function cubeCard(): Engraved {
  const a = 116;
  const turn = (32 * Math.PI) / 180;
  const half = a / 2;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  // мир: основание на полу, центр основания — точка опоры
  const world = (x: number, y: number, z: number): Vec => [x * cos + z * sin, y, -x * sin + z * cos];
  const screen = ([x, y, z]: Vec): [number, number] => [CARD.x + x, CARD.y - y * COS + z * TILT];
  const corners = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ] as const;
  const base = corners.map(([x, z]) => world(x, 0, z));
  const lid = corners.map(([x, z]) => world(x, a, z));
  // грани: верх и четыре стороны; видимые — с нормалью к зрителю
  type Face = { pts: [number, number][]; normal: Vec };
  const sides = corners.map((_, i): Face => {
    const j = (i + 1) % 4;
    const [mx, mz] = [(corners[i]![0] + corners[j]![0]) / 2, (corners[i]![1] + corners[j]![1]) / 2];
    return { pts: [base[i]!, base[j]!, lid[j]!, lid[i]!].map(screen), normal: norm(world(mx, 0, mz)) };
  });
  const faces = [{ pts: lid.map(screen), normal: [0, 1, 0] } as Face, ...sides].filter((face) => toView(face.normal)[2] > 0.01);
  const inside = (pts: [number, number][], x: number, y: number) => {
    let sign = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i]!;
      const [x2, y2] = pts[(i + 1) % pts.length]!;
      const cross = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
      if (cross !== 0) {
        if (sign === 0) sign = Math.sign(cross);
        else if (Math.sign(cross) !== sign) return false;
      }
    }
    return true;
  };
  const surfaces: Surface[] = faces.map(({ pts, normal }) => {
    const t = shade(toView(normal), 0.9);
    return (x, y) => (inside(pts, x, y) ? t : null);
  });
  // тень — выпуклая оболочка основания и его сдвига вдоль света на высоту куба
  const reach = a * SHADOW.k;
  const footprint = convexHull(base.map(([x, , z]): [number, number] => [x, z]));
  const cast = convexHull(footprint.flatMap(([x, z]): [number, number][] => [[x, z], [x + SHADOW.x * reach, z + SHADOW.z * reach]]));
  const edges = new Set<string>();
  const contours: string[] = [];
  for (const { pts } of faces) {
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length]!;
      const key = [p, q]
        .map(([x, y]) => `${f(x)},${f(y)}`)
        .sort()
        .join(' ');
      if (edges.has(key)) return;
      edges.add(key);
      contours.push(line(p[0], p[1], q[0], q[1]));
    });
  }
  return stage(
    CARD.w,
    CARD.h,
    surfaces,
    { x: CARD.x, y: CARD.y },
    {
      pool: a * 1.9,
      shadow: (x, z) => {
        const along = clamp01((x * SHADOW.x + z * SHADOW.z) / (reach + half));
        const body = (1 - smoothstep(-a * 0.08, a * 0.08, polygonDistance(cast, x, z))) * (1 - 0.4 * along);
        return Math.max(body, 0.95 * contact(polygonDistance(footprint, x, z), a * 0.12));
      },
    },
    [contours.join('')],
  );
}

/* ---------- Геометрия на полу ---------- */

function convexHull(points: [number, number][]): [number, number][] {
  const pts = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Расстояние со знаком от точки до выпуклого многоугольника (обход против часовой): внутри — отрицательное */
function polygonDistance(poly: [number, number][], x: number, y: number): number {
  let nearest = Infinity;
  let inside = true;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    const dx = x2 - x1;
    const dy = y2 - y1;
    if ((x - x1) * dy - (y - y1) * dx > 0) inside = false;
    const t = clamp01(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1));
    nearest = Math.min(nearest, Math.hypot(x - x1 - dx * t, y - y1 - dy * t));
  }
  return inside ? -nearest : nearest;
}
