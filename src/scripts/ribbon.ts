/**
 * Ленты (решение владельца): ряд карточек едет целиком на одну карточку за шаг, замкнут по кругу; кнопки
 * «назад / вперёд» и номер — RibbonControls, стили — styles/ribbon.css. [data-ribbon] — лента;
 * data-ribbon-media — когда включать (ряды карточек главной — только на телефоне, шире — их обычная сетка),
 * без него — всегда (цены). Режим ленты — класс .is-ribbon; выключение по ширине возвращает разметку как была.
 * Слева и справа от карточек — их копии (скрыты от чтения с экрана, недоступны с клавиатуры).
 * --pos — номер карточки у левого края (на телефоне она по центру); после каждого шага он среди настоящих
 * карточек (n…2n−1). Если шаг выводит за них, лента сначала без перехода встаёт на то же место на n карточек
 * ближе — картинка та же, копии одинаковые, — и уже оттуда едет: за последней сразу первая, без отката.
 * На телефоне ленту листают и пальцем (касание, перо); вертикальную прокрутку страницы ведёт браузер.
 * Ряд с появлением при прокрутке ([data-reveal] на нём самом) в режиме ленты сдвинут за край экрана,
 * и наблюдатель появления его не видит, — проявляем его по окну ленты.
 */
import { onPage } from './lifecycle.ts';

/** px — с этого сдвига касание считается перетаскиванием ленты */
const DRAG_START = 6;
/** px/мс — быстрый взмах листает на карточку, даже если палец прошёл меньше половины */
const FLICK = 0.3;
/** мс — палец остановился раньше, чем отпустил ленту: взмаха не было */
const FLICK_PAUSE = 100;
/** доля окна ленты (или высоты экрана), с которой ряд проявляется — как в reveal.ts */
const REVEAL = 0.15;

interface Drag {
  id: number;
  startX: number;
  from: number;
  moved: boolean;
  lastX: number;
  lastT: number;
  speed: number;
}

/** Выключатель режима ленты: restore — вернуть разметку как была (при смене ширины экрана) */
type Stop = (restore: boolean) => void;

onPage(() => {
  const ribbons = [...document.querySelectorAll<HTMLElement>('[data-ribbon]')];
  if (!ribbons.length) return;
  const cleanups = ribbons.map(watch);
  return () => cleanups.forEach((cleanup) => cleanup());
});

/** Включает и выключает ленту по data-ribbon-media */
function watch(ribbon: HTMLElement): () => void {
  const query = ribbon.dataset.ribbonMedia;
  const media = query ? window.matchMedia(query) : null;
  let stop: Stop | null = null;
  const sync = () => {
    const on = !media || media.matches;
    if (on && !stop) stop = start(ribbon);
    else if (!on && stop) {
      stop(true);
      stop = null;
    }
  };
  sync();
  media?.addEventListener('change', sync);
  // уход со страницы — только снять обработчики: разметку уносит смена страницы
  return () => {
    media?.removeEventListener('change', sync);
    stop?.(false);
  };
}

function start(ribbon: HTMLElement): Stop | null {
  const viewport = ribbon.querySelector<HTMLElement>('.ribbon__viewport');
  const track = ribbon.querySelector<HTMLElement>('.ribbon__track');
  const counter = ribbon.querySelector<HTMLElement>('[data-ribbon-current]');
  const prev = ribbon.querySelector<HTMLElement>('[data-ribbon-prev]');
  const next = ribbon.querySelector<HTMLElement>('[data-ribbon-next]');
  if (!viewport || !track || !prev || !next) return null;

  const removeClones = () => {
    for (const clone of track.querySelectorAll(':scope > [data-ribbon-clone]')) clone.remove();
  };
  removeClones();
  const slides = [...track.children] as HTMLElement[];
  const n = slides.length;
  const [first, second] = slides;
  if (!first || !second) return null;

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
  ribbon.classList.add('is-ribbon');

  const ac = new AbortController();
  const { signal } = ac;
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

  const show = () => {
    if (counter) counter.textContent = String(pos - n + 1).padStart(2, '0');
  };

  /** ехать к карточке target (номер у левого края); за настоящими — сначала перескок на n */
  const moveTo = (target: number) => {
    const shift = target < n ? n : target >= 2 * n ? -n : 0;
    if (shift) place(visual() + shift, false);
    pos = target + shift;
    place(pos, true);
    show();
  };

  place(pos, false);
  show();

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

  // ---------- Появление ----------
  let reveal: IntersectionObserver | null = null;
  if (track.hasAttribute('data-reveal') && !track.classList.contains('is-in')) {
    reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const share = entry.intersectionRect.height / window.innerHeight;
          if (entry.isIntersecting && (entry.intersectionRatio >= REVEAL || share >= REVEAL)) {
            track.classList.add('is-in');
            reveal?.disconnect();
          }
        }
      },
      { threshold: [0, 0.05, REVEAL, 0.3, 0.6, 1] },
    );
    reveal.observe(viewport);
  }

  return (restore: boolean) => {
    ac.abort();
    reveal?.disconnect();
    if (!restore) return;
    removeClones();
    ribbon.classList.remove('is-ribbon');
    track.style.removeProperty('--pos');
    track.style.removeProperty('transition');
  };
}
