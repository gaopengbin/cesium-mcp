import { parseVisualGroundingReport } from 'cesium-mcp-spatial'
import type {
  ObservationSensor,
  VisualGroundingReport,
} from 'cesium-mcp-spatial'

export interface VisualGroundingFrame {
  dataUrl: string
  width: number
  height: number
  capturedAt: string
  sensor: ObservationSensor
}

export interface VisualGroundingObjectCandidate {
  objectId: string
  label: string
  summary: string
}

export interface VisualGroundingRegionCandidate {
  regionId: string
  label: string
  summary: string
}

export interface RequestVisualGroundingInput {
  endpoint: string
  observationId: string
  worldId: string
  worldRevision: number
  frame: VisualGroundingFrame
  objects: readonly VisualGroundingObjectCandidate[]
  regions: readonly VisualGroundingRegionCandidate[]
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

export interface VisualGroundingResult {
  report: VisualGroundingReport
  model: string
  imageDigest: string
  artifactRef: string
}

interface VisualGroundingResponse {
  report?: unknown
  model?: unknown
  error?: unknown
}

/**
 * Sends one independent Observer camera frame to the hosted visual grounding
 * sensor. The base64 payload stays request-local; callers retain only its
 * digest as the world-model artifact reference.
 */
export async function requestVisualGrounding(
  input: RequestVisualGroundingInput,
): Promise<VisualGroundingResult> {
  validateInput(input)
  const fetchImpl = input.fetchImpl ?? fetch
  const imageDigest = await sha256DataUrl(input.frame.dataUrl)
  const response = await fetchImpl(input.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Demo-Session': sessionIdentity(),
    },
    body: JSON.stringify({
      schemaVersion: 1,
      image: {
        dataUrl: input.frame.dataUrl,
        width: input.frame.width,
        height: input.frame.height,
        digest: imageDigest,
      },
      observation: {
        observationId: input.observationId,
        worldId: input.worldId,
        worldRevision: input.worldRevision,
        capturedAt: input.frame.capturedAt,
        sensor: input.frame.sensor,
      },
      candidates: {
        objects: input.objects,
        regions: input.regions,
      },
    }),
    signal: input.signal,
  })

  const body = await readJsonResponse(response)
  if (!response.ok) {
    const message = typeof body.error === 'string'
      ? body.error
      : `Visual grounding request failed with HTTP ${response.status}`
    throw new Error(message)
  }
  if (typeof body.model !== 'string' || !body.model.trim()) {
    throw new Error('Visual grounding response did not identify the model')
  }
  const report = parseVisualGroundingReport(body.report)
  if (report.imageDigest !== imageDigest) {
    throw new Error('Visual grounding response does not match the submitted image')
  }
  return {
    report,
    model: body.model,
    imageDigest,
    artifactRef: imageDigest,
  }
}

export async function sha256DataUrl(dataUrl: string): Promise<string> {
  const match = /^data:image\/(?:jpeg|png|webp);base64,([a-z\d+/]+={0,2})$/i.exec(dataUrl)
  if (!match) throw new Error('Visual grounding frame must be a JPEG, PNG, or WebP data URL')
  let binary: string
  try {
    binary = atob(match[1])
  } catch (error) {
    throw new Error('Visual grounding frame contains invalid base64', { cause: error })
  }
  if (binary.length === 0) throw new Error('Visual grounding frame must not be empty')
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), byte => (
    byte.toString(16).padStart(2, '0')
  )).join('')}`
}

function validateInput(input: RequestVisualGroundingInput): void {
  if (!input.endpoint.trim()) throw new Error('Visual grounding endpoint is required')
  if (!input.observationId.trim()) throw new Error('Visual grounding observation ID is required')
  if (!input.worldId.trim()) throw new Error('Visual grounding world ID is required')
  if (!Number.isInteger(input.worldRevision) || input.worldRevision < 1) {
    throw new Error('Visual grounding world revision must be a positive integer')
  }
  if (!Number.isInteger(input.frame.width) || input.frame.width < 1) {
    throw new Error('Visual grounding frame width must be a positive integer')
  }
  if (!Number.isInteger(input.frame.height) || input.frame.height < 1) {
    throw new Error('Visual grounding frame height must be a positive integer')
  }
  if (!Number.isFinite(Date.parse(input.frame.capturedAt))) {
    throw new Error('Visual grounding capture time must be an ISO timestamp')
  }
  if (input.frame.sensor.kind !== 'camera') {
    throw new Error('Visual grounding frame requires a camera sensor')
  }
  if (input.objects.length === 0 && input.regions.length === 0) {
    throw new Error('Visual grounding requires at least one candidate')
  }
}

async function readJsonResponse(response: Response): Promise<VisualGroundingResponse> {
  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    throw new Error('Visual grounding service returned invalid JSON', { cause: error })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Visual grounding service returned an invalid response')
  }
  return body as VisualGroundingResponse
}

function sessionIdentity(): string {
  const key = 'cesium-spatial-vision-session'
  try {
    const existing = window.sessionStorage.getItem(key)
    if (existing) return existing
    const created = crypto.randomUUID()
    window.sessionStorage.setItem(key, created)
    return created
  } catch {
    return 'spatial-context-experiment'
  }
}
