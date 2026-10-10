# MCP Apps 地图面板

Runtime 可以把真实的 Cesium Viewer 放进 MCP Apps 宿主。调用 `openCesiumMap` 打开面板，再把返回的 `sessionId` 传给 `flyTo`、`addMarker`、`addGeoJsonLayer` 等地图工具。

面板复用现有 Bridge 执行核心，通过仅对 App 可见的 MCP 工具交换指令和结果，不需要沙盒访问本地 WebSocket。外部 Viewer 页面继续使用 WebSocket 路由。

## 本地体验

在仓库根目录执行：

```sh
npm ci
npm run build
npm run app:preview -w packages/cesium-mcp-runtime
```

打开 **http://127.0.0.1:19311/**。预览通过真实 Streamable HTTP MCP 和官方 MCP Apps `AppBridge` 连接。顶部主题和语言控件模拟宿主设置，诊断区记录标准 `ui/message` 请求。地图 App 不包含自己的聊天输入框或聊天记录；在 Codex 中直接使用原生聊天进行提问和追问。聊天区位置由宿主控制。

“展开地图”“返回场景”和“继续查看地图”只切换布局，不重新创建 Viewer，保留地图对象、选中项、视角与会话。Escape 恢复原布局；宿主声明支持 fullscreen 时，还会收到标准显示模式请求。

场景选择器包含三个美国样例：旧金山的 24 个分级单元、曼哈顿的 18 栋规划建筑、洛杉矶的 72 个加权事件及服务点和示意联络路线。封面取自场景实际运行截图。进度、图例与对象详情随宿主语言变化；切换或移除时只清理本次样例资源。“在 Codex 中分析”和“询问此对象”把地图上下文发送到原生聊天。样例数值、建筑、事件与路线均为演示数据，路线不是导航规划结果。

在 Codex 原生聊天中输入“把选中建筑拉伸到 300 米”“分析当前示例”或“飞到旧金山”。地图通过 `ui/update-model-context` 发布视角、图层和选中对象，不渲染重复聊天侧栏。初次连接和宿主设置变更时，应用宿主主题、语义样式变量、字体和语言。缺少宿主偏好时使用系统主题和浏览器语言；中文语言环境显示中文，其余显示英文。设置变化不重建地图，并适配窄面板和减少动态效果设置。

本地预览记录消息是否送达宿主，不模拟原生 Codex 聊天。开发用 `/chat` 接口仍可测试已登录 CLI 的工具循环，不属于产品聊天界面。本地验证不能证明正在运行的桌面客户端已加载新资源；安装更新后须重新启动客户端再验证。

1. 点击“添加标记”，通过 MCP 创建并选中纽约标记。
2. 点击“询问此对象”，把对象属性和地图会话发送给预览宿主。
3. 点击预览顶部的“定位旧金山”，验证宿主端工具调用能改变地图。
4. 再开一个预览标签页，验证不同地图会话互不干扰。
5. 关闭地图，释放 Viewer、MCP 会话、监听器和计时器。

地图默认定位纽约曼哈顿，使用 Esri 卫星影像和椭球地形，无需 Cesium ion token。底图瓦片需要访问 Esri 服务；样例数据与真实运行截图封面随插件打包。构建检查截图文件哈希，样例方案改变后须重新截图。Cesium 1.143 JavaScript、Worker 模块依赖和 Bridge 已打包进 HTML；Worker 通过 Blob 启动。Cesium 样式和初始化资源从 `cesium.com` 加载，本地预览使用已安装的同版本资源。

| 预览服务 | 默认端口 | 环境变量 |
| --- | --- | --- |
| 地图 WebSocket 和 Runtime API | 19310 | `CESIUM_WS_PORT` |
| 预览宿主 | 19311 | `CESIUM_APP_PREVIEW_PORT` |
| 独立来源的地图沙盒和本地 Cesium 资源 | 19312 | `CESIUM_APP_SANDBOX_PORT` |
| Runtime MCP HTTP 端点 | 19410 | `MCP_HTTP_PORT` |

预览宿主和地图沙盒仅监听本机回环地址。地图与宿主使用不同来源，禁止 WebSocket 连接，并只允许 Blob Worker。没有有效来源的沙盒会显示明确说明。

## 接入 MCP Apps 宿主

### 本地插件安装

仓库包含一个独立的 `Cesium Map` 开发插件。它使用根目录的 `plugin.json`、`mcp.json` 和 `skills/` 格式，并通过 `.agents/plugins/marketplace.json` 提供本地安装入口。

在仓库根目录执行：

```sh
npm run build
npm run plugin:build
npm run plugin:check
codex plugin marketplace add .
codex plugin add cesium-map@cesium-local
```

`plugin:check` 把插件复制到含空格的独立临时目录，启动真实 stdio MCP 客户端并读取工具、地图资源和 Bridge；该目录没有 `node_modules`。插件自带 Runtime 生产依赖，安装后的启动不需要下载 npm 包，也不需要访问原仓库。运行需要 PATH 中的 Node.js 22 或更高版本。

