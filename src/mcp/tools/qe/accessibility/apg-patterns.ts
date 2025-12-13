/**
 * ARIA Authoring Practices Guide (APG) Pattern Library
 *
 * Comprehensive database of accessible component patterns based on W3C APG
 * Version: Based on APG 1.2 (2024)
 *
 * Purpose: Provide context-aware ARIA recommendations for accessible components
 * Reference: https://www.w3.org/WAI/ARIA/apg/
 */

export interface KeyboardInteraction {
  key: string;
  action: string;
  required: boolean;
}

export interface ARIAAttribute {
  name: string;
  required: boolean;
  description: string;
  possibleValues?: string[];
  defaultValue?: string;
}

export interface APGPattern {
  name: string;
  description: string;
  category: 'widget' | 'composite' | 'landmark' | 'live-region';
  wcagCriteria: string[];
  roles: {
    primary: string;
    related?: string[];
  };
  ariaAttributes: ARIAAttribute[];
  keyboardInteractions: KeyboardInteraction[];
  htmlExample: string;
  javascriptExample?: string;
  cssExample?: string;
  commonMistakes: string[];
  testingGuidelines: string[];
  apgUrl: string;
}

export const APG_PATTERNS: Record<string, APGPattern> = {
  'accordion': {
    name: 'Accordion',
    description: 'Vertically stacked set of interactive headings that each reveal a section of content',
    category: 'widget',
    wcagCriteria: ['2.1.1', '4.1.2', '1.3.1'],
    roles: {
      primary: 'button',
      related: ['region', 'heading']
    },
    ariaAttributes: [
      {
        name: 'aria-expanded',
        required: true,
        description: 'Indicates whether the controlled region is expanded or collapsed',
        possibleValues: ['true', 'false']
      },
      {
        name: 'aria-controls',
        required: true,
        description: 'Identifies the element whose contents or presence is controlled',
      },
      {
        name: 'aria-disabled',
        required: false,
        description: 'Indicates the element is disabled',
        possibleValues: ['true', 'false']
      }
    ],
    keyboardInteractions: [
      { key: 'Enter or Space', action: 'Toggle expanded/collapsed state', required: true },
      { key: 'Tab', action: 'Move focus to next focusable element', required: true },
      { key: 'Shift + Tab', action: 'Move focus to previous focusable element', required: true }
    ],
    htmlExample: `<!-- Accordion Example -->
<div class="accordion">
  <h3>
    <button type="button"
            aria-expanded="false"
            aria-controls="accordion-panel-1"
            id="accordion-header-1">
      Personal Information
    </button>
  </h3>
  <div id="accordion-panel-1"
       role="region"
       aria-labelledby="accordion-header-1"
       hidden>
    <p>Panel content goes here...</p>
  </div>
</div>`,
    javascriptExample: `// Accordion toggle functionality
button.addEventListener('click', () => {
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', !expanded);
  panel.hidden = expanded;
});`,
    commonMistakes: [
      'Using <div> instead of <button> for accordion header',
      'Missing aria-controls connection',
      'Not toggling aria-expanded state',
      'Using display:none instead of hidden attribute',
      'Missing heading structure for accordion headers'
    ],
    testingGuidelines: [
      'Verify keyboard navigation with Enter/Space',
      'Check aria-expanded state changes',
      'Test with screen reader announcement',
      'Validate heading hierarchy',
      'Ensure panel is correctly hidden/shown'
    ],
    apgUrl: 'https://www.w3.org/WAI/ARIA/apg/patterns/accordion/'
  },

  'alert-dialog': {
    name: 'Alert Dialog (Modal)',
    description: 'Interrupts user workflow to communicate important information and acquire a response',
    category: 'widget',
    wcagCriteria: ['2.1.2', '4.1.2', '2.4.3'],
    roles: {
      primary: 'alertdialog',
      related: ['dialog']
    },
    ariaAttributes: [
      {
        name: 'aria-labelledby',
        required: true,
        description: 'References the dialog title element'
      },
      {
        name: 'aria-describedby',
        required: false,
        description: 'References the element containing dialog description'
      },
      {
        name: 'aria-modal',
        required: true,
        description: 'Indicates the dialog is modal',
        possibleValues: ['true']
      }
    ],
    keyboardInteractions: [
      { key: 'Tab', action: 'Move focus to next focusable element within dialog', required: true },
      { key: 'Shift + Tab', action: 'Move focus to previous focusable element within dialog', required: true },
      { key: 'Escape', action: 'Close dialog', required: true }
    ],
    htmlExample: `<!-- Alert Dialog Example -->
<div role="alertdialog"
     aria-labelledby="dialog-title"
     aria-describedby="dialog-desc"
     aria-modal="true"
     class="modal">
  <h2 id="dialog-title">Confirm Delete</h2>
  <p id="dialog-desc">
    Are you sure you want to delete this item? This action cannot be undone.
  </p>
  <div class="dialog-actions">
    <button type="button" onclick="confirmDelete()">Delete</button>
    <button type="button" onclick="closeDialog()">Cancel</button>
  </div>
</div>`,
    javascriptExample: `// Alert dialog focus management
function openAlertDialog() {
  dialog.removeAttribute('hidden');
  previousFocus = document.activeElement;
  dialog.querySelector('button').focus();
  trapFocus(dialog);
}

function closeDialog() {
  dialog.setAttribute('hidden', '');
  previousFocus.focus();
}

// Trap focus within dialog
function trapFocus(element) {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  element.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      } else if (!e.shiftKey && document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
    if (e.key === 'Escape') {
      closeDialog();
    }
  });
}`,
    commonMistakes: [
      'No focus trap - focus escapes to background',
      'Missing Escape key handler',
      'Not returning focus to trigger element after close',
      'Background content still interactive',
      'Missing aria-modal="true"',
      'Alert announced but focus not moved to dialog'
    ],
    testingGuidelines: [
      'Verify focus moves to dialog on open',
      'Test Tab wraps within dialog (focus trap)',
      'Verify Escape closes dialog',
      'Check focus returns to trigger after close',
      'Test screen reader announces alert content',
      'Ensure background is inert (not interactive)'
    ],
    apgUrl: 'https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/'
  },

  'button': {
    name: 'Button',
    description: 'Triggers an action or event when activated',
    category: 'widget',
    wcagCriteria: ['2.1.1', '4.1.2'],
    roles: {
      primary: 'button',
      related: []
    },
    ariaAttributes: [
      {
        name: 'aria-pressed',
        required: false,
        description: 'For toggle buttons, indicates pressed state',
        possibleValues: ['true', 'false', 'mixed']
      },
      {
        name: 'aria-expanded',
        required: false,
        description: 'For buttons controlling expandable regions',
        possibleValues: ['true', 'false']
      },
      {
        name: 'aria-label',
        required: false,
        description: 'Accessible name when button has no visible text'
      },
      {
        name: 'aria-labelledby',
        required: false,
        description: 'References visible label elements'
      }
    ],
    keyboardInteractions: [
      { key: 'Enter', action: 'Activate button', required: true },
      { key: 'Space', action: 'Activate button', required: true }
    ],
    htmlExample: `<!-- Standard Button -->
<button type="button">Click Me</button>

<!-- Icon Button -->
<button type="button" aria-label="Close navigation menu">
  <svg aria-hidden="true">
    <use xlink:href="#icon-close"/>
  </svg>
</button>

<!-- Toggle Button -->
<button type="button"
        aria-pressed="false"
        onclick="toggleMute()">
  Mute
</button>

<!-- Expand/Collapse Button -->
<button type="button"
        aria-expanded="false"
        aria-controls="section-1">
  Show Details
</button>`,
    cssExample: `/* Ensure buttons have visible focus indicator */
button:focus {
  outline: 2px solid #005fcc;
  outline-offset: 2px;
}

/* Show pressed state visually */
button[aria-pressed="true"] {
  background-color: #0056b3;
  color: white;
}`,
    commonMistakes: [
      'Using <div> or <a> instead of <button>',
      'Icon buttons without aria-label',
      'Missing keyboard support (click-only)',
      'No visible focus indicator',
      'Toggle buttons without aria-pressed',
      'Disabled buttons with opacity but still focusable'
    ],
    testingGuidelines: [
      'Verify activation with Enter and Space',
      'Check visible focus indicator',
      'Test screen reader announces role and name',
      'For toggle buttons, verify aria-pressed changes',
      'Ensure disabled state is properly conveyed',
      'Test touch target size (min 44x44 px)'
    ],
    apgUrl: 'https://www.w3.org/WAI/ARIA/apg/patterns/button/'
  },

  'breadcrumb': {
    name: 'Breadcrumb',
    description: 'Provides navigation showing the user\'s location in a hierarchical structure',
    category: 'landmark',
    wcagCriteria: ['2.4.8', '1.3.1'],
    roles: {
      primary: 'navigation',
      related: []
    },
    ariaAttributes: [
      {
        name: 'aria-label',
        required: true,
        description: 'Labels the navigation as breadcrumb',
        defaultValue: 'Breadcrumb'
      },
      {
        name: 'aria-current',
        required: true,
        description: 'Indicates current page in breadcrumb',
        possibleValues: ['page']
      }
    ],
    keyboardInteractions: [
      { key: 'Tab', action: 'Navigate between breadcrumb links', required: true }
    ],
    htmlExample: `<!-- Breadcrumb Navigation -->
<nav aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Home</a></li>
    <li><a href="/products">Products</a></li>
    <li><a href="/products/electronics">Electronics</a></li>
    <li>
      <a href="/products/electronics/laptops" aria-current="page">
        Laptops
      </a>
    </li>
  </ol>
</nav>`,
    cssExample: `/* Breadcrumb styling */
nav[aria-label="Breadcrumb"] ol {
  list-style: none;
  display: flex;
  gap: 0.5rem;
}

nav[aria-label="Breadcrumb"] li:not(:last-child)::after {
  content: "/";
  margin-left: 0.5rem;
  color: #666;
}

nav[aria-label="Breadcrumb"] [aria-current="page"] {
  color: #333;
  font-weight: 600;
  text-decoration: none;
}`,
    commonMistakes: [
      'Using <div> instead of <nav>',
      'Missing aria-label="Breadcrumb"',
      'No aria-current on current page',
      'Not using <ol> for proper hierarchy',
      'Making current page not focusable',
      'Visual separators not hidden from screen readers'
    ],
    testingGuidelines: [
      'Verify screen reader announces "Breadcrumb navigation"',
      'Check aria-current="page" on current item',
      'Test list structure is conveyed',
      'Ensure separators are decorative only',
      'Verify keyboard navigation works'
    ],
    apgUrl: 'https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/'
  },

  'combobox': {
    name: 'Combobox (Autocomplete)',
    description: 'Input with popup list of suggested values',
    category: 'composite',
    wcagCriteria: ['2.1.1', '4.1.2', '3.2.2'],
    roles: {
      primary: 'combobox',
      related: ['listbox', 'option']
    },
    ariaAttributes: [
      {
        name: 'aria-expanded',
        required: true,
        description: 'Indicates if popup is displayed',
        possibleValues: ['true', 'false']
      },
      {
        name: 'aria-controls',
        required: true,
        description: 'Identifies the popup element'
      },
      {
        name: 'aria-autocomplete',
        required: true,
        description: 'Type of autocomplete',
        possibleValues: ['list', 'both', 'inline', 'none']
      },
      {
        name: 'aria-activedescendant',
        required: false,
        description: 'ID of the currently highlighted option'
      }
    ],
    keyboardInteractions: [
      { key: 'Down Arrow', action: 'Open popup or move to next option', required: true },
      { key: 'Up Arrow', action: 'Move to previous option', required: true },
      { key: 'Enter', action: 'Select highlighted option', required: true },
      { key: 'Escape', action: 'Close popup without selection', required: true },
      { key: 'Alt + Down Arrow', action: 'Open popup', required: false }
    ],
    htmlExample: `<!-- Combobox with Autocomplete -->
<label for="country-input">Country</label>
<input type="text"
       id="country-input"
       role="combobox"
       aria-expanded="false"
       aria-autocomplete="list"
       aria-controls="country-listbox"
       aria-activedescendant="">

<ul id="country-listbox"
    role="listbox"
    hidden>
  <li role="option" id="option-1">United States</li>
  <li role="option" id="option-2">United Kingdom</li>
  <li role="option" id="option-3">Canada</li>
</ul>`,
    javascriptExample: `// Combobox functionality
const input = document.getElementById('country-input');
const listbox = document.getElementById('country-listbox');
let currentOption = -1;

input.addEventListener('input', () => {
  const value = input.value.toLowerCase();
  const options = filterOptions(value);

  if (options.length > 0) {
    input.setAttribute('aria-expanded', 'true');
    listbox.hidden = false;
    renderOptions(options);
  } else {
    input.setAttribute('aria-expanded', 'false');
    listbox.hidden = true;
  }
});

input.addEventListener('keydown', (e) => {
  const options = listbox.querySelectorAll('[role="option"]');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    currentOption = Math.min(currentOption + 1, options.length - 1);
    highlightOption(options[currentOption]);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    currentOption = Math.max(currentOption - 1, 0);
    highlightOption(options[currentOption]);
  } else if (e.key === 'Enter' && currentOption >= 0) {
    e.preventDefault();
    selectOption(options[currentOption]);
  } else if (e.key === 'Escape') {
    closeListbox();
  }
});

function highlightOption(option) {
  input.setAttribute('aria-activedescendant', option.id);
  option.scrollIntoView({ block: 'nearest' });
}`,
    commonMistakes: [
      'Missing aria-expanded state management',
      'Not using aria-activedescendant for highlighted option',
      'Popup not dismissed on Escape',
      'No keyboard navigation for options',
      'Selected value not announced to screen readers',
      'Focus trapped in popup'
    ],
    testingGuidelines: [
      'Verify arrow keys navigate options',
      'Check Enter selects highlighted option',
      'Test Escape closes popup',
      'Verify screen reader announces options',
      'Test aria-activedescendant updates',
      'Check popup opens/closes correctly'
    ],
    apgUrl: 'https://www.w3.org/WAI/ARIA/apg/patterns/combobox/'
  },

  'tabs': {
    name: 'Tabs',
    description: 'Set of layered sections of content (tab panels) displayed one at a time',
    category: 'composite',
    wcagCriteria: ['2.1.1', '4.1.2', '1.3.1'],
    roles: {
      primary: 'tablist',
      related: ['tab', 'tabpanel']
    },
    ariaAttributes: [
      {
        name: 'aria-selected',
        required: true,
        description: 'Indicates selected tab',
        possibleValues: ['true', 'false']
      },
      {
        name: 'aria-controls',
        required: true,
        description: 'Identifies the associated tabpanel'
      },
      {
        name: 'aria-labelledby',
        required: true,
        description: 'On tabpanel, references the controlling tab'
      }
    ],
    keyboardInteractions: [
      { key: 'Tab', action: 'Move focus into/out of tab list', required: true },
      { key: 'Left Arrow', action: 'Move to previous tab', required: true },
      { key: 'Right Arrow', action: 'Move to next tab', required: true },
      { key: 'Home', action: 'Move to first tab', required: false },
      { key: 'End', action: 'Move to last tab', required: false }
    ],
    htmlExample: `<!-- Tabs Example -->
<div class="tabs">
  <div role="tablist" aria-label="Account Settings">
    <button role="tab"
            aria-selected="true"
            aria-controls="profile-panel"
            id="profile-tab">
      Profile
    </button>
    <button role="tab"
            aria-selected="false"
            aria-controls="security-panel"
            id="security-tab"
            tabindex="-1">
      Security
    </button>
    <button role="tab"
            aria-selected="false"
            aria-controls="billing-panel"
            id="billing-tab"
            tabindex="-1">
      Billing
    </button>
  </div>

  <div role="tabpanel"
       id="profile-panel"
       aria-labelledby="profile-tab">
    <h2>Profile Settings</h2>
    <p>Manage your profile information...</p>
  </div>

  <div role="tabpanel"
       id="security-panel"
       aria-labelledby="security-tab"
       hidden>
    <h2>Security Settings</h2>
    <p>Manage your security preferences...</p>
  </div>

  <div role="tabpanel"
       id="billing-panel"
       aria-labelledby="billing-tab"
       hidden>
    <h2>Billing Settings</h2>
    <p>Manage your billing information...</p>
  </div>
</div>`,
    javascriptExample: `// Tabs keyboard navigation
const tablist = document.querySelector('[role="tablist"]');
const tabs = tablist.querySelectorAll('[role="tab"]');

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => {
    activateTab(tab);
  });

  tab.addEventListener('keydown', (e) => {
    let newIndex;

    if (e.key === 'ArrowRight') {
      newIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      newIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      newIndex = 0;
    } else if (e.key === 'End') {
      newIndex = tabs.length - 1;
    }

    if (newIndex !== undefined) {
      e.preventDefault();
      tabs[newIndex].focus();
      activateTab(tabs[newIndex]);
    }
  });
});

function activateTab(newTab) {
  tabs.forEach(tab => {
    tab.setAttribute('aria-selected', 'false');
    tab.setAttribute('tabindex', '-1');
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    panel.hidden = true;
  });

  newTab.setAttribute('aria-selected', 'true');
  newTab.removeAttribute('tabindex');
  const panel = document.getElementById(newTab.getAttribute('aria-controls'));
  panel.hidden = false;
}`,
    commonMistakes: [
      'Using links (<a>) instead of buttons for tabs',
      'Missing aria-selected on tabs',
      'No arrow key navigation',
      'All tabs focusable (should use tabindex=-1 for inactive tabs)',
      'Missing aria-controls/aria-labelledby relationship',
      'Not hiding inactive panels properly'
    ],
    testingGuidelines: [
      'Verify arrow keys switch between tabs',
      'Check only active tab is in tab order',
      'Test Home/End keys work',
      'Verify aria-selected updates',
      'Check screen reader announces tab selection',
      'Ensure inactive panels are hidden from AT'
    ],
    apgUrl: 'https://www.w3.org/WAI/ARIA/apg/patterns/tabpanel/'
  },

  'menu': {
    name: 'Menu / Menubar',
    description: 'List of actions or functions presented as clickable items',
    category: 'composite',
    wcagCriteria: ['2.1.1', '4.1.2'],
    roles: {
      primary: 'menu',
      related: ['menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio']
    },
    ariaAttributes: [
      {
        name: 'aria-haspopup',
        required: false,
        description: 'Indicates menuitem has submenu',
        possibleValues: ['menu', 'true']
      },
      {
        name: 'aria-expanded',
        required: false,
        description: 'For items with submenus, indicates if open',
        possibleValues: ['true', 'false']
      },
      {
        name: 'aria-checked',
        required: false,
        description: 'For menuitemcheckbox/menuitemradio',
        possibleValues: ['true', 'false', 'mixed']
      }
    ],
    keyboardInteractions: [
      { key: 'Enter or Space', action: 'Activate menuitem', required: true },
      { key: 'Down Arrow', action: 'Move to next item', required: true },
      { key: 'Up Arrow', action: 'Move to previous item', required: true },
      { key: 'Home', action: 'Move to first item', required: false },
      { key: 'End', action: 'Move to last item', required: false },
      { key: 'Escape', action: 'Close menu', required: true },
      { key: 'Right Arrow', action: 'Open submenu (horizontal menubar)', required: false },
      { key: 'Left Arrow', action: 'Close submenu (horizontal menubar)', required: false }
    ],
    htmlExample: `<!-- Dropdown Menu Example -->
<nav>
  <button type="button"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-controls="file-menu">
    File
  </button>

  <ul id="file-menu"
      role="menu"
      hidden>
    <li role="none">
      <button role="menuitem" onclick="newFile()">
        New
      </button>
    </li>
    <li role="none">
      <button role="menuitem" onclick="openFile()">
        Open
      </button>
    </li>
    <li role="separator"></li>
    <li role="none">
      <button role="menuitem" onclick="saveFile()">
        Save
      </button>
    </li>
  </ul>
</nav>`,
    commonMistakes: [
      'Using <a> links for menu items (should be buttons)',
      'Missing keyboard navigation',
      'Menu doesn\'t close on Escape',
      'Focus not managed when opening/closing',
      'Submenus not properly nested',
      'Using <select> for navigation menus'
    ],
    testingGuidelines: [
      'Verify arrow keys navigate items',
      'Check Enter/Space activates items',
      'Test Escape closes menu',
      'Verify focus management',
      'Test submenu keyboard interaction',
      'Check screen reader announcements'
    ],
    apgUrl: 'https://www.w3.org/WAI/ARIA/apg/patterns/menubar/'
  },

  'dialog': {
    name: 'Dialog (Modal)',
    description: 'Window overlaid on primary window, blocking interaction with underlying content',
    category: 'widget',
    wcagCriteria: ['2.1.2', '4.1.2', '2.4.3'],
    roles: {
      primary: 'dialog',
      related: ['alertdialog']
    },
    ariaAttributes: [
      {
        name: 'aria-labelledby',
        required: true,
        description: 'References dialog title'
      },
      {
        name: 'aria-describedby',
        required: false,
        description: 'References dialog description'
      },
      {
        name: 'aria-modal',
        required: true,
        description: 'Indicates dialog is modal',
        possibleValues: ['true']
      }
    ],
    keyboardInteractions: [
      { key: 'Tab', action: 'Move focus within dialog (trapped)', required: true },
      { key: 'Escape', action: 'Close dialog', required: true }
    ],
    htmlExample: `<!-- Modal Dialog -->
<div role="dialog"
     aria-labelledby="dialog-title"
     aria-modal="true">
  <h2 id="dialog-title">Settings</h2>
  <form>
    <label for="username">Username:</label>
    <input type="text" id="username">

    <button type="submit">Save</button>
    <button type="button" onclick="closeDialog()">Cancel</button>
  </form>
</div>`,
    commonMistakes: [
      'No focus trap',
      'Missing Escape handler',
      'Focus not returned after close',
      'Background still interactive',
      'Missing aria-modal="true"'
    ],
    testingGuidelines: [
      'Verify focus moves to dialog',
      'Test Tab wraps within dialog',
      'Check Escape closes dialog',
      'Test focus returns correctly',
      'Verify background is inert'
    ],
    apgUrl: 'https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/'
  },

  'slider': {
    name: 'Slider',
    description: 'Input where user selects value from within a range',
    category: 'widget',
    wcagCriteria: ['2.1.1', '4.1.2'],
    roles: {
      primary: 'slider',
      related: []
    },
    ariaAttributes: [
      {
        name: 'aria-valuemin',
        required: true,
        description: 'Minimum value'
      },
      {
        name: 'aria-valuemax',
        required: true,
        description: 'Maximum value'
      },
      {
        name: 'aria-valuenow',
        required: true,
        description: 'Current value'
      },
      {
        name: 'aria-valuetext',
        required: false,
        description: 'Human-readable value (e.g., "Low", "Medium", "High")'
      },
      {
        name: 'aria-label',
        required: true,
        description: 'Accessible name for slider'
      }
    ],
    keyboardInteractions: [
      { key: 'Right Arrow', action: 'Increase value', required: true },
      { key: 'Up Arrow', action: 'Increase value', required: true },
      { key: 'Left Arrow', action: 'Decrease value', required: true },
      { key: 'Down Arrow', action: 'Decrease value', required: true },
      { key: 'Home', action: 'Set to minimum', required: false },
      { key: 'End', action: 'Set to maximum', required: false },
      { key: 'Page Up', action: 'Increase by larger step', required: false },
      { key: 'Page Down', action: 'Decrease by larger step', required: false }
    ],
    htmlExample: `<!-- Slider Example -->
<label id="volume-label">Volume</label>
<div role="slider"
     aria-labelledby="volume-label"
     aria-valuemin="0"
     aria-valuemax="100"
     aria-valuenow="50"
     aria-valuetext="50 percent"
     tabindex="0">
  <div class="slider-track">
    <div class="slider-thumb" style="left: 50%;"></div>
  </div>
</div>`,
    javascriptExample: `// Slider keyboard interaction
const slider = document.querySelector('[role="slider"]');
let value = 50;

slider.addEventListener('keydown', (e) => {
  let newValue = value;

  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
    newValue = Math.min(value + 1, 100);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
    newValue = Math.max(value - 1, 0);
  } else if (e.key === 'Home') {
    newValue = 0;
  } else if (e.key === 'End') {
    newValue = 100;
  } else if (e.key === 'PageUp') {
    newValue = Math.min(value + 10, 100);
  } else if (e.key === 'PageDown') {
    newValue = Math.max(value - 10, 0);
  }

  if (newValue !== value) {
    e.preventDefault();
    updateSlider(newValue);
  }
});

function updateSlider(newValue) {
  value = newValue;
  slider.setAttribute('aria-valuenow', value);
  slider.setAttribute('aria-valuetext', value + ' percent');
  // Update visual position
  const thumb = slider.querySelector('.slider-thumb');
  thumb.style.left = value + '%';
}`,
    commonMistakes: [
      'Missing aria-valuemin/max/now',
      'No keyboard support',
      'aria-valuenow not updated',
      'Slider not focusable (missing tabindex)',
      'No visual feedback for value changes',
      'Using <input type="range"> without proper labeling'
    ],
    testingGuidelines: [
      'Verify arrow keys change value',
      'Check Home/End keys work',
      'Test screen reader announces values',
      'Verify aria-valuenow updates',
      'Check visual thumb position matches value',
      'Test with assistive technologies'
    ],
    apgUrl: 'https://www.w3.org/WAI/ARIA/apg/patterns/slider/'
  }
};

