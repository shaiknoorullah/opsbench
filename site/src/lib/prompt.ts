/* The one newsletter prompt, done tastefully: appears once per 14 days at
   70% scroll depth or on desktop exit-intent, never in the first 45 seconds,
   never for subscribers, always dismissible. A forensic brand with a spammy
   popup dies instantly — this is the entire popup budget. */

import { track } from './analytics';

const SEEN_KEY = 'ob-prompt-seen';
const SUBSCRIBED_KEY = 'ob-subscribed';
const COOLDOWN_DAYS = 14;
const MIN_DWELL_MS = 45_000;

function eligible(): boolean {
  try {
    if (localStorage.getItem(SUBSCRIBED_KEY)) return false;
    const seen = Number(localStorage.getItem(SEEN_KEY) ?? 0);
    return Date.now() - seen > COOLDOWN_DAYS * 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

export function initPrompt() {
  const dialog = document.getElementById('news-prompt');
  if (!(dialog instanceof HTMLElement) || !eligible()) return;

  const openedAt = Date.now();
  let shown = false;

  const show = (trigger: string) => {
    if (shown || Date.now() - openedAt < MIN_DWELL_MS || !eligible()) return;
    shown = true;
    dialog.classList.add('show');
    track('newsletter_prompt_shown', { trigger });
    try {
      localStorage.setItem(SEEN_KEY, String(Date.now()));
    } catch {
      /* fine */
    }
  };

  const hide = () => dialog.classList.remove('show');
  dialog.querySelector('[data-dismiss]')?.addEventListener('click', hide);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  // 70% scroll depth
  const onScroll = () => {
    const max = Math.max(1, document.body.scrollHeight - innerHeight);
    if (scrollY / max > 0.7) {
      show('scroll_depth');
      removeEventListener('scroll', onScroll);
    }
  };
  addEventListener('scroll', onScroll, { passive: true });

  // desktop exit-intent
  if (matchMedia('(pointer: fine)').matches) {
    document.documentElement.addEventListener('mouseleave', (e) => {
      if (e.clientY <= 0) show('exit_intent');
    });
  }
}
