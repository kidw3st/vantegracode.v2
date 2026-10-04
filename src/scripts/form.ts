/**
 * Форма заявки: проверка при потере фокуса и при отправке, ошибки через aria-describedby,
 * общий статус — aria-live. В npm run dev и в превью на GitHub Pages (PUBLIC_PREVIEW=1, там нет PHP)
 * отправка имитируется: успех через 800 мс, ошибка — ?mock=error.
 */
import { onPage } from './lifecycle.ts';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEGRAM = /^(?:@|(?:https?:\/\/)?t\.me\/)[a-zA-Z][a-zA-Z0-9_]{4,31}$/;
const PHONE = /^\+?[\d\s()-]{10,20}$/;

/** Телефон, @username (или ссылка t.me) либо e-mail */
export function isContact(value: string): boolean {
  const v = value.trim();
  if (EMAIL.test(v) || TELEGRAM.test(v)) return true;
  if (!PHONE.test(v)) return false;
  const digits = v.replace(/\D/g, '').length;
  return digits >= 10 && digits <= 15;
}

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type Messages = Record<string, string>;

declare global {
  interface Window {
    ym?: (id: number, action: string, ...args: unknown[]) => void;
  }
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function send(data: Record<string, string>): Promise<boolean> {
  if (import.meta.env.DEV || import.meta.env.PUBLIC_PREVIEW === '1') {
    await wait(800);
    return new URLSearchParams(window.location.search).get('mock') !== 'error';
  }
  const response = await fetch('/api/lead.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) return false;
  const result: unknown = await response.json().catch(() => null);
  return typeof result === 'object' && result !== null && (result as { ok?: unknown }).ok === true;
}

function reachGoal(): void {
  const id = Number(document.querySelector<HTMLElement>('[data-cookie]')?.dataset.metrikaId);
  if (id && typeof window.ym === 'function') window.ym(id, 'reachGoal', 'lead_sent');
}

onPage(() => {
  const forms = [...document.querySelectorAll<HTMLFormElement>('[data-lead-form]')];
  if (!forms.length) return;
  const ac = new AbortController();
  const { signal } = ac;

  for (const form of forms) {
    const wrap = form.closest<HTMLElement>('[data-lead]');
    const success = wrap?.querySelector<HTMLElement>('[data-success]');
    const status = form.querySelector<HTMLElement>('[data-status]');
    const submit = form.querySelector<HTMLButtonElement>('[data-submit]');
    const submitLabel = submit?.querySelector<HTMLElement>('.btn__label');
    const idleLabel = submitLabel?.textContent?.trim() ?? '';
    const errorTemplate = form.querySelector<HTMLTemplateElement>('template[data-send-error]');
    const messages: Messages = JSON.parse(form.dataset.messages ?? '{}');
    const loadedAt = Date.now();

    const ts = form.querySelector<HTMLInputElement>('[data-ts]');
    if (ts) ts.value = String(loadedAt);

    const field = (name: string) => form.elements.namedItem(name) as Field | null;

    const rules: Record<string, (el: Field) => string> = {
      name: (el) => {
        const v = el.value.trim();
        if (!v) return messages.nameRequired ?? '';
        if (v.length < 2) return messages.nameShort ?? '';
        if (v.length > 80) return messages.nameLong ?? '';
        return '';
      },
      contact: (el) => {
        const v = el.value.trim();
        if (!v) return messages.contactRequired ?? '';
        return isContact(v) ? '' : (messages.contactInvalid ?? '');
      },
      message: (el) => (el.value.length > 2000 ? (messages.messageLong ?? '') : ''),
      consent_pd: (el) => ((el as HTMLInputElement).checked ? '' : (messages.consentPd ?? '')),
      consent_policy: (el) => ((el as HTMLInputElement).checked ? '' : (messages.consentPolicy ?? '')),
    };

    const show = (name: string, message: string) => {
      const box = form.querySelector(`[data-field="${name}"]`);
      const error = form.querySelector(`[data-error-for="${name}"]`);
      if (error) error.textContent = message;
      box?.classList.toggle('is-invalid', Boolean(message));
      const el = field(name);
      if (message) el?.setAttribute('aria-invalid', 'true');
      else el?.removeAttribute('aria-invalid');
    };

    const check = (name: string): boolean => {
      const el = field(name);
      const rule = rules[name];
      if (!el || !rule) return true;
      const message = rule(el);
      show(name, message);
      return !message;
    };

    for (const name of Object.keys(rules)) {
      const el = field(name);
      if (!el) continue;
      const isCheckbox = el instanceof HTMLInputElement && el.type === 'checkbox';
      if (!isCheckbox) el.addEventListener('blur', () => check(name), { signal });
      el.addEventListener(
        isCheckbox ? 'change' : 'input',
        () => {
          if (isCheckbox || el.getAttribute('aria-invalid') === 'true') check(name);
        },
        { signal },
      );
    }

    // Авторост поля «Коротко о задаче», где нет field-sizing
    const textarea = form.querySelector<HTMLTextAreaElement>('[data-autogrow]');
    if (textarea && !CSS.supports('field-sizing', 'content')) {
      const grow = () => {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
      };
      textarea.addEventListener('input', grow, { signal });
    }

    form.addEventListener(
      'submit',
      async (event) => {
        event.preventDefault();
        if (form.getAttribute('aria-busy') === 'true') return;

        const results = Object.keys(rules).map((name) => ({ name, ok: check(name) }));
        const firstInvalid = results.find((result) => !result.ok);
        if (firstInvalid) {
          if (status) status.textContent = form.dataset.invalid ?? '';
          field(firstInvalid.name)?.focus();
          return;
        }

        status?.replaceChildren();
        form.setAttribute('aria-busy', 'true');
        if (submit) submit.disabled = true;
        if (submitLabel) submitLabel.textContent = form.dataset.sending ?? idleLabel;

        const data: Record<string, string> = {};
        new FormData(form).forEach((value, key) => {
          if (typeof value === 'string') data[key] = value;
        });
        data.elapsed = String(Date.now() - loadedAt);

        let ok = false;
        try {
          ok = await send(data);
        } catch {
          ok = false;
        }

        form.removeAttribute('aria-busy');
        if (submit) submit.disabled = false;
        if (submitLabel) submitLabel.textContent = idleLabel;

        if (ok && success) {
          // успех встаёт на место формы той же высоты — блок и страница под ним не прыгают
          success.style.minHeight = `${form.offsetHeight}px`;
          form.hidden = true;
          success.hidden = false;
          success.focus();
          const orbits = success.querySelector('[data-orbits]');
          requestAnimationFrame(() => orbits?.classList.add('is-drawing'));
          reachGoal();
        } else if (errorTemplate && status) {
          status.replaceChildren(errorTemplate.content.cloneNode(true));
        }
      },
      { signal },
    );
  }

  return () => ac.abort();
});
