import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  DepthOfFieldEffect,
  ChromaticAberrationEffect,
  VignetteEffect,
  NoiseEffect,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  BlendFunction,
  KernelSize,
} from 'postprocessing'

import { buildEnvironment } from './env.js'
import { createMonolith } from './monolith.js'
import { createParticles } from './particles.js'
import { createChain } from './chain.js'

export class Stage {
  constructor(canvas) {
    this.canvas = canvas
    this.clock = new THREE.Clock()
    this.pointer = new THREE.Vector2(0, 0)
    this.pointerTarget = new THREE.Vector2(0, 0)
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // --- Renderer -----------------------------------------------------------
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setClearColor(0x04050a, 1)

    // --- Scene / camera -----------------------------------------------------
    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0x04050a, 0.032)

    this.camera = new THREE.PerspectiveCamera(
      34,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    )
    this.camera.position.set(0, 0.2, 8.5)

    // Camera rig — timeline writes to these; render loop eases toward them.
    this.camPos = new THREE.Vector3(0, 0.2, 8.5)
    this.camLook = new THREE.Vector3(0, 0, 0)
    this._curPos = this.camPos.clone()
    this._curLook = this.camLook.clone()
    this.focusPoint = new THREE.Vector3(0, 0, 0)
    this._curFocus = this.focusPoint.clone()

    // --- Environment + lighting --------------------------------------------
    RectAreaLightUniformsLib.init()
    this.envMap = buildEnvironment(this.renderer)
    this.scene.environment = this.envMap

    const key = new THREE.RectAreaLight(0xbfe6ff, 26, 4, 8)
    key.position.set(-5, 4, 5)
    key.lookAt(0, 0, 0)
    this.scene.add(key)

    const rim = new THREE.RectAreaLight(0x5b8cff, 16, 6, 8)
    rim.position.set(6, 1, -4)
    rim.lookAt(0, 0, 0)
    this.scene.add(rim)

    const fill = new THREE.PointLight(0x4ff0d0, 8, 20, 2)
    fill.position.set(1.5, -2, 3)
    this.scene.add(fill)
    this.fill = fill

    this.scene.add(new THREE.AmbientLight(0x0a1020, 1.2))

    // --- Objects ------------------------------------------------------------
    this.monolith = createMonolith(this.envMap)
    this.scene.add(this.monolith)

    this.chain = createChain(this.envMap, this.reduced ? 24 : 40)
    this.scene.add(this.chain)

    this.particles = createParticles(this.reduced ? 1100 : 2600)
    this.scene.add(this.particles)

    // The gatekeeper seal — concentric rings that clamp shut during that act.
    this.seal = this._buildSeal()
    this.scene.add(this.seal)

    // Story state, written by the scroll timeline.
    this.state = {
      progress: 0,     // ledger "aliveness"
      sweep: 0,        // sealing scanline
      seal: 0,         // seal flash
      chainReveal: 0,  // merkle chain assembly
      sealRing: 0,     // gatekeeper ring closure
      monoSpin: 0,     // extra rotation offset
    }

    this._buildComposer()

    // --- Events -------------------------------------------------------------
    this._onResize = this.resize.bind(this)
    window.addEventListener('resize', this._onResize)
    window.addEventListener('pointermove', (e) => {
      this.pointerTarget.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      )
    })
  }

  _buildSeal() {
    const g = new THREE.Group()
    const mkRing = (r, tube, color, op) => {
      const geo = new THREE.TorusGeometry(r, tube, 10, 96)
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: op,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      return new THREE.Mesh(geo, mat)
    }
    this.ringA = mkRing(2.1, 0.01, '#a97bff', 0.0)
    this.ringB = mkRing(1.7, 0.008, '#5b8cff', 0.0)
    this.ringC = mkRing(1.35, 0.006, '#4ff0d0', 0.0)
    g.add(this.ringA, this.ringB, this.ringC)
    g.position.z = 0.5
    return g
  }

  _buildComposer() {
    const composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0,
    })
    composer.addPass(new RenderPass(this.scene, this.camera))

    // Cinematic depth of field — rack focus is driven by focusPoint.
    const dof = new DepthOfFieldEffect(this.camera, {
      focusDistance: 0.0,
      focalLength: 0.04,
      bokehScale: 4.0,
      height: 720,
    })
    dof.target = this._curFocus
    this.dof = dof

    const bloom = new BloomEffect({
      intensity: 1.15,
      luminanceThreshold: 0.32,
      luminanceSmoothing: 0.9,
      mipmapBlur: true,
      kernelSize: KernelSize.LARGE,
      radius: 0.72,
    })
    this.bloom = bloom

    const ca = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.0006, 0.0006),
      radialModulation: true,
      modulationOffset: 0.4,
    })
    this.ca = ca

    const vignette = new VignetteEffect({ eskil: false, offset: 0.32, darkness: 0.72 })
    const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true })
    noise.blendMode.opacity.value = 0.16
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })

    composer.addPass(new EffectPass(this.camera, dof, bloom, ca, vignette, noise, tone))
    composer.addPass(new EffectPass(this.camera, new SMAAEffect()))

    this.composer = composer
  }

  resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  }

  render() {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const t = this.clock.elapsedTime
    const s = this.state
    const smooth = this.reduced ? 1 : 1 - Math.pow(0.0015, dt) // frame-rate independent ease

    // pointer parallax easing
    this.pointer.lerp(this.pointerTarget, this.reduced ? 1 : 1 - Math.pow(0.002, dt))
    const px = this.pointer.x * 0.5
    const py = this.pointer.y * 0.35

    // ease camera rig toward timeline targets
    this._curPos.lerp(this.camPos, smooth)
    this._curLook.lerp(this.camLook, smooth)
    this._curFocus.lerp(this.focusPoint, smooth)

    this.camera.position.copy(this._curPos)
    this.camera.position.x += px
    this.camera.position.y += py
    this.camera.lookAt(this._curLook)

    // monolith slow idle rotation + story spin
    this.monolith.rotation.y = t * 0.06 + s.monoSpin
    this.monolith.position.y = Math.sin(t * 0.4) * 0.04

    // seal rings
    this.seal.rotation.z = t * 0.1
    const rr = s.sealRing
    this.ringA.material.opacity = 0.5 * rr
    this.ringB.material.opacity = 0.6 * rr
    this.ringC.material.opacity = 0.7 * rr
    this.ringA.scale.setScalar(1.0 + (1 - rr) * 0.6)
    this.ringB.scale.setScalar(1.0 + (1 - rr) * 0.9)
    this.ringC.scale.setScalar(1.0 + (1 - rr) * 1.3)
    this.ringA.rotation.z = -t * 0.22
    this.ringB.rotation.z = t * 0.3
    this.seal.visible = rr > 0.001

    // fill light tracks ledger aliveness
    this.fill.intensity = 4 + s.progress * 10

    // children updates
    this.monolith.userData.update(t, s)
    this.chain.userData.update(t, s)
    this.particles.userData.update(t)

    this.composer.render(dt)
  }

  dispose() {
    window.removeEventListener('resize', this._onResize)
    this.renderer.dispose()
  }
}
