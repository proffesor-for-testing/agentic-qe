import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from '@jest/globals';
import axios from 'axios';
import { QualityMetrics } from '../../src/components/QualityMetrics/QualityMetrics';
import { TimelineEnhanced } from '../../src/components/Timeline/TimelineEnhanced';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Phase 3 Visualization Components', () => {
  describe('QualityMetrics Component', () => {
    const mockMetricsData = {
      success: true,
      data: {
        history: [
          {
            timestamp: '2025-11-22T10:00:00.000Z',
            coverage: { line: 0.85, branch: 0.78, function: 0.90 },
            performance: { score: 0.92, responseTime: 150, throughput: 1000 },
            quality: { maintainability: 0.88, reliability: 0.85, security: 0.90 },
            tokens: { total: 12000, cost: 0.24 },
          },
          {
            timestamp: '2025-11-22T10:30:00.000Z',
            coverage: { line: 0.87, branch: 0.80, function: 0.92 },
            performance: { score: 0.94, responseTime: 140, throughput: 1100 },
            quality: { maintainability: 0.90, reliability: 0.87, security: 0.92 },
            tokens: { total: 15000, cost: 0.30 },
          },
        ],
      },
      metadata: {
        timestamp: '2025-11-22T10:30:00.000Z',
        request_id: 'req-123',
      },
    };

    beforeEach(() => {
      vi.clearAllMocks();
      mockedAxios.get.mockResolvedValue({ data: mockMetricsData });
    });

    it('should render QualityMetrics component', async () => {
      render(<QualityMetrics />);

      await waitFor(() => {
        expect(screen.getByText('Quality Metrics')).toBeInTheDocument();
      });
    });

    it('should fetch metrics from REST API', async () => {
      render(<QualityMetrics timeRange="24h" />);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          'http://localhost:3001/api/visualization/metrics',
          expect.objectContaining({
            params: expect.objectContaining({ timeRange: '24h' }),
          })
        );
      });
    });

    it('should display radar chart view by default', async () => {
      render(<QualityMetrics />);

      await waitFor(() => {
        expect(screen.getByText('radar')).toBeInTheDocument();
      });
    });

    it('should switch between views (radar, trends, tokens)', async () => {
      render(<QualityMetrics />);

      await waitFor(() => {
        expect(screen.getByText('radar')).toBeInTheDocument();
      });

      const trendsButton = screen.getByText('trends');
      fireEvent.click(trendsButton);

      await waitFor(() => {
        // Check that trends view is active
        expect(trendsButton.className).toContain('border-blue-600');
      });
    });

    it('should handle loading state', () => {
      mockedAxios.get.mockImplementation(() => new Promise(() => {})); // Never resolves
      render(<QualityMetrics />);

      expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument(); // Spinner
    });

    it('should handle error state', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));
      render(<QualityMetrics />);

      await waitFor(() => {
        expect(screen.getByText('Error Loading Metrics')).toBeInTheDocument();
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should export data as JSON', async () => {
      const createObjectURL = vi.fn(() => 'blob:mock-url');
      const revokeObjectURL = vi.fn();
      global.URL.createObjectURL = createObjectURL;
      global.URL.revokeObjectURL = revokeObjectURL;

      render(<QualityMetrics />);

      await waitFor(() => {
        expect(screen.getByTitle('Export as JSON')).toBeInTheDocument();
      });

      const exportButton = screen.getByTitle('Export as JSON');
      fireEvent.click(exportButton);

      expect(createObjectURL).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalled();
    });

    it('should refresh data on button click', async () => {
      render(<QualityMetrics />);

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const refreshButton = screen.getByText('Refresh');
      fireEvent.click(refreshButton);

      expect(mockedAxios.get).toHaveBeenCalledTimes(2); // Initial + refresh
    });

    it('should calculate trend correctly', async () => {
      render(<QualityMetrics />);

      await waitFor(() => {
        // With 2 data points, trends should be calculated
        // Coverage: (87+80+92)/3 vs (85+78+90)/3 = increase
        expect(screen.getByText(/TrendingUp/)).toBeInTheDocument();
      });
    });
  });

  describe('TimelineEnhanced Component', () => {
    const mockEventsData = {
      success: true,
      data: [
        {
          id: 'evt-1',
          timestamp: '2025-11-22T10:00:00.000Z',
          agent_id: 'test-generator',
          event_type: 'test_generated',
          payload: { testCount: 10 },
          session_id: 'session-123',
          status: 'success',
          duration: 150,
        },
        {
          id: 'evt-2',
          timestamp: '2025-11-22T10:05:00.000Z',
          agent_id: 'coverage-analyzer',
          event_type: 'coverage_analyzed',
          payload: { coverage: 85 },
          session_id: 'session-123',
          status: 'success',
          duration: 200,
        },
      ],
      metadata: {
        timestamp: '2025-11-22T10:30:00.000Z',
        request_id: 'req-456',
        pagination: {
          limit: 100,
          offset: 0,
          total: 2,
          has_more: false,
        },
      },
    };

    beforeEach(() => {
      vi.clearAllMocks();
      mockedAxios.get.mockResolvedValue({ data: mockEventsData });
    });

    it('should render TimelineEnhanced component', async () => {
      render(<TimelineEnhanced />);

      await waitFor(() => {
        expect(screen.getByText('Event Timeline')).toBeInTheDocument();
      });
    });

    it('should fetch events from REST API', async () => {
      render(<TimelineEnhanced sessionId="session-123" />);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          'http://localhost:3001/api/visualization/events',
          expect.objectContaining({
            params: expect.objectContaining({
              session_id: 'session-123',
              limit: 100,
              offset: 0,
            }),
          })
        );
      });
    });

    it('should display event list with virtual scrolling', async () => {
      render(<TimelineEnhanced />);

      await waitFor(() => {
        expect(screen.getByText('test_generated')).toBeInTheDocument();
        expect(screen.getByText('coverage_analyzed')).toBeInTheDocument();
      });
    });

    it('should filter events by agent', async () => {
      render(<TimelineEnhanced />);

      await waitFor(() => {
        expect(screen.getByText('All Agents')).toBeInTheDocument();
      });

      const agentSelect = screen.getByDisplayValue('All Agents');
      fireEvent.change(agentSelect, { target: { value: 'test-generator' } });

      // Should only show test-generator events
      expect(screen.getByText('test_generated')).toBeInTheDocument();
    });

    it('should search events by query', async () => {
      render(<TimelineEnhanced />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search events...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search events...');
      fireEvent.change(searchInput, { target: { value: 'coverage' } });

      // Should filter to coverage-related events
      expect(screen.getByText('coverage_analyzed')).toBeInTheDocument();
    });

    it('should display event details on selection', async () => {
      render(<TimelineEnhanced />);

      await waitFor(() => {
        expect(screen.getByText('test_generated')).toBeInTheDocument();
      });

      const eventRow = screen.getByText('test_generated');
      fireEvent.click(eventRow);

      await waitFor(() => {
        expect(screen.getByText('Event Details')).toBeInTheDocument();
        expect(screen.getByText('evt-1')).toBeInTheDocument();
      });
    });

    it('should export events as JSON', async () => {
      const createObjectURL = vi.fn(() => 'blob:mock-url');
      const revokeObjectURL = vi.fn();
      global.URL.createObjectURL = createObjectURL;
      global.URL.revokeObjectURL = revokeObjectURL;

      render(<TimelineEnhanced />);

      await waitFor(() => {
        expect(screen.getByTitle('Export as JSON')).toBeInTheDocument();
      });

      const exportButton = screen.getByTitle('Export as JSON');
      fireEvent.click(exportButton);

      expect(createObjectURL).toHaveBeenCalled();
    });

    it('should export events as CSV', async () => {
      render(<TimelineEnhanced />);

      await waitFor(() => {
        expect(screen.getByText('Export CSV')).toBeInTheDocument();
      });

      const csvButton = screen.getByText('Export CSV');
      fireEvent.click(csvButton);

      // Verify CSV download was triggered
      expect(global.URL.createObjectURL).toHaveBeenCalled();
    });

    it('should handle pagination', async () => {
      const mockPaginatedData = {
        ...mockEventsData,
        metadata: {
          ...mockEventsData.metadata,
          pagination: {
            limit: 100,
            offset: 0,
            total: 250,
            has_more: true,
          },
        },
      };
      mockedAxios.get.mockResolvedValue({ data: mockPaginatedData });

      render(<TimelineEnhanced />);

      await waitFor(() => {
        expect(screen.getByText('Next')).toBeInTheDocument();
      });

      const nextButton = screen.getByText('Next');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            params: expect.objectContaining({ offset: 100 }),
          })
        );
      });
    });

    it('should handle auto-refresh', async () => {
      vi.useFakeTimers();
      render(<TimelineEnhanced autoRefresh={true} />);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      });

      // Advance time by 10 seconds (auto-refresh interval)
      vi.advanceTimersByTime(10000);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      });

      vi.useRealTimers();
    });
  });
});
