/**
 * Agentic QE v3 - PDF Extractor
 * Extracts structured fields from PDF documents using pdf-parse.
 *
 * Handles:
 * - Credit notes (Nota de Credito) — invoice number, line items, tax, total
 * - Shipping labels — recipient, address, REF, carrier, tracking
 * - Sales invoices — same structure as credit notes
 *
 * Requires: npm install pdf-parse
 *
 * Field extraction uses regex patterns matched against the text content
 * of PDFs as they appear in the Adidas O2C flow (Portuguese locale).
 */

import type { PdfExtractor, PdfInvoiceFields, PdfLabelFields } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfParse: any = null;

async function loadPdfLibrary(): Promise<void> {
  if (pdfParse) return;
  try {
    const mod = await import('pdf-parse');
    pdfParse = mod.default ?? mod;
  } catch {
    throw new Error(
      'pdf-parse package not installed. Run: npm install pdf-parse'
    );
  }
}

// ============================================================================
// Regex patterns for Adidas PT locale documents
// ============================================================================

const INVOICE_PATTERNS = {
  invoiceNo: /(?:NC|PTADCN|Invoice\s*(?:No|Number)?[:\s]*)([\w\d]+)/i,
  orderNo: /(?:Numero de pedido|Order\s*(?:No|Number)?)[:\s]*([\w\d]+)/i,
  date: /(\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4})/,
  total: /(?:Valor da nota de credito|Total)[:\s]*(?:EUR\s*)?(\d+[.,]\d{2})/i,
  taxRate: /(?:IVA|VAT|Tax)\s*(\d+)%/i,
  taxAmount: /(?:IVA|VAT|Tax)\s*\d+%[:\s]*(?:EUR\s*)?(\d+[.,]\d{2})/i,
  unitPriceExclTax: /(?:Sem IVA|excl\.?\s*(?:IVA|VAT))[:\s]*(?:EUR\s*)?(\d+[.,]\d{2})/i,
  unitPriceInclTax: /(?:PVP|incl\.?\s*(?:IVA|VAT))[:\s]*(?:EUR\s*)?(\d+[.,]\d{2})/i,
  articleCode: /(?:Article|Artigo|Code)[:\s]*([A-Z]\d{5})/i,
  description: /(?:Sapatos|Shoes)\s+([\w\s]+?)(?:\n|Size|Tamanho)/i,
  size: /(?:Size|Tamanho)[:\s]*(\d+)/i,
  quantity: /(?:Qty|Quantidade|Qtd)[:\s]*(\d+)/i,
};

const LABEL_PATTERNS = {
  recipient: /(?:Destinatario|Recipient|To)[:\s]*([^\n]+)/i,
  address: /(?:Morada|Address)[:\s]*([^\n]+(?:\n[^\n]+)?)/i,
  ref: /(?:REF\s*(?:CLIENTE)?|Reference)[:\s]*([\w\d]+)/i,
  carrier: /(?:Carrier|Transportadora)[:\s]*([^\n]+)/i,
  trackingNo: /(?:Tracking|Seguimento|Barcode)[:\s]*([\w\d]+)/i,
  destination: /(?:Destino|Destination|c\/o)[:\s]*([^\n]+)/i,
};

function parseEurAmount(raw: string): number {
  return parseFloat(raw.replace(',', '.'));
}

function extractMatch(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? '';
}

// ============================================================================
// Implementation
// ============================================================================

class PdfExtractorImpl implements PdfExtractor {
  async extractText(pdfBuffer: Buffer): Promise<string> {
    await loadPdfLibrary();
    const data = await pdfParse(pdfBuffer);
    return data.text ?? '';
  }

