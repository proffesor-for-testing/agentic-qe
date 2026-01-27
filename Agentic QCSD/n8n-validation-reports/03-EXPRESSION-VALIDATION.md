# n8n Expression Validation Report

## Workflow Summary
- **Workflow ID:** wFp8WszRSWcKuhGA
- **Workflow Name:** Agentic_Marketing_Performance_Dept_v02
- **Total Nodes:** 26
- **Code Nodes:** 7
- **Nodes with Expressions:** 8

---

## 1. Code Node Analysis

### Code Node 1: "Cleanup Output to JSON" (Meta Ads)

```javascript
// 1. Get the raw text
const rawText = $input.all()[0].json.output;

// 2. Smart Extraction: Find the JSON block
const markdownMatch = rawText.match(/```json([\s\S]*?)```/);
let cleanText = markdownMatch ? markdownMatch[1] : rawText;

// Fallback: If no markdown tags, grab from first { to last }
if (!markdownMatch) {
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        cleanText = rawText.substring(firstBrace, lastBrace + 1);
    }
}

// 3. Sanitize HTML attributes
cleanText = cleanText.replace(/class="([^"]*)"/g, "class='$1'");

try {
    const actualData = JSON.parse(cleanText);
    return { json: actualData };
} catch (e) {
    return {
        json: {
            error: "JSON Parse Failed",
            message: e.message,
            debug_text: cleanText
        }
    };
}
```

| Check | Status | Notes |
|-------|--------|-------|
| Syntax | PASS | Valid JavaScript |
| Null Safety | WARNING | `$input.all()[0]` may fail if input is empty |
| Error Handling | PASS | Has try/catch with debug output |
| Security | PASS | No dangerous functions |

**Issues:**
1. **WARNING - Null Reference Risk:**
   - `$input.all()[0].json.output` - No check if array is empty
   - **Fix:** `const rawText = $input.all()[0]?.json?.output ?? "";`

2. **WARNING - Incomplete HTML Sanitization:**
   - Only sanitizes `class="..."`, but not `style="..."`, `id="..."`, etc.

---

### Code Node 2: "Format Output" (Meta Ads)

```javascript
const adsData = $input.all()[0].json.data;

let markdownTable = "| Ad Name | Spend | Impressions | CPM | CTR | Clicks |\n";
markdownTable += "|---|---|---|---|---|---|\n";

for (const ad of adsData) {
  markdownTable += `| ${ad.ad_name} | ${ad.spend} | ${ad.impressions} | ${ad.cpm} | ${ad.ctr} | ${ad.clicks} |\n`;
}

const totalSpend = adsData.reduce((acc, curr) => acc + parseFloat(curr.spend || 0), 0);

return {
  json: {
    table_text: markdownTable,
    total_spend: totalSpend.toFixed(2)
  }
};
```

| Check | Status | Notes |
|-------|--------|-------|
| Syntax | PASS | Valid JavaScript |
| Null Safety | WARNING | No null checks for API response |
| Error Handling | FAIL | No try/catch |
| Security | PASS | No dangerous functions |

**Issues:**
1. **ERROR - No Error Handling:**
   - If Meta API returns an error, `json.data` will be undefined
   - **Fix:** Add try/catch and validation

2. **WARNING - Potential NaN:**
   - `parseFloat(curr.spend || 0)` could produce NaN if spend is non-numeric string
   - **Fix:** `parseFloat(curr.spend) || 0`

---

### Code Node 3: "Cleanup Output to JSON1" (Spotify)

```javascript
const rawText = $input.all()[0].json.output;
const cleanText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
const actualData = JSON.parse(cleanText);
return { json: actualData };
```

| Check | Status | Notes |
|-------|--------|-------|
| Syntax | PASS | Valid JavaScript |
| Null Safety | WARNING | No null checks |
| Error Handling | FAIL | **CRITICAL** - No try/catch around JSON.parse |
| Security | PASS | No dangerous functions |

**Issues:**
1. **ERROR - No Error Handling:**
   - JSON.parse will throw if AI output is malformed
   - This node is less robust than similar nodes in the workflow
   - **Fix:** Should use the same pattern as "Cleanup Output to JSON"

---

### Code Node 4: "Cleanup Output to JSON2" (Director)

