// Custom Jest test sequencer optimized for TDD workflow
// Runs tests in optimal order: unit -> integration -> e2e

const DefaultSequencer = require('@jest/test-sequencer').default;

class TDDSequencer extends DefaultSequencer {
  /**
   * Sort tests to follow TDD best practices:
   * 1. Unit tests first (fastest feedback)
   * 2. Integration tests second
   * 3. E2E tests last (slowest but most comprehensive)
   * 4. Within each category, run fastest tests first
   */
  sort(tests) {
    const testsByType = {
      unit: [],
      integration: [],
      e2e: [],
      other: []
    };

    // Categorize tests
    tests.forEach(test => {
      const testPath = test.path;
      
      if (testPath.includes('/unit/')) {
        testsByType.unit.push(test);
      } else if (testPath.includes('/integration/')) {
        testsByType.integration.push(test);
      } else if (testPath.includes('/e2e/')) {
        testsByType.e2e.push(test);
      } else {
        testsByType.other.push(test);
      }
    });

    // Sort each category by estimated execution time (faster first)
    Object.keys(testsByType).forEach(type => {
      testsByType[type].sort((a, b) => {
        // Estimate test execution time based on file size and test count
        const aSize = this.getTestFileComplexity(a.path);
        const bSize = this.getTestFileComplexity(b.path);
        return aSize - bSize;
      });
    });

    // Return tests in TDD order
    return [
      ...testsByType.unit,
      ...testsByType.integration, 
      ...testsByType.e2e,
      ...testsByType.other
    ];
  }

  /**
   * Estimate test file complexity for ordering
   */
  getTestFileComplexity(testPath) {
    const fs = require('fs');
    
    try {
      const content = fs.readFileSync(testPath, 'utf8');
      
      // Count test indicators
      const testCount = (content.match(/\b(it|test)\s*\(/g) || []).length;
      const describeCount = (content.match(/\bdescribe\s*\(/g) || []).length;
      const mockCount = (content.match(/\bmock\w*\s*\(/g) || []).length;
      const asyncCount = (content.match(/\basync\b/g) || []).length;
      
      // Weight factors for complexity
      const complexity = 
        testCount * 10 +           // Each test adds complexity
        describeCount * 5 +       // Each describe block adds structure
        mockCount * 3 +           // Mocks add setup complexity
        asyncCount * 8 +          // Async tests take longer
        content.length * 0.001;   // File size factor
      
      return Math.round(complexity);
    } catch (error) {
      // If we can't read the file, assume medium complexity
      return 100;
    }
  }

  /**
   * Optional: Cache test execution times for better ordering
   */
  getCachedExecutionTimes() {
    const fs = require('fs');
    const path = require('path');
    const cacheFile = path.join(process.cwd(), '.jest-execution-cache.json');
    
    try {
      if (fs.existsSync(cacheFile)) {
        return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      }
    } catch (error) {
      // Ignore cache read errors
    }
    
    return {};
  }

  /**
   * Save execution times for future runs
   */
  saveCachedExecutionTimes(times) {
    const fs = require('fs');
    const path = require('path');
    const cacheFile = path.join(process.cwd(), '.jest-execution-cache.json');
    
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(times, null, 2));
    } catch (error) {
      // Ignore cache write errors
    }
  }
}

module.exports = TDDSequencer;
