/**
 * DevTools Entry Point
 *
 * Creates the Agentic QE panel in Chrome DevTools
 */

// Create a panel in Chrome DevTools
chrome.devtools.panels.create(
  'Agentic QE',  // Panel title
  'icons/icon16.png',  // Icon path
  'panel.html',  // Panel HTML page
  function(panel) {
    console.log('[Agentic QE] DevTools panel created');

    // Panel shown callback
    panel.onShown.addListener(function(panelWindow) {
      console.log('[Agentic QE] Panel shown');
      // Initialize panel when shown
      if (panelWindow.initializePanel) {
        panelWindow.initializePanel();
      }
    });

    // Panel hidden callback
    panel.onHidden.addListener(function() {
      console.log('[Agentic QE] Panel hidden');
    });
  }
);
