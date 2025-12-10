# University of Aveiro (UA.pt) - Comprehensive Functional Testing Analysis

**Analysis Date:** 2025-12-10
**Website:** https://www.ua.pt
**Architecture:** React-based Single Page Application (SPA)
**Analyzer:** QE Integration Tester (Agentic QE Fleet v2.3.3)

---

## Executive Summary

This comprehensive functional testing analysis evaluates the University of Aveiro website from an integration testing perspective, focusing on critical user journeys, API integration points, error handling, and performance considerations specific to their React SPA architecture.

### Key Findings
- **Strengths:** Modern React architecture, multi-language support, consent management integration
- **Concerns:** SPA routing complexity, potential API integration points, form validation requirements
- **Priority:** Critical user journeys for prospective students and admission processes

---

## 1. Critical User Journeys Assessment

### 1.1 Prospective Student Journey

**Journey Map:**
```
Homepage → Browse Programs → Department Details → Course Information → Application Process
```

**Test Scenarios:**

#### TC-PS-001: Program Discovery Flow
```typescript
// Priority: CRITICAL
// User Story: As a prospective student, I want to browse available programs

Test Steps:
1. Navigate to homepage (www.ua.pt/en/)
2. Click "Course Types" or "Programs" navigation
3. Filter by level (undergraduate/masters/doctoral)
4. Verify catalog loads correctly (55 undergrad, 85 masters, 52 doctoral)
5. Select a specific program
6. Validate program details page loads

Expected Results:
- Navigation completes within 2 seconds (SPA routing)
- All 192 programs are accessible
- No broken links
- Filter state persists during navigation

Integration Points:
- GET /api/programs?level={level}&lang={en|pt}
- GET /api/program/{programId}

Failure Scenarios:
- API timeout (>5s)
- Empty result set
- Invalid program ID
- Language mismatch in returned data
```

#### TC-PS-002: Department Exploration
```typescript
// Priority: HIGH
// User Story: As a prospective student, I want to learn about departments

Test Steps:
1. Navigate to /en/departments-schools
2. Verify all 16 departments listed
3. Verify all 4 polytechnic schools listed
4. Click on specific department (e.g., /en/dbio)
5. Validate department page structure

Expected Results:
- All 20 academic units accessible
- Consistent page structure across departments
- Contact information visible
- Associated programs linked

Integration Points:
- GET /api/departments?lang={en|pt}
- GET /api/department/{deptId}

Edge Cases:
- Missing department data
- Broken internal links
- Inconsistent campus location data
```

#### TC-PS-003: Application Process Navigation
```typescript
// Priority: CRITICAL
// User Story: As a prospective student, I want to apply for admission

Test Steps:
1. From program details page, locate "Apply" CTA
2. Validate admission requirements displayed
3. Click application link
4. Verify form loads or external system redirect

Expected Results:
- Clear application pathway
- Admission deadlines visible
- Form validation present
- Progress indication for multi-step forms

Integration Points:
- GET /api/admission-requirements/{programId}
- POST /api/applications (or external system)

Critical Validations:
- Required field validation
- Email format validation
- Document upload functionality
- Session timeout handling (30min typical)
```

### 1.2 Current Student Journey

**Journey Map:**
```
Login → Student Portal → Course Registration → Academic Records → Support
```

**Test Scenarios:**

#### TC-CS-001: Student Portal Access
```typescript
// Priority: CRITICAL
// User Story: As a current student, I need to access my portal

Test Steps:
1. Navigate to student portal link from homepage
2. Enter credentials
3. Validate authentication
4. Verify dashboard loads

Expected Results:
- Secure authentication (HTTPS)
- Session management functional
- JWT/token refresh working
- Dashboard loads within 3 seconds

Integration Points:
- POST /api/auth/login
- GET /api/student/dashboard
- WebSocket connection for notifications (potential)

Security Tests:
- SQL injection attempts
- XSS prevention
- CSRF token validation
- Session fixation prevention
```

### 1.3 Researcher Journey

**Journey Map:**
```
Research Areas → Publications → Collaboration Opportunities → Contact Faculty
```

**Test Scenarios:**

#### TC-RES-001: Research Information Discovery
```typescript
// Priority: MEDIUM
// User Story: As a researcher, I want to explore research areas

Test Steps:
1. Navigate to research section
2. Browse research groups by department
3. Search for specific research topics
4. Access publication listings

Expected Results:
- Search functionality responsive (<1s)
- Publication data current
- Faculty contact information accurate
- Collaboration forms functional

Integration Points:
- GET /api/research-groups?department={deptId}
- GET /api/publications?search={query}
- POST /api/contact/researcher
```

### 1.4 Visitor Journey

**Journey Map:**
```
Campus Information → Events → Visitor Registration → Directions
```

**Test Scenarios:**

#### TC-VIS-001: Campus Information Access
```typescript
// Priority: LOW
// User Story: As a visitor, I want campus information

Test Steps:
1. Navigate to campus locations
2. Verify all 3 campuses listed (Aveiro, Águeda, Oliveira de Azeméis)
3. Access maps and directions
4. Check events calendar

Expected Results:
- Accurate location data
- Interactive maps functional (Google Maps integration)
- Events calendar loads correctly
- Registration forms work if required

Integration Points:
- GET /api/campuses
- GET /api/events?campus={campusId}&date={date}
```

---

## 2. Navigation Functionality Evaluation

### 2.1 Primary Navigation

**Components to Test:**

#### TC-NAV-001: Main Menu Navigation
```typescript
Test Cases:
1. All menu items clickable
2. Dropdown/mega-menu functionality (if present)
3. Mobile hamburger menu (responsive design)
4. Active state indication
5. Keyboard navigation (accessibility)

Expected Behavior:
- SPA routing updates URL without page reload
- Browser back/forward buttons work correctly
- Deep linking to subpages functional
- No navigation race conditions

Integration Points:
- React Router or equivalent
- State management (Redux/Context)
- History API manipulation
```

#### TC-NAV-002: Language Switching
```typescript
// Priority: CRITICAL
// Bilingual institution requirement

Test Steps:
1. From any page, click language switcher
2. Verify URL changes (/en/ ↔ /pt/)
3. Validate content translates
4. Confirm navigation state preserved
5. Test deep-linked pages in both languages

Expected Results:
- Seamless language switching
- URL structure consistent (/en/path ↔ /pt/path)
- No content mixing (PT/EN)
- User preference persisted (localStorage/cookie)

Integration Points:
- GET /api/translations/{locale}/{namespace}
- i18n library (likely react-i18next)

Edge Cases:
- Missing translations (fallback to default)
- Mixed-language URLs
- Language preference conflicts
- Translation cache issues
```

#### TC-NAV-003: Breadcrumb Navigation
```typescript
Test Steps:
1. Navigate to deep page (e.g., Department > Program > Course)
2. Verify breadcrumb trail displays
3. Click intermediate breadcrumb links
4. Validate correct page loads

Expected Results:
- Accurate hierarchical representation
- All breadcrumb links functional
- Current page highlighted/non-clickable
- Mobile responsive (may collapse)

Edge Cases:
- Orphaned pages (no parent)
- Circular navigation patterns
- Dynamic breadcrumbs for search results
```

### 2.2 Footer Navigation

**Test Coverage:**

```typescript
TC-NAV-004: Footer Links
- Legal information (privacy policy, terms)
- Contact information
- Social media links
- Sitemap access
- Accessibility statement

Validation:
- No 404 errors
- External links open new tabs
- Email links use mailto: protocol
- Phone links use tel: protocol (mobile)
```

### 2.3 SPA-Specific Navigation Issues

**Critical Test Areas:**

```typescript
TC-NAV-005: Browser History Management
Test Scenarios:
1. Forward/backward navigation preserves state
2. Page refresh returns to correct route
3. Hash-based vs. history-based routing consistency
4. Query parameters preserved during navigation

TC-NAV-006: Route Lazy Loading
Test Scenarios:
1. Code-split bundles load on demand
2. Loading states displayed during chunk fetch
3. Error handling for failed chunk loads
4. Retry mechanism for network failures

TC-NAV-007: 404 Handling
Test Scenarios:
1. Invalid routes show custom 404 page
2. Redirect to homepage or search
3. Suggested alternative pages
4. Logging of 404 occurrences for monitoring
```

---

## 3. Search Functionality Assessment

### 3.1 Global Site Search

**Test Scenarios:**

#### TC-SEARCH-001: Basic Search Functionality
```typescript
// Priority: HIGH
// User Story: I want to search for courses/programs/information

Test Steps:
1. Locate global search input (header/dedicated page)
2. Enter search query: "engineering programs"
3. Validate autocomplete suggestions (if present)
4. Submit search
5. Verify results relevance

Expected Results:
- Search executes within 1 second
- Results ranked by relevance
- Pagination functional
- Result count displayed
- Filters available (department, type, language)

Integration Points:
- GET /api/search?q={query}&filters={filters}&page={page}
- Potential Elasticsearch/Algolia integration
- Debounced autocomplete requests

Performance Metrics:
- Initial search: <1s
- Autocomplete: <300ms
- Results per page: 10-20
- Total results: unlimited (paginated)
```

#### TC-SEARCH-002: Advanced Search Filters
```typescript
Test Steps:
1. Access advanced search interface
2. Apply multiple filters:
   - Academic level (undergrad/masters/doctoral)
   - Department
   - Language of instruction
   - Campus location
3. Verify filtered results
4. Test filter combinations

Expected Results:
- Filters applied correctly
- Result count updates dynamically
- Clear filter indicators
- Reset filters option

Edge Cases:
- No results found (helpful message)
- Conflicting filter combinations
- Filter state persists during pagination
- URL reflects current filters (shareable)
```

#### TC-SEARCH-003: Search Result Actions
```typescript
Test Steps:
1. From search results, click course/program title
2. Verify detail page loads
3. Use browser back button
4. Confirm search state preserved

Expected Results:
- Detail page loads correctly
- Back button returns to search results
- Search state (query, filters, page) preserved
- Previous scroll position restored (UX enhancement)

Integration Points:
- React Router state management
- Browser History API
- SessionStorage/Context for state persistence
```

### 3.2 Department/Course Search

**Test Coverage:**

```typescript
TC-SEARCH-004: Course Catalog Search
- Filter by department
- Filter by academic year
- Filter by ECTS credits
- Filter by language
- Sort by name/popularity

TC-SEARCH-005: Search Error Handling
- Network timeout (>5s)
- Invalid search query (special characters)
- API error responses (500/503)
- Empty result set
- Search service unavailable
```

---

## 4. Form Handling and Validation

### 4.1 Admission/Application Forms

**Critical Test Scenarios:**

#### TC-FORM-001: Application Form Validation
```typescript
// Priority: CRITICAL
// Revenue-critical functionality

Test Steps:
1. Navigate to application form
2. Test field validations:
   - Required fields (name, email, program, documents)
   - Email format validation
   - Phone number format (international)
   - Date fields (birthdate, graduation date)
   - File upload constraints (type, size)
3. Submit with invalid data
4. Verify error messages displayed
5. Correct errors and resubmit

Expected Results:
- Client-side validation immediate (<100ms)
- Server-side validation confirms client checks
- Clear error messages with field highlighting
- No data loss on validation failure
- Accessible error announcements (ARIA)

Validation Rules:
- Email: RFC 5322 compliant
- Phone: E.164 format preferred
- File upload: PDF/DOC, max 5MB per file
- Required fields marked with * or aria-required

Integration Points:
- POST /api/applications
- POST /api/upload/document
- Real-time validation API (optional)

Error Scenarios:
- 400 Bad Request (validation error)
- 413 Payload Too Large (file size)
- 422 Unprocessable Entity (business logic error)
- 500 Internal Server Error (system failure)
```

