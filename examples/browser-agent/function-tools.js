(function attachCesiumFunctionTools(global) {
  const actionByName = new Map()

  function toFunctionTools(contracts) {
    return contracts.map(tool => {
      actionByName.set(tool.name, tool.action || tool.name)
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }
    })
  }

  function toBridgeCommand(name, params) {
    return { action: actionByName.get(name) || name, params }
  }

  global.CesiumFunctionTools = Object.freeze({
    toBridgeCommand,
    toFunctionTools,
  })
})(globalThis)
