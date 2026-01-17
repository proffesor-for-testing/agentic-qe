/**
 * CRDTVisualizer Component Tests
 *
 * Tests for the CRDTVisualizer component including:
 * - Rendering CRDT stores
 * - Empty state display
 * - Store card interactions
 * - Stats display
 *
 * @module tests/edge/webapp/components/CRDTVisualizer.test
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CRDTVisualizer } from '../../../../src/edge/webapp/components/CRDTVisualizer';
import type { CRDTState, CRDTStoreInfo } from '../../../../src/edge/webapp/types';

// ============================================
// Test Data
// ============================================

const createMockCRDTState = (overrides: Partial<CRDTState> = {}): CRDTState => ({
  stores: [],
  totalOperations: 0,
  conflictsResolved: 0,
  lastSync: 0,
  ...overrides,
});

const createMockStore = (overrides: Partial<CRDTStoreInfo> = {}): CRDTStoreInfo => ({
  id: 'store-1',
  type: 'GCounter',
  size: 64,
  version: 1,
  ...overrides,
});

// ============================================
// CRDTVisualizer Component Tests
// ============================================

describe('CRDTVisualizer Component', () => {
  // ============================================
  // Empty State Tests
  // ============================================

  describe('Empty State', () => {
    it('should render empty state when no stores', () => {
      const crdt = createMockCRDTState({ stores: [] });
      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('No CRDT stores')).toBeInTheDocument();
      expect(screen.getByText(/CRDT stores will appear here/)).toBeInTheDocument();
    });

    it('should still show stats section when no stores', () => {
      const crdt = createMockCRDTState({ stores: [], totalOperations: 0 });
      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('Operations')).toBeInTheDocument();
      expect(screen.getByText('Conflicts Resolved')).toBeInTheDocument();
      expect(screen.getByText('Last Sync')).toBeInTheDocument();
    });
  });

  // ============================================
  // Stats Display Tests
  // ============================================

  describe('Stats Display', () => {
    it('should display total operations count', () => {
      const crdt = createMockCRDTState({ totalOperations: 42 });
      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('Operations')).toBeInTheDocument();
    });

    it('should display conflicts resolved count', () => {
      const crdt = createMockCRDTState({ conflictsResolved: 5 });
      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('Conflicts Resolved')).toBeInTheDocument();
    });

    it('should display "Never" when lastSync is 0', () => {
      const crdt = createMockCRDTState({ lastSync: 0 });
      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('Never')).toBeInTheDocument();
    });

    it('should display formatted last sync time', () => {
      const lastSync = Date.now();
      const crdt = createMockCRDTState({ lastSync });
      render(<CRDTVisualizer crdt={crdt} />);

      // Should display a time string
      const timePattern = /\d{1,2}:\d{2}:\d{2}/;
      const lastSyncElement = screen.getByText('Last Sync').previousElementSibling;
      expect(lastSyncElement?.textContent).toMatch(timePattern);
    });

    it('should display zero operations', () => {
      const crdt = createMockCRDTState({ totalOperations: 0 });
      render(<CRDTVisualizer crdt={crdt} />);

      // There might be other "0"s on the page, so we check in context
      const operationsSection = screen.getByText('Operations').closest('div');
      expect(operationsSection).toHaveTextContent('0');
    });
  });

  // ============================================
  // Store Rendering Tests
  // ============================================

  describe('Store Rendering', () => {
    it('should render single store', () => {
      const store = createMockStore({ id: 'test-store', type: 'GCounter' });
      const crdt = createMockCRDTState({ stores: [store] });

      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('test-store')).toBeInTheDocument();
      expect(screen.getByText('GCounter')).toBeInTheDocument();
    });

    it('should render multiple stores', () => {
      const stores: CRDTStoreInfo[] = [
        createMockStore({ id: 'counter-store', type: 'GCounter' }),
        createMockStore({ id: 'register-store', type: 'LWWRegister' }),
        createMockStore({ id: 'set-store', type: 'ORSet' }),
      ];
      const crdt = createMockCRDTState({ stores });

      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('counter-store')).toBeInTheDocument();
      expect(screen.getByText('register-store')).toBeInTheDocument();
      expect(screen.getByText('set-store')).toBeInTheDocument();
    });

    it('should display store version', () => {
      const store = createMockStore({ id: 'versioned-store', version: 5 });
      const crdt = createMockCRDTState({ stores: [store] });

      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('v5')).toBeInTheDocument();
    });

    it('should display store size in bytes', () => {
      const store = createMockStore({ size: 512 });
      const crdt = createMockCRDTState({ stores: [store] });

      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('512 B')).toBeInTheDocument();
    });

    it('should display store size in KB', () => {
      const store = createMockStore({ size: 2048 });
      const crdt = createMockCRDTState({ stores: [store] });

      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    });

    it('should display store size in MB', () => {
      const store = createMockStore({ size: 2 * 1024 * 1024 });
      const crdt = createMockCRDTState({ stores: [store] });

      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('2.0 MB')).toBeInTheDocument();
    });
  });

  // ============================================
  // Store Type Tests
  // ============================================

  describe('Store Types', () => {
    it('should render GCounter store with correct styling', () => {
      const store = createMockStore({ type: 'GCounter' });
      const crdt = createMockCRDTState({ stores: [store] });

      const { container } = render(<CRDTVisualizer crdt={crdt} />);

      const storeCard = container.querySelector('.bg-green-100');
      expect(storeCard).toBeInTheDocument();
    });

    it('should render LWWRegister store with correct styling', () => {
      const store = createMockStore({ type: 'LWWRegister' });
      const crdt = createMockCRDTState({ stores: [store] });

      const { container } = render(<CRDTVisualizer crdt={crdt} />);

      const storeCard = container.querySelector('.bg-blue-100');
      expect(storeCard).toBeInTheDocument();
    });

    it('should render ORSet store with correct styling', () => {
      const store = createMockStore({ type: 'ORSet' });
      const crdt = createMockCRDTState({ stores: [store] });

      const { container } = render(<CRDTVisualizer crdt={crdt} />);

      const storeCard = container.querySelector('.bg-purple-100');
      expect(storeCard).toBeInTheDocument();
    });

    it('should render PatternCRDT store with correct styling', () => {
      const store = createMockStore({ type: 'PatternCRDT' });
      const crdt = createMockCRDTState({ stores: [store] });

      const { container } = render(<CRDTVisualizer crdt={crdt} />);

      const storeCard = container.querySelector('.bg-orange-100');
      expect(storeCard).toBeInTheDocument();
    });

    it('should display type icon for GCounter', () => {
      const store = createMockStore({ type: 'GCounter' });
      const crdt = createMockCRDTState({ stores: [store] });

      const { container } = render(<CRDTVisualizer crdt={crdt} />);

      // GCounter should have a plus icon
      const svg = container.querySelector('.bg-green-100 svg');
      expect(svg).toBeInTheDocument();
    });
  });

  // ============================================
  // Inspect Action Tests
  // ============================================

  describe('Inspect Action', () => {
    it('should call onInspect when store card is clicked', () => {
      const onInspect = jest.fn();
      const store = createMockStore({ id: 'clickable-store' });
      const crdt = createMockCRDTState({ stores: [store] });

      render(<CRDTVisualizer crdt={crdt} onInspect={onInspect} />);

      const storeCard = screen.getByText('clickable-store').closest('div[class*="cursor-pointer"]');
      fireEvent.click(storeCard!);

      expect(onInspect).toHaveBeenCalledWith('clickable-store');
      expect(onInspect).toHaveBeenCalledTimes(1);
    });

    it('should call onInspect with correct store id for multiple stores', () => {
      const onInspect = jest.fn();
      const stores: CRDTStoreInfo[] = [
        createMockStore({ id: 'store-1' }),
        createMockStore({ id: 'store-2' }),
        createMockStore({ id: 'store-3' }),
      ];
      const crdt = createMockCRDTState({ stores });

      render(<CRDTVisualizer crdt={crdt} onInspect={onInspect} />);

      const store2Card = screen.getByText('store-2').closest('div[class*="cursor-pointer"]');
      fireEvent.click(store2Card!);

      expect(onInspect).toHaveBeenCalledWith('store-2');
    });

    it('should not call onInspect when not provided', () => {
      const store = createMockStore({ id: 'no-handler-store' });
      const crdt = createMockCRDTState({ stores: [store] });

      render(<CRDTVisualizer crdt={crdt} />);

      // Should render without errors
      expect(screen.getByText('no-handler-store')).toBeInTheDocument();
    });

    it('should show cursor-pointer style when onInspect provided', () => {
      const onInspect = jest.fn();
      const store = createMockStore({ id: 'pointer-store' });
      const crdt = createMockCRDTState({ stores: [store] });

      render(<CRDTVisualizer crdt={crdt} onInspect={onInspect} />);

      const storeCard = screen.getByText('pointer-store').closest('div');
      expect(storeCard).toHaveClass('cursor-pointer');
    });
  });

  // ============================================
  // Legend Tests
  // ============================================

  describe('Legend', () => {
    it('should display legend with all CRDT types', () => {
      const crdt = createMockCRDTState({ stores: [] });
      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('Types:')).toBeInTheDocument();
      expect(screen.getAllByText('GCounter').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('LWWRegister').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('ORSet').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('PatternCRDT').length).toBeGreaterThanOrEqual(1);
    });

    it('should have colored indicators in legend', () => {
      const crdt = createMockCRDTState({ stores: [] });
      const { container } = render(<CRDTVisualizer crdt={crdt} />);

      const legendItems = container.querySelectorAll('.w-3.h-3.rounded');
      expect(legendItems.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Grid Layout Tests
  // ============================================

  describe('Grid Layout', () => {
    it('should render stores in grid layout', () => {
      const stores: CRDTStoreInfo[] = [
        createMockStore({ id: 'store-1' }),
        createMockStore({ id: 'store-2' }),
        createMockStore({ id: 'store-3' }),
      ];
      const crdt = createMockCRDTState({ stores });

      const { container } = render(<CRDTVisualizer crdt={crdt} />);

      const grid = container.querySelector('.grid.grid-cols-1');
      expect(grid).toBeInTheDocument();
    });

    it('should have responsive column classes', () => {
      const stores: CRDTStoreInfo[] = [
        createMockStore({ id: 'store-1' }),
      ];
      const crdt = createMockCRDTState({ stores });

      const { container } = render(<CRDTVisualizer crdt={crdt} />);

      const grid = container.querySelector('.md\\:grid-cols-2');
      expect(grid).toBeInTheDocument();

      const gridLg = container.querySelector('.lg\\:grid-cols-3');
      expect(gridLg).toBeInTheDocument();
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('should handle store with zero version', () => {
      const store = createMockStore({ version: 0 });
      const crdt = createMockCRDTState({ stores: [store] });

      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('v0')).toBeInTheDocument();
    });

    it('should handle store with zero size', () => {
      const store = createMockStore({ size: 0 });
      const crdt = createMockCRDTState({ stores: [store] });

      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('0 B')).toBeInTheDocument();
    });

    it('should handle large number of stores', () => {
      const stores = Array.from({ length: 20 }, (_, i) =>
        createMockStore({ id: `store-${i}`, type: 'GCounter', version: i })
      );
      const crdt = createMockCRDTState({ stores });

      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('store-0')).toBeInTheDocument();
      expect(screen.getByText('store-19')).toBeInTheDocument();
    });

    it('should handle special characters in store id', () => {
      const store = createMockStore({ id: 'store-with-special_chars.v1' });
      const crdt = createMockCRDTState({ stores: [store] });

      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('store-with-special_chars.v1')).toBeInTheDocument();
    });

    it('should handle very long store id', () => {
      const longId = 'store-' + 'a'.repeat(100);
      const store = createMockStore({ id: longId });
      const crdt = createMockCRDTState({ stores: [store] });

      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText(longId)).toBeInTheDocument();
    });

    it('should handle high operation counts', () => {
      const crdt = createMockCRDTState({ totalOperations: 999999 });
      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('999999')).toBeInTheDocument();
    });

    it('should handle high conflict counts', () => {
      const crdt = createMockCRDTState({ conflictsResolved: 100000 });
      render(<CRDTVisualizer crdt={crdt} />);

      expect(screen.getByText('100000')).toBeInTheDocument();
    });
  });
});
