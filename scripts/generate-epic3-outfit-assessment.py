#!/usr/bin/env python3
"""Generate Product Factors Assessment for Epic 3: Outfit-First Shopping Experience"""

import hashlib
from datetime import datetime

def generate_id(prefix: str, text: str) -> str:
    """Generate unique test ID"""
    hash_val = hashlib.md5(text.encode()).hexdigest()[:8].upper()
    return f"TC-{prefix}-{hash_val}"

# Feature extraction from User Stories
FEATURES = {
    "US3.1": [
        "Complete the Look section display",
        "3-5 styled outfit cards presentation",
        "Total price calculation per outfit",
        "Shop All button functionality",
        "Quick-view of all items in outfit",
        "Individual add-to-cart from outfit"
    ],
    "US3.2": [
        "Style preference matching (casual, formal, sporty)",
        "Color compatibility checking algorithm",
        "Seasonal appropriateness filtering",
        "User feedback learning integration",
        "Purchase history analysis",
        "Browsing behavior pattern recognition"
    ],
    "US3.3": [
        "Virtual outfit builder activation",
        "Piece swapper - click item to see alternatives",
        "Style-matched alternative suggestions",
        "Real-time outfit preview updates",
        "Customization state persistence",
        "Save outfit to wishlist",
        "Direct purchase of assembled outfit"
    ],
    "US3.4": [
        "Size profile filtering",
        "Available size display per item",
        "Alternatives when size unavailable",
        "Cross-brand sizing handling"
    ]
}

# Test ideas organized by SFDIPOT category
tests = {
    "structure": [],
    "function": [],
    "data": [],
    "interfaces": [],
    "platform": [],
    "operations": [],
    "time": []
}

# STRUCTURE Tests (14 tests) - Rebalanced priorities
structure_tests = [
    ("P2", "Code", "Test that Outfit Recommendation Service integrates correctly with Product Catalog API"),
    ("P2", "Code", "Test that Style Matching Engine connects to User Preference Database"),
    ("P2", "Code", "Test that Mix & Match Tool component integrates with Inventory Service"),
    ("P2", "Code", "Test that Size Compatibility Module connects to Brand Sizing Database"),
    ("P1", "Code", "Test that Outfit Builder persists state to Session Storage Service"),
    ("P2", "Code", "Test that Price Calculator component receives real-time pricing from Pricing API"),
    ("P2", "Service", "Trigger health check on Outfit Recommendation Service and validate response"),
    ("P2", "Service", "Trigger health check on Style Matching Engine and validate startup"),
    ("P3", "Service", "Trigger health check on Mix & Match Tool backend service"),
    ("P2", "Dependencies", "Simulate Product Catalog API unavailability and test graceful degradation"),
    ("P2", "Dependencies", "Simulate Inventory Service timeout and test fallback behavior"),
    ("P2", "Dependencies", "Force User Preference Database connection failure and test error handling"),
    ("P3", "NonExecutable", "Test that outfit configuration templates load correctly from CDN"),
    ("P3", "NonExecutable", "Test that style matching rules configuration is properly versioned")
]

for p, sub, desc in structure_tests:
    tests["structure"].append({
        "id": generate_id("STRU", desc),
        "priority": p,
        "subcategory": sub,
        "description": desc,
        "automation": "Automate on Integration level" if "Service" in sub or "Code" in sub else "Automate on API level"
    })

# FUNCTION Tests (32 tests) - Core business logic - Rebalanced
function_tests = [
    # US3.1 - Outfit Suggestions
    ("P0", "SecurityRelated", "Test that Complete the Look section only displays for authenticated users with valid session"),
    ("P1", "BusinessRules", "Test that exactly 3-5 styled outfit cards display when Complete the Look section loads"),
    ("P2", "Calculation", "Inject test prices and validate total outfit price calculation accuracy to 2 decimal places"),
    ("P1", "BusinessRules", "Test that Shop All button adds all outfit items to cart in single transaction"),
    ("P2", "BusinessRules", "Test that quick-view modal displays all items with thumbnails, names, and individual prices"),
    ("P2", "BusinessRules", "Test that individual add-to-cart from outfit updates cart count and preserves outfit context"),

    # US3.2 - Style Matching Algorithm
    ("P0", "SecurityRelated", "Test that style preference data is encrypted at rest and in transit"),
    ("P2", "Calculation", "Inject casual style preference and validate algorithm returns casual-matched items only"),
    ("P2", "Calculation", "Inject formal style preference and validate algorithm excludes casual items"),
    ("P2", "Calculation", "Inject sporty style preference and validate athletic wear prioritization"),
    ("P2", "Calculation", "Test color compatibility scoring returns items within 85% color harmony threshold"),
    ("P3", "Calculation", "Test seasonal filter excludes winter items during summer season configuration"),
    ("P2", "BusinessRules", "Simulate user thumbs-down feedback and validate item excluded from future suggestions"),
    ("P2", "BusinessRules", "Inject purchase history with denim preference and validate denim items ranked higher"),
    ("P3", "BusinessRules", "Test browsing behavior analysis weights recent views higher than older views"),

    # US3.3 - Mix & Match Tool (CRITICAL - Piece Swapper)
    ("P0", "SecurityRelated", "Test that virtual outfit builder requires authentication before activation"),
    ("P2", "BusinessRules", "Test that clicking outfit builder Activate button initializes empty canvas state"),
    ("P0", "BusinessRules", "Test that clicking any outfit item triggers piece swapper with alternative suggestions"),
    ("P1", "BusinessRules", "Test that piece swapper displays minimum 5 style-matched alternatives per item slot"),
    ("P1", "BusinessRules", "Test that selecting alternative item triggers real-time outfit preview update under 500ms"),
    ("P2", "BusinessRules", "Test that outfit preview reflects new item selection immediately without page refresh"),
    ("P0", "BusinessRules", "Test that customization state persists when user navigates away and returns"),
    ("P2", "BusinessRules", "Test that customization state survives browser refresh via session storage"),
    ("P2", "BusinessRules", "Test that Save to Wishlist button stores complete outfit configuration"),
    ("P1", "BusinessRules", "Test that Direct Purchase button initiates checkout with all customized items"),

    # US3.4 - Size Compatibility
    ("P2", "BusinessRules", "Test that size profile filter excludes items not available in user's saved sizes"),
    ("P2", "BusinessRules", "Test that available size badges display correctly for each outfit item"),
    ("P1", "BusinessRules", "Test that out-of-stock size triggers alternative suggestion with available sizes"),
    ("P3", "Calculation", "Test cross-brand size mapping converts EU sizes to US sizes correctly"),
    ("P3", "Calculation", "Test cross-brand size mapping handles UK sizing differences"),

    # Error Handling
    ("P2", "ErrorHandling", "Simulate style matching API failure and validate user-friendly error message"),
    ("P2", "ErrorHandling", "Force inventory check timeout and validate graceful degradation with cached data")
]

