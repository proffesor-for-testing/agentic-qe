/**
 * Run actual platform benchmarks and output results
 */
import { benchmarkCopy, getCopyCapabilities } from '../src/core/platform/FileOperations';
import { detectCapabilities } from '../src/core/platform/PlatformDetector';
import * as os from 'os';

async function main() {
  console.log('=== Platform Benchmark Results ===');
  console.log('Date:', new Date().toISOString());
  console.log('Platform:', os.platform());
  console.log('Architecture:', os.arch());
  console.log('Node.js:', process.version);
  console.log('');

  // Detect capabilities
  console.log('--- Platform Capabilities ---');
  const caps = await detectCapabilities(os.tmpdir());
  console.log('Filesystem:', caps.filesystem);
  console.log('Supports Reflink:', caps.supportsReflink);
  console.log('Supports Hardlinks:', caps.supportsHardlinks);
  console.log('Supports copy_file_range:', caps.supportsCopyFileRange);
  console.log('Summary:', caps.summary);
  console.log('');

  // Get copy capabilities
  console.log('--- Copy Capabilities ---');
  const copyCaps = await getCopyCapabilities();
  console.log('Optimal Strategy:', copyCaps.optimalStrategy);
  console.log('Expected Speedup:', copyCaps.expectedSpeedup);
  console.log('');

  // Run benchmarks
  console.log('--- Benchmark Results (1MB file) ---');
  const results = await benchmarkCopy(os.tmpdir());
  console.log('Reflink:', results.reflink !== null ? results.reflink.toFixed(3) + 'ms' : 'Not supported');
  console.log('Kernel copy:', results.kernel !== null ? results.kernel.toFixed(3) + 'ms' : 'N/A');
  console.log('Userspace copy:', results.userspace.toFixed(3) + 'ms');
  console.log('Improvement:', results.improvement);
  console.log('');

  // Output markdown format for documentation
  console.log('=== Markdown Output ===');
  console.log('');
  console.log('| Metric | Value |');
  console.log('|--------|-------|');
  console.log('| Platform |', os.platform(), '|');
  console.log('| Filesystem |', caps.filesystem, '|');
  console.log('| Reflink Support |', caps.supportsReflink, '|');
  console.log('| Reflink Time |', results.reflink !== null ? results.reflink.toFixed(3) + 'ms' : 'N/A', '|');
  console.log('| Kernel Copy Time |', results.kernel !== null ? results.kernel.toFixed(3) + 'ms' : 'N/A', '|');
  console.log('| Userspace Copy Time |', results.userspace.toFixed(3) + 'ms', '|');
  console.log('| Improvement Factor |', results.improvement, '|');
}

main().catch(console.error);
