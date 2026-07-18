/* Shared scroll + quality state. Written by the Lenis driver, read per-frame
   by the Director — deliberately not React state: this changes 60×/sec. */

export const scrollState = {
  /** normalized page progress 0..1 */
  p: 0,
  /** smoothed scroll velocity, px/frame — drives speed-ramp FX */
  v: 0,
};

export type QualityTier = 'high' | 'mid' | 'low';

export const quality: { tier: QualityTier } = { tier: 'high' };

export const REDUCED =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function readScroll() {
  const max = Math.max(1, document.body.scrollHeight - innerHeight);
  return Math.min(1, Math.max(0, (window.scrollY || 0) / max));
}
