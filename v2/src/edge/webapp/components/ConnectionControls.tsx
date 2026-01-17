/**
 * ConnectionControls Component
 *
 * Provides buttons to connect/disconnect from the P2P network.
 * Uses inline styles with dark theme colors.
 *
 * @module edge/webapp/components/ConnectionControls
 */

import React from 'react';
import type { ConnectionStatus } from '../types';

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
  successHover: '#22c55e',
  error: '#ef4444',
  errorHover: '#dc2626',
  info: '#3b82f6',
  infoHover: '#2563eb',
  disabled: '#4b5563',
};

// ============================================
// Types
// ============================================

export interface ConnectionControlsProps {
  /** Current connection status */
  status: ConnectionStatus;
  /** Callback when connect is requested */
  onConnect: () => void;
  /** Callback when disconnect is requested */
  onDisconnect: () => void;
  /** Callback when reconnect is requested */
  onReconnect?: () => void;
  /** Whether an operation is in progress */
  isLoading?: boolean;
  /** Show additional controls */
  showAdvanced?: boolean;
}

// ============================================
// Styles
// ============================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
    padding: '1rem',
    backgroundColor: colors.card,
    borderRadius: '0.5rem',
    border: `1px solid ${colors.border}`,
  },
  title: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: colors.text,
    marginBottom: '0.25rem',
  },
  subtitle: {
    fontSize: '0.75rem',
    color: colors.textMuted,
    marginBottom: '0.5rem',
  },
  buttonRow: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap' as const,
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.625rem 1rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    borderRadius: '0.5rem',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    minWidth: '100px',
  },
  primaryButton: {
    backgroundColor: colors.success,
    color: '#000000',
  },
  dangerButton: {
    backgroundColor: colors.error,
    color: '#ffffff',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    color: colors.info,
    border: `1px solid ${colors.info}`,
  },
  disabledButton: {
    backgroundColor: colors.disabled,
    color: colors.textMuted,
    cursor: 'not-allowed',
    opacity: 0.7,
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid transparent',
    borderTopColor: 'currentColor',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  inputGroup: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  input: {
    flex: 1,
    padding: '0.625rem 0.75rem',
    fontSize: '0.875rem',
    color: colors.text,
    backgroundColor: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.5rem',
    outline: 'none',
  },
};

// ============================================
// Spinner Component
// ============================================

const Spinner: React.FC = () => (
  <>
    <style>
      {`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}
    </style>
    <div style={styles.spinner} />
  </>
);

// ============================================
// ConnectionControls Component
// ============================================

export const ConnectionControls: React.FC<ConnectionControlsProps> = ({
  status,
  onConnect,
  onDisconnect,
  onReconnect,
  isLoading = false,
  showAdvanced = false,
}) => {
  const [peerId, setPeerId] = React.useState('');
  const [isHovered, setIsHovered] = React.useState<string | null>(null);

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';
  const isDisconnected = status === 'disconnected';
  const hasError = status === 'error';

  const handleConnectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (peerId.trim()) {
      onConnect();
      setPeerId('');
    }
  };

  const getButtonStyle = (
    type: 'primary' | 'danger' | 'secondary',
    disabled: boolean,
    buttonId: string
  ) => {
    if (disabled || isLoading) {
      return { ...styles.button, ...styles.disabledButton };
    }

    const baseStyle = { ...styles.button };
    const typeStyles = {
      primary: styles.primaryButton,
      danger: styles.dangerButton,
      secondary: styles.secondaryButton,
    };

    const hoverStyles: Record<string, React.CSSProperties> = {
      primary: { backgroundColor: colors.successHover },
      danger: { backgroundColor: colors.errorHover },
      secondary: { backgroundColor: 'rgba(59, 130, 246, 0.1)' },
    };

    return {
      ...baseStyle,
      ...typeStyles[type],
      ...(isHovered === buttonId ? hoverStyles[type] : {}),
    };
  };

  return (
    <div style={styles.container}>
      <div>
        <h3 style={styles.title}>Network Controls</h3>
        <p style={styles.subtitle}>
          {isConnected
            ? 'Connected to P2P network'
            : isConnecting
            ? 'Establishing connection...'
            : hasError
            ? 'Connection error occurred'
            : 'Not connected to network'}
        </p>
      </div>

      <div style={styles.buttonRow}>
        {isDisconnected && (
          <button
            onClick={onConnect}
            disabled={isLoading}
            style={getButtonStyle('primary', false, 'connect')}
            onMouseEnter={() => setIsHovered('connect')}
            onMouseLeave={() => setIsHovered(null)}
          >
            {isLoading ? <Spinner /> : null}
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
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            Connect
          </button>
        )}

        {isConnecting && (
          <button
            disabled
            style={getButtonStyle('primary', true, 'connecting')}
          >
            <Spinner />
            Connecting...
          </button>
        )}

        {isConnected && (
          <button
            onClick={onDisconnect}
            disabled={isLoading}
            style={getButtonStyle('danger', false, 'disconnect')}
            onMouseEnter={() => setIsHovered('disconnect')}
            onMouseLeave={() => setIsHovered(null)}
          >
            {isLoading ? <Spinner /> : null}
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
                d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3"
              />
            </svg>
            Disconnect
          </button>
        )}

        {hasError && onReconnect && (
          <button
            onClick={onReconnect}
            disabled={isLoading}
            style={getButtonStyle('secondary', false, 'reconnect')}
            onMouseEnter={() => setIsHovered('reconnect')}
            onMouseLeave={() => setIsHovered(null)}
          >
            {isLoading ? <Spinner /> : null}
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
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Reconnect
          </button>
        )}
      </div>

      {showAdvanced && isConnected && (
        <form onSubmit={handleConnectSubmit} style={styles.inputGroup}>
          <input
            type="text"
            value={peerId}
            onChange={(e) => setPeerId(e.target.value)}
            placeholder="Enter peer ID to connect..."
            style={styles.input}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!peerId.trim() || isLoading}
            style={getButtonStyle('secondary', !peerId.trim(), 'submit')}
            onMouseEnter={() => setIsHovered('submit')}
            onMouseLeave={() => setIsHovered(null)}
          >
            Add Peer
          </button>
        </form>
      )}
    </div>
  );
};

export default ConnectionControls;
