#!/bin/bash
# Swarm coordination hook

# Get swarm status
npx claude-flow@alpha swarm status --id "$1"

# Coordinate agents
npx claude-flow@alpha swarm coordinate --id "$1" --strategy "$2"

# Share context
npx claude-flow@alpha memory share --swarm "$1"
