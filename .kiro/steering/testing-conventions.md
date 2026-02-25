---
inclusion: fileMatch
name: testing-conventions
description: Testing conventions for test files
fileMatchPattern: "**/*.test.{ts,js,tsx,jsx}"
---

# Testing Conventions

## Structure
- Use Arrange-Act-Assert (AAA) pattern
- One logical assertion per test
- Descriptive names: `should_returnValue_when_condition`

## Frameworks
- Unit tests: Vitest or Jest
- Integration tests: Vitest with real dependencies
- E2E tests: Playwright

## Mocking
- Mock external dependencies at system boundaries
- Prefer dependency injection over module mocking
- Never mock the system under test
