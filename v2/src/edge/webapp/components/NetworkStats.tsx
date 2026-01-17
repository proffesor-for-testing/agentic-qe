/**
 * NetworkStats Component
 *
 * Displays network statistics including bandwidth, latency, and peer count.
 * Uses inline styles with dark theme colors.
 *
 * @module edge/webapp/components/NetworkStats
 */

import React from 'react';
import type { SystemMetrics, PeerInfo } from '../types';

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
  cyan: '#22d3ee',
};

// ============================================
// Types
// ============================================

export interface NetworkStatsProps {
  /** System metrics */
  metrics: SystemMetrics;
  /** Connected peers */
  peers?: PeerInfo[];
  /** Show detailed breakdown */
  showDetails?: boolean;
  /** Compact display mode */
  compact?: boolean;
}

interface StatItemProps {
  label: string;
  value: string | number;
  unit?: string;
  status?: 'good' | 'warning' | 'critical';
  icon?: React.ReactNode;
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
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: colors.text,
  },
  titleIcon: {
    width: '20px',
    height: '20px',
    color: colors.cyan,
  },
  statsGrid: {
    display: 'grid',
    gap: '0.75rem',
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem',
    backgroundColor: colors.bg,
    borderRadius: '0.375rem',
    border: `1px solid ${colors.border}`,
  },
  statLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  statIcon: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '0.375rem',
  },
  statLabel: {
    fontSize: '0.75rem',
    color: colors.textMuted,
  },
  statValue: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.25rem',
  },
  statNumber: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: colors.text,
  },
  statUnit: {
    fontSize: '0.75rem',
    color: colors.textMuted,
  },
  statusIndicator: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  compactGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '0.5rem',
  },
  compactItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '0.75rem 0.5rem',
    backgroundColor: colors.bg,
    borderRadius: '0.375rem',
    border: `1px solid ${colors.border}`,
    textAlign: 'center' as const,
  },
  compactValue: {
    fontSize: '1rem',
    fontWeight: 600,
    color: colors.text,
  },
  compactLabel: {
    fontSize: '0.625rem',
    color: colors.textMuted,
    marginTop: '0.25rem',
  },
  detailsSection: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: `1px solid ${colors.border}`,
  },
  detailsTitle: {
    fontSize: '0.75rem',
    fontWeight: 500,
    color: colors.textMuted,
    marginBottom: '0.5rem',
  },
  peerLatencies: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  },
  peerLatencyItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
  },
  peerLatencyId: {
    color: colors.textMuted,
  },
  peerLatencyValue: {
    fontWeight: 500,
  },
};

// ============================================
// Helper Functions
// ============================================

const getLatencyStatus = (latency: number): 'good' | 'warning' | 'critical' => {
  if (latency < 50) return 'good';
  if (latency < 150) return 'warning';
  return 'critical';
};

const getStatusColor = (status: 'good' | 'warning' | 'critical'): string => {
  switch (status) {
    case 'good':
      return colors.success;
    case 'warning':
      return colors.warning;
    case 'critical':
      return colors.error;
  }
};

const formatUptime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

const formatBandwidth = (messagesPerSecond: number): string => {
  if (messagesPerSecond < 1) return messagesPerSecond.toFixed(2);
  if (messagesPerSecond < 10) return messagesPerSecond.toFixed(1);
  return Math.round(messagesPerSecond).toString();
};

// ============================================
// StatItem Component
// ============================================

const StatItem: React.FC<StatItemProps> = ({
  label,
  value,
  unit,
  status = 'good',
  icon,
}) => {
  const statusColor = getStatusColor(status);

  return (
    <div style={styles.statItem}>
      <div style={styles.statLeft}>
        {icon && (
          <div
            style={{
              ...styles.statIcon,
              backgroundColor: `${statusColor}15`,
              color: statusColor,
            }}
          >
            {icon}
          </div>
        )}
        <div>
          <div style={styles.statLabel}>{label}</div>
          <div style={styles.statValue}>
            <span style={{ ...styles.statNumber, color: statusColor }}>
              {value}
            </span>
            {unit && <span style={styles.statUnit}>{unit}</span>}
          </div>
        </div>
      </div>
      <div
        style={{
          ...styles.statusIndicator,
          backgroundColor: statusColor,
        }}
      />
    </div>
  );
};

