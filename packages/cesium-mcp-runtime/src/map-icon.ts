import { readFileSync } from 'node:fs'

// Keep the native entrypoint and packaged logos on the same original vector.
const folder = import.meta.url.endsWith('.ts') ? '../assets/' : './'
const svg = readFileSync(new URL(`${folder}map-icon.svg`, import.meta.url), 'utf8')

export const cesiumMapIcons = [{
  src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
  mimeType: 'image/svg+xml',
  sizes: ['20x20'],
}]
