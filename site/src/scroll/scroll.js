import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { NAV_SECTIONS } from '../ui/content.js'

gsap.registerPlugin(ScrollTrigger)

/**
 * Camera "stations" — one per narrative act. The render loop eases the camera
 * toward whichever station is active, so transitions stay buttery regardless of
 * scroll velocity. Story-state values drive the WebGL shaders.
 */
const SCENES = {
  hero: {
    pos: [0, 0.3, 8.2], look: [0, 0, 0], focus: [0, 0, 0.4],
    state: { progress: 0.12, chainReveal: 0, sealRing: 0, sweep: 0, monoSpin: 0 },
    post: { bloom: 1.0, bokeh: 3.0, ca: 0.0006 },
  },
  gap: {
    pos: [2.4, 0.6, 7.0], look: [0.5, 0.2, 0], focus: [0.3, 0, 0],
    state: { progress: 0.14, chainReveal: 0, sealRing: 0, sweep: 0, monoSpin: 0.3 },
    post: { bloom: 0.85, bokeh: 4.5, ca: 0.001 },
  },
  thesis: {
    pos: [0, 1.3, 6.0], look: [0, 0.4, 0], focus: [0, 0.2, 0],
    state: { progress: 0.22, chainReveal: 0, sealRing: 0.15, sweep: 0, monoSpin: 0.6 },
    post: { bloom: 1.05, bokeh: 3.5, ca: 0.0008 },
  },
  gatekeeper: {
    pos: [-2.5, 0.2, 5.3], look: [0, 0, 0.3], focus: [0, 0, 0.5],
    state: { progress: 0.32, chainReveal: 0, sealRing: 1.0, sweep: 0, monoSpin: 0.9 },
    post: { bloom: 1.2, bokeh: 5.0, ca: 0.0012 },
  },
  ledger: {
    pos: [2.7, -0.4, 4.9], look: [0, 0, 0], focus: [0, 0, 0.4],
    state: { progress: 1.0, chainReveal: 1.0, sealRing: 0.25, sweep: 1.0, monoSpin: 1.4 },
    post: { bloom: 1.35, bokeh: 4.0, ca: 0.0009 },
  },
  autonomy: {
    pos: [-1.9, 1.7, 5.5], look: [0, 0.35, 0], focus: [0, 0.3, 0],
    state: { progress: 0.9, chainReveal: 0.85, sealRing: 0, sweep: 0, monoSpin: 1.9 },
    post: { bloom: 1.15, bokeh: 3.8, ca: 0.0008 },
  },
  reach: {
    pos: [1.7, 0.4, 6.3], look: [0, 0.1, 0], focus: [0, 0.1, 0],
    state: { progress: 0.8, chainReveal: 0.6, sealRing: 0, sweep: 0, monoSpin: 2.3 },
    post: { bloom: 1.1, bokeh: 4.2, ca: 0.0009 },
  },
  teams: {
    pos: [0, 0.1, 9.0], look: [0, 0, 0], focus: [0, 0, 0],
    state: { progress: 0.5, chainReveal: 0.3, sealRing: 0, sweep: 0, monoSpin: 2.7 },
    post: { bloom: 0.8, bokeh: 3.0, ca: 0.0006 },
  },
  install: {
    pos: [0, 0.2, 7.0], look: [0, 0, 0], focus: [0, 0, 0.4],
    state: { progress: 1.0, chainReveal: 0.5, sealRing: 0.4, sweep: 0, monoSpin: 3.0 },
    post: { bloom: 1.5, bokeh: 3.2, ca: 0.0007 },
  },
}

