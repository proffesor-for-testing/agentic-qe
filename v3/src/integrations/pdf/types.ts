/**
 * Agentic QE v3 - PDF Extraction Types
 * Types for extracting and validating fields from PDF documents
 * (shipping labels, credit notes, invoices).
 */

export interface PdfInvoiceFields {
  invoiceNo: string;
  orderNo: string;
  date: string;
  lineItems: Array<{
    articleCode: string;
    description: string;
    size: string;
    quantity: number;
    unitPriceExclTax: number;
    unitPriceInclTax: number;
    lineTotal: number;
  }>;
  total: number;
  taxRate: number;
  taxAmount: number;
}

export interface PdfLabelFields {
  recipient: string;
  address: string;
  ref: string;
  carrier: string;
  trackingNo: string;
  destination?: string;
}

export interface PdfExtractor {
  extractText(pdfBuffer: Buffer): Promise<string>;
  extractInvoiceFields(pdfBuffer: Buffer): Promise<PdfInvoiceFields | null>;
  extractLabelFields(pdfBuffer: Buffer): Promise<PdfLabelFields | null>;
}
