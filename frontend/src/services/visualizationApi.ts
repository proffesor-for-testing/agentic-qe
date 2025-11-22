/**
 * Visualization API Service
 * Handles REST API calls for visualization data
 */

import { GraphData, QualityMetrics, LifecycleEvent } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface SessionGraphData extends GraphData {
  sessionId: string;
  timestamp: number;
  metadata?: {
    topology: string;
    agentCount: number;
    duration?: number;
  };
}

export interface VisualizationApiError {
  message: string;
  code: string;
  details?: unknown;
}

class VisualizationApiService {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Fetch graph data for a specific session
   */
  async getGraphData(sessionId: string, algorithm?: string): Promise<SessionGraphData> {
    try {
      const url = new URL(`${this.baseUrl}/api/visualization/graph/${sessionId}`);
      if (algorithm) {
        url.searchParams.set('algorithm', algorithm);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to fetch graph data:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Fetch quality metrics for a session
   */
  async getMetrics(sessionId: string, timeRange?: { start: number; end: number }): Promise<QualityMetrics[]> {
    try {
      const url = new URL(`${this.baseUrl}/api/visualization/metrics/${sessionId}`);
      if (timeRange) {
        url.searchParams.set('start', timeRange.start.toString());
        url.searchParams.set('end', timeRange.end.toString());
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Fetch lifecycle events for a session
   */
  async getEvents(sessionId: string, filters?: {
    agentId?: string;
    eventType?: string;
    limit?: number;
  }): Promise<LifecycleEvent[]> {
    try {
      const url = new URL(`${this.baseUrl}/api/visualization/events/${sessionId}`);
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined) {
            url.searchParams.set(key, value.toString());
          }
        });
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to fetch events:', error);
      throw this.handleError(error);
    }
  }

  /**
   * List available sessions
   */
  async listSessions(): Promise<Array<{ sessionId: string; timestamp: number; metadata: Record<string, unknown> }>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/visualization/sessions`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Export graph data as JSON
   */
  async exportGraphJSON(sessionId: string): Promise<Blob> {
    try {
      const response = await fetch(`${this.baseUrl}/api/visualization/export/${sessionId}?format=json`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.blob();
    } catch (error) {
      console.error('Failed to export graph JSON:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; timestamp: number }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Health check failed:', error);
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): VisualizationApiError {
    if (error instanceof Error) {
      return {
        message: error.message,
        code: 'API_ERROR',
        details: error,
      };
    }
    return {
      message: 'Unknown error occurred',
      code: 'UNKNOWN_ERROR',
      details: error,
    };
  }
}

// Export singleton instance
export const visualizationApi = new VisualizationApiService();

// Export class for testing
export { VisualizationApiService };
