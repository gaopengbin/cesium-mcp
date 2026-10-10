import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'
import { applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps'
import type { McpUiStyles } from '@modelcontextprotocol/ext-apps'

const client = new Client({ name: 'Cesium local preview', version: '1.0.0' }, {
  capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } },
})
const iframe = document.getElementById('map') as HTMLIFrameElement
const element = (id: string) => document.getElementById(id)!
const button = (id: string) => element(id) as HTMLButtonElement
let host: AppBridge | undefined
let sessionId = ''
const messages: unknown[] = []
let layout = 'home'
let homeHeight = 1080
let theme: 'light' | 'dark' = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
let locale = 'zh-CN'

function presentation() {
  const dark = theme === 'dark'
  return {
    theme, locale,
    // SDK types describe a complete dictionary; omitted preview values use CSS fallbacks.
    styles: { variables: {
      '--color-background-primary': dark ? '#181818' : '#ffffff',
      '--color-background-secondary': dark ? '#212121' : '#f7f7f7',
      '--color-background-tertiary': dark ? '#303030' : '#eeeeee',
      '--color-text-primary': dark ? '#f3f3f3' : '#171717',
      '--color-text-secondary': dark ? '#adadad' : '#646464',
      '--color-border-primary': dark ? '#363636' : '#dedede',
      '--font-sans': '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif',
      '--border-radius-md': '8px', '--border-radius-lg': '12px',
    } as McpUiStyles },
  }
}

function updatePresentation() {
  const context = presentation()
  applyDocumentTheme(theme)
  applyHostStyleVariables(context.styles.variables)
  document.documentElement.lang = locale
  button('theme').textContent = `${locale === 'zh-CN' ? '主题' : 'Theme'}: ${theme === 'dark' ? locale === 'zh-CN' ? '深色' : 'Dark' : locale === 'zh-CN' ? '浅色' : 'Light'}`
  button('language').textContent = locale === 'zh-CN' ? '语言: 中文' : 'Language: English'
  button('new-map').textContent = locale === 'zh-CN' ? '新建地图' : 'New map'
  button('san-francisco').textContent = locale === 'zh-CN' ? '定位旧金山' : 'San Francisco'
  button('close-map').textContent = locale === 'zh-CN' ? '关闭地图' : 'Close map'
  element('preview-title').textContent = locale === 'zh-CN' ? 'Cesium Map · 本地预览' : 'Cesium Map · Local preview'
  element('preview-note').textContent = locale === 'zh-CN' ? '主题与语言控件模拟宿主设置；正式对话使用 Codex 原生聊天。' : 'Controls simulate host settings. Conversations use native Codex chat.'
  iframe.title = locale === 'zh-CN' ? 'Cesium 三维地图' : 'Cesium 3D map'
  host?.setHostContext(context)
}

button('theme').onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; updatePresentation() }
button('language').onclick = () => { locale = locale === 'zh-CN' ? 'en' : 'zh-CN'; updatePresentation() }
updatePresentation()

function resizeWorkspace() {
  const height = Math.max(480, window.innerHeight - document.querySelector('header')!.getBoundingClientRect().height)
  if (layout !== 'home') iframe.style.height = `${height}px`
  host?.setHostContext({ containerDimensions: { width: iframe.clientWidth, height } })
}
window.addEventListener('resize', resizeWorkspace)

async function closeMap() {
  layout = 'home'
  document.body.dataset.workspace = layout
  iframe.style.height = `${homeHeight}px`
  if (host) {
    await host.teardownResource({}).catch(() => {})
    await host.close()
    host = undefined
  }
  iframe.srcdoc = ''
  element('context').textContent = locale === 'zh-CN' ? '地图已关闭。' : 'Map closed.'
  button('san-francisco').disabled = true
  button('close-map').disabled = true
}

async function openMap() {
  button('new-map').disabled = true
  await closeMap()
  try {
    const result = await client.callTool({ name: 'openCesiumMap', arguments: {} })
    if (result.isError) throw new Error(JSON.stringify(result.content))
    sessionId = String((result.structuredContent as Record<string, unknown>)?.sessionId)
    const { tools } = await client.listTools()
    const ui = tools.find(tool => tool.name === 'openCesiumMap')?._meta?.ui as { resourceUri: string } | undefined
    if (!ui) throw new Error('Map UI resource is missing')
    await client.readResource({ uri: ui.resourceUri })
    host = new AppBridge(client, { name: 'Cesium preview host', version: '1.0.0' }, {
      serverTools: {}, serverResources: {}, updateModelContext: {}, message: { text: {} },
    }, { hostContext: { ...presentation(), displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] } })
    host.onupdatemodelcontext = async params => {
      const context = params.structuredContent as Record<string, unknown> ?? {}
      const next = (context.workspace as { layout?: string } | undefined)?.layout ?? 'home'
      if (next !== layout) {
        layout = next
        document.body.dataset.workspace = layout
        if (layout === 'home') iframe.style.height = `${homeHeight}px`
        resizeWorkspace()
        requestAnimationFrame(() => window.scrollTo({ top: 0 }))
      }
      element('context').textContent = JSON.stringify(context, null, 2)
      return {}
    }
    host.onmessage = async params => {
      // Preview records standard host messages; it does not create a second chat UI.
      messages.push(params)
      element('messages').textContent = JSON.stringify(messages, null, 2)
      return {}
    }
    host.onrequestdisplaymode = async ({ mode }) => {
      const displayMode = mode === 'fullscreen' ? 'fullscreen' : 'inline'
      host!.setHostContext({ displayMode })
      return { mode: displayMode }
    }
    host.onsizechange = ({ height }) => {
      if (height && layout === 'home') {
        homeHeight = Math.min(4000, Math.max(480, Math.ceil(height)))
        iframe.style.height = `${homeHeight}px`
      }
    }
    host.oninitialized = async () => {
      await host!.sendToolInput({ arguments: {} })
      await host!.sendToolResult(result)
      resizeWorkspace()
      element('status').textContent = `MCP Apps · ${sessionId}`
      button('san-francisco').disabled = false
      button('close-map').disabled = false
    }
    await host.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!))
    iframe.removeAttribute('srcdoc')
    iframe.src = new URL(element('sandbox-origin').textContent!, location.href).href
  } finally { button('new-map').disabled = false }
}

button('new-map').onclick = () => { void openMap().catch(showError) }
button('close-map').onclick = () => { void closeMap().catch(showError) }
button('san-francisco').onclick = async () => {
  try {
    const result = await client.callTool({ name: 'flyTo', arguments: {
      sessionId, longitude: -122.4194, latitude: 37.7749, height: 80_000, pitch: -90, duration: 0,
    } })
    element('result').textContent = JSON.stringify(result, null, 2)
  } catch (error) { showError(error) }
}
function showError(error: unknown) { element('status').textContent = error instanceof Error ? error.message : String(error) }
void client.connect(new StreamableHTTPClientTransport(new URL('/mcp', location.href))).then(openMap).catch(showError)
