import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Cesium MCP',
  description: 'Let AI agents control a 3D globe through natural language',
  base: '/cesium-mcp/',
  ignoreDeadLinks: [
    /\/design\//,
  ],
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/cesium-mcp/favicon.svg' }],
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
                { text: '常见问题', link: '/zh-CN/guide/faq' },
              ],
            },
          ],
          '/zh-CN/api/': [
            {
              text: 'cesium-mcp-bridge',
              link: '/zh-CN/api/bridge',
              collapsed: false,
              items: [
                { text: '初始化', link: '/zh-CN/api/bridge#初始化' },
                { text: '视图控制', link: '/zh-CN/api/bridge#视图控制' },
                { text: '实体', link: '/zh-CN/api/bridge#实体' },
                { text: '图层管理', link: '/zh-CN/api/bridge#图层管理' },
                { text: '高级相机', link: '/zh-CN/api/bridge#高级相机' },
                { text: '扩展实体类型', link: '/zh-CN/api/bridge#扩展实体类型' },
                { text: '动画', link: '/zh-CN/api/bridge#动画' },
                { text: '3D 场景', link: '/zh-CN/api/bridge#_3d-场景' },
                { text: '交互', link: '/zh-CN/api/bridge#交互' },
                { text: '事件', link: '/zh-CN/api/bridge#事件' },
                { text: 'TypeScript 类型', link: '/zh-CN/api/bridge#typescript-类型' },
              ],
            },
            {
              text: 'cesium-mcp-runtime',
              link: '/zh-CN/api/runtime',
              collapsed: false,
              items: [
                { text: '客户端配置', link: '/zh-CN/api/runtime#mcp-客户端配置' },
                { text: '工具集', link: '/zh-CN/api/runtime#工具集' },
                { text: '动态发现', link: '/zh-CN/api/runtime#动态发现' },
                { text: '视图工具', link: '/zh-CN/api/runtime#视图' },
                { text: '实体工具', link: '/zh-CN/api/runtime#实体' },
                { text: '图层工具', link: '/zh-CN/api/runtime#图层' },
                { text: '相机工具', link: '/zh-CN/api/runtime#相机' },
                { text: '扩展实体类型', link: '/zh-CN/api/runtime#扩展实体类型' },
                { text: '动画工具', link: '/zh-CN/api/runtime#动画' },
                { text: '3D 数据', link: '/zh-CN/api/runtime#_3d-数据' },
                { text: '交互工具', link: '/zh-CN/api/runtime#交互' },
                { text: 'MCP 资源', link: '/zh-CN/api/runtime#mcp-资源-2-个' },
                { text: '环境变量', link: '/zh-CN/api/runtime#环境变量' },
                { text: 'HTTP Push API', link: '/zh-CN/api/runtime#http-push-api' },
              ],
            },
            {
              text: 'cesium-mcp-dev',
              link: '/zh-CN/api/dev',
              collapsed: false,
              items: [
                { text: 'cesium_api_lookup', link: '/zh-CN/api/dev#cesium-api-lookup' },
                { text: 'cesium_code_gen', link: '/zh-CN/api/dev#cesium-code-gen' },
                { text: 'cesium_entity_template', link: '/zh-CN/api/dev#cesium-entity-template' },
              ],
            },
          ],
          '/zh-CN/examples/': [
            {
              text: '示例',
              items: [
                { text: '使用示例', link: '/zh-CN/examples/' },
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
        text: 'v1.139.4',
        items: [
          { text: 'Changelog', link: 'https://github.com/gaopengbin/cesium-mcp/releases' },
          { text: 'npm', link: 'https://www.npmjs.com/package/cesium-mcp-runtime' },
        ],
      },
    ],
    sidebar: {
      '/api/': [
        {
          text: 'cesium-mcp-bridge',
          link: '/api/bridge',
          collapsed: false,
          items: [
            { text: 'Initialization', link: '/api/bridge#initialization' },
            { text: 'View Control', link: '/api/bridge#view-control' },
            { text: 'Entity', link: '/api/bridge#entity' },
            { text: 'Layer Management', link: '/api/bridge#layer-management' },
            { text: 'Camera (Advanced)', link: '/api/bridge#camera-advanced' },
            { text: 'Extended Entity Types', link: '/api/bridge#extended-entity-types' },
            { text: 'Animation', link: '/api/bridge#animation' },
            { text: '3D Scene', link: '/api/bridge#_3d-scene' },
            { text: 'Interaction', link: '/api/bridge#interaction' },
            { text: 'Events', link: '/api/bridge#events' },
            { text: 'TypeScript Types', link: '/api/bridge#typescript-types' },
          ],
        },
        {
          text: 'cesium-mcp-runtime',
          link: '/api/runtime',
          collapsed: false,
          items: [
            { text: 'Client Configuration', link: '/api/runtime#mcp-client-configuration' },
            { text: 'Toolsets', link: '/api/runtime#toolsets' },
            { text: 'Dynamic Discovery', link: '/api/runtime#dynamic-discovery' },
            { text: 'View Tools', link: '/api/runtime#view' },
            { text: 'Entity Tools', link: '/api/runtime#entity' },
            { text: 'Layer Tools', link: '/api/runtime#layer' },
            { text: 'Camera Tools', link: '/api/runtime#camera' },
            { text: 'Extended Entity Types', link: '/api/runtime#extended-entity-types' },
            { text: 'Animation Tools', link: '/api/runtime#animation' },
            { text: '3D Data', link: '/api/runtime#_3d-data' },
            { text: 'Interaction Tools', link: '/api/runtime#interaction' },
            { text: 'Resources', link: '/api/runtime#mcp-resources-2' },
            { text: 'Environment Variables', link: '/api/runtime#environment-variables' },
            { text: 'HTTP Push API', link: '/api/runtime#http-push-api' },
          ],
        },
        {
          text: 'cesium-mcp-dev',
          link: '/api/dev',
          collapsed: false,
          items: [
            { text: 'cesium_api_lookup', link: '/api/dev#cesium-api-lookup' },
            { text: 'cesium_code_gen', link: '/api/dev#cesium-code-gen' },
            { text: 'cesium_entity_template', link: '/api/dev#cesium-entity-template' },
          ],
        },
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Usage Examples', link: '/examples/' },
          ],
        },
      ],
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Architecture', link: '/guide/architecture' },
            { text: 'FAQ', link: '/guide/faq' },
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
