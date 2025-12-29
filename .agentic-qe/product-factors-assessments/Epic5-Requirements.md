# Epic 5: Social Proof & User-Generated Content Integration

## Business Context
**Domain**: E-commerce (Retail Fashion) - Next.co.uk Homepage
**Priority**: MEDIUM
**Timeline**: April - June 2026
**Risk Level**: LOW

Social proof increases conversion by up to 270%. While Next has reviews on product pages, this content isn't surfaced on the homepage. This epic brings customer voices to the forefront through ratings, reviews, and user-generated content integration.

## Acceptance Criteria
1. "Customer Favorites" section with star ratings and review counts on homepage
2. Instagram/social feed integration showing real customer photos
3. "Shop the Look" with customer-submitted outfit photos
4. Trust signals (Trustpilot score, awards) visible above the fold
5. "Trending Now" based on real-time purchase/view data
6. Video reviews/testimonials on homepage
7. "Staff Picks" curated selections from Next employees

## User Stories

### US1: Social Proof for New Customers
As a new customer, I want to see social proof that builds trust in Next, so that I feel confident making my first purchase.

### US2: Discover Customer Favorites
As a shopper, I want to see what products other customers love, so that I can make informed purchasing decisions.

### US3: Real Customer Styling
As a fashion-conscious user, I want to see how real customers style Next products, so that I can get inspiration for my own wardrobe.

### US4: Trending Products
As a shopper, I want to discover trending products based on real demand, so that I stay current with popular fashion choices.

### US5: Submit User Photos
As a customer, I want to submit my own photos for potential feature, so that I can share my Next fashion choices with the community.

## Technical Tasks
1. Build aggregated ratings component for product cards
2. Integrate Instagram API for social feed with moderation
3. Implement UGC submission and moderation workflow
4. Create real-time trending algorithm based on sales and engagement
5. Integrate Trustpilot/external review aggregation

## Dependencies
- Depends On: E2 (Progressive Enhancement & Core Web Vitals), E3 (AI-Powered Personalization)
- Shared Resources: Content Team, Frontend Team

## Success Metrics
- Homepage UGC Engagement: Current 0%, Target 5% CTR on UGC

## Risks
- **UGC moderation challenges**: High probability, Medium impact
  - Mitigation: AI pre-moderation, clear guidelines
