/**
 * App Component
 *
 * Root component for the Agentic QE web dashboard.
 *
 * @module edge/webapp/App
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';

// Simple placeholder Dashboard for testing
const SimpleDashboard: React.FC = () => (
  <div style={{
    minHeight: '100vh',
    backgroundColor: '#111827',
    color: 'white',
    padding: '2rem'
  }}>
    <header style={{
      padding: '1rem',
      borderBottom: '1px solid #374151',
      marginBottom: '2rem'
    }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Agentic QE Dashboard</h1>
      <p style={{ color: '#9ca3af' }}>P2P Web Application</p>
    </header>
    <main>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem'
      }}>
        <div style={{
          backgroundColor: '#1f2937',
          padding: '1rem',
          borderRadius: '0.5rem',
          border: '1px solid #374151'
        }}>
          <h2 style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Connection</h2>
          <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#4ade80' }}>Connected</p>
        </div>
        <div style={{
          backgroundColor: '#1f2937',
          padding: '1rem',
          borderRadius: '0.5rem',
          border: '1px solid #374151'
        }}>
          <h2 style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Peers</h2>
          <p style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>0</p>
        </div>
        <div style={{
          backgroundColor: '#1f2937',
          padding: '1rem',
          borderRadius: '0.5rem',
          border: '1px solid #374151'
        }}>
          <h2 style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Patterns</h2>
          <p style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>0</p>
        </div>
      </div>
    </main>
  </div>
);

// Lazy load Dashboard to isolate potential import errors
// Using the new dark-themed Dashboard with inline styles
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));

// ============================================
// Loading Component
// ============================================

const LoadingScreen: React.FC = () => (
  <div style={{
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    color: 'white'
  }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: '48px',
        height: '48px',
        border: '4px solid #374151',
        borderTopColor: '#3b82f6',
        borderRadius: '50%',
        margin: '0 auto',
        animation: 'spin 1s linear infinite'
      }} />
      <p style={{ marginTop: '1rem' }}>Loading dashboard...</p>
    </div>
    <style>{`
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

// ============================================
// Error Boundary
// ============================================

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('App error:', error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111827',
          color: 'white',
          padding: '2rem'
        }}>
          <div style={{
            backgroundColor: '#1f2937',
            borderRadius: '0.75rem',
            padding: '2rem',
            maxWidth: '400px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              Something went wrong
            </h2>
            <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================
// App Component
// ============================================

export const App: React.FC = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Small delay to ensure DOM is ready
    setIsReady(true);
  }, []);

  if (!isReady) {
    return <LoadingScreen />;
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        <Dashboard />
      </Suspense>
    </ErrorBoundary>
  );
};

export default App;
