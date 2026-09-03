export {
  decideActivePerception,
  DEFAULT_ACTIVE_PERCEPTION_WEIGHTS,
  beliefRegionUncertainty,
  binaryEntropy,
  calculateGoalUncertainty,
  rankObservationCandidates,
  scoreObservationCandidate,
  shouldObserve,
} from './active-perception.js'
export {
  ageAgentBeliefState,
  applyWorldObservation,
  createAgentBeliefState,
  invalidateAgentBeliefState,
  spatialKnowledgeState,
} from './belief-state.js'
export {
  DEFAULT_CORRIDOR_PLANNING_POLICY,
  evaluateCorridorEdge,
  planCorridorRoute,
} from './corridor-planning.js'
export type {
  CorridorBlockedEdge,
  CorridorEdgeEvaluation,
  CorridorPlanningPolicy,
  CorridorRouteRequest,
  CorridorRouteResult,
  CorridorRouteSegment,
  CorridorRouteStatus,
  CorridorTopology,
  CorridorTopologyEdge,
  CorridorTraversalReason,
  UnknownCorridorPolicy,
} from './corridor-planning.js'
export {
  extractPolicyReplayObservationEvents,
  projectExactWorldAwarenessReplay,
  replayWorldAwarenessBeliefTrace,
  validateWorldAwarenessReplayTrace,
} from './replay.js'
export type {
  ExactReplayEventProjection,
  ExactWorldAwarenessReplayProjection,
} from './replay.js'
export {
  appendWorldAwarenessTraceEvent,
  completeWorldAwarenessTrace,
  createWorldAwarenessTrace,
  semanticTraceDigest,
  stableTraceJson,
  verifyWorldAwarenessTrace,
} from './trace.js'
export {
  createAuthoritativeWorldState,
  validateAuthoritativeWorldState,
} from './world-state.js'
export type { CreateAuthoritativeWorldStateInput } from './world-state.js'
export {
  WorldTaskRuntime,
  WorldTaskSupersededError,
} from './world-task-runtime.js'
export type {
  RunWorldTaskInput,
  WorldTaskContext,
  WorldTaskRuntimeOptions,
  WorldTaskSnapshot,
  WorldTaskState,
} from './world-task-runtime.js'
export {
  executeWorldWorkerMessage,
  WorldWorkerExecutor,
} from './world-worker-executor.js'
export type {
  RunWorldWorkerInputOptions,
  WorldWorkerEndpoint,
  WorldWorkerExecutorOptions,
  WorldWorkerFailureMessage,
  WorldWorkerRequestMessage,
  WorldWorkerResultMessage,
  WorldWorkerSuccessMessage,
} from './world-worker-executor.js'
export {
  createVisualGroundingObservation,
  parseVisualGroundingReport,
} from './visual-grounding.js'
export type {
  CreateVisualGroundingObservationInput,
  NormalizedImageBoundingBox,
  VisualGroundingReport,
  VisualObjectGrounding,
  VisualObjectVisibility,
  VisualRegionGrounding,
  VisualRegionOccupancy,
} from './visual-grounding.js'
export type {
  ActivePerceptionDecision,
  ActivePerceptionGoal,
  ActivePerceptionWeights,
  AgentBeliefState,
  ApplyWorldObservationOptions,
  ArtifactObservationEvidence,
  AuthoritativeRegionState,
  AuthoritativeWorldState,
  BeliefChange,
  BeliefChangeKind,
  BeliefConflict,
  BeliefFreshness,
  BeliefInvalidation,
  BeliefObject,
  BeliefRegion,
  BeliefStateDiff,
  BeliefUpdateResult,
  CreateAgentBeliefStateInput,
  EvidenceReference,
  ObjectObservationEvidence,
  ObservationCandidate,
  ObservationCandidateScore,
  ObservationCoverage,
  ObservationEvidenceBase,
  ObservationReadiness,
  ObservationSensor,
  ObservationSensorKind,
  ObserverPose,
  OccupancyState,
  PredictedRegionCoverage,
  RegionObservationEvidence,
  SpatialKnowledgeState,
  SpatialRegion,
  UnknownReason,
  WorldEvidence,
  WorldObservation,
} from './types.js'
export type {
  AppendTraceEventInput,
  WorldAwarenessOutcome,
  WorldAwarenessRunDescriptor,
  WorldAwarenessTrace,
  WorldAwarenessTraceEvent,
  WorldAwarenessTraceEventType,
  WorldAwarenessTraceResult,
} from './trace.js'
