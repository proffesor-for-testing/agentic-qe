# real-time-view

Real-time view of swarm activity.

## Usage
```bash
npx ruflo@3.76.0 monitoring real-time-view [options]
```

## Options
- `--filter <type>` - Filter view
- `--highlight <pattern>` - Highlight pattern
- `--tail <n>` - Show last N events

## Examples
```bash
# Start real-time view
npx ruflo@3.76.0 monitoring real-time-view

# Filter errors
npx ruflo@3.76.0 monitoring real-time-view --filter errors

# Highlight pattern
npx ruflo@3.76.0 monitoring real-time-view --highlight "API"
```
