# swarm-init

Initialize a new swarm with specified topology.

## Usage
```bash
npx ruflo@3.76.0 swarm init [options]
```

## Options
- `--topology <type>` - Swarm topology (mesh, hierarchical, ring, star)
- `--max-agents <n>` - Maximum agents
- `--strategy <type>` - Distribution strategy

## Examples
```bash
npx ruflo@3.76.0 swarm init --topology mesh
npx ruflo@3.76.0 swarm init --topology hierarchical --max-agents 8
```
