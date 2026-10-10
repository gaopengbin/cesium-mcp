import { randomUUID } from 'node:crypto'

import type { BrowserResponse } from './browser-session-router.js'

export interface AppSessionRequest {
  sessionId: string
  token?: string
  results?: BrowserResponse[]
}

/** A browser bridge carried by app-only MCP tool calls, with no local network access. */
export class AppSessionClient {
  readyState = 1
  readonly token = randomUUID()
  private commands: Record<string, unknown>[] = []
  private commandBytes = 0
  private wake: (() => void) | undefined
  private lease: ReturnType<typeof setTimeout> | undefined
  private polling = false

  constructor(readonly sessionId: string, private readonly onClose: () => void) {
    this.refreshLease()
  }

  send(data: string): void {
    if (this.readyState !== 1) throw new Error('Map session is disconnected')
    if (this.commands.length >= 128) throw new Error('Map command queue is full. Wait for the map to catch up.')
    const bytes = Buffer.byteLength(data)
    if (this.commandBytes + bytes > 1024 * 1024) throw new Error('Map command queue exceeds its 1 MiB limit')
    this.commands.push(JSON.parse(data))
    this.commandBytes += bytes
    this.wake?.()
  }

  async poll(): Promise<Record<string, unknown>[]> {
    if (this.polling) throw new Error('A map exchange is already pending')
    this.polling = true
    this.refreshLease()
    try {
      if (!this.commands.length) {
        await new Promise<void>(resolve => {
          const timer = setTimeout(() => { this.wake = undefined; resolve() }, 1000)
          this.wake = () => { clearTimeout(timer); this.wake = undefined; resolve() }
        })
      }
      if (this.readyState !== 1) throw new Error('Map session was replaced or disconnected')
      this.commandBytes = 0
      return this.commands.splice(0)
    } finally {
      this.polling = false
    }
  }

  close(_code?: number, _reason?: string): void {
    if (this.readyState !== 1) return
    this.readyState = 3
    clearTimeout(this.lease)
    this.commands = []
    this.commandBytes = 0
    this.wake?.()
    this.onClose()
  }

  private refreshLease(): void {
    clearTimeout(this.lease)
    this.lease = setTimeout(() => this.close(), 60_000)
    this.lease.unref()
  }
}
