import { createHash } from 'node:crypto';

export type InstructionAuthority =
  | 'system-effective'
  | 'user-authorized'
  | 'assistant-derived'
  | 'tool-observation'
  | 'memory-derived'
  | 'unknown';

export type ContextSourceKind =
  | 'user' | 'tool' | 'file' | 'web' | 'agent' | 'memory' | 'skill' | 'goal' | 'schedule';

export interface InstructionProvenance {
  authority: InstructionAuthority;
  /** Immutable authority at the start of this item's derivation chain. */
  originAuthority: InstructionAuthority;
  sourceKind: ContextSourceKind;
  sourceRef?: string;
  parentIds: string[];
  contentHash: string;
  createdAt: string;
  mayInduceAction: boolean;
}

export interface ProvenancedContent extends InstructionProvenance {
  id: string;
  content: string;
}

const AUTHORITY_TRUST: Record<InstructionAuthority, number> = {
  unknown: 0,
  'tool-observation': 1,
  'memory-derived': 1,
  'assistant-derived': 2,
  'user-authorized': 3,
  'system-effective': 4,
};

export function hashContextContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function leastTrustedAuthority(
  authorities: InstructionAuthority[],
): InstructionAuthority {
  if (authorities.length === 0) return 'unknown';
  return authorities.reduce((least, current) =>
    AUTHORITY_TRUST[current] < AUTHORITY_TRUST[least] ? current : least
  );
}