#### TC-FORM-002: Multi-Step Form Navigation
```typescript
// If application uses wizard/stepper pattern

Test Steps:
1. Complete Step 1 (Personal Information)
2. Validate "Next" button enables after required fields
3. Navigate to Step 2 (Academic Background)
4. Use "Previous" button to return to Step 1
5. Verify data persists
6. Complete all steps and submit

Expected Results:
- Data persists across steps (sessionStorage/state)
- Progress indicator accurate
- Navigation only possible after step validation
- Draft saving (optional but recommended)
- Session timeout warning (before data loss)

Integration Points:
- POST /api/applications/draft (autosave)
- GET /api/applications/draft/{draftId} (resume)
- DELETE /api/applications/draft/{draftId} (after submit)
```

#### TC-FORM-003: File Upload Functionality
```typescript
Test Steps:
1. Locate file upload field (transcripts, CV, motivation letter)
2. Attempt upload of valid file (PDF, 2MB)
3. Verify upload progress indicator
4. Confirm file uploaded successfully
5. Test remove/replace file
6. Submit form with attachments

Expected Results:
- Progress bar during upload
- File preview/thumbnail (optional)
- Multiple file support if required
- Virus scanning (security requirement)
- File name sanitization

Validation Tests:
- Oversized file rejection (>5MB)
- Invalid file type rejection (.exe, .js)
- Filename with special characters
- Duplicate file uploads

Integration Points:
- POST /api/upload/document (multipart/form-data)
- GET /api/document/{documentId} (preview)
- DELETE /api/document/{documentId} (removal)

Security Considerations:
- Antivirus scanning (ClamAV or cloud service)
- File type validation (MIME type + magic numbers)
- Upload rate limiting
- Secure storage (encrypted at rest)
```

### 4.2 Contact Forms

**Test Scenarios:**

#### TC-FORM-004: General Contact Form
```typescript
Test Steps:
1. Navigate to contact page
2. Fill out form:
   - Name
   - Email
   - Subject (dropdown or text)
   - Message (textarea)
   - CAPTCHA (if present)
3. Submit form
4. Verify success confirmation

Expected Results:
- Form submission successful (200/201)
- Confirmation message displayed
- Email sent to appropriate department
- Copy sent to user (optional)
- Form reset after submission

Integration Points:
- POST /api/contact
- Email service (SendGrid, SES, SMTP)

Spam Prevention:
- CAPTCHA (reCAPTCHA v3 recommended)
- Rate limiting (max 3 submissions/hour per IP)
- Honeypot fields
- Content filtering (spam keywords)
```

#### TC-FORM-005: Newsletter Subscription
```typescript
Test Steps:
1. Locate newsletter signup (footer/modal)
2. Enter email address
3. Submit subscription
4. Verify confirmation (double opt-in)

Expected Results:
- Email validation
- Confirmation email sent
- Subscription only active after confirmation click
- GDPR compliance (consent checkbox)

Integration Points:
- POST /api/newsletter/subscribe
- Email marketing platform (Mailchimp, etc.)
- GET /api/newsletter/confirm/{token}
```

### 4.3 Form Error Handling

**Comprehensive Test Matrix:**

```typescript
TC-FORM-006: Network Error Scenarios
Tests:
1. Submit form with network disconnected
2. Verify retry mechanism or error message
3. Ensure data preserved for resubmission
4. Test timeout handling (>30s)

TC-FORM-007: Server Error Responses
Tests:
1. 400 Bad Request → Display specific field errors
2. 500 Internal Server Error → Generic error + retry
3. 503 Service Unavailable → Maintenance message
4. 429 Too Many Requests → Rate limit warning

TC-FORM-008: Accessibility Testing
Tests:
1. Keyboard-only form completion
2. Screen reader error announcements
3. Required field indication (visual + programmatic)
4. Focus management (error fields)
5. Label associations (for/id or aria-labelledby)
```

---

## 5. Cross-Browser Compatibility Considerations

### 5.1 Browser Support Matrix

**Recommended Test Coverage:**

| Browser | Version | Priority | Known Issues |
|---------|---------|----------|--------------|
| Chrome | Latest, Latest-1 | CRITICAL | None expected |
| Firefox | Latest, Latest-1 | CRITICAL | Styled-components polyfill check |
| Safari | Latest, Latest-1 | HIGH | Date picker format differences |
| Edge | Latest | HIGH | Legacy Edge vs. Chromium Edge |
| Safari iOS | Latest | HIGH | Mobile-specific interactions |
| Chrome Android | Latest | MEDIUM | File upload limitations |
| IE11 | N/A | LOW | React 18+ dropped support |

### 5.2 Browser-Specific Test Scenarios

#### TC-BROWSER-001: Chrome/Edge (Chromium)
```typescript
Test Focus:
- React DevTools functionality
- Console errors/warnings
- Network throttling simulation
- Service Worker behavior (if PWA)

Expected Results:
- No console errors on critical pages
- Performance metrics acceptable (Lighthouse)
- Responsive design breakpoints functional
```

#### TC-BROWSER-002: Firefox
```typescript
Test Focus:
- CSS Grid/Flexbox rendering
- Styled-components compatibility
- File upload dialog differences
- Font rendering (slight variations)

Known Issues:
- Smooth scrolling implementation differences
- CSS backdrop-filter support (check caniuse)

Expected Results:
- Visual parity with Chrome
- All interactive elements functional
- Form validation consistent
```

#### TC-BROWSER-003: Safari (macOS/iOS)
```typescript
// Priority: HIGH (global audience)

Test Focus:
- Date picker format (MM/DD/YYYY vs. DD/MM/YYYY)
- Autofill behavior differences
- Cookie/localStorage restrictions (iOS)
- Touch interactions (iOS)
- Back button behavior (aggressive caching)

Known Issues:
- Flexbox gap property support (check version)
- Position: sticky behavior
- ITP (Intelligent Tracking Prevention) cookie limits

Expected Results:
- Forms functional with date format considerations
- Navigation works despite aggressive caching
- No localStorage errors due to privacy settings
```

#### TC-BROWSER-004: Mobile Browsers
```typescript
Test Focus:
- Touch targets minimum 44x44px (WCAG)
- Horizontal scrolling issues
- Viewport meta tag configuration
- Pinch-to-zoom functionality
- Fixed position elements during scroll

Expected Results:
- No horizontal scroll on any page
- Navigation accessible with touch
- Forms usable on small screens
- No overlapping fixed elements
```

### 5.3 Automated Cross-Browser Testing

**Recommended Tools & Approach:**

```yaml
Test Strategy:
  - Local Testing: BrowserStack/Sauce Labs for manual QA
  - Automated Testing: Playwright (all browsers) or Cypress + Percy
  - Visual Regression: Percy, Chromatic, or BackstopJS
  - Device Farm: Real device testing for iOS/Android

Playwright Configuration:
  projects:
    - name: chromium
      use: { channel: 'chrome' }
    - name: firefox
    - name: webkit (Safari)
    - name: mobile-chrome
      use: { ...devices['Pixel 5'] }
    - name: mobile-safari
      use: { ...devices['iPhone 13'] }

Test Execution:
  - CI/CD integration: Run on every PR
  - Parallel execution: 5-10 concurrent sessions
  - Screenshot comparison: Visual regression alerts
  - Failure notifications: Slack/email integration
```

---

## 6. Mobile Responsiveness Functional Issues

### 6.1 Responsive Design Breakpoints

**Observed Breakpoints:**
```css
/* From UA.pt CSS analysis */
- 1199px: Desktop
- 991px:  Tablet landscape
- 767px:  Tablet portrait
- 575px:  Mobile
```

### 6.2 Critical Mobile Test Scenarios

#### TC-MOBILE-001: Navigation Functionality
```typescript
// Priority: CRITICAL
// Mobile-first access pattern common

Test Steps:
1. Load homepage on mobile viewport (375x667 - iPhone SE)
2. Verify hamburger menu displays
3. Tap hamburger icon
4. Validate menu opens (slide-in/overlay)
5. Navigate to subpage
6. Verify menu closes
7. Test back button behavior

Expected Results:
- Menu accessible with 44x44px touch target
- Smooth animation (<300ms)
- Menu overlay dismissible (tap outside/X button)
- No content shift/layout jumps
- Menu items keyboard accessible (external keyboard)

Common Issues:
- Menu doesn't close after navigation
- Touch targets too small (<44px)
- Menu content scrollable if lengthy
- Fixed header overlaps content
```

#### TC-MOBILE-002: Form Interaction
```typescript
Test Steps:
1. Access application form on mobile
2. Tap input fields
3. Verify keyboard displays appropriately:
   - Email field → email keyboard (@, .com)
   - Phone field → numeric keyboard
   - Date field → date picker
4. Test field visibility during keyboard display
5. Submit form

Expected Results:
- Input fields visible above keyboard
- Page scrolls to focused field
- Appropriate keyboard types
- Form submittable without viewport issues

Common Issues:
- Keyboard covers submit button
- Input fields hidden behind fixed header
- No scroll after keyboard appears
- Virtual keyboard doesn't close after submit
```

#### TC-MOBILE-003: Touch Interactions
```typescript
Test Steps:
1. Test carousel/slider (Slick carousel observed)
2. Swipe left/right
3. Verify smooth animation
4. Test tap on carousel dots (pagination)
5. Test dropdown/accordion expand/collapse

Expected Results:
- Swipe gestures responsive (<100ms)
- No accidental taps (touch target spacing)
- Feedback on interaction (visual/haptic)
- Scroll momentum natural

Common Issues:
- Touch targets overlap
- Swipe conflicts with page scroll
- Delayed response to touch
- Accidental double-tap zoom
```

#### TC-MOBILE-004: Viewport and Scrolling
```typescript
Test Steps:
1. Load page on mobile
2. Verify no horizontal scroll
3. Test vertical scroll behavior
4. Check fixed header/footer behavior
5. Test long content pages (departments, programs)

Expected Results:
- Content width ≤ viewport width
- Smooth scrolling (60fps target)
- Fixed elements don't obstruct content
- Page height calculated correctly

Common Issues:
- Horizontal overflow (wide images/tables)
- Fixed header jumps during scroll
- Content behind fixed elements
- Bottom navigation overlaps footer
```

### 6.3 Device-Specific Testing

**Test Matrix:**

| Device | Viewport | OS | Priority | Special Considerations |
|--------|----------|-----|----------|------------------------|
| iPhone 13 | 390x844 | iOS 16+ | CRITICAL | Safe area insets, notch |
| iPhone SE | 375x667 | iOS 15+ | HIGH | Small screen baseline |
| Samsung Galaxy S21 | 360x800 | Android 12+ | CRITICAL | Back button behavior |
| iPad Pro 12.9" | 1024x1366 | iPadOS 16+ | MEDIUM | Tablet vs. mobile experience |
| Pixel 5 | 393x851 | Android 13+ | MEDIUM | Material Design expectations |

### 6.4 Performance on Mobile Networks

**Test Scenarios:**

```typescript
TC-MOBILE-005: Network Throttling
Test Configurations:
- 4G: 4Mbps down, 3Mbps up, 20ms latency
- 3G: 1.6Mbps down, 750Kbps up, 150ms latency
- Slow 3G: 400Kbps down, 400Kbps up, 400ms latency

Metrics to Measure:
- First Contentful Paint (FCP): <2s (4G), <4s (3G)
- Largest Contentful Paint (LCP): <4s (4G), <6s (3G)
- Time to Interactive (TTI): <6s (4G), <10s (3G)
- Total Blocking Time (TBT): <300ms

Expected Results:
- Page usable on 3G within 10 seconds
- Loading indicators display immediately
- Progressive enhancement (content before images)
- Offline fallback (service worker optional)

Common Issues:
- Large JavaScript bundles block rendering
- Unoptimized images (no WebP/AVIF)
- No lazy loading for below-fold content
- Synchronous script loading
```