for p, sub, desc in function_tests:
    auto = "Automate on E2E level"
    if "Calculation" in sub or "API" in desc.lower():
        auto = "Automate on API level"
    elif "Security" in sub:
        auto = "Security testing recommended"
    tests["function"].append({
        "id": generate_id("FUNC", desc),
        "priority": p,
        "subcategory": sub,
        "description": desc,
        "automation": auto
    })

# DATA Tests (18 tests) - Rebalanced
data_tests = [
    ("P0", "InputOutput", "Inject SQL injection payload in outfit search and validate sanitization"),
    ("P0", "InputOutput", "Inject XSS script in outfit name field and validate encoding"),
    ("P2", "InputOutput", "Test outfit with maximum 10 items processes correctly"),
    ("P2", "InputOutput", "Test outfit with minimum 2 items displays properly"),
    ("P2", "Boundaries", "Test price calculation with maximum item price of 9999.99"),
    ("P2", "Boundaries", "Test price calculation with minimum item price of 0.01"),
    ("P3", "Boundaries", "Test outfit total with 10 maximum-priced items does not overflow"),
    ("P2", "InvalidNoise", "Submit outfit with empty item array and validate rejection with error message"),
    ("P2", "InvalidNoise", "Submit outfit with null price values and validate error handling"),
    ("P2", "InvalidNoise", "Submit piece swapper request with invalid item ID and validate 404 response"),
    ("P3", "InvalidNoise", "Submit style preference with unsupported style type and validate fallback"),
    ("P1", "Persistence", "Test that saved outfit configuration persists across user sessions"),
    ("P2", "Persistence", "Test that wishlist outfit survives account logout and login cycle"),
    ("P3", "Persistence", "Test that browsing-based recommendations persist for 30 days"),
    ("P2", "Lifecycle", "Test outfit draft state transitions to saved state correctly"),
    ("P3", "Lifecycle", "Test outfit item removal updates total price immediately"),
    ("P3", "Lifecycle", "Test outfit state cleanup when user clears browser data"),
    ("P3", "BigLittle", "Test outfit display with product names containing 200+ characters")
]

for p, sub, desc in data_tests:
    auto = "Automate on API level"
    if "Security" in desc or "injection" in desc.lower() or "XSS" in desc:
        auto = "Security testing recommended"
    tests["data"].append({
        "id": generate_id("DATA", desc),
        "priority": p,
        "subcategory": sub,
        "description": desc,
        "automation": auto
    })

# INTERFACES Tests (22 tests) - Rebalanced with more Human tests
interface_tests = [
    # UI Tests
    ("P2", "UserInterface", "Test Complete the Look section renders correctly on product detail page"),
    ("P2", "UserInterface", "Test outfit cards display product images, names, and prices in grid layout"),
    ("P2", "UserInterface", "Test Shop All button is visually prominent with hover state feedback"),
    ("P1", "UserInterface", "Test piece swapper overlay displays when clicking outfit item"),
    ("P2", "UserInterface", "Test alternative suggestions panel shows scrollable grid of options"),
    ("P2", "UserInterface", "Test real-time preview area updates smoothly without layout shift"),
    ("P3", "UserInterface", "Test outfit builder canvas supports drag-and-drop item positioning"),
    ("P3", "UserInterface", "Test size selector dropdown displays available sizes with stock indicators"),

    # API Tests
    ("P2", "API", "Test GET /api/outfits/suggestions returns valid outfit array for product ID"),
    ("P2", "API", "Test GET /api/style-matching/alternatives returns style-matched items"),
    ("P2", "API", "Test POST /api/outfit-builder/save persists outfit configuration"),
    ("P2", "API", "Test PUT /api/outfit-builder/update modifies existing outfit"),
    ("P3", "API", "Test DELETE /api/outfit-builder/item removes single item from outfit"),
    ("P2", "API", "Test GET /api/size-compatibility returns cross-brand size mappings"),
    ("P0", "API", "Test API rate limiting prevents abuse with 429 response after 100 requests/minute"),

    # Integration Tests
    ("P1", "SystemInterfaces", "Test outfit service integrates with payment gateway for direct purchase"),
    ("P2", "SystemInterfaces", "Test wishlist integration saves complete outfit metadata"),
    ("P3", "SystemInterfaces", "Test analytics integration tracks outfit interaction events"),
    ("P3", "SystemInterfaces", "Test inventory webhook updates outfit availability in real-time"),

    # Human Exploration - WHY HUMAN ESSENTIAL included
    ("P1", "UserInterface", "Explore outfit builder usability for first-time users - Why Human Essential: Subjective UX assessment of discoverability and intuitive design cannot be automated", "human"),
    ("P1", "UserInterface", "Explore piece swapper click-to-swap interaction flow - Why Human Essential: Testing mental model alignment requires human cognitive evaluation", "human"),
    ("P2", "UserInterface", "Explore visual feedback clarity when customization state is saved - Why Human Essential: Perception of confirmation cues varies by user", "human"),
    ("P1", "UserInterface", "Explore style-matched alternatives relevance and appeal - Why Human Essential: Fashion judgment requires human aesthetic assessment", "human"),
    ("P2", "UserInterface", "Explore real-time preview smoothness perception - Why Human Essential: Perceived performance differs from measured latency", "human"),
    ("P1", "UserInterface", "Explore outfit builder on mobile touch interactions - Why Human Essential: Touch gesture naturalness requires tactile human testing", "human"),
    ("P2", "UserInterface", "Explore size unavailable messaging clarity - Why Human Essential: Emotional impact of out-of-stock messaging needs human evaluation", "human")
]

for item in interface_tests:
    p, sub, desc = item[0], item[1], item[2]
    is_human = len(item) > 3 and item[3] == "human"

    auto = "Automate on E2E level"
    if "API" in sub and "UserInterface" not in sub:
        auto = "Automate on API level"
    elif "SystemInterfaces" in sub:
        auto = "Automate on Integration level"
    if is_human:
        auto = "Human testers must explore"

    tests["interfaces"].append({
        "id": generate_id("INTF", desc),
        "priority": p,
        "subcategory": sub,
        "description": desc,
        "automation": auto
    })

# PLATFORM Tests (8 tests) - Rebalanced
platform_tests = [
    ("P2", "Browser", "Test outfit builder functions correctly on Chrome latest version"),
    ("P2", "Browser", "Test outfit builder functions correctly on Safari latest version"),
    ("P2", "Browser", "Test outfit builder functions correctly on Firefox latest version"),
    ("P3", "Browser", "Test outfit builder functions correctly on Edge latest version"),
    ("P2", "OS", "Test piece swapper touch interactions work on iOS Safari"),
    ("P2", "OS", "Test piece swapper touch interactions work on Android Chrome"),
    ("P3", "ExternalSystems", "Test outfit recommendations when CDN delivers cached product images"),
    ("P3", "ExternalSystems", "Test graceful degradation when third-party style API is unavailable")
]

