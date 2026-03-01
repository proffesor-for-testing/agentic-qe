/**
 * Sample source file for metric collector testing
 */

// TODO: Add more features
export function greet(name: string): string {
  console.log(`Greeting ${name}`);
  return `Hello, ${name}!`;
}

export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

// FIXME: This function needs error handling
export function divide(a: number, b: number): number {
  return a / b;
}
