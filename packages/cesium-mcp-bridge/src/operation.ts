/** Stop awaiting an operation while safely discarding a late Cesium resource. */
export function awaitOperation<T>(
  operation: Promise<T>,
  signal?: AbortSignal,
  discard?: (value: T) => void,
): Promise<T> {
  if (!signal) return operation
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    void operation.then(value => {
      signal.removeEventListener('abort', abort)
      if (signal.aborted) discard?.(value)
      else resolve(value)
    }, error => {
      signal.removeEventListener('abort', abort)
      reject(error)
    }).catch(reject)
  })
}

export function discardResource(value: unknown): void {
  const resource = value as { destroy?: () => void; isDestroyed?: () => boolean } | undefined
  if (resource?.destroy && !resource.isDestroyed?.()) resource.destroy()
}

export function checkOperation(signal?: AbortSignal, resource?: unknown): void {
  if (!signal?.aborted) return
  discardResource(resource)
  signal.throwIfAborted()
}
