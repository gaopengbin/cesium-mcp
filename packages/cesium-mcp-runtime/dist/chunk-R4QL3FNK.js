// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z as z2 } from "zod";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { AsyncLocalStorage } from "async_hooks";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { normalizeCesiumToolLocale } from "cesium-mcp-contracts";

// src/tool-manifest.ts
import {
  cesiumBrowserToolContracts,
  cesiumBrowserToolsetDefinitions,
  cesiumBrowserToolsetNames,
  cesiumSharedToolNames
} from "cesium-mcp-contracts";
var cesiumRuntimeOnlyToolNames = ["setIonToken"];
var sharedContractByName = new Map(
  cesiumBrowserToolContracts.map((contract) => [contract.name, contract])
);
function getCesiumRuntimeToolMetadata(name, locale) {
  const contract = sharedContractByName.get(name);
  if (!contract) return void 0;
  const localized = contract.localizations[locale];
  return {
    description: localized.description,
    inputSchema: contract.inputSchema,
    parameterDescriptions: localized.parameters,
    annotations: {
      title: contract.title,
      readOnlyHint: contract.annotations.readOnlyHint ?? false,
      destructiveHint: contract.annotations.destructiveHint ?? false,
      idempotentHint: contract.annotations.idempotentHint ?? false,
      openWorldHint: contract.annotations.openWorldHint ?? false
    }
  };
}
var cesiumRuntimeToolsets = Object.fromEntries(cesiumBrowserToolsetNames.map((name) => [
  name,
  name === "scene" ? [...cesiumBrowserToolsetDefinitions[name].names, ...cesiumRuntimeOnlyToolNames] : [...cesiumBrowserToolsetDefinitions[name].names]
]));
var cesiumRuntimeToolsetDescriptions = Object.fromEntries(cesiumBrowserToolsetNames.map((name) => [
  name,
  cesiumBrowserToolsetDefinitions[name].description
]));
var cesiumRuntimeCommandToolNames = [
  ...cesiumSharedToolNames,
  ...cesiumRuntimeOnlyToolNames
];

// src/json-schema-to-zod.ts
import { z } from "zod";
function schemaObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function literalSchema(values) {
  const schemas = values.map((value) => z.literal(value));
  if (schemas.length === 0) return z.never();
  if (schemas.length === 1) return schemas[0];
  return z.union(schemas);
}
function stringSchema(schema) {
  let result = z.string();
  if (typeof schema.minLength === "number") result = result.min(schema.minLength);
  if (typeof schema.maxLength === "number") result = result.max(schema.maxLength);
  if (typeof schema.pattern === "string") result = result.regex(new RegExp(schema.pattern));
  if (schema.format === "uri" || schema.format === "url") result = result.url();
  if (schema.format === "date-time") result = result.datetime();
  return result;
}
function numberSchema(schema, integer) {
  let result = integer ? z.number().int() : z.number();
  if (typeof schema.minimum === "number") result = result.min(schema.minimum);
  if (typeof schema.maximum === "number") result = result.max(schema.maximum);
  if (typeof schema.exclusiveMinimum === "number") result = result.gt(schema.exclusiveMinimum);
  if (typeof schema.exclusiveMaximum === "number") result = result.lt(schema.exclusiveMaximum);
  return result;
}
function arraySchema(schema) {
  const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
  if (prefixItems.length > 0) {
    const minimum = typeof schema.minItems === "number" ? schema.minItems : prefixItems.length;
    const maximum = typeof schema.maxItems === "number" ? Math.min(schema.maxItems, prefixItems.length) : prefixItems.length;
    const convertedItems = prefixItems.map((item) => zodSchemaFromJsonSchema(schemaObject(item)));
    const variants = Array.from(
      { length: Math.max(0, maximum - minimum + 1) },
      (_, index) => z.tuple(
        convertedItems.slice(0, minimum + index)
      )
    );
    if (variants.length === 1) return variants[0];
    return z.union(variants);
  }
  let result = z.array(zodSchemaFromJsonSchema(schemaObject(schema.items)));
  if (typeof schema.minItems === "number") result = result.min(schema.minItems);
  if (typeof schema.maxItems === "number") result = result.max(schema.maxItems);
  return result;
}
function objectSchema(schema) {
  const properties = schemaObject(schema.properties);
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const shape = {};
  for (const [name, value] of Object.entries(properties)) {
    const propertySchema = schemaObject(value);
    let converted = zodSchemaFromJsonSchema(propertySchema);
    if (!required.has(name) && propertySchema.default === void 0) converted = converted.optional();
    shape[name] = converted;
  }
  const result = z.object(shape);
  if (schema.additionalProperties === false) return result.strict();
  if (schema.additionalProperties === true) return result.passthrough();
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    return result.catchall(zodSchemaFromJsonSchema(schemaObject(schema.additionalProperties)));
  }
  if (Object.keys(properties).length === 0) return z.record(z.unknown());
  return result.passthrough();
}
function schemaForType(type, schema) {
  switch (type) {
    case "string":
      return stringSchema(schema);
    case "number":
      return numberSchema(schema, false);
    case "integer":
      return numberSchema(schema, true);
    case "boolean":
      return z.boolean();
    case "null":
      return z.null();
    case "array":
      return arraySchema(schema);
    case "object":
      return objectSchema(schema);
    default:
      return z.unknown();
  }
}
function zodSchemaFromJsonSchema(schema) {
  const source = schemaObject(schema);
  let result;
  if ("const" in source) {
    result = z.literal(source.const);
  } else if (Array.isArray(source.enum)) {
    result = literalSchema(source.enum);
  } else if (Array.isArray(source.oneOf)) {
    const options = source.oneOf.map((option) => zodSchemaFromJsonSchema(schemaObject(option)));
    result = options.length === 1 ? options[0] : z.union(options);
  } else if (Array.isArray(source.type)) {
    const options = source.type.map((type) => schemaForType(String(type), source));
    result = options.length === 1 ? options[0] : z.union(options);
  } else if (typeof source.type === "string") {
    result = schemaForType(source.type, source);
  } else if (source.properties || source.additionalProperties !== void 0) {
    result = objectSchema(source);
  } else {
    result = z.unknown();
  }
  if (source.default !== void 0) result = result.default(source.default);
  if (typeof source.description === "string") result = result.describe(source.description);
  return result;
}
function zodObjectFromJsonSchema(schema) {
  const converted = zodSchemaFromJsonSchema(schema);
  if (!(converted instanceof z.ZodObject)) {
    throw new Error("Cesium tool input schema must be a JSON Schema object");
  }
  return converted;
}

