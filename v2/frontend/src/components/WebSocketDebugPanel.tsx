/**
 * WebSocket Debug Panel Component
 * Phase 3 - Debugging and Monitoring
 */

import { useWebSocket } from '../hooks/useWebSocket';
import { ConnectionStatus } from '../types/websocket';

export function WebSocketDebugPanel() {
  const { status, stats, quality, isConnected } = useWebSocket({ autoConnect: false });

  const getStatusColor = (status: ConnectionStatus): string => {
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return 'green';
      case ConnectionStatus.CONNECTING:
      case ConnectionStatus.RECONNECTING:
        return 'yellow';
      case ConnectionStatus.ERROR:
        return 'red';
      default:
        return 'gray';
    }
  };

  const getQualityColor = (quality: string): string => {
    switch (quality) {
      case 'excellent':
        return 'green';
      case 'good':
        return 'blue';
      case 'poor':
        return 'orange';
      default:
        return 'gray';
    }
  };

  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      backgroundColor: 'white',
      border: '1px solid #ccc',
      borderRadius: '8px',
      padding: '16px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      minWidth: '300px',
      fontFamily: 'monospace',
      fontSize: '12px',
      zIndex: 9999,
    }}>
      <div style={{ marginBottom: '12px', fontWeight: 'bold', fontSize: '14px' }}>
        WebSocket Monitor
      </div>

      {/* Connection Status */}
      <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: getStatusColor(status),
            marginRight: '8px',
          }}
        />
        <span>Status: {status}</span>
      </div>

      {/* Connection Quality */}
      {isConnected && (
        <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: getQualityColor(quality),
              marginRight: '8px',
            }}
          />
          <span>Quality: {quality}</span>
        </div>
      )}

      {/* Statistics */}
      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #eee' }}>
        <div style={{ marginBottom: '4px' }}>
          <span style={{ color: '#666' }}>Sent:</span>{' '}
          <span style={{ fontWeight: 'bold' }}>{stats.messagesSent}</span>
        </div>
        <div style={{ marginBottom: '4px' }}>
          <span style={{ color: '#666' }}>Received:</span>{' '}
          <span style={{ fontWeight: 'bold' }}>{stats.messagesReceived}</span>
        </div>
        <div style={{ marginBottom: '4px' }}>
          <span style={{ color: '#666' }}>Reconnects:</span>{' '}
          <span style={{ fontWeight: 'bold' }}>{stats.reconnectAttempts}</span>
        </div>
        {isConnected && (
          <>
            <div style={{ marginBottom: '4px' }}>
              <span style={{ color: '#666' }}>Latency:</span>{' '}
              <span style={{ fontWeight: 'bold' }}>{stats.avgLatency.toFixed(2)}ms</span>
            </div>
            <div style={{ marginBottom: '4px' }}>
              <span style={{ color: '#666' }}>Uptime:</span>{' '}
              <span style={{ fontWeight: 'bold' }}>{formatUptime(stats.uptime)}</span>
            </div>
          </>
        )}
      </div>

      {/* Timestamps */}
      {stats.lastConnected && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #eee' }}>
          <div style={{ marginBottom: '4px', fontSize: '10px', color: '#999' }}>
            Last connected: {new Date(stats.lastConnected).toLocaleTimeString()}
          </div>
          {stats.lastDisconnected && (
            <div style={{ fontSize: '10px', color: '#999' }}>
              Last disconnected: {new Date(stats.lastDisconnected).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
