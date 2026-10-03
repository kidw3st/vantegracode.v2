/**
 * Шапка и мобильное меню.
 * - подложка шапки после прокрутки на 24 px;
 * - активная ссылка и aria-current после каждого перехода (шапка сохраняется между страницами);
 * - меню: Esc и клик по ссылке закрывают, фокус внутри, прокрутка страницы заблокирована,
 *   знак для шапки подгружается только при первом открытии.
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

const SCROLL_THRESHOLD = 24;
const MENU_DURATION = 250;

onPage(() => {
  const ac = new AbortController();
  const { signal } = ac;
  const header = document.querySelector<HTMLElement>('[data-header]');
  if (!header) return () => ac.abort();

  // Подложка шапки
  let ticking = false;
  const updateScrolled = () => {
    header.classList.toggle('is-scrolled', window.scrollY > SCROLL_THRESHOLD);
    ticking = false;
  };
  updateScrolled();
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateScrolled);
    },
    { passive: true, signal },
  );

  // Активные ссылки в шапке и меню
  const path = window.location.pathname;
  document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]').forEach((link) => {
    const href = link.getAttribute('href') ?? '';
    if (path === href) link.setAttribute('aria-current', 'page');
    else if (href !== '/' && path.startsWith(href)) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });

  // Мобильное меню
  const toggle = header.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const menu = document.querySelector<HTMLElement>('[data-menu]');
  if (!toggle || !menu) return () => ac.abort();

  const root = document.documentElement;
  const logo = header.querySelector<HTMLAnchorElement>('[data-header-logo]');
  const markSlot = header.querySelector<HTMLElement>('[data-header-mark]');
  const markTemplate = header.querySelector<HTMLTemplateElement>('[data-mark-template]');
  let open = false;
  let hideTimer = 0;

  const outside = () =>
    [
      document.querySelector('main'),
      document.querySelector('footer'),
      document.querySelector('.skip-link'),
      document.querySelector('[data-cookie]'),
    ].filter((el): el is HTMLElement => el instanceof HTMLElement);

  const focusables = () =>
    [logo, toggle, ...menu.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')].filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );

  const setOpen = (next: boolean, restoreFocus = true) => {
    if (next === open) return;
    open = next;
    window.clearTimeout(hideTimer);
    toggle.setAttribute('aria-expanded', String(next));
    toggle.setAttribute('aria-label', (next ? toggle.dataset.labelClose : toggle.dataset.labelOpen) ?? '');
    root.classList.toggle('menu-open', next);
    for (const el of outside()) el.inert = next;

    if (next) {
      if (markSlot && markTemplate && !markSlot.firstElementChild) {
        markSlot.append(markTemplate.content.cloneNode(true));
      }
      menu.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
    } else {
      menu.classList.remove('is-open');
      hideTimer = window.setTimeout(
        () => {
          if (!open) menu.hidden = true;
        },
        prefersReducedMotion() ? 0 : MENU_DURATION,
      );
      if (restoreFocus) toggle.focus();
    }
  };

  toggle.addEventListener('click', () => setOpen(!open), { signal });

  menu.addEventListener(
    'click',
    (event) => {
      if (event.target instanceof Element && event.target.closest('a')) setOpen(false, false);
    },
    { signal },
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (!open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!items.includes(document.activeElement as HTMLElement)) {
        event.preventDefault();
        first.focus();
      }
    },
    { signal },
  );

  const desktop = window.matchMedia('(min-width: 1200px)');
  desktop.addEventListener(
    'change',
    (event) => {
      if (event.matches) setOpen(false, false);
    },
    { signal },
  );

  return () => {
    ac.abort();
    window.clearTimeout(hideTimer);
    if (open) {
      open = false;
      root.classList.remove('menu-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', toggle.dataset.labelOpen ?? '');
      for (const el of outside()) el.inert = false;
    }
  };
});