// src/index.ts
var WS_PORT = parseInt(process.env.CESIUM_WS_PORT ?? "9100");
var MAX_PORT_RETRIES = 10;
var browserClients = /* @__PURE__ */ new Map();
var pendingRequests = /* @__PURE__ */ new Map();
var requestIdCounter = 0;
var _relayPort = 0;
var DEFAULT_SESSION_ID = process.env.DEFAULT_SESSION_ID ?? "default";
var _httpSessionStore = new AsyncLocalStorage();
function getDefaultBrowser() {
  if (browserClients.size === 0) return null;
  const preferred = browserClients.get(DEFAULT_SESSION_ID);
  if (preferred && preferred.readyState === WebSocket.OPEN) return preferred;
  return browserClients.values().next().value ?? null;
}
function sendToBrowser(action, params, timeoutMs = 3e4) {
  const { sessionId: paramSessionId, ...cleanParams } = params;
  const sessionId = paramSessionId ?? _httpSessionStore.getStore();
  if (_relayPort > 0) return _sendViaRelay(action, cleanParams, timeoutMs, sessionId);
  return new Promise((resolve, reject) => {
    const ws = sessionId ? browserClients.get(sessionId) ?? getDefaultBrowser() : getDefaultBrowser();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("\u65E0\u6D4F\u89C8\u5668\u8FDE\u63A5\u3002\u8BF7\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00\u5305\u542B CesiumJS \u7684\u9875\u9762\u5E76\u8FDE\u63A5 WebSocket\u3002\u793A\u4F8B\uFF1Ahttp://localhost:9100/demo/"));
      return;
    }
    const reqId = `req_${++requestIdCounter}`;
    const timer = setTimeout(() => {
      pendingRequests.delete(reqId);
      reject(new Error(`\u6D4F\u89C8\u5668\u54CD\u5E94\u8D85\u65F6\uFF08${timeoutMs}ms\uFF09`));
    }, timeoutMs);
    pendingRequests.set(reqId, { resolve, reject, timer });
    ws.send(JSON.stringify({
      jsonrpc: "2.0",
      id: reqId,
      method: action,
      params: cleanParams
    }));
  });
}
function pushToBrowser(sessionId, command) {
  if (_relayPort > 0) {
    _pushViaRelay(sessionId, command);
    return true;
  }
  const ws = browserClients.get(sessionId) ?? getDefaultBrowser();
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify({
    jsonrpc: "2.0",
    id: `push_${++requestIdCounter}`,
    method: command.action,
    params: command.params
  }));
  return true;
}
async function _sendViaRelay(action, params, timeoutMs, sessionId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`http://127.0.0.1:${_relayPort}/api/relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, params, sessionId }),
      signal: controller.signal
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error ?? "Relay failed");
    return data.result;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`\u6D4F\u89C8\u5668\u54CD\u5E94\u8D85\u65F6\uFF08${timeoutMs}ms, via relay\uFF09`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
function _pushViaRelay(sessionId, command) {
  fetch(`http://127.0.0.1:${_relayPort}/api/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, command })
  }).catch(() => {
  });
}
function zodShapeToJsonSchema(shape) {
  const properties = {};
  const required = [];
  for (const [key, zodType] of Object.entries(shape)) {
    const prop = {};
    let innerType = zodType;
    let isOptional = false;
    let defaultValue = void 0;
    while (innerType) {
      if (innerType._def?.typeName === "ZodDefault") {
        defaultValue = innerType._def.defaultValue();
        innerType = innerType._def.innerType;
      } else if (innerType._def?.typeName === "ZodOptional") {
        isOptional = true;
        innerType = innerType._def.innerType;
      } else if (innerType._def?.typeName === "ZodEffects") {
        innerType = innerType._def.schema;
      } else {
        break;
      }
    }
    const typeName = innerType?._def?.typeName ?? "";
    switch (typeName) {
      case "ZodNumber":
        prop.type = "number";
        break;
      case "ZodString":
        prop.type = "string";
        break;
      case "ZodBoolean":
        prop.type = "boolean";
        break;
      case "ZodEnum":
        prop.type = "string";
        prop.enum = innerType._def.values;
        break;
      case "ZodArray":
        prop.type = "array";
        break;
      case "ZodObject":
        prop.type = "object";
        break;
      case "ZodRecord":
        prop.type = "object";
        break;
      default:
        prop.type = "string";
        break;
    }
    if (defaultValue !== void 0) prop.default = defaultValue;
    if (zodType.description) prop.description = zodType.description;
    properties[key] = prop;
    if (!isOptional && defaultValue === void 0) required.push(key);
  }
  return { type: "object", properties, required: required.length ? required : void 0 };
}
var SERVER_SIDE_TOOLS = /* @__PURE__ */ new Set(["geocode"]);
async function _invokeServerSideTool(action, params) {
  const def = _toolDefs.get(action);
  if (!def) throw new Error(`Server-side tool "${action}" not found`);
  const handler = def[def.length - 1];
  const mcpResult = await handler(params);
  const text = mcpResult?.content?.[0]?.text;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return mcpResult;
}
async function handleHttpRequest(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "POST" && req.url?.startsWith("/api/command")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const sessionId = payload.sessionId ?? "default";
        const commands = Array.isArray(payload.commands) ? payload.commands : [payload.command];
        let sent = 0;
        for (const cmd of commands) {
          if (!cmd) continue;
          if (SERVER_SIDE_TOOLS.has(cmd.action) && _toolDefs.has(cmd.action)) {
            _invokeServerSideTool(cmd.action, cmd.params ?? {}).catch(() => {
            });
            sent++;
          } else if (pushToBrowser(sessionId, cmd)) {
            sent++;
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, sent, total: commands.length }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
      }
    });
    return;
  }
  if (req.method === "POST" && req.url?.startsWith("/api/relay")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { action, params, sessionId } = JSON.parse(body);
        let result;
        if (SERVER_SIDE_TOOLS.has(action) && _toolDefs.has(action)) {
          result = await _invokeServerSideTool(action, params ?? {});
        } else {
          const routedParams = sessionId ? { ...params, sessionId } : params;
          result = await sendToBrowser(action, routedParams);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, result }));
      } catch (err) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      }
    });
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/api/status")) {
    const sessions = Array.from(browserClients.keys());
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, server: "cesium-mcp-runtime", sessions, connections: sessions.length }));
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/api/tools")) {
    const parsedToolsUrl = new URL(req.url, "http://localhost");
    const tsParam = parsedToolsUrl.searchParams.get("toolsets")?.trim();
    const allowedTools = tsParam ? new Set(tsParam.split(",").flatMap((s) => TOOLSETS[s.trim()] ?? [])) : null;
    const tools = [];
    for (const [name, args] of _toolDefs.entries()) {
      if (allowedTools ? !allowedTools.has(name) : !_enabledTools.has(name)) continue;
      const description = args[1];
      const zodShape = args[2];
      const jsonSchema = zodShape ? zodShapeToJsonSchema(zodShape) : { type: "object", properties: {} };
      const toolset = TOOL_TO_TOOLSET.get(name);
      tools.push({ name, description, inputSchema: jsonSchema, ...toolset ? { _meta: { toolset } } : {} });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, tools }));
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/proxy")) {
    const parsed = new URL(req.url, `http://localhost:${WS_PORT}`);
    const targetUrl = parsed.searchParams.get("url");
    if (!targetUrl) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing ?url= parameter" }));
      return;
    }
    try {
      const proxyResp = await fetch(targetUrl);
      const contentType = proxyResp.headers.get("content-type") || "application/octet-stream";
      const buffer = Buffer.from(await proxyResp.arrayBuffer());
      res.writeHead(proxyResp.status, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*"
      });
      res.end(buffer);
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Proxy failed: ${err instanceof Error ? err.message : String(err)}` }));
    }
    return;
  }
  if (req.method === "GET" && req.url === "/bridge.js") {
    const bundle = _findLocalBridgeBundle();
    if (bundle) {
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(bundle);
      return;
    }
    res.writeHead(404);
    res.end("// local bridge bundle not found");
    return;
  }
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const token = process.env.CESIUM_ION_TOKEN || "";
    const html = _getViewerHtml(token, WS_PORT);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  res.writeHead(404);
  res.end("Not Found");
}
var _bridgeBundleCache;
function _findLocalBridgeBundle() {
  if (_bridgeBundleCache !== void 0) return _bridgeBundleCache;
  const here = dirname(fileURLToPath(import.meta.url));
  const file = "cesium-mcp-bridge.browser.global.js";
  const candidates = [
    // monorepo: runtime/dist → ../../cesium-mcp-bridge/dist
    join(here, "..", "..", "cesium-mcp-bridge", "dist", file),
    // npm install: node_modules/cesium-mcp-runtime/dist → node_modules/cesium-mcp-bridge/dist
    join(here, "..", "..", "..", "cesium-mcp-bridge", "dist", file),
    join(here, "..", "node_modules", "cesium-mcp-bridge", "dist", file)
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      _bridgeBundleCache = readFileSync(c, "utf-8");
      return _bridgeBundleCache;
    }
  }
  _bridgeBundleCache = null;
  return null;
}
function _getViewerHtml(token, wsPort) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cesium MCP Viewer</title>
<script src="https://cesium.com/downloads/cesiumjs/releases/1.143/Build/Cesium/Cesium.js"></script>
<link href="https://cesium.com/downloads/cesiumjs/releases/1.143/Build/Cesium/Widgets/widgets.css" rel="stylesheet">
<script src="/bridge.js" onerror="var s=document.createElement('script');s.src='https://unpkg.com/cesium-mcp-bridge@latest/dist/cesium-mcp-bridge.browser.global.js';document.head.appendChild(s)"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#c{width:100%;height:100%;overflow:hidden}
#s{position:fixed;top:12px;right:12px;z-index:999;padding:6px 12px;border-radius:6px;font:13px/1.4 -apple-system,sans-serif;backdrop-filter:blur(8px);transition:all .3s}
.c0{background:rgba(255,170,0,.85);color:#333}
.c1{background:rgba(0,180,80,.85);color:#fff}
.c2{background:rgba(220,50,50,.85);color:#fff}
</style>
</head>
<body>
<div id="c"></div><div id="s" class="c0">Connecting...</div>
<script>
var WS=${wsPort},TOK='${token}',SE=new URLSearchParams(location.search).get('session')||'default';
if(TOK)Cesium.Ion.defaultAccessToken=TOK;
var v=new Cesium.Viewer('c',{terrain:Cesium.Terrain.fromWorldTerrain(),baseLayerPicker:!0,geocoder:!0,animation:!0,timeline:!0});
var b=new CesiumMcpBridge.CesiumBridge(v),el=document.getElementById('s');
function conn(){var ws=new WebSocket('ws://localhost:'+WS+'?session='+SE);
ws.onopen=function(){el.className='c1';el.textContent='Connected'};
ws.onmessage=function(e){var m=JSON.parse(e.data);b.execute({action:m.method,params:m.params||{}}).then(function(r){if(m.id)ws.send(JSON.stringify({id:m.id,result:r||{success:!0}}))})};
ws.onclose=function(){el.className='c2';el.textContent='Disconnected';setTimeout(conn,3000)};
ws.onerror=function(){ws.close()}}
conn();
</script>
</body></html>`;
}
async function _probeExistingInstance(port) {
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(1500) });
    const data = await resp.json();
    return data.server === "cesium-mcp-runtime";
  } catch {
    return false;
  }
}
function _tryListen(httpServer, port) {
  return new Promise((resolve) => {
    const onError = (err) => {
      httpServer.removeListener("listening", onListening);
      if (err.code === "EADDRINUSE") resolve(false);
      else {
        console.error("[cesium-mcp-runtime] HTTP server error:", err.message);
        resolve(false);
      }
    };
    const onListening = () => {
      httpServer.removeListener("error", onError);
      resolve(true);
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(port);
  });
}
async function startServer() {
  const httpServer = createServer(handleHttpRequest);
  const wss = new WebSocketServer({ server: httpServer, noServer: false });
  wss.on("error", () => {
  });
  _setupWss(wss);
  if (await _tryListen(httpServer, WS_PORT)) {
    console.error(`[cesium-mcp-runtime] HTTP + WebSocket server on http://localhost:${WS_PORT}`);
    console.error("[cesium-mcp-runtime] POST /api/command \u2014 \u63A8\u9001\u5730\u56FE\u547D\u4EE4");
    console.error("[cesium-mcp-runtime] POST /api/relay   \u2014 \u547D\u4EE4\u4E2D\u7EE7\uFF08request-response\uFF09");
    console.error("[cesium-mcp-runtime] GET  /api/status  \u2014 \u8FDE\u63A5\u72B6\u6001");
    return;
  }
  httpServer.close();
  if (await _probeExistingInstance(WS_PORT)) {
    _relayPort = WS_PORT;
    console.error(`[cesium-mcp-runtime] Port ${WS_PORT} occupied by existing cesium-mcp-runtime \u2014 relay mode enabled`);
    console.error(`[cesium-mcp-runtime] Commands will be forwarded to http://127.0.0.1:${WS_PORT}`);
    return;
  }
  for (let offset = 1; offset <= MAX_PORT_RETRIES; offset++) {
    const tryPort = WS_PORT + offset;
    const altServer = createServer(handleHttpRequest);
    const altWss = new WebSocketServer({ server: altServer });
    altWss.on("error", () => {
    });
    _setupWss(altWss);
    if (await _tryListen(altServer, tryPort)) {
      console.error(`[cesium-mcp-runtime] Port ${WS_PORT} occupied by another service, using port ${tryPort}`);
      console.error(`[cesium-mcp-runtime] HTTP + WebSocket server on http://localhost:${tryPort}`);
      return;
    }
    altServer.close();
  }
  console.error(`[cesium-mcp-runtime] Could not find available port (tried ${WS_PORT}-${WS_PORT + MAX_PORT_RETRIES}), WebSocket server disabled`);
}
function _setupWss(wss) {
  wss.on("connection", (ws, req) => {
    const sessionId = new URL(req.url ?? "/", "http://localhost").searchParams.get("session") ?? "default";
    const oldWs = browserClients.get(sessionId);
    if (oldWs && oldWs.readyState === WebSocket.OPEN) {
      console.error(`[ws] \u540C\u540D session=${sessionId} \u5DF2\u5B58\u5728\uFF0C\u5173\u95ED\u65E7\u8FDE\u63A5`);
      oldWs.removeAllListeners("close");
      oldWs.close(1e3, "replaced by new connection");
    }
    console.error(`[ws] \u6D4F\u89C8\u5668\u8FDE\u63A5: session=${sessionId}`);
    browserClients.set(sessionId, ws);
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.id && pendingRequests.has(msg.id)) {
          const pending = pendingRequests.get(msg.id);
          pendingRequests.delete(msg.id);
          clearTimeout(pending.timer);
          if (msg.error) {
            pending.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
          } else {
            pending.resolve(msg.result);
          }
        }
      } catch {
      }
    });
    ws.on("close", () => {
      console.error(`[ws] \u6D4F\u89C8\u5668\u65AD\u5F00: session=${sessionId}`);
      browserClients.delete(sessionId);
    });
  });
}
var server = new McpServer({
  name: "cesium-mcp-runtime",
  version: "1.143.2",
  title: "Cesium MCP Runtime",
  description: "AI-powered 3D globe control via MCP \u2014 camera, layers, entities, animation, and interaction with CesiumJS.",
  websiteUrl: "https://github.com/gaopengbin/cesium-mcp"
}, {
  instructions: "Cesium MCP Runtime provides tools for controlling a CesiumJS 3D globe via AI. A browser with cesium-mcp-bridge must be connected via WebSocket for command execution. Use view tools (flyTo, setView) to navigate, entity tools to add markers/polygons/models, layer tools to manage GeoJSON/3D Tiles, and animation tools for time-based animations."
});
server.resource(
  "camera",
  "cesium://scene/camera",
  { description: "\u5F53\u524D\u76F8\u673A\u72B6\u6001\uFF08\u7ECF\u7EAC\u5EA6\u3001\u9AD8\u5EA6\u3001\u89D2\u5EA6\uFF09", mimeType: "application/json" },
  async () => {
    try {
      const result = await sendToBrowser("getView", {});
      return { contents: [{ uri: "cesium://scene/camera", text: JSON.stringify(result), mimeType: "application/json" }] };
    } catch {
      return { contents: [{ uri: "cesium://scene/camera", text: '{"error":"no browser connected"}', mimeType: "application/json" }] };
    }
  }
);
server.resource(
  "layers",
  "cesium://scene/layers",
  { description: "\u5F53\u524D\u5DF2\u52A0\u8F7D\u7684\u56FE\u5C42\u5217\u8868\uFF08ID\u3001\u540D\u79F0\u3001\u7C7B\u578B\u3001\u53EF\u89C1\u6027\uFF09", mimeType: "application/json" },
  async () => {
    try {
      const result = await sendToBrowser("listLayers", {});
      return { contents: [{ uri: "cesium://scene/layers", text: JSON.stringify(result), mimeType: "application/json" }] };
    } catch {
      return { contents: [{ uri: "cesium://scene/layers", text: '{"error":"no browser connected"}', mimeType: "application/json" }] };
    }
  }
);
var TOOLSETS = cesiumRuntimeToolsets;
var TOOLSET_DESCRIPTIONS = cesiumRuntimeToolsetDescriptions;
var DEFAULT_TOOLSETS = ["view", "entity", "layer", "interaction"];
var _tsEnv = process.env.CESIUM_TOOLSETS?.trim();
var _allMode = _tsEnv === "all";
var _enabledSets = new Set(
  _allMode ? Object.keys(TOOLSETS) : _tsEnv ? _tsEnv.split(",").map((s) => s.trim()).filter((s) => s in TOOLSETS) : DEFAULT_TOOLSETS
);
var _enabledTools = /* @__PURE__ */ new Set();
for (const setName of _enabledSets) {
  for (const tool of TOOLSETS[setName]) {
    _enabledTools.add(tool);
  }
}
var TOOL_TO_TOOLSET = /* @__PURE__ */ new Map();
for (const [setName, tools] of Object.entries(TOOLSETS)) {
  for (const tool of tools) TOOL_TO_TOOLSET.set(tool, setName);
}
var _toolDefs = /* @__PURE__ */ new Map();
var _localeKey = normalizeCesiumToolLocale(process.env.CESIUM_LOCALE);
function _applyToolDef(s, args) {
  const name = args[0];
  const toolset = TOOL_TO_TOOLSET.get(name);
  if (toolset) {
    ;
    s.registerTool(name, {
      description: args[1],
      inputSchema: args[2],
      annotations: args[3],
      _meta: { toolset }
    }, args[4]);
  } else {
    ;
    s.tool.apply(s, args);
  }
}
var _registerTool = ((...args) => {
  const name = args[0];
  const sessionIdSchema = z2.string().optional().describe(
    _localeKey === "zh-CN" ? "\u76EE\u6807\u6D4F\u89C8\u5668 session ID\uFF08\u591A\u6D4F\u89C8\u5668\u8DEF\u7531\uFF0C\u53EF\u9009\uFF09" : "Target browser session ID for multi-browser routing (optional)"
  );
  const metadata = getCesiumRuntimeToolMetadata(name, _localeKey);
  if (metadata) {
    args[1] = metadata.description;
    args[3] = metadata.annotations;
    const generated = zodObjectFromJsonSchema(metadata.inputSchema);
    const localizedShape = {};
    for (const [key, desc] of Object.entries(metadata.parameterDescriptions)) {
      if (generated.shape[key]) localizedShape[key] = generated.shape[key].describe(desc);
    }
    args[2] = generated.extend({ ...localizedShape, sessionId: sessionIdSchema });
  } else if (typeof args[2] === "object" && args[2] !== null) {
    const schema = args[2];
    schema.sessionId = sessionIdSchema;
  }
  _toolDefs.set(name, args);
  if (_enabledTools.has(name)) {
    _applyToolDef(server, args);
  }
});
function _enableToolset(setName) {
  const tools = TOOLSETS[setName];
  if (!tools) return [];
  const added = [];
  for (const toolName of tools) {
    if (!_enabledTools.has(toolName)) {
      _enabledTools.add(toolName);
      const def = _toolDefs.get(toolName);
      if (def) {
        _applyToolDef(server, def);
        added.push(toolName);
      }
    }
  }
  _enabledSets.add(setName);
  return added;
}
_registerTool(
  "flyTo",
  "\u98DE\u884C\u5230\u6307\u5B9A\u7ECF\u7EAC\u5EA6\u4F4D\u7F6E\uFF08\u5E26\u52A8\u753B\u8FC7\u6E21\uFF09",
  {
    longitude: z2.number().describe("\u7ECF\u5EA6\uFF08-180 ~ 180\uFF09"),
    latitude: z2.number().describe("\u7EAC\u5EA6\uFF08-90 ~ 90\uFF09"),
    height: z2.number().default(5e4).describe("\u76F8\u673A\u9AD8\u5EA6\uFF08\u7C73\uFF09\uFF0C\u9ED8\u8BA4 50000"),
    heading: z2.number().default(0).describe("\u822A\u5411\u89D2\uFF08\u5EA6\uFF09\uFF0C0 \u4E3A\u6B63\u5317"),
    pitch: z2.number().default(-45).describe("\u4FEF\u4EF0\u89D2\uFF08\u5EA6\uFF09\uFF0C-90 \u4E3A\u6B63\u4E0B\u65B9"),
    duration: z2.number().default(2).describe("\u98DE\u884C\u52A8\u753B\u65F6\u957F\uFF08\u79D2\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Fly To Location" },
  async (params) => {
    const result = await sendToBrowser("flyTo", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addGeoJsonLayer",
  "\u6DFB\u52A0 GeoJSON \u56FE\u5C42\u5230\u5730\u56FE\uFF08\u652F\u6301 Point/Line/Polygon\uFF0C\u53EF\u914D\u7F6E\u989C\u8272/\u5206\u7EA7/\u5206\u7C7B\u6E32\u67D3\uFF09\u3002data \u548C url \u4E8C\u9009\u4E00",
  {
    id: z2.string().optional().describe("\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u81EA\u52A8\u751F\u6210\uFF09"),
    name: z2.string().optional().describe("\u56FE\u5C42\u663E\u793A\u540D\u79F0"),
    data: z2.record(z2.unknown()).optional().describe("GeoJSON FeatureCollection \u5BF9\u8C61\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09"),
    url: z2.string().optional().describe("GeoJSON \u6587\u4EF6 URL\uFF08\u4E0E data \u4E8C\u9009\u4E00\uFF0C\u6D4F\u89C8\u5668\u7AEF fetch \u52A0\u8F7D\uFF09"),
    style: z2.record(z2.unknown()).optional().describe("\u6837\u5F0F\u914D\u7F6E\uFF08color, opacity, pointSize, choropleth, category\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add GeoJSON Layer" },
  async (params) => {
    const result = await sendToBrowser("addGeoJsonLayer", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addGeoJsonPrimitive",
  "\u9AD8\u6027\u80FD\u52A0\u8F7D\u5927\u89C4\u6A21 GeoJSON \u6570\u636E\uFF0810\u4E07+ \u8981\u7D20\uFF09\u3002\u7ED5\u8FC7 Entity \u7CFB\u7EDF\uFF0C\u76F4\u63A5\u4F7F\u7528 Primitive \u6E32\u67D3\uFF0C\u9002\u5408\u6D77\u91CF\u6570\u636E\u53EF\u89C6\u5316\u3002data \u548C url \u4E8C\u9009\u4E00",
  {
    id: z2.string().optional().describe("\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u81EA\u52A8\u751F\u6210\uFF09"),
    name: z2.string().optional().describe("\u56FE\u5C42\u663E\u793A\u540D\u79F0"),
    data: z2.any().optional().describe("GeoJSON \u5BF9\u8C61\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09"),
    url: z2.string().optional().describe("GeoJSON \u6587\u4EF6 URL\uFF08\u4E0E data \u4E8C\u9009\u4E00\uFF09"),
    allowPicking: z2.boolean().optional().describe("\u662F\u5426\u5141\u8BB8\u62FE\u53D6\uFF08\u9ED8\u8BA4 true\uFF0C\u5173\u95ED\u53EF\u63D0\u5347\u6027\u80FD\uFF09"),
    show: z2.boolean().optional().describe("\u662F\u5426\u663E\u793A\uFF08\u9ED8\u8BA4 true\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add GeoJSON Primitive" },
  async (params) => {
    const result = await sendToBrowser("addGeoJsonPrimitive", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addLabel",
  "\u4E3A GeoJSON \u8981\u7D20\u6DFB\u52A0\u6587\u672C\u6807\u6CE8\uFF08\u663E\u793A\u5C5E\u6027\u503C\uFF09",
  {
    data: z2.record(z2.unknown()).describe("GeoJSON FeatureCollection \u5BF9\u8C61"),
    field: z2.string().describe('\u7528\u4F5C\u6807\u6CE8\u6587\u672C\u7684\u5C5E\u6027\u5B57\u6BB5\u540D\uFF08\u5982 "name"\u3001"population"\uFF09'),
    style: z2.record(z2.unknown()).optional().describe("\u6807\u6CE8\u6837\u5F0F\uFF08font, fillColor, outlineColor, scale \u7B49\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Label" },
  async (params) => {
    const result = await sendToBrowser("addLabel", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addHeatmap",
  "\u6DFB\u52A0\u70ED\u529B\u56FE\u56FE\u5C42\uFF08\u57FA\u4E8E GeoJSON \u70B9\u6570\u636E\u751F\u6210\u70ED\u529B\u53EF\u89C6\u5316\uFF0C\u8D34\u56FE\u5230\u5730\u9762\uFF09",
  {
    data: z2.record(z2.unknown()).describe("GeoJSON Point FeatureCollection"),
    radius: z2.number().default(30).describe("\u70ED\u529B\u5F71\u54CD\u534A\u5F84\uFF08\u50CF\u7D20\uFF09"),
    blur: z2.number().default(0.85).describe("\u70ED\u529B\u6A21\u7CCA\u7A0B\u5EA6 0-1"),
    maxOpacity: z2.number().default(0.8).describe("\u6700\u5927\u4E0D\u900F\u660E\u5EA6 0-1"),
    resolution: z2.number().default(512).describe("\u70ED\u529B\u56FE\u5206\u8FA8\u7387\uFF08\u50CF\u7D20\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Heatmap" },
  async (params) => {
    const result = await sendToBrowser("addHeatmap", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "removeLayer",
  "\u4ECE\u5730\u56FE\u4E0A\u79FB\u9664\u6307\u5B9A\u56FE\u5C42\uFF08\u6309\u56FE\u5C42ID\uFF09",
  { id: z2.string().describe("\u8981\u79FB\u9664\u7684\u56FE\u5C42ID\uFF08\u53EF\u901A\u8FC7 listLayers \u83B7\u53D6\uFF09") },
  { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: "Remove Layer" },
  async (params) => {
    const result = await sendToBrowser("removeLayer", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "clearAll",
  "\u6E05\u9664\u5730\u56FE\u4E0A\u7684\u6240\u6709\u56FE\u5C42\u3001\u5B9E\u4F53\u3001\u52A8\u753B\u548C\u8F68\u8FF9\uFF08\u4E00\u952E\u91CD\u7F6E\u573A\u666F\uFF09",
  {},
  { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: "Clear All" },
  async () => {
    const result = await sendToBrowser("clearAll", {});
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setBasemap",
  "\u5207\u6362\u5E95\u56FE\u98CE\u683C",
  {
    basemap: z2.enum(["dark", "satellite", "standard", "osm", "arcgis", "light", "tianditu_vec", "tianditu_img", "amap", "amap_satellite"]).describe("\u5E95\u56FE\u7C7B\u578B\uFF1Adark=\u6697\u8272, satellite=\u536B\u661F\u5F71\u50CF, standard=\u6807\u51C6, osm=OpenStreetMap, arcgis=ArcGIS\u8857\u9053, light=\u6D45\u8272, tianditu_vec=\u5929\u5730\u56FE\u77E2\u91CF, tianditu_img=\u5929\u5730\u56FE\u5F71\u50CF, amap=\u9AD8\u5FB7\u5730\u56FE, amap_satellite=\u9AD8\u5FB7\u536B\u661F"),
    token: z2.string().optional().describe("\u5E95\u56FE\u670D\u52A1\u4EE4\u724C\uFF08\u5929\u5730\u56FE\u7B49\u9700\u8981\u8BA4\u8BC1\u7684\u670D\u52A1\u5FC5\u586B\uFF09"),
    url: z2.string().optional().describe("\u81EA\u5B9A\u4E49URL\u6A21\u677F\uFF08{x},{y},{z}\u5360\u4F4D\u7B26\uFF09\uFF0C\u63D0\u4F9B\u65F6\u5FFD\u7565basemap\u53C2\u6570")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Basemap" },
  async (params) => {
    const result = await sendToBrowser("setBasemap", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "screenshot",
  "\u622A\u53D6\u5F53\u524D\u5730\u56FE\u89C6\u56FE\uFF08\u8FD4\u56DE base64 PNG\uFF09",
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Screenshot" },
  async () => {
    const result = await sendToBrowser("screenshot", {});
    const data = result;
    if (data?.dataUrl) {
      return { content: [{ type: "image", data: data.dataUrl.replace(/^data:image\/\w+;base64,/, ""), mimeType: "image/png" }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "highlight",
  "\u9AD8\u4EAE\u6307\u5B9A\u56FE\u5C42\u7684\u8981\u7D20\uFF08\u652F\u6301\u6E05\u9664\u6062\u590D\u539F\u59CB\u6837\u5F0F\uFF09",
  {
    layerId: z2.string().optional().describe("\u56FE\u5C42ID\uFF08\u6E05\u9664\u6240\u6709\u9AD8\u4EAE\u65F6\u53EF\u4E0D\u4F20\uFF09"),
    featureIndex: z2.number().optional().describe("\u8981\u7D20\u7D22\u5F15\uFF08\u4E0D\u4F20\u5219\u9AD8\u4EAE/\u6E05\u9664\u5168\u90E8\uFF09"),
    color: z2.string().default("#FFFF00").describe("\u9AD8\u4EAE\u989C\u8272\uFF08CSS \u683C\u5F0F\uFF09"),
    clear: z2.boolean().optional().describe("\u4F20 true \u6E05\u9664\u9AD8\u4EAE\u3001\u6062\u590D\u539F\u59CB\u6837\u5F0F")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Highlight" },
  async (params) => {
    const result = await sendToBrowser("highlight", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "measure",
  "\u6D4B\u91CF\u8DDD\u79BB\u6216\u9762\u79EF\uFF08\u57FA\u4E8E\u5750\u6807\u8BA1\u7B97\uFF0C\u53EF\u5728\u5730\u56FE\u4E0A\u663E\u793A\uFF09",
  {
    mode: z2.enum(["distance", "area"]).describe("\u6D4B\u91CF\u6A21\u5F0F\uFF1Adistance=\u8DDD\u79BB, area=\u9762\u79EF"),
    positions: z2.array(z2.array(z2.number()).min(2).max(3)).min(2).describe("\u5750\u6807\u6570\u7EC4 [[lon,lat,alt?], ...]"),
    showOnMap: z2.boolean().optional().default(true).describe("\u662F\u5426\u5728\u5730\u56FE\u4E0A\u663E\u793A\u6D4B\u91CF\u7ED3\u679C"),
    id: z2.string().optional().describe("\u81EA\u5B9A\u4E49\u6D4B\u91CF\u5B9E\u4F53ID")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Measure" },
  async (params) => {
    const result = await sendToBrowser("measure", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setView",
  "\u77AC\u95F4\u5207\u6362\u5230\u6307\u5B9A\u7ECF\u7EAC\u5EA6\u89C6\u89D2\uFF08\u65E0\u52A8\u753B\uFF09",
  {
    longitude: z2.number().describe("\u7ECF\u5EA6\uFF08-180 ~ 180\uFF09"),
    latitude: z2.number().describe("\u7EAC\u5EA6\uFF08-90 ~ 90\uFF09"),
    height: z2.number().optional().default(5e4).describe("\u9AD8\u5EA6\uFF08\u7C73\uFF09"),
    heading: z2.number().optional().default(0).describe("\u822A\u5411\u89D2\uFF08\u5EA6\uFF09"),
    pitch: z2.number().optional().default(-90).describe("\u4FEF\u4EF0\u89D2\uFF08\u5EA6\uFF09"),
    roll: z2.number().optional().default(0).describe("\u7FFB\u6EDA\u89D2\uFF08\u5EA6\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set View" },
  async (params) => {
    const result = await sendToBrowser("setView", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "getView",
  "\u83B7\u53D6\u5F53\u524D\u76F8\u673A\u89C6\u89D2\u4FE1\u606F\uFF08\u7ECF\u7EAC\u5EA6\u3001\u9AD8\u5EA6\u3001\u89D2\u5EA6\uFF09",
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Get View" },
  async () => {
    const result = await sendToBrowser("getView", {});
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);
_registerTool(
  "zoomToExtent",
  "\u7F29\u653E\u5230\u6307\u5B9A\u5730\u7406\u8303\u56F4",
  {
    west: z2.number().describe("\u897F\u8FB9\u754C\u7ECF\u5EA6\uFF08\u5EA6\uFF09"),
    south: z2.number().describe("\u5357\u8FB9\u754C\u7EAC\u5EA6\uFF08\u5EA6\uFF09"),
    east: z2.number().describe("\u4E1C\u8FB9\u754C\u7ECF\u5EA6\uFF08\u5EA6\uFF09"),
    north: z2.number().describe("\u5317\u8FB9\u754C\u7EAC\u5EA6\uFF08\u5EA6\uFF09"),
    duration: z2.number().optional().default(2).describe("\u52A8\u753B\u65F6\u957F\uFF08\u79D2\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Zoom to Extent" },
  async (params) => {
    const result = await sendToBrowser("zoomToExtent", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addMarker",
  "\u5728\u6307\u5B9A\u7ECF\u7EAC\u5EA6\u6DFB\u52A0\u6807\u6CE8\u70B9\uFF0C\u8FD4\u56DE layerId \u4F9B\u540E\u7EED\u64CD\u4F5C",
  {
    longitude: z2.number().describe("\u7ECF\u5EA6\uFF08-180 ~ 180\uFF09"),
    latitude: z2.number().describe("\u7EAC\u5EA6\uFF08-90 ~ 90\uFF09"),
    label: z2.string().optional().describe("\u6807\u6CE8\u6587\u672C"),
    color: z2.string().optional().default("#3B82F6").describe("\u6807\u6CE8\u989C\u8272\uFF08CSS \u683C\u5F0F\uFF09"),
    size: z2.number().optional().default(12).describe("\u70B9\u5927\u5C0F\uFF08\u50CF\u7D20\uFF09"),
    id: z2.string().optional().describe("\u81EA\u5B9A\u4E49\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u81EA\u52A8\u751F\u6210\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Marker" },
  async (params) => {
    const result = await sendToBrowser("addMarker", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addPolyline",
  "\u5728\u5730\u56FE\u4E0A\u6DFB\u52A0\u6298\u7EBF\uFF08\u8DEF\u5F84\u3001\u7EBF\u6BB5\uFF09\uFF0C\u8FD4\u56DE entityId",
  {
    coordinates: z2.array(z2.array(z2.number())).describe("\u6298\u7EBF\u5750\u6807\u6570\u7EC4 [[lon, lat, height?], ...]"),
    color: z2.string().optional().default("#3B82F6").describe("\u7EBF\u6761\u989C\u8272\uFF08CSS \u683C\u5F0F\uFF09"),
    width: z2.number().optional().default(3).describe("\u7EBF\u6761\u5BBD\u5EA6\uFF08\u50CF\u7D20\uFF09"),
    clampToGround: z2.boolean().optional().default(true).describe("\u662F\u5426\u8D34\u5730"),
    label: z2.string().optional().describe("\u6298\u7EBF\u6807\u6CE8\u6587\u672C")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Polyline" },
  async (params) => {
    const result = await sendToBrowser("addPolyline", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addPolygon",
  "\u5728\u5730\u56FE\u4E0A\u6DFB\u52A0\u591A\u8FB9\u5F62\u533A\u57DF\uFF08\u9762\u79EF\u3001\u8FB9\u754C\uFF09\uFF0C\u8FD4\u56DE entityId",
  {
    coordinates: z2.array(z2.array(z2.number())).describe("\u591A\u8FB9\u5F62\u5916\u73AF\u5750\u6807 [[lon, lat, height?], ...]"),
    color: z2.string().optional().default("#3B82F6").describe("\u586B\u5145\u989C\u8272\uFF08CSS \u683C\u5F0F\uFF09"),
    outlineColor: z2.string().optional().default("#FFFFFF").describe("\u63CF\u8FB9\u989C\u8272"),
    opacity: z2.number().optional().default(0.6).describe("\u586B\u5145\u900F\u660E\u5EA6\uFF080~1\uFF09"),
    extrudedHeight: z2.number().optional().describe("\u62C9\u4F38\u9AD8\u5EA6\uFF08\u7C73\uFF09\uFF0C\u53EF\u7528\u4E8E\u521B\u5EFA\u7ACB\u4F53\u6548\u679C"),
    clampToGround: z2.boolean().optional().default(true).describe("\u662F\u5426\u8D34\u5730"),
    label: z2.string().optional().describe("\u591A\u8FB9\u5F62\u6807\u6CE8\u6587\u672C")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Polygon" },
  async (params) => {
    const result = await sendToBrowser("addPolygon", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addModel",
  "\u5728\u6307\u5B9A\u7ECF\u7EAC\u5EA6\u653E\u7F6E 3D \u6A21\u578B\uFF08glTF/GLB\uFF09\uFF0C\u8FD4\u56DE entityId",
  {
    longitude: z2.number().describe("\u7ECF\u5EA6\uFF08-180 ~ 180\uFF09"),
    latitude: z2.number().describe("\u7EAC\u5EA6\uFF08-90 ~ 90\uFF09"),
    height: z2.number().optional().default(0).describe("\u653E\u7F6E\u9AD8\u5EA6\uFF08\u7C73\uFF09"),
    url: z2.string().describe("glTF/GLB \u6A21\u578B\u6587\u4EF6 URL"),
    scale: z2.number().optional().default(1).describe("\u6A21\u578B\u7F29\u653E\u6BD4\u4F8B"),
    heading: z2.number().optional().default(0).describe("\u822A\u5411\u89D2\uFF08\u5EA6\uFF09\uFF0C0=\u6B63\u5317"),
    pitch: z2.number().optional().default(0).describe("\u4FEF\u4EF0\u89D2\uFF08\u5EA6\uFF09"),
    roll: z2.number().optional().default(0).describe("\u7FFB\u6EDA\u89D2\uFF08\u5EA6\uFF09"),
    label: z2.string().optional().describe("\u6A21\u578B\u6807\u6CE8\u6587\u672C")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Model" },
  async (params) => {
    const result = await sendToBrowser("addModel", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "updateEntity",
  "\u66F4\u65B0\u5DF2\u6709\u5B9E\u4F53\u7684\u5C5E\u6027\uFF08\u4F4D\u7F6E\u3001\u989C\u8272\u3001\u6807\u7B7E\u3001\u7F29\u653E\u3001\u53EF\u89C1\u6027\uFF09",
  {
    entityId: z2.string().describe("\u5B9E\u4F53ID\uFF08addMarker/addPolyline \u7B49\u8FD4\u56DE\u7684 entityId\uFF09"),
    position: z2.object({
      longitude: z2.number().describe("\u7ECF\u5EA6\uFF08-180 ~ 180\uFF09"),
      latitude: z2.number().describe("\u7EAC\u5EA6\uFF08-90 ~ 90\uFF09"),
      height: z2.number().optional().describe("\u9AD8\u5EA6\uFF08\u7C73\uFF09")
    }).optional().describe("\u65B0\u4F4D\u7F6E\u5750\u6807"),
    label: z2.string().optional().describe("\u65B0\u6807\u6CE8\u6587\u672C"),
    color: z2.string().optional().describe("\u65B0\u989C\u8272\uFF08CSS \u683C\u5F0F\uFF09"),
    scale: z2.number().optional().describe("\u65B0\u7F29\u653E\u6BD4\u4F8B"),
    show: z2.boolean().optional().describe("\u662F\u5426\u663E\u793A")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Update Entity" },
  async (params) => {
    const result = await sendToBrowser("updateEntity", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "removeEntity",
  "\u79FB\u9664\u5355\u4E2A\u5B9E\u4F53\uFF08\u901A\u8FC7 entityId\uFF09",
  {
    entityId: z2.string().describe("\u8981\u79FB\u9664\u7684\u5B9E\u4F53ID")
  },
  { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: "Remove Entity" },
  async (params) => {
    const result = await sendToBrowser("removeEntity", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "batchAddEntities",
  "\u6279\u91CF\u6DFB\u52A0\u591A\u4E2A\u5B9E\u4F53\uFF08\u4E00\u6B21\u8C03\u7528\u521B\u5EFA\u591A\u4E2A marker/polyline/polygon/model \u7B49\uFF09\uFF0C\u8FD4\u56DE\u6240\u6709 entityId",
  {
    entities: z2.array(z2.object({
      type: z2.enum(["marker", "polyline", "polygon", "model", "billboard", "box", "cylinder", "ellipse", "rectangle", "wall", "corridor"]).describe("\u5B9E\u4F53\u7C7B\u578B")
    }).passthrough()).describe("\u5B9E\u4F53\u5B9A\u4E49\u6570\u7EC4\uFF0C\u6BCF\u4E2A\u5143\u7D20\u5305\u542B type \u5B57\u6BB5\u548C\u8BE5\u7C7B\u578B\u6240\u9700\u7684\u53C2\u6570")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Batch Add Entities" },
  async (params) => {
    const result = await sendToBrowser("batchAddEntities", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "queryEntities",
  "\u67E5\u8BE2\u5DF2\u6709\u5B9E\u4F53 \u2014 \u6309\u540D\u79F0\u3001\u7C7B\u578B\u3001\u7A7A\u95F4\u8303\u56F4\u8FC7\u6EE4\uFF0C\u8FD4\u56DE entityId/name/type/position \u5217\u8868",
  {
    name: z2.string().optional().describe("\u540D\u79F0\u6A21\u7CCA\u5339\u914D\uFF08\u4E0D\u533A\u5206\u5927\u5C0F\u5199\uFF09"),
    type: z2.enum(["marker", "polyline", "polygon", "model", "billboard", "box", "cylinder", "ellipse", "rectangle", "wall", "corridor", "label", "unknown"]).optional().describe("\u6309\u5B9E\u4F53\u7C7B\u578B\u8FC7\u6EE4"),
    bbox: z2.array(z2.number()).length(4).optional().describe("\u7A7A\u95F4\u8303\u56F4\u8FC7\u6EE4 [west, south, east, north]\uFF08\u5EA6\uFF09")
  },
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Query Entities" },
  async (params) => {
    const result = await sendToBrowser("queryEntities", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "getEntityProperties",
  "\u83B7\u53D6\u6307\u5B9A\u5B9E\u4F53\u7684\u8BE6\u7EC6\u5C5E\u6027 \u2014 \u5305\u62EC\u7C7B\u578B\u3001\u4F4D\u7F6E\u3001\u81EA\u5B9A\u4E49\u5C5E\u6027\u548C\u56FE\u5F62\u5C5E\u6027",
  {
    entityId: z2.string().describe("\u5B9E\u4F53ID\uFF08\u53EF\u901A\u8FC7 queryEntities \u83B7\u53D6\uFF09")
  },
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Get Entity Properties" },
  async (params) => {
    const result = await sendToBrowser("getEntityProperties", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "saveViewpoint",
  "\u4FDD\u5B58\u5F53\u524D\u89C6\u89D2\u4E3A\u4E66\u7B7E\uFF08\u540D\u79F0 \u2192 \u89C6\u89D2\u72B6\u6001\uFF09\uFF0C\u53EF\u901A\u8FC7 loadViewpoint \u6062\u590D",
  {
    name: z2.string().describe("\u4E66\u7B7E\u540D\u79F0\uFF08\u552F\u4E00\u6807\u8BC6\uFF0C\u91CD\u590D\u5219\u8986\u76D6\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Save Viewpoint" },
  async (params) => {
    const result = await sendToBrowser("saveViewpoint", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "loadViewpoint",
  "\u6062\u590D\u5DF2\u4FDD\u5B58\u7684\u89C6\u89D2\u4E66\u7B7E\uFF08\u5E26\u98DE\u884C\u52A8\u753B\uFF09\uFF0C\u8FD4\u56DE\u4FDD\u5B58\u7684\u89C6\u89D2\u72B6\u6001",
  {
    name: z2.string().describe("\u4E66\u7B7E\u540D\u79F0"),
    duration: z2.number().optional().default(2).describe("\u98DE\u884C\u52A8\u753B\u65F6\u957F\uFF08\u79D2\uFF09\uFF0C0 \u8868\u793A\u77AC\u79FB")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Load Viewpoint" },
  async (params) => {
    const result = await sendToBrowser("loadViewpoint", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "listViewpoints",
  "\u5217\u51FA\u6240\u6709\u5DF2\u4FDD\u5B58\u7684\u89C6\u89D2\u4E66\u7B7E",
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Viewpoints" },
  async () => {
    const result = await sendToBrowser("listViewpoints", {});
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "exportScene",
  "\u5BFC\u51FA\u5F53\u524D\u573A\u666F\u5FEB\u7167 \u2014 \u5305\u542B\u89C6\u89D2\u3001\u56FE\u5C42\u5217\u8868\u3001\u5B9E\u4F53\u5217\u8868\u548C\u65F6\u95F4\u6233",
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Export Scene" },
  async () => {
    const result = await sendToBrowser("exportScene", {});
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setLayerVisibility",
  "\u8BBE\u7F6E\u56FE\u5C42\u53EF\u89C1\u6027",
  {
    id: z2.string().describe("\u56FE\u5C42ID"),
    visible: z2.boolean().describe("\u662F\u5426\u53EF\u89C1")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Layer Visibility" },
  async (params) => {
    const result = await sendToBrowser("setLayerVisibility", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "listLayers",
  "\u83B7\u53D6\u5F53\u524D\u6240\u6709\u56FE\u5C42\u5217\u8868\uFF08\u542B ID\u3001\u540D\u79F0\u3001\u7C7B\u578B\u3001\u53EF\u89C1\u6027\uFF09",
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Layers" },
  async () => {
    const result = await sendToBrowser("listLayers", {});
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);
_registerTool(
  "getLayerSchema",
  "\u83B7\u53D6\u56FE\u5C42\u7684\u5C5E\u6027\u5B57\u6BB5\u7ED3\u6784 \u2014 \u8FD4\u56DE\u5B57\u6BB5\u540D\u3001\u7C7B\u578B\u3001\u793A\u4F8B\u503C\uFF0C\u9002\u7528\u4E8E GeoJSON/CZML/KML/3D Tiles \u56FE\u5C42",
  {
    layerId: z2.string().describe("\u56FE\u5C42ID\uFF08\u53EF\u901A\u8FC7 listLayers \u83B7\u53D6\uFF09")
  },
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Get Layer Schema" },
  async (params) => {
    const result = await sendToBrowser("getLayerSchema", params);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);
var choroplethStyleSchema = z2.object({
  field: z2.string().min(1).describe("Property field used for choropleth classification"),
  breaks: z2.array(z2.number()).min(2).describe("Ascending class break values; colors length must be breaks length minus one"),
  colors: z2.array(z2.string()).min(1).describe("CSS colors for each choropleth interval")
}).superRefine((value, ctx) => {
  if (value.colors.length !== value.breaks.length - 1) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      path: ["colors"],
      message: "colors length must equal breaks length minus one"
    });
  }
  for (let i = 1; i < value.breaks.length; i++) {
    if (value.breaks[i] <= value.breaks[i - 1]) {
      ctx.addIssue({
        code: z2.ZodIssueCode.custom,
        path: ["breaks", i],
        message: "breaks must be strictly ascending"
      });
    }
  }
});
var categoryStyleSchema = z2.object({
  field: z2.string().min(1).describe("Property field used for category styling"),
  colors: z2.array(z2.string()).min(1).optional().describe("Optional CSS color palette")
});
var layerStyleSchema = z2.object({
  color: z2.string().optional().describe("CSS color for entity layer features"),
  opacity: z2.number().min(0).max(1).optional().describe("Opacity in range 0-1"),
  strokeWidth: z2.number().min(0).optional().describe("Polyline or polygon outline width"),
  pointSize: z2.number().min(0).optional().describe("Point or billboard size"),
  randomColor: z2.boolean().optional().describe("Apply random colors to original GeoJSON entities"),
  gradient: z2.tuple([z2.string(), z2.string()]).optional().describe("Two CSS colors used as index gradient"),
  choropleth: choroplethStyleSchema.optional().describe("GeoJSON choropleth style"),
  category: categoryStyleSchema.optional().describe("GeoJSON category style")
}).superRefine((value, ctx) => {
  const enabled = [
    value.choropleth !== void 0,
    value.category !== void 0,
    value.randomColor === true,
    value.gradient !== void 0
  ].filter(Boolean).length;
  if (enabled > 1) {
    ctx.addIssue({
      code: z2.ZodIssueCode.custom,
      message: "Only one thematic style is allowed: choropleth, category, randomColor, or gradient"
    });
  }
});
var imageryStyleSchema = z2.object({
  alpha: z2.number().min(0).max(1).optional().describe("Imagery alpha in range 0-1"),
  brightness: z2.number().optional().describe("Imagery brightness multiplier"),
  contrast: z2.number().optional().describe("Imagery contrast multiplier"),
  hue: z2.number().optional().describe("Imagery hue shift in radians"),
  saturation: z2.number().optional().describe("Imagery saturation multiplier"),
  gamma: z2.number().optional().describe("Imagery gamma correction")
}).refine((value) => Object.values(value).some((v) => v !== void 0), {
  message: "At least one imagery style field is required"
});
var primitiveStyleSchema = z2.object({
  color: z2.string().optional().describe("CSS fill color for GeoJSON Primitive materials"),
  opacity: z2.number().min(0).max(1).optional().describe("Fill alpha in range 0-1"),
  outlineColor: z2.string().optional().describe("CSS outline color for GeoJSON Primitive materials"),
  outlineWidth: z2.number().min(0).max(255).optional().describe("Outline width in range 0-255"),
  pointSize: z2.number().min(0).max(255).optional().describe("Point size in range 0-255"),
  lineWidth: z2.number().min(0).max(255).optional().describe("Polyline width in range 0-255")
}).refine((value) => Object.values(value).some((v) => v !== void 0), {
  message: "At least one primitive style field is required"
});
_registerTool(
  "updateLayerStyle",
  "\u4FEE\u6539\u5DF2\u6709\u56FE\u5C42\u7684\u6837\u5F0F\uFF08\u989C\u8272\u3001\u900F\u660E\u5EA6\u3001\u6807\u6CE8\u6837\u5F0F\u30013D Tiles \u6837\u5F0F\u7B49\uFF09",
  {
    layerId: z2.string().describe("\u56FE\u5C42ID"),
    labelStyle: z2.record(z2.unknown()).optional().describe("\u6807\u6CE8\u6837\u5F0F\uFF08font, fillColor, outlineColor, outlineWidth, scale \u7B49\uFF09"),
    layerStyle: layerStyleSchema.optional().describe("Entity layer style. Thematic fields are GeoJSON-only and mutually exclusive."),
    imageryStyle: imageryStyleSchema.optional().describe("Imagery layer visual style. Visibility is controlled by setLayerVisibility."),
    primitiveStyle: primitiveStyleSchema.optional().describe("GeoJSON Primitive material style. Visibility is controlled by setLayerVisibility."),
    tileStyle: z2.object({
      color: z2.string().optional().describe(`3D Tiles \u989C\u8272\u8868\u8FBE\u5F0F\uFF0C\u5982 "color('red')" \u6216\u6761\u4EF6\u8868\u8FBE\u5F0F`),
      show: z2.string().optional().describe('3D Tiles \u663E\u793A\u6761\u4EF6\u8868\u8FBE\u5F0F\uFF0C\u5982 "${Height} > 50"'),
      pointSize: z2.string().optional().describe("3D Tiles \u70B9\u5927\u5C0F\u8868\u8FBE\u5F0F"),
      meta: z2.record(z2.string()).optional().describe("3D Tiles meta \u5C5E\u6027")
    }).optional().describe("3D Tiles \u6837\u5F0F\uFF08Cesium3DTileStyle \u8868\u8FBE\u5F0F\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Update Layer Style" },
  async (params) => {
    const result = await sendToBrowser("updateLayerStyle", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "playTrajectory",
  "\u64AD\u653E\u79FB\u52A8\u8F68\u8FF9\u52A8\u753B",
  {
    id: z2.string().optional().describe("\u8F68\u8FF9\u56FE\u5C42ID"),
    name: z2.string().optional().describe("\u8F68\u8FF9\u540D\u79F0"),
    coordinates: z2.array(z2.array(z2.number())).describe("\u8F68\u8FF9\u5750\u6807\u6570\u7EC4 [[lon, lat, alt?], ...]"),
    durationSeconds: z2.number().optional().default(10).describe("\u52A8\u753B\u65F6\u957F\uFF08\u79D2\uFF09"),
    trailSeconds: z2.number().optional().default(2).describe("\u5C3E\u8FF9\u957F\u5EA6\uFF08\u79D2\uFF09"),
    label: z2.string().optional().describe("\u79FB\u52A8\u4F53\u6807\u7B7E")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Play Trajectory" },
  async (params) => {
    const result = await sendToBrowser("playTrajectory", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "load3dTiles",
  "\u52A0\u8F7D 3D Tiles \u6570\u636E\u96C6\uFF08\u652F\u6301 URL \u6216 Cesium Ion \u8D44\u4EA7 ID\uFF09",
  {
    id: z2.string().optional().describe("\u56FE\u5C42ID"),
    name: z2.string().optional().describe("\u56FE\u5C42\u540D\u79F0"),
    url: z2.string().optional().describe("tileset.json \u7684 URL\uFF08\u4E0E ionAssetId \u4E8C\u9009\u4E00\uFF09"),
    ionAssetId: z2.number().optional().describe("Cesium Ion \u8D44\u4EA7 ID\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09"),
    maximumScreenSpaceError: z2.number().optional().default(16).describe("\u6700\u5927\u5C4F\u5E55\u7A7A\u95F4\u8BEF\u5DEE\uFF08\u503C\u8D8A\u5C0F\u8D8A\u7CBE\u7EC6\uFF09"),
    heightOffset: z2.number().optional().describe("\u9AD8\u5EA6\u504F\u79FB\uFF08\u7C73\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Load 3D Tiles" },
  async (params) => {
    const result = await sendToBrowser("load3dTiles", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "load3dGaussianSplat",
  "\u52A0\u8F7D 3D \u9AD8\u65AF\u6CFC\u6E85\uFF08Gaussian Splat\uFF09\u6570\u636E\u96C6",
  {
    id: z2.string().optional().describe("\u56FE\u5C42ID"),
    name: z2.string().optional().describe("\u56FE\u5C42\u540D\u79F0"),
    url: z2.string().describe("\u9AD8\u65AF\u6CFC\u6E85 tileset.json \u7684 URL"),
    maximumScreenSpaceError: z2.number().optional().default(16).describe("\u6700\u5927\u5C4F\u5E55\u7A7A\u95F4\u8BEF\u5DEE\uFF08\u503C\u8D8A\u5C0F\u8D8A\u7CBE\u7EC6\uFF09"),
    show: z2.boolean().optional().default(true).describe("\u662F\u5426\u663E\u793A")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Load 3D Gaussian Splat" },
  async (params) => {
    const result = await sendToBrowser("load3dGaussianSplat", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "loadTerrain",
  "\u52A0\u8F7D\u6216\u5207\u6362\u5730\u5F62\uFF08\u5E73\u5766/ArcGIS/CesiumIon/\u81EA\u5B9A\u4E49 URL\uFF09",
  {
    provider: z2.enum(["flat", "arcgis", "cesiumion"]).describe("\u5730\u5F62\u63D0\u4F9B\u8005\u7C7B\u578B"),
    url: z2.string().optional().describe("\u81EA\u5B9A\u4E49\u5730\u5F62\u670D\u52A1 URL"),
    cesiumIonAssetId: z2.number().optional().describe("Cesium Ion \u8D44\u4EA7ID\uFF08provider=cesiumion \u65F6\u9700\u8981\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Load Terrain" },
  async (params) => {
    const result = await sendToBrowser("loadTerrain", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "loadImageryService",
  "\u52A0\u8F7D\u5F71\u50CF\u670D\u52A1\u56FE\u5C42\uFF08WMS/WMTS/XYZ/ArcGIS MapServer/Cesium Ion\uFF09",
  {
    id: z2.string().optional().describe("\u56FE\u5C42ID"),
    name: z2.string().optional().describe("\u56FE\u5C42\u540D\u79F0"),
    url: z2.string().optional().describe("\u5F71\u50CF\u670D\u52A1 URL\uFF08\u4E0E ionAssetId \u4E8C\u9009\u4E00\uFF09"),
    ionAssetId: z2.number().optional().describe("Cesium Ion \u5F71\u50CF\u8D44\u4EA7 ID\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09"),
    serviceType: z2.enum(["wms", "wmts", "xyz", "arcgis_mapserver", "ion"]).optional().describe("\u670D\u52A1\u7C7B\u578B\uFF08\u4F7F\u7528 ionAssetId \u65F6\u53EF\u4E0D\u586B\uFF09"),
    layerName: z2.string().optional().describe("WMS/WMTS \u56FE\u5C42\u540D"),
    opacity: z2.number().optional().default(1).describe("\u900F\u660E\u5EA6\uFF080~1\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Load Imagery Service" },
  async (params) => {
    const result = await sendToBrowser("loadImageryService", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "loadCzml",
  "\u52A0\u8F7D CZML \u65F6\u5E8F\u6570\u636E\u6E90\uFF08CesiumJS \u539F\u751F\u683C\u5F0F\uFF0C\u652F\u6301\u65F6\u53D8\u4F4D\u7F6E/\u6837\u5F0F/\u52A8\u753B\uFF09\u3002data \u548C url \u4E8C\u9009\u4E00",
  {
    id: z2.string().optional().describe("\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u81EA\u52A8\u751F\u6210\uFF09"),
    name: z2.string().optional().describe("\u6570\u636E\u6E90\u663E\u793A\u540D\u79F0"),
    data: z2.array(z2.unknown()).optional().describe("CZML \u6570\u636E\u5305\u6570\u7EC4\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09"),
    url: z2.string().optional().describe("CZML \u6587\u4EF6 URL\uFF08\u4E0E data \u4E8C\u9009\u4E00\uFF0C\u6D4F\u89C8\u5668\u7AEF fetch \u52A0\u8F7D\uFF09"),
    sourceUri: z2.string().optional().describe("CZML \u4E2D\u76F8\u5BF9\u5F15\u7528\u7684\u57FA\u7840 URI"),
    clampToGround: z2.boolean().optional().describe("\u5C06\u5B9E\u4F53\u8D34\u5730\u663E\u793A"),
    flyTo: z2.boolean().optional().describe("\u52A0\u8F7D\u540E\u81EA\u52A8\u98DE\u884C\u5230\u6570\u636E\u8303\u56F4\uFF08\u9ED8\u8BA4 true\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Load CZML" },
  async (params) => {
    const result = await sendToBrowser("loadCzml", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "loadKml",
  "\u52A0\u8F7D KML/KMZ \u6570\u636E\u6E90\uFF08Google Earth \u683C\u5F0F\uFF09\u3002url \u548C data \u4E8C\u9009\u4E00",
  {
    id: z2.string().optional().describe("\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u81EA\u52A8\u751F\u6210\uFF09"),
    name: z2.string().optional().describe("\u6570\u636E\u6E90\u663E\u793A\u540D\u79F0"),
    url: z2.string().optional().describe("KML/KMZ \u6587\u4EF6 URL\uFF08\u4E0E data \u4E8C\u9009\u4E00\uFF0C\u6D4F\u89C8\u5668\u7AEF fetch \u52A0\u8F7D\uFF09"),
    data: z2.string().optional().describe("KML XML \u5B57\u7B26\u4E32\uFF08\u4E0E url \u4E8C\u9009\u4E00\uFF09"),
    sourceUri: z2.string().optional().describe("KML \u4E2D\u76F8\u5BF9\u5F15\u7528\u7684\u57FA\u7840 URI"),
    clampToGround: z2.boolean().optional().describe("\u5C06\u5B9E\u4F53\u8D34\u5730\u663E\u793A"),
    flyTo: z2.boolean().optional().describe("\u52A0\u8F7D\u540E\u81EA\u52A8\u98DE\u884C\u5230\u6570\u636E\u8303\u56F4\uFF08\u9ED8\u8BA4 true\uFF09")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Load KML/KMZ" },
  async (params) => {
    const result = await sendToBrowser("loadKml", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setEdgeDisplayMode",
  "\u8BBE\u7F6E 3D Tiles \u8FB9\u7F18\u663E\u793A\u6A21\u5F0F\uFF08\u4EC5\u8868\u9762 / \u8868\u9762+\u8FB9\u7F18 / \u4EC5\u8FB9\u7F18\u7EBF\u6846\uFF09",
  {
    tilesetId: z2.string().optional().describe("\u76EE\u6807\u56FE\u5C42ID\uFF08\u4E0D\u4F20\u5219\u5E94\u7528\u4E8E\u573A\u666F\u4E2D\u6240\u6709 3D Tiles\uFF09"),
    mode: z2.enum(["surfaces_only", "surfaces_and_edges", "edges_only"]).describe("\u8FB9\u7F18\u663E\u793A\u6A21\u5F0F\uFF1Asurfaces_only=\u4EC5\u8868\u9762, surfaces_and_edges=\u8868\u9762+\u8FB9\u7F18, edges_only=\u4EC5\u7EBF\u6846")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Edge Display Mode" },
  async (params) => {
    const result = await sendToBrowser("setEdgeDisplayMode", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "lookAtTransform",
  "Look at a specific position from a given heading/pitch/range (orbit-style camera)",
  {
    longitude: z2.number().describe("Target longitude (degrees)"),
    latitude: z2.number().describe("Target latitude (degrees)"),
    height: z2.number().optional().default(0).describe("Target height (meters)"),
    heading: z2.number().optional().default(0).describe("Camera heading (degrees), 0=North"),
    pitch: z2.number().optional().default(-45).describe("Camera pitch (degrees), -90=straight down"),
    range: z2.number().optional().default(1e3).describe("Distance from target (meters)")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Look At Transform" },
  async (params) => {
    const result = await sendToBrowser("lookAtTransform", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "startOrbit",
  "Start orbiting the camera around the current view center",
  {
    speed: z2.number().optional().default(5e-3).describe("Rotation speed (radians per tick)"),
    clockwise: z2.boolean().optional().default(true).describe("Orbit direction")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Start Orbit" },
  async (params) => {
    const result = await sendToBrowser("startOrbit", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "stopOrbit",
  "Stop the camera orbit animation",
  {},
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Stop Orbit" },
  async () => {
    const result = await sendToBrowser("stopOrbit", {});
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setCameraOptions",
  "Configure camera controller options (enable/disable rotation, zoom, tilt, etc.)",
  {
    enableRotate: z2.boolean().optional().describe("Enable camera rotation"),
    enableTranslate: z2.boolean().optional().describe("Enable camera translation"),
    enableZoom: z2.boolean().optional().describe("Enable camera zoom"),
    enableTilt: z2.boolean().optional().describe("Enable camera tilt"),
    enableLook: z2.boolean().optional().describe("Enable camera look"),
    minimumZoomDistance: z2.number().optional().describe("Minimum zoom distance (meters)"),
    maximumZoomDistance: z2.number().optional().describe("Maximum zoom distance (meters)"),
    enableInputs: z2.boolean().optional().describe("Enable/disable all camera inputs")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Camera Options" },
  async (params) => {
    const result = await sendToBrowser("setCameraOptions", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
var colorSchema = z2.union([
  z2.string().describe('CSS color string (e.g. "#FF0000", "red")'),
  z2.object({ red: z2.number().describe("Red channel (0-1)"), green: z2.number().describe("Green channel (0-1)"), blue: z2.number().describe("Blue channel (0-1)"), alpha: z2.number().optional().describe("Alpha channel (0-1)") }).describe("RGBA color object")
]).optional();
var materialSchema = z2.union([
  z2.string().describe("CSS color string"),
  z2.object({ red: z2.number().describe("Red (0-1)"), green: z2.number().describe("Green (0-1)"), blue: z2.number().describe("Blue (0-1)"), alpha: z2.number().optional().describe("Alpha (0-1)") }).describe("RGBA color"),
  z2.object({
    type: z2.enum(["color", "image", "checkerboard", "stripe", "grid"]).describe("Material type"),
    color: z2.union([z2.string(), z2.object({ red: z2.number().describe("Red (0-1)"), green: z2.number().describe("Green (0-1)"), blue: z2.number().describe("Blue (0-1)"), alpha: z2.number().optional().describe("Alpha (0-1)") })]).optional().describe("Base color"),
    image: z2.string().optional().describe("Image URL"),
    evenColor: z2.union([z2.string(), z2.object({ red: z2.number().describe("Red (0-1)"), green: z2.number().describe("Green (0-1)"), blue: z2.number().describe("Blue (0-1)"), alpha: z2.number().optional().describe("Alpha (0-1)") })]).optional().describe("Even color for checkerboard/stripe"),
    oddColor: z2.union([z2.string(), z2.object({ red: z2.number().describe("Red (0-1)"), green: z2.number().describe("Green (0-1)"), blue: z2.number().describe("Blue (0-1)"), alpha: z2.number().optional().describe("Alpha (0-1)") })]).optional().describe("Odd color for checkerboard/stripe"),
    orientation: z2.enum(["horizontal", "vertical"]).optional().describe("Stripe orientation"),
    cellAlpha: z2.number().optional().describe("Cell alpha for grid material")
  }).describe("Complex material specification")
]).optional();
var orientationSchema = z2.object({
  heading: z2.number().describe("Heading (degrees)"),
  pitch: z2.number().describe("Pitch (degrees)"),
  roll: z2.number().describe("Roll (degrees)")
}).optional();
var positionDegreesSchema = z2.object({
  longitude: z2.number().describe("Longitude (degrees)"),
  latitude: z2.number().describe("Latitude (degrees)"),
  height: z2.number().optional().describe("Height above ground (meters)")
});
_registerTool(
  "addBillboard",
  "Add a billboard (image icon) at a position on the globe",
  {
    longitude: z2.number().describe("Longitude (degrees)"),
    latitude: z2.number().describe("Latitude (degrees)"),
    height: z2.number().optional().default(0).describe("Height (meters)"),
    name: z2.string().optional().describe("Billboard name"),
    image: z2.string().describe("Image URL for the billboard"),
    scale: z2.number().optional().default(1).describe("Scale factor"),
    color: colorSchema.describe("Tint color"),
    pixelOffset: z2.object({ x: z2.number(), y: z2.number() }).optional().describe("Pixel offset from position"),
    horizontalOrigin: z2.enum(["CENTER", "LEFT", "RIGHT"]).optional().describe("Horizontal origin"),
    verticalOrigin: z2.enum(["CENTER", "TOP", "BOTTOM", "BASELINE"]).optional().describe("Vertical origin"),
    heightReference: z2.enum(["NONE", "CLAMP_TO_GROUND", "RELATIVE_TO_GROUND"]).optional().describe("Height reference")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Billboard" },
  async (params) => {
    const result = await sendToBrowser("addBillboard", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addBox",
  "Add a 3D box entity at a position",
  {
    longitude: z2.number().describe("Longitude (degrees)"),
    latitude: z2.number().describe("Latitude (degrees)"),
    height: z2.number().optional().default(0).describe("Height (meters)"),
    name: z2.string().optional().describe("Box name"),
    dimensions: z2.object({
      width: z2.number().describe("Width in meters (X)"),
      length: z2.number().describe("Length in meters (Y)"),
      height: z2.number().describe("Height in meters (Z)")
    }).describe("Box dimensions"),
    material: materialSchema.describe("Material (color string, RGBA object, or material spec)"),
    outline: z2.boolean().optional().default(true).describe("Show outline"),
    outlineColor: colorSchema.describe("Outline color"),
    fill: z2.boolean().optional().default(true).describe("Show fill"),
    orientation: orientationSchema.describe("Orientation (heading/pitch/roll in degrees)"),
    heightReference: z2.enum(["NONE", "CLAMP_TO_GROUND", "RELATIVE_TO_GROUND"]).optional().describe("Height reference")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Box" },
  async (params) => {
    const result = await sendToBrowser("addBox", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addCorridor",
  "Add a corridor (path with width) entity",
  {
    name: z2.string().optional().describe("Corridor name"),
    positions: z2.array(positionDegreesSchema).describe("Array of positions along the corridor"),
    width: z2.number().describe("Corridor width in meters"),
    material: materialSchema.describe("Material"),
    cornerType: z2.enum(["ROUNDED", "MITERED", "BEVELED"]).optional().describe("Corner type"),
    height: z2.number().optional().describe("Height above ground (meters)"),
    extrudedHeight: z2.number().optional().describe("Extruded height (meters)"),
    outline: z2.boolean().optional().describe("Show outline"),
    outlineColor: colorSchema.describe("Outline color")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Corridor" },
  async (params) => {
    const result = await sendToBrowser("addCorridor", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addCylinder",
  "Add a cylinder or cone entity at a position",
  {
    longitude: z2.number().describe("Longitude (degrees)"),
    latitude: z2.number().describe("Latitude (degrees)"),
    height: z2.number().optional().default(0).describe("Height (meters)"),
    name: z2.string().optional().describe("Cylinder name"),
    length: z2.number().describe("Cylinder length/height in meters"),
    topRadius: z2.number().describe("Top radius in meters"),
    bottomRadius: z2.number().describe("Bottom radius in meters"),
    material: materialSchema.describe("Material"),
    outline: z2.boolean().optional().default(true).describe("Show outline"),
    outlineColor: colorSchema.describe("Outline color"),
    fill: z2.boolean().optional().default(true).describe("Show fill"),
    orientation: orientationSchema.describe("Orientation (heading/pitch/roll in degrees)"),
    numberOfVerticalLines: z2.number().optional().default(16).describe("Number of vertical lines"),
    slices: z2.number().optional().default(128).describe("Number of slices")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Cylinder" },
  async (params) => {
    const result = await sendToBrowser("addCylinder", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addEllipse",
  "Add an ellipse (oval) entity at a position",
  {
    longitude: z2.number().describe("Center longitude (degrees)"),
    latitude: z2.number().describe("Center latitude (degrees)"),
    height: z2.number().optional().default(0).describe("Height (meters)"),
    name: z2.string().optional().describe("Ellipse name"),
    semiMajorAxis: z2.number().describe("Semi-major axis in meters"),
    semiMinorAxis: z2.number().describe("Semi-minor axis in meters"),
    material: materialSchema.describe("Material"),
    extrudedHeight: z2.number().optional().describe("Extruded height (meters)"),
    rotation: z2.number().optional().describe("Rotation (radians)"),
    outline: z2.boolean().optional().describe("Show outline"),
    outlineColor: colorSchema.describe("Outline color"),
    fill: z2.boolean().optional().default(true).describe("Show fill"),
    stRotation: z2.number().optional().describe("Texture rotation (radians)"),
    numberOfVerticalLines: z2.number().optional().describe("Number of vertical lines")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Ellipse" },
  async (params) => {
    const result = await sendToBrowser("addEllipse", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addRectangle",
  "Add a rectangle entity defined by geographic bounds",
  {
    name: z2.string().optional().describe("Rectangle name"),
    west: z2.number().describe("West longitude (degrees)"),
    south: z2.number().describe("South latitude (degrees)"),
    east: z2.number().describe("East longitude (degrees)"),
    north: z2.number().describe("North latitude (degrees)"),
    material: materialSchema.describe("Material"),
    height: z2.number().optional().describe("Height (meters)"),
    extrudedHeight: z2.number().optional().describe("Extruded height (meters)"),
    rotation: z2.number().optional().describe("Rotation (radians)"),
    outline: z2.boolean().optional().describe("Show outline"),
    outlineColor: colorSchema.describe("Outline color"),
    fill: z2.boolean().optional().default(true).describe("Show fill"),
    stRotation: z2.number().optional().describe("Texture rotation (radians)")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Rectangle" },
  async (params) => {
    const result = await sendToBrowser("addRectangle", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "addWall",
  "Add a wall entity along a series of positions",
  {
    name: z2.string().optional().describe("Wall name"),
    positions: z2.array(positionDegreesSchema).describe("Array of positions along the wall"),
    minimumHeights: z2.array(z2.number()).optional().describe("Minimum heights at each position"),
    maximumHeights: z2.array(z2.number()).optional().describe("Maximum heights at each position"),
    material: materialSchema.describe("Material"),
    outline: z2.boolean().optional().describe("Show outline"),
    outlineColor: colorSchema.describe("Outline color"),
    fill: z2.boolean().optional().default(true).describe("Show fill")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Add Wall" },
  async (params) => {
    const result = await sendToBrowser("addWall", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "createAnimation",
  "Create a time-based animation with waypoints (moving entity along a path)",
  {
    name: z2.string().optional().describe("Animation name"),
    waypoints: z2.array(z2.object({
      longitude: z2.number().describe("Longitude (degrees)"),
      latitude: z2.number().describe("Latitude (degrees)"),
      height: z2.number().optional().describe("Height (meters)"),
      time: z2.string().describe("ISO 8601 timestamp")
    })).describe("Array of waypoints with positions and timestamps"),
    modelUri: z2.string().optional().describe("glTF/GLB model URL, or preset: cesium_man, cesium_air, ground_vehicle, cesium_drone"),
    showPath: z2.boolean().optional().default(true).describe("Show trail path"),
    pathWidth: z2.number().optional().default(2).describe("Path width (pixels)"),
    pathColor: z2.string().optional().default("#00FF00").describe("Path color (CSS)"),
    pathLeadTime: z2.number().optional().default(0).describe("Path lead time (seconds)"),
    pathTrailTime: z2.number().optional().default(1e10).describe("Path trail time (seconds)"),
    multiplier: z2.number().optional().default(1).describe("Clock speed multiplier"),
    shouldAnimate: z2.boolean().optional().default(true).describe("Auto-start animation")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Create Animation" },
  async (params) => {
    const result = await sendToBrowser("createAnimation", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "controlAnimation",
  "Play or pause the current animation",
  {
    action: z2.enum(["play", "pause"]).describe("Play or pause")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Control Animation" },
  async (params) => {
    const result = await sendToBrowser("controlAnimation", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "removeAnimation",
  "Remove an animation entity",
  {
    entityId: z2.string().describe("Entity ID of the animation to remove")
  },
  { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, title: "Remove Animation" },
  async (params) => {
    const result = await sendToBrowser("removeAnimation", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "listAnimations",
  "List all active animations",
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Animations" },
  async () => {
    const result = await sendToBrowser("listAnimations", {});
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);
_registerTool(
  "updateAnimationPath",
  "Update the visual properties of an animation path",
  {
    entityId: z2.string().describe("Entity ID of the animation"),
    width: z2.number().optional().describe("New path width (pixels)"),
    color: z2.string().optional().describe("New path color (CSS)"),
    leadTime: z2.number().optional().describe("New lead time (seconds)"),
    trailTime: z2.number().optional().describe("New trail time (seconds)"),
    show: z2.boolean().optional().describe("Show/hide path")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Update Animation Path" },
  async (params) => {
    const result = await sendToBrowser("updateAnimationPath", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "trackEntity",
  "Track (follow) an entity with the camera, or stop tracking",
  {
    entityId: z2.string().optional().describe("Entity ID to track (omit to stop tracking)"),
    heading: z2.number().optional().describe("Camera heading (degrees)"),
    pitch: z2.number().optional().default(-30).describe("Camera pitch (degrees)"),
    range: z2.number().optional().default(500).describe("Camera distance from entity (meters)")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Track Entity" },
  async (params) => {
    const result = await sendToBrowser("trackEntity", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "controlClock",
  "Configure the Cesium clock (time range, speed, animation state)",
  {
    action: z2.enum(["configure", "setTime", "setMultiplier"]).describe("Clock action"),
    startTime: z2.string().optional().describe("ISO 8601 start time (for configure)"),
    stopTime: z2.string().optional().describe("ISO 8601 stop time (for configure)"),
    currentTime: z2.string().optional().describe("ISO 8601 current time (for configure)"),
    time: z2.string().optional().describe("ISO 8601 time to jump to (for setTime)"),
    multiplier: z2.number().optional().describe("Clock speed multiplier (for configure/setMultiplier)"),
    shouldAnimate: z2.boolean().optional().describe("Whether clock should animate (for configure)"),
    clockRange: z2.enum(["UNBOUNDED", "CLAMPED", "LOOP_STOP"]).optional().describe("Clock range mode (for configure)")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, title: "Control Clock" },
  async (params) => {
    const result = await sendToBrowser("controlClock", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setGlobeLighting",
  "Enable/disable globe lighting and atmospheric effects",
  {
    enableLighting: z2.boolean().optional().describe("Enable globe lighting"),
    dynamicAtmosphereLighting: z2.boolean().optional().describe("Enable dynamic atmosphere lighting"),
    dynamicAtmosphereLightingFromSun: z2.boolean().optional().describe("Use sun position for atmosphere lighting")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Globe Lighting" },
  async (params) => {
    const result = await sendToBrowser("setGlobeLighting", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setSceneOptions",
  "Configure scene environment (fog, atmosphere, shadows, sun, moon, background color, depth testing)",
  {
    fogEnabled: z2.boolean().optional().describe("Enable/disable fog"),
    fogDensity: z2.number().optional().describe("Fog density (0.0~1.0, default ~0.0002)"),
    fogMinimumBrightness: z2.number().optional().describe("Minimum fog brightness (0.0~1.0)"),
    skyAtmosphereShow: z2.boolean().optional().describe("Show sky atmosphere"),
    skyAtmosphereHueShift: z2.number().optional().describe("Sky hue shift (-1.0~1.0)"),
    skyAtmosphereSaturationShift: z2.number().optional().describe("Sky saturation shift (-1.0~1.0)"),
    skyAtmosphereBrightnessShift: z2.number().optional().describe("Sky brightness shift (-1.0~1.0)"),
    groundAtmosphereShow: z2.boolean().optional().describe("Show ground atmosphere"),
    shadowsEnabled: z2.boolean().optional().describe("Enable shadows"),
    shadowsSoftShadows: z2.boolean().optional().describe("Use soft shadows"),
    shadowsDarkness: z2.number().optional().describe("Shadow darkness (0.0=no shadow, 1.0=fully dark)"),
    sunShow: z2.boolean().optional().describe("Show the sun"),
    sunGlowFactor: z2.number().optional().describe("Sun glow factor (default 1.0)"),
    moonShow: z2.boolean().optional().describe("Show the moon"),
    depthTestAgainstTerrain: z2.boolean().optional().describe("Enable depth test against terrain (entities behind terrain are hidden)"),
    backgroundColor: z2.string().optional().describe('Scene background color (CSS format, e.g. "#000000")')
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Scene Options" },
  async (params) => {
    const result = await sendToBrowser("setSceneOptions", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setPostProcess",
  "Configure post-processing effects (bloom glow, ambient occlusion SSAO, anti-aliasing FXAA)",
  {
    bloom: z2.boolean().optional().describe("Enable bloom glow effect"),
    bloomContrast: z2.number().optional().describe("Bloom contrast (default 128)"),
    bloomBrightness: z2.number().optional().describe("Bloom brightness (default -0.3)"),
    bloomDelta: z2.number().optional().describe("Bloom delta (default 1.0)"),
    bloomSigma: z2.number().optional().describe("Bloom sigma (default 3.78)"),
    bloomStepSize: z2.number().optional().describe("Bloom step size (default 5.0)"),
    bloomGlowOnly: z2.boolean().optional().describe("Show only the glow (no base scene)"),
    ambientOcclusion: z2.boolean().optional().describe("Enable ambient occlusion (SSAO)"),
    aoIntensity: z2.number().optional().describe("AO intensity (default 3.0)"),
    aoBias: z2.number().optional().describe("AO bias (default 0.1)"),
    aoLengthCap: z2.number().optional().describe("AO length cap (default 0.26)"),
    aoStepSize: z2.number().optional().describe("AO step size (default 1.95)"),
    fxaa: z2.boolean().optional().describe("Enable FXAA anti-aliasing")
  },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Post-Processing" },
  async (params) => {
    const result = await sendToBrowser("setPostProcess", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
_registerTool(
  "setIonToken",
  "Set Cesium Ion access token for loading Ion assets (3D Tiles, imagery, terrain). Must be called before loading private Ion resources.",
  { token: z2.string().describe("Cesium Ion access token") },
  { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Set Ion Token" },
  async (params) => {
    const result = await sendToBrowser("setIonToken", params);
    return { content: [{ type: "text", text: JSON.stringify(result ?? { success: true }) }] };
  }
);
var _lastGeocodeTime = 0;
var _proxyDispatcher;
var _proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
if (_proxyUrl) {
  import("undici").then(({ ProxyAgent }) => {
    _proxyDispatcher = new ProxyAgent(_proxyUrl);
  }).catch(() => {
  });
}
_registerTool(
  "geocode",
  "\u5C06\u5730\u5740\u3001\u5730\u6807\u6216\u5730\u540D\u8F6C\u6362\u4E3A\u5730\u7406\u5750\u6807\uFF08\u7ECF\u7EAC\u5EA6\uFF09\u3002\u4F7F\u7528 OpenStreetMap Nominatim \u514D\u8D39\u670D\u52A1\uFF0C\u65E0\u9700 API Key\u3002",
  {
    address: z2.string().min(1).describe('\u5730\u5740\u3001\u5730\u6807\u6216\u5730\u540D\uFF0C\u4F8B\u5982 "\u6545\u5BAB"\u3001"Eiffel Tower"\u3001"\u4E1C\u4EAC\u5854"'),
    countryCode: z2.string().length(2).optional().describe('\u4E24\u4F4D ISO \u56FD\u5BB6\u4EE3\u7801\u9650\u5236\u641C\u7D22\u8303\u56F4\uFF08\u5982 "CN"\u3001"US"\u3001"JP"\uFF09')
  },
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true, title: "Geocode Address" },
  async ({ address, countryCode }) => {
    const now = Date.now();
    const wait = 1100 - (now - _lastGeocodeTime);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    _lastGeocodeTime = Date.now();
    const params = new URLSearchParams({
      q: address,
      format: "json",
      addressdetails: "1",
      limit: "1"
    });
    if (countryCode) params.set("countrycodes", countryCode);
    const ua = process.env.OSM_USER_AGENT || "cesium-mcp-runtime/1.0";
    const fetchOptions = {
      headers: { "User-Agent": ua }
    };
    if (_proxyDispatcher) fetchOptions.dispatcher = _proxyDispatcher;
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, fetchOptions);
    if (!resp.ok) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `Nominatim API error: ${resp.status}` }) }], isError: true };
    }
    const data = await resp.json();
    if (!data.length) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, message: `No results found for: ${address}` }) }] };
    }
    const item = data[0];
    const result = {
      success: true,
      longitude: parseFloat(item.lon),
      latitude: parseFloat(item.lat),
      displayName: item.display_name,
      boundingBox: item.boundingbox ? {
        south: parseFloat(item.boundingbox[0]),
        north: parseFloat(item.boundingbox[1]),
        west: parseFloat(item.boundingbox[2]),
        east: parseFloat(item.boundingbox[3])
      } : void 0
    };
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);
server.prompt(
  "cesium-quickstart",
  "Quick reference for using Cesium MCP tools",
  async () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Cesium MCP Quick Start Guide:

1. **Camera**: flyTo(lng, lat) to navigate, setView for instant move, getView to read current position
2. **Entities**: addMarker for points, addPolygon/addPolyline for shapes, addModel for 3D models
3. **Layers**: addGeoJsonLayer for vector data, load3dTiles for 3D city models, loadImageryService for WMS/WMTS
4. **Animation**: createAnimation with waypoints for moving entities, controlAnimation to play/pause
5. **Interaction**: screenshot to capture view, highlight to emphasize features
6. **Discovery**: list_toolsets to see available tool groups, enable_toolset to activate more tools

All entity/layer operations return an ID for subsequent updates or removal.`
      }
    }]
  })
);
if (!_allMode) {
  server.tool(
    "list_toolsets",
    "List all available tool groups and their enabled status. Call this to discover additional capabilities before asking the user to configure anything.",
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Toolsets" },
    async () => {
      const groups = Object.entries(TOOLSETS).map(([name, tools]) => ({
        name,
        description: TOOLSET_DESCRIPTIONS[name] ?? "",
        tools: tools.length,
        enabled: _enabledSets.has(name),
        toolNames: tools
      }));
      return { content: [{ type: "text", text: JSON.stringify(groups, null, 2) }] };
    }
  );
  server.tool(
    "enable_toolset",
    "Enable a tool group to make its tools available. Call list_toolsets first to see available groups.",
    {
      toolset: z2.string().describe('Name of the toolset to enable (e.g. "camera", "animation", "entity-ext")')
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "Enable Toolset" },
    async ({ toolset }) => {
      if (!(toolset in TOOLSETS)) {
        return {
          content: [{ type: "text", text: `Unknown toolset "${toolset}". Available: ${Object.keys(TOOLSETS).join(", ")}` }],
          isError: true
        };
      }
      if (_enabledSets.has(toolset)) {
        return { content: [{ type: "text", text: `Toolset "${toolset}" is already enabled.` }] };
      }
      const added = _enableToolset(toolset);
      server.sendToolListChanged?.();
      return {
        content: [{
          type: "text",
          text: `Enabled toolset "${toolset}" \u2014 ${added.length} new tools available: ${added.join(", ")}`
        }]
      };
    }
  );
}
server.tool(
  "listSessions",
  _localeKey === "zh-CN" ? "\u5217\u51FA\u5F53\u524D\u6240\u6709\u5DF2\u8FDE\u63A5\u7684\u6D4F\u89C8\u5668 session\uFF08ID \u548C\u8FDE\u63A5\u72B6\u6001\uFF09\uFF0C\u7528\u4E8E\u591A\u6D4F\u89C8\u5668\u8DEF\u7531" : "List all connected browser sessions (ID and connection state) for multi-browser routing",
  {},
  { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Sessions" },
  async () => {
    const sessions = Array.from(browserClients.entries()).map(([id, ws]) => ({
      sessionId: id,
      connected: ws.readyState === WebSocket.OPEN,
      isDefault: id === DEFAULT_SESSION_ID
    }));
    return { content: [{ type: "text", text: JSON.stringify(sessions, null, 2) }] };
  }
);
function _createHttpMcpServer(filterToolsets) {
  const s = new McpServer({
    name: "cesium-mcp-runtime",
    version: "1.143.2",
    title: "Cesium MCP Runtime",
    description: "AI-powered 3D globe control via MCP \u2014 camera, layers, entities, animation, and interaction with CesiumJS.",
    websiteUrl: "https://github.com/gaopengbin/cesium-mcp"
  }, {
    instructions: "Cesium MCP Runtime provides tools for controlling a CesiumJS 3D globe via AI. A browser with cesium-mcp-bridge must be connected via WebSocket for command execution. Use view tools (flyTo, setView) to navigate, entity tools to add markers/polygons/models, layer tools to manage GeoJSON/3D Tiles, and animation tools for time-based animations."
  });
  s.resource(
    "camera",
    "cesium://scene/camera",
    { description: "\u5F53\u524D\u76F8\u673A\u72B6\u6001\uFF08\u7ECF\u7EAC\u5EA6\u3001\u9AD8\u5EA6\u3001\u89D2\u5EA6\uFF09", mimeType: "application/json" },
    async () => {
      try {
        const result = await sendToBrowser("getView", {});
        return { contents: [{ uri: "cesium://scene/camera", text: JSON.stringify(result), mimeType: "application/json" }] };
      } catch {
        return { contents: [{ uri: "cesium://scene/camera", text: '{"error":"no browser connected"}', mimeType: "application/json" }] };
      }
    }
  );
  s.resource(
    "layers",
    "cesium://scene/layers",
    { description: "\u5F53\u524D\u5DF2\u52A0\u8F7D\u7684\u56FE\u5C42\u5217\u8868\uFF08ID\u3001\u540D\u79F0\u3001\u7C7B\u578B\u3001\u53EF\u89C1\u6027\uFF09", mimeType: "application/json" },
    async () => {
      try {
        const result = await sendToBrowser("listLayers", {});
        return { contents: [{ uri: "cesium://scene/layers", text: JSON.stringify(result), mimeType: "application/json" }] };
      } catch {
        return { contents: [{ uri: "cesium://scene/layers", text: '{"error":"no browser connected"}', mimeType: "application/json" }] };
      }
    }
  );
  const allowedToolsets = filterToolsets ?? new Set(Object.keys(TOOLSETS));
  const allowedTools = /* @__PURE__ */ new Set();
  for (const setName of allowedToolsets) {
    if (TOOLSETS[setName]) {
      for (const tool of TOOLSETS[setName]) allowedTools.add(tool);
    }
  }
  for (const [name, args] of _toolDefs.entries()) {
    if (allowedTools.has(name)) {
      _applyToolDef(s, args);
    }
  }
  s.tool(
    "listSessions",
    _localeKey === "zh-CN" ? "\u5217\u51FA\u5F53\u524D\u6240\u6709\u5DF2\u8FDE\u63A5\u7684\u6D4F\u89C8\u5668 session\uFF08ID \u548C\u8FDE\u63A5\u72B6\u6001\uFF09\uFF0C\u7528\u4E8E\u591A\u6D4F\u89C8\u5668\u8DEF\u7531" : "List all connected browser sessions (ID and connection state) for multi-browser routing",
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: "List Sessions" },
    async () => {
      const sessions = Array.from(browserClients.entries()).map(([id, ws]) => ({
        sessionId: id,
        connected: ws.readyState === WebSocket.OPEN,
        isDefault: id === DEFAULT_SESSION_ID
      }));
      return { content: [{ type: "text", text: JSON.stringify(sessions, null, 2) }] };
    }
  );
  return s;
}
async function _handleMcpRequest(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const parsedUrl = new URL(req.url ?? "/", "http://localhost");
  if (parsedUrl.pathname !== "/mcp") {
    res.writeHead(404);
    res.end("Not Found \u2014 MCP endpoint is POST /mcp");
    return;
  }
  const urlSession = parsedUrl.searchParams.get("session") ?? void 0;
  const urlToolsets = parsedUrl.searchParams.get("toolsets")?.trim();
  const filterToolsets = urlToolsets ? new Set(urlToolsets.split(",").map((s) => s.trim()).filter((s) => s in TOOLSETS)) : void 0;
  if (req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      const run = async () => {
        try {
          const parsedBody = JSON.parse(body);
          const mcpServer = _createHttpMcpServer(filterToolsets);
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: void 0
            // stateless
          });
          res.on("close", () => {
            transport.close().catch(() => {
            });
          });
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res, parsedBody);
        } catch {
          if (!res.headersSent) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
          }
        }
      };
      if (urlSession) {
        await _httpSessionStore.run(urlSession, run);
      } else {
        await run();
      }
    });
    return;
  }
  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32e3, message: "Method not allowed in stateless mode" }, id: null }));
}
function createSandboxServer() {
  for (const setName of Object.keys(TOOLSETS)) {
    if (!_enabledSets.has(setName)) _enableToolset(setName);
  }
  return server;
}
async function main(argv = []) {
  const transportArg = _parseArg(argv, "--transport") ?? process.env.MCP_TRANSPORT ?? "stdio";
  const mcpPortArg = parseInt(_parseArg(argv, "--port") ?? process.env.MCP_HTTP_PORT ?? "0");
  await startServer();
  if (transportArg === "http") {
    const port = mcpPortArg || WS_PORT + 100;
    const mcpHttpServer = createServer(_handleMcpRequest);
    mcpHttpServer.listen(port, () => {
      const allToolCount = _toolDefs.size;
      console.error(`[cesium-mcp-runtime] MCP Server running (Streamable HTTP), ${allToolCount} tools available`);
      console.error(`[cesium-mcp-runtime] MCP endpoint: http://localhost:${port}/mcp`);
      console.error("[cesium-mcp-runtime] All toolsets enabled for HTTP mode");
      if (_relayPort > 0) {
        console.error(`[cesium-mcp-runtime] Relay mode active \u2192 commands forwarded to port ${_relayPort}`);
      }
    });
    return;
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const metaCount = _allMode ? 0 : 2;
  console.error(`[cesium-mcp-runtime] MCP Server running (stdio), ${_enabledTools.size + metaCount} tools registered (toolsets: ${[..._enabledSets].join(", ")})`);
  if (_relayPort > 0) {
    console.error(`[cesium-mcp-runtime] Relay mode active \u2192 commands forwarded to port ${_relayPort}`);
  }
}
function _parseArg(argv, key) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === key && i + 1 < argv.length) return argv[i + 1];
    if (argv[i]?.startsWith(key + "=")) return argv[i].slice(key.length + 1);
  }
  return void 0;
}

export {
  createSandboxServer,
  main
};
