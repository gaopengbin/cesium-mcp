import { WorldMemory } from '../../../packages/cesium-mcp-spatial/src/index.js'
import type {
  SpatialCoordinate,
  WorldMemoryResult,
  WorldObservation,
} from '../../../packages/cesium-mcp-spatial/src/index.js'

export class LabWorldInquiry {
  readonly memory: WorldMemory
  private sequence = 0
  private baseline?: string

  constructor(createdAt: string) {
    this.memory = new WorldMemory({ beliefId: 'lab-inquiry', worldId: 'embodied-lab', createdAt, regions: [] })
  }

  // Call on demand. No hidden scene enumeration and no work added to the 20 Hz loop.
  observe(at: string, actor: SpatialCoordinate, goal: SpatialCoordinate, hazard?: SpatialCoordinate): void {
    const revision = ++this.sequence
    const objects = [
      { id: 'actor', name: '角色', position: actor, source: 'live-pose', basis: '当前执行器位姿' },
      { id: 'goal', name: '观察点', position: goal, source: 'task-metadata', basis: '已授权的任务目标坐标' },
      ...(hazard ? [{ id: 'hazard', name: '落石区', position: hazard, source: 'fixture', basis: '测试障碍已触发发现；不是视觉识别' }] : []),
    ]
    const observation: WorldObservation = {
      schemaVersion: 1, observationId: `inquiry-${revision}`, worldId: 'embodied-lab',
      worldRevision: revision, startedAt: at, completedAt: at, changedDuringObservation: false,
      readiness: 'partial', sensors: [{ sensorId: 'query', kind: 'scene-query' }],
      limitations: ['仅包含当前角色、授权目标及已发现的测试障碍，不是完整场景扫描。'],
      evidence: objects.map(item => ({
        kind: 'object', evidenceId: item.id, sensorId: 'query', sampledAt: at,
        quality: 'derived', confidence: 1, basis: item.basis,
        validUntil: new Date(Date.parse(at) + 30_000).toISOString(),
        object: {
          objectId: item.id, name: item.name, type: item.id, sourceType: 'entity',
          geometry: { type: 'Point', coordinates: item.position }, properties: {},
          geometryQuality: 'derived', observedAt: at, revision,
          provenance: { source: item.source, method: 'on-demand-query' },
        },
      })),
    }
    this.memory.observe(observation)
  }

  accepts(command: string): boolean {
    return /^(查看场景|场景有什么|记录现场|比较变化|有什么变化|查找\s*.+|寻找\s*.+)[？?。！!]*$/.test(command)
  }

  answer(command: string, at: string): string {
    if (/^记录现场/.test(command)) {
      this.baseline = `checkpoint-${this.sequence}`
      this.memory.checkpoint(this.baseline, at)
      return '已记录本次可查询证据。之后输入“比较变化”，比较两次记录；未观测区域不作结论。'
    }
    if (/^(比较变化|有什么变化)/.test(command)) {
      if (!this.baseline) return '请先输入“记录现场”，建立明确的比较基线。'
      return formatResult(this.memory.execute({ kind: 'changes', checkpointId: this.baseline, at }))
    }
    const target = command.match(/^(?:查找|寻找)\s*(.+?)[？?。！!]*$/)?.[1]
    return formatResult(this.memory.execute(target
      ? { kind: 'find', query: { name: target }, at }
      : { kind: 'describe', at }))
  }
}

function formatResult(result: WorldMemoryResult): string {
  const lines = ['场景证据查询（本地结构化查询，未调用视觉模型）：']
  if (result.kind === 'changes') {
    lines.push(...result.changes.map(change => `${change.after.object.name ?? change.objectId}：${
      change.kind === 'newly-observed' ? '本次新记录到，不代表刚刚生成' : `观测属性变化（${change.fields.join('、')}）`
    }`))
    if (!result.changes.length) lines.push('两次记录中没有检测到对象属性变化；不能据此断言整个场景没有变化。')
  } else {
    lines.push(...result.objects.map(item => {
      const position = item.object.geometry?.type === 'Point' ? item.object.geometry.coordinates : undefined
      return `${item.object.name ?? item.objectId}：${position?.map(value => value.toFixed(5)).join(', ') ?? '位置未知'}${item.freshness === 'stale' ? '（证据已过期）' : ''}`
    }))
    if (!result.objects.length) lines.push('现有证据中没有匹配目标，不能确认它不存在。')
  }
  for (const citation of result.citations) {
    lines.push(`证据 ${citation.reference.observationId}/${citation.reference.evidenceId}：${citation.basis}，${citation.reference.sampledAt}`)
  }
  return lines.join('\n')
}
