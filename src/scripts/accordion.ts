/** Аккордеон вопросов: aria-expanded на кнопке, высота панели — CSS grid-template-rows */
import { onPage } from './lifecycle.ts';

onPage(() => {
  const triggers = [...document.querySelectorAll<HTMLButtonElement>('[data-accordion-trigger]')];
  if (!triggers.length) return;
  const ac = new AbortController();

  for (const trigger of triggers) {
    const panel = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
    if (!panel) continue;
    const isOpen = panel.classList.contains('is-open');
    trigger.setAttribute('aria-expanded', String(isOpen));
    trigger.addEventListener(
      'click',
      () => {
        const next = trigger.getAttribute('aria-expanded') !== 'true';
        trigger.setAttribute('aria-expanded', String(next));
        panel.classList.toggle('is-open', next);
      },
      { signal: ac.signal },
    );
  }

  return () => ac.abort();
});