// ============================================
// NetworkStats Component
// ============================================

export const NetworkStats: React.FC<NetworkStatsProps> = ({
  metrics,
  peers = [],
  showDetails = false,
  compact = false,
}) => {
  const latencyStatus = getLatencyStatus(metrics.networkLatency);
  const connectedPeers = peers.filter((p) => p.connectionState === 'connected');
  const avgLatency =
    connectedPeers.length > 0
      ? Math.round(
          connectedPeers.reduce((sum, p) => sum + p.latencyMs, 0) /
            connectedPeers.length
        )
      : 0;

  if (compact) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
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
              d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span style={styles.title}>Network</span>
        </div>
        <div style={styles.compactGrid}>
          <div style={styles.compactItem}>
            <span
              style={{
                ...styles.compactValue,
                color: getStatusColor(peers.length > 0 ? 'good' : 'warning'),
              }}
            >
              {connectedPeers.length}
            </span>
            <span style={styles.compactLabel}>Peers</span>
          </div>
          <div style={styles.compactItem}>
            <span
              style={{
                ...styles.compactValue,
                color: getStatusColor(latencyStatus),
              }}
            >
              {metrics.networkLatency}
            </span>
            <span style={styles.compactLabel}>Latency (ms)</span>
          </div>
          <div style={styles.compactItem}>
            <span style={styles.compactValue}>
              {formatBandwidth(metrics.messagesPerSecond)}
            </span>
            <span style={styles.compactLabel}>Msg/sec</span>
          </div>
          <div style={styles.compactItem}>
            <span style={styles.compactValue}>
              {formatUptime(metrics.uptime)}
            </span>
            <span style={styles.compactLabel}>Uptime</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
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
            d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span style={styles.title}>Network Statistics</span>
      </div>

      <div style={styles.statsGrid}>
        <StatItem
          label="Connected Peers"
          value={connectedPeers.length}
          unit={`/ ${peers.length} total`}
          status={connectedPeers.length > 0 ? 'good' : 'warning'}
          icon={
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          }
        />

        <StatItem
          label="Network Latency"
          value={metrics.networkLatency}
          unit="ms"
          status={latencyStatus}
          icon={
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          }
        />

        <StatItem
          label="Messages per Second"
          value={formatBandwidth(metrics.messagesPerSecond)}
          unit="msg/s"
          status="good"
          icon={
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
              />
            </svg>
          }
        />

        <StatItem
          label="Uptime"
          value={formatUptime(metrics.uptime)}
          status="good"
          icon={
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />

        <StatItem
          label="Memory Usage"
          value={metrics.memoryUsage}
          unit="MB"
          status={
            metrics.memoryUsage > 500
              ? 'critical'
              : metrics.memoryUsage > 300
              ? 'warning'
              : 'good'
          }
          icon={
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
              />
            </svg>
          }
        />

        <StatItem
          label="CPU Usage"
          value={metrics.cpuUsage}
          unit="%"
          status={
            metrics.cpuUsage > 80
              ? 'critical'
              : metrics.cpuUsage > 60
              ? 'warning'
              : 'good'
          }
          icon={
            <svg
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          }
        />
      </div>

      {showDetails && connectedPeers.length > 0 && (
        <div style={styles.detailsSection}>
          <div style={styles.detailsTitle}>
            Peer Latencies (avg: {avgLatency}ms)
          </div>
          <div style={styles.peerLatencies}>
            {connectedPeers.slice(0, 5).map((peer) => (
              <div key={peer.id} style={styles.peerLatencyItem}>
                <span style={styles.peerLatencyId}>
                  {peer.id.slice(0, 8)}...
                </span>
                <span
                  style={{
                    ...styles.peerLatencyValue,
                    color: getStatusColor(getLatencyStatus(peer.latencyMs)),
                  }}
                >
                  {peer.latencyMs}ms
                </span>
              </div>
            ))}
            {connectedPeers.length > 5 && (
              <div
                style={{
                  ...styles.peerLatencyItem,
                  justifyContent: 'center',
                }}
              >
                <span style={styles.peerLatencyId}>
                  +{connectedPeers.length - 5} more peers
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkStats;
