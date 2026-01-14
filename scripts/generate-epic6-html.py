#!/usr/bin/env python3
"""
Generate Epic 6 Product Factors Assessment HTML Report
Matches the reference template structure exactly
"""

import hashlib
import json

# Test ideas data - complete 85 test ideas
test_ideas = [
    # STRUCTURE (15 total)
    {"id": "TC-STRU-PWA01", "category": "Structure", "subcategory": "Code", "priority": "P1", "description": "Verify Service Worker registration succeeds on first load", "automation": "Automate on Integration level"},
    {"id": "TC-STRU-PWA02", "category": "Structure", "subcategory": "Code", "priority": "P1", "description": "Verify Web App Manifest includes correct PWA metadata (name, icons, theme_color)", "automation": "Automate on Integration level"},
    {"id": "TC-STRU-PWA03", "category": "Structure", "subcategory": "Code", "priority": "P1", "description": "Verify Payment Request API integration supports Apple Pay and Google Pay", "automation": "Automate on Integration level"},
    {"id": "TC-STRU-PWA04", "category": "Structure", "subcategory": "Code", "priority": "P1", "description": "Verify Credential Management API integration for biometric auth", "automation": "Automate on Integration level"},
    {"id": "TC-STRU-PWA05", "category": "Structure", "subcategory": "Code", "priority": "P1", "description": "Verify IndexedDB schema for offline data storage (products, cart, user)", "automation": "Automate on Integration level"},
    {"id": "TC-STRU-PWA06", "category": "Structure", "subcategory": "Service", "priority": "P1", "description": "Check that Service Worker service starts successfully and passes health checks", "automation": "Automate on Integration level"},
    {"id": "TC-STRU-PWA07", "category": "Structure", "subcategory": "Service", "priority": "P1", "description": "Check that Push Notification Service integrates with OneSignal/FCM", "automation": "Automate on Integration level"},
    {"id": "TC-STRU-PWA08", "category": "Structure", "subcategory": "Service", "priority": "P1", "description": "Check that Payment Service integrates with Payment Request API", "automation": "Automate on Integration level"},
    {"id": "TC-STRU-PWA09", "category": "Structure", "subcategory": "Code", "priority": "P2", "description": "Verify Service Worker caching strategy (cache-first for static, network-first for API)", "automation": "Automate on Integration level"},
    {"id": "TC-STRU-PWA10", "category": "Structure", "subcategory": "Code", "priority": "P2", "description": "Verify barcode scanner library integration (QuaggaJS or ZXing)", "automation": "Automate on Integration level"},
    {"id": "TC-STRU-PWA11", "category": "Structure", "subcategory": "Code", "priority": "P2", "description": "Verify touch gesture library integration (Hammer.js or native)", "automation": "Automate on Integration level"},
    {"id": "TC-STRU-PWA12", "category": "Structure", "subcategory": "Code", "priority": "P2", "description": "Verify session persistence layer (localStorage, IndexedDB) for cross-device sync", "automation": "Automate on Integration level"},
    {"id": "TC-STRU-PWA13", "category": "Structure", "subcategory": "NonExecutable", "priority": "P2", "description": "Verify PWA manifest icons include all sizes (72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512)", "automation": "Automate on API level"},
    {"id": "TC-STRU-PWA14", "category": "Structure", "subcategory": "NonExecutable", "priority": "P3", "description": "Verify PWA screenshots included in manifest for app store preview", "automation": "Human testers must explore"},
    {"id": "TC-STRU-PWA15", "category": "Structure", "subcategory": "Collateral", "priority": "P3", "description": "Verify help documentation explains PWA install process for iOS and Android", "automation": "Human testers must explore"},

    # FUNCTION (22 total)
    {"id": "TC-FUNC-PWA01", "category": "Function", "subcategory": "SecurityRelated", "priority": "P0", "description": "Verify biometric authentication (Face ID/Touch ID) only accessible over HTTPS", "automation": "Security testing recommended"},
    {"id": "TC-FUNC-PWA02", "category": "Function", "subcategory": "SecurityRelated", "priority": "P0", "description": "Verify Payment Request API only processes payments over secure connection", "automation": "Security testing recommended"},
    {"id": "TC-FUNC-PWA03", "category": "Function", "subcategory": "SecurityRelated", "priority": "P0", "description": "Verify sensitive user data (payment methods, biometric credentials) encrypted in IndexedDB", "automation": "Security testing recommended"},
    {"id": "TC-FUNC-PWA04", "category": "Function", "subcategory": "SecurityRelated", "priority": "P0", "description": "Verify push notification subscriptions require user permission", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA05", "category": "Function", "subcategory": "BusinessRules", "priority": "P1", "description": "Verify PWA install prompt appears after 2 visits within 5 days", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA06", "category": "Function", "subcategory": "BusinessRules", "priority": "P1", "description": "Verify user can dismiss PWA install prompt and re-trigger from menu", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA07", "category": "Function", "subcategory": "BusinessRules", "priority": "P1", "description": "Verify mobile checkout flow supports Apple Pay with one-tap payment", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA08", "category": "Function", "subcategory": "BusinessRules", "priority": "P1", "description": "Verify mobile checkout flow supports Google Pay with one-tap payment", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA09", "category": "Function", "subcategory": "BusinessRules", "priority": "P1", "description": "Verify biometric authentication works on supported devices (iOS with Touch ID/Face ID, Android with fingerprint)", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA10", "category": "Function", "subcategory": "BusinessRules", "priority": "P1", "description": "Verify biometric authentication fallback to password on unsupported devices", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA11", "category": "Function", "subcategory": "BusinessRules", "priority": "P1", "description": "Verify barcode scanner opens camera and detects product barcodes (UPC, EAN-13)", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA12", "category": "Function", "subcategory": "BusinessRules", "priority": "P1", "description": "Verify barcode scan displays product details and in-store price", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA13", "category": "Function", "subcategory": "BusinessRules", "priority": "P1", "description": "Verify push notifications deliver deal alerts with deep links to products", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA14", "category": "Function", "subcategory": "BusinessRules", "priority": "P1", "description": "Verify push notifications deliver stock alerts for wishlisted items", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA15", "category": "Function", "subcategory": "BusinessRules", "priority": "P1", "description": "Verify offline browsing displays previously viewed products from IndexedDB", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA16", "category": "Function", "subcategory": "BusinessRules", "priority": "P1", "description": "Verify offline mode displays \"Offline\" banner with queue status", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA17", "category": "Function", "subcategory": "BusinessRules", "priority": "P1", "description": "Verify swipe gesture navigates between product images", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA18", "category": "Function", "subcategory": "BusinessRules", "priority": "P2", "description": "Verify pull-to-refresh updates product list and cart", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA19", "category": "Function", "subcategory": "BusinessRules", "priority": "P2", "description": "Verify session persists across devices when user logs in", "automation": "Automate on E2E level"},
    {"id": "TC-FUNC-PWA20", "category": "Function", "subcategory": "Calculation", "priority": "P0", "description": "Validate 20% reduction in mobile checkout abandonment rate", "automation": "Automate on API level"},
    {"id": "TC-FUNC-PWA21", "category": "Function", "subcategory": "Calculation", "priority": "P0", "description": "Validate 15% increase in mobile conversion rate", "automation": "Automate on API level"},
    {"id": "TC-FUNC-PWA22", "category": "Function", "subcategory": "ErrorHandling", "priority": "P1", "description": "Verify user-friendly error message when biometric auth fails", "automation": "Automate on E2E level"},

    # DATA (8 total)
    {"id": "TC-DATA-PWA01", "category": "Data", "subcategory": "InvalidNoise", "priority": "P1", "description": "Verify rejection of invalid barcode formats (non-UPC/EAN)", "automation": "Automate on API level"},
    {"id": "TC-DATA-PWA02", "category": "Data", "subcategory": "InvalidNoise", "priority": "P1", "description": "Verify rejection of malformed push notification payloads", "automation": "Automate on API level"},
    {"id": "TC-DATA-PWA03", "category": "Data", "subcategory": "InputOutput", "priority": "P1", "description": "Validate IndexedDB stores product data with correct schema", "automation": "Automate on API level"},
    {"id": "TC-DATA-PWA04", "category": "Data", "subcategory": "InputOutput", "priority": "P1", "description": "Validate offline cart data syncs to server when connection restored", "automation": "Automate on Integration level"},
    {"id": "TC-DATA-PWA05", "category": "Data", "subcategory": "Persistence", "priority": "P0", "description": "Verify cart data persists in IndexedDB after app close", "automation": "Automate on E2E level"},
    {"id": "TC-DATA-PWA06", "category": "Data", "subcategory": "Persistence", "priority": "P0", "description": "Verify user session persists across devices using server-side sync", "automation": "Automate on Integration level"},
    {"id": "TC-DATA-PWA07", "category": "Data", "subcategory": "Boundaries", "priority": "P2", "description": "Verify IndexedDB quota management (max 50MB on mobile browsers)", "automation": "Automate on API level"},
    {"id": "TC-DATA-PWA08", "category": "Data", "subcategory": "Boundaries", "priority": "P2", "description": "Verify Service Worker cache eviction when quota exceeded", "automation": "Automate on API level"},

    # INTERFACES (18 total)
    {"id": "TC-INTF-PWA01", "category": "Interfaces", "subcategory": "UserInterface", "priority": "P0", "description": "Verify touch targets meet minimum size (44x44 CSS pixels per Epic 1)", "automation": "Automate on E2E level"},
    {"id": "TC-INTF-PWA02", "category": "Interfaces", "subcategory": "UserInterface", "priority": "P1", "description": "Verify PWA install prompt UI displays app name, icon, and description", "automation": "Automate on E2E level"},
    {"id": "TC-INTF-PWA03", "category": "Interfaces", "subcategory": "UserInterface", "priority": "P1", "description": "Verify Apple Pay payment sheet displays correctly on iOS Safari", "automation": "Automate on E2E level"},
    {"id": "TC-INTF-PWA04", "category": "Interfaces", "subcategory": "UserInterface", "priority": "P1", "description": "Verify Google Pay payment sheet displays correctly on Android Chrome", "automation": "Automate on E2E level"},
    {"id": "TC-INTF-PWA05", "category": "Interfaces", "subcategory": "UserInterface", "priority": "P1", "description": "Verify biometric auth prompt displays native OS dialog (Face ID/Touch ID)", "automation": "Automate on E2E level"},
    {"id": "TC-INTF-PWA06", "category": "Interfaces", "subcategory": "UserInterface", "priority": "P1", "description": "Verify barcode scanner shows camera viewfinder with targeting guide", "automation": "Automate on E2E level"},
    {"id": "TC-INTF-PWA07", "category": "Interfaces", "subcategory": "UserInterface", "priority": "P1", "description": "Verify push notification permission prompt displays with clear explanation", "automation": "Automate on E2E level"},
    {"id": "TC-INTF-PWA08", "category": "Interfaces", "subcategory": "UserInterface", "priority": "P1", "description": "Verify offline banner displays with \"You're offline\" message", "automation": "Automate on E2E level"},
    {"id": "TC-INTF-PWA09", "category": "Interfaces", "subcategory": "UserInterface", "priority": "P2", "description": "Verify swipe gesture provides haptic feedback on iOS", "automation": "Human testers must explore"},
    {"id": "TC-INTF-PWA10", "category": "Interfaces", "subcategory": "UserInterface", "priority": "P2", "description": "Verify pull-to-refresh shows loading spinner animation", "automation": "Automate on E2E level"},
    {"id": "TC-INTF-PWA11", "category": "Interfaces", "subcategory": "API", "priority": "P0", "description": "Verify Payment Request API returns payment method data on success", "automation": "Automate on API level"},
    {"id": "TC-INTF-PWA12", "category": "Interfaces", "subcategory": "API", "priority": "P0", "description": "Verify Credential Management API returns biometric credential on success", "automation": "Automate on API level"},
    {"id": "TC-INTF-PWA13", "category": "Interfaces", "subcategory": "API", "priority": "P1", "description": "Verify Web Push API subscription endpoint returns valid subscription object", "automation": "Automate on API level"},
    {"id": "TC-INTF-PWA14", "category": "Interfaces", "subcategory": "API", "priority": "P1", "description": "Verify Service Worker message passing between SW and client", "automation": "Automate on API level"},
    {"id": "TC-INTF-PWA15", "category": "Interfaces", "subcategory": "Integration", "priority": "P0", "description": "Verify OneSignal/FCM integration sends push notifications successfully", "automation": "Automate on Integration level"},
    {"id": "TC-INTF-PWA16", "category": "Interfaces", "subcategory": "Integration", "priority": "P1", "description": "Verify barcode scanner integrates with product lookup API", "automation": "Automate on Integration level"},
    {"id": "TC-INTF-PWA17", "category": "Interfaces", "subcategory": "Integration", "priority": "P2", "description": "Verify session sync between mobile and desktop using API", "automation": "Automate on Integration level"},
    {"id": "TC-INTF-PWA18", "category": "Interfaces", "subcategory": "Notifications", "priority": "P1", "description": "Verify push notification click opens PWA to correct product page", "automation": "Automate on E2E level"},

    # PLATFORM (12 total)
    {"id": "TC-PLAT-PWA01", "category": "Platform", "subcategory": "Browser", "priority": "P0", "description": "Verify PWA works on iOS Safari (latest 2 versions)", "automation": "Automate on E2E level"},
    {"id": "TC-PLAT-PWA02", "category": "Platform", "subcategory": "Browser", "priority": "P0", "description": "Verify PWA works on Android Chrome (latest 2 versions)", "automation": "Automate on E2E level"},
    {"id": "TC-PLAT-PWA03", "category": "Platform", "subcategory": "Browser", "priority": "P1", "description": "Verify PWA works on Samsung Internet Browser", "automation": "Automate on E2E level"},
    {"id": "TC-PLAT-PWA04", "category": "Platform", "subcategory": "Browser", "priority": "P2", "description": "Verify graceful degradation on Firefox Mobile (limited PWA support)", "automation": "Automate on E2E level"},
    {"id": "TC-PLAT-PWA05", "category": "Platform", "subcategory": "OS", "priority": "P0", "description": "Verify biometric auth on iOS 14+ with Face ID/Touch ID", "automation": "Automate on E2E level"},
    {"id": "TC-PLAT-PWA06", "category": "Platform", "subcategory": "OS", "priority": "P0", "description": "Verify biometric auth on Android 10+ with fingerprint", "automation": "Automate on E2E level"},
    {"id": "TC-PLAT-PWA07", "category": "Platform", "subcategory": "OS", "priority": "P1", "description": "Verify Apple Pay only on iOS devices with Wallet configured", "automation": "Automate on E2E level"},
    {"id": "TC-PLAT-PWA08", "category": "Platform", "subcategory": "OS", "priority": "P1", "description": "Verify Google Pay only on Android devices with Google Pay configured", "automation": "Automate on E2E level"},
    {"id": "TC-PLAT-PWA09", "category": "Platform", "subcategory": "Hardware", "priority": "P1", "description": "Verify camera access for barcode scanner on devices with rear camera", "automation": "Automate on E2E level"},
    {"id": "TC-PLAT-PWA10", "category": "Platform", "subcategory": "Hardware", "priority": "P2", "description": "Verify barcode scanner fallback on devices without camera", "automation": "Automate on E2E level"},
    {"id": "TC-PLAT-PWA11", "category": "Platform", "subcategory": "ExternalSystems", "priority": "P0", "description": "Verify OneSignal/FCM push service integration", "automation": "Automate on Integration level"},
    {"id": "TC-PLAT-PWA12", "category": "Platform", "subcategory": "ExternalSystems", "priority": "P2", "description": "Verify PWA install analytics tracking (Google Analytics/Mixpanel)", "automation": "Automate on Integration level"},

    # OPERATIONS (6 total)
    {"id": "TC-OPER-PWA01", "category": "Operations", "subcategory": "UsagePatterns", "priority": "P0", "description": "Verify 10% of mobile users install PWA within 30 days (success metric)", "automation": "Automate on API level"},
    {"id": "TC-OPER-PWA02", "category": "Operations", "subcategory": "UsagePatterns", "priority": "P1", "description": "Verify mobile users can complete checkout in <5 taps using Apple/Google Pay", "automation": "Automate on E2E level"},
    {"id": "TC-OPER-PWA03", "category": "Operations", "subcategory": "ExtremeUse", "priority": "P2", "description": "Verify PWA handles 100+ cached products in IndexedDB without lag", "automation": "Performance testing recommended"},
    {"id": "TC-OPER-PWA04", "category": "Operations", "subcategory": "ExtremeUse", "priority": "P2", "description": "Verify offline queue handles 50+ pending actions (cart adds, wishlist)", "automation": "Performance testing recommended"},
    {"id": "TC-OPER-PWA05", "category": "Operations", "subcategory": "Environment", "priority": "P1", "description": "Verify PWA works on low-bandwidth networks (3G simulation)", "automation": "Performance testing recommended"},
    {"id": "TC-OPER-PWA06", "category": "Operations", "subcategory": "Environment", "priority": "P2", "description": "Verify PWA works in airplane mode using cached data", "automation": "Automate on E2E level"},

    # TIME (4 total)
    {"id": "TC-TIME-PWA01", "category": "Time", "subcategory": "Timing", "priority": "P0", "description": "Verify 3.5-second cold start time on mid-range devices (success metric)", "automation": "Performance testing recommended"},
    {"id": "TC-TIME-PWA02", "category": "Time", "subcategory": "Timing", "priority": "P1", "description": "Verify Service Worker installs within 2 seconds on first visit", "automation": "Performance testing recommended"},
    {"id": "TC-TIME-PWA03", "category": "Time", "subcategory": "Concurrency", "priority": "P2", "description": "Verify session sync doesn't block UI when updating across devices", "automation": "Performance testing recommended"},
    {"id": "TC-TIME-PWA04", "category": "Time", "subcategory": "Scheduling", "priority": "P2", "description": "Verify background sync processes offline queue when connection restored", "automation": "Automate on Integration level"},
]

def generate_automation_class(automation):
    """Convert automation fitness to CSS class"""
    mapping = {
        "Automate on API level": "automation-api",
        "Automate on E2E level": "automation-e2e",
        "Automate on Integration level": "automation-integration",
        "Human testers must explore": "automation-human",
        "Performance testing recommended": "automation-performance",
        "Security testing recommended": "automation-security"
    }
    return mapping.get(automation, "automation-other")

def generate_category_html(category_name, test_ideas_for_category):
    """Generate HTML for a category section"""
    category_id = category_name.lower()
    category_class = f"cat-{category_id}"
    count = len(test_ideas_for_category)

    html = f'''
      <div class="category-section {category_class}" id="{category_id}">
        <div class="category-header collapsible-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <h3>{category_name.upper()}: Test ideas for {get_category_description(category_name)} <span class="badge">{count}</span></h3>
          <span class="collapse-icon">▼</span>
        </div>
        <div class="category-content collapsible-content">
          <table class="filterable-table" id="table-{category_id}">
            <thead>
              <tr>
                <th style="width: 100px;">ID</th>
                <th style="width: 70px;">Priority</th>
                <th style="width: 120px;">Subcategory</th>
                <th>Test Idea</th>
                <th style="width: 210px;">Automation Fitness</th>
              </tr>
              <tr class="filter-row">
                <td><input type="text" class="filter-input" data-col="0" placeholder="Filter..." onkeyup="filterTable('table-{category_id}')"></td>
                <td><select class="filter-select" data-col="1" onchange="filterTable('table-{category_id}')"><option value="">All</option><option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></select></td>
                <td><input type="text" class="filter-input" data-col="2" placeholder="Filter..." onkeyup="filterTable('table-{category_id}')"></td>
                <td><input type="text" class="filter-input" data-col="3" placeholder="Filter..." onkeyup="filterTable('table-{category_id}')"></td>
                <td><select class="filter-select" data-col="4" onchange="filterTable('table-{category_id}')"><option value="">All</option><option value="Automate on API level">API level</option><option value="Automate on E2E level">E2E level</option><option value="Automate on Integration level">Integration level</option><option value="Human testers must explore">Human Exploration</option><option value="Performance testing recommended">Performance</option><option value="Security testing recommended">Security</option></select></td>
              </tr>
            </thead>
            <tbody>'''

    for test in test_ideas_for_category:
        html += f'''
              <tr>
                <td class="test-id">{test["id"]}</td>
                <td><span class="priority priority-{test["priority"].lower()}">{test["priority"]}</span></td>
                <td><span class="subcategory">{test["subcategory"]}</span></td>
                <td>{test["description"]}</td>
                <td><span class="automation {generate_automation_class(test["automation"])}">{test["automation"]}</span></td>
              </tr>'''

    html += '''
            </tbody>
          </table>

      <div class="clarifying-questions">
        <h4>Clarifying Questions to address potential coverage gaps</h4>
        <div class="clarifying-intro">
          <p class="preamble">Since the epic focuses on <strong>PWA capabilities, mobile payments, offline functionality</strong>, the following subcategories have limited or no test coverage.</p>
        </div>
        '''

    # Add clarifying questions based on category
    html += get_clarifying_questions(category_name)

    html += '''
      </div>
        </div>
      </div>
'''
    return html

def get_category_description(category):
    descriptions = {
        "Structure": "everything that comprises the physical product",
        "Function": "everything that the product does",
        "Data": "everything that the product processes",
        "Interfaces": "how the product connects",
        "Platform": "what the product depends on",
        "Operations": "how the product is used",
        "Time": "when things happen"
    }
    return descriptions.get(category, "")

def get_clarifying_questions(category):
    questions = {
        "Structure": '''
        <div class="subcategory-questions">
          <h5>[Hardware]</h5>
          <p class="rationale"><em>Rationale: PWA features rely on hardware capabilities that vary across devices</em></p>
          <ul>
            <li>Should PWA work on devices without biometric hardware? What's the fallback UX?</li>
            <li>What's the minimum camera resolution required for barcode scanning?</li>
            <li>Should PWA support NFC for contactless payments in addition to Apple/Google Pay?</li>
          </ul>
        </div>''',
        "Function": '''
        <div class="subcategory-questions">
          <h5>[MultiUserSocial]</h5>
          <p class="rationale"><em>Rationale: Cross-device session persistence may create conflicts</em></p>
          <ul>
            <li>Can a user be logged in on multiple devices simultaneously?</li>
            <li>How are cart conflicts resolved when user adds items on both mobile and desktop?</li>
            <li>Should session expiration on one device log out all devices?</li>
          </ul>
        </div>
        <div class="subcategory-questions">
          <h5>[StateTransitions]</h5>
          <p class="rationale"><em>Rationale: Offline mode creates complex state transitions</em></p>
          <ul>
            <li>What happens to queued offline actions if user logs out before reconnecting?</li>
            <li>Can user cancel queued actions before they sync to server?</li>
            <li>What's the priority order when processing multiple queued actions?</li>
          </ul>
        </div>''',
        "Data": '''
        <div class="subcategory-questions">
          <h5>[Transformations]</h5>
          <p class="rationale"><em>Rationale: Offline data needs transformation for server sync</em></p>
          <ul>
            <li>How are timestamp conflicts resolved when syncing offline cart to server?</li>
            <li>Should offline product prices update when connection restored if prices changed?</li>
            <li>What happens to invalid offline data (deleted products, expired deals)?</li>
          </ul>
        </div>''',
        "Interfaces": '''
        <div class="subcategory-questions">
          <h5>[Interactions]</h5>
          <p class="rationale"><em>Rationale: PWA install and payment flows have many interaction points</em></p>
          <ul>
            <li>What analytics events should be tracked for PWA install funnel?</li>
            <li>Should failed biometric auth attempts be logged for security monitoring?</li>
            <li>How do we track barcode scan errors vs successful scans?</li>
          </ul>
        </div>''',
        "Platform": '''
        <div class="subcategory-questions">
          <h5>[Browser]</h5>
          <p class="rationale"><em>Rationale: iOS Safari has PWA limitations compared to Android Chrome</em></p>
          <ul>
            <li>Should we polyfill missing PWA features on iOS (background sync, install prompt)?</li>
            <li>What's the minimum supported iOS Safari version (affects 30% of users)?</li>
            <li>Should we warn users on unsupported browsers or silently degrade?</li>
          </ul>
        </div>''',
        "Operations": '''
        <div class="subcategory-questions">
          <h5>[Testability]</h5>
          <p class="rationale"><em>Rationale: PWA features require special test environments</em></p>
          <ul>
            <li>How do we test biometric auth in CI/CD without physical devices?</li>
            <li>Is there a test mode for Apple/Google Pay that doesn't charge real cards?</li>
            <li>Can we simulate offline mode reliably in automated tests?</li>
          </ul>
        </div>''',
        "Time": '''
        <div class="subcategory-questions">
          <h5>[Concurrency]</h5>
          <p class="rationale"><em>Rationale: Background sync and push notifications create concurrency scenarios</em></p>
          <ul>
            <li>What happens if user modifies cart while background sync is processing offline queue?</li>
            <li>Can multiple push notifications arrive simultaneously? How are they prioritized?</li>
            <li>Should background sync be throttled on low-battery devices?</li>
          </ul>
        </div>'''
    }
    return questions.get(category, "")

# Group test ideas by category
categories = {}
for test in test_ideas:
    cat = test["category"]
    if cat not in categories:
        categories[cat] = []
    categories[cat].append(test)

# Calculate statistics
total_tests = len(test_ideas)
priority_counts = {"P0": 0, "P1": 0, "P2": 0, "P3": 0}
automation_counts = {}
for test in test_ideas:
    priority_counts[test["priority"]] += 1
    auto = test["automation"]
    automation_counts[auto] = automation_counts.get(auto, 0) + 1

# Read the template header
header_html = open('/workspaces/agentic-qe/.agentic-qe/product-factors-assessments/Epic6-Mobile-First-App-Parity-Assessment-NEW.html').read()

# Find where to insert category sections (after charts section)
charts_end = header_html.find('</section>\n\n    <section class="section" id="test-ideas">')
if charts_end == -1:
    charts_end = header_html.find('<section class="section" id="test-ideas">')

# Build complete HTML
final_html = header_html

# Add all category sections
for category_name in ["Structure", "Function", "Data", "Interfaces", "Platform", "Operations", "Time"]:
    if category_name in categories:
        final_html += generate_category_html(category_name, categories[category_name])

# Close the test-ideas section and add closing tags
final_html += '''
    </section>

    <section class="section" id="traceability">
      <h2>Requirements Traceability</h2>
      <p style="margin-bottom: 15px;">Each test idea maps to specific product requirements from Epic 6:</p>
      <ul style="margin-left: 20px; line-height: 2;">
        <li><strong>PWA Installation (10% adoption goal)</strong>: TC-FUNC-PWA05, TC-FUNC-PWA06, TC-OPER-PWA01</li>
        <li><strong>Mobile Checkout (20% abandonment reduction)</strong>: TC-FUNC-PWA07, TC-FUNC-PWA08, TC-FUNC-PWA20</li>
        <li><strong>Biometric Authentication</strong>: TC-FUNC-PWA01, TC-FUNC-PWA09, TC-FUNC-PWA10, TC-PLAT-PWA05, TC-PLAT-PWA06</li>
        <li><strong>Barcode Scanning</strong>: TC-FUNC-PWA11, TC-FUNC-PWA12, TC-INTF-PWA06, TC-INTF-PWA16</li>
        <li><strong>Push Notifications</strong>: TC-FUNC-PWA13, TC-FUNC-PWA14, TC-INTF-PWA07, TC-INTF-PWA15, TC-INTF-PWA18</li>
        <li><strong>Offline Browsing</strong>: TC-FUNC-PWA15, TC-FUNC-PWA16, TC-DATA-PWA05, TC-OPER-PWA06</li>
        <li><strong>Touch Gestures</strong>: TC-FUNC-PWA17, TC-FUNC-PWA18, TC-INTF-PWA09</li>
        <li><strong>Cross-Device Session</strong>: TC-FUNC-PWA19, TC-DATA-PWA06, TC-INTF-PWA17</li>
        <li><strong>Performance (3.5s cold start)</strong>: TC-TIME-PWA01, TC-TIME-PWA02, TC-OPER-PWA05</li>
      </ul>
    </section>
  </div>
</body>
</html>'''

# Write the complete file
with open('/workspaces/agentic-qe/.agentic-qe/product-factors-assessments/Epic6-Mobile-First-App-Parity-Assessment.html', 'w') as f:
    f.write(final_html)

print("✅ Epic 6 HTML report generated successfully!")
print(f"📊 Total test ideas: {total_tests}")
print(f"📁 Saved to: /workspaces/agentic-qe/.agentic-qe/product-factors-assessments/Epic6-Mobile-First-App-Parity-Assessment.html")
