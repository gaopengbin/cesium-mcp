import * as Cesium from 'cesium'

import type { BridgeExecutor } from '../bridge.js'

export const internalBridgeExecutors = {
  setIonToken(params) {
    Cesium.Ion.defaultAccessToken = params.token as string
    return { success: true, message: 'Cesium Ion access token updated' }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