```javascript
return items.map(item => {
  const raw = item.json.output || "";

  const firstOpen = raw.indexOf('{');
  const lastClose = raw.lastIndexOf('}');
  if (firstOpen === -1 || lastClose === -1) {
      return { json: { error: "No JSON brackets found", raw_output: raw } };
  }

  let jsonString = raw.substring(firstOpen, lastClose + 1);
  jsonString = jsonString.replace(/\n/g, " ").replace(/\r/g, "");

  // Smart quote sanitization with lookbehind
  const bodyPattern = /("email_body"\s*:\s*")(.*?)("\s*,\s*"key_insight")/s;
  const match = jsonString.match(bodyPattern);

  if (match) {
      const prefix = match[1];
      let content = match[2];
      const suffix = match[3];
      content = content.replace(/(?<!\\)"/g, '\\"');
      jsonString = jsonString.replace(match[0], prefix + content + suffix);
  }

  try {
    const data = JSON.parse(jsonString);
    return { json: data };
  } catch (e) {
    return {
        json: {
            parse_error: e.message,
            debug_tip: "Check the 'sanitized_string' below",
            sanitized_string: jsonString
        }
    };
  }
});
```

| Check | Status | Notes |
|-------|--------|-------|
| Syntax | PASS | Valid JavaScript |
| Null Safety | PASS | Uses `|| ""` fallback |
| Error Handling | PASS | Has try/catch with debug output |
| Security | PASS | No dangerous functions |

**Issues:**
1. **WARNING - Lookbehind Compatibility:**
   - `(?<!\\)` is a negative lookbehind - may fail in older JavaScript engines

2. **WARNING - Brittle Pattern Matching:**
   - Hardcoded dependency on `"key_insight"` field following `"email_body"`
   - If AI changes field order, sanitization will fail

---

### Code Node 5: "Cleanup Code" (Director Context)

```javascript
const items = $input.all().map(item => item.json);

let metaReport = {};
let spotifyReport = {};

for (const item of items) {
    const content = JSON.stringify(item);

    if (content.includes("Spotify") || content.includes("Streams") || content.includes("Tracks")) {
        spotifyReport = item;
    } else {
        metaReport = item;
    }
}

let contextText = "### DIRECT INPUT: META ADS REPORT\n";
contextText += `INSIGHT: ${metaReport.key_insight || "No Insight Generated"}\n`;
contextText += `FULL DETAILS:\n${metaReport.email_body || metaReport.analysis_text || "No Data"}\n\n`;

contextText += "### DIRECT INPUT: SPOTIFY REPORT\n";
contextText += `INSIGHT: ${spotifyReport.key_insight || "No Insight Generated"}\n`;
contextText += `FULL DETAILS:\n${spotifyReport.email_body || spotifyReport.analysis_text || "No Data"}\n`;

return {
    json: {
        director_context: contextText,
        meta_insight: metaReport.key_insight,
        spotify_insight: spotifyReport.key_insight
    }
};
```

| Check | Status | Notes |
|-------|--------|-------|
| Syntax | PASS | Valid JavaScript |
| Null Safety | PASS | Uses `||` fallbacks |
| Error Handling | WARNING | No error handling for JSON.stringify |
| Security | PASS | No dangerous functions |

**Issues:**
1. **WARNING - Content Detection Fragility:**
   - Using string includes for report identification is fragile
   - If Meta report mentions "Spotify" it would be misclassified
   - **Fix:** Use explicit source tracking in previous nodes

---

### Code Node 6: "CMO Full Context"

```javascript
const items = $input.all().map(item => item.json);

let metaData = "No Data";
let spotifyData = "No Data";
let directorStrategy = "No Strategy Generated";

for (const item of items) {
    const text = JSON.stringify(item);

    if (text.includes("Meta Ads Report") || (item.director_context && item.director_context.includes("Meta"))) {
        if (item.director_context) {
             metaData = "See Analyst Section Below";
             spotifyData = "See Analyst Section Below";
             if (item.meta_insight) metaData = item.meta_insight + "\n" + (item.meta_body || "");
             if (item.spotify_insight) spotifyData = item.spotify_insight + "\n" + (item.spotify_body || "");
        }
    }

    if (item.email_subject && item.email_subject.includes("Strategy")) {
        directorStrategy = `SUBJECT: ${item.email_subject}\nINSIGHT: ${item.key_insight}\nBODY:\n${item.email_body}`;
    }
}

let context = "### LEVEL 1: ANALYST RAW DATA\n";
context += `--- META ADS ---\n${metaData.substring(0, 1000)}...\n\n`;
context += `--- SPOTIFY ---\n${spotifyData.substring(0, 1000)}...\n\n`;

context += "### LEVEL 2: DIRECTOR'S STRATEGY\n";
context += `${directorStrategy}\n`;

return {
    json: {
        cmo_context: context
    }
};
```

| Check | Status | Notes |
|-------|--------|-------|
| Syntax | PASS | Valid JavaScript |
| Null Safety | WARNING | Potential null reference |
| Error Handling | WARNING | No try/catch |
| Security | PASS | No dangerous functions |

