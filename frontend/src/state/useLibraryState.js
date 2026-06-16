import { useState } from 'react';

// Owns the library bookshelf list (per-profile, strict-privacy filtered).
//
// NOTE: the Library-tab cache-status check and the background metadata fetch
// effects stay in AppContent — they call checkLibraryCacheStatus /
// fetchMetadataBatch. They read this list via context.
export function useLibraryState() {
  const [libraryList, setLibraryList] = useState(() => {
    const saved = localStorage.getItem('premium_search_library');
    return saved ? JSON.parse(saved) : [];
  });

  return { libraryList, setLibraryList };
}
