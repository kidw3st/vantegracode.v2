/**
 * Переход от первого экрана к блокам главной: «орбита ложится в линию».
 * При прокрутке пылевой диск сплющивается до тонкой полосы (disc.ts берёт ту же долю прокрутки),
 * эхо-орбиты вокруг знака сплющиваются вместе с ним, знак гаснет на месте,
 * заголовок, лид и кнопки уходят с лёгким параллаксом. Дальше линия-разделитель
 * следующего блока расходится от центра и раскрывает его заголовок (SectionHeader).
 * Двигаем только transform и opacity; при prefers-reduced-motion перехода нет.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

/** Доля прокрутки первого экрана: 0 — наверху, 1 — прокручено 75 % его высоты */
export function heroProgress(hero: HTMLElement): number {
  const height = hero.offsetHeight || 1;
  return Math.min(1, Math.max(0, window.scrollY / (height * 0.75)));
}

const smooth = (p: number) => p * p * (3 - 2 * p);

onPage(() => {
  if (prefersReducedMotion()) return;
  const hero = document.querySelector<HTMLElement>('.hero');
  const logo = hero?.querySelector<HTMLElement>('.hero__logo');
  const orbits = logo?.querySelector<HTMLElement>('.orbits');
  const art = logo?.querySelector<HTMLElement>('.hero__art');
  const copy = hero?.querySelector<HTMLElement>('.hero__copy');
  if (!hero || !logo || !copy) return;

  let raf = 0;
  let applied = -1;

  const apply = () => {
    raf = 0;
    const e = smooth(heroProgress(hero));
    if (Math.abs(e - applied) < 0.001) return;
    applied = e;
    const reset = e === 0;
    // кольца сплющиваются к линии вместе с диском; знак гаснет на месте, в центре диска
    if (orbits) orbits.style.transform = reset ? '' : `scaleY(${(1 - 0.8 * e).toFixed(4)})`;
    if (orbits) orbits.style.opacity = reset ? '' : (1 - 0.85 * e).toFixed(4);
    if (art) art.style.opacity = reset ? '' : Math.max(0, 1 - 1.4 * e).toFixed(4);
    // текст отстаёт от прокрутки и гаснет
    copy.style.transform = reset ? '' : `translate3d(0, ${(e * hero.offsetHeight * 0.18).toFixed(1)}px, 0)`;
    copy.style.opacity = reset ? '' : Math.max(0, 1 - 1.3 * e).toFixed(4);
  };

  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(apply);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  apply();

  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    cancelAnimationFrame(raf);
    for (const el of [orbits, art, copy]) {
      if (!el) continue;
      el.style.transform = '';
      el.style.opacity = '';
    }
  };
});
