import { describe, expect, it, vi } from 'vitest'

import {
  rejectPendingRequestsForClient,
  resolveBrowserTarget,
  settlePendingBrowserResponse,
} from './browser-session-router.js'

interface FakeClient {
  readyState: number
}

const OPEN = 1
const CLOSED = 3

describe('resolveBrowserTarget', () => {
  it('routes an explicit session only to that open browser', () => {
    const projectA = { readyState: OPEN }
    const projectB = { readyState: OPEN }
    const clients = new Map([
      ['project-a', projectA],
      ['project-b', projectB],
    ])

    expect(resolveBrowserTarget(clients, 'project-b', 'project-a', OPEN)).toEqual({
      client: projectB,
      sessionId: 'project-b',
    })
  })

  it('fails closed when an explicit session is missing', () => {
    const projectA = { readyState: OPEN }
    const clients = new Map([['project-a', projectA]])

    expect(resolveBrowserTarget(clients, 'missing', 'project-a', OPEN)).toEqual({
      client: null,
      sessionId: 'missing',
    })
  })

  it('fails closed when an explicit session is disconnected', () => {
    const projectA = { readyState: OPEN }
    const projectB = { readyState: CLOSED }
    const clients = new Map([
      ['project-a', projectA],
      ['project-b', projectB],
    ])

    expect(resolveBrowserTarget(clients, 'project-b', 'project-a', OPEN)).toEqual({
      client: null,
      sessionId: 'project-b',
    })
  })

  it('uses the default session, then the first open browser, when no session is explicit', () => {
    const closedDefault = { readyState: CLOSED }
    const projectB = { readyState: OPEN }
    const clients = new Map([
      ['default', closedDefault],
      ['project-b', projectB],
    ])

    expect(resolveBrowserTarget(clients, undefined, 'default', OPEN)).toEqual({
      client: projectB,
      sessionId: 'project-b',
    })
  })
})

describe('pending browser response ownership', () => {
  function pending(client: FakeClient) {
    return {
      client,
      sessionId: 'project-a',
      resolve: vi.fn(),
      reject: vi.fn(),
      timer: setTimeout(() => {}, 60_000),
    }
  }

  it('ignores a response from a different browser session', () => {
    const owner = { readyState: OPEN }
    const other = { readyState: OPEN }
    const request = pending(owner)
    const requests = new Map([['req_1', request]])

    expect(settlePendingBrowserResponse(requests, other, {
      id: 'req_1',
      result: { success: true },
    })).toBe(false)
    expect(request.resolve).not.toHaveBeenCalled()
    expect(requests.has('req_1')).toBe(true)

    clearTimeout(request.timer)
  })

  it('settles only the response owned by the sending browser', () => {
    const owner = { readyState: OPEN }
    const request = pending(owner)
    const requests = new Map([['req_1', request]])

    expect(settlePendingBrowserResponse(requests, owner, {
      id: 'req_1',
      result: { success: true },
    })).toBe(true)
    expect(request.resolve).toHaveBeenCalledWith({ success: true })
    expect(requests.has('req_1')).toBe(false)
  })

  it('rejects requests owned by a browser as soon as it disconnects', () => {
    const owner = { readyState: OPEN }
    const other = { readyState: OPEN }
    const owned = pending(owner)
    const unrelated = pending(other)
    const requests = new Map([
      ['req_1', owned],
      ['req_2', unrelated],
    ])
    const error = new Error('Browser session disconnected: project-a')

    expect(rejectPendingRequestsForClient(requests, owner, error)).toBe(1)
    expect(owned.reject).toHaveBeenCalledWith(error)
    expect(unrelated.reject).not.toHaveBeenCalled()
    expect(requests.has('req_1')).toBe(false)
    expect(requests.has('req_2')).toBe(true)

    clearTimeout(unrelated.timer)
  })
})
