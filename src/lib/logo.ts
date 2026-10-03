/**
 * Геометрия логотипа из SVG владельца (viewBox).
 * Знак во всех версиях имеет одинаковую ширину — 962.81 ед.
 * Охранное поле — 15 % ширины знака (брендбук, стр. 9).
 */

export type LogoVariant = 'mark' | 'vertical' | 'horizontal' | 'wordmark';
export type LogoColor = 'chalk' | 'soot';

export interface LogoGeometry {
  /** ширина и высота viewBox */
  w: number;
  h: number;
  /** ширина знака в тех же единицах (у надписи знака нет) */
  markW: number | null;
  /** минимальная ширина на экране, px */
  minPx: number;
}

const MARK_W = 962.81;

export const LOGO: Record<LogoVariant, LogoGeometry> = {
  mark: { w: 962.81, h: 733.04, markW: MARK_W, minPx: 24 },
  vertical: { w: 962.81, h: 939.71, markW: MARK_W, minPx: 112 },
  horizontal: { w: 2632.63, h: 733.04, markW: MARK_W, minPx: 140 },
  wordmark: { w: 1709.96, h: 298.58, markW: null, minPx: 80 },
};

export const CLEARSPACE = 0.15;

/** Охранное поле в долях ширины всего логотипа */
export function clearspace(variant: LogoVariant): number {
  const g = LOGO[variant];
  return g.markW == null ? CLEARSPACE * (g.h / g.w) : (CLEARSPACE * g.markW) / g.w;
}