  async extractInvoiceFields(pdfBuffer: Buffer): Promise<PdfInvoiceFields | null> {
    const text = await this.extractText(pdfBuffer);
    if (!text) return null;

    const invoiceNo = extractMatch(text, INVOICE_PATTERNS.invoiceNo);
    const orderNo = extractMatch(text, INVOICE_PATTERNS.orderNo);
    if (!invoiceNo && !orderNo) return null;

    const totalRaw = extractMatch(text, INVOICE_PATTERNS.total);
    const taxRateRaw = extractMatch(text, INVOICE_PATTERNS.taxRate);
    const taxAmountRaw = extractMatch(text, INVOICE_PATTERNS.taxAmount);

    // Extract ALL line items using matchAll for multi-item documents
    const lineItems: PdfInvoiceFields['lineItems'] = [];
    const articleMatches = [...text.matchAll(new RegExp(INVOICE_PATTERNS.articleCode, 'gi'))];

    if (articleMatches.length > 0) {
      // For each article code found, extract surrounding fields
      for (const articleMatch of articleMatches) {
        const articleCode = articleMatch[1]?.trim() ?? '';
        // Extract fields from the region around this article code (±500 chars)
        const pos = articleMatch.index ?? 0;
        const region = text.slice(Math.max(0, pos - 100), pos + 500);

        const description = extractMatch(region, INVOICE_PATTERNS.description);
        const size = extractMatch(region, INVOICE_PATTERNS.size);
        const quantityRaw = extractMatch(region, INVOICE_PATTERNS.quantity);
        const unitExclRaw = extractMatch(region, INVOICE_PATTERNS.unitPriceExclTax);
        const unitInclRaw = extractMatch(region, INVOICE_PATTERNS.unitPriceInclTax);

        const quantity = quantityRaw ? parseInt(quantityRaw, 10) : 0;
        const unitPriceExclTax = unitExclRaw ? parseEurAmount(unitExclRaw) : 0;
        const unitPriceInclTax = unitInclRaw ? parseEurAmount(unitInclRaw) : 0;

        lineItems.push({
          articleCode,
          description,
          size,
          quantity,
          unitPriceExclTax,
          unitPriceInclTax,
          lineTotal: unitPriceInclTax * quantity,
        });
      }
    } else {
      // Fallback: try to extract a single line item without article code
      const unitExclRaw = extractMatch(text, INVOICE_PATTERNS.unitPriceExclTax);
      const unitInclRaw = extractMatch(text, INVOICE_PATTERNS.unitPriceInclTax);
      const quantityRaw = extractMatch(text, INVOICE_PATTERNS.quantity);
      const quantity = quantityRaw ? parseInt(quantityRaw, 10) : 0;
      const unitPriceExclTax = unitExclRaw ? parseEurAmount(unitExclRaw) : 0;
      const unitPriceInclTax = unitInclRaw ? parseEurAmount(unitInclRaw) : 0;
      if (quantity > 0 || unitPriceInclTax > 0) {
        lineItems.push({
          articleCode: '',
          description: extractMatch(text, INVOICE_PATTERNS.description),
          size: extractMatch(text, INVOICE_PATTERNS.size),
          quantity,
          unitPriceExclTax,
          unitPriceInclTax,
          lineTotal: unitPriceInclTax * quantity,
        });
      }
    }

    return {
      invoiceNo,
      orderNo,
      date: extractMatch(text, INVOICE_PATTERNS.date),
      lineItems,
      total: totalRaw ? parseEurAmount(totalRaw) : 0,
      taxRate: taxRateRaw ? parseInt(taxRateRaw, 10) : 0,
      taxAmount: taxAmountRaw ? parseEurAmount(taxAmountRaw) : 0,
    };
  }

  async extractLabelFields(pdfBuffer: Buffer): Promise<PdfLabelFields | null> {
    const text = await this.extractText(pdfBuffer);
    if (!text) return null;

    const recipient = extractMatch(text, LABEL_PATTERNS.recipient);
    const ref = extractMatch(text, LABEL_PATTERNS.ref);
    if (!recipient && !ref) return null;

    return {
      recipient,
      address: extractMatch(text, LABEL_PATTERNS.address),
      ref,
      carrier: extractMatch(text, LABEL_PATTERNS.carrier),
      trackingNo: extractMatch(text, LABEL_PATTERNS.trackingNo),
      destination: extractMatch(text, LABEL_PATTERNS.destination) || undefined,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createPdfExtractor(): PdfExtractor {
  return new PdfExtractorImpl();
}
