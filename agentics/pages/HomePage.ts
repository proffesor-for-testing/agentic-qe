import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for Agentics.org Homepage
 *
 * Based on actual site structure crawled on 2025-10-24
 * Encapsulates all interactions with the homepage
 */
export class HomePage {
  readonly page: Page;

  // Header and Navigation
  readonly logo: Locator;
  readonly navAbout: Locator;
  readonly navCommunity: Locator;
  readonly navProjects: Locator;
  readonly navTraining: Locator;
  readonly navAmbassador: Locator;
  readonly navLeadership: Locator;
  readonly navPartners: Locator;
  readonly mobileMenuButton: Locator;
  readonly consoleButton: Locator;

  // Hero Section
  readonly heroHeading: Locator;
  readonly heroSubtext: Locator;
  readonly communityStat: Locator;
  readonly openSourceStat: Locator;
  readonly globalStat: Locator;
  readonly joinCommunityButton: Locator;

  // Explore Cards
  readonly aboutCard: Locator;
  readonly impactCard: Locator;
  readonly communityCard: Locator;
  readonly projectsCard: Locator;

  // What is Agentic AI Section
  readonly whatIsHeading: Locator;
  readonly vibeCodingCard: Locator;
  readonly agenticEngineeringCard: Locator;
  readonly exploreSpectrumLink: Locator;

  // Paths of Impact
  readonly pathsHeading: Locator;
  readonly rndCard: Locator;
  readonly openSourceCard: Locator;
  readonly educationCard: Locator;
  readonly workshopsCard: Locator;
  readonly chaptersCard: Locator;
  readonly safetyCard: Locator;
  readonly advisoryCard: Locator;

  // Community Stats
  readonly redditStat: Locator;
  readonly linkedInStat: Locator;
  readonly discordStat: Locator;

  // Footer
  readonly footer: Locator;
  readonly contactButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header and Navigation
    this.logo = page.locator('img[alt="Agentics Foundation"]');
    this.navAbout = page.locator('nav a[href="/about"]');
    this.navCommunity = page.locator('nav a[href="/community"]');
    this.navProjects = page.locator('nav a[href="/projects"]');
    this.navTraining = page.locator('nav a[href="/training"]');
    this.navAmbassador = page.locator('nav a[href="/ambassador"]');
    this.navLeadership = page.locator('nav a[href="/leadership"]');
    this.navPartners = page.locator('nav a[href="/partners"]');
    this.mobileMenuButton = page.locator('button.md\\:hidden');
    this.consoleButton = page.getByRole('button', { name: 'Console' });

    // Hero Section
    this.heroHeading = page.getByRole('heading', { name: /Era of.*Agentic AI/i });
    this.heroSubtext = page.getByText('Autonomous agents that think, adapt, and collaborate');
    this.communityStat = page.getByText('100K+');
    this.openSourceStat = page.getByText('Open Source');
    this.globalStat = page.getByText('Global');
    this.joinCommunityButton = page.getByRole('link', { name: 'Join the Community' });

    // Explore Cards
    this.aboutCard = page.getByRole('link', { name: /About.*democratize AI/i });
    this.impactCard = page.getByRole('link', { name: /Impact.*R&D.*education/i });
    this.communityCard = page.getByRole('link', { name: /Community.*global network/i });
    this.projectsCard = page.getByRole('link', { name: /Projects.*open-source/i });

    // What is Agentic AI Section
    this.whatIsHeading = page.getByRole('heading', { name: 'What is Agentic AI?' });
    this.vibeCodingCard = page.getByRole('heading', { name: 'Vibe Coding' });
    this.agenticEngineeringCard = page.getByRole('heading', { name: 'Agentic Engineering' });
    this.exploreSpectrumLink = page.getByRole('link', { name: /Explore the Full Spectrum/i });

    // Paths of Impact
    this.pathsHeading = page.getByRole('heading', { name: /Paths of Impact/i });
    this.rndCard = page.getByRole('heading', { name: 'R&D' });
    this.openSourceCard = page.getByRole('heading', { name: 'Open Source Toolkits' });
    this.educationCard = page.getByRole('heading', { name: 'Educational Resources' });
    this.workshopsCard = page.getByRole('heading', { name: 'Workshops' });
    this.chaptersCard = page.getByRole('heading', { name: 'Regional Chapters' });
    this.safetyCard = page.getByRole('heading', { name: 'AI Safety' });
    this.advisoryCard = page.getByRole('heading', { name: 'Advisory Services' });

    // Community Stats
    this.redditStat = page.getByText('130K+');
    this.linkedInStat = page.getByText('52K+');
    this.discordStat = page.getByText('3K+');

