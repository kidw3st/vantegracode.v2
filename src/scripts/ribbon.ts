/**
 * Лента карточек (Ribbon.astro): «назад / вперёд» двигают ленту на одну карточку, лента замкнута.
 * Слева и справа от карточек — их копии (скрыты от чтения с экрана, недоступны с клавиатуры).
 * --pos — номер карточки у левого края; после каждого шага он среди настоящих карточек (n…2n−1).
 * Если шаг выводит за них, лента сначала без перехода встаёт на то же место на n карточек ближе —
 * картинка та же, копии одинаковые, — и уже оттуда едет: за последней сразу первая, без отката.
 * На телефоне ленту листают и пальцем (касание, перо); вертикальную прокрутку страницы ведёт браузер.
 */
import { onPage } from './lifecycle.ts';

/** px — с этого сдвига касание считается перетаскиванием ленты */
const DRAG_START = 6;
/** px/мс — быстрый взмах листает на карточку, даже если палец прошёл меньше половины */
const FLICK = 0.3;
/** мс — палец остановился раньше, чем отпустил ленту: взмаха не было */
const FLICK_PAUSE = 100;

interface Drag {
  id: number;
  startX: number;
  from: number;
  moved: boolean;
  lastX: number;
  lastT: number;
  speed: number;
}

onPage(() => {
  const ribbons = [...document.querySelectorAll<HTMLElement>('[data-ribbon]')];
  if (!ribbons.length) return;
  const ac = new AbortController();
  const { signal } = ac;

  for (const ribbon of ribbons) {
    const viewport = ribbon.querySelector<HTMLElement>('.ribbon__viewport');
    const track = ribbon.querySelector<HTMLElement>('.ribbon__track');
    const counter = ribbon.querySelector<HTMLElement>('[data-ribbon-current]');
    const prev = ribbon.querySelector<HTMLElement>('[data-ribbon-prev]');
    const next = ribbon.querySelector<HTMLElement>('[data-ribbon-next]');
    if (!viewport || !track || !prev || !next) continue;

    // повторный запуск на той же странице — старые копии убираем
    for (const clone of track.querySelectorAll('[data-ribbon-clone]')) clone.remove();
    const slides = [...track.children] as HTMLElement[];
    const n = slides.length;
    const [first, second] = slides;
    if (!first || !second) continue;

    const copy = (slide: HTMLElement) => {
      const clone = slide.cloneNode(true) as HTMLElement;
      clone.dataset.ribbonClone = '';
      clone.setAttribute('aria-hidden', 'true');
      clone.inert = true;
      for (const el of clone.querySelectorAll('[id]')) el.removeAttribute('id');
      return clone;
    };
    track.prepend(...slides.map(copy));
    track.append(...slides.map(copy));

    let pos = n;

    /** шаг ленты в px: карточка и зазор */
    const step = () => second.offsetLeft - first.offsetLeft;

    /** где лента сейчас, в карточках, — и посреди перехода */
    const visual = () => {
      const width = step();
      if (!width) return pos;
      return -new DOMMatrixReadOnly(getComputedStyle(track).transform).m41 / width;
    };

    /** поставить ленту: с переходом или сразу, без него */
    const place = (value: number, animate: boolean) => {
      if (!animate) track.style.transition = 'none';
      track.style.setProperty('--pos', String(value));
      if (!animate) {
        void track.offsetWidth;
        track.style.removeProperty('transition');
      }
    };

    /** ехать к карточке target (номер у левого края); за настоящими — сначала перескок на n */
    const moveTo = (target: number) => {
      const shift = target < n ? n : target >= 2 * n ? -n : 0;
      if (shift) place(visual() + shift, false);
      pos = target + shift;
      place(pos, true);
      if (counter) counter.textContent = String(pos - n + 1).padStart(2, '0');
    };

    place(pos, false);

    prev.addEventListener('click', () => moveTo(pos - 1), { signal });
    next.addEventListener('click', () => moveTo(pos + 1), { signal });

    // ---------- Пальцем ----------
    let drag: Drag | null = null;

    viewport.addEventListener(
      'pointerdown',
      (event) => {
        if (event.pointerType === 'mouse' || !event.isPrimary) return;
        drag = {
          id: event.pointerId,
          startX: event.clientX,
          from: visual(),
          moved: false,
          lastX: event.clientX,
          lastT: event.timeStamp,
          speed: 0,
        };
      },
      { signal },
    );

    viewport.addEventListener(
      'pointermove',
      (event) => {
        if (!drag || event.pointerId !== drag.id) return;
        const dx = event.clientX - drag.startX;
        const width = step();
        if (!width) return;
        if (!drag.moved) {
          if (Math.abs(dx) < DRAG_START) return;
          drag.moved = true;
          viewport.setPointerCapture(event.pointerId);
          track.style.transition = 'none';
        }
        const dt = event.timeStamp - drag.lastT;
        if (dt > 0) drag.speed = drag.speed * 0.4 + ((event.clientX - drag.lastX) / dt) * 0.6;
        drag.lastX = event.clientX;
        drag.lastT = event.timeStamp;
        track.style.setProperty('--pos', String(drag.from - dx / width));
      },
      { signal },
    );

    const release = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const { from, moved, startX, lastX, lastT, speed } = drag;
      drag = null;
      if (!moved) return;
      track.style.removeProperty('transition');
      const base = Math.round(from);
      let target = Math.round(from - (lastX - startX) / (step() || 1));
      const flick = event.type === 'pointerup' && event.timeStamp - lastT < FLICK_PAUSE && Math.abs(speed) > FLICK;
      if (target === base && flick) target = base + (speed < 0 ? 1 : -1);
      moveTo(target);
    };
    viewport.addEventListener('pointerup', release, { signal });
    viewport.addEventListener('pointercancel', release, { signal });
  }

  return () => ac.abort();
});
