# workflow-export

Export workflows for sharing.

## Usage
```bash
npx ruflo@3.76.0 workflow export [options]
```

## Options
- `--name <name>` - Workflow to export
- `--format <type>` - Export format
- `--include-history` - Include execution history

## Examples
```bash
# Export workflow
npx ruflo@3.76.0 workflow export --name "deploy-api"

# As YAML
npx ruflo@3.76.0 workflow export --name "test-suite" --format yaml

# With history
npx ruflo@3.76.0 workflow export --name "deploy-api" --include-history
```
