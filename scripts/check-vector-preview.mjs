import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } })
  await page.goto('http://127.0.0.1:19351/')
  await page.waitForFunction(() => {
    try { return JSON.parse(document.getElementById('context').textContent).layers.some(layer => layer.id === 'rivers') } catch { return false }
  }, undefined, { timeout: 30000 })
  const frame = page.frames().find(frame => frame.url() === 'http://127.0.0.1:19352/')
  const canvas = frame.locator('canvas').first()
  await page.waitForTimeout(1500)
  const box = await canvas.boundingBox()
  for (const dx of [0, 3, -3]) {
    await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2)
    await page.waitForTimeout(200)
    if (JSON.parse(await page.locator('#context').textContent()).selectedTileFeature) break
  }
  const context = JSON.parse(await page.locator('#context').textContent())
  if (context.selectedTileFeature?.layerId !== 'rivers') throw new Error('Interactive preview did not select a river')
  await page.screenshot({ path: 'artifacts/vector-tiles/interactive-preview.png' })
  await writeFile('artifacts/vector-tiles/interactive-preview-results.json', JSON.stringify({ success: true, url: page.url(), layer: context.layers[0], selectedRiver: context.selectedTileFeature.properties.name }, null, 2))
  console.log('Interactive preview loaded its river source and read clicked attributes')
} finally { await browser.close() }
