import React, { useEffect } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { DashboardHeader } from './DashboardHeader';
import { MindMap } from '../MindMap/MindMap';
import { QualityMetrics } from '../QualityMetrics/QualityMetrics';
import { EventTimeline } from '../EventTimeline/EventTimeline';
import './Dashboard.css';

interface TabConfig {
  id: 'overview' | 'mindmap' | 'metrics' | 'timeline';
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'mindmap', label: 'Mind Map', icon: '🗺️' },
  { id: 'metrics', label: 'Metrics', icon: '📈' },
  { id: 'timeline', label: 'Timeline', icon: '⏱️' },
];

export const Dashboard: React.FC = () => {
  const { activeView, setActiveView, exportData, refreshData, filters } = useDashboard();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'e':
            e.preventDefault();
            exportData();
            break;
          case 'r':
            e.preventDefault();
            refreshData();
            break;
          case 'f':
            e.preventDefault();
            // Focus search input
            const searchInput = document.querySelector('.search-input') as HTMLInputElement;
            if (searchInput) searchInput.focus();
            break;
          case '1':
            e.preventDefault();
            setActiveView('overview');
            break;
          case '2':
            e.preventDefault();
            setActiveView('mindmap');
            break;
          case '3':
            e.preventDefault();
            setActiveView('metrics');
            break;
          case '4':
            e.preventDefault();
            setActiveView('timeline');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [exportData, refreshData, setActiveView]);

  const renderContent = () => {
    switch (activeView) {
      case 'overview':
        return (
          <div className="overview-grid">
            <div className="overview-section">
              <h2>Key Metrics</h2>
              <QualityMetrics compact />
            </div>
            <div className="overview-section">
              <h2>Recent Events</h2>
              <EventTimeline compact maxItems={10} />
            </div>
            <div className="overview-section full-width">
              <h2>Agent Network</h2>
              <MindMap compact />
            </div>
          </div>
        );

      case 'mindmap':
        return (
          <div className="full-view">
            <MindMap />
          </div>
        );

      case 'metrics':
        return (
          <div className="full-view">
            <QualityMetrics />
          </div>
        );

      case 'timeline':
        return (
          <div className="full-view">
            <EventTimeline />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="dashboard">
      <DashboardHeader />

      <div className="dashboard-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeView === tab.id ? 'active' : ''}`}
            onClick={() => setActiveView(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="dashboard-content">
        {renderContent()}
      </div>

      <div className="dashboard-footer">
        <div className="footer-info">
          <span>
            Filters: {filters.sessionId ? '1 session' : 'All sessions'} •{' '}
            {filters.agents.length > 0 ? `${filters.agents.length} agents` : 'All agents'}
          </span>
        </div>
        <div className="footer-shortcuts">
          <kbd>Ctrl+E</kbd> Export •{' '}
          <kbd>Ctrl+R</kbd> Refresh •{' '}
          <kbd>Ctrl+F</kbd> Search •{' '}
          <kbd>Ctrl+1-4</kbd> Switch View
        </div>
      </div>
    </div>
  );
};
