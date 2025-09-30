/**
 * CLI Interface Test Suite - User-facing validation
 * Tests the aqe command-line interface and agent registration
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('AQE CLI Interface', () => {
  const testDir = path.join(__dirname, '../../test-projects/cli-test');
  const aqeBinary = path.join(__dirname, '../../bin/aqe');

  beforeEach(async () => {
    // Create test project directory
    await fs.ensureDir(testDir);
    process.chdir(testDir);
  });

  afterEach(async () => {
    // Cleanup test directory
    await fs.remove(testDir);
  });

  describe('aqe init command', () => {
    it('should initialize AQE fleet in current directory', () => {
      const output = execSync(`node ${aqeBinary} init`, { encoding: 'utf8' });

      expect(output).toContain('Initializing Agentic QE Fleet');
      expect(output).toContain('AQE Fleet successfully initialized');

      // Check that agent files were created
      const claudeDir = path.join(testDir, '.claude', 'agents');
      expect(fs.existsSync(claudeDir)).toBe(true);

      const expectedAgents = [
        'qe-test-generator.md',
        'qe-test-executor.md',
        'qe-coverage-analyzer.md',
        'qe-quality-gate.md',
        'qe-performance-tester.md',
        'qe-security-scanner.md'
      ];

      expectedAgents.forEach(agent => {
        expect(fs.existsSync(path.join(claudeDir, agent))).toBe(true);
      });
    });

    it('should create fleet configuration file', () => {
      execSync(`node ${aqeBinary} init`, { encoding: 'utf8' });

      const configPath = path.join(testDir, '.claude', 'aqe-fleet.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const config = fs.readJsonSync(configPath);
      expect(config.fleetId).toBeDefined();
      expect(config.topology).toBe('hierarchical');
      expect(config.agents).toHaveLength(6);
      expect(config.status).toBe('active');
    });

    it('should update CLAUDE.md with AQE rules', () => {
      execSync(`node ${aqeBinary} init`, { encoding: 'utf8' });

      const claudeMdPath = path.join(testDir, 'CLAUDE.md');
      expect(fs.existsSync(claudeMdPath)).toBe(true);

      const content = fs.readFileSync(claudeMdPath, 'utf8');
      expect(content).toContain('AGENTIC QE FLEET - CRITICAL RULES');
      expect(content).toContain('qe-test-generator');
      expect(content).toContain('qe-coverage-analyzer');
    });

    it('should initialize in specified directory', () => {
      const customDir = path.join(testDir, 'custom-project');
      execSync(`node ${aqeBinary} init ${customDir}`, { encoding: 'utf8' });

      expect(fs.existsSync(path.join(customDir, '.claude', 'agents'))).toBe(true);
      expect(fs.existsSync(path.join(customDir, '.claude', 'aqe-fleet.json'))).toBe(true);
    });
  });

  describe('aqe status command', () => {
    beforeEach(() => {
      execSync(`node ${aqeBinary} init`, { encoding: 'utf8' });
    });

    it('should show fleet status when initialized', () => {
      const output = execSync(`node ${aqeBinary} status`, { encoding: 'utf8' });

      expect(output).toContain('AQE Fleet Status');
      expect(output).toContain('Fleet ID:');
      expect(output).toContain('Status: active');
      expect(output).toContain('Topology: hierarchical');
      expect(output).toContain('Registered Agents:');
      expect(output).toContain('qe-test-generator: ✓ Active');
    });

    it('should show error when fleet not initialized', () => {
      // Remove fleet config
      fs.removeSync(path.join(testDir, '.claude'));

      const output = execSync(`node ${aqeBinary} status`, { encoding: 'utf8' });
      expect(output).toContain('Fleet not initialized');
      expect(output).toContain('aqe init');
    });
  });

  describe('aqe test command', () => {
    beforeEach(() => {
      execSync(`node ${aqeBinary} init`, { encoding: 'utf8' });
    });

    it('should show test generation command', () => {
      const output = execSync(`node ${aqeBinary} test UserService`, { encoding: 'utf8' });

      expect(output).toContain('Generating tests for: UserService');
      expect(output).toContain('qe-test-generator agent');
      expect(output).toContain('Direct test generation coming soon');
    });

    it('should require module parameter', () => {
      expect(() => {
        execSync(`node ${aqeBinary} test`, { encoding: 'utf8' });
      }).toThrow();
    });
  });

  describe('aqe coverage command', () => {
    beforeEach(() => {
      execSync(`node ${aqeBinary} init`, { encoding: 'utf8' });
    });

    it('should show coverage analysis command', () => {
      const output = execSync(`node ${aqeBinary} coverage`, { encoding: 'utf8' });

      expect(output).toContain('Analyzing test coverage');
      expect(output).toContain('qe-coverage-analyzer agent');
      expect(output).toContain('Direct coverage analysis coming soon');
    });
  });

  describe('aqe quality command', () => {
    beforeEach(() => {
      execSync(`node ${aqeBinary} init`, { encoding: 'utf8' });
    });

    it('should show quality gate command', () => {
      const output = execSync(`node ${aqeBinary} quality`, { encoding: 'utf8' });

      expect(output).toContain('Running quality gate check');
      expect(output).toContain('qe-quality-gate agent');
      expect(output).toContain('Direct quality gate check coming soon');
    });
  });

  describe('aqe help command', () => {
    it('should show comprehensive help information', () => {
      const output = execSync(`node ${aqeBinary} help`, { encoding: 'utf8' });

      expect(output).toContain('AQE - Agentic Quality Engineering Fleet');
      expect(output).toContain('Usage: aqe <command>');
      expect(output).toContain('Core Commands:');
      expect(output).toContain('init');
      expect(output).toContain('status');
      expect(output).toContain('Quick Actions:');
      expect(output).toContain('test <module>');
      expect(output).toContain('coverage');
      expect(output).toContain('quality');
      expect(output).toContain('Available Agents:');
      expect(output).toContain('qe-test-generator');
      expect(output).toContain('qe-coverage-analyzer');
    });

    it('should show help for --help flag', () => {
      const output = execSync(`node ${aqeBinary} --help`, { encoding: 'utf8' });
      expect(output).toContain('AQE - Agentic Quality Engineering Fleet');
    });

    it('should show help for -h flag', () => {
      const output = execSync(`node ${aqeBinary} -h`, { encoding: 'utf8' });
      expect(output).toContain('AQE - Agentic Quality Engineering Fleet');
    });
  });

  describe('aqe mcp command', () => {
    beforeEach(() => {
      // Create package.json for MCP setup
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        scripts: {}
      };
      fs.writeJsonSync(path.join(testDir, 'package.json'), packageJson);
    });

    it('should setup MCP server configuration', () => {
      const output = execSync(`node ${aqeBinary} mcp`, { encoding: 'utf8' });

      expect(output).toContain('Setting up MCP Server');
      expect(output).toContain('Added MCP scripts to package.json');
      expect(output).toContain('claude mcp add agentic-qe');

      // Check package.json was updated
      const packageJson = fs.readJsonSync(path.join(testDir, 'package.json'));
      expect(packageJson.scripts['mcp:start']).toBeDefined();
      expect(packageJson.scripts['mcp:dev']).toBeDefined();
    });

    it('should show error when no package.json exists', () => {
      fs.removeSync(path.join(testDir, 'package.json'));

      const output = execSync(`node ${aqeBinary} mcp`, { encoding: 'utf8' });
      expect(output).toContain('No package.json found');
    });
  });

  describe('error handling', () => {
    it('should show error for unknown commands', () => {
      expect(() => {
        execSync(`node ${aqeBinary} unknown-command`, { encoding: 'utf8' });
      }).toThrow();
    });

    it('should handle missing binary gracefully', () => {
      const invalidBinary = path.join(__dirname, 'nonexistent-binary');
      expect(() => {
        execSync(`node ${invalidBinary} help`, { encoding: 'utf8' });
      }).toThrow();
    });
  });

  describe('agent creation', () => {
    it('should create well-formed agent files', () => {
      execSync(`node ${aqeBinary} init`, { encoding: 'utf8' });

      const agentPath = path.join(testDir, '.claude', 'agents', 'qe-test-generator.md');
      const agentContent = fs.readFileSync(agentPath, 'utf8');

      expect(agentContent).toContain('# qe-test-generator');
      expect(agentContent).toContain('Type: test-generator');
      expect(agentContent).toContain('Status: Active');
      expect(agentContent).toContain('## Capabilities');
      expect(agentContent).toContain('AI-powered test generation');
      expect(agentContent).toContain('## Commands');
      expect(agentContent).toContain('## Integration');
    });

    it('should create unique fleet IDs', () => {
      execSync(`node ${aqeBinary} init`, { encoding: 'utf8' });
      const config1 = fs.readJsonSync(path.join(testDir, '.claude', 'aqe-fleet.json'));

      fs.removeSync(path.join(testDir, '.claude'));

      execSync(`node ${aqeBinary} init`, { encoding: 'utf8' });
      const config2 = fs.readJsonSync(path.join(testDir, '.claude', 'aqe-fleet.json'));

      expect(config1.fleetId).not.toBe(config2.fleetId);
    });
  });

  describe('Claude Flow integration', () => {
    it('should attempt Claude Flow hooks integration', () => {
      // This test verifies the CLI attempts integration but doesn't fail if Claude Flow isn't available
      const output = execSync(`node ${aqeBinary} init`, { encoding: 'utf8' });

      // Should either succeed with Claude Flow or show optional warning
      expect(
        output.includes('Claude Flow integration optional') ||
        output.includes('Integrating with Claude Flow')
      ).toBe(true);
    });
  });
});