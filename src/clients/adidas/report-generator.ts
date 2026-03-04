/**
 * Adidas TC01 Report Generator
 * Thin wrapper around the generic lifecycle report generator.
 * Also provides generateDebugDump() for structured Markdown debug output
 * and generateFullBreakdown() for comprehensive narrative run reports.
 */
import { generateLifecycleReport } from '../../integrations/orchestration/report-generator';
import type { RunResult, StageResult } from '../../integrations/orchestration/action-types';
import type { HealingOutcome } from './healing-telemetry';
import type { RecurringFailure } from './run-history';
import { STERLING_FIELD_MAP } from './run-history';
import * as fs from 'fs';
import * as path from 'path';

export { generateLifecycleReport } from '../../integrations/orchestration/report-generator';
export type { ReportOptions } from '../../integrations/orchestration/report-generator';

/**
 * Generate a TC01-specific HTML report.
 * Convenience wrapper that sets title and filename prefix for Adidas O2C.
 */
export async function generateTC01Report(
  result: RunResult,
  orderId: string,
  outputDir?: string,
): Promise<string> {
  return generateLifecycleReport(result, orderId, {
    title: 'Adidas O2C Lifecycle Report',
    filenamePrefix: 'o2c',
    outputDir,
  });
}

// ============================================================================
// Debug Dump — Structured Markdown for post-mortem analysis
// ============================================================================

interface DebugDumpConfig {
  enterpriseCode: string;
  host: string;
  layers: string;
}

/**
 * Generate a structured Markdown debug dump for a TC01 run.
 *
 * Sections:
 *   1. Run Summary — order, stages pass/fail/skip, duration, timestamp
 *   2. Per-stage table — id, status, duration, action error, failed check count
 *   3. Failed checks — flat list: stage, check name, expected, actual
 *   4. Self-healing outcomes — stage, decision, pattern, duration
 *   5. Recurring failures (only if 2+ runs) — check name, fail rate, Sterling field
 *
 * No root-cause classification heuristics. Just structured data.
 */
