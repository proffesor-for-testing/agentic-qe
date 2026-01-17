# Phase 4: Subagent Workflows - Prioritized Checklist

**Status**: Ready for Next Release (After Phase 3)
**Estimated Effort**: 2 weeks (Weeks 5-6)
**Priority**: Medium (enhances TDD workflows and agent coordination)

---

## Overview

Add specialized subagent patterns for TDD (Test-Driven Development) and quality workflows. Create 12 subagent definitions that work with parent agents for systematic development workflows.

---

## Prioritized Implementation Order

### Priority 1: Core TDD Subagents (Week 5, Days 1-3)

These are the foundational subagents for the TDD RED-GREEN-REFACTOR cycle.

#### 1.1 Test Writer Subagent (RED Phase) 🔥 HIGHEST PRIORITY
**Why First**: Foundation of TDD workflow

- [ ] **1.1.1** Create `.claude/agents/subagents/` directory
- [ ] **1.1.2** Create `qe-test-writer.md`:
  ```yaml
  ---
  name: qe-test-writer
  description: Writes failing tests BEFORE implementation (TDD RED phase) - generates comprehensive test suites with 95%+ coverage specifications
  role: specialized-subagent
  parent: qe-test-generator
  ---
  ```
- [ ] **1.1.3** Add core responsibilities:
  - Write failing tests that define expected behavior
  - Use AAA (Arrange-Act-Assert) or Given-When-Then patterns
  - Include edge cases and error paths
  - Achieve 95%+ coverage specification
  - Document test intent and expectations
- [ ] **1.1.4** Add code execution examples:
  ```typescript
  // Example: Write failing tests for UserService
  import { describe, test, expect } from '@jest/globals';

  describe('UserService', () => {
    test('should create user with valid data', () => {
      const service = new UserService();
      const user = service.createUser({
        name: 'John Doe',
        email: 'john@example.com'
      });

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.name).toBe('John Doe');
    });

    test('should throw error for invalid email', () => {
      const service = new UserService();
      expect(() => {
        service.createUser({ name: 'John', email: 'invalid' });
      }).toThrow('Invalid email format');
    });
  });
  ```
- [ ] **1.1.5** Add coordination protocol (AQE hooks)
- [ ] **1.1.6** Add memory namespace (`aqe/tdd/red/*`)
- [ ] **1.1.7** Test subagent spawning
- [ ] **1.1.8** Document usage patterns

**Estimated Time**: 1 day

---

#### 1.2 Test Implementer Subagent (GREEN Phase)
**Why Second**: Makes tests pass with minimal code

- [ ] **1.2.1** Create `qe-test-implementer.md`:
  ```yaml
  ---
  name: qe-test-implementer
  description: Makes tests pass with minimal code (TDD GREEN phase) - implements just enough functionality to satisfy test requirements
  role: specialized-subagent
  parent: qe-test-generator
  ---
  ```
- [ ] **1.2.2** Add core responsibilities:
  - Read failing tests from memory
  - Implement minimal code to pass tests
  - Run tests continuously during implementation
  - Ensure all tests pass before completion
  - Avoid over-engineering or premature optimization
- [ ] **1.2.3** Add code execution examples:
  ```typescript
  // Example: Implement UserService to pass tests
  export class UserService {
    createUser(data: { name: string; email: string }) {
      // Validate email (minimal implementation)
      if (!data.email.includes('@')) {
        throw new Error('Invalid email format');
      }

      // Return user object
      return {
        id: crypto.randomUUID(),
        name: data.name,
        email: data.email,
        createdAt: new Date()
      };
    }
  }
  ```
- [ ] **1.2.4** Add coordination protocol
- [ ] **1.2.5** Add memory namespace (`aqe/tdd/green/*`)
- [ ] **1.2.6** Test subagent spawning
- [ ] **1.2.7** Document usage patterns

**Estimated Time**: 1 day

---

