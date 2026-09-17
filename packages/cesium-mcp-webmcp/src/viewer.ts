import { CesiumBridge } from 'cesium-mcp-bridge'
import type { CesiumBridgeOptions } from 'cesium-mcp-bridge'
import type { Viewer } from 'cesium'
import { registerCesiumWebMcp } from './index.js'
import type {
  RegisterCesiumWebMcpOptions,
  WebMcpRegistration,
} from './index.js'

export { CesiumBridge } from 'cesium-mcp-bridge'
export type { CesiumBridgeOptions } from 'cesium-mcp-bridge'
export { isWebMcpSupported } from './index.js'

export interface RegisterCesiumViewerWebMcpOptions extends RegisterCesiumWebMcpOptions {
  bridgeOptions?: CesiumBridgeOptions
}

export interface CesiumViewerWebMcpRegistration extends WebMcpRegistration {
  bridge: CesiumBridge
  /** Unregister tools and cancel Bridge-owned work immediately. */
  dispose(): void
}

/**
 * One-package convenience API for existing CesiumJS applications.
 * Creates the Bridge, registers WebMCP tools, and owns both lifecycles.
 */
export async function registerCesiumViewerWebMcp(
  viewer: Viewer,
  options: RegisterCesiumViewerWebMcpOptions = {},
): Promise<CesiumViewerWebMcpRegistration> {
  const { bridgeOptions, ...registrationOptions } = options
  const bridge = new CesiumBridge(viewer, bridgeOptions)
  let active = 0
  let closing = false
  const releaseIfIdle = () => {
    if (closing && active === 0) bridge.dispose()
  }
  const close = () => {
    closing = true
    releaseIfIdle()
  }

  try {
    const registration = await registerCesiumWebMcp({
      async execute(command, context) {
        if (closing) throw new Error('WebMCP registration has been closed')
        active++
        try {
          return await bridge.execute(command, context)
        } finally {
          active--
          releaseIfIdle()
        }
      },
    }, registrationOptions)
    if (registration.signal.aborted) close()
    else registration.signal.addEventListener('abort', close, { once: true })
    const unregister = () => {
      registration.unregister()
    }
    const dispose = () => {
      unregister()
      bridge.dispose()
    }
    return { ...registration, bridge, unregister, dispose }
  } catch (error) {
    closing = true
    bridge.dispose()
    throw error
  }
}
