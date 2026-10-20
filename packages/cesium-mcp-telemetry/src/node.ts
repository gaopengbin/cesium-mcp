import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createUsageTelemetry, telemetryDisabled } from './index.js'
import { isUsageId } from './schema.js'
import type { UsageTelemetryOptions } from './index.js'

export function createNodeTelemetry(options: Pick<UsageTelemetryOptions, 'product' | 'version' | 'enabled'>) {
  let identity: Promise<string | undefined> | undefined
  return createUsageTelemetry({
    ...options,
    platform: ['win32', 'darwin', 'linux'].includes(process.platform) ? process.platform as 'win32' | 'darwin' | 'linux' : 'other',
    endpoint: process.env.CESIUM_TELEMETRY_ENDPOINT,
    isDisabled: telemetryDisabled,
    notice: message => console.error(message),
    identity: () => identity ??= readInstallationId(),
  })
}

/** Called lazily; disabling collection avoids every filesystem operation here. */
export async function readInstallationId(directory?: string): Promise<string | undefined> {
  const base = directory ?? join(process.env.LOCALAPPDATA ?? process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'), 'cesium-mcp')
  const path = join(base, 'telemetry-id')
  const readId = async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = (await readFile(path, 'utf8')).trim()
      if (isUsageId(id)) return id
      // An exclusive creator may have opened the file but not finished its write.
      if (id || attempt === 4) return undefined
      await new Promise(done => setTimeout(done, 10))
    }
    return undefined
  }
  try {
    await mkdir(base, { recursive: true, mode: 0o700 })
    try {
      return await readId()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return undefined
    }
    const id = randomUUID()
    try { await writeFile(path, id, { flag: 'wx', mode: 0o600 }); return id }
    catch {
      return await readId()
    }
  } catch { return undefined }
}
