# Edge Dashboard Improvements Plan

Based on analysis of [ruvector/edge-net](https://github.com/ruvnet/ruvector/tree/main/examples/edge-net/dashboard) implementation.

## Executive Summary

Transform the web dashboard from a limited agent launcher into a **compute contribution platform** where users contribute CPU/GPU resources for shared QE analysis tasks in exchange for credits.

---

## Phase 1: State Management Overhaul

### 1.1 Migrate to Zustand

Replace React useState with Zustand for robust state management with persistence.

**Files to create/modify:**
- `src/edge/webapp/stores/networkStore.ts` - Network state (peers, connection)
- `src/edge/webapp/stores/creditsStore.ts` - Credit economy state
- `src/edge/webapp/stores/taskStore.ts` - Distributed task state
- `src/edge/webapp/stores/identityStore.ts` - Cryptographic identity

**Implementation:**
```typescript
// Example: networkStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NetworkState {
  isContributing: boolean;
  cpuLimit: number;
  memoryLimit: number;
  tasksCompleted: number;
  creditsEarned: bigint;
  setContributing: (value: boolean) => void;
  setCpuLimit: (limit: number) => void;
}

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set) => ({
      isContributing: false,
      cpuLimit: 50, // 50% CPU
      memoryLimit: 512, // 512MB
      tasksCompleted: 0,
      creditsEarned: BigInt(0),
      setContributing: (value) => set({ isContributing: value }),
      setCpuLimit: (limit) => set({ cpuLimit: limit }),
    }),
    { name: 'aqe-network-store' }
  )
);
```

**Dependencies:**
```bash
npm install zustand
```

---

## Phase 2: Credit Economy System

### 2.1 Credit Service

Implement credit tracking and economy mechanics.

**Files to create:**
- `src/edge/webapp/services/creditService.ts`
- `src/edge/webapp/components/CreditsPanel.tsx`
- `src/edge/webapp/components/CreditHistory.tsx`

**Credit Model:**
```typescript
interface CreditAccount {
  balance: bigint;           // Current credits
  earned: bigint;            // Total earned from contributions
  spent: bigint;             // Total spent on tasks
  contributionMultiplier: number; // Bonus for consistent contribution
}

interface CreditTransaction {
  id: string;
  type: 'earn' | 'spend' | 'bonus';
  amount: bigint;
  reason: string;
  timestamp: number;
}
```

**Earning Rates:**
| Activity | Credits/Hour |
|----------|--------------|
| CPU contribution (per 10% utilized) | 100 |
| Memory contribution (per 100MB) | 50 |
| Task completion bonus | 10-100 |
| Uptime bonus (24h streak) | 500 |
| Pattern contribution | 200 |

**Spending Costs:**
| Service | Credits |
|---------|---------|
| Coverage analysis (per 1K LOC) | 50 |
| Test generation (per file) | 100 |
| Pattern search | 10 |
| Priority task execution | 200 |

### 2.2 Credit UI Components

**CreditsPanel features:**
- Current balance display
- Earning rate (credits/hour)
- Transaction history
- Spending breakdown chart
- Contribution settings

---

## Phase 3: WASM Task Execution

### 3.1 WASM Module Integration

Create WASM modules for browser-executable QE tasks.

**Files to create:**
- `src/edge/wasm/qe-tasks/` - Rust WASM source
- `src/edge/webapp/services/wasmService.ts` - WASM loader
- `src/edge/webapp/workers/taskWorker.ts` - Web Worker for execution

**Portable QE Tasks (WASM-compatible):**

1. **Pattern Matching** - Analyze code patterns without filesystem
2. **Coverage Calculation** - Process coverage reports
3. **Complexity Analysis** - Calculate cyclomatic complexity
4. **Test Scoring** - Rate test quality
5. **Pattern Mining** - Extract patterns from anonymized code

**WASM Service:**
```typescript
interface WASMService {
  init(): Promise<void>;
  isReady(): boolean;
  executeTask(task: QETask): Promise<TaskResult>;
  getCapabilities(): string[];
  getStats(): WASMStats;
}

interface QETask {
  type: 'pattern-match' | 'coverage-calc' | 'complexity' | 'test-score';
  payload: Uint8Array;
  maxCredits: bigint;
}
```

### 3.2 Task Distribution

**Files to create:**
- `src/edge/webapp/services/taskDistributor.ts`
- `src/edge/server/routes/tasks.ts`

**Task Flow:**
```
[User submits task] → [Edge Server] → [Task Queue]
                                           ↓
[Contributors] ← [Task Distribution] ← [Available Workers]
       ↓
[WASM Execution] → [Result] → [Aggregation] → [User]
```

---

## Phase 4: Cryptographic Identity

### 4.1 Identity Service

Implement secure identity for contribution tracking.

**Files to create:**
- `src/edge/webapp/services/identityService.ts`
- `src/edge/webapp/components/IdentityPanel.tsx`

**Identity Features:**
```typescript
interface QEIdentity {
  id: string;              // Unique identifier
  publicKey: Uint8Array;   // For verification
  shortId: string;         // Human-readable (e.g., "QE-a1b2c3")
  reputation: number;      // 0-100 based on contribution quality
  createdAt: number;
  stats: IdentityStats;
}

interface IdentityStats {
  tasksCompleted: number;
  creditsEarned: bigint;
  patternsShared: number;
  uptime: number;          // Total contribution hours
}
```

### 4.2 Identity UI

**IdentityPanel features:**
- Identity card with QR code
- Reputation score display
- Contribution stats
- Export/backup identity
- Connect across devices

---

## Phase 5: Enhanced Dashboard UI

### 5.1 Component Library

Migrate to HeroUI (like Ruv's implementation) for consistent design.

**Dependencies:**
```bash
npm install @heroui/react framer-motion
```

**New Components:**
- `ConsentWidget.tsx` - CPU/GPU contribution consent
- `NetworkStats.tsx` - Real-time network statistics
- `TaskQueue.tsx` - View pending/active tasks
- `ContributionSettings.tsx` - Resource limits
- `ReputationBadge.tsx` - Show contributor status

### 5.2 Dashboard Tabs

Update `Dashboard.tsx` with new sections:

| Tab | Description |
|-----|-------------|
| Overview | Network stats, quick actions |
| Contribute | Resource settings, earnings |
| Tasks | Queue, history, results |
| Credits | Balance, transactions, spending |
| Identity | Profile, reputation, stats |
| Patterns | Browse, share, discover |

---

## Phase 6: Backend Infrastructure

### 6.1 Task Queue Service

**Files to create:**
- `src/edge/server/services/taskQueue.ts`
- `src/edge/server/services/creditLedger.ts`
- `src/edge/server/routes/credits.ts`

**API Endpoints:**
```
POST /api/tasks/submit     - Submit task for distributed execution
GET  /api/tasks/:id        - Get task status/result
GET  /api/tasks/queue      - View task queue
POST /api/credits/balance  - Get credit balance
GET  /api/credits/history  - Transaction history
POST /api/identity/create  - Create new identity
GET  /api/identity/:id     - Get identity info
```

### 6.2 Database Schema

```sql
-- Credits ledger
CREATE TABLE credit_transactions (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'earn', 'spend', 'bonus'
  amount BIGINT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Task history
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  submitter_id TEXT NOT NULL,
  executor_id TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
  credits_offered BIGINT,
  credits_paid BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Identity registry
CREATE TABLE identities (
  id TEXT PRIMARY KEY,
  public_key BYTEA NOT NULL,
  reputation INTEGER DEFAULT 50,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Implementation Priority

### High Priority (Phase 1-2)
1. Zustand migration - Foundation for everything else
2. Credit service - Core economy mechanics
3. Basic credit UI - User visibility

### Medium Priority (Phase 3-4)
4. WASM task execution - Actual value delivery
5. Task distribution - Network utilization
6. Identity service - Contributor tracking

### Lower Priority (Phase 5-6)
7. Enhanced UI - Better user experience
8. Backend infrastructure - Production readiness

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Contributors online | 100+ concurrent |
| Tasks/day | 1000+ |
| Credit economy velocity | $0 (free tier first) |
| WASM task types | 5+ |
| Average contribution session | 4+ hours |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| WASM complexity | Start with simple tasks (pattern matching) |
| Credit abuse | Rate limiting, reputation system |
| Low contribution | Gamification, leaderboards |
| Browser compatibility | Feature detection, graceful fallback |

---

## Timeline Estimate

| Phase | Effort |
|-------|--------|
| Phase 1: Zustand | 2-3 days |
| Phase 2: Credits | 3-4 days |
| Phase 3: WASM | 5-7 days |
| Phase 4: Identity | 2-3 days |
| Phase 5: UI | 3-4 days |
| Phase 6: Backend | 4-5 days |
| **Total** | **~3-4 weeks** |

---

## References

- [Ruv's Edge-Net Dashboard](https://github.com/ruvnet/ruvector/tree/main/examples/edge-net/dashboard)
- [Zustand Documentation](https://zustand-demo.pmnd.rs/)
- [HeroUI Components](https://heroui.com/)
- [WebAssembly in Rust](https://rustwasm.github.io/docs/book/)

---

*Plan created: 2025-01-04*
*Related Issue: See GitHub issue for tracking*
