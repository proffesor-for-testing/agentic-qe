/**
 * Agentic QE v3 - Segregation of Duties (SoD) Analysis Service
 * Analyzes role-function conflicts, checks authorization objects,
 * and provides compliance recommendations.
 *
 * ADR-063: Enterprise Integration Testing Gap Closure
 */

import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type {
  SodRuleset,
  SodRule,
  SapFunction,
  AuthorizationObject,
  AuthorizationField,
  SodAnalysisResult,
  SodConflict,
} from '../interfaces.js';

/**
 * Configuration for the SoD analysis service
 */
export interface SodAnalysisServiceConfig {
  /** Weight multiplier for critical risk conflicts */
  criticalRiskWeight: number;
  /** Weight multiplier for high risk conflicts */
  highRiskWeight: number;
  /** Weight multiplier for medium risk conflicts */
  mediumRiskWeight: number;
  /** Weight multiplier for low risk conflicts */
  lowRiskWeight: number;
  /** Maximum risk score threshold (above = non-compliant) */
  complianceThreshold: number;
  /** Include mitigated conflicts in risk score */
  countMitigatedInRiskScore: boolean;
  /** Enable detailed authorization object analysis */
  deepAuthorizationAnalysis: boolean;
}

const DEFAULT_CONFIG: SodAnalysisServiceConfig = {
  criticalRiskWeight: 10,
  highRiskWeight: 5,
  mediumRiskWeight: 2,
  lowRiskWeight: 1,
  complianceThreshold: 20,
  countMitigatedInRiskScore: false,
  deepAuthorizationAnalysis: true,
};

/** User role assignment for SoD analysis */
export interface UserRoleAssignment {
  readonly userId: string;
  readonly roles: UserRole[];
}

/** A role with its assigned functions */
export interface UserRole {
  readonly name: string;
  readonly functions: AssignedFunction[];
}

/** A function assigned to a user through a role */
export interface AssignedFunction {
  readonly name: string;
  readonly transactions: string[];
  readonly authorizationObjects: AuthorizationObject[];
}

/**
 * SoD Analysis Service
 * Provides segregation of duties conflict detection, risk scoring, and compliance checking
 */
export class SodAnalysisService {
  private readonly config: SodAnalysisServiceConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<SodAnalysisServiceConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // SoD Analysis
  // ============================================================================

