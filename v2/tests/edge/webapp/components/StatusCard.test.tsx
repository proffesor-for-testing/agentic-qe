/**
 * StatusCard Component Tests
 *
 * Tests for the StatusCard component including:
 * - Rendering with different props
 * - Status color styling
 * - Icon rendering
 * - Grid layout component
 *
 * @module tests/edge/webapp/components/StatusCard.test
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { StatusCard, StatusCardGrid } from '../../../../src/edge/webapp/components/StatusCard';
import type { StatusCardProps } from '../../../../src/edge/webapp/types';

// ============================================
// StatusCard Component Tests
// ============================================

describe('StatusCard Component', () => {
  // ============================================
  // Basic Rendering Tests
  // ============================================

  describe('Basic Rendering', () => {
    it('should render title', () => {
      render(<StatusCard title="Connection Status" value="Connected" />);

      expect(screen.getByText('Connection Status')).toBeInTheDocument();
    });

    it('should render string value', () => {
      render(<StatusCard title="Status" value="Active" />);

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should render numeric value', () => {
      render(<StatusCard title="Count" value={42} />);

      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('should render subtitle when provided', () => {
      render(<StatusCard title="Status" value="OK" subtitle="Last updated 5 mins ago" />);

      expect(screen.getByText('Last updated 5 mins ago')).toBeInTheDocument();
    });

    it('should not render subtitle when not provided', () => {
      render(<StatusCard title="Status" value="OK" />);

      expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
    });
  });

  // ============================================
  // Status Styling Tests
  // ============================================

  describe('Status Styling', () => {
    it('should apply success status colors', () => {
      const { container } = render(
        <StatusCard title="Test" value="OK" status="success" />
      );

      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('bg-green-50');
      expect(card).toHaveClass('border-green-200');
    });

    it('should apply warning status colors', () => {
      const { container } = render(
        <StatusCard title="Test" value="Warning" status="warning" />
      );

      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('bg-yellow-50');
      expect(card).toHaveClass('border-yellow-200');
    });

    it('should apply error status colors', () => {
      const { container } = render(
        <StatusCard title="Test" value="Error" status="error" />
      );

      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('bg-red-50');
      expect(card).toHaveClass('border-red-200');
    });

    it('should apply info status colors by default', () => {
      const { container } = render(
        <StatusCard title="Test" value="Info" />
      );

      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('bg-blue-50');
      expect(card).toHaveClass('border-blue-200');
    });

    it('should apply info status colors when explicitly set', () => {
      const { container } = render(
        <StatusCard title="Test" value="Info" status="info" />
      );

      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('bg-blue-50');
      expect(card).toHaveClass('border-blue-200');
    });
  });

  // ============================================
  // Icon Tests
  // ============================================

  describe('Icon Rendering', () => {
    it('should render connection icon', () => {
      const { container } = render(
        <StatusCard title="Connection" value="Active" icon="connection" />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render peers icon', () => {
      const { container } = render(
        <StatusCard title="Peers" value="5" icon="peers" />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render patterns icon', () => {
      const { container } = render(
        <StatusCard title="Patterns" value="100" icon="patterns" />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render crdt icon', () => {
      const { container } = render(
        <StatusCard title="CRDT" value="3 stores" icon="crdt" />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render tests icon', () => {
      const { container } = render(
        <StatusCard title="Tests" value="All passing" icon="tests" />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render memory icon', () => {
      const { container } = render(
        <StatusCard title="Memory" value="256 MB" icon="memory" />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render network icon', () => {
      const { container } = render(
        <StatusCard title="Network" value="Online" icon="network" />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should render time icon', () => {
      const { container } = render(
        <StatusCard title="Uptime" value="2h 30m" icon="time" />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should not render icon when not provided', () => {
      const { container } = render(
        <StatusCard title="Test" value="Value" />
      );

      // Look for icon container - should not have svg when no icon
      const iconContainers = container.querySelectorAll('svg');
      expect(iconContainers.length).toBe(0);
    });

    it('should handle unknown icon gracefully', () => {
      const { container } = render(
        <StatusCard title="Test" value="Value" icon="unknown-icon" />
      );

      // Should not crash, just not render an icon
      expect(container).toBeInTheDocument();
    });
  });

  // ============================================
  // Value Display Tests
  // ============================================

  describe('Value Display', () => {
    it('should display large numbers correctly', () => {
      render(<StatusCard title="Count" value={1000000} />);

      expect(screen.getByText('1000000')).toBeInTheDocument();
    });

    it('should display zero', () => {
      render(<StatusCard title="Count" value={0} />);

      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('should display negative numbers', () => {
      render(<StatusCard title="Delta" value={-50} />);

      expect(screen.getByText('-50')).toBeInTheDocument();
    });

    it('should display empty string', () => {
      render(<StatusCard title="Status" value="" />);

      // Value container should still exist
      const valueContainer = screen.getByText('Status').nextElementSibling;
      expect(valueContainer).toBeInTheDocument();
    });

    it('should display special characters', () => {
      render(<StatusCard title="Status" value="OK (100%)" />);

      expect(screen.getByText('OK (100%)')).toBeInTheDocument();
    });
  });

  // ============================================
  // Combined Props Tests
  // ============================================

  describe('Combined Props', () => {
    it('should render with all props', () => {
      const { container } = render(
        <StatusCard
          title="Connection"
          value="Active"
          subtitle="Since 2 hours ago"
          status="success"
          icon="connection"
        />
      );

      expect(screen.getByText('Connection')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Since 2 hours ago')).toBeInTheDocument();

      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('bg-green-50');

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });
});

// ============================================
// StatusCardGrid Component Tests
// ============================================

describe('StatusCardGrid Component', () => {
  // ============================================
  // Layout Tests
  // ============================================

  describe('Layout', () => {
    it('should render children', () => {
      render(
        <StatusCardGrid>
          <StatusCard title="Card 1" value="Value 1" />
          <StatusCard title="Card 2" value="Value 2" />
        </StatusCardGrid>
      );

      expect(screen.getByText('Card 1')).toBeInTheDocument();
      expect(screen.getByText('Card 2')).toBeInTheDocument();
    });

    it('should apply grid class', () => {
      const { container } = render(
        <StatusCardGrid>
          <StatusCard title="Card" value="Value" />
        </StatusCardGrid>
      );

      const grid = container.firstChild as HTMLElement;
      expect(grid).toHaveClass('grid');
    });

    it('should apply gap class', () => {
      const { container } = render(
        <StatusCardGrid>
          <StatusCard title="Card" value="Value" />
        </StatusCardGrid>
      );

      const grid = container.firstChild as HTMLElement;
      expect(grid).toHaveClass('gap-4');
    });
  });

  // ============================================
  // Column Tests
  // ============================================

  describe('Column Configuration', () => {
    it('should apply 4 columns by default', () => {
      const { container } = render(
        <StatusCardGrid>
          <StatusCard title="Card" value="Value" />
        </StatusCardGrid>
      );

      const grid = container.firstChild as HTMLElement;
      expect(grid).toHaveClass('lg:grid-cols-4');
    });

    it('should apply 2 columns when specified', () => {
      const { container } = render(
        <StatusCardGrid columns={2}>
          <StatusCard title="Card" value="Value" />
        </StatusCardGrid>
      );

      const grid = container.firstChild as HTMLElement;
      expect(grid).toHaveClass('md:grid-cols-2');
    });

    it('should apply 3 columns when specified', () => {
      const { container } = render(
        <StatusCardGrid columns={3}>
          <StatusCard title="Card" value="Value" />
        </StatusCardGrid>
      );

      const grid = container.firstChild as HTMLElement;
      expect(grid).toHaveClass('lg:grid-cols-3');
    });

    it('should apply 4 columns when explicitly specified', () => {
      const { container } = render(
        <StatusCardGrid columns={4}>
          <StatusCard title="Card" value="Value" />
        </StatusCardGrid>
      );

      const grid = container.firstChild as HTMLElement;
      expect(grid).toHaveClass('lg:grid-cols-4');
    });
  });

  // ============================================
  // Multiple Cards Tests
  // ============================================

  describe('Multiple Cards', () => {
    it('should render multiple cards in grid', () => {
      render(
        <StatusCardGrid>
          <StatusCard title="Card 1" value="Value 1" />
          <StatusCard title="Card 2" value="Value 2" />
          <StatusCard title="Card 3" value="Value 3" />
          <StatusCard title="Card 4" value="Value 4" />
        </StatusCardGrid>
      );

      expect(screen.getByText('Card 1')).toBeInTheDocument();
      expect(screen.getByText('Card 2')).toBeInTheDocument();
      expect(screen.getByText('Card 3')).toBeInTheDocument();
      expect(screen.getByText('Card 4')).toBeInTheDocument();
    });

    it('should render cards with different statuses', () => {
      const { container } = render(
        <StatusCardGrid>
          <StatusCard title="Success" value="OK" status="success" />
          <StatusCard title="Warning" value="Warn" status="warning" />
          <StatusCard title="Error" value="Err" status="error" />
          <StatusCard title="Info" value="Info" status="info" />
        </StatusCardGrid>
      );

      const cards = container.querySelectorAll('.rounded-lg.border');
      expect(cards.length).toBe(4);
    });
  });

  // ============================================
  // Empty/Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('should render empty grid without children', () => {
      const { container } = render(
        <StatusCardGrid>
          {null}
        </StatusCardGrid>
      );

      const grid = container.firstChild as HTMLElement;
      expect(grid).toHaveClass('grid');
    });

    it('should handle single card', () => {
      render(
        <StatusCardGrid>
          <StatusCard title="Single" value="Card" />
        </StatusCardGrid>
      );

      expect(screen.getByText('Single')).toBeInTheDocument();
    });

    it('should handle many cards', () => {
      const cards = Array.from({ length: 10 }, (_, i) => (
        <StatusCard key={i} title={`Card ${i + 1}`} value={`Value ${i + 1}`} />
      ));

      render(<StatusCardGrid>{cards}</StatusCardGrid>);

      expect(screen.getByText('Card 1')).toBeInTheDocument();
      expect(screen.getByText('Card 10')).toBeInTheDocument();
    });
  });
});
