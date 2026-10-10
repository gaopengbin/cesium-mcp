export type Locale = 'zh-CN' | 'en'

export function resolvePresentation(host: { theme?: 'light' | 'dark'; locale?: string } | undefined, systemLocale: string, systemDark: boolean) {
  return {
    theme: host?.theme ?? (systemDark ? 'dark' : 'light'),
    locale: /^zh\b/i.test(host?.locale ?? systemLocale) ? 'zh-CN' as const : 'en' as const,
  }
}

// Application copy only. User names and map property values remain unchanged.
const english: Record<string, string> = {
  '地图': 'Map', '返回场景': 'Back to scenes', '继续查看地图': 'Return to map',
  '等待地图会话': 'Waiting for map', '地图已连接': 'Map connected',
  '正在连接地图': 'Connecting map', '正在恢复地图连接': 'Reconnecting map',
  '连接已断开': 'Disconnected', '地图连接已断开': 'Map disconnected',
  '地图渲染失败': 'Map rendering failed', '地图未能打开': 'Unable to open map',
  '需要 MCP Apps 宿主': 'MCP Apps host required', '交互式三维地图': 'Interactive 3D map',
  '地图操作': 'Map controls', '定位纽约': 'New York', '添加标记': 'Add marker',
  '全球视角': 'World view', '底图样式': 'Basemap style', '卫星': 'Satellite',
  '展开地图': 'Expand map', '收起地图': 'Restore map', '展开': 'Expand', '收起': 'Restore',
  '正在打开地图': 'Opening map', '拖动旋转 · 滚轮缩放 · 点击对象选择': 'Drag to rotate · Scroll to zoom · Click to select',
  '选中对象': 'Selected object', '在地图上选择一个对象': 'Select an object on the map',
  '添加标记或点击对象，把它交给聊天分析。': 'Add a marker or select an object to discuss it in Codex.',
  '询问此对象': 'Ask in Codex', '在 Codex 中分析': 'Analyze in Codex',
  '示例图例': 'Scene legend', '正在运行': 'Running scene', '正在准备场景…': 'Preparing scene…',
  '示例已加载': 'Scene loaded', '示例未完成': 'Scene incomplete', '移除示例': 'Remove scene',
  '内置演示数据，用于体验可视化与工具操作。': 'Synthetic demo data for visualization and map tools.',
  '让地图做更多': 'Explore with your map', '选择场景，直接运行': 'Choose a scene to get started',
  '旧金山 · SAN FRANCISCO': 'SAN FRANCISCO', '纽约 · NEW YORK': 'NEW YORK', '洛杉矶 · LOS ANGELES': 'LOS ANGELES',
  '城市活力图': 'Urban activity', '立体街区': '3D city blocks', '活动热点': 'Activity hotspots',
  '24 个六边形 · 分级与属性查询': '24 hexagons · Classes & properties',
  '18 栋规划建筑 · 批量创建与编辑': '18 buildings · Batch creation & editing',
  '72 个事件 · 加权热力与联络路线': '72 events · Heatmap & connections',
  '封面来自场景运行截图 · 底图：Esri 与影像贡献者。数值、建筑和路线为演示数据，可交给 Agent 读取与修改。': 'Covers are captured from these scenes. Imagery: Esri and contributors. Values, buildings and routes are synthetic demo data that Codex can read and edit.',
  '在 Codex 原生聊天中描述想做什么，地图会随对话更新。': 'Describe what you want in Codex chat. Your map updates as you talk.',
  '地图会话': 'Map session', '纽约': 'New York', '曼哈顿': 'Manhattan', '旧金山': 'San Francisco',
  '市区': 'Downtown', '洛杉矶': 'Los Angeles', '市中心': 'Downtown', '地图标记': 'Map marker',
  '旧金山 · 城市活力图': 'San Francisco · Urban activity', '曼哈顿 · 立体街区': 'Manhattan · 3D city blocks',
  '洛杉矶 · 活动热点': 'Los Angeles · Activity hotspots', '内置演示数据': 'Synthetic demo data',
  '24 个六边形单元覆盖旧金山市区，按演示活力值分为 3 档。点击单元读取数值，或让 Agent 调整分级。': '24 hexagons over downtown San Francisco, classified into three synthetic activity levels. Select a cell to inspect its value or ask Codex to change the classes.',
  '在纽约批量搭建 18 栋规划建筑，高度 75–320 米。错落的体量与倾斜视角呈现立体街区，点击建筑可读取高度。': '18 synthetic planning buildings in New York, ranging from 75 to 320 m. Select a building to inspect its height or edit it with Codex.',
  '72 个演示事件形成 4 处活动热点，叠加可查询事件、服务点与示意联络路线。选择事件可读取权重。': '72 synthetic events form four hotspots, with selectable events, service sites and illustrative connections. Select an event to inspect its weight.',
  '低于 30': 'Below 30', '60 及以上': '60 and above', '低于 150 米': 'Below 150 m',
  '150–219 米': '150–219 m', '220 米及以上': '220 m and above', '低密度': 'Low density', '高密度': 'High density', '联络路线': 'Connections',
  '准备卫星底图': 'Preparing satellite imagery', '加载 GeoJSON 并分级着色': 'Loading and classifying GeoJSON',
  '调整地图视角': 'Adjusting camera', '批量生成三维建筑': 'Creating 3D buildings', '切换倾斜视角': 'Tilting camera',
  '准备热力图工具': 'Preparing heatmap tools', '生成事件热力图': 'Generating heatmap', '加载可查询事件点': 'Loading selectable events',
  '叠加路线与服务点': 'Adding connections and sites', '呈现多图层视图': 'Framing map layers',
  '请读取这个演示图层的字段和要素，说明数值最高的区域、分级颜色的含义，以及如何改成另一组分级阈值。所有数值均为演示数据。': 'Read the fields and features of this demo layer. Explain the highest values, the class colors and how to change the classification thresholds. All values are synthetic demo data.',
  '请查询当前示例建筑，读取各自的拉伸高度并找出最高的一栋。然后说明如何通过工具调整颜色或显隐。它们是生成的演示建筑，并非真实建筑模型。': 'Query the demo buildings, read their extruded heights and find the tallest. Explain how to edit their colors or visibility with map tools. These are synthetic planning buildings, not real building models.',
  '请查看当前事件图层和热力图，解释事件分布及权重，并说明还需要哪些真实数据才能分析服务覆盖。当前事件与联络折线均为演示数据，折线不是导航规划结果。': 'Inspect the event layer and heatmap. Explain the distribution and weights, and what real data would be needed to analyze service coverage. Events and connections are synthetic; the lines are not navigation routes.',
  '地图已更新。': 'Map updated.', '地图操作未完成。': 'Map operation did not complete.',
  '地图会话已更换，请重新操作。': 'The map session changed. Please try again.',
  '对话未发送，请保留输入后重试。': 'Could not send to Codex. Please try again.',
  '地图连接超时。请重新打开地图。': 'Map connection timed out. Please reopen the map.',
  '地图连接已恢复。': 'Map connection restored.', '底图已加载。': 'Imagery loaded.',
  '底图配置已切换，正在加载瓦片。': 'Basemap changed. Loading tiles…',
  '底图瓦片加载失败。请检查宿主允许的来源、网络连接和服务授权。': 'Imagery failed to load. Check allowed host domains, network and provider access.',
  '底图瓦片加载失败。请检查网络连接和服务授权。': 'Imagery failed to load. Check network and provider access.',
  '地图可用，但宿主未接收上下文；可以使用地图会话 ID 继续操作。': 'Map is available, but the host did not accept context. Use the map session ID for tools.',
  '可以通过聊天定位、添加图层或修改对象。': 'Use Codex chat to explore, add layers or edit objects.',
  '没有找到这个地点，请换一个名称或输入“经度, 纬度”。': 'Place not found. Try another name or longitude, latitude.',
  '地点搜索暂时不可用，请输入“经度, 纬度”，或稍后再试。': 'Place lookup is unavailable. Try longitude, latitude or retry later.',
  '示例已加载。点击地图对象，或交给 Agent 继续分析。': 'Scene loaded. Select an object or ask Codex to analyze it.',
  '示例未完成，可重新运行或移除已创建的示例对象。': 'Scene incomplete. Run it again or remove the created objects.',
  '已移除本次示例，其他地图内容保留。': 'Demo removed. Other map content is preserved.',
  '已把示例与分析请求发送到聊天。': 'Scene and analysis request sent to Codex chat.',
  '已把选中对象发送到聊天。': 'Selected object sent to Codex chat.',
  'Cesium 需要支持 Worker 的独立来源沙盒。请由宿主提供稳定的 UI 来源，或使用仓库的本地预览。': 'Cesium requires a dedicated sandbox origin with Worker support. Use a supported host or the local preview.',
  '请在支持 MCP Apps 的聊天中调用 openCesiumMap，或打开仓库的本地预览。': 'Call openCesiumMap in an MCP Apps host or open the local preview.',
  '地图会话已更换，请重新运行示例。': 'Map session changed. Run the scene again.',
  '图层未返回 ID，示例未完成。': 'Layer did not return an ID. Scene incomplete.',
  '热力图未能生成，请重新运行示例。': 'Heatmap could not be generated. Run the scene again.',
  '未收到三维实体创建结果。': 'No 3D entity creation result was received.',
  '部分三维实体未能创建，示例未完成。': 'Some 3D entities could not be created. Scene incomplete.',
  '示例联络路线（非导航路线）': 'Illustrative connection (not a navigation route)',
  'polygon': 'Polygon', 'point': 'Point', 'polyline': 'Line', 'billboard': 'Marker',
  '多边形': 'Polygon', '点': 'Point', '折线': 'Line', '标记': 'Marker', '热力图': 'Heatmap',
}
const chineseTypes: Record<string, string> = { polygon: '多边形', point: '点', polyline: '线', billboard: '标记' }

export function translate(text: string, locale: Locale): string {
  if (locale === 'zh-CN') return chineseTypes[text] ?? text
  if (english[text]) return english[text]
  const progress = text.match(/^(.*) · (\d+\/\d+)$/)
  if (progress) return `${translate(progress[1], locale)} · ${progress[2]}`
  const patterns: [RegExp, string][] = [
    [/^高度 (.+) 米$/, 'Height $1 m'], [/^数值 (.+)$/, 'Value $1'], [/^权重 (.+)$/, 'Weight $1'],
    [/^规划建筑 (\d+)$/, 'Planning building $1'], [/^活力单元 (\d+)$/, 'Activity cell $1'],
    [/^演示事件 (\d+)$/, 'Demo event $1'], [/^示例服务点 (\d+)$/, 'Demo service site $1'],
    [/^默认底图加载失败：(.*)$/, 'Default imagery failed to load: $1'],
    [/^地图会话连接失败：(.*)$/, 'Map connection failed: $1'],
    [/^请分析选中的 (.*)，通过地图工具读取属性后回答。$/, 'Analyze the selected $1. Read its properties with map tools before answering.'],
  ]
  for (const [pattern, replacement] of patterns) if (pattern.test(text)) return text.replace(pattern, replacement)
  return text
}
