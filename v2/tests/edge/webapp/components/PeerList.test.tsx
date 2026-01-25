/**
 * PeerList Component Tests
 *
 * Tests for the PeerList component including:
 * - Rendering peer list
 * - Empty state display
 * - Peer actions (disconnect, sync)
 * - Connection state badges
 *
 * @module tests/edge/webapp/components/PeerList.test
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PeerList, PeerConnect } from '../../../../src/edge/webapp/components/PeerList';
import type { PeerInfo } from '../../../../src/edge/webapp/types';

// ============================================
// Test Data
// ============================================

const createMockPeer = (overrides: Partial<PeerInfo> = {}): PeerInfo => ({
  id: 'peer-123456789abcdef',
  publicKey: 'pk-test-123',
  connectionState: 'connected',
  latencyMs: 25,
  lastSeen: Date.now(),
  patternsShared: 5,
  ...overrides,
});

// ============================================
// PeerList Component Tests
// ============================================

describe('PeerList Component', () => {
  // ============================================
  // Empty State Tests
  // ============================================

  describe('Empty State', () => {
    it('should render empty state when no peers', () => {
      render(<PeerList peers={[]} />);

      expect(screen.getByText('No peers connected')).toBeInTheDocument();
      expect(screen.getByText(/Connect to peers to start sharing/)).toBeInTheDocument();
    });

    it('should render empty state with proper styling', () => {
      render(<PeerList peers={[]} />);

      const emptyContainer = screen.getByText('No peers connected').closest('div');
      expect(emptyContainer).toHaveClass('text-center');
    });
  });

  // ============================================
  // Peer List Rendering Tests
  // ============================================

  describe('Peer List Rendering', () => {
    it('should render single peer', () => {
      const peer = createMockPeer({ id: 'test-peer-1234567890' });
      render(<PeerList peers={[peer]} />);

      // Should display truncated peer ID
      expect(screen.getByText(/test-pee.*7890/)).toBeInTheDocument();
    });

    it('should render multiple peers', () => {
      const peers = [
        createMockPeer({ id: 'peer-111111111111' }),
        createMockPeer({ id: 'peer-222222222222' }),
        createMockPeer({ id: 'peer-333333333333' }),
      ];

      render(<PeerList peers={peers} />);

      expect(screen.getByText(/peer-111.*1111/)).toBeInTheDocument();
      expect(screen.getByText(/peer-222.*2222/)).toBeInTheDocument();
      expect(screen.getByText(/peer-333.*3333/)).toBeInTheDocument();
    });

    it('should display peer latency', () => {
      const peer = createMockPeer({ latencyMs: 42 });
      render(<PeerList peers={[peer]} />);

      expect(screen.getByText('Latency: 42ms')).toBeInTheDocument();
    });

    it('should display patterns shared count', () => {
      const peer = createMockPeer({ patternsShared: 15 });
      render(<PeerList peers={[peer]} />);

      expect(screen.getByText('Patterns: 15')).toBeInTheDocument();
    });

    it('should display last seen time', () => {
      const recentTime = Date.now() - 5000; // 5 seconds ago
      const peer = createMockPeer({ lastSeen: recentTime });
      render(<PeerList peers={[peer]} />);

      expect(screen.getByText(/Last seen: \d+s ago/)).toBeInTheDocument();
    });

    it('should display peer avatar with initials', () => {
      const peer = createMockPeer({ id: 'ab1234567890' });
      render(<PeerList peers={[peer]} />);

      expect(screen.getByText('AB')).toBeInTheDocument();
    });
  });

  // ============================================
  // Connection State Badge Tests
  // ============================================

  describe('Connection State Badge', () => {
    it('should display connected state badge', () => {
      const peer = createMockPeer({ connectionState: 'connected' });
      render(<PeerList peers={[peer]} />);

      expect(screen.getByText('connected')).toBeInTheDocument();
    });

    it('should display connecting state badge', () => {
      const peer = createMockPeer({ connectionState: 'connecting' });
      render(<PeerList peers={[peer]} />);

      expect(screen.getByText('connecting')).toBeInTheDocument();
    });

    it('should display disconnected state badge', () => {
      const peer = createMockPeer({ connectionState: 'disconnected' });
      render(<PeerList peers={[peer]} />);

      expect(screen.getByText('disconnected')).toBeInTheDocument();
    });

    it('should display error state badge', () => {
      const peer = createMockPeer({ connectionState: 'error' });
      render(<PeerList peers={[peer]} />);

      expect(screen.getByText('error')).toBeInTheDocument();
    });
  });

  // ============================================
  // Disconnect Action Tests
  // ============================================

  describe('Disconnect Action', () => {
    it('should render disconnect button when onDisconnect provided', () => {
      const onDisconnect = jest.fn();
      const peer = createMockPeer();

      render(<PeerList peers={[peer]} onDisconnect={onDisconnect} />);

      expect(screen.getByText('Disconnect')).toBeInTheDocument();
    });

    it('should not render disconnect button when onDisconnect not provided', () => {
      const peer = createMockPeer();

      render(<PeerList peers={[peer]} />);

      expect(screen.queryByText('Disconnect')).not.toBeInTheDocument();
    });

    it('should call onDisconnect with peer id when clicked', () => {
      const onDisconnect = jest.fn();
      const peer = createMockPeer({ id: 'peer-to-disconnect' });

      render(<PeerList peers={[peer]} onDisconnect={onDisconnect} />);

      fireEvent.click(screen.getByText('Disconnect'));

      expect(onDisconnect).toHaveBeenCalledWith('peer-to-disconnect');
      expect(onDisconnect).toHaveBeenCalledTimes(1);
    });

    it('should call correct onDisconnect for multiple peers', () => {
      const onDisconnect = jest.fn();
      const peers = [
        createMockPeer({ id: 'peer-1' }),
        createMockPeer({ id: 'peer-2' }),
      ];

      render(<PeerList peers={peers} onDisconnect={onDisconnect} />);

      const disconnectButtons = screen.getAllByText('Disconnect');
      fireEvent.click(disconnectButtons[1]);

      expect(onDisconnect).toHaveBeenCalledWith('peer-2');
    });
  });

  // ============================================
  // Sync Action Tests
  // ============================================

  describe('Sync Action', () => {
    it('should render sync button for connected peers when onSync provided', () => {
      const onSync = jest.fn();
      const peer = createMockPeer({ connectionState: 'connected' });

      render(<PeerList peers={[peer]} onSync={onSync} />);

      expect(screen.getByText('Sync')).toBeInTheDocument();
    });

    it('should not render sync button for non-connected peers', () => {
      const onSync = jest.fn();
      const peer = createMockPeer({ connectionState: 'connecting' });

      render(<PeerList peers={[peer]} onSync={onSync} />);

      expect(screen.queryByText('Sync')).not.toBeInTheDocument();
    });

    it('should not render sync button when onSync not provided', () => {
      const peer = createMockPeer({ connectionState: 'connected' });

      render(<PeerList peers={[peer]} />);

      expect(screen.queryByText('Sync')).not.toBeInTheDocument();
    });

    it('should call onSync with peer id when clicked', () => {
      const onSync = jest.fn();
      const peer = createMockPeer({ id: 'peer-to-sync', connectionState: 'connected' });

      render(<PeerList peers={[peer]} onSync={onSync} />);

      fireEvent.click(screen.getByText('Sync'));

      expect(onSync).toHaveBeenCalledWith('peer-to-sync');
      expect(onSync).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================
  // Mixed State Tests
  // ============================================

  describe('Mixed Peer States', () => {
    it('should render peers with different connection states', () => {
      const peers = [
        createMockPeer({ id: 'peer-connected', connectionState: 'connected' }),
        createMockPeer({ id: 'peer-connecting', connectionState: 'connecting' }),
        createMockPeer({ id: 'peer-disconnected', connectionState: 'disconnected' }),
      ];

      render(<PeerList peers={peers} />);

      expect(screen.getByText('connected')).toBeInTheDocument();
      expect(screen.getByText('connecting')).toBeInTheDocument();
      expect(screen.getByText('disconnected')).toBeInTheDocument();
    });

    it('should show sync button only for connected peers in mixed list', () => {
      const onSync = jest.fn();
      const peers = [
        createMockPeer({ id: 'peer-1', connectionState: 'connected' }),
        createMockPeer({ id: 'peer-2', connectionState: 'disconnected' }),
        createMockPeer({ id: 'peer-3', connectionState: 'connected' }),
      ];

      render(<PeerList peers={peers} onSync={onSync} />);

      const syncButtons = screen.getAllByText('Sync');
      expect(syncButtons).toHaveLength(2);
    });
  });
});

// ============================================
// PeerConnect Component Tests
// ============================================

describe('PeerConnect Component', () => {
  // ============================================
  // Rendering Tests
  // ============================================

  describe('Rendering', () => {
    it('should render input and connect button', () => {
      const onConnect = jest.fn();
      render(<PeerConnect onConnect={onConnect} />);

      expect(screen.getByPlaceholderText('Enter peer ID...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    });

    it('should show connecting state when isConnecting is true', () => {
      const onConnect = jest.fn();
      render(<PeerConnect onConnect={onConnect} isConnecting={true} />);

      expect(screen.getByText('Connecting...')).toBeInTheDocument();
    });
  });

  // ============================================
  // Input Tests
  // ============================================

  describe('Input Handling', () => {
    it('should update input value on change', () => {
      const onConnect = jest.fn();
      render(<PeerConnect onConnect={onConnect} />);

      const input = screen.getByPlaceholderText('Enter peer ID...') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'test-peer-id' } });

      expect(input.value).toBe('test-peer-id');
    });

    it('should disable input when connecting', () => {
      const onConnect = jest.fn();
      render(<PeerConnect onConnect={onConnect} isConnecting={true} />);

      const input = screen.getByPlaceholderText('Enter peer ID...');
      expect(input).toBeDisabled();
    });
  });

  // ============================================
  // Button State Tests
  // ============================================

  describe('Button State', () => {
    it('should disable button when input is empty', () => {
      const onConnect = jest.fn();
      render(<PeerConnect onConnect={onConnect} />);

      const button = screen.getByRole('button', { name: 'Connect' });
      expect(button).toBeDisabled();
    });

    it('should disable button when input only has whitespace', () => {
      const onConnect = jest.fn();
      render(<PeerConnect onConnect={onConnect} />);

      const input = screen.getByPlaceholderText('Enter peer ID...');
      fireEvent.change(input, { target: { value: '   ' } });

      const button = screen.getByRole('button', { name: 'Connect' });
      expect(button).toBeDisabled();
    });

    it('should enable button when input has valid value', () => {
      const onConnect = jest.fn();
      render(<PeerConnect onConnect={onConnect} />);

      const input = screen.getByPlaceholderText('Enter peer ID...');
      fireEvent.change(input, { target: { value: 'valid-peer-id' } });

      const button = screen.getByRole('button', { name: 'Connect' });
      expect(button).not.toBeDisabled();
    });

    it('should disable button when connecting', () => {
      const onConnect = jest.fn();
      render(<PeerConnect onConnect={onConnect} isConnecting={true} />);

      const input = screen.getByPlaceholderText('Enter peer ID...');
      fireEvent.change(input, { target: { value: 'valid-peer-id' } });

      // Find the button with Connecting... text
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });

  // ============================================
  // Submit Tests
  // ============================================

  describe('Submit Handling', () => {
    it('should call onConnect with trimmed peer id on submit', () => {
      const onConnect = jest.fn();
      render(<PeerConnect onConnect={onConnect} />);

      const input = screen.getByPlaceholderText('Enter peer ID...');
      const form = input.closest('form')!;

      fireEvent.change(input, { target: { value: '  peer-123  ' } });
      fireEvent.submit(form);

      expect(onConnect).toHaveBeenCalledWith('peer-123');
      expect(onConnect).toHaveBeenCalledTimes(1);
    });

    it('should clear input after successful submit', () => {
      const onConnect = jest.fn();
      render(<PeerConnect onConnect={onConnect} />);

      const input = screen.getByPlaceholderText('Enter peer ID...') as HTMLInputElement;
      const form = input.closest('form')!;

      fireEvent.change(input, { target: { value: 'peer-123' } });
      fireEvent.submit(form);

      expect(input.value).toBe('');
    });

    it('should not call onConnect if input is empty', () => {
      const onConnect = jest.fn();
      render(<PeerConnect onConnect={onConnect} />);

      const input = screen.getByPlaceholderText('Enter peer ID...');
      const form = input.closest('form')!;

      fireEvent.submit(form);

      expect(onConnect).not.toHaveBeenCalled();
    });

    it('should not call onConnect if input only has whitespace', () => {
      const onConnect = jest.fn();
      render(<PeerConnect onConnect={onConnect} />);

      const input = screen.getByPlaceholderText('Enter peer ID...');
      const form = input.closest('form')!;

      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.submit(form);

      expect(onConnect).not.toHaveBeenCalled();
    });
  });
});
