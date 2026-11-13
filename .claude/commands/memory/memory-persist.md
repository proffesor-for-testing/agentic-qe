# memory-persist

Persist memory across sessions.

## Usage
```bash
npx ruflo@3.76.0 memory persist [options]
```

## Options
- `--export <file>` - Export to file
- `--import <file>` - Import from file
- `--compress` - Compress memory data

## Examples
```bash
# Export memory
npx ruflo@3.76.0 memory persist --export memory-backup.json

# Import memory
npx ruflo@3.76.0 memory persist --import memory-backup.json

# Compressed export
npx ruflo@3.76.0 memory persist --export memory.gz --compress
```
