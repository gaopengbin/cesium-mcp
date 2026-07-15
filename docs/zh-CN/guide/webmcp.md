# WebMCP 浏览器接入

当你希望兼容 WebMCP 的浏览器智能体发现并调用当前页面里的 Cesium 工具时，使用 WebMCP。工具仍然通过 `cesium-mcp-bridge` 执行，但不需要启动 `cesium-mcp-runtime`、WebSocket 服务或桌面 MCP 客户端。

> WebMCP 目前仍是 Chrome 实验功能。在线演示已加入 Chrome 149–156 Origin Trial；本地开发需要开启下文所列的测试开关。

## 在线体验

使用 Chrome 打开 [Cesium Agent Lab](https://cesium-browser-agent.pages.dev/)。状态面板应显示 **WebMCP 已就绪 — 已注册 61 个页面工具**。

演示中有两条彼此独立的 AI 路径：

- 兼容的浏览器智能体可以发现页面注册的 WebMCP 工具。
- 内置聊天演示托管的 function calling 智能体，在 WebMCP 不可用时仍可使用。

内置聊天只是在线演示提供的便利功能，并不是在自己的应用中使用 `cesium-mcp-webmcp` 的必要条件。

HTTPS 在线演示还为明确批准的 HTTP 测试数据配置了一个保持目录结构的窄范围代理。它属于应用基础设施，不属于 WebMCP 包。其他 HTTP 地址会得到清晰的 Mixed Content 提示；生产应用应优先使用 HTTPS 数据源，或自行维护服务端白名单。

## 接入已有 Cesium 应用

```bash
npm install cesium cesium-mcp-bridge cesium-mcp-webmcp
```

创建 Cesium Viewer 后注册工具：

```ts
import { CesiumBridge } from 'cesium-mcp-bridge'
import { registerCesiumWebMcp } from 'cesium-mcp-webmcp'

const bridge = new CesiumBridge(viewer)

const registration = await registerCesiumWebMcp(bridge, {
  toolsets: 'all',
  excludeTools: ['geocode'],
})

// 页面或组件卸载时调用。
registration.unregister()
```

`registerCesiumWebMcp()` 默认注册包含 15 个工具的 `core` 选择。使用 `toolsets: 'all'` 可注册全部 61 个浏览器安全工具，也可以只选择页面需要的工具集：

```ts
await registerCesiumWebMcp(bridge, {
  toolsets: ['view', 'entity', 'layer'],
})
```

12 个可用工具集为：`view`、`entity`、`layer`、`camera`、`entity-ext`、`animation`、`scene`、`tiles`、`interaction`、`trajectory`、`heatmap` 和 `geolocation`。

## 应用自行负责的能力

Bridge 可以直接执行 61 个浏览器安全契约中的 60 个。`geocode` 会访问外部服务，因此需要应用提供处理函数：

```ts
const executor = {
  execute(command) {
    if (command.action === 'geocode') {
      return yourGeocoder(command.params)
    }

    return bridge.execute(command)
  },
}

await registerCesiumWebMcp(executor, { toolsets: 'all' })
```

`setIonToken` 有意不作为页面工具暴露。Cesium ion token 和模型服务 API key 都应由应用管理。不要把私钥放入工具 schema、工具结果或浏览器存储中。

## 本地测试

1. 打开 `chrome://flags/#enable-webmcp-testing`，启用 WebMCP 测试功能。
2. 启用 `chrome://flags/#devtools-webmcp-support`，用于在 DevTools 中检查工具。
3. 重启 Chrome。
4. 运行独立接入示例：

```bash
npm install
npm run build
npm run dev -w examples/webmcp-integration
```

5. 打开本地地址，在 **DevTools → Application → WebMCP** 中检查和执行工具。

Origin Trial 期间，如果要部署到 HTTPS 生产环境，需要为最终使用的准确 origin 申请 Chrome WebMCP Origin Trial，并通过页面元数据或响应头提供 token。

## 能力检测与清理

并非所有浏览器都支持 WebMCP。应用应在没有 WebMCP 时仍能正常使用，把工具注册作为渐进增强：

```ts
if ('modelContext' in document) {
  const registration = await registerCesiumWebMcp(bridge)
  // 保存 registration，并在页面销毁时取消注册。
}
```

该包只面向原生 `document.modelContext` API，不会安装 polyfill。

## 这个包不包含什么

- 不包含后端 MCP 服务
- 不包含 WebSocket 传输层
- 不包含 AI 模型或聊天界面
- 不打包 CesiumJS runtime
- 不负责凭据管理

如果要从 Claude Desktop、Cursor 或 VS Code 调用 Cesium，请使用 [`cesium-mcp-runtime`](/zh-CN/guide/getting-started)。完整的 npm + Vite 接入可参考 [`examples/webmcp-integration`](https://github.com/gaopengbin/cesium-mcp/tree/main/examples/webmcp-integration)。
