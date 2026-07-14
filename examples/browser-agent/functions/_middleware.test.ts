import { describe, expect, it } from 'vitest'

import { withWebMcpHeaders } from './_middleware.js'

describe('browser-agent WebMCP headers', () => {
  it('adds origin isolation without inventing an Origin Trial token', async () => {
    const response = withWebMcpHeaders(new Response('demo', { status: 201 }))

    expect(response.status).toBe(201)
    expect(response.headers.get('Origin-Agent-Cluster')).toBe('?1')
    expect(response.headers.has('Origin-Trial')).toBe(false)
    expect(await response.text()).toBe('demo')
  })

  it('adds the configured Origin Trial token', () => {
    const response = withWebMcpHeaders(new Response('demo'), {
      WEBMCP_ORIGIN_TRIAL_TOKEN: 'registered-token',
    })

    expect(response.headers.get('Origin-Trial')).toBe('registered-token')
  })
})
