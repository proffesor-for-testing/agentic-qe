/**
 * Agentic QE v3 - Sterling XML Helpers
 * XML parsing utilities for Sterling OMS API responses.
 * Uses fast-xml-parser with Sterling-specific configuration.
 */

import { XMLParser } from 'fast-xml-parser';

// ============================================================================
// Sterling-Specific Parser Configuration
// ============================================================================

/** Elements that Sterling may return as single items OR arrays depending on count */
const STERLING_ARRAY_ELEMENTS = [
  'Shipment', 'OrderLine', 'Note', 'OrderInvoice',
  'ShipmentLine', 'HeaderCharge', 'PaymentMethod',
  'ContainerDetail', 'InvoiceLine',
];

export const STERLING_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (name: string): boolean => STERLING_ARRAY_ELEMENTS.includes(name),
  trimValues: true,
  parseTagValue: false,
};

// ============================================================================
// Parser Factory
// ============================================================================

/**
 * Create an XMLParser configured for Sterling OMS responses.
 * Sterling returns XML with attributes as primary data carriers,
 * and single-element arrays that need forcing to arrays.
 */
export function createSterlingXmlParser(): XMLParser {
  return new XMLParser(STERLING_PARSER_OPTIONS);
}

// ============================================================================
// Array Normalization
// ============================================================================

/**
 * Ensure a value is always an array.
 * Sterling XML returns single items as objects and multiple items as arrays.
 * This normalizes both cases to arrays for consistent handling.
 */
export function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
