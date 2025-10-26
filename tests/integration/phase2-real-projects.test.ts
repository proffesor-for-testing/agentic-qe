/**
 * Phase 2 Real Project Integration Tests
 *
 * Tests Phase 2 components on real-world open-source projects:
 * - Small project (100-500 LOC)
 * - Medium project (1000-5000 LOC)
 * - Large project (10000+ LOC)
 *
 * Validates:
 * - Pattern extraction accuracy
 * - Pattern reuse effectiveness
 * - Learning from real codebases
 * - Performance on real projects
 *
 * @module tests/integration/phase2-real-projects
 */

import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { QEReasoningBank } from '@reasoning/QEReasoningBank';
import { LearningEngine } from '@learning/LearningEngine';
import { PatternExtractor } from '@reasoning/PatternExtractor';
import * as fs from 'fs-extra';
import * as path from 'path';

// Mock real project structures
const MOCK_PROJECTS = {
  small: {
    name: 'simple-validator',
    files: [
      {
        path: 'src/validator.ts',
        code: `
export class Validator {
  isEmail(value: string): boolean {
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return emailRegex.test(value);
  }

  isUrl(value: string): boolean {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  isNotEmpty(value: string): boolean {
    return value.trim().length > 0;
  }
}
        `
      },
      {
        path: 'tests/validator.test.ts',
        code: `
import { Validator } from '../src/validator';

describe('Validator', () => {
  let validator: Validator;

  beforeEach(() => {
    validator = new Validator();
  });

  describe('isEmail', () => {
    it('should validate valid email', () => {
      expect(validator.isEmail('test@example.com')).toBe(true);
    });

    it('should reject invalid email', () => {
      expect(validator.isEmail('invalid')).toBe(false);
    });
  });

  describe('isUrl', () => {
    it('should validate valid URL', () => {
      expect(validator.isUrl('https://example.com')).toBe(true);
    });

    it('should reject invalid URL', () => {
      expect(validator.isUrl('not-a-url')).toBe(false);
    });
  });
});
        `
      }
    ]
  },

  medium: {
    name: 'todo-api',
    files: [
      {
        path: 'src/services/TodoService.ts',
        code: `
export class TodoService {
  private todos: Map<string, Todo> = new Map();

  async createTodo(data: CreateTodoDTO): Promise<Todo> {
    if (!data.title || data.title.trim().length === 0) {
      throw new ValidationError('Title is required');
    }

    const todo: Todo = {
      id: generateId(),
      title: data.title,
      description: data.description || '',
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.todos.set(todo.id, todo);
    return todo;
  }

  async updateTodo(id: string, updates: UpdateTodoDTO): Promise<Todo> {
    const todo = this.todos.get(id);
    if (!todo) {
      throw new NotFoundError(\`Todo \${id} not found\`);
    }

    const updated = {
      ...todo,
      ...updates,
      updatedAt: new Date()
    };

    this.todos.set(id, updated);
    return updated;
  }

  async deleteTodo(id: string): Promise<void> {
    if (!this.todos.has(id)) {
      throw new NotFoundError(\`Todo \${id} not found\`);
    }
    this.todos.delete(id);
  }

  async listTodos(filter?: TodoFilter): Promise<Todo[]> {
    let todos = Array.from(this.todos.values());

    if (filter?.completed !== undefined) {
      todos = todos.filter(t => t.completed === filter.completed);
    }

    return todos.sort((a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime()
    );
  }
}
        `
      },
      {
        path: 'tests/integration/todo.test.ts',
        code: `
import { TodoService } from '../../src/services/TodoService';

describe('TodoService Integration', () => {
  let service: TodoService;

  beforeEach(() => {
    service = new TodoService();
  });

  it('should create todo', async () => {
    const todo = await service.createTodo({
      title: 'Test Todo',
      description: 'Test Description'
    });

    expect(todo.id).toBeDefined();
    expect(todo.title).toBe('Test Todo');
    expect(todo.completed).toBe(false);
  });

  it('should update todo', async () => {
    const todo = await service.createTodo({ title: 'Original' });
    const updated = await service.updateTodo(todo.id, { title: 'Updated' });

    expect(updated.title).toBe('Updated');
    expect(updated.updatedAt).not.toEqual(todo.createdAt);
  });

  it('should delete todo', async () => {
    const todo = await service.createTodo({ title: 'To Delete' });
    await service.deleteTodo(todo.id);

    await expect(service.updateTodo(todo.id, {}))
      .rejects.toThrow('not found');
  });
});
        `
      }
    ]
  },

  large: {
    name: 'e-commerce-platform',
    files: [
      {
        path: 'src/modules/order/OrderService.ts',
        code: `
export class OrderService {
  constructor(
    private paymentService: PaymentService,
    private inventoryService: InventoryService,
    private notificationService: NotificationService
  ) {}

  async createOrder(data: CreateOrderDTO): Promise<Order> {
    // Validate items
    await this.validateOrderItems(data.items);

    // Check inventory
    const inventoryCheck = await this.inventoryService.checkAvailability(
      data.items
    );
    if (!inventoryCheck.allAvailable) {
      throw new InsufficientInventoryError(inventoryCheck.unavailableItems);
    }

    // Calculate total
    const total = this.calculateTotal(data.items);

    // Create order
    const order: Order = {
      id: generateId(),
      customerId: data.customerId,
      items: data.items,
      total,
      status: 'pending',
      createdAt: new Date()
    };

    // Reserve inventory
    await this.inventoryService.reserve(order.items);

    // Process payment
    try {
      const payment = await this.paymentService.charge({
        amount: total,
        customerId: data.customerId,
        orderId: order.id
      });

      order.paymentId = payment.id;
      order.status = 'confirmed';
    } catch (error) {
      // Rollback inventory
      await this.inventoryService.release(order.items);
      throw error;
    }

    // Send confirmation
    await this.notificationService.sendOrderConfirmation(order);

    return order;
  }

  async cancelOrder(orderId: string): Promise<void> {
    const order = await this.getOrder(orderId);

    if (order.status !== 'pending' && order.status !== 'confirmed') {
      throw new InvalidOrderStateError('Cannot cancel order');
    }

    // Refund payment
    if (order.paymentId) {
      await this.paymentService.refund(order.paymentId);
    }

    // Release inventory
    await this.inventoryService.release(order.items);

    // Update status
    order.status = 'cancelled';
    await this.saveOrder(order);

    // Send notification
    await this.notificationService.sendOrderCancellation(order);
  }
}
        `
      }
    ]
  }
};

