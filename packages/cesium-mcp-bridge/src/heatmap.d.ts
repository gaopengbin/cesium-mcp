declare module 'heatmap.js' {
  interface HeatmapConfig {
    container: HTMLElement
    radius?: number
    maxOpacity?: number
    minOpacity?: number
    blur?: number
    gradient?: Record<number, string>
  }

  interface HeatmapData {
    max: number
    min?: number
    data: Array<{ x: number; y: number; value: number }>
  }

  interface HeatmapInstance {
    setData(data: HeatmapData): void
    addData(point: { x: number; y: number; value: number }): void
    getDataURL(): string
    repaint(): void
  }

  const h337: {
    create(config: HeatmapConfig): HeatmapInstance
  }

  export default h337
}
