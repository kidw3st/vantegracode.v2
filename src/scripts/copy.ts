/** Кнопки «Скопировать»: контакты и ссылка на статью. Подсказка «Скопировано» на 1,8 с. */
import { onPage } from './lifecycle.ts';

const TIP_MS = 1800;

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

onPage(() => {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-copy]')];
  if (!buttons.length) return;
  const ac = new AbortController();
  const timers = new Set<number>();

  for (const button of buttons) {
    button.addEventListener(
      'click',
      async () => {
        const value = button.dataset.copy || window.location.href;
        if (!(await copyText(value))) return;
        const tip = button.querySelector<HTMLElement>('[data-copy-tip]');
        if (tip) tip.textContent = button.dataset.copied ?? '';
        button.classList.add('is-copied');
        const timer = window.setTimeout(() => {
          button.classList.remove('is-copied');
          if (tip) tip.textContent = '';
          timers.delete(timer);
        }, TIP_MS);
        timers.add(timer);
      },
      { signal: ac.signal },
    );
  }

  return () => {
    ac.abort();
    for (const timer of timers) window.clearTimeout(timer);
  };
});
