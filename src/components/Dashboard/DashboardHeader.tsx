import React, { useState, useEffect } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import './DashboardHeader.css';

interface Session {
  id: string;
  name: string;
  startTime: Date;
  endTime?: Date;
}

export const DashboardHeader: React.FC = () => {
  const {
    filters,
    updateFilters,
    resetFilters,
    wsConnected,
    exportData,
    refreshData,
    notifications,
  } = useDashboard();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Mock data - in real app, fetch from API
  useEffect(() => {
    setSessions([
      { id: 'session-1', name: 'Test Run #1', startTime: new Date('2025-11-21T10:00:00') },
      { id: 'session-2', name: 'Test Run #2', startTime: new Date('2025-11-21T11:00:00') },
      { id: 'session-3', name: 'Test Run #3', startTime: new Date('2025-11-21T12:00:00') },
    ]);

    setAgents(['test-generator', 'coverage-analyzer', 'performance-tester', 'security-scanner']);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleTimeRangeChange = (range: 'today' | 'week' | 'month' | 'custom') => {
    const now = new Date();
    let start: Date | null = null;

    switch (range) {
      case 'today':
        start = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        start = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        start = new Date(now.setMonth(now.getMonth() - 1));
        break;
    }

    updateFilters({
      timeRange: { start, end: new Date() },
    });
  };

  const toggleAgent = (agent: string) => {
    const currentAgents = filters.agents;
    const newAgents = currentAgents.includes(agent)
      ? currentAgents.filter((a) => a !== agent)
      : [...currentAgents, agent];

    updateFilters({ agents: newAgents });
  };

  return (
    <header className="dashboard-header">
      <div className="header-left">
        <h1>AQE Dashboard</h1>
        <div className={`ws-status ${wsConnected ? 'connected' : 'disconnected'}`}>
          <span className="status-indicator"></span>
          <span className="status-text">
            {wsConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="header-center">
        <div className="filter-group">
          <label>Session:</label>
          <select
            value={filters.sessionId || ''}
            onChange={(e) => updateFilters({ sessionId: e.target.value || null })}
            className="filter-select"
          >
            <option value="">All Sessions</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Time Range:</label>
          <select
            onChange={(e) => handleTimeRangeChange(e.target.value as any)}
            className="filter-select"
          >
            <option value="">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        <button
          className="filter-toggle-btn"
          onClick={() => setShowFilters(!showFilters)}
          title="Toggle Filters (Ctrl+F)"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 4h14M6 8h8M8 12h4M10 16h0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Filters
        </button>
      </div>

      <div className="header-right">
        <div className="notification-container">
          <button
            className="notification-btn"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a6 6 0 016 6v3.586l1.707 1.707A1 1 0 0117 15h-4a3 3 0 01-6 0H3a1 1 0 01-.707-1.707L4 11.586V8a6 6 0 016-6z" />
            </svg>
            {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
          </button>

          {showNotifications && (
            <div className="notification-dropdown">
              <div className="notification-header">
                <h3>Notifications</h3>
                <button onClick={() => setShowNotifications(false)}>✕</button>
              </div>
              <div className="notification-list">
                {notifications.length === 0 ? (
                  <div className="notification-empty">No notifications</div>
                ) : (
                  notifications.slice(0, 10).map((notif) => (
                    <div
                      key={notif.id}
                      className={`notification-item ${notif.type} ${notif.read ? 'read' : 'unread'}`}
                    >
                      <div className="notification-content">
                        <strong>{notif.title}</strong>
                        <p>{notif.message}</p>
                        <span className="notification-time">
                          {notif.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          className="action-btn"
          onClick={refreshData}
          title="Refresh Data (Ctrl+R)"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" />
          </svg>
          Refresh
        </button>

        <button
          className="action-btn"
          onClick={exportData}
          title="Export Data (Ctrl+E)"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" />
          </svg>
          Export
        </button>

        <button
          className="action-btn secondary"
          onClick={resetFilters}
          title="Reset Filters"
        >
          Reset
        </button>
      </div>

      {showFilters && (
        <div className="filters-panel">
          <h3>Agent Filter</h3>
          <div className="agent-checkboxes">
            {agents.map((agent) => (
              <label key={agent} className="agent-checkbox">
                <input
                  type="checkbox"
                  checked={filters.agents.includes(agent)}
                  onChange={() => toggleAgent(agent)}
                />
                <span>{agent}</span>
              </label>
            ))}
          </div>

          <h3>Search</h3>
          <input
            type="text"
            placeholder="Search events, metrics..."
            value={filters.searchTerm}
            onChange={(e) => updateFilters({ searchTerm: e.target.value })}
            className="search-input"
          />
        </div>
      )}
    </header>
  );
};
