import { describe, expect, it, vi } from 'vitest'

import {
  requestVisualGrounding,
  sha256DataUrl,
} from './visual-grounding-client.js'

const dataUrl = 'data:image/jpeg;base64,aGVsbG8='
const digest = 'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'

function input(fetchImpl: typeof fetch) {
  return {
    endpoint: '/api/vision-grounding',
    observationId: 'observation-1',
    worldId: 'himalaya-flight',
    worldRevision: 2,
    frame: {
      dataUrl,
      width: 2,
      height: 2,
      capturedAt: '2026-09-02T01:00:00.000Z',
      sensor: {
        sensorId: 'observer-camera',
        kind: 'camera' as const,
      },
    },
    objects: [{
      objectId: 'dynamic-no-fly-zone',
      label: 'Temporary no-fly zone',
      summary: 'Red volume ahead.',
    }],
    regions: [{
      regionId: 'forward-flight-corridor',
      label: 'Forward corridor',
      summary: 'Immediate flight corridor.',
    }],
    fetchImpl,
  }
}

function report(imageDigest = digest) {
  return {
    schemaVersion: 1,
    imageDigest,
    objects: [{
      objectId: 'dynamic-no-fly-zone',
      visibility: 'visible',
      confidence: 0.9,
      bbox: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 },
    }],
    regions: [{
      regionId: 'forward-flight-corridor',
      occupancy: 'occupied',
      coverage: 'partial',
      confidence: 0.85,
      blockingObjectIds: ['dynamic-no-fly-zone'],
    }],
    limitations: ['Partial camera coverage.'],
  }
}

describe('visual grounding client', () => {
  it('hashes the exact image bytes', async () => {
    await expect(sha256DataUrl(dataUrl)).resolves.toBe(digest)
  })

  it('posts one bounded frame and returns only digest-based artifact metadata', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      report: report(),
      model: '@cf/qwen/qwen3.8-27b',
    }))

    const result = await requestVisualGrounding(input(fetchImpl))

    expect(result.imageDigest).toBe(digest)
    expect(result.artifactRef).toBe(digest)
    expect(JSON.stringify(result)).not.toContain(dataUrl)
    expect(result.report.regions[0]?.occupancy).toBe('occupied')
    const request = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)
    expect(request.image).toMatchObject({ dataUrl, digest })
    expect(fetchImpl).toHaveBeenCalledWith('/api/vision-grounding', expect.objectContaining({
      method: 'POST',
    }))
  })

  it('rejects a response for a different image', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      report: report(`sha256:${'0'.repeat(64)}`),
      model: '@cf/qwen/qwen3.8-27b',
    }))

    await expect(requestVisualGrounding(input(fetchImpl)))
      .rejects.toThrow('does not match the submitted image')
  })

  it('surfaces structured service errors without accepting a report', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(
      { error: 'Visual grounding temporarily unavailable' },
      { status: 502 },
    ))

    await expect(requestVisualGrounding(input(fetchImpl)))
      .rejects.toThrow('Visual grounding temporarily unavailable')
  })
})
