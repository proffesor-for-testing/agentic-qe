#!/usr/bin/env python3
"""
Generate SFDIPOT Product Factors Assessment HTML Report for Epic 3
AI-Powered Personalization & Search Enhancement
"""

import hashlib
from datetime import datetime

def generate_test_id(category: str, text: str) -> str:
    """Generate unique test ID based on category and text."""
    prefix_map = {
        'structure': 'STRU',
        'function': 'FUNC',
        'data': 'DATA',
        'interfaces': 'INTF',
        'platform': 'PLAT',
        'operations': 'OPER',
        'time': 'TIME'
    }
    prefix = prefix_map.get(category.lower(), 'TEST')
    hash_val = hashlib.md5(text.encode()).hexdigest()[:8].upper()
    return f"TC-{prefix}-{hash_val}"

# Test Ideas organized by SFDIPOT category
TEST_IDEAS = {
    'structure': [
        # Code/Service integrations - P1
        ('P1', 'Code', 'Verify Recommendation Engine integrates with User Behavior Service', 'integration'),
        ('P1', 'Code', 'Verify Recommendation Engine integrates with Product Catalog Service', 'integration'),
        ('P1', 'Code', 'Verify Search Service integrates with Elasticsearch/Algolia backend', 'integration'),
        ('P1', 'Code', 'Verify Search Service integrates with ML Semantic Search model', 'integration'),
        ('P1', 'Code', 'Verify Visual Search integrates with Computer Vision API', 'integration'),
        ('P1', 'Code', 'Verify Visual Search integrates with Product Image Database', 'integration'),
        ('P1', 'Code', 'Verify Personalization API integrates with Edge Cache layer', 'integration'),
        ('P1', 'Code', 'Verify Personalization API integrates with User Session Service', 'integration'),
        ('P1', 'Code', 'Verify Privacy Controls integrate with Consent Management Platform', 'integration'),
        ('P1', 'Code', 'Verify A/B Testing Framework integrates with Analytics Service', 'integration'),
        ('P1', 'Code', 'Verify Occasion-Based Recommendations integrate with Calendar API', 'integration'),
        ('P1', 'Code', 'Verify Continue Shopping feature integrates with Cart Service', 'integration'),
        # Service health - P1
        ('P1', 'Service', 'Check Recommendation Engine service starts and passes health checks', 'integration'),
        ('P1', 'Service', 'Check Search Service starts and passes health checks', 'integration'),
        ('P1', 'Service', 'Check Visual Search Service starts and passes health checks', 'integration'),
        ('P1', 'Service', 'Check Personalization API starts and passes health checks', 'integration'),
        ('P1', 'Service', 'Check ML Model Serving infrastructure is healthy', 'integration'),
        # Component structure - P2
        ('P2', 'Code', 'Verify Recommendation Engine component has correct dependencies', 'integration'),
        ('P2', 'Code', 'Verify Search Service component has correct dependencies', 'integration'),
        ('P2', 'Code', 'Verify Visual Search component has correct dependencies', 'integration'),
        ('P2', 'Code', 'Verify Privacy Controls component has correct dependencies', 'integration'),
        ('P2', 'Code', 'Verify A/B Testing Framework component has correct dependencies', 'integration'),
    ],
    'function': [
        # Core functionality - P0 (Security/Critical)
        ('P0', 'SecurityRelated', 'Verify personalization respects user opt-out preferences', 'e2e'),
        ('P0', 'SecurityRelated', 'Verify user data is not exposed in recommendation API responses', 'api'),
        ('P0', 'SecurityRelated', 'Verify visual search does not store uploaded images without consent', 'api'),
        ('P0', 'SecurityRelated', 'Verify privacy controls immediately stop data collection when enabled', 'e2e'),
        ('P0', 'SecurityRelated', 'Verify A/B test assignment does not leak user segments', 'api'),
        ('P0', 'SecurityRelated', 'Verify search queries are not logged for opted-out users', 'api'),
        # Business Rules - P1
        ('P1', 'BusinessRules', 'Verify homepage displays personalized recommendations for logged-in users', 'e2e'),
        ('P1', 'BusinessRules', 'Verify Continue Shopping shows recently viewed items', 'e2e'),
        ('P1', 'BusinessRules', 'Verify Continue Shopping shows abandoned cart items', 'e2e'),
        ('P1', 'BusinessRules', 'Verify search autocomplete shows product images', 'e2e'),
        ('P1', 'BusinessRules', 'Verify search autocomplete shows category suggestions', 'e2e'),
        ('P1', 'BusinessRules', 'Verify search autocomplete shows trending suggestions', 'e2e'),
        ('P1', 'BusinessRules', 'Verify natural language search returns relevant results', 'e2e'),
        ('P1', 'BusinessRules', 'Verify "blue dress for summer wedding" returns appropriate products', 'e2e'),
        ('P1', 'BusinessRules', 'Verify visual search finds similar products from uploaded image', 'e2e'),
        ('P1', 'BusinessRules', 'Verify Shop by Occasion shows Valentine\'s Day collection in February', 'e2e'),
        ('P1', 'BusinessRules', 'Verify Shop by Occasion shows Mother\'s Day collection in May', 'e2e'),
        ('P1', 'BusinessRules', 'Verify collaborative filtering recommends based on similar users', 'api'),
        ('P1', 'BusinessRules', 'Verify content-based filtering recommends based on product attributes', 'api'),
        ('P1', 'BusinessRules', 'Verify A/B testing correctly assigns users to experiment variants', 'api'),
        ('P1', 'BusinessRules', 'Verify recommendation algorithm changes based on A/B test variant', 'integration'),
        # Calculations - P1
        ('P1', 'Calculations', 'Verify recommendation scoring algorithm produces valid scores', 'api'),
        ('P1', 'Calculations', 'Verify search relevance ranking is calculated correctly', 'api'),
        ('P1', 'Calculations', 'Verify visual similarity score is within expected range', 'api'),
        ('P1', 'Calculations', 'Verify trending calculation considers recency and volume', 'api'),
        # Error Handling - P1
        ('P1', 'ErrorHandling', 'Verify graceful degradation when ML model is unavailable', 'integration'),
        ('P1', 'ErrorHandling', 'Verify fallback recommendations when personalization fails', 'e2e'),
        ('P1', 'ErrorHandling', 'Verify search returns generic results when semantic search fails', 'e2e'),
        ('P1', 'ErrorHandling', 'Verify visual search shows error for unsupported image formats', 'e2e'),
        ('P1', 'ErrorHandling', 'Verify visual search handles corrupted image uploads', 'api'),
        ('P1', 'ErrorHandling', 'Verify system handles edge cache miss gracefully', 'integration'),
        # Features - P2
        ('P2', 'Features', 'Verify guest users see generic trending recommendations', 'e2e'),
        ('P2', 'Features', 'Verify new users see onboarding-based recommendations', 'e2e'),
        ('P2', 'Features', 'Verify search history appears in autocomplete for logged-in users', 'e2e'),
        ('P2', 'Features', 'Verify clear search history option works correctly', 'e2e'),
        ('P2', 'Features', 'Verify multiple image upload for visual search comparison', 'e2e'),
        ('P2', 'Features', 'Verify visual search works with product photos and lifestyle images', 'e2e'),
    ],
    'data': [
        # Input - P0
        ('P0', 'Input', 'Verify visual search rejects images over maximum file size (10MB)', 'api'),
        ('P0', 'Input', 'Verify search query sanitizes SQL injection attempts', 'security'),
        ('P0', 'Input', 'Verify search query sanitizes XSS payloads', 'security'),
        # Input - P1
        ('P1', 'Input', 'Verify visual search accepts JPEG, PNG, WebP formats', 'api'),
        ('P1', 'Input', 'Verify search handles special characters correctly', 'api'),
        ('P1', 'Input', 'Verify search handles unicode characters (international queries)', 'api'),
        ('P1', 'Input', 'Verify natural language queries are parsed correctly', 'api'),
        ('P1', 'Input', 'Verify recommendation API handles missing user preferences', 'api'),
        # Output - P1
        ('P1', 'Output', 'Verify recommendation response contains required product fields', 'api'),
        ('P1', 'Output', 'Verify search results include product images, prices, ratings', 'api'),
        ('P1', 'Output', 'Verify visual search returns similarity scores', 'api'),
        ('P1', 'Output', 'Verify autocomplete suggestions are properly formatted', 'api'),
        # Persistence - P1
        ('P1', 'Persistence', 'Verify user browsing history is correctly stored', 'integration'),
        ('P1', 'Persistence', 'Verify user preferences persist across sessions', 'e2e'),
        ('P1', 'Persistence', 'Verify opted-out user data is properly deleted', 'api'),
        ('P1', 'Persistence', 'Verify A/B test assignments persist for user journey', 'api'),
        # Boundaries - P2
        ('P2', 'Boundaries', 'Verify recommendation count limits (min 1, max 50)', 'api'),
        ('P2', 'Boundaries', 'Verify search results pagination handles edge cases', 'api'),
        ('P2', 'Boundaries', 'Verify autocomplete max suggestions limit (10)', 'api'),
        ('P2', 'Boundaries', 'Verify visual search handles minimum image dimensions', 'api'),
    ],
    'interfaces': [
        # User Interface - P0
        ('P0', 'UserInterface', 'Verify privacy opt-out toggle is clearly visible in settings', 'e2e'),
        ('P0', 'UserInterface', 'Verify opt-out confirmation dialog explains data implications', 'e2e'),
        # User Interface - P1
        ('P1', 'UserInterface', 'Verify personalized recommendations section displays on homepage', 'e2e'),
        ('P1', 'UserInterface', 'Verify Continue Shopping section is prominent for returning users', 'e2e'),
        ('P1', 'UserInterface', 'Verify search bar shows autocomplete dropdown', 'e2e'),
        ('P1', 'UserInterface', 'Verify autocomplete shows product thumbnails', 'e2e'),
        ('P1', 'UserInterface', 'Verify visual search upload button is discoverable', 'e2e'),
        ('P1', 'UserInterface', 'Verify visual search shows upload progress indicator', 'e2e'),
        ('P1', 'UserInterface', 'Verify visual search results display similar products grid', 'e2e'),
        ('P1', 'UserInterface', 'Verify Shop by Occasion carousel is interactive', 'e2e'),
        ('P1', 'UserInterface', 'Verify recommendation cards show product details on hover', 'e2e'),
        # APIs - P1
        ('P1', 'APIs', 'Verify GET /api/recommendations/{userId} returns personalized products', 'api'),
        ('P1', 'APIs', 'Verify GET /api/search?q={query} returns relevant results', 'api'),
        ('P1', 'APIs', 'Verify POST /api/visual-search accepts image upload', 'api'),
        ('P1', 'APIs', 'Verify GET /api/autocomplete?q={prefix} returns suggestions', 'api'),
        ('P1', 'APIs', 'Verify PUT /api/user/preferences updates personalization settings', 'api'),
        ('P1', 'APIs', 'Verify GET /api/occasions returns current occasion collections', 'api'),
        ('P1', 'APIs', 'Verify GET /api/continue-shopping returns recent items', 'api'),
        ('P1', 'APIs', 'Verify API rate limiting prevents abuse (100 req/min)', 'api'),
        # Integration Points - P1
        ('P1', 'IntegrationPoints', 'Verify Elasticsearch query syntax is correctly formed', 'integration'),
        ('P1', 'IntegrationPoints', 'Verify ML model API contract is honored', 'integration'),
        ('P1', 'IntegrationPoints', 'Verify Computer Vision API integration handles timeouts', 'integration'),
        ('P1', 'IntegrationPoints', 'Verify edge cache CDN integration caches personalization', 'integration'),
        ('P1', 'IntegrationPoints', 'Verify analytics events fire for recommendation clicks', 'integration'),
        # User Interface - P2
        ('P2', 'UserInterface', 'Verify recommendation carousel supports swipe on mobile', 'e2e'),
        ('P2', 'UserInterface', 'Verify search results show filtering options', 'e2e'),
        ('P2', 'UserInterface', 'Verify visual search camera capture works on mobile', 'e2e'),
        ('P2', 'UserInterface', 'Verify loading skeletons display while fetching recommendations', 'e2e'),
    ],
    'platform': [
        # Browser - P1
        ('P1', 'Browser', 'Verify personalization works on Chrome, Firefox, Safari, Edge', 'e2e'),
        ('P1', 'Browser', 'Verify visual search upload works across browsers', 'e2e'),
        ('P1', 'Browser', 'Verify autocomplete keyboard navigation works', 'e2e'),
        # OS - P1
        ('P1', 'OS', 'Verify visual search camera access on iOS Safari', 'e2e'),
        ('P1', 'OS', 'Verify visual search camera access on Android Chrome', 'e2e'),
        # External Systems - P1
        ('P1', 'ExternalSystems', 'Verify Elasticsearch cluster handles search load', 'performance'),
        ('P1', 'ExternalSystems', 'Verify ML model serving infrastructure scales', 'performance'),
        ('P1', 'ExternalSystems', 'Verify CDN edge cache properly invalidates', 'integration'),
        # Platform - P2
        ('P2', 'Browser', 'Verify drag-and-drop image upload works', 'e2e'),
        ('P2', 'Device', 'Verify recommendations display correctly on tablet', 'e2e'),
    ],
    'operations': [
        # Common Use - P1
        ('P1', 'CommonUse', 'Verify returning customer sees relevant recommendations immediately', 'e2e'),
        ('P1', 'CommonUse', 'Verify search for popular product returns expected results', 'e2e'),
        ('P1', 'CommonUse', 'Verify browsing products updates recommendations in real-time', 'e2e'),
        ('P1', 'CommonUse', 'Verify gift shopper journey with occasion-based collections', 'human'),
        # Extreme Use - P1
        ('P1', 'ExtremeUse', 'Verify system handles Black Friday traffic spike', 'performance'),
        ('P1', 'ExtremeUse', 'Verify search handles 10,000 concurrent queries', 'performance'),
        ('P1', 'ExtremeUse', 'Verify recommendation engine handles cold start for new users', 'e2e'),
        ('P1', 'ExtremeUse', 'Verify visual search queue handles burst uploads', 'performance'),
        # User Scenarios - P1
        ('P1', 'Users', 'Verify privacy-conscious user can fully opt out', 'e2e'),
        ('P1', 'Users', 'Verify user with inspiration can find similar products', 'human'),
        ('P1', 'Users', 'Verify returning customer journey is personalized end-to-end', 'human'),
        # Disruptive Scenarios - P2
        ('P2', 'Disruptive', 'Verify system recovers from ML model deployment failure', 'integration'),
        ('P2', 'Disruptive', 'Verify search continues when Elasticsearch node fails', 'integration'),
        ('P2', 'Disruptive', 'Verify personalization degrades gracefully during outage', 'integration'),
    ],
    'time': [
        # Response Time - P0
        ('P0', 'ResponseTime', 'Verify search autocomplete responds within 100ms', 'performance'),
        ('P0', 'ResponseTime', 'Verify homepage personalization loads within 200ms', 'performance'),
        # Concurrency - P1
        ('P1', 'Concurrency', 'Verify concurrent recommendation requests do not conflict', 'concurrency'),
        ('P1', 'Concurrency', 'Verify A/B test assignments are thread-safe', 'concurrency'),
        ('P1', 'Concurrency', 'Verify visual search queue processes in parallel', 'concurrency'),
        # Real-time - P1
        ('P1', 'Realtime', 'Verify recommendations update after purchase within 5 minutes', 'e2e'),
        ('P1', 'Realtime', 'Verify trending products reflect last 24 hours', 'api'),
        ('P1', 'Realtime', 'Verify occasion collections activate on correct dates', 'api'),
        # Caching - P1
        ('P1', 'Caching', 'Verify edge cache TTL is appropriate (5 min for personalization)', 'integration'),
        ('P1', 'Caching', 'Verify cache invalidation on user preference change', 'integration'),
        # Scheduling - P2
        ('P2', 'Scheduling', 'Verify ML model retraining job runs on schedule', 'integration'),
        ('P2', 'Scheduling', 'Verify trending calculation batch job completes', 'integration'),
    ]
}

