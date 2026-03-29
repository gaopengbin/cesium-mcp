#!/usr/bin/env node
/**
 * 应急指挥演示录屏脚本
 *
 * 使用 Puppeteer+CDP screencast 录制完整演示流程，
 * 通过 ffmpeg 合成 MP4 视频。
 *
 * 前置条件：
 *   npm install -D puppeteer-core   (已安装)
 *   ffmpeg 在 PATH 中
 *   cesium-mcp-runtime 运行在端口 9100
 *   HTTP 静态服务 在端口 3001  (python -m http.server 3001)
 *
 * 用法：
 *   node examples/emergency-response/record-demo.mjs [--width 1920] [--height 1080]
 */

import puppeteer from 'puppeteer-core'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ==================== 参数解析 ====================
const args = process.argv.slice(2)
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 ? args[idx + 1] : defaultVal
}

const WIDTH = parseInt(getArg('width', '1920'))
const HEIGHT = parseInt(getArg('height', '1080'))
const RUNTIME_PORT = parseInt(getArg('port', '9100'))
const HTTP_PORT = parseInt(getArg('http-port', '3001'))
const FPS = parseInt(getArg('fps', '30'))
const OUTPUT = getArg('output', path.join(__dirname, '..', 'video', 'demo-emergency.mp4'))

const DEMO_URL = `http://localhost:${HTTP_PORT}/packages/cesium-mcp-runtime/demo/index.html?v=${Date.now()}`
const API = `http://localhost:${RUNTIME_PORT}/api/command`
const FRAMES_DIR = path.join(__dirname, '.frames')

// ==================== Chrome 路径 ====================
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

function findChrome() {
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p
  }
  throw new Error('未找到 Chrome，请用 --chrome 指定路径')
}

// ==================== 工具函数 ====================
async function send(action, params = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: { action, params } }),
  })
  const data = await res.json()
  if (!data.ok) console.warn(`⚠ 命令 ${action} 未成功:`, data)
  return data
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function log(step, message) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  console.log(`[${time}] 步骤 ${step}: ${message}`)
}

function circleCoords(centerLon, centerLat, radiusKm, points = 24) {
  const coords = []
  const latR = radiusKm / 110.574
  const lonR = radiusKm / (111.32 * Math.cos((centerLat * Math.PI) / 180))
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI
    coords.push([
      Math.round((centerLon + lonR * Math.cos(angle)) * 1000) / 1000,
      Math.round((centerLat + latR * Math.sin(angle)) * 1000) / 1000,
    ])
  }
  return coords
}

function generateAftershocks(centerLon, centerLat, count, radiusKm) {
  const features = []
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 2 * Math.PI
    const dist = Math.random() * radiusKm
    const latOff = dist / 110.574
    const lonOff = dist / (111.32 * Math.cos((centerLat * Math.PI) / 180))
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [centerLon + lonOff * Math.cos(angle), centerLat + latOff * Math.sin(angle)] },
      properties: { magnitude: Math.round((3.0 + Math.random() * 4.0) * 10) / 10, weight: (3.0 + Math.random() * 4.0) / 7.6 },
    })
  }
  return { type: 'FeatureCollection', features }
}

// ==================== CDP Screencast 录屏 ====================
class ScreenRecorder {
  constructor(cdpSession, framesDir, fps) {
    this.cdp = cdpSession
    this.framesDir = framesDir
    this.fps = fps
    this.frames = [] // 内存暂存所有帧
    this.recording = false
  }

  async start() {
    await mkdir(this.framesDir, { recursive: true })
    this.recording = true

    this.cdp.on('Page.screencastFrame', async (event) => {
      if (!this.recording) return
      // 先 ack 再存数据（避免阻塞 CDP 管道）
      await this.cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId })
      this.frames.push(event.data) // base64 字符串
    })

    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 90,
      maxWidth: WIDTH,
      maxHeight: HEIGHT,
      everyNthFrame: 1,
    })
    console.log(`🎬 开始录制 (${WIDTH}x${HEIGHT})...`)
  }

  async stop() {
    this.recording = false
    await this.cdp.send('Page.stopScreencast')
    console.log(`🛑 停止录制，内存中 ${this.frames.length} 帧，写入磁盘...`)

    // 批量写入所有帧
    for (let i = 0; i < this.frames.length; i++) {
      const buf = Buffer.from(this.frames[i], 'base64')
      const filename = path.join(this.framesDir, `frame_${String(i).padStart(6, '0')}.jpg`)
      await writeFile(filename, buf)
    }
    console.log(`📁 ${this.frames.length} 帧已写入 ${this.framesDir}`)
    return this.frames.length
  }
}

