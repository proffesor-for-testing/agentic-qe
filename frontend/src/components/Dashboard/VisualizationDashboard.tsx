import React, { useState } from 'react';
import { QualityMetrics } from '../QualityMetrics';
import { TimelineEnhanced } from '../Timeline';
import { BarChart3, Activity, Settings } from 'lucide-react';

export const VisualizationDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'metrics' | 'timeline'>('metrics');
  const [sessionId, setSessionId] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('24h');

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Agentic QE Visualization Dashboard
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Phase 3: Real-time metrics and event timeline
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-gray-500" />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={e => setAutoRefresh(e.target.checked)}
                    className="rounded"
                  />
                  Auto-refresh
                </label>
              </div>

              <select
                value={timeRange}
                onChange={e => setTimeRange(e.target.value as any)}
                className="px-3 py-1 border rounded text-sm"
              >
                <option value="1h">Last Hour</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
              </select>

              <input
                type="text"
                placeholder="Session ID (optional)"
                value={sessionId}
                onChange={e => setSessionId(e.target.value)}
                className="px-3 py-1 border rounded text-sm w-48"
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-4 border-b">
            <button
              onClick={() => setActiveTab('metrics')}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
                activeTab === 'metrics'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Quality Metrics
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
                activeTab === 'timeline'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <Activity className="w-4 h-4" />
              Event Timeline
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow" style={{ height: '700px' }}>
          {activeTab === 'metrics' ? (
            <QualityMetrics
              sessionId={sessionId || undefined}
              timeRange={timeRange}
              autoRefresh={autoRefresh}
            />
          ) : (
            <TimelineEnhanced
              sessionId={sessionId || undefined}
              autoRefresh={autoRefresh}
            />
          )}
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-3 gap-6 mt-8">
          <InfoCard
            title="V8 - QualityMetrics"
            description="Radar charts, trend lines, and token usage visualization with Recharts"
            features={[
              'Multi-view charts (Radar, Trends, Tokens)',
              'Real-time updates via REST API',
              'Export to JSON/CSV',
              'Responsive design with Tailwind',
            ]}
          />
          <InfoCard
            title="V9 - Timeline"
            description="Event lifecycle timeline with virtual scrolling for 1000+ events"
            features={[
              'Virtual scrolling (react-window)',
              'Advanced filtering (agent, type, date)',
              'Detailed event inspection',
              'Pagination support',
            ]}
          />
          <InfoCard
            title="REST API Integration"
            description="Connected to Phase 3 visualization API endpoints"
            features={[
              'GET /api/visualization/metrics',
              'GET /api/visualization/events',
              'Auto-refresh every 10-30s',
              'Error handling & loading states',
            ]}
          />
        </div>
      </div>
    </div>
  );
};

interface InfoCardProps {
  title: string;
  description: string;
  features: string[];
}

const InfoCard: React.FC<InfoCardProps> = ({ title, description, features }) => (
  <div className="bg-white rounded-lg shadow p-6">
    <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
    <p className="text-sm text-gray-600 mb-4">{description}</p>
    <ul className="space-y-2">
      {features.map((feature, idx) => (
        <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
          <span className="text-green-600 mt-0.5">✓</span>
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  </div>
);