# Clarifying questions by category
CLARIFYING_QUESTIONS = {
    'structure': {
        'preamble': 'ML recommendation engine, visual search, and personalization APIs',
        'questions': [
            {
                'subcategory': 'Hardware',
                'rationale': 'Visual search and ML inference may have GPU/hardware requirements not specified.',
                'items': [
                    'Does the ML model serving require GPU infrastructure or can it run on CPU?',
                    'What are the minimum device camera specifications for visual search quality?',
                    'Should visual search work offline with on-device ML models?'
                ]
            },
            {
                'subcategory': 'NonExecutable',
                'rationale': 'ML models require configuration for thresholds, feature flags for rollout.',
                'items': [
                    'What similarity threshold determines visual search match quality?',
                    'Are there feature flags to gradually roll out personalization algorithms?',
                    'What configuration controls the number of recommendations shown?'
                ]
            },
            {
                'subcategory': 'Collateral',
                'rationale': 'Privacy controls and personalization features need clear user documentation.',
                'items': [
                    'Is there documentation explaining how personalization data is used?',
                    'Are privacy policy updates required for visual search image processing?',
                    'Is there help content for users who want to understand their recommendations?'
                ]
            }
        ]
    },
    'function': {
        'preamble': 'personalized recommendations, natural language search, and visual search',
        'questions': [
            {
                'subcategory': 'Testability',
                'rationale': 'ML-based recommendations are inherently probabilistic and hard to verify.',
                'items': [
                    'How do we verify recommendation quality beyond click-through rates?',
                    'What is the acceptance criteria for "relevant" search results?',
                    'How do we test visual search accuracy across different product categories?'
                ]
            },
            {
                'subcategory': 'AuditTrail',
                'rationale': 'Personalization decisions may need explainability for compliance.',
                'items': [
                    'Should users be able to see why a product was recommended to them?',
                    'Is there audit logging for A/B test variant assignments?',
                    'How long should user behavior data be retained for recommendations?'
                ]
            }
        ]
    },
    'data': {
        'preamble': 'user behavior tracking, browsing history, and visual search uploads',
        'questions': [
            {
                'subcategory': 'GDPR/Privacy',
                'rationale': 'User behavior data and uploaded images have privacy implications.',
                'items': [
                    'How long are visual search images retained after processing?',
                    'Can users export their personalization profile data (GDPR)?',
                    'What data is collected from guest users versus logged-in users?'
                ]
            },
            {
                'subcategory': 'DataQuality',
                'rationale': 'ML model accuracy depends on training data quality.',
                'items': [
                    'How is training data for recommendations validated for bias?',
                    'What happens when product catalog data is incomplete or stale?',
                    'How do we handle users with very limited browsing history?'
                ]
            }
        ]
    },
    'interfaces': {
        'preamble': 'search UI, recommendation widgets, and visual search upload',
        'questions': [
            {
                'subcategory': 'Accessibility',
                'rationale': 'Personalization features must be accessible to all users.',
                'items': [
                    'How do screen readers announce personalized recommendations?',
                    'Is visual search accessible to users who cannot upload images?',
                    'Are autocomplete suggestions keyboard navigable?'
                ]
            },
            {
                'subcategory': 'Internationalization',
                'rationale': 'Search and recommendations may need localization.',
                'items': [
                    'Does natural language search work in languages other than English?',
                    'Are occasion-based collections localized for different regions?',
                    'How do recommendations handle multi-currency product catalogs?'
                ]
            }
        ]
    },
    'platform': {
        'preamble': 'ML infrastructure, Elasticsearch, and edge caching',
        'questions': [
            {
                'subcategory': 'Infrastructure',
                'rationale': 'ML serving and search infrastructure have specific requirements.',
                'items': [
                    'What is the expected Elasticsearch cluster size for search volume?',
                    'How does the ML model serving infrastructure handle version rollbacks?',
                    'What CDN provider is used for edge caching and what are its limitations?'
                ]
            },
            {
                'subcategory': 'Fallback',
                'rationale': 'External system dependencies need fallback strategies.',
                'items': [
                    'What happens if the Computer Vision API is rate-limited?',
                    'Is there a fallback search when Elasticsearch is unavailable?',
                    'How does personalization work when the recommendation engine is down?'
                ]
            }
        ]
    },
    'operations': {
        'preamble': 'personalized shopping journeys and visual search workflows',
        'questions': [
            {
                'subcategory': 'Analytics',
                'rationale': 'Measuring personalization effectiveness requires analytics.',
                'items': [
                    'How do we measure the 10-15% revenue lift from personalization?',
                    'What metrics define successful visual search adoption?',
                    'How do we track A/B test variant performance over time?'
                ]
            },
            {
                'subcategory': 'Support',
                'rationale': 'Support teams need tools for personalization issues.',
                'items': [
                    'Can support agents view a user\'s personalization profile for debugging?',
                    'How are visual search failures reported and investigated?',
                    'What tools exist to manually override recommendations for testing?'
                ]
            }
        ]
    },
    'time': {
        'preamble': 'real-time personalization, caching, and ML model updates',
        'questions': [
            {
                'subcategory': 'Freshness',
                'rationale': 'Recommendations must balance freshness with performance.',
                'items': [
                    'How quickly should recommendations reflect a new purchase?',
                    'What is the acceptable staleness for cached personalization?',
                    'How often is the trending products calculation updated?'
                ]
            },
            {
                'subcategory': 'ModelLifecycle',
                'rationale': 'ML models need retraining and deployment schedules.',
                'items': [
                    'How frequently are recommendation models retrained?',
                    'What is the rollout strategy for new ML model versions?',
                    'How do we detect and respond to model performance degradation?'
                ]
            }
        ]
    }
}

