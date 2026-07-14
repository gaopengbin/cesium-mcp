# Cesium WebMCP 接入示例

这是一个专注于 npm + Vite 接入的最小示例，用于给现有 CesiumJS 应用增加原生 WebMCP 工具。它与在线 browser-agent Demo 完全分开，不包含 AI 聊天界面，也不需要 MCP 服务。

## 运行

```bash
npm install
npm run dev
```

为 localhost 启用 Chrome WebMCP 测试功能后，打开页面并在 DevTools → Application → WebMCP 中查看工具。

## 接入边界

```ts
const bridge = new CesiumBridge(viewer)
const executor = {
  execute(command) {
    if (command.action === 'geocode') return yourGeocoder(command.params)
    return bridge.execute(command)
  },
}

const registration = await registerCesiumWebMcp(executor, {
  toolsets: 'all',
})
```

- `cesium-mcp-bridge` 只执行 Cesium 命令。
- `cesium-mcp-webmcp` 只把共享契约注册到 `document.modelContext`。
- 凭据和地理编码等可选服务由应用自己管理。
- 页面或组件卸载时调用 `registration.unregister()`。

如果只需要较小的能力面，可使用 `toolsets: ['view', 'entity', 'layer']`。不要把 Cesium ion 或模型服务凭据暴露成页面工具。
