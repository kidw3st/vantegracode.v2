/**
 * Заливка кнопки от точки входа курсора (Button fill, решение владельца). При входе ставим центр круга
 * заливки в точку, где курсор пересёк край кнопки, и диаметр, накрывающий кнопку целиком; --fill
 * переходом растёт до 1 (стили — Button.astro). При выходе заливка стекает в точку выхода; если курсор
 * ушёл раньше, чем кнопка залилась, круг не переносим — сжимается туда же, откуда рос.
 * Фокус с клавиатуры заливает от центра. Касания не трогаем: на телефоне кнопка просто ведёт по ссылке.
 */
import { onPage } from './lifecycle.ts';

onPage(() => {
  const buttons = [...document.querySelectorAll<HTMLElement>('.btn--fill')];
  if (!buttons.length) return;
  const ac = new AbortController();
  const { signal } = ac;

  for (const button of buttons) {
    /**
     * Центр круга и диаметр, при котором круг накрывает все четыре угла. Считаем от внутреннего края
     * рамки: от него ставятся круг и копия надписи (position: absolute), по нему же обрезает overflow —
     * иначе копия надписи под заливкой съезжает на толщину рамки
     */
    const aim = (clientX: number, clientY: number) => {
      const box = button.getBoundingClientRect();
      const width = button.clientWidth;
      const height = button.clientHeight;
      const x = Math.min(width, Math.max(0, clientX - box.left - button.clientLeft));
      const y = Math.min(height, Math.max(0, clientY - box.top - button.clientTop));
      const reach = Math.max(
        Math.hypot(x, y),
        Math.hypot(width - x, y),
        Math.hypot(x, height - y),
        Math.hypot(width - x, height - y),
      );
      button.style.setProperty('--fx', `${x.toFixed(1)}px`);
      button.style.setProperty('--fy', `${y.toFixed(1)}px`);
      button.style.setProperty('--fd', `${(reach * 2 + 2).toFixed(1)}px`);
      button.style.setProperty('--bw', `${width}px`);
      button.style.setProperty('--bh', `${height}px`);
    };
    const filled = () => parseFloat(getComputedStyle(button).getPropertyValue('--fill')) || 0;

    button.addEventListener(
      'pointerenter',
      (event) => {
        if (event.pointerType === 'touch') return;
        aim(event.clientX, event.clientY);
        button.classList.add('is-filled');
      },
      { signal },
    );
    button.addEventListener(
      'pointerleave',
      (event) => {
        if (event.pointerType === 'touch') return;
        // залита целиком — переносим центр в точку выхода (круг всё равно накрывает кнопку, скачка нет)
        if (filled() > 0.97) aim(event.clientX, event.clientY);
        button.classList.remove('is-filled');
      },
      { signal },
    );
    button.addEventListener(
      'focus',
      () => {
        if (!button.matches(':focus-visible')) return;
        const box = button.getBoundingClientRect();
        aim(box.left + box.width / 2, box.top + box.height / 2);
        button.classList.add('is-filled');
      },
      { signal },
    );
    button.addEventListener('blur', () => button.classList.remove('is-filled'), { signal });
  }

  return () => ac.abort();
});
