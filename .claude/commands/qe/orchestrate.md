# Orchestrate QE Testing

Orchestrate comprehensive testing using SDLC-aligned swarms.

## Usage
```bash
aqe orchestrate --phase <sdlc-phase> --objective "<goal>"
aqe orchestrate --swarm <swarm-name> --strategy <strategy>
```

## SDLC Phases
- **requirements**: Requirements analysis and validation
- **design**: Design review and architecture validation
- **development**: TDD and unit testing
- **integration**: Integration and API testing
- **testing**: Comprehensive testing phase
- **deployment**: Deployment validation
- **production**: Production monitoring
- **continuous**: Continuous improvement

## Strategies
- **parallel**: All agents work simultaneously (fastest)
- **sequential**: Agents build on each other's work (thorough)
- **hierarchical**: Leaders analyze first, then delegate (organized)
- **adaptive**: Dynamic selection based on analysis (smart)

## Examples
```bash
# Orchestrate by phase
aqe orchestrate --phase testing --objective "Complete test coverage"

# Orchestrate specific swarm
aqe orchestrate --swarm e2e-journey --strategy sequential

# Full SDLC orchestration
aqe orchestrate --phase all --objective "Release validation"
```
