/**
 * Agentic QE v3 - Adidas TC01 PDF Check Steps
 * Step definitions for shipping label and credit note PDF verification.
 * Covers checks 48-50 (forward label), 130-134 (return label), 198-207 (credit note).
 * Total: 17 checks across 3 step definitions.
 *
 * These steps require PDF buffers to be available on the context.
 * In live testing, PDFs come from NShift label URLs or Sterling attachment API.
 */

import type { StepDef } from '../../integrations/orchestration/types';
import type { AdidasTestContext } from './context';

export const tc01PdfSteps: StepDef<AdidasTestContext>[] = [
  {
    id: 'step-07a',
    name: 'Forward shipping label PDF',
    description: 'Verify forward shipping label contains recipient, address, REF (checks 48-50)',
    layer: 3,
    requires: { pdf: true },
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.pdfExtractor || !ctx.forwardLabelPdf) {
        return { success: false, error: 'PDF extractor or forward label not available', durationMs: 0, checks: [] };
      }

      const fields = await ctx.pdfExtractor.extractLabelFields(ctx.forwardLabelPdf);
      if (!fields) {
        return { success: false, error: 'Could not extract label fields', durationMs: Date.now() - start, checks: [] };
      }

      return {
        success: true,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Label recipient present', passed: !!fields.recipient, expected: 'truthy', actual: fields.recipient || 'empty' },
          { name: 'Label address present', passed: !!fields.address, expected: 'truthy', actual: fields.address || 'empty' },
          { name: 'Label REF = order number', passed: fields.ref === ctx.orderId, expected: ctx.orderId, actual: fields.ref },
        ],
      };
    },
  },
  {
    id: 'step-20a',
    name: 'Return shipping label PDF',
    description: 'Verify return label: sender, destination, REF, carrier (checks 130-134)',
    layer: 3,
    requires: { pdf: true },
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.pdfExtractor || !ctx.returnLabelPdf) {
        return { success: false, error: 'PDF extractor or return label not available', durationMs: 0, checks: [] };
      }

      const fields = await ctx.pdfExtractor.extractLabelFields(ctx.returnLabelPdf);
      if (!fields) {
        return { success: false, error: 'Could not extract label fields', durationMs: Date.now() - start, checks: [] };
      }

      return {
        success: true,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Return tracking present', passed: !!fields.trackingNo, expected: 'truthy', actual: fields.trackingNo || 'empty' },
          { name: 'Sender/recipient present', passed: !!fields.recipient, expected: 'truthy', actual: fields.recipient || 'empty' },
          { name: 'Destination present', passed: !!fields.destination, expected: 'truthy', actual: fields.destination || 'empty' },
          { name: 'REF = order number', passed: fields.ref === ctx.orderId, expected: ctx.orderId, actual: fields.ref },
          { name: 'Carrier present', passed: !!fields.carrier, expected: 'truthy', actual: fields.carrier || 'empty' },
        ],
      };
    },
  },
  {
    id: 'step-32',
    name: 'Credit note PDF (Nota de Credito)',
    description: 'Verify credit note: number, order, date, article, size, qty, prices, total, IVA (checks 198-207)',
    layer: 3,
    requires: { pdf: true },
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.pdfExtractor || !ctx.creditNotePdf) {
        return { success: false, error: 'PDF extractor or credit note not available', durationMs: 0, checks: [] };
      }

      const fields = await ctx.pdfExtractor.extractInvoiceFields(ctx.creditNotePdf);
      if (!fields) {
        return { success: false, error: 'Could not extract invoice fields', durationMs: Date.now() - start, checks: [] };
      }

      const line = fields.lineItems[0];
      return {
        success: true,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Credit note number present', passed: !!fields.invoiceNo, expected: 'truthy', actual: fields.invoiceNo || 'empty' },
          { name: 'OrderNo present', passed: !!fields.orderNo, expected: 'truthy', actual: fields.orderNo || 'empty' },
          { name: 'Date present', passed: !!fields.date, expected: 'truthy', actual: fields.date || 'empty' },
          { name: 'Article code present', passed: !!line?.articleCode, expected: 'truthy', actual: line?.articleCode || 'empty' },
          { name: 'Size present', passed: !!line?.size, expected: 'truthy', actual: line?.size || 'empty' },
          { name: 'Quantity > 0', passed: (line?.quantity ?? 0) > 0, expected: '>0', actual: String(line?.quantity ?? 0) },
          { name: 'Unit price excl tax > 0', passed: (line?.unitPriceExclTax ?? 0) > 0, expected: '>0', actual: String(line?.unitPriceExclTax ?? 0) },
          { name: 'Unit price incl tax > 0', passed: (line?.unitPriceInclTax ?? 0) > 0, expected: '>0', actual: String(line?.unitPriceInclTax ?? 0) },
          { name: 'Total > 0', passed: fields.total > 0, expected: '>0', actual: String(fields.total) },
          { name: 'Tax amount > 0', passed: fields.taxAmount > 0, expected: '>0', actual: String(fields.taxAmount) },
        ],
      };
    },
  },
];
