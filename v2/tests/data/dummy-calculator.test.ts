/**
 * Partial Test Suite for Calculator (intentionally incomplete for coverage analysis)
 */
import { Calculator } from './dummy-calculator';

describe('Calculator', () => {
  let calculator: Calculator;

  beforeEach(() => {
    calculator = new Calculator();
  });

  describe('add', () => {
    it('should add two positive numbers', () => {
      expect(calculator.add(2, 3)).toBe(5);
    });

    it('should handle negative numbers', () => {
      expect(calculator.add(-5, 3)).toBe(-2);
    });
  });

  describe('subtract', () => {
    it('should subtract two numbers', () => {
      expect(calculator.subtract(10, 3)).toBe(7);
    });
  });

  describe('multiply', () => {
    it('should multiply two numbers', () => {
      expect(calculator.multiply(4, 5)).toBe(20);
    });
  });

  // Note: divide, power, squareRoot, and complexCalculation are NOT tested
  // This creates coverage gaps for analysis
});
