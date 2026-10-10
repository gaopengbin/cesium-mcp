import { describe, expect, it } from 'vitest'
import { cesiumMapDataOrigins } from './mcp-app-policy.js'

describe('custom map data origins', () => {
  it('allows explicit HTTPS and local fixture origins without duplicates', () => {
    expect(cesiumMapDataOrigins('https://tiles.example.com,http://127.0.0.1:4000,https://tiles.example.com/')).toEqual(['https://tiles.example.com', 'http://127.0.0.1:4000'])
  })
  it('rejects credentials, wildcards, insecure remote URLs and URL paths', () => {
    for (const origin of ['https://user:secret@tiles.example.com', 'http://tiles.example.com', 'https://tiles.example.com/tiles', 'https://*.example.com', '*']) {
      expect(() => cesiumMapDataOrigins(origin)).toThrow()
    }
  })
})
