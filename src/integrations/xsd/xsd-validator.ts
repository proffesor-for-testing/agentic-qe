/**
 * Agentic QE v3 - XSD Schema Validation
 *
 * Full W3C XSD validation using libxmljs2 (binds to libxml2).
 * Handles:
 * - Standard XML validation against XSD schemas
 * - SOAP 1.1/1.2 envelope unwrapping (validates inner body, not envelope)
 * - Namespace-qualified elements
 * - Import/include resolution (when schemas are in the same directory)
 * - Structured error reporting with line numbers
 *
 * Requires: npm install libxmljs2
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import type { Result } from '../../shared/types';
import { ok, err } from '../../shared/types';

// ============================================================================
// Types
// ============================================================================

export interface XsdValidationResult {
  valid: boolean;
  errors: XsdValidationError[];
  schemaFile: string;
  /** Number of elements in the validated XML (rough complexity indicator) */
  elementCount: number;
  /** Whether SOAP envelope was detected and unwrapped before validation */
  soapUnwrapped: boolean;
}

export interface XsdValidationError {
  message: string;
  line: number | null;
  severity: 'error' | 'warning';
}

export interface XsdValidatorOptions {
  /** Strip SOAP envelope before validation (default: true) */
  unwrapSoap?: boolean;
}

// ============================================================================
// SOAP Namespace URIs
// ============================================================================

const SOAP_11_NS = 'http://schemas.xmlsoap.org/soap/envelope/';
const SOAP_12_NS = 'http://www.w3.org/2003/05/soap-envelope';

// ============================================================================
// Dynamic libxmljs2 Import
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let libxmljs: any = null;

async function loadLibxmljs(): Promise<void> {
  if (libxmljs) return;
  try {
    libxmljs = await import('libxmljs2');
  } catch {
    throw new Error(
      'libxmljs2 package not installed. Run: npm install libxmljs2\n' +
      'Required for XSD schema validation (binds to libxml2).'
    );
  }
}

// ============================================================================
// Core Validation
// ============================================================================

/**
 * Validate an XML string against an XSD schema file.
 *
 * If the XML is wrapped in a SOAP envelope, the envelope is stripped
 * and only the body content is validated (unless `unwrapSoap: false`).
 *
 * @param xml - Raw XML string (may include SOAP envelope)
 * @param xsdPath - Absolute or relative path to the XSD schema file
 * @param options - Validation options
 */
export async function validateXml(
  xml: string,
  xsdPath: string,
  options: XsdValidatorOptions = {},
): Promise<Result<XsdValidationResult, string>> {
  const unwrapSoap = options.unwrapSoap ?? true;

  try {
    await loadLibxmljs();
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }

  // --- Load and parse XSD ---
  const resolvedXsdPath = resolve(xsdPath);
  let xsdContent: string;
  try {
    xsdContent = readFileSync(resolvedXsdPath, 'utf-8');
  } catch (e) {
    return err(`Cannot read XSD file: ${resolvedXsdPath}. ${e instanceof Error ? e.message : String(e)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let xsdDoc: any;
  try {
    // Parse XSD with baseUrl so xs:import/xs:include resolve relative paths
    xsdDoc = libxmljs.parseXml(xsdContent, { baseUrl: dirname(resolvedXsdPath) + '/' });
  } catch (e) {
    return err(`Invalid XSD schema: ${resolvedXsdPath}. ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- Parse XML ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let xmlDoc: any;
  try {
    xmlDoc = libxmljs.parseXml(xml);
  } catch (e) {
    return err(`XML parse error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // --- SOAP unwrap ---
  let soapUnwrapped = false;
  if (unwrapSoap) {
    const unwrapResult = unwrapSoapEnvelope(xmlDoc);
    if (unwrapResult) {
      xmlDoc = unwrapResult;
      soapUnwrapped = true;
    }
  }

  // --- Count elements (rough complexity metric) ---
  let elementCount: number;
  try {
    const allElements = xmlDoc.find('//*');
    elementCount = Array.isArray(allElements) ? allElements.length : 0;
  } catch {
    elementCount = 0;
  }

  // --- Validate ---
  const valid = xmlDoc.validate(xsdDoc);
  const errors: XsdValidationError[] = (xmlDoc.validationErrors || []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => ({
      message: typeof e.message === 'string' ? e.message.trim() : String(e),
      line: typeof e.line === 'number' ? e.line : null,
      severity: 'error' as const,
    }),
  );

  return ok({
    valid,
    errors,
    schemaFile: resolvedXsdPath,
    elementCount,
    soapUnwrapped,
  });
}

/**
 * Validate an XML string against multiple XSD schemas.
 * Returns the first schema that validates successfully, or all errors if none match.
 * Useful when the exact schema for a payload is unknown.
 */
export async function validateXmlAgainstMultiple(
  xml: string,
  xsdPaths: string[],
  options: XsdValidatorOptions = {},
): Promise<Result<XsdValidationResult, string>> {
  if (xsdPaths.length === 0) {
    return err('No XSD schema paths provided.');
  }

  const allErrors: string[] = [];

  for (const xsdPath of xsdPaths) {
    const result = await validateXml(xml, xsdPath, options);
    if (result.success && result.value.valid) {
      return result;
    }
    if (result.success) {
      allErrors.push(`${xsdPath}: ${result.value.errors.map(e => e.message).join('; ')}`);
    } else {
      allErrors.push(`${xsdPath}: ${result.error}`);
    }
  }

  return err(`XML failed validation against all ${xsdPaths.length} schemas:\n${allErrors.join('\n')}`);
}

// ============================================================================
// SOAP Envelope Handling
// ============================================================================

/**
 * Detect and unwrap SOAP 1.1 or 1.2 envelopes.
 * Returns a new parsed XML document of the body content, or null if not SOAP.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapSoapEnvelope(xmlDoc: any): any | null {
  const root = xmlDoc.root();
  if (!root) return null;

  const ns = root.namespace()?.href();
  if (ns !== SOAP_11_NS && ns !== SOAP_12_NS) return null;
  if (root.name() !== 'Envelope') return null;

  // Find Body element
  const nsPrefix = ns === SOAP_11_NS ? 'soap11' : 'soap12';
  const bodyNodes = xmlDoc.find(`//${nsPrefix}:Body/*`, { [nsPrefix]: ns });

  if (!Array.isArray(bodyNodes) || bodyNodes.length === 0) return null;

  // Re-parse the first child of Body as a standalone document
  const innerXml = bodyNodes[0].toString();
  try {
    return libxmljs.parseXml(innerXml);
  } catch {
    // If re-parsing fails (namespace issues), return null — validate full doc
    return null;
  }
}
