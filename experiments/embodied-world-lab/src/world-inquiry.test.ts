import { describe, expect, it } from 'vitest'
import { LabWorldInquiry } from './world-inquiry.js'

const T0 = '2026-09-05T00:00:00.000Z'
const T1 = '2026-09-05T00:00:01.000Z'
const T2 = '2026-09-05T00:00:02.000Z'

describe('lab inquiry', () => {
  it('only records passed observations, leaving undiscovered hazards unknown', () => {
    const inquiry = new LabWorldInquiry(T0)
    inquiry.observe(T1, [86, 28, 100], [87, 28])
    expect(inquiry.answer('查找落石区', T1)).toContain('不能确认它不存在')
    expect(inquiry.memory.snapshot().objects).toHaveLength(2)
  })

  it('compares a saved observation against actual later pose data', () => {
    const inquiry = new LabWorldInquiry(T0)
    inquiry.observe(T1, [86, 28, 100], [87, 28])
    inquiry.answer('记录现场', T1)
    inquiry.observe(T2, [86.001, 28, 100], [87, 28], [86.5, 28])
    const answer = inquiry.answer('比较变化', T2)
    expect(answer).toContain('角色：观测属性变化')
    expect(answer).toContain('落石区：本次新记录到')
    expect(answer).toContain('不是视觉识别')
    expect(answer).toContain('inquiry-1/actor')
    expect(answer).toContain('inquiry-2/actor')
  })

  it('routes supported inquiries without treating arbitrary text as navigation', () => {
    const inquiry = new LabWorldInquiry(T0)
    expect(inquiry.accepts('查看场景')).toBe(true)
    expect(inquiry.accepts('查找 观察点？')).toBe(true)
    expect(inquiry.accepts('随便说点什么')).toBe(false)
    expect(inquiry.answer('比较变化', T0)).toContain('先输入')
  })
})