/**
 * Helper Functions
 */

/**
 * Get APG pattern by name
 */
export function getAPGPattern(patternName: string): APGPattern | undefined {
  return APG_PATTERNS[patternName.toLowerCase()];
}

/**
 * Find patterns by WCAG criterion
 */
export function getPatternsByWCAG(wcagCriterion: string): APGPattern[] {
  return Object.values(APG_PATTERNS).filter(pattern =>
    pattern.wcagCriteria.includes(wcagCriterion)
  );
}

/**
 * Find patterns by role
 */
export function getPatternsByRole(role: string): APGPattern[] {
  return Object.values(APG_PATTERNS).filter(pattern =>
    pattern.roles.primary === role ||
    (pattern.roles.related && pattern.roles.related.includes(role))
  );
}

/**
 * Get all patterns by category
 */
export function getPatternsByCategory(category: APGPattern['category']): APGPattern[] {
  return Object.values(APG_PATTERNS).filter(pattern =>
    pattern.category === category
  );
}

/**
 * Suggest APG pattern based on element analysis
 *
 * @param elementContext - Context about the element (role, attributes, etc.)
 * @returns Recommended APG pattern with confidence score
 */
export function suggestAPGPattern(elementContext: {
  role?: string;
  tagName?: string;
  attributes?: Record<string, string>;
  context?: string;
}): { pattern: APGPattern; confidence: number; reason: string } | null {

  // Direct role match
  if (elementContext.role) {
    const patterns = getPatternsByRole(elementContext.role);
    if (patterns.length > 0) {
      return {
        pattern: patterns[0],
        confidence: 0.95,
        reason: `Element has role="${elementContext.role}" matching APG pattern`
      };
    }
  }

  // Heuristic matching based on attributes and context
  const hasAriaExpanded = elementContext.attributes?.['aria-expanded'];
  const hasAriaControls = elementContext.attributes?.['aria-controls'];
  const hasAriaPressed = elementContext.attributes?.['aria-pressed'];
  const context = (elementContext.context || '').toLowerCase();

  // Accordion pattern detection
  if (hasAriaExpanded && hasAriaControls && context.includes('header')) {
    return {
      pattern: APG_PATTERNS.accordion,
      confidence: 0.85,
      reason: 'Element has aria-expanded and aria-controls within heading context'
    };
  }

  // Dialog pattern detection
  if (context.includes('modal') || context.includes('dialog')) {
    return {
      pattern: APG_PATTERNS.dialog,
      confidence: 0.80,
      reason: 'Element context suggests dialog/modal pattern'
    };
  }

  // Toggle button pattern
  if (hasAriaPressed && elementContext.tagName === 'button') {
    return {
      pattern: APG_PATTERNS.button,
      confidence: 0.90,
      reason: 'Button element with aria-pressed indicates toggle button pattern'
    };
  }

  // Tabs pattern detection
  if (context.includes('tab') && hasAriaControls) {
    return {
      pattern: APG_PATTERNS.tabs,
      confidence: 0.85,
      reason: 'Element has tab-related context with aria-controls'
    };
  }

  return null;
}

