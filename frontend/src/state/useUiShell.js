import { useState, useRef } from 'react';

// Owns the UI shell state: the active main tab + the library/continue sub-tab
// filters, the Settings panel toggle, the hide-adult content filter, and the
// developer-options unlock (logo-click ref + unlocked flag).
//
// NOTE: the hideAdult persistence effect (which also resets the search category)
// and the 5-click logo handler stay in AppContent — they touch the search domain;
// they read this state via context.
export function useUiShell() {
  const [activeTab, setActiveTab] = useState('search'); // search, library, progress, watchlist, cloud, transfers
  const [librarySubTab, setLibrarySubTab] = useState('All');
  const [continueSubTab, setContinueSubTab] = useState('All');
  const [showSettings, setShowSettings] = useState(false);
  const [hideAdult, setHideAdult] = useState(() => {
    const saved = localStorage.getItem('premium_search_hide_adult');
    return saved !== null ? JSON.parse(saved) : true; // Default to hiding adult for safety
  });
  const logoClicksRef = useRef([]);
  const [adultControlsUnlocked, setAdultControlsUnlocked] = useState(false);

  return {
    activeTab, setActiveTab,
    librarySubTab, setLibrarySubTab,
    continueSubTab, setContinueSubTab,
    showSettings, setShowSettings,
    hideAdult, setHideAdult,
    logoClicksRef,
    adultControlsUnlocked, setAdultControlsUnlocked,
  };
}
