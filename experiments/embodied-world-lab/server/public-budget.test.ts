import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createPublicBudget } from './public-budget.js'

const directories: string[] = []
const statePath = () => {
  const directory = mkdtempSync(join(tmpdir(), 'jev-budget-'))
  directories.push(directory)
  return join(directory, 'budget.json')
}
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true }) })

describe('public demo budget', () => {
  it('limits each client independently and preserves the shared quota across restart', () => {
    const path = statePath()
    const now = () => Date.UTC(2026, 8, 22, 10)
    const allow = createPublicBudget(path, 3, 1, now)
    expect(allow('a')).toBeUndefined()
    expect(allow('a')).toContain('hourly')
    expect(allow('b')).toBeUndefined()
    const restarted = createPublicBudget(path, 3, 1, now)
    expect(restarted('c')).toBeUndefined()
    expect(restarted('d')).toContain('daily')
    expect(JSON.parse(readFileSync(path, 'utf8')).count).toBe(3)
  })
  it('renews the daily budget without storing request content', () => {
    const path = statePath()
    let now = Date.UTC(2026, 8, 22)
    const allow = createPublicBudget(path, 1, 1, () => now)
    allow('client')
    now += 86_400_000
    expect(allow('client')).toBeUndefined()
    expect(Object.keys(JSON.parse(readFileSync(path, 'utf8'))).sort()).toEqual(['count', 'day'])
  })
  it('fails closed for malformed storage or invalid configured limits', () => {
    const path = statePath()
    writeFileSync(path, 'invalid')
    expect(() => createPublicBudget(path)).toThrow()
    expect(() => createPublicBudget(statePath(), NaN)).toThrow()
  })
})
