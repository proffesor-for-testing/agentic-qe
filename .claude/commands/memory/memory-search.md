# memory-search

Search through stored memory.

## Usage
```bash
npx ruflo@3.76.0 memory search [options]
```

## Options
- `--query <text>` - Search query
- `--pattern <regex>` - Pattern matching
- `--limit <n>` - Result limit

## Examples
```bash
# Search memory
npx ruflo@3.76.0 memory search --query "authentication"

# Pattern search
npx ruflo@3.76.0 memory search --pattern "api-.*"

# Limited results
npx ruflo@3.76.0 memory search --query "config" --limit 10
```
