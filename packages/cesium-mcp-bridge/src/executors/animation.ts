import type { BridgeExecutor } from '../bridge.js'
import type {
  ControlAnimationParams,
  ControlClockParams,
  CreateAnimationParams,
  RemoveAnimationParams,
  SetGlobeLightingParams,
  TrackEntityParams,
  UpdateAnimationPathParams,
} from '../types.js'

export const animationExecutors = {
  createAnimation(params, bridge) {
    const entity = bridge.createAnimation(params as unknown as CreateAnimationParams)
    return {
      success: true,
      data: { entityId: entity.id },
      message: 'Animation created',
    }
  },
  controlAnimation(params, bridge) {
    const input = params as unknown as ControlAnimationParams
    bridge.controlAnimation(input.action)
    return { success: true, message: `Animation ${input.action}` }
  },
  removeAnimation(params, bridge) {
    const input = params as unknown as RemoveAnimationParams
    const removed = bridge.removeAnimation(input.entityId)
    return {
      success: removed,
      message: removed ? 'Animation removed' : undefined,
      error: removed
        ? undefined
        : `Animation entity not found: ${input.entityId}`,
    }
  },
  listAnimations(_params, bridge) {
    const animations = bridge.listAnimations()
    return {
      success: true,
      data: { animations },
      message: `${animations.length} animations found`,
    }
  },
  updateAnimationPath(params, bridge) {
    const updated = bridge.updateAnimationPath(
      params as unknown as UpdateAnimationPathParams,
    )
    return {
      success: updated,
      message: updated ? 'Animation path updated' : undefined,
      error: updated ? undefined : 'Entity or path not found',
    }
  },
  trackEntity(params, bridge) {
    const input = params as unknown as TrackEntityParams
    bridge.trackEntity(input)
    return {
      success: true,
      message: input.entityId
        ? `Tracking entity ${input.entityId}`
        : 'Tracking stopped',
    }
  },
  controlClock(params, bridge) {
    const input = params as unknown as ControlClockParams
    bridge.controlClock(input)
    return { success: true, message: `Clock ${input.action} applied` }
  },
  setGlobeLighting(params, bridge) {
    bridge.setGlobeLighting(params as unknown as SetGlobeLightingParams)
    return { success: true, message: 'Globe lighting updated' }
  },
} satisfies Readonly<Record<string, BridgeExecutor>>
