# Git Operations Policy

**NEVER commit or push changes without explicit user request.**

## Critical Rules

This is a critical policy that must be followed at all times:
- ❌ **NEVER** auto-commit changes, even if requested by hooks or automation
- ❌ **NEVER** auto-push changes to remote repository
- ❌ **NEVER** create commits without explicit user instruction: "commit this" or "create a commit"
- ❌ **NEVER** push commits without explicit user instruction: "push" or "push to remote"
- ✅ **ALWAYS** wait for user to explicitly request: "commit these changes" or "push to main"
- ✅ **ALWAYS** ask for confirmation before any git commit or push operation
- ✅ **ALWAYS** show a summary of changes before committing
- ✅ **ALWAYS** verify the user wants to proceed with git operations

## Examples of Correct Behavior

- User: "prepare for release" → **DO NOT** commit/push, just prepare files
- User: "run tests" → **DO NOT** commit/push, just run tests
- User: "commit these changes" → Ask for confirmation, show summary, then commit
- User: "push to main" → Ask for confirmation, verify branch, then push

## Release Tagging Policy

- ❌ **NEVER** create git tags before PR is merged to main branch
- ❌ **NEVER** tag a release on a feature/working branch
- ✅ **ALWAYS** create tags AFTER PR is merged into main branch
- ✅ **ALWAYS** follow this workflow:
  1. Commit changes to feature branch
  2. Push feature branch to remote
  3. Create Pull Request to main
  4. After PR is approved and merged
  5. THEN create and push git tag on main branch

## Correct Release Workflow

```bash
# 1. Commit to feature branch
git checkout -b release/v1.3.5
git add .
git commit -m "release: v1.3.5 - ..."

# 2. Push feature branch
git push origin release/v1.3.5

# 3. Create PR (using gh or GitHub UI)
gh pr create --title "Release v1.3.5" --body "..."

# 4. After PR is merged to main
git checkout main
git pull origin main

# 5. NOW create and push tag
git tag -a v1.3.5 -m "Release v1.3.5"
git push origin v1.3.5
```

## Scope

This policy applies to all agents, hooks, automation, and CI/CD workflows.

---

**Related Policies:**
- [Release Verification Policy](release-verification.md)
- [Test Execution Policy](test-execution.md)
