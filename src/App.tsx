import React from 'react';
import { DashboardProvider } from './contexts/DashboardContext';
import { Dashboard } from './components/Dashboard/Dashboard';
import './App.css';

const App: React.FC = () => {
  return (
    <DashboardProvider>
      <Dashboard />
    </DashboardProvider>
  );
};

export default App;