for p, sub, desc in platform_tests:
    tests["platform"].append({
        "id": generate_id("PLAT", desc),
        "priority": p,
        "subcategory": sub,
        "description": desc,
        "automation": "Automate on E2E level" if "Browser" in sub or "OS" in sub else "Automate on Integration level"
    })

# OPERATIONS Tests (10 tests) - Rebalanced with more Human tests
operations_tests = [
    ("P1", "Users", "Explore outfit builder workflow as fashion-conscious shopper seeking complete looks - Why Human Essential: Fashion context requires human style judgment", "human"),
    ("P1", "Users", "Explore size filtering as plus-size customer with limited size availability - Why Human Essential: Empathy testing for frustration scenarios needs human testers", "human"),
    ("P2", "Users", "Explore outfit suggestions as budget-conscious shopper sorting by price - Why Human Essential: Value perception assessment requires human evaluation", "human"),
    ("P2", "CommonUse", "Test standard outfit customization flow: view suggestions, swap pieces, save, purchase"),
    ("P2", "CommonUse", "Test returning user flow: load saved outfit, modify, checkout"),
    ("P2", "ExtremeUse", "Simulate 1000 concurrent users accessing outfit builder simultaneously"),
    ("P3", "ExtremeUse", "Test outfit builder with 50 rapid piece swaps in 60 seconds"),
    ("P0", "DisfavoredUse", "Test protection against automated scraping of outfit recommendations"),
    ("P2", "Environment", "Explore outfit builder usability on slow 3G network connection - Why Human Essential: User patience threshold varies by individual", "human"),
    ("P2", "Environment", "Explore piece swapper on small mobile screen viewport - Why Human Essential: Thumb reach and tap target assessment needs human testing", "human")
]

for item in operations_tests:
    p, sub, desc = item[0], item[1], item[2]
    is_human = len(item) > 3 and item[3] == "human"

    auto = "Automate on E2E level"
    if "ExtremeUse" in sub:
        auto = "Performance testing recommended"
    elif "DisfavoredUse" in sub:
        auto = "Security testing recommended"
    if is_human:
        auto = "Human testers must explore"

    tests["operations"].append({
        "id": generate_id("OPER", desc),
        "priority": p,
        "subcategory": sub,
        "description": desc,
        "automation": auto
    })

# TIME Tests (6 tests) - Rebalanced
time_tests = [
    ("P2", "Concurrency", "Test concurrent piece swaps by same user from multiple browser tabs"),
    ("P2", "Concurrency", "Simulate race condition when two users purchase last item in outfit"),
    ("P2", "InputOutputTiming", "Test outfit preview update completes within 500ms SLA"),
    ("P3", "InputOutputTiming", "Test style matching API responds within 2 second timeout threshold"),
    ("P3", "Scheduling", "Test that seasonal style recommendations update at configured season boundaries"),
    ("P3", "Pacing", "Test burst of 20 piece swaps in 10 seconds does not degrade performance")
]

for p, sub, desc in time_tests:
    auto = "Automated Concurrency Tests"
    if "Timing" in sub or "Pacing" in sub:
        auto = "Performance testing recommended"
    tests["time"].append({
        "id": generate_id("TIME", desc),
        "priority": p,
        "subcategory": sub,
        "description": desc,
        "automation": auto
    })

# Calculate totals
total_tests = sum(len(t) for t in tests.values())
counts = {k: len(v) for k, v in tests.items()}

# Priority counts
priority_counts = {"P0": 0, "P1": 0, "P2": 0, "P3": 0}
for category in tests.values():
    for test in category:
        priority_counts[test["priority"]] += 1

# Automation counts
automation_counts = {}
for category in tests.values():
    for test in category:
        auto = test["automation"]
        if "API" in auto:
            key = "API level"
        elif "E2E" in auto:
            key = "E2E level"
        elif "Integration" in auto:
            key = "Integration level"
        elif "Human" in auto:
            key = "Human Exploration"
        elif "Performance" in auto:
            key = "Performance"
        elif "Security" in auto:
            key = "Security"
        elif "Concurrency" in auto:
            key = "Concurrency"
        else:
            key = "Other"
        automation_counts[key] = automation_counts.get(key, 0) + 1

# Validate requirements
p1_percent = (priority_counts["P1"] / total_tests) * 100
human_count = automation_counts.get("Human Exploration", 0)
human_percent = (human_count / total_tests) * 100

print(f"Total tests: {total_tests}")
print(f"P0: {priority_counts['P0']} ({priority_counts['P0']/total_tests*100:.1f}%)")
print(f"P1: {priority_counts['P1']} ({p1_percent:.1f}%) - Target <= 30%: {'PASS' if p1_percent <= 30 else 'FAIL'}")
print(f"P2: {priority_counts['P2']} ({priority_counts['P2']/total_tests*100:.1f}%)")
print(f"P3: {priority_counts['P3']} ({priority_counts['P3']/total_tests*100:.1f}%)")
print(f"Human: {human_count} ({human_percent:.1f}%) - Target >= 10%: {'PASS' if human_percent >= 10 else 'NEEDS MORE'}")
print(f"\nCategory breakdown: {counts}")
print(f"Automation breakdown: {automation_counts}")

# Generate HTML
def get_automation_class(auto):
    if "API" in auto:
        return "automation-api"
    elif "E2E" in auto:
        return "automation-e2e"
    elif "Integration" in auto:
        return "automation-integration"
    elif "Human" in auto:
        return "automation-human"
    elif "Performance" in auto:
        return "automation-performance"
    elif "Security" in auto:
        return "automation-security"
    elif "Concurrency" in auto:
        return "automation-concurrency"
    return "automation-other"

def generate_test_rows(test_list):
    rows = []
    for t in test_list:
        rows.append(f'''<tr>
          <td class="test-id">{t["id"]}</td>
          <td><span class="priority priority-{t["priority"].lower()}">{t["priority"]}</span></td>
          <td><span class="subcategory">{t["subcategory"]}</span></td>
          <td>{t["description"]}</td>
          <td><span class="automation {get_automation_class(t["automation"])}">{t["automation"]}</span></td>
        </tr>''')
    return "\n".join(rows)

# Calculate bar widths
max_count = max(counts.values())
max_priority = max(priority_counts.values())
max_auto = max(automation_counts.values()) if automation_counts else 1

