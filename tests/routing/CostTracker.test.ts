/**
 * Comprehensive Tests for CostTracker
 * Tests cost aggregation, reporting, budget limits, and cost optimization
 *
 * @module tests/routing/CostTracker
 */

// ===========================================================================
// Mock Types and Interfaces
// ===========================================================================

interface UsageRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  taskType: string;
  testsGenerated?: number;
  timestamp?: number;
}

interface CostMetrics {
  totalCost: number;
  costByModel: Record<string, number>;
  costByTaskType: Record<string, number>;
  testsGenerated: number;
  averageCostPerTest: number;
  requestCount: number;
  tokenUsage: {
    total: number;
    byModel: Record<string, number>;
  };
}

interface CostDashboard {
  totalCost: number;
  costByModel: Record<string, number>;
  costByTaskType: Record<string, number>;
  costPerTest: number;
  testsGenerated: number;
  timestamp: string;
  modelBreakdown: Array<{
    model: string;
    cost: number;
    percentage: number;
    requests: number;
  }>;
  savingsVsBaseline?: number;
  projectedMonthlyCost?: number;
}

interface CostTrackerConfig {
  budgetLimit?: number;
  alertThreshold?: number;
  enablePersistence?: boolean;
}

// Model cost configurations (per token)
const MODEL_COSTS: Record<string, number> = {
  'gpt-3.5-turbo': 0.000002,
  'gpt-4': 0.00006,
  'claude-sonnet-4.5': 0.00003,
  'claude-haiku': 0.000008,
  'gemini-pro': 0.00000025
};

// ===========================================================================
// Mock SwarmMemoryManager
// ===========================================================================

class MockMemoryStore {
  private data = new Map<string, any>();

