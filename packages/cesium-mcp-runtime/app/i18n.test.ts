import { describe, expect, it } from 'vitest'
import { resolvePresentation, translate } from './i18n.js'

describe('host presentation', () => {
  it('uses host theme and locale before system preferences', () => {
    expect(resolvePresentation({ theme: 'light', locale: 'en-US' }, 'zh-CN', true)).toEqual({ theme: 'light', locale: 'en' })
    expect(resolvePresentation({ theme: 'dark', locale: 'zh-TW' }, 'en', false)).toEqual({ theme: 'dark', locale: 'zh-CN' })
    expect(resolvePresentation({}, 'en-GB', true)).toEqual({ theme: 'dark', locale: 'en' })
  })

  it('localizes dynamic map details while preserving user supplied names', () => {
    expect(translate('高度 285 米', 'en')).toBe('Height 285 m')
    expect(translate('规划建筑 6', 'en')).toBe('Planning building 6')
    expect(translate('旧金山 · 城市活力图', 'en')).toBe('San Francisco · Urban activity')
    expect(translate('加载 GeoJSON 并分级着色 · 2/3', 'en')).toBe('Loading and classifying GeoJSON · 2/3')
    expect(translate('用户自定义建筑', 'en')).toBe('用户自定义建筑')
    expect(translate('地图已连接', 'zh-CN')).toBe('地图已连接')
  })
})
