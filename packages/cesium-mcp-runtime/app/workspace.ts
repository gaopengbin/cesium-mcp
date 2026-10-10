export type WorkspaceLayout = 'home' | 'map' | 'expanded'
export interface WorkspaceState {
  layout: WorkspaceLayout
  expandedFrom: 'home' | 'map'
}

export const initialWorkspace: WorkspaceState = { layout: 'home', expandedFrom: 'home' }

export function transitionWorkspace(state: WorkspaceState, action: 'map' | 'home' | 'expand' | 'restore'): WorkspaceState {
  if (action === 'map') return state.layout === 'expanded' ? state : { ...state, layout: 'map' }
  if (action === 'home') return { ...state, layout: 'home' }
  if (action === 'restore') return { ...state, layout: state.expandedFrom }
  return state.layout === 'expanded' ? state : { ...state, layout: 'expanded', expandedFrom: state.layout }
}