// ==================== 合成视频 ====================
function stitchVideo(framesDir, outputPath, fps) {
  const dir = path.dirname(outputPath)
  if (!existsSync(dir)) execSync(`mkdir "${dir}"`)

  const cmd = [
    'ffmpeg', '-y',
    '-framerate', String(fps),
    '-i', `"${path.join(framesDir, 'frame_%06d.jpg')}"`,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-vf', `fps=${fps}`,
    `"${outputPath}"`,
  ].join(' ')

  console.log('🎞  合成视频...')
  execSync(cmd, { stdio: 'inherit' })
  console.log(`✅ 视频已保存: ${outputPath}`)
}

// ==================== 震中参数 ====================
const EPICENTER = { lon: 137.27, lat: 37.50 }

// ==================== 主流程 ====================
async function main() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║   cesium-mcp 应急指挥演示 — 录制模式         ║')
  console.log('╚══════════════════════════════════════════════╝\n')

  const chromePath = getArg('chrome', null) || findChrome()
  console.log(`浏览器: ${chromePath}`)
  console.log(`分辨率: ${WIDTH}x${HEIGHT}\n`)

  // 1. 启动浏览器
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    defaultViewport: { width: WIDTH, height: HEIGHT },
    args: [
      `--window-size=${WIDTH},${HEIGHT}`,
      '--disable-extensions',
      '--disable-infobars',
      '--no-first-run',
    ],
  })

  const page = await browser.newPage()
  const cdp = await page.createCDPSession()

  // 2. 导航到 demo 页面
  console.log(`导航到 ${DEMO_URL}`)
  await page.goto(DEMO_URL, { waitUntil: 'networkidle2', timeout: 30000 })
  await wait(3000) // 等 Cesium 初始化

  // 3. 连接 WebSocket
  console.log('连接 WebSocket...')
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('连接'))
    if (btn) btn.click()
  })
  await wait(2000)

  // 4. 隐藏侧边栏，让地图全屏
  await page.evaluate(() => {
    const panel = document.querySelector('.panel')
    if (panel) panel.style.display = 'none'
    // 也隐藏坐标栏和拖放提示
    const overlay = document.querySelector('.map-overlay')
    if (overlay) overlay.style.display = 'none'
  })
  await wait(500)

  // 5. 注入标题叠加层
  await page.evaluate(() => {
    const overlay = document.createElement('div')
    overlay.id = 'demo-title-overlay'
    overlay.style.cssText = `
      position: fixed; top: 24px; left: 24px; z-index: 99999;
      background: rgba(0, 0, 0, 0.70); color: #fff;
      padding: 10px 20px; border-radius: 8px;
      font: 600 22px/1.4 'Segoe UI', system-ui, sans-serif;
      letter-spacing: 0.5px; pointer-events: none;
      border-left: 4px solid #3b82f6;
      backdrop-filter: blur(6px);
      transition: opacity 0.3s ease;
      opacity: 0;
    `
    document.body.appendChild(overlay)
  })

  /** 更新标题叠加层文字 */
  async function showTitle(text) {
    await page.evaluate((t) => {
      const el = document.getElementById('demo-title-overlay')
      if (!el) return
      el.textContent = t
      el.style.opacity = t ? '1' : '0'
    }, text)
  }

  // 5. 开始录屏
  const recorder = new ScreenRecorder(cdp, FRAMES_DIR, FPS)
  await recorder.start()
  await wait(500)

  // 6. 执行演示序列（紧凑节奏, flyTo ≤ 2s）
  await showTitle('第 1 幕 — 定位灾区')
  log(1, '飞到日本上空（高度 800km）...')
  await send('flyTo', { longitude: EPICENTER.lon, latitude: EPICENTER.lat, height: 800000, pitch: -30, duration: 1.5 })
  await wait(2500)

  log(2, '下降至 150km，俯瞰能登半岛...')
  await send('flyTo', { longitude: EPICENTER.lon, latitude: EPICENTER.lat, height: 150000, pitch: -45, duration: 1.5 })
  await wait(2500)

  await showTitle('第 2 幕 — 标注震中与余震')
  log(3, '标注 M7.6 震中...')
  await send('addMarker', { longitude: EPICENTER.lon, latitude: EPICENTER.lat, label: 'M7.6 震中', color: 'RED', size: 48 })
  await wait(1500)

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

  await showTitle('第 3 幕 — 绘制疏散圈')
  log(5, '绘制 50km 应急响应区（红色）...')
  await send('addPolygon', {
    coordinates: circleCoords(EPICENTER.lon, EPICENTER.lat, 50),
    color: 'rgba(255, 50, 50, 0.15)', outlineColor: 'RED', label: '50km 应急响应区',
  })
  await wait(1500)

  log(6, '绘制 100km 预警区（黄色）...')
  await send('addPolygon', {
    coordinates: circleCoords(EPICENTER.lon, EPICENTER.lat, 100),
    color: 'rgba(255, 200, 0, 0.10)', outlineColor: 'YELLOW', label: '100km 预警区',
  })
  await wait(1500)

  await showTitle('第 4 幕 — 地震强度热力图')
  log(7, '生成地震强度热力图（60 个模拟余震点）...')
  await send('addHeatmap', { name: '地震强度分布', data: generateAftershocks(EPICENTER.lon, EPICENTER.lat, 60, 80), radius: 40 })
  await wait(2000)

  await showTitle('第 5 幕 — 规划救援路线')
  log(8, '规划空中救援路线（小松机场 → 震中）...')
  await send('addPolyline', {
    coordinates: [[136.41, 36.39, 3000], [136.60, 36.70, 5000], [136.85, 37.00, 5000], [137.10, 37.30, 3000], [EPICENTER.lon, EPICENTER.lat, 500]],
    color: 'LIME', width: 4, label: '空中救援通道',
  })
  await wait(1500)

  log(9, '规划海上救援路线（富山港 → 受灾海岸）...')
  await send('addPolyline', {
    coordinates: [[137.22, 36.76], [137.35, 36.95], [137.40, 37.15], [137.30, 37.40]],
    color: 'DODGERBLUE', width: 3, label: '海上救援航线',
  })
  await wait(1500)

  await showTitle('第 6 幕 — 场景渲染')
  log(10, '开启阴影和光照效果...')
  await send('setGlobeLighting', { enableShadows: true, enableLighting: true })
  await wait(1000)

  log(11, '添加泛光后处理...')
  await send('setPostProcess', { bloom: { enabled: true, brightness: 0.2, delta: 1.0 } })
  await wait(1500)

  await showTitle('第 7 幕 — 全景展示')
  log(12, '调整视角，准备全景展示...')
  await send('flyTo', { longitude: EPICENTER.lon, latitude: EPICENTER.lat - 0.3, height: 120000, pitch: -35, heading: 30, duration: 1.5 })
  await wait(2500)

  log(13, '保存视角书签...')
  await send('saveViewpoint', { name: '能登地震应急' })
  await wait(500)

  await showTitle('Cesium MCP — AI 驱动的地理空间应急指挥')
  await wait(3000)

  // 6. 停止录屏
  const totalFrames = await recorder.stop()

  // 7. 合成视频
  if (totalFrames > 0) {
    // 由于 screencast 帧率不固定，根据实际帧数和实际时长算出真实帧率
    stitchVideo(FRAMES_DIR, OUTPUT, FPS)
  } else {
    console.error('⚠ 未捕获到任何帧')
  }

  // 8. 清理
  await browser.close()
  await rm(FRAMES_DIR, { recursive: true, force: true })
  console.log('🧹 临时帧目录已清理')

  console.log('\n🎬 录制完成！')
}

main().catch(err => {
  console.error('❌ 录制失败:', err.message)
  process.exit(1)
})