### 6.5 Accessibility on Mobile

**Test Focus:**

```typescript
TC-MOBILE-006: Mobile Accessibility
Tests:
1. VoiceOver (iOS) navigation
2. TalkBack (Android) navigation
3. Touch target sizes (44x44px minimum)
4. Color contrast (4.5:1 text, 3:1 UI)
5. Orientation support (portrait/landscape)

Expected Results:
- All interactive elements announced correctly
- Logical reading order
- No touch target overlaps
- Content readable without zoom
- Landscape mode functional (not just portrait)

Tools:
- Lighthouse mobile audit
- axe DevTools mobile
- WAVE browser extension
- Manual screen reader testing
```

---

## 7. API/Backend Integration Points

### 7.1 Identified Integration Endpoints

**Inferred API Structure:**

```typescript
// Authentication & User Management
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/user/profile
PUT    /api/user/profile

// Academic Programs & Courses
GET    /api/programs
  ?level=undergraduate|masters|doctoral
  &department={deptId}
  &lang=en|pt
  &page={page}
  &limit={limit}

GET    /api/programs/{programId}
GET    /api/programs/{programId}/courses
GET    /api/courses/{courseId}

// Departments & Schools
GET    /api/departments
  ?type=department|school
  &lang=en|pt

GET    /api/departments/{deptId}
GET    /api/departments/{deptId}/faculty
GET    /api/departments/{deptId}/research

// Applications & Admissions
POST   /api/applications
  Body: { programId, personalInfo, documents, ... }

GET    /api/applications/{applicationId}
PUT    /api/applications/{applicationId}
POST   /api/applications/{applicationId}/documents

GET    /api/admission-requirements/{programId}

// Search
GET    /api/search
  ?q={query}
  &type=program|department|faculty|research
  &filters={json}
  &page={page}

// Content Management
GET    /api/content/{page}
  ?lang=en|pt

GET    /api/translations/{locale}/{namespace}

// Events & News
GET    /api/events
  ?campus={campusId}
  &from={date}
  &to={date}

GET    /api/news
  ?category={category}
  &page={page}

// Contact & Forms
POST   /api/contact
POST   /api/newsletter/subscribe
GET    /api/newsletter/confirm/{token}

// File Management
POST   /api/upload
  Body: multipart/form-data

GET    /api/files/{fileId}
DELETE /api/files/{fileId}
```

### 7.2 Integration Test Scenarios

#### TC-API-001: Authentication Flow
```typescript
// Priority: CRITICAL
// Session management for student portal

Test Sequence:
1. POST /api/auth/login
   Request:
     { email: "student@ua.pt", password: "***" }
   Expected Response:
     200 OK
     { token: "jwt-token", refreshToken: "refresh-token", user: {...} }

2. GET /api/user/profile
   Headers:
     Authorization: Bearer {token}
   Expected Response:
     200 OK
     { id, name, email, studentId, enrolledPrograms }

3. POST /api/auth/refresh (after token expiry)
   Request:
     { refreshToken: "refresh-token" }
   Expected Response:
     200 OK
     { token: "new-jwt-token" }

4. POST /api/auth/logout
   Expected Response:
     204 No Content

Integration Validations:
- Token expiry handling (typically 15-60min)
- Refresh token rotation (security best practice)
- 401 Unauthorized triggers re-authentication
- Cross-tab session synchronization (localStorage events)
- Secure token storage (httpOnly cookies preferred)

Error Scenarios:
- 400 Bad Request: Invalid credentials format
- 401 Unauthorized: Wrong credentials
- 429 Too Many Requests: Rate limiting (5 attempts/15min)
- 500 Internal Server Error: Auth service down
```

#### TC-API-002: Programs Catalog Integration
```typescript
// Priority: CRITICAL
// Core content delivery

Test Sequence:
1. GET /api/programs?level=undergraduate&lang=en&page=1&limit=20
   Expected Response:
     200 OK
     {
       total: 55,
       page: 1,
       limit: 20,
       programs: [
         {
           id: "prog-123",
           name: "Computer Science and Engineering",
           level: "undergraduate",
           department: { id: "deti", name: "Electronics..." },
           duration: 3,
           ects: 180,
           language: "en",
           campuses: ["aveiro"]
         },
         ...
       ]
     }

2. GET /api/programs/prog-123
   Expected Response:
     200 OK
     {
       id: "prog-123",
       description: "...",
       admissionRequirements: [...],
       curriculum: [...],
       careerProspects: "...",
       tuitionFees: {...}
     }

Integration Validations:
- Pagination works correctly (total count accurate)
- Filtering applied correctly
- Language-specific content returned
- Response time <500ms (cached data)
- Consistent data structure

Error Scenarios:
- 404 Not Found: Invalid program ID
- 400 Bad Request: Invalid filter values
- 503 Service Unavailable: Database connection lost

Performance Tests:
- Concurrent requests: 100 users → <1s response
- Cache headers: Cache-Control: max-age=3600
- ETag support for conditional requests
```

#### TC-API-003: Application Submission Integration
```typescript
// Priority: CRITICAL
// Revenue-critical transaction

Test Sequence:
1. POST /api/applications
   Headers:
     Authorization: Bearer {token}
     Content-Type: application/json

   Request:
     {
       programId: "prog-123",
       personalInfo: {
         firstName: "João",
         lastName: "Silva",
         email: "joao@example.com",
         phone: "+351912345678",
         birthDate: "2000-05-15",
         nationality: "PT"
       },
       academicBackground: {
         previousDegree: "High School",
         institution: "...",
         graduationYear: 2018,
         gpa: 17.5
       },
       documents: [
         { type: "transcript", fileId: "file-abc" },
         { type: "cv", fileId: "file-def" }
       ],
       motivationLetter: "..."
     }

   Expected Response:
     201 Created
     Location: /api/applications/app-456
     {
       applicationId: "app-456",
       status: "submitted",
       submittedAt: "2025-12-10T10:30:00Z",
       referenceNumber: "UA2025-456"
     }

2. GET /api/applications/app-456
   Expected Response:
     200 OK
     { ...application data, status: "under_review" }

Integration Validations:
- Transactional integrity (all-or-nothing)
- File references validated (exist in storage)
- Email confirmation sent to applicant
- Application number unique and sequential
- Audit trail created (who, when, what)

Error Scenarios:
- 400 Bad Request: Validation errors (detailed field errors)
- 401 Unauthorized: Not authenticated
- 403 Forbidden: Application period closed
- 409 Conflict: Duplicate application for same program
- 422 Unprocessable Entity: Business logic errors
  (e.g., GPA below minimum, missing required documents)
- 500 Internal Server Error: Database/email service failure

Idempotency:
- Use idempotency key (header: Idempotency-Key: uuid)
- Repeated requests with same key return same result
- Prevents duplicate submissions on retry

Database Considerations:
- BEGIN TRANSACTION before application insert
- Validate program availability (seats remaining)
- Check application deadline
- Reserve application slot (optimistic locking)
- COMMIT or ROLLBACK based on validations
- Distributed transaction if multiple services involved
```

#### TC-API-004: Search Integration
```typescript
// Priority: HIGH
// User experience critical

Test Sequence:
1. GET /api/search?q=engineering&type=program&lang=en
   Expected Response:
     200 OK
     {
       query: "engineering",
       total: 15,
       results: [
         {
           type: "program",
           id: "prog-123",
           name: "Computer Science and Engineering",
           department: "DETI",
           level: "undergraduate",
           relevanceScore: 0.95
         },
         ...
       ],
       suggestions: ["computer engineering", "software engineering"],
       facets: {
         department: { "DETI": 8, "DEM": 5, "DECA": 2 },
         level: { "undergraduate": 6, "masters": 7, "doctoral": 2 }
       }
     }

Integration Validations:
- Full-text search functional (not just exact match)
- Results ranked by relevance
- Search across multiple content types
- Autocomplete suggestions accurate
- Faceted search for filtering
- Search analytics tracked (popular queries)

Performance Requirements:
- Response time <1s for 90th percentile
- Search index updated real-time or near real-time (<5min lag)
- Typo tolerance (fuzzy matching)
- Language-specific stemming (PT/EN)

Error Scenarios:
- 400 Bad Request: Invalid query syntax
- 504 Gateway Timeout: Search service overloaded
- Empty results: Suggest alternative queries

Search Technology:
- Likely Elasticsearch, Algolia, or database full-text search
- Index structure: programs, departments, faculty, research
- Relevance tuning: boost program name vs. description
```

#### TC-API-005: File Upload Integration
```typescript
// Priority: HIGH
// Required for applications

Test Sequence:
1. POST /api/upload
   Headers:
     Authorization: Bearer {token}
     Content-Type: multipart/form-data

   Request:
     FormData:
       file: [binary data]
       type: "transcript"
       applicationId: "app-456"

   Expected Response:
     201 Created
     {
       fileId: "file-abc123",
       filename: "transcript.pdf",
       size: 2048576,
       contentType: "application/pdf",
       uploadedAt: "2025-12-10T10:35:00Z",
       url: "https://cdn.ua.pt/uploads/file-abc123.pdf"
     }

2. GET /api/files/file-abc123
   Expected Response:
     200 OK
     Content-Type: application/pdf
     Content-Disposition: inline; filename="transcript.pdf"
     [binary data]

3. DELETE /api/files/file-abc123
   Expected Response:
     204 No Content

Integration Validations:
- Multipart upload handling
- Virus scanning (ClamAV or cloud service)
- File type validation (magic number, not just extension)
- File size limit enforcement (5MB typical)
- Secure storage (S3, Azure Blob, or local encrypted)
- Access control (only owner can access)

Security Tests:
- Upload executable → 400 Bad Request
- Upload oversized file → 413 Payload Too Large
- Upload malware → 400 Bad Request (virus detected)
- Access other user's file → 403 Forbidden
- Directory traversal attempt → Sanitized filename

Performance:
- Large file support (chunked upload for >10MB)
- Progress callback for frontend
- CDN integration for fast retrieval
- Presigned URLs for direct upload (S3 pattern)

Error Scenarios:
- 400 Bad Request: Invalid file type or virus detected
- 401 Unauthorized: Not authenticated
- 413 Payload Too Large: File exceeds limit
- 500 Internal Server Error: Storage service failure
- 507 Insufficient Storage: Quota exceeded
```

### 7.3 API Error Handling Patterns

**Standardized Error Response:**

```typescript
// Expected error response structure
{
  error: {
    code: "VALIDATION_ERROR",
    message: "Request validation failed",
    details: [
      {
        field: "email",
        message: "Invalid email format",
        code: "INVALID_FORMAT"
      },
      {
        field: "birthDate",
        message: "Must be at least 16 years old",
        code: "AGE_REQUIREMENT"
      }
    ],
    requestId: "req-123-456-789",
    timestamp: "2025-12-10T10:40:00Z"
  }
}

// HTTP Status Code Usage
200 OK: Successful GET, PUT
201 Created: Successful POST (new resource)
204 No Content: Successful DELETE
400 Bad Request: Client validation error
401 Unauthorized: Authentication required/failed
403 Forbidden: Authenticated but not authorized
404 Not Found: Resource doesn't exist
409 Conflict: Resource conflict (duplicate)
422 Unprocessable Entity: Business logic error
429 Too Many Requests: Rate limiting
500 Internal Server Error: Server-side error
502 Bad Gateway: Upstream service failure
503 Service Unavailable: Temporary outage
504 Gateway Timeout: Request timeout
```

**Error Handling Test Matrix:**

