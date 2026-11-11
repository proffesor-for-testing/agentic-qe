# model-update

Update neural models with new data.

## Usage
```bash
npx ruflo@3.76.0 training model-update [options]
```

## Options
- `--model <name>` - Model to update
- `--incremental` - Incremental update
- `--validate` - Validate after update

## Examples
```bash
# Update all models
npx ruflo@3.76.0 training model-update

# Specific model
npx ruflo@3.76.0 training model-update --model agent-selector

# Incremental with validation
npx ruflo@3.76.0 training model-update --incremental --validate
```
