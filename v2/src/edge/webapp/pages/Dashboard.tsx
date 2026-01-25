/**
 * Dashboard Page
 *
 * Main dashboard view for the P2P web application.
 * Uses dark theme with inline styles.
 *
 * @module edge/webapp/pages/Dashboard
 */

import React from 'react';
import { useP2P } from '../hooks/useP2P';
import {
  PeerListDark,
  ConnectionStatus,
  ConnectionControls,
  PatternSyncStatus,
  NetworkStats,
  QEAgentLauncher,
} from '../components';
import { CRDTVisualizer } from '../components/CRDTVisualizer';
import { selectors } from '../store/dashboardReducer';

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
  purple: '#8b5cf6',
};

// ============================================
// Styles
// ============================================

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: colors.bg,
    color: colors.text,
  },
  header: {
    padding: '1rem 1.5rem',
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.card,
  },
  headerContent: {
    maxWidth: '1400px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  logoIcon: {
    width: '40px',
    height: '40px',
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    borderRadius: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTitle: {
    fontSize: '1.25rem',
    fontWeight: 700,
    color: colors.text,
  },
  logoSubtitle: {
    fontSize: '0.75rem',
    color: colors.textMuted,
  },
  main: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '1.5rem',
  },
  section: {
    marginBottom: '1.5rem',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: colors.text,
    marginBottom: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: '1rem',
  },
  grid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '1rem',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: '0.5rem',
    border: `1px solid ${colors.border}`,
    padding: '1rem',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  cardTitle: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: '0.75rem',
    color: colors.textMuted,
  },
  footer: {
    padding: '1rem 1.5rem',
    borderTop: `1px solid ${colors.border}`,
    backgroundColor: colors.card,
    marginTop: '2rem',
  },
  footerContent: {
    maxWidth: '1400px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    color: colors.textMuted,
  },
  loadingScreen: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    color: colors.text,
  },
  loadingContent: {
    textAlign: 'center' as const,
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: `4px solid ${colors.border}`,
    borderTopColor: colors.info,
    borderRadius: '50%',
    margin: '0 auto',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '1rem',
    color: colors.textMuted,
  },
  errorScreen: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    color: colors.text,
    padding: '2rem',
  },
  errorCard: {
    backgroundColor: colors.card,
    borderRadius: '0.75rem',
    padding: '2rem',
    maxWidth: '400px',
    textAlign: 'center' as const,
    border: `1px solid ${colors.error}`,
  },
  errorTitle: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: colors.error,
    marginBottom: '0.5rem',
  },
  errorMessage: {
    color: colors.textMuted,
    marginBottom: '1rem',
  },
  retryButton: {
    padding: '0.5rem 1rem',
    backgroundColor: colors.info,
    color: colors.text,
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  quickActions: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.5rem',
  },
  actionButton: {
    padding: '0.625rem 1rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    borderRadius: '0.5rem',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  primaryAction: {
    backgroundColor: colors.info,
    color: colors.text,
  },
  successAction: {
    backgroundColor: colors.success,
    color: '#000000',
  },
  purpleAction: {
    backgroundColor: colors.purple,
    color: colors.text,
  },
  disabledAction: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

// ============================================
// Dashboard Component
// ============================================

