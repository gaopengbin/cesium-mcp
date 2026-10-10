// Leave headroom below the MCP message limit while allowing full map screenshots.
const maxAppExchangeBytes = 9 * 1024 * 1024

export async function readAppSessionBody(source: AsyncIterable<Buffer | string>): Promise<string> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of source) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > maxAppExchangeBytes) throw new Error('App exchange is too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}
