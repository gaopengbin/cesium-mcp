# Cesium Map · Codex 地图插件

[English](README.md) · [产品网站](https://laogao.xyz/cesium-map/) · [支持](https://laogao.xyz/cesium-map/support.html)

在 Codex 原生对话中操作 Cesium 三维地图：定位、添加标记、加载 GeoJSON、查看选中对象、修改建筑拉伸高度，以及返回真实地图截图。地图跟随宿主主题和语言，内置旧金山、纽约、洛杉矶演示场景。

这是连接公开 HTTPS MCP 服务的社区测试版，无需启动本地地图服务或单独填写模型 API 密钥。它尚未提交或通过 OpenAI 官方公共目录审核。

## 从仓库安装

使用支持插件源功能的新版官方 Codex CLI，依次执行：

```text
codex plugin marketplace add gaopengbin/cesium-mcp --ref main
codex plugin add cesium-map@cesium-community
```

重启 Codex 后，开始一个新对话。也可以只执行第一条，然后在桌面插件目录中选择 **Cesium Map Community → Cesium Map → 安装**。

Windows 的 PATH 里可能仍是旧版 `codex`。若提示不认识 `plugin` 命令，请更新官方 CLI，或使用已安装 Codex 桌面应用内置的 CLI。[ZIP 下载](https://github.com/gaopengbin/cesium-mcp/releases/tag/cesium-map-plugin-v0.1.0)包含已测试的 Windows 添加源脚本。

客户端需要支持自定义插件源、MCP Apps、WebGL 和 Worker。插件源发现及安装已使用当前桌面应用内置 CLI 验证；CLI 安装成功不能代替每个桌面版本的地图显示验证。遇到问题时，请通过支持页面提供客户端版本和错误信息。

如果已启用 Cesium Map 本地开发版，请先停用旧版，再使用社区版，以免出现重复的地图工具。

## 试试这些对话

- “打开纽约曼哈顿地图，在市政厅附近放一个标记。”
- “加载这段 GeoJSON，并解释我选中的对象。”
- “打开纽约立体街区，把选中建筑拉伸到 180 米，再读取属性确认。”

对话沿用 Codex 原生输入框。选中对象后点击“询问此对象”，即可把地图上下文交给宿主对话。聊天位置与展开布局由宿主控制，插件不创建第二套聊天界面。

美国样例中的建筑、热点与活力数值是演示数据，不代表实测楼高或官方统计。底图影像来自当前选择的第三方底图服务。

## 服务与隐私

服务地址：`https://laogao.xyz/cesium-map/mcp`。所有地图操作必须携带该地图返回的 `sessionId`；它是临时访问凭据，请勿分享。地图会话在 30 分钟无活动或累计 24 小时后过期；公开服务有容量与数据量限制。

[隐私说明](https://laogao.xyz/cesium-map/privacy.html) · [服务条款](https://laogao.xyz/cesium-map/terms.html) · [开发验证演示](https://laogao.xyz/cesium-map/review/)

## 更新与卸载

更新：

```text
codex plugin marketplace upgrade cesium-community
codex plugin add cesium-map@cesium-community
```

刷新或重新安装后重启 Codex。卸载：

```text
codex plugin remove cesium-map@cesium-community
codex plugin marketplace remove cesium-community
```

本目录发布远程服务连接、原创 SVG 图标和地图操作 Skill。npm Runtime 保持自己的版本与发布流程，安装此插件不会更新 npm Runtime。

[官方自定义插件源说明](https://developers.openai.com/plugins/build/plugins)
