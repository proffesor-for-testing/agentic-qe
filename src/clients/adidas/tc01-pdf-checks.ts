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
      const reason = !ctx.pdfExtractor ? 'PDF extractor not available' : 'Forward label PDF not available';
      if (!ctx.pdfExtractor || !ctx.forwardLabelPdf) {
        return { success: false, error: reason, durationMs: 0, checks: [
          { name: 'Label recipient present', passed: false, expected: 'truthy', actual: reason },
          { name: 'Label address present', passed: false, expected: 'truthy', actual: reason },
          { name: 'Label REF = order number', passed: false, expected: ctx.orderId, actual: reason },
        ] };
      }

      const fields = await ctx.pdfExtractor.extractLabelFields(ctx.forwardLabelPdf);
      if (!fields) {
        return { success: false, error: 'Could not extract label fields', durationMs: Date.now() - start, checks: [
          { name: 'Label recipient present', passed: false, expected: 'truthy', actual: 'extraction failed' },
          { name: 'Label address present', passed: false, expected: 'truthy', actual: 'extraction failed' },
          { name: 'Label REF = order number', passed: false, expected: ctx.orderId, actual: 'extraction failed' },
        ] };
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
      const reason = !ctx.pdfExtractor ? 'PDF extractor not available' : 'Return label PDF not available';
      if (!ctx.pdfExtractor || !ctx.returnLabelPdf) {
        return { success: false, error: reason, durationMs: 0, checks: [
          { name: 'Return tracking present', passed: false, expected: 'truthy', actual: reason },
          { name: 'Sender/recipient present', passed: false, expected: 'truthy', actual: reason },
          { name: 'Destination present', passed: false, expected: 'truthy', actual: reason },
          { name: 'REF = order number', passed: false, expected: ctx.orderId, actual: reason },
          { name: 'Carrier present', passed: false, expected: 'truthy', actual: reason },
        ] };
      }

      const fields = await ctx.pdfExtractor.extractLabelFields(ctx.returnLabelPdf);
      if (!fields) {
        return { success: false, error: 'Could not extract label fields', durationMs: Date.now() - start, checks: [
          { name: 'Return tracking present', passed: false, expected: 'truthy', actual: 'extraction failed' },
          { name: 'Sender/recipient present', passed: false, expected: 'truthy', actual: 'extraction failed' },
          { name: 'Destination present', passed: false, expected: 'truthy', actual: 'extraction failed' },
          { name: 'REF = order number', passed: false, expected: ctx.orderId, actual: 'extraction failed' },
          { name: 'Carrier present', passed: false, expected: 'truthy', actual: 'extraction failed' },
        ] };
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
      const reason = !ctx.pdfExtractor ? 'PDF extractor not available' : 'Credit note PDF not available';
      if (!ctx.pdfExtractor || !ctx.creditNotePdf) {
        return { success: false, error: reason, durationMs: 0, checks: [
          { name: 'Credit note number present', passed: false, expected: 'truthy', actual: reason },
          { name: 'OrderNo present', passed: false, expected: 'truthy', actual: reason },
          { name: 'Date present', passed: false, expected: 'truthy', actual: reason },
          { name: 'Article code present', passed: false, expected: 'truthy', actual: reason },
          { name: 'Size present', passed: false, expected: 'truthy', actual: reason },
          { name: 'Quantity > 0', passed: false, expected: '>0', actual: reason },
          { name: 'Unit price excl tax > 0', passed: false, expected: '>0', actual: reason },
          { name: 'Unit price incl tax > 0', passed: false, expected: '>0', actual: reason },
          { name: 'Total > 0', passed: false, expected: '>0', actual: reason },
          { name: 'Tax amount > 0', passed: false, expected: '>0', actual: reason },
        ] };
      }

      const fields = await ctx.pdfExtractor.extractInvoiceFields(ctx.creditNotePdf);
      if (!fields) {
        return { success: false, error: 'Could not extract invoice fields', durationMs: Date.now() - start, checks: [
          { name: 'Credit note number present', passed: false, expected: 'truthy', actual: 'extraction failed' },
          { name: 'OrderNo present', passed: false, expected: 'truthy', actual: 'extraction failed' },
          { name: 'Date present', passed: false, expected: 'truthy', actual: 'extraction failed' },
          { name: 'Article code present', passed: false, expected: 'truthy', actual: 'extraction failed' },
          { name: 'Size present', passed: false, expected: 'truthy', actual: 'extraction failed' },
          { name: 'Quantity > 0', passed: false, expected: '>0', actual: 'extraction failed' },
          { name: 'Unit price excl tax > 0', passed: false, expected: '>0', actual: 'extraction failed' },
          { name: 'Unit price incl tax > 0', passed: false, expected: '>0', actual: 'extraction failed' },
          { name: 'Total > 0', passed: false, expected: '>0', actual: 'extraction failed' },
          { name: 'Tax amount > 0', passed: false, expected: '>0', actual: 'extraction failed' },
        ] };
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
