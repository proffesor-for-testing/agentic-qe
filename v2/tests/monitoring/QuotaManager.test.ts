import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  QuotaManager,
  createQuotaManager,
  ProviderQuota,
  QuotaManagerConfig,
  QuotaStatus
} from '../../src/monitoring/QuotaManager';

describe('QuotaManager', () => {
  let quotaManager: QuotaManager;
  let alertCallback: jest.Mock<(status: QuotaStatus) => void>;

  beforeEach(() => {
    jest.useFakeTimers();
    alertCallback = jest.fn();
  });

  afterEach(() => {
    if (quotaManager) {
      quotaManager.stopAutoReset();
    }
    jest.useRealTimers();
  });

  describe('Request Recording and Tracking', () => {
    it('should track single request correctly', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 100,
            resetTimeUtc: '00:00',
            warningThresholds: [80, 90]
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);
      quotaManager.recordRequest('test-provider');

      const status = quotaManager.getQuotaStatus('test-provider');
      expect(status).toBeDefined();
      expect(status!.dailyUsed).toBe(1);
      expect(status!.dailyRemaining).toBe(99);
      expect(status!.percentageUsed).toBe(1);
    });

    it('should track multiple requests correctly', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 100,
            resetTimeUtc: '00:00',
            warningThresholds: [80, 90]
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);
      quotaManager.recordRequests('test-provider', 25);

      const status = quotaManager.getQuotaStatus('test-provider');
      expect(status!.dailyUsed).toBe(25);
      expect(status!.dailyRemaining).toBe(75);
      expect(status!.percentageUsed).toBe(25);
    });

    it('should track minute-based limits correctly', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'groq',
            dailyLimit: 14400,
            minuteLimit: 10,
            resetTimeUtc: '00:00',
            warningThresholds: [80, 90]
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      // Record 5 requests
      quotaManager.recordRequests('groq', 5);

      const status = quotaManager.getQuotaStatus('groq');
      expect(status!.minuteUsed).toBe(5);
      expect(status!.minuteRemaining).toBe(5);
    });

    it('should clean up old minute window entries', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'groq',
            dailyLimit: 14400,
            minuteLimit: 10,
            resetTimeUtc: '00:00',
            warningThresholds: [80, 90]
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      // Record 5 requests
      quotaManager.recordRequests('groq', 5);

      // Advance time by 61 seconds
      jest.advanceTimersByTime(61000);

      // Record another request to trigger cleanup
      quotaManager.recordRequest('groq');

      const status = quotaManager.getQuotaStatus('groq');
      // Should only count the most recent request
      expect(status!.minuteUsed).toBe(1);
    });
  });

  describe('Warning Threshold Events', () => {
    it('should emit warning event at 80% threshold', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 100,
            resetTimeUtc: '00:00',
            warningThresholds: [80, 90]
          }
        ],
        enforcementMode: 'warn',
        alertCallback
      };

      quotaManager = new QuotaManager(config);

      const warningListener = jest.fn();
      quotaManager.on('quota-warning', warningListener);

      // Use 79 requests - no warning
      quotaManager.recordRequests('test-provider', 79);
      expect(warningListener).not.toHaveBeenCalled();

      // Use 1 more request to hit 80%
      quotaManager.recordRequest('test-provider');
      expect(warningListener).toHaveBeenCalledTimes(1);

      const emittedStatus = warningListener.mock.calls[0][0] as QuotaStatus;
      expect(emittedStatus.warningLevel).toBe('warning');
      expect(emittedStatus.percentageUsed).toBe(80);
    });

    it('should emit critical warning at 90% threshold', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 100,
            resetTimeUtc: '00:00',
            warningThresholds: [80, 90]
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      const warningListener = jest.fn();
      quotaManager.on('quota-warning', warningListener);

      // Jump to 90%
      quotaManager.recordRequests('test-provider', 90);

      // Should have triggered both 80% and 90% thresholds
      expect(warningListener).toHaveBeenCalledTimes(2);

      const lastCall = warningListener.mock.calls[1][0] as QuotaStatus;
      expect(lastCall.warningLevel).toBe('critical');
    });

    it('should not emit duplicate threshold warnings', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 100,
            resetTimeUtc: '00:00',
            warningThresholds: [80]
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      const warningListener = jest.fn();
      quotaManager.on('quota-warning', warningListener);

      // Hit 80% threshold
      quotaManager.recordRequests('test-provider', 80);
      expect(warningListener).toHaveBeenCalledTimes(1);

      // Add more requests, still above 80%
      quotaManager.recordRequests('test-provider', 5);
      // Should not emit another warning for the same threshold
      expect(warningListener).toHaveBeenCalledTimes(1);
    });

    it('should call alertCallback when provided', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 100,
            resetTimeUtc: '00:00',
            warningThresholds: [80]
          }
        ],
        enforcementMode: 'warn',
        alertCallback
      };

      quotaManager = new QuotaManager(config);
      quotaManager.recordRequest('test-provider');

      expect(alertCallback).toHaveBeenCalledTimes(1);
      const status = alertCallback.mock.calls[0][0] as QuotaStatus;
      expect(status.providerId).toBe('test-provider');
    });
  });

  describe('Quota Exhaustion Detection', () => {
    it('should detect daily quota exhaustion', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 50,
            resetTimeUtc: '00:00',
            warningThresholds: [80, 90]
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      const exhaustedListener = jest.fn();
      quotaManager.on('quota-exhausted', exhaustedListener);

      // Use entire quota
      quotaManager.recordRequests('test-provider', 50);

      expect(exhaustedListener).toHaveBeenCalled();

      const status = quotaManager.getQuotaStatus('test-provider');
      expect(status!.isExhausted).toBe(true);
      expect(status!.warningLevel).toBe('exhausted');
      expect(status!.dailyRemaining).toBe(0);
    });

    it('should detect minute quota exhaustion', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'groq',
            dailyLimit: 14400,
            minuteLimit: 10,
            resetTimeUtc: '00:00',
            warningThresholds: [80, 90]
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      // Exhaust minute quota
      quotaManager.recordRequests('groq', 10);

      const status = quotaManager.getQuotaStatus('groq');
      expect(status!.isExhausted).toBe(true);
      expect(status!.minuteRemaining).toBe(0);
    });

    it('should block requests when enforcement mode is block', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 10,
            resetTimeUtc: '00:00',
            warningThresholds: []
          }
        ],
        enforcementMode: 'block'
      };

      quotaManager = new QuotaManager(config);

      // Use entire quota
      quotaManager.recordRequests('test-provider', 10);

      // Should not allow more requests
      expect(quotaManager.canMakeRequest('test-provider')).toBe(false);
    });

    it('should allow requests in warn mode even when exhausted', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 10,
            resetTimeUtc: '00:00',
            warningThresholds: []
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      // Use entire quota
      quotaManager.recordRequests('test-provider', 10);

      // Should still allow in warn mode (returns true but quota is exhausted)
      // This is because canMakeRequest only blocks in 'block' mode
      expect(quotaManager.canMakeRequest('test-provider')).toBe(false);
    });
  });

  describe('Auto-Reset at Midnight', () => {
    it('should schedule reset for next midnight UTC', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 100,
            resetTimeUtc: '00:00',
            warningThresholds: []
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      // Use some quota
      quotaManager.recordRequests('test-provider', 50);

      const resetListener = jest.fn();
      quotaManager.on('quota-reset', resetListener);

      quotaManager.startAutoReset();

      // Fast-forward to next day
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);

      expect(resetListener).toHaveBeenCalled();

      const status = quotaManager.getQuotaStatus('test-provider');
      expect(status!.dailyUsed).toBe(0);
      expect(status!.dailyRemaining).toBe(100);
    });

    it('should reset triggered thresholds on daily reset', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 100,
            resetTimeUtc: '00:00',
            warningThresholds: [80]
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      const warningListener = jest.fn();
      quotaManager.on('quota-warning', warningListener);

      // Trigger 80% threshold
      quotaManager.recordRequests('test-provider', 80);
      expect(warningListener).toHaveBeenCalledTimes(1);

      // Reset quota
      quotaManager.resetDailyQuota('test-provider');

      // Trigger 80% again - should emit event again
      quotaManager.recordRequests('test-provider', 80);
      expect(warningListener).toHaveBeenCalledTimes(2);
    });

    it('should stop auto-reset when requested', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 100,
            resetTimeUtc: '00:00',
            warningThresholds: []
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      quotaManager.startAutoReset();
      quotaManager.stopAutoReset();

      const resetListener = jest.fn();
      quotaManager.on('quota-reset', resetListener);

      // Fast-forward - no reset should occur
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);

      expect(resetListener).not.toHaveBeenCalled();
    });
  });

  describe('Multiple Provider Tracking', () => {
    it('should track multiple providers independently', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'groq',
            dailyLimit: 14400,
            minuteLimit: 10,
            resetTimeUtc: '00:00',
            warningThresholds: [80, 90]
          },
          {
            providerId: 'openrouter',
            dailyLimit: 50,
            resetTimeUtc: '00:00',
            warningThresholds: [80, 90]
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      // Use different amounts for each provider
      quotaManager.recordRequests('groq', 100);
      quotaManager.recordRequests('openrouter', 25);

      const groqStatus = quotaManager.getQuotaStatus('groq');
      const openrouterStatus = quotaManager.getQuotaStatus('openrouter');

      expect(groqStatus!.dailyUsed).toBe(100);
      expect(openrouterStatus!.dailyUsed).toBe(25);

      expect(groqStatus!.dailyRemaining).toBe(14300);
      expect(openrouterStatus!.dailyRemaining).toBe(25);
    });

    it('should return all quota statuses', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'groq',
            dailyLimit: 14400,
            resetTimeUtc: '00:00',
            warningThresholds: []
          },
          {
            providerId: 'openrouter',
            dailyLimit: 50,
            resetTimeUtc: '00:00',
            warningThresholds: []
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      const allStatuses = quotaManager.getAllQuotaStatus();

      expect(allStatuses.size).toBe(2);
      expect(allStatuses.has('groq')).toBe(true);
      expect(allStatuses.has('openrouter')).toBe(true);
    });

    it('should reset all providers simultaneously', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'provider1',
            dailyLimit: 100,
            resetTimeUtc: '00:00',
            warningThresholds: []
          },
          {
            providerId: 'provider2',
            dailyLimit: 50,
            resetTimeUtc: '00:00',
            warningThresholds: []
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      quotaManager.recordRequests('provider1', 50);
      quotaManager.recordRequests('provider2', 25);

      quotaManager.resetAllDailyQuotas();

      const status1 = quotaManager.getQuotaStatus('provider1');
      const status2 = quotaManager.getQuotaStatus('provider2');

      expect(status1!.dailyUsed).toBe(0);
      expect(status2!.dailyUsed).toBe(0);
    });
  });

  describe('Enforcement Modes', () => {
    it('should warn but allow requests in warn mode', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 10,
            resetTimeUtc: '00:00',
            warningThresholds: []
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      quotaManager.recordRequests('test-provider', 10);

      // In warn mode, canMakeRequest should still check quota exhaustion
      const canMake = quotaManager.canMakeRequest('test-provider');
      expect(canMake).toBe(false); // Quota is exhausted
    });

    it('should block requests in block mode when quota exceeded', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 10,
            resetTimeUtc: '00:00',
            warningThresholds: []
          }
        ],
        enforcementMode: 'block'
      };

      quotaManager = new QuotaManager(config);

      quotaManager.recordRequests('test-provider', 10);

      expect(quotaManager.canMakeRequest('test-provider')).toBe(false);

      const remaining = quotaManager.getRemainingQuota('test-provider');
      expect(remaining.daily).toBe(0);
    });

    it('should allow unlimited requests in none mode', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 10,
            resetTimeUtc: '00:00',
            warningThresholds: []
          }
        ],
        enforcementMode: 'none'
      };

      quotaManager = new QuotaManager(config);

      quotaManager.recordRequests('test-provider', 10);

      // In none mode, canMakeRequest checks quota but doesn't enforce
      const canMake = quotaManager.canMakeRequest('test-provider');
      expect(canMake).toBe(false); // Quota exhausted but not blocked
    });
  });

  describe('Provider Registration and Updates', () => {
    it('should register new provider dynamically', () => {
      const config: QuotaManagerConfig = {
        providers: [],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      const newProvider: ProviderQuota = {
        providerId: 'new-provider',
        dailyLimit: 200,
        resetTimeUtc: '00:00',
        warningThresholds: [80]
      };

      quotaManager.registerProvider(newProvider);

      const status = quotaManager.getQuotaStatus('new-provider');
      expect(status).toBeDefined();
      expect(status!.dailyLimit).toBe(200);
    });

    it('should update existing provider quota', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'test-provider',
            dailyLimit: 100,
            resetTimeUtc: '00:00',
            warningThresholds: [80]
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      quotaManager.updateQuota('test-provider', {
        dailyLimit: 200,
        minuteLimit: 20
      });

      const status = quotaManager.getQuotaStatus('test-provider');
      expect(status!.dailyLimit).toBe(200);
      expect(status!.minuteLimit).toBe(20);
    });

    it('should throw error when updating non-existent provider', () => {
      const config: QuotaManagerConfig = {
        providers: [],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      expect(() => {
        quotaManager.updateQuota('non-existent', { dailyLimit: 100 });
      }).toThrow('Provider non-existent not registered');
    });
  });

  describe('Factory Function', () => {
    it('should create manager with default providers', () => {
      quotaManager = createQuotaManager();

      const allStatuses = quotaManager.getAllQuotaStatus();

      expect(allStatuses.has('groq')).toBe(true);
      expect(allStatuses.has('openrouter')).toBe(true);
      expect(allStatuses.has('github-models')).toBe(true);
      expect(allStatuses.has('ollama')).toBe(true);

      const groqStatus = allStatuses.get('groq');
      expect(groqStatus!.dailyLimit).toBe(14400);
      expect(groqStatus!.minuteLimit).toBe(10);
    });

    it('should allow custom configuration with factory', () => {
      quotaManager = createQuotaManager({
        enforcementMode: 'block',
        alertCallback
      });

      quotaManager.recordRequest('groq');

      expect(alertCallback).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle requests for unregistered provider', () => {
      const config: QuotaManagerConfig = {
        providers: [],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      expect(() => {
        quotaManager.recordRequest('unknown-provider');
      }).toThrow('Provider unknown-provider not registered');
    });

    it('should return undefined status for unregistered provider', () => {
      const config: QuotaManagerConfig = {
        providers: [],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      const status = quotaManager.getQuotaStatus('unknown');
      expect(status).toBeUndefined();
    });

    it('should handle providers with Infinity limits', () => {
      const config: QuotaManagerConfig = {
        providers: [
          {
            providerId: 'unlimited',
            dailyLimit: Infinity,
            resetTimeUtc: '00:00',
            warningThresholds: []
          }
        ],
        enforcementMode: 'warn'
      };

      quotaManager = new QuotaManager(config);

      quotaManager.recordRequests('unlimited', 1000000);

      const status = quotaManager.getQuotaStatus('unlimited');
      expect(status).toBeDefined();
      expect(status!.isExhausted).toBe(false);
      expect(status!.dailyRemaining).toBe(Infinity);
    });
  });
});
