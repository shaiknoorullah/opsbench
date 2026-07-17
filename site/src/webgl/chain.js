import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/**
 * The Merkle Chain — instanced ledger blocks that assemble into a helix
 * around the monolith as the "ledger" act plays. Each block links to the
 * previous (hash-chained). Assembly is driven by a 0..1 `reveal` value.
 */
export function createChain(envMap, count = 40) {
  const geo = new RoundedBoxGeometry(0.34, 0.2, 0.34, 4, 0.04)
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0a0e18'),
    metalness: 0.7,
    roughness: 0.28,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    envMap,
    envMapIntensity: 1.1,
    emissive: new THREE.Color('#0c2a3a'),
    emissiveIntensity: 0.0,
  })

  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.castShadow = true

  // emissive per-instance edge markers (the "hash link")
  const linkGeo = new THREE.TorusGeometry(0.24, 0.012, 8, 32)
  const linkMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#4ff0d0'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const links = new THREE.InstancedMesh(linkGeo, linkMat, count)
  links.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

  const group = new THREE.Group()
  group.add(mesh, links)

  const dummy = new THREE.Object3D()
  const radius = 1.35
  const vSpan = 3.0
  const turns = 2.4

  function layout(reveal, t) {
    for (let i = 0; i < count; i++) {
      const f = i / (count - 1)
      // per-block appearance threshold — assembles bottom→top
      const appear = THREE.MathUtils.clamp((reveal - f * 0.85) * 5.0, 0, 1)
      const ease = appear * appear * (3 - 2 * appear)

      const ang = f * Math.PI * 2 * turns + t * 0.08
      const y = -vSpan / 2 + f * vSpan
      const r = radius * (0.5 + 0.5 * ease) + (1 - ease) * 2.5
      dummy.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r)
      dummy.rotation.set(0, -ang + Math.PI / 2, 0)
      const s = ease * 1.0 + 0.001
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      // link torus faces outward, slightly larger, pulsing on newest block
      const isNewest = Math.abs(reveal - (f + 0.02)) < 0.03
      const lp = ease * (isNewest ? 1.0 : 0.55)
      dummy.rotation.x = Math.PI / 2
      dummy.scale.setScalar(ease * (1.0 + (isNewest ? 0.2 * Math.sin(t * 8) : 0)))
      dummy.rotation.set(0, -ang + Math.PI / 2, 0)
      dummy.updateMatrix()
      links.setMatrixAt(i, dummy.matrix)
      linkMat.opacity = 0.5
    }
    mesh.instanceMatrix.needsUpdate = true
    links.instanceMatrix.needsUpdate = true
    mat.emissiveIntensity = 0.35 * reveal
  }

  layout(0, 0)

  group.userData.update = (t, state) => {
    layout(state.chainReveal, t)
    group.visible = state.chainReveal > 0.001
  }

  return group
}
