# agent-spawn

Spawn a new agent in the current swarm.

## Usage
```bash
npx ruflo@3.76.0 agent spawn [options]
```

## Options
- `--type <type>` - Agent type (coder, researcher, analyst, tester, coordinator)
- `--name <name>` - Custom agent name
- `--skills <list>` - Specific skills (comma-separated)

## Examples
```bash
# Spawn coder agent
npx ruflo@3.76.0 agent spawn --type coder

# With custom name
npx ruflo@3.76.0 agent spawn --type researcher --name "API Expert"

# With specific skills
npx ruflo@3.76.0 agent spawn --type coder --skills "python,fastapi,testing"
```
