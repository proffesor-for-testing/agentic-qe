# NPM Publishing Guide for agentic-qe

## Prerequisites

1. **NPM Account**: Create an account at https://www.npmjs.com/signup
2. **Authentication**: Login to npm from your terminal:
   ```bash
   npm login
   ```

## Pre-publish Checklist

- [x] ✅ `package.json` has proper metadata (name, version, description, author, license)
- [x] ✅ `.npmignore` file created to exclude unnecessary files
- [x] ✅ `LICENSE` file added (MIT)
- [x] ✅ Project builds successfully (`npm run build`)
- [x] ✅ `dist/` folder contains compiled JavaScript
- [x] ✅ Binary entry point configured (`bin` field in package.json)
- [ ] Tests pass (`npm test`)
- [ ] Repository URL updated in package.json
- [ ] Version number is appropriate (1.0.0 for initial release)

## Publishing Steps

### 1. Update Repository URLs
Edit `package.json` and replace `YOUR_USERNAME` with your GitHub username:
```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/YOUR_USERNAME/agentic-qe.git"
}
```

### 2. Verify Package Contents
Check what will be published:
```bash
npm pack --dry-run
```

### 3. Test Locally
Install your package locally to test:
```bash
npm link
aqe --version  # Test the CLI works
```

### 4. Publish to NPM

#### First Time Publishing:
```bash
npm publish --access public
```

#### Update Version and Publish:
```bash
# For patch release (1.0.0 -> 1.0.1)
npm version patch

# For minor release (1.0.0 -> 1.1.0)
npm version minor

# For major release (1.0.0 -> 2.0.0)
npm version major

# Then publish
npm publish
```

### 5. Verify Publication
- Check your package at: https://www.npmjs.com/package/agentic-qe
- Test installation: `npm install -g agentic-qe`

## Package Name Considerations

The current package name is `agentic-qe`. Before publishing:
1. Check if the name is available: https://www.npmjs.com/package/agentic-qe
2. If taken, consider alternatives:
   - `@your-username/agentic-qe` (scoped package)
   - `agentic-quality-engineering`
   - `aqe-framework`

## Post-publish Tasks

1. **Create Git Tag**:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **Update README**:
   Add installation instructions:
   ```markdown
   ## Installation
   npm install -g agentic-qe
   ```

3. **Create GitHub Release**:
   - Go to your repository's releases page
   - Create a new release with the version tag
   - Add release notes

## Troubleshooting

### Common Issues:

1. **Name already taken**:
   - Use a scoped package: `@username/agentic-qe`
   - Choose a different name

2. **Authentication failed**:
   ```bash
   npm logout
   npm login
   ```

3. **Missing dist folder**:
   ```bash
   npm run build
   ```

4. **Permission denied for global install**:
   - Use npx: `npx agentic-qe`
   - Or fix npm permissions: https://docs.npmjs.com/resolving-eacces-permissions-errors

## Maintenance

### Updating the Package:
1. Make your changes
2. Run tests: `npm test`
3. Build: `npm run build`
4. Update version: `npm version patch/minor/major`
5. Publish: `npm publish`
6. Push tags: `git push --tags`

### Deprecating Versions:
```bash
npm deprecate agentic-qe@1.0.0 "Critical bug, please upgrade"
```

### Unpublishing (within 72 hours):
```bash
npm unpublish agentic-qe@1.0.0
```

## Security Best Practices

1. Enable 2FA on your npm account
2. Use `npm audit` regularly
3. Keep dependencies updated
4. Never publish sensitive data (API keys, passwords)
5. Review `.npmignore` before publishing

## Package Quality

Consider adding:
- [ ] CI/CD with GitHub Actions
- [ ] Code coverage badges
- [ ] npm version badge in README
- [ ] Comprehensive documentation
- [ ] Examples directory
- [ ] CHANGELOG.md

## Quick Commands Reference

```bash
# Login to npm
npm login

# Check what will be published
npm pack --dry-run

# Publish package
npm publish --access public

# Update and publish
npm version patch && npm publish

# View package info
npm info agentic-qe

# Check for available name
npm view agentic-qe
```