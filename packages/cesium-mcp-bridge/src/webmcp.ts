import type { BridgeCommand, BridgeResult } from './types'

export interface WebMcpToolAnnotations {
  title?: string
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
}

export interface WebMcpToolDefinition {
  name: string
  title?: string
  description: string
  inputSchema?: Record<string, unknown>
  annotations?: WebMcpToolAnnotations
}

export interface WebMcpRegisteredTool {
  name: string
  title?: string
  description: string
  inputSchema?: Record<string, unknown>
  annotations?: Pick<WebMcpToolAnnotations, 'readOnlyHint' | 'untrustedContentHint'>
  execute(input: Record<string, unknown>): unknown | Promise<unknown>
}

export interface WebMcpRegisterToolOptions {
  signal?: AbortSignal
  exposedTo?: string[]
}

export interface WebMcpModelContext {
  registerTool(tool: WebMcpRegisteredTool, options?: WebMcpRegisterToolOptions): Promise<void>
}

export interface WebMcpDocument {
  modelContext?: WebMcpModelContext
}

export interface WebMcpBridgeExecutor {
  execute(command: BridgeCommand): Promise<BridgeResult>
}

export interface RegisterWebMcpToolsOptions {
  modelContext?: WebMcpModelContext
  document?: WebMcpDocument
  signal?: AbortSignal
  exposedTo?: string[]
}

export interface WebMcpRegistration {
  registered: string[]
  signal: AbortSignal
  unregister(): void
}

function resolveModelContext(options: RegisterWebMcpToolsOptions): WebMcpModelContext {
  if (options.modelContext) return options.modelContext

  const documentRef = options.document
    ?? (typeof document === 'undefined' ? undefined : document as unknown as WebMcpDocument)
  if (!documentRef?.modelContext) {
    throw new Error('WebMCP is not available: document.modelContext is undefined')
  }
  return documentRef.modelContext
}

function assertUniqueToolNames(tools: WebMcpToolDefinition[]): void {
  const names = new Set<string>()
  for (const tool of tools) {
    if (names.has(tool.name)) throw new Error(`Duplicate WebMCP tool name: ${tool.name}`)
    names.add(tool.name)
  }
}

/**
 * Registers Cesium Bridge commands as document-scoped WebMCP tools.
 *
 * The returned handle owns a shared AbortSignal. Calling unregister() removes
 * every tool registered by this call without affecting other page tools.
 */
export async function registerWebMcpTools(
  bridge: WebMcpBridgeExecutor,
  tools: WebMcpToolDefinition[],
  options: RegisterWebMcpToolsOptions = {},
): Promise<WebMcpRegistration> {
  assertUniqueToolNames(tools)
  const modelContext = resolveModelContext(options)
  const controller = new AbortController()
  const unregister = () => controller.abort()

  if (options.signal) {
    if (options.signal.aborted) controller.abort()
    else options.signal.addEventListener('abort', unregister, { once: true })
  }

  const registered: string[] = []
  try {
    for (const tool of tools) {
      const annotations = tool.annotations
        ? {
            ...(annotationsValue(tool.annotations.readOnlyHint, 'readOnlyHint')),
            ...(annotationsValue(tool.annotations.untrustedContentHint, 'untrustedContentHint')),
          }
        : undefined

      await modelContext.registerTool({
        name: tool.name,
        title: tool.title ?? tool.annotations?.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: annotations && Object.keys(annotations).length > 0 ? annotations : undefined,
        execute: input => bridge.execute({ action: tool.name, params: input }),
      }, {
        signal: controller.signal,
        ...(options.exposedTo ? { exposedTo: options.exposedTo } : {}),
      })
      registered.push(tool.name)
    }
  } catch (error) {
    unregister()
    throw error
  }

  return { registered, signal: controller.signal, unregister }
}

function annotationsValue<K extends keyof Pick<WebMcpToolAnnotations, 'readOnlyHint' | 'untrustedContentHint'>>(
  value: boolean | undefined,
  key: K,
): Partial<Pick<WebMcpToolAnnotations, K>> {
  return value === undefined ? {} : { [key]: value } as Pick<WebMcpToolAnnotations, K>
}
