import { Cartesian3, Cartographic, Matrix4, Transforms } from 'cesium'
import { LocalFrame, PhysicsSystem } from 'cesium-player-controller'
import { describe, expect, it, vi } from 'vitest'

import { createUrbanGroundPatch, createUrbanStreamingGround } from './urban-streaming-ground.js'

const tokyo = Cartesian3.fromDegrees(139.764, 35.681, 39)
const offset = (point: Cartesian3, east: number, north = 0) => {
  const world = Matrix4.multiplyByPoint(Transforms.eastNorthUpToFixedFrame(point), new Cartesian3(east, north, 0), new Cartesian3())
  const geo = Cartographic.fromCartesian(world)
  return Cartesian3.fromRadians(geo.longitude, geo.latitude, 39)
}

function fixture() {
  const frame = new LocalFrame(tokyo)
  const keys = new Set(['plateau-tokyo-buildings'])
  const physics = {
    addTerrainTileCollider: vi.fn((key: string, _positions: Float32Array, _indices: Uint32Array) => { keys.add(key) }),
    removeTerrainTileCollider: vi.fn((key: string) => { keys.delete(key) }),
    rebase: vi.fn((point: Cartesian3) => { frame.setAnchor(point) }),
  }
  const player = { frame, physics, setOnGround: vi.fn() }
  return { player, physics, keys, ground: createUrbanStreamingGround(player) }
}