def get_automation_class(automation_type: str) -> tuple:
    """Get CSS class and display text for automation type."""
    mapping = {
        'api': ('automation-api', 'Automate on API level'),
        'e2e': ('automation-e2e', 'Automate on E2E level'),
        'integration': ('automation-integration', 'Automate on Integration level'),
        'human': ('automation-human', 'Human testers must explore'),
        'performance': ('automation-performance', 'Performance testing recommended'),
        'security': ('automation-security', 'Security testing recommended'),
        'concurrency': ('automation-concurrency', 'Concurrency testing recommended'),
    }
    return mapping.get(automation_type, ('automation-other', automation_type))

def count_by_category() -> dict:
    """Count test ideas by category."""
    return {cat: len(ideas) for cat, ideas in TEST_IDEAS.items()}

def count_by_priority() -> dict:
    """Count test ideas by priority."""
    counts = {'P0': 0, 'P1': 0, 'P2': 0, 'P3': 0}
    for ideas in TEST_IDEAS.values():
        for priority, _, _, _ in ideas:
            counts[priority] = counts.get(priority, 0) + 1
    return counts

def count_by_automation() -> dict:
    """Count test ideas by automation fitness."""
    counts = {}
    for ideas in TEST_IDEAS.values():
        for _, _, _, auto in ideas:
            counts[auto] = counts.get(auto, 0) + 1
    return counts

