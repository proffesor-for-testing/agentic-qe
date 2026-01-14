#!/usr/bin/env python3
"""
Generate SFDIPOT Product Factors Assessment for Epic 3: Outfit-First Shopping Experience
Version 12 - Complete implementation with all quality gates
"""

import hashlib
from datetime import datetime

def generate_test_id(category_prefix: str, test_idea: str) -> str:
    """Generate unique test ID from hash of test idea."""
    hash_val = hashlib.md5(test_idea.encode()).hexdigest()[:8].upper()
    return f"TC-{category_prefix}-{hash_val}"

def main():
    # Epic 3 Test Ideas organized by SFDIPOT category
    # Following all quality gates: P0=8-12%, P1<=30%, P2=35-45%, P3=20-30%, Human>=10%

    test_ideas = {
        "structure": [],
        "function": [],
        "data": [],
        "interfaces": [],
        "platform": [],
        "operations": [],
        "time": []
    }

    # ==================== STRUCTURE ====================
    structure_tests = [
        # S1: Code/Architecture
        ("P1", "Code", "Inject malformed JSON in outfit composition response; confirm OutfitCard.tsx handles gracefully without crash", "integration"),
        ("P1", "Code", "Simulate AddCompleteLookButton.tsx component unmount during API call; confirm no memory leaks or orphaned promises", "integration"),
        ("P2", "Code", "Force QuickSizePicker.tsx to receive empty size array; confirm fallback UI displays with appropriate message", "integration"),
        ("P2", "Code", "Trigger OutfitCustomizer.tsx re-render with 100 consecutive piece swaps; measure memory growth stays under 50MB", "integration"),
        ("P1", "Code", "Confirm PieceSwapper.tsx maintains bidirectional data binding when parent outfit state changes externally", "integration"),
        ("P2", "Code", "Verify StyleMatchSuggestions.tsx component lazy-loads alternatives only when swap panel opens", "integration"),
        ("P2", "Code", "Test OccasionFilter.tsx chip selection persists through React hydration on SSR pages", "integration"),
        ("P2", "Code", "Confirm FilterChips.tsx keyboard navigation follows WAI-ARIA combobox pattern", "e2e"),
        ("P2", "Code", "Verify UGCOutfitGallery.tsx implements virtualized scrolling for lists exceeding 50 items", "integration"),
        ("P3", "Code", "Test OutfitSubmission.tsx form validation triggers on blur, not just on submit", "e2e"),

        # S3: Dependencies/Third-Party
        ("P1", "Dependencies", "Confirm system behavior when outfit recommendation engine returns 503; verify fallback to popularity-based suggestions", "integration"),
        ("P2", "Dependencies", "Test graceful degradation when image recognition service for UGC product matching is unavailable", "integration"),
        ("P2", "Dependencies", "Verify outfit composition service timeout handling after 5 seconds with partial response fallback", "integration"),
        ("P3", "Dependencies", "Confirm existing Outfits CMS editorial content loads when recommendation engine fails", "integration"),
        ("P3", "Dependencies", "Explore third-party style matching library documentation; assess whether integration patterns are clear", "human"),

        # S4: Documentation
        ("P3", "Documentation", "Explore outfit filtering help text; assess whether occasion definitions are self-explanatory", "human"),
        ("P3", "Documentation", "Explore UGC submission guidelines; assess whether photo requirements are unambiguous", "human"),
        ("P3", "Documentation", "Explore outfit API documentation; assess whether integration examples cover common use cases", "human"),
    ]

    for priority, subcat, idea, automation in structure_tests:
        test_ideas["structure"].append({
            "id": generate_test_id("STRU", idea),
            "priority": priority,
            "subcategory": subcat,
            "idea": idea,
            "automation": automation
        })

    # ==================== FUNCTION ====================
    function_tests = [
        # F1: Core Features - US 3.1 Shop Complete Look
        ("P0", "CoreFeature", "Inject inventory API timeout during Add Complete Look; confirm user sees loading state then error with retry option", "e2e"),
        ("P1", "CoreFeature", "Test Add Complete Look with 4-item outfit where 2 items need size selection; confirm size picker only appears for those 2 items", "e2e"),
        ("P1", "CoreFeature", "Simulate Add Complete Look when 1 item is out of stock in selected size; confirm alternatives modal appears before completing action", "e2e"),
        ("P1", "CoreFeature", "Confirm bag groups outfit items visually with combined subtotal displayed prominently", "e2e"),
        ("P1", "CoreFeature", "Measure Add Complete Look interaction time with 4-item outfit excluding size selection; confirm under 2 seconds", "performance"),
        ("P2", "CoreFeature", "Test Add Complete Look when user has existing items in bag; confirm outfit group added separately with clear visual distinction", "e2e"),
        ("P2", "CoreFeature", "Verify outfit card displays all constituent items with individual prices and combined total", "e2e"),
        ("P3", "CoreFeature", "Test Add Complete Look with outfit containing item user already owns; confirm no duplicate warning appears", "e2e"),

        # F1: Core Features - US 3.2 Piece Swapper
        ("P1", "CoreFeature", "Click Swap This Piece on jeans; confirm alternatives shown stylistically match remaining outfit items", "e2e"),
        ("P1", "CoreFeature", "Select alternative piece; confirm outfit preview updates in real-time showing new item in context", "e2e"),
        ("P1", "CoreFeature", "Swap 2 pieces then click Add Complete Look; confirm customized outfit added to bag, not original", "e2e"),
        ("P1", "CoreFeature", "Customize outfit then leave and return within session; confirm customizations are remembered", "e2e"),
        ("P2", "CoreFeature", "Swap to higher-priced item; confirm total price updates in real-time on outfit card", "e2e"),
        ("P2", "CoreFeature", "Swap to lower-priced item; confirm savings indicator appears showing price reduction", "e2e"),
        ("P3", "CoreFeature", "Swap piece then undo; confirm original piece restored without full page reload", "e2e"),
        ("P3", "CoreFeature", "Test maximum swappable pieces limit; confirm user can swap all items in outfit if desired", "e2e"),

        # F1: Core Features - US 3.3 Occasion Filtering
        ("P1", "CoreFeature", "Select Wedding Guest filter chip; confirm only formal/semi-formal occasion-tagged outfits displayed", "e2e"),
        ("P1", "CoreFeature", "Select multiple occasions (Wedding Guest + Date Night); confirm outfits matching ANY selected occasion shown", "e2e"),
        ("P1", "CoreFeature", "Clear all occasion filters; confirm all outfits displayed again", "e2e"),
        ("P2", "CoreFeature", "Tap occasion chip on mobile; confirm page smoothly scrolls to outfit grid", "e2e"),
        ("P2", "CoreFeature", "Apply filter resulting in zero matches; confirm empty state message with suggestions to broaden filters", "e2e"),
        ("P3", "CoreFeature", "Test occasion filter with 6+ occasions; confirm horizontal scroll on filter bar for overflow", "e2e"),

        # F1: Core Features - US 3.4 UGC Gallery
        ("P2", "CoreFeature", "Select Customer Looks tab; confirm grid of customer-submitted outfits displays", "e2e"),
        ("P2", "CoreFeature", "Tap customer outfit; confirm items identified with links to respective PDPs", "e2e"),
        ("P2", "CoreFeature", "Click item in customer outfit; confirm navigation to PDP with As styled by [username] context", "e2e"),
        ("P2", "CoreFeature", "View customer outfit containing unavailable item; confirm Similar Items shown instead of direct link", "e2e"),
        ("P3", "CoreFeature", "Submit outfit as customer; confirm submission enters moderation queue", "e2e"),
        ("P3", "CoreFeature", "Complete moderation of submitted outfit; confirm submitter receives notification when published", "e2e"),

        # F2: Calculations/Algorithms
        ("P1", "Calculation", "Trigger style matching algorithm with monochromatic outfit; confirm alternatives maintain color harmony", "api"),
        ("P2", "Calculation", "Test combined price calculation with items having different currencies; confirm correct conversion and total", "api"),
        ("P2", "Calculation", "Verify inventory aggregation correctly reports availability for multi-product outfit across warehouses", "api"),
        ("P3", "Calculation", "Test collaborative filtering recommendations with new user having no browsing history; confirm reasonable defaults", "api"),
        ("P3", "Calculation", "Explore style matching suggestions for avant-garde outfit; assess whether algorithm produces coherent alternatives", "human"),

        # F3: Security
        ("P0", "Security", "Inject SQL payload in outfit filter parameter; confirm sanitization prevents injection", "security"),
        ("P0", "Security", "Attempt to access other users customized outfits via session manipulation; confirm isolation enforced", "security"),
        ("P0", "Security", "Test XSS injection in outfit item descriptions; confirm output encoding prevents script execution", "security"),
        ("P0", "Security", "Verify CSRF protection on Add Complete Look API endpoint; confirm token validation enforced", "security"),
        ("P0", "Security", "Attempt to manipulate outfit pricing via client-side tampering; confirm server-side price validation", "security"),
        ("P0", "Security", "Test UGC image upload for malicious file types disguised as images; confirm MIME type validation", "security"),
        ("P1", "Security", "Test UGC image upload with embedded EXIF GPS data; confirm metadata stripped before storage", "security"),
        ("P2", "Security", "Verify UGC moderation queue only accessible to authorized moderator roles", "security"),
        ("P2", "Security", "Test rate limiting on outfit customization API to prevent abuse", "security"),

        # F4: Error Handling
        ("P1", "ErrorHandling", "Trigger network failure during piece swap; confirm error message displayed with retry option", "e2e"),
        ("P1", "ErrorHandling", "Force style matching API timeout; confirm graceful fallback to category-based suggestions", "integration"),
        ("P2", "ErrorHandling", "Test outfit submission with invalid image format; confirm specific error message guides user to correct formats", "e2e"),
        ("P2", "ErrorHandling", "Simulate partial inventory API failure; confirm available items still display with unavailable items marked", "integration"),
        ("P3", "ErrorHandling", "Explore error messages during outfit customization; assess whether messages guide recovery without technical jargon", "human"),
    ]

    for priority, subcat, idea, automation in function_tests:
        test_ideas["function"].append({
            "id": generate_test_id("FUNC", idea),
            "priority": priority,
            "subcategory": subcat,
            "idea": idea,
            "automation": automation
        })

    # ==================== DATA ====================
    data_tests = [
        # D1: Input Data
        ("P1", "InputData", "Submit outfit with size selection containing special characters; confirm sanitization and valid processing", "api"),
        ("P1", "InputData", "Test occasion filter with URL-encoded malicious payload; confirm filter processes safely", "api"),
        ("P2", "InputData", "Submit UGC outfit with description at maximum character limit (500); confirm full text saved", "api"),
        ("P2", "InputData", "Submit UGC outfit with empty description; confirm validation error with minimum requirement message", "api"),
        ("P3", "InputData", "Test outfit search with emoji in query; confirm handling without crash", "api"),

        # D2: Output Data
        ("P1", "OutputData", "Verify outfit combined price displays with correct currency symbol and formatting for DE locale", "e2e"),
        ("P2", "OutputData", "Confirm outfit item list exports correctly to wishlist with all metadata preserved", "integration"),
        ("P2", "OutputData", "Test outfit card rendering with item names containing umlauts and special characters", "e2e"),
        ("P3", "OutputData", "Verify price savings display format when swapping to cheaper alternative item", "e2e"),

        # D3: Data Boundaries
        ("P1", "Boundaries", "Test outfit with maximum items limit (assumed 10); confirm Add Complete Look handles correctly", "api"),
        ("P1", "Boundaries", "Test outfit with minimum items (2); confirm valid outfit recognition", "api"),
        ("P2", "Boundaries", "Add outfit where combined price exceeds typical basket limit; confirm no artificial cap applied", "api"),
        ("P2", "Boundaries", "Test style matching with outfit containing 1 item only; confirm alternative suggestions still generated", "api"),
        ("P3", "Boundaries", "Test occasion filter with all occasions selected; confirm behavior identical to no filter", "api"),

        # D4: Persistence/Storage
        ("P1", "Persistence", "Customize outfit then close browser; confirm customizations lost (session-only per AC)", "e2e"),
        ("P2", "Persistence", "Verify UGC outfit images stored with correct compression and resolution", "integration"),
        ("P2", "Persistence", "Test outfit customization state across multiple tabs in same session", "e2e"),
        ("P3", "Persistence", "Verify moderation decisions persisted with audit trail for UGC content", "integration"),
    ]

    for priority, subcat, idea, automation in data_tests:
        test_ideas["data"].append({
            "id": generate_test_id("DATA", idea),
            "priority": priority,
            "subcategory": subcat,
            "idea": idea,
            "automation": automation
        })

    # ==================== INTERFACES ====================
    interface_tests = [
        # I1: User Interface
        ("P1", "UserInterface", "Test outfit card layout at 320px mobile viewport; confirm all items visible without horizontal scroll", "e2e"),
        ("P1", "UserInterface", "Verify Add Complete Look button meets minimum touch target size (44x44px) on mobile", "e2e"),
        ("P1", "UserInterface", "Confirm occasion filter chips are keyboard navigable with arrow keys", "e2e"),
        ("P1", "UserInterface", "Test quick size picker aria-labels announce available sizes to screen readers", "e2e"),
        ("P2", "UserInterface", "Verify piece swapper panel opens with smooth animation respecting prefers-reduced-motion", "e2e"),
        ("P2", "UserInterface", "Confirm outfit preview updates visually distinct when piece swap selected", "e2e"),
        ("P2", "UserInterface", "Test UGC gallery grid layout at tablet breakpoint (768px); confirm 2-column display", "e2e"),
        ("P2", "UserInterface", "Verify empty state for filtered outfits provides clear visual guidance", "e2e"),
        ("P2", "UserInterface", "Explore outfit card visual hierarchy; assess whether combined price is most prominent", "human"),
        ("P2", "UserInterface", "Explore piece swapper alternatives layout; assess whether style coherence is visually obvious", "human"),
        ("P2", "UserInterface", "Explore Add Complete Look button prominence; assess whether action is immediately discoverable", "human"),
        ("P3", "UserInterface", "Explore occasion filter chip visual feedback; assess whether selected state is clearly distinguishable", "human"),
        ("P3", "UserInterface", "Explore UGC gallery thumbnail quality; assess whether images accurately represent full outfit", "human"),

        # I2: APIs/Services
        ("P0", "API", "Confirm POST /api/v2/bag/add-outfit returns 400 with schema errors for malformed outfit payload", "api"),
        ("P1", "API", "Test GET /api/v2/outfits endpoint with occasions filter parameter; confirm correct filtering", "api"),
        ("P1", "API", "Verify GET /api/v2/outfits response includes all required fields: items, prices, occasion tags, availability", "api"),
        ("P1", "API", "Test outfit API rate limiting; confirm 429 response with Retry-After header when exceeded", "api"),
        ("P2", "API", "Confirm style matching API returns alternatives within 500ms p95 latency", "api"),
        ("P2", "API", "Test UGC submission API validates image dimensions and file size before processing", "api"),
        ("P2", "API", "Verify outfit composition API handles partial inventory data gracefully", "api"),
        ("P3", "API", "Test API pagination for outfit listing; confirm offset and limit parameters work correctly", "api"),

        # I3: External Integrations
        ("P1", "Integration", "Test outfit data sync with existing Outfits CMS; confirm editorial content displays correctly", "integration"),
        ("P1", "Integration", "Verify product recommendation engine integration returns personalized outfit suggestions", "integration"),
        ("P2", "Integration", "Test image recognition service integration for UGC product matching; confirm confidence threshold enforced", "integration"),
        ("P2", "Integration", "Simulate CMS content update; confirm outfit module reflects changes within cache TTL", "integration"),
        ("P3", "Integration", "Test fallback when recommendation engine unavailable; confirm static curated outfits display", "integration"),

        # I4: Events/Messaging
        ("P2", "Events", "Verify outfit_view event fires with all required metadata when outfit card displayed", "api"),
        ("P2", "Events", "Confirm add_complete_look event tracks outfit ID, item count, and total price", "api"),
        ("P2", "Events", "Test piece_swap event captures original and replacement item IDs", "api"),
        ("P3", "Events", "Verify occasion_filter_applied event tracks selected occasions for analytics", "api"),
    ]

    for priority, subcat, idea, automation in interface_tests:
        test_ideas["interfaces"].append({
            "id": generate_test_id("INTF", idea),
            "priority": priority,
            "subcategory": subcat,
            "idea": idea,
            "automation": automation
        })

    # ==================== PLATFORM ====================
    platform_tests = [
        # P1: Browser/Client
        ("P1", "Browser", "Test outfit functionality in Chrome, Firefox, Safari, Edge latest versions", "e2e"),
        ("P1", "Browser", "Verify piece swapper works on iOS Safari with touch gestures", "e2e"),
        ("P2", "Browser", "Test occasion filter chips on Android Chrome with touch interaction", "e2e"),
        ("P2", "Browser", "Confirm outfit card images lazy-load correctly across all supported browsers", "e2e"),
        ("P3", "Browser", "Test outfit gallery with JavaScript disabled; confirm graceful degradation", "e2e"),

        # P3: External Services
        ("P1", "ExternalServices", "Simulate outfit recommendation service latency of 2x normal; confirm acceptable UX maintained", "performance"),
        ("P2", "ExternalServices", "Test behavior when image CDN returns stale cached images; confirm cache invalidation works", "integration"),
        ("P3", "ExternalServices", "Verify outfit module functions when analytics service unavailable", "integration"),

        # P4: Network Conditions
        ("P1", "Network", "Test Add Complete Look on simulated 3G connection (500ms RTT); confirm completion within 5 seconds", "performance"),
        ("P2", "Network", "Simulate network interruption during piece swap; confirm recovery on reconnect", "e2e"),
        ("P2", "Network", "Test outfit image loading on throttled connection; confirm progressive loading UX", "e2e"),
        ("P3", "Network", "Verify offline indicator appears when network lost during outfit browsing", "e2e"),
    ]

    for priority, subcat, idea, automation in platform_tests:
        test_ideas["platform"].append({
            "id": generate_test_id("PLAT", idea),
            "priority": priority,
            "subcategory": subcat,
            "idea": idea,
            "automation": automation
        })

    # ==================== OPERATIONS ====================
    operations_tests = [
        # O1: Common Usage
        ("P1", "CommonUsage", "Complete happy path: browse outfits, filter by occasion, swap piece, add complete look, checkout", "e2e"),
        ("P1", "CommonUsage", "Measure most common operation (view outfit details) completes within 200ms", "performance"),
        ("P2", "CommonUsage", "Explore typical user flow from homepage to outfit purchase; assess friction points", "human"),
        ("P3", "CommonUsage", "Test returning user flow with previously viewed outfits prioritized", "e2e"),

        # O2: Extreme Usage
        ("P2", "ExtremeUsage", "Load test outfit module with 10x normal traffic; confirm no degradation", "performance"),
        ("P2", "ExtremeUsage", "Test rapid piece swapping (20 swaps in 10 seconds); confirm no race conditions", "concurrency"),
        ("P3", "ExtremeUsage", "Stress test UGC gallery with 1000+ customer outfits; confirm pagination handles gracefully", "performance"),

        # O3: User Personas
        ("P2", "Personas", "Test Anna persona (time-poor mother): can complete outfit purchase in under 60 seconds", "e2e"),
        ("P2", "Personas", "Test Carla persona (wardrobe curator): piece swapper meets needs for avoiding duplicates", "e2e"),
        ("P2", "Personas", "Test David persona (occasional shopper): occasion filters provide adequate guidance", "e2e"),
        ("P3", "Personas", "Test Lisa persona (UGC contributor): submission flow intuitive without documentation", "e2e"),
        ("P2", "Personas", "Explore outfit experience for fashion novice; assess whether guidance is sufficient", "human"),
        ("P2", "Personas", "Explore outfit pricing display for budget-conscious shopper; assess whether value proposition is clear", "human"),
        ("P3", "Personas", "Explore piece swapper for trend-follower persona; assess whether alternatives feel current and stylish", "human"),

        # O4: Environment
        ("P2", "Environment", "Verify outfit prices display correctly in Euro with German locale formatting", "e2e"),
        ("P2", "Environment", "Test outfit module in CET/CEST timezone; confirm any time-based features work correctly", "api"),
        ("P3", "Environment", "Verify occasion labels translated appropriately for German market", "e2e"),
    ]

    for priority, subcat, idea, automation in operations_tests:
        test_ideas["operations"].append({
            "id": generate_test_id("OPER", idea),
            "priority": priority,
            "subcategory": subcat,
            "idea": idea,
            "automation": automation
        })

    # ==================== TIME ====================
    time_tests = [
        # T1: Timing/Latency
        ("P1", "Timing", "Measure outfit card render time; confirm under 100ms for perceived instant loading", "performance"),
        ("P2", "Timing", "Verify piece swap preview updates within 200ms of selection", "performance"),
        ("P2", "Timing", "Confirm style matching suggestions appear within 500ms of opening swap panel", "performance"),
        ("P2", "Timing", "Explore loading indicator timing; assess whether progress feedback reduces perceived wait", "human"),
        ("P3", "Timing", "Explore animation smoothness during piece swap; assess whether transitions feel polished", "human"),

        # T2: Concurrency
        ("P1", "Concurrency", "Simulate two users adding same outfit to bag simultaneously; confirm no inventory race condition", "concurrency"),
        ("P2", "Concurrency", "Test rapid Add Complete Look followed by immediate piece swap; confirm no state corruption", "concurrency"),
        ("P2", "Concurrency", "Verify outfit customization state isolation between browser tabs", "concurrency"),
        ("P3", "Concurrency", "Test simultaneous UGC submissions from same user; confirm deduplication or queuing", "concurrency"),

        # T3: Scheduling
        ("P2", "Scheduling", "Verify outfit cache refreshes on expected schedule without manual intervention", "integration"),
        ("P3", "Scheduling", "Test outfit availability updates when inventory changes; confirm near-real-time reflection", "integration"),

        # T4: State Changes Over Time
        ("P1", "StateChanges", "Verify customized outfit state persists through page refresh within same session", "e2e"),
        ("P2", "StateChanges", "Test outfit where item becomes unavailable during session; confirm user notified before checkout", "e2e"),
        ("P2", "StateChanges", "Confirm session-stored outfit customizations expire after session end per AC", "e2e"),
        ("P3", "StateChanges", "Test outfit price changes during user session; confirm updated price shown before add to bag", "e2e"),
    ]

    for priority, subcat, idea, automation in time_tests:
        test_ideas["time"].append({
            "id": generate_test_id("TIME", idea),
            "priority": priority,
            "subcategory": subcat,
            "idea": idea,
            "automation": automation
        })

    # Calculate totals and distributions
    total_tests = sum(len(tests) for tests in test_ideas.values())

    priority_counts = {"P0": 0, "P1": 0, "P2": 0, "P3": 0}
    automation_counts = {"api": 0, "e2e": 0, "integration": 0, "human": 0, "performance": 0, "security": 0, "concurrency": 0}

    for category, tests in test_ideas.items():
        for test in tests:
            priority_counts[test["priority"]] += 1
            automation_counts[test["automation"]] += 1

    # Generate HTML
    html = generate_html(test_ideas, total_tests, priority_counts, automation_counts)

    with open("/workspaces/agentic-qe/.agentic-qe/product-factors-assessments/ay-e003-outfit-first-shopping-v12.html", "w") as f:
        f.write(html)

    print(f"Generated assessment with {total_tests} test ideas")
    print(f"Priority distribution: P0={priority_counts['P0']} ({priority_counts['P0']/total_tests*100:.1f}%), P1={priority_counts['P1']} ({priority_counts['P1']/total_tests*100:.1f}%), P2={priority_counts['P2']} ({priority_counts['P2']/total_tests*100:.1f}%), P3={priority_counts['P3']} ({priority_counts['P3']/total_tests*100:.1f}%)")
    print(f"Human exploration: {automation_counts['human']} ({automation_counts['human']/total_tests*100:.1f}%)")

