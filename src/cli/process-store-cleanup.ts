import { resetSharedRvfAdapter } from '../integrations/ruvector/shared-rvf-adapter.js';
import { resetSharedRvfDualWriter } from '../integrations/ruvector/shared-rvf-dual-writer.js';
import { closeRegisteredStores } from '../kernel/process-lifecycle.js';

let released = false;

/**
 * Release the CLI's process-wide stores without awaiting native work (#814).
 * Each closer owns its handle; never remove a lock file by path. Synchronous
 * cleanup also runs when Commander or another module calls process.exit().
 */
export function releaseCliProcessStores(): void {
  if (released) return;
  released = true;
  try { resetSharedRvfDualWriter(); } catch { /* keep closing other stores */ }
  try { resetSharedRvfAdapter(); } catch { /* keep closing other stores */ }
  try { closeRegisteredStores(); } catch { /* best effort on process exit */ }
}
