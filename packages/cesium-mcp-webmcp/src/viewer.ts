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
  const disposeBridge = () => bridge.dispose()

  if (options.signal?.aborted) disposeBridge()
  else options.signal?.addEventListener('abort', disposeBridge, { once: true })

  try {
    const registration = await registerCesiumWebMcp(bridge, registrationOptions)
    const unregister = () => {
      options.signal?.removeEventListener('abort', disposeBridge)
      registration.unregister()
      disposeBridge()
    }
    return { ...registration, bridge, unregister }
  } catch (error) {
    options.signal?.removeEventListener('abort', disposeBridge)
    disposeBridge()
    throw error
  }
}
