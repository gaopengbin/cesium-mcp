import { describe, expect, it } from 'vitest'
import { readAppSessionBody } from './app-session-body.js'

async function* chunks(value: Buffer) {
  for (let offset = 0; offset < value.length; offset += 8191) yield value.subarray(offset, offset + 8191)
}

describe('local app relay body', () => {
  it('accepts a screenshot result larger than 1 MiB without corrupting UTF-8', async () => {
    const body = JSON.stringify({ result: { dataUrl: 'data:image/png;base64,' + 'a'.repeat(1_500_000), name: '纽约地图' } })
    expect(await readAppSessionBody(chunks(Buffer.from(body)))).toBe(body)
  })

  it('keeps the relay bounded and counts bytes instead of characters', async () => {
    await expect(readAppSessionBody(chunks(Buffer.from('图'.repeat(3_200_000))))).rejects.toThrow('App exchange is too large')
  })
})
