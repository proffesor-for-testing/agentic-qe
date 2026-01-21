/**
 * QE Agent Launcher Component
 *
 * Provides UI to spawn QE agents from the dashboard.
 *
 * @module edge/webapp/components/QEAgentLauncher
 */

import React, { useState, useCallback } from 'react';

// ============================================
// Types
// ============================================

export interface QEAgentType {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'testing' | 'analysis' | 'quality' | 'security';
  capabilities: string[];
}

export interface LaunchedAgent {
  id: string;
  type: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  startedAt: number;
  task?: string;
}

export interface QEAgentLauncherProps {
  onLaunch?: (agentType: string, task: string) => Promise<string>;
  launchedAgents?: LaunchedAgent[];
  compact?: boolean;
}

// ============================================
// Available QE Agents
// ============================================

const QE_AGENTS: QEAgentType[] = [
  {
    id: 'qe-test-generator',
    name: 'Test Generator',
    description: 'AI-powered test generation with TDD patterns',
    icon: '🧪',
    category: 'testing',
    capabilities: ['unit-tests', 'integration-tests', 'property-based'],
  },
  {
    id: 'qe-coverage-analyzer',
    name: 'Coverage Analyzer',
    description: 'O(log n) coverage gap detection',
    icon: '📊',
    category: 'analysis',
    capabilities: ['gap-detection', 'risk-scoring', 'recommendations'],
  },
  {
    id: 'qe-test-writer',
    name: 'TDD Writer',
    description: 'RED phase - writes failing tests first',
    icon: '🔴',
    category: 'testing',
    capabilities: ['tdd-red', 'behavior-specs', 'edge-cases'],
  },
  {
    id: 'qe-test-implementer',
    name: 'TDD Implementer',
    description: 'GREEN phase - minimal code to pass tests',
    icon: '🟢',
    category: 'testing',
    capabilities: ['tdd-green', 'minimal-impl', 'incremental'],
  },
  {
    id: 'qe-test-refactorer',
    name: 'TDD Refactorer',
    description: 'REFACTOR phase - improve code quality',
    icon: '🔵',
    category: 'quality',
    capabilities: ['tdd-refactor', 'clean-code', 'patterns'],
  },
  {
    id: 'qe-security-scanner',
    name: 'Security Scanner',
    description: 'SAST/DAST vulnerability detection',
    icon: '🔒',
    category: 'security',
    capabilities: ['sast', 'dast', 'owasp-top10', 'compliance'],
  },
  {
    id: 'qe-performance-tester',
    name: 'Performance Tester',
    description: 'Load testing and bottleneck detection',
    icon: '⚡',
    category: 'analysis',
    capabilities: ['load-test', 'stress-test', 'profiling'],
  },
  {
    id: 'qe-flaky-investigator',
    name: 'Flaky Test Hunter',
    description: 'Detect and fix flaky tests',
    icon: '🎯',
    category: 'quality',
    capabilities: ['flaky-detection', 'root-cause', 'stabilization'],
  },
  {
    id: 'qe-code-reviewer',
    name: 'Code Reviewer',
    description: 'Quality standards and best practices',
    icon: '👁️',
    category: 'quality',
    capabilities: ['code-review', 'linting', 'complexity'],
  },
  {
    id: 'qe-api-validator',
    name: 'API Contract Validator',
    description: 'OpenAPI/GraphQL contract testing',
    icon: '📡',
    category: 'testing',
    capabilities: ['contract-test', 'schema-validation', 'breaking-changes'],
  },
];

// ============================================
// Styles
// ============================================

const colors = {
  bg: '#111827',
  card: '#1f2937',
  cardHover: '#374151',
  border: '#374151',
  text: '#ffffff',
  textMuted: '#9ca3af',
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#ef4444',
  info: '#3b82f6',
  purple: '#8b5cf6',
};