插件默认 WebSocket/内置 Viewer 使用端口 **19320**，与本地预览的 19310 分开。安装后开启新聊天，以加载插件的工具和 skill；若桌面插件目录未刷新，重启桌面应用。在支持 MCP Apps 的宿主中调用 `openCesiumMap`。只有工具接入能力的客户端可打开 **http://127.0.0.1:19320/** 使用内置 Viewer，再通过 `listSessions` 定位该会话。

修改插件后，重新运行 `npm run plugin:build` 和 `codex plugin add cesium-map@cesium-local`，确认安装缓存已刷新。本地插件的可安装性、stdio 握手、资源读取和真实地图命令可以验证；客户端是否展示 global/thread 原生入口，需要在该客户端单独验收。

此包用于本地开发。ChatGPT 网页开发模式连接需要浏览器可达的 HTTPS MCP；本地安装不等于公共目录发布。参考 [OpenAI 插件打包文档](https://developers.openai.com/plugins/build/plugins) 和 [连接验收文档](https://developers.openai.com/plugins/deploy/connect-chatgpt)。

### 手动配置 MCP 服务器

构建后，在本地 MCP Apps 宿主中配置现有 Runtime CLI：

```json
{
  "mcpServers": {
    "cesium": {
      "command": "node",
      "args": ["/absolute/path/to/cesium-mcp/packages/cesium-mcp-runtime/dist/cli.js"],
      "env": {
        "CESIUM_TOOLSETS": "view,entity,layer,interaction"
      }
    }
  }
}
```

调用 `openCesiumMap` 后，等待面板发布已连接的上下文；后续工具调用携带其中的 `sessionId`。每次新建会话获得独立 ID。传入已有 `sessionId` 可重新打开该会话，并替换它之前的浏览器连接。

`ui://cesium-mcp/map-v10.html` 使用 `text/html;profile=mcp-app`。工具声明标准 `_meta.ui.resourceUri`，以及 OpenAI `_meta["openai/ui"].entrypoints` 的 global/thread 入口提示。实际入口位置取决于客户端支持。资源地址带版本，避免宿主继续使用旧地图页面缓存。

## 网络和宿主条件

宿主需支持 MCP Apps、WebGL、module worker、WebAssembly 编译、`tools/call` 和模型上下文更新。预览 CSP 允许 Cesium 解码器使用 `wasm-unsafe-eval`，仍禁止 JavaScript eval。打包时将旧版 Knockout 的全局对象查找改为 `globalThis`，选中对象使用本面板的 UI，不依赖 Knockout HTML bindings。发送对象还需要宿主提供 message 能力；不支持时按钮保持禁用。

内嵌地图使用仅对 App 可见的 `connectCesiumMap`、`exchangeCesiumMap` 和 `disconnectCesiumMap`，通过宿主已有 MCP 连接传递指令。连接 token 隔离返回结果，旧面板被替换后失效。每次交换最多等待一秒；60 秒没有心跳后会话过期。连接失败会在十秒内显示错误。远端 MCP 发布仍需要独立的认证和会话授权。

占用本地共享端口的进程退出后，中继实例会在下一次请求失败时接管端口。已经打开的地图会重建丢失的会话并保留当前视图；如果 token 失效是因为同名地图被另一个面板接管，则停止连接。恢复时不会自动重放 Agent 命令，因为命令可能已经执行。构建后运行 `npm run plugin:check-relay` 可用两个真实 MCP 进程验证恢复行为。

需要专用 UI 来源时，可设置 `CESIUM_APP_DOMAIN`。它接受 HTTPS 来源，开发时也接受本机 HTTP，返回在 `_meta.ui.domain` 中。由宿主提供并隔离该来源，设置它本身不会托管页面。ChatGPT 官方文档中的默认来源为 `https://web-sandbox.oaiusercontent.com`。

资源声明 Cesium CDN、内置 Esri/CARTO/OSM/天地图/高德底图使用的精确来源，以及 Blob 资源。宿主需要允许 Blob module worker；打包后的 Worker 模块在启动时不再导入外部脚本。参考 [MCP Apps 规范](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx) 和 [OpenAI UI 元数据文档](https://developers.openai.com/plugins/reference)。

内联 GeoJSON 可直接使用现有工具。远端图层 URL 和 Cesium ion 数据还需要宿主策略允许相应服务商来源；自定义服务来源仍需显式更新策略。

## 当前范围

已实现交互式地图、标准 MCP Apps 资源、global/thread 入口提示、显式会话路由、相机/图层/选中对象上下文、对象消息、连接超时和资源释放。

文件 Viewer、输入框 mentions、设置页和 Deep Link 属于其他扩展，本版没有声明这些能力。本地浏览器和 MCP 验证不代表已在某个 ChatGPT 账号中完成安装和验收。
