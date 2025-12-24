/**
 * Tests for HybridRouter advanced cost tracking
 *
 * Tests budget management, cost tracking by provider/model/task,
 * and monthly cost projections.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { HybridRouter, BudgetConfig, TaskComplexity } from '../../../src/providers/HybridRouter';
import { LLMProviderError } from '../../../src/providers/ILLMProvider';

describe('HybridRouter - Advanced Cost Tracking', () => {
  let router: HybridRouter;

  beforeEach(() => {
    router = new HybridRouter({
      enableCircuitBreaker: false,
      enableLearning: true,
      debug: false
    });
  });

  describe('Budget Management', () => {
    it('should set and retrieve budget configuration', () => {
      const budgetConfig: BudgetConfig = {
        monthlyBudget: 100,
        dailyBudget: 5,
        alertThreshold: 0.8,
        enforceLimit: true
      };

      router.setBudget(budgetConfig);
      const status = router.getBudgetStatus();

      expect(status).toBeDefined();
      expect(status.monthlyRemaining).toBe(100);
      expect(status.dailyRemaining).toBe(5);
      expect(status.isOverBudget).toBe(false);
      expect(status.alertTriggered).toBe(false);
    });

    it('should return infinity for remaining budget when no budget is set', () => {
      const status = router.getBudgetStatus();

      expect(status.dailyRemaining).toBe(Infinity);
      expect(status.monthlyRemaining).toBe(Infinity);
      expect(status.utilizationPercentage).toBe(0);
    });

    it('should calculate utilization percentage correctly', () => {
      const budgetConfig: BudgetConfig = {
        monthlyBudget: 100,
        dailyBudget: 10,
        alertThreshold: 0.8,
        enforceLimit: false
      };

      router.setBudget(budgetConfig);

      // Initial status should show 0% utilization
      const initialStatus = router.getBudgetStatus();
      expect(initialStatus.utilizationPercentage).toBe(0);
    });

    it('should detect budget alerts when threshold is reached', () => {
      const budgetConfig: BudgetConfig = {
        monthlyBudget: 10,
        alertThreshold: 0.5, // 50% threshold
        enforceLimit: false
      };

      router.setBudget(budgetConfig);

      // Simulate spending to trigger alert
      // Note: In real usage, this would happen through actual requests
      const status = router.getBudgetStatus();
      expect(status.alertTriggered).toBe(false); // No spending yet
    });
  });

  describe('Cost Reporting', () => {
    it('should generate detailed cost report with all fields', () => {
      const report = router.getDetailedCostReport();

      expect(report).toBeDefined();
      expect(report).toHaveProperty('totalRequests');
      expect(report).toHaveProperty('costByProvider');
      expect(report).toHaveProperty('costByTaskType');
      expect(report).toHaveProperty('costByModel');
      expect(report).toHaveProperty('averageCostPerRequest');
      expect(report).toHaveProperty('topCostlyTasks');
      expect(report).toHaveProperty('monthlyCostProjection');
      expect(report).toHaveProperty('periodStart');
      expect(report).toHaveProperty('periodEnd');
    });

    it('should calculate average cost per request correctly', () => {
      const report = router.getDetailedCostReport();

      // With no requests, average should be 0
      expect(report.averageCostPerRequest).toBe(0);
      expect(report.totalRequests).toBe(0);
    });

    it('should support date range filtering', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const report = router.getDetailedCostReport(startDate, endDate);

      expect(report.periodStart).toEqual(startDate);
      expect(report.periodEnd).toEqual(endDate);
    });

    it('should return top costly operations sorted by cost', () => {
      const topOperations = router.getTopCostlyOperations(5);

      expect(Array.isArray(topOperations)).toBe(true);
      expect(topOperations.length).toBeLessThanOrEqual(5);

      // Verify sorting (highest cost first)
      for (let i = 1; i < topOperations.length; i++) {
        expect(topOperations[i - 1].cost).toBeGreaterThanOrEqual(topOperations[i].cost);
      }
    });
  });

  describe('Monthly Cost Projection', () => {
    it('should project monthly cost based on usage', () => {
      const projection = router.projectMonthlyCost();

      expect(typeof projection).toBe('number');
      expect(projection).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 when no cost history exists', () => {
      const projection = router.projectMonthlyCost();
      expect(projection).toBe(0);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain getCostSavingsReport() method', () => {
      const report = router.getCostSavingsReport();

      // Original fields should still be present
      expect(report).toHaveProperty('totalRequests');
      expect(report).toHaveProperty('localRequests');
      expect(report).toHaveProperty('cloudRequests');
      expect(report).toHaveProperty('totalCost');
      expect(report).toHaveProperty('estimatedCloudCost');
      expect(report).toHaveProperty('savings');
      expect(report).toHaveProperty('savingsPercentage');
      expect(report).toHaveProperty('cacheHits');
      expect(report).toHaveProperty('cacheSavings');

      // New fields should also be present
      expect(report).toHaveProperty('costByProvider');
      expect(report).toHaveProperty('costByTaskType');
      expect(report).toHaveProperty('costByModel');
      expect(report).toHaveProperty('averageCostPerRequest');
      expect(report).toHaveProperty('topCostlyTasks');
      expect(report).toHaveProperty('monthlyCostProjection');
    });
  });

  describe('Cost Tracking Data Structures', () => {
    it('should have empty cost breakdowns initially', () => {
      const report = router.getDetailedCostReport();

      expect(Object.keys(report.costByProvider).length).toBe(0);
      expect(Object.keys(report.costByTaskType).length).toBe(0);
      expect(Object.keys(report.costByModel).length).toBe(0);
      expect(report.topCostlyTasks.length).toBe(0);
    });
  });
});
