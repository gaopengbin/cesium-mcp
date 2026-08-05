(function attachCesiumFunctionTools(global) {
  function toFunctionTools(contracts) {
    return contracts.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))
  }

  function toBridgeCommand(name, params) {
    return { action: name, params }
  }

  global.CesiumFunctionTools = Object.freeze({
    toBridgeCommand,
    toFunctionTools,
  })
})(globalThis)
