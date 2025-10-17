import { ResearcherAgent } from '../../../src/agents/ResearcherAgent';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../../../src/core/EventBus';
import { TaskAssignment } from '../../../src/core/types';
import * as path from 'path';
import * as fs from 'fs-extra';

describe('ResearcherAgent Comprehensive Tests', () => {
  let agent: ResearcherAgent;
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventBus;
  const testDbPath = path.join(process.cwd(), '.swarm/test-researcher.db');

  beforeAll(async () => {
    await fs.ensureDir(path.dirname(testDbPath));
    memoryStore = new SwarmMemoryManager(testDbPath);
    await memoryStore.initialize();
    eventBus = EventBus.getInstance();
    await eventBus.initialize();
  });

  beforeEach(async () => {
    agent = new ResearcherAgent('researcher-test-001');
    await agent.initialize();
  });

  afterEach(async () => {
    if (agent) {
      await agent.terminate();
    }
  });

  afterAll(async () => {
    await eventBus.shutdown();
    await memoryStore.close();
    await fs.remove(testDbPath);
  });

  describe('Information Gathering', () => {
    it('should gather requirements from multiple sources', async () => {
      const requirements = await agent['gatherRequirements']({
        sources: ['docs', 'issues', 'comments'],
        project: 'test-project'
      });
      expect(requirements).toBeInstanceOf(Array);
      expect(requirements.length).toBeGreaterThan(0);
    });

    it('should extract key information from documents', async () => {
      const extracted = await agent['extractKeyInfo']({
        document: 'This is a test document with important keywords.',
        keywords: ['test', 'important']
      });
      expect(extracted).toHaveProperty('matches');
    });

    it('should search codebase for patterns', async () => {
      const patterns = await agent['searchCodebase']({
        pattern: 'export class.*Agent',
        fileTypes: ['ts']
      });
      expect(patterns).toBeInstanceOf(Array);
    });

    it('should analyze API documentation', async () => {
      const analysis = await agent['analyzeAPIDocs']({
        url: 'https://api.example.com/docs',
        version: '1.0.0'
      });
      expect(analysis).toHaveProperty('endpoints');
    });

    it('should collect performance metrics', async () => {
      const metrics = await agent['collectMetrics']({
        period: '1h',
        types: ['cpu', 'memory', 'latency']
      });
      expect(metrics).toHaveProperty('cpu');
    });

    it('should gather user feedback', async () => {
      const feedback = await agent['gatherFeedback']({
        source: 'github-issues',
        labels: ['bug', 'enhancement']
      });
      expect(feedback).toBeInstanceOf(Array);
    });

    it('should research best practices', async () => {
      const practices = await agent['researchBestPractices']({
        domain: 'testing',
        framework: 'jest'
      });
      expect(practices).toContain('test-driven-development');
    });

    it('should analyze competitor solutions', async () => {
      const analysis = await agent['analyzeCompetitors']({
        competitors: ['solution-a', 'solution-b'],
        criteria: ['features', 'performance']
      });
      expect(analysis).toHaveProperty('comparison');
    });

    it('should gather technology trends', async () => {
      const trends = await agent['gatherTrends']({
        technologies: ['typescript', 'react'],
        period: '2024'
      });
      expect(trends).toBeInstanceOf(Array);
    });

    it('should research security vulnerabilities', async () => {
      const vulns = await agent['researchVulnerabilities']({
        packages: ['express@4.17.0'],
        databases: ['nvd', 'snyk']
      });
      expect(vulns).toBeInstanceOf(Array);
    });
  });

  describe('Knowledge Synthesis', () => {
    it('should synthesize information from multiple sources', async () => {
      const synthesis = await agent['synthesizeKnowledge']({
        sources: [
          { type: 'documentation', content: 'API docs...' },
          { type: 'code', content: 'Implementation...' },
          { type: 'issues', content: 'Bug reports...' }
        ]
      });
      expect(synthesis).toHaveProperty('summary');
    });

    it('should identify common patterns', async () => {
      const patterns = await agent['identifyPatterns']({
        data: [
          { feature: 'auth', complexity: 'high' },
          { feature: 'logging', complexity: 'low' },
          { feature: 'validation', complexity: 'high' }
        ]
      });
      expect(patterns).toContain('high-complexity');
    });

    it('should generate insights from data', async () => {
      const insights = await agent['generateInsights']({
        metrics: [
          { date: '2024-01', errors: 100 },
          { date: '2024-02', errors: 150 },
          { date: '2024-03', errors: 200 }
        ]
      });
      expect(insights.trend).toBe('increasing');
    });

    it('should create knowledge graphs', async () => {
      const graph = await agent['createKnowledgeGraph']({
        entities: ['Agent', 'Task', 'Memory'],
        relationships: [
          { from: 'Agent', to: 'Task', type: 'executes' },
          { from: 'Agent', to: 'Memory', type: 'uses' }
        ]
      });
      expect(graph).toHaveProperty('nodes');
      expect(graph).toHaveProperty('edges');
    });

    it('should categorize information', async () => {
      const categorized = await agent['categorizeInfo']({
        items: [
          { text: 'Bug in authentication' },
          { text: 'Feature request for dashboard' },
          { text: 'Performance issue in API' }
        ]
      });
      expect(categorized).toHaveProperty('bug');
      expect(categorized).toHaveProperty('feature');
    });

    it('should rank information by relevance', async () => {
      const ranked = await agent['rankByRelevance']({
        query: 'testing',
        documents: [
          { content: 'Unit testing guide', score: 0 },
          { content: 'API documentation', score: 0 },
          { content: 'Testing best practices', score: 0 }
        ]
      });
      expect(ranked[0].score).toBeGreaterThan(ranked[2].score);
    });

    it('should generate summaries', async () => {
      const summary = await agent['generateSummary']({
        text: 'Very long text with many details...',
        maxLength: 100
      });
      expect(summary.length).toBeLessThanOrEqual(100);
    });

    it('should extract action items', async () => {
      const actions = await agent['extractActionItems']({
        text: 'TODO: Fix bug. FIXME: Update docs. NOTE: Review later.'
      });
      expect(actions).toContain('Fix bug');
      expect(actions).toContain('Update docs');
    });

    it('should identify dependencies', async () => {
      const deps = await agent['identifyDependencies']({
        modules: ['module-a', 'module-b', 'module-c'],
        imports: [
          { module: 'module-a', imports: ['module-b'] },
          { module: 'module-b', imports: ['module-c'] }
        ]
      });
      expect(deps['module-a']).toContain('module-c');
    });

    it('should detect knowledge gaps', async () => {
      const gaps = await agent['detectKnowledgeGaps']({
        required: ['api', 'database', 'security', 'testing'],
        available: ['api', 'database']
      });
      expect(gaps).toContain('security');
      expect(gaps).toContain('testing');
    });
  });

  describe('Pattern Discovery', () => {
    it('should discover design patterns', async () => {
      const patterns = await agent['discoverDesignPatterns']({
        codebase: 'src/',
        languages: ['typescript']
      });
      expect(patterns).toBeInstanceOf(Array);
    });

    it('should identify anti-patterns', async () => {
      const antiPatterns = await agent['identifyAntiPatterns']({
        code: 'global variable usage, tight coupling...'
      });
      expect(antiPatterns).toBeInstanceOf(Array);
    });

    it('should detect architecture patterns', async () => {
      const architecture = await agent['detectArchitecture']({
        structure: {
          'src/controllers': [],
          'src/models': [],
          'src/views': []
        }
      });
      expect(architecture.pattern).toBe('mvc');
    });

    it('should analyze naming conventions', async () => {
      const conventions = await agent['analyzeNamingConventions']({
        identifiers: ['getUserById', 'fetchUserData', 'retrieveUser']
      });
      expect(conventions).toHaveProperty('patterns');
    });

    it('should discover testing patterns', async () => {
      const patterns = await agent['discoverTestingPatterns']({
        testFiles: ['*.test.ts'],
        framework: 'jest'
      });
      expect(patterns).toContain('arrange-act-assert');
    });

    it('should identify error handling patterns', async () => {
      const patterns = await agent['identifyErrorHandling']({
        code: 'try { } catch (e) { }'
      });
      expect(patterns).toContain('try-catch');
    });

    it('should detect concurrency patterns', async () => {
      const patterns = await agent['detectConcurrency']({
        code: 'Promise.all([...]), async/await'
      });
      expect(patterns).toContain('promise-based');
    });

    it('should analyze data flow patterns', async () => {
      const flow = await agent['analyzeDataFlow']({
        functions: [
          { name: 'fetchData', outputs: ['data'] },
          { name: 'processData', inputs: ['data'], outputs: ['result'] }
        ]
      });
      expect(flow).toHaveProperty('pipeline');
    });
  });

  describe('Report Generation', () => {
    it('should generate research reports', async () => {
      const report = await agent['generateResearchReport']({
        topic: 'Testing Strategies',
        findings: ['TDD improves quality', 'Coverage >80% recommended']
      });
      expect(report).toContain('# Testing Strategies');
    });

    it('should create technical specifications', async () => {
      const spec = await agent['createTechnicalSpec']({
        feature: 'User Authentication',
        requirements: ['OAuth2', 'JWT tokens']
      });
      expect(spec).toHaveProperty('requirements');
      expect(spec).toHaveProperty('implementation');
    });

    it('should generate comparison matrices', async () => {
      const matrix = await agent['generateComparisonMatrix']({
        items: ['Option A', 'Option B'],
        criteria: ['Cost', 'Performance', 'Maintainability']
      });
      expect(matrix).toBeInstanceOf(Array);
    });

    it('should create decision trees', async () => {
      const tree = await agent['createDecisionTree']({
        decisions: [
          { condition: 'size > 1000', action: 'use-pagination' },
          { condition: 'size <= 1000', action: 'return-all' }
        ]
      });
      expect(tree).toHaveProperty('root');
    });

    it('should generate recommendations', async () => {
      const recommendations = await agent['generateRecommendations']({
        analysis: { performance: 'low', security: 'high' }
      });
      expect(recommendations).toBeInstanceOf(Array);
    });
  });

  describe('Memory Integration', () => {
    it('should store research findings', async () => {
      await agent['storeFindings']('test-key', {
        topic: 'testing',
        insights: ['insight-1']
      });
      const stored = await memoryStore.retrieve('aqe/researcher/test-key', {
        partition: 'coordination'
      });
      expect(stored).toBeDefined();
    });

    it('should retrieve previous research', async () => {
      await memoryStore.store('aqe/researcher/history', { data: 'test' }, {
        partition: 'coordination'
      });
      const data = await agent['retrievePreviousResearch']('history');
      expect(data).toBeDefined();
    });

    it('should cache research results', async () => {
      const result1 = await agent['cachedResearch']('key1', async () => ({ data: 42 }));
      const result2 = await agent['cachedResearch']('key1', async () => ({ data: 99 }));
      expect(result1.data).toBe(result2.data);
    });
  });

  describe('Event Handling', () => {
    it('should emit research complete events', async () => {
      const eventPromise = new Promise(resolve => {
        eventBus.on('research:complete', resolve);
      });
      agent['emitResearchComplete']({ taskId: 'test' });
      await expect(eventPromise).resolves.toBeDefined();
    });

    it('should handle knowledge update events', async () => {
      const handled = await agent['handleKnowledgeUpdate']({
        type: 'knowledge.update',
        payload: { source: 'external' }
      });
      expect(handled).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle research failures gracefully', async () => {
      const result = await agent['safeResearch'](async () => {
        throw new Error('Research failed');
      });
      expect(result).toHaveProperty('error');
    });

    it('should retry failed research operations', async () => {
      let attempts = 0;
      const result = await agent['retryResearch'](async () => {
        attempts++;
        if (attempts < 2) throw new Error('Fail');
        return { success: true };
      }, 3);
      expect(result.success).toBe(true);
    });

    it('should log research errors', async () => {
      await expect(
        agent['logResearchError'](new Error('Test'))
      ).resolves.not.toThrow();
    });
  });
});
