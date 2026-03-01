# E2E Tests

This directory contains **critical user journey** E2E tests that verify major user-facing behaviors with real browser automation.

## Test Philosophy

E2E tests are expensive (slow, flaky, require infrastructure). We keep them minimal and focused on **critical user journeys**:

| Journey | What it Tests | Why it Matters |
|---------|---------------|----------------|
| Execute passing test | Full test execution → pass result | Core functionality works |
| Execute failing test | Test with intentional failure → error details | Error handling works |
| Execute test suite | Multiple cases → aggregated results | Suite execution works |

## What NOT to Test Here

These belong in `tests/unit/` or `tests/integration/`:

- Individual step types (navigate, click, assert, etc.)
- Browser client commands
- Snapshot parsing
- Multi-session coordination
- Error edge cases

## Running E2E Tests

```bash
# Run all E2E tests (requires browser)
npm test -- tests/e2e/

# Skip in CI (automatic via CI=true)
CI=true npm test -- tests/e2e/
```

## Requirements

- `agent-browser` CLI installed (`npx agent-browser --version`)
- Non-CI environment (tests auto-skip when `CI=true`)

## Related Test Files

Infrastructure/integration tests (with mocks) are in:
- `tests/integration/browser/` - Browser client integration tests
- `tests/unit/domains/` - Domain logic unit tests
