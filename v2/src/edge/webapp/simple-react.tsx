import React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return (
    <div style={{ backgroundColor: '#111827', color: 'white', padding: '2rem', minHeight: '100vh' }}>
      <h1>Simple React App</h1>
      <p>React is working!</p>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
