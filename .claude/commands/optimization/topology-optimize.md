# topology-optimize

Optimize swarm topology for current workload.

## Usage
```bash
npx ruflo@3.76.0 optimization topology-optimize [options]
```

## Options
- `--analyze-first` - Analyze before optimizing
- `--target <metric>` - Optimization target
- `--apply` - Apply optimizations

## Examples
```bash
# Analyze and suggest
npx ruflo@3.76.0 optimization topology-optimize --analyze-first

# Optimize for speed
npx ruflo@3.76.0 optimization topology-optimize --target speed

# Apply changes
npx ruflo@3.76.0 optimization topology-optimize --target efficiency --apply
```
