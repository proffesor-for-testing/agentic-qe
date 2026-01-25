import { Calculator } from '../../src/utils/Calculator';

describe('Calculator', () => {
  let calculator: Calculator;

  beforeEach(() => {
    calculator = new Calculator();
  });

  describe('add', () => {
    it('should add two positive numbers', () => {
      expect(calculator.add(5, 3)).toBe(8);
    });

    it('should add two negative numbers', () => {
      expect(calculator.add(-5, -3)).toBe(-8);
    });

    it('should add positive and negative numbers', () => {
      expect(calculator.add(5, -3)).toBe(2);
      expect(calculator.add(-5, 3)).toBe(-2);
    });

    it('should handle zero correctly', () => {
      expect(calculator.add(0, 5)).toBe(5);
      expect(calculator.add(5, 0)).toBe(5);
      expect(calculator.add(0, 0)).toBe(0);
    });

    it('should handle decimal numbers', () => {
      expect(calculator.add(0.1, 0.2)).toBeCloseTo(0.3, 10);
    });

    it('should handle large numbers', () => {
      expect(calculator.add(Number.MAX_SAFE_INTEGER - 1, 1)).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('subtract', () => {
    it('should subtract two positive numbers', () => {
      expect(calculator.subtract(5, 3)).toBe(2);
    });

    it('should subtract two negative numbers', () => {
      expect(calculator.subtract(-5, -3)).toBe(-2);
    });

    it('should subtract negative from positive', () => {
      expect(calculator.subtract(5, -3)).toBe(8);
    });

    it('should subtract positive from negative', () => {
      expect(calculator.subtract(-5, 3)).toBe(-8);
    });

    it('should handle zero correctly', () => {
      expect(calculator.subtract(5, 0)).toBe(5);
      expect(calculator.subtract(0, 5)).toBe(-5);
      expect(calculator.subtract(0, 0)).toBe(0);
    });

    it('should handle decimal numbers', () => {
      expect(calculator.subtract(0.3, 0.1)).toBeCloseTo(0.2, 10);
    });
  });

  describe('multiply', () => {
    it('should multiply two positive numbers', () => {
      expect(calculator.multiply(5, 3)).toBe(15);
    });

    it('should multiply two negative numbers', () => {
      expect(calculator.multiply(-5, -3)).toBe(15);
    });

    it('should multiply positive and negative numbers', () => {
      expect(calculator.multiply(5, -3)).toBe(-15);
      expect(calculator.multiply(-5, 3)).toBe(-15);
    });

    it('should handle multiplication by zero', () => {
      expect(calculator.multiply(5, 0)).toBe(0);
      expect(calculator.multiply(0, 5)).toBe(0);
      expect(calculator.multiply(0, 0)).toBe(0);
    });

    it('should handle multiplication by one', () => {
      expect(calculator.multiply(5, 1)).toBe(5);
      expect(calculator.multiply(1, 5)).toBe(5);
    });

    it('should handle decimal numbers', () => {
      expect(calculator.multiply(0.5, 0.2)).toBeCloseTo(0.1, 10);
    });
  });

  describe('divide', () => {
    it('should divide two positive numbers', () => {
      expect(calculator.divide(6, 3)).toBe(2);
    });

    it('should divide two negative numbers', () => {
      expect(calculator.divide(-6, -3)).toBe(2);
    });

    it('should divide positive by negative', () => {
      expect(calculator.divide(6, -3)).toBe(-2);
    });

    it('should divide negative by positive', () => {
      expect(calculator.divide(-6, 3)).toBe(-2);
    });

    it('should handle division resulting in decimal', () => {
      expect(calculator.divide(5, 2)).toBe(2.5);
    });

    it('should handle zero dividend', () => {
      expect(calculator.divide(0, 5)).toBe(0);
    });

    it('should throw error on division by zero', () => {
      expect(() => calculator.divide(5, 0)).toThrow('Division by zero');
    });

    it('should throw error on division of zero by zero', () => {
      expect(() => calculator.divide(0, 0)).toThrow('Division by zero');
    });

    it('should handle division by one', () => {
      expect(calculator.divide(5, 1)).toBe(5);
    });

    it('should handle very small divisors', () => {
      expect(calculator.divide(1, 0.0001)).toBe(10000);
    });
  });

  describe('edge cases', () => {
    it('should handle NaN inputs gracefully', () => {
      expect(calculator.add(NaN, 5)).toBeNaN();
      expect(calculator.multiply(NaN, 5)).toBeNaN();
    });

    it('should handle Infinity', () => {
      expect(calculator.add(Infinity, 5)).toBe(Infinity);
      expect(calculator.multiply(Infinity, 2)).toBe(Infinity);
    });

    it('should handle negative zero', () => {
      expect(calculator.add(-0, 0)).toBe(0);
      expect(calculator.multiply(-0, 5)).toBe(-0);
    });
  });
});
