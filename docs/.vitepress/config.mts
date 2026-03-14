import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Cesium MCP',
  description: 'Let AI agents control a 3D globe through natural language',
  base: '/cesium-mcp/',
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/cesium-mcp/logo.svg' }],
  ],
  locales: {
    root: {
      label: 'English',
      lang: 'en',
    },
    'zh-CN': {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh-CN/',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh-CN/guide/getting-started' },
          { text: 'API 参考', link: '/zh-CN/api/bridge' },
          { text: '示例', link: '/zh-CN/examples/' },
        ],
        sidebar: {
          '/zh-CN/guide/': [
            {
              text: '入门',
              items: [
                { text: '快速开始', link: '/zh-CN/guide/getting-started' },
                { text: '架构概览', link: '/zh-CN/guide/architecture' },
              ],
            },
          ],
          '/zh-CN/api/': [
            {
              text: 'API 参考',
              items: [
                { text: 'cesium-mcp-bridge', link: '/zh-CN/api/bridge' },
                { text: 'cesium-mcp-runtime', link: '/zh-CN/api/runtime' },
                { text: 'cesium-mcp-dev', link: '/zh-CN/api/dev' },
              ],
            },
          ],
        },
      },
    },
  },
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API Reference', link: '/api/bridge' },
      { text: 'Examples', link: '/examples/' },
      {
        text: 'v1.139.0',
        items: [
          { text: 'Changelog', link: 'https://github.com/gaopengbin/cesium-mcp/releases' },
          { text: 'npm', link: 'https://www.npmjs.com/package/cesium-mcp-runtime' },
        ],
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Architecture', link: '/guide/architecture' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'cesium-mcp-bridge', link: '/api/bridge' },
            { text: 'cesium-mcp-runtime', link: '/api/runtime' },
            { text: 'cesium-mcp-dev', link: '/api/dev' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/gaopengbin/cesium-mcp' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/cesium-mcp-runtime' },
    ],
    editLink: {
      pattern: 'https://github.com/gaopengbin/cesium-mcp/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 gaopengbin',
    },
    search: {
      provider: 'local',
    },
  },
})
