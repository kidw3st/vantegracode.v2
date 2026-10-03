/**
 * Эхо-орбиты: эллипсы с наклоном −12° и ry / rx = 0,306 (брендбук, стр. 6 и 13).
 * Внутренний эллипс целиком содержит логотип вместе с охранным полем —
 * это считается здесь, а не на глаз, с учётом покачивания колец.
 */

export const ORBIT_ANGLE = -12;
export const ORBIT_RATIO = 0.306;
/** Амплитуда покачивания колец в покое, градусы */
export const ORBIT_WOBBLE = 0.8;

const rad = (deg: number) => (deg * Math.PI) / 180;

export interface Ring {
  rx: number;
  ry: number;
}

/**
 * Минимальный rx эллипса с наклоном angle и ry = ratio · rx (центр в начале координат),
 * внутри которого лежат все четыре угла прямоугольника ±hw × ±hh.
 */
export function minRx(hw: number, hh: number, angle = ORBIT_ANGLE, ratio = ORBIT_RATIO): number {
  const a = rad(angle);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  let max = 0;
  for (const [x, y] of [
    [hw, hh],
    [hw, -hh],
    [-hw, hh],
    [-hw, -hh],
  ] as const) {
    // точка в системе координат эллипса: поворот на −angle
    const u = x * cos + y * sin;
    const v = -x * sin + y * cos;
    max = Math.max(max, Math.hypot(u, v / ratio));
  }
  return max;
}

/** Лежат ли все углы прямоугольника строго внутри эллипса */
export function containsBox(ring: Ring, hw: number, hh: number, angle = ORBIT_ANGLE): boolean {
  const a = rad(angle);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [
    [hw, hh],
    [hw, -hh],
    [-hw, hh],
    [-hw, -hh],
  ].every(([x = 0, y = 0]) => {
    const u = x * cos + y * sin;
    const v = -x * sin + y * cos;
    return (u / ring.rx) ** 2 + (v / ring.ry) ** 2 < 1;
  });
}

/** Полуразмеры охватывающего прямоугольника повёрнутого эллипса */
export function ringExtent(ring: Ring, angle = ORBIT_ANGLE): { x: number; y: number } {
  const a = rad(angle);
  return {
    x: Math.sqrt((ring.rx * Math.cos(a)) ** 2 + (ring.ry * Math.sin(a)) ** 2),
    y: Math.sqrt((ring.rx * Math.sin(a)) ** 2 + (ring.ry * Math.cos(a)) ** 2),
  };
}

export interface LogoRingsOptions {
  /** полуширина и полувысота логотипа вместе с охранным полем */
  hw: number;
  hh: number;
  rings: number;
  /** шаг между кольцами, множитель */
  step?: number;
  /** запас внутреннего кольца, доля */
  margin?: number;
}

/** Кольца вокруг логотипа. Бросает ошибку, если внутреннее кольцо задевает логотип. */
export function logoRings({ hw, hh, rings, step = 1.42, margin = 0.04 }: LogoRingsOptions): Ring[] {
  const samples = 16;
  let rx0 = 0;
  for (let i = 0; i <= samples; i++) {
    const angle = ORBIT_ANGLE - ORBIT_WOBBLE + (2 * ORBIT_WOBBLE * i) / samples;
    rx0 = Math.max(rx0, minRx(hw, hh, angle));
  }
  rx0 *= 1 + margin;

  const result = Array.from({ length: rings }, (_, i) => {
    const rx = rx0 * step ** i;
    return { rx, ry: rx * ORBIT_RATIO };
  });

  const inner = result[0];
  for (let i = 0; i <= samples; i++) {
    const angle = ORBIT_ANGLE - ORBIT_WOBBLE + (2 * ORBIT_WOBBLE * i) / samples;
    if (!inner || !containsBox(inner, hw, hh, angle)) {
      throw new Error('Эхо-орбита пересекает логотип: внутренний эллипс не содержит логотип с охранным полем');
    }
  }
  return result;
}