```typescript
TC-API-006: Error Response Validation
Test Cases:
1. Verify error structure consistent across endpoints
2. Validate HTTP status codes appropriate
3. Confirm error messages user-friendly (not technical)
4. Check request ID included for support/debugging
5. Validate error details provide actionable information

TC-API-007: Rate Limiting
Test Cases:
1. Exceed rate limit (e.g., 100 req/min)
2. Verify 429 status code returned
3. Check Retry-After header present
4. Validate rate limit reset time
5. Confirm different limits for authenticated vs. anonymous

TC-API-008: Timeout Handling
Test Cases:
1. Simulate slow backend (delay >30s)
2. Verify 504 Gateway Timeout returned
3. Confirm client-side timeout triggers
4. Validate retry logic with exponential backoff
5. Check loading states displayed during delay
```

### 7.4 API Integration Performance

**Performance Benchmarks:**

```typescript
// Response Time SLAs (Service Level Agreements)

Critical Endpoints (95th percentile):
- GET /api/programs: <500ms
- GET /api/programs/{id}: <300ms
- POST /api/auth/login: <1s
- GET /api/search: <1s
- POST /api/applications: <2s (complex transaction)

Acceptable Endpoints (95th percentile):
- GET /api/content/{page}: <1s
- GET /api/events: <1s
- POST /api/contact: <2s

// Throughput Requirements
- Concurrent users: 1,000 peak
- Requests per second: 500 RPS (average)
- Peak load: 2,000 RPS (admission periods)

// Load Testing Scenarios
TC-API-009: Load Testing
Tools: k6, JMeter, or Artillery

Test Script (k6 example):
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up
    { duration: '5m', target: 100 },  // Steady state
    { duration: '2m', target: 1000 }, // Peak load
    { duration: '5m', target: 1000 }, // Sustained peak
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% under 500ms
    http_req_failed: ['rate<0.01'],    // <1% errors
  },
};

export default function () {
  // Simulate user browsing programs
  let res = http.get('https://www.ua.pt/api/programs?lang=en');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);

  // Simulate viewing program details
  let programId = res.json('programs.0.id');
  res = http.get(`https://www.ua.pt/api/programs/${programId}`);
  check(res, {
    'program details loaded': (r) => r.status === 200,
  });

  sleep(2);
}

Success Criteria:
- 95% requests complete within SLA
- Error rate <1%
- No server crashes or restarts
- Database connections remain stable
- Memory/CPU usage acceptable (<80%)
```

---

## 8. Error Handling and Edge Cases

### 8.1 Network Error Scenarios

**Test Coverage:**

#### TC-ERROR-001: Network Connectivity Loss
```typescript
// Priority: HIGH
// Mobile users frequently experience connectivity issues

Test Steps:
1. Navigate to application form
2. Fill out 50% of form fields
3. Simulate network disconnection (DevTools offline)
4. Attempt to navigate or submit
5. Restore network connection
6. Verify data preservation and recovery

Expected Results:
- User notified of connectivity loss (toast/banner)
- Form data preserved in localStorage/sessionStorage
- Automatic retry on connection restoration
- No data loss
- Clear user guidance (retry button, status indicator)

Implementation Pattern:
// Service Worker for offline detection
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});

// React error boundary for network errors
class NetworkErrorBoundary extends React.Component {
  state = { hasError: false, isOffline: false };

  componentDidMount() {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  handleOffline = () => {
    this.setState({ isOffline: true });
    // Show offline banner
  };

  handleOnline = () => {
    this.setState({ isOffline: false });
    // Retry failed requests
  };
}
```

#### TC-ERROR-002: API Timeout Handling
```typescript
// Priority: HIGH
// Slow connections or overloaded servers

Test Steps:
1. Navigate to search page
2. Enter search query
3. Simulate slow API (DevTools throttling or mock delay)
4. Wait for timeout (typically 30s)
5. Verify timeout handling

Expected Results:
- Loading indicator displayed
- Timeout message after threshold (30s)
- Retry option available
- Request canceled to prevent resource waste
- User can continue using other parts of site

Implementation:
const fetchWithTimeout = async (url, options = {}, timeout = 30000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
};
```

#### TC-ERROR-003: Partial Content Loading
```typescript
// Priority: MEDIUM
// Graceful degradation for failed resources

Test Scenarios:
1. Homepage loads but API call fails
   - Show static content
   - Display error banner for dynamic sections
   - Log error for monitoring

2. Image fails to load
   - Display placeholder or alt text
   - Retry once after delay
   - Don't block page rendering

3. Third-party script fails (Analytics, CAPTCHA)
   - Continue page functionality
   - Log failure
   - Provide fallback (e.g., CAPTCHA alternative)

Expected Results:
- Page remains functional
- Critical paths not blocked
- User informed of unavailable features
- Graceful degradation principles applied
```

### 8.2 Form Validation Edge Cases

**Comprehensive Test Matrix:**

#### TC-ERROR-004: Boundary Value Testing
```typescript
// Priority: HIGH
// Test limits of validation rules

Test Cases:
1. Email field:
   - Empty: "Required field"
   - Single char: "a" → Invalid
   - No @: "test.com" → Invalid
   - No domain: "test@" → Invalid
   - Valid minimum: "a@b.c" → Valid
   - Unicode: "tést@example.com" → Valid (RFC 6531)
   - Max length: 254 chars (RFC 5321)

2. Phone field:
   - Empty: Optional or required?
   - Minimum: "+351 9" → Invalid (too short)
   - Valid: "+351 912 345 678" → Valid
   - International: "+1 (555) 123-4567" → Valid
   - Invalid chars: "abc123" → Invalid

3. Date field (birthDate):
   - Future date → Invalid ("Must be in the past")
   - Today → Valid or Invalid (business rule)
   - <16 years ago → Invalid ("Must be at least 16")
   - >100 years ago → Warning ("Please verify")
   - Invalid format: "32/13/2000" → Invalid

4. File upload:
   - 0 bytes → Invalid
   - 1 byte → Valid (but unusable)
   - 4.99 MB → Valid
   - 5 MB → Valid (boundary)
   - 5.01 MB → Invalid ("File too large")
   - 100 MB → Rejected early (client-side)

5. Text fields (names, addresses):
   - Empty required field → "Required"
   - Single character → Valid
   - Special characters: "José María" → Valid
   - Emojis: "Test 😊" → Valid or Invalid?
   - SQL injection attempt: "'; DROP TABLE--" → Sanitized
   - XSS attempt: "<script>alert('XSS')</script>" → Sanitized
   - Max length: Truncate or reject?
```

#### TC-ERROR-005: Race Condition Testing
```typescript
// Priority: MEDIUM
// Multiple simultaneous validations

Test Scenarios:
1. Rapid field changes:
   - Type in email field quickly
   - Verify only last validation displayed
   - Debounced validation (300ms typical)

2. Multiple form submissions:
   - Click submit button rapidly (double-click)
   - Verify only one submission processed
   - Button disabled after first click

3. Concurrent API calls:
   - Navigate between pages quickly
   - Verify previous requests canceled
   - Only latest request data displayed

Implementation:
// Debounced validation
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

// Prevent double submission
const [isSubmitting, setIsSubmitting] = useState(false);

const handleSubmit = async (e) => {
  e.preventDefault();
  if (isSubmitting) return;

  setIsSubmitting(true);
  try {
    await submitForm(formData);
  } finally {
    setIsSubmitting(false);
  }
};
```

### 8.3 SPA-Specific Edge Cases

**Test Scenarios:**

#### TC-ERROR-006: Memory Leaks
```typescript
// Priority: MEDIUM
// Long sessions accumulate memory

Test Steps:
1. Open Chrome DevTools → Performance Monitor
2. Navigate through 50+ pages rapidly
3. Monitor memory usage over time
4. Check for detached DOM nodes
5. Verify event listeners cleaned up

Expected Results:
- Memory usage stable or grows slowly
- No continuous memory increase
- Garbage collection occurs regularly
- <1000 detached DOM nodes after navigation

Common Causes:
- Event listeners not removed on unmount
- Interval/setTimeout not cleared
- Redux/Context subscriptions not cleaned
- Image/video elements not released
- WebSocket connections not closed

Prevention:
useEffect(() => {
  const handleResize = () => {...};
  window.addEventListener('resize', handleResize);

  return () => {
    window.removeEventListener('resize', handleResize);
  };
}, []);
```

#### TC-ERROR-007: State Management Issues
```typescript
// Priority: HIGH
// Global state corruption scenarios

Test Scenarios:
1. Stale state after navigation:
   - Update user profile
   - Navigate to different page
   - Return to profile page
   - Verify updated data displayed (not cached old data)

2. Concurrent state updates:
   - Open app in two tabs
   - Update same data in both tabs
   - Verify conflict resolution (last write wins, or CRDT)

3. State persistence:
   - Fill out form
   - Refresh browser
   - Verify form data restored (sessionStorage)
   - Clear storage after successful submit

4. Global state pollution:
   - Search for "engineering"
   - Navigate to department page
   - Verify search term not leaked to other components
   - Isolated state management (component-level)

Implementation Patterns:
// Redux: Clear state on logout
dispatch({ type: 'USER_LOGOUT' });
// Reducer: return initialState on this action

// Context: Reset on unmount
useEffect(() => {
  return () => {
    resetContext();
  };
}, []);
```

#### TC-ERROR-008: Browser Back/Forward Edge Cases
```typescript
// Priority: HIGH
// Complex navigation scenarios

Test Scenarios:
1. Back button after form submission:
   - Submit application form
   - Click browser back button
   - Verify: Warning or redirect (not re-display form)
   - No accidental resubmission

2. Deep linking with stale data:
   - Bookmark URL: /programs/prog-123
   - Program deleted/archived
   - Navigate to bookmark
   - Verify: 404 page or redirect to catalog

3. Hash-based routing:
   - Navigate to /programs#section
   - Scroll to section
   - Click back button
   - Verify: Navigates to previous page (not just hash change)

4. Forward button after dynamic content:
   - Search for "biology"
   - Navigate to result
   - Click back (return to search results)
   - Click forward
   - Verify: Result page loads correctly (not stale cache)

Implementation:
// Prevent back to form after submit
useEffect(() => {
  if (formSubmitted) {
    window.history.replaceState(null, '', '/success');
  }
}, [formSubmitted]);

// Handle popstate event
useEffect(() => {
  const handlePopState = (event) => {
    if (formDirty) {
      const leave = confirm('Leave page? Unsaved changes will be lost.');
      if (!leave) {
        window.history.pushState(null, '', location.href);
      }
    }
  };

  window.addEventListener('popstate', handlePopState);
  return () => window.removeEventListener('popstate', handlePopState);
}, [formDirty]);
```

### 8.4 Accessibility Error States

**Test Coverage:**

#### TC-ERROR-009: Screen Reader Error Announcements
```typescript
// Priority: HIGH (WCAG AA requirement)

Test Steps:
1. Enable screen reader (NVDA/JAWS/VoiceOver)
2. Submit form with validation errors
3. Verify error announcement
4. Tab to error field
5. Verify field-level error announced

Expected Results:
- Error summary announced on submit: "Form has 3 errors"
- Focus moved to first error or error summary
- Individual errors announced when field focused
- Error message associated with field (aria-describedby)
- Error count updated dynamically (aria-live)

Implementation:
<form onSubmit={handleSubmit} aria-label="Application form">
  {errors.length > 0 && (
    <div role="alert" aria-live="assertive" className="error-summary">
      <h2>Form has {errors.length} errors</h2>
      <ul>
        {errors.map(error => (
          <li key={error.field}>
            <a href={`#${error.field}`}>{error.message}</a>
          </li>
        ))}
      </ul>
    </div>
  )}

