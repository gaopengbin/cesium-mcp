import { validateJevRouteResult, validateNavigationRouteObservation } from '../src/jev-route-planner.js'
import type { NavigationRouteId, NavigationRouteObservation } from '../src/jev-route-planner.js'

export function buildJevRouteRequest(input: unknown) {
  const observation = validateNavigationRouteObservation(input)
  const criteria: Partial<Record<NavigationRouteId, string>> = {}
  for (const candidate of observation.candidates) {
    if (candidate.feasible) criteria[candidate.id] = `Select the supplied ${candidate.id} corridor around the building.`
  }
  criteria.hold = 'Stay still if no candidate is feasible, the goal is reached, or the supplied options do not support safe movement.'
  return {
    model: 'jev-latest',
    state: JSON.stringify(observation),
    questions: {
      route: {
        type: 'choice',
        instructions: 'Choose a route for this simulated Cesium agent using only the supplied candidate metrics. '
          + 'A local geometry algorithm generated and collision-checked these candidate corridors; your choice does not generate the route geometry. '
          + 'Select only a feasible offered corridor. Prefer the shorter safe route; for similar lengths prefer more clearance and fewer turns. '
          + 'If straightLineBlocked is true, do not attempt a direct shortcut through the building. '
          + 'Within 2 meters of the goal, or when no route is feasible, hold. '
          + 'The local controller follows the chosen geometry and retains immediate collision prevention. '
          + 'Do not infer visual perception or unobserved terrain from these structured metrics.',
        criteria,
      },
    },
  }
}

export function parseJevRouteResult(body: unknown, latencyMs: number, input: NavigationRouteObservation) {
  const observation = validateNavigationRouteObservation(input)
  if (!record(body) || !record(body.answers) || !record(body.answers.route)) throw new Error('Invalid Jev route response')
  const answer = body.answers.route
  if (answer.type !== 'choice') throw new Error('Invalid Jev route choice type')
  const usage: Record<string, number> = {}
  for (const key of ['input_tokens', 'output_tokens']) {
    if (record(body.usage) && typeof body.usage[key] === 'number'
      && Number.isSafeInteger(body.usage[key]) && body.usage[key] >= 0) usage[key] = body.usage[key]
  }
  return validateJevRouteResult({
    offerId: observation.offerId, revision: observation.revision,
    routeId: answer.choice, confidence: answer.confidence, probabilities: answer.probabilities,
    model: body.model, latencyMs, usage,
  }, observation)
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
