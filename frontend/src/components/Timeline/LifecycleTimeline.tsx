import React, { useMemo, useState } from 'react';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { LifecycleEvent } from '../../types';
import { format, formatDistance } from 'date-fns';
import { CheckCircle, XCircle, Clock, PlayCircle, RefreshCw } from 'lucide-react';

/**
 * Safely convert timestamp to milliseconds number.
 * Handles both ISO strings from backend and numeric timestamps.
 */
const toTimestampMs = (timestamp: string | number): number => {
  if (typeof timestamp === 'string') {
    return new Date(timestamp).getTime();
  }
  return timestamp;
};

const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  spawn: PlayCircle,
  spawned: PlayCircle,
  'agent:spawned': PlayCircle,
  execute: Clock,
  started: Clock,
  'agent:started': Clock,
  complete: CheckCircle,
  completed: CheckCircle,
  'agent:completed': CheckCircle,
  error: XCircle,
  'agent:error': XCircle,
  retry: RefreshCw,
};

const EVENT_COLORS: Record<string, string> = {
  spawn: 'bg-blue-500',
  spawned: 'bg-blue-500',
  'agent:spawned': 'bg-blue-500',
  execute: 'bg-yellow-500',
  started: 'bg-yellow-500',
  'agent:started': 'bg-yellow-500',
  complete: 'bg-green-500',
  completed: 'bg-green-500',
  'agent:completed': 'bg-green-500',
  error: 'bg-red-500',
  'agent:error': 'bg-red-500',
  retry: 'bg-orange-500',
};

export const LifecycleTimeline: React.FC = () => {
  const { events, setSelectedNode } = useWebSocket();
  const [timeRange, setTimeRange] = useState<{ start: number; end: number } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  const filteredEvents = useMemo(() => {
    if (!timeRange) return events;

    return events.filter(
      (event) => toTimestampMs(event.timestamp) >= timeRange.start && toTimestampMs(event.timestamp) <= timeRange.end
    );
  }, [events, timeRange]);

  const timelineGroups = useMemo(() => {
    const groups: Map<string, LifecycleEvent[]> = new Map();

    filteredEvents.forEach((event) => {
      const existing = groups.get(event.agentId) || [];
      groups.set(event.agentId, [...existing, event]);
    });

    return Array.from(groups.entries()).map(([agentId, agentEvents]) => ({
      agentId,
      agentName: agentEvents[0]?.agentName || agentId,
      events: agentEvents.sort((a, b) => toTimestampMs(a.timestamp) - toTimestampMs(b.timestamp)),
    }));
  }, [filteredEvents]);

  const handleEventClick = (event: LifecycleEvent) => {
    setSelectedEvent(event.id);
    setSelectedNode(event.agentId);
  };

  const getEventPosition = (timestamp: string | number) => {
    if (filteredEvents.length === 0) return 0;

    const timestampMs = toTimestampMs(timestamp);
    const minTime = Math.min(...filteredEvents.map((e) => toTimestampMs(e.timestamp)));
    const maxTime = Math.max(...filteredEvents.map((e) => toTimestampMs(e.timestamp)));
    const range = maxTime - minTime;

    if (range === 0) return 50;

    return ((timestampMs - minTime) / range) * 100;
  };

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No lifecycle events available
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold text-gray-800">Lifecycle Timeline</h3>
        <p className="text-sm text-gray-500 mt-1">
          {filteredEvents.length} events
          {timeRange && ` (filtered)`}
        </p>
      </div>

      {/* Timeline Controls */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setTimeRange(null)}
            className={`px-3 py-1 text-sm rounded ${
              !timeRange
                ? 'bg-primary-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All Time
          </button>
          <button
            onClick={() => {
              const now = Date.now();
              setTimeRange({ start: now - 3600000, end: now }); // Last hour
            }}
            className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Last Hour
          </button>
          <button
            onClick={() => {
              const now = Date.now();
              setTimeRange({ start: now - 300000, end: now }); // Last 5 minutes
            }}
            className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Last 5 Minutes
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {timelineGroups.map((group) => (
          <div key={group.agentId} className="relative">
            {/* Agent Header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-primary-500" />
              <span className="font-semibold text-gray-800">{group.agentName}</span>
              <span className="text-xs text-gray-500">({group.events.length} events)</span>
            </div>

            {/* Timeline Track */}
            <div className="relative ml-6 h-8 bg-gray-100 rounded-full">
              {group.events.map((event) => {
                const Icon = EVENT_ICONS[event.type] || Clock;
                const colorClass = EVENT_COLORS[event.type] || 'bg-gray-500';
                const position = getEventPosition(event.timestamp);

                return (
                  <button
                    key={event.id}
                    onClick={() => handleEventClick(event)}
                    className={`absolute top-1/2 transform -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full flex items-center justify-center ${colorClass} text-white shadow-lg hover:scale-110 transition-transform ${
                      selectedEvent === event.id ? 'ring-4 ring-yellow-400' : ''
                    }`}
                    style={{ left: `${position}%` }}
                    title={`${event.type} - ${format(toTimestampMs(event.timestamp), 'HH:mm:ss')}`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>

            {/* Event Details (for selected) */}
            {selectedEvent && group.events.find((e) => e.id === selectedEvent) && (
              <div className="mt-3 ml-6 p-3 bg-gray-50 rounded-lg border">
                {(() => {
                  const event = group.events.find((e) => e.id === selectedEvent)!;
                  return (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-gray-800 capitalize">
                          {event.type}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDistance(toTimestampMs(event.timestamp), Date.now(), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <p>
                          <strong>Time:</strong> {format(toTimestampMs(event.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                        </p>
                        {event.duration && (
                          <p>
                            <strong>Duration:</strong> {event.duration}ms
                          </p>
                        )}
                        {event.status && (
                          <p>
                            <strong>Status:</strong>{' '}
                            <span
                              className={
                                event.status === 'success'
                                  ? 'text-green-600'
                                  : event.status === 'failure'
                                  ? 'text-red-600'
                                  : 'text-yellow-600'
                              }
                            >
                              {event.status}
                            </span>
                          </p>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="p-4 border-t bg-gray-50">
        <h4 className="text-xs font-semibold text-gray-600 mb-2">Event Types</h4>
        <div className="flex gap-4 flex-wrap">
          {[
            { type: 'spawn', Icon: PlayCircle, color: 'bg-blue-500' },
            { type: 'execute', Icon: Clock, color: 'bg-yellow-500' },
            { type: 'complete', Icon: CheckCircle, color: 'bg-green-500' },
            { type: 'error', Icon: XCircle, color: 'bg-red-500' },
            { type: 'retry', Icon: RefreshCw, color: 'bg-orange-500' },
          ].map(({ type, Icon, color }) => (
            <div key={type} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full ${color} flex items-center justify-center`}
              >
                <Icon className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs text-gray-600 capitalize">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
