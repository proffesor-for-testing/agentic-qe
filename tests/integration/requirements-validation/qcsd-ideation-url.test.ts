/**
 * QCSD Ideation Swarm URL Integration Tests
 *
 * Verifies the complete URL-to-QCSD pipeline:
 * 1. Website content extraction from live URLs
 * 2. Feature detection from HTML content
 * 3. Epic description generation from website structure
 * 4. Acceptance criteria generation
 * 5. Content flag detection for conditional agents
 * 6. Workflow orchestrator integration
 * 7. Error handling for invalid URLs
 *
 * These tests use mock HTTP responses to ensure deterministic behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  QCSDIdeationPlugin,
  WebsiteExtractionResult,
} from '../../../src/domains/requirements-validation/qcsd-ideation-plugin';
import {
  WorkflowOrchestrator,
  WorkflowDefinition,
} from '../../../src/coordination/workflow-orchestrator';
import { InMemoryEventBus } from '../../../src/kernel/event-bus';
import { DefaultAgentCoordinator } from '../../../src/kernel/agent-coordinator';
import { MemoryBackend, StoreOptions, EventBus, AgentCoordinator } from '../../../src/kernel/interfaces';
import { DomainName } from '../../../src/shared/types';

// ============================================================================
// Test HTML Content
// ============================================================================

const ECOMMERCE_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Sauce Demo Store - Premium Products</title>
  <meta name="description" content="Shop premium products at Sauce Demo">
</head>
<body>
  <header>
    <nav class="main-menu navigation">
      <a href="/">Home</a>
      <a href="/products">Products</a>
      <a href="/about">About</a>
    </nav>
    <div class="shopping-cart cart-icon">
      <span class="cart-count">0</span>
    </div>
    <form class="search-form">
      <input type="search" placeholder="Search products...">
      <button type="submit">Search</button>
    </form>
  </header>

  <main>
    <section class="product-list product-grid">
      <div class="product-card">
        <img src="/product1.jpg" alt="Product 1">
        <h2>Premium Backpack</h2>
        <span class="price">$29.99</span>
        <button class="add-to-cart">Add to Cart</button>
      </div>
      <div class="product-card">
        <img src="/product2.jpg" alt="Product 2">
        <h2>Bike Light</h2>
        <span class="price">$9.99</span>
        <button class="add-to-cart">Add to Cart</button>
      </div>
    </section>

    <section class="filter-section">
      <select class="sort-by">
        <option>Price: Low to High</option>
        <option>Price: High to Low</option>
      </select>
      <div class="filter-options refine">
        <label><input type="checkbox"> In Stock</label>
        <label><input type="checkbox"> On Sale</label>
      </div>
    </section>
  </main>

  <aside>
    <form class="login-form sign-in">
      <input type="email" placeholder="Email">
      <input type="password" placeholder="Password">
      <button type="submit">Login</button>
    </form>
    <a href="/register" class="sign-up">Create Account</a>
  </aside>

  <footer>
    <form class="newsletter subscribe">
      <input type="email" placeholder="Subscribe to newsletter">
      <button type="submit">Subscribe</button>
    </form>
    <nav class="footer-nav site-map">
      <a href="/privacy">Privacy Policy</a>
      <a href="/terms">Terms of Service</a>
    </nav>
  </footer>
</body>
</html>
`;

const MINIMAL_HTML = `
<!DOCTYPE html>
<html>
<head><title>Simple Page</title></head>
<body>
  <h1>Hello World</h1>
  <p>This is a simple page with no special features.</p>
</body>
</html>
`;

const SECURITY_FOCUSED_HTML = `
<!DOCTYPE html>
<html>
<head><title>Secure Banking Portal</title></head>
<body>
  <form class="login-form" action="/auth/login" method="POST">
    <input type="hidden" name="csrf_token" value="abc123">
    <input type="text" name="username" autocomplete="off">
    <input type="password" name="password" autocomplete="off">
    <button type="submit">Secure Login</button>
  </form>
  <div class="two-factor-auth mfa-section">
    <input type="text" name="totp" placeholder="Enter 2FA code">
  </div>
  <a href="/forgot-password" class="password-reset">Forgot Password?</a>
</body>
</html>
`;

// ============================================================================
// Mock Memory Backend
// ============================================================================

function createMockMemory(): MemoryBackend {
  const store = new Map<string, unknown>();

  return {
    async initialize() {},
    async dispose() {},
    async set<T>(key: string, value: T, _options?: StoreOptions): Promise<void> {
      store.set(key, value);
    },
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async delete(key: string): Promise<boolean> {
      return store.delete(key);
    },
    async has(key: string): Promise<boolean> {
      return store.has(key);
    },
    async search(pattern: string, _limit?: number): Promise<string[]> {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Array.from(store.keys()).filter((k) => regex.test(k));
    },
    async vectorSearch(_embedding: number[], _k: number): Promise<[]> {
      return [];
    },
    async storeVector(
      _key: string,
      _embedding: number[],
      _metadata?: unknown
    ): Promise<void> {},
  };
}

// ============================================================================
// Mock Fetch
// ============================================================================

function createMockFetch(responseMap: Map<string, { status: number; html: string }>) {
  return vi.fn(async (url: string, _options?: RequestInit) => {
    const response = responseMap.get(url);
    if (!response) {
      throw new Error(`Network error: ${url}`);
    }
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.status === 200 ? 'OK' : 'Error',
      text: async () => response.html,
    } as Response;
  });
}

// ============================================================================
// Test Workflow Definition for URL Extraction
// ============================================================================

function createUrlExtractionTestWorkflow(): WorkflowDefinition {
  return {
    id: 'url-extraction-test',
    name: 'URL Extraction Test Workflow',
    description: 'Test workflow for URL content extraction',
    version: '1.0.0',
    steps: [
      {
        id: 'extract-content',
        name: 'Extract Website Content',
        domain: 'requirements-validation' as DomainName,
        action: 'extractWebsiteContent',
        inputMapping: {
          url: 'input.url',
        },
        outputMapping: {
          extraction: 'results.extraction',
        },
      },
    ],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('QCSD Ideation URL Integration', () => {
  let memory: MemoryBackend;
  let eventBus: EventBus;
  let agentCoordinator: AgentCoordinator;
  let orchestrator: WorkflowOrchestrator;
  let plugin: QCSDIdeationPlugin;
  let originalFetch: typeof global.fetch;

  beforeEach(async () => {
    memory = createMockMemory();
    eventBus = new InMemoryEventBus();
    agentCoordinator = new DefaultAgentCoordinator();
    orchestrator = new WorkflowOrchestrator(eventBus, memory, agentCoordinator, {
      maxConcurrentWorkflows: 10,
      defaultStepTimeout: 60000,
      defaultWorkflowTimeout: 600000,
      enableEventTriggers: false,
      persistExecutions: false,
    });

    plugin = new QCSDIdeationPlugin(memory);
    await plugin.initialize();
    await orchestrator.initialize();
    plugin.registerWorkflowActions(orchestrator);

    // Register test workflow
    orchestrator.registerWorkflow(createUrlExtractionTestWorkflow());

    // Save original fetch
    originalFetch = global.fetch;
  });

  afterEach(async () => {
    // Restore original fetch
    global.fetch = originalFetch;
    await orchestrator.dispose();
    await plugin.dispose();
    vi.restoreAllMocks();
  });

  describe('action registration', () => {
    const expectedActions: Array<{ domain: DomainName; action: string }> = [
      { domain: 'requirements-validation' as DomainName, action: 'extractWebsiteContent' },
      { domain: 'requirements-validation' as DomainName, action: 'analyzeQualityCriteria' },
      { domain: 'requirements-validation' as DomainName, action: 'assessTestability' },
      { domain: 'requirements-validation' as DomainName, action: 'assessRisks' },
      { domain: 'requirements-validation' as DomainName, action: 'validateRequirements' },
      { domain: 'requirements-validation' as DomainName, action: 'generateIdeationReport' },
      { domain: 'security-compliance' as DomainName, action: 'modelSecurityThreats' },
      { domain: 'learning-optimization' as DomainName, action: 'storeIdeationLearnings' },
    ];

    for (const { domain, action } of expectedActions) {
      it(`should have ${domain}/${action} action registered`, () => {
        const isRegistered = orchestrator.isActionRegistered(domain, action);
        expect(isRegistered).toBe(true);
      });
    }

    it('should list all QCSD actions for requirements-validation domain', () => {
      const actions = orchestrator.getRegisteredActions('requirements-validation' as DomainName);
      expect(actions).toContain('extractWebsiteContent');
      expect(actions).toContain('analyzeQualityCriteria');
      expect(actions).toContain('assessTestability');
      expect(actions).toContain('assessRisks');
      expect(actions).toContain('validateRequirements');
      expect(actions).toContain('generateIdeationReport');
    });
  });

  describe('URL extraction via workflow execution', () => {
    it('should extract features from e-commerce website HTML', async () => {
      const mockFetch = createMockFetch(
        new Map([['https://sauce-demo.myshopify.com/', { status: 200, html: ECOMMERCE_HTML }]])
      );
      global.fetch = mockFetch;

      const result = await orchestrator.executeWorkflow('url-extraction-test', {
        url: 'https://sauce-demo.myshopify.com/',
      });

      expect(result.success).toBe(true);

      // Wait for workflow completion
      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);

      // Poll for completion (with timeout)
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');

      // Verify extraction results
      const stepResult = status?.stepResults?.get('extract-content');
      expect(stepResult).toBeDefined();
      expect(stepResult?.status).toBe('completed');

      const extraction = stepResult?.output as WebsiteExtractionResult;
      expect(extraction.isWebsite).toBe(true);
      expect(extraction.url).toBe('https://sauce-demo.myshopify.com/');

      // Verify features detected
      expect(extraction.extractedFeatures).toContain('Search functionality');
      expect(extraction.extractedFeatures).toContain('Shopping cart');
      expect(extraction.extractedFeatures).toContain('Product catalog');
      expect(extraction.extractedFeatures).toContain('Filtering and sorting');
      expect(extraction.extractedFeatures).toContain('User authentication');

      // Verify flags
      expect(extraction.detectedFlags.hasUI).toBe(true);
      expect(extraction.detectedFlags.hasSecurity).toBe(true);

      // Verify metadata
      expect(extraction.metadata?.title).toContain('Sauce Demo');
    });

    it('should generate acceptance criteria from detected features', async () => {
      const mockFetch = createMockFetch(
        new Map([['https://example-shop.com/', { status: 200, html: ECOMMERCE_HTML }]])
      );
      global.fetch = mockFetch;

      const result = await orchestrator.executeWorkflow('url-extraction-test', {
        url: 'https://example-shop.com/',
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');

      const stepResult = status?.stepResults?.get('extract-content');
      const extraction = stepResult?.output as WebsiteExtractionResult;

      // Verify acceptance criteria generated
      expect(extraction.extractedAcceptanceCriteria.length).toBeGreaterThan(0);

      // Check for specific criteria patterns
      const criteria = extraction.extractedAcceptanceCriteria.join(' ').toLowerCase();
      expect(criteria).toMatch(/search|cart|product|login|filter/);
    });

    it('should handle minimal HTML with few features', async () => {
      const mockFetch = createMockFetch(
        new Map([['https://simple-page.com/', { status: 200, html: MINIMAL_HTML }]])
      );
      global.fetch = mockFetch;

      const result = await orchestrator.executeWorkflow('url-extraction-test', {
        url: 'https://simple-page.com/',
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');

      const stepResult = status?.stepResults?.get('extract-content');
      const extraction = stepResult?.output as WebsiteExtractionResult;

      expect(extraction.isWebsite).toBe(true);
      expect(extraction.extractedFeatures.length).toBeLessThan(5); // Few features
      expect(extraction.metadata?.title).toBe('Simple Page');
    });

    it('should detect security features in HTML', async () => {
      const mockFetch = createMockFetch(
        new Map([['https://secure-bank.com/', { status: 200, html: SECURITY_FOCUSED_HTML }]])
      );
      global.fetch = mockFetch;

      const result = await orchestrator.executeWorkflow('url-extraction-test', {
        url: 'https://secure-bank.com/',
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');

      const stepResult = status?.stepResults?.get('extract-content');
      const extraction = stepResult?.output as WebsiteExtractionResult;

      expect(extraction.detectedFlags.hasSecurity).toBe(true);
      expect(extraction.extractedFeatures).toContain('User authentication');
    });

    it('should handle HTTP errors gracefully', async () => {
      const mockFetch = createMockFetch(
        new Map([['https://error-site.com/', { status: 404, html: 'Not Found' }]])
      );
      global.fetch = mockFetch;

      const result = await orchestrator.executeWorkflow('url-extraction-test', {
        url: 'https://error-site.com/',
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('failed');

      const stepResult = status?.stepResults?.get('extract-content');
      expect(stepResult?.status).toBe('failed');
      expect(stepResult?.error).toContain('HTTP 404');
    });

    it('should handle network failures gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network timeout'));
      global.fetch = mockFetch;

      const result = await orchestrator.executeWorkflow('url-extraction-test', {
        url: 'https://timeout-site.com/',
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('failed');

      const stepResult = status?.stepResults?.get('extract-content');
      expect(stepResult?.status).toBe('failed');
      expect(stepResult?.error).toContain('Fetch failed');
    });

    it('should handle invalid URLs gracefully', async () => {
      const result = await orchestrator.executeWorkflow('url-extraction-test', {
        url: 'not-a-valid-url',
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('failed');

      const stepResult = status?.stepResults?.get('extract-content');
      expect(stepResult?.status).toBe('failed');
      expect(stepResult?.error).toContain('Invalid URL');
    });

    it('should pass through content when no URL provided', async () => {
      // Create a passthrough workflow
      const passthroughWorkflow: WorkflowDefinition = {
        id: 'passthrough-test',
        name: 'Passthrough Test',
        description: 'Test passthrough when no URL',
        version: '1.0.0',
        steps: [
          {
            id: 'extract-content',
            name: 'Extract Website Content',
            domain: 'requirements-validation' as DomainName,
            action: 'extractWebsiteContent',
            inputMapping: {
              description: 'input.description',
              acceptanceCriteria: 'input.acceptanceCriteria',
            },
          },
        ],
      };
      orchestrator.registerWorkflow(passthroughWorkflow);

      const result = await orchestrator.executeWorkflow('passthrough-test', {
        description: 'Existing epic description',
        acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');

      const stepResult = status?.stepResults?.get('extract-content');
      const extraction = stepResult?.output as WebsiteExtractionResult;

      expect(extraction.isWebsite).toBe(false);
      expect(extraction.url).toBe('');
      expect(extraction.extractedDescription).toBe('Existing epic description');
      expect(extraction.extractedAcceptanceCriteria).toEqual(['Criterion 1', 'Criterion 2']);
    });
  });

  describe('qcsd-ideation-swarm workflow', () => {
    it('should have qcsd-ideation-swarm workflow registered', () => {
      const workflow = orchestrator.getWorkflow('qcsd-ideation-swarm');
      expect(workflow).toBeDefined();
      expect(workflow?.name).toContain('QCSD');
    });

    it('should have extractWebsiteContent as first step in qcsd-ideation-swarm', () => {
      const workflow = orchestrator.getWorkflow('qcsd-ideation-swarm');
      expect(workflow).toBeDefined();

      const firstStep = workflow?.steps[0];
      expect(firstStep?.action).toBe('extractWebsiteContent');
      expect(firstStep?.domain).toBe('requirements-validation');
    });

    it('should execute qcsd-ideation-swarm workflow with URL input', async () => {
      const mockFetch = createMockFetch(
        new Map([['https://test-store.com/', { status: 200, html: ECOMMERCE_HTML }]])
      );
      global.fetch = mockFetch;

      const result = await orchestrator.executeWorkflow('qcsd-ideation-swarm', {
        url: 'https://test-store.com/',
        epicName: 'Test E-Commerce Store',
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 100) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');

      // Check that website extraction ran
      const extractionStep = status?.stepResults?.get('website-content-extraction');
      expect(extractionStep).toBeDefined();
      expect(extractionStep?.status).toBe('completed');
    });

    it('should execute qcsd-ideation-swarm workflow without URL (epic mode)', async () => {
      const result = await orchestrator.executeWorkflow('qcsd-ideation-swarm', {
        description: 'Build a user authentication system with OAuth2 support',
        acceptanceCriteria: [
          'Users can sign in with Google',
          'Sessions persist for 7 days',
          'Support MFA via authenticator app',
        ],
        epicName: 'Authentication Epic',
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 100) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      expect(status?.status).toBe('completed');
    });
  });

  describe('epic description generation', () => {
    it('should generate structured epic description from website', async () => {
      const mockFetch = createMockFetch(
        new Map([['https://shop.example.com/', { status: 200, html: ECOMMERCE_HTML }]])
      );
      global.fetch = mockFetch;

      const result = await orchestrator.executeWorkflow('url-extraction-test', {
        url: 'https://shop.example.com/',
      });

      expect(result.success).toBe(true);

      const executionId = result.value!;
      let status = orchestrator.getWorkflowStatus(executionId);
      let attempts = 0;
      while (status?.status === 'running' && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = orchestrator.getWorkflowStatus(executionId);
        attempts++;
      }

      const stepResult = status?.stepResults?.get('extract-content');
      const extraction = stepResult?.output as WebsiteExtractionResult;

      // Verify epic description contains key sections
      expect(extraction.extractedDescription).toContain('URL');
      expect(extraction.extractedDescription).toContain('shop.example.com');
      expect(extraction.extractedDescription).toContain('Feature');
    });
  });
});

describe('QCSD Ideation Plugin Lifecycle', () => {
  it('should throw if registerWorkflowActions called before initialize', async () => {
    const memory = createMockMemory();
    const eventBus = new InMemoryEventBus();
    const agentCoordinator = new DefaultAgentCoordinator();
    const orchestrator = new WorkflowOrchestrator(eventBus, memory, agentCoordinator, {
      maxConcurrentWorkflows: 10,
      defaultStepTimeout: 60000,
      defaultWorkflowTimeout: 600000,
      enableEventTriggers: false,
      persistExecutions: false,
    });
    await orchestrator.initialize();

    const plugin = new QCSDIdeationPlugin(memory);
    // NOT calling plugin.initialize()

    expect(() => plugin.registerWorkflowActions(orchestrator)).toThrow(
      'QCSDIdeationPlugin must be initialized'
    );

    await orchestrator.dispose();
  });

  it('should allow multiple initialize calls (idempotent)', async () => {
    const memory = createMockMemory();
    const plugin = new QCSDIdeationPlugin(memory);

    await plugin.initialize();
    await plugin.initialize(); // Should not throw
    await plugin.initialize(); // Should not throw

    await plugin.dispose();
  });
});
