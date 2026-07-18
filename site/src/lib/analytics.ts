/* Thin wrapper over self-hosted Umami. No-ops when analytics is not
   configured, so the site works identically with or without it. */

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, unknown>) => void };
  }
}

export function track(event: string, data?: Record<string, unknown>) {
  try {
    window.umami?.track(event, data);
  } catch {
    /* analytics is optional by design */
  }
}

/** fire once per exhibit per pageview as the visitor reaches it */
export function initScrollDepth() {
  const seen = new Set<string>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).id;
        if (e.isIntersecting && id && !seen.has(id)) {
          seen.add(id);
          track('exhibit_view', { exhibit: id });
          if (id === 'exhibit-06') track('reached_cta');
        }
      }
    },
    { threshold: 0.4 },
  );
  document.querySelectorAll('.exhibit').forEach((s) => io.observe(s));
}
