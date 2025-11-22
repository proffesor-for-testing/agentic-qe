import React, { useState, useMemo } from 'react';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { DetailedEventData } from '../../types';
import { Download, ExternalLink, Code } from 'lucide-react';
import ReactJson from 'react-json-view';
import { format } from 'date-fns';

export const DrillDownPanel: React.FC = () => {
  const { selectedNode, events, graphData } = useWebSocket();
  const [viewMode, setViewMode] = useState<'overview' | 'json' | 'logs'>('overview');

  const selectedNodeData = useMemo(() => {
    if (!selectedNode) return null;
    return graphData.nodes.find((n) => n.id === selectedNode);
  }, [selectedNode, graphData]);

  const relatedEvents = useMemo(() => {
    if (!selectedNode) return [];
    return events
      .filter((e) => e.agentId === selectedNode)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [selectedNode, events]);

  const detailedData: DetailedEventData | null = useMemo(() => {
    if (!relatedEvents.length) return null;

    const latestEvent = relatedEvents[0];
    return {
      event: latestEvent,
      reasoning: `Agent ${latestEvent.agentName} performed ${latestEvent.type} operation`,
      traceId: `trace-${latestEvent.agentId}-${latestEvent.timestamp}`,
      spanId: `span-${latestEvent.id}`,
      logs: [
        `[${format(latestEvent.timestamp, 'HH:mm:ss')}] Event ${latestEvent.type} initiated`,
        `[${format(latestEvent.timestamp + 100, 'HH:mm:ss')}] Processing...`,
        `[${format(latestEvent.timestamp + (latestEvent.duration || 0), 'HH:mm:ss')}] Completed`,
      ],
      metadata: {
        ...latestEvent.details,
        agentType: selectedNodeData?.type,
        status: selectedNodeData?.status,
      },
    };
  }, [relatedEvents, selectedNodeData]);

  const handleExport = (exportFormat: 'json' | 'csv') => {
    if (!detailedData) return;

    let content: string;
    let mimeType: string;
    let filename: string;

    if (exportFormat === 'json') {
      content = JSON.stringify(detailedData, null, 2);
      mimeType = 'application/json';
      filename = `agent-${selectedNode}-${Date.now()}.json`;
    } else {
      // CSV export
      const headers = ['Timestamp', 'Event Type', 'Status', 'Duration'];
      const rows = relatedEvents.map((e) => [
        format(e.timestamp, 'yyyy-MM-dd HH:mm:ss'),
        e.type,
        e.status || 'N/A',
        e.duration ? `${e.duration}ms` : 'N/A',
      ]);

      content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      mimeType = 'text/csv';
      filename = `agent-${selectedNode}-${Date.now()}.csv`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!selectedNode || !detailedData) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 bg-gray-50">
        <div className="text-center">
          <Code className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p>Select a node to view details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">
            {selectedNodeData?.label || selectedNode}
          </h3>
          <p className="text-sm text-gray-500">
            {selectedNodeData?.type} • {selectedNodeData?.status}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('json')}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded"
            title="Export as JSON"
          >
            <Download className="w-4 h-4" />
          </button>
          {detailedData.traceId && (
            <button
              onClick={() =>
                window.open(`/traces/${detailedData.traceId}`, '_blank')
              }
              className="p-2 text-gray-600 hover:bg-gray-100 rounded"
              title="View in OpenTelemetry"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex border-b">
        {(['overview', 'json', 'logs'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-4 py-2 text-sm font-medium ${
              viewMode === mode
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {viewMode === 'overview' && (
          <div className="space-y-4">
            {/* Basic Info */}
            <div>
              <h4 className="font-semibold text-gray-800 mb-2">Basic Information</h4>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Agent ID:</span>
                  <span className="font-mono text-gray-800">{selectedNode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Type:</span>
                  <span className="text-gray-800">{selectedNodeData?.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span
                    className={`font-semibold ${
                      selectedNodeData?.status === 'completed'
                        ? 'text-green-600'
                        : selectedNodeData?.status === 'error'
                        ? 'text-red-600'
                        : selectedNodeData?.status === 'running'
                        ? 'text-blue-600'
                        : 'text-gray-600'
                    }`}
                  >
                    {selectedNodeData?.status}
                  </span>
                </div>
                {detailedData.traceId && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Trace ID:</span>
                    <span className="font-mono text-xs text-gray-800">
                      {detailedData.traceId}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Reasoning */}
            {detailedData.reasoning && (
              <div>
                <h4 className="font-semibold text-gray-800 mb-2">Reasoning</h4>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-sm text-gray-700">
                  {detailedData.reasoning}
                </div>
              </div>
            )}

            {/* Recent Events */}
            <div>
              <h4 className="font-semibold text-gray-800 mb-2">
                Recent Events ({relatedEvents.length})
              </h4>
              <div className="space-y-2">
                {relatedEvents.slice(0, 5).map((event) => (
                  <div
                    key={event.id}
                    className="bg-gray-50 rounded-lg p-3 text-sm"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-gray-800 capitalize">
                        {event.type}
                      </span>
                      <span className="text-xs text-gray-500">
                        {format(event.timestamp, 'HH:mm:ss')}
                      </span>
                    </div>
                    {event.duration && (
                      <p className="text-gray-600">
                        Duration: {event.duration}ms
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Metadata */}
            {selectedNodeData?.metadata && (
              <div>
                <h4 className="font-semibold text-gray-800 mb-2">Metadata</h4>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                  {Object.entries(selectedNodeData.metadata).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-600">{key}:</span>
                      <span className="text-gray-800">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'json' && (
          <div className="bg-gray-50 rounded-lg p-4">
            <ReactJson
              src={detailedData}
              theme="rjv-default"
              collapsed={1}
              displayDataTypes={false}
              enableClipboard={true}
              style={{ fontSize: '12px' }}
            />
          </div>
        )}

        {viewMode === 'logs' && detailedData.logs && (
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400 space-y-1">
            {detailedData.logs.map((log, idx) => (
              <div key={idx}>{log}</div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
        <div className="text-xs text-gray-500">
          Last updated: {format(detailedData.event.timestamp, 'yyyy-MM-dd HH:mm:ss')}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Export CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="px-3 py-1 text-xs bg-primary-500 text-white rounded hover:bg-primary-600"
          >
            Export JSON
          </button>
        </div>
      </div>
    </div>
  );
};