#### 1.3 Test Refactorer Subagent (REFACTOR Phase)
**Why Third**: Completes TDD cycle with quality improvements

- [ ] **1.3.1** Create `qe-test-refactorer.md`:
  ```yaml
  ---
  name: qe-test-refactorer
  description: Refactors code while keeping tests green (TDD REFACTOR phase) - improves code quality without changing behavior
  role: specialized-subagent
  parent: qe-test-generator
  ---
  ```
- [ ] **1.3.2** Add core responsibilities:
  - Identify refactoring opportunities
  - Apply safe refactorings (extract method, rename, etc.)
  - Keep all tests passing during refactoring
  - Improve code readability and maintainability
  - Reduce complexity and duplication
- [ ] **1.3.3** Add code execution examples:
  ```typescript
  // Example: Refactor UserService
  export class UserService {
    createUser(data: UserInput): User {
      this.validateEmail(data.email); // Extract method
      return this.buildUserObject(data); // Extract method
    }

    private validateEmail(email: string): void {
      if (!this.isValidEmail(email)) {
        throw new Error('Invalid email format');
      }
    }

    private isValidEmail(email: string): boolean {
      return email.includes('@') && email.includes('.');
    }

    private buildUserObject(data: UserInput): User {
      return {
        id: crypto.randomUUID(),
        ...data,
        createdAt: new Date()
      };
    }
  }
  ```
- [ ] **1.3.4** Add coordination protocol
- [ ] **1.3.5** Add memory namespace (`aqe/tdd/refactor/*`)
- [ ] **1.3.6** Test subagent spawning
- [ ] **1.3.7** Document usage patterns

**Estimated Time**: 1 day

---

### Priority 2: Quality Validation Subagents (Week 5, Days 4-5)

#### 2.1 Code Reviewer Subagent
**Why Fourth**: Enforces quality standards

- [ ] **2.1.1** Create `qe-code-reviewer.md`:
  ```yaml
  ---
  name: qe-code-reviewer
  description: Enforces quality standards, linting, complexity limits, and security (QUALITY phase) - validates code meets organizational standards
  role: specialized-subagent
  parent: qe-quality-gate
  ---
  ```
- [ ] **2.1.2** Add core responsibilities:
  - Check linting and formatting
  - Validate complexity (cyclomatic < 15)
  - Scan for security issues
  - Verify coverage (≥95%)
  - Approve or request changes
- [ ] **2.1.3** Add code execution examples
- [ ] **2.1.4** Add coordination protocol
- [ ] **2.1.5** Add memory namespace (`aqe/review/*`)
- [ ] **2.1.6** Test subagent spawning

**Estimated Time**: 0.5 days

---

#### 2.2 Integration Tester Subagent
**Why Fifth**: Validates component interactions

- [ ] **2.2.1** Create `qe-integration-tester.md`:
  ```yaml
  ---
  name: qe-integration-tester
  description: Validates component interactions and system integration - ensures components work together correctly
  role: specialized-subagent
  parent: qe-test-executor
  ---
  ```
- [ ] **2.2.2** Add core responsibilities:
  - Test API contracts
  - Validate database interactions
  - Test external service integrations
  - Verify error handling across boundaries
- [ ] **2.2.3** Add code execution examples
- [ ] **2.2.4** Add coordination protocol
- [ ] **2.2.5** Test subagent spawning

**Estimated Time**: 0.5 days

---

### Priority 3: Specialized Subagents (Week 6, Days 1-3)

#### 3.1 Performance Validator Subagent
- [ ] **3.1.1** Create `qe-performance-validator.md`
- [ ] **3.1.2** Add performance validation logic
- [ ] **3.1.3** Add SLA checking
- [ ] **3.1.4** Add benchmark comparisons

**Estimated Time**: 0.5 days

---

#### 3.2 Security Auditor Subagent
- [ ] **3.2.1** Create `qe-security-auditor.md`
- [ ] **3.2.2** Add security scanning
- [ ] **3.2.3** Add vulnerability detection
- [ ] **3.2.4** Add compliance checking

