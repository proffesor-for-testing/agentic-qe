# test-files.sh — shared test-file definition for the no-skip and freeze-tests hooks
# (identical copy in each skill's scripts/ directory; sourced).
#
# is_test_file <path> succeeds when the path looks like a test file:
#   - under a spec/, specs/, e2e/, cypress/, __tests__/, test/ or tests/ directory
#   - *.test.*, *.spec.*, *_spec.*, *-spec.*, *.tests.* ... (case-insensitive)
#   - *.cy.* (Cypress)
#   - *Spec.*, *Test.*, *Tests.*, *IT.* (JVM, .NET, Swift, PHP ... class names; case-sensitive;
#     IT needs a lower-case letter or digit before it, so AUDIT.md or SPLIT.ts do not match)
#   - test_*.py, *_test.py, *_test.go
# Windows separators ("\") are normalised to "/". POSIX ERE only (GNU and BSD grep).

is_test_file() {
  local path status
  path=$(printf '%s\n' "$1" | tr '\\' '/')
  printf '%s\n' "$path" | grep -Eiq -- '(^|/)(spec|specs|e2e|cypress|__tests__|tests?)/|[._-](spec|test)s?\.[[:alnum:]]+$|\.cy\.[[:alnum:]]+$'
  status=$?
  [ $status -eq 1 ] || return 0 # match, or grep failed: fail closed (treat as a test file)
  printf '%s\n' "$path" | grep -Eq -- '(Spec|Test|Tests|[[:lower:][:digit:]]IT)\.[[:alnum:]]+$|(^|/)test_[^/]*\.py$|_test\.(py|go)$'
  status=$?
  [ $status -eq 1 ] && return 1
  return 0
}