  /**
   * Analyze a user's role assignments against a SoD ruleset.
   * Detects conflicts, calculates risk score, and provides recommendations.
   */
  async analyzeSod(
    userId: string,
    ruleset: SodRuleset,
    userAssignment: UserRoleAssignment
  ): Promise<Result<SodAnalysisResult>> {
    try {
      if (!userId || userId.trim() === '') {
        return err(new Error('User ID is required'));
      }

      // Validate the ruleset
      const rulesetErrors = this.validateRuleset(ruleset);
      if (rulesetErrors.length > 0) {
        return err(new Error(
          `Invalid SoD ruleset: ${rulesetErrors.join('; ')}`
        ));
      }

      // Build user's function map (all functions assigned via roles)
      const userFunctions = this.buildUserFunctionMap(userAssignment);

      // Check each SoD rule against the user's functions
      const conflicts: SodConflict[] = [];
      for (const rule of ruleset.rules) {
        const conflict = this.checkRule(rule, userFunctions);
        if (conflict) {
          conflicts.push(conflict);
        }
      }

      // Calculate risk score
      const riskScore = this.calculateRiskScore(conflicts);

      // Determine compliance
      const compliant = riskScore <= this.config.complianceThreshold;

      // Generate recommendations
      const recommendations = this.generateRecommendations(conflicts, userAssignment);

      const result: SodAnalysisResult = {
        userId,
        conflicts,
        riskScore,
        compliant,
        recommendations,
      };

      // Store analysis result for audit trail
      await this.memory.set(
        `enterprise-integration:sod:${userId}:${Date.now()}`,
        {
          userId,
          rulesetName: ruleset.name,
          rulesetScope: ruleset.scope,
          conflictCount: conflicts.length,
          riskScore,
          compliant,
          criticalConflicts: conflicts.filter(c => c.riskLevel === 'critical').length,
          highConflicts: conflicts.filter(c => c.riskLevel === 'high').length,
          mitigatedConflicts: conflicts.filter(c => c.mitigated).length,
          timestamp: new Date().toISOString(),
        },
        { namespace: 'enterprise-integration', persist: true }
      );

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Validate a SoD ruleset structure.
   */
  validateRuleset(ruleset: SodRuleset): string[] {
    const errors: string[] = [];

    if (!ruleset.name || ruleset.name.trim() === '') {
      errors.push('Ruleset name is required');
    }

    if (!ruleset.rules || ruleset.rules.length === 0) {
      errors.push('Ruleset must have at least one rule');
      return errors;
    }

    const validScopes = ['global', 'company-code', 'plant'];
    if (!validScopes.includes(ruleset.scope)) {
      errors.push(`Invalid scope '${ruleset.scope}'. Valid: ${validScopes.join(', ')}`);
    }

    // Validate individual rules
    const ruleIds = new Set<string>();
    for (const rule of ruleset.rules) {
      const ruleErrors = this.validateRule(rule);
      errors.push(...ruleErrors);

      if (ruleIds.has(rule.id)) {
        errors.push(`Duplicate rule ID '${rule.id}'`);
      }
      ruleIds.add(rule.id);
    }

    return errors;
  }

  /**
   * Validate a single SoD rule.
   */
  validateRule(rule: SodRule): string[] {
    const errors: string[] = [];

    if (!rule.id || rule.id.trim() === '') {
      errors.push('Rule ID is required');
    }

    if (!rule.name || rule.name.trim() === '') {
      errors.push(`Rule '${rule.id}' name is required`);
    }

    if (!rule.conflictingFunctions || rule.conflictingFunctions.length !== 2) {
      errors.push(`Rule '${rule.id}' must define exactly two conflicting functions`);
      return errors;
    }

    const [func1, func2] = rule.conflictingFunctions;
    const func1Errors = this.validateSapFunction(func1, `${rule.id}.function1`);
    const func2Errors = this.validateSapFunction(func2, `${rule.id}.function2`);
    errors.push(...func1Errors, ...func2Errors);

    const validRiskLevels = ['critical', 'high', 'medium', 'low'];
    if (!validRiskLevels.includes(rule.riskLevel)) {
      errors.push(`Rule '${rule.id}' has invalid risk level '${rule.riskLevel}'`);
    }

    return errors;
  }

  /**
   * Check authorization object overlap between two SAP functions.
   * Returns detailed overlap information for SoD analysis.
   */
  checkAuthorizationOverlap(
    func1: SapFunction,
    func2: SapFunction
  ): { hasOverlap: boolean; overlappingObjects: string[]; overlappingFields: string[] } {
    const overlappingObjects: string[] = [];
    const overlappingFields: string[] = [];

    for (const authObj1 of func1.authorizationObjects) {
      for (const authObj2 of func2.authorizationObjects) {
        if (authObj1.name === authObj2.name) {
          overlappingObjects.push(authObj1.name);

          // Check field-level overlap
          for (const field1 of authObj1.fields) {
            for (const field2 of authObj2.fields) {
              if (field1.name === field2.name) {
                const valueOverlap = this.checkFieldValueOverlap(field1, field2);
                if (valueOverlap) {
                  overlappingFields.push(`${authObj1.name}/${field1.name}`);
                }
              }
            }
          }
        }
      }
    }

    return {
      hasOverlap: overlappingObjects.length > 0,
      overlappingObjects: Array.from(new Set(overlappingObjects)),
      overlappingFields: Array.from(new Set(overlappingFields)),
    };
  }

  /**
   * Batch analyze multiple users against a ruleset.
   * Returns a summary with per-user results.
   */
  async batchAnalyze(
    ruleset: SodRuleset,
    assignments: UserRoleAssignment[]
  ): Promise<Result<Map<string, SodAnalysisResult>>> {
    try {
      const results = new Map<string, SodAnalysisResult>();

      for (const assignment of assignments) {
        const result = await this.analyzeSod(assignment.userId, ruleset, assignment);
        if (result.success) {
          results.set(assignment.userId, result.value);
        } else {
          // Store error result for failed analysis
          results.set(assignment.userId, {
            userId: assignment.userId,
            conflicts: [],
            riskScore: -1,
            compliant: false,
            recommendations: ['Analysis failed'],
          });
        }
      }

      return ok(results);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // Private Helper Methods - Validation
  // ============================================================================

  private validateSapFunction(func: SapFunction, context: string): string[] {
    const errors: string[] = [];

    if (!func.name || func.name.trim() === '') {
      errors.push(`${context}: function name is required`);
    }

    if (!func.transactions || func.transactions.length === 0) {
      errors.push(`${context}: at least one transaction is required`);
    } else {
      // Validate SAP transaction code format (typically 2-20 chars, uppercase)
      for (const tcode of func.transactions) {
        if (tcode.length < 2 || tcode.length > 20) {
          errors.push(
            `${context}: transaction code '${tcode}' should be 2-20 characters`
          );
        }
      }
    }

    if (!func.authorizationObjects || func.authorizationObjects.length === 0) {
      errors.push(`${context}: at least one authorization object is required`);
    } else {
      for (const authObj of func.authorizationObjects) {
        if (!authObj.name || authObj.name.trim() === '') {
          errors.push(`${context}: authorization object name is required`);
        }
        // SAP auth object names are max 10 chars
        if (authObj.name && authObj.name.length > 10) {
          errors.push(
            `${context}: authorization object '${authObj.name}' exceeds SAP maximum of 10 characters`
          );
        }
      }
    }

    return errors;
  }

  // ============================================================================
  // Private Helper Methods - Analysis
  // ============================================================================

  private buildUserFunctionMap(
    assignment: UserRoleAssignment
  ): Map<string, { role: string; transactions: string[]; authorizationObjects: AuthorizationObject[] }> {
    const functionMap = new Map<
      string,
      { role: string; transactions: string[]; authorizationObjects: AuthorizationObject[] }
    >();

    for (const role of assignment.roles) {
      for (const func of role.functions) {
        // If the same function is assigned via multiple roles, merge
        const existing = functionMap.get(func.name);
        if (existing) {
          // Merge transactions
          const mergedTcodes = new Set(existing.transactions.concat(func.transactions));
          existing.transactions = Array.from(mergedTcodes);
          // Merge authorization objects
          existing.authorizationObjects = [
            ...existing.authorizationObjects,
            ...func.authorizationObjects,
          ];
        } else {
          functionMap.set(func.name, {
            role: role.name,
            transactions: [...func.transactions],
            authorizationObjects: [...func.authorizationObjects],
          });
        }
      }
    }

    return functionMap;
  }

  private checkRule(
    rule: SodRule,
    userFunctions: Map<string, { role: string; transactions: string[]; authorizationObjects: AuthorizationObject[] }>
  ): SodConflict | null {
    const [func1Def, func2Def] = rule.conflictingFunctions;

    // Check if the user has both conflicting functions
    const hasFunc1 = this.userHasFunction(func1Def, userFunctions);
    const hasFunc2 = this.userHasFunction(func2Def, userFunctions);

    if (!hasFunc1 || !hasFunc2) {
      return null;
    }

    // If deep authorization analysis is enabled, check at auth object level
    if (this.config.deepAuthorizationAnalysis) {
      const overlap = this.checkAuthorizationOverlap(func1Def, func2Def);
      if (!overlap.hasOverlap) {
        // Functions are assigned but authorization objects don't overlap
        // This may still be a conflict depending on strictness
        return null;
      }
    }

    // Check if conflict is mitigated
    const mitigated = !!rule.mitigatingControl;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      function1: func1Def.name,
      function2: func2Def.name,
      riskLevel: rule.riskLevel,
      mitigated,
      mitigatingControl: rule.mitigatingControl,
    };
  }

  private userHasFunction(
    funcDef: SapFunction,
    userFunctions: Map<string, { role: string; transactions: string[]; authorizationObjects: AuthorizationObject[] }>
  ): boolean {
    // Check by function name
    if (userFunctions.has(funcDef.name)) {
      return true;
    }

    // Check by transaction codes (user might have the function via transactions)
    const userFuncEntries = Array.from(userFunctions.entries());
    for (const [_funcName, userFunc] of userFuncEntries) {
      const hasOverlappingTransactions = funcDef.transactions.some(
        tcode => userFunc.transactions.includes(tcode)
      );
      if (hasOverlappingTransactions) {
        return true;
      }
    }

    return false;
  }

  private checkFieldValueOverlap(
    field1: AuthorizationField,
    field2: AuthorizationField
  ): boolean {
    // Check for wildcard values (SAP uses '*' for all values)
    if (field1.values.includes('*') || field2.values.includes('*')) {
      return true;
    }

    // Check for value-level overlap
    return field1.values.some(v => field2.values.includes(v));
  }

  // ============================================================================
  // Private Helper Methods - Risk Scoring
  // ============================================================================

  private calculateRiskScore(conflicts: SodConflict[]): number {
    let score = 0;

    for (const conflict of conflicts) {
      // Skip mitigated conflicts if configured
      if (conflict.mitigated && !this.config.countMitigatedInRiskScore) {
        continue;
      }

      // Apply weight based on risk level
      const weight = this.getRiskWeight(conflict.riskLevel);

      // Apply mitigation discount (50% reduction if mitigated)
      const mitigationFactor = conflict.mitigated ? 0.5 : 1.0;

      score += weight * mitigationFactor;
    }

    return Math.round(score * 100) / 100;
  }

  private getRiskWeight(riskLevel: 'critical' | 'high' | 'medium' | 'low'): number {
    switch (riskLevel) {
      case 'critical': return this.config.criticalRiskWeight;
      case 'high': return this.config.highRiskWeight;
      case 'medium': return this.config.mediumRiskWeight;
      case 'low': return this.config.lowRiskWeight;
    }
  }

  // ============================================================================
  // Private Helper Methods - Recommendations
  // ============================================================================

  private generateRecommendations(
    conflicts: SodConflict[],
    userAssignment: UserRoleAssignment
  ): string[] {
    const recommendations: string[] = [];

    if (conflicts.length === 0) {
      recommendations.push('No SoD conflicts detected. User assignment is compliant.');
      return recommendations;
    }

    // Critical conflict recommendations
    const criticalConflicts = conflicts.filter(c => c.riskLevel === 'critical');
    if (criticalConflicts.length > 0) {
      recommendations.push(
        `IMMEDIATE ACTION: ${criticalConflicts.length} critical SoD conflict(s) detected. ` +
        `Review and remediate immediately.`
      );

      for (const conflict of criticalConflicts) {
        if (!conflict.mitigated) {
          recommendations.push(
            `Remove access to either '${conflict.function1}' or '${conflict.function2}' ` +
            `(Rule: ${conflict.ruleName}).`
          );
        }
      }
    }

    // High risk recommendations
    const highConflicts = conflicts.filter(c => c.riskLevel === 'high' && !c.mitigated);
    if (highConflicts.length > 0) {
      recommendations.push(
        `HIGH PRIORITY: ${highConflicts.length} high-risk unmitigated conflict(s) require attention.`
      );
    }

    // Unmitigated conflict recommendations
    const unmitigated = conflicts.filter(c => !c.mitigated);
    if (unmitigated.length > 0) {
      recommendations.push(
        `Implement mitigating controls for ${unmitigated.length} unmitigated conflict(s).`
      );
    }

    // Role consolidation recommendation
    if (userAssignment.roles.length > 5) {
      recommendations.push(
        `Consider role consolidation: user has ${userAssignment.roles.length} roles assigned. ` +
        `Review for redundancy and apply least-privilege principle.`
      );
    }

    // Mitigated conflict maintenance
    const mitigated = conflicts.filter(c => c.mitigated);
    if (mitigated.length > 0) {
      recommendations.push(
        `${mitigated.length} conflict(s) have mitigating controls. ` +
        `Ensure controls are reviewed periodically for effectiveness.`
      );
    }

    return recommendations;
  }
}