**Estimated Time**: 0.5 days

---

#### 3.3 Data Generator Subagent
- [ ] **3.3.1** Create `qe-data-generator.md`
- [ ] **3.3.2** Add realistic test data generation
- [ ] **3.3.3** Add schema-aware data
- [ ] **3.3.4** Add edge case data

**Estimated Time**: 0.5 days

---

#### 3.4 Flaky Test Investigator Subagent
- [ ] **3.4.1** Create `qe-flaky-investigator.md`
- [ ] **3.4.2** Add flaky test detection
- [ ] **3.4.3** Add root cause analysis
- [ ] **3.4.4** Add stabilization suggestions

**Estimated Time**: 0.5 days

---

#### 3.5 Coverage Gap Analyzer Subagent
- [ ] **3.5.1** Create `qe-coverage-gap-analyzer.md`
- [ ] **3.5.2** Add gap detection logic
- [ ] **3.5.3** Add risk scoring
- [ ] **3.5.4** Add test recommendations

**Estimated Time**: 0.5 days

---

#### 3.6 Test Data Architect Subagent
- [ ] **3.6.1** Create `qe-test-data-architect-sub.md`
- [ ] **3.6.2** Add high-volume data generation
- [ ] **3.6.3** Add relationship preservation
- [ ] **3.6.4** Add edge case coverage

**Estimated Time**: 0.5 days

---

### Priority 4: Orchestration Examples (Week 6, Days 4-5)

#### 4.1 Update Parent Agents with Subagent Orchestration

##### 4.1.1 qe-test-generator Orchestration
- [ ] Add TDD workflow example:
  ```typescript
  // Complete TDD workflow with subagents
  async function generateWithTDD(spec: TestSpec) {
    // RED: Write failing tests
    const tests = await delegateToSubagent('qe-test-writer', {
      spec,
      coverage: 95,
      patterns: ['AAA', 'Given-When-Then']
    });

    // GREEN: Make tests pass
    const impl = await delegateToSubagent('qe-test-implementer', {
      tests,
      requirements: spec.requirements
    });

    // REFACTOR: Improve code quality
    const refactored = await delegateToSubagent('qe-test-refactorer', {
      code: impl.code,
      tests
    });

    // REVIEW: Quality validation
    const review = await delegateToSubagent('qe-code-reviewer', {
      code: refactored.code,
      tests,
      policies: ['./policies/code-standards.yaml']
    });

    if (!review.approved) {
      // Iterate with feedback
      return generateWithTDD(spec);
    }

    return { tests, code: refactored.code, review };
  }
  ```

##### 4.1.2 qe-coverage-analyzer Orchestration
- [ ] Add gap analysis workflow with subagent

##### 4.1.3 qe-quality-gate Orchestration
- [ ] Add quality validation workflow with subagents

**Estimated Time**: 1 day

---

#### 4.2 Create Subagent Coordination Guide
- [ ] **4.2.1** Create `docs/subagents/coordination-guide.md`
- [ ] **4.2.2** Document subagent spawning patterns
- [ ] **4.2.3** Document memory coordination
- [ ] **4.2.4** Document error handling
- [ ] **4.2.5** Document best practices

**Estimated Time**: 0.5 days

---

#### 4.3 Create Subagent Examples
- [ ] **4.3.1** Create `examples/tdd-workflow.ts`
- [ ] **4.3.2** Create `examples/quality-validation.ts`
- [ ] **4.3.3** Create `examples/integration-testing.ts`
- [ ] **4.3.4** Test all examples

**Estimated Time**: 0.5 days

---

### Priority 5: Testing & Documentation (Week 6, Day 5)

