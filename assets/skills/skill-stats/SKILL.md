---
name: skill-stats
description: "Use when reviewing which QE skills are being used, finding undertriggering skills, or analyzing skill effectiveness. Shows usage patterns and recommendations."
user-invocable: true
---

# Skill Usage Statistics

View QE skill usage patterns to identify popular skills, undertriggering skills, and optimization opportunities.

## Activation

```
/skill-stats
```

## What It Reports

1. **Most Used Skills** — Top 10 skills by invocation count
2. **Undertriggering Skills** — Skills with good descriptions but low usage
3. **Never Used Skills** — Skills that have never been triggered
4. **Trigger Method** — How skills are activated (explicit /command vs auto-selected)
5. **Recommendations** — Skills to improve, merge, or deprecate

## Usage Log Format

Skill invocations are logged to `${CLAUDE_PLUGIN_DATA}/skill-usage.log`:

```
2026-03-18T10:30:00Z|security-testing|explicit|/security-testing
2026-03-18T10:45:00Z|qe-test-generation|auto|model-selected
2026-03-18T11:00:00Z|mutation-testing|explicit|/mutation-testing
```

## Hook Configuration

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Skill",
        "hook": ".claude/skills/skill-stats/scripts/log-usage.sh"
      }
    ]
  }
}
```

## Analysis Script

```bash
#!/bin/bash
# analyze-usage.sh
LOG="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugin-data}/skill-usage.log"

if [ ! -f "$LOG" ]; then
  echo "No usage data yet. Skills will be logged as they are used."
  exit 0
fi

echo "=== Skill Usage Report ==="
echo ""
echo "Top 10 Most Used:"
cut -d'|' -f2 "$LOG" | sort | uniq -c | sort -rn | head -10
echo ""
echo "Trigger Method Breakdown:"
cut -d'|' -f3 "$LOG" | sort | uniq -c | sort -rn
echo ""
echo "Skills Used in Last 7 Days:"
WEEK_AGO=$(date -d '7 days ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -v-7d +%Y-%m-%dT%H:%M:%S)
awk -F'|' -v since="$WEEK_AGO" '$1 >= since' "$LOG" | cut -d'|' -f2 | sort | uniq -c | sort -rn
```

## Gotchas

- Log file grows unbounded — rotate periodically with `tail -n 1000 $LOG > $LOG.tmp && mv $LOG.tmp $LOG`
- Auto-selected skills may not always be the best match — review undertriggering skills for description improvements
- Usage count alone doesn't indicate quality — a skill used 100x but failing 50% needs fixing, not celebrating
