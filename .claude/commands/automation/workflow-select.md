# workflow-select

Automatically select optimal workflow based on task type.

## Usage
```bash
npx ruflo@3.76.0 automation workflow-select [options]
```

## Options
- `--task <description>` - Task description
- `--constraints <list>` - Workflow constraints
- `--preview` - Preview without executing

## Examples
```bash
# Select workflow for task
npx ruflo@3.76.0 automation workflow-select --task "Deploy to production"

# With constraints
npx ruflo@3.76.0 automation workflow-select --constraints "no-downtime,rollback"

# Preview mode
npx ruflo@3.76.0 automation workflow-select --task "Database migration" --preview
```
