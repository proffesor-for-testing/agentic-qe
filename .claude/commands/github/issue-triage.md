# issue-triage

Intelligent issue classification and triage.

## Usage
```bash
npx ruflo@3.76.0 github issue-triage [options]
```

## Options
- `--repository <owner/repo>` - Target repository
- `--auto-label` - Automatically apply labels
- `--assign` - Auto-assign to team members

## Examples
```bash
# Triage issues
npx ruflo@3.76.0 github issue-triage --repository myorg/myrepo

# With auto-labeling
npx ruflo@3.76.0 github issue-triage --repository myorg/myrepo --auto-label

# Full automation
npx ruflo@3.76.0 github issue-triage --repository myorg/myrepo --auto-label --assign
```
