/* Progressive-enhancement form handler: plain HTML forms, intercepted and
   validated with the SAME zod schema the endpoint uses, posted as JSON.
   Captures UTM attribution and emits analytics events on success. */

import { contactSchema, subscribeSchema } from './schemas';
import { track } from '../analytics';

const UTM_KEY = 'ob-utm';

/** first-touch UTM attribution, persisted for the session's later submits */
export function captureUtm() {
  try {
    const params = new URLSearchParams(location.search);
    const utm: Record<string, string> = {};
    for (const [k, v] of params) {
      if (k.startsWith('utm_') && v) utm[k] = v.slice(0, 120);
    }
    if (Object.keys(utm).length && !localStorage.getItem(UTM_KEY)) {
      localStorage.setItem(UTM_KEY, JSON.stringify(utm));
    }
  } catch {
    /* storage unavailable */
  }
}

function storedUtm(): Record<string, string> | undefined {
  try {
    const raw = localStorage.getItem(UTM_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function setStatus(form: HTMLFormElement, kind: 'ok' | 'err' | 'busy', msg: string) {
  const el = form.querySelector<HTMLElement>('[data-status]');
  if (!el) return;
  el.textContent = msg;
  el.dataset.kind = kind;
}

export function initForms(root: ParentNode = document) {
  captureUtm();

  root.querySelectorAll<HTMLFormElement>('form[data-form]').forEach((form) => {
    const kind = form.dataset.form as 'subscribe' | 'contact';
    const schema = kind === 'contact' ? contactSchema : subscribeSchema;
    const ts = form.querySelector<HTMLInputElement>('input[name="ts"]');
    if (ts) ts.value = String(Date.now());

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data: Record<string, unknown> = Object.fromEntries(new FormData(form).entries());
      data.utm = storedUtm();

      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        setStatus(form, 'err', parsed.error.issues[0]?.message ?? 'Check the form and try again');
        return;
      }

      setStatus(form, 'busy', 'sending…');
      try {
        const res = await fetch(`/api/${kind}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(parsed.data),
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (res.ok && body.ok) {
          setStatus(form, 'ok', kind === 'subscribe' ? 'sealed. check your inbox.' : 'received. we read everything.');
          form.querySelectorAll('input:not([type=hidden]), textarea').forEach((i) => ((i as HTMLInputElement).value = ''));
          track(kind === 'subscribe' ? 'newsletter_subscribe' : 'contact_submit');
          try {
            localStorage.setItem('ob-subscribed', '1');
          } catch {
            /* fine */
          }
        } else {
          setStatus(form, 'err', body.error ?? 'Something went wrong — try again');
        }
      } catch {
        setStatus(form, 'err', 'Network error — try again');
      }
    });
  });
}
