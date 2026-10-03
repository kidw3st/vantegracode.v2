/**
 * Ленты карточек (.rail): на телефоне ряд листается вправо (CSS, base.css).
 * Если лента прокручивается, а внутри нет ссылок и кнопок, ей нужен фокус с клавиатуры —
 * tabindex ставим только пока ряд действительно прокручивается.
 */
import { onPage } from './lifecycle.ts';

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

onPage(() => {
  const rails = [...document.querySelectorAll<HTMLElement>('.rail')];
  if (!rails.length) return;

  const update = (rail: HTMLElement) => {
    const scrollable = rail.scrollWidth > rail.clientWidth + 1;
    const needsFocus = scrollable && !rail.querySelector(FOCUSABLE);
    if (needsFocus) rail.setAttribute('tabindex', '0');
    else rail.removeAttribute('tabindex');
  };

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) update(entry.target as HTMLElement);
  });
  for (const rail of rails) {
    update(rail);
    observer.observe(rail);
  }

  return () => observer.disconnect();
});
