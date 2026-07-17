import './styles/main.css'
import { content } from './ui/content.js'
import { Stage } from './webgl/stage.js'
import { initScroll } from './scroll/scroll.js'

// 1. Inject content
document.getElementById('content').innerHTML = content

// 2. Preloader choreography
const preloader = document.getElementById('preloader')
const fill = document.getElementById('preloader-fill')
const pct = document.getElementById('preloader-pct')
let progress = 0
const startedAt = performance.now()

function setProgress(v) {
  progress = Math.max(progress, Math.min(100, v))
  if (fill) fill.style.width = `${progress}%`
  if (pct) pct.textContent = String(Math.round(progress))
}

function finishPreloader() {
  setProgress(100)
  const elapsed = performance.now() - startedAt
  const wait = Math.max(0, 900 - elapsed) // guarantee a beat of calibration
  setTimeout(() => {
    preloader.classList.add('done')
    document.getElementById('stage').classList.add('ready')
  }, wait)
}

// fake-but-honest calibration ramp; real readiness resolves it to 100
let ramp = setInterval(() => setProgress(progress + (90 - progress) * 0.12 + 1), 90)

// 3. Boot WebGL (with graceful fallback)
let stage = null
try {
  const canvas = document.getElementById('stage')
  stage = new Stage(canvas)

  let running = true
  const loop = () => {
    if (!running) return
    stage.render()
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  // pause the render loop when the tab is hidden (battery / correctness)
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden
    if (running) requestAnimationFrame(loop)
  })

  // 4. Scroll cinematography
  initScroll(stage)
} catch (err) {
  console.warn('[opsbench] WebGL unavailable, falling back to static.', err)
  document.getElementById('stage').style.display = 'none'
  document.documentElement.style.background =
    'radial-gradient(120% 90% at 50% 20%, #0a0f1e 0%, #04050a 60%)'
  // still run scroll UI (reveals/nav/dial) without a stage-less crash
  try {
    initScroll({
      camPos: {}, camLook: {}, focusPoint: {}, state: {},
      bloom: null, dof: null, ca: null,
    })
  } catch (_) { /* no-op */ }
}

// 5. Resolve preloader once the first frame is on screen
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    clearInterval(ramp)
    finishPreloader()
  })
})
window.addEventListener('load', () => {
  clearInterval(ramp)
  finishPreloader()
})

// 6. Copy-install interaction
const copyBtn = document.getElementById('copy-install')
if (copyBtn) {
  copyBtn.addEventListener('click', async () => {
    const cmd = document.getElementById('install-cmd')?.textContent || ''
    try {
      await navigator.clipboard.writeText(cmd)
      const original = copyBtn.innerHTML
      copyBtn.innerHTML = '<span aria-hidden="true">✓</span> Copied'
      copyBtn.style.borderColor = 'var(--teal)'
      copyBtn.style.color = 'var(--text-hi)'
      setTimeout(() => {
        copyBtn.innerHTML = original
        copyBtn.style.borderColor = ''
        copyBtn.style.color = ''
      }, 2000)
    } catch (_) { /* clipboard blocked */ }
  })
}