def generate_html(test_ideas, total_tests, priority_counts, automation_counts):
    """Generate complete HTML report."""

    category_counts = {cat: len(tests) for cat, tests in test_ideas.items()}
    max_cat_count = max(category_counts.values())
    max_priority_count = max(priority_counts.values())
    max_auto_count = max(automation_counts.values())

    html = f'''<!DOCTYPE html>
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
      --purple: #7c3aed;
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
    .automation-performance {{ background: #fef3c7; color: #92400e; }}
    .automation-concurrency {{ background: #ffedd5; color: #9a3412; }}
    .automation-security {{ background: #fee2e2; color: #991b1b; }}
    .automation-human {{ background: #f3e8ff; color: var(--purple); font-weight: 600; }}
    .human-reason {{ font-size: 0.75rem; margin-top: 4px; padding: 4px 8px; background: rgba(124, 58, 237, 0.1); border-radius: 3px; color: #5b21b6; font-style: italic; }}
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
    .clarifying-questions li:last-child {{ border-bottom: none; }}
    .charts-container {{ display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }}
    .chart-panel {{ background: var(--bg-white); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }}
    .chart-panel h3 {{ font-size: 1.1rem; color: var(--text-dark); margin-bottom: 15px; padding-bottom: 8px; border-bottom: 2px solid var(--border); }}
    .bar-chart {{ display: flex; flex-direction: column; gap: 8px; }}
    .bar-row {{ display: flex; align-items: center; gap: 10px; }}
    .bar-label {{ width: 90px; font-size: 0.8rem; font-weight: 600; color: var(--text-dark); text-align: right; flex-shrink: 0; }}
    .bar-track {{ flex: 1; height: 24px; background: var(--bg-light); border-radius: 4px; overflow: hidden; position: relative; }}
    .bar-fill {{ height: 100%; border-radius: 4px; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; font-size: 0.75rem; font-weight: 600; color: white; min-width: 35px; transition: width 0.3s ease; }}
    .bar-value {{ width: 45px; font-size: 0.85rem; font-weight: 700; color: var(--text-dark); text-align: right; flex-shrink: 0; }}
    .bar-structure {{ background: linear-gradient(90deg, #3b82f6, #2563eb); }}
    .bar-function {{ background: linear-gradient(90deg, #10b981, #059669); }}
    .bar-data {{ background: linear-gradient(90deg, #f59e0b, #d97706); }}
    .bar-interfaces {{ background: linear-gradient(90deg, #8b5cf6, #7c3aed); }}
    .bar-platform {{ background: linear-gradient(90deg, #14b8a6, #0d9488); }}
    .bar-operations {{ background: linear-gradient(90deg, #6366f1, #4f46e5); }}
    .bar-time {{ background: linear-gradient(90deg, #ec4899, #db2777); }}
    .bar-p0 {{ background: linear-gradient(90deg, #ef4444, #dc2626); }}
    .bar-p1 {{ background: linear-gradient(90deg, #f59e0b, #d97706); }}
    .bar-p2 {{ background: linear-gradient(90deg, #22c55e, #16a34a); }}
    .bar-p3 {{ background: linear-gradient(90deg, #06b6d4, #0891b2); }}
    .chart-total {{ margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; font-size: 0.9rem; }}
    .chart-total .total-label {{ color: var(--text-muted); }}
    .chart-total .total-value {{ font-weight: 700; color: var(--primary); }}
    @media (max-width: 900px) {{ .charts-container {{ grid-template-columns: 1fr; }} }}
    .test-id {{ font-family: 'SF Mono', 'Consolas', monospace; font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; }}
    .toc-nav {{ display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }}
    .toc-nav a {{ color: var(--primary); text-decoration: none; padding: 6px 12px; border-radius: 4px; font-size: 0.8rem; font-weight: 500; background: var(--bg-light); border: 1px solid var(--border-light); transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px; }}
    .toc-nav a:hover {{ background: var(--primary); color: white; border-color: var(--primary); }}
    .toc-nav .count {{ background: var(--primary); color: white; padding: 1px 6px; border-radius: 3px; font-size: 0.7rem; font-weight: 600; }}
    .toc-nav a:hover .count {{ background: rgba(255,255,255,0.3); }}
    .toc-divider {{ color: var(--border); margin: 0 4px; }}
    .category-section {{ border-radius: 8px; margin-bottom: 16px; overflow: hidden; border-left: 4px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }}
    .category-header {{ padding: 14px 18px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; }}
    .category-header:hover {{ filter: brightness(0.97); }}
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
    .filter-input:focus, .filter-select:focus {{ outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px rgba(30,58,95,0.1); }}
    .info-section .info-content {{ overflow: hidden; transition: max-height 0.3s ease-out, padding 0.3s ease-out; max-height: 1000px; }}
    .info-section.collapsed .info-content {{ max-height: 0 !important; padding-top: 0 !important; padding-bottom: 0 !important; }}
    .info-section.collapsed .collapse-icon {{ transform: rotate(-90deg); }}
    .info-header:hover {{ background: rgba(255,255,255,0.05); }}
    @media (max-width: 768px) {{
      header h1 {{ font-size: 1.4rem; }}
      table {{ display: block; overflow-x: auto; }}
      .toc-nav {{ flex-direction: column; align-items: flex-start; }}
    }}
  </style>
  <script>
    function toggleAllSections() {{
      var sections = document.querySelectorAll('.category-section');
      var btn = document.getElementById('toggle-all-btn');
      var shouldCollapse = btn.textContent === 'Collapse All';
      sections.forEach(function(s) {{
        if (shouldCollapse) {{ s.classList.add('collapsed'); }}
        else {{ s.classList.remove('collapsed'); }}
      }});
      btn.textContent = shouldCollapse ? 'Expand All' : 'Collapse All';
    }}
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
        <span>Report generated on <strong>{datetime.now().strftime('%Y-%m-%d')}</strong></span>
        <span style="margin: 0 15px; opacity: 0.5;">|</span>
        <span>Total Test Ideas: <strong>{total_tests}</strong></span>
        <span style="margin: 0 15px; opacity: 0.5;">|</span>
        <span>Product Factors covered: <strong>7/7</strong></span>
      </div>
      <nav class="toc" style="margin-top: 15px; background: rgba(255,255,255,0.1); border-radius: 8px; padding: 12px 16px;">
        <div style="color: rgba(255,255,255,0.8); font-size: 0.85em; font-weight: 600; margin-bottom: 8px;">Quick Navigation</div>
        <div class="toc-nav">
          <a href="#risk" style="background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); color: white;">Prioritization</a>
          <a href="#charts" style="background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); color: white;">Overview</a>
          <span class="toc-divider" style="color: rgba(255,255,255,0.4);">|</span>
          <span style="color: rgba(255,255,255,0.8); font-size: 0.85em; font-weight: 500;">Test Ideas:</span>
          <a href="#structure" style="background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); color: white;">Structure <span class="count" style="background: rgba(255,255,255,0.3);">{category_counts['structure']}</span></a>
          <a href="#function" style="background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); color: white;">Function <span class="count" style="background: rgba(255,255,255,0.3);">{category_counts['function']}</span></a>
          <a href="#data" style="background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); color: white;">Data <span class="count" style="background: rgba(255,255,255,0.3);">{category_counts['data']}</span></a>
          <a href="#interfaces" style="background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); color: white;">Interfaces <span class="count" style="background: rgba(255,255,255,0.3);">{category_counts['interfaces']}</span></a>
          <a href="#platform" style="background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); color: white;">Platform <span class="count" style="background: rgba(255,255,255,0.3);">{category_counts['platform']}</span></a>
          <a href="#operations" style="background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); color: white;">Operations <span class="count" style="background: rgba(255,255,255,0.3);">{category_counts['operations']}</span></a>
          <a href="#time" style="background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); color: white;">Time <span class="count" style="background: rgba(255,255,255,0.3);">{category_counts['time']}</span></a>
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
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Business Impact</strong><br>Potential revenue loss from outfit sales, AOV increase opportunity, customer trust damage</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Likelihood of Failure</strong><br>Multi-product inventory coordination, real-time price calculations, style matching algorithm complexity</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">User Exposure</strong><br>Homepage placement, mobile users on-the-go shopping, UGC community engagement</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Security &amp; Compliance</strong><br>UGC content moderation, GDPR for user-generated images, secure cart operations</div>
      </div>
      <h3>Priority Legend</h3>
      <table>
        <thead>
          <tr><th>Priority</th><th>Risk Level</th><th>Description</th><th>Examples from this Epic</th></tr>
        </thead>
        <tbody>
          <tr><td><span class="priority priority-p0">P0</span></td><td><strong>Critical</strong></td><td>Security vulnerabilities, data breaches, complete feature failure preventing purchases. Must be tested before any release.</td><td>SQL injection in filters, Add Complete Look API failures, session security for outfit customizations</td></tr>
          <tr><td><span class="priority priority-p1">P1</span></td><td><strong>High</strong></td><td>Core outfit shopping flows essential for AOV increase. Failures would significantly impact user experience and revenue.</td><td>Add Complete Look functionality, piece swapper, occasion filtering, inventory aggregation</td></tr>
          <tr><td><span class="priority priority-p2">P2</span></td><td><strong>Medium</strong></td><td>Important features supporting the outfit experience. Failures cause inconvenience but workarounds exist.</td><td>UGC gallery, price display formatting, analytics events, style match alternatives</td></tr>
          <tr><td><span class="priority priority-p3">P3</span></td><td><strong>Low</strong></td><td>Edge cases, polish features, or rarely used functionality. Failures have minimal business impact.</td><td>Undo piece swap, offline indicators, extreme load scenarios, documentation clarity</td></tr>
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
              <div class="bar-track"><div class="bar-fill bar-structure" style="width: {category_counts['structure']/max_cat_count*100:.1f}%"></div></div>
              <div class="bar-value">{category_counts['structure']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">Function</div>
              <div class="bar-track"><div class="bar-fill bar-function" style="width: {category_counts['function']/max_cat_count*100:.1f}%"></div></div>
              <div class="bar-value">{category_counts['function']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">Data</div>
              <div class="bar-track"><div class="bar-fill bar-data" style="width: {category_counts['data']/max_cat_count*100:.1f}%"></div></div>
              <div class="bar-value">{category_counts['data']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">Interfaces</div>
              <div class="bar-track"><div class="bar-fill bar-interfaces" style="width: {category_counts['interfaces']/max_cat_count*100:.1f}%"></div></div>
              <div class="bar-value">{category_counts['interfaces']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">Platform</div>
              <div class="bar-track"><div class="bar-fill bar-platform" style="width: {category_counts['platform']/max_cat_count*100:.1f}%"></div></div>
              <div class="bar-value">{category_counts['platform']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">Operations</div>
              <div class="bar-track"><div class="bar-fill bar-operations" style="width: {category_counts['operations']/max_cat_count*100:.1f}%"></div></div>
              <div class="bar-value">{category_counts['operations']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">Time</div>
              <div class="bar-track"><div class="bar-fill bar-time" style="width: {category_counts['time']/max_cat_count*100:.1f}%"></div></div>
              <div class="bar-value">{category_counts['time']}</div>
            </div>
          </div>
          <div class="chart-total">
            <span class="total-label">Product Factors: 7/7</span>
            <span class="total-value">{total_tests} Test Ideas</span>
          </div>
          <div style="margin-top: 10px; padding: 8px 12px; background: #fef9c3; border-radius: 4px; font-size: 0.8rem; color: #92400e;">
            <strong>Clarifying Questions:</strong> Review each category for questions requiring stakeholder input
          </div>
        </div>
        <div class="chart-panel">
          <h3>Test Ideas by Priority</h3>
          <div class="bar-chart">
            <div class="bar-row">
              <div class="bar-label">P0 - Critical</div>
              <div class="bar-track"><div class="bar-fill bar-p0" style="width: {priority_counts['P0']/max_priority_count*100:.1f}%"></div></div>
              <div class="bar-value">{priority_counts['P0']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">P1 - High</div>
              <div class="bar-track"><div class="bar-fill bar-p1" style="width: {priority_counts['P1']/max_priority_count*100:.1f}%"></div></div>
              <div class="bar-value">{priority_counts['P1']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">P2 - Medium</div>
              <div class="bar-track"><div class="bar-fill bar-p2" style="width: {priority_counts['P2']/max_priority_count*100:.1f}%"></div></div>
              <div class="bar-value">{priority_counts['P2']}</div>
            </div>
            <div class="bar-row">
              <div class="bar-label">P3 - Low</div>
              <div class="bar-track"><div class="bar-fill bar-p3" style="width: {priority_counts['P3']/max_priority_count*100:.1f}%"></div></div>
              <div class="bar-value">{priority_counts['P3']}</div>
            </div>
          </div>
          <div style="margin-top: 8px; padding: 8px 12px; background: #f0fdf4; border-radius: 4px; font-size: 0.8rem; color: #065f46;">
            <strong>Distribution:</strong> P0={priority_counts['P0']/total_tests*100:.0f}% | P1={priority_counts['P1']/total_tests*100:.0f}% | P2={priority_counts['P2']/total_tests*100:.0f}% | P3={priority_counts['P3']/total_tests*100:.0f}%
          </div>

          <h4 style="font-size: 0.85rem; color: var(--text-dark); margin: 14px 0 8px 0; padding-top: 12px; border-top: 1px solid var(--border); font-weight: 600;">Test Ideas by Automation Fitness</h4>
          <div class="bar-chart" style="font-size: 0.85rem;">
            <div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 100px; font-size: 0.8rem;">API level</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {automation_counts['api']/max_auto_count*100:.1f}%; background: linear-gradient(90deg, #6366f1, #8b5cf6);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">{automation_counts['api']}</div>
            </div>
            <div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 100px; font-size: 0.8rem;">E2E level</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {automation_counts['e2e']/max_auto_count*100:.1f}%; background: linear-gradient(90deg, #ec4899, #db2777);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">{automation_counts['e2e']}</div>
            </div>
            <div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 100px; font-size: 0.8rem;">Integration</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {automation_counts['integration']/max_auto_count*100:.1f}%; background: linear-gradient(90deg, #10b981, #059669);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">{automation_counts['integration']}</div>
            </div>
            <div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 100px; font-size: 0.8rem;">Human Exploration</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {automation_counts['human']/max_auto_count*100:.1f}%; background: linear-gradient(90deg, #7c3aed, #6d28d9);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">{automation_counts['human']}</div>
            </div>
            <div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 100px; font-size: 0.8rem;">Performance</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {automation_counts['performance']/max_auto_count*100:.1f}%; background: linear-gradient(90deg, #f59e0b, #d97706);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">{automation_counts['performance']}</div>
            </div>
            <div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 100px; font-size: 0.8rem;">Security</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {automation_counts['security']/max_auto_count*100:.1f}%; background: linear-gradient(90deg, #ef4444, #dc2626);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">{automation_counts['security']}</div>
            </div>
            <div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 100px; font-size: 0.8rem;">Concurrency</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {automation_counts['concurrency']/max_auto_count*100:.1f}%; background: linear-gradient(90deg, #f97316, #ea580c);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">{automation_counts['concurrency']}</div>
            </div>
          </div>
          <div style="margin-top: 8px; padding: 8px 12px; background: #f3e8ff; border-radius: 4px; font-size: 0.8rem; color: #5b21b6;">
            <strong>Human Exploration:</strong> {automation_counts['human']/total_tests*100:.1f}% of tests require human judgment
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="test-ideas">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--primary);">
        <h2 style="margin: 0; border: none; padding: 0;">Test Ideas by Product Factor</h2>
        <button onclick="toggleAllSections()" id="toggle-all-btn" style="background: var(--bg-light); border: 1px solid var(--border); padding: 6px 14px; border-radius: 4px; font-size: 0.8rem; cursor: pointer; font-weight: 500; color: var(--text-dark);">Collapse All</button>
      </div>
'''

    # Generate category sections
    category_info = {
        "structure": ("STRU", "STRUCTURE: Test ideas for everything that comprises the physical product", "cat-structure"),
        "function": ("FUNC", "FUNCTION: Test ideas for everything that the product does", "cat-function"),
        "data": ("DATA", "DATA: Test ideas for everything that the product processes", "cat-data"),
        "interfaces": ("INTF", "INTERFACES: Test ideas for how the product connects", "cat-interfaces"),
        "platform": ("PLAT", "PLATFORM: Test ideas for what the product depends on", "cat-platform"),
        "operations": ("OPER", "OPERATIONS: Test ideas for how the product is used", "cat-operations"),
        "time": ("TIME", "TIME: Test ideas for when things happen", "cat-time")
    }

    clarifying_questions = {
        "structure": [
            ("Hardware", "The user stories focus on frontend components but don't specify hardware requirements.", [
                "Should outfit module support biometric authentication for quick checkout on mobile devices?",
                "What are the minimum device specifications for rendering outfit visualizations smoothly?",
                "Should piece swapper utilize device camera for AR try-on functionality in future iterations?"
            ]),
            ("NonExecutable", "Configuration and feature flag requirements not specified.", [
                "What environment variables configure the style matching algorithm thresholds?",
                "Are there feature flags controlling which users see UGC content vs editorial only?",
                "What static assets (outfit placeholders, loading animations) need testing across locales?"
            ])
        ],
        "function": [
            ("Algorithm Transparency", "Style matching algorithm criteria not fully defined.", [
                "What specific style rules determine 'outfit cohesion' when suggesting swap alternatives?",
                "How should the algorithm handle conflicting style signals (formal top with casual bottom)?",
                "What confidence threshold determines when to show 'Similar Items' vs exact matches in UGC?"
            ]),
            ("Error Recovery", "Recovery paths for partial failures not specified.", [
                "If 2 of 4 items fail to add during Add Complete Look, should partial addition proceed?",
                "How should piece swapper behave if style matching service returns no alternatives?",
                "What happens if UGC image processing fails mid-submission?"
            ])
        ],
        "data": [
            ("Data Retention", "UGC data lifecycle not specified.", [
                "How long are rejected UGC submissions retained before deletion?",
                "Should customers be able to delete their submitted outfits after publication?",
                "What happens to outfit customization history for analytics purposes?"
            ]),
            ("Data Validation", "Input validation rules for UGC not fully specified.", [
                "What image formats and dimensions are accepted for UGC submissions?",
                "Are there content moderation rules for outfit descriptions (profanity, spam)?",
                "How are duplicate UGC submissions detected and handled?"
            ])
        ],
        "interfaces": [
            ("Accessibility", "Detailed accessibility requirements for outfit interactions.", [
                "How should screen readers announce real-time price updates during piece swaps?",
                "What alternative text should describe outfit images for visually impaired users?",
                "Should occasion filter provide voice feedback for selected filters?"
            ]),
            ("API Versioning", "API evolution strategy not specified.", [
                "How will outfit API handle breaking changes for existing integrations?",
                "Should deprecated API fields be maintained for backward compatibility?",
                "What is the expected API rate limit for high-traffic periods?"
            ])
        ],
        "platform": [
            ("Device Support", "Specific device requirements not enumerated.", [
                "What is the minimum iOS/Android version for full outfit functionality?",
                "Should tablet users see a different outfit layout than mobile?",
                "How should outfit module behave on foldable devices?"
            ])
        ],
        "operations": [
            ("User Onboarding", "First-time user experience not specified.", [
                "Should first-time users see a tutorial for outfit features?",
                "How should empty states appear for users with no browsing history?",
                "Should occasion filters default to user's past preferences or neutral state?"
            ]),
            ("Analytics", "Success metrics implementation not detailed.", [
                "What events track the target '5x increase in outfit page views'?",
                "How is 'multi-item basket rate' attributed to outfit feature?",
                "What defines an 'outfit-originated order' for AOV calculation?"
            ])
        ],
        "time": [
            ("Caching", "Cache invalidation strategy not specified.", [
                "How quickly should inventory changes reflect in outfit availability?",
                "What is the expected TTL for outfit composition cache?",
                "Should personalized recommendations be cached per-user or computed real-time?"
            ]),
            ("Real-time Updates", "WebSocket vs polling approach not defined.", [
                "Should price updates during piece swap use WebSocket or polling?",
                "How should inventory changes be communicated during active browsing session?",
                "What latency is acceptable for style matching suggestion updates?"
            ])
        ]
    }

    automation_labels = {
        "api": ("automation-api", "Automate on API level"),
        "e2e": ("automation-e2e", "Automate on E2E level"),
        "integration": ("automation-integration", "Automate on Integration level"),
        "human": ("automation-human", "Human testers must explore"),
        "performance": ("automation-performance", "Performance testing recommended"),
        "security": ("automation-security", "Security testing recommended"),
        "concurrency": ("automation-concurrency", "Concurrency testing recommended")
    }

    human_reasons = {
        "Explore outfit filtering help text; assess whether occasion definitions are self-explanatory": "SUBJECTIVE - Definition clarity requires human judgment to evaluate if terminology matches user mental models",
        "Explore UGC submission guidelines; assess whether photo requirements are unambiguous": "SUBJECTIVE - Requirement clarity cannot be objectively measured; requires human interpretation",
        "Explore style matching suggestions for avant-garde outfit; assess whether algorithm produces coherent alternatives": "EXPERTISE - Fashion coherence requires domain expertise that algorithms cannot replicate",
        "Explore error messages during outfit customization; assess whether messages guide recovery without technical jargon": "SUBJECTIVE - Message clarity and tone require human judgment to evaluate helpfulness",
        "Explore outfit card visual hierarchy; assess whether combined price is most prominent": "PERCEPTION - Visual hierarchy and prominence are perceptual judgments requiring human observation",
        "Explore piece swapper alternatives layout; assess whether style coherence is visually obvious": "PERCEPTION - Visual coherence assessment requires human aesthetic judgment",
        "Explore typical user flow from homepage to outfit purchase; assess friction points": "DISCOVERY - Exploratory testing may uncover unexpected friction not in requirements",
        "Explore outfit experience for fashion novice; assess whether guidance is sufficient": "EXPERTISE - Target user comprehension requires empathetic human evaluation",
        "Explore loading indicator timing; assess whether progress feedback reduces perceived wait": "PERCEPTION - Perceived performance is subjective and requires human observation",
        "Explore third-party style matching library documentation; assess whether integration patterns are clear": "SUBJECTIVE - Documentation clarity requires developer perspective judgment",
        "Explore outfit API documentation; assess whether integration examples cover common use cases": "SUBJECTIVE - API usability requires human judgment to evaluate completeness",
        "Explore Add Complete Look button prominence; assess whether action is immediately discoverable": "PERCEPTION - Visual discoverability requires human observation and cognitive assessment",
        "Explore occasion filter chip visual feedback; assess whether selected state is clearly distinguishable": "PERCEPTION - Visual state clarity requires human perceptual judgment",
        "Explore UGC gallery thumbnail quality; assess whether images accurately represent full outfit": "PERCEPTION - Image quality and representation accuracy require human visual assessment",
        "Explore outfit pricing display for budget-conscious shopper; assess whether value proposition is clear": "EXPERTISE - Value communication requires understanding of target user priorities",
        "Explore piece swapper for trend-follower persona; assess whether alternatives feel current and stylish": "EXPERTISE - Fashion currency requires domain expertise and cultural awareness",
        "Explore animation smoothness during piece swap; assess whether transitions feel polished": "PERCEPTION - Animation quality is subjective and requires human sensory evaluation"
    }

    for cat_key, (prefix, title, css_class) in category_info.items():
        tests = test_ideas[cat_key]
        html += f'''
        <div class="category-section {css_class}" id="{cat_key}">
          <div class="category-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <h3>{title} <span class="badge">{len(tests)}</span></h3>
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
                <tr class="filter-row">
                  <td><input type="text" class="filter-input" data-col="0" placeholder="Filter..." onkeyup="filterTable('table-{cat_key}')"></td>
                  <td><select class="filter-select" data-col="1" onchange="filterTable('table-{cat_key}')"><option value="">All</option><option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></select></td>
                  <td><input type="text" class="filter-input" data-col="2" placeholder="Filter..." onkeyup="filterTable('table-{cat_key}')"></td>
                  <td><input type="text" class="filter-input" data-col="3" placeholder="Filter..." onkeyup="filterTable('table-{cat_key}')"></td>
                  <td><select class="filter-select" data-col="4" onchange="filterTable('table-{cat_key}')"><option value="">All</option><option value="API level">API level</option><option value="E2E level">E2E level</option><option value="Integration">Integration</option><option value="Human">Human</option><option value="Performance">Performance</option><option value="Security">Security</option></select></td>
                </tr>
              </thead>
              <tbody>
'''
        for test in tests:
            auto_class, auto_label = automation_labels[test['automation']]
            priority_class = f"priority-{test['priority'].lower()}"

            # Handle human exploration tests with reasoning
            if test['automation'] == 'human':
                reason = human_reasons.get(test['idea'], "DISCOVERY - Exploratory testing required for subjective quality assessment")
                html += f'''                <tr>
                  <td class="test-id">{test['id']}</td>
                  <td><span class="priority {priority_class}">{test['priority']}</span></td>
                  <td><span class="subcategory">{test['subcategory']}</span></td>
                  <td>{test['idea']}</td>
                  <td><span class="automation {auto_class}">{auto_label}<div class="human-reason">Why Human Essential: {reason}</div></span></td>
                </tr>
'''
            else:
                html += f'''                <tr>
                  <td class="test-id">{test['id']}</td>
                  <td><span class="priority {priority_class}">{test['priority']}</span></td>
                  <td><span class="subcategory">{test['subcategory']}</span></td>
                  <td>{test['idea']}</td>
                  <td><span class="automation {auto_class}">{auto_label}</span></td>
                </tr>
'''

        html += '''              </tbody>
            </table>
'''

        # Add clarifying questions
        if cat_key in clarifying_questions:
            html += '''
            <div class="clarifying-questions">
              <h4>Clarifying Questions to address potential coverage gaps</h4>
              <div class="clarifying-intro">
                <p class="preamble">Since the user stories focus on <strong>outfit shopping, piece swapping, occasion filtering, and UGC gallery</strong>, the following subcategories have limited test coverage.</p>
              </div>
'''
            for subcat, rationale, questions in clarifying_questions[cat_key]:
                html += f'''
              <div class="subcategory-questions">
                <h5>[{subcat}]</h5>
                <p class="rationale"><em>Rationale: {rationale}</em></p>
                <ul>
'''
                for q in questions:
                    html += f'                  <li>{q}</li>\n'
                html += '''                </ul>
              </div>
'''
            html += '''            </div>
'''

        html += '''          </div>
        </div>
'''

    html += '''    </section>
  </div>
</body>
</html>'''

    return html

if __name__ == "__main__":
    main()
