/**
 * TDD Phase Validator - Runtime enforcement for TDD subagent coordination
 *
 * Validates that each phase of the TDD cycle produces correct output
 * in the memory store before allowing transition to next phase.
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';

export interface TDDValidationResult {
  valid: boolean;
  phase: 'RED' | 'GREEN' | 'REFACTOR';
  cycleId: string;
  errors: string[];
  warnings: string[];
  metrics: {
    memoryKeyExists: boolean;
    outputSchemaValid: boolean;
    handoffReady: boolean;
    fileIntegrityValid: boolean;
  };
}

export interface REDPhaseOutput {
  cycleId: string;
  phase: 'RED';
  testFile: { path: string; content: string; hash: string; };
  validation: { allTestsFailing: boolean; failureCount: number; };
  readyForHandoff: boolean;
}

export interface GREENPhaseOutput {
  cycleId: string;
  phase: 'GREEN';
  testFile: { path: string; hash: string; };
  implFile: { path: string; content: string; hash: string; };
  validation: { allTestsPassing: boolean; passCount: number; coverage: number; };
  readyForHandoff: boolean;
}

export interface REFACTORPhaseOutput {
  cycleId: string;
  phase: 'REFACTOR';
  testFile: { path: string; hash: string; };
  implFile: { path: string; content: string; hash: string; originalHash: string; };
  validation: { allTestsPassing: boolean; coverage: number; };
  readyForReview: boolean;
}

export interface MemoryClient {
  retrieve(key: string, options?: { partition?: string }): Promise<any>;
}

export class TDDPhaseValidator {
  constructor(private memoryClient: MemoryClient) {}

  /**
   * Validate RED phase output before transitioning to GREEN
   */
  async validateREDPhase(cycleId: string): Promise<TDDValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metrics = {
      memoryKeyExists: false,
      outputSchemaValid: false,
      handoffReady: false,
      fileIntegrityValid: false
    };

    // 1. Check memory key exists
    const memoryKey = `aqe/tdd/cycle-${cycleId}/red/tests`;
    let output: REDPhaseOutput | null = null;

    try {
      output = await this.memoryClient.retrieve(memoryKey, { partition: 'coordination' });
      metrics.memoryKeyExists = !!output;
    } catch (e) {
      errors.push(`Failed to retrieve RED phase output from ${memoryKey}: ${e}`);
    }

    if (!output) {
      errors.push(`RED phase output not found at ${memoryKey}`);
      return { valid: false, phase: 'RED', cycleId, errors, warnings, metrics };
    }

    // 2. Validate schema
    if (!output.cycleId || output.cycleId !== cycleId) {
      errors.push(`Cycle ID mismatch: expected ${cycleId}, got ${output.cycleId}`);
    } else if (!output.testFile?.path || !output.testFile?.hash) {
      errors.push('Missing testFile.path or testFile.hash in RED output');
    } else if (!output.validation || typeof output.validation.allTestsFailing !== 'boolean') {
      errors.push('Missing or invalid validation.allTestsFailing in RED output');
    } else {
      metrics.outputSchemaValid = true;
    }

    // 3. Validate tests are failing (RED phase requirement)
    if (output.validation && !output.validation.allTestsFailing) {
      errors.push('RED phase violation: Tests must fail initially. Found passing tests.');
    }

    // 4. Check handoff readiness
    if (!output.readyForHandoff) {
      errors.push('RED phase not ready for handoff');
    } else {
      metrics.handoffReady = true;
    }

    // 5. Validate file integrity
    if (output.testFile?.path && output.testFile?.hash) {
      const fileValid = await this.validateFileHash(output.testFile.path, output.testFile.hash);
      metrics.fileIntegrityValid = fileValid;
      if (!fileValid) {
        errors.push(`Test file hash mismatch for ${output.testFile.path}`);
      }
    }

    return {
      valid: errors.length === 0,
      phase: 'RED',
      cycleId,
      errors,
      warnings,
      metrics
    };
  }

  /**
   * Validate GREEN phase output before transitioning to REFACTOR
   */
  async validateGREENPhase(cycleId: string): Promise<TDDValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metrics = {
      memoryKeyExists: false,
      outputSchemaValid: false,
      handoffReady: false,
      fileIntegrityValid: false
    };

    // 1. Check memory key exists
    const memoryKey = `aqe/tdd/cycle-${cycleId}/green/impl`;
    let output: GREENPhaseOutput | null = null;

    try {
      output = await this.memoryClient.retrieve(memoryKey, { partition: 'coordination' });
      metrics.memoryKeyExists = !!output;
    } catch (e) {
      errors.push(`Failed to retrieve GREEN phase output from ${memoryKey}: ${e}`);
    }

    if (!output) {
      errors.push(`GREEN phase output not found at ${memoryKey}`);
      return { valid: false, phase: 'GREEN', cycleId, errors, warnings, metrics };
    }

    // 2. Validate schema
    if (!output.cycleId || output.cycleId !== cycleId) {
      errors.push(`Cycle ID mismatch: expected ${cycleId}, got ${output.cycleId}`);
    } else if (!output.implFile?.path || !output.implFile?.hash) {
      errors.push('Missing implFile.path or implFile.hash in GREEN output');
    } else if (!output.validation || typeof output.validation.allTestsPassing !== 'boolean') {
      errors.push('Missing or invalid validation.allTestsPassing in GREEN output');
    } else {
      metrics.outputSchemaValid = true;
    }

    // 3. Validate tests are passing (GREEN phase requirement)
    if (output.validation && !output.validation.allTestsPassing) {
      errors.push('GREEN phase violation: All tests must pass.');
    }

    // 4. Validate test file hash matches RED phase
    try {
      const redOutput = await this.memoryClient.retrieve(
        `aqe/tdd/cycle-${cycleId}/red/tests`,
        { partition: 'coordination' }
      );
      if (redOutput && output.testFile?.hash !== redOutput.testFile?.hash) {
        errors.push(`Test file was modified between RED and GREEN phases`);
      }
    } catch (e) {
      warnings.push(`Could not verify RED phase for test file integrity: ${e}`);
    }

    // 5. Check handoff readiness
    if (!output.readyForHandoff) {
      errors.push('GREEN phase not ready for handoff');
    } else {
      metrics.handoffReady = true;
    }

    // 6. Validate file integrity
    if (output.implFile?.path && output.implFile?.hash) {
      const fileValid = await this.validateFileHash(output.implFile.path, output.implFile.hash);
      metrics.fileIntegrityValid = fileValid;
      if (!fileValid) {
        errors.push(`Implementation file hash mismatch for ${output.implFile.path}`);
      }
    }

    return {
      valid: errors.length === 0,
      phase: 'GREEN',
      cycleId,
      errors,
      warnings,
      metrics
    };
  }

  /**
   * Validate REFACTOR phase output (final validation)
   */
  async validateREFACTORPhase(cycleId: string): Promise<TDDValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metrics = {
      memoryKeyExists: false,
      outputSchemaValid: false,
      handoffReady: false,
      fileIntegrityValid: false
    };

    // 1. Check memory key exists
    const memoryKey = `aqe/tdd/cycle-${cycleId}/refactor/result`;
    let output: REFACTORPhaseOutput | null = null;

    try {
      output = await this.memoryClient.retrieve(memoryKey, { partition: 'coordination' });
      metrics.memoryKeyExists = !!output;
    } catch (e) {
      errors.push(`Failed to retrieve REFACTOR phase output from ${memoryKey}: ${e}`);
    }

    if (!output) {
      errors.push(`REFACTOR phase output not found at ${memoryKey}`);
      return { valid: false, phase: 'REFACTOR', cycleId, errors, warnings, metrics };
    }

    // 2. Validate schema
    if (!output.cycleId || output.cycleId !== cycleId) {
      errors.push(`Cycle ID mismatch: expected ${cycleId}, got ${output.cycleId}`);
    } else if (!output.implFile?.path || !output.implFile?.hash) {
      errors.push('Missing implFile.path or implFile.hash in REFACTOR output');
    } else {
      metrics.outputSchemaValid = true;
    }

    // 3. Validate tests still passing after refactor
    if (output.validation && !output.validation.allTestsPassing) {
      errors.push('REFACTOR phase violation: Tests must still pass after refactoring.');
    }

    // 4. Validate test file hash unchanged throughout cycle
    try {
      const redOutput = await this.memoryClient.retrieve(
        `aqe/tdd/cycle-${cycleId}/red/tests`,
        { partition: 'coordination' }
      );
      if (redOutput && output.testFile?.hash !== redOutput.testFile?.hash) {
        errors.push(`Test file was modified during TDD cycle - integrity violation`);
      }
    } catch (e) {
      warnings.push(`Could not verify RED phase for test file integrity: ${e}`);
    }

    // 5. Check review readiness
    if (!output.readyForReview) {
      warnings.push('REFACTOR phase not marked ready for review');
    } else {
      metrics.handoffReady = true;
    }

    // 6. Validate coverage didn't decrease
    try {
      const greenOutput = await this.memoryClient.retrieve(
        `aqe/tdd/cycle-${cycleId}/green/impl`,
        { partition: 'coordination' }
      );
      if (greenOutput && output.validation?.coverage < greenOutput.validation?.coverage) {
        warnings.push(`Coverage decreased from ${greenOutput.validation.coverage}% to ${output.validation.coverage}%`);
      }
    } catch (e) {
      warnings.push(`Could not verify GREEN phase for coverage comparison: ${e}`);
    }

    // 7. Validate file integrity
    if (output.implFile?.path && output.implFile?.hash) {
      const fileValid = await this.validateFileHash(output.implFile.path, output.implFile.hash);
      metrics.fileIntegrityValid = fileValid;
      if (!fileValid) {
        errors.push(`Implementation file hash mismatch for ${output.implFile.path}`);
      }
    }

    return {
      valid: errors.length === 0,
      phase: 'REFACTOR',
      cycleId,
      errors,
      warnings,
      metrics
    };
  }

  /**
   * Validate complete TDD cycle
   */
  async validateCompleteCycle(cycleId: string): Promise<{
    valid: boolean;
    phases: TDDValidationResult[];
    summary: string;
  }> {
    const redResult = await this.validateREDPhase(cycleId);
    const greenResult = await this.validateGREENPhase(cycleId);
    const refactorResult = await this.validateREFACTORPhase(cycleId);

    const allValid = redResult.valid && greenResult.valid && refactorResult.valid;
    const totalErrors = redResult.errors.length + greenResult.errors.length + refactorResult.errors.length;

    return {
      valid: allValid,
      phases: [redResult, greenResult, refactorResult],
      summary: allValid
        ? `TDD cycle ${cycleId} completed successfully with full coordination`
        : `TDD cycle ${cycleId} has ${totalErrors} validation errors`
    };
  }

  /**
   * Calculate SHA256 hash of a file
   */
  static calculateFileHash(filePath: string): string {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const content = readFileSync(filePath, 'utf-8');
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Validate file hash matches expected
   */
  private async validateFileHash(filePath: string, expectedHash: string): Promise<boolean> {
    try {
      const actualHash = TDDPhaseValidator.calculateFileHash(filePath);
      return actualHash === expectedHash;
    } catch {
      return false;
    }
  }
}

// Export for use in hooks system
export default TDDPhaseValidator;
