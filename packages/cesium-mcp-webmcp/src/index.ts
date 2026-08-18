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

export type BuildCesiumWebMcpToolsOptions = Pick<
  RegisterCesiumWebMcpOptions,
  'tools' | 'toolsets' | 'excludeTools'
>

export interface WebMcpRegistration {
  registered: string[]
  signal: AbortSignal
  unregister(): void
}

export function isWebMcpSupported(documentRef?: WebMcpDocument): boolean {
  const resolvedDocument = documentRef
    ?? (typeof document === 'undefined' ? undefined : document as unknown as WebMcpDocument)
  return Boolean(resolvedDocument?.modelContext)
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

export function buildWebMcpTools(
  executor: CesiumWebMcpExecutor,
  tools: readonly CesiumToolContract[],
): WebMcpRegisteredTool[] {
  assertUniqueToolNames(tools)
  return tools.map(tool => {
    const annotations = tool.annotations
      ? {
          ...(annotationValue(tool.annotations.readOnlyHint, 'readOnlyHint')),
          ...(annotationValue(tool.annotations.untrustedContentHint, 'untrustedContentHint')),
        }
      : undefined

    return {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: annotations && Object.keys(annotations).length > 0 ? annotations : undefined,
      execute: input => executor.execute({ action: tool.name, params: input }),
    }
  })
}

export async function registerWebMcpTools(
  executor: CesiumWebMcpExecutor,
  tools: readonly CesiumToolContract[],
  options: RegisterWebMcpToolsOptions = {},
): Promise<WebMcpRegistration> {
  const webMcpTools = buildWebMcpTools(executor, tools)
  const modelContext = resolveModelContext(options)
  const controller = new AbortController()
  const unregister = () => controller.abort()

  if (options.signal) {
    if (options.signal.aborted) controller.abort()
    else options.signal.addEventListener('abort', unregister, { once: true })
  }

  const registered: string[] = []
  try {
    for (const tool of webMcpTools) {
      if (controller.signal.aborted) break
      await modelContext.registerTool(tool, {
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

export function buildCesiumWebMcpTools(
  executor: CesiumWebMcpExecutor,
  options: BuildCesiumWebMcpToolsOptions = {},
): WebMcpRegisteredTool[] {
  return buildWebMcpTools(executor, selectWebMcpContracts(options))
}

export function registerCesiumWebMcp(
  executor: CesiumWebMcpExecutor,
  options: RegisterCesiumWebMcpOptions = {},
): Promise<WebMcpRegistration> {
  const registrationOptions: RegisterWebMcpToolsOptions = {
    modelContext: options.modelContext,
    document: options.document,
    signal: options.signal,
    exposedTo: options.exposedTo,
  }
  return registerWebMcpTools(
    executor,
    selectWebMcpContracts(options),
    registrationOptions,
  )
}

function selectWebMcpContracts(
  options: BuildCesiumWebMcpToolsOptions,
): readonly CesiumToolContract[] {
  const {
    tools,
    toolsets = 'core',
    excludeTools = [],
  } = options
  const selectedTools = tools ?? selectCesiumToolContracts(toolsets)
  const excludedNames = new Set(excludeTools)
  return selectedTools.filter(tool => !excludedNames.has(tool.name))
}

function annotationValue<K extends 'readOnlyHint' | 'untrustedContentHint'>(
  value: boolean | undefined,
  key: K,
): Partial<Record<K, boolean>> {
  return value === undefined ? {} : { [key]: value } as Record<K, boolean>
}
