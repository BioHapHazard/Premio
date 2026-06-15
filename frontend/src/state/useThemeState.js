import { useState, useEffect } from 'react';

// Owns the active UI theme. Initial value comes from localStorage; the effect
// applies it to the <html data-theme> attribute and persists it both globally
// and (when a profile is active) under a per-profile key. Takes activeProfileId
// because the theme is remembered per profile.
export function useThemeState(activeProfileId) {
  const [selectedTheme, setSelectedTheme] = useState(() => {
    return localStorage.getItem('premium_search_theme') || 'midnight-nebula';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', selectedTheme);
    localStorage.setItem('premium_search_theme', selectedTheme);
    if (activeProfileId) {
      localStorage.setItem(`premium_search_theme_${activeProfileId}`, selectedTheme);
    }
  }, [selectedTheme, activeProfileId]);

  return [selectedTheme, setSelectedTheme];
}
