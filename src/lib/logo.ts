/**
 * Геометрия логотипа из SVG владельца.
 * viewBox файлов включает поля; сам рисунок — art (x0, y0, x1, y1).
 * Охранное поле — 15 % ширины знака (рисунка, 768.77 ед.), отсчитывается от края рисунка (брендбук, стр. 9).
 */

export type LogoVariant = 'mark' | 'vertical' | 'horizontal' | 'wordmark';
export type LogoColor = 'chalk' | 'soot';

export interface LogoGeometry {
  /** ширина и высота viewBox */
  w: number;
  h: number;
  /** рисунок внутри viewBox: x0, y0, x1, y1 */
  art: [number, number, number, number];
  /** минимальная ширина на экране, px */
  minPx: number;
}

/** Ширина рисунка знака (V с орбитой) — одинакова во всех версиях с знаком */
const MARK_ART_W = 768.77;

export const LOGO: Record<LogoVariant, LogoGeometry> = {
  mark: { w: 962.81, h: 733.04, art: [97.02, 97.02, 865.79, 636.02], minPx: 24 },
  vertical: { w: 962.81, h: 939.71, art: [94.87, 97.02, 867.94, 848.74], minPx: 112 },
  horizontal: { w: 2632.63, h: 733.04, art: [97.02, 97.02, 2539.77, 636.02], minPx: 140 },
  wordmark: { w: 1709.96, h: 298.58, art: [161.62, 88.42, 1548.34, 210.15], minPx: 80 },
};

export const CLEARSPACE = 0.15;

/**
 * Защищённая зона: рисунок + охранное поле, полуразмеры от центра viewBox,
 * в долях ширины viewBox. Внутренняя эхо-орбита целиком содержит этот прямоугольник.
 */
export function protectedBox(variant: LogoVariant): { hw: number; hh: number } {
  const g = LOGO[variant];
  const [x0, y0, x1, y1] = g.art;
  const cx = g.w / 2;
  const cy = g.h / 2;
  const clear = variant === 'wordmark' ? CLEARSPACE * (y1 - y0) : CLEARSPACE * MARK_ART_W;
  return {
    hw: (Math.max(cx - x0, x1 - cx) + clear) / g.w,
    hh: (Math.max(cy - y0, y1 - cy) + clear) / g.w,
  };
}