describe('bounded streaming urban ground', () => {
  it.each([
    ['Tokyo', tokyo],
    ['date line', Cartesian3.fromDegrees(179.999, 35, 39)],
    ['north pole', Cartesian3.fromDegrees(0, 90, 39)],
    ['south pole', Cartesian3.fromDegrees(120, -90, 39)],
  ])('retains the 38 m ellipsoid surface and upward winding at %s', (_name, point) => {
    const frame = new LocalFrame(point)
    const mesh = createUrbanGroundPatch(point, 400, p => frame.ecefToRapier(p))
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const world = frame.rapierToEcef(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2])
      expect(Cartographic.fromCartesian(world).height).toBeCloseTo(38, 4)
    }
    const vertex = (index: number) => new Cartesian3(mesh.positions[index * 3], mesh.positions[index * 3 + 1], mesh.positions[index * 3 + 2])
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = vertex(mesh.indices[i])
      const b = vertex(mesh.indices[i + 1])
      const c = vertex(mesh.indices[i + 2])
      const normal = Cartesian3.cross(Cartesian3.subtract(b, a, b), Cartesian3.subtract(c, a, c), new Cartesian3())
      expect(normal.y).toBeGreaterThan(0)
    }
  })

  it('primes ahead of a 300 m/s actor and avoids rebuilding on every frame', () => {
    const { ground, physics } = fixture()
    ground.update(tokyo, 300)
    for (let frame = 1; frame <= 29; frame++) ground.update(offset(tokyo, frame * 10), 300)
    expect(physics.addTerrainTileCollider).toHaveBeenCalledTimes(1)
    expect(ground.getState().maximumStepMeters).toBeGreaterThan(800)
    ground.update(offset(tokyo, 310), 300)
    expect(physics.addTerrainTileCollider).toHaveBeenCalledTimes(2)
    expect(ground.getState().maximumStepMeters).toBeGreaterThan(1_000)
  })

  it('supports crossing the former coverage boundary and rebases before local gravity drifts', () => {
    const { ground, player, physics } = fixture()
    ground.update(tokyo, 300)
    const position = offset(tokyo, 2_500)
    ground.update(position, 300)
    expect(physics.rebase).toHaveBeenCalledTimes(1)
    expect(Cartesian3.distance(player.frame.anchor, position)).toBeLessThan(0.001)
    expect(player.setOnGround).toHaveBeenCalledWith(false)
    expect(ground.getState().colliderCount).toBe(1)
  })

  it('bounds allocations for extreme finite speed and tells the caller its next-step budget', () => {
    const { ground } = fixture()
    const state = ground.update(tokyo, 1e100)
    expect(state.radiusMeters).toBe(4_000)
    expect(state.vertexCount).toBe(40_401)
    expect(state.triangleCount).toBe(80_000)
    expect(state.maximumStepMeters).toBe(3_920)
    expect(() => ground.update(tokyo, Infinity)).toThrow('Invalid')
    expect(() => ground.update(tokyo, NaN)).toThrow('Invalid')
    expect(() => ground.update(tokyo, -1)).toThrow('Invalid')
  })

  it('replaces only its one key through long travel, reset and destruction', () => {
    const { ground, keys, physics } = fixture()
    ground.update(tokyo, 300)
    for (let step = 1; step <= 20; step++) ground.update(offset(tokyo, step * 1_000), 300)
    expect(keys.size).toBe(2)
    ground.reset(Cartesian3.fromDegrees(-73.98, 40.74, 39), 300)
    expect(keys.has('plateau-tokyo-buildings')).toBe(true)
    expect(ground.getState().rebases).toBeGreaterThan(1)
    ground.destroy()
    ground.destroy()
    expect([...keys]).toEqual(['plateau-tokyo-buildings'])
    expect(physics.removeTerrainTileCollider).toHaveBeenCalledTimes(1)
    expect(() => ground.update(tokyo)).toThrow('destroyed')
  })

  it('keeps actual Rapier ground and a pre-existing building through a physics rebase', async () => {
    const frame = new LocalFrame(tokyo)
    const physics = new PhysicsSystem(frame)
    await physics.create(-9.81)
    physics.createCharacter(tokyo, { radius: 0.3, halfHeight: 0.6, rideHeight: 0 })
    // A separate existing building tile: a horizontal roof at x=20..30, y=5.
    physics.addTerrainTileCollider('plateau-tokyo-buildings', new Float32Array([
      20, 5, 0, 30, 5, 0, 20, 5, -10, 30, 5, -10,
    ]), new Uint32Array([0, 1, 2, 1, 3, 2]))
    const roofAbove = frame.rapierToEcef(25, 15, -5)
    const originalDown = frame.enuVectorToEcef(new Cartesian3(0, 0, -1))
    const ground = createUrbanStreamingGround({ frame, physics, setOnGround: () => undefined })
    try {
      ground.update(tokyo, 300)
      physics.step(1 / 60)
      expect(physics.raycastEcef(roofAbove, originalDown, 20, physics.charBody)).toBeCloseTo(10, 3)
      const farPosition = offset(tokyo, 2_500)
      ground.reset(farPosition, 300)
      physics.teleportCharacter(farPosition)
      physics.step(1 / 60)
      expect(physics.groundDistance(5)).toBeCloseTo(1, 2)
      expect(physics.raycastEcef(roofAbove, originalDown, 20, physics.charBody)).toBeCloseTo(10, 2)
      let colliders = 0
      physics.world.forEachCollider(() => { colliders += 1 })
      expect(colliders).toBe(4) // character navigation + push capsule + ground + building
      ground.destroy()
      physics.step(1 / 60)
      expect(physics.raycastEcef(roofAbove, originalDown, 20, physics.charBody)).toBeCloseTo(10, 2)
    } finally {
      ground.destroy()
      physics.destroy()
    }
  })

  it('keeps a 1000 m/s capsule grounded through 12 km of actual Rapier movement', async () => {
    const frame = new LocalFrame(tokyo)
    const physics = new PhysicsSystem(frame)
    await physics.create(-9.81)
    physics.createCharacter(tokyo, { radius: 0.3, halfHeight: 0.6, rideHeight: 0 })
    const ground = createUrbanStreamingGround({ frame, physics, setOnGround: () => undefined })
    let position = Cartesian3.clone(tokyo)
    try {
      for (let step = 0; step < 360; step++) {
        const state = ground.update(position, 1_000)
        expect(state.maximumStepMeters).toBeGreaterThan(1_000 / 30)
        physics.step(1 / 30)
        const groundDistance = physics.groundDistance(5)
        expect(Number.isFinite(groundDistance)).toBe(true)
        position = physics.moveCharacter({ e: 1_000 / 30, n: 0, u: 1 - groundDistance })
        expect(Cartographic.fromCartesian(position).height).toBeGreaterThan(38.95)
        expect(Cartographic.fromCartesian(position).height).toBeLessThan(39.05)
      }
      expect(Cartesian3.distance(position, tokyo)).toBeGreaterThan(11_900)
      expect(ground.getState().rebases).toBeGreaterThanOrEqual(5)
      expect(ground.getState().colliderCount).toBe(1)
    } finally {
      ground.destroy()
      physics.destroy()
    }
  })
})
