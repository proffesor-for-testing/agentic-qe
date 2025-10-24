import { chromium } from '@playwright/test';

async function crawlSite() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Navigating to https://agentics.org/...');
  await page.goto('https://agentics.org/', { waitUntil: 'networkidle' });

  // Get page title
  const title = await page.title();
  console.log('\n=== PAGE TITLE ===');
  console.log(title);

  // Get all text content
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('\n=== PAGE TEXT CONTENT ===');
  console.log(bodyText);

  // Get all links
  const links = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a'));
    return anchors.map(a => ({
      text: a.innerText.trim(),
      href: a.href,
      target: a.target
    })).filter(l => l.text || l.href);
  });
  console.log('\n=== LINKS ===');
  console.log(JSON.stringify(links, null, 2));

  // Get all buttons
  const buttons = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
    return btns.map(b => ({
      text: b.textContent?.trim(),
      type: b.getAttribute('type'),
      class: b.className
    }));
  });
  console.log('\n=== BUTTONS ===');
  console.log(JSON.stringify(buttons, null, 2));

  // Get all forms
  const forms = await page.evaluate(() => {
    const formElements = Array.from(document.querySelectorAll('form'));
    return formElements.map(f => ({
      action: f.action,
      method: f.method,
      inputs: Array.from(f.querySelectorAll('input')).map(i => ({
        name: i.name,
        type: i.type,
        placeholder: i.placeholder
      }))
    }));
  });
  console.log('\n=== FORMS ===');
  console.log(JSON.stringify(forms, null, 2));

  // Get navigation structure
  const navigation = await page.evaluate(() => {
    const navs = Array.from(document.querySelectorAll('nav, header nav, [role="navigation"]'));
    return navs.map(nav => ({
      html: nav.innerHTML.substring(0, 500)
    }));
  });
  console.log('\n=== NAVIGATION ===');
  console.log(JSON.stringify(navigation, null, 2));

  // Get all headings
  const headings = await page.evaluate(() => {
    const headingElements = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    return headingElements.map(h => ({
      level: h.tagName,
      text: h.textContent?.trim()
    }));
  });
  console.log('\n=== HEADINGS ===');
  console.log(JSON.stringify(headings, null, 2));

  // Get meta tags
  const metaTags = await page.evaluate(() => {
    const metas = Array.from(document.querySelectorAll('meta'));
    return metas.map(m => ({
      name: m.getAttribute('name'),
      property: m.getAttribute('property'),
      content: m.getAttribute('content')
    })).filter(m => m.name || m.property);
  });
  console.log('\n=== META TAGS ===');
  console.log(JSON.stringify(metaTags, null, 2));

  // Get images
  const images = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.map(img => ({
      src: img.src,
      alt: img.alt,
      width: img.width,
      height: img.height
    }));
  });
  console.log('\n=== IMAGES ===');
  console.log(JSON.stringify(images, null, 2));

  // Get sections/main content areas
  const sections = await page.evaluate(() => {
    const sectionElements = Array.from(document.querySelectorAll('section, main, article, [class*="section"]'));
    return sectionElements.map((s, i) => ({
      index: i,
      tagName: s.tagName,
      className: s.className,
      id: s.id,
      textPreview: s.textContent?.trim().substring(0, 200)
    }));
  });
  console.log('\n=== SECTIONS ===');
  console.log(JSON.stringify(sections, null, 2));

  // Get page structure
  const structure = await page.evaluate(() => {
    return {
      hasHeader: !!document.querySelector('header'),
      hasFooter: !!document.querySelector('footer'),
      hasNav: !!document.querySelector('nav'),
      hasMain: !!document.querySelector('main'),
      hasSidebar: !!document.querySelector('aside, [class*="sidebar"]')
    };
  });
  console.log('\n=== PAGE STRUCTURE ===');
  console.log(JSON.stringify(structure, null, 2));

  // Take screenshot
  await page.screenshot({ path: 'screenshot.png', fullPage: true });
  console.log('\n=== SCREENSHOT SAVED ===');
  console.log('screenshot.png');

  await browser.close();
}

crawlSite().catch(console.error);
