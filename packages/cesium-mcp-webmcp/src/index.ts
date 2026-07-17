import { selectCesiumToolContracts } from 'cesium-mcp-contracts'
import type {
  CesiumToolContract,
  CesiumToolsetSelection,
} from 'cesium-mcp-contracts'

export {
  cesiumBrowserToolContracts,
  cesiumBrowserToolsetDefinitions,
  cesiumBrowserToolsetNames,
  cesiumBrowserToolsets,
  cesiumCoreToolContracts,
  cesiumSharedToolNames,
  selectCesiumToolContracts,
} from 'cesium-mcp-contracts'
export type {
  CesiumBrowserToolset,
  CesiumBrowserToolsetDefinition,
  CesiumBrowserToolsetName,
  CesiumToolAnnotations,
  CesiumToolContract,
  CesiumToolsetSelection,
  JsonSchema,
} from 'cesium-mcp-contracts'

export interface CesiumWebMcpCommand {
  action: string
  params: Record<string, unknown>
}

export interface CesiumWebMcpExecutor {
  execute(command: CesiumWebMcpCommand): unknown | Promise<unknown>
}

export interface WebMcpRegisteredTool {
  name: string
  title?: string
  description: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
    untrustedContentHint?: boolean
  }
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

export interface RegisterWebMcpToolsOptions {
  modelContext?: WebMcpModelContext
  document?: WebMcpDocument
  signal?: AbortSignal
  exposedTo?: string[]
}

export interface RegisterCesiumWebMcpOptions extends RegisterWebMcpToolsOptions {
  tools?: readonly CesiumToolContract[]
  toolsets?: CesiumToolsetSelection
  excludeTools?: readonly string[]
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

function assertUniqueToolNames(tools: readonly CesiumToolContract[]): void {
  const names = new Set<string>()
  for (const tool of tools) {
    if (names.has(tool.name)) throw new Error(`Duplicate WebMCP tool name: ${tool.name}`)
    names.add(tool.name)
  }
}

export async function registerWebMcpTools(
  executor: CesiumWebMcpExecutor,
  tools: readonly CesiumToolContract[],
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
            ...(annotationValue(tool.annotations.readOnlyHint, 'readOnlyHint')),
            ...(annotationValue(tool.annotations.untrustedContentHint, 'untrustedContentHint')),
          }
        : undefined

      await modelContext.registerTool({
        name: tool.name,
        title: tool.title ?? tool.annotations?.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: annotations && Object.keys(annotations).length > 0 ? annotations : undefined,
        execute: input => executor.execute({ action: tool.name, params: input }),
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

export function registerCesiumWebMcp(
  executor: CesiumWebMcpExecutor,
  options: RegisterCesiumWebMcpOptions = {},
): Promise<WebMcpRegistration> {
  const {
    tools,
    toolsets = 'core',
    excludeTools = [],
    ...registrationOptions
  } = options
  const selectedTools = tools ?? selectCesiumToolContracts(toolsets)
  const excludedNames = new Set(excludeTools)
  return registerWebMcpTools(
    executor,
    selectedTools.filter(tool => !excludedNames.has(tool.name)),
    registrationOptions,
  )
}

function annotationValue<K extends 'readOnlyHint' | 'untrustedContentHint'>(
  value: boolean | undefined,
  key: K,
): Partial<Record<K, boolean>> {
  return value === undefined ? {} : { [key]: value } as Record<K, boolean>
}
