---
name: "browser"
description: "Automate web browsers with AI-optimized accessibility snapshots using element refs. Navigate, click, fill forms, extract data, and capture screenshots. Use when scraping websites, testing UIs, or automating web workflows."
---

# Browser Automation

Web browser automation using agent-browser with AI-optimized snapshots. Reduces context by 93% using element refs (`@e1`, `@e2`) instead of full DOM.

## Core Workflow

```bash
# 1. Navigate
agent-browser open <url>

# 2. Get accessibility tree with element refs
agent-browser snapshot -i    # -i = interactive elements only

# 3. Interact using refs
agent-browser click @e2
agent-browser fill @e3 "text"

# 4. Re-snapshot after changes
agent-browser snapshot -i
```

## Command Reference

### Navigation

| Command | Description |
|---------|-------------|
| `open <url>` | Navigate to URL |
| `back` / `forward` | History navigation |
| `reload` | Reload page |
| `close` | Close browser |

### Snapshots

| Command | Description |
|---------|-------------|
| `snapshot` | Full accessibility tree |
| `snapshot -i` | Interactive elements only |
| `snapshot -c` | Compact (no empty elements) |
| `snapshot -d 3` | Limit depth to 3 levels |
| `screenshot [path]` | Capture screenshot |

### Interaction

| Command | Description |
|---------|-------------|
| `click <sel>` | Click element |
| `fill <sel> <text>` | Clear and fill input |
| `type <sel> <text>` | Type with key events |
| `press <key>` | Press key (Enter, Tab) |
| `hover <sel>` | Hover element |
| `select <sel> <val>` | Select dropdown option |
| `check/uncheck <sel>` | Toggle checkbox |
| `scroll <dir> [px]` | Scroll page |

### Data Extraction

| Command | Description |
|---------|-------------|
| `get text <sel>` | Get text content |
| `get html <sel>` | Get innerHTML |
| `get value <sel>` | Get input value |
| `get attr <sel> <attr>` | Get attribute |
| `get title` / `get url` | Page metadata |

### Wait

| Command | Description |
|---------|-------------|
| `wait <selector>` | Wait for element |
| `wait <ms>` | Wait milliseconds |
| `wait --text "text"` | Wait for text |
| `wait --url "pattern"` | Wait for URL |
| `wait --load networkidle` | Wait for load state |

## Selectors

**Element Refs (recommended):**
```bash
agent-browser snapshot -i
# Output: button "Submit" [ref=e2]
agent-browser click @e2
```

**CSS Selectors:**
```bash
agent-browser click "#submit"
agent-browser fill ".email-input" "test@test.com"
```

**Semantic Locators:**
```bash
agent-browser find role button click --name "Submit"
agent-browser find label "Email" fill "test@test.com"
agent-browser find testid "login-btn" click
```

## Examples

### Login Flow

```bash
agent-browser open https://example.com/login
agent-browser snapshot -i
agent-browser fill @e2 "user@example.com"
agent-browser fill @e3 "password123"
agent-browser click @e4
agent-browser wait --url "**/dashboard"
```

### Data Extraction

```bash
agent-browser open https://example.com/products
agent-browser snapshot -i
agent-browser get text @e1   # Product name
agent-browser get text @e2   # Price
agent-browser get attr @e3 href  # Link
```

### Multi-Session (Swarm)

```bash
# Session 1: Navigator
agent-browser --session nav open https://example.com
agent-browser --session nav state save auth.json

# Session 2: Scraper (reuses auth)
agent-browser --session scrape state load auth.json
agent-browser --session scrape open https://example.com/data
agent-browser --session scrape snapshot -i
```

## Tips

1. **Always snapshot** -- refs are optimized for AI context
2. **Use `-i` flag** -- interactive elements only, smaller output
3. **Prefer refs over selectors** -- more reliable, deterministic
4. **Re-snapshot after navigation** -- page state changes
5. **Use sessions for parallel work** -- each session is isolated
