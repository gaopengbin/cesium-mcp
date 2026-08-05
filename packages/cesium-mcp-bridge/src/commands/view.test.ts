import { describe, it, expect, vi } from 'vitest'

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

import { saveViewpoint, loadViewpoint, listViewpoints, setView } from './view.js'

function makeViewer(pos = { lon: 116.4, lat: 39.9, height: 5000, heading: 0, pitch: -45, roll: 0 }) {
  const lonRad = pos.lon * (Math.PI / 180)
  const latRad = pos.lat * (Math.PI / 180)
  const headingRad = pos.heading * (Math.PI / 180)
  const pitchRad = pos.pitch * (Math.PI / 180)
  const rollRad = pos.roll * (Math.PI / 180)

  let flyToCalled = false
  let setViewCalled = false
  let setViewOptions: any

  return {
    camera: {
      positionCartographic: { longitude: lonRad, latitude: latRad, height: pos.height },
      heading: headingRad,
      pitch: pitchRad,
      roll: rollRad,
      flyTo: (opts: any) => { flyToCalled = true; opts.complete?.() },
      flyToBoundingSphere: (_bs: any, opts: any) => { flyToCalled = true; opts.complete?.() },
      setView: (options: any) => { setViewCalled = true; setViewOptions = options },
      lookAt: () => { setViewCalled = true },
      lookAtTransform: () => {},
    },
    get _flyToCalled() { return flyToCalled },
    get _setViewCalled() { return setViewCalled },
    get _setViewOptions() { return setViewOptions },
  } as any
}

describe('setView', () => {
  it('applies an explicit roll after releasing the lookAt transform', () => {
    const viewer = makeViewer()
    setView(viewer, { longitude: 116.4, latitude: 39.9, roll: 30 })

    expect(viewer._setViewOptions.orientation.roll).toBeCloseTo(Math.PI / 6)
  })
})

describe('viewpoint bookmarks', () => {
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

    const list = listViewpoints(viewer)
    const names = list.map(v => v.name)
    expect(names).toContain('test-list-a')
    expect(names).toContain('test-list-b')
  })

  it('saveViewpoint should overwrite existing viewpoint', () => {
    const viewer = makeViewer({ lon: 100, lat: 20, height: 500, heading: 0, pitch: -45, roll: 0 })
    saveViewpoint(viewer, { name: 'test-overwrite-1' })
    viewer.camera.positionCartographic.longitude = 110 * (Math.PI / 180)
    viewer.camera.positionCartographic.latitude = 25 * (Math.PI / 180)
    viewer.camera.positionCartographic.height = 800
    saveViewpoint(viewer, { name: 'test-overwrite-1' })

    const state = loadViewpoint(viewer, { name: 'test-overwrite-1', duration: 0 })
    expect(state!.longitude).toBeCloseTo(110, 1)
  })

  it('isolates viewpoints with the same name between viewers', () => {
    const viewer1 = makeViewer({ lon: 100, lat: 20, height: 500, heading: 0, pitch: -45, roll: 0 })
    const viewer2 = makeViewer({ lon: 110, lat: 25, height: 800, heading: 0, pitch: -45, roll: 0 })

    saveViewpoint(viewer1, { name: 'shared-name' })
    saveViewpoint(viewer2, { name: 'shared-name' })

    expect(loadViewpoint(viewer1, { name: 'shared-name', duration: 0 })!.longitude).toBeCloseTo(100, 1)
    expect(loadViewpoint(viewer2, { name: 'shared-name', duration: 0 })!.longitude).toBeCloseTo(110, 1)
    expect(listViewpoints(viewer1)).toHaveLength(1)
    expect(listViewpoints(viewer2)).toHaveLength(1)
  })
})
