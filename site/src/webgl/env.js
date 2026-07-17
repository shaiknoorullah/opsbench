import * as THREE from 'three'

/**
 * Procedural HDR environment.
 *
 * We paint an equirectangular canvas — a graded night-sky gradient plus a few
 * soft emissive "light probes" (the key, the rim, a cool bounce) — then run it
 * through the PMREM generator so the monolith gets physically-plausible,
 * pre-filtered reflections and image-based lighting with zero external assets.
 */
export function buildEnvironment(renderer) {
  const w = 1024
  const h = 512
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  // Base vertical gradient: deep obsidian, faintly warmer toward the horizon.
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0.0, '#01020a')
  grad.addColorStop(0.45, '#05070f')
  grad.addColorStop(0.62, '#090b16')
  grad.addColorStop(0.8, '#05060d')
  grad.addColorStop(1.0, '#020308')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // Soft emissive probes — these become the specular highlights + IBL colour.
  const probe = (x, y, r, color, alpha) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = alpha
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
    ctx.globalAlpha = 1
  }

  // Key light — cool cyan-white, upper left. Strong, tight.
  probe(w * 0.26, h * 0.28, 190, 'rgba(150, 220, 255, 0.95)', 0.9)
  probe(w * 0.26, h * 0.28, 70, 'rgba(230, 250, 255, 1.0)', 1.0)
  // Rim light — indigo, opposite side.
  probe(w * 0.8, h * 0.42, 230, 'rgba(80, 120, 255, 0.6)', 0.7)
  // Verifiable-teal accent low — the "trust" bounce.
  probe(w * 0.58, h * 0.82, 260, 'rgba(40, 200, 170, 0.35)', 0.55)
  // Faint warm risk-amber, far, low intensity (tension).
  probe(w * 0.05, h * 0.7, 180, 'rgba(245, 166, 35, 0.14)', 0.4)

  const equirect = new THREE.CanvasTexture(canvas)
  equirect.mapping = THREE.EquirectangularReflectionMapping
  equirect.colorSpace = THREE.SRGBColorSpace

  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  const envRT = pmrem.fromEquirectangular(equirect)

  equirect.dispose()
  pmrem.dispose()

  return envRT.texture
}
