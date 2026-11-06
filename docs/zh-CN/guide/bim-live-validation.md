# 真实 BIM 资产验收

2026-11-06 在本地开发分支通过 MCP HTTP → WebSocket → CesiumJS 1.147 Viewer，对官方公开 Snowdon Towers 示例进行了实际云端验收。测试不拦截或伪造云端响应，不上传、修改或删除任何 ion 资产。

数据来源：[官方构件 API 教程](https://cesium.com/learn/bim-cad/bim-cad-asset-elements-api/)。当前教程明确允许使用 CesiumJS 默认公开示例 token，无需创建账号。早期搜索缓存中的旧资产 ID 不作为当前验收依据。

| 示例 | ion 资产 ID | 模型构件总数 | 具有正净体积的构件数 | 净体积合计 |
| --- | --- | --- | --- | --- |
| Snowdon Towers Structural RVT | 6093105 | 1,545 | 58 | 1,164.9419340115426 m³ |
| Snowdon Towers Architectural IFC | 6093184 | 8,152 | 1,078 | 2,921.132461641315 m³ |

筛选条件是 `{ 'Net Volume': { $gt: 0 } }`，统计属性是 `Net Volume`。单位来自真实构件属性中的 `Units:CUB_M`，未将格式化显示字符串当作原始值。并非模型中每个构件都具有该属性；总构件数与参与净体积统计的数量不同。

对结构模型的 58 个数值构件，逐一读取原始属性并独立求和，得到 1,164.9419340115428 m³，与服务端聚合差约 2.27×10⁻¹³ m³（浮点累加误差）。建筑模型另验证了全模型聚合及数量一致性。

## 验收内容

- 真实 ion 3D Tiles 载入和分页游标。
- 构件详情、原始数值和源单位。
- 模型树根节点、子节点及构件层级路径。
- 服务端工程量聚合。
- 根据真实地理范围定位，隔离、高亮实际流式构件，鼠标点击返回原构件 ID。
- ECEF 查询及原生 IonSnapService 精确吸附返回真实命中。
- 服务器筛选结果应用到场景，并清除筛选恢复外观。

## 验收发现并修复的问题

真实服务使用两组不同的路由：

```text
构件/统计/模型树： /v1/assets/{id}/elements... 和 /v1/assets/{id}/tree/...
ECEF/精确吸附：    /assets/{id}/ecef 和 /assets/{id}/elements/{hexId}/snap
```

此前本地模拟没有区分该差异，ECEF 曾错误地使用 `/v1/assets/...`。本次已修复，并为模拟服务及单元测试加入了明确的路由断言。

## 复测

```sh
npm run test:bim:live
node scripts/test-bim-live.mjs --public-sample --asset 6093184
```

私有资产需要在本地配置 `CESIUM_ION_TOKEN`，然后去掉 `--public-sample` 并传入自己的资产 ID。不要将 token 写入命令参数、源码或报告。公开模式仅接受已记录的官方教程资产 ID。

验收结果和实际截图写入 `artifacts/bim-live/<assetId>/`。真实云服务可能发生短暂超时；测试仅对只读查询的瞬时超时、限流和部分服务端错误做最多两次重试，重试会记入报告。每次运行保存独立记录，失败不会覆盖已有成功验收。

这些结果证明公开示例链路可用，不代表用户私有账号具有相同权限。用户提供的 token 请求账号资产列表仍返回 404，不能据此认定账号为空。本轮未发布 npm。