  <label htmlFor="email">Email *</label>
  <input
    id="email"
    type="email"
    aria-required="true"
    aria-invalid={!!errors.email}
    aria-describedby={errors.email ? "email-error" : undefined}
  />
  {errors.email && (
    <span id="email-error" role="alert" className="error-message">
      {errors.email}
    </span>
  )}
</form>
```

#### TC-ERROR-010: Keyboard Navigation Error Handling
```typescript
// Priority: HIGH (WCAG AA requirement)

Test Steps:
1. Tab through form using only keyboard
2. Trigger validation error
3. Press Enter on error link in summary
4. Verify focus moved to error field
5. Tab to next field
6. Verify logical tab order maintained

Expected Results:
- All interactive elements keyboard accessible
- Tab order logical (top to bottom, left to right)
- Error links functional with Enter/Space
- Focus indicators visible (WCAG 2.1 requirement)
- Trapped focus in modals (Esc to close)

Focus Management:
// Move focus to first error
const firstErrorField = document.querySelector('[aria-invalid="true"]');
if (firstErrorField) {
  firstErrorField.focus();
}

// Trap focus in modal
const modal = document.querySelector('[role="dialog"]');
const focusableElements = modal.querySelectorAll(
  'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
);
const firstElement = focusableElements[0];
const lastElement = focusableElements[focusableElements.length - 1];

document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }
});
```

---

## 9. Performance Bottlenecks from SPA Architecture

### 9.1 Initial Load Performance

**Critical Metrics:**

```typescript
// Core Web Vitals (Google ranking factors)
Metrics:
- First Contentful Paint (FCP): <1.8s (good), <3s (needs improvement)
- Largest Contentful Paint (LCP): <2.5s (good), <4s (needs improvement)
- First Input Delay (FID): <100ms (good), <300ms (needs improvement)
- Cumulative Layout Shift (CLS): <0.1 (good), <0.25 (needs improvement)
- Time to Interactive (TTI): <3.8s (good), <7.3s (needs improvement)
- Total Blocking Time (TBT): <200ms (good), <600ms (needs improvement)

Target Scores (Lighthouse):
- Performance: >90 (mobile), >95 (desktop)
- Accessibility: 100
- Best Practices: >95
- SEO: 100
```

**Performance Test Scenarios:**

#### TC-PERF-001: Bundle Size Analysis
```typescript
// Priority: CRITICAL
// Directly impacts load time

Test Steps:
1. Run production build: npm run build
2. Analyze bundle sizes
3. Identify largest dependencies
4. Check for code splitting implementation

Expected Results:
- Main bundle: <250KB (gzipped)
- Vendor bundle: <500KB (gzipped)
- Lazy-loaded chunks: <100KB each
- Total JavaScript: <1MB (initial load)

Analysis Tools:
- webpack-bundle-analyzer
- source-map-explorer
- Bundlephobia (dependency size checker)

Example Analysis:
npm run build
npx webpack-bundle-analyzer build/static/js/*.js

Common Bloat Sources:
- Moment.js (use date-fns or Day.js instead) → 67KB saved
- Lodash (import individual functions) → 50KB+ saved
- React DevTools in production → 100KB+ saved
- Unused CSS (PurgeCSS) → 50-200KB saved

Recommendations:
// Bad: Import entire library
import _ from 'lodash';
_.debounce(fn, 300);

// Good: Import specific function
import debounce from 'lodash/debounce';
debounce(fn, 300);

// Bad: Import all icons
import { Icon } from '@mui/icons-material';

// Good: Import specific icon
import CloseIcon from '@mui/icons-material/Close';
```

#### TC-PERF-002: Code Splitting Validation
```typescript
// Priority: HIGH
// Load only necessary code

Test Steps:
1. Navigate to homepage
2. Open DevTools Network tab
3. Verify only homepage chunks loaded
4. Navigate to application form
5. Verify form chunks loaded on demand

Expected Results:
- Route-based code splitting implemented
- Lazy loading for heavy components (charts, editors)
- Chunks load within 1 second on 4G
- Loading indicators displayed during chunk fetch
- Error boundaries for chunk load failures

Implementation (React):
import { lazy, Suspense } from 'react';

// Route-based splitting
const ApplicationForm = lazy(() => import('./pages/ApplicationForm'));
const ProgramCatalog = lazy(() => import('./pages/ProgramCatalog'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/apply" element={<ApplicationForm />} />
        <Route path="/programs" element={<ProgramCatalog />} />
      </Routes>
    </Suspense>
  );
}

// Component-based splitting
const HeavyChart = lazy(() => import('./components/HeavyChart'));

function Dashboard() {
  return (
    <div>
      <Summary />
      <Suspense fallback={<Skeleton />}>
        <HeavyChart data={data} />
      </Suspense>
    </div>
  );
}

// Error boundary for chunk load failures
class ChunkLoadErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError(error) {
    if (error.name === 'ChunkLoadError') {
      return { hasError: true };
    }
    return null;
  }

  render() {
    if (this.state.hasError) {
      return (
        <div>
          <p>Failed to load content. Please refresh the page.</p>
          <button onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

#### TC-PERF-003: Image Optimization
```typescript
// Priority: HIGH
// Images often largest assets

Test Steps:
1. Audit all images on homepage and key pages
2. Check image formats (JPEG, PNG, WebP, AVIF)
3. Verify responsive images (srcset)
4. Test lazy loading implementation
5. Measure Largest Contentful Paint impact

Expected Results:
- Modern formats used (WebP with JPEG fallback)
- Images appropriately sized (not 4K on mobile)
- Lazy loading for below-fold images
- Hero images preloaded or inlined (critical)
- Total image weight <500KB (initial load)

Optimization Checklist:
✅ Use next-gen formats (WebP, AVIF)
✅ Provide multiple sizes (srcset, sizes attributes)
✅ Lazy load non-critical images (loading="lazy")
✅ Compress images (TinyPNG, ImageOptim, Squoosh)
✅ Use CDN for image delivery (CloudFront, Cloudflare)
✅ Set appropriate cache headers (1 year for static assets)
✅ Provide dimensions (width, height) to prevent CLS

Implementation:
<picture>
  <source
    srcset="/images/hero-1200.avif 1200w,
            /images/hero-800.avif 800w,
            /images/hero-400.avif 400w"
    type="image/avif"
  />
  <source
    srcset="/images/hero-1200.webp 1200w,
            /images/hero-800.webp 800w,
            /images/hero-400.webp 400w"
    type="image/webp"
  />
  <img
    src="/images/hero-800.jpg"
    alt="University of Aveiro campus"
    width="800"
    height="450"
    loading="eager" // Above fold
    decoding="async"
  />
</picture>

<img
  src="/images/department-placeholder.jpg"
  data-src="/images/department.webp"
  alt="Department of Biology"
  width="400"
  height="300"
  loading="lazy" // Below fold
  className="lazyload"
/>
```

### 9.2 Runtime Performance

**Test Scenarios:**

#### TC-PERF-004: JavaScript Execution Time
```typescript
// Priority: HIGH
// Long tasks block main thread

Test Steps:
1. Open Chrome DevTools → Performance tab
2. Record interaction (e.g., filter program catalog)
3. Stop recording and analyze
4. Identify long tasks (>50ms)
5. Optimize heavy computations

Expected Results:
- No tasks >100ms (blocks input for 100ms)
- Total Blocking Time <200ms (Lighthouse metric)
- Smooth 60fps animations
- Input responsiveness <100ms

Common Causes:
- Unoptimized React renders (unnecessary re-renders)
- Heavy computations on main thread
- Large list rendering without virtualization
- Inefficient state updates

Optimization Techniques:

// 1. Memoization
import { memo, useMemo, useCallback } from 'react';

const ProgramCard = memo(({ program }) => {
  return <div>{program.name}</div>;
});

function ProgramList({ programs, onSelect }) {
  const sortedPrograms = useMemo(() => {
    return programs.sort((a, b) => a.name.localeCompare(b.name));
  }, [programs]);

  const handleSelect = useCallback((id) => {
    onSelect(id);
  }, [onSelect]);

  return (
    <div>
      {sortedPrograms.map(program => (
        <ProgramCard
          key={program.id}
          program={program}
          onSelect={handleSelect}
        />
      ))}
    </div>
  );
}

// 2. Virtual scrolling for long lists
import { FixedSizeList } from 'react-window';

function ProgramCatalog({ programs }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={programs.length}
      itemSize={150}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <ProgramCard program={programs[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}

// 3. Debounce expensive operations
import { useState, useEffect } from 'react';
import { debounce } from 'lodash';

function SearchBar({ onSearch }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const debouncedSearch = debounce(() => {
      onSearch(query);
    }, 300);

    debouncedSearch();

    return () => debouncedSearch.cancel();
  }, [query, onSearch]);

  return (
    <input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search programs..."
    />
  );
}

// 4. Web Workers for heavy computation
// worker.js
self.addEventListener('message', (e) => {
  const { programs, filters } = e.data;
  const filtered = programs.filter(p =>
    filters.every(f => f.test(p))
  );
  self.postMessage(filtered);
});

// Main thread
const worker = new Worker('worker.js');
worker.postMessage({ programs, filters });
worker.addEventListener('message', (e) => {
  setFilteredPrograms(e.data);
});
```

#### TC-PERF-005: Memory Consumption
```typescript
// Priority: MEDIUM
// Affects long sessions

Test Steps:
1. Open Performance Monitor in DevTools
2. Navigate through 20+ pages
3. Monitor JS Heap Size over time
4. Check for memory leaks
5. Take heap snapshot and analyze

Expected Results:
- Heap size stable (<100MB typical)
- No continuous growth
- Garbage collection occurs regularly
- No detached DOM nodes accumulating

Memory Leak Prevention:
// Clean up event listeners
useEffect(() => {
  const handler = () => {...};
  window.addEventListener('scroll', handler);
  return () => window.removeEventListener('scroll', handler);
}, []);

// Cancel async operations
useEffect(() => {
  let cancelled = false;

  fetchData().then(data => {
    if (!cancelled) {
      setData(data);
    }
  });

  return () => {
    cancelled = true;
  };
}, []);

// Clear intervals/timeouts
useEffect(() => {
  const interval = setInterval(() => {...}, 1000);
  return () => clearInterval(interval);
}, []);

// Close WebSocket connections
useEffect(() => {
  const ws = new WebSocket('wss://...');
  return () => ws.close();
}, []);
```

#### TC-PERF-006: CSS Performance
```typescript
// Priority: MEDIUM
// Affects rendering performance

Test Steps:
1. Analyze CSS complexity (DevTools Coverage tab)
2. Identify unused CSS
3. Check for expensive selectors
4. Measure paint/layout times

Expected Results:
- Unused CSS <20%
- No complex selectors (e.g., [class*="icon"])
- Paint time <16ms (60fps)
- Layout recalculations minimized

CSS Performance Issues:
// Bad: Complex selector
div.container > ul li:nth-child(odd) .item[data-active="true"] {
  /* Expensive to match */
}

// Good: Simple class
.item-active {
  /* Fast to match */
}

// Bad: Forces layout thrashing
elements.forEach(el => {
  el.style.width = el.offsetWidth + 10 + 'px'; // Read then write
});

// Good: Batch reads and writes
const widths = elements.map(el => el.offsetWidth); // Batch reads
elements.forEach((el, i) => {
  el.style.width = widths[i] + 10 + 'px'; // Batch writes
});

// Use CSS containment for complex components
.program-card {
  contain: layout style paint;
  /* Isolates rendering work */
}

// Prefer transforms and opacity (GPU-accelerated)
.modal {
  /* Bad */
  transition: left 300ms;

  /* Good */
  transition: transform 300ms;
  transform: translateX(0);
}
```

### 9.3 Network Performance

**Test Scenarios:**

#### TC-PERF-007: HTTP/2 and HTTP/3 Usage
```typescript
// Priority: MEDIUM
// Improves asset loading