export function initScroll(stage) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // --- Lenis smooth scroll --------------------------------------------------
  const lenis = new Lenis({
    duration: 1.15,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: !reduced,
    wheelMultiplier: 1.0,
    touchMultiplier: 1.6,
  })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)

  // proxy the post-processing knobs so we can tween them smoothly
  const post = { bloom: 1.0, bokeh: 3.0, ca: 0.0006 }
  const applyPost = () => {
    if (stage.bloom) stage.bloom.intensity = post.bloom
    if (stage.dof) stage.dof.bokehScale = post.bokeh
    if (stage.ca) stage.ca.offset.set(post.ca, post.ca)
  }

  function goToScene(name) {
    const s = SCENES[name]
    if (!s) return
    const dur = reduced ? 0.01 : 1.7
    const ease = 'power2.inOut'
    gsap.to(stage.camPos, { x: s.pos[0], y: s.pos[1], z: s.pos[2], duration: dur, ease, overwrite: 'auto' })
    gsap.to(stage.camLook, { x: s.look[0], y: s.look[1], z: s.look[2], duration: dur, ease, overwrite: 'auto' })
    gsap.to(stage.focusPoint, { x: s.focus[0], y: s.focus[1], z: s.focus[2], duration: dur, ease, overwrite: 'auto' })
    gsap.to(post, { ...s.post, duration: dur, ease, onUpdate: applyPost, overwrite: 'auto' })
    // story state (skip scrub-owned fields for scenes that scrub them)
    const st = { ...s.state }
    if (name === 'ledger') { delete st.chainReveal; delete st.sweep; delete st.progress }
    if (name === 'gatekeeper') { delete st.sealRing }
    gsap.to(stage.state, { ...st, duration: dur, ease, overwrite: 'auto' })
  }

  // Each act owns a ScrollTrigger station.
  Object.keys(SCENES).forEach((name) => {
    const el = document.querySelector(`[data-scene="${name}"]`)
    if (!el) return
    ScrollTrigger.create({
      trigger: el,
      start: 'top 62%',
      end: 'bottom 38%',
      onEnter: () => goToScene(name),
      onEnterBack: () => goToScene(name),
    })
  })

  // --- Scrubbed detail: ledger assembles as you pass through ----------------
  const ledgerEl = document.querySelector('#ledger')
  if (ledgerEl) {
    const proxy = { v: 0 }
    ScrollTrigger.create({
      trigger: ledgerEl,
      start: 'top 80%',
      end: 'bottom 30%',
      scrub: reduced ? false : 0.6,
      onUpdate: (self) => {
        const p = self.progress
        stage.state.chainReveal = p
        stage.state.progress = 0.2 + p * 0.8
        stage.state.sweep = p // scanline sweeps up as chain seals
      },
    })
  }

  // --- Scrubbed detail: gatekeeper ring clamps shut -------------------------
  const gateEl = document.querySelector('#gatekeeper')
  if (gateEl) {
    ScrollTrigger.create({
      trigger: gateEl,
      start: 'top 85%',
      end: 'center 45%',
      scrub: reduced ? false : 0.6,
      onUpdate: (self) => {
        stage.state.sealRing = self.progress
        stage.state.seal = self.progress > 0.85 ? 1 : self.progress * 0.3
      },
    })
  }

  // --- Reveal animations ----------------------------------------------------
  const reveals = gsap.utils.toArray('[data-reveal]')
  reveals.forEach((el) => {
    gsap.set(el, { opacity: 0, y: reduced ? 0 : 34, filter: reduced ? 'none' : 'blur(6px)' })
    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        gsap.to(el, {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: reduced ? 0.2 : 1.1,
          ease: 'power3.out',
        })
      },
    })
  })

  // --- Nav solidity + hide-on-scroll-down -----------------------------------
  const nav = document.getElementById('nav')
  let lastY = 0
  ScrollTrigger.create({
    start: 'top top',
    end: 'max',
    onUpdate: (self) => {
      const y = self.scroll()
      nav.classList.toggle('solid', y > 40)
      if (!reduced) {
        if (y > lastY && y > 600) nav.classList.add('hidden')
        else nav.classList.remove('hidden')
      }
      lastY = y
      const railFill = document.getElementById('rail-fill')
      if (railFill) railFill.style.height = `${self.progress * 100}%`
    },
  })

  // --- Section dial ---------------------------------------------------------
  buildDial(lenis)

  // let ScrollTrigger settle after fonts/layout
  requestAnimationFrame(() => ScrollTrigger.refresh())
  window.addEventListener('load', () => ScrollTrigger.refresh())

  return { lenis, goToScene }
}

function buildDial(lenis) {
  const dial = document.getElementById('dial')
  if (!dial) return
  const items = []
  NAV_SECTIONS.forEach((s) => {
    const item = document.createElement('button')
    item.className = 'dial__item'
    item.setAttribute('aria-label', s.label)
    item.innerHTML = `<span class="dial__label">${s.label}</span><span class="dial__tick"></span>`
    item.addEventListener('click', () => {
      const target = document.getElementById(s.id)
      if (target) lenis.scrollTo(target, { offset: -40 })
    })
    dial.appendChild(item)
    items.push({ item, id: s.id })
  })

  // active-state observer
  const targets = NAV_SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean)
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const id = e.target.getAttribute('data-nav') || e.target.id
          items.forEach((it) => it.item.classList.toggle('active', it.id === id))
        }
      })
    },
    { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
  )
  targets.forEach((t) => io.observe(t))
  // also observe data-nav sections that aren't top-level ids
  document.querySelectorAll('[data-nav]').forEach((el) => io.observe(el))
}
