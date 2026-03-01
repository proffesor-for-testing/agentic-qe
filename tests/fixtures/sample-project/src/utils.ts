/**
 * Utility functions
 */

export function formatDate(date: Date): string {
  return date.toISOString();
}

export function parseNumber(str: string): number {
  return parseInt(str, 10);
}

// TODO: Add validation
export function validateEmail(email: string): boolean {
  return email.includes('@');
}
