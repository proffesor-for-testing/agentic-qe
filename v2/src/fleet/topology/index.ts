/**
 * Fleet Topology Module
 *
 * Provides fleet topology analysis using min-cut algorithms for:
 * - Single Point of Failure (SPOF) detection
 * - Resilience scoring
 * - Topology optimization suggestions
 * - Real-time SPOF monitoring
 */

export { TopologyMinCutAnalyzer } from './TopologyMinCutAnalyzer.js';
export {
  SPOFMonitor,
  SPOFMonitorConfig,
  DEFAULT_SPOF_MONITOR_CONFIG,
  SPOFMonitorEvents,
} from './SPOFMonitor.js';
export {
  TopologyMode,
  TopologyNode,
  TopologyEdge,
  FleetTopology,
  SPOFResult,
  ResilienceResult,
  TopologyAnalysisConfig,
  DEFAULT_TOPOLOGY_ANALYSIS_CONFIG,
  TopologyOptimization,
} from './types.js';
