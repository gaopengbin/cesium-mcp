import { McpServer, McpHttpHandler } from '@modelcontextprotocol/server';

declare function isViewerRequest(method: string | undefined, url: string | undefined): boolean;
interface BuildMcpServerOptions {
    toolsets?: Iterable<string>;
    dynamicDiscovery?: boolean;
    /** Register diagnostic fixtures required by the official MCP conformance suite. */
    conformance?: boolean;
}
/** Build one isolated MCP server for an HTTP request or stdio connection. */
declare function buildMcpServer(options?: BuildMcpServerOptions): McpServer;
declare function createCesiumMcpHttpHandler(): McpHttpHandler;
/**
 * Smithery 扫描时使用的无副作用服务器实例。
 * 返回带有相同工具/资源元数据的独立 McpServer，
 * 不启动 WebSocket，不连接 transport。
 */
declare function createSandboxServer(): McpServer;
declare function main(argv?: string[]): Promise<void>;

export { type BuildMcpServerOptions, buildMcpServer, createCesiumMcpHttpHandler, createSandboxServer, isViewerRequest, main };
