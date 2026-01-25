/**
 * PatternSyncStatus Component
 *
 * Displays pattern synchronization progress and count.
 * Uses inline styles with dark theme colors.
 *
 * @module edge/webapp/components/PatternSyncStatus
 */

import React from 'react';
import type { PatternStats } from '../types';

// ============================================
// Theme Colors
// ============================================

const colors = {
  bg: '#111827',
  card: '#1f2937',
  border: '#374151',
  text: '#ffffff',
  textMuted: '#9ca3af',
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#ef4444',
  info: '#3b82f6',
  purple: '#a855f7',
};

// ============================================
// Types
// ============================================

export interface PatternSyncStatusProps {
  /** Pattern statistics */
  patterns: PatternStats;
  /** Whether sync is in progress */
  isSyncing?: boolean;
  /** Last sync timestamp */
  lastSyncTime?: number;
  /** Callback to trigger sync */
  onSync?: () => void;
}

// ============================================
// Styles
// ============================================

const styles = {
  container: {
    padding: '1rem',
    backgroundColor: colors.card,
    borderRadius: '0.5rem',
    border: `1px solid ${colors.border}`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: colors.text,
  },
  titleIcon: {
    width: '20px',
    height: '20px',
    color: colors.purple,
  },
  syncButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    padding: '0.375rem 0.625rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: colors.info,
    backgroundColor: 'transparent',
    border: `1px solid ${colors.info}`,
    borderRadius: '0.375rem',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.75rem',
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '0.75rem',
    backgroundColor: colors.bg,
    borderRadius: '0.375rem',
    border: `1px solid ${colors.border}`,
  },
  statValue: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: colors.text,
  },
  statLabel: {
    fontSize: '0.75rem',
    color: colors.textMuted,
    marginTop: '0.125rem',
  },
  progressSection: {
    marginTop: '1rem',
  },
  progressHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
  },
  progressLabel: {
    fontSize: '0.75rem',
    color: colors.textMuted,
  },
  progressValue: {
    fontSize: '0.75rem',
    fontWeight: 500,
    color: colors.text,
  },
  progressBar: {
    height: '8px',
    backgroundColor: colors.bg,
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  categoriesSection: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: `1px solid ${colors.border}`,
  },
  categoriesTitle: {
    fontSize: '0.75rem',
    fontWeight: 500,
    color: colors.textMuted,
    marginBottom: '0.5rem',
  },
  categoriesList: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.5rem',
  },
  categoryBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.25rem 0.5rem',
    fontSize: '0.75rem',
    color: colors.text,
    backgroundColor: colors.bg,
    borderRadius: '9999px',
    border: `1px solid ${colors.border}`,
  },
  categoryCount: {
    fontSize: '0.625rem',
    fontWeight: 600,
    color: colors.info,
  },
  lastSync: {
    marginTop: '0.75rem',
    fontSize: '0.75rem',
    color: colors.textMuted,
    textAlign: 'center' as const,
  },
  spinner: {
    width: '12px',
    height: '12px',
    border: '2px solid transparent',
    borderTopColor: 'currentColor',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

// ============================================
// Helper Functions
// ============================================

const formatTimeSince = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const getSyncPercentage = (patterns: PatternStats): number => {
  if (patterns.total === 0) return 100;
  return Math.round((patterns.synced / patterns.total) * 100);
};

// ============================================
// PatternSyncStatus Component
// ============================================

export const PatternSyncStatus: React.FC<PatternSyncStatusProps> = ({
  patterns,
  isSyncing = false,
  lastSyncTime,
  onSync,
}) => {
  const syncPercentage = getSyncPercentage(patterns);
  const hasCategories = Object.keys(patterns.categories).length > 0;

  const getProgressColor = () => {
    if (syncPercentage === 100) return colors.success;
    if (syncPercentage >= 75) return colors.info;
    if (syncPercentage >= 50) return colors.warning;
    return colors.error;
  };

  return (
    <>
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.title}>
            <svg
              style={styles.titleIcon}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
              />
            </svg>
            Pattern Sync
          </div>
          {onSync && (
            <button
              onClick={onSync}
              disabled={isSyncing}
              style={{
                ...styles.syncButton,
                opacity: isSyncing ? 0.6 : 1,
                cursor: isSyncing ? 'not-allowed' : 'pointer',
              }}
            >
              {isSyncing ? (
                <div style={styles.spinner} />
              ) : (
                <svg
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              )}
              {isSyncing ? 'Syncing...' : 'Sync'}
            </button>
          )}
        </div>

        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <span style={styles.statValue}>{patterns.total}</span>
            <span style={styles.statLabel}>Total Patterns</span>
          </div>
          <div style={styles.statCard}>
            <span style={{ ...styles.statValue, color: colors.success }}>
              {patterns.synced}
            </span>
            <span style={styles.statLabel}>Synced</span>
          </div>
          <div style={styles.statCard}>
            <span style={{ ...styles.statValue, color: colors.info }}>
              {patterns.local}
            </span>
            <span style={styles.statLabel}>Local Only</span>
          </div>
          <div style={styles.statCard}>
            <span
              style={{
                ...styles.statValue,
                color: patterns.pending > 0 ? colors.warning : colors.textMuted,
              }}
            >
              {patterns.pending}
            </span>
            <span style={styles.statLabel}>Pending</span>
          </div>
        </div>

        <div style={styles.progressSection}>
          <div style={styles.progressHeader}>
            <span style={styles.progressLabel}>Sync Progress</span>
            <span style={styles.progressValue}>{syncPercentage}%</span>
          </div>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${syncPercentage}%`,
                backgroundColor: getProgressColor(),
              }}
            />
          </div>
        </div>

        {hasCategories && (
          <div style={styles.categoriesSection}>
            <div style={styles.categoriesTitle}>Categories</div>
            <div style={styles.categoriesList}>
              {Object.entries(patterns.categories).map(([category, count]) => (
                <span key={category} style={styles.categoryBadge}>
                  {category}
                  <span style={styles.categoryCount}>{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {lastSyncTime && (
          <div style={styles.lastSync}>
            Last synced: {formatTimeSince(lastSyncTime)}
          </div>
        )}
      </div>
    </>
  );
};

export default PatternSyncStatus;
