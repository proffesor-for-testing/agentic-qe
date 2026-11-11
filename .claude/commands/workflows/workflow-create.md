# workflow-create

Create reusable workflow templates.

## Usage
```bash
npx ruflo@3.76.0 workflow create [options]
```

## Options
- `--name <name>` - Workflow name
- `--from-history` - Create from history
- `--interactive` - Interactive creation

## Examples
```bash
# Create workflow
npx ruflo@3.76.0 workflow create --name "deploy-api"

# From history
npx ruflo@3.76.0 workflow create --name "test-suite" --from-history

# Interactive mode
npx ruflo@3.76.0 workflow create --interactive
```
