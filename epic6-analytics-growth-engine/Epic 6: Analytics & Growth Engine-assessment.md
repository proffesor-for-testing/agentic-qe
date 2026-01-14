# Product Factors assessment of: Epic 6:  Analytics &  Growth  Engine

This report contains the assessment of given project artifact based on Product Factors (SFDIPOT) heuristic in [HTSM](https://www.satisfice.com/download/heuristic-test-strategy-model) by James Bach. In this report you will find:

- [ ] **The Test Ideas** - generated for each product factor based on applicable subcategories.
- [ ] **Automation Fitness** - recommendations against each test idea that testers can consider for drafting suitable automation strategy.
- [ ] **The Clarifying Questions to address potential coverage gaps** - that surface "unknown unknowns" by systematically checking which Product Factors (SFDIPOT) subcategories lack test coverage.

All in all, this report represents important and unique elements to be considered in the test strategy. Testers are advised to carefully evaluate all the information using critical thinking and context awareness.

**Generated:** 2025-12-27T20:04:50.360Z
**Total Tests:** 99
**Product Factors (SFDIPOT) Coverage:** 100%
**Traceability:** 100%

## Product Factors (SFDIPOT) Coverage Summary

| Category | Tests | Coverage |
|----------|-------|----------|
| STRUCTURE | 39 | 100% |
| FUNCTION | 9 | 100% |
| DATA | 6 | 100% |
| INTERFACES | 26 | 100% |
| PLATFORM | 6 | 100% |
| OPERATIONS | 6 | 100% |
| TIME | 7 | 100% |

## Risk-Based Prioritization

Test ideas are prioritized using a **risk-based approach** that considers:

1. **Business Impact**: Potential revenue loss, customer trust damage, or regulatory penalties
2. **Likelihood of Failure**: Complexity of implementation, external dependencies, new technology
3. **User Exposure**: Number of users affected and frequency of feature usage
4. **Security & Compliance**: Data protection requirements, payment processing, legal obligations

### Priority Legend

| Priority | Risk Level | Description | Examples from this Epic |
|----------|------------|-------------|------------------------|
| **P0** | Critical | Security vulnerabilities or core functionality that could cause immediate financial loss, data breach, or complete service failure. Must be tested before any release. | XSS/injection protection, authentication security, form validation |
| **P1** | High | Core business flows and integrations essential for revenue generation. Failures would significantly impact user experience or business operations. | API integrations, service integrations, authentication security |
| **P2** | Medium | Important features that support the core experience. Failures would cause inconvenience but workarounds exist. | form validation, platform compatibility, performance testing |
| **P3** | Low | Edge cases, cosmetic issues, or rarely used features. Failures have minimal business impact. | Edge cases, minor variations |

## Test Ideas

### STRUCTURE: Test ideas for everything that comprises the physical product (39 test ideas)

| ID | Priority | Subcategory | Test Idea | Automation Fitness |
|----|----------|-------------|-----------|-------------------|
| TC-STRU-388F8A0B | P1 | Code | Verify that newsletter Service integrates correctly with User Service | Automate on Integration level |
| TC-STRU-9671008D | P1 | Code | Verify that newsletter Service integrates correctly with Email Gateway | Automate on Integration level |
| TC-STRU-11BDBA93 | P1 | Code | Verify that newsletter Service integrates correctly with Article Service | Automate on Integration level |
| TC-STRU-4E1C923B | P1 | Code | Verify that contributor Portal integrates correctly with User Service | Automate on Integration level |
| TC-STRU-D8850AF4 | P1 | Code | Verify that contributor Portal integrates correctly with Article Service | Automate on Integration level |
| TC-STRU-229FCA62 | P1 | Code | Verify that contributor Portal integrates correctly with Media Service | Automate on Integration level |
| TC-STRU-B7E97AFB | P1 | Code | Verify that authentication Service integrates correctly with User Service | Automate on Integration level |
| TC-STRU-1453F5D7 | P1 | Code | Verify that authentication Service integrates correctly with Session Store | Automate on Integration level |
| TC-STRU-BAE64389 | P1 | Code | Verify that user Service integrates correctly with User Database | Automate on Integration level |
| TC-STRU-C17E30E6 | P1 | Code | Verify that user Service integrates correctly with Cache | Automate on Integration level |
| TC-STRU-CD09EF75 | P1 | Code | Verify that article Service integrates correctly with Article Database | Automate on Integration level |
| TC-STRU-2F1C43AC | P1 | Code | Verify that article Service integrates correctly with Search Index | Automate on Integration level |
| TC-STRU-ABBE0B9C | P1 | Code | Verify that media Service integrates correctly with CDN | Automate on Integration level |
| TC-STRU-50CB5443 | P1 | Code | Verify that media Service integrates correctly with Object Storage | Automate on Integration level |
| TC-STRU-E0ACE501 | P1 | Code | Verify that aPI Gateway integrates correctly with Authentication Service | Automate on Integration level |
| TC-STRU-C6C914A4 | P1 | Code | Verify that web Frontend integrates correctly with API Gateway | Automate on Integration level |
| TC-STRU-887AC756 | P1 | Service | Check that newsletter Service service starts successfully and passes health checks | Automate on Integration level |
| TC-STRU-7AFB8FEC | P1 | Service | Check that contributor Portal service starts successfully and passes health checks | Automate on Integration level |
| TC-STRU-DE5821F0 | P1 | Service | Check that authentication Service service starts successfully and passes health checks | Automate on Integration level |
| TC-STRU-C895BE7C | P1 | Service | Check that user Service service starts successfully and passes health checks | Automate on Integration level |
| TC-STRU-D986D2C7 | P1 | Service | Check that article Service service starts successfully and passes health checks | Automate on Integration level |
| TC-STRU-43D9A60C | P1 | Service | Check that media Service service starts successfully and passes health checks | Automate on Integration level |
| TC-STRU-DE270523 | P1 | Service | Check that email Gateway service starts successfully and passes health checks | Automate on Integration level |
| TC-STRU-D7D026E5 | P1 | Service | Check that search Index service starts successfully and passes health checks | Automate on Integration level |
| TC-STRU-299E8D71 | P1 | Service | Check that CDN service starts successfully and passes health checks | Automate on Integration level |
| TC-STRU-D57C94E3 | P2 | Code | Verify that newsletter Service component has correct structure and dependencies | Automate on Integration level |
| TC-STRU-3DC96BDD | P2 | Code | Verify that contributor Portal component has correct structure and dependencies | Automate on Integration level |
| TC-STRU-72DBB05C | P2 | Code | Verify that authentication Service component has correct structure and dependencies | Automate on Integration level |
| TC-STRU-A75A2D03 | P2 | Code | Verify that user Service component has correct structure and dependencies | Automate on Integration level |
| TC-STRU-C389CCB6 | P2 | Code | Verify that article Service component has correct structure and dependencies | Automate on Integration level |
| TC-STRU-7D3228D0 | P2 | Code | Verify that media Service component has correct structure and dependencies | Automate on Integration level |
| TC-STRU-DA0355C1 | P2 | Code | Verify that email Gateway component has correct structure and dependencies | Automate on Integration level |
| TC-STRU-3E55F99D | P2 | Code | Verify that user Database component has correct structure and dependencies | Automate on Integration level |
| TC-STRU-A9BD4EF0 | P2 | Code | Verify that article Database component has correct structure and dependencies | Automate on Integration level |
| TC-STRU-73E3D77A | P2 | Code | Verify that cache component has correct structure and dependencies | Automate on Integration level |
| TC-STRU-04CED6B7 | P2 | Code | Verify that search Index component has correct structure and dependencies | Automate on Integration level |
| TC-STRU-53580336 | P2 | Code | Verify that CDN component has correct structure and dependencies | Automate on Integration level |
| TC-STRU-7A645232 | P2 | Code | Verify that aPI Gateway component has correct structure and dependencies | Automate on Integration level |
| TC-STRU-DFEB47A9 | P2 | Code | Verify that web Frontend component has correct structure and dependencies | Automate on Integration level |

#### Clarifying Questions to address potential coverage gaps

Since the user stories focus on **user management, reporting**, the following subcategories have limited or no test coverage.

**[Hardware]**

*Rationale: The user stories mention user management but don't specify device requirements. Modern flows often involve hardware features.*

- Should user management support biometric authentication (Face ID/Touch ID) on mobile devices?
- Does any feature require camera or other hardware access?
- Should we test user management on devices without specific hardware capabilities?

**[NonExecutable]**

*Rationale: user management likely requires configuration files. Missing config can cause production failures.*

- What environment variables configure external services? Are there separate configs for test/production?
- Are there feature flags controlling user management behavior or access levels?
- What static assets (images, icons, templates) need testing across locales?

**[Collateral]**

*Rationale: user management and reporting require clear user documentation. Incorrect help content could lead to support tickets.*

- Is there help documentation explaining user management and related policies?
- Are tooltips and explanations accurate and user-friendly?
- Do error messages guide users to resolve issues themselves?

### FUNCTION: Test ideas for everything that the product does (9 test ideas)

| ID | Priority | Subcategory | Test Idea | Automation Fitness |
|----|----------|-------------|-----------|-------------------|
| TC-FUNC-A3D7A3E2 | P0 | SecurityRelated | Verify that author performance reports with article metrics | Automate on E2E level |
| TC-FUNC-19EA3814 | P1 | BusinessRules | Verify that privacy-compliant analytics with GDPR cookie consent implemented | Human testers must explore |
| TC-FUNC-53186C9C | P1 | BusinessRules | Verify that content performance dashboard with key metrics (page views, time on page, scroll depth) | Automate on E2E level |
| TC-FUNC-4D6442E7 | P1 | BusinessRules | Verify that conversion tracking for newsletter, membership, contact goals | Automate on E2E level |
| TC-FUNC-792A0AC2 | P1 | BusinessRules | Verify that author performance reports with article metrics | Automate on E2E level |
| TC-FUNC-C820DE80 | P1 | BusinessRules | Verify that search Console integration for SEO insights | Automate on E2E level |
| TC-FUNC-4C8F1DE5 | P1 | BusinessRules | Verify that automated monthly report generation | Automate on E2E level |
| TC-FUNC-E6C0D7EB | P1 | BusinessRules | Verify that real-time "Trending" algorithm based on actual traffic | Automate on E2E level |
| TC-FUNC-9E293158 | P1 | BusinessRules | Verify that a/B testing capability for content optimization | Automate on E2E level |

#### Clarifying Questions to address potential coverage gaps

Since the user stories focus on **user management, reporting**, the following subcategories have limited or no test coverage.

**[MultiUserSocial]**

*Rationale: The user stories don't detail multi-user scenarios for user management.*

- Can multiple end user access the same resource simultaneously?
- How are conflicts resolved when multiple users modify the same data?
- Are there collaboration features that need testing (sharing, permissions, notifications)?

**[Calculation]**

*Rationale: Calculations don't specify exact rules. Incorrect calculations can cause issues.*

- What are the exact calculation rules for numeric operations?
- How are units and conversions handled?
- What rounding rules apply? How is precision maintained?

**[SecurityRelated]**

*Rationale: Security features require specific controls beyond what's in the user stories.*

- What authentication requirements apply?

**[Transformations]**

*Rationale: Data transformation rules for application data aren't specified.*

- What transformations apply to input data (formatting, normalization, sanitization)?
- How are data imports processed and validated?
- What happens during modifications - full replace or partial update?

**[StateTransitions]**

*Rationale: user management has multiple states with complex transitions.*

- What are all valid states for entities? What transitions are allowed?
- Can a completed item be reactivated? Under what conditions?
- What happens to items in "pending" state for extended periods?

**[ErrorHandling]**

*Rationale: user management flows have many failure points. Clear error handling prevents user frustration.*

- What should happen when an external service is unavailable? Retry? Queue? Notify user?
- How should expired sessions be handled mid-operation? Should the operation be recoverable?
- What specific error messages should end user see for different failure scenarios?

**[Interactions]**

*Rationale: The user stories mention interactions but don't detail all system interactions.*

- What triggers each system event? (create, update, delete)
- What analytics events should be captured for user management?
- How do user management and reporting interact? Cache invalidation? State sync?

**[Testability]**

*Rationale: Testing user management requires specific testability features.*

- Are there test/sandbox modes for external integrations?
- What logging is available to diagnose issues in user management?
- Can data states be easily set up for testing edge cases?

### DATA: Test ideas for everything that the product processes (6 test ideas)

| ID | Priority | Subcategory | Test Idea | Automation Fitness |
|----|----------|-------------|-----------|-------------------|
| TC-DATA-B1A4E164 | P1 | Lifecycle | Verify data can be created successfully | Automate on API level |
| TC-DATA-D89BE784 | P1 | Lifecycle | Verify data can be modified successfully | Automate on API level |
| TC-DATA-CFBAF298 | P1 | Lifecycle | Verify data can be deleted successfully | Automate on API level |
| TC-DATA-24843AB3 | P2 | Cardinality | Verify behavior with zero items (empty state) | Automate on API level |
| TC-DATA-C4E4DA9B | P2 | Cardinality | Verify behavior with exactly one item | Automate on API level |
| TC-DATA-93E2E6F5 | P2 | Cardinality | Verify behavior with many items (bulk data) | Automate on API level |

#### Clarifying Questions to address potential coverage gaps

Since the user stories focus on **user management, reporting**, the following subcategories have limited or no test coverage.

**[InputOutput]**

*Rationale: Forms accept user input, but limits aren't specified. Missing limits create security and UX issues.*

- What are maximum lengths for text fields?
- What input formats are accepted?
- What format should API responses use for data output?

**[Preset]**

*Rationale: Default values for user management affect user experience but aren't specified.*

- What are the default user settings and preferences?
- What preset/seed data is required for user management to function?
- What default options are set for new end user?

**[Persistent]**

*Rationale: Persistence requirements for application data need clarification.*

- What data must persist across sessions? Across system restarts?
- How is state data synchronized across instances?
- What is the backup and recovery strategy for critical data?

**[BigLittle]**

*Rationale: user management doesn't specify limits. Undefined limits cause performance issues at scale.*

- What are the limits for data volume?
- Are there user management limits per end user type?
- What happens when a limit is exceeded? Soft limit with warning? Hard block?

**[InvalidNoise]**

*Rationale: Input forms are attack vectors. Security testing requires knowing expected behavior for malicious input.*

- How should the system handle Unicode/emoji in text fields? Special characters?
- How are invalid inputs handled?
- How are SQL injection or XSS attempts in form fields handled? Silent rejection? Logged alert?

### INTERFACES: Test ideas for every conduit by which the product is accessed or accesses other things (26 test ideas)

| ID | Priority | Subcategory | Test Idea | Automation Fitness |
|----|----------|-------------|-----------|-------------------|
| TC-INTE-2F7A6DAE | P1 | ApiSdk | Verify that newsletter API REST API endpoint responds correctly | Automate on API level |
| TC-INTE-D06658EA | P1 | ApiSdk | Verify that POST /newsletter/subscribe endpoint processes requests correctly | Automate on API level |
| TC-INTE-42AB2AC2 | P1 | ApiSdk | Verify that POST /newsletter/preferences endpoint processes requests correctly | Automate on API level |
| TC-INTE-43F344ED | P1 | ApiSdk | Verify that GET /newsletter/history endpoint processes requests correctly | Automate on API level |
| TC-INTE-1A4ECE19 | P1 | ApiSdk | Verify that submissions API REST API endpoint responds correctly | Automate on API level |
| TC-INTE-1474141C | P1 | ApiSdk | Verify that POST /submissions endpoint processes requests correctly | Automate on API level |
| TC-INTE-03154D9C | P1 | ApiSdk | Verify that GET /submissions endpoint processes requests correctly | Automate on API level |
| TC-INTE-6C7989F4 | P1 | ApiSdk | Verify that PUT /submissions/:id endpoint processes requests correctly | Automate on API level |
| TC-INTE-DEAC5583 | P1 | ApiSdk | Verify that POST /submissions/:id/publish endpoint processes requests correctly | Automate on API level |
| TC-INTE-15AF6516 | P1 | ApiSdk | Verify that moderation API REST API endpoint responds correctly | Automate on API level |
| TC-INTE-9CD5B0E5 | P1 | ApiSdk | Verify that POST /reports endpoint processes requests correctly | Automate on API level |
| TC-INTE-F0684999 | P1 | ApiSdk | Verify that GET /moderation/queue endpoint processes requests correctly | Automate on API level |
| TC-INTE-9638CD0D | P1 | ApiSdk | Verify that POST /moderation/action endpoint processes requests correctly | Automate on API level |
| TC-INTE-D8048919 | P1 | ApiSdk | Verify that auth API REST API endpoint responds correctly | Automate on API level |
| TC-INTE-3D03DF3E | P1 | ApiSdk | Verify that POST /auth/login endpoint processes requests correctly | Automate on API level |
| TC-INTE-318FE46F | P1 | ApiSdk | Verify that POST /auth/register endpoint processes requests correctly | Automate on API level |
| TC-INTE-15B4A4F3 | P1 | ApiSdk | Verify that POST /auth/logout endpoint processes requests correctly | Automate on API level |
| TC-INTE-572AB21D | P1 | ApiSdk | Verify that POST /auth/password/reset endpoint processes requests correctly | Automate on API level |
| TC-INTE-DA20DDB9 | P1 | ApiSdk | Verify that search API REST API endpoint responds correctly | Automate on API level |
| TC-INTE-A563539A | P1 | ApiSdk | Verify that GET /search endpoint processes requests correctly | Automate on API level |
| TC-INTE-813BDAA5 | P1 | ApiSdk | Verify that GET /search/suggestions endpoint processes requests correctly | Automate on API level |
| TC-INTE-876B0313 | P1 | ApiSdk | Verify that real-time Events webhook event is processed correctly | Automate on API level |
| TC-INTE-EDADD946 | P1 | ApiSdk | Verify that API endpoint eVENT /activity | Automate on API level |
| TC-INTE-66AFD93D | P1 | ApiSdk | Verify that API endpoint eVENT /updates | Automate on API level |
| TC-INTE-1131D92F | P2 | UserInterfaces | Verify that content performance dashboard with key metrics (page views, time on page, scroll depth) | Automate on E2E level |
| TC-INTE-AD0C9CD1 | P2 | UserInterfaces | Verify that author performance reports with article metrics | Automate on E2E level |

#### Clarifying Questions to address potential coverage gaps

Since the user stories focus on **user management, reporting**, the following subcategories have limited or no test coverage.

**[UserInterfaces]**

*Rationale: user management pages need to work across devices and for users with disabilities.*

- What responsive breakpoints must user management support? Mobile-first design?

**[SystemInterfaces]**

*Rationale: The architecture mentions services but their interfaces need testing.*

- What internal APIs connect user management and reporting?
- Are there message queues for async operations like background processing?
- How do services communicate failures? Circuit breaker patterns? Health checks?

**[ImportExport]**

*Rationale: Data export/import but format and scope aren't defined.*

- What formats should data export support? JSON? CSV? PDF?
- Can end user import data from other platforms?
- Can records be exported in bulk?

### PLATFORM: Test ideas for everything on which the product depends that is outside the project (6 test ideas)

| ID | Priority | Subcategory | Test Idea | Automation Fitness |
|----|----------|-------------|-----------|-------------------|
| TC-PLAT-CB372B7C | P2 | ProductFootprint | Verify that memory usage is within acceptable limits | Automated Performance Tests |
| TC-PLAT-6723E093 | P2 | ProductFootprint | Verify that CPU usage is within acceptable limits | Automated Performance Tests |
| TC-PLAT-49362EF1 | P2 | ExternalSoftware | Verify compatibility with Chrome | Automated Browser Compatibility Test |
| TC-PLAT-69884093 | P2 | ExternalSoftware | Verify compatibility with Firefox | Automated Browser Compatibility Test |
| TC-PLAT-CD74EBCF | P2 | ExternalSoftware | Verify compatibility with Safari | Automated Browser Compatibility Test |
| TC-PLAT-21D3EF23 | P2 | ExternalSoftware | Verify compatibility with Edge | Automated Browser Compatibility Test |

#### Clarifying Questions to address potential coverage gaps

Since the user stories focus on **user management, reporting**, the following subcategories have limited or no test coverage.

**[ExternalHardware]**

*Rationale: user management pages need to work on various devices, but requirements aren't specified.*

- What are minimum device specifications? (memory, screen size, CPU)
- Are there network bandwidth requirements? Will user management work on slow connections?
- Should offline capabilities exist? Can end user access data without connectivity?

**[EmbeddedComponents]**

*Rationale: Third-party components used for user management need version tracking and security monitoring.*

- What third-party UI component libraries are used? Version requirements?
- What external SDKs are embedded? How are updates managed?
- Are there shared utility libraries across services?

**[ProductFootprint]**

*Rationale: Resource usage for user management isn't specified. This affects hosting and scaling decisions.*

- What are the memory and CPU requirements for user management?

### OPERATIONS: Test ideas for how the product will be used (6 test ideas)

| ID | Priority | Subcategory | Test Idea | Automation Fitness |
|----|----------|-------------|-----------|-------------------|
| TC-OPER-B8A8D75E | P0 | DisfavoredUse | Verify protection against injection attacks | Automated Security Tests |
| TC-OPER-1FCBE7C7 | P0 | DisfavoredUse | Verify protection against XSS attacks | Automated Security Tests |
| TC-OPER-17ED68D3 | P1 | Users | Verify functionality for user | Human testers must explore |
| TC-OPER-927FAB24 | P1 | CommonUse | Verify that analytics & Growth Engine | Human testers must explore |
| TC-OPER-EBC45D5B | P1 | ExtremeUse | Verify behavior under high load conditions | Automated Performance Tests |
| TC-OPER-C186E6DB | P2 | ExtremeUse | Verify behavior under maximum data volume | Automated Performance Tests |

#### Clarifying Questions to address potential coverage gaps

Since the user stories focus on **user management, reporting**, the following subcategories have limited or no test coverage.

**[Users]**

*Rationale: User stories mention "end user" but don't detail user roles or accessibility.*

- Are there admin/moderator roles beyond regular users? What permissions do they have?

**[Environment]**

*Rationale: The operating environment for user management may affect usability.*

- In what environments will end user use user management? (office, mobile, public)
- Are there environmental factors affecting usage? (lighting for cameras, noise for voice)
- How does user management perform in low-connectivity environments?

**[CommonUse]**

*Rationale: While individual features are specified, the complete end user journey isn't detailed.*

- What is the typical end user journey for user management? What touchpoints exist?

**[UncommonUse]**

*Rationale: Edge cases in user management flows need specific handling.*

- What happens if end user tries to perform an action that's already been completed?
- How do end user recover from failed operations? Retry logic? Support escalation?
- Can end user modify critical data? What verification is required?

**[ExtremeUse]**

*Rationale: user management may experience load spikes during peak usage.*

- What is expected peak concurrent end user? During peak periods?

**[DisfavoredUse]**

*Rationale: user management systems are targets for fraud and abuse.*

- What abuse scenarios should be prevented? Scraping? Automation?

### TIME: Test ideas for any relationship between the product and time (7 test ideas)

| ID | Priority | Subcategory | Test Idea | Automation Fitness |
|----|----------|-------------|-----------|-------------------|
| TC-TIME-B0ECEEDD | P1 | InputOutputTiming | Verify that timeout handling works correctly | Automated Concurrency Tests |
| TC-TIME-4D5CC326 | P1 | Concurrency | Verify that concurrent user access is handled correctly | Automated Concurrency Tests |
| TC-TIME-65220918 | P1 | Concurrency | Verify that race conditions are prevented | Automated Concurrency Tests |
| TC-TIME-67023B6F | P2 | TimeRelatedData | Verify temporal behavior of content performance dashboard with key metrics (page views, time on page, scroll depth) | Human testers must explore |
| TC-TIME-F6F5B0CA | P2 | TimeRelatedData | Verify temporal behavior of real-time "Trending" algorithm based on actual traffic | Human testers must explore |
| TC-TIME-0BD95F7C | P2 | Pacing | Check behavior with rapid input (burst traffic) | Automated Concurrency Tests |
| TC-TIME-D0C7024F | P2 | Pacing | Check behavior with slow/delayed input | Automated Concurrency Tests |

#### Clarifying Questions to address potential coverage gaps

Since the user stories focus on **user management, reporting**, the following subcategories have limited or no test coverage.

**[TimeRelatedData]**

*Rationale: Time-sensitive data are timezone-dependent.*

- In what timezone are timestamps calculated? UTC? User's local timezone?

**[InputOutputTiming]**

*Rationale: External integrations have timeout and retry considerations.*

- What is the timeout for external API responses? What happens on timeout?

**[Pacing]**

*Rationale: user management operations have implicit timing requirements.*

- What are expected response times for user management? Under 3 seconds?

**[Concurrency]**

*Rationale: end user may access user management from multiple devices simultaneously.*

- What happens if the same end user logs in from multiple devices? Single session? Multiple allowed?

## Requirement Traceability Matrix

| Requirement | Test Ideas | Product Factors (SFDIPOT) Categories | Coverage |
|-------------|------------|-----------------|----------|
| US-601: Analytics & Growth Engine | 31 | FUNCTION, OPERATIONS, STRUCTURE, TIME, PLATFORM | full |