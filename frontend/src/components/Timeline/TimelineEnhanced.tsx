import React, { useState, useEffect, useMemo, useCallback } from 'react';
// @ts-ignore - react-window types issue
import { FixedSizeList } from 'react-window';
import {
  CheckCircle,
  XCircle,
  Clock,
  PlayCircle,
  RefreshCw,
  Download,
  Search,
  AlertCircle,
} from 'lucide-react';
import axios from 'axios';
import { format, formatDistance } from 'date-fns';

interface TimelineEvent {
  id: string;
  timestamp: string;
  agent_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  session_id: string;
  correlation_id?: string;
  status?: 'success' | 'failure' | 'pending';
  duration?: number;
}

interface EventsResponse {
  success: boolean;
  data: TimelineEvent[];
  metadata: {
    timestamp: string;
    request_id: string;
    pagination: {
      limit: number;
      offset: number;
      total: number;
      has_more: boolean;
    };
  };
}

interface TimelineEnhancedProps {
  sessionId?: string;
  autoRefresh?: boolean;
}

const API_BASE_URL = 'http://localhost:3001/api/visualization';

const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  spawn: PlayCircle,
  execute: Clock,
  complete: CheckCircle,
  error: XCircle,
  retry: RefreshCw,
  test_generated: CheckCircle,
  coverage_analyzed: CheckCircle,
  quality_gate_passed: CheckCircle,
  default: Clock,
};

const EVENT_COLORS: Record<string, string> = {
  spawn: 'bg-blue-500 text-white',
  execute: 'bg-yellow-500 text-white',
  complete: 'bg-green-500 text-white',
  error: 'bg-red-500 text-white',
  retry: 'bg-orange-500 text-white',
  test_generated: 'bg-green-500 text-white',
  coverage_analyzed: 'bg-blue-500 text-white',
  quality_gate_passed: 'bg-purple-500 text-white',
  default: 'bg-gray-500 text-white',
};

export const TimelineEnhanced: React.FC<TimelineEnhancedProps> = ({
  sessionId,
  autoRefresh = false,
}) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [filters, setFilters] = useState({
    agentId: '',
    eventType: '',
    searchQuery: '',
    startDate: '',
    endDate: '',
  });
  const [pagination, setPagination] = useState({
    limit: 100,
    offset: 0,
    total: 0,
    hasMore: false,
  });

  useEffect(() => {
    fetchEvents();
    if (autoRefresh) {
      const interval = setInterval(fetchEvents, 10000); // Refresh every 10s
      return () => clearInterval(interval);
    }
  }, [sessionId, filters, pagination.offset, autoRefresh]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const params: Record<string, any> = {
        limit: pagination.limit,
        offset: pagination.offset,
      };

      if (sessionId) params.session_id = sessionId;
      if (filters.agentId) params.agent_id = filters.agentId;
      if (filters.eventType) params.event_type = filters.eventType;
      if (filters.startDate) params.start_date = filters.startDate;
      if (filters.endDate) params.end_date = filters.endDate;
      if (filters.searchQuery) params.search_query = filters.searchQuery;

      const response = await axios.get<EventsResponse>(`${API_BASE_URL}/events`, { params });

      if (response.data.success) {
        setEvents(response.data.data);
        setPagination(prev => ({
          ...prev,
          total: response.data.metadata.pagination.total,
          hasMore: response.data.metadata.pagination.has_more,
        }));
        setError(null);
      } else {
        setError('Failed to fetch events');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = useMemo(() => {
    let filtered = events;

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(
        e =>
          e.agent_id.toLowerCase().includes(query) ||
          e.event_type.toLowerCase().includes(query) ||
          JSON.stringify(e.payload).toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [events, filters.searchQuery]);

  const uniqueAgents = useMemo(() => {
    return Array.from(new Set(events.map(e => e.agent_id))).sort();
  }, [events]);

  const uniqueEventTypes = useMemo(() => {
    return Array.from(new Set(events.map(e => e.event_type))).sort();
  }, [events]);

  const exportData = (format: 'json' | 'csv') => {
    if (format === 'json') {
      const dataStr = JSON.stringify(filteredEvents, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `timeline-events-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (format === 'csv') {
      const headers = ['id', 'timestamp', 'agent_id', 'event_type', 'session_id', 'status', 'duration'];
      const rows = filteredEvents.map(e => [
        e.id,
        e.timestamp,
        e.agent_id,
        e.event_type,
        e.session_id,
        e.status || '',
        e.duration || '',
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `timeline-events-${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const renderEventRow = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const event = filteredEvents[index];
      const Icon = EVENT_ICONS[event.event_type] || EVENT_ICONS.default;
      const colorClass = EVENT_COLORS[event.event_type] || EVENT_COLORS.default;

      return (
        <div
          style={style}
          className={`flex items-center gap-4 px-4 py-2 border-b hover:bg-gray-50 cursor-pointer ${
            selectedEvent?.id === event.id ? 'bg-blue-50' : ''
          }`}
          onClick={() => setSelectedEvent(event)}
        >
          {/* Icon */}
          <div className={`w-8 h-8 rounded-full ${colorClass} flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-4 h-4" />
          </div>

          {/* Event Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800 truncate">{event.event_type}</span>
              <span className="text-xs text-gray-500">{event.agent_id}</span>
            </div>
            <div className="text-xs text-gray-600 mt-1">
              {format(new Date(event.timestamp), 'MMM dd, HH:mm:ss')} •{' '}
              {formatDistance(new Date(event.timestamp), new Date(), { addSuffix: true })}
            </div>
          </div>

          {/* Status Badge */}
          {event.status && (
            <div
              className={`px-2 py-1 rounded text-xs font-semibold ${
                event.status === 'success'
                  ? 'bg-green-100 text-green-700'
                  : event.status === 'failure'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {event.status}
            </div>
          )}

          {/* Duration */}
          {event.duration && (
            <div className="text-xs text-gray-600 flex-shrink-0">{event.duration}ms</div>
          )}
        </div>
      );
    },
    [filteredEvents, selectedEvent]
  );

  if (loading && events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-600">
        <AlertCircle className="w-12 h-12 mb-4" />
        <p className="text-lg font-semibold">Error Loading Events</p>
        <p className="text-sm text-gray-600 mt-2">{error}</p>
        <button
          onClick={fetchEvents}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Event Timeline</h3>
            <p className="text-sm text-gray-500 mt-1">
              {pagination.total.toLocaleString()} total events
              {filteredEvents.length !== events.length && ` (${filteredEvents.length} filtered)`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportData('json')}
              className="p-2 hover:bg-gray-100 rounded"
              title="Export as JSON"
            >
              <Download className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={() => exportData('csv')}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Export CSV
            </button>
            <button
              onClick={fetchEvents}
              disabled={loading}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search events..."
              value={filters.searchQuery}
              onChange={e => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
              className="pl-10 pr-3 py-2 w-full border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <select
            value={filters.agentId}
            onChange={e => setFilters(prev => ({ ...prev, agentId: e.target.value }))}
            className="px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Agents</option>
            {uniqueAgents.map(agent => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>

          <select
            value={filters.eventType}
            onChange={e => setFilters(prev => ({ ...prev, eventType: e.target.value }))}
            className="px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Event Types</option>
            {uniqueEventTypes.map(type => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Event List with Virtual Scrolling */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1">
          {filteredEvents.length > 0 ? (
            <FixedSizeList
              height={500}
              itemCount={filteredEvents.length}
              itemSize={80}
              width="100%"
              overscanCount={5}
            >
              {renderEventRow}
            </FixedSizeList>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              No events match your filters
            </div>
          )}
        </div>

        {/* Event Detail Panel */}
        {selectedEvent && (
          <div className="w-96 border-l p-4 overflow-auto bg-gray-50">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-gray-800">Event Details</h4>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <DetailRow label="ID" value={selectedEvent.id} />
              <DetailRow label="Agent" value={selectedEvent.agent_id} />
              <DetailRow label="Event Type" value={selectedEvent.event_type} />
              <DetailRow
                label="Timestamp"
                value={format(new Date(selectedEvent.timestamp), 'yyyy-MM-dd HH:mm:ss')}
              />
              <DetailRow label="Session" value={selectedEvent.session_id} />
              {selectedEvent.correlation_id && (
                <DetailRow label="Correlation ID" value={selectedEvent.correlation_id} />
              )}
              {selectedEvent.status && <DetailRow label="Status" value={selectedEvent.status} />}
              {selectedEvent.duration && (
                <DetailRow label="Duration" value={`${selectedEvent.duration}ms`} />
              )}

              <div className="pt-3 border-t">
                <p className="text-sm font-semibold text-gray-700 mb-2">Payload</p>
                <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-96">
                  {JSON.stringify(selectedEvent.payload, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.hasMore && (
        <div className="p-4 border-t flex items-center justify-between">
          <button
            onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
            disabled={pagination.offset === 0}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Showing {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
          </span>
          <button
            onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
            disabled={!pagination.hasMore}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

interface DetailRowProps {
  label: string;
  value: string;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-500 mb-1">{label}</p>
    <p className="text-sm text-gray-800 font-mono break-all">{value}</p>
  </div>
);
