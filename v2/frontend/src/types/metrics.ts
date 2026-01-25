export interface MetricsData {
  timestamp: number;
  coverage: {
    line: number;
    branch: number;
    function: number;
    statement: number;
  };
  testResults: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
  };
  qualityGates: {
    coveragePercent: number;
    flakyTestRate: number;
    performanceScore: number;
  };
  agentUtilization: {
    agentId: string;
    agentName: string;
    timeSpentMs: number;
    tasksCompleted: number;
  }[];
}

export interface MetricsApiResponse {
  success: boolean;
  data: MetricsData[];
  error?: string;
}

export interface MetricCardData {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: number;
  status?: 'success' | 'warning' | 'error';
  icon?: React.ReactNode;
}

export type TimeRange = '24h' | '7d' | '30d';

export interface ExportOptions {
  format: 'csv' | 'json';
  filename?: string;
  data: MetricsData[];
}
