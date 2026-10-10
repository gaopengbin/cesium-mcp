export type DemoId = 'choropleth' | 'buildings' | 'heatmap'

interface DemoStep {
  name: string
  label: string
  args: Record<string, unknown>
  resource?: 'layer' | 'entities'
  optional?: boolean
}

export interface DemoPlan {
  id: DemoId
  title: string
  summary: string
  prompt: string
  legend: { color: string; label: string }[]
  steps: DemoStep[]
}

export interface DemoResources {
  layers: string[]
  entities: string[]
}

type Invoke = (name: string, args: Record<string, unknown>, optional?: boolean) => Promise<Record<string, unknown>>
const source = '内置演示数据'
const collection = (features: Record<string, unknown>[]) => ({ type: 'FeatureCollection', features })
const feature = (id: string, geometry: Record<string, unknown>, properties: Record<string, unknown>) => ({
  type: 'Feature', id, geometry, properties: { ...properties, source },
})
const coordinate = (origin: number[], east: number, north: number) => [
  origin[0] + east / (111_320 * Math.cos(origin[1] * Math.PI / 180)),
  origin[1] + north / 111_320,
]
const hexagon = (origin: number[], east: number, north: number, radius: number) => Array.from({ length: 7 }, (_, index) => {
  const angle = index % 6 * Math.PI / 3
  return coordinate(origin, east + Math.cos(angle) * radius, north + Math.sin(angle) * radius)
})
const footprint = (origin: number[], east: number, north: number, width: number, depth: number) => [
  [-width / 2, -depth / 2], [width / 2, -depth / 2],
  [width / 2, depth / 2], [-width / 2, depth / 2], [-width / 2, -depth / 2],
].map(([x, y]) => {
  const angle = 29 * Math.PI / 180
  return coordinate(origin, east + x * Math.cos(angle) - y * Math.sin(angle), north + x * Math.sin(angle) + y * Math.cos(angle))
})

