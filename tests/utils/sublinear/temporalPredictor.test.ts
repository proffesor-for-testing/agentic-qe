/**
 * Tests for Temporal Predictor - Time-based Validation
 * Validates temporal prediction algorithms and edge cases
 */

import {
  TemporalPredictor,
  PredictionConfig,
  PredictionResult,
  TimeSeriesData,
  CoveragePredictor,
  QualityPredictor
} from '../../../src/utils/sublinear/temporalPredictor';

describe('TemporalPredictor', () => {
  let predictor: TemporalPredictor;

  beforeEach(() => {
    predictor = new TemporalPredictor();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(predictor).toBeInstanceOf(TemporalPredictor);
    });

    it('should initialize with custom configuration', () => {
      const config: PredictionConfig = {
        windowSize: 50,
        horizon: 10,
        confidenceLevel: 0.99,
        algorithm: 'arima'
      };

      const customPredictor = new TemporalPredictor(config);
      expect(customPredictor).toBeInstanceOf(TemporalPredictor);
    });
  });

  describe('Time Series Data Processing', () => {
    it('should validate time series data format', () => {
      const validData: TimeSeriesData = {
        timestamps: [
          new Date('2023-01-01').toISOString(),
          new Date('2023-01-02').toISOString(),
          new Date('2023-01-03').toISOString()
        ],
        values: [85.5, 86.2, 87.1],
        metadata: {
          metric: 'coverage',
          source: 'test-suite',
          interval: '1d'
        }
      };

      expect(() => predictor.validateTimeSeriesData(validData)).not.toThrow();
    });

    it('should reject invalid time series data', () => {
      const invalidData: TimeSeriesData = {
        timestamps: ['2023-01-01'],
        values: [85.5, 86.2], // Mismatched lengths
        metadata: {
          metric: 'coverage',
          source: 'test-suite',
          interval: '1d'
        }
      };

      expect(() => predictor.validateTimeSeriesData(invalidData))
        .toThrow('Timestamps and values arrays must have the same length');
    });

    it('should sort time series data by timestamp', () => {
      const unsortedData: TimeSeriesData = {
        timestamps: [
          new Date('2023-01-03').toISOString(),
          new Date('2023-01-01').toISOString(),
          new Date('2023-01-02').toISOString()
        ],
        values: [87.1, 85.5, 86.2],
        metadata: {
          metric: 'coverage',
          source: 'test-suite',
          interval: '1d'
        }
      };

      const sorted = predictor.preprocessTimeSeriesData(unsortedData);

      expect(sorted.timestamps[0]).toBe(new Date('2023-01-01').toISOString());
      expect(sorted.timestamps[1]).toBe(new Date('2023-01-02').toISOString());
      expect(sorted.timestamps[2]).toBe(new Date('2023-01-03').toISOString());
      expect(sorted.values).toEqual([85.5, 86.2, 87.1]);
    });

    it('should handle duplicate timestamps', () => {
      const dataWithDuplicates: TimeSeriesData = {
        timestamps: [
          new Date('2023-01-01').toISOString(),
          new Date('2023-01-01').toISOString(),
          new Date('2023-01-02').toISOString()
        ],
        values: [85.5, 85.7, 86.2],
        metadata: {
          metric: 'coverage',
          source: 'test-suite',
          interval: '1d'
        }
      };

      const cleaned = predictor.preprocessTimeSeriesData(dataWithDuplicates);

      expect(cleaned.timestamps.length).toBe(2);
      expect(cleaned.values.length).toBe(2);
      // Should average duplicate values
      expect(cleaned.values[0]).toBeCloseTo((85.5 + 85.7) / 2, 2);
    });
  });

  describe('Coverage Prediction', () => {
    let coveragePredictor: CoveragePredictor;
    let historicalData: TimeSeriesData;

    beforeEach(() => {
      coveragePredictor = new CoveragePredictor();

      // Generate realistic coverage trend data
      const days = 30;
      historicalData = {
        timestamps: Array(days).fill(0).map((_, i) =>
          new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000).toISOString()
        ),
        values: Array(days).fill(0).map((_, i) =>
          75 + Math.sin(i / 5) * 5 + Math.random() * 3 + i * 0.2
        ),
        metadata: {
          metric: 'coverage',
          source: 'test-execution',
          interval: '1d'
        }
      };
    });

    it('should predict future coverage values', async () => {
      const result = await coveragePredictor.predict(historicalData, 5);

      expect(result.predictions).toBeInstanceOf(Array);
      expect(result.predictions.length).toBe(5);

      result.predictions.forEach(prediction => {
        expect(prediction.timestamp).toBeDefined();
        expect(prediction.value).toBeGreaterThanOrEqual(0);
        expect(prediction.value).toBeLessThanOrEqual(100);
        expect(prediction.confidence).toBeGreaterThanOrEqual(0);
        expect(prediction.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should provide confidence intervals', async () => {
      const result = await coveragePredictor.predict(historicalData, 3);

      result.predictions.forEach(prediction => {
        expect(prediction.lowerBound).toBeLessThanOrEqual(prediction.value);
        expect(prediction.upperBound).toBeGreaterThanOrEqual(prediction.value);
        expect(prediction.lowerBound).toBeGreaterThanOrEqual(0);
        expect(prediction.upperBound).toBeLessThanOrEqual(100);
      });
    });

    it('should detect coverage trends', async () => {
      const result = await coveragePredictor.predict(historicalData, 5);

      expect(result.trend).toBeDefined();
      expect(['increasing', 'decreasing', 'stable']).toContain(result.trend.direction);
      expect(result.trend.magnitude).toBeGreaterThanOrEqual(0);
      expect(result.trend.confidence).toBeGreaterThanOrEqual(0);
      expect(result.trend.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle seasonal patterns in coverage data', async () => {
      // Create data with weekly seasonality
      const seasonalData: TimeSeriesData = {
        timestamps: Array(70).fill(0).map((_, i) =>
          new Date(Date.now() - (70 - i) * 24 * 60 * 60 * 1000).toISOString()
        ),
        values: Array(70).fill(0).map((_, i) =>
          80 + Math.sin(i * 2 * Math.PI / 7) * 10 + Math.random() * 2
        ),
        metadata: {
          metric: 'coverage',
          source: 'test-execution',
          interval: '1d'
        }
      };

      const result = await coveragePredictor.predict(seasonalData, 7);

      expect(result.seasonality).toBeDefined();
      expect(result.seasonality!.detected).toBe(true);
      expect(result.seasonality!.period).toBeGreaterThan(0);
    });

    it('should predict coverage gaps and improvements', async () => {
      const result = await coveragePredictor.predict(historicalData, 10);

      expect(result.insights).toBeDefined();
      expect(result.insights.potentialGaps).toBeInstanceOf(Array);
      expect(result.insights.improvementOpportunities).toBeInstanceOf(Array);
      expect(result.insights.riskFactors).toBeInstanceOf(Array);
    });
  });

  describe('Quality Prediction', () => {
    let qualityPredictor: QualityPredictor;
    let qualityData: TimeSeriesData;

    beforeEach(() => {
      qualityPredictor = new QualityPredictor();

      // Generate realistic quality metrics data
      qualityData = {
        timestamps: Array(50).fill(0).map((_, i) =>
          new Date(Date.now() - (50 - i) * 24 * 60 * 60 * 1000).toISOString()
        ),
        values: Array(50).fill(0).map((_, i) =>
          Math.max(70, Math.min(98, 90 + Math.sin(i / 10) * 8 + Math.random() * 4 - 2))
        ),
        metadata: {
          metric: 'pass_rate',
          source: 'test-execution',
          interval: '1d'
        }
      };
    });

    it('should predict test pass rates', async () => {
      const result = await qualityPredictor.predict(qualityData, 7);

      expect(result.predictions).toBeInstanceOf(Array);
      expect(result.predictions.length).toBe(7);

      result.predictions.forEach(prediction => {
        expect(prediction.value).toBeGreaterThanOrEqual(0);
        expect(prediction.value).toBeLessThanOrEqual(100);
      });
    });

    it('should identify quality deterioration patterns', async () => {
      // Create declining quality data
      const decliningData: TimeSeriesData = {
        ...qualityData,
        values: Array(50).fill(0).map((_, i) =>
          Math.max(60, 95 - i * 0.5 + Math.random() * 3)
        )
      };

      const result = await qualityPredictor.predict(decliningData, 5);

      expect(result.trend.direction).toBe('decreasing');
      expect(result.insights.riskFactors.length).toBeGreaterThan(0);
    });

    it('should predict flaky test emergence', async () => {
      // Create data with increasing variance (flaky tests)
      const flakyData: TimeSeriesData = {
        ...qualityData,
        values: Array(50).fill(0).map((_, i) =>
          90 + Math.random() * (i / 5) * 20 - (i / 5) * 10
        )
      };

      const result = await qualityPredictor.predict(flakyData, 5);

      expect(result.insights.riskFactors).toContain(
        expect.objectContaining({
          type: 'increasing_variance'
        })
      );
    });

    it('should predict test execution time trends', async () => {
      const executionTimeData: TimeSeriesData = {
        timestamps: qualityData.timestamps,
        values: Array(50).fill(0).map((_, i) =>
          5000 + i * 50 + Math.random() * 500 // Increasing execution time
        ),
        metadata: {
          metric: 'execution_time',
          source: 'test-execution',
          interval: '1d'
        }
      };

      const result = await qualityPredictor.predict(executionTimeData, 5);

      expect(result.predictions).toBeInstanceOf(Array);
      if (result.trend.direction === 'increasing') {
        expect(result.insights.riskFactors).toContain(
          expect.objectContaining({
            type: 'performance_degradation'
          })
        );
      }
    });
  });

  describe('Temporal Optimization', () => {
    it('should optimize test scheduling based on predictions', async () => {
      const coverageData: TimeSeriesData = {
        timestamps: Array(30).fill(0).map((_, i) =>
          new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000).toISOString()
        ),
        values: Array(30).fill(0).map((_, i) => 80 + Math.random() * 15),
        metadata: {
          metric: 'coverage',
          source: 'test-execution',
          interval: '1d'
        }
      };

      const schedule = await predictor.optimizeTestSchedule(coverageData, {
        targetCoverage: 90,
        maxTestDuration: 3600, // 1 hour
        priority: 'coverage_first'
      });

      expect(schedule).toBeDefined();
      expect(schedule.recommendedTimes).toBeInstanceOf(Array);
      expect(schedule.expectedCoverage).toBeGreaterThan(0);
      expect(schedule.confidence).toBeGreaterThanOrEqual(0);
      expect(schedule.confidence).toBeLessThanOrEqual(1);
    });

    it('should predict optimal test suite composition over time', async () => {
      const testSuiteData = {
        unit: Array(20).fill(0).map(() => 85 + Math.random() * 10),
        integration: Array(20).fill(0).map(() => 75 + Math.random() * 15),
        e2e: Array(20).fill(0).map(() => 65 + Math.random() * 20)
      };

      const optimization = await predictor.optimizeTestSuiteComposition(testSuiteData, {
        targetOverallCoverage: 88,
        timeConstraint: 7200, // 2 hours
        riskTolerance: 0.1
      });

      expect(optimization.recommendedComposition).toBeDefined();
      expect(optimization.expectedOutcome).toBeDefined();
      expect(optimization.timeline).toBeInstanceOf(Array);
    });
  });

  describe('Anomaly Detection in Time Series', () => {
    it('should detect coverage anomalies', async () => {
      // Create data with anomalies
      const anomalyData: TimeSeriesData = {
        timestamps: Array(30).fill(0).map((_, i) =>
          new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000).toISOString()
        ),
        values: Array(30).fill(0).map((_, i) => {
          if (i === 15) return 30; // Anomaly: sudden drop
          if (i === 25) return 99; // Anomaly: sudden spike
          return 85 + Math.random() * 5;
        }),
        metadata: {
          metric: 'coverage',
          source: 'test-execution',
          interval: '1d'
        }
      };

      const anomalies = await predictor.detectAnomalies(anomalyData);

      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies).toContain(
        expect.objectContaining({
          index: 15,
          type: 'drop',
          severity: expect.any(String)
        })
      );
    });

    it('should classify anomaly types', async () => {
      const spikeData: TimeSeriesData = {
        timestamps: Array(20).fill(0).map((_, i) =>
          new Date(Date.now() - (20 - i) * 24 * 60 * 60 * 1000).toISOString()
        ),
        values: Array(20).fill(0).map((_, i) => {
          if (i === 10) return 95; // Spike
          return 75 + Math.random() * 3;
        }),
        metadata: {
          metric: 'coverage',
          source: 'test-execution',
          interval: '1d'
        }
      };

      const anomalies = await predictor.detectAnomalies(spikeData);

      expect(anomalies.some(a => a.type === 'spike')).toBe(true);
    });
  });

  describe('Model Performance and Validation', () => {
    it('should validate prediction accuracy with backtesting', async () => {
      const testData: TimeSeriesData = {
        timestamps: Array(100).fill(0).map((_, i) =>
          new Date(Date.now() - (100 - i) * 24 * 60 * 60 * 1000).toISOString()
        ),
        values: Array(100).fill(0).map((_, i) =>
          80 + Math.sin(i / 10) * 5 + Math.random() * 2 + i * 0.1
        ),
        metadata: {
          metric: 'coverage',
          source: 'test-execution',
          interval: '1d'
        }
      };

      const validation = await predictor.validateModel(testData, {
        testSplit: 0.2,
        horizons: [1, 3, 7],
        metrics: ['mae', 'rmse', 'mape']
      });

      expect(validation.accuracy).toBeDefined();
      expect(validation.accuracy.mae).toBeGreaterThan(0);
      expect(validation.accuracy.rmse).toBeGreaterThan(0);
      expect(validation.accuracy.mape).toBeGreaterThanOrEqual(0);
      expect(validation.accuracy.mape).toBeLessThanOrEqual(100);
    });

    it('should measure prediction confidence calibration', async () => {
      const calibrationData: TimeSeriesData = {
        timestamps: Array(50).fill(0).map((_, i) =>
          new Date(Date.now() - (50 - i) * 24 * 60 * 60 * 1000).toISOString()
        ),
        values: Array(50).fill(0).map((_, i) => 85 + Math.random() * 10),
        metadata: {
          metric: 'coverage',
          source: 'test-execution',
          interval: '1d'
        }
      };

      const calibration = await predictor.assessConfidenceCalibration(calibrationData);

      expect(calibration.reliability).toBeGreaterThanOrEqual(0);
      expect(calibration.reliability).toBeLessThanOrEqual(1);
      expect(calibration.sharpness).toBeGreaterThan(0);
      expect(calibration.coverage).toBeGreaterThanOrEqual(0);
      expect(calibration.coverage).toBeLessThanOrEqual(1);
    });
  });

  describe('Real-time Prediction Updates', () => {
    it('should handle streaming data updates', async () => {
      const baseData: TimeSeriesData = {
        timestamps: Array(20).fill(0).map((_, i) =>
          new Date(Date.now() - (20 - i) * 24 * 60 * 60 * 1000).toISOString()
        ),
        values: Array(20).fill(0).map(() => 85 + Math.random() * 10),
        metadata: {
          metric: 'coverage',
          source: 'test-execution',
          interval: '1d'
        }
      };

      const initialPrediction = await predictor.predict(baseData, 5);

      // Add new data point
      const newDataPoint = {
        timestamp: new Date().toISOString(),
        value: 88.5
      };

      const updatedPrediction = await predictor.updatePrediction(
        initialPrediction,
        newDataPoint
      );

      expect(updatedPrediction.predictions.length).toBe(5);
      expect(updatedPrediction.modelVersion).toBeGreaterThan(initialPrediction.modelVersion);
    });

    it('should adapt to concept drift', async () => {
      // Simulate concept drift with changing patterns
      const driftData: TimeSeriesData = {
        timestamps: Array(100).fill(0).map((_, i) =>
          new Date(Date.now() - (100 - i) * 24 * 60 * 60 * 1000).toISOString()
        ),
        values: Array(100).fill(0).map((_, i) => {
          // Pattern changes at index 50
          if (i < 50) return 85 + Math.random() * 5;
          return 75 + Math.random() * 5; // Lower baseline
        }),
        metadata: {
          metric: 'coverage',
          source: 'test-execution',
          interval: '1d'
        }
      };

      const driftDetection = await predictor.detectConceptDrift(driftData);

      expect(driftDetection.detected).toBe(true);
      expect(driftDetection.changePoint).toBeGreaterThan(45);
      expect(driftDetection.changePoint).toBeLessThan(55);
      expect(driftDetection.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle insufficient data gracefully', async () => {
      const insufficientData: TimeSeriesData = {
        timestamps: [new Date().toISOString()],
        values: [85.0],
        metadata: {
          metric: 'coverage',
          source: 'test-execution',
          interval: '1d'
        }
      };

      await expect(predictor.predict(insufficientData, 5))
        .rejects.toThrow('Insufficient data for prediction');
    });

    it('should handle missing values in time series', () => {
      const dataWithMissing: TimeSeriesData = {
        timestamps: Array(10).fill(0).map((_, i) =>
          new Date(Date.now() - (10 - i) * 24 * 60 * 60 * 1000).toISOString()
        ),
        values: [85, null, 87, undefined, 89, 90, null, 92, 93, 94] as any[],
        metadata: {
          metric: 'coverage',
          source: 'test-execution',
          interval: '1d'
        }
      };

      const cleaned = predictor.handleMissingValues(dataWithMissing);

      expect(cleaned.values.every(v => typeof v === 'number')).toBe(true);
      expect(cleaned.values.length).toBe(cleaned.timestamps.length);
    });

    it('should handle extreme outliers', () => {
      const outlierData: TimeSeriesData = {
        timestamps: Array(20).fill(0).map((_, i) =>
          new Date(Date.now() - (20 - i) * 24 * 60 * 60 * 1000).toISOString()
        ),
        values: Array(20).fill(0).map((_, i) => {
          if (i === 10) return 1000; // Extreme outlier
          return 85 + Math.random() * 5;
        }),
        metadata: {
          metric: 'coverage',
          source: 'test-execution',
          interval: '1d'
        }
      };

      const cleaned = predictor.removeOutliers(outlierData);

      expect(Math.max(...cleaned.values)).toBeLessThan(150);
    });

    it('should handle non-numeric values', () => {
      const invalidData: TimeSeriesData = {
        timestamps: Array(5).fill(0).map((_, i) =>
          new Date(Date.now() - (5 - i) * 24 * 60 * 60 * 1000).toISOString()
        ),
        values: [85, 'invalid', 87, 88, 89] as any[],
        metadata: {
          metric: 'coverage',
          source: 'test-execution',
          interval: '1d'
        }
      };

      expect(() => predictor.validateTimeSeriesData(invalidData))
        .toThrow('All values must be numeric');
    });

    it('should handle future timestamps gracefully', () => {
      const futureData: TimeSeriesData = {
        timestamps: [
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Future date
          new Date().toISOString()
        ],
        values: [85, 87],
        metadata: {
          metric: 'coverage',
          source: 'test-execution',
          interval: '1d'
        }
      };

      const processed = predictor.preprocessTimeSeriesData(futureData);

      // Should filter out future timestamps
      expect(processed.timestamps.length).toBe(1);
      expect(processed.values.length).toBe(1);
    });
  });
});