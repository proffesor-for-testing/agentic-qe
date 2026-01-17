/**
 * ConnectionStatus Component
 *
 * Displays the current connection state with a visual indicator.
 * Uses inline styles with dark theme colors.
 *
 * @module edge/webapp/components/ConnectionStatus
 */

import React from 'react';
import type { ConnectionStatus as ConnectionStatusType } from '../types';

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
};

// ============================================
// Types
// ============================================

export interface ConnectionStatusProps {
  /** Current connection status */
  status: ConnectionStatusType;
  /** Agent ID (optional) */
  agentId?: string;
  /** Uptime string (optional) */
  uptime?: string;
  /** Show detailed info */
  showDetails?: boolean;
}

// ============================================
// Helper Functions
// ============================================

const getStatusConfig = (status: ConnectionStatusType) => {
  switch (status) {
    case 'connected':
      return {
        color: colors.success,
        bgColor: 'rgba(74, 222, 128, 0.1)',
        borderColor: 'rgba(74, 222, 128, 0.3)',
        label: 'Connected',
        pulse: false,
      };
    case 'connecting':
      return {
        color: colors.warning,
        bgColor: 'rgba(251, 191, 36, 0.1)',
        borderColor: 'rgba(251, 191, 36, 0.3)',
        label: 'Connecting...',
        pulse: true,
      };
    case 'error':
      return {
        color: colors.error,
        bgColor: 'rgba(239, 68, 68, 0.1)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
        label: 'Error',
        pulse: false,
      };
    default:
      return {
        color: colors.textMuted,
        bgColor: 'rgba(156, 163, 175, 0.1)',
        borderColor: 'rgba(156, 163, 175, 0.3)',
        label: 'Disconnected',
        pulse: false,
      };
  }
};

// ============================================
// Styles
// ============================================

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    backgroundColor: colors.card,
    borderRadius: '0.5rem',
    border: `1px solid ${colors.border}`,
  },
  iconContainer: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
  },
  pulseRing: {
    position: 'absolute' as const,
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    animation: 'pulse 2s ease-in-out infinite',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  statusLabel: {
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  details: {
    fontSize: '0.75rem',
    color: colors.textMuted,
    marginTop: '0.125rem',
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.375rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: 500,
  },
};

// ============================================
// ConnectionStatus Component
// ============================================

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  agentId,
  uptime,
  showDetails = true,
}) => {
  const config = getStatusConfig(status);

  return (
    <>
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 0.2; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
          }
        `}
      </style>
      <div
        style={{
          ...styles.container,
          borderColor: config.borderColor,
        }}
      >
        <div style={styles.iconContainer}>
          <div
            style={{
              ...styles.statusDot,
              backgroundColor: config.color,
            }}
          />
          {config.pulse && (
            <div
              style={{
                ...styles.pulseRing,
                backgroundColor: config.color,
                opacity: 0.3,
              }}
            />
          )}
        </div>
        <div style={styles.content}>
          <span
            style={{
              ...styles.statusLabel,
              color: config.color,
            }}
          >
            {config.label}
          </span>
          {showDetails && (agentId || uptime) && (
            <span style={styles.details}>
              {agentId && `Agent: ${agentId.slice(0, 8)}...`}
              {agentId && uptime && ' | '}
              {uptime && `Uptime: ${uptime}`}
            </span>
          )}
        </div>
        <div
          style={{
            ...styles.badge,
            backgroundColor: config.bgColor,
            color: config.color,
          }}
        >
          <svg
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          P2P
        </div>
      </div>
    </>
  );
};

export default ConnectionStatus;
