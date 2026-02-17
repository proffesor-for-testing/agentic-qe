/**
 * Agentic QE v3 - Security Auditor Types & Configuration
 * Extracted from security-auditor.ts for modularity
 */

import type {
  IDependencySecurityService,
  SecurityAuditOptions,
  SecurityAuditReport,
  SecretScanResult,
  Vulnerability,
} from '../interfaces.js';
import type { FilePath, RiskScore } from '../../../shared/value-objects/index.js';
import { Result } from '../../../shared/types/index.js';

// ============================================================================
// Package.json Types
// ============================================================================

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

// ============================================================================
// OSV (Open Source Vulnerabilities) API Types
// ============================================================================

export interface OSVQueryRequest {
  package: {
    name: string;
    ecosystem: string;
  };
  version: string;
}

export interface OSVVulnerability {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  severity?: Array<{
    type: string;
    score: string;
  }>;
  affected?: Array<{
    package?: {
      name: string;
      ecosystem: string;
    };
    ranges?: Array<{
      type: string;
      events?: Array<{
        introduced?: string;
        fixed?: string;
      }>;
    }>;
    versions?: string[];
  }>;
  references?: Array<{
    type: string;
    url: string;
  }>;
}

export interface OSVQueryResponse {
  vulns?: OSVVulnerability[];
}

// ============================================================================
// HTTP Client for API calls
// ============================================================================

export interface HttpResponse<T> {
  ok: boolean;
  status: number;
  data: T;
}

export async function httpPost<T, R>(url: string, body: T): Promise<HttpResponse<R>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json() as R;
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

export async function httpGet<R>(url: string): Promise<HttpResponse<R>> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  const data = await response.json() as R;
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

// ============================================================================
// Service Interface
// ============================================================================

export interface ISecurityAuditorService extends IDependencySecurityService {
  runAudit(options: SecurityAuditOptions): Promise<Result<SecurityAuditReport>>;
  scanSecrets(files: FilePath[]): Promise<Result<SecretScanResult>>;
  getSecurityPosture(): Promise<Result<SecurityPostureSummary>>;
  triageVulnerabilities(
    vulnerabilities: Vulnerability[]
  ): Promise<Result<TriagedVulnerabilities>>;
}

export interface SecurityPostureSummary {
  overallScore: number;
  trend: 'improving' | 'stable' | 'declining';
  criticalIssues: number;
  highIssues: number;
  openVulnerabilities: number;
  resolvedLastWeek: number;
  averageResolutionTime: number;
  lastAuditDate: Date;
  recommendations: string[];
}

export interface TriagedVulnerabilities {
  immediate: Vulnerability[];
  shortTerm: Vulnerability[];
  mediumTerm: Vulnerability[];
  longTerm: Vulnerability[];
  accepted: Vulnerability[];
}

// ============================================================================
// Configuration
// ============================================================================

export interface SecurityAuditorConfig {
  secretPatterns: RegExp[];
  excludePatterns: string[];
  maxFileSizeKb: number;
  enableHistoricalAnalysis: boolean;
  riskThreshold: number;
}

export const DEFAULT_CONFIG: SecurityAuditorConfig = {
  secretPatterns: [
    /(?:api[_-]?key|apikey)['":\s]*['"=]?\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi,
    /(?:password|passwd|pwd)['":\s]*['"=]?\s*['"]?([^\s'"]{8,})['"]?/gi,
    /(?:secret|token)['":\s]*['"=]?\s*['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi,
    /(?:aws[_-]?access[_-]?key|aws[_-]?secret)['":\s]*['"=]?\s*['"]?([A-Z0-9]{20,})['"]?/gi,
    /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
    /ghp_[a-zA-Z0-9]{36}/g, // GitHub personal access token
    /gho_[a-zA-Z0-9]{36}/g, // GitHub OAuth access token
    /sk-[a-zA-Z0-9]{48}/g, // OpenAI API key
  ],
  excludePatterns: ['node_modules', 'dist', 'build', '.git', '*.test.*', '*.spec.*'],
  maxFileSizeKb: 1024,
  enableHistoricalAnalysis: true,
  riskThreshold: 0.7,
};
