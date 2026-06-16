import { createContext, useContext } from 'react';
import { useThemeState } from './useThemeState';
import { useRetroPlayer } from './useRetroPlayer';
import { useEbookReader } from './useEbookReader';
import { useAudioPlayer } from './useAudioPlayer';
import { useToast } from './useToast';
import { useProfilesState } from './useProfilesState';
import { useSettingsState } from './useSettingsState';
import { useMetadataState } from './useMetadataState';
import { useContinueWatchingState } from './useContinueWatchingState';
import { useLibraryState } from './useLibraryState';
import { useWatchlistState } from './useWatchlistState';
import { usePlaylistsState } from './usePlaylistsState';
import { useSearchState } from './useSearchState';
import { useVideoPlayer } from './useVideoPlayer';
import { useCloudState } from './useCloudState';
import { useAccountState } from './useAccountState';
import { useAiState } from './useAiState';
import { useUiShell } from './useUiShell';
import { useCloudSyncState } from './useCloudSyncState';

// Central app-state context. AppStateProvider composes all 16 domain hooks and
// exposes their values flattened on one context value; AppContent and the extracted
// panel/overlay components read what they need via useAppState().
const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  // Spreading produces a fresh value object per provider render, so consumers
  // re-render whenever any domain's state changes — same cadence as the old
  // single-component App, just sourced from here now.
  const profiles = useProfilesState();
  const settings = useSettingsState();
  // Theme needs the active profile id (per-profile persistence); profiles is in
  // this provider, so it can be composed here.
  const [selectedTheme, setSelectedTheme] = useThemeState(profiles.activeProfileId);
  const toast = useToast();
  const retro = useRetroPlayer();
  const audio = useAudioPlayer();
  const metadata = useMetadataState();
  const continueWatching = useContinueWatchingState();
  // eBook progress writes to Continue Watching; CW is in the provider so its setter
  // is available, letting the reader hook compose here too.
  const ebook = useEbookReader({ setContinueWatchingList: continueWatching.setContinueWatchingList });
  const library = useLibraryState();
  const watchlist = useWatchlistState(profiles.activeProfileId);
  const playlists = usePlaylistsState();
  const search = useSearchState();
  const video = useVideoPlayer();
  const cloud = useCloudState();
  const account = useAccountState();
  const ai = useAiState();
  const ui = useUiShell();
  const cloudSync = useCloudSyncState();
  const value = { ...profiles, ...settings, selectedTheme, setSelectedTheme, ...toast, ...retro, ...audio, ...metadata, ...continueWatching, ...ebook, ...library, ...watchlist, ...playlists, ...search, ...video, ...cloud, ...account, ...ai, ...ui, ...cloudSync };
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
