/* DOM choreography: word-mask reveals, counters, progress rail, copy buttons.
   CSS-transition driven (no animation lib) — the island calls this once. */

import type Lenis from 'lenis';

const REDUCED = typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function splitWords() {
  document.querySelectorAll<HTMLElement>('.reveal-words').forEach((el) => {
    if (el.dataset.split) return;
    el.dataset.split = '1';
    const walk = (node: Node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          (child.textContent ?? '').split(/(\s+)/).forEach((piece) => {
            if (!piece) return;
            if (/^\s+$/.test(piece)) {
              frag.appendChild(document.createTextNode(' '));
              return;
            }
            const w = document.createElement('span');
            w.className = 'w';
            const inner = document.createElement('i');
            inner.textContent = piece;
            w.appendChild(inner);
            frag.appendChild(w);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && (child as Element).tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(el);
  });
}

function primeDelays() {
  document.querySelectorAll<HTMLElement>('.exhibit').forEach((section) => {
    section.querySelectorAll<HTMLElement>('.reveal-words .w > i').forEach((w, i) => {
      w.style.transitionDelay = `${0.1 + i * 0.045}s`;
    });
    section.querySelectorAll<HTMLElement>('.reveal').forEach((el, i) => {
      el.style.transitionDelay = `${0.25 + i * 0.12}s`;
    });
  });
}

function animateCounter(el: HTMLElement) {
  const end = Number(el.dataset.count ?? 0);
  const t0 = performance.now();
  const dur = 1800;
  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(end * eased));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function initDomChoreography(lenis: Lenis | null): () => void {
  splitWords();
  if (!REDUCED) primeDelays();

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.22 },
  );
  document.querySelectorAll('.exhibit').forEach((s) => io.observe(s));

  const ioCount = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          animateCounter(e.target as HTMLElement);
          ioCount.unobserve(e.target);
        }
      }
    },
    { threshold: 0.4 },
  );
  document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => ioCount.observe(el));

  // progress rail + active exhibit marker
  const fill = document.getElementById('rail-fill');
  const railItems = [...document.querySelectorAll<HTMLElement>('#rail li')];
  const sections = [...document.querySelectorAll<HTMLElement>('.exhibit')];
  let railRaf = 0;
  const rail = () => {
    const max = Math.max(1, document.body.scrollHeight - innerHeight);
    const p = Math.min(1, Math.max(0, scrollY / max));
    if (fill) fill.style.transform = `scaleY(${p})`;
    const mid = scrollY + innerHeight / 2;
    let active = 0;
    sections.forEach((s, i) => {
      if (s.offsetTop <= mid) active = i;
    });
    railItems.forEach((li, i) => li.classList.toggle('active', i === active));
    railRaf = requestAnimationFrame(rail);
  };
  railRaf = requestAnimationFrame(rail);

  // copy-to-clipboard + toast
  const toast = document.getElementById('toast');
  let toastTimer: ReturnType<typeof setTimeout>;
  const onCopy = async (e: Event) => {
    const btn = (e.currentTarget as HTMLElement) ?? null;
    const cmd = btn?.dataset.cmd;
    if (!cmd) return;
    try {
      await navigator.clipboard.writeText(cmd);
      toast?.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast?.classList.remove('show'), 2200);
    } catch {
      /* clipboard unavailable */
    }
  };
  const copyBtns = [...document.querySelectorAll<HTMLElement>('[data-cmd]')];
  copyBtns.forEach((b) => b.addEventListener('click', onCopy));

  // smooth anchors through lenis
  const onAnchor = (e: Event) => {
    const a = e.currentTarget as HTMLAnchorElement;
    const target = document.querySelector(a.getAttribute('href') ?? '');
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target as HTMLElement, { duration: 1.8 });
    else (target as HTMLElement).scrollIntoView();
  };
  const anchors = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
  anchors.forEach((a) => a.addEventListener('click', onAnchor));

  // nav + rail entrance
  document.getElementById('nav')?.classList.add('in');
  document.getElementById('rail')?.classList.add('in');

  return () => {
    io.disconnect();
    ioCount.disconnect();
    cancelAnimationFrame(railRaf);
    copyBtns.forEach((b) => b.removeEventListener('click', onCopy));
    anchors.forEach((a) => a.removeEventListener('click', onAnchor));
  };
}
