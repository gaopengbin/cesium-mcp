// Exact origins used by the default globe and built-in basemap presets.
export const cesiumMapOrigins = [
  'https://cesium.com',
  'https://api.cesium.com',
  'https://assets.cesium.com',
  'https://server.arcgisonline.com',
  'https://basemaps.cartocdn.com',
  'https://tile.openstreetmap.org',
  ...Array.from({ length: 8 }, (_, index) => `https://t${index}.tianditu.gov.cn`),
  ...['webrd', 'webst'].flatMap(prefix =>
    Array.from({ length: 4 }, (_, index) => `https://${prefix}0${index + 1}.is.autonavi.com`)),
]

/** User-configured origins for custom vector sources, also declared to the host. */
export function cesiumMapDataOrigins(configured = process.env.CESIUM_MAP_DATA_ORIGINS ?? ''): string[] {
  return [...new Set(configured.split(',').map(value => value.trim()).filter(Boolean).map(value => {
    const url = new URL(value)
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.hostname.includes('*') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('CESIUM_MAP_DATA_ORIGINS must contain HTTPS or loopback HTTP origins without paths or credentials')
    }
    return url.origin
  }))]
}