  async store(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async retrieve(key: string): Promise<any> {
    return this.data.get(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

// ===========================================================================
// CostTracker Implementation
// ===========================================================================

class CostTracker {
  private metrics: CostMetrics = {
    totalCost: 0,
    costByModel: {},
    costByTaskType: {},
    testsGenerated: 0,
    averageCostPerTest: 0,
    requestCount: 0,
    tokenUsage: {
      total: 0,
      byModel: {}
    }
  };

  private usageHistory: UsageRecord[] = [];
  private budgetAlerts: Array<{ threshold: number; triggered: boolean }> = [];

  constructor(
    private memoryStore?: MockMemoryStore,
    private config: CostTrackerConfig = {}
  ) {
    // Set up budget alerts if configured
    if (config.budgetLimit) {
      this.budgetAlerts = [
        { threshold: 0.5, triggered: false },
        { threshold: 0.75, triggered: false },
        { threshold: 0.9, triggered: false }
      ];
    }
  }

  /**
   * Record usage and update cost metrics
   */
  async recordUsage(usage: UsageRecord): Promise<void> {
    const totalTokens = usage.inputTokens + usage.outputTokens;
    const costPerToken = MODEL_COSTS[usage.model] || 0.00001;
    const cost = totalTokens * costPerToken;

    // Update total cost
    this.metrics.totalCost += cost;

    // Update cost by model
    this.metrics.costByModel[usage.model] = (this.metrics.costByModel[usage.model] || 0) + cost;

    // Update cost by task type
    this.metrics.costByTaskType[usage.taskType] = (this.metrics.costByTaskType[usage.taskType] || 0) + cost;

    // Update token usage
    this.metrics.tokenUsage.total += totalTokens;
    this.metrics.tokenUsage.byModel[usage.model] = (this.metrics.tokenUsage.byModel[usage.model] || 0) + totalTokens;

    // Update test count
    if (usage.testsGenerated) {
      this.metrics.testsGenerated += usage.testsGenerated;
    }

    // Update request count
    this.metrics.requestCount++;

    // Recalculate average cost per test
    this.metrics.averageCostPerTest = this.metrics.testsGenerated > 0
      ? this.metrics.totalCost / this.metrics.testsGenerated
      : 0;

    // Add to history
    this.usageHistory.push({
      ...usage,
      timestamp: Date.now()
    });

    // Check budget alerts
    this.checkBudgetAlerts();
  }

  /**
   * Get current metrics
   */
  getMetrics(): CostMetrics {
    return { ...this.metrics };
  }

  /**
   * Export dashboard with detailed breakdown
   */
  exportDashboard(): CostDashboard {
    const modelBreakdown = Object.entries(this.metrics.costByModel).map(([model, cost]) => {
      const requests = this.usageHistory.filter(u => u.model === model).length;
      return {
        model,
        cost,
        percentage: (cost / this.metrics.totalCost) * 100,
        requests
      };
    }).sort((a, b) => b.cost - a.cost);

    // Calculate savings vs baseline (GPT-4 for everything)
    const baselineCost = this.calculateBaselineCost('gpt-4');
    const savingsVsBaseline = ((baselineCost - this.metrics.totalCost) / baselineCost) * 100;

    // Project monthly cost based on current usage
    const daysTracked = this.usageHistory.length > 0
      ? (Date.now() - this.usageHistory[0].timestamp!) / (1000 * 60 * 60 * 24)
      : 1;
    const projectedMonthlyCost = (this.metrics.totalCost / daysTracked) * 30;

    return {
      totalCost: this.metrics.totalCost,
      costByModel: this.metrics.costByModel,
      costByTaskType: this.metrics.costByTaskType,
      costPerTest: this.metrics.averageCostPerTest,
      testsGenerated: this.metrics.testsGenerated,
      timestamp: new Date().toISOString(),
      modelBreakdown,
      savingsVsBaseline: isFinite(savingsVsBaseline) ? savingsVsBaseline : 0,
      projectedMonthlyCost
    };
  }

  /**
   * Persist cost data to memory
   */
  async persist(): Promise<void> {
    if (this.memoryStore) {
      await this.memoryStore.store('cost-tracker:metrics', this.metrics);
      await this.memoryStore.store('cost-tracker:history', this.usageHistory);
    }
  }

  /**
   * Load cost data from memory
   */
  async load(): Promise<void> {
    if (this.memoryStore) {
      const storedMetrics = await this.memoryStore.retrieve('cost-tracker:metrics');
      const storedHistory = await this.memoryStore.retrieve('cost-tracker:history');

      if (storedMetrics) {
        this.metrics = storedMetrics;
      }

      if (storedHistory) {
        this.usageHistory = storedHistory;
      }
    }
  }

  /**
   * Reset all cost data
   */
  reset(): void {
    this.metrics = {
      totalCost: 0,
      costByModel: {},
      costByTaskType: {},
      testsGenerated: 0,
      averageCostPerTest: 0,
      requestCount: 0,
      tokenUsage: {
        total: 0,
        byModel: {}
      }
    };
    this.usageHistory = [];
    this.budgetAlerts.forEach(alert => alert.triggered = false);
  }

  /**
   * Get usage history
   */
  getHistory(): UsageRecord[] {
    return [...this.usageHistory];
  }

  /**
   * Get cost for specific time period
   */
  getCostForPeriod(startTime: number, endTime: number): number {
    return this.usageHistory
      .filter(u => u.timestamp! >= startTime && u.timestamp! <= endTime)
      .reduce((sum, u) => sum + ((u.inputTokens + u.outputTokens) * (MODEL_COSTS[u.model] || 0.00001)), 0);
  }

  /**
   * Get cost breakdown by time period
   */
  getCostByPeriod(periodMs: number): Array<{ period: string; cost: number }> {
    if (this.usageHistory.length === 0) return [];

    const periods: Array<{ period: string; cost: number }> = [];
    const firstTimestamp = this.usageHistory[0].timestamp!;
    const lastTimestamp = this.usageHistory[this.usageHistory.length - 1].timestamp!;

    for (let t = firstTimestamp; t <= lastTimestamp; t += periodMs) {
      const cost = this.getCostForPeriod(t, t + periodMs);
      periods.push({
        period: new Date(t).toISOString(),
        cost
      });
    }

    return periods;
  }

  /**
   * Calculate baseline cost (if using single model for all tasks)
   */
  private calculateBaselineCost(baselineModel: string): number {
    const baselineCostPerToken = MODEL_COSTS[baselineModel] || 0.00006;
    return this.usageHistory.reduce((sum, usage) => {
      const tokens = usage.inputTokens + usage.outputTokens;
      return sum + (tokens * baselineCostPerToken);
    }, 0);
  }

  /**
   * Check budget alerts
   */
  private checkBudgetAlerts(): void {
    if (!this.config.budgetLimit) return;

    const usagePercent = this.metrics.totalCost / this.config.budgetLimit;

    this.budgetAlerts.forEach(alert => {
      if (!alert.triggered && usagePercent >= alert.threshold) {
        alert.triggered = true;
        console.warn(`Budget alert: ${(alert.threshold * 100).toFixed(0)}% of budget used ($${this.metrics.totalCost.toFixed(4)} / $${this.config.budgetLimit})`);
      }
    });
  }

  /**
   * Check if budget limit exceeded
   */
  isBudgetExceeded(): boolean {
    if (!this.config.budgetLimit) return false;
    return this.metrics.totalCost >= this.config.budgetLimit;
  }

  /**
   * Get remaining budget
   */
  getRemainingBudget(): number {
    if (!this.config.budgetLimit) return Infinity;
    return Math.max(0, this.config.budgetLimit - this.metrics.totalCost);
  }

  /**
   * Get most cost-effective model for recent usage
   */
  getMostCostEffectiveModel(): { model: string; avgCostPerTest: number } | null {
    const modelStats = new Map<string, { totalCost: number; testsGenerated: number }>();

    this.usageHistory.forEach(usage => {
      if (!usage.testsGenerated) return;

      const cost = (usage.inputTokens + usage.outputTokens) * (MODEL_COSTS[usage.model] || 0.00001);
      const stats = modelStats.get(usage.model) || { totalCost: 0, testsGenerated: 0 };

      stats.totalCost += cost;
      stats.testsGenerated += usage.testsGenerated;

      modelStats.set(usage.model, stats);
    });

    let bestModel: { model: string; avgCostPerTest: number } | null = null;

    modelStats.forEach((stats, model) => {
      const avgCostPerTest = stats.totalCost / stats.testsGenerated;

      if (!bestModel || avgCostPerTest < bestModel.avgCostPerTest) {
        bestModel = { model, avgCostPerTest };
      }
    });

    return bestModel;
  }
}

// ===========================================================================
// Unit Tests
// ===========================================================================

describe('CostTracker', () => {
  let costTracker: CostTracker;
  let mockMemoryStore: MockMemoryStore;

  beforeEach(() => {
    mockMemoryStore = new MockMemoryStore();
    costTracker = new CostTracker(mockMemoryStore);
  });

  afterEach(async () => {
    await mockMemoryStore.clear();
  });

  // -------------------------------------------------------------------------
  // Basic Cost Tracking Tests
  // -------------------------------------------------------------------------

  describe('Basic Cost Tracking', () => {
    it('should track costs accurately per request', async () => {
      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation'
      });

      const metrics = costTracker.getMetrics();

      const expectedCost = (100 + 200) * MODEL_COSTS['gpt-3.5-turbo'];
      expect(metrics.totalCost).toBeCloseTo(expectedCost, 8);
      expect(metrics.costByModel['gpt-3.5-turbo']).toBeCloseTo(expectedCost, 8);
    });

    it('should aggregate multiple requests', async () => {
      const usages: UsageRecord[] = [
        { model: 'gpt-3.5-turbo', inputTokens: 100, outputTokens: 200, taskType: 'unit-test' },
        { model: 'gpt-3.5-turbo', inputTokens: 150, outputTokens: 250, taskType: 'unit-test' },
        { model: 'gpt-4', inputTokens: 100, outputTokens: 200, taskType: 'integration-test' }
      ];

      for (const usage of usages) {
        await costTracker.recordUsage(usage);
      }

      const metrics = costTracker.getMetrics();

      expect(metrics.requestCount).toBe(3);
      expect(Object.keys(metrics.costByModel)).toHaveLength(2);
      expect(metrics.totalCost).toBeGreaterThan(0);
    });

    it('should track token usage', async () => {
      await costTracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 500,
        outputTokens: 1000,
        taskType: 'test-generation'
      });

      const metrics = costTracker.getMetrics();

      expect(metrics.tokenUsage.total).toBe(1500);
      expect(metrics.tokenUsage.byModel['gpt-4']).toBe(1500);
    });

    it('should track test generation count', async () => {
      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation',
        testsGenerated: 5
      });

      await costTracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 150,
        outputTokens: 250,
        taskType: 'test-generation',
        testsGenerated: 3
      });

      const metrics = costTracker.getMetrics();

      expect(metrics.testsGenerated).toBe(8);
    });
  });

  // -------------------------------------------------------------------------
  // Cost Aggregation Tests
  // -------------------------------------------------------------------------

  describe('Cost Aggregation', () => {
    it('should aggregate costs by model', async () => {
      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation'
      });

      await costTracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 150,
        outputTokens: 250,
        taskType: 'test-generation'
      });

      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation'
      });

      const metrics = costTracker.getMetrics();

      expect(Object.keys(metrics.costByModel)).toHaveLength(2);

      const gpt35Cost = 2 * (300 * MODEL_COSTS['gpt-3.5-turbo']);
      expect(metrics.costByModel['gpt-3.5-turbo']).toBeCloseTo(gpt35Cost, 8);
    });

    it('should aggregate costs by task type', async () => {
      await costTracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'unit-test'
      });

      await costTracker.recordUsage({
        model: 'claude-sonnet-4.5',
        inputTokens: 150,
        outputTokens: 250,
        taskType: 'security-test'
      });

      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 80,
        outputTokens: 120,
        taskType: 'unit-test'
      });

      const metrics = costTracker.getMetrics();

      expect(Object.keys(metrics.costByTaskType)).toHaveLength(2);
      expect(metrics.costByTaskType['unit-test']).toBeDefined();
      expect(metrics.costByTaskType['security-test']).toBeDefined();
    });

    it('should calculate accurate cost per test', async () => {
      // Record costs for 10 tests
      for (let i = 0; i < 10; i++) {
        await costTracker.recordUsage({
          model: 'gpt-3.5-turbo',
          inputTokens: 100,
          outputTokens: 200,
          taskType: 'test-generation',
          testsGenerated: 5
        });
      }

      const metrics = costTracker.getMetrics();

      expect(metrics.testsGenerated).toBe(50);
      expect(metrics.averageCostPerTest).toBeGreaterThan(0);
      expect(metrics.averageCostPerTest).toBeCloseTo(metrics.totalCost / 50, 8);
    });
  });

  // -------------------------------------------------------------------------
  // Dashboard Export Tests
  // -------------------------------------------------------------------------

  describe('Dashboard Export', () => {
    it('should export comprehensive dashboard data', async () => {
      await costTracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 2000,
        taskType: 'test-generation',
        testsGenerated: 10
      });

      const dashboard = costTracker.exportDashboard();

      expect(dashboard).toHaveProperty('totalCost');
      expect(dashboard).toHaveProperty('costByModel');
      expect(dashboard).toHaveProperty('costByTaskType');
      expect(dashboard).toHaveProperty('costPerTest');
      expect(dashboard).toHaveProperty('timestamp');
      expect(dashboard.modelBreakdown).toBeDefined();
      expect(Array.isArray(dashboard.modelBreakdown)).toBe(true);
    });

    it('should include model breakdown with percentages', async () => {
      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation'
      });

      await costTracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation'
      });

      const dashboard = costTracker.exportDashboard();

      expect(dashboard.modelBreakdown.length).toBe(2);

      dashboard.modelBreakdown.forEach(breakdown => {
        expect(breakdown).toHaveProperty('model');
        expect(breakdown).toHaveProperty('cost');
        expect(breakdown).toHaveProperty('percentage');
        expect(breakdown).toHaveProperty('requests');
        expect(breakdown.percentage).toBeGreaterThan(0);
        expect(breakdown.percentage).toBeLessThanOrEqual(100);
      });

      // Verify percentages sum to 100
      const totalPercentage = dashboard.modelBreakdown.reduce((sum, b) => sum + b.percentage, 0);
      expect(totalPercentage).toBeCloseTo(100, 1);
    });

    it('should calculate savings vs baseline', async () => {
      // Use cheap model
      await costTracker.recordUsage({
        model: 'claude-haiku',
        inputTokens: 1000,
        outputTokens: 2000,
        taskType: 'test-generation'
      });

      const dashboard = costTracker.exportDashboard();

      // Savings should be positive (cheaper than GPT-4 baseline)
      expect(dashboard.savingsVsBaseline).toBeGreaterThan(0);
    });

    it('should project monthly costs', async () => {
      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 500,
        outputTokens: 1000,
        taskType: 'test-generation'
      });

      const dashboard = costTracker.exportDashboard();

      expect(dashboard.projectedMonthlyCost).toBeDefined();
      expect(dashboard.projectedMonthlyCost).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Persistence Tests
  // -------------------------------------------------------------------------

  describe('Persistence', () => {
    it('should persist cost data to memory', async () => {
      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation'
      });

      await costTracker.persist();

      const storedData = await mockMemoryStore.retrieve('cost-tracker:metrics');
      expect(storedData).toBeDefined();
      expect(storedData.totalCost).toBeGreaterThan(0);
    });

    it('should load cost data from memory', async () => {
      // Record initial data
      await costTracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 200,
        outputTokens: 400,
        taskType: 'test-generation',
        testsGenerated: 5
      });

      await costTracker.persist();

      // Create new tracker and load
      const newTracker = new CostTracker(mockMemoryStore);
      await newTracker.load();

      const metrics = newTracker.getMetrics();
      expect(metrics.totalCost).toBeGreaterThan(0);
      expect(metrics.testsGenerated).toBe(5);
    });

    it('should persist usage history', async () => {
      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation'
      });

      await costTracker.persist();

      const history = await mockMemoryStore.retrieve('cost-tracker:history');
      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Budget Management Tests
  // -------------------------------------------------------------------------

  describe('Budget Management', () => {
    it('should track budget usage', async () => {
      const trackerWithBudget = new CostTracker(mockMemoryStore, {
        budgetLimit: 1.0
      });

      await trackerWithBudget.recordUsage({
        model: 'gpt-4',
        inputTokens: 5000,
        outputTokens: 10000,
        taskType: 'test-generation'
      });

      const remaining = trackerWithBudget.getRemainingBudget();
      expect(remaining).toBeLessThan(1.0);
      expect(remaining).toBeGreaterThanOrEqual(0);
    });

    it('should detect budget exceeded', async () => {
      const trackerWithBudget = new CostTracker(mockMemoryStore, {
        budgetLimit: 0.001 // Very small budget
      });

      await trackerWithBudget.recordUsage({
        model: 'gpt-4',
        inputTokens: 5000,
        outputTokens: 10000,
        taskType: 'test-generation'
      });

      expect(trackerWithBudget.isBudgetExceeded()).toBe(true);
    });

    it('should return Infinity for unlimited budget', () => {
      const trackerNoBudget = new CostTracker(mockMemoryStore);

      const remaining = trackerNoBudget.getRemainingBudget();
      expect(remaining).toBe(Infinity);
      expect(trackerNoBudget.isBudgetExceeded()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Time-based Analysis Tests
  // -------------------------------------------------------------------------

  describe('Time-based Analysis', () => {
    it('should get cost for specific time period', async () => {
      const startTime = Date.now();

      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation'
      });

      const endTime = Date.now();

      const cost = costTracker.getCostForPeriod(startTime, endTime);
      expect(cost).toBeGreaterThan(0);
    });

    it('should group costs by time period', async () => {
      // Record multiple usages
      for (let i = 0; i < 5; i++) {
        await costTracker.recordUsage({
          model: 'gpt-3.5-turbo',
          inputTokens: 100,
          outputTokens: 200,
          taskType: 'test-generation'
        });
      }

      const periods = costTracker.getCostByPeriod(60000); // 1 minute periods
      expect(periods.length).toBeGreaterThan(0);
      expect(periods[0]).toHaveProperty('period');
      expect(periods[0]).toHaveProperty('cost');
    });
  });

  // -------------------------------------------------------------------------
  // Utility Tests
  // -------------------------------------------------------------------------

  describe('Utilities', () => {
    it('should reset all data', async () => {
      await costTracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 2000,
        taskType: 'test-generation',
        testsGenerated: 10
      });

      costTracker.reset();

      const metrics = costTracker.getMetrics();
      expect(metrics.totalCost).toBe(0);
      expect(metrics.testsGenerated).toBe(0);
      expect(Object.keys(metrics.costByModel)).toHaveLength(0);
    });

    it('should return usage history', async () => {
      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation'
      });

      const history = costTracker.getHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(1);
      expect(history[0].model).toBe('gpt-3.5-turbo');
    });

    it('should identify most cost-effective model', async () => {
      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation',
        testsGenerated: 10
      });

      await costTracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation',
        testsGenerated: 5
      });

      const mostEffective = costTracker.getMostCostEffectiveModel();
      expect(mostEffective).not.toBeNull();
      expect(mostEffective!.model).toBe('gpt-3.5-turbo'); // Cheaper per test
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle unknown model gracefully', async () => {
      await costTracker.recordUsage({
        model: 'unknown-model',
        inputTokens: 100,
        outputTokens: 200,
        taskType: 'test-generation'
      });

      const metrics = costTracker.getMetrics();
      expect(metrics.totalCost).toBeGreaterThan(0); // Uses default cost
    });

    it('should handle zero tokens', async () => {
      await costTracker.recordUsage({
        model: 'gpt-3.5-turbo',
        inputTokens: 0,
        outputTokens: 0,
        taskType: 'test-generation'
      });

      const metrics = costTracker.getMetrics();
      expect(metrics.totalCost).toBe(0);
    });

    it('should handle very large token counts', async () => {
      await costTracker.recordUsage({
        model: 'gpt-4',
        inputTokens: 1000000,
        outputTokens: 2000000,
        taskType: 'test-generation'
      });

      const metrics = costTracker.getMetrics();
      expect(metrics.totalCost).toBeGreaterThan(0);
      expect(isFinite(metrics.totalCost)).toBe(true);
    });

    it('should handle concurrent recordings', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        costTracker.recordUsage({
          model: 'gpt-3.5-turbo',
          inputTokens: 100,
          outputTokens: 200,
          taskType: 'test-generation'
        })
      );

      await Promise.all(promises);

      const metrics = costTracker.getMetrics();
      expect(metrics.requestCount).toBe(10);
    });
  });
});
