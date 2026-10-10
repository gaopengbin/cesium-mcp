import { randomBytes } from 'node:crypto'

interface PublicMapSessionOptions {
  capacity?: number
  idleMs?: number
  lifetimeMs?: number
  now?: () => number
}

/** Opaque bearer capabilities for anonymous, ephemeral maps; never enumerate them. */
export class PublicMapSessions {
  private readonly maps = new Map<string, { created: number; touched: number }>()
  private readonly capacity: number
  private readonly idleMs: number
  private readonly lifetimeMs: number
  private readonly now: () => number

  constructor(options: PublicMapSessionOptions = {}) {
    this.capacity = options.capacity ?? 60
    this.idleMs = options.idleMs ?? 30 * 60_000
    this.lifetimeMs = options.lifetimeMs ?? 24 * 60 * 60_000
    this.now = options.now ?? Date.now
  }

  open(existing?: string): string {
    if (existing !== undefined) return this.require(existing)
    if (this.maps.size >= this.capacity) throw new Error('Map service is at capacity. Please try again later.')
    const id = `map-${randomBytes(32).toString('base64url')}`
    const now = this.now()
    this.maps.set(id, { created: now, touched: now })
    return id
  }

  require(id: unknown): string {
    if (typeof id !== 'string' || !id) throw new Error('Pass the sessionId returned by openCesiumMap. No default map is used.')
    const entry = this.maps.get(id)
    const now = this.now()
    if (!entry || now - entry.touched >= this.idleMs || now - entry.created >= this.lifetimeMs) {
      throw new Error('Map capability is invalid or expired. Open a new map.')
    }
    entry.touched = now
    return id
  }

  sweep(): string[] {
    const expired: string[] = []
    const now = this.now()
    for (const [id, entry] of this.maps) {
      if (now - entry.touched >= this.idleMs || now - entry.created >= this.lifetimeMs) {
        this.maps.delete(id)
        expired.push(id)
      }
    }
    return expired
  }
}