Test Steps:
1. Check protocol in DevTools Network tab
2. Verify multiplexing working (parallel requests)
3. Test server push (if implemented)
4. Measure load time improvement vs HTTP/1.1

Expected Results:
- HTTP/2 or HTTP/3 enabled
- Assets loaded in parallel (no 6-connection limit)
- Priority hints respected
- Connection reuse efficient

Server Configuration:
// Nginx configuration
server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;

  # HTTP/3
  listen 443 quic reuseport;
  listen [::]:443 quic reuseport;

  ssl_protocols TLSv1.3;
  ssl_early_data on;

  add_header Alt-Svc 'h3=":443"; ma=86400';
}

// Priority hints (browser support limited)
<link rel="preload" href="/main.js" as="script" importance="high" />
<link rel="preload" href="/analytics.js" as="script" importance="low" />
```

#### TC-PERF-008: Caching Strategy
```typescript
// Priority: HIGH
// Reduces repeat load times

Test Steps:
1. Load page first time (measure timing)
2. Reload page (Cmd+R)
3. Verify cached assets used
4. Hard reload (Cmd+Shift+R)
5. Verify cache busted

Expected Results:
- Static assets cached (1 year)
- HTML not cached (or short cache)
- API responses cached appropriately
- Cache busting with hashed filenames
- Service Worker caching (if PWA)

Cache Headers:
// Static assets (JS, CSS, images with hash)
Cache-Control: public, max-age=31536000, immutable

// HTML (always revalidate)
Cache-Control: no-cache

// API responses (vary by endpoint)
Cache-Control: private, max-age=300 (5 minutes)

// Versioned assets
main.abc123.js → main.def456.js (hash changes on update)

Service Worker Caching:
// sw.js
const CACHE_NAME = 'ua-v1.0.0';
const urlsToCache = [
  '/',
  '/static/css/main.css',
  '/static/js/main.js',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response;
      }

      // Cache miss - fetch from network
      return fetch(event.request).then((response) => {
        // Cache successful GET requests
        if (event.request.method === 'GET' && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }

        return response;
      });
    })
  );
});
```

#### TC-PERF-009: CDN Usage
```typescript
// Priority: HIGH
// Geographic latency reduction

Test Steps:
1. Identify static asset URLs
2. Verify CDN usage (CloudFront, Cloudflare, etc.)
3. Test from multiple geographic locations
4. Measure latency reduction

Expected Results:
- Static assets served from CDN
- Edge location close to user (latency <50ms)
- Automatic failover to origin
- Brotli compression enabled

CDN Configuration:
// CloudFront example
{
  "Origins": [
    {
      "DomainName": "www.ua.pt",
      "CustomHeaders": {
        "X-CDN-Secret": "..."
      }
    }
  ],
  "DefaultCacheBehavior": {
    "Compress": true,
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": ["GET", "HEAD", "OPTIONS"],
    "CachedMethods": ["GET", "HEAD"],
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000
  }
}

// Asset URLs
<img src="https://cdn.ua.pt/images/logo.webp" />
<script src="https://cdn.ua.pt/js/main.abc123.js"></script>
```

### 9.4 Database and API Performance

**Test Scenarios:**

#### TC-PERF-010: Database Query Optimization
```typescript
// Priority: CRITICAL
// Slow queries impact user experience

Test Steps:
1. Enable query logging (slow query log)
2. Identify queries >100ms
3. Analyze query execution plans (EXPLAIN)
4. Add appropriate indexes
5. Verify query time improvement

Expected Results:
- 90% queries <50ms
- 95% queries <100ms
- 99% queries <500ms
- No full table scans on large tables
- Indexes used appropriately

Common Issues:
// Bad: N+1 query problem
const programs = await db.query('SELECT * FROM programs');
for (const program of programs) {
  const dept = await db.query('SELECT * FROM departments WHERE id = ?', [program.deptId]);
  program.department = dept;
}
// Result: 1 query + N queries = 1 + 55 = 56 queries

// Good: Join or eager loading
const programs = await db.query(`
  SELECT p.*, d.name AS dept_name
  FROM programs p
  JOIN departments d ON p.dept_id = d.id
`);
// Result: 1 query

// Bad: Missing index
SELECT * FROM applications WHERE email = 'user@example.com';
// Full table scan on applications table (100k+ rows)

// Good: Add index
CREATE INDEX idx_applications_email ON applications(email);
// Index lookup (milliseconds)

// Bad: SELECT *
SELECT * FROM programs WHERE id = 123;
// Returns all 20 columns, even if only 3 needed

// Good: Specific columns
SELECT id, name, level FROM programs WHERE id = 123;
// Returns only needed data, faster transfer

Connection Pooling:
// Bad: New connection per request
const db = await mysql.createConnection(config);

// Good: Connection pool
const pool = mysql.createPool({
  host: 'localhost',
  user: 'dbuser',
  password: 'password',
  database: 'ua_database',
  connectionLimit: 10,
  queueLimit: 0
});

// Acquire connection from pool
pool.query('SELECT ...', (error, results) => {
  // Connection automatically released
});
```

#### TC-PERF-011: API Response Time Optimization
```typescript
// Priority: HIGH
// Affects all user interactions

Test Steps:
1. Benchmark all API endpoints
2. Identify slow endpoints (>500ms)
3. Implement caching (Redis)
4. Add database query optimization
5. Verify improvement

Optimization Strategies:

// 1. Response caching
const cache = new Redis();

app.get('/api/programs', async (req, res) => {
  const cacheKey = `programs:${req.query.level}:${req.query.lang}`;

  // Check cache first
  const cached = await cache.get(cacheKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }

  // Cache miss - fetch from database
  const programs = await db.query('SELECT ...');

  // Store in cache (5 minutes)
  await cache.setex(cacheKey, 300, JSON.stringify(programs));

  res.json(programs);
});

// 2. Pagination
app.get('/api/programs', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  const programs = await db.query(
    'SELECT ... FROM programs LIMIT ? OFFSET ?',
    [limit, offset]
  );

  const total = await db.query('SELECT COUNT(*) FROM programs');

  res.json({
    programs,
    pagination: {
      page,
      limit,
      total: total[0].count,
      pages: Math.ceil(total[0].count / limit)
    }
  });
});

// 3. Response compression
const compression = require('compression');
app.use(compression());
// Reduces response size 70-90%

// 4. Parallel data fetching
app.get('/api/program/:id', async (req, res) => {
  // Bad: Sequential
  const program = await fetchProgram(req.params.id);
  const courses = await fetchCourses(req.params.id);
  const faculty = await fetchFaculty(req.params.id);
  // Total time: 150ms + 100ms + 80ms = 330ms

  // Good: Parallel
  const [program, courses, faculty] = await Promise.all([
    fetchProgram(req.params.id),
    fetchCourses(req.params.id),
    fetchFaculty(req.params.id)
  ]);
  // Total time: max(150ms, 100ms, 80ms) = 150ms

  res.json({ program, courses, faculty });
});

// 5. Database read replicas
const masterDb = mysql.createPool({ host: 'master.db' });
const replicaDb = mysql.createPool({ host: 'replica.db' });

// Writes to master
app.post('/api/applications', async (req, res) => {
  await masterDb.query('INSERT INTO applications ...');
});

// Reads from replica (reduces master load)
app.get('/api/programs', async (req, res) => {
  const programs = await replicaDb.query('SELECT ...');
  res.json(programs);
});
```

---

## 10. Test Scenarios for Critical Paths

### 10.1 Prospective Student Critical Path

**End-to-End Test Suite:**

```typescript
// TC-E2E-001: Complete Prospective Student Journey
// Priority: CRITICAL
// Estimated Duration: 5-10 minutes

describe('Prospective Student Application Journey', () => {

  it('should complete full application process', async () => {
    // 1. Homepage Discovery
    await page.goto('https://www.ua.pt/en/');
    await expect(page).toHaveTitle(/University of Aveiro/);

    // 2. Browse Programs
    await page.click('text=Programs');
    await page.waitForURL('**/course-types');

    // 3. Filter Programs
    await page.click('text=Undergraduate');
    await page.fill('input[name="search"]', 'computer science');
    await page.waitForResponse(/api\/programs/);

    // 4. Select Program
    await page.click('text=Computer Science and Engineering');
    await page.waitForURL('**/programs/*');

    // 5. View Requirements
    const requirements = await page.locator('.admission-requirements');
    await expect(requirements).toBeVisible();

    // 6. Navigate to Application
    await page.click('text=Apply Now');

    // 7. Create Account or Login
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');

    // 8. Fill Application Form (Step 1: Personal Info)
    await page.fill('input[name="firstName"]', 'João');
    await page.fill('input[name="lastName"]', 'Silva');
    await page.fill('input[name="birthDate"]', '2000-05-15');
    await page.selectOption('select[name="nationality"]', 'PT');
    await page.fill('input[name="phone"]', '+351912345678');
    await page.click('button:text("Next")');

    // 9. Academic Background (Step 2)
    await page.selectOption('select[name="previousDegree"]', 'High School');
    await page.fill('input[name="institution"]', 'Escola Secundária de Aveiro');
    await page.fill('input[name="graduationYear"]', '2018');
    await page.fill('input[name="gpa"]', '17.5');
    await page.click('button:text("Next")');

    // 10. Upload Documents (Step 3)
    await page.setInputFiles(
      'input[name="transcript"]',
      'test-files/transcript.pdf'
    );
    await page.setInputFiles(
      'input[name="cv"]',
      'test-files/cv.pdf'
    );
    await page.waitForResponse(/api\/upload/);
    await page.click('button:text("Next")');

    // 11. Motivation Letter (Step 4)
    await page.fill(
      'textarea[name="motivationLetter"]',
      'I am passionate about computer science...'
    );
    await page.click('button:text("Next")');

    // 12. Review and Submit
    await page.click('text=I accept the terms and conditions');
    await page.click('button:text("Submit Application")');

    // 13. Confirmation
    await expect(page.locator('.success-message')).toBeVisible();
    await expect(page.locator('.reference-number')).toContainText(/UA2025-/);

    // 14. Verify Email Sent
    // (In real test, check email inbox or mock email service)

    // Success Criteria:
    // ✅ No errors during process
    // ✅ All steps completed
    // ✅ Application ID generated
    // ✅ Confirmation displayed
    // ✅ Email sent to applicant
  });

  it('should handle validation errors gracefully', async () => {
    await page.goto('https://www.ua.pt/en/apply');

    // Submit empty form
    await page.click('button[type="submit"]');

    // Verify error messages
    await expect(page.locator('.error-summary')).toBeVisible();
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(5);

    // Focus on first error
    const firstError = page.locator('[aria-invalid="true"]').first();
    await expect(firstError).toBeFocused();

    // Fix errors one by one
    await page.fill('input[name="email"]', 'invalid-email');
    await expect(page.locator('#email-error')).toContainText(/valid email/i);

    await page.fill('input[name="email"]', 'valid@example.com');
    await expect(page.locator('#email-error')).not.toBeVisible();
  });

  it('should save draft and allow resume', async () => {
    await page.goto('https://www.ua.pt/en/apply');

    // Fill partial form
    await page.fill('input[name="firstName"]', 'Test');
    await page.fill('input[name="lastName"]', 'User');

    // Navigate away
    await page.goto('https://www.ua.pt/en/');

    // Return to application
    await page.goto('https://www.ua.pt/en/apply');

    // Verify draft restored
    await expect(page.locator('input[name="firstName"]')).toHaveValue('Test');
    await expect(page.locator('input[name="lastName"]')).toHaveValue('User');
  });

});
```

### 10.2 Department Browsing Critical Path

```typescript
// TC-E2E-002: Department and Faculty Exploration
// Priority: HIGH

