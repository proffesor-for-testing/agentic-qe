#!/usr/bin/env tsx
/**
 * Validation Script for Code Intelligence System Setup
 *
 * Checks all prerequisites and dependencies are correctly installed.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

interface ValidationResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

const results: ValidationResult[] = [];

async function checkNodeVersion(): Promise<void> {
  try {
    const { stdout } = await execAsync('node --version');
    const version = stdout.trim();
    const majorVersion = parseInt(version.split('.')[0].replace('v', ''));

    if (majorVersion >= 18) {
      results.push({
        name: 'Node.js Version',
        status: 'pass',
        message: `${version} (>= 18.0.0 required)`,
      });
    } else {
      results.push({
        name: 'Node.js Version',
        status: 'fail',
        message: `${version} found, but >= 18.0.0 required`,
      });
    }
  } catch (error) {
    results.push({
      name: 'Node.js Version',
      status: 'fail',
      message: `Failed to check Node.js version: ${error}`,
    });
  }
}

async function checkTreeSitter(): Promise<void> {
  try {
    await import('tree-sitter');
    results.push({
      name: 'Tree-sitter Core',
      status: 'pass',
      message: 'Successfully loaded',
    });
  } catch (error) {
    results.push({
      name: 'Tree-sitter Core',
      status: 'fail',
      message: `Failed to load: ${error}`,
    });
  }
}

async function checkTreeSitterLanguages(): Promise<void> {
  const languages = [
    'tree-sitter-typescript',
    'tree-sitter-python',
    'tree-sitter-go',
    'tree-sitter-rust',
    'tree-sitter-javascript',
  ];

  for (const lang of languages) {
    try {
      await import(lang);
      results.push({
        name: lang,
        status: 'pass',
        message: 'Successfully loaded',
      });
    } catch (error) {
      results.push({
        name: lang,
        status: 'fail',
        message: `Failed to load: ${error}`,
      });
    }
  }
}

async function checkChokidar(): Promise<void> {
  try {
    await import('chokidar');
    results.push({
      name: 'Chokidar (File Watcher)',
      status: 'pass',
      message: 'Successfully loaded',
    });
  } catch (error) {
    results.push({
      name: 'Chokidar',
      status: 'fail',
      message: `Failed to load: ${error}`,
    });
  }
}

async function checkGPTTokenizer(): Promise<void> {
  try {
    await import('gpt-tokenizer');
    results.push({
      name: 'GPT Tokenizer',
      status: 'pass',
      message: 'Successfully loaded',
    });
  } catch (error) {
    results.push({
      name: 'GPT Tokenizer',
      status: 'fail',
      message: `Failed to load: ${error}`,
    });
  }
}

async function checkDatabase(): Promise<void> {
  try {
    const { stdout } = await execAsync(
      'docker ps --filter "name=agentic-qe-ruvector-dev" --format "{{.Status}}"'
    );

    if (stdout.includes('Up')) {
      results.push({
        name: 'RuVector Database',
        status: 'pass',
        message: 'Container is running',
      });
    } else {
      results.push({
        name: 'RuVector Database',
        status: 'warn',
        message: 'Container not running. Start with: docker run -d --name agentic-qe-ruvector-dev -p 5432:5432 -e POSTGRES_PASSWORD=ruvector ruvnet/ruvector:latest',
      });
    }
  } catch (error) {
    results.push({
      name: 'RuVector Database',
      status: 'warn',
      message: 'Docker not available or container not found',
    });
  }
}

async function checkOllama(): Promise<void> {
  try {
    const { stdout } = await execAsync('curl -s http://localhost:11434/api/tags', {
      timeout: 2000,
    });
    const models = JSON.parse(stdout);

    const hasNomicEmbed = models.models?.some((m: any) =>
      m.name.includes('nomic-embed-text')
    );

    if (hasNomicEmbed) {
      results.push({
        name: 'Ollama (nomic-embed-text)',
        status: 'pass',
        message: 'Service running with nomic-embed-text model',
      });
    } else {
      results.push({
        name: 'Ollama (nomic-embed-text)',
        status: 'warn',
        message: 'Service running but nomic-embed-text not found. Run: ollama pull nomic-embed-text',
      });
    }
  } catch (error) {
    results.push({
      name: 'Ollama (nomic-embed-text)',
      status: 'warn',
      message: 'Service not running or not installed. Optional for local embeddings.',
    });
  }
}

async function checkDirectoryStructure(): Promise<void> {
  const directories = [
    'src/code-intelligence/config',
    'src/code-intelligence/parser',
    'src/code-intelligence/chunking',
    'src/code-intelligence/embeddings',
    'src/code-intelligence/indexing',
    'src/code-intelligence/graph',
    'src/code-intelligence/search',
    'src/code-intelligence/rag',
    'src/code-intelligence/visualization',
  ];

  for (const dir of directories) {
    try {
      await fs.access(dir);
      results.push({
        name: `Directory: ${dir}`,
        status: 'pass',
        message: 'Exists',
      });
    } catch {
      results.push({
        name: `Directory: ${dir}`,
        status: 'fail',
        message: 'Missing',
      });
    }
  }
}

async function checkConfigurationFiles(): Promise<void> {
  const files = [
    'src/code-intelligence/config/environment.ts',
    'src/code-intelligence/config/index.ts',
    'scripts/setup-ollama.sh',
    'docs/setup/code-intelligence-prerequisites.md',
  ];

  for (const file of files) {
    try {
      await fs.access(file);
      results.push({
        name: `File: ${file}`,
        status: 'pass',
        message: 'Exists',
      });
    } catch {
      results.push({
        name: `File: ${file}`,
        status: 'fail',
        message: 'Missing',
      });
    }
  }
}

function printResults(): void {
  console.log('\n🔍 Code Intelligence System Validation\n');
  console.log('═'.repeat(60));

  const statusIcons = {
    pass: '✅',
    fail: '❌',
    warn: '⚠️',
  };

  for (const result of results) {
    const icon = statusIcons[result.status];
    console.log(`${icon} ${result.name}`);
    console.log(`   ${result.message}\n`);
  }

  console.log('═'.repeat(60));

  const passCount = results.filter((r) => r.status === 'pass').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const warnCount = results.filter((r) => r.status === 'warn').length;

  console.log(`\nResults: ${passCount} passed, ${failCount} failed, ${warnCount} warnings`);

  if (failCount === 0 && warnCount === 0) {
    console.log('\n🎉 All checks passed! System is ready.');
  } else if (failCount > 0) {
    console.log('\n❌ Some critical checks failed. Please address the issues above.');
    process.exit(1);
  } else {
    console.log('\n⚠️  All critical checks passed, but some optional features are unavailable.');
  }
}

async function main(): Promise<void> {
  console.log('Running validation checks...\n');

  await checkNodeVersion();
  await checkTreeSitter();
  await checkTreeSitterLanguages();
  await checkChokidar();
  await checkGPTTokenizer();
  await checkDatabase();
  await checkOllama();
  await checkDirectoryStructure();
  await checkConfigurationFiles();

  printResults();
}

main().catch((error) => {
  console.error('Validation failed:', error);
  process.exit(1);
});