const styles = {
  container: {
    backgroundColor: colors.card,
    borderRadius: '0.5rem',
    border: `1px solid ${colors.border}`,
    overflow: 'hidden',
  },
  header: {
    padding: '1rem',
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: '1rem',
    fontWeight: 600,
    color: colors.text,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  agentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '0.75rem',
    padding: '1rem',
  },
  agentCard: {
    backgroundColor: colors.bg,
    borderRadius: '0.5rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid' as const,
    borderTopColor: colors.border,
    borderRightWidth: '1px',
    borderRightStyle: 'solid' as const,
    borderRightColor: colors.border,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid' as const,
    borderBottomColor: colors.border,
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid' as const,
    borderLeftColor: colors.border,
    padding: '0.75rem',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  agentCardHover: {
    backgroundColor: colors.cardHover,
    borderTopColor: colors.info,
    borderRightColor: colors.info,
    borderBottomColor: colors.info,
  },
  agentIcon: {
    fontSize: '1.5rem',
    marginBottom: '0.5rem',
  },
  agentName: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: colors.text,
    marginBottom: '0.25rem',
  },
  agentDesc: {
    fontSize: '0.75rem',
    color: colors.textMuted,
    marginBottom: '0.5rem',
    lineHeight: 1.4,
  },
  capabilities: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.25rem',
  },
  tag: {
    fontSize: '0.625rem',
    padding: '0.125rem 0.375rem',
    backgroundColor: colors.card,
    borderRadius: '0.25rem',
    color: colors.textMuted,
  },
  launchButton: {
    marginTop: '0.5rem',
    width: '100%',
    padding: '0.5rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    backgroundColor: colors.info,
    color: colors.text,
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
  },
  launchButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  modal: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: '0.75rem',
    border: `1px solid ${colors.border}`,
    padding: '1.5rem',
    maxWidth: '500px',
    width: '90%',
  },
  modalTitle: {
    fontSize: '1.125rem',
    fontWeight: 600,
    color: colors.text,
    marginBottom: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '0.875rem',
    backgroundColor: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.5rem',
    color: colors.text,
    marginBottom: '1rem',
  },
  textarea: {
    width: '100%',
    padding: '0.75rem',
    fontSize: '0.875rem',
    backgroundColor: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.5rem',
    color: colors.text,
    marginBottom: '1rem',
    minHeight: '100px',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  },
  modalActions: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '0.5rem 1rem',
    fontSize: '0.875rem',
    backgroundColor: 'transparent',
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.5rem',
    cursor: 'pointer',
  },
  confirmButton: {
    padding: '0.5rem 1rem',
    fontSize: '0.875rem',
    backgroundColor: colors.info,
    color: colors.text,
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
  },
  runningAgents: {
    padding: '1rem',
    borderTop: `1px solid ${colors.border}`,
  },
  runningTitle: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: colors.text,
    marginBottom: '0.75rem',
  },
  agentStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem',
    backgroundColor: colors.bg,
    borderRadius: '0.375rem',
    marginBottom: '0.5rem',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  commandBox: {
    marginTop: '1rem',
    padding: '0.75rem',
    backgroundColor: colors.bg,
    borderRadius: '0.5rem',
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    color: colors.success,
    wordBreak: 'break-all' as const,
  },
};

// ============================================
// Component
// ============================================

export const QEAgentLauncher: React.FC<QEAgentLauncherProps> = ({
  onLaunch,
  launchedAgents = [],
  compact = false,
}) => {
  const [selectedAgent, setSelectedAgent] = useState<QEAgentType | null>(null);
  const [taskDescription, setTaskDescription] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [lastCommand, setLastCommand] = useState<string | null>(null);

  const handleLaunch = useCallback(async () => {
    if (!selectedAgent || !taskDescription.trim()) return;

    setIsLaunching(true);

    try {
      if (onLaunch) {
        await onLaunch(selectedAgent.id, taskDescription);
      }

      // Generate CLI command for reference (properly escape for shell)
      // Escape all shell-dangerous characters: " ' ` $ \ ! and newlines
      const safeTask = taskDescription
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$')
        .replace(/!/g, '\\!')
        .replace(/\n/g, '\\n');
      const command = `npx aqe spawn ${selectedAgent.id} --task "${safeTask}"`;
      setLastCommand(command);

      console.log(`[QE Agent] Launching ${selectedAgent.name}:`, taskDescription);
    } finally {
      setIsLaunching(false);
      setSelectedAgent(null);
      setTaskDescription('');
    }
  }, [selectedAgent, taskDescription, onLaunch]);

  const getStatusColor = (status: LaunchedAgent['status']) => {
    switch (status) {
      case 'running':
        return colors.info;
      case 'completed':
        return colors.success;
      case 'error':
        return colors.error;
      default:
        return colors.warning;
    }
  };

  const categoryColors: Record<string, string> = {
    testing: colors.info,
    analysis: colors.purple,
    quality: colors.success,
    security: colors.warning,
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>
          <span>🤖</span>
          QE Agent Launcher
        </h2>
        <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>
          {QE_AGENTS.length} agents available
        </span>
      </div>

      {/* Agent Grid */}
      <div style={styles.agentGrid}>
        {QE_AGENTS.slice(0, compact ? 4 : undefined).map((agent) => (
          <div
            key={agent.id}
            style={{
              ...styles.agentCard,
              ...(hoveredAgent === agent.id ? styles.agentCardHover : {}),
              borderLeftColor: categoryColors[agent.category],
              borderLeftWidth: '3px',
            }}
            onMouseEnter={() => setHoveredAgent(agent.id)}
            onMouseLeave={() => setHoveredAgent(null)}
          >
            <div style={styles.agentIcon}>{agent.icon}</div>
            <div style={styles.agentName}>{agent.name}</div>
            <div style={styles.agentDesc}>{agent.description}</div>
            <div style={styles.capabilities}>
              {agent.capabilities.slice(0, 3).map((cap) => (
                <span key={cap} style={styles.tag}>
                  {cap}
                </span>
              ))}
            </div>
            <button
              style={styles.launchButton}
              onClick={() => setSelectedAgent(agent)}
            >
              <span>▶</span>
              Launch
            </button>
          </div>
        ))}
      </div>

      {/* Running Agents */}
      {launchedAgents.length > 0 && (
        <div style={styles.runningAgents}>
          <div style={styles.runningTitle}>Running Agents</div>
          {launchedAgents.map((agent) => (
            <div key={agent.id} style={styles.agentStatus}>
              <div
                style={{
                  ...styles.statusDot,
                  backgroundColor: getStatusColor(agent.status),
                  animation: agent.status === 'running' ? 'pulse 1.5s infinite' : 'none',
                }}
              />
              <span style={{ fontSize: '0.875rem', color: colors.text }}>
                {agent.name}
              </span>
              <span style={{ fontSize: '0.75rem', color: colors.textMuted, marginLeft: 'auto' }}>
                {agent.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Last Command */}
      {lastCommand && (
        <div style={{ padding: '0 1rem 1rem' }}>
          <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginBottom: '0.5rem' }}>
            Run this command in your terminal:
          </div>
          <div style={styles.commandBox}>
            {lastCommand}
          </div>
        </div>
      )}

      {/* Launch Modal */}
      {selectedAgent && (
        <div style={styles.modal} onClick={() => setSelectedAgent(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>
              <span>{selectedAgent.icon}</span>
              Launch {selectedAgent.name}
            </h3>
            <p style={{ fontSize: '0.875rem', color: colors.textMuted, marginBottom: '1rem' }}>
              {selectedAgent.description}
            </p>
            <label style={{ fontSize: '0.75rem', color: colors.textMuted, display: 'block', marginBottom: '0.5rem' }}>
              Task Description
            </label>
            <textarea
              style={styles.textarea}
              placeholder={`Describe what you want the ${selectedAgent.name} to do...`}
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              autoFocus
            />
            <div style={styles.modalActions}>
              <button
                style={styles.cancelButton}
                onClick={() => setSelectedAgent(null)}
              >
                Cancel
              </button>
              <button
                style={{
                  ...styles.confirmButton,
                  ...(isLaunching || !taskDescription.trim() ? styles.launchButtonDisabled : {}),
                }}
                onClick={handleLaunch}
                disabled={isLaunching || !taskDescription.trim()}
              >
                {isLaunching ? 'Launching...' : 'Launch Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pulse Animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default QEAgentLauncher;