/**
 * Generate code example for a specific pattern
 */
export function generatePatternCodeExample(
  patternName: string,
  options: {
    includeJavaScript?: boolean;
    includeCSS?: boolean;
    customLabel?: string;
  } = {}
): string {
  const pattern = getAPGPattern(patternName);
  if (!pattern) {
    return '';
  }

  let example = `<!-- ${pattern.name} Pattern -->\n`;
  example += `<!-- Reference: ${pattern.apgUrl} -->\n\n`;
  example += pattern.htmlExample;

  if (options.includeJavaScript && pattern.javascriptExample) {
    example += '\n\n<script>\n' + pattern.javascriptExample + '\n</script>';
  }

  if (options.includeCSS && pattern.cssExample) {
    example += '\n\n<style>\n' + pattern.cssExample + '\n</style>';
  }

  return example;
}

/**
 * Get keyboard shortcuts reference for a pattern
 */
export function getKeyboardReference(patternName: string): string {
  const pattern = getAPGPattern(patternName);
  if (!pattern) {
    return '';
  }

  let reference = `Keyboard Shortcuts for ${pattern.name}:\n\n`;

  pattern.keyboardInteractions.forEach(interaction => {
    const badge = interaction.required ? '[REQUIRED]' : '[OPTIONAL]';
    reference += `${badge} ${interaction.key}: ${interaction.action}\n`;
  });

  return reference;
}

/**
 * Validate element against APG pattern requirements
 */
export function validateAgainstPattern(
  patternName: string,
  element: {
    role?: string;
    attributes: Record<string, string>;
  }
): {
  valid: boolean;
  missingAttributes: string[];
  incorrectValues: Array<{ attribute: string; expected: string; actual: string }>;
} {
  const pattern = getAPGPattern(patternName);
  if (!pattern) {
    return { valid: false, missingAttributes: [], incorrectValues: [] };
  }

  const missingAttributes: string[] = [];
  const incorrectValues: Array<{ attribute: string; expected: string; actual: string }> = [];

  // Check required ARIA attributes
  pattern.ariaAttributes
    .filter(attr => attr.required)
    .forEach(attr => {
      if (!element.attributes[attr.name]) {
        missingAttributes.push(attr.name);
      } else if (attr.possibleValues) {
        const actualValue = element.attributes[attr.name];
        if (!attr.possibleValues.includes(actualValue)) {
          incorrectValues.push({
            attribute: attr.name,
            expected: attr.possibleValues.join(' | '),
            actual: actualValue
          });
        }
      }
    });

  const valid = missingAttributes.length === 0 && incorrectValues.length === 0;

  return { valid, missingAttributes, incorrectValues };
}
