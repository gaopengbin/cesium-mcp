import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('cesium', () => ({
  Math: {
    toDegrees: (r: number) => r * (180 / Math.PI),
    toRadians: (d: number) => d * (Math.PI / 180),
  },
  Cartesian3: {
    fromDegrees: (lon: number, lat: number, h?: number) => ({ _lon: lon, _lat: lat, _h: h ?? 0 }),
  },
  Rectangle: {
    fromDegrees: (w: number, s: number, e: number, n: number) => ({ west: w, south: s, east: e, north: n }),
  },
  BoundingSphere: class { center: any; radius: number; constructor(c: any, r: number) { this.center = c; this.radius = r } },
  HeadingPitchRange: class { heading: number; pitch: number; range: number; constructor(h: number, p: number, r: number) { this.heading = h; this.pitch = p; this.range = r } },
  Matrix4: { IDENTITY: 'IDENTITY' },
  default: {},
}))

import { saveViewpoint, loadViewpoint, listViewpoints } from './view.js'

function makeViewer(pos = { lon: 116.4, lat: 39.9, height: 5000, heading: 0, pitch: -45, roll: 0 }) {
  const lonRad = pos.lon * (Math.PI / 180)
  const latRad = pos.lat * (Math.PI / 180)
  const headingRad = pos.heading * (Math.PI / 180)
  const pitchRad = pos.pitch * (Math.PI / 180)
  const rollRad = pos.roll * (Math.PI / 180)

  let flyToCalled = false
  let setViewCalled = false

  return {
    camera: {
      positionCartographic: { longitude: lonRad, latitude: latRad, height: pos.height },
      heading: headingRad,
      pitch: pitchRad,
      roll: rollRad,
      flyTo: (opts: any) => { flyToCalled = true; opts.complete?.() },
      flyToBoundingSphere: (_bs: any, opts: any) => { flyToCalled = true; opts.complete?.() },
      setView: () => { setViewCalled = true },
      lookAt: () => { setViewCalled = true },
      lookAtTransform: () => {},
    },
    get _flyToCalled() { return flyToCalled },
    get _setViewCalled() { return setViewCalled },
  } as any
}

// Clear the module-level _viewpoints Map between tests
// We do this by saving/loading and checking behavior
describe('viewpoint bookmarks', () => {
  // Each test uses unique viewpoint names to avoid state leakage

  it('saveViewpoint should save camera state and return it', () => {
    const viewer = makeViewer()
    const state = saveViewpoint(viewer, { name: 'test-save-1' })
    expect(state.longitude).toBeCloseTo(116.4, 1)
    expect(state.latitude).toBeCloseTo(39.9, 1)
    expect(state.height).toBe(5000)
  })

  it('loadViewpoint should return saved state', () => {
    const viewer = makeViewer({ lon: 120, lat: 30, height: 1000, heading: 10, pitch: -30, roll: 0 })
    saveViewpoint(viewer, { name: 'test-load-1' })

    const state = loadViewpoint(viewer, { name: 'test-load-1' })
    expect(state).not.toBeNull()
    expect(state!.longitude).toBeCloseTo(120, 1)
    expect(state!.latitude).toBeCloseTo(30, 1)
  })

  it('loadViewpoint should return null for non-existent viewpoint', () => {
    const viewer = makeViewer()
    const state = loadViewpoint(viewer, { name: 'non-existent-abc' })
    expect(state).toBeNull()
  })

  it('loadViewpoint with duration=0 should use setView (instant)', () => {
    const viewer = makeViewer()
    saveViewpoint(viewer, { name: 'test-instant-1' })
    loadViewpoint(viewer, { name: 'test-instant-1', duration: 0 })
    expect(viewer._setViewCalled).toBe(true)
  })

  it('loadViewpoint with duration>0 should use flyTo', () => {
    const viewer = makeViewer()
    saveViewpoint(viewer, { name: 'test-fly-1' })
    loadViewpoint(viewer, { name: 'test-fly-1', duration: 3 })
    expect(viewer._flyToCalled).toBe(true)
  })

  it('listViewpoints should include saved viewpoints', () => {
    const viewer = makeViewer()
    saveViewpoint(viewer, { name: 'test-list-a' })
    saveViewpoint(viewer, { name: 'test-list-b' })

    const list = listViewpoints()
    const names = list.map(v => v.name)
    expect(names).toContain('test-list-a')
    expect(names).toContain('test-list-b')
  })

  it('saveViewpoint should overwrite existing viewpoint', () => {
    const viewer1 = makeViewer({ lon: 100, lat: 20, height: 500, heading: 0, pitch: -45, roll: 0 })
    saveViewpoint(viewer1, { name: 'test-overwrite-1' })

    const viewer2 = makeViewer({ lon: 110, lat: 25, height: 800, heading: 0, pitch: -45, roll: 0 })
    saveViewpoint(viewer2, { name: 'test-overwrite-1' })

    const state = loadViewpoint(viewer2, { name: 'test-overwrite-1', duration: 0 })
    expect(state!.longitude).toBeCloseTo(110, 1)
  })
})