export const Dashboard: React.FC = () => {
  const {
    state,
    isInitialized,
    isLoading,
    error,
    connect,
    disconnect,
    syncCRDT,
    addPattern,
    spawnAgent,
  } = useP2P({ autoInit: true });

  const [isConnecting, setIsConnecting] = React.useState(false);
  const [isSyncingPatterns, setIsSyncingPatterns] = React.useState(false);
  const [agentError, setAgentError] = React.useState<string | null>(null);

  // Handle peer connection - connect to first discovered peer
  const handleConnect = async () => {
    // Get peers from room that we haven't connected to yet
    const availablePeers = state.peers.filter(p => p.connectionState !== 'connected');
    if (availablePeers.length === 0) {
      console.log('[Dashboard] No available peers to connect to');
      return;
    }

    setIsConnecting(true);
    try {
      // Connect to first available peer
      const targetPeer = availablePeers[0];
      console.log(`[Dashboard] Connecting to peer: ${targetPeer.id}`);
      await connect(targetPeer.id);
    } finally {
      setIsConnecting(false);
    }
  };

  // Handle disconnect
  const handleDisconnect = async () => {
    // Disconnect all peers
    for (const peer of state.peers) {
      await disconnect(peer.id);
    }
  };

  // Handle pattern creation (demo)
  const handleAddPattern = async () => {
    const embedding = Array.from({ length: 128 }, () => Math.random() * 2 - 1);
    const patternName = `Demo Pattern ${Date.now().toString(36)}`;
    const categories = ['test', 'fix', 'refactor', 'feature', 'performance'];
    const category = categories[Math.floor(Math.random() * categories.length)];
    await addPattern(patternName, category, embedding);
  };

  // Handle pattern sync
  const handlePatternSync = async () => {
    setIsSyncingPatterns(true);
    try {
      for (const peer of state.peers) {
        await syncCRDT(peer.id);
      }
    } finally {
      setIsSyncingPatterns(false);
    }
  };

  // Loading state
  if (isLoading) {
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
        <div style={styles.loadingScreen}>
          <div style={styles.loadingContent}>
            <div style={styles.spinner} />
            <p style={styles.loadingText}>Initializing P2P service...</p>
          </div>
        </div>
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={styles.errorScreen}>
        <div style={styles.errorCard}>
          <h2 style={styles.errorTitle}>Initialization Error</h2>
          <p style={styles.errorMessage}>{error.message}</p>
          <button
            onClick={() => window.location.reload()}
            style={styles.retryButton}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const uptime = selectors.getUptime(state);

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>
              <svg
                width="24"
                height="24"
                fill="none"
                stroke="white"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
            </div>
            <div>
              <h1 style={styles.logoTitle}>Agentic QE</h1>
              <p style={styles.logoSubtitle}>P2P Dashboard</p>
            </div>
          </div>

          {/* Connection Status in Header */}
          <ConnectionStatus
            status={state.connectionStatus}
            agentId={state.localAgent?.id}
            uptime={uptime}
          />
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        {/* Connection Controls & Network Stats */}
        <section style={styles.section}>
          <div style={styles.grid2}>
            <ConnectionControls
              status={state.connectionStatus}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onReconnect={handleConnect}
              isLoading={isConnecting}
              showAdvanced={state.connectionStatus === 'connected'}
            />
            <NetworkStats
              metrics={state.metrics}
              peers={state.peers}
              compact={true}
            />
          </div>
        </section>

        {/* Pattern Sync & Network Details */}
        <section style={styles.section}>
          <div style={styles.grid2}>
            <PatternSyncStatus
              patterns={state.patterns}
              isSyncing={isSyncingPatterns}
              lastSyncTime={state.crdt.lastSync}
              onSync={handlePatternSync}
            />
            <NetworkStats
              metrics={state.metrics}
              peers={state.peers}
              showDetails={true}
            />
          </div>
        </section>

        {/* Peers & CRDT */}
        <section style={styles.section}>
          <div style={styles.grid2}>
            {/* Peers Section */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.cardTitle}>Connected Peers</h2>
                  <p style={styles.cardSubtitle}>
                    {state.peers.length} total peers
                  </p>
                </div>
              </div>
              <PeerListDark
                peers={state.peers}
                onDisconnect={disconnect}
                onSync={syncCRDT}
              />
            </div>

            {/* CRDT Section */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.cardTitle}>CRDT State</h2>
                  <p style={styles.cardSubtitle}>
                    {state.crdt.stores.length} stores |{' '}
                    {state.crdt.totalOperations} ops
                  </p>
                </div>
              </div>
              <CRDTVisualizer
                crdt={state.crdt}
                onInspect={(storeId) => console.log('Inspect:', storeId)}
              />
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section style={styles.section}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Quick Actions</h2>
            </div>
            <div style={styles.quickActions}>
              <button
                onClick={handleAddPattern}
                style={{ ...styles.actionButton, ...styles.primaryAction }}
              >
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Demo Pattern
              </button>
              <button
                onClick={handleConnect}
                style={{ ...styles.actionButton, ...styles.successAction }}
              >
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
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
                Connect Random Peer
              </button>
              <button
                onClick={() => state.peers.forEach((p) => syncCRDT(p.id))}
                disabled={state.peers.length === 0}
                style={{
                  ...styles.actionButton,
                  ...styles.purpleAction,
                  ...(state.peers.length === 0 ? styles.disabledAction : {}),
                }}
              >
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
                Sync All Peers
              </button>
            </div>
          </div>
        </section>

        {/* QE Agent Launcher */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>
            <span>🤖</span>
            QE Agents
          </h2>
          {agentError && (
            <div style={{
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              border: `1px solid ${colors.error}`,
              borderRadius: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span style={{ color: colors.error }}>⚠️</span>
              <span style={{ color: colors.error, flex: 1 }}>{agentError}</span>
              <button
                onClick={() => setAgentError(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: colors.textMuted,
                  cursor: 'pointer',
                  padding: '0.25rem',
                }}
              >
                ✕
              </button>
            </div>
          )}
          <QEAgentLauncher
            compact={false}
            onLaunch={async (agentType, task) => {
              // Clear previous error
              setAgentError(null);

              console.log(`[Dashboard] Launching ${agentType}:`, task);

              // Use the real Agent Spawn API
              const result = await spawnAgent(agentType, task);

              if (result.success && result.agentId) {
                console.log(`[Dashboard] Agent spawned: ${result.agentId}`);
                return result.agentId;
              } else {
                // Show error to user instead of silently failing
                const errorMessage = result.error || 'Failed to spawn agent. Is the Edge Server running?';
                console.error(`[Dashboard] Failed to spawn agent:`, errorMessage);
                setAgentError(errorMessage);
                throw new Error(errorMessage);
              }
            }}
          />
        </section>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <span>Agentic QE Dashboard v1.0.0</span>
          <span>Built with Phase 3 Browser Integration</span>
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;
