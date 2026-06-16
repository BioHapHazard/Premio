import { useState, useEffect } from 'react';

// Owns the per-profile watchlist + its cache-checking flag, and reloads the list
// from localStorage whenever the active profile changes. Takes activeProfileId
// (sourced from the profiles domain in the provider).
//
// NOTE: the periodic watchlist cache-availability check stays in AppContent (it
// uses the credentialed fetch + notification helpers); it reads the list via context.
export function useWatchlistState(activeProfileId) {
  const [watchlist, setWatchlist] = useState([]);
  const [watchlistChecking, setWatchlistChecking] = useState(false);

  useEffect(() => {
    if (!activeProfileId) { setWatchlist([]); return; }
    try {
      const saved = localStorage.getItem(`premium_search_watchlist_${activeProfileId}`);
      setWatchlist(saved ? JSON.parse(saved) : []);
    } catch { setWatchlist([]); }
  }, [activeProfileId]);

  return { watchlist, setWatchlist, watchlistChecking, setWatchlistChecking };
}