    // Footer
    this.footer = page.locator('footer');
    this.contactButton = page.getByRole('button', { name: 'Contact Us' });
  }

  /**
   * Navigate to the homepage
   */
  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get the page title
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * Check if navigation menu is visible
   */
  async isNavigationVisible(): Promise<boolean> {
    return await this.navAbout.isVisible();
  }

  /**
   * Get all navigation links
   */
  async getAllNavLinks(): Promise<string[]> {
    const links = await this.page.locator('nav a').allTextContents();
    return links.filter(link => link.trim().length > 0);
  }

  /**
   * Click navigation item
   */
  async clickNav(item: 'About' | 'Community' | 'Projects' | 'Training' | 'Ambassador' | 'Leadership' | 'Partners') {
    const nav = {
      'About': this.navAbout,
      'Community': this.navCommunity,
      'Projects': this.navProjects,
      'Training': this.navTraining,
      'Ambassador': this.navAmbassador,
      'Leadership': this.navLeadership,
      'Partners': this.navPartners
    };
    await nav[item].click();
  }

  /**
   * Get meta description
   */
  async getMetaDescription(): Promise<string | null> {
    return await this.page.locator('meta[name="description"]').getAttribute('content');
  }

  /**
   * Get Open Graph title
   */
  async getOgTitle(): Promise<string | null> {
    return await this.page.locator('meta[property="og:title"]').getAttribute('content');
  }

  /**
   * Get Open Graph image
   */
  async getOgImage(): Promise<string | null> {
    return await this.page.locator('meta[property="og:image"]').getAttribute('content');
  }

  /**
   * Check if hero section is visible
   */
  async isHeroVisible(): Promise<boolean> {
    return await this.heroHeading.isVisible();
  }

  /**
   * Get community stats
   */
  async getCommunityStats(): Promise<{ members: boolean; reddit: boolean; linkedin: boolean; discord: boolean }> {
    return {
      members: await this.communityStat.isVisible(),
      reddit: await this.redditStat.isVisible(),
      linkedin: await this.linkedInStat.isVisible(),
      discord: await this.discordStat.isVisible()
    };
  }

  /**
   * Click "Join the Community" button
   */
  async clickJoinCommunity() {
    await this.joinCommunityButton.click();
  }

  /**
   * Check if all explore cards are visible
   */
  async areExploreCardsVisible(): Promise<boolean> {
    const cards = [this.aboutCard, this.impactCard, this.communityCard, this.projectsCard];
    for (const card of cards) {
      if (!(await card.isVisible())) return false;
    }
    return true;
  }

  /**
   * Click explore card
   */
  async clickExploreCard(card: 'About' | 'Impact' | 'Community' | 'Projects') {
    const cards = {
      'About': this.aboutCard,
      'Impact': this.impactCard,
      'Community': this.communityCard,
      'Projects': this.projectsCard
    };
    await cards[card].click();
  }

  /**
   * Check if "What is Agentic AI" section is visible
   */
  async isWhatIsAgenticVisible(): Promise<boolean> {
    return await this.whatIsHeading.isVisible();
  }

  /**
   * Check if both coding approaches are shown
   */
  async areCodingApproachesVisible(): Promise<boolean> {
    return (await this.vibeCodingCard.isVisible()) && (await this.agenticEngineeringCard.isVisible());
  }

  /**
   * Check if all 7 paths of impact are visible
   */
  async areAllPathsVisible(): Promise<boolean> {
    const paths = [
      this.rndCard,
      this.openSourceCard,
      this.educationCard,
      this.workshopsCard,
      this.chaptersCard,
      this.safetyCard,
      this.advisoryCard
    ];

    for (const path of paths) {
      if (!(await path.isVisible())) return false;
    }
    return true;
  }

  /**
   * Get all headings on the page
   */
  async getHeadings(): Promise<{ level: string; text: string }[]> {
    return await this.page.evaluate(() => {
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      return Array.from(headings).map((h) => ({
        level: h.tagName.toLowerCase(),
        text: h.textContent?.trim() || '',
      }));
    });
  }

  /**
   * Check if page uses HTTPS
   */
  async isUsingHTTPS(): Promise<boolean> {
    return this.page.url().startsWith('https://');
  }

  /**
   * Get page load performance metrics
   */
  async getPerformanceMetrics() {
    return await this.page.evaluate(() => {
      const perfData = window.performance.timing;
      const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
      const connectTime = perfData.responseEnd - perfData.requestStart;
      const renderTime = perfData.domComplete - perfData.domLoading;

      return {
        pageLoadTime,
        connectTime,
        renderTime,
      };
    });
  }

  /**
   * Get response headers
   */
  async getResponseHeaders(): Promise<Record<string, string>> {
    const response = await this.page.goto('/');
    return response ? await response.allHeaders() : {};
  }

  /**
   * Check if console button is visible
   */
  async isConsoleButtonVisible(): Promise<boolean> {
    return await this.consoleButton.isVisible();
  }

  /**
   * Click console button
   */
  async clickConsoleButton() {
    await this.consoleButton.click();
  }

  /**
   * Get Twitter/X meta tags
   */
  async getTwitterCard(): Promise<string | null> {
    return await this.page.locator('meta[name="twitter:card"]').getAttribute('content');
  }

  /**
   * Scroll to section
   */
  async scrollToSection(section: 'what-is-agentics' | 'impact' | 'community') {
    await this.page.locator(`#${section}`).scrollIntoViewIfNeeded();
  }

  /**
   * Wait for page to be fully loaded
   */
  async waitForFullLoad() {
    await this.page.waitForLoadState('networkidle');
  }
}
