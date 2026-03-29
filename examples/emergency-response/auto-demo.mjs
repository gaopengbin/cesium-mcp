#!/usr/bin/env node
/**
 * 应急指挥自动化演示脚本
 *
 * 通过 HTTP POST 向 cesium-mcp-runtime 发送一系列地图命令，
 * 模拟 AI Agent 进行地震应急响应分析的完整流程。
 *
 * 用法：
 *   node examples/emergency-response/auto-demo.mjs [--port 9100] [--speed 1]
 *
 * 选项：
 *   --port   Runtime HTTP 端口（默认 9100）
 *   --speed  播放速度倍率，2 = 两倍速（默认 1）
 */

const args = process.argv.slice(2)
const portIdx = args.indexOf('--port')
const speedIdx = args.indexOf('--speed')
const PORT = portIdx !== -1 ? parseInt(args[portIdx + 1]) : 9100
const SPEED = speedIdx !== -1 ? parseFloat(args[speedIdx + 1]) : 1

const API = `http://localhost:${PORT}/api/command`

// ==================== 工具函数 ====================

async function send(action, params = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: { action, params } }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Command failed: ${action}`)
  return data
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms / SPEED))
}

function log(step, message) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  console.log(`[${time}] 步骤 ${step}: ${message}`)
}

/** 生成圆形多边形坐标（24 个点） */
function circleCoords(centerLon, centerLat, radiusKm, points = 24) {
  const coords = []
  const latR = radiusKm / 110.574
  const lonR = radiusKm / (111.32 * Math.cos(centerLat * Math.PI / 180))
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI
    coords.push([
      Math.round((centerLon + lonR * Math.cos(angle)) * 1000) / 1000,
      Math.round((centerLat + latR * Math.sin(angle)) * 1000) / 1000,
    ])
  }
  return coords
}

/** 生成随机余震点位（GeoJSON FeatureCollection） */
function generateAftershocks(centerLon, centerLat, count, radiusKm) {
  const features = []
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 2 * Math.PI
    const dist = Math.random() * radiusKm
    const latOff = dist / 110.574
    const lonOff = dist / (111.32 * Math.cos(centerLat * Math.PI / 180))
    const lon = centerLon + lonOff * Math.cos(angle)
    const lat = centerLat + latOff * Math.sin(angle)
    const mag = 3.0 + Math.random() * 4.0
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { magnitude: Math.round(mag * 10) / 10, weight: mag / 7.6 },
    })
  }
  return { type: 'FeatureCollection', features }
}

// ==================== 震中参数 ====================

const EPICENTER = { lon: 137.27, lat: 37.50 }

// ==================== 演示序列 ====================

async function run() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║   cesium-mcp 应急指挥演示                ║')
  console.log('║   场景：2024 能登半岛 M7.6 地震          ║')
  console.log('╚══════════════════════════════════════════╝')
  console.log()

  // ---- 第 1 幕：定位灾区 ----
  log(1, '飞到日本上空（高度 800km）...')
  await send('flyTo', {
    longitude: EPICENTER.lon,
    latitude: EPICENTER.lat,
    height: 800000,
    pitch: -30,
    duration: 3,
  })
  await wait(4000)

  log(2, '下降至 150km，俯瞰能登半岛...')
  await send('flyTo', {
    longitude: EPICENTER.lon,
    latitude: EPICENTER.lat,
    height: 150000,
    pitch: -45,
    duration: 2,
  })
  await wait(3000)

  // ---- 第 2 幕：标注震中与余震 ----
  log(3, '标注 M7.6 震中...')
  await send('addMarker', {
    longitude: EPICENTER.lon,
    latitude: EPICENTER.lat,
    label: 'M7.6 震中',
    color: 'RED',
    size: 48,
  })
  await wait(1000)

  log(4, '批量添加 4 个余震标记...')
  await send('batchAddEntities', {
    entities: [
      { type: 'marker', longitude: 137.12, latitude: 37.35, label: 'M5.6 余震', color: 'ORANGE', size: 36 },
      { type: 'marker', longitude: 137.40, latitude: 37.58, label: 'M5.2 余震', color: 'ORANGE', size: 36 },
      { type: 'marker', longitude: 136.95, latitude: 37.22, label: 'M4.8 余震', color: 'YELLOW', size: 28 },
      { type: 'marker', longitude: 137.55, latitude: 37.68, label: 'M4.5 余震', color: 'YELLOW', size: 28 },
    ],
  })
  await wait(1500)

  // ---- 第 3 幕：疏散圈 ----
  log(5, '绘制 50km 应急响应区（红色）...')
  await send('addPolygon', {
    coordinates: circleCoords(EPICENTER.lon, EPICENTER.lat, 50),
    color: 'rgba(255, 50, 50, 0.15)',
    outlineColor: 'RED',
    label: '50km 应急响应区',
  })
  await wait(1500)

  log(6, '绘制 100km 预警区（黄色）...')
  await send('addPolygon', {
    coordinates: circleCoords(EPICENTER.lon, EPICENTER.lat, 100),
    color: 'rgba(255, 200, 0, 0.10)',
    outlineColor: 'YELLOW',
    label: '100km 预警区',
  })
  await wait(2000)

  // ---- 第 4 幕：热力图 ----
  log(7, '生成地震强度热力图（60 个模拟余震点）...')
  const heatmapData = generateAftershocks(EPICENTER.lon, EPICENTER.lat, 60, 80)
  await send('addHeatmap', {
    name: '地震强度分布',
    data: heatmapData,
    radius: 40,
  })
  await wait(2000)

  // ---- 第 5 幕：救援路线 ----
  log(8, '规划空中救援路线（小松机场 → 震中）...')
  await send('addPolyline', {
    coordinates: [
      [136.41, 36.39, 3000],
      [136.60, 36.70, 5000],
      [136.85, 37.00, 5000],
      [137.10, 37.30, 3000],
      [EPICENTER.lon, EPICENTER.lat, 500],
    ],
    color: 'LIME',
    width: 4,
    label: '空中救援通道',
  })
  await wait(1500)

  log(9, '规划海上救援路线（富山港 → 受灾海岸）...')
  await send('addPolyline', {
    coordinates: [
      [137.22, 36.76],
      [137.35, 36.95],
      [137.40, 37.15],
      [137.30, 37.40],
    ],
    color: 'DODGERBLUE',
    width: 3,
    label: '海上救援航线',
  })
  await wait(2000)

  // ---- 第 6 幕：场景渲染 ----
  log(10, '开启阴影和光照效果...')
  await send('setGlobeLighting', {
    enableShadows: true,
    enableLighting: true,
  })
  await wait(1000)

  log(11, '添加泛光后处理...')
  await send('setPostProcess', {
    bloom: { enabled: true, brightness: 0.2, delta: 1.0 },
  })
  await wait(2000)

  // ---- 第 7 幕：全景展示 ----
  log(12, '调整视角，准备全景展示...')
  await send('flyTo', {
    longitude: EPICENTER.lon,
    latitude: EPICENTER.lat - 0.3,
    height: 120000,
    pitch: -35,
    heading: 30,
    duration: 2,
  })
  await wait(3000)

  log(13, '开始绕场旋转...')
  await send('startOrbit', {
    speed: 0.002,
    clockwise: true,
  })
  await wait(8000)

  log(14, '截图...')
  await send('screenshot', {})
  await wait(1000)

  log(15, '停止旋转，保存视角书签...')
  await send('stopOrbit', {})
  await send('saveViewpoint', { name: '能登地震应急' })
  await wait(1000)

  console.log()
  console.log('✅ 演示完成！共执行 15 个步骤，覆盖 12 种 MCP 工具。')
  console.log()
  console.log('涉及工具集：view, entity, heatmap, animation, scene, camera, interaction')
}

// ==================== 启动 ====================

run().catch(err => {
  console.error('❌ 演示中断:', err.message)
  console.error('请确保 cesium-mcp-runtime 已启动并监听端口', PORT)
  process.exit(1)
})
