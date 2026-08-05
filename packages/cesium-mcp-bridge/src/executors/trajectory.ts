import type { BridgeExecutor } from '../bridge.js'
import type { PlayTrajectoryParams } from '../types.js'

export const trajectoryExecutors = {
  playTrajectory(params, bridge) {
    const result = bridge.playTrajectory(
      params as unknown as PlayTrajectoryParams,
    )
    return {
      success: true,
      data: { entityId: result.entityId },
      message: 'Trajectory playback started',
    }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
