import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemMetricsCollector } from '../../src/shared/metrics/system-metrics.js';

afterEach(() => vi.restoreAllMocks());

describe('process CPU interval measurements', () => {
  it('measures each interval from the previous cumulative native snapshot', () => {
    let cumulative = { user: 20_000, system: 10_000 };
    vi.spyOn(process, 'cpuUsage').mockImplementation((previous) => ({
      user: cumulative.user - (previous?.user ?? 0),
      system: cumulative.system - (previous?.system ?? 0),
    }));
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const collector = new SystemMetricsCollector();
    expect(collector.collectSystemMetrics().process.cpuUsage).toBe(3);

    cumulative = { user: 30_000, system: 20_000 };
    now += 100;
    expect(collector.collectSystemMetrics().process.cpuUsage).toBe(20);
    cumulative = { user: 40_000, system: 30_000 };
    now += 100;
    expect(collector.getMetricValue('process_cpu_usage')).toBe(20);
    cumulative = { user: 40_000, system: 30_000 };
    now += 100;
    expect(collector.collectSystemMetrics().process.cpuUsage).toBe(0);
  });

  it('retains the existing upper clamp and stores the unclamped native baseline', () => {
    let cumulative = { user: 200_000, system: 100_000 };
    vi.spyOn(process, 'cpuUsage').mockImplementation((previous) => ({
      user: cumulative.user - (previous?.user ?? 0),
      system: cumulative.system - (previous?.system ?? 0),
    }));
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const collector = new SystemMetricsCollector();
    collector.collectSystemMetrics();
    cumulative = { user: 400_000, system: 200_000 };
    now += 100;
    expect(collector.collectSystemMetrics().process.cpuUsage).toBe(100);
    now += 100;
    expect(collector.collectSystemMetrics().process.cpuUsage).toBe(0);
  });
});
