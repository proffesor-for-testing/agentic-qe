# NPM Publishing Checklist

## Pre-Publishing Checks

### ✅ Package Configuration
- [x] package.json updated with correct metadata
- [x] Repository URLs point to https://github.com/proffesor-for-testing/agentic-qe
- [x] "files" array configured to include necessary files
- [x] "publishConfig" set for public access
- [x] .npmignore created to exclude dev files

### ✅ Documentation
- [x] README.md polished with npm badges
- [x] CONTRIBUTING.md created
- [x] LICENSE (MIT) added
- [x] API documentation generated (docs/api/)
- [x] User guides created (docs/guides/)
- [x] Prerequisites clearly documented

### ⏳ Package Validation
- [x] Run `npm pack --dry-run` (513 files, 883.9 kB)
- [ ] Test with `npm link` in fresh directory
- [ ] Verify all CLI commands work (`aqe init`, `aqe generate`, etc.)
- [ ] Test installation: `npm install -g ./agentic-qe-1.0.0.tgz`

### ⏳ Code Quality
- [ ] Run `npm run build` - verify clean build
- [ ] Run `npm run typecheck` - no type errors
- [ ] Run `npm run lint` - no linting errors
- [ ] Run `npm test` - all tests passing

### ⏳ NPM Account Setup
- [ ] Login to npm: `npm login`
- [ ] Verify account: `npm whoami`
- [ ] Check organization permissions (if using org scope)

## Publishing Steps

### 1. Version Bump
```bash
# Choose one:
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0
```

### 2. Final Build
```bash
npm run clean
npm run build
npm run test:ci
```

### 3. Publish
```bash
# Dry run first (recommended)
npm publish --dry-run

# Publish to npm
npm publish

# Or publish with specific tag
npm publish --tag beta
```

### 4. Verify Publication
```bash
# Check on npm registry
npm view agentic-qe

# Install and test
npm install -g agentic-qe@latest
aqe --version
aqe init
```

### 5. Post-Publishing
- [ ] Create GitHub release with tag v1.0.0
- [ ] Update documentation website (if applicable)
- [ ] Announce on relevant channels
- [ ] Monitor npm download stats
- [ ] Watch for issues/bugs

## Troubleshooting

### Authentication Issues
```bash
npm logout
npm login
```

### Package Size Too Large
```bash
# Check what's included
npm pack --dry-run

# Review .npmignore
cat .npmignore
```

### Permission Denied
```bash
# Check if package name is available
npm view agentic-qe

# Try with --access public
npm publish --access public
```

## Rollback (Emergency)

If critical bug found after publishing:
```bash
# Unpublish within 72 hours (discouraged)
npm unpublish agentic-qe@1.0.0

# Better: publish patch version
npm version patch
npm publish
```

## Post-1.0.0 Roadmap

### Version 1.1.0
- [ ] Add web dashboard for fleet monitoring
- [ ] Enhanced GitHub Actions integration
- [ ] VS Code extension

### Version 1.2.0
- [ ] Support for additional test frameworks
- [ ] Cloud-based fleet coordination
- [ ] Advanced analytics dashboard

### Version 2.0.0
- [ ] Complete API redesign
- [ ] Multi-language support (Python, Go, Rust)
- [ ] Enterprise features

## Important Notes

1. **Semantic Versioning**: Follow semver (major.minor.patch)
2. **Deprecation Policy**: Announce breaking changes 6 months in advance
3. **Security**: Never publish .env files or secrets
4. **Testing**: Always test installation in clean environment
5. **Documentation**: Keep npm package documentation in sync with GitHub

## Current Package Stats

- **Name**: agentic-qe
- **Version**: 1.0.0
- **Size**: 883.9 kB (compressed), 4.0 MB (unpacked)
- **Files**: 516 files
- **License**: MIT
- **Repository**: https://github.com/proffesor-for-testing/agentic-qe
- **Node**: >=18.0.0
- **npm**: >=8.0.0

## Resources

- [npm Publishing Docs](https://docs.npmjs.com/cli/publish)
- [Semantic Versioning](https://semver.org/)
- [Package.json Spec](https://docs.npmjs.com/cli/configuring-npm/package-json)
- [npm CLI Reference](https://docs.npmjs.com/cli)
