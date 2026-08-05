export interface BrowserClientLike {
  readyState: number
}

export interface BrowserTarget<Client> {
  client: Client | null
  sessionId: string | undefined
}

export interface PendingBrowserRequest<Client> {
  client: Client
  sessionId: string
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface BrowserResponse {
  id?: string
  result?: unknown
  error?: { message?: string } | unknown
}

export function resolveBrowserTarget<Client extends BrowserClientLike>(
  clients: ReadonlyMap<string, Client>,
  requestedSessionId: string | undefined,
  defaultSessionId: string,
  openReadyState: number,
): BrowserTarget<Client> {
  if (requestedSessionId) {
    const requested = clients.get(requestedSessionId)
    return {
      client: requested?.readyState === openReadyState ? requested : null,
      sessionId: requestedSessionId,
    }
  }

  const preferred = clients.get(defaultSessionId)
  if (preferred?.readyState === openReadyState) {
    return { client: preferred, sessionId: defaultSessionId }
  }

  for (const [sessionId, client] of clients) {
    if (client.readyState === openReadyState) return { client, sessionId }
  }

  return { client: null, sessionId: undefined }
}

export function settlePendingBrowserResponse<Client>(
  requests: Map<string, PendingBrowserRequest<Client>>,
  client: Client,
  message: BrowserResponse,
): boolean {
  if (!message.id) return false
  const pending = requests.get(message.id)
  if (!pending || pending.client !== client) return false

  requests.delete(message.id)
  clearTimeout(pending.timer)
  if (message.error) {
    const errorMessage = typeof message.error === 'object'
      && message.error !== null
      && 'message' in message.error
      ? String(message.error.message)
      : JSON.stringify(message.error)
    pending.reject(new Error(errorMessage))
  } else {
    pending.resolve(message.result)
  }
  return true
}

export function rejectPendingRequestsForClient<Client>(
  requests: Map<string, PendingBrowserRequest<Client>>,
  client: Client,
  error: Error,
): number {
  let rejected = 0
  for (const [requestId, pending] of requests) {
    if (pending.client !== client) continue
    requests.delete(requestId)
    clearTimeout(pending.timer)
    pending.reject(error)
    rejected++
  }
  return rejected
}
