import React from 'react';
import './App.css';
import EarthGlobe from './components/EarthGlobe';
import CSVTestPage from './components/CSVTestPage';

function App() {
  // Simple routing based on URL hash
  const currentPath = window.location.hash;

  if (currentPath === '#test-csv') {
    return (
      <div className="App">
        <CSVTestPage />
      </div>
    );
  }

  return (
    <div className="App">
      <EarthGlobe />
    </div>
  );
}

export default App;
