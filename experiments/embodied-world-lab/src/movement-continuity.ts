interface MovementSample {
  nowMs: number
  positionEcef: { x: number, y: number, z: number }
  translationInput: boolean
  planning: boolean
  safetyClear: boolean
}

export function createMovementContinuity() {
  const stats = {
    inputMovingTicks: 0,
    planningWhileInputTicks: 0,
    movingTicks: 0,
    planningWhileMovingTicks: 0,
    waitingForFirstPlanTicks: 0,
    waitingForRenewalTicks: 0,
    actualDistanceMeters: 0,
    planningWhileMovingMs: 0,
    maxRenewalStationaryMs: 0,
    currentRenewalStationaryMs: 0,
    unobservedMs: 0,
  }
  let previous: (MovementSample & { hadAcceptedPlan: boolean }) | undefined
  let hadAcceptedPlan = false

  return {
    stats,
    beginRun() {
      previous = undefined
      hadAcceptedPlan = false
      stats.currentRenewalStationaryMs = 0
    },
    acceptedPlan() { hadAcceptedPlan = true },
    observe(sample: MovementSample) {
      const before = previous
      previous = { ...sample, positionEcef: { ...sample.positionEcef }, hadAcceptedPlan }
      if (!before) return
      const elapsed = sample.nowMs - before.nowMs
      if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 500) {
        if (elapsed > 500) stats.unobservedMs += elapsed
        stats.currentRenewalStationaryMs = 0
        return
      }
      const distance = horizontalDistance(before.positionEcef, sample.positionEcef)
      // Require 2 cm/s of measured horizontal displacement, not controller velocity.
      const moving = Number.isFinite(distance) && distance / (elapsed / 1_000) > 0.02
      if (before.translationInput) stats.inputMovingTicks += 1
      if (before.planning && before.translationInput) stats.planningWhileInputTicks += 1
      if (moving) {
        stats.movingTicks += 1
        stats.actualDistanceMeters += distance
        if (before.planning) {
          stats.planningWhileMovingTicks += 1
          stats.planningWhileMovingMs += elapsed
        }
      }
      if (before.planning && !moving && !before.hadAcceptedPlan) stats.waitingForFirstPlanTicks += 1
      const renewalStationary = before.planning && before.hadAcceptedPlan && before.safetyClear && !moving
      if (renewalStationary) {
        stats.waitingForRenewalTicks += 1
        stats.currentRenewalStationaryMs += elapsed
        stats.maxRenewalStationaryMs = Math.max(stats.maxRenewalStationaryMs, stats.currentRenewalStationaryMs)
      } else stats.currentRenewalStationaryMs = 0
    },
  }
}

function horizontalDistance(from: MovementSample['positionEcef'], to: MovementSample['positionEcef']): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  // WGS84 surface normal removes vertical settling from the ECEF displacement.
  const nx = from.x / (6_378_137 ** 2)
  const ny = from.y / (6_378_137 ** 2)
  const nz = from.z / (6_356_752.314245 ** 2)
  const length = Math.hypot(nx, ny, nz)
  const vertical = (dx * nx + dy * ny + dz * nz) / length
  return Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - vertical * vertical))
}
