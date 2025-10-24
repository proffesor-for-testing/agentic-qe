import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';

/**
 * Test Suite: Homepage Functional Tests
 * Based on actual agentics.org content crawled on 2025-10-24
 *
 * Coverage:
 * - TC-001: Homepage Load and Core Elements
 * - TC-002: SEO and Metadata
 * - TC-003: Navigation Menu
 * - TC-004: Hero Section
 * - TC-005: Explore Cards
 * - TC-006: Community Stats
 * - TC-007: Paths of Impact
 */

test.describe('Homepage Functional Tests', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.goto();
  });

  test('TC-001: Homepage should load with all core elements', async () => {
    // Verify page title
    const title = await homePage.getTitle();
    expect(title).toBe('Agentics Foundation | Building the Future of Agentic AI');

    // Verify logo is visible
    await expect(homePage.logo).toBeVisible();

    // Verify page loads within acceptable time
    const metrics = await homePage.getPerformanceMetrics();
    expect(metrics.pageLoadTime).toBeLessThan(5000); // 5 seconds

    // Verify main sections are present
    const structure = await homePage.page.evaluate(() => ({
      hasHeader: !!document.querySelector('header'),
      hasMain: !!document.querySelector('main'),
      hasFooter: !!document.querySelector('footer'),
      hasNav: !!document.querySelector('nav'),
    }));

    expect(structure.hasHeader).toBe(true);
    expect(structure.hasMain).toBe(true);
    expect(structure.hasFooter).toBe(true);
    expect(structure.hasNav).toBe(true);
  });

  test('TC-002: SEO and Metadata should be properly configured', async () => {
    // Meta description
    const metaDescription = await homePage.getMetaDescription();
    expect(metaDescription).toContain('Agentics Foundation');
    expect(metaDescription).toContain('100K+');
    expect(metaDescription!.length).toBeGreaterThan(50);

    // Open Graph tags
    const ogTitle = await homePage.getOgTitle();
    expect(ogTitle).toBe('Agentics Foundation | Building the Future of Agentic AI');

    const ogImage = await homePage.getOgImage();
    expect(ogImage).toBe('https://agentics.org/og-image.png');

    // Twitter card
    const twitterCard = await homePage.getTwitterCard();
    expect(twitterCard).toBe('summary_large_image');

    // Keywords
    const keywords = await homePage.page.locator('meta[name="keywords"]').getAttribute('content');
    expect(keywords).toContain('agentic AI');
    expect(keywords).toContain('open source AI');
  });

  test('TC-003: Navigation menu should have all required links', async () => {
    // Verify all 7 navigation items are present
    await expect(homePage.navAbout).toBeVisible();
    await expect(homePage.navCommunity).toBeVisible();
    await expect(homePage.navProjects).toBeVisible();
    await expect(homePage.navTraining).toBeVisible();
    await expect(homePage.navAmbassador).toBeVisible();
    await expect(homePage.navLeadership).toBeVisible();
    await expect(homePage.navPartners).toBeVisible();

    // Verify navigation links have correct hrefs
    await expect(homePage.navAbout).toHaveAttribute('href', '/about');
    await expect(homePage.navCommunity).toHaveAttribute('href', '/community');
    await expect(homePage.navProjects).toHaveAttribute('href', '/projects');
    await expect(homePage.navTraining).toHaveAttribute('href', '/training');
    await expect(homePage.navAmbassador).toHaveAttribute('href', '/ambassador');
    await expect(homePage.navLeadership).toHaveAttribute('href', '/leadership');
    await expect(homePage.navPartners).toHaveAttribute('href', '/partners');
  });

  test('TC-004: Hero section should display correctly', async () => {
    // Verify hero heading
    await expect(homePage.heroHeading).toBeVisible();
    await expect(homePage.heroHeading).toContainText('Agentic AI');

    // Verify subtext
    await expect(homePage.heroSubtext).toBeVisible();
    await expect(homePage.heroSubtext).toHaveText('Autonomous agents that think, adapt, and collaborate');

    // Verify three key stats
    await expect(homePage.communityStat).toBeVisible();
    await expect(homePage.communityStat).toHaveText('100K+');

    await expect(homePage.openSourceStat).toBeVisible();
    await expect(homePage.openSourceStat).toHaveText('Open Source');

    await expect(homePage.globalStat).toBeVisible();
    await expect(homePage.globalStat).toHaveText('Global');

    // Verify Join Community button
    await expect(homePage.joinCommunityButton).toBeVisible();
  });

  test('TC-005: Explore cards should all be present and clickable', async () => {
    // Verify all 4 explore cards are visible
    const cardsVisible = await homePage.areExploreCardsVisible();
    expect(cardsVisible).toBe(true);

    // Verify About card
    await expect(homePage.aboutCard).toBeVisible();
    await expect(homePage.aboutCard).toContainText('About');
    await expect(homePage.aboutCard).toContainText('democratize AI');

    // Verify Impact card
    await expect(homePage.impactCard).toBeVisible();
    await expect(homePage.impactCard).toContainText('Impact');
    await expect(homePage.impactCard).toContainText('R&D');

    // Verify Community card
    await expect(homePage.communityCard).toBeVisible();
    await expect(homePage.communityCard).toContainText('Community');
    await expect(homePage.communityCard).toContainText('global network');

    // Verify Projects card
    await expect(homePage.projectsCard).toBeVisible();
    await expect(homePage.projectsCard).toContainText('Projects');
    await expect(homePage.projectsCard).toContainText('open-source');
  });

  test('TC-006: Community stats should display correctly', async () => {
    // Scroll to community section
    await homePage.scrollToSection('community');

    // Verify Reddit stat
    await expect(homePage.redditStat).toBeVisible();
    await expect(homePage.redditStat).toHaveText('130K+');

    // Verify LinkedIn stat
    await expect(homePage.linkedInStat).toBeVisible();
    await expect(homePage.linkedInStat).toHaveText('52K+');

    // Verify Discord stat
    await expect(homePage.discordStat).toBeVisible();
    await expect(homePage.discordStat).toHaveText('3K+');

    // Verify community stats via helper method
    const stats = await homePage.getCommunityStats();
    expect(stats.members).toBe(true);
    expect(stats.reddit).toBe(true);
    expect(stats.linkedin).toBe(true);
    expect(stats.discord).toBe(true);
  });

  test('TC-007: All 7 Paths of Impact should be visible', async () => {
    // Scroll to impact section
    await homePage.scrollToSection('impact');

    // Verify heading
    await expect(homePage.pathsHeading).toBeVisible();

    // Verify all 7 paths are visible using helper method
    const allPathsVisible = await homePage.areAllPathsVisible();
    expect(allPathsVisible).toBe(true);

    // Verify individual paths
    await expect(homePage.rndCard).toBeVisible();
    await expect(homePage.rndCard).toHaveText('R&D');

    await expect(homePage.openSourceCard).toBeVisible();
    await expect(homePage.openSourceCard).toHaveText('Open Source Toolkits');

    await expect(homePage.educationCard).toBeVisible();
    await expect(homePage.educationCard).toHaveText('Educational Resources');

    await expect(homePage.workshopsCard).toBeVisible();
    await expect(homePage.workshopsCard).toHaveText('Workshops');

    await expect(homePage.chaptersCard).toBeVisible();
    await expect(homePage.chaptersCard).toHaveText('Regional Chapters');

    await expect(homePage.safetyCard).toBeVisible();
    await expect(homePage.safetyCard).toHaveText('AI Safety');

    await expect(homePage.advisoryCard).toBeVisible();
    await expect(homePage.advisoryCard).toHaveText('Advisory Services');
  });

  test('TC-008: "What is Agentic AI" section should show both approaches', async () => {
    // Scroll to section
    await homePage.scrollToSection('what-is-agentics');

    // Verify heading
    await expect(homePage.whatIsHeading).toBeVisible();

    // Verify both coding approaches are shown
    const approachesVisible = await homePage.areCodingApproachesVisible();
    expect(approachesVisible).toBe(true);

    // Verify Vibe Coding
    await expect(homePage.vibeCodingCard).toBeVisible();

    // Verify Agentic Engineering
    await expect(homePage.agenticEngineeringCard).toBeVisible();

    // Verify "Explore the Full Spectrum" link
    await expect(homePage.exploreSpectrumLink).toBeVisible();
    await expect(homePage.exploreSpectrumLink).toHaveAttribute('href', '/what-is-agentics');
  });

  test('TC-009: Join Community button should link to external community platform', async ({ context }) => {
    // Click Join Community button and wait for new page
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      homePage.joinCommunityButton.click(),
    ]);

    // Verify it opens community.agentics.org
    await newPage.waitForLoadState();
    expect(newPage.url()).toContain('community.agentics.org');

    await newPage.close();
  });

  test('TC-010: Console button should be visible', async () => {
    // Verify console button is present (fixed position)
    await expect(homePage.consoleButton).toBeVisible();
    await expect(homePage.consoleButton).toHaveText('Console');
  });

  test('TC-011: Heading hierarchy should be proper', async () => {
    const headings = await homePage.getHeadings();

    // Should have exactly one H1
    const h1Count = headings.filter(h => h.level === 'h1').length;
    expect(h1Count).toBe(1);

    // H1 should be about Agentic AI
    const h1 = headings.find(h => h.level === 'h1');
    expect(h1?.text).toContain('Agentic AI');

    // Should have multiple H2s for main sections
    const h2Count = headings.filter(h => h.level === 'h2').length;
    expect(h2Count).toBeGreaterThanOrEqual(3);

    // Should have H3s for subsections
    const h3Count = headings.filter(h => h.level === 'h3').length;
    expect(h3Count).toBeGreaterThanOrEqual(7); // At least 7 paths of impact + explore cards
  });

  test('TC-012: HTTPS should be enforced', async () => {
    // Verify page is using HTTPS
    const isHTTPS = await homePage.isUsingHTTPS();
    expect(isHTTPS).toBe(true);

    // Verify URL starts with https://
    expect(homePage.page.url()).toMatch(/^https:\/\//);
  });

  test('TC-013: Contact Us button should be visible in footer', async () => {
    // Scroll to footer
    await homePage.footer.scrollIntoViewIfNeeded();

    // Verify Contact Us button
    await expect(homePage.contactButton).toBeVisible();
    await expect(homePage.contactButton).toHaveText('Contact Us');
  });

  test('TC-014: Footer should contain copyright and attribution', async () => {
    // Scroll to footer
    await homePage.footer.scrollIntoViewIfNeeded();

    // Verify footer is visible
    await expect(homePage.footer).toBeVisible();

    // Verify copyright text
    const footerText = await homePage.footer.textContent();
    expect(footerText).toContain('© 2025 Agentics Foundation');
    expect(footerText).toContain('Built by the Community');
  });
});