export async function generateDebugDump(
  result: RunResult,
  orderId: string,
  config: DebugDumpConfig,
  healingOutcomes: HealingOutcome[],
  recurringFailures: RecurringFailure[],
  outputDir?: string,
): Promise<string> {
  const lines: string[] = [];
  const ts = new Date().toISOString();

  // Section 1: Run Summary
  lines.push(`# Debug Dump — ${orderId}`);
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Order | ${orderId} |`);
  lines.push(`| Timestamp | ${ts} |`);
  lines.push(`| Enterprise | ${config.enterpriseCode} |`);
  lines.push(`| Host | ${config.host} |`);
  lines.push(`| Layers | ${config.layers} |`);
  lines.push(`| Result | ${result.overallSuccess ? 'PASS' : 'FAIL'} |`);
  lines.push(`| Stages | ${result.passed} pass / ${result.failed} fail / ${result.skipped} skip |`);
  lines.push(`| Total Checks | ${result.totalChecks} |`);
  lines.push(`| Duration | ${(result.totalDurationMs / 1000).toFixed(1)}s |`);
  lines.push('');

  // Section 2: Per-stage table
  lines.push('## Stages');
  lines.push('');
  lines.push('| Stage | Status | Duration | Action Error | Failed Checks |');
  lines.push('|-------|--------|----------|-------------|---------------|');
  for (const stage of result.stages) {
    const status = stage.overallSuccess ? 'PASS' : 'FAIL';
    const dur = `${(stage.durationMs / 1000).toFixed(1)}s`;
    const actionErr = (stage.action.error ?? '').slice(0, 60) || '-';
    const failedCount = stage.verification.failed;
    lines.push(`| ${stage.stageId} | ${status} | ${dur} | ${actionErr} | ${failedCount} |`);
  }
  lines.push('');

  // Section 3: Failed checks
  const failedChecks: Array<{ stageId: string; checkName: string; expected: string; actual: string }> = [];
  for (const stage of result.stages) {
    for (const step of stage.verification.steps) {
      for (const check of step.result.checks) {
        if (!check.passed) {
          failedChecks.push({
            stageId: stage.stageId,
            checkName: check.name,
            expected: String(check.expected ?? '-').slice(0, 40),
            actual: String(check.actual ?? '-').slice(0, 40),
          });
        }
      }
    }
  }

  if (failedChecks.length > 0) {
    lines.push('## Failed Checks');
    lines.push('');
    lines.push('| Stage | Check | Expected | Actual | Sterling Field |');
    lines.push('|-------|-------|----------|--------|----------------|');
    for (const fc of failedChecks) {
      const field = STERLING_FIELD_MAP[fc.checkName] ?? '-';
      lines.push(`| ${fc.stageId} | ${fc.checkName} | ${fc.expected} | ${fc.actual} | ${field} |`);
    }
    lines.push('');
  }

  // Section 4: Self-healing outcomes
  if (healingOutcomes.length > 0) {
    lines.push('## Self-Healing Outcomes');
    lines.push('');
    lines.push('| Stage | Decision | Pattern | Duration | Success |');
    lines.push('|-------|----------|---------|----------|---------|');
    for (const ho of healingOutcomes) {
      const dur = ho.durationMs ? `${ho.durationMs}ms` : '-';
      lines.push(`| ${ho.stageId} | ${ho.decision} | ${ho.patternMatched ?? ho.playbookName ?? '-'} | ${dur} | ${ho.success ? 'yes' : 'no'} |`);
    }
    lines.push('');
  }

  // Section 5: Recurring failures (cross-run)
  if (recurringFailures.length > 0) {
    lines.push('## Recurring Failures (Cross-Run)');
    lines.push('');
    lines.push('| Check | Fail Rate | Failed In | Total Runs | Sterling Field |');
    lines.push('|-------|-----------|-----------|------------|----------------|');
    for (const rf of recurringFailures) {
      const rate = `${(rf.failRate * 100).toFixed(0)}%`;
      const field = rf.sterlingField ?? '(unmapped)';
      lines.push(`| ${rf.checkName} | ${rate} | ${rf.failedInRuns} | ${rf.totalRuns} | ${field} |`);
    }
    lines.push('');
  }

  // Write to file
  const dir = outputDir ?? path.join(process.cwd(), 'tests', 'reports');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filename = `debug-${orderId}-${Date.now()}.md`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

  return filePath;
}

// ============================================================================
// Full Breakdown — Comprehensive Narrative Report (auto-generated)
// ============================================================================

/**
 * Metadata about each verification step: what system it queries, what actor
 * drives it, and what protocol is used. Built from tc01-steps.ts definitions.
 */
interface StepMeta {
  system: string;
  actor: string;
  protocol: string;
  iibFlow?: string;
}

const STEP_META: Record<string, StepMeta> = {
  'step-01': { system: 'Sterling OMS', actor: 'AQE → Sterling REST API', protocol: 'POST /invoke/getOrderDetails' },
  'step-02': { system: 'Sterling OMS', actor: 'AQE → Sterling REST API', protocol: 'POST /invoke/getOrderDetails + getOrderReleaseList' },
  'step-03': { system: 'EPOCH Monitoring DB', actor: 'AQE → EPOCH GraphQL', protocol: 'GraphQL getMessageList', iibFlow: 'MF_ADS_OMS_ShipmentRequest_WMS_SYNC' },
  'step-04': { system: 'EPOCH Monitoring DB', actor: 'AQE → EPOCH GraphQL', protocol: 'GraphQL getMessageList', iibFlow: 'MF_ADS_WMS_ShipmentConfirm_SYNC' },
  'step-05': { system: 'EPOCH Monitoring DB', actor: 'AQE → EPOCH GraphQL', protocol: 'GraphQL getMessageList', iibFlow: 'MF_ADS_OMS_AFS_SalesOrderCreation' },
  'step-06': { system: 'EPOCH Monitoring DB', actor: 'AQE → EPOCH GraphQL', protocol: 'GraphQL getMessageList', iibFlow: 'MF_ADS_OMS_NShift_ShippingAndReturnLabel_SYNC' },
  'step-07': { system: 'EPOCH Monitoring DB', actor: 'AQE → EPOCH GraphQL', protocol: 'GraphQL getMessageList', iibFlow: 'MF_ADS_AFS_OMS_PPSalesOrderAck_SYNC' },
  'step-08': { system: 'Sterling OMS', actor: 'AQE → Sterling REST API', protocol: 'POST /invoke/getShipmentListForOrder + getOrderDetails' },
  'step-09': { system: 'NShift', actor: 'AQE → NShift REST API', protocol: 'REST getShipmentDetails' },
  'step-10': { system: 'Sterling OMS', actor: 'AQE → Sterling REST API', protocol: 'POST /invoke/getOrderDetails (status + Notes)' },
  'step-10a': { system: 'EPOCH Monitoring DB', actor: 'AQE → EPOCH GraphQL', protocol: 'GraphQL getMessageList', iibFlow: 'MF_ADS_Kafka_POD_Events' },
  'step-11': { system: 'Sterling OMS', actor: 'AQE → Sterling REST API', protocol: 'POST /invoke/getOrderDetails (status + Notes + PaymentMethods)' },
  'step-12': { system: 'Sterling OMS', actor: 'AQE → Sterling REST API', protocol: 'POST /invoke/getOrderInvoiceList' },
  'step-12a': { system: 'In-memory context', actor: 'AQE', protocol: 'Context validation (no API call)' },
  'step-03a': { system: 'Email (IMAP/MS Graph)', actor: 'AQE → Email Provider', protocol: 'IMAP or MS Graph' },
  'step-07a': { system: 'PDF extractor', actor: 'AQE → PDF Parser', protocol: 'pdf-parse library' },
  'step-14a': { system: 'Email (IMAP/MS Graph)', actor: 'AQE → Email Provider', protocol: 'IMAP or MS Graph' },
  'step-16a': { system: 'Email (IMAP/MS Graph)', actor: 'AQE → Email Provider', protocol: 'IMAP or MS Graph' },
  'step-15': { system: 'Sterling OMS', actor: 'AQE → Sterling REST API', protocol: 'POST /invoke/getOrderDetails (DocType 0003 / 0001 fallback)' },
  'step-16': { system: 'EPOCH Monitoring DB', actor: 'AQE → EPOCH GraphQL', protocol: 'GraphQL getMessageList', iibFlow: 'MF_ADS_EPOCH_ReturnAuthorization_WE' },
  'step-24': { system: 'Sterling OMS', actor: 'AQE → Sterling REST API', protocol: 'POST /invoke/getOrderDetails' },
  'step-25': { system: 'Sterling OMS', actor: 'AQE → Sterling REST API', protocol: 'POST /invoke/getOrderInvoiceList (DocType 0003 / 0001 fallback)' },
  'step-26': { system: 'In-memory context', actor: 'AQE', protocol: 'Context validation (no API call)' },
  'step-21a': { system: 'Email (IMAP/MS Graph)', actor: 'AQE → Email Provider', protocol: 'IMAP or MS Graph' },
  'step-26a': { system: 'Email (IMAP/MS Graph)', actor: 'AQE → Email Provider', protocol: 'IMAP or MS Graph' },
  'step-31a': { system: 'Email (IMAP/MS Graph)', actor: 'AQE → Email Provider', protocol: 'IMAP or MS Graph' },
  'step-20a': { system: 'PDF extractor', actor: 'AQE → PDF Parser', protocol: 'pdf-parse library' },
  'step-32': { system: 'PDF extractor', actor: 'AQE → PDF Parser', protocol: 'pdf-parse library' },
  'step-17a': { system: 'Browser (Playwright)', actor: 'AQE → Playwright Browser', protocol: 'Browser automation' },
  'step-18a': { system: 'Browser (Playwright)', actor: 'AQE → Playwright Browser', protocol: 'Browser automation' },
};

/** Stage-level metadata: what the action phase does. */
interface StageMeta {
  actionActor: string;
  actionSystem: string;
  actionProtocol: string;
  actionDescription: string;
  pollDescription: string;
}

const STAGE_META: Record<string, StageMeta> = {
  'create-order': {
    actionActor: 'AQE → XAPI Client (Playwright → Sterling JSP)',
    actionSystem: 'Sterling OMS (JSP)',
    actionProtocol: 'HTTP POST with XML body via yantrahttpapitester.jsp',
    actionDescription: 'XAPI 4-step order creation: adidasWE_CreateOrderSync → changeOrder (ShipNode) → changeOrder (ResolveHold) → adidasWE_CheckAdyenAsyncResponseSvc',
    pollDescription: 'getOrderDetails — polled until OrderNo + Status present',
  },
  'wait-for-release': {
    actionActor: 'AQE → XAPI Client (Playwright → Sterling JSP)',
    actionSystem: 'Sterling OMS (JSP)',
    actionProtocol: 'HTTP POST with XML body via yantrahttpapitester.jsp',
    actionDescription: 'XAPI schedule + release: scheduleOrder → releaseOrder',
    pollDescription: 'getOrderDetails — polled until Status >= 3200 (Released). Also fetched payment, total, shipNode via getOrderReleaseList.',
  },
  'confirm-shipment': {
    actionActor: 'AQE → XAPI Client (Playwright → Sterling JSP)',
    actionSystem: 'Sterling OMS (JSP)',
    actionProtocol: 'HTTP POST with XML body via yantrahttpapitester.jsp',
    actionDescription: 'XAPI ship + confirm: adidasWE_ProcessSHPConfirmation → adidas_UpdateSOAcknowledgmentSvc. AutoPOC enrichment attempted for dynamic values.',
    pollDescription: 'getOrderDetails + getShipmentListForOrder — polled until MaxOrderStatus >= 3350 and shipments exist.',
  },
  'delivery': {
    actionActor: 'AQE → XAPI Client (Playwright → Sterling JSP)',
    actionSystem: 'Sterling OMS (JSP)',
    actionProtocol: 'HTTP POST with XML body via yantrahttpapitester.jsp',
    actionDescription: 'XAPI deliver + return POD events. If order already delivered (status >= 3700), action is skipped.',
    pollDescription: 'getOrderDetails — confirmed MaxOrderStatus >= 3700.',
  },
  'forward-invoice': {
    actionActor: 'AQE → Sterling REST API',
    actionSystem: 'Sterling OMS',
    actionProtocol: 'POST /invoke/getOrderInvoiceList',
    actionDescription: 'Poll for forward invoice generation. AutoPOC InvoiceStatus assertion via XAPI.',
    pollDescription: 'getOrderInvoiceList — polled until forward invoice (InvoiceType != CREDIT_MEMO) exists.',
  },
  'forward-comms': {
    actionActor: 'N/A (verify-only stage)',
    actionSystem: 'N/A',
    actionProtocol: 'N/A',
    actionDescription: 'No action — email/PDF verification only.',
    pollDescription: 'N/A',
  },
  'create-return': {
    actionActor: 'AQE → XAPI Client (Playwright → Sterling JSP)',
    actionSystem: 'Sterling OMS (JSP)',
    actionProtocol: 'HTTP POST with XML body via yantrahttpapitester.jsp',
    actionDescription: 'XAPI create return: adidasWE_CreateReturnFromSSRSvc on forward order.',
    pollDescription: 'getOrderDetails — confirmed forward order status >= 3700 and return exists.',
  },
  'return-delivery': {
    actionActor: 'AQE → XAPI Client (Playwright → Sterling JSP)',
    actionSystem: 'Sterling OMS (JSP)',
    actionProtocol: 'HTTP POST with XML body via yantrahttpapitester.jsp',
    actionDescription: 'XAPI return delivery lifecycle: return picked up → in transit → delivered → complete.',
    pollDescription: 'getOrderDetails — polled for return completion status.',
  },
  'return-comms': {
    actionActor: 'N/A (verify-only stage)',
    actionSystem: 'N/A',
    actionProtocol: 'N/A',
    actionDescription: 'No action — email/PDF/browser verification only.',
    pollDescription: 'N/A',
  },
};

/** Step names mapped by step ID for the breakdown. */
const STEP_NAMES: Record<string, string> = {
  'step-01': 'Retrieve and validate order',
  'step-02': 'Order status progresses to Released',
  'step-03': 'IIB: ShipmentRequest to WMS',
  'step-04': 'IIB: WMS Ship Confirmation',
  'step-05': 'IIB: AFS Sales Order Creation',
  'step-06': 'IIB: NShift Label Request/Response',
  'step-07': 'IIB: AFS Sales Order Acknowledgment',
  'step-08': 'Shipment created with tracking',
  'step-09': 'NShift: Carrier tracking details',
  'step-10': 'POD: In-Transit carrier event',
  'step-10a': 'IIB: Kafka POD Events',
  'step-11': 'POD: Delivered carrier event',
  'step-12': 'Forward invoice generated',
  'step-12a': 'Financial reconciliation (forward)',
  'step-03a': 'Email: Order confirmation',
  'step-07a': 'PDF: Forward shipping label',
  'step-14a': 'Email: Out for delivery notification',
  'step-16a': 'Email: Order delivered notification',
  'step-15': 'Return order created',
  'step-16': 'IIB: Return Authorization',
  'step-24': 'Return tracking via POD notes',
  'step-25': 'Credit note generated',
  'step-26': 'Financial reconciliation (return)',
  'step-21a': 'Email: Return created notification',
  'step-26a': 'Email: Return pickup notification',
  'step-31a': 'Email: Refund confirmation',
  'step-20a': 'PDF: Return shipping label',
  'step-32': 'PDF: Credit note (Nota de Credito)',
  'step-17a': 'Browser: Return initiation page',
  'step-18a': 'Browser: Return confirmation page',
};

export interface FullBreakdownConfig {
  enterpriseCode: string;
  host: string;
  layers: string;
  xapiEnabled: boolean;
  mode: 'create' | 'validate';
}

/**
 * Generate a comprehensive narrative breakdown of a TC01 run.
 *
 * Produces a document matching the format of tc01-full-breakdown-2026-03-02.md:
 *   - Per-stage sections with action/poll/verify detail
 *   - Per-step verification tables with individual check results
 *   - Self-healing operations with step-by-step recovery narrative
 *   - Summary by system, by actor, by layer
 *   - Recurring failures with Sterling field mapping
 *   - Action items derived from failures
 */
export async function generateFullBreakdown(
  result: RunResult,
  orderId: string,
  config: FullBreakdownConfig,
  healingOutcomes: HealingOutcome[],
  recurringFailures: RecurringFailure[],
  outputDir?: string,
): Promise<string> {
  const L: string[] = [];
  const ts = new Date().toISOString();
  const dateStr = ts.slice(0, 10);
  const timeRange = `${ts.slice(11, 16)} UTC`;
  const envLabel = config.host.includes('acc.') ? 'UAT' : (config.host.includes('sit.') ? 'SIT' : 'Production');

  // =========================================================================
  // Header
  // =========================================================================
  L.push(`# TC_01 Full Test Breakdown — ${orderId}`);
  L.push(`**Date**: ${dateStr} ${timeRange} | **Order**: ${orderId} | **Enterprise**: ${config.enterpriseCode}`);
  L.push(`**Environment**: ${envLabel} (\`${config.host.replace('https://', '').replace('/smcfs/restapi', '')}\`)`);
  L.push('');

  L.push(`| Field | Value |`);
  L.push(`|-------|-------|`);
  L.push(`| Mode | ${config.mode === 'create' ? 'New order creation via XAPI' : 'Existing order validation'} |`);
  L.push(`| Layers | ${config.layers} |`);
  L.push(`| Stages | ${result.stages.length} (${result.passed} pass, ${result.failed} fail, ${result.skipped} skip) |`);
  L.push(`| Result | ${result.overallSuccess ? 'PASS' : 'FAIL'} |`);
  L.push(`| Duration | ${(result.totalDurationMs / 1000).toFixed(1)}s |`);
  L.push(`| XAPI | ${config.xapiEnabled ? 'enabled' : 'disabled'} |`);
  L.push(`| Self-healing | ${healingOutcomes.length > 0 ? `${healingOutcomes.length} intervention(s)` : 'none triggered'} |`);
  L.push('');
  L.push('---');
  L.push('');

  // =========================================================================
  // Per-stage breakdown
  // =========================================================================
  let globalCheckNum = 0;
  for (let si = 0; si < result.stages.length; si++) {
    const stage = result.stages[si];
    const sm = STAGE_META[stage.stageId];
    const isSkipped = stage.overallSuccess && stage.verification.skipped > 0
      && stage.verification.passed === 0 && stage.verification.failed === 0;

    const stageStatus = isSkipped ? 'SKIPPED' : (stage.overallSuccess ? 'PASS' : 'FAIL');
    L.push(`## Stage ${si + 1}: ${stage.stageName} (\`${stage.stageId}\`) — ${stageStatus} (${(stage.durationMs / 1000).toFixed(1)}s)`);
    L.push('');

    // --- Action phase ---
    if (stage.action.data?.actionStatus === 'skipped') {
      const reason = String(stage.action.data?.reason ?? 'No action defined');
      L.push('### Action');
      L.push(`| Phase | Performed By | System | What Happened |`);
      L.push(`|---|---|---|---|`);
      L.push(`| ACT | ${sm?.actionActor ?? 'AQE'} | ${sm?.actionSystem ?? '-'} | Skipped: ${reason} |`);
      L.push('');
    } else if (stage.action.error) {
      L.push('### Action — FAILED');
      L.push(`**Error**: ${stage.action.error}`);
      L.push('');
    } else if (sm && stage.action.data?.actionStatus !== 'skipped') {
      L.push('### Action');
      L.push(`| Phase | Performed By | System | What Happened |`);
      L.push(`|---|---|---|---|`);
      L.push(`| ACT | ${sm.actionActor} | ${sm.actionSystem} | ${sm.actionDescription} |`);
      if (sm.pollDescription !== 'N/A') {
        L.push(`| POLL | AQE → Sterling REST | Sterling OMS | ${sm.pollDescription} |`);
      }
      L.push('');
      if (stage.action.durationMs > 0) {
        L.push(`**Action duration**: ${(stage.action.durationMs / 1000).toFixed(1)}s`);
        L.push('');
      }
    }

    // --- Poll phase (if separate from action) ---
    if (stage.poll.error) {
      L.push(`### Poll — FAILED`);
      L.push(`**Error**: ${stage.poll.error}`);
      L.push('');
    }

    // --- Self-healing for this stage ---
    const stageHealing = healingOutcomes.filter(h => h.stageId === stage.stageId);
    if (stageHealing.length > 0) {
      L.push('### Self-Healing');
      L.push('');
      L.push('| # | Phase | What Happened | Duration | Result |');
      L.push('|---|---|---|---|---|');
      for (let hi = 0; hi < stageHealing.length; hi++) {
        const h = stageHealing[hi];
        const dur = h.durationMs ? `${(h.durationMs / 1000).toFixed(1)}s` : '-';
        const playbook = h.playbookName ?? h.patternMatched ?? 'agentic-healer';
        const resultStr = h.success ? 'SUCCESS' : 'continue';
        const detail = h.errorSummary
          ? `${playbook}: ${h.errorSummary.slice(0, 100)}`
          : `${playbook}: recovery attempt`;
        L.push(`| ${hi + 1} | HEAL | ${detail} | ${dur} | ${resultStr} → ${h.decision} |`);
      }
      L.push('');
    }

    // --- Verification ---
    const executedSteps = stage.verification.steps.filter(s => {
      const isStepSkipped = s.result.success && (s.result.data as Record<string, unknown>)?.skipped === true;
      return !isStepSkipped;
    });
    const skippedSteps = stage.verification.steps.filter(s => {
      return s.result.success && (s.result.data as Record<string, unknown>)?.skipped === true;
    });

    if (isSkipped) {
      L.push(`### Verification: ${stage.verification.steps.length} steps, all SKIPPED`);
      L.push('');
      for (const step of skippedSteps) {
        const stepName = STEP_NAMES[step.stepId] ?? step.stepId;
        const meta = STEP_META[step.stepId];
        const skipReason = String((step.result.data as Record<string, string>)?.skipReason ?? 'L2/L3 auto-skip');
        L.push(`#### ${step.stepId} — SKIPPED — ${stepName}`);
        if (meta) {
          L.push(`Would query: **${meta.system}**${meta.iibFlow ? ` (${meta.iibFlow})` : ''} | ${skipReason}`);
        } else {
          L.push(`${skipReason}`);
        }
        L.push('');
      }
    } else {
      const passCount = stage.verification.passed;
      const failCount = stage.verification.failed;
      const skipCount = stage.verification.skipped;
      const verifyParts = [`${passCount} PASS`, `${failCount} FAIL`];
      if (skipCount > 0) verifyParts.push(`${skipCount} SKIP`);
      L.push(`### Verification: ${stage.verification.steps.length} steps, ${verifyParts.join(' / ')}`);
      L.push('');

      // Per-step detail
      for (const step of stage.verification.steps) {
        const stepName = STEP_NAMES[step.stepId] ?? step.stepId;
        const meta = STEP_META[step.stepId];
        const isStepSkipped = step.result.success && (step.result.data as Record<string, unknown>)?.skipped === true;

        if (isStepSkipped) {
          const skipReason = String((step.result.data as Record<string, string>)?.skipReason ?? 'L2/L3 auto-skip');
          L.push(`#### ${step.stepId} — SKIPPED — ${stepName}`);
          if (meta) {
            L.push(`Would query: **${meta.system}**${meta.iibFlow ? ` (${meta.iibFlow})` : ''} | ${skipReason}`);
          } else {
            L.push(`${skipReason}`);
          }
          L.push('');
          continue;
        }

        const checks = step.result.checks ?? [];
        const stepPass = checks.length > 0 ? checks.every(c => c.passed) : step.result.success;
        const stepStatus = stepPass ? 'PASS' : 'FAIL';
        const dur = step.result.durationMs > 0 ? ` (${step.result.durationMs}ms)` : '';

        L.push(`#### ${step.stepId} — ${stepStatus}${dur} — ${stepName}`);
        if (meta) {
          L.push(`Performed by: **${meta.actor}**`);
          L.push(`System queried: **${meta.system}**`);
          if (meta.iibFlow) {
            L.push(`Flow: \`${meta.iibFlow}\``);
          }
        }
        L.push('');

        if (step.result.error && checks.length === 0) {
          L.push(`**Error**: ${step.result.error}`);
          L.push('');
          continue;
        }

        if (checks.length > 0) {
          const hasFailures = checks.some(c => !c.passed);
          L.push(`| # | Check | Result | Expected | Actual |${hasFailures ? ' Failure Reason |' : ''}`);
          L.push(`|---|---|---|---|---|${hasFailures ? '---|' : ''}`);
          for (const c of checks) {
            globalCheckNum++;
            const res = c.passed ? 'PASS' : '**FAIL**';
            const failReason = !c.passed ? (STERLING_FIELD_MAP[c.name] ? `Output template missing ${STERLING_FIELD_MAP[c.name]}` : '') : '';
            if (hasFailures) {
              L.push(`| ${globalCheckNum} | ${c.name} | ${res} | ${c.expected} | ${c.actual} | ${failReason} |`);
            } else {
              L.push(`| ${globalCheckNum} | ${c.name} | ${res} | ${c.expected} | ${c.actual} |`);
            }
          }
          L.push('');
        }
      }
    }

    L.push('---');
    L.push('');
  }

  // =========================================================================
  // Self-Healing Operations Summary
  // =========================================================================
  if (healingOutcomes.length > 0) {
    L.push('# Self-Healing Operations');
    L.push('');
    L.push('| # | Stage | Trigger | Playbook/Pattern | Result | Duration |');
    L.push('|---|---|---|---|---|---|');
    for (let i = 0; i < healingOutcomes.length; i++) {
      const h = healingOutcomes[i];
      const dur = h.durationMs ? `${(h.durationMs / 1000).toFixed(1)}s` : '-';
      const trigger = h.errorSummary?.slice(0, 60) ?? 'stage failure';
      const playbook = h.playbookName ?? h.patternMatched ?? 'agentic-healer';
      const res = h.success ? `SUCCESS → ${h.decision}` : `${h.decision}`;
      L.push(`| ${i + 1} | ${h.stageId} | ${trigger} | ${playbook} | ${res} | ${dur} |`);
    }
    L.push('');
    L.push('---');
    L.push('');
  }

  // =========================================================================
  // Summary by System
  // =========================================================================
  L.push('# Summary');
  L.push('');

  // Count checks by system
  const systemChecks: Record<string, { total: number; pass: number; fail: number }> = {};
  for (const stage of result.stages) {
    for (const step of stage.verification.steps) {
      const isStepSkipped = step.result.success && (step.result.data as Record<string, unknown>)?.skipped === true;
      if (isStepSkipped) continue;
      const meta = STEP_META[step.stepId];
      const system = meta?.system ?? 'Unknown';
      if (!systemChecks[system]) systemChecks[system] = { total: 0, pass: 0, fail: 0 };
      for (const c of step.result.checks ?? []) {
        systemChecks[system].total++;
        if (c.passed) systemChecks[system].pass++;
        else systemChecks[system].fail++;
      }
    }
  }

  L.push('### By System');
  L.push('');
  L.push('| System | Checks | Pass | Fail |');
  L.push('|---|---|---|---|');
  let totalC = 0, totalP = 0, totalF = 0;
  for (const [system, counts] of Object.entries(systemChecks)) {
    L.push(`| ${system} | ${counts.total} | ${counts.pass} | ${counts.fail} |`);
    totalC += counts.total; totalP += counts.pass; totalF += counts.fail;
  }
  L.push(`| **TOTAL** | **${totalC}** | **${totalP}** | **${totalF}** |`);
  L.push('');

  // Summary by Actor
  L.push('### By Actor');
  L.push('');
  L.push('| Actor | Role | What It Did |');
  L.push('|---|---|---|');
  L.push('| **AQE Action Orchestrator** | Driver | Sequenced ' + result.stages.length + ' lifecycle stages: ACT → POLL → VERIFY |');
  L.push(`| **AQE → Sterling REST** | Reader | ${totalC} verification checks via getOrderDetails, getShipmentListForOrder, getOrderInvoiceList, getOrderReleaseList |`);
  if (config.xapiEnabled) {
    L.push(`| **AQE → XAPI (Playwright)** | Writer | Order creation, schedule/release, ship, deliver, return — all via Sterling JSP |`);
  }
  if (healingOutcomes.length > 0) {
    const successCount = healingOutcomes.filter(h => h.success).length;
    L.push(`| **AQE Healing Handler** | Self-Healer | ${healingOutcomes.length} intervention(s), ${successCount} successful recovery |`);
  }
  L.push('');

  // Summary by Layer
  const l1Checks = { total: 0, pass: 0, fail: 0 };
  const l2Checks = { total: 0, pass: 0, fail: 0 };
  const l3Checks = { total: 0, pass: 0, fail: 0 };
  const l2StepIds = new Set(['step-03', 'step-04', 'step-05', 'step-06', 'step-07', 'step-10a', 'step-16']);
  const l3StepIds = new Set(['step-09', 'step-03a', 'step-07a', 'step-14a', 'step-16a', 'step-21a', 'step-26a', 'step-31a', 'step-20a', 'step-32', 'step-17a', 'step-18a']);

  for (const stage of result.stages) {
    for (const step of stage.verification.steps) {
      const isStepSkipped = step.result.success && (step.result.data as Record<string, unknown>)?.skipped === true;
      if (isStepSkipped) continue;
      const bucket = l2StepIds.has(step.stepId) ? l2Checks : (l3StepIds.has(step.stepId) ? l3Checks : l1Checks);
      for (const c of step.result.checks ?? []) {
        bucket.total++;
        if (c.passed) bucket.pass++;
        else bucket.fail++;
      }
    }
  }

  L.push('### By Layer');
  L.push('');
  L.push('| Layer | Description | Checks | Pass | Fail |');
  L.push('|---|---|---|---|---|');
  L.push(`| **L1** | Sterling OMS (REST + XAPI) | ${l1Checks.total} | ${l1Checks.pass} | ${l1Checks.fail} |`);
  L.push(`| **L2** | IIB Message Flows (EPOCH GraphQL) | ${l2Checks.total} | ${l2Checks.pass} | ${l2Checks.fail}${l2Checks.total === 0 ? ' (skipped)' : ''} |`);
  L.push(`| **L3** | NShift / Email / PDF / Browser | ${l3Checks.total} | ${l3Checks.pass} | ${l3Checks.fail}${l3Checks.total === 0 ? ' (skipped)' : ''} |`);
  L.push('');
  L.push('---');
  L.push('');

  // =========================================================================
  // Recurring Failures
  // =========================================================================
  if (recurringFailures.length > 0) {
    L.push('# Recurring Failures (Cross-Run)');
    L.push('');
    L.push('These checks fail consistently across multiple runs. Most are Sterling output template gaps, not code bugs.');
    L.push('');
    L.push('| Check | Fail Rate | Runs Failed | Sterling Field | Root Cause |');
    L.push('|---|---|---|---|---|');
    for (const rf of recurringFailures) {
      const rate = `${(rf.failRate * 100).toFixed(0)}%`;
      const field = rf.sterlingField ?? '(unmapped)';
      const rootCause = rf.sterlingField
        ? `Output template missing \`${rf.sterlingField}\``
        : 'See stage notes';
      L.push(`| ${rf.checkName} | ${rate} | ${rf.failedInRuns}/${rf.totalRuns} | ${field} | ${rootCause} |`);
    }
    L.push('');
    L.push('---');
    L.push('');
  }

  // =========================================================================
  // Action Items
  // =========================================================================
  const failedFieldChecks = recurringFailures.filter(rf => rf.sterlingField);
  const otherFailures = recurringFailures.filter(rf => !rf.sterlingField);

  L.push('# Action Items');
  L.push('');

  if (failedFieldChecks.length > 0) {
    L.push('### P1: Sterling Output Template Gaps');
    L.push('');
    const fieldGroups = new Map<string, string[]>();
    for (const rf of failedFieldChecks) {
      const api = rf.sterlingField!.includes('Invoice') ? 'getOrderInvoiceList'
        : (rf.sterlingField!.includes('Shipment') || rf.sterlingField!.includes('Tracking')) ? 'getShipmentListForOrder'
        : 'getOrderDetails';
      if (!fieldGroups.has(api)) fieldGroups.set(api, []);
      fieldGroups.get(api)!.push(rf.sterlingField!);
    }
    let itemNum = 1;
    fieldGroups.forEach((fields, api) => {
      L.push(`${itemNum}. **Update \`${api}\` output template** — Include: ${fields.join(', ')}`);
      itemNum++;
    });
    L.push('');
  }

  if (otherFailures.length > 0) {
    L.push('### P2: Other Recurring Issues');
    L.push('');
    let itemNum = 1;
    for (const rf of otherFailures) {
      L.push(`${itemNum}. **${rf.checkName}** — Failing ${(rf.failRate * 100).toFixed(0)}% (stage: ${rf.stageId})`);
      itemNum++;
    }
    L.push('');
  }

  if (healingOutcomes.some(h => h.success)) {
    L.push('### Self-Healing Active');
    L.push('');
    for (const h of healingOutcomes.filter(ho => ho.success)) {
      const playbook = h.playbookName ?? h.patternMatched ?? 'agentic-healer';
      const dur = h.durationMs ? `${(h.durationMs / 1000).toFixed(1)}s` : 'N/A';
      L.push(`- **${h.stageId}**: Recovered via \`${playbook}\` (${dur}). This stage passes with self-healing but indicates an upstream timing issue.`);
    }
    L.push('');
  }

  L.push('---');
  L.push('');
  L.push(`*Auto-generated by AQE v3 — ${ts}*`);
  L.push('');

  // Write to file
  const dir = outputDir ?? path.join(process.cwd(), 'tests', 'reports');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filename = `tc01-full-breakdown-${dateStr}.md`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, L.join('\n'), 'utf8');

  return filePath;
}
