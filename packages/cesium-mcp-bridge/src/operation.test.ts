import { describe, expect, it, vi } from 'vitest'
import { awaitOperation, discardResource } from './operation.js'

describe('pending Cesium operations', () => {
  it('settles cancellation immediately and destroys a resource arriving later', async () => {
    let finish!: (resource: { destroy: () => void }) => void
    const loading = new Promise<{ destroy: () => void }>(resolve => { finish = resolve })
    const controller = new AbortController()
    const result = awaitOperation(loading, controller.signal, discardResource)
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    const resource = { destroy: vi.fn() }
    finish(resource)
    await loading
    expect(resource.destroy).toHaveBeenCalledOnce()
  })

  it('removes its abort listener on successful completion', async () => {
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const discard = vi.fn()
    await expect(awaitOperation(Promise.resolve('ready'), controller.signal, discard)).resolves.toBe('ready')
    controller.abort()
    expect(discard).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})
