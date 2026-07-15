(function attachCesiumToolRouter(global) {
  const MAX_AUTO_TOOLS = 20

  const routes = [
    {
      name: 'tiles',
      pattern: /\b(3d\s*tiles?|tilesets?|terrain|wms|wmts|imagery|czml|kml|kmz|gaussian\s*splats?)\b|三维瓦片|瓦片集|地形|影像|高斯|倾斜摄影/i,
      toolsets: ['tiles', 'view', 'interaction', 'geolocation'],
    },
    {
      name: 'heatmap',
      pattern: /\bheat\s*maps?\b|热力图/i,
      toolsets: ['heatmap', 'layer', 'view'],
    },
    {
      name: 'trajectory',
      pattern: /\btrajector(y|ies)\b|轨迹|轨迹回放/i,
      toolsets: ['trajectory', 'view', 'entity', 'geolocation'],
    },
    {
      name: 'animation',
      pattern: /\b(animat(e|ed|ion|ions)|clock|timeline|track\s+entit(y|ies))\b|动画|时钟|跟踪实体|运动路径/i,
      toolsets: ['animation', 'entity', 'geolocation'],
    },
    {
      name: 'layer',
      pattern: /\b(geojson|data\s*layer|layers?|basemap|primitive|choropleth)\b|图层|底图|专题图|分级设色/i,
      toolsets: ['layer', 'view', 'geolocation'],
    },
    {
      name: 'entity-ext',
      pattern: /\b(billboards?|boxes?|corridors?|cylinders?|cones?|ellipses?|rectangles?|walls?)\b|广告牌|盒子|廊道|圆柱|圆锥|椭圆|矩形|墙体/i,
      toolsets: ['entity-ext', 'view', 'geolocation'],
    },
    {
      name: 'scene',
      pattern: /\b(post[ -]?process|bloom|fxaa|fog|atmosphere|shadows?|lighting|scene\s+options?)\b|后处理|泛光|雾效|大气|阴影|光照|场景效果/i,
      toolsets: ['scene', 'camera', 'view'],
    },
    {
      name: 'camera',
      pattern: /\b(orbit|look\s+at|camera\s+options?|camera\s+controls?)\b|环绕|相机参数|相机控制|观察目标/i,
      toolsets: ['camera', 'view', 'geolocation'],
    },
    {
      name: 'interaction',
      pattern: /\b(screenshots?|measure|distance|area|highlight)\b|截图|测量|距离|面积|高亮/i,
      toolsets: ['interaction', 'view', 'geolocation'],
    },
    {
      name: 'entity',
      pattern: /\b(markers?|labels?|models?|entities|entity|polygons?|polylines?|points?)\b|标记|标签|模型|实体|多边形|折线|点位/i,
      toolsets: ['entity', 'view', 'geolocation'],
    },
    {
      name: 'geolocation',
      pattern: /\b(geocode|where\s+is|address|place\s+name)\b|地理编码|地址|在哪里|什么位置/i,
      toolsets: ['geolocation', 'view', 'entity'],
    },
  ]

  function routeToolsets(prompt) {
    const route = routes.find(candidate => candidate.pattern.test(String(prompt || '')))
    return route ? [...route.toolsets] : []
  }

  function collectToolsets(toolsetNames, contracts, limit = Infinity) {
    const selected = new Map()
    const includedToolsets = []

    for (const toolsetName of toolsetNames) {
      const toolset = contracts.cesiumBrowserToolsets[toolsetName]
      if (!toolset) continue

      const additions = toolset.tools.filter(tool => !selected.has(tool.name))
      if (selected.size + additions.length > limit) continue

      additions.forEach(tool => selected.set(tool.name, tool))
      includedToolsets.push(toolsetName)
    }

    return {
      toolsetNames: includedToolsets,
      tools: [...selected.values()],
    }
  }

  function resolveToolSelection(prompt, mode, contracts) {
    if (mode === 'all') {
      return {
        mode,
        toolsetNames: Object.keys(contracts.cesiumBrowserToolsets),
        tools: [...contracts.cesiumBrowserToolContracts],
      }
    }

    if (mode?.startsWith('toolset:')) {
      const toolsetName = mode.slice('toolset:'.length)
      return {
        mode,
        ...collectToolsets([toolsetName], contracts),
      }
    }

    if (mode === 'core') {
      return {
        mode,
        toolsetNames: ['core'],
        tools: [...contracts.cesiumCoreToolContracts],
      }
    }

    const toolsetNames = routeToolsets(prompt)
    if (toolsetNames.length === 0) {
      return {
        mode: 'auto',
        toolsetNames: ['core'],
        tools: [...contracts.cesiumCoreToolContracts],
      }
    }

    return {
      mode: 'auto',
      ...collectToolsets(toolsetNames, contracts, MAX_AUTO_TOOLS),
    }
  }

  function rewriteAssetUrl(value, pageOrigin, proxyOrigins) {
    if (typeof value !== 'string' || value.length === 0) return value

    let assetUrl
    try {
      assetUrl = new URL(value, pageOrigin)
    } catch {
      return value
    }

    const sourceKey = proxyOrigins[assetUrl.origin]
    if (!sourceKey) return assetUrl.href

    const proxyUrl = new URL(`/api/assets/${sourceKey}${assetUrl.pathname}`, pageOrigin)
    proxyUrl.search = assetUrl.search
    return proxyUrl.href
  }

  global.CesiumToolRouter = Object.freeze({
    MAX_AUTO_TOOLS,
    resolveToolSelection,
    rewriteAssetUrl,
    routeToolsets,
  })
})(globalThis)
