import { useState } from 'react';

// Owns the Continue Watching log (per-profile playback/reading/listening progress
// entries, strict-privacy filtered). Lives in the provider so its setter is
// available to the player progress hooks (useEbookReader, and the audio/video
// progress effects).
//
// NOTE: the cwArtSignature memo + cover-art fetch effect, removeFromContinueWatching,
// and the conflict-free cloud merge stay in AppContent — they depend on
// fetchMetadataBatch and other AppContent helpers. They read this state via context.
export function useContinueWatchingState() {
  const [continueWatchingList, setContinueWatchingList] = useState(() => {
    const saved = localStorage.getItem('premium_search_continue_watching');
    return saved ? JSON.parse(saved) : [];
  });

  return { continueWatchingList, setContinueWatchingList };
}