export function createDemoPlan(id: DemoId, prefix: string, duration: number): DemoPlan {
  const basemap: DemoStep = { name: 'setBasemap', label: '准备卫星底图', args: { basemap: 'satellite' } }
  if (id === 'choropleth') {
    const values = [12, 48, 76, 28, 64, 91, 17, 53, 83, 35, 68, 22]
    const data = collection(Array.from({ length: 24 }, (_, index) => {
      const column = index % 6
      const row = Math.floor(index / 6)
      return feature(`${prefix}-grid-${index}`, {
        type: 'Polygon', coordinates: [hexagon([-122.414, 37.776], (column - 2.5) * 133, (row - 1.5) * 156 + column % 2 * 78, 82)],
      }, { name: `活力单元 ${index + 1}`, value: values[index % values.length] })
    }))
    return {
      id, title: '旧金山 · 城市活力图', summary: '24 个六边形单元覆盖旧金山市区，按演示活力值分为 3 档。点击单元读取数值，或让 Agent 调整分级。',
      prompt: '请读取这个演示图层的字段和要素，说明数值最高的区域、分级颜色的含义，以及如何改成另一组分级阈值。所有数值均为演示数据。',
      legend: [{ color: '#80d8c1', label: '低于 30' }, { color: '#f3cd78', label: '30–59' }, { color: '#e98276', label: '60 及以上' }],
      steps: [basemap, {
        name: 'addGeoJsonLayer', label: '加载 GeoJSON 并分级着色', resource: 'layer',
        args: { id: `${prefix}-choropleth`, name: '旧金山活力单元 · 演示数据', data, flyTo: false, style: { opacity: .82, strokeWidth: 1.5, choropleth: { field: 'value', breaks: [0, 29, 59, 100], colors: ['#80d8c1', '#f3cd78', '#e98276'] } } },
      }, { name: 'flyTo', label: '调整地图视角', args: { longitude: -122.414, latitude: 37.77635, height: 1700, pitch: -90, heading: 12, duration } }],
    }
  }
  if (id === 'buildings') {
    const heights = [75, 130, 210, 95, 165, 285, 110, 235, 155, 320, 190, 80, 145, 260, 120, 180, 90, 225]
    const colors = ['#8edbd1', '#afbbef', '#efc486']
    return {
      id, title: '曼哈顿 · 立体街区', summary: '在纽约批量搭建 18 栋规划建筑，高度 75–320 米。错落的体量与倾斜视角呈现立体街区，点击建筑可读取高度。',
      prompt: '请查询当前示例建筑，读取各自的拉伸高度并找出最高的一栋。然后说明如何通过工具调整颜色或显隐。它们是生成的演示建筑，并非真实建筑模型。',
      legend: [{ color: '#8edbd1', label: '低于 150 米' }, { color: '#afbbef', label: '150–219 米' }, { color: '#efc486', label: '220 米及以上' }],
      steps: [basemap, {
        name: 'batchAddEntities', label: '批量生成三维建筑', resource: 'entities',
        args: { entities: heights.map((height, index) => ({
          type: 'polygon', coordinates: footprint([-74.009, 40.7148], (index % 6 - 2.5) * 108 + Math.floor(index / 6) % 2 * 25, (Math.floor(index / 6) - 1) * 130, 50 + index % 3 * 8, 48 + index % 2 * 14),
          color: colors[height < 150 ? 0 : height < 220 ? 1 : 2], opacity: .97, outlineColor: '#dff4f0', extrudedHeight: height, clampToGround: false,
        })) },
      }, { name: 'flyTo', label: '切换倾斜视角', args: { longitude: -74.009, latitude: 40.7148, height: 1200, pitch: -40, heading: 325, duration } }],
    }
  }
  const centers = [[-118.2465, 34.052], [-118.237, 34.048], [-118.254, 34.0395], [-118.266, 34.0447]]
  const points = collection(Array.from({ length: 72 }, (_, index) => {
    const center = centers[index % centers.length]
    const radius = .0008 + index % 7 * .00032
    return feature(`${prefix}-event-${index}`, {
      type: 'Point', coordinates: [center[0] + Math.cos(index * 2.4) * radius, center[1] + Math.sin(index * 2.4) * radius * .75],
    }, { name: `演示事件 ${index + 1}`, weight: 2 + index % 10 })
  }))
  const route = collection([
    feature(`${prefix}-route`, { type: 'LineString', coordinates: [centers[3], [-118.259, 34.048], centers[0], centers[1], [-118.241, 34.041], centers[2]] }, { name: '示例联络路线（非导航路线）' }),
    ...centers.map((coordinates, index) => feature(`${prefix}-site-${index}`, { type: 'Point', coordinates }, { name: `示例服务点 ${index + 1}` })),
  ])
  return {
    id, title: '洛杉矶 · 活动热点', summary: '72 个演示事件形成 4 处活动热点，叠加可查询事件、服务点与示意联络路线。选择事件可读取权重。',
    prompt: '请查看当前事件图层和热力图，解释事件分布及权重，并说明还需要哪些真实数据才能分析服务覆盖。当前事件与联络折线均为演示数据，折线不是导航规划结果。',
    legend: [{ color: '#68c6ed', label: '低密度' }, { color: '#e98276', label: '高密度' }, { color: '#a6e8eb', label: '联络路线' }],
    steps: [
      { name: 'enable_toolset', label: '准备热力图工具', args: { toolset: 'heatmap' }, optional: true }, basemap,
      { name: 'addHeatmap', label: '生成事件热力图', resource: 'layer', args: { id: `${prefix}-heatmap`, name: '洛杉矶活动热力图 · 演示数据', data: points, radius: 48, blur: .88, maxOpacity: .92, resolution: 768, gradient: { .25: '#68c6ed', .55: '#80d8c1', .8: '#f3cd78', 1: '#e98276' } } },
      { name: 'addGeoJsonLayer', label: '加载可查询事件点', resource: 'layer', args: { id: `${prefix}-events`, name: '事件权重 · 演示数据', data: points, flyTo: false, style: { color: '#f7cb80', opacity: .95, pointSize: 3 } } },
      { name: 'addGeoJsonLayer', label: '叠加路线与服务点', resource: 'layer', args: { id: `${prefix}-route`, name: '服务点与联络路线 · 示意', data: route, flyTo: false, style: { color: '#a6e8eb', opacity: 1, strokeWidth: 4, pointSize: 7 } } },
      { name: 'flyTo', label: '呈现多图层视图', args: { longitude: -118.2515, latitude: 34.0455, height: 4200, pitch: -90, heading: 8, duration } },
    ],
  }
}

export async function executeDemoPlan(plan: DemoPlan, invoke: Invoke, owned: DemoResources, onStep: (label: string, index: number, total: number) => void, isCurrent: () => boolean) {
  for (const [index, step] of plan.steps.entries()) {
    if (!isCurrent()) throw new Error('地图会话已更换，请重新运行示例。')
    onStep(step.label, index + 1, plan.steps.length)
    const result = await invoke(step.name, step.args, step.optional)
    if (step.resource === 'layer') {
      const id = result.id ?? step.args.id
      if (typeof id !== 'string') throw new Error('图层未返回 ID，示例未完成。')
      owned.layers.push(id)
      if (step.name === 'addHeatmap' && result.type !== '热力图') throw new Error('热力图未能生成，请重新运行示例。')
    }
    if (step.resource === 'entities') {
      const ids = result.entityIds
      if (!Array.isArray(ids)) throw new Error('未收到三维实体创建结果。')
      owned.entities.push(...ids.filter((id): id is string => typeof id === 'string'))
      if (Array.isArray(result.errors) && result.errors.length) throw new Error(result.errors.join('\n'))
      const requested = step.args.entities as unknown[]
      if (ids.length !== requested.length) throw new Error('部分三维实体未能创建，示例未完成。')
    }
    if (!isCurrent()) throw new Error('地图会话已更换，请重新运行示例。')
  }
}

export async function removeDemoResources(owned: DemoResources, invoke: Invoke) {
  while (owned.layers.length) {
    await invoke('removeLayer', { id: owned.layers[0] })
    owned.layers.shift()
  }
  while (owned.entities.length) {
    await invoke('removeEntity', { entityId: owned.entities[0] })
    owned.entities.shift()
  }
}
