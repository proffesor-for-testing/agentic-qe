import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';

// Get the root element
const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element not found');
}

// Create root and render
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Hot module replacement for development
if (import.meta.hot) {
  import.meta.hot.accept();
}
