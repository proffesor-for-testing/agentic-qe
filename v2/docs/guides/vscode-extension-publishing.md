# VS Code Extension Publishing Guide

Step-by-step instructions for publishing the Agentic QE Companion extension to the VS Code Marketplace.

## Prerequisites

- Node.js 18+
- VS Code Extension Manager: `npm install -g @vscode/vsce`
- Azure DevOps account (free)

## One-Time Setup

### 1. Create Publisher Account

1. Go to: https://marketplace.visualstudio.com/manage/createpublisher
2. Sign in with Microsoft account
3. Create publisher with:
   - **Publisher ID**: `agentic-qe` (must match `package.json`)
   - **Display Name**: `Agentic QE`
   - **Description**: AI-powered Quality Engineering tools

### 2. Generate Personal Access Token (PAT)

1. Go to: https://dev.azure.com/
2. Create organization if you don't have one
3. Click **User Settings** (top right) → **Personal Access Tokens**
4. Click **+ New Token**
5. Configure:
   - **Name**: `vscode-marketplace`
   - **Organization**: All accessible organizations
   - **Expiration**: 1 year (max)
   - **Scopes**: Custom defined → **Marketplace** → Check **Publish**
6. Click **Create** and **copy the token immediately** (you won't see it again)

### 3. Login to VSCE

```bash
cd src/edge/vscode-extension
vsce login agentic-qe
# Paste your PAT when prompted
```

## Publishing

### First-Time Publish

```bash
cd src/edge/vscode-extension

# Verify package builds without errors
npm run package

# Publish to marketplace
vsce publish
```

### Update Existing Extension

```bash
cd src/edge/vscode-extension

# Option 1: Manual version bump (edit package.json first)
vsce publish

# Option 2: Auto-bump patch version (0.2.0 → 0.2.1)
vsce publish patch

# Option 3: Auto-bump minor version (0.2.0 → 0.3.0)
vsce publish minor

# Option 4: Auto-bump major version (0.2.0 → 1.0.0)
vsce publish major
```

### Pre-Release Version

```bash
# Publish as pre-release (users must opt-in)
vsce publish --pre-release
```

## Verification

After publishing:

1. Wait 5-10 minutes for processing
2. Check: https://marketplace.visualstudio.com/items?itemName=agentic-qe.agentic-qe-companion
3. Verify:
   - Icon displays correctly
   - README renders properly
   - Version number is correct
   - Categories and tags are correct

## Updating Extension Content

### Version Checklist

When releasing a new version, update:

1. `package.json` - `version` field
2. `CHANGELOG.md` - Add new version section
3. `README.md` - Update if features changed

### Files Included in VSIX

Controlled by `.vscodeignore`. Currently includes:

```
✓ README.md
✓ CHANGELOG.md
✓ LICENSE
✓ package.json
✓ resources/icon.png
✓ dist/**
✓ webview/**
✓ node_modules/@ruvector/**
```

## Troubleshooting

### "Publisher not found"

```bash
# Verify publisher name matches exactly
grep '"publisher"' package.json
# Should output: "publisher": "agentic-qe"
```

### "Invalid PAT"

- PAT may have expired - generate a new one
- Ensure PAT has Marketplace Publish scope
- Try logging in again: `vsce logout && vsce login agentic-qe`

### "Missing README"

Ensure `.vscodeignore` does NOT list `README.md`

### Icon Not Showing

- Must be PNG format
- Recommended: 128x128 pixels
- `package.json` must have: `"icon": "resources/icon.png"`

## Unpublishing

```bash
# Remove specific version
vsce unpublish agentic-qe.agentic-qe-companion@0.2.0

# Remove entire extension (requires confirmation)
vsce unpublish agentic-qe.agentic-qe-companion
```

## CI/CD Integration

For automated publishing via GitHub Actions:

```yaml
# .github/workflows/vscode-extension.yml
name: Publish VS Code Extension

on:
  push:
    tags:
      - 'vscode-v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        working-directory: src/edge/vscode-extension
        run: npm ci

      - name: Publish
        working-directory: src/edge/vscode-extension
        run: npx vsce publish -p ${{ secrets.VSCE_PAT }}
```

Store your PAT as `VSCE_PAT` in repository secrets.

## Links

- [VSCE CLI Reference](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Marketplace Publisher Portal](https://marketplace.visualstudio.com/manage)
- [Extension Manifest Reference](https://code.visualstudio.com/api/references/extension-manifest)
