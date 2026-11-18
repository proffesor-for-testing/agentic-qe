# Mutation Operators Reference

## Arithmetic Operators
| Original | Mutant | What It Tests |
|----------|--------|--------------|
| `a + b` | `a - b` | Addition logic |
| `a * b` | `a / b` | Multiplication logic |
| `a % b` | `a * b` | Modulo logic |

## Conditional Operators
| Original | Mutant | What It Tests |
|----------|--------|--------------|
| `a > b` | `a >= b` | Off-by-one in boundaries |
| `a >= b` | `a > b` | Boundary inclusion |
| `a === b` | `a !== b` | Equality checks |
| `a && b` | `a \|\| b` | Logical conjunction |

## Statement Mutations
| Original | Mutant | What It Tests |
|----------|--------|--------------|
| `return x` | `return !x` | Return value negation |
| `if (cond)` | `if (true)` | Condition relevance |
| `if (cond)` | `if (false)` | Dead code detection |
| `statement` | _(removed)_ | Statement necessity |

## Common Surviving Mutants and Fixes

**`>=` to `>` survives**: Add boundary test with exact boundary value
**`&&` to `||` survives**: Add test where only one condition is true
**Removed `return` survives**: Function's return value isn't being checked
**`+1` to `-1` survives**: Increment/decrement logic untested

## Stryker Configuration Tips
- `--testRunner jest` — explicit when multiple runners installed
- `--concurrency 2` — prevents OOM in containers
- `--mutate 'src/**/*.ts,!src/**/*.d.ts'` — skip type definitions
- `--timeoutMS 60000` — increase for slow test suites
- `--thresholds.high 80 --thresholds.low 60` — score quality bands
