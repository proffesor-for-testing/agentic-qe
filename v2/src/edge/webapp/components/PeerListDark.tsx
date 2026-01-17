/**
 * PeerListDark Component
 *
 * Displays a list of connected P2P peers with status indicators.
 * Uses inline styles with dark theme colors.
 *
 * @module edge/webapp/components/PeerListDark
 */

import React from 'react';
import type { PeerInfo } from '../types';

// ============================================
// Theme Colors
// ============================================

const colors = {
  bg: '#111827',
  card: '#1f2937',
  border: '#374151',
  text: '#ffffff',
  textMuted: '#9ca3af',
  textSecondary: '#6b7280',
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#ef4444',
  info: '#3b82f6',
  hover: '#2d3748',
};

// ============================================
// Types
// ============================================

export interface PeerListProps {
  /** List of peers to display */
  peers: PeerInfo[];
  /** Callback when disconnect is requested */
  onDisconnect?: (peerId: string) => void;
  /** Callback when sync is requested */
  onSync?: (peerId: string) => void;
  /** Show compact view */
  compact?: boolean;
}

interface PeerItemProps {
  peer: PeerInfo;
  onDisconnect?: (peerId: string) => void;
  onSync?: (peerId: string) => void;
  compact?: boolean;
}

// ============================================
// Styles
// ============================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '3rem 1rem',
    backgroundColor: colors.card,
    borderRadius: '0.5rem',
    border: `1px dashed ${colors.border}`,
  },
  emptyIcon: {
    width: '48px',
    height: '48px',
    margin: '0 auto',
    color: colors.textSecondary,
  },
  emptyTitle: {
    marginTop: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: colors.text,
  },
  emptySubtitle: {
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    color: colors.textMuted,
  },
  peerItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem',
    backgroundColor: colors.card,
    borderRadius: '0.5rem',
    border: `1px solid ${colors.border}`,
    transition: 'background-color 0.15s ease',
  },
  peerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '0.875rem',
  },
  peerDetails: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  peerId: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  peerIdText: {
    fontWeight: 500,
    color: colors.text,
    fontSize: '0.875rem',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.125rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: 500,
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    marginRight: '0.375rem',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    color: colors.textMuted,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  button: {
    padding: '0.375rem 0.75rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    borderRadius: '0.375rem',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  syncButton: {
    backgroundColor: 'transparent',
    color: colors.info,
    border: `1px solid ${colors.info}`,
  },
  disconnectButton: {
    backgroundColor: 'transparent',
    color: colors.error,
    border: `1px solid ${colors.error}`,
  },
};

// ============================================
// Connection State Badge
// ============================================

const ConnectionBadge: React.FC<{ state: string }> = ({ state }) => {
  const getBadgeStyles = () => {
    switch (state) {
      case 'connected':
        return {
          backgroundColor: 'rgba(74, 222, 128, 0.1)',
          color: colors.success,
          dotColor: colors.success,
        };
      case 'connecting':
        return {
          backgroundColor: 'rgba(251, 191, 36, 0.1)',
          color: colors.warning,
          dotColor: colors.warning,
        };
      case 'error':
        return {
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          color: colors.error,
          dotColor: colors.error,
        };
      default:
        return {
          backgroundColor: 'rgba(107, 114, 128, 0.1)',
          color: colors.textSecondary,
          dotColor: colors.textSecondary,
        };
    }
  };

  const badgeColors = getBadgeStyles();

  return (
    <span
      style={{
        ...styles.badge,
        backgroundColor: badgeColors.backgroundColor,
        color: badgeColors.color,
      }}
    >
      <span
        style={{
          ...styles.statusDot,
          backgroundColor: badgeColors.dotColor,
        }}
      />
      {state}
    </span>
  );
};

// ============================================
// Peer Item Component
// ============================================

const PeerItem: React.FC<PeerItemProps> = ({ peer, onDisconnect, onSync, compact }) => {
  const [isHovered, setIsHovered] = React.useState(false);

  const timeSince = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const formatPeerId = (id: string): string => {
    if (id.length <= 12) return id;
    return `${id.slice(0, 8)}...${id.slice(-4)}`;
  };

  return (
    <div
      style={{
        ...styles.peerItem,
        backgroundColor: isHovered ? colors.hover : colors.card,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={styles.peerInfo}>
        {!compact && (
          <div style={styles.avatar}>
            {peer.id.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div style={styles.peerDetails}>
          <div style={styles.peerId}>
            <span style={styles.peerIdText}>{formatPeerId(peer.id)}</span>
            <ConnectionBadge state={peer.connectionState} />
          </div>
          <div style={styles.metaRow}>
            <span>Latency: {peer.latencyMs}ms</span>
            <span>Patterns: {peer.patternsShared}</span>
            <span>Last seen: {timeSince(peer.lastSeen)}</span>
          </div>
        </div>
      </div>

      <div style={styles.actions}>
        {onSync && peer.connectionState === 'connected' && (
          <button
            onClick={() => onSync(peer.id)}
            style={{ ...styles.button, ...styles.syncButton }}
          >
            Sync
          </button>
        )}
        {onDisconnect && (
          <button
            onClick={() => onDisconnect(peer.id)}
            style={{ ...styles.button, ...styles.disconnectButton }}
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================
// PeerList Component
// ============================================

export const PeerListDark: React.FC<PeerListProps> = ({
  peers,
  onDisconnect,
  onSync,
  compact = false,
}) => {
  if (peers.length === 0) {
    return (
      <div style={styles.emptyState}>
        <svg
          style={styles.emptyIcon}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        <h3 style={styles.emptyTitle}>No peers connected</h3>
        <p style={styles.emptySubtitle}>
          Connect to peers to start sharing patterns and syncing state.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {peers.map((peer) => (
        <PeerItem
          key={peer.id}
          peer={peer}
          onDisconnect={onDisconnect}
          onSync={onSync}
          compact={compact}
        />
      ))}
    </div>
  );
};

export default PeerListDark;
