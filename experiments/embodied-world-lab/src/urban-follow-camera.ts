import { Cartesian3, Matrix4, Transforms } from 'cesium'

export interface UrbanCameraPose {
  position: Cartesian3
  direction: Cartesian3
  up: Cartesian3
}

type SightlineCheck = (from: Cartesian3, to: Cartesian3) => boolean

const ORBIT_OFFSETS = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI, 3 * Math.PI / 4, -3 * Math.PI / 4]

/** Presentation camera only: never feeds its heading back into the actor. */
export class UrbanFollowCamera {
  private heading: number | undefined
  private lastTime: number | undefined
  private position: Cartesian3 | undefined
  private target: Cartesian3 | undefined
  private clearYawOffset = 0

  reset(): void {
    this.heading = undefined
    this.lastTime = undefined
    this.position = undefined
    this.target = undefined
    this.clearYawOffset = 0
  }

  update(
    actor: Cartesian3,
    heading: number,
    heightMeters: number,
    nowMs: number,
    isSightlineClear?: SightlineCheck,
  ): UrbanCameraPose {
    const deltaMs = this.lastTime === undefined ? 0 : Math.max(0, Math.min(100, nowMs - this.lastTime))
    const weight = this.lastTime === undefined ? 1 : 1 - Math.exp(-deltaMs / 240)
    this.lastTime = nowMs
    const headingDelta = Math.atan2(Math.sin(heading - (this.heading ?? heading)), Math.cos(heading - (this.heading ?? heading)))
    this.heading = (this.heading ?? heading) + headingDelta * weight
    const height = Number.isFinite(heightMeters) ? Math.max(25, heightMeters) : 70
    const frame = Transforms.eastNorthUpToFixedFrame(actor)
    const head = Matrix4.multiplyByPoint(frame, new Cartesian3(0, 0, 2), new Cartesian3())
    const clear = isSightlineClear ?? (() => true)
    const { destination, target } = this.chooseView(frame, head, height, this.heading, clear)
    this.position = this.position ? Cartesian3.lerp(this.position, destination, weight, this.position) : destination
    this.target = this.target ? Cartesian3.lerp(this.target, target, weight, this.target) : target
    // Two clear endpoints can have an occluded interpolation between them.
    if (!clear(head, this.position)) {
      this.position = Cartesian3.clone(destination, this.position)
      this.target = Cartesian3.clone(target, this.target)
    }
    const direction = Cartesian3.normalize(Cartesian3.subtract(this.target, this.position, new Cartesian3()), new Cartesian3())
    const worldUp = Matrix4.multiplyByPointAsVector(frame, Cartesian3.UNIT_Z, new Cartesian3())
    const right = Cartesian3.normalize(Cartesian3.cross(direction, worldUp, new Cartesian3()), new Cartesian3())
    const up = Cartesian3.normalize(Cartesian3.cross(right, direction, new Cartesian3()), new Cartesian3())
    return { position: Cartesian3.clone(this.position), direction, up }
  }

  private chooseView(frame: Matrix4, head: Cartesian3, height: number, heading: number, clear: SightlineCheck) {
    // Obstruction escape always starts at the selected height and searches up.
    const heights = [height, height * 1.5, height * 2].filter(Number.isFinite)
    const offsets = [this.clearYawOffset, ...ORBIT_OFFSETS.filter(offset => offset !== this.clearYawOffset)]
    const east = Math.sin(heading)
    const north = Math.cos(heading)
    for (const candidateHeight of heights) {
      for (const offset of offsets) {
        const orbit = heading + offset
        const destination = Matrix4.multiplyByPoint(frame, new Cartesian3(
          -Math.sin(orbit) * candidateHeight * 1.25,
          -Math.cos(orbit) * candidateHeight * 1.25,
          candidateHeight,
        ), new Cartesian3())
        if (!clear(head, destination)) continue
        this.clearYawOffset = offset
        const target = Matrix4.multiplyByPoint(frame, new Cartesian3(
          east * candidateHeight * 0.07,
          north * candidateHeight * 0.07,
          3,
        ), new Cartesian3())
        return { destination, target }
      }
    }

    // Only resort to an overhead view after all oblique positions are blocked.
    // One metre of horizontal offset keeps direction/up from becoming parallel.
    let destination = head
    for (const candidateHeight of heights) {
      destination = Matrix4.multiplyByPoint(frame, new Cartesian3(-east, -north, candidateHeight), new Cartesian3())
      if (clear(head, destination)) return { destination, target: head }
    }
    // A checker may reject every possible position (for example under a roof).
    // Retain a finite elevated view; this last resort is not certified clear.
    return { destination, target: head }
  }
}
