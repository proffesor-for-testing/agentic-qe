# smart-spawn

Intelligently spawn agents based on workload analysis.

## Usage
```bash
npx ruflo@3.76.0 automation smart-spawn [options]
```

## Options
- `--analyze` - Analyze before spawning
- `--threshold <n>` - Spawn threshold
- `--topology <type>` - Preferred topology

## Examples
```bash
# Smart spawn with analysis
npx ruflo@3.76.0 automation smart-spawn --analyze

# Set spawn threshold
npx ruflo@3.76.0 automation smart-spawn --threshold 5

# Force topology
npx ruflo@3.76.0 automation smart-spawn --topology hierarchical
```
