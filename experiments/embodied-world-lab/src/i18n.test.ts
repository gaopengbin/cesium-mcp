import { describe, expect, it } from 'vitest'
import { resolveLocale, translate } from './i18n.js'
import english from './messages-en.json'

describe('bilingual navigation', () => {
  it('prefers shared-link language, then saved preference, then browser language', () => {
    expect(resolveLocale('en', 'zh-CN', 'zh-CN')).toBe('en')
    expect(resolveLocale(null, 'zh-CN', 'en-US')).toBe('zh-CN')
    expect(resolveLocale(null, null, 'en-GB')).toBe('en')
  })
  it('preserves coordinates, literal dollar signs and dynamic parameters', () => {
    expect(translate('当前任务链接：{0}', 'en', 'https://example.test/?from=1,2&x=$&')).toBe('Current mission link: https://example.test/?from=1,2&x=$&')
    expect(translate('目标距离 {0} m', 'zh-CN', 123)).toBe('目标距离 123 m')
  })
  it('keeps every translation placeholder and contains no untranslated Chinese in English', () => {
    for (const [source, target] of Object.entries(english)) {
      expect(target.match(/\{\d+\}/g)?.sort() ?? []).toEqual(source.match(/\{\d+\}/g)?.sort() ?? [])
      expect(target).not.toMatch(/[\u3400-\u9fff]/u)
    }
  })
})
