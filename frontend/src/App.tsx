import { Suspense, lazy } from 'react';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { Activity } from 'lucide-react';
import { LoadingFallback } from './components/common/LoadingFallback';

// Lazy load heavy components for code-splitting
const MindMap = lazy(() => import('./components/MindMap/MindMap').then(module => ({ default: module.MindMap })));
const RadarChart = lazy(() => import('./components/MetricsPanel/RadarChart').then(module => ({ default: module.RadarChart })));
const LifecycleTimeline = lazy(() => import('./components/Timeline/LifecycleTimeline').then(module => ({ default: module.LifecycleTimeline })));
const DrillDownPanel = lazy(() => import('./components/DetailPanel/DrillDownPanel').then(module => ({ default: module.DrillDownPanel })));

function App() {
  return (
    <WebSocketProvider>
      <div className="h-screen flex flex-col bg-gray-100">
        {/* Header */}
        <header className="bg-white border-b shadow-sm">
          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <Activity className="w-8 h-8 text-primary-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Agentic QE Fleet Visualization
                </h1>
                <p className="text-sm text-gray-500">
                  Real-time agent coordination and quality metrics
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Layout */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full grid grid-cols-12 gap-4 p-4">
            {/* Left Column - Mind Map */}
            <div className="col-span-7 bg-white rounded-lg shadow-lg overflow-hidden">
              <Suspense fallback={<LoadingFallback message="Loading Mind Map..." />}>
                <MindMap />
              </Suspense>
            </div>

            {/* Right Column - Split Panels */}
            <div className="col-span-5 flex flex-col gap-4">
              {/* Top Right - Metrics */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden" style={{ height: '35%' }}>
                <Suspense fallback={<LoadingFallback message="Loading Metrics..." fullHeight={false} />}>
                  <RadarChart showComparison={true} />
                </Suspense>
              </div>

              {/* Middle Right - Timeline */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden" style={{ height: '30%' }}>
                <Suspense fallback={<LoadingFallback message="Loading Timeline..." fullHeight={false} />}>
                  <LifecycleTimeline />
                </Suspense>
              </div>

              {/* Bottom Right - Detail Panel */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden" style={{ height: '35%' }}>
                <Suspense fallback={<LoadingFallback message="Loading Details..." fullHeight={false} />}>
                  <DrillDownPanel />
                </Suspense>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-white border-t px-6 py-3">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div>Agentic QE Fleet v1.8.4 - Phase 3 Visualization</div>
            <div className="flex items-center gap-4">
              <span>Connected to WebSocket</span>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </div>
          </div>
        </footer>
      </div>
    </WebSocketProvider>
  );
}

export default App;
