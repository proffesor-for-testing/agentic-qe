/**
 * Agentic QE v3 - Task executability check (#1075, #1081)
 *
 * A Queen-owned task runs only if the domain plugin it is assigned to has an
 * `executeTask` handler for its type. Anything else used to fall through to
 * the `TaskAssigned` event fallback, which nothing answers, so the task stayed
 * `running` and held a concurrency slot for good.
 */

import type { DomainName } from '../shared/types';
import type { DomainPlugin } from '../kernel/interfaces';

/**
 * List the domains among `domains` that cannot execute `type`, each with the
 * reason and, where known, the types it does support. An empty list means
 * every domain can run the task.
 */
export function findDomainsWithoutHandler(
  domainPlugins: ReadonlyMap<DomainName, DomainPlugin>,
  type: string,
  domains: readonly DomainName[],
): string[] {
  const gaps: string[] = [];
  for (const domain of domains) {
    const plugin = domainPlugins.get(domain);
    if (!plugin) {
      gaps.push(`${domain} (domain not loaded)`);
    } else if (!plugin.executeTask || !plugin.canHandleTask?.(type)) {
      const supported = plugin.getSupportedTaskTypes?.() ?? [];
      gaps.push(supported.length > 0 ? `${domain} (supported: ${supported.join(', ')})` : domain);
    }
  }
  return gaps;
}

export function describeMissingHandler(type: string, gaps: readonly string[]): string {
  return `No handler for task type '${type}' in domain ${gaps.join('; ')}`;
}