**Issues:**
1. **WARNING - Null Reference Risk:**
   - `item.email_subject.includes("Strategy")` - email_subject could be undefined
   - **Fix:** `item.email_subject?.includes("Strategy")`

---

### Code Node 7: "Code Cleanup CMO"

```javascript
const rawText = $input.first().json.output;

const markdownMatch = rawText.match(/```json([\s\S]*?)```/);
let cleanText = markdownMatch ? markdownMatch[1] : rawText;

if (!markdownMatch) {
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        cleanText = rawText.substring(firstBrace, lastBrace + 1);
    }
}

cleanText = cleanText.replace(/class="([^"]*)"/g, "class='$1'");
cleanText = cleanText.replace(/style="([^"]*)"/g, "style='$1'");

try {
    return { json: JSON.parse(cleanText) };
} catch (e) {
    return {
        json: {
            email_subject: "CMO JSON Error",
            email_body: "The CMO generated invalid JSON. Raw output:<br>" + rawText,
            key_insight: "JSON Parsing Failed"
        }
    };
}
```

| Check | Status | Notes |
|-------|--------|-------|
| Syntax | PASS | Valid JavaScript |
| Null Safety | WARNING | No null check on $input.first() |
| Error Handling | PASS | Has try/catch with fallback |
| Security | PASS | No dangerous functions |

**Issues:**
1. **WARNING - Inconsistent Sanitization:**
   - This node sanitizes both `class` and `style`, but "Cleanup Output to JSON" only sanitizes `class`
   - Should use consistent sanitization across all cleanup nodes

---

### Code Node 8: "Merge Spotify Data"

| Check | Status | Notes |
|-------|--------|-------|
| Syntax | PASS | Valid JavaScript |
| Null Safety | PASS | Good null checks |
| Error Handling | WARNING | No try/catch |
| Security | PASS | No dangerous functions |

**Issues:**
1. **WARNING - parseInt Without Radix:**
   - `parseInt(data.streams)` should be `parseInt(data.streams, 10)`
   - Best practice to always specify radix

---

## 2. Expression Analysis

### Agent Prompt Expressions

**Meta Ads Agent:**
```
={{ $json["system_instruction"] }}
TASK: Analyze the following Meta Ads performance data.
TOTAL SPEND: €{{ $json["total_spend"] }}
DATA TABLE: {{ $json["table_text"] }}
```
| Check | Status |
|-------|--------|
| Syntax | PASS |
| Context Variables | PASS |
| Data Access | WARNING (no null safety) |

**Spotify AI Agent:**
```
={{ $json["system_instruction"] }}
REPORT DATE: {{ $json["report_date"] }}
DATA CONTEXT: {{ $json["table_text"] }}
```
| Check | Status |
|-------|--------|
| Syntax | PASS |
| Context Variables | PASS |
| Data Access | WARNING (no null safety) |

**Marketing Director:**
```
={{ $json["director_context"] }}
```
| Check | Status |
|-------|--------|
| Syntax | PASS |
| Data Access | WARNING (no null safety) |

**CMO:**
```
={{ $json["cmo_context"] }}
```
| Check | Status |
|-------|--------|
| Syntax | PASS |
| Data Access | WARNING (no null safety) |

---

## Summary of Issues

| Severity | Count | Description |
|----------|-------|-------------|
| ERROR | 2 | Missing error handling in code nodes |
| WARNING | 12 | Null safety, inconsistent patterns |
| INFO | 3 | Best practice recommendations |

### Critical Fixes Required

1. **Add try/catch to "Cleanup Output to JSON1"** - Prevents workflow crashes
2. **Add null safety to all code nodes** - Use optional chaining (`?.`)
3. **Standardize JSON cleanup pattern** - All 4 cleanup nodes should use same approach

### Recommended Standardized Cleanup Function

```javascript
function cleanAIOutput(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        return { error: true, email_body: "<p>No output</p>", key_insight: "N/A" };
    }

    // Extract JSON from markdown
    const markdownMatch = rawText.match(/```json([\s\S]*?)```/);
    let cleanText = markdownMatch ? markdownMatch[1] : rawText;

    // Fallback: find JSON brackets
    if (!markdownMatch) {
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            cleanText = rawText.substring(firstBrace, lastBrace + 1);
        }
    }

    // Sanitize HTML attributes
    cleanText = cleanText.replace(/class="([^"]*)"/g, "class='$1'");
    cleanText = cleanText.replace(/style="([^"]*)"/g, "style='$1'");
    cleanText = cleanText.replace(/id="([^"]*)"/g, "id='$1'");

    try {
        return JSON.parse(cleanText);
    } catch (e) {
        return {
            error: true,
            email_body: "<p>JSON parsing failed. Please check logs.</p>",
            key_insight: "Parsing Error",
            debug: e.message
        };
    }
}
```
