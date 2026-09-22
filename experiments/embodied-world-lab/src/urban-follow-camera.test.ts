import { Cartesian3, Cartographic, Matrix4, Transforms } from 'cesium'
import { describe, expect, it } from 'vitest'
import { UrbanFollowCamera } from './urban-follow-camera.js'

const actor = Cartesian3.fromDegrees(139.764, 35.681, 39)
const localFrame = Transforms.eastNorthUpToFixedFrame(actor)
const toLocal = (point: Cartesian3) => Matrix4.multiplyByPoint(Matrix4.inverse(localFrame, new Matrix4()), point, new Cartesian3())

describe('urban presentation camera', () => {
  it('looks obliquely over the actor with enough height to see the city', () => {
    const pose = new UrbanFollowCamera().update(actor, 0, 70, 0)
    const worldUp = Matrix4.multiplyByPointAsVector(Transforms.eastNorthUpToFixedFrame(actor), Cartesian3.UNIT_Z, new Cartesian3())
    expect(Cartographic.fromCartesian(pose.position).height).toBeGreaterThan(108)
    const pitch = Math.asin(Cartesian3.dot(pose.direction, worldUp)) * 180 / Math.PI
    expect(pitch).toBeGreaterThan(-40)
    expect(pitch).toBeLessThan(-20)
    expect(Cartesian3.dot(pose.direction, pose.up)).toBeCloseTo(0)
  })

  it('crosses the heading wrap without swinging around the actor', () => {
    const camera = new UrbanFollowCamera()
    const before = camera.update(actor, Math.PI - 0.01, 70, 0)
    const after = camera.update(actor, -Math.PI + 0.01, 70, 50)
    expect(Cartesian3.distance(before.position, after.position)).toBeLessThan(1)
    expect(Cartesian3.dot(before.direction, after.direction)).toBeGreaterThan(0.999)
  })

  it('resets at a new mission rather than flying through buildings from the old position', () => {
    const camera = new UrbanFollowCamera()
    camera.update(actor, 0, 70, 0)
    camera.reset()
    const newActor = Cartesian3.fromDegrees(139.761, 35.690, 39)
    const pose = camera.update(newActor, 1, 70, 50)
    expect(Cartesian3.distance(pose.position, newActor)).toBeLessThan(115)
    expect(Cartesian3.distance(pose.position, actor)).toBeGreaterThan(900)
  })

  it('finds a side view at the same height when a building blocks the preferred view', () => {
    const pose = new UrbanFollowCamera().update(actor, 0, 70, 0, (from, to) => {
      const head = toLocal(from)
      expect(head.x).toBeCloseTo(0)
      expect(head.y).toBeCloseTo(0)
      expect(head.z).toBeCloseTo(2)
      return Math.abs(toLocal(to).x) > 20
    })
    const position = toLocal(pose.position)
    expect(Math.abs(position.x)).toBeGreaterThan(20)
    expect(position.z).toBeCloseTo(70)
    expect(Math.hypot(position.x, position.y)).toBeCloseTo(87.5)
  })

  it('prefers its last unobstructed side and clears that preference on reset', () => {
    const camera = new UrbanFollowCamera()
    camera.update(actor, 0, 70, 0, (_from, to) => toLocal(to).x < -20)
    const checked: Cartesian3[] = []
    const clear = (_from: Cartesian3, to: Cartesian3) => { checked.push(toLocal(to)); return true }
    camera.update(actor, 0, 70, 50, clear)
    expect(checked[0].x).toBeLessThan(-20)
    camera.reset()
    checked.length = 0
    camera.update(actor, 0, 70, 100, clear)
    expect(checked[0].x).toBeCloseTo(0)
    expect(checked[0].y).toBeCloseTo(-87.5)
  })

  it('raises the oblique view only when every side at the selected height is blocked', () => {
    const checkedHeights: number[] = []
    const pose = new UrbanFollowCamera().update(actor, 0, 70, 0, (_from, to) => {
      const height = toLocal(to).z
      checkedHeights.push(height)
      return height > 100
    })
    expect(checkedHeights.filter(height => Math.abs(height - 70) < 0.001)).toHaveLength(8)
    expect(toLocal(pose.position).z).toBeCloseTo(105)
    expect(Math.hypot(toLocal(pose.position).x, toLocal(pose.position).y)).toBeCloseTo(131.25)
  })

  it('raises an obstruction escape above the former 180 metre ceiling', () => {
    const checkedHeights: number[] = []
    const pose = new UrbanFollowCamera().update(actor, 0, 160, 0, (_from, to) => {
      const height = toLocal(to).z
      checkedHeights.push(height)
      return height > 200
    })
    expect(checkedHeights.filter(height => Math.abs(height - 160) < 0.001)).toHaveLength(8)
    expect(toLocal(pose.position).z).toBeCloseTo(240)
  })

  it.each([300, 1_000, 5_000, 20_000])('uses the requested %s metre height for an unobstructed view', (height) => {
    const pose = new UrbanFollowCamera().update(actor, 0, height, 0)
    const position = toLocal(pose.position)
    expect(position.z).toBeCloseTo(height)
    expect(Math.hypot(position.x, position.y)).toBeCloseTo(height * 1.25)
    expect(Cartesian3.magnitude(pose.direction)).toBeCloseTo(1)
    expect(Cartesian3.dot(pose.direction, pose.up)).toBeCloseTo(0)
  })

  it('searches upward from a high selected altitude instead of falling back to 180 metres', () => {
    const checkedHeights: number[] = []
    const pose = new UrbanFollowCamera().update(actor, 0, 5_000, 0, (_from, to) => {
      const height = toLocal(to).z
      checkedHeights.push(height)
      return height > 7_000
    })
    expect(Math.min(...checkedHeights)).toBeGreaterThan(4_999.999)
    expect(toLocal(pose.position).z).toBeCloseTo(7_500)
  })

  it('keeps a fully blocked overhead fallback above the selected high altitude', () => {
    const pose = new UrbanFollowCamera().update(actor, 0, 5_000, 0, () => false)
    expect(toLocal(pose.position).z).toBeCloseTo(10_000)
    expect(Cartesian3.magnitude(pose.direction)).toBeCloseTo(1)
    expect(Cartesian3.magnitude(pose.up)).toBeCloseTo(1)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('retains a finite default view for invalid altitude %s', (height) => {
    const pose = new UrbanFollowCamera().update(actor, 0, height, 0)
    expect(toLocal(pose.position).z).toBeCloseTo(70)
    expect(Cartesian3.magnitude(pose.direction)).toBeCloseTo(1)
  })

  it('uses a nondegenerate overhead fallback only when side views are blocked', () => {
    const pose = new UrbanFollowCamera().update(actor, 0, 70, 0, (_from, to) => {
      const point = toLocal(to)
      return Math.hypot(point.x, point.y) < 1.01
    })
    const position = toLocal(pose.position)
    expect(Math.hypot(position.x, position.y)).toBeCloseTo(1)
    expect(position.z).toBeGreaterThanOrEqual(69.999)
    expect(Cartesian3.magnitude(pose.direction)).toBeCloseTo(1)
    expect(Cartesian3.magnitude(pose.up)).toBeCloseTo(1)
    expect(Cartesian3.dot(pose.direction, pose.up)).toBeCloseTo(0)
  })

  it('snaps to the clear destination when smoothing would leave the actor occluded', () => {
    const camera = new UrbanFollowCamera()
    const before = camera.update(actor, 0, 70, 0, (_from, to) => toLocal(to).x < -20)
    const clear = (_from: Cartesian3, to: Cartesian3) => toLocal(to).x > 20
    const after = camera.update(actor, 0, 70, 50, clear)
    expect(toLocal(before.position).x).toBeLessThan(-20)
    expect(toLocal(after.position).x).toBeGreaterThan(20)
    expect(toLocal(after.position).z).toBeCloseTo(70)
    expect(clear(actor, after.position)).toBe(true)
  })
})
