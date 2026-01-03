/**
 * Web App Module
 *
 * Entry point for the @ruvector/edge web dashboard.
 *
 * @module edge/webapp
 */

// ============================================
// Component Exports
// ============================================

export { App } from './App';
export { Dashboard } from './pages/Dashboard';
export { StatusCard, StatusCardGrid } from './components/StatusCard';
export { PeerList, PeerConnect } from './components/PeerList';
export { CRDTVisualizer } from './components/CRDTVisualizer';

// ============================================
// Hook Exports
// ============================================

export {
  useP2P,
  useP2PEvents,
  useConnectionStatus,
  usePeers,
  usePatterns,
  useCRDT,
  useMetrics,
} from './hooks/useP2P';

// ============================================
// Service Exports
// ============================================

export {
  P2PServiceImpl,
  getP2PService,
  resetP2PService,
} from './services/P2PService';

// ============================================
// Store Exports
// ============================================

export {
  dashboardReducer,
  initialState,
  actions,
  selectors,
} from './store/dashboardReducer';

// ============================================
// Type Exports
// ============================================

export type {
  DashboardState,
  DashboardAction,
  AgentInfo,
  PeerInfo,
  PatternStats,
  CRDTState,
  CRDTStoreInfo,
  TestState,
  TestInfo,
  TestResult,
  SystemMetrics,
  StatusCardProps,
  PeerCardProps,
  PatternListProps,
  PatternItem,
  CRDTVisualizerProps,
  TestRunnerProps,
  P2PServiceConfig,
  P2PService,
  WebAppEvent,
  WebAppEventHandler,
  NavRoute,
  NavItem,
  AppSettings,
} from './types';

export { DEFAULT_SETTINGS } from './types';

// ============================================
// Capabilities
// ============================================

export const WEBAPP_CAPABILITIES = {
  version: '1.0.0',
  features: {
    dashboard: true,
    peerManagement: true,
    patternVisualization: true,
    crdtVisualization: true,
    metricsMonitoring: true,
    testRunner: false, // Future feature
  },
  p2pIntegration: {
    crypto: true,
    webrtc: true,
    protocol: true,
    sharing: true,
    crdt: true,
    coordination: true,
  },
};
