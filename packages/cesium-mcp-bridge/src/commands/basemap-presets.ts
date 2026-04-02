const TDT_SUBDOMAINS = ['0', '1', '2', '3', '4', '5', '6', '7']
const AMAP_SUBDOMAINS = ['1', '2', '3', '4']

export interface BasemapLayer {
  url: string
  maximumLevel?: number
  subdomains?: string[]
}

export interface BasemapPreset {
  /** Factory that returns imagery layer configs. `token` is forwarded from params. */
  layers: (token: string) => BasemapLayer[]
  /** Optional background color (CSS hex) applied to scene & globe. */
  backgroundColor?: string
}

export const BASEMAP_PRESETS: Record<string, BasemapPreset> = {
  dark: {
    layers: () => [{ url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', maximumLevel: 18 }],
    backgroundColor: '#0B1120',
  },
  satellite: {
    layers: () => [{ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maximumLevel: 18 }],
  },
  standard: {
    layers: () => [{ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maximumLevel: 19 }],
  },
  osm: {
    layers: () => [{ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maximumLevel: 19 }],
  },
  arcgis: {
    layers: () => [{ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', maximumLevel: 18 }],
  },
  light: {
    layers: () => [{ url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', maximumLevel: 18 }],
  },
  tianditu_vec: {
    layers: (tk) => [
      { url: `https://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${tk}`, subdomains: TDT_SUBDOMAINS, maximumLevel: 18 },
      { url: `https://t{s}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${tk}`, subdomains: TDT_SUBDOMAINS, maximumLevel: 18 },
    ],
  },
  tianditu_img: {
    layers: (tk) => [
      { url: `https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${tk}`, subdomains: TDT_SUBDOMAINS, maximumLevel: 18 },
      { url: `https://t{s}.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${tk}`, subdomains: TDT_SUBDOMAINS, maximumLevel: 18 },
    ],
  },
  amap: {
    layers: () => [
      { url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', subdomains: AMAP_SUBDOMAINS, maximumLevel: 18 },
    ],
  },
  amap_satellite: {
    layers: () => [
      { url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', subdomains: AMAP_SUBDOMAINS, maximumLevel: 18 },
      { url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}', subdomains: AMAP_SUBDOMAINS, maximumLevel: 18 },
    ],
  },
}
