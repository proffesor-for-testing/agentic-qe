import { WebSocketProvider } from './contexts/WebSocketContext';
import { MindMap } from './components/MindMap/MindMap';
import { RadarChart } from './components/MetricsPanel/RadarChart';
import { LifecycleTimeline } from './components/Timeline/LifecycleTimeline';
import { DrillDownPanel } from './components/DetailPanel/DrillDownPanel';
import { Activity } from 'lucide-react';

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
              <MindMap />
            </div>

            {/* Right Column - Split Panels */}
            <div className="col-span-5 flex flex-col gap-4">
              {/* Top Right - Metrics */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden" style={{ height: '35%' }}>
                <RadarChart showComparison={true} />
              </div>

              {/* Middle Right - Timeline */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden" style={{ height: '30%' }}>
                <LifecycleTimeline />
              </div>

              {/* Bottom Right - Detail Panel */}
              <div className="bg-white rounded-lg shadow-lg overflow-hidden" style={{ height: '35%' }}>
                <DrillDownPanel />
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
