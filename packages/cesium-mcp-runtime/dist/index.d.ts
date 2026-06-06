import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * cesium-mcp-runtime — MCP Server for Cesium
 *
 * 通过标准 MCP 协议暴露 Cesium 操控工具，
 * 通过 WebSocket 桥接到浏览器中的 cesium-mcp-bridge 执行。
 *
 * 架构：
 *   AI Agent ←→ MCP Server (stdio) ←→ WebSocket ←→ Browser (cesium-mcp-bridge)
 *   Backend  ←→ HTTP POST /api/command  ←→ WebSocket ←→ Browser (cesium-mcp-bridge)
 */

/**
 * Smithery 扫描时使用的无副作用服务器实例。
 * 返回带有相同工具/资源元数据的独立 McpServer，
 * 不启动 WebSocket，不连接 transport。
 */
declare function createSandboxServer(): McpServer;
declare function main(argv?: string[]): Promise<void>;

export { createSandboxServer, main };
