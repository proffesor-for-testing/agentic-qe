# token-usage

Analyze token usage patterns and optimize for efficiency.

## Usage
```bash
npx ruflo@3.76.0 analysis token-usage [options]
```

## Options
- `--period <time>` - Analysis period (1h, 24h, 7d, 30d)
- `--by-agent` - Break down by agent
- `--by-operation` - Break down by operation type

## Examples
```bash
# Last 24 hours token usage
npx ruflo@3.76.0 analysis token-usage --period 24h

# By agent breakdown
npx ruflo@3.76.0 analysis token-usage --by-agent

# Export detailed report
npx ruflo@3.76.0 analysis token-usage --period 7d --export tokens.csv
```