#### 5.1 Testing
- [ ] **5.1.1** Test all 12 subagents spawn correctly
- [ ] **5.1.2** Test TDD workflow orchestration
- [ ] **5.1.3** Test subagent memory coordination
- [ ] **5.1.4** Test subagent error handling
- [ ] **5.1.5** Verify all code examples work

**Estimated Time**: 0.5 days

---

#### 5.2 Documentation
- [ ] **5.2.1** Update `README.md` with subagent patterns
- [ ] **5.2.2** Update `CLAUDE.md` with subagent coordination
- [ ] **5.2.3** Create subagent catalog
- [ ] **5.2.4** Update improvement plan with Phase 4 completion
- [ ] **5.2.5** Create Phase 4 completion report

**Estimated Time**: 0.5 days

---

## Subagent Directory Structure

```
.claude/agents/subagents/
├── tdd/                         # TDD workflow subagents
│   ├── qe-test-writer.md        # RED phase
│   ├── qe-test-implementer.md   # GREEN phase
│   └── qe-test-refactorer.md    # REFACTOR phase
│
├── quality/                     # Quality validation subagents
│   ├── qe-code-reviewer.md
│   ├── qe-integration-tester.md
│   ├── qe-performance-validator.md
│   └── qe-security-auditor.md
│
├── analysis/                    # Analysis subagents
│   ├── qe-coverage-gap-analyzer.md
│   ├── qe-flaky-investigator.md
│   └── qe-data-generator.md
│
└── specialized/                 # Specialized subagents
    ├── qe-test-data-architect-sub.md
    ├── qe-mutation-tester.md
    └── qe-visual-comparator.md
```

---

## Success Criteria

### Must Have ✅
- [ ] All 12 subagents created with frontmatter
- [ ] TDD workflow (RED-GREEN-REFACTOR) fully functional
- [ ] Parent agents have subagent orchestration examples
- [ ] Coordination guide created
- [ ] All tests pass

### Should Have ✅
- [ ] 3+ complete workflow examples
- [ ] Memory coordination working correctly
- [ ] Error handling implemented
- [ ] Best practices documented

### Nice to Have ✨
- [ ] Interactive subagent tutorial
- [ ] Subagent performance metrics
- [ ] Workflow visualization

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Subagent spawning complexity | Clear documentation, examples |
| Memory coordination issues | Comprehensive testing |
| Workflow orchestration bugs | Incremental testing |
| Performance overhead | Benchmark subagent calls |

---

## Estimated Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| **Week 5, Day 1** | 1 day | Test Writer subagent |
| **Week 5, Day 2** | 1 day | Test Implementer subagent |
| **Week 5, Day 3** | 1 day | Test Refactorer subagent |
| **Week 5, Day 4** | 0.5 days | Code Reviewer subagent |
| **Week 5, Day 5** | 0.5 days | Integration Tester subagent |
| **Week 6, Day 1-2** | 1.5 days | 6 specialized subagents |
| **Week 6, Day 3** | 0.5 days | Performance/Security validators |
| **Week 6, Day 4** | 1 day | Orchestration examples |
| **Week 6, Day 5** | 1 day | Testing & documentation |
| **Total** | **8 days** | **12 subagents + orchestration** |

---

## Dependencies

- ✅ Phase 1 Complete (Agent frontmatter)
- ✅ Phase 2 Complete (Code execution examples)
- ⚠️ Phase 3 (Recommended but not required)
- ⚠️ Claude Code Task tool for subagent spawning

---

## Deliverables

1. **Code**:
   - 12 subagent definitions
   - Subagent orchestration examples in parent agents
   - 3+ complete workflow examples

2. **Documentation**:
   - Subagent coordination guide
   - Subagent catalog
   - Updated CLAUDE.md
   - Workflow examples

3. **Tests**:
   - Subagent spawning tests
   - Workflow orchestration tests
   - Memory coordination tests

---

**Status**: Ready to Start (After Phase 3)
**Next Action**: Create `.claude/agents/subagents/` directory
**Blocking Issues**: None (Phase 3 recommended but not required)
