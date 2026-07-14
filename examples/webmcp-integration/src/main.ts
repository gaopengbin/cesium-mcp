import 'cesium/Build/Cesium/Widgets/widgets.css'
import './style.css'

import {
  ImageryLayer,
  OpenStreetMapImageryProvider,
  Viewer,
} from 'cesium'
import { CesiumBridge } from 'cesium-mcp-bridge'
import {
  registerCesiumWebMcp,
} from 'cesium-mcp-webmcp'
import type {
  CesiumWebMcpCommand,
  WebMcpRegistration,
} from 'cesium-mcp-webmcp'

const status = document.querySelector<HTMLParagraphElement>('#status')!
const viewer = new Viewer('cesiumContainer', {
  baseLayer: new ImageryLayer(new OpenStreetMapImageryProvider({
    url: 'https://tile.openstreetmap.org/',
  })),
  baseLayerPicker: false,
  geocoder: false,
  timeline: false,
  animation: false,
  sceneModePicker: false,
  navigationHelpButton: false,
})
const bridge = new CesiumBridge(viewer)

const executor = {
  execute(command: CesiumWebMcpCommand) {
    if (command.action === 'geocode') return geocode(command.params)
    return bridge.execute(command)
  },
}

let registration: WebMcpRegistration | undefined

try {
  registration = await registerCesiumWebMcp(executor, { toolsets: 'all' })
  setStatus('ready', `WebMCP ready — ${registration.registered.length} tools registered`)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  setStatus('unavailable', message)
}

document.querySelector<HTMLButtonElement>('#flyButton')!.addEventListener('click', () => {
  void bridge.execute({
    action: 'flyTo',
    params: { longitude: 121.4737, latitude: 31.2304, height: 16000 },
  })
})

document.querySelector<HTMLButtonElement>('#markerButton')!.addEventListener('click', () => {
  void bridge.execute({
    action: 'addMarker',
    params: { longitude: 121.4737, latitude: 31.2304, label: 'Shanghai', color: '#4cc9a7' },
  })
})

window.addEventListener('beforeunload', () => {
  registration?.unregister()
  viewer.destroy()
})

function setStatus(state: 'ready' | 'checking' | 'unavailable', message: string): void {
  status.dataset.state = state
  status.textContent = message
}

async function geocode(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const address = typeof params.address === 'string' ? params.address.trim() : ''
  if (!address) return { success: false, message: 'address is required' }

  const query = new URLSearchParams({ q: address, format: 'json', limit: '1' })
  if (typeof params.countryCode === 'string') query.set('countrycodes', params.countryCode)
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`)
  if (!response.ok) return { success: false, message: `Geocoder error: ${response.status}` }

  const results = await response.json() as Array<{
    display_name: string
    lat: string
    lon: string
  }>
  const result = results[0]
  if (!result) return { success: false, message: `No result for: ${address}` }
  return {
    success: true,
    longitude: Number(result.lon),
    latitude: Number(result.lat),
    displayName: result.display_name,
  }
}