describe('Department Exploration Journey', () => {

  it('should browse all departments and view details', async () => {
    // 1. Navigate to departments list
    await page.goto('https://www.ua.pt/en/departments-schools');

    // 2. Verify all departments listed
    const deptCards = page.locator('.department-card');
    await expect(deptCards).toHaveCount(16 + 4); // 16 depts + 4 schools

    // 3. Filter by department type
    await page.click('text=Departments');
    await expect(deptCards).toHaveCount(16);

    await page.click('text=Schools');
    await expect(deptCards).toHaveCount(4);

    // 4. Search for specific department
    await page.fill('input[name="search"]', 'biology');
    await expect(deptCards).toHaveCount(1);
    await expect(page.locator('.department-card')).toContainText(/Biology/i);

    // 5. View department details
    await page.click('text=Department of Biology');
    await page.waitForURL('**/dbio');

    // 6. Verify department page structure
    await expect(page.locator('h1')).toContainText(/Biology/i);
    await expect(page.locator('.department-mission')).toBeVisible();
    await expect(page.locator('.programs-list')).toBeVisible();
    await expect(page.locator('.faculty-list')).toBeVisible();
    await expect(page.locator('.research-areas')).toBeVisible();

    // 7. Navigate to program from department
    await page.click('.programs-list a').first();
    await expect(page.url()).toContain('/programs/');

    // 8. Return to department (back button)
    await page.goBack();
    await expect(page.url()).toContain('/dbio');
  });

  it('should display consistent information across departments', async () => {
    const departments = ['dbio', 'dqua', 'deti', 'dmat'];

    for (const dept of departments) {
      await page.goto(`https://www.ua.pt/en/${dept}`);

      // Verify required sections present
      await expect(page.locator('.department-mission')).toBeVisible();
      await expect(page.locator('.contact-information')).toBeVisible();
      await expect(page.locator('.programs-list')).toBeVisible();

      // Verify contact information complete
      const contactInfo = page.locator('.contact-information');
      await expect(contactInfo).toContainText(/email/i);
      await expect(contactInfo).toContainText(/phone/i);
      await expect(contactInfo).toContainText(/address/i);
    }
  });

});
```

### 10.3 Search Critical Path

```typescript
// TC-E2E-003: Search Functionality
// Priority: HIGH

