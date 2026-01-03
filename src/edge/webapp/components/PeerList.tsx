/**
 * PeerList Component
 *
 * Displays a list of connected P2P peers with actions.
 *
 * @module edge/webapp/components/PeerList
 */

import React from 'react';
import type { PeerInfo } from '../types';

// ============================================
// Types
// ============================================

interface PeerListProps {
  peers: PeerInfo[];
  onDisconnect?: (peerId: string) => void;
  onSync?: (peerId: string) => void;
}

interface PeerItemProps {
  peer: PeerInfo;
  onDisconnect?: (peerId: string) => void;
  onSync?: (peerId: string) => void;
}

// ============================================
// Connection State Badge
// ============================================

const ConnectionBadge: React.FC<{ state: string }> = ({ state }) => {
  const styles: Record<string, string> = {
    connected: 'bg-green-100 text-green-800',
    connecting: 'bg-yellow-100 text-yellow-800',
    disconnected: 'bg-gray-100 text-gray-800',
    error: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[state] || styles.disconnected}`}>
      <span className={`w-2 h-2 mr-1.5 rounded-full ${state === 'connected' ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
      {state}
    </span>
  );
};

// ============================================
// PeerItem Component
// ============================================

const PeerItem: React.FC<PeerItemProps> = ({ peer, onDisconnect, onSync }) => {
  const timeSince = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center space-x-4">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold">
          {peer.id.slice(0, 2).toUpperCase()}
        </div>

        {/* Info */}
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-medium text-gray-900">
              {peer.id.slice(0, 8)}...{peer.id.slice(-4)}
            </span>
            <ConnectionBadge state={peer.connectionState} />
          </div>
          <div className="text-sm text-gray-500 flex items-center space-x-3">
            <span>Latency: {peer.latencyMs}ms</span>
            <span>Patterns: {peer.patternsShared}</span>
            <span>Last seen: {timeSince(peer.lastSeen)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-2">
        {onSync && peer.connectionState === 'connected' && (
          <button
            onClick={() => onSync(peer.id)}
            className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
          >
            Sync
          </button>
        )}
        {onDisconnect && (
          <button
            onClick={() => onDisconnect(peer.id)}
            className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
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

export const PeerList: React.FC<PeerListProps> = ({
  peers,
  onDisconnect,
  onSync,
}) => {
  if (peers.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
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
        <h3 className="mt-2 text-sm font-medium text-gray-900">No peers connected</h3>
        <p className="mt-1 text-sm text-gray-500">
          Connect to peers to start sharing patterns and syncing state.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {peers.map((peer) => (
        <PeerItem
          key={peer.id}
          peer={peer}
          onDisconnect={onDisconnect}
          onSync={onSync}
        />
      ))}
    </div>
  );
};

// ============================================
// PeerConnect Component
// ============================================

interface PeerConnectProps {
  onConnect: (peerId: string) => void;
  isConnecting?: boolean;
}

export const PeerConnect: React.FC<PeerConnectProps> = ({
  onConnect,
  isConnecting = false,
}) => {
  const [peerId, setPeerId] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (peerId.trim()) {
      onConnect(peerId.trim());
      setPeerId('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center space-x-3">
      <input
        type="text"
        value={peerId}
        onChange={(e) => setPeerId(e.target.value)}
        placeholder="Enter peer ID..."
        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
        disabled={isConnecting}
      />
      <button
        type="submit"
        disabled={!peerId.trim() || isConnecting}
        className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isConnecting ? (
          <span className="flex items-center">
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Connecting...
          </span>
        ) : (
          'Connect'
        )}
      </button>
    </form>
  );
};

export default PeerList;
