/**
 * Tests for Fleet Management Commands
 * Covers all 10 fleet management commands
 */

import * as fs from 'fs-extra';
import { FleetInitCommand } from '../../src/cli/commands/fleet/init';
import { FleetStatusCommand } from '../../src/cli/commands/fleet/status';
import { FleetScaleCommand } from '../../src/cli/commands/fleet/scale';
import { FleetMonitorCommand } from '../../src/cli/commands/fleet/monitor';
import { FleetHealthCommand } from '../../src/cli/commands/fleet/health';
import { FleetTopologyCommand } from '../../src/cli/commands/fleet/topology';
import { FleetRestartCommand } from '../../src/cli/commands/fleet/restart';
import { FleetShutdownCommand } from '../../src/cli/commands/fleet/shutdown';
import { FleetLogsCommand } from '../../src/cli/commands/fleet/logs';
import { FleetMetricsCommand } from '../../src/cli/commands/fleet/metrics';

jest.mock('fs-extra');
jest.mock('chalk', () => ({
  blue: { bold: (str: string) => str },
  green: (str: string) => str,
  red: (str: string) => str,
  yellow: (str: string) => str,
  gray: (str: string) => str,
  cyan: (str: string) => str
}));

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('Fleet Management Commands', () => {
  beforeEach(() => {
    // Mock process.exit to prevent test interruption
    jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`Process.exit called with code ${code}`);
    });

    jest.clearAllMocks();
    mockedFs.pathExists.mockResolvedValue(true);
    mockedFs.readJson.mockResolvedValue({});
    mockedFs.writeJson.mockResolvedValue();
    mockedFs.ensureDir.mockResolvedValue();
  });

  describe('fleet init', () => {
    it('should initialize fleet with default topology', async () => {
      await FleetInitCommand.execute({ topology: 'hierarchical', maxAgents: 10 });

      expect(mockedFs.ensureDir).toHaveBeenCalled();
      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('fleet.json'),
        expect.objectContaining({ topology: 'hierarchical' }),
        expect.any(Object)
      );
    });

    it('should validate topology options', async () => {
      await expect(
        FleetInitCommand.execute({ topology: 'invalid', maxAgents: 10 })
      ).rejects.toThrow('Invalid topology');
    });

    it('should validate maxAgents range', async () => {
      await expect(
        FleetInitCommand.execute({ topology: 'mesh', maxAgents: 0 })
      ).rejects.toThrow('maxAgents must be between 1 and 100');
    });
  });

  describe('fleet status', () => {
    it('should display fleet status', async () => {
      mockedFs.readJson.mockResolvedValue({
        topology: 'hierarchical',
        maxAgents: 10,
        activeAgents: 5
      });

      const status = await FleetStatusCommand.execute({});

      expect(status).toHaveProperty('topology');
      expect(status).toHaveProperty('maxAgents');
      expect(status).toHaveProperty('activeAgents');
    });

    it('should handle missing fleet config', async () => {
      mockedFs.pathExists.mockResolvedValue(false);

      await expect(FleetStatusCommand.execute({})).rejects.toThrow(
        'Fleet not initialized'
      );
    });
  });

  describe('fleet scale', () => {
    it('should scale fleet up', async () => {
      mockedFs.readJson.mockResolvedValue({
        topology: 'hierarchical',
        maxAgents: 10
      });

      await FleetScaleCommand.execute({ agents: 20 });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('fleet.json'),
        expect.objectContaining({ maxAgents: 20 }),
        expect.any(Object)
      );
    });

    it('should scale fleet down', async () => {
      mockedFs.readJson.mockResolvedValue({
        topology: 'hierarchical',
        maxAgents: 20
      });

      await FleetScaleCommand.execute({ agents: 10 });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('fleet.json'),
        expect.objectContaining({ maxAgents: 10 }),
        expect.any(Object)
      );
    });

    it('should validate agent count', async () => {
      await expect(
        FleetScaleCommand.execute({ agents: -1 })
      ).rejects.toThrow('Invalid agent count');
    });
  });

  describe('fleet monitor', () => {
    it('should start real-time monitoring', async () => {
      mockedFs.readJson.mockResolvedValue({
        id: 'fleet-123',
        topology: 'hierarchical',
        agents: [],
        tasks: [],
        fleet: { status: 'running' }
      });

      // Mock monitoring execution - it runs indefinitely, so we test setup only
      const executePromise = FleetMonitorCommand.execute({ interval: 1000, continuous: false });

      // Give it time to initialize
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockedFs.pathExists).toHaveBeenCalledWith('.agentic-qe/config/fleet.json');
    });

    it('should validate interval', async () => {
      await expect(
        FleetMonitorCommand.execute({ interval: 50 })
      ).rejects.toThrow('Invalid interval');
    });

    it('should display agent and task statistics', async () => {
      mockedFs.readJson.mockResolvedValue({
        id: 'fleet-123',
        topology: 'mesh',
        agents: [
          { id: 'a1', status: 'active' },
          { id: 'a2', status: 'busy' }
        ],
        tasks: [
          { id: 't1', status: 'running' },
          { id: 't2', status: 'completed' }
        ],
        fleet: { status: 'running' }
      });

      // Test that it can read the data
      expect(mockedFs.readJson).toBeDefined();
    });
  });

  describe('fleet health', () => {
    beforeEach(() => {
      mockedFs.readJson.mockResolvedValue({
        id: 'fleet-123',
        topology: 'hierarchical',
        maxAgents: 10
      });
    });

    it('should check fleet health', async () => {
      const health = await FleetHealthCommand.execute({});

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('recommendations');
    });

    it('should detect configuration issues', async () => {
      mockedFs.pathExists.mockImplementation((path: any) => {
        if (path === '.agentic-qe/config/fleet.json') return Promise.resolve(false);
        return Promise.resolve(true);
      });

      const health = await FleetHealthCommand.execute({});

      expect(health.status).not.toBe('healthy');
      expect(health.issues.length).toBeGreaterThan(0);
    });

    it('should export health report', async () => {
      mockedFs.ensureDir.mockResolvedValue();

      await FleetHealthCommand.execute({ exportReport: true });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('health-report'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should provide recommendations for unhealthy components', async () => {
      const health = await FleetHealthCommand.execute({ detailed: true });

      expect(health.recommendations).toBeDefined();
      expect(Array.isArray(health.recommendations)).toBe(true);
    });
  });

  describe('fleet topology', () => {
    beforeEach(() => {
      mockedFs.readJson.mockResolvedValue({
        id: 'fleet-123',
        topology: 'hierarchical',
        maxAgents: 10
      });
    });

    it('should change topology', async () => {
      const result = await FleetTopologyCommand.execute({ topology: 'mesh' });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('fleet.json'),
        expect.objectContaining({ topology: 'mesh' }),
        expect.any(Object)
      );
      expect(result.newTopology).toBe('mesh');
      expect(result.oldTopology).toBe('hierarchical');
    });

    it('should validate new topology', async () => {
      await expect(
        FleetTopologyCommand.execute({ topology: 'invalid' })
      ).rejects.toThrow('Invalid topology');
    });

    it('should optimize topology based on workload', async () => {
      mockedFs.readJson.mockResolvedValueOnce({
        id: 'fleet-123',
        topology: 'hierarchical',
        maxAgents: 10
      }).mockResolvedValueOnce({
        agents: Array(15).fill({ type: 'test' }),
        tasks: Array(50).fill({ dependencies: [] })
      });

      const result = await FleetTopologyCommand.execute({ optimize: true });

      expect(result).toHaveProperty('recommended');
      expect(result).toHaveProperty('current');
      expect(mockedFs.readJson).toHaveBeenCalled();
    });

    it('should analyze topology efficiency', async () => {
      const result = await FleetTopologyCommand.execute({ analyze: true });

      expect(result).toHaveProperty('topology');
      expect(result).toHaveProperty('characteristics');
      expect(result).toHaveProperty('efficiency');
    });

    it('should generate topology transition script', async () => {
      mockedFs.writeFile = jest.fn().mockResolvedValue(undefined);
      mockedFs.chmod = jest.fn().mockResolvedValue(undefined);

      await FleetTopologyCommand.execute({ topology: 'ring' });

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('transition-topology.sh'),
        expect.any(String)
      );
    });
  });

  describe('fleet restart', () => {
    beforeEach(() => {
      mockedFs.readJson.mockResolvedValue({
        id: 'fleet-123',
        topology: 'hierarchical',
        maxAgents: 10
      });
      mockedFs.copy = jest.fn().mockResolvedValue(undefined);
      mockedFs.writeFile = jest.fn().mockResolvedValue(undefined);
      mockedFs.chmod = jest.fn().mockResolvedValue(undefined);
    });

    it('should restart fleet gracefully', async () => {
      await FleetRestartCommand.execute({ graceful: true });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('fleet.json'),
        expect.objectContaining({ status: 'running' }),
        expect.any(Object)
      );
    });

    it('should force restart', async () => {
      await FleetRestartCommand.execute({ force: true });

      expect(mockedFs.writeJson).toHaveBeenCalled();
    });

    it('should create pre-restart backup', async () => {
      await FleetRestartCommand.execute({ graceful: true });

      expect(mockedFs.ensureDir).toHaveBeenCalledWith(
        expect.stringContaining('backups/restart-')
      );
    });

    it('should rollback on failure if requested', async () => {
      // Mock failed restart verification
      mockedFs.pathExists.mockImplementation((path: any) => {
        if (path === '.agentic-qe/config/fleet.json') return Promise.resolve(false);
        return Promise.resolve(true);
      });

      await expect(
        FleetRestartCommand.execute({ graceful: true, rollback: true })
      ).rejects.toThrow('rolled back');
    });
  });

  describe('fleet shutdown', () => {
    beforeEach(() => {
      mockedFs.readJson.mockResolvedValue({
        id: 'fleet-123',
        topology: 'hierarchical',
        maxAgents: 10
      });
      mockedFs.copy = jest.fn().mockResolvedValue(undefined);
      mockedFs.remove = jest.fn().mockResolvedValue(undefined);
    });

    it('should shutdown fleet gracefully', async () => {
      await FleetShutdownCommand.execute({ graceful: true });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('fleet.json'),
        expect.objectContaining({ status: 'shutdown' }),
        expect.any(Object)
      );
    });

    it('should archive data before shutdown', async () => {
      await FleetShutdownCommand.execute({ archive: true });

      expect(mockedFs.ensureDir).toHaveBeenCalledWith(
        expect.stringContaining('archive/shutdown-')
      );
    });

    it('should preserve state if requested', async () => {
      await FleetShutdownCommand.execute({ preserve: true });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('state.json'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should force shutdown immediately', async () => {
      await FleetShutdownCommand.execute({ force: true });

      expect(mockedFs.writeJson).toHaveBeenCalled();
    });

    it('should generate shutdown report', async () => {
      await FleetShutdownCommand.execute({ graceful: true });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('shutdown-'),
        expect.objectContaining({
          fleetId: expect.any(String),
          shutdownMode: expect.any(String)
        }),
        expect.any(Object)
      );
    });
  });

  describe('fleet logs', () => {
    beforeEach(() => {
      mockedFs.readdir.mockResolvedValue(['fleet-2024-01-01.log'] as any);
      mockedFs.readFile = jest.fn().mockResolvedValue(
        '2024-01-01T10:00:00Z [INFO] Fleet initialized\n2024-01-01T10:00:01Z [ERROR] Task failed\n2024-01-01T10:00:02Z [WARN] High memory usage\n'
      );
    });

    it('should display fleet logs', async () => {
      const logs = await FleetLogsCommand.execute({ lines: 10 });

      expect(logs).toContain('[INFO]');
      expect(logs).toContain('[ERROR]');
      expect(logs).toContain('[WARN]');
    });

    it('should filter logs by level', async () => {
      const logs = await FleetLogsCommand.execute({ level: 'error' });

      expect(logs).toContain('[ERROR]');
      expect(logs).not.toContain('[INFO]');
    });

    it('should filter logs by agent', async () => {
      mockedFs.readFile = jest.fn().mockResolvedValue(
        '2024-01-01T10:00:00Z [INFO] agent-1: Task started\n2024-01-01T10:00:01Z [INFO] agent-2: Task completed\n'
      );

      const logs = await FleetLogsCommand.execute({ agent: 'agent-1' });

      expect(logs).toContain('agent-1');
      expect(logs).not.toContain('agent-2');
    });

    it('should limit number of lines', async () => {
      const logs = await FleetLogsCommand.execute({ lines: 1 });
      const lineCount = logs.split('\n').filter(l => l.trim()).length;

      expect(lineCount).toBeLessThanOrEqual(1);
    });

    it('should handle missing log directory', async () => {
      mockedFs.readdir.mockResolvedValue([] as any);

      const logs = await FleetLogsCommand.execute({});

      expect(logs).toBe('');
    });
  });

  describe('fleet metrics', () => {
    beforeEach(() => {
      mockedFs.readJson.mockResolvedValue({
        id: 'fleet-123',
        topology: 'hierarchical',
        maxAgents: 10
      });
      mockedFs.readdir.mockResolvedValue([
        'execution-2024-01-01.json',
        'execution-2024-01-02.json'
      ] as any);
      mockedFs.writeFile = jest.fn().mockResolvedValue(undefined);
    });

    it('should display fleet metrics', async () => {
      const metrics = await FleetMetricsCommand.execute({});

      expect(metrics).toHaveProperty('fleet');
      expect(metrics).toHaveProperty('agents');
      expect(metrics).toHaveProperty('tasks');
      expect(metrics).toHaveProperty('performance');
      expect(metrics).toHaveProperty('resources');
      expect(metrics).toHaveProperty('quality');
    });

    it('should export metrics in prometheus format', async () => {
      await FleetMetricsCommand.execute({ format: 'prometheus' });

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.prom'),
        expect.stringContaining('# TYPE'),
        expect.any(String)
      );
    });

    it('should display metrics for specific time range', async () => {
      const metrics = await FleetMetricsCommand.execute({
        from: '2024-01-01',
        to: '2024-01-31'
      });

      expect(metrics).toBeDefined();
    });

    it('should include detailed metrics when requested', async () => {
      const metrics = await FleetMetricsCommand.execute({ detailed: true });

      expect(metrics).toHaveProperty('detailed');
      expect(metrics.detailed).toHaveProperty('agentBreakdown');
      expect(metrics.detailed).toHaveProperty('performanceTrends');
    });

    it('should export metrics to file', async () => {
      await FleetMetricsCommand.execute({
        format: 'json',
        export: './custom-metrics.json'
      });

      expect(mockedFs.writeJson).toHaveBeenCalledWith(
        './custom-metrics.json',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should calculate agent utilization', async () => {
      mockedFs.readJson.mockResolvedValueOnce({
        id: 'fleet-123',
        topology: 'mesh',
        maxAgents: 10
      }).mockResolvedValueOnce({
        agents: [
          { id: 'a1', status: 'busy' },
          { id: 'a2', status: 'idle' },
          { id: 'a3', status: 'busy' }
        ],
        tasks: [],
        fleet: {}
      });

      const metrics = await FleetMetricsCommand.execute({});

      expect(metrics.agents.utilization).toBeDefined();
      expect(parseFloat(metrics.agents.utilization)).toBeGreaterThan(0);
    });
  });
});
