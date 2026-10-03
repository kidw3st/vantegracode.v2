/**
 * Фильтр-чипы («Работы» — по услугам, «Блог» — по тегам). Фильтр отражается в адресе: ?service= / ?tag=.
 * Без JS чипов нет, видны все карточки.
 */
import { onPage } from './lifecycle.ts';

onPage(() => {
  const root = document.querySelector<HTMLElement>('[data-filters]');
  if (!root) return;
  const ac = new AbortController();
  const param = root.dataset.param ?? 'service';
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-filter]')];
  const items = [...document.querySelectorAll<HTMLElement>('[data-filter-item]')];
  const status = document.querySelector<HTMLElement>('[data-filter-status]');

  const apply = (value: string, updateUrl = true) => {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.filter === value));
    let shown = 0;
    for (const item of items) {
      const values = (item.dataset.filterItem ?? '').split(' ');
      const visible = value === 'all' || values.includes(value);
      item.hidden = !visible;
      if (visible) shown += 1;
    }
    if (status) status.textContent = `${status.dataset.prefix ?? ''} ${shown}`.trim();
    if (updateUrl) {
      const url = new URL(window.location.href);
      if (value === 'all') url.searchParams.delete(param);
      else url.searchParams.set(param, value);
      window.history.replaceState(window.history.state, '', url);
    }
  };

  const initial = new URL(window.location.href).searchParams.get(param);
  apply(initial && buttons.some((b) => b.dataset.filter === initial) ? initial : 'all', false);

  for (const button of buttons) {
    button.addEventListener('click', () => apply(button.dataset.filter ?? 'all'), { signal: ac.signal });
  }
  return () => ac.abort();
});
