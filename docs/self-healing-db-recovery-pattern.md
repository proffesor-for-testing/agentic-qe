# Self-Healing QE Agent: DB Recovery During Test Execution

> Can a QE agent detect a database failure during Selenium test execution, bring it back up, and resume testing?

**Short answer: Yes, architecturally possible — but it requires deliberate orchestration setup, not magic.**

---

## What an Agent CAN Do Today

A QE agent (e.g., `qe-parallel-executor` or a custom `self-healing` workflow) has access to `Bash`, `Read`, `Write`, and other tools. So this sequence is technically feasible:

1. Agent runs Selenium tests via Bash
2. Parses test output → detects DB connection errors
3. Runs `docker compose up -d postgres` (or equivalent)
4. Waits for health check
5. Re-runs failed tests

---

## What You'd Actually Need to Wire Up

### Option A — Reactive (agent watches test output)

- Agent runs tests, captures stderr/stdout
- Pattern-matches for `ConnectionRefused`, `ECONNREFUSED`, `timeout waiting for DB`
- Executes recovery command
- Retries failed suite

### Option B — Proactive (health check before test run)

- Agent checks DB health pre-test (`pg_isready`, `docker ps`, etc.)
- Starts DB if down
- Only then runs tests

### Option C — Self-healing workflow (most robust)

```javascript
// Using the self-healing skill
Skill({ skill: "automation:self-healing" })
```

This registers recovery actions that trigger automatically on known failure patterns.

---

## The Honest Limitations

1. **The agent needs infrastructure access** — it must have permission to restart the DB (docker, systemctl, cloud CLI). If it's a managed RDS instance, the agent needs AWS credentials.

2. **Resume ≠ re-run** — Selenium doesn't natively support "resume from test #47." The agent can re-run *failed tests only* (most frameworks support `--rerun-failures`), but it can't pick up mid-test.

3. **Root cause matters** — if the DB crashed because of a test-induced corruption, restarting it will just crash again. The agent should detect repeated failures and stop rather than loop.

4. **Race conditions** — if tests run in parallel and multiple agents try to restart the DB simultaneously, you get chaos. Needs a coordination lock.

---

## Practical Implementation Pattern

```
┌─────────────────────────────────────────┐
│         Test Executor Agent             │
├─────────────────────────────────────────┤
│                                         │
│  1. Pre-flight health check             │
│     └─ DB up? → proceed                 │
│     └─ DB down? → recover → proceed     │
│                                         │
│  2. Execute test suite                  │
│     └─ On failure:                      │
│        ├─ Classify failure              │
│        │  ├─ Test bug → report & skip   │
│        │  ├─ Infra issue → recover      │
│        │  └─ Flaky → retry (max 2)      │
│        └─ If infra:                     │
│           ├─ Identify service (DB/API)  │
│           ├─ Execute recovery action    │
│           ├─ Verify health restored     │
│           └─ Re-run failed tests only   │
│                                         │
│  3. Final report                        │
│     └─ Tests passed / failed / healed   │
└─────────────────────────────────────────┘
```

---

## Key Distinction

The agent doesn't "know" to do this by default. You define the recovery playbook (which failures → which recovery actions), and the agent follows it. It's not AI intuition — it's pattern-matched automation with AI-powered classification of *which* pattern applies.
