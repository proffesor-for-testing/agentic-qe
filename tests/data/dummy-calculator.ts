/**
 * Dummy Calculator for Coverage Analysis Testing
 */
export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }

  multiply(a: number, b: number): number {
    return a * b;
  }

  divide(a: number, b: number): number {
    if (b === 0) {
      throw new Error('Division by zero');
    }
    return a / b;
  }

  power(base: number, exponent: number): number {
    return Math.pow(base, exponent);
  }

  squareRoot(n: number): number {
    if (n < 0) {
      throw new Error('Cannot calculate square root of negative number');
    }
    return Math.sqrt(n);
  }

  // Complex method with multiple branches (uncovered in test)
  complexCalculation(x: number, y: number, operation: string): number {
    if (operation === 'add') {
      return this.add(x, y);
    } else if (operation === 'subtract') {
      return this.subtract(x, y);
    } else if (operation === 'multiply') {
      return this.multiply(x, y);
    } else if (operation === 'divide') {
      return this.divide(x, y);
    } else if (operation === 'power') {
      return this.power(x, y);
    } else if (operation === 'sqrt') {
      return this.squareRoot(x);
    } else {
      throw new Error('Unknown operation');
    }
  }
}
