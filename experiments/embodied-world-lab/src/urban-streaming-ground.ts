import { Cartesian3, Cartographic, Matrix4, Transforms } from 'cesium'
import type { playerController } from 'cesium-player-controller'

import { URBAN_GROUND_HEIGHT } from './urban-scene.js'

type GroundPlayer = {
  frame: Pick<playerController['frame'], 'anchor' | 'ecefToRapier'>
  physics: Pick<playerController['physics'], 'addTerrainTileCollider' | 'removeTerrainTileCollider' | 'rebase'>
  setOnGround(value: boolean): void
}

export interface UrbanStreamingGroundState {
  colliderCount: number
  radiusMeters: number
  vertexCount: number
  triangleCount: number
  rebuilds: number
  rebases: number
  /** Conservative distance that this update's position can travel in any direction. */
  maximumStepMeters: number
}

export interface UrbanStreamingGround {
  /** Call before player.update, with the actual/commanded speed in metres/second. */
  update(positionEcef: Cartesian3, speedMetersPerSecond?: number): Readonly<UrbanStreamingGroundState>
  /** Call before player.reset(position). Prepares ground and a local gravity frame. */
  reset(positionEcef: Cartesian3, speedMetersPerSecond?: number): Readonly<UrbanStreamingGroundState>
  getState(): Readonly<UrbanStreamingGroundState>
  destroy(): void
}

const BASE_RADIUS_METERS = 1_200
const MAX_RADIUS_METERS = 4_000
const CELL_METERS = 40
const REBUILD_DISTANCE_METERS = 300
const REBASE_DISTANCE_METERS = 2_000
const LOOKAHEAD_SECONDS = 2
let nextGroundId = 0

/**
 * A bounded, local WGS84-height patch, independent of the prepared building area.
 * It approximates the same 38 m ellipsoid surface as createUrbanGround, not a
 * surveyed road. Physics rebasing retains all other colliders at their ECEF pose.
 */
export function createUrbanStreamingGround(player: GroundPlayer): UrbanStreamingGround {
  const key = `urban-streaming-ground-${nextGroundId++}`
  const center = new Cartesian3()
  const state: UrbanStreamingGroundState = {
    colliderCount: 0, radiusMeters: 0, vertexCount: 0, triangleCount: 0,
    rebuilds: 0, rebases: 0, maximumStepMeters: 0,
  }
  let destroyed = false

  const update = (position: Cartesian3, speed = 0, reset = false): Readonly<UrbanStreamingGroundState> => {
    if (destroyed) throw new Error('Urban streaming ground has been destroyed')
    if (![position.x, position.y, position.z, speed].every(Number.isFinite)
      || Cartesian3.magnitudeSquared(position) < 1 || speed < 0) {
      throw new Error('Invalid urban ground position or speed')
    }
    // Bound allocation before multiplication, even for a finite input of 1e100.
    const lookahead = Math.min(speed, MAX_RADIUS_METERS / LOOKAHEAD_SECONDS) * LOOKAHEAD_SECONDS
    const radius = Math.min(MAX_RADIUS_METERS, Math.max(BASE_RADIUS_METERS, lookahead + 2 * CELL_METERS + REBUILD_DISTANCE_METERS))
    let rebased = false
    const anchorDistance = Cartesian3.distance(position, player.frame.anchor)
    if (anchorDistance >= REBASE_DISTANCE_METERS || reset && anchorDistance > 0.001) {
      // Public controller API: transform existing ground AND building rigid bodies,
      // then update the shared ENU frame. Never clear or re-create building data.
      player.physics.rebase(position)
      player.setOnGround(false)
      state.rebases += 1
      rebased = true
    }
    const distance = state.colliderCount ? Cartesian3.distance(position, center) : Infinity
    if (reset || rebased || !state.colliderCount || radius > state.radiusMeters
      || distance >= REBUILD_DISTANCE_METERS) {
      const mesh = createUrbanGroundPatch(position, radius, point => player.frame.ecefToRapier(point))
      // The controller replaces this single named body synchronously. No physics
      // step occurs between removal and addition; unrelated keys remain untouched.
      player.physics.addTerrainTileCollider(key, mesh.positions, mesh.indices)
      Cartesian3.clone(position, center)
      state.colliderCount = 1
      state.radiusMeters = radius
      state.vertexCount = mesh.positions.length / 3
      state.triangleCount = mesh.indices.length / 3
      state.rebuilds += 1
    }
    // This is a step bound, not a speed cap. At extraordinary speeds the caller
    // can shorten delta/substep, instead of silently allocating an unbounded mesh.
    state.maximumStepMeters = Math.max(0, state.radiusMeters - Cartesian3.distance(position, center) - 2 * CELL_METERS)
    return state
  }

  return {
    update,
    reset: (position, speed = 0) => update(position, speed, true),
    getState: () => ({ ...state }),
    destroy: () => {
      if (destroyed) return
      if (state.colliderCount) player.physics.removeTerrainTileCollider(key)
      state.colliderCount = 0
      state.maximumStepMeters = 0
      destroyed = true
    },
  }
}

/** Builds a curved patch in the current physics frame, including poles/date line. */
export function createUrbanGroundPatch(
  centerEcef: Cartesian3,
  radiusMeters: number,
  toLocal: (point: Cartesian3) => { x: number, y: number, z: number },
): { positions: Float32Array, indices: Uint32Array } {
  if (!Number.isFinite(radiusMeters) || radiusMeters < CELL_METERS || radiusMeters > MAX_RADIUS_METERS) {
    throw new Error('Invalid urban ground patch radius')
  }
  const geographic = Cartographic.fromCartesian(centerEcef)
  if (!geographic) throw new Error('Invalid urban ground patch center')
  const surfaceCenter = Cartesian3.fromRadians(geographic.longitude, geographic.latitude, URBAN_GROUND_HEIGHT)
  const toWorld = Transforms.eastNorthUpToFixedFrame(surfaceCenter)
  const segments = Math.ceil(2 * radiusMeters / CELL_METERS)
  const width = segments + 1
  const positions = new Float32Array(width * width * 3)
  const indices = new Uint32Array(segments * segments * 6)
  const tangent = new Cartesian3()
  const world = new Cartesian3()
  const geodetic = new Cartographic()
  for (let y = 0; y <= segments; y++) {
    for (let x = 0; x <= segments; x++) {
      tangent.x = -radiusMeters + x * 2 * radiusMeters / segments
      tangent.y = -radiusMeters + y * 2 * radiusMeters / segments
      tangent.z = 0
      Matrix4.multiplyByPoint(toWorld, tangent, world)
      Cartographic.fromCartesian(world, undefined, geodetic)
      Cartesian3.fromRadians(geodetic.longitude, geodetic.latitude, URBAN_GROUND_HEIGHT, undefined, world)
      const point = toLocal(world)
      positions.set([point.x, point.y, point.z], (y * width + x) * 3)
      if (x < segments && y < segments) {
        const i = y * width + x
        // Rapier east/up/south axes: positive Y faces the sky.
        indices.set([i, i + 1, i + width, i + 1, i + width + 1, i + width], (y * segments + x) * 6)
      }
    }
  }
  return { positions, indices }
}
