import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function createPublicBudget(path: string, dailyLimit = 5_000, hourlyLimit = 180, clock = Date.now) {
  if (![dailyLimit, hourlyLimit].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('Invalid public demo limits')
  let day = ''
  let count = 0
  try {
    const saved = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof saved.day !== 'string' || !Number.isSafeInteger(saved.count) || saved.count < 0) throw new Error('Invalid budget state')
    day = saved.day
    count = saved.count
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const clients = new Map<string, { hour: number, count: number }>()
  return (ip: string): string | undefined => {
    const now = clock()
    const today = new Date(now).toISOString().slice(0, 10)
    const hour = Math.floor(now / 3_600_000)
    if (today !== day) { day = today; count = 0 }
    if (count >= dailyLimit) return 'The public demo has reached its daily model quota. Please try tomorrow.'
    const client = clients.get(ip)
    if (client?.hour === hour && client.count >= hourlyLimit) return 'This connection has reached the hourly demo limit. Please try later.'
    // Keep bounded counters only, not request bodies, coordinates or full access logs.
    if (clients.size >= 5_000) for (const [key, value] of clients) if (value.hour !== hour) clients.delete(key)
    if (!client && clients.size >= 5_000) return 'The public demo is busy. Please try later.'
    const nextCount = count + 1
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path + '.tmp', JSON.stringify({ day, count: nextCount }), { mode: 0o600 })
    renameSync(path + '.tmp', path)
    count = nextCount
    clients.set(ip, { hour, count: client?.hour === hour ? client.count + 1 : 1 })
  }
}