html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Factors assessment of: Epic 3 - Outfit-First Shopping Experience</title>
  <style>
    :root {{
      --primary: #1e3a5f;
      --primary-dark: #0f2744;
      --primary-light: #2d5a8a;
      --accent: #0066cc;
      --success: #0d7a3f;
      --warning: #b45309;
      --danger: #b91c1c;
      --info: #0369a1;
      --bg-light: #f5f7fa;
      --bg-white: #ffffff;
      --text-dark: #1a1a2e;
      --text-muted: #5c6370;
      --border: #d1d5db;
      --border-light: #e5e7eb;
    }}
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-light);
      color: var(--text-dark);
      line-height: 1.6;
      font-size: 14px;
    }}
    .container {{ max-width: 1400px; margin: 0 auto; padding: 24px; }}
    header {{
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white;
      padding: 32px 28px;
      margin-bottom: 24px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }}
    header h1 {{ font-size: 1.75rem; margin-bottom: 8px; font-weight: 600; }}
    .section {{ background: var(--bg-white); border-radius: 8px; padding: 20px 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); border: 1px solid var(--border-light); }}
    .section h2 {{ color: var(--primary); font-size: 1.1rem; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--primary); font-weight: 600; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.85rem; }}
    th {{ background: var(--bg-light); padding: 10px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.3px; color: var(--text-muted); }}
    td {{ padding: 10px 12px; border-bottom: 1px solid var(--border-light); vertical-align: top; }}
    tr:hover {{ background: #fafbfc; }}
    .priority {{ display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; }}
    .priority-p0 {{ background: #fef2f2; color: var(--danger); border: 1px solid #fecaca; }}
    .priority-p1 {{ background: #fefce8; color: var(--warning); border: 1px solid #fef08a; }}
    .priority-p2 {{ background: #f0fdf4; color: var(--success); border: 1px solid #bbf7d0; }}
    .priority-p3 {{ background: #f0f9ff; color: var(--info); border: 1px solid #bae6fd; }}
    .subcategory {{ display: inline-block; background: #eff6ff; color: var(--primary); padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; }}
    .automation {{ display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: 500; }}
    .automation-api {{ background: #dbeafe; color: #1e40af; }}
    .automation-e2e {{ background: #fce7f3; color: #9d174d; }}
    .automation-integration {{ background: #d1fae5; color: #065f46; }}
    .automation-human {{ background: #f3e8ff; color: #7c3aed; font-weight: 600; }}
    .automation-performance {{ background: #fef3c7; color: #92400e; }}
    .automation-security {{ background: #fee2e2; color: #991b1b; }}
    .automation-concurrency {{ background: #ffedd5; color: #9a3412; }}
    .clarifying-questions {{ background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 20px 25px; margin-top: 20px; }}
    .clarifying-questions h4 {{ color: #854d0e; margin-bottom: 16px; font-size: 1.1rem; border-bottom: 2px solid #fef08a; padding-bottom: 10px; }}
    .clarifying-intro {{ background: #fef9c3; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; }}
    .clarifying-intro .preamble {{ color: #713f12; font-size: 0.9rem; line-height: 1.5; margin: 0; }}
    .subcategory-questions {{ background: white; border: 1px solid #fef08a; border-radius: 6px; padding: 15px; margin-bottom: 15px; }}
    .subcategory-questions h5 {{ color: #854d0e; font-size: 0.95rem; margin-bottom: 8px; font-weight: 700; }}
    .subcategory-questions .rationale {{ color: #92400e; font-size: 0.85rem; margin-bottom: 12px; padding: 8px 12px; background: #fef3c7; border-radius: 4px; border-left: 3px solid #f59e0b; }}
    .clarifying-questions ul {{ list-style: none; margin: 0; padding: 0; }}
    .clarifying-questions li {{ padding: 8px 0 8px 20px; position: relative; border-bottom: 1px dashed #fef08a; color: var(--text-dark); font-size: 0.9rem; }}
    .clarifying-questions li:before {{ content: "?"; position: absolute; left: 0; color: #f59e0b; font-weight: bold; }}
    .charts-container {{ display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }}
    .chart-panel {{ background: var(--bg-white); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }}
    .chart-panel h3 {{ font-size: 1.1rem; color: var(--text-dark); margin-bottom: 15px; padding-bottom: 8px; border-bottom: 2px solid var(--border); }}
    .bar-chart {{ display: flex; flex-direction: column; gap: 8px; }}
    .bar-row {{ display: flex; align-items: center; gap: 10px; }}
    .bar-label {{ width: 90px; font-size: 0.8rem; font-weight: 600; color: var(--text-dark); text-align: right; flex-shrink: 0; }}
    .bar-track {{ flex: 1; height: 24px; background: var(--bg-light); border-radius: 4px; overflow: hidden; }}
    .bar-fill {{ height: 100%; border-radius: 4px; min-width: 35px; }}
    .bar-value {{ width: 45px; font-size: 0.85rem; font-weight: 700; color: var(--text-dark); text-align: right; }}
    .bar-structure {{ background: linear-gradient(90deg, #3b82f6, #2563eb); }}
    .bar-function {{ background: linear-gradient(90deg, #8b5cf6, #7c3aed); }}
    .bar-data {{ background: linear-gradient(90deg, #06b6d4, #0891b2); }}
    .bar-interfaces {{ background: linear-gradient(90deg, #10b981, #059669); }}
    .bar-platform {{ background: linear-gradient(90deg, #f59e0b, #d97706); }}
    .bar-operations {{ background: linear-gradient(90deg, #ec4899, #db2777); }}
    .bar-time {{ background: linear-gradient(90deg, #6366f1, #4f46e5); }}
    .bar-p0 {{ background: linear-gradient(90deg, #ef4444, #dc2626); }}
    .bar-p1 {{ background: linear-gradient(90deg, #f59e0b, #d97706); }}
    .bar-p2 {{ background: linear-gradient(90deg, #22c55e, #16a34a); }}
    .bar-p3 {{ background: linear-gradient(90deg, #06b6d4, #0891b2); }}
    .chart-total {{ margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; font-size: 0.9rem; }}
    .toc-nav {{ display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }}
    .toc-nav a {{ color: var(--primary); text-decoration: none; padding: 6px 12px; border-radius: 4px; font-size: 0.8rem; font-weight: 500; background: var(--bg-light); border: 1px solid var(--border-light); display: inline-flex; align-items: center; gap: 6px; }}
    .toc-nav a:hover {{ background: var(--primary); color: white; }}
    .toc-nav .count {{ background: var(--primary); color: white; padding: 1px 6px; border-radius: 3px; font-size: 0.7rem; }}
    .toc-divider {{ color: var(--border); margin: 0 4px; }}
    .category-section {{ border-radius: 8px; margin-bottom: 16px; overflow: hidden; border-left: 4px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }}
    .category-header {{ padding: 14px 18px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; }}
    .category-header h3 {{ margin: 0; font-size: 0.95rem; display: flex; align-items: center; gap: 10px; font-weight: 600; }}
    .category-header .badge {{ font-size: 0.7rem; padding: 3px 10px; border-radius: 12px; font-weight: 600; }}
    .category-content {{ padding: 16px; }}
    .category-section.cat-structure {{ border-left-color: #3b82f6; }}
    .category-section.cat-structure .category-header {{ background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); }}
    .category-section.cat-structure .category-content {{ background: #f8faff; }}
    .category-section.cat-structure .badge {{ background: #3b82f6; color: white; }}
    .category-section.cat-function {{ border-left-color: #10b981; }}
    .category-section.cat-function .category-header {{ background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); }}
    .category-section.cat-function .category-content {{ background: #f8fdfb; }}
    .category-section.cat-function .badge {{ background: #10b981; color: white; }}
    .category-section.cat-data {{ border-left-color: #f59e0b; }}
    .category-section.cat-data .category-header {{ background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); }}
    .category-section.cat-data .category-content {{ background: #fffdf8; }}
    .category-section.cat-data .badge {{ background: #f59e0b; color: white; }}
    .category-section.cat-interfaces {{ border-left-color: #8b5cf6; }}
    .category-section.cat-interfaces .category-header {{ background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); }}
    .category-section.cat-interfaces .category-content {{ background: #faf9ff; }}
    .category-section.cat-interfaces .badge {{ background: #8b5cf6; color: white; }}
    .category-section.cat-platform {{ border-left-color: #14b8a6; }}
    .category-section.cat-platform .category-header {{ background: linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%); }}
    .category-section.cat-platform .category-content {{ background: #f8fefd; }}
    .category-section.cat-platform .badge {{ background: #14b8a6; color: white; }}
    .category-section.cat-operations {{ border-left-color: #6366f1; }}
    .category-section.cat-operations .category-header {{ background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%); }}
    .category-section.cat-operations .category-content {{ background: #f8f9ff; }}
    .category-section.cat-operations .badge {{ background: #6366f1; color: white; }}
    .category-section.cat-time {{ border-left-color: #ec4899; }}
    .category-section.cat-time .category-header {{ background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%); }}
    .category-section.cat-time .category-content {{ background: #fefafc; }}
    .category-section.cat-time .badge {{ background: #ec4899; color: white; }}
    .collapsed .category-content {{ display: none; }}
    .collapse-icon {{ transition: transform 0.2s; font-size: 0.8rem; color: var(--text-muted); }}
    .collapsed .collapse-icon {{ transform: rotate(-90deg); }}
    .filter-row td {{ padding: 6px 8px; background: #f8fafc; }}
    .filter-input, .filter-select {{ width: 100%; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 0.75rem; background: white; }}
    .test-id {{ font-family: 'SF Mono', 'Consolas', monospace; font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; }}
    .info-section .info-content {{ overflow: hidden; transition: max-height 0.3s ease-out; max-height: 1000px; }}
    .info-section.collapsed .info-content {{ max-height: 0 !important; padding-top: 0 !important; padding-bottom: 0 !important; }}
    .info-section.collapsed .collapse-icon {{ transform: rotate(-90deg); }}
    @media (max-width: 900px) {{ .charts-container {{ grid-template-columns: 1fr; }} }}
  </style>
  <script>
    function toggleSection(id) {{ document.getElementById(id)?.classList.toggle('collapsed'); }}
    function filterTable(tableId) {{
      var table = document.getElementById(tableId);
      var filters = table.querySelectorAll('.filter-input, .filter-select');
      var rows = table.querySelectorAll('tbody tr');
      rows.forEach(function(row) {{
        var show = true;
        filters.forEach(function(filter) {{
          var col = parseInt(filter.dataset.col);
          var cell = row.cells[col];
          if (cell) {{
            var text = cell.textContent.toLowerCase();
            var val = filter.value.toLowerCase();
            if (val && text.indexOf(val) === -1) {{ show = false; }}
          }}
        }});
        row.style.display = show ? '' : 'none';
      }});
    }}
  </script>
</head>
<body>
  <div class="container">
    <header>
      <h1>Product Factors assessment of: Epic 3 - Outfit-First Shopping Experience</h1>
      <div class="meta-inline" style="margin-top: 15px; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.2); font-size: 0.9rem; opacity: 0.9;">
        <span>Report generated on <strong>{datetime.now().strftime("%Y-%m-%d")}</strong></span>
        <span style="margin: 0 15px; opacity: 0.5;">|</span>
        <span>Total Test Ideas: <strong>{total_tests}</strong></span>
        <span style="margin: 0 15px; opacity: 0.5;">|</span>
        <span>Product Factors covered: <strong>7/7</strong></span>
      </div>
      <nav class="toc" style="margin-top: 15px; background: rgba(255,255,255,0.1); border-radius: 8px; padding: 12px 16px;">
        <div style="color: rgba(255,255,255,0.8); font-size: 0.85em; font-weight: 600; margin-bottom: 8px;">Quick Navigation</div>
        <div class="toc-nav">
          <a href="#risk" style="background: rgba(255,255,255,0.15); color: white; border-color: rgba(255,255,255,0.3);">Prioritization</a>
          <a href="#charts" style="background: rgba(255,255,255,0.15); color: white; border-color: rgba(255,255,255,0.3);">Overview</a>
          <span class="toc-divider" style="color: rgba(255,255,255,0.4);">|</span>
          <span style="color: rgba(255,255,255,0.8); font-size: 0.85em;">Test Ideas:</span>
          <a href="#structure" style="background: rgba(255,255,255,0.15); color: white; border-color: rgba(255,255,255,0.3);">Structure <span class="count" style="background: rgba(255,255,255,0.3);">{counts["structure"]}</span></a>
          <a href="#function" style="background: rgba(255,255,255,0.15); color: white; border-color: rgba(255,255,255,0.3);">Function <span class="count" style="background: rgba(255,255,255,0.3);">{counts["function"]}</span></a>
          <a href="#data" style="background: rgba(255,255,255,0.15); color: white; border-color: rgba(255,255,255,0.3);">Data <span class="count" style="background: rgba(255,255,255,0.3);">{counts["data"]}</span></a>
          <a href="#interfaces" style="background: rgba(255,255,255,0.15); color: white; border-color: rgba(255,255,255,0.3);">Interfaces <span class="count" style="background: rgba(255,255,255,0.3);">{counts["interfaces"]}</span></a>
          <a href="#platform" style="background: rgba(255,255,255,0.15); color: white; border-color: rgba(255,255,255,0.3);">Platform <span class="count" style="background: rgba(255,255,255,0.3);">{counts["platform"]}</span></a>
          <a href="#operations" style="background: rgba(255,255,255,0.15); color: white; border-color: rgba(255,255,255,0.3);">Operations <span class="count" style="background: rgba(255,255,255,0.3);">{counts["operations"]}</span></a>
          <a href="#time" style="background: rgba(255,255,255,0.15); color: white; border-color: rgba(255,255,255,0.3);">Time <span class="count" style="background: rgba(255,255,255,0.3);">{counts["time"]}</span></a>
        </div>
      </nav>
      <div class="info-section collapsed" style="background: rgba(255,255,255,0.1); border-radius: 8px; margin-top: 15px;">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')" style="padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.95;">How can this report help you?</h3>
          <span class="collapse-icon" style="transition: transform 0.2s;">&#9660;</span>
        </div>
        <div class="info-content" style="padding: 0 20px 20px 20px;">
          <blockquote style="margin: 0 0 15px 0; padding: 12px 15px; border-left: 3px solid rgba(255,255,255,0.4); font-style: italic; opacity: 0.9;">
            "Requirements are not an end in themselves, but a means to an end-the end of providing value to some person(s)." <span style="opacity: 0.7;">- Jerry Weinberg</span>
          </blockquote>
          <p style="margin: 0 0 12px 0; opacity: 0.9; line-height: 1.7;">In the <a href="https://talesoftesting.com/wp-content/uploads/2022/10/Lalitkumar-Bhamare-Quality-Conscious-Software-Delivery-eBook.pdf" style="color: #93c5fd; text-decoration: underline;">QCSD framework</a>, it is recommended to conduct Product Coverage Sessions or Requirements Engineering Sessions on a regular basis. These sessions can be carried out at the epic level or for complex feature requests and user stories. Testers in the team can analyze the epic or feature story using SFDIPOT (a product factors checklist from <a href="https://www.satisfice.com/download/heuristic-test-strategy-model" style="color: #93c5fd; text-decoration: underline;">Heuristic Test Strategy Model</a> by James Bach) and come up with test ideas, questions about risks, missing information, unconsidered dependencies, identified risks, and more.</p>
          <p style="margin: 0 0 12px 0; opacity: 0.9; line-height: 1.7;">A guided discussion based on this analysis can help teams uncover hidden risks, assess the completeness of the requirements, create a clearer development plan, identify gaps and dependencies, improve estimation with better information at hand, and most importantly - avoid rework caused by discovering issues halfway through development.</p>
          <p style="margin: 0; opacity: 0.9; line-height: 1.7;">If we want to save time and cost while still delivering quality software, it is always cheaper to do things right the first time. The purpose of this report is to facilitate Product Coverage Sessions and help teams achieve exactly that: doing things right the first time.</p>
        </div>
      </div>
      <div class="info-section collapsed" style="background: rgba(255,255,255,0.1); border-radius: 8px; margin-top: 10px;">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')" style="padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.95;">When to generate this report?</h3>
          <span class="collapse-icon" style="transition: transform 0.2s;">&#9660;</span>
        </div>
        <div class="info-content" style="padding: 0 20px 20px 20px;">
          <p style="margin: 0; opacity: 0.9; line-height: 1.7;">The sooner the better! As soon as testers can access Epic/User Stories or any project artifact they use for test design, this report should be generated. Generate this report and organize "Product Coverage Session" discussion with relevant stakeholders such as programmers, Product Owners, Designers, Architects etc.</p>
        </div>
      </div>
      <div class="info-section collapsed" style="background: rgba(255,255,255,0.1); border-radius: 8px; margin-top: 10px;">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')" style="padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.95;">How to use this report?</h3>
          <span class="collapse-icon" style="transition: transform 0.2s;">&#9660;</span>
        </div>
        <div class="info-content" style="padding: 0 20px 20px 20px;">
          <p style="margin: 0 0 12px 0; opacity: 0.9;">In this report you will find:</p>
          <div style="margin-left: 5px; line-height: 1.8;">
            <div style="margin-bottom: 8px;">&#9744; <strong>The Test Ideas</strong> generated for each product factor based on applicable subcategories. Review these test ideas carefully for context relevance, applicability and then derive specific test cases where needed.</div>
            <div style="margin-bottom: 8px;">&#9744; <strong>Automation Fitness</strong> recommendations against each test idea that can help for drafting suitable automation strategy.</div>
            <div>&#9744; <strong>The Clarifying Questions</strong> - that surface "unknown unknowns" by systematically checking which Product Factors (SFDIPOT) subcategories lack test coverage. Ensure that Epics, User Stories, Acceptance Criteria etc. are readily updated based on answers derived for each clarifying question listed.</div>
          </div>
          <p style="margin: 15px 0 0 0; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); opacity: 0.9; font-size: 0.95rem;">All in all, this report represents important and unique elements to be considered in the test strategy. <strong>Rebuild this report if there are updates made in Epics, User Stories, Acceptance Criteria etc.</strong></p>
          <p style="margin: 10px 0 0 0; opacity: 0.85; font-style: italic; font-size: 0.9rem;">Testers are advised to carefully evaluate all the information using critical thinking and context awareness.</p>
        </div>
      </div>
    </header>

    <section class="section" id="risk">
      <h2>Risk-Based Prioritization</h2>
      <p style="margin-bottom: 15px;">Test ideas are prioritized using a <strong>risk-based approach</strong> that considers:</p>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 20px;">
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Business Impact</strong><br>Potential revenue loss from broken outfit purchases, abandoned carts, or poor recommendations</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Likelihood of Failure</strong><br>Complexity of style matching algorithms, real-time preview updates, multi-service integrations</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">User Exposure</strong><br>High-traffic product pages, mobile shoppers, returning customers expecting personalization</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Security &amp; Compliance</strong><br>User preference data protection, session state security, payment integration</div>
      </div>
      <h3>Priority Legend</h3>
      <table>
        <thead>
          <tr><th>Priority</th><th>Risk Level</th><th>Description</th><th>Examples from this Epic</th></tr>
        </thead>
        <tbody>
          <tr><td><span class="priority priority-p0">P0</span></td><td><strong>Critical</strong></td><td>Security vulnerabilities or core functionality that could cause immediate financial loss, data breach, or complete feature failure.</td><td>Authentication for outfit builder, XSS/injection protection, piece swapper state persistence, API rate limiting</td></tr>
          <tr><td><span class="priority priority-p1">P1</span></td><td><strong>High</strong></td><td>Core business flows essential for outfit shopping experience. Failures significantly impact conversion.</td><td>Complete the Look display, style matching algorithm, real-time preview updates, Shop All functionality</td></tr>
          <tr><td><span class="priority priority-p2">P2</span></td><td><strong>Medium</strong></td><td>Important features supporting the core experience. Failures cause inconvenience but workarounds exist.</td><td>Drag-and-drop positioning, wishlist save, cross-brand sizing, seasonal filtering</td></tr>
          <tr><td><span class="priority priority-p3">P3</span></td><td><strong>Low</strong></td><td>Edge cases, cosmetic issues, or rarely used features with minimal business impact.</td><td>Long product name handling, CDN fallback, configuration versioning</td></tr>
        </tbody>
      </table>
    </section>

    <section class="section" id="charts">
      <h2>Test Ideas Overview</h2>
      <div class="charts-container">
        <div class="chart-panel">
          <h3>Test Ideas by Product Factor (SFDIPOT)</h3>
          <div class="bar-chart">
            <div class="bar-row">
              <div class="bar-label">Structure</div>
              <div class="bar-track"><div class="bar-fill bar-structure" style="width: {counts['structure']/max_count*100}%"></div></div>
              <div class="bar-value">{counts['structure']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">Function</div>
              <div class="bar-track"><div class="bar-fill bar-function" style="width: {counts['function']/max_count*100}%"></div></div>
              <div class="bar-value">{counts['function']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">Data</div>
              <div class="bar-track"><div class="bar-fill bar-data" style="width: {counts['data']/max_count*100}%"></div></div>
              <div class="bar-value">{counts['data']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">Interfaces</div>
              <div class="bar-track"><div class="bar-fill bar-interfaces" style="width: {counts['interfaces']/max_count*100}%"></div></div>
              <div class="bar-value">{counts['interfaces']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">Platform</div>
              <div class="bar-track"><div class="bar-fill bar-platform" style="width: {counts['platform']/max_count*100}%"></div></div>
              <div class="bar-value">{counts['platform']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">Operations</div>
              <div class="bar-track"><div class="bar-fill bar-operations" style="width: {counts['operations']/max_count*100}%"></div></div>
              <div class="bar-value">{counts['operations']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">Time</div>
              <div class="bar-track"><div class="bar-fill bar-time" style="width: {counts['time']/max_count*100}%"></div></div>
              <div class="bar-value">{counts['time']}</div>
            </div>
          </div>
          <div class="chart-total">
            <span class="total-label">Product Factors: 7/7</span>
            <span class="total-value">{total_tests} Test Ideas</span>
          </div>
        </div>
        <div class="chart-panel">
          <h3>Test Ideas by Priority</h3>
          <div class="bar-chart">
            <div class="bar-row">
              <div class="bar-label">P0 - Critical</div>
              <div class="bar-track"><div class="bar-fill bar-p0" style="width: {priority_counts['P0']/max_priority*100}%"></div></div>
              <div class="bar-value">{priority_counts['P0']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">P1 - High</div>
              <div class="bar-track"><div class="bar-fill bar-p1" style="width: {priority_counts['P1']/max_priority*100}%"></div></div>
              <div class="bar-value">{priority_counts['P1']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">P2 - Medium</div>
              <div class="bar-track"><div class="bar-fill bar-p2" style="width: {priority_counts['P2']/max_priority*100}%"></div></div>
              <div class="bar-value">{priority_counts['P2']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">P3 - Low</div>
              <div class="bar-track"><div class="bar-fill bar-p3" style="width: {priority_counts['P3']/max_priority*100}%"></div></div>
              <div class="bar-value">{priority_counts['P3']}</div>
            </div>
          </div>
          <h4 style="font-size: 0.85rem; color: var(--text-dark); margin: 14px 0 8px 0; padding-top: 12px; border-top: 1px solid var(--border);">Test Ideas by Automation Fitness</h4>
          <div class="bar-chart" style="font-size: 0.85rem;">
            <div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 110px; font-size: 0.8rem;">API level</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {automation_counts.get('API level', 0)/max_auto*100}%; background: linear-gradient(90deg, #6366f1, #8b5cf6);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">{automation_counts.get('API level', 0)}</div>
            </div>
            <div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 110px; font-size: 0.8rem;">E2E level</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {automation_counts.get('E2E level', 0)/max_auto*100}%; background: linear-gradient(90deg, #6366f1, #8b5cf6);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">{automation_counts.get('E2E level', 0)}</div>
            </div>
            <div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 110px; font-size: 0.8rem;">Integration level</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {automation_counts.get('Integration level', 0)/max_auto*100}%; background: linear-gradient(90deg, #6366f1, #8b5cf6);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">{automation_counts.get('Integration level', 0)}</div>
            </div>
            <div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 110px; font-size: 0.8rem;">Human Exploration</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {automation_counts.get('Human Exploration', 0)/max_auto*100}%; background: linear-gradient(90deg, #a855f7, #7c3aed);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">{automation_counts.get('Human Exploration', 0)}</div>
            </div>
            <div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 110px; font-size: 0.8rem;">Performance</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {automation_counts.get('Performance', 0)/max_auto*100}%; background: linear-gradient(90deg, #f59e0b, #d97706);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">{automation_counts.get('Performance', 0)}</div>
            </div>
            <div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 110px; font-size: 0.8rem;">Security</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {automation_counts.get('Security', 0)/max_auto*100}%; background: linear-gradient(90deg, #ef4444, #dc2626);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">{automation_counts.get('Security', 0)}</div>
            </div>
            <div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 110px; font-size: 0.8rem;">Concurrency</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {automation_counts.get('Concurrency', 0)/max_auto*100}%; background: linear-gradient(90deg, #f97316, #ea580c);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">{automation_counts.get('Concurrency', 0)}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="test-ideas">
      <h2>Test Ideas by Product Factor</h2>
'''

# Generate category sections
def generate_filter_row(table_id):
    return f'''<tr class="filter-row">
                  <td><input type="text" class="filter-input" data-col="0" placeholder="Filter..." onkeyup="filterTable('{table_id}')"></td>
                  <td><select class="filter-select" data-col="1" onchange="filterTable('{table_id}')"><option value="">All</option><option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></select></td>
                  <td><input type="text" class="filter-input" data-col="2" placeholder="Filter..." onkeyup="filterTable('{table_id}')"></td>
                  <td><input type="text" class="filter-input" data-col="3" placeholder="Filter..." onkeyup="filterTable('{table_id}')"></td>
                  <td><select class="filter-select" data-col="4" onchange="filterTable('{table_id}')"><option value="">All</option><option value="API">API</option><option value="E2E">E2E</option><option value="Integration">Integration</option><option value="Human">Human</option><option value="Performance">Performance</option><option value="Security">Security</option></select></td>
                </tr>'''

categories_info = [
    ("structure", "STRU", "STRUCTURE: Test ideas for everything that comprises the physical product"),
    ("function", "FUNC", "FUNCTION: Test ideas for everything that the product does"),
    ("data", "DATA", "DATA: Test ideas for everything that the product processes"),
    ("interfaces", "INTF", "INTERFACES: Test ideas for how the product connects"),
    ("platform", "PLAT", "PLATFORM: Test ideas for what the product depends on"),
    ("operations", "OPER", "OPERATIONS: Test ideas for how the product will be used"),
    ("time", "TIME", "TIME: Test ideas for any relationship between the product and time")
]

for cat_key, prefix, title in categories_info:
    html_content += f'''
      <div class="category-section cat-{cat_key}" id="{cat_key}">
        <div class="category-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <h3>{title} <span class="badge">{counts[cat_key]}</span></h3>
          <span class="collapse-icon">&#9660;</span>
        </div>
        <div class="category-content">
          <table class="filterable-table" id="table-{cat_key}">
            <thead>
              <tr>
                <th style="width: 100px;">ID</th>
                <th style="width: 70px;">Priority</th>
                <th style="width: 120px;">Subcategory</th>
                <th>Test Idea</th>
                <th style="width: 210px;">Automation Fitness</th>
              </tr>
              {generate_filter_row(f'table-{cat_key}')}
            </thead>
            <tbody>
              {generate_test_rows(tests[cat_key])}
            </tbody>
          </table>
'''

    # Add clarifying questions for each category
    if cat_key == "structure":
        html_content += '''
          <div class="clarifying-questions">
            <h4>Clarifying Questions to address potential coverage gaps</h4>
            <div class="clarifying-intro">
              <p class="preamble">Since the user stories focus on <strong>outfit suggestions, style matching, mix & match tool, size compatibility</strong>, the following structural aspects need clarification.</p>
            </div>
            <div class="subcategory-questions">
              <h5>[Hardware]</h5>
              <p class="rationale"><em>Rationale: Mix & Match tool may benefit from device-specific optimizations.</em></p>
              <ul>
                <li>Should the outfit builder support touch gestures for drag-and-drop on tablets?</li>
                <li>Are there specific GPU requirements for real-time outfit preview rendering?</li>
              </ul>
            </div>
            <div class="subcategory-questions">
              <h5>[Collateral]</h5>
              <p class="rationale"><em>Rationale: Users need guidance on the outfit builder feature.</em></p>
              <ul>
                <li>Is there onboarding documentation for the Mix & Match tool?</li>
                <li>What help content explains how style matching preferences are used?</li>
              </ul>
            </div>
          </div>
'''
    elif cat_key == "function":
        html_content += '''
          <div class="clarifying-questions">
            <h4>Clarifying Questions to address potential coverage gaps</h4>
            <div class="clarifying-intro">
              <p class="preamble">Since the user stories focus on <strong>outfit suggestions, style matching, piece swapping, size filtering</strong>, the following functional aspects need clarification.</p>
            </div>
            <div class="subcategory-questions">
              <h5>[StyleMatchingWeights]</h5>
              <p class="rationale"><em>Rationale: The algorithm's weighting factors determine recommendation quality.</em></p>
              <ul>
                <li>What relative weight does purchase history have vs. browsing behavior in style matching?</li>
                <li>How quickly should user feedback (thumbs down) affect future recommendations?</li>
                <li>Should seasonal preferences override user style preferences?</li>
              </ul>
            </div>
            <div class="subcategory-questions">
              <h5>[PieceSwapperBehavior]</h5>
              <p class="rationale"><em>Rationale: Core feature requires clear behavioral specifications.</em></p>
              <ul>
                <li>What happens when no style-matched alternatives are available for an item?</li>
                <li>Should alternatives show items from different price tiers?</li>
                <li>How many alternatives should be displayed (minimum/maximum)?</li>
              </ul>
            </div>
            <div class="subcategory-questions">
              <h5>[StateManagement]</h5>
              <p class="rationale"><em>Rationale: Customization persistence affects user experience.</em></p>
              <ul>
                <li>How long should unsaved outfit customizations persist in session?</li>
                <li>What happens to draft outfits when items go out of stock?</li>
                <li>Should there be a limit on saved outfits per user?</li>
              </ul>
            </div>
          </div>
'''
    elif cat_key == "data":
        html_content += '''
          <div class="clarifying-questions">
            <h4>Clarifying Questions to address potential coverage gaps</h4>
            <div class="clarifying-intro">
              <p class="preamble">Since the user stories focus on <strong>outfit data, style preferences, size profiles</strong>, the following data aspects need clarification.</p>
            </div>
            <div class="subcategory-questions">
              <h5>[DataRetention]</h5>
              <p class="rationale"><em>Rationale: User preference data has privacy implications.</em></p>
              <ul>
                <li>How long should user style preference data be retained?</li>
                <li>What data is collected from browsing behavior analysis?</li>
                <li>Can users request deletion of their style profile data?</li>
              </ul>
            </div>
          </div>
'''
    elif cat_key == "interfaces":
        html_content += '''
          <div class="clarifying-questions">
            <h4>Clarifying Questions to address potential coverage gaps</h4>
            <div class="clarifying-intro">
              <p class="preamble">Since the user stories focus on <strong>outfit builder UI, APIs, system integrations</strong>, the following interface aspects need clarification.</p>
            </div>
            <div class="subcategory-questions">
              <h5>[AccessibilityRequirements]</h5>
              <p class="rationale"><em>Rationale: Outfit builder should be accessible to all users.</em></p>
              <ul>
                <li>What WCAG level compliance is required for the outfit builder?</li>
                <li>How should screen readers announce piece swapper interactions?</li>
                <li>Are there keyboard-only navigation requirements for the tool?</li>
              </ul>
            </div>
          </div>
'''
    elif cat_key == "platform":
        html_content += '''
          <div class="clarifying-questions">
            <h4>Clarifying Questions to address potential coverage gaps</h4>
            <div class="clarifying-intro">
              <p class="preamble">Since the user stories mention <strong>cross-browser functionality</strong>, the following platform aspects need clarification.</p>
            </div>
            <div class="subcategory-questions">
              <h5>[BrowserSupport]</h5>
              <p class="rationale"><em>Rationale: Real-time preview requires modern browser features.</em></p>
              <ul>
                <li>What is the minimum browser version supported for the outfit builder?</li>
                <li>Should the feature degrade gracefully on older browsers or be hidden?</li>
              </ul>
            </div>
          </div>
'''
    elif cat_key == "operations":
        html_content += '''
          <div class="clarifying-questions">
            <h4>Clarifying Questions to address potential coverage gaps</h4>
            <div class="clarifying-intro">
              <p class="preamble">Since the user stories mention <strong>various user types and usage patterns</strong>, the following operational aspects need clarification.</p>
            </div>
            <div class="subcategory-questions">
              <h5>[UserSegments]</h5>
              <p class="rationale"><em>Rationale: Different user segments may have different expectations.</em></p>
              <ul>
                <li>Should first-time users see an onboarding tutorial for the outfit builder?</li>
                <li>Are there VIP/premium user features in the outfit builder?</li>
                <li>How should the feature behave for guest users vs. logged-in users?</li>
              </ul>
            </div>
          </div>
'''
    elif cat_key == "time":
        html_content += '''
          <div class="clarifying-questions">
            <h4>Clarifying Questions to address potential coverage gaps</h4>
            <div class="clarifying-intro">
              <p class="preamble">Since the user stories mention <strong>real-time updates and seasonal factors</strong>, the following timing aspects need clarification.</p>
            </div>
            <div class="subcategory-questions">
              <h5>[PerformanceSLAs]</h5>
              <p class="rationale"><em>Rationale: Real-time features require specific performance targets.</em></p>
              <ul>
                <li>What is the maximum acceptable latency for outfit preview updates?</li>
                <li>What is the target response time for style matching API?</li>
                <li>How should the system behave if SLAs are not met?</li>
              </ul>
            </div>
          </div>
'''

    html_content += '''
        </div>
      </div>
'''

# Close the HTML
html_content += '''
    </section>
  </div>
</body>
</html>
'''

# Write to file
output_path = "/workspaces/agentic-qe/.agentic-qe/product-factors-assessments/ay-e003-outfit-first-shopping-v7.html"
with open(output_path, "w") as f:
    f.write(html_content)

print(f"\nReport generated: {output_path}")
print(f"Total test ideas: {total_tests}")
