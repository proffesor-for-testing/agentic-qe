# agent-metrics

View agent performance metrics.

## Usage
```bash
npx ruflo@3.76.0 agent metrics [options]
```

## Options
- `--agent-id <id>` - Specific agent
- `--period <time>` - Time period
- `--format <type>` - Output format

## Examples
```bash
# All agents metrics
npx ruflo@3.76.0 agent metrics

# Specific agent
npx ruflo@3.76.0 agent metrics --agent-id agent-001

# Last hour
npx ruflo@3.76.0 agent metrics --period 1h
```