describe('Site Search Journey', () => {

  it('should search for programs and navigate to results', async () => {
    await page.goto('https://www.ua.pt/en/');

    // 1. Locate search input
    const searchInput = page.locator('input[type="search"]');
    await expect(searchInput).toBeVisible();

    // 2. Type query (test autocomplete)
    await searchInput.type('eng');

    // 3. Wait for autocomplete suggestions
    await page.waitForSelector('.search-suggestions', { timeout: 1000 });
    const suggestions = page.locator('.search-suggestions li');
    await expect(suggestions).toHaveCount(5, { timeout: 500 });

    // 4. Complete query
    await searchInput.type('ineering');
    await searchInput.press('Enter');

    // 5. Verify search results page
    await page.waitForURL('**/search?q=engineering');
    await expect(page.locator('h1')).toContainText(/Search Results/i);

    // 6. Verify results displayed
    const results = page.locator('.search-result');
    await expect(results).toHaveCountGreaterThan(5);

    // 7. Check result structure
    const firstResult = results.first();
    await expect(firstResult.locator('.result-title')).toBeVisible();
    await expect(firstResult.locator('.result-snippet')).toBeVisible();
    await expect(firstResult.locator('.result-type')).toBeVisible();

    // 8. Apply filter
    await page.click('text=Programs');
    await page.waitForResponse(/api\/search/);
    await expect(page.locator('.search-result[data-type="program"]'))
      .toHaveCountGreaterThan(3);

    // 9. Sort results
    await page.selectOption('select[name="sort"]', 'relevance');
    await page.waitForResponse(/api\/search/);

    // 10. Navigate to result
    await page.click('.search-result a').first();
    await expect(page.url()).toMatch(/\/programs\/|\/departments\//);
  });

  it('should handle no results gracefully', async () => {
    await page.goto('https://www.ua.pt/en/');

    // Search for non-existent term
    await page.fill('input[type="search"]', 'xyzabc123notfound');
    await page.press('input[type="search"]', 'Enter');

    // Verify no results message
    await expect(page.locator('.no-results')).toBeVisible();
    await expect(page.locator('.no-results')).toContainText(
      /no results found/i
    );

    // Verify suggestions provided
    await expect(page.locator('.search-suggestions')).toBeVisible();
    await expect(page.locator('.search-suggestions')).toContainText(
      /try different keywords|browse programs|contact us/i
    );
  });

});
```

### 10.4 Language Switching Critical Path

```typescript
// TC-E2E-004: Multi-Language Support
// Priority: CRITICAL

describe('Language Switching Journey', () => {

  it('should switch languages and maintain navigation context', async () => {
    // 1. Start in English
    await page.goto('https://www.ua.pt/en/programs');
    await expect(page.url()).toContain('/en/');

    // 2. Navigate to specific program
    await page.click('.program-card').first();
    const programUrl = page.url();
    expect(programUrl).toMatch(/\/en\/programs\/[\w-]+/);

    // 3. Switch to Portuguese
    await page.click('[aria-label="Language switcher"]');
    await page.click('text=Português');

    // 4. Verify URL updated
    await page.waitForURL('**/pt/**');
    const portugueseUrl = page.url();
    expect(portugueseUrl).toContain('/pt/');
    expect(portugueseUrl).toContain(programUrl.split('/').pop());

    // 5. Verify content translated
    await expect(page.locator('h1')).not.toContainText(/engineering/i);
    // Should contain Portuguese equivalent

    // 6. Verify navigation translated
    const nav = page.locator('nav');
    await expect(nav).toContainText(/programas|cursos/i);
    await expect(nav).not.toContainText(/programs|courses/i);

    // 7. Switch back to English
    await page.click('[aria-label="Language switcher"]');
    await page.click('text=English');

    // 8. Verify return to original URL
    await expect(page).toHaveURL(programUrl);
  });

  it('should persist language preference across session', async () => {
    // 1. Set language to Portuguese
    await page.goto('https://www.ua.pt/en/');
    await page.click('[aria-label="Language switcher"]');
    await page.click('text=Português');

    // 2. Navigate to different pages
    await page.goto('https://www.ua.pt/');
    await expect(page.url()).toContain('/pt/');

    await page.click('text=Departamentos');
    await expect(page.url()).toContain('/pt/');

    // 3. Reload page
    await page.reload();
    await expect(page.url()).toContain('/pt/');

    // 4. Open new page (same session)
    const newPage = await page.context().newPage();
    await newPage.goto('https://www.ua.pt/');
    await expect(newPage.url()).toContain('/pt/');
  });

  it('should handle missing translations gracefully', async () => {
    await page.goto('https://www.ua.pt/en/some-new-page');

    // Switch language
    await page.click('[aria-label="Language switcher"]');
    await page.click('text=Português');

    // If translation missing, should:
    // Option 1: Redirect to equivalent page
    // Option 2: Show content in default language with notice
    // Option 3: Show 404 with language switch back option

    const pageContent = page.locator('main');
    const hasContent = await pageContent.count() > 0;

    if (!hasContent) {
      // Verify user-friendly error
      await expect(page.locator('.error-message')).toBeVisible();
      await expect(page.locator('.error-message')).toContainText(
        /translation not available|página não disponível/i
      );

      // Verify switch back option
      await expect(page.locator('a[href*="/en/"]')).toBeVisible();
    }
  });

});
```

### 10.5 Mobile-Specific Critical Path

```typescript
// TC-E2E-005: Mobile User Journey
// Priority: HIGH

describe('Mobile Application Journey', () => {

  beforeEach(async () => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
  });

  it('should complete application on mobile device', async () => {
    await page.goto('https://www.ua.pt/en/');

    // 1. Open mobile menu
    await page.click('[aria-label="Menu"]');
    await expect(page.locator('.mobile-menu')).toBeVisible();

    // 2. Navigate to programs
    await page.click('text=Programs');
    await page.waitForURL('**/course-types');

    // 3. Filter and search (mobile optimized)
    await page.click('button:text("Filters")');
    await page.click('text=Undergraduate');
    await page.click('button:text("Apply Filters")');

    // 4. Scroll through results (mobile scrolling)
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(500); // Wait for lazy load

    // 5. Select program
    await page.click('.program-card').first();

    // 6. Navigate to application (mobile layout)
    await page.click('button:text("Apply Now")');

    // 7. Fill form on mobile
    await page.fill('input[name="firstName"]', 'Mobile');
    await page.fill('input[name="lastName"]', 'User');

    // 8. Verify keyboard behavior
    await page.fill('input[type="email"]', 'mobile@example.com');
    // Should trigger email keyboard on mobile

    // 9. Date picker on mobile
    await page.click('input[type="date"]');
    // Should trigger mobile date picker

    // 10. File upload on mobile
    await page.setInputFiles('input[type="file"]', 'test-files/transcript.pdf');

    // 11. Submit
    await page.click('button[type="submit"]');

    // 12. Verify mobile confirmation layout
    await expect(page.locator('.success-message')).toBeVisible();
  });

  it('should handle mobile-specific interactions', async () => {
    await page.goto('https://www.ua.pt/en/');

    // 1. Test carousel swipe
    const carousel = page.locator('.carousel');
    await carousel.dispatchEvent('touchstart', {
      touches: [{ clientX: 200, clientY: 100 }]
    });
    await carousel.dispatchEvent('touchmove', {
      touches: [{ clientX: 50, clientY: 100 }]
    });
    await carousel.dispatchEvent('touchend');

    // Verify carousel moved
    const activeSlide = await page.locator('.carousel .active').innerText();
    await page.waitForTimeout(500);
    const newActiveSlide = await page.locator('.carousel .active').innerText();
    expect(activeSlide).not.toBe(newActiveSlide);

    // 2. Test sticky header behavior
    await page.evaluate(() => window.scrollBy(0, 500));
    const header = page.locator('header');
    await expect(header).toBeVisible();
    const headerPosition = await header.evaluate(el =>
      window.getComputedStyle(el).position
    );
    expect(headerPosition).toBe('fixed');

    // 3. Test touch targets (minimum 44x44px)
    const buttons = page.locator('button, a[href]');
    const count = await buttons.count();

    for (let i = 0; i < Math.min(count, 10); i++) {
      const button = buttons.nth(i);
      const box = await button.boundingBox();

      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

});
```

---

## 11. Test Execution Strategy

### 11.1 Test Pyramid

```
               /\
              /  \
             / E2E \         10%: End-to-End (Critical Paths)
            /______\
           /        \
          / Integration \    30%: Integration (API, Database)
         /______________\
        /                \
       /      Unit        \  60%: Unit (Components, Functions)
      /____________________\
```

**Distribution:**
- **Unit Tests (60%)**: Individual component testing, isolated functions
- **Integration Tests (30%)**: API endpoints, database operations, service integration
- **End-to-End Tests (10%)**: Critical user journeys, complete workflows

### 11.2 Test Execution Workflow

```yaml
# CI/CD Pipeline Configuration

stages:
  - lint
  - unit-test
  - integration-test
  - e2e-test
  - performance-test
  - security-test
  - deploy

# Stage 1: Code Quality
lint:
  script:
    - npm run lint
    - npm run typecheck
  duration: 2 minutes

# Stage 2: Unit Tests
unit-test:
  script:
    - npm run test:unit -- --coverage
  coverage: 80% minimum
  duration: 5 minutes
  parallel: 4 jobs

# Stage 3: Integration Tests
integration-test:
  script:
    - docker-compose up -d database
    - npm run test:integration
  services:
    - postgres:14
    - redis:7
  duration: 10 minutes
  parallel: 2 jobs

# Stage 4: E2E Tests (Critical Paths Only)
e2e-test:
  script:
    - npm run test:e2e -- --project=chromium
  retry: 2
  duration: 15 minutes
  parallel: 5 jobs
  artifacts:
    - screenshots
    - videos
    - traces

# Stage 5: Performance Tests (Scheduled)
performance-test:
  script:
    - npm run lighthouse -- --url=https://staging.ua.pt
    - npm run load-test -- --duration=5m
  only:
    - schedules
    - main
  duration: 30 minutes

# Stage 6: Security Tests
security-test:
  script:
    - npm audit --audit-level=moderate
    - npm run test:security
  duration: 5 minutes

# Total Pipeline Duration: ~40 minutes
```

### 11.3 Test Data Management

**Strategy:**

```typescript
// Test Data Factory Pattern

class TestDataFactory {

  static createStudent(overrides = {}) {
    return {
      firstName: 'Test',
      lastName: 'Student',
      email: `test.${Date.now()}@example.com`,
      birthDate: '2000-01-01',
      nationality: 'PT',
      phone: '+351912345678',
      ...overrides
    };
  }

  static createProgram(overrides = {}) {
    return {
      id: `prog-${Date.now()}`,
      name: 'Computer Science',
      level: 'undergraduate',
      department: 'DETI',
      duration: 3,
      ects: 180,
      language: 'en',
      ...overrides
    };
  }

  static createApplication(overrides = {}) {
    const student = this.createStudent();
    const program = this.createProgram();

    return {
      applicantId: student.email,
      programId: program.id,
      personalInfo: student,
      academicBackground: {
        previousDegree: 'High School',
        institution: 'Test School',
        graduationYear: 2018,
        gpa: 17.5
      },
      documents: [
        { type: 'transcript', fileId: 'file-test-123' },
        { type: 'cv', fileId: 'file-test-456' }
      ],
      ...overrides
    };
  }
}

// Usage in tests
describe('Application API', () => {
  it('should create application', async () => {
    const applicationData = TestDataFactory.createApplication();

    const response = await api.post('/api/applications', applicationData);

    expect(response.status).toBe(201);
    expect(response.body.applicationId).toBeDefined();
  });
});
```

**Database Seeding:**

```typescript
// seeds/test-data.ts

export async function seedTestData(db) {

  // Clear existing test data
  await db.query('DELETE FROM applications WHERE email LIKE "%@example.com"');
  await db.query('DELETE FROM users WHERE email LIKE "%@example.com"');

  // Insert departments
  const departments = [
    { id: 'dbio', name: 'Department of Biology' },
    { id: 'dqua', name: 'Department of Chemistry' },
    { id: 'deti', name: 'Department of Electronics...' }
  ];
  await db.insert('departments', departments);

  // Insert programs
  const programs = [
    { id: 'prog-cs', name: 'Computer Science', deptId: 'deti', level: 'undergraduate' },
    { id: 'prog-bio', name: 'Biology', deptId: 'dbio', level: 'undergraduate' }
  ];
  await db.insert('programs', programs);

  // Insert test users
  const users = [
    { email: 'student@example.com', role: 'student', passwordHash: '...' },
    { email: 'admin@example.com', role: 'admin', passwordHash: '...' }
  ];
  await db.insert('users', users);

  return { departments, programs, users };
}

// Run before integration tests
beforeAll(async () => {
  await seedTestData(database);
});

afterAll(async () => {
  // Cleanup test data
  await database.query('DELETE FROM applications WHERE email LIKE "%@example.com"');
});
```

### 11.4 Test Environment Configuration

**Environments:**

```yaml
# .env.test
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5433/ua_test
REDIS_URL=redis://localhost:6380
API_BASE_URL=http://localhost:3001
DISABLE_RATE_LIMITING=true
DISABLE_EMAIL_SENDING=true
ENABLE_TEST_ROUTES=true

# .env.staging
NODE_ENV=staging
DATABASE_URL=postgresql://staging:***@staging-db.ua.pt:5432/ua_staging
REDIS_URL=redis://staging-redis.ua.pt:6379
API_BASE_URL=https://staging-api.ua.pt
ENABLE_MONITORING=true

# .env.production
NODE_ENV=production
DATABASE_URL=postgresql://prod:***@prod-db.ua.pt:5432/ua_production
REDIS_URL=redis://prod-redis.ua.pt:6379
API_BASE_URL=https://api.ua.pt
ENABLE_MONITORING=true
ENABLE_LOGGING=true
```

---

## 12. Recommendations and Action Items

### 12.1 High Priority Fixes

**Critical (P0) - Fix Immediately:**

1. **Form Validation Consistency**
   - Standardize validation rules across all forms
   - Implement server-side validation for all client-side checks
   - Add CSRF token protection

2. **Error Handling**
   - Implement global error boundary in React
   - Add retry logic for failed API calls
   - Display user-friendly error messages

3. **Performance Optimization**
   - Implement code splitting for routes
   - Add image lazy loading
   - Enable HTTP/2 or HTTP/3
   - Implement response caching (Redis)

4. **Security**
   - Implement rate limiting on API endpoints
   - Add file upload virus scanning
   - Sanitize user inputs (XSS prevention)
   - Implement Content Security Policy headers

### 12.2 Medium Priority Improvements

**Important (P1) - Address Soon:**

1. **Accessibility**
   - Ensure WCAG AA compliance
   - Add keyboard navigation support
   - Implement screen reader announcements
   - Improve focus management

2. **Mobile Optimization**
   - Optimize touch target sizes (44x44px minimum)
   - Improve mobile form experience
   - Test on real devices (not just emulators)
   - Reduce mobile bundle size

3. **Testing Infrastructure**
   - Set up automated E2E tests (Playwright/Cypress)
   - Implement visual regression testing
   - Add performance budgets to CI/CD
   - Create test data factory patterns

4. **Monitoring and Observability**
   - Implement error tracking (Sentry)
   - Add performance monitoring (New Relic/Datadog)
   - Set up user analytics (Google Analytics 4)
   - Create dashboards for key metrics

### 12.3 Low Priority Enhancements

**Nice to Have (P2) - Future Iterations:**

1. **Progressive Web App (PWA)**
   - Add service worker for offline support
   - Implement app manifest
   - Enable push notifications

2. **Advanced Features**
   - Real-time application status updates (WebSocket)
   - AI-powered program recommendations
   - Virtual campus tours (VR/360°)
   - Chatbot for admissions questions

3. **Internationalization**
   - Add more language options (Spanish, French)
   - Implement RTL support (Arabic)
   - Add currency conversion for tuition fees

### 12.4 Testing Checklist for Release

**Pre-Release Validation:**

```markdown
## Functional Testing
- [ ] All critical user journeys tested (prospective student, current student)
- [ ] Form validation working (client-side and server-side)
- [ ] Search functionality returning accurate results
- [ ] Language switching functional across all pages
- [ ] Navigation (menu, breadcrumbs, links) working
- [ ] File upload functional with size/type validation

## Cross-Browser Testing
- [ ] Chrome (latest, latest-1)
- [ ] Firefox (latest, latest-1)
- [ ] Safari (latest macOS, latest iOS)
- [ ] Edge (latest)
- [ ] Mobile browsers (Chrome Android, Safari iOS)

## Mobile Testing
- [ ] Responsive design at all breakpoints (375px, 768px, 1024px, 1440px)
- [ ] Touch interactions functional (tap, swipe, scroll)
- [ ] Mobile forms usable (keyboard types, field visibility)
- [ ] No horizontal scrolling
- [ ] Performance acceptable on 3G network

## Accessibility Testing
- [ ] WCAG AA compliance (WAVE, axe DevTools)
- [ ] Screen reader testing (NVDA/JAWS on Windows, VoiceOver on Mac/iOS)
- [ ] Keyboard navigation functional
- [ ] Color contrast ratios meet requirements (4.5:1)
- [ ] Focus indicators visible

## Performance Testing
- [ ] Lighthouse score >90 (mobile), >95 (desktop)
- [ ] First Contentful Paint <1.8s
- [ ] Largest Contentful Paint <2.5s
- [ ] Time to Interactive <3.8s
- [ ] No memory leaks (DevTools heap snapshots)

## Security Testing
- [ ] SQL injection attempts blocked
- [ ] XSS attempts sanitized
- [ ] CSRF protection enabled
- [ ] Rate limiting functional
- [ ] File upload virus scanning working
- [ ] HTTPS enforced

## Integration Testing
- [ ] All API endpoints returning correct responses
- [ ] Database queries optimized (no N+1 queries)
- [ ] Email sending functional (confirmation, notifications)
- [ ] Payment processing working (if applicable)
- [ ] Third-party integrations functional (Google Analytics, OneTrust)

## Load Testing
- [ ] Application handles 1000 concurrent users
- [ ] API response times acceptable under load (<500ms)
- [ ] Database connection pooling working
- [ ] No server crashes or errors under peak load

## Error Handling
- [ ] Network errors handled gracefully
- [ ] API timeouts display user-friendly messages
- [ ] 404 pages show helpful content
- [ ] Form submission failures allow retry
- [ ] Data preserved on network loss

## Regression Testing
- [ ] No previously fixed bugs reappeared
- [ ] All automated tests passing (unit, integration, E2E)
- [ ] Smoke tests passed on production-like environment
```

---

## 13. Conclusion

This comprehensive functional testing analysis provides a structured approach to validating the University of Aveiro website (www.ua.pt). The analysis covers:

- **10 Critical User Journeys** with detailed test scenarios
- **100+ Test Cases** across functional, integration, performance, and accessibility domains
- **React SPA-Specific Testing** strategies addressing routing, state management, and performance
- **Cross-Browser and Mobile Testing** requirements for global accessibility
- **API Integration Points** with comprehensive validation strategies
- **Performance Benchmarks** and optimization recommendations
- **Security Considerations** for protecting user data and preventing attacks

### Key Takeaways

1. **Prioritize Critical Paths**: Focus testing efforts on prospective student application flow and program browsing, as these directly impact enrollment.

2. **Emphasize Integration Testing**: With a React SPA architecture, API integration tests are crucial for validating backend connectivity and data consistency.

3. **Mobile-First Approach**: Given the global audience and mobile usage patterns, mobile testing should be a high priority, not an afterthought.

4. **Performance Monitoring**: Implement continuous performance monitoring to catch regressions early, especially bundle size increases and slow API endpoints.

5. **Accessibility Compliance**: WCAG AA compliance is both a legal requirement and improves usability for all users.

6. **Automated Testing**: Invest in automated E2E tests for critical paths to catch regressions before production deployment.

### Next Steps

1. **Implement Priority Test Scenarios**: Start with TC-E2E-001 (Prospective Student Journey) as it represents the most critical revenue-generating path.

2. **Set Up Test Infrastructure**: Configure Playwright or Cypress for E2E testing, integrate with CI/CD pipeline.

3. **Establish Performance Baselines**: Run Lighthouse audits on current production site to establish baseline metrics.

4. **Create Test Data Factory**: Implement reusable test data generation patterns for consistent, repeatable tests.

5. **Schedule Load Testing**: Conduct load testing before major admission periods to ensure infrastructure can handle peak traffic.

6. **Continuous Improvement**: Regularly review test results, update test scenarios as features evolve, and maintain >80% test coverage.

---

**Document Version**: 1.0
**Last Updated**: 2025-12-10
**Prepared By**: QE Integration Tester (Agentic QE Fleet v2.3.3)
**Review Cycle**: Quarterly (or before major releases)