def generate_html() -> str:
    """Generate the complete HTML report."""
    cat_counts = count_by_category()
    priority_counts = count_by_priority()
    auto_counts = count_by_automation()
    total = sum(cat_counts.values())
    max_cat = max(cat_counts.values())
    max_priority = max(priority_counts.values())
    max_auto = max(auto_counts.values())

    today = datetime.now().strftime('%Y-%m-%d')

    # Generate test idea rows for each category
    def generate_rows(category: str) -> str:
        rows = []
        for priority, subcat, text, auto in TEST_IDEAS[category]:
            test_id = generate_test_id(category, text)
            auto_class, auto_text = get_automation_class(auto)
            rows.append(f'''<tr>
          <td class="test-id">{test_id}</td>
          <td><span class="priority priority-{priority.lower()}">{priority}</span></td>
          <td><span class="subcategory">{subcat}</span></td>
          <td>{text}</td>
          <td><span class="automation {auto_class}">{auto_text}</span></td>
        </tr>''')
        return '\n'.join(rows)

    # Generate clarifying questions for each category
    def generate_questions(category: str) -> str:
        if category not in CLARIFYING_QUESTIONS:
            return ''

        q = CLARIFYING_QUESTIONS[category]
        questions_html = []
        for subq in q['questions']:
            items = '\n'.join(f'<li>{item}</li>' for item in subq['items'])
            questions_html.append(f'''
          <div class="subcategory-questions">
            <h5>[{subq['subcategory']}]</h5>
            <p class="rationale"><em>Rationale: {subq['rationale']}</em></p>
            <ul>
              {items}
            </ul>
          </div>''')

        return f'''
        <div class="clarifying-questions">
          <h4>Clarifying Questions to address potential coverage gaps</h4>
          <div class="clarifying-intro">
            <p class="preamble">Since the user stories focus on <strong>{q['preamble']}</strong>, the following subcategories have limited or no test coverage.</p>
          </div>
          {''.join(questions_html)}
        </div>'''

    # Category section template
    def category_section(cat_id: str, cat_name: str, description: str, color_class: str) -> str:
        return f'''
        <div class="category-section {color_class}" id="{cat_id}">
          <div class="category-header collapsible-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <h3>{cat_name.upper()}: {description} <span class="badge">{cat_counts[cat_id]}</span></h3>
            <span class="collapse-icon">-</span>
          </div>
          <div class="category-content collapsible-content">
            <table class="filterable-table" id="table-{cat_id}">
              <thead>
                <tr>
                  <th style="width: 100px;">ID</th>
                  <th style="width: 70px;">Priority</th>
                  <th style="width: 120px;">Subcategory</th>
                  <th>Test Idea</th>
                  <th style="width: 210px;">Automation Fitness</th>
                </tr>
                <tr class="filter-row">
                  <td><input type="text" class="filter-input" data-col="0" placeholder="Filter..." onkeyup="filterTable('table-{cat_id}')"></td>
                  <td><select class="filter-select" data-col="1" onchange="filterTable('table-{cat_id}')"><option value="">All</option><option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></select></td>
                  <td><input type="text" class="filter-input" data-col="2" placeholder="Filter..." onkeyup="filterTable('table-{cat_id}')"></td>
                  <td><input type="text" class="filter-input" data-col="3" placeholder="Filter..." onkeyup="filterTable('table-{cat_id}')"></td>
                  <td><select class="filter-select" data-col="4" onchange="filterTable('table-{cat_id}')"><option value="">All</option><option value="API">API level</option><option value="E2E">E2E level</option><option value="Integration">Integration</option><option value="Human">Human</option><option value="Performance">Performance</option><option value="Security">Security</option></select></td>
                </tr>
              </thead>
              <tbody>
                {generate_rows(cat_id)}
              </tbody>
            </table>
            {generate_questions(cat_id)}
          </div>
        </div>'''

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Factors assessment of: Epic3 AI-Powered Personalization and Search Enhancement</title>
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
    .meta-info {{ display: flex; gap: 16px; margin-top: 20px; flex-wrap: wrap; }}
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
    .bar-fill {{ height: 100%; border-radius: 4px; transition: width 0.3s ease; }}
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
    .toc {{ background: var(--bg-white); padding: 16px 20px; border-radius: 8px; margin-bottom: 16px; }}
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
    .cat-structure {{ border-left-color: #3b82f6; }}
    .cat-structure .category-header {{ background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); }}
    .cat-structure .category-content {{ background: #f8faff; }}
    .cat-structure .badge {{ background: #3b82f6; color: white; }}
    .cat-function {{ border-left-color: #10b981; }}
    .cat-function .category-header {{ background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); }}
    .cat-function .category-content {{ background: #f8fdfb; }}
    .cat-function .badge {{ background: #10b981; color: white; }}
    .cat-data {{ border-left-color: #f59e0b; }}
    .cat-data .category-header {{ background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); }}
    .cat-data .category-content {{ background: #fffdf8; }}
    .cat-data .badge {{ background: #f59e0b; color: white; }}
    .cat-interfaces {{ border-left-color: #8b5cf6; }}
    .cat-interfaces .category-header {{ background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); }}
    .cat-interfaces .category-content {{ background: #faf9ff; }}
    .cat-interfaces .badge {{ background: #8b5cf6; color: white; }}
    .cat-platform {{ border-left-color: #14b8a6; }}
    .cat-platform .category-header {{ background: linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%); }}
    .cat-platform .category-content {{ background: #f8fefd; }}
    .cat-platform .badge {{ background: #14b8a6; color: white; }}
    .cat-operations {{ border-left-color: #6366f1; }}
    .cat-operations .category-header {{ background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%); }}
    .cat-operations .category-content {{ background: #f8f9ff; }}
    .cat-operations .badge {{ background: #6366f1; color: white; }}
    .cat-time {{ border-left-color: #ec4899; }}
    .cat-time .category-header {{ background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%); }}
    .cat-time .category-content {{ background: #fefafc; }}
    .cat-time .badge {{ background: #ec4899; color: white; }}
    .collapsed .category-content {{ display: none; }}
    .filter-row td {{ padding: 6px 8px; background: #f8fafc; }}
    .filter-input, .filter-select {{ width: 100%; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 0.75rem; background: white; }}
    .test-id {{ font-family: 'SF Mono', 'Consolas', monospace; font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; }}
    .info-section {{ background: rgba(255,255,255,0.1); border-radius: 8px; margin-top: 15px; }}
    .info-section .info-content {{ overflow: hidden; transition: max-height 0.3s ease-out; max-height: 1000px; }}
    .info-section.collapsed .info-content {{ max-height: 0 !important; padding-top: 0 !important; padding-bottom: 0 !important; }}
    .info-header {{ padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }}
    .collapse-icon {{ transition: transform 0.2s; }}
    .info-section.collapsed .collapse-icon {{ transform: rotate(-90deg); }}
    @media (max-width: 900px) {{ .charts-container {{ grid-template-columns: 1fr; }} }}
  </style>
  <script>
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
  </script>
</head>
<body>
  <div class="container">
    <header>
      <h1>Product Factors assessment of: Epic3 AI-Powered Personalization and Search Enhancement</h1>
      <div class="meta-inline" style="margin-top: 15px; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.2); font-size: 0.9rem; opacity: 0.9;">
        <span>Report generated on <strong>{today}</strong></span>
        <span style="margin: 0 15px; opacity: 0.5;">|</span>
        <span>Total Test Ideas: <strong>{total}</strong></span>
        <span style="margin: 0 15px; opacity: 0.5;">|</span>
        <span>Product Factors covered: <strong>7/7</strong></span>
      </div>
      <nav class="toc" style="margin-top: 15px;">
        <div style="color: var(--text-muted); font-size: 0.85em; font-weight: 600; margin-bottom: 8px;">Quick Navigation</div>
        <div class="toc-nav">
          <a href="#risk">Prioritization</a>
          <a href="#charts">Overview</a>
          <span class="toc-divider">|</span>
          <span style="color: var(--text-muted); font-size: 0.85em; font-weight: 500;">Test Ideas:</span>
          <a href="#structure">Structure <span class="count">{cat_counts['structure']}</span></a>
          <a href="#function">Function <span class="count">{cat_counts['function']}</span></a>
          <a href="#data">Data <span class="count">{cat_counts['data']}</span></a>
          <a href="#interfaces">Interfaces <span class="count">{cat_counts['interfaces']}</span></a>
          <a href="#platform">Platform <span class="count">{cat_counts['platform']}</span></a>
          <a href="#operations">Operations <span class="count">{cat_counts['operations']}</span></a>
          <a href="#time">Time <span class="count">{cat_counts['time']}</span></a>
        </div>
      </nav>
      <div class="info-section collapsed">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.95;">How can this report help you?</h3>
          <span class="collapse-icon">-</span>
        </div>
        <div class="info-content" style="padding: 0 20px 20px 20px;">
          <blockquote style="margin: 0 0 15px 0; padding: 12px 15px; border-left: 3px solid rgba(255,255,255,0.4); font-style: italic; opacity: 0.9;">
            "Requirements are not an end in themselves, but a means to an end-the end of providing value to some person(s)." <span style="opacity: 0.7;">- Jerry Weinberg</span>
          </blockquote>
          <p style="margin: 0 0 12px 0; opacity: 0.9; line-height: 1.7;">In the <a href="https://talesoftesting.com/wp-content/uploads/2022/10/Lalitkumar-Bhamare-Quality-Conscious-Software-Delivery-eBook.pdf" style="color: #93c5fd;">QCSD framework</a>, it is recommended to conduct Product Coverage Sessions using SFDIPOT from <a href="https://www.satisfice.com/download/heuristic-test-strategy-model" style="color: #93c5fd;">Heuristic Test Strategy Model</a> by James Bach.</p>
          <p style="margin: 0; opacity: 0.9; line-height: 1.7;">This analysis helps teams uncover hidden risks, assess requirements completeness, and avoid rework by doing things right the first time.</p>
        </div>
      </div>
      <div class="info-section collapsed">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.95;">When to generate this report?</h3>
          <span class="collapse-icon">-</span>
        </div>
        <div class="info-content" style="padding: 0 20px 20px 20px;">
          <p style="margin: 0; opacity: 0.9;">The sooner the better! Generate this report as soon as Epic/User Stories are available and organize a Product Coverage Session with stakeholders.</p>
        </div>
      </div>
      <div class="info-section collapsed">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.95;">How to use this report?</h3>
          <span class="collapse-icon">-</span>
        </div>
        <div class="info-content" style="padding: 0 20px 20px 20px;">
          <div style="line-height: 1.8;">
            <div style="margin-bottom: 8px;">- <strong>Test Ideas</strong>: Review for context relevance and derive specific test cases</div>
            <div style="margin-bottom: 8px;">- <strong>Automation Fitness</strong>: Use recommendations for automation strategy</div>
            <div>- <strong>Clarifying Questions</strong>: Surface unknown unknowns and update requirements</div>
          </div>
          <p style="margin: 15px 0 0 0; font-size: 0.95rem;"><strong>Rebuild this report if requirements are updated.</strong></p>
        </div>
      </div>
    </header>

    <section class="section" id="risk">
      <h2>Risk-Based Prioritization</h2>
      <p style="margin-bottom: 15px;">Test ideas are prioritized using a <strong>risk-based approach</strong> considering:</p>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 20px;">
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Business Impact</strong><br>Revenue loss from failed personalization, customer trust damage</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Likelihood of Failure</strong><br>ML model complexity, external API dependencies, cold start problems</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">User Exposure</strong><br>All users affected by search, personalization on every homepage visit</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Security and Compliance</strong><br>Privacy data handling, GDPR opt-out requirements, consent management</div>
      </div>
      <h3 style="font-size: 1rem; margin: 20px 0 12px 0;">Priority Legend</h3>
      <table>
        <thead><tr><th>Priority</th><th>Risk Level</th><th>Description</th><th>Examples from this Epic</th></tr></thead>
        <tbody>
          <tr><td><span class="priority priority-p0">P0</span></td><td><strong>Critical</strong></td><td>Security vulnerabilities, privacy violations, complete feature failure</td><td>Privacy opt-out not working, user data exposed in API, visual search storing images without consent</td></tr>
          <tr><td><span class="priority priority-p1">P1</span></td><td><strong>High</strong></td><td>Core business flows, major feature failures, significant user impact</td><td>Recommendations not showing, search returning irrelevant results, visual search failures</td></tr>
          <tr><td><span class="priority priority-p2">P2</span></td><td><strong>Medium</strong></td><td>Important features with workarounds, degraded experience</td><td>Autocomplete delays, recommendation carousel issues, edge cache misses</td></tr>
          <tr><td><span class="priority priority-p3">P3</span></td><td><strong>Low</strong></td><td>Edge cases, cosmetic issues, rarely used features</td><td>Minor UI variations, rare browser combinations</td></tr>
        </tbody>
      </table>
    </section>

    <section class="section" id="charts">
      <h2>Test Ideas Overview</h2>
      <div class="charts-container">
        <div class="chart-panel">
          <h3>Test Ideas by Product Factor (SFDIPOT)</h3>
          <div class="bar-chart">
            <div class="bar-row"><div class="bar-label">Structure</div><div class="bar-track"><div class="bar-fill bar-structure" style="width: {cat_counts['structure']/max_cat*100:.1f}%"></div></div><div class="bar-value">{cat_counts['structure']}</div></div>
            <div class="bar-row"><div class="bar-label">Function</div><div class="bar-track"><div class="bar-fill bar-function" style="width: {cat_counts['function']/max_cat*100:.1f}%"></div></div><div class="bar-value">{cat_counts['function']}</div></div>
            <div class="bar-row"><div class="bar-label">Data</div><div class="bar-track"><div class="bar-fill bar-data" style="width: {cat_counts['data']/max_cat*100:.1f}%"></div></div><div class="bar-value">{cat_counts['data']}</div></div>
            <div class="bar-row"><div class="bar-label">Interfaces</div><div class="bar-track"><div class="bar-fill bar-interfaces" style="width: {cat_counts['interfaces']/max_cat*100:.1f}%"></div></div><div class="bar-value">{cat_counts['interfaces']}</div></div>
            <div class="bar-row"><div class="bar-label">Platform</div><div class="bar-track"><div class="bar-fill bar-platform" style="width: {cat_counts['platform']/max_cat*100:.1f}%"></div></div><div class="bar-value">{cat_counts['platform']}</div></div>
            <div class="bar-row"><div class="bar-label">Operations</div><div class="bar-track"><div class="bar-fill bar-operations" style="width: {cat_counts['operations']/max_cat*100:.1f}%"></div></div><div class="bar-value">{cat_counts['operations']}</div></div>
            <div class="bar-row"><div class="bar-label">Time</div><div class="bar-track"><div class="bar-fill bar-time" style="width: {cat_counts['time']/max_cat*100:.1f}%"></div></div><div class="bar-value">{cat_counts['time']}</div></div>
          </div>
          <div class="chart-total"><span>Product Factors: 7/7</span><span style="font-weight: 700; color: var(--primary);">{total} Test Ideas</span></div>
        </div>
        <div class="chart-panel">
          <h3>Test Ideas by Priority</h3>
          <div class="bar-chart">
            <div class="bar-row"><div class="bar-label">P0 - Critical</div><div class="bar-track"><div class="bar-fill bar-p0" style="width: {priority_counts['P0']/max_priority*100:.1f}%"></div></div><div class="bar-value">{priority_counts['P0']}</div></div>
            <div class="bar-row"><div class="bar-label">P1 - High</div><div class="bar-track"><div class="bar-fill bar-p1" style="width: {priority_counts['P1']/max_priority*100:.1f}%"></div></div><div class="bar-value">{priority_counts['P1']}</div></div>
            <div class="bar-row"><div class="bar-label">P2 - Medium</div><div class="bar-track"><div class="bar-fill bar-p2" style="width: {priority_counts['P2']/max_priority*100:.1f}%"></div></div><div class="bar-value">{priority_counts['P2']}</div></div>
            <div class="bar-row"><div class="bar-label">P3 - Low</div><div class="bar-track"><div class="bar-fill bar-p3" style="width: {priority_counts['P3']/max_priority*100:.1f}%"></div></div><div class="bar-value">{priority_counts['P3']}</div></div>
          </div>
          <h4 style="font-size: 0.85rem; color: var(--text-dark); margin: 14px 0 8px 0; padding-top: 12px; border-top: 1px solid var(--border);">Test Ideas by Automation Fitness</h4>
          <div class="bar-chart" style="font-size: 0.85rem;">
            <div class="bar-row"><div class="bar-label" style="min-width: 100px;">API level</div><div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {auto_counts.get('api',0)/max_auto*100:.1f}%; background: linear-gradient(90deg, #6366f1, #8b5cf6);"></div></div><div class="bar-value" style="font-size: 0.8rem;">{auto_counts.get('api',0)}</div></div>
            <div class="bar-row"><div class="bar-label" style="min-width: 100px;">E2E level</div><div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {auto_counts.get('e2e',0)/max_auto*100:.1f}%; background: linear-gradient(90deg, #6366f1, #8b5cf6);"></div></div><div class="bar-value" style="font-size: 0.8rem;">{auto_counts.get('e2e',0)}</div></div>
            <div class="bar-row"><div class="bar-label" style="min-width: 100px;">Integration</div><div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {auto_counts.get('integration',0)/max_auto*100:.1f}%; background: linear-gradient(90deg, #6366f1, #8b5cf6);"></div></div><div class="bar-value" style="font-size: 0.8rem;">{auto_counts.get('integration',0)}</div></div>
            <div class="bar-row"><div class="bar-label" style="min-width: 100px;">Human</div><div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {auto_counts.get('human',0)/max_auto*100:.1f}%; background: linear-gradient(90deg, #6366f1, #8b5cf6);"></div></div><div class="bar-value" style="font-size: 0.8rem;">{auto_counts.get('human',0)}</div></div>
            <div class="bar-row"><div class="bar-label" style="min-width: 100px;">Performance</div><div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {auto_counts.get('performance',0)/max_auto*100:.1f}%; background: linear-gradient(90deg, #6366f1, #8b5cf6);"></div></div><div class="bar-value" style="font-size: 0.8rem;">{auto_counts.get('performance',0)}</div></div>
            <div class="bar-row"><div class="bar-label" style="min-width: 100px;">Security</div><div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: {auto_counts.get('security',0)/max_auto*100:.1f}%; background: linear-gradient(90deg, #6366f1, #8b5cf6);"></div></div><div class="bar-value" style="font-size: 0.8rem;">{auto_counts.get('security',0)}</div></div>
          </div>
        </div>
      </div>
    </section>

    <section class="section" id="test-ideas">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--primary);">
        <h2 style="margin: 0; border: none; padding: 0;">Test Ideas by Product Factor</h2>
        <button onclick="toggleAllSections()" id="toggle-all-btn" style="background: var(--bg-light); border: 1px solid var(--border); padding: 6px 14px; border-radius: 4px; font-size: 0.8rem; cursor: pointer;">Collapse All</button>
      </div>

      {category_section('structure', 'Structure', 'Test ideas for everything that comprises the physical product', 'cat-structure')}
      {category_section('function', 'Function', 'Test ideas for everything that the product does', 'cat-function')}
      {category_section('data', 'Data', 'Test ideas for everything that the product processes', 'cat-data')}
      {category_section('interfaces', 'Interfaces', 'Test ideas for how the product connects to other things', 'cat-interfaces')}
      {category_section('platform', 'Platform', 'Test ideas for what the product depends upon', 'cat-platform')}
      {category_section('operations', 'Operations', 'Test ideas for how the product is used', 'cat-operations')}
      {category_section('time', 'Time', 'Test ideas for when things happen', 'cat-time')}
    </section>
  </div>
</body>
</html>'''

    return html

if __name__ == '__main__':
    html_content = generate_html()
    output_path = '/workspaces/agentic-qe/.agentic-qe/product-factors-assessments/epic3-ai-personalization-search.html'

    import os
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, 'w') as f:
        f.write(html_content)

    print(f"Report generated: {output_path}")
    print(f"Total test ideas: {sum(len(v) for v in TEST_IDEAS.values())}")