describe('Phase 2 Real Project Integration', () => {
  let reasoningBank: QEReasoningBank;
  let learningEngine: LearningEngine;
  let patternExtractor: PatternExtractor;

  beforeEach(() => {
    reasoningBank = new QEReasoningBank();
    learningEngine = new LearningEngine();
    patternExtractor = new PatternExtractor();
  });

  // ===========================================================================
  // Small Project Tests
  // ===========================================================================

  describe('Small Project: simple-validator', () => {
    it('should extract patterns from small project', async () => {
      const allPatterns = [];

      for (const file of MOCK_PROJECTS.small.files) {
        const patterns = await patternExtractor.extractPatterns(file.code, {
          framework: 'jest',
          language: 'typescript',
          filePath: file.path
        });
        allPatterns.push(...patterns);
      }

      expect(allPatterns.length).toBeGreaterThan(0);
      console.log(`Extracted ${allPatterns.length} patterns from small project`);

      // Patterns should identify validation patterns
      const hasValidationPattern = allPatterns.some(p =>
        p.name.toLowerCase().includes('validat') ||
        p.description.toLowerCase().includes('validat')
      );
      expect(hasValidationPattern).toBe(true);
    });

    it('should learn from small project test outcomes', async () => {
      // Simulate running tests from small project
      const testOutcomes = [
        { name: 'isEmail validates valid email', success: true, duration: 10 },
        { name: 'isEmail rejects invalid email', success: true, duration: 8 },
        { name: 'isUrl validates valid URL', success: true, duration: 12 },
        { name: 'isUrl rejects invalid URL', success: true, duration: 9 }
      ];

      for (const outcome of testOutcomes) {
        await learningEngine.recordOutcome({
          id: `small-${outcome.name}`,
          timestamp: new Date(),
          testId: outcome.name,
          testName: outcome.name,
          outcome: outcome.success ? 'success' : 'failure',
          executionTime: outcome.duration,
          coverage: 0.95,
          edgeCasesCaught: 4,
          feedback: {
            quality: 0.9,
            relevance: 0.95
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 1,
            linesOfCode: 50,
            project: 'simple-validator'
          }
        });
      }

      const stats = learningEngine.getStatistics();
      expect(stats.totalRecords).toBe(testOutcomes.length);
      expect(stats.averageQuality).toBeGreaterThan(0.85);
    });

    it('should measure pattern reuse effectiveness', async () => {
      // Extract and store patterns
      const patterns = await patternExtractor.extractPatterns(
        MOCK_PROJECTS.small.files[1].code,
        { framework: 'jest', language: 'typescript' }
      );

      const storedPatternIds = [];
      for (const pattern of patterns) {
        const id = await reasoningBank.storePattern({
          id: `small-pattern-${Date.now()}-${Math.random()}`,
          name: pattern.name,
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          description: pattern.description,
          template: pattern.template || '',
          applicability: { complexity: 'low', context: [], constraints: [] },
          metrics: {
            successRate: 1.0,
            usageCount: 0,
            averageQuality: 0,
            lastUsed: new Date()
          },
          tags: ['validation', 'unit'],
          metadata: { project: 'simple-validator' }
        });
        storedPatternIds.push(id);
      }

      // Simulate reusing patterns
      for (const patternId of storedPatternIds) {
        await reasoningBank.updateMetrics(patternId, true, 0.92);
      }

      // Verify patterns were effectively reused
      const firstPattern = await reasoningBank.getPattern(storedPatternIds[0]);
      expect(firstPattern!.metrics.usageCount).toBeGreaterThan(0);
      expect(firstPattern!.metrics.averageQuality).toBeGreaterThan(0.9);
    });
  });

  // ===========================================================================
  // Medium Project Tests
  // ===========================================================================

  describe('Medium Project: todo-api', () => {
    it('should extract patterns from medium project', async () => {
      const allPatterns = [];

      for (const file of MOCK_PROJECTS.medium.files) {
        const patterns = await patternExtractor.extractPatterns(file.code, {
          framework: 'jest',
          language: 'typescript',
          filePath: file.path
        });
        allPatterns.push(...patterns);
      }

      expect(allPatterns.length).toBeGreaterThan(0);
      console.log(`Extracted ${allPatterns.length} patterns from medium project`);

      // Should identify CRUD patterns
      const hasCrudPattern = allPatterns.some(p =>
        p.tags?.some(t => ['crud', 'create', 'update', 'delete'].includes(t.toLowerCase()))
      );
      expect(hasCrudPattern).toBe(true);
    });

    it('should learn from medium project complexity', async () => {
      // Simulate test outcomes with varying complexity
      const complexities = [
        { level: 2, success: 0.95, edgeCases: 6 },
        { level: 3, success: 0.88, edgeCases: 8 },
        { level: 4, success: 0.80, edgeCases: 10 }
      ];

      for (let i = 0; i < 20; i++) {
        const complexity = complexities[i % complexities.length];

        await learningEngine.recordOutcome({
          id: `medium-${i}`,
          timestamp: new Date(),
          testId: `todo-test-${i}`,
          testName: `Todo Test ${i}`,
          outcome: Math.random() < complexity.success ? 'success' : 'failure',
          executionTime: 50 + complexity.level * 30,
          coverage: complexity.success,
          edgeCasesCaught: complexity.edgeCases,
          feedback: {
            quality: complexity.success,
            relevance: 0.9
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: complexity.level,
            linesOfCode: 100 + complexity.level * 50,
            project: 'todo-api'
          }
        });
      }

      // Analyze learning insights
      const insights = await learningEngine.analyzeTrends();
      expect(insights.length).toBeGreaterThan(0);

      // Should have insights about complexity vs quality
      const stats = learningEngine.getStatistics();
      expect(stats.totalRecords).toBe(20);
    });

    it('should identify integration test patterns', async () => {
      const integrationTest = MOCK_PROJECTS.medium.files.find(f =>
        f.path.includes('integration')
      );

      if (integrationTest) {
        const patterns = await patternExtractor.extractPatterns(integrationTest.code, {
          framework: 'jest',
          language: 'typescript'
        });

        // Should identify integration patterns
        const hasIntegrationPattern = patterns.some(p =>
          p.category === 'integration' ||
          p.name.toLowerCase().includes('integration')
        );
        expect(hasIntegrationPattern).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Large Project Tests
  // ===========================================================================

  describe('Large Project: e-commerce-platform', () => {
    it('should handle large project complexity', async () => {
      const largeFile = MOCK_PROJECTS.large.files[0];

      const patterns = await patternExtractor.extractPatterns(largeFile.code, {
        framework: 'jest',
        language: 'typescript',
        filePath: largeFile.path
      });

      expect(patterns.length).toBeGreaterThan(0);
      console.log(`Extracted ${patterns.length} patterns from large project file`);

      // Should identify complex patterns (transactions, error handling, etc.)
      const hasComplexPattern = patterns.some(p =>
        p.complexity === 'high' ||
        p.tags?.some(t => ['transaction', 'rollback', 'error-handling'].includes(t))
      );
      expect(hasComplexPattern).toBe(true);
    });

    it('should learn from large project error patterns', async () => {
      // Simulate complex test scenarios with errors
      const scenarios = [
        { type: 'success', duration: 500, quality: 0.9 },
        { type: 'inventory-failure', duration: 300, quality: 0.7 },
        { type: 'payment-failure', duration: 450, quality: 0.75 },
        { type: 'notification-failure', duration: 520, quality: 0.8 }
      ];

      for (let i = 0; i < 30; i++) {
        const scenario = scenarios[i % scenarios.length];

        await learningEngine.recordOutcome({
          id: `large-${i}`,
          timestamp: new Date(),
          testId: `order-test-${i}`,
          testName: `Order ${scenario.type} Test`,
          outcome: scenario.type === 'success' ? 'success' : 'failure',
          executionTime: scenario.duration,
          coverage: scenario.quality,
          edgeCasesCaught: scenario.type === 'success' ? 12 : 8,
          feedback: {
            quality: scenario.quality,
            relevance: 0.95
          },
          metadata: {
            framework: 'jest',
            language: 'typescript',
            complexity: 5,
            linesOfCode: 300,
            project: 'e-commerce-platform',
            scenario: scenario.type
          }
        });
      }

      // Should learn error handling patterns
      const insights = await learningEngine.analyzeTrends();
      const stats = learningEngine.getStatistics();

      expect(stats.totalRecords).toBe(30);
      expect(insights.length).toBeGreaterThan(0);
    });

    it('should recommend patterns for large project scenarios', async () => {
      // Store complex patterns
      await reasoningBank.storePattern({
        id: 'large-pattern-transaction',
        name: 'Transaction Rollback Pattern',
        category: 'integration',
        framework: 'jest',
        language: 'typescript',
        description: 'Pattern for testing transaction rollback scenarios',
        template: 'try-catch with rollback',
        applicability: {
          complexity: 'high',
          context: ['transaction', 'database', 'rollback'],
          constraints: []
        },
        metrics: {
          successRate: 0.85,
          usageCount: 50,
          averageQuality: 0.88,
          lastUsed: new Date()
        },
        tags: ['transaction', 'rollback', 'error-handling'],
        metadata: { project: 'e-commerce-platform' }
      });

      // Find patterns for similar complex scenario
      const matches = await reasoningBank.findMatchingPatterns({
        framework: 'jest',
        language: 'typescript',
        tags: ['transaction', 'error-handling'],
        limit: 5
      });

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].pattern.name).toContain('Transaction');
    });
  });

  // ===========================================================================
  // Cross-Project Learning
  // ===========================================================================

  describe('Cross-Project Learning', () => {
    it('should apply patterns learned from one project to another', async () => {
      // Extract patterns from small project
      const smallPatterns = await patternExtractor.extractPatterns(
        MOCK_PROJECTS.small.files[1].code,
        { framework: 'jest', language: 'typescript' }
      );

      // Store patterns
      for (const pattern of smallPatterns) {
        await reasoningBank.storePattern({
          id: `cross-${Date.now()}-${Math.random()}`,
          name: pattern.name,
          category: 'unit',
          framework: 'jest',
          language: 'typescript',
          description: pattern.description,
          template: pattern.template || '',
          applicability: { complexity: 'low', context: [], constraints: [] },
          metrics: {
            successRate: 0.95,
            usageCount: 10,
            averageQuality: 0.9,
            lastUsed: new Date()
          },
          tags: pattern.tags || [],
          metadata: { sourceProject: 'simple-validator' }
        });
      }

      // Apply to medium project
      const mediumMatches = await reasoningBank.findMatchingPatterns({
        framework: 'jest',
        language: 'typescript',
        limit: 5
      });

      expect(mediumMatches.length).toBeGreaterThan(0);

      // Patterns from small project should be reusable
      const hasReusablePattern = mediumMatches.some(m =>
        m.pattern.metadata?.sourceProject === 'simple-validator'
      );
      expect(hasReusablePattern).toBe(true);
    });

    it('should aggregate learning insights across projects', async () => {
      // Record outcomes from all three projects
      const projects = [
        { name: 'simple-validator', complexity: 1, count: 10 },
        { name: 'todo-api', complexity: 3, count: 15 },
        { name: 'e-commerce-platform', complexity: 5, count: 20 }
      ];

      for (const project of projects) {
        for (let i = 0; i < project.count; i++) {
          await learningEngine.recordOutcome({
            id: `${project.name}-${i}`,
            timestamp: new Date(),
            testId: `${project.name}-test-${i}`,
            testName: `${project.name} Test ${i}`,
            outcome: 'success',
            executionTime: 50 + project.complexity * 50,
            coverage: 0.85 + Math.random() * 0.1,
            edgeCasesCaught: 4 + project.complexity * 2,
            feedback: {
              quality: 0.8 + Math.random() * 0.15,
              relevance: 0.9
            },
            metadata: {
              framework: 'jest',
              language: 'typescript',
              complexity: project.complexity,
              linesOfCode: 100 + project.complexity * 50,
              project: project.name
            }
          });
        }
      }

      // Aggregate insights
      const insights = await learningEngine.analyzeTrends();
      const stats = learningEngine.getStatistics();

      expect(stats.totalRecords).toBe(45); // 10 + 15 + 20
      expect(insights.length).toBeGreaterThan(0);

      // Should have insights about complexity trends
      console.log(`Cross-project insights: ${insights.length}`);
      console.log(`Average quality across projects: ${stats.averageQuality.toFixed(2)}`);
    });
  });
});
