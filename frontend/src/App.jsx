import { useState, useEffect, useRef, Fragment, useMemo } from 'react';
import Icon from './Icon';
import { PM_SIGNUP_URL, CATEGORIES, GRADIENTS, EMOJIS, COMMON_TRACKERS, RESULTS_BATCH } from './lib/constants';
import { keyActivate } from './lib/a11y';
import { hashHue, formatBytes, cleanUrl, extractQuality, matchEpisode, parseShowDetails } from './lib/format';
import { normalizeTitle, mergeTombstoneLists, mergeProgress } from './lib/progress';
import { filterResultsForKids, isRatingAllowed } from './lib/ratings';
import { convertSrtToVtt } from './lib/subtitles';
import { renderMarkdown } from './lib/markdown';
import { getEmulatorSystem } from './lib/emulator';
import { AppStateProvider, useAppState } from './state/AppStateProvider';
import RetroPlayerModal from './components/RetroPlayerModal';
import EbookReaderModal from './components/EbookReaderModal';
import AudioPlayerModal from './components/AudioPlayerModal';
import VideoPlayerModal from './components/VideoPlayerModal';
import DetailDrawer from './components/DetailDrawer';
import SettingsPanel from './components/SettingsPanel';
import CloudBrowserPanel from './components/CloudBrowserPanel';
import SearchPanel from './components/SearchPanel';
import LibraryPanel from './components/LibraryPanel';
import WatchlistPanel from './components/WatchlistPanel';
import ProgressPanel from './components/ProgressPanel';
import TransfersPanel from './components/TransfersPanel';
import PlaylistSelectorModal from './components/PlaylistSelectorModal';

export default function App() {
  return (
    <AppStateProvider>
      <AppContent />
    </AppStateProvider>
  );
}

function AppContent() {
  // --- UI shell --- (activeTab + sub-tabs, showSettings, hideAdult, dev-lock in
  // useUiShell via context; hideAdult persist effect + logo-click handler stay here)

  // --- Cloud Storage Manager --- (state in useCloudState via context; nav/rename/
  // delete/save/playlist-build handlers stay in AppContent and read it via context)

  // --- Storage Quota & Active Downloads --- (state in useAccountState via context;
  // account fetch + transfers poll stay in AppContent)

  // Root domains (profiles + settings) provided by AppStateProvider via context.
  // Profile lifecycle/switch logic + key onChange persistence stay in AppContent.
  const {
    // profiles
    profiles, setProfiles,
    activeProfileId, setActiveProfileId,
    isProfilePickerOpen, setIsProfilePickerOpen,
    isManagingProfiles, setIsManagingProfiles,
    isProfileDropdownOpen, setIsProfileDropdownOpen,
    editingProfile, setEditingProfile,
    editName, setEditName,
    editAvatar, setEditAvatar,
    editColor, setEditColor,
    editIsKids, setEditIsKids,
    editAllowedTrackers, setEditAllowedTrackers,
    customTrackerInput, setCustomTrackerInput,
    editMaxMovieRating, setEditMaxMovieRating,
    editMaxTvRating, setEditMaxTvRating,
    editBlockUnrated, setEditBlockUnrated,
    pinTargetProfile, setPinTargetProfile,
    pinInput, setPinInput,
    pinError, setPinError,
    editPin, setEditPin,
    editEnablePin, setEditEnablePin,
    pinTargetAction, setPinTargetAction,
    profileDropdownRef,
    activeProfile,
    isKids,
    // settings (BYOK keys + key-reveal + onboarding)
    showKeys, setShowKeys,
    showKeysPinPrompt, setShowKeysPinPrompt,
    revealPinInput, setRevealPinInput,
    revealPinError, setRevealPinError,
    userPmKey, setUserPmKey,
    userTmdbKey, setUserTmdbKey,
    userOmdbKey, setUserOmdbKey,
    userOpenSubsKey, setUserOpenSubsKey,
    userSubdlKey, setUserSubdlKey,
    userJackettUrl, setUserJackettUrl,
    userJackettKey, setUserJackettKey,
    userIndexers, setUserIndexers,
    showJackettGuide, setShowJackettGuide,
    newIdxName, setNewIdxName,
    newIdxUrl, setNewIdxUrl,
    newIdxKey, setNewIdxKey,
    showLegalDisclaimer, setShowLegalDisclaimer,
    showOnboarding, setShowOnboarding,
    onboardingStep, setOnboardingStep,
    keyTestStatus, setKeyTestStatus,
    // theme
    selectedTheme, setSelectedTheme,
    // toast
    toast, triggerToast,
    // retro player
    activeRetroTorrent, setActiveRetroTorrent,
    selectedRetroRomFile, setSelectedRetroRomFile,
    retroPlayableFiles, setRetroPlayableFiles,
    retroSearchQuery, setRetroSearchQuery,
    // audio player
    activeAudioTorrent, setActiveAudioTorrent,
    selectedAudioFile, setSelectedAudioFile,
    audioPlayableFiles, setAudioPlayableFiles,
    audioSearchQuery, setAudioSearchQuery,
    resumeAudioTime, setResumeAudioTime,
    // metadata (shared core)
    metadataCacheRef, metadataInFlightRef, metadataDrawerCloseRef,
    metadataResults, setMetadataResults,
    metadataDrawerItem, setMetadataDrawerItem,
    reviewsOpen, setReviewsOpen,
    reviewsLoading, setReviewsLoading,
    reviewsData, setReviewsData,
    reviewsError, setReviewsError,
    lbRating, setLbRating,
    lbReviewsOpen, setLbReviewsOpen,
    lbReviewsLoading, setLbReviewsLoading,
    lbReviewsData, setLbReviewsData,
    lbReviewsError, setLbReviewsError,
    // continue watching
    continueWatchingList, setContinueWatchingList,
    // ebook reader
    activeEbookTorrent, setActiveEbookTorrent,
    selectedEbookFile, setSelectedEbookFile,
    ebookPlayableFiles, setEbookPlayableFiles,
    ebookSearchQuery, setEbookSearchQuery,
    resumeEbookChapter, setResumeEbookChapter,
    resumeEbookScroll, setResumeEbookScroll,
    // library
    libraryList, setLibraryList,
    // watchlist
    watchlist, setWatchlist,
    watchlistChecking, setWatchlistChecking,
    // playlists
    playlists, setPlaylists,
    playlistSelectionTrack, setPlaylistSelectionTrack,
    showPlaylistChoiceModal, setShowPlaylistChoiceModal,
    pendingPlaylistFiles, setPendingPlaylistFiles,
    pendingPlaylistName, setPendingPlaylistName,
    hasAviOrMkvInPending, setHasAviOrMkvInPending,
    pendingItemId, setPendingItemId,
    pendingItemType, setPendingItemType,
    // search
    query, setQuery,
    category, setCategory,
    rawResults, setRawResults,
    loading, setLoading,
    searched, setSearched,
    searchError, setSearchError,
    visibleCount, setVisibleCount,
    loadMoreRef,
    activeDownloadId, setActiveDownloadId,
    searchMode, setSearchMode,
    hideUsenetWarning, setHideUsenetWarning,
    isDragging, setIsDragging,
    magnetInput, setMagnetInput,
    showFilters, setShowFilters,
    filterQuality, setFilterQuality,
    filterMaxSize, setFilterMaxSize,
    filterMinSeeders, setFilterMinSeeders,
    excludeKeywords, setExcludeKeywords,
    sortBy, setSortBy,
    recentSearches, setRecentSearches,
    recentDownloads, setRecentDownloads,
    // video player
    activePlayerTorrent, setActivePlayerTorrent,
    playerLoading, setPlayerLoading,
    playerFiles, setPlayerFiles,
    selectedVideoFile, setSelectedVideoFile,
    selectedSubtitleFile, setSelectedSubtitleFile,
    subtitleTrackUrl, setSubtitleTrackUrl,
    subSearchOpen, setSubSearchOpen,
    subSearchLoading, setSubSearchLoading,
    subSearchResults, setSubSearchResults,
    subSearchError, setSubSearchError,
    subSearchLang, setSubSearchLang,
    subDownloadingId, setSubDownloadingId,
    resumeTime, setResumeTime,
    autoplayDeclinedRef,
    introSegment, setIntroSegment,
    showSkipButton, setShowSkipButton,
    skipTimer, setSkipTimer,
    autoSkipEnabled, setAutoSkipEnabled,
    nextEpisodeFile, setNextEpisodeFile,
    showAutoplayOverlay, setShowAutoplayOverlay,
    autoplayCountdown, setAutoplayCountdown,
    autoplayTimerRef,
    // cloud storage manager
    cloudContents, setCloudContents,
    cloudFolderId, setCloudFolderId,
    cloudFolderName, setCloudFolderName,
    cloudBreadcrumbs, setCloudBreadcrumbs,
    cloudLoading, setCloudLoading,
    cloudError, setCloudError,
    cloudRenameId, setCloudRenameId,
    cloudRenameName, setCloudRenameName,
    cloudRenameType, setCloudRenameType,
    cloudFilter, setCloudFilter,
    cloudPlaylistLoading, setCloudPlaylistLoading,
    cloudPlaylistStatus, setCloudPlaylistStatus,
    // account / transfers
    accountInfo, setAccountInfo,
    transfers, setTransfers,
    transfersLoading, setTransfersLoading,
    // AI co-pilot
    aiEnabled, setAiEnabled,
    aiToken, setAiToken,
    aiModel, setAiModel,
    aiModelsList, setAiModelsList,
    fetchingModels, setFetchingModels,
    aiLoading, setAiLoading,
    aiTranslateLanguage, setAiTranslateLanguage,
    recapOpen, setRecapOpen,
    recapText, setRecapText,
    recapLoading, setRecapLoading,
    recapError, setRecapError,
    showAICurateInput, setShowAICurateInput,
    aiCuratePrompt, setAiCuratePrompt,
    showAICopilot, setShowAICopilot,
    copilotMessages, setCopilotMessages,
    copilotInput, setCopilotInput,
    // ui shell
    activeTab, setActiveTab,
    librarySubTab, setLibrarySubTab,
    continueSubTab, setContinueSubTab,
    showSettings, setShowSettings,
    hideAdult, setHideAdult,
    logoClicksRef,
    adultControlsUnlocked, setAdultControlsUnlocked,
    // cloud sync status
    isSyncing, setIsSyncing,
    lastSynced, setLastSynced,
  } = useAppState();

  // --- Search domain --- (state in useSearchState via context). The kids-filtered
  // `results` memo + the `setResults` alias stay here since they derive from profiles.
  const results = useMemo(() => {
    const activeProf = profiles.find(p => p.id === activeProfileId);
    return filterResultsForKids(rawResults, activeProf);
  }, [rawResults, activeProfileId, profiles]);
  const setResults = setRawResults;
  
  // (Settings panel toggle + hideAdult moved to useUiShell; cloud playlist build
  // status to useCloudState; playlist chooser-modal state to usePlaylistsState —
  // all via context)

  // --- Premiumize AI --- (state in useAiState via context; the AI network calls —
  // fetch models, recap, translate, curate, chat — are handlers in AppContent)

  // (Dev-lock state — logoClicksRef + adultControlsUnlocked — moved to useUiShell;
  // the 5-click handleLogoClick handler stays in AppContent)

  // (Dynamic filters + search history state moved to useSearchState — via context)

  // --- Library / Watchlist / Continue Watching / Playlists ---
  // State lives in the provider (useLibraryState, useWatchlistState(activeProfileId),
  // useContinueWatchingState, usePlaylistsState) and is read via useAppState above.
  // Their fetch/cache/cover-art effects + cloud merge stay in AppContent.

  // --- Cloud Sync --- (status isSyncing/lastSynced in useCloudSyncState via context;
  // the sync engine + autosave effect + autoSaveDataRef stay in AppContent below)

  // --- Stateless Custom Fetch Interceptor ---
  const fetchWithCredentials = async (url, options = {}) => {
    if (url.startsWith('/api')) {
      const customHeaders = {
        'X-Premiumize-Key': userPmKey || '',
        'X-TMDb-Key': userTmdbKey || '',
        'X-OMDb-Key': userOmdbKey || '',
        'X-OpenSubtitles-Key': userOpenSubsKey || '',
        'X-SubDL-Key': userSubdlKey || '',
        'X-Jackett-Url': userJackettUrl || '',
        'X-Jackett-Key': userJackettKey || '',
        'X-Usenet-Indexers': JSON.stringify(userIndexers || [])
      };
      
      options.headers = {
        ...(options.headers || {}),
        ...customHeaders
      };
    }
    return fetch(url, options);
  };

  // Toggle API-key visibility in Settings. Hiding is always allowed; revealing
  // requires the active profile's PIN (when one is set), so keys can't be copied
  // off a locked profile.
  const handleToggleShowKeys = () => {
    if (showKeys) { setShowKeys(false); return; }
    const activeProfile = profiles.find(p => p.id === activeProfileId);
    if (activeProfile && activeProfile.pin) {
      setRevealPinInput('');
      setRevealPinError(false);
      setShowKeysPinPrompt(true);
    } else {
      setShowKeys(true);
    }
  };

  // Validate a PIN entered to reveal keys.
  const submitRevealPin = (val) => {
    const activeProfile = profiles.find(p => p.id === activeProfileId);
    if (val === activeProfile?.pin) {
      setShowKeys(true);
      setShowKeysPinPrompt(false);
      setRevealPinInput('');
      setRevealPinError(false);
    } else {
      setRevealPinError(true);
      triggerToast('Incorrect PIN.', 'error');
      setTimeout(() => { setRevealPinInput(''); setRevealPinError(false); }, 600);
    }
  };

  // Onboarding: validate a key against its provider and record an inline result.
  const testKey = async (name, endpoint) => {
    setKeyTestStatus(s => ({ ...s, [name]: { state: 'testing', msg: 'Testing…' } }));
    try {
      const res = await fetchWithCredentials(endpoint);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === 'success') {
        setKeyTestStatus(s => ({ ...s, [name]: { state: 'ok', msg: data.message || 'Connected!' } }));
      } else {
        setKeyTestStatus(s => ({ ...s, [name]: { state: 'fail', msg: data.message || 'Key was rejected.' } }));
      }
    } catch {
      setKeyTestStatus(s => ({ ...s, [name]: { state: 'fail', msg: 'Network error — could not test.' } }));
    }
  };

  // Inline ✓/✗ result shown next to a "Test" button.
  const renderKeyTestResult = (name) => {
    const st = keyTestStatus[name];
    if (!st || st.state === 'testing') return null;
    return (
      <span style={{ fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', color: st.state === 'ok' ? '#4ade80' : '#f87171' }}>
        <Icon name={st.state === 'ok' ? 'check' : 'x'} size={13} /> {st.msg}
      </span>
    );
  };

  const syncProfilesToCloud = async (currentProfiles = profiles) => {
    try {
      const res = await fetchWithCredentials('/api/sync?filename=profiles_list.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentProfiles)
      });
      if (res.ok) {
        console.log('✅ Profiles list synced to cloud successfully.');
      }
    } catch (err) {
      console.error('❌ Syncing profiles to cloud failed:', err.message);
    }
  };

  const syncProfilesFromCloud = async () => {
    try {
      const res = await fetchWithCredentials('/api/sync?filename=profiles_list.json');
      if (!res.ok) throw new Error('Could not contact sync endpoint.');
      const data = await res.json();
      if (data.success && data.synced && data.data) {
        const cloudProfiles = data.data;
        setProfiles(cloudProfiles);
        localStorage.setItem('premium_search_profiles', JSON.stringify(cloudProfiles));
        
        // If there's an active profile, sync its data too
        const activeId = localStorage.getItem('premium_search_active_profile_id') || activeProfileId;
        if (activeId) {
          const profileExists = cloudProfiles.some(p => p.id === activeId);
          if (profileExists) {
            const activeProf = cloudProfiles.find(p => p.id === activeId);
            if (activeProf && activeProf.pin) {
              setActiveProfileId('');
              setIsProfilePickerOpen(true);
            } else {
              await syncProfileDataFromCloud(activeId);
            }
          } else {
            setActiveProfileId('');
            localStorage.removeItem('premium_search_active_profile_id');
            setIsProfilePickerOpen(true);
          }
        } else {
          setIsProfilePickerOpen(true);
        }
      } else {
        // If file doesn't exist, and we have local profiles, back them up
        if (profiles.length > 0) {
          await syncProfilesToCloud(profiles);
        }
      }
    } catch (err) {
      console.error('❌ Syncing profiles from cloud failed:', err.message);
    }
  };

  const syncProfileDataFromCloud = async (profileId) => {
    if (!profileId) return;
    setIsSyncing(true);
    try {
      const res = await fetchWithCredentials(`/api/sync?filename=profile_${profileId}_sync.json`);
      if (!res.ok) throw new Error('Could not contact sync endpoint.');
      const data = await res.json();
      
      if (data.success) {
        if (data.synced && data.data) {
          const cloudLib = data.data.libraryList || [];
          const cloudProgress = data.data.continueWatchingList || [];
          const cloudTombstones = data.data.removedProgress || [];
          const cloudPlaylists = data.data.playlists || [];
          const cloudTheme = data.data.selectedTheme || 'midnight-nebula';

          // Continue-Watching is MERGED, never overwritten — union local + cloud,
          // newest timestamp wins, deletions honored via tombstones. This stops a
          // peer/stale pull from wiping the movie you're actively watching.
          const localProgress = JSON.parse(localStorage.getItem(`premium_search_continue_watching_${profileId}`) || '[]');
          const mergedTombstones = mergeTombstoneLists(readTombstones(profileId), cloudTombstones);
          const mergedProgress = mergeProgress(localProgress, cloudProgress, mergedTombstones);
          localStorage.setItem(tombstoneKeyFor(profileId), JSON.stringify(mergedTombstones));

          // Save profile-specific local storage (library/playlists/theme keep
          // last-writer-wins; only Continue-Watching needed conflict-free merge).
          localStorage.setItem(`premium_search_library_${profileId}`, JSON.stringify(cloudLib));
          localStorage.setItem(`premium_search_continue_watching_${profileId}`, JSON.stringify(mergedProgress));
          localStorage.setItem(`premium_search_playlists_${profileId}`, JSON.stringify(cloudPlaylists));
          localStorage.setItem(`premium_search_theme_${profileId}`, cloudTheme);

          // If this is still the active profile, update states
          const currentActiveId = localStorage.getItem('premium_search_active_profile_id') || activeProfileId;
          if (profileId === currentActiveId) {
            setLibraryList(cloudLib);
            localStorage.setItem('premium_search_library', JSON.stringify(cloudLib));

            setContinueWatchingList(mergedProgress);
            localStorage.setItem('premium_search_continue_watching', JSON.stringify(mergedProgress));

            setPlaylists(cloudPlaylists);
            localStorage.setItem('premium_search_playlists', JSON.stringify(cloudPlaylists));

            setSelectedTheme(cloudTheme);
            localStorage.setItem('premium_search_theme', cloudTheme);

            setLastSynced(new Date());
            triggerToast('Cloud profile storage synchronized!', 'success');
          }

          // If our merge differs from the cloud (kept a movie the peer lacked, or
          // applied a deletion), push the converged result back so instances agree.
          // Idempotent — once everyone matches, this no-ops (no sync loop).
          const changed = JSON.stringify(mergedProgress) !== JSON.stringify(cloudProgress)
            || JSON.stringify(mergedTombstones) !== JSON.stringify(cloudTombstones);
          if (changed) {
            syncToCloud(cloudLib, mergedProgress, cloudPlaylists, cloudTheme, profileId);
          }
        } else {
          // If no cloud data found for this profile, upload current local state
          const localLib = localStorage.getItem(`premium_search_library_${profileId}`);
          const localCW = localStorage.getItem(`premium_search_continue_watching_${profileId}`);
          const localPL = localStorage.getItem(`premium_search_playlists_${profileId}`);
          const localTheme = localStorage.getItem(`premium_search_theme_${profileId}`) || 'midnight-nebula';
          
          const parsedLib = localLib ? JSON.parse(localLib) : [];
          const parsedCW = localCW ? JSON.parse(localCW) : [];
          const parsedPL = localPL ? JSON.parse(localPL) : [];
          
          if (parsedLib.length > 0 || parsedCW.length > 0 || parsedPL.length > 0) {
            console.log('ℹ️ Syncing local profile data up to cloud...');
            await syncToCloud(parsedLib, parsedCW, parsedPL, localTheme, profileId);
            triggerToast('Cloud profile sync backup created!', 'success');
          }
        }
      }
    } catch (err) {
      console.error('Profile sync error:', err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncToCloud = async (
    currentLib = libraryList,
    currentProgress = continueWatchingList,
    currentPlaylists = playlists,
    currentTheme = selectedTheme,
    targetProfileId = activeProfileId
  ) => {
    if (!targetProfileId) return;
    try {
      // Save locally to profile-specific keys as well
      localStorage.setItem(`premium_search_library_${targetProfileId}`, JSON.stringify(currentLib));
      localStorage.setItem(`premium_search_continue_watching_${targetProfileId}`, JSON.stringify(currentProgress));
      localStorage.setItem(`premium_search_playlists_${targetProfileId}`, JSON.stringify(currentPlaylists));
      localStorage.setItem(`premium_search_theme_${targetProfileId}`, currentTheme);
      
      // Also save to generic keys for compatibility
      localStorage.setItem('premium_search_library', JSON.stringify(currentLib));
      localStorage.setItem('premium_search_continue_watching', JSON.stringify(currentProgress));
      localStorage.setItem('premium_search_playlists', JSON.stringify(currentPlaylists));
      localStorage.setItem('premium_search_theme', currentTheme);

      const res = await fetchWithCredentials(`/api/sync?filename=profile_${targetProfileId}_sync.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          libraryList: currentLib,
          continueWatchingList: currentProgress,
          removedProgress: readTombstones(targetProfileId), // sync deletions so peers honor them
          playlists: currentPlaylists,
          selectedTheme: currentTheme
        })
      });
      if (res.ok) {
        setLastSynced(new Date());
      }
    } catch (err) {
      console.error('Cloud sync upload failed:', err.message);
    }
  };

  // Keep the latest library/progress in a ref so the periodic auto-save reads
  // current data without restarting its timer on every playback tick.
  const autoSaveDataRef = useRef({ lib: libraryList, cw: continueWatchingList });
  autoSaveDataRef.current = { lib: libraryList, cw: continueWatchingList };

  // Background auto-save: push Continue-Watching to the cloud every 2 minutes so
  // in-progress playback "sticks" and peer instances converge even mid-watch.
  useEffect(() => {
    if (!activeProfileId) return;
    const id = setInterval(() => {
      if (autoSaveDataRef.current.cw.length > 0) {
        syncToCloud(autoSaveDataRef.current.lib, autoSaveDataRef.current.cw);
      }
    }, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [activeProfileId]);

  const syncFromCloud = async () => {
    setIsSyncing(true);
    try {
      await syncProfilesFromCloud();
    } catch (err) {
      console.error('Sync error:', err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Profile Switching & Management Handlers ---
  const switchProfile = (profileId) => {
    setActiveProfileId(profileId);
    localStorage.setItem('premium_search_active_profile_id', profileId);
    
    // Load local storage values for this profile
    const profileLib = localStorage.getItem(`premium_search_library_${profileId}`);
    const parsedLib = profileLib ? JSON.parse(profileLib) : [];
    setLibraryList(parsedLib);
    localStorage.setItem('premium_search_library', JSON.stringify(parsedLib));
    
    const profileCW = localStorage.getItem(`premium_search_continue_watching_${profileId}`);
    const parsedCW = profileCW ? JSON.parse(profileCW) : [];
    setContinueWatchingList(parsedCW);
    localStorage.setItem('premium_search_continue_watching', JSON.stringify(parsedCW));
    
    const profilePL = localStorage.getItem(`premium_search_playlists_${profileId}`);
    const parsedPL = profilePL ? JSON.parse(profilePL) : [];
    setPlaylists(parsedPL);
    localStorage.setItem('premium_search_playlists', JSON.stringify(parsedPL));
    
    const profileTheme = localStorage.getItem(`premium_search_theme_${profileId}`) || 'midnight-nebula';
    setSelectedTheme(profileTheme);
    localStorage.setItem('premium_search_theme', profileTheme);
    
    // If it's a kids profile, disable developer options/unlocking controls and hide adult category
    const activeProf = profiles.find(p => p.id === profileId);
    if (activeProf && activeProf.isKids) {
      setAdultControlsUnlocked(false);
      setHideAdult(true);
      setCategory(prev => prev === 'Adult' ? 'Movies' : prev);
    }
    
    triggerToast(`Switched profile to ${activeProf ? activeProf.name : 'Unknown'}`, 'success');
    
    // Background cloud sync for this profile
    syncProfileDataFromCloud(profileId);
  };

  const handleProfileSelect = (profileId, action = 'switch') => {
    const p = profiles.find(prof => prof.id === profileId);
    if (!p) return;
    
    if (p.pin) {
      setPinTargetProfile(p);
      setPinTargetAction(action);
      setPinInput('');
      setPinError(false);
      setIsProfilePickerOpen(true);
    } else {
      if (action === 'edit') {
        startEditProfile(p);
      } else {
        switchProfile(p.id);
        setIsProfilePickerOpen(false);
      }
    }
  };

  const startEditProfile = (profile) => {
    setEditingProfile(profile);
    setEditName(profile.name);
    setEditAvatar(profile.avatar);
    setEditColor(profile.color);
    setEditIsKids(profile.isKids);
    setEditMaxMovieRating(profile.maxMovieRating || 'PG-13');
    setEditMaxTvRating(profile.maxTvRating || 'TV-14');
    setEditBlockUnrated(profile.blockUnrated || false);
    setEditPin(profile.pin || '');
    setEditEnablePin(!!profile.pin);
    
    // Parse allowed trackers
    const trackers = profile.allowedTrackers || [];
    // Separate common and custom trackers
    const commonSelected = trackers.filter(t => COMMON_TRACKERS.includes(t) || userIndexers.some(idx => idx.name === t));
    const customSelected = trackers.filter(t => !COMMON_TRACKERS.includes(t) && !userIndexers.some(idx => idx.name === t));
    
    setEditAllowedTrackers(commonSelected);
    setCustomTrackerInput(customSelected.join(', '));
  };

  const saveProfileHandler = () => {
    if (!editName.trim()) {
      triggerToast('Profile name cannot be empty.', 'error');
      return;
    }

    if (editEnablePin && !/^\d{4}$/.test(editPin)) {
      triggerToast('PIN must be exactly 4 numeric digits.', 'error');
      return;
    }
    
    // Parse custom trackers from comma-separated input
    const customTrackers = customTrackerInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
      
    const finalAllowedTrackers = [...editAllowedTrackers, ...customTrackers];
    
    let updatedProfiles;
    if (editingProfile.id === 'new') {
      const newProfile = {
        id: 'profile-' + Math.random().toString(36).substring(2, 9),
        name: editName.trim(),
        avatar: editAvatar,
        color: editColor,
        isKids: editIsKids,
        allowedTrackers: finalAllowedTrackers,
        maxMovieRating: editMaxMovieRating,
        maxTvRating: editMaxTvRating,
        blockUnrated: editBlockUnrated,
        pin: editEnablePin ? editPin : null
      };
      updatedProfiles = [...profiles, newProfile];
      triggerToast(`Created profile: ${newProfile.name}!`, 'success');
      
      // Initialize local storage empty values for this profile
      localStorage.setItem(`premium_search_library_${newProfile.id}`, '[]');
      localStorage.setItem(`premium_search_continue_watching_${newProfile.id}`, '[]');
      localStorage.setItem(`premium_search_playlists_${newProfile.id}`, '[]');
      localStorage.setItem(`premium_search_theme_${newProfile.id}`, 'midnight-nebula');
    } else {
      updatedProfiles = profiles.map(p => {
        if (p.id === editingProfile.id) {
          return {
            ...p,
            name: editName.trim(),
            avatar: editAvatar,
            color: editColor,
            isKids: editIsKids,
            allowedTrackers: finalAllowedTrackers,
            maxMovieRating: editMaxMovieRating,
            maxTvRating: editMaxTvRating,
            blockUnrated: editBlockUnrated,
            pin: editEnablePin ? editPin : null
          };
        }
        return p;
      });
      triggerToast(`Updated profile: ${editName.trim()}!`, 'success');
    }
    
    setProfiles(updatedProfiles);
    localStorage.setItem('premium_search_profiles', JSON.stringify(updatedProfiles));
    setEditingProfile(null);
    
    if (editingProfile.id === activeProfileId) {
      if (editIsKids) {
        setAdultControlsUnlocked(false);
        setHideAdult(true);
        setCategory(prev => prev === 'Adult' ? 'Movies' : prev);
      }
    }
    
    // Sync profiles list to cloud
    syncProfilesToCloud(updatedProfiles);
  };

  const deleteProfileHandler = (profileId) => {
    const updatedProfiles = profiles.filter(p => p.id !== profileId);
    setProfiles(updatedProfiles);
    localStorage.setItem('premium_search_profiles', JSON.stringify(updatedProfiles));
    setEditingProfile(null);
    
    // Clean local storage entries for this deleted profile
    localStorage.removeItem(`premium_search_library_${profileId}`);
    localStorage.removeItem(`premium_search_continue_watching_${profileId}`);
    localStorage.removeItem(`premium_search_playlists_${profileId}`);
    localStorage.removeItem(`premium_search_theme_${profileId}`);
    
    // If the active profile was deleted, clear active profile
    if (activeProfileId === profileId) {
      setActiveProfileId('');
      localStorage.removeItem('premium_search_active_profile_id');
      setIsProfilePickerOpen(true);
    }
    
    // Sync profiles list to cloud
    syncProfilesToCloud(updatedProfiles);
  };

  // --- Profile Lifecycle & Migration Hook ---
  useEffect(() => {
    // 1. Perform migration if no profiles list exists
    const storedProfiles = localStorage.getItem('premium_search_profiles');
    let currentProfiles = storedProfiles ? JSON.parse(storedProfiles) : [];
    
    if (currentProfiles.length === 0) {
      // Perform migration of existing non-profile lists to a default "Owner" profile
      const defaultProfile = {
        id: 'profile-' + Math.random().toString(36).substring(2, 9),
        name: 'Owner',
        avatar: '🦁',
        color: 'avatar-grad-purple-pink',
        isKids: false,
        allowedTrackers: [] // empty means all
      };
      
      currentProfiles = [defaultProfile];
      localStorage.setItem('premium_search_profiles', JSON.stringify(currentProfiles));
      setProfiles(currentProfiles);
      
      const activeId = defaultProfile.id;
      setActiveProfileId(activeId);
      localStorage.setItem('premium_search_active_profile_id', activeId);
      
      // Migrate standard library, continue watching, playlists, theme
      const existingLib = localStorage.getItem('premium_search_library') || '[]';
      const existingCW = localStorage.getItem('premium_search_continue_watching') || '[]';
      const existingPlaylists = localStorage.getItem('premium_search_playlists') || '[]';
      const existingTheme = localStorage.getItem('premium_search_theme') || 'midnight-nebula';
      
      localStorage.setItem(`premium_search_library_${activeId}`, existingLib);
      localStorage.setItem(`premium_search_continue_watching_${activeId}`, existingCW);
      localStorage.setItem(`premium_search_playlists_${activeId}`, existingPlaylists);
      localStorage.setItem(`premium_search_theme_${activeId}`, existingTheme);
      
      // Also update current state so we don't have blank values
      setLibraryList(JSON.parse(existingLib));
      setContinueWatchingList(JSON.parse(existingCW));
      setPlaylists(JSON.parse(existingPlaylists));
      setSelectedTheme(existingTheme);
    } else {
      // Check if active profile is set
      const activeId = localStorage.getItem('premium_search_active_profile_id');
      if (activeId && currentProfiles.some(p => p.id === activeId)) {
        const activeProf = currentProfiles.find(p => p.id === activeId);
        if (activeProf && activeProf.pin) {
          setIsProfilePickerOpen(true);
          setActiveProfileId('');
        } else {
          setActiveProfileId(activeId);
          // Force load local storage values to be safe
          const lib = localStorage.getItem(`premium_search_library_${activeId}`);
          if (lib) setLibraryList(JSON.parse(lib));
          const cw = localStorage.getItem(`premium_search_continue_watching_${activeId}`);
          if (cw) setContinueWatchingList(JSON.parse(cw));
          const pl = localStorage.getItem(`premium_search_playlists_${activeId}`);
          if (pl) setPlaylists(JSON.parse(pl));
          const theme = localStorage.getItem(`premium_search_theme_${activeId}`);
          if (theme) setSelectedTheme(theme);
        }
      } else {
        // Force open profile picker
        setIsProfilePickerOpen(true);
      }
    }
    
    // 2. Perform Cloud Sync
    if (userPmKey) {
      syncProfilesFromCloud();
    } else {
      const activeId = localStorage.getItem('premium_search_active_profile_id');
      if (!activeId) {
        setIsProfilePickerOpen(true);
      }
    }
  }, [userPmKey]);


  // --- Account Quota & Active Downloads API Controllers ---

  // Fetch Storage Quota Info
  const fetchAccountQuota = async () => {
    try {
      const res = await fetchWithCredentials('/api/account/info');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === 'success') {
        setAccountInfo(data);
      }
    } catch (err) {
      console.error('❌ Failed to fetch storage quota:', err);
    }
  };

  // Fetch Active Queue Transfers
  const fetchActiveTransfers = async () => {
    try {
      const res = await fetchWithCredentials('/api/transfers');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === 'success') {
        setTransfers(data.transfers || []);
      }
    } catch (err) {
      console.error('❌ Failed to fetch active transfers:', err);
    } finally {
      setTransfersLoading(false);
    }
  };

  // Cancel / Delete Queue Transfer
  const cancelTransfer = async (transferId, name) => {
    try {
      const res = await fetchWithCredentials('/api/transfers/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transferId })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === 'success') {
        triggerToast(`Removed transfer: "${name.slice(0, 30)}..."`, 'success');
        fetchActiveTransfers();
        fetchAccountQuota();
      } else {
        throw new Error(data.message || 'Failed to cancel transfer');
      }
    } catch (err) {
      triggerToast(`Cancellation failed: ${err.message}`, 'error');
    }
  };


  // --- Premiumize Cloud Storage Manager Actions ---

  // 1. Fetch cloud folder contents
  const fetchCloudFolder = async (folderId = null) => {
    setCloudLoading(true);
    setCloudError(null);
    setCloudFilter(''); // Clear local search on folder navigation
    
    try {
      const url = folderId ? `/api/cloud/list?id=${encodeURIComponent(folderId)}` : '/api/cloud/list';
      const res = await fetchWithCredentials(url);
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned HTTP ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.status === 'success') {
        setCloudContents(data.content || []);
        setCloudFolderId(folderId);
        setCloudFolderName(data.name || (folderId ? 'Folder' : 'Root Cloud'));
        
        // Map breadcrumbs: if missing from API, we can build custom parent navigators from folder list
        const crumbs = data.breadcrumbs || [];
        setCloudBreadcrumbs(crumbs);
      } else {
        throw new Error(data.message || 'Failed to retrieve folder contents.');
      }
    } catch (err) {
      console.error('❌ Failed to fetch cloud folder:', err);
      setCloudError(err.message);
      triggerToast(`Cloud error: ${err.message}`, 'error');
    } finally {
      setCloudLoading(false);
    }
  };

  // 1.5. Recursively build folder playlist for "Play All"
  const buildFolderPlaylist = async (startFolderId, startFolderName) => {
    setCloudPlaylistLoading(true);
    setCloudPlaylistStatus(`Analyzing "${startFolderName}"...`);
    triggerToast(` Initializing Play All for "${startFolderName}"...`, 'info');
    
    try {
      const fetchedFiles = [];

      // Depth-first search (sequential subfolder recursion) to maintain perfect chronological order
      const scanFolder = async (folderId, folderName) => {
        setCloudPlaylistStatus(`Scanning: ${folderName}...`);
        
        const url = folderId ? `/api/cloud/list?id=${encodeURIComponent(folderId)}` : '/api/cloud/list';
        const res = await fetchWithCredentials(url);
        if (!res.ok) throw new Error(`Failed to read folder "${folderName}"`);
        
        const data = await res.json();
        if (data.status !== 'success') throw new Error(data.message || `Failed to list folder "${folderName}"`);
        
        const contents = data.content || [];
        
        // A. Filter and sort files in the current folder alphanumerically
        const currentFiles = contents
          .filter(item => item.type === 'file')
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
          
        const videos = currentFiles.filter(f => {
          const ext = f.name.split('.').pop().toLowerCase();
          return ['mkv', 'mp4', 'avi', 'mov', 'webm'].includes(ext);
        }).map(f => ({
          name: f.name,
          link: f.stream_link || f.link,
          size: f.size || 0,
          type: 'video',
          id: f.id
        }));
        
        fetchedFiles.push(...videos);
        
        // B. Filter and sort subfolders alphanumerically
        const subfolders = contents
          .filter(item => item.type === 'folder')
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
          
        // C. Process subfolders recursively
        for (const sub of subfolders) {
          await scanFolder(sub.id, sub.name);
        }
      };

      await scanFolder(startFolderId, startFolderName);

      if (fetchedFiles.length === 0) {
        triggerToast('No streamable video files found in this folder or its subfolders.', 'warning');
        return;
      }

      setPendingPlaylistFiles(fetchedFiles);
      setPendingPlaylistName(startFolderName);
      setPendingItemId(startFolderId);
      setPendingItemType('folder');
      const hasUnplayable = fetchedFiles.some(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        return ['avi', 'mkv', 'ts', 'divx', 'xvid'].includes(ext);
      });
      setHasAviOrMkvInPending(hasUnplayable);
      setShowPlaylistChoiceModal(true);
    } catch (err) {
      console.error('❌ Play All Failed:', err);
      triggerToast(`Failed to build playlist: ${err.message}`, 'error');
    } finally {
      setCloudPlaylistLoading(false);
      setCloudPlaylistStatus('');
    }
  };

  // Helper: Open browser streaming playlist
  const handleLaunchBrowserPlaylist = async (files, name) => {
    setShowPlaylistChoiceModal(false);
    setPlayerLoading(true);
    try {
      const virtualTorrent = {
        title: name,
        category: 'TV', // Set to 'TV' to activate sequential autoplay!
        isCloudFile: true,
        isCloudPlaylist: true,
        link: files[0].link,
        files: files
      };
      await startStreaming(virtualTorrent);
    } catch (e) {
      console.error(e);
      triggerToast('Failed to start browser streaming', 'error');
    } finally {
      setPlayerLoading(false);
    }
  };

  // Helper: Generate and download M3U playlist file for VLC / external players
  const downloadM3UPlaylist = (files, playlistName) => {
    setShowPlaylistChoiceModal(false);
    let m3uContent = '#EXTM3U\n';
    files.forEach(file => {
      m3uContent += `#EXTINF:-1,${file.name}\n`;
      // Inject VLC caching (5000ms = 5s buffer) and auto-reconnect option for network stability
      m3uContent += `#EXTVLCOPT:network-caching=5000\n`;
      m3uContent += `#EXTVLCOPT:http-reconnect=true\n`;
      m3uContent += `${file.link}\n`;
    });
    
    const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${playlistName.replace(/[/\\?%*:|"<>\s]/g, '_')}_playlist.m3u`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    triggerToast('M3U Playlist downloaded! Open it with VLC to play all.', 'success');
  };

  // 2. Rename item (File or Folder)
  const handleCloudRename = async (itemId, type, newName) => {
    if (!newName || !newName.trim()) {
      triggerToast('Name cannot be empty.', 'error');
      return;
    }
    
    try {
      const res = await fetchWithCredentials('/api/cloud/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, type, name: newName.trim() })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to rename item.');
      }
      
      const data = await res.json();
      
      if (data.status === 'success') {
        triggerToast(`Successfully renamed ${type}!`, 'success');
        setCloudRenameId(null);
        setCloudRenameName('');
        // Refresh active folder
        fetchCloudFolder(cloudFolderId);
      } else {
        throw new Error(data.message || 'Failed to rename.');
      }
    } catch (err) {
      console.error('❌ Cloud rename error:', err);
      triggerToast(err.message, 'error');
    }
  };

  // 3. Delete item (File or Folder)
  const handleCloudDelete = async (itemId, type, itemName) => {
    const doubleCheck = window.confirm(`Are you absolutely sure you want to permanently delete the ${type} "${itemName}"?`);
    if (!doubleCheck) return;
    
    try {
      const res = await fetchWithCredentials('/api/cloud/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, type })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete item.');
      }
      
      const data = await res.json();
      
      if (data.status === 'success') {
        triggerToast(`Successfully deleted "${itemName}" from Cloud!`, 'success');
        // Refresh active folder
        fetchCloudFolder(cloudFolderId);
      } else {
        throw new Error(data.message || 'Failed to delete.');
      }
    } catch (err) {
      console.error('❌ Cloud delete error:', err);
      triggerToast(err.message, 'error');
    }
  };

  // 4. Bookmark cloud folder/file to bookshelf library
  const bookmarkCloudItem = (item) => {
    // Check if already in library
    const exists = libraryList.some(lib => lib.id === item.id);
    if (exists) {
      triggerToast('This item is already bookmarked in your Library.', 'info');
      return;
    }

    // Determine category based on extension or folder
    let targetCat = 'Other';
    if (item.type === 'folder') {
      targetCat = 'Other';
    } else {
      const ext = item.name.split('.').pop().toLowerCase();
      if (['mkv', 'mp4', 'avi'].includes(ext)) targetCat = 'Movies';
      else if (['mp3', 'flac', 'wav', 'm4a', 'ogg', 'wma'].includes(ext)) targetCat = 'Music';
      else if (['m4b'].includes(ext)) targetCat = 'Audiobooks';
      else if (['epub', 'pdf'].includes(ext)) targetCat = 'Ebooks';
      else if (['nes', 'sfc', 'smc', 'md', 'gen', 'bin', 'gb', 'gbc', 'gba', 'a26', 'a78'].includes(ext)) targetCat = 'Retro Games';
      else if (ext === 'zip' && (item.name.toLowerCase().includes('rom') || item.name.toLowerCase().includes('game') || item.name.toLowerCase().includes('retro') || item.name.toLowerCase().includes('arcade') || item.name.toLowerCase().includes('atari') || item.name.toLowerCase().includes('nes') || item.name.toLowerCase().includes('snes') || item.name.toLowerCase().includes('sega'))) targetCat = 'Retro Games';
      else if (['exe', 'dmg', 'pkg', 'zip'].includes(ext)) targetCat = 'Software';
    }

    const bookmarkedItem = {
      id: item.id,
      title: item.name,
      size: item.size || 0,
      category: targetCat,
      torrentFile: item.link,
      magnet: item.link || item.stream_link,
      tracker: 'Personal Cloud Storage',
      publishDate: new Date().toISOString(),
      cached: true, // Personal cloud items are always cached by definition
      isCloudFile: true
    };

    const newLibrary = [bookmarkedItem, ...libraryList];
    setLibraryList(newLibrary);
    localStorage.setItem('premium_search_library', JSON.stringify(newLibrary));
    
    // Sync to cloud in the background
    syncToCloud(newLibrary, continueWatchingList);
    triggerToast(`"${item.name}" bookmarked directly to your library bookshelves!`, 'success');
  };

  // 5. Stream cloud media directly
  const handleCloudStream = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    
    // A. Video streaming
    if (['mkv', 'mp4', 'avi', 'mov', 'webm'].includes(ext)) {
      // Find any subtitle files in the current cloud contents to make them available in the player
      const subtitleFiles = cloudContents
        .filter(c => c.type === 'file' && ['srt', 'vtt', 'ass'].includes(c.name.split('.').pop().toLowerCase()))
        .map(c => ({
          name: c.name,
          link: c.link || c.stream_link,
          type: 'subtitle'
        }));
      
      const videoFile = {
        name: file.name,
        link: file.stream_link || file.link,
        size: file.size || 0,
        type: 'video',
        id: file.id
      };

      const files = [videoFile, ...subtitleFiles];
      const isUnplayable = ['avi', 'mkv', 'ts', 'divx', 'xvid'].includes(ext);

      if (isUnplayable) {
        setPendingPlaylistFiles(files);
        setPendingPlaylistName(file.name);
        setPendingItemId(file.id);
        setPendingItemType('file');
        setHasAviOrMkvInPending(true);
        setShowPlaylistChoiceModal(true);
      } else {
        startStreaming({
          title: file.name,
          link: file.stream_link || file.link,
          size: file.size || 0,
          category: 'Movies',
          isCloudFile: true,
          files: files
        });
      }
    } 
    // B. Audio/Music streaming
    else if (['mp3', 'flac', 'wav', 'm4a', 'ogg', 'wma', 'm4b'].includes(ext)) {
      // Find all audio files in the current cloud contents to build a local playlist
      const cloudAudioFiles = cloudContents
        .filter(c => c.type === 'file' && ['mp3', 'flac', 'wav', 'm4a', 'ogg', 'wma', 'm4b'].includes(c.name.split('.').pop().toLowerCase()))
        .map(c => ({
          name: c.name,
          path: c.name,
          link: c.link || c.stream_link,
          size: c.size || 0
        }));

      // Find selected file's index
      const activeIdx = cloudAudioFiles.findIndex(c => c.name === file.name);
      
      startAudioPlayer({
        title: file.name,
        link: file.link || file.stream_link,
        category: ext === 'm4b' ? 'Audiobooks' : 'Music',
        isCloudFile: true,
        files: cloudAudioFiles,
        activeIndex: activeIdx !== -1 ? activeIdx : 0
      });
    } 
    // C. Ebook reading
    else if (['epub', 'pdf'].includes(ext)) {
      startEbookPlayer({
        title: file.name,
        link: file.link || file.stream_link,
        isCloudFile: true
      });
    } 
    // D. Retro emulator
    else if (getEmulatorSystem(file.name)) {
      startRetroPlayer({
        title: file.name,
        magnet: file.link || file.stream_link,
        size: file.size || 0,
        isCloudFile: true
      });
    } 
    // E. General Direct Download fallback
    else {
      triggerDirectDownload({
        title: file.name,
        link: file.link || file.stream_link,
        isCloudFile: true
      });
    }
  };


  // --- Video player + autoplay --- (state + refs in useVideoPlayer via context).
  // All player effects (progress save, subtitles, recap, IntroDB, skip/autoplay timers)
  // stay in AppContent and read this state via context.
  // Audio player state likewise comes from the provider; its iframe progress effect
  // stays in AppContent (uses getMetadata / setContinueWatchingList / triggerToast).

  // --- Rich Metadata Enrichment --- (state + refs in useMetadataState via context;
  // the derived memos below + the drawer effect + fetch logic stay in AppContent)

  // Index resolved metadata by normalized title, so a result whose own TMDb lookup
  // missed can borrow info from a sibling release of the same movie/episode.
  const canonicalMeta = useMemo(() => {
    const m = new Map();
    for (const key in metadataResults) {
      const val = metadataResults[key];
      if (val && !val.tmdbMiss && (val.poster || val.voteAverage)) {
        const norm = normalizeTitle(key.slice(key.indexOf('::') + 2));
        if (norm && !m.has(norm)) m.set(norm, val);
      }
    }
    return m;
  }, [metadataResults]);

  // Dynamically resolve metadata for the selected drawer item from state cache,
  // falling back to a same-title sibling. Lets the detail view fill in once a
  // background fetch (its own or a sibling's) completes.
  const activeMeta = useMemo(() => {
    if (!metadataDrawerItem) return null;
    const cat = metadataDrawerItem.detectedType || metadataDrawerItem.category || category;
    const direct = metadataResults[`${cat}::${metadataDrawerItem.title}`];
    if (direct && !direct.tmdbMiss) return direct;
    const shared = canonicalMeta.get(normalizeTitle(metadataDrawerItem.title));
    if (shared) return shared;
    return direct || metadataDrawerItem._metadata || null;
  }, [metadataDrawerItem, metadataResults, canonicalMeta, category]);

  // a11y: when the detail dialog opens, move keyboard focus into it (onto the
  // close button) so screen-reader/keyboard users land inside the dialog rather
  // than being left on the trigger behind the backdrop. Also reset the reviews
  // panel so it doesn't carry over between titles.
  useEffect(() => {
    if (metadataDrawerItem && metadataDrawerCloseRef.current) {
      metadataDrawerCloseRef.current.focus();
    }
    setReviewsOpen(false);
    setReviewsData([]);
    setReviewsError('');
    setLbReviewsOpen(false);
    setLbReviewsData([]);
    setLbReviewsError('');
    setLbRating(null);

    // Lazily fetch the Letterboxd rating + popular reviews in one scrape, only for
    // movies with an IMDb id. This keeps Letterboxd off the search/metadata path
    // (no scrape-per-result); the rating pill appears once it loads.
    const m = activeMeta;
    if (m?.imdbId && m?.mediaType === 'movie') {
      let active = true;
      setLbReviewsLoading(true);
      (async () => {
        try {
          const res = await fetchWithCredentials(`/api/letterboxd-reviews?imdbId=${encodeURIComponent(m.imdbId)}`);
          const data = await res.json();
          if (!active) return;
          if (res.ok && data.status === 'success') {
            if (data.rating != null) setLbRating({ rating: data.rating, url: data.url });
            setLbReviewsData(data.reviews || []);
            if (!(data.reviews || []).length) setLbReviewsError('No Letterboxd reviews found for this title.');
          } else {
            setLbReviewsError(data.message || 'Could not load reviews.');
          }
        } catch {
          if (active) setLbReviewsError('Could not load reviews (network error).');
        } finally {
          if (active) setLbReviewsLoading(false);
        }
      })();
      return () => { active = false; };
    }
  }, [metadataDrawerItem, activeMeta?.imdbId, activeMeta?.mediaType]);

  // Toggle/fetch the TMDb reviews panel for the open detail item.
  const toggleReviews = async (meta) => {
    if (reviewsOpen) { setReviewsOpen(false); return; }
    setReviewsOpen(true);
    setLbReviewsOpen(false); // Close Letterboxd panel when opening TMDb
    if (reviewsData.length > 0) return; // already loaded for this title
    if (!meta?.tmdbId || !meta?.mediaType) { setReviewsError('Reviews need TMDb metadata (set a TMDb key in Settings).'); return; }
    setReviewsLoading(true);
    setReviewsError('');
    try {
      const res = await fetchWithCredentials(`/api/reviews?tmdbId=${encodeURIComponent(meta.tmdbId)}&mediaType=${encodeURIComponent(meta.mediaType)}`);
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setReviewsData(data.reviews || []);
        if (!(data.reviews || []).length) setReviewsError('No TMDb reviews have been posted for this title yet.');
      } else {
        setReviewsError(data.message || 'Could not load reviews.');
      }
    } catch {
      setReviewsError('Could not load reviews (network error).');
    } finally {
      setReviewsLoading(false);
    }
  };

  // Toggle the Letterboxd reviews panel. Data is already loaded (lazily) when the
  // detail drawer opens, so this just shows/hides the panel.
  const toggleLbReviews = () => {
    if (lbReviewsOpen) { setLbReviewsOpen(false); return; }
    setLbReviewsOpen(true);
    setReviewsOpen(false); // Close TMDb panel when opening Letterboxd
  };

  // Fetch metadata for a given torrent item, with deduplication
  const fetchMetadata = async (item) => {
    const cat = item.detectedType || item.category || category;
    // Skip categories that don't have metadata APIs
    if (['Software', 'Other', 'Retro Games', 'Adult', 'VST'].includes(cat)) {
      return null;
    }
    
    const cacheKey = `${cat}::${item.title}`;
    
    // Already cached?
    if (metadataCacheRef.current.has(cacheKey)) {
      return metadataCacheRef.current.get(cacheKey);
    }
    
    // Already in flight?
    if (metadataInFlightRef.current.has(cacheKey)) {
      return { inFlight: true };
    }
    metadataInFlightRef.current.add(cacheKey);
    
    try {
      let url = `/api/metadata?title=${encodeURIComponent(item.title)}&category=${encodeURIComponent(cat)}`;
      if (item.imdb) url += `&imdb=${encodeURIComponent(item.imdb)}`;
      if (item.tvdbid) url += `&tvdb=${encodeURIComponent(item.tvdbid)}`;
      const res = await fetchWithCredentials(url);
      if (!res.ok) {
        // HTTP errors (e.g. 429 rate-limit, 5xx) are transient — do NOT cache, so
        // the lookup retries on the next pass instead of becoming a permanent miss.
        console.error(`Backend returned HTTP error ${res.status} for "${item.title}"`);
        return { title: item.title, overview: 'Could not load details (server busy). Will retry.', tmdbMiss: true, error: true };
      }
      const data = await res.json();
      
      if (data.status === 'success' && data.metadata) {
        metadataCacheRef.current.set(cacheKey, data.metadata);
        return data.metadata;
      }
      // Cache misses too to avoid repeated lookups
      const fallback = { title: item.title, overview: 'No additional details found on TMDb.', tmdbMiss: true };
      metadataCacheRef.current.set(cacheKey, fallback);
      return fallback;
    } catch (err) {
      console.error('Fetch error for:', item.title, err.message);
      // Return a temporary miss so UI stops spinning but can retry next page load
      return { title: item.title, overview: 'Failed to load details due to a network error.', tmdbMiss: true, error: true };
    } finally {
      metadataInFlightRef.current.delete(cacheKey);
    }
  };

  // Batch fetch metadata for an array of items and update state
  const fetchMetadataBatch = async (items) => {
    const eligibleItems = items.filter(item => {
      const cat = item.detectedType || item.category || category;
      return !['Software', 'Other', 'Retro Games', 'Adult', 'VST'].includes(cat);
    });

    if (eligibleItems.length === 0) return;

    // Collapse to ONE representative per normalized title: many results are just
    // different releases of the same movie, and siblings already share metadata via
    // canonicalMeta. This cuts a 195-release search from ~195 metadata requests to a
    // handful (avoiding 429s). Pick the shortest title as the cleanest match candidate.
    const repByNorm = new Map();
    const standalone = [];
    for (const item of eligibleItems) {
      const norm = normalizeTitle(item.title);
      if (!norm) { standalone.push(item); continue; }
      const cur = repByNorm.get(norm);
      if (!cur || (item.title || '').length < (cur.title || '').length) repByNorm.set(norm, item);
    }
    const fetchItems = [...repByNorm.values(), ...standalone];

    // Fetch in parallel, max 4 at a time to avoid flooding
    const BATCH = 4;
    const newResults = {};
    
    for (let i = 0; i < fetchItems.length; i += BATCH) {
      const batch = fetchItems.slice(i, i + BATCH);
      const promises = batch.map(async (item) => {
        const metadata = await fetchMetadata(item);
        if (metadata && !metadata.inFlight) {
          const cat = item.detectedType || item.category || category;
          newResults[`${cat}::${item.title}`] = metadata;
        }
      });
      await Promise.allSettled(promises);
    }
    
    if (Object.keys(newResults).length > 0) {
      setMetadataResults(prev => ({ ...prev, ...newResults }));
    }
  };

  // Helper: Get metadata for an item from state
  const getMetadata = (item) => {
    const cat = item.detectedType || item.category || category;
    const direct = metadataResults[`${cat}::${item.title}`];
    if (direct && !direct.tmdbMiss) return direct;
    // Borrow from a sibling release of the same title that did resolve on TMDb.
    const shared = canonicalMeta.get(normalizeTitle(item.title));
    if (shared) return shared;
    return direct || null;
  };

  // --- Watchlist helpers & actions ---
  const watchKeyOf = (item) => ((item._metadata?.title) || (getMetadata(item)?.title) || item.title || '').toLowerCase().trim();
  const persistWatchlist = (next) => {
    setWatchlist(next);
    if (activeProfileId) localStorage.setItem(`premium_search_watchlist_${activeProfileId}`, JSON.stringify(next));
  };
  const isInWatchlist = (item) => { const k = watchKeyOf(item); return !!k && watchlist.some(w => w.key === k); };
  const toggleWatchlist = (item) => {
    const key = watchKeyOf(item);
    if (!key) return;
    if (watchlist.some(w => w.key === key)) {
      persistWatchlist(watchlist.filter(w => w.key !== key));
      triggerToast('Removed from watchlist', 'info');
    } else {
      const meta = item._metadata || getMetadata(item);
      const entry = {
        key,
        title: meta?.title || item.title,
        query: meta?.title || item.title,
        category: item.detectedType || item.category || 'Movies',
        poster: meta?.poster || null,
        year: meta?.year || null,
        addedAt: Date.now(),
        lastChecked: null,
        cachedCount: null,
      };
      persistWatchlist([entry, ...watchlist]);
      triggerToast(`Added "${entry.title}" to watchlist`, 'success');
    }
  };
  const findWatchlistItem = (w) => {
    setActiveTab('search');
    setSearchMode('torrent');
    setCategory(w.category && CATEGORIES.includes(w.category) ? w.category : 'All');
    setQuery(w.query);
    setTimeout(() => handleSearch(null, 'torrent'), 60);
  };
  const checkWatchlist = async () => {
    if (watchlistChecking || watchlist.length === 0) return;
    setWatchlistChecking(true);
    let newFinds = 0;
    const updated = [...watchlist];
    for (let i = 0; i < updated.length; i++) {
      const w = updated[i];
      try {
        const cat = (w.category && w.category !== 'All') ? w.category : 'Movies';
        const res = await fetchWithCredentials(`/api/search?q=${encodeURIComponent(w.query)}&category=${encodeURIComponent(cat)}`);
        const data = await res.json();
        const cachedNow = Array.isArray(data) ? data.filter(r => r.cached).length : 0;
        if (w.cachedCount !== null && cachedNow > w.cachedCount) newFinds++;
        updated[i] = { ...w, cachedCount: cachedNow, lastChecked: Date.now() };
      } catch { /* skip this entry */ }
    }
    persistWatchlist(updated);
    setWatchlistChecking(false);
    triggerToast(newFinds > 0 ? `${newFinds} watchlist title${newFinds > 1 ? 's have' : ' has'} new cached releases!` : 'Watchlist checked — no new cached releases.', newFinds > 0 ? 'success' : 'info');
  };


  // Persist show/hide adult configuration
  useEffect(() => {
    localStorage.setItem('premium_search_hide_adult', JSON.stringify(hideAdult));
    // If we suddenly hide adult while Adult is selected, revert selected category to Movies
    if (hideAdult && category === 'Adult') {
      setCategory('Movies');
    }
  }, [hideAdult, category]);

  // Auto-check Premiumize cache status for any uncached items in the Library list
  const checkLibraryCacheStatus = async () => {
    const uncachedItems = libraryList.filter(item => !item.cached && item.magnet);
    if (uncachedItems.length === 0) return;

    const hashesToCheck = [];
    uncachedItems.forEach(item => {
      let hash = null;
      const magnet = item.magnet;
      if (magnet && typeof magnet === 'string') {
        const matchHex = magnet.match(/xt=urn:btih:([a-fA-F0-9]{40})/i);
        if (matchHex) hash = matchHex[1].toLowerCase();
      }
      if (hash) {
        hashesToCheck.push(hash);
      }
    });

    if (hashesToCheck.length === 0) return;

    try {
      const res = await fetchWithCredentials('/api/cache-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashes: hashesToCheck })
      });
      if (!res.ok) return;

      const data = await res.json();
      if (data.status === 'success' && data.response) {
        const cacheMap = data.response;
        let hasChanges = false;

        const updatedLib = libraryList.map(item => {
          let itemHash = null;
          const magnet = item.magnet;
          if (magnet) {
            const matchHex = magnet.match(/xt=urn:btih:([a-fA-F0-9]{40})/i);
            if (matchHex) itemHash = matchHex[1].toLowerCase();
          }
          
          if (itemHash && cacheMap[itemHash] === true && !item.cached) {
            hasChanges = true;
            return { ...item, cached: true };
          }
          return item;
        });

        if (hasChanges) {
          setLibraryList(updatedLib);
          localStorage.setItem('premium_search_library', JSON.stringify(updatedLib));
          triggerToast('Library cache status auto-synchronized!', 'success');
        }
      }
    } catch (err) {
      console.error('Failed to auto-check library cache status:', err);
    }
  };

  // Refresh cache status when the Library tab is shown. (Metadata/cover art is
  // pre-fetched by the background [libraryList] effect below, so no fetch here.)
  useEffect(() => {
    if (activeTab === 'library' && libraryList.length > 0) {
      checkLibraryCacheStatus();
    }
  }, [activeTab]);

  // Active Downloads polling effect (runs every 5s while viewing 'transfers' tab)
  useEffect(() => {
    if (activeTab === 'transfers') {
      fetchActiveTransfers();
      const interval = setInterval(fetchActiveTransfers, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Auto-fetch metadata for the DISPLAYED search results (based on visibleCount)
  // This runs whenever search results, categories, sorting, filters, or visibleCount changes.
  useEffect(() => {
    if (activeTab === 'search' && processedResults && processedResults.length > 0) {
      fetchMetadataBatch(processedResults.slice(0, visibleCount));
    }
  }, [activeTab, results, filterQuality, filterMaxSize, filterMinSeeders, excludeKeywords, category, sortBy, visibleCount]);

  // Auto-fetch metadata for all library items in background when list changes
  useEffect(() => {
    if (libraryList.length > 0) {
      fetchMetadataBatch(libraryList);
    }
  }, [libraryList]);

  // Stable signature of the Continue-Watching item SET (title + category). Used so
  // the cover-art fetch below only runs when items are added/removed — NOT on every
  // playback progress tick (continueWatchingList gets a fresh reference each second
  // while a video plays, which would otherwise re-run this effect constantly).
  const cwArtSignature = useMemo(
    () => continueWatchingList
      .map(i => `${i.category || (i.torrent && i.torrent.category) || 'Movies'}::${i.parentTitle || i.title}`)
      .join('|'),
    [continueWatchingList]
  );

  // Auto-fetch metadata for all Continue Watching items in the background to resolve
  // backdrop/cover art (replaces the generic gradient cards with real artwork).
  useEffect(() => {
    if (!cwArtSignature) return;
    const itemsToFetch = cwArtSignature.split('|').map(s => {
      const sep = s.indexOf('::');
      return { category: s.slice(0, sep), title: s.slice(sep + 2) };
    });
    fetchMetadataBatch(itemsToFetch);
  }, [cwArtSignature]);

  // --- Auto-Save: Audio / Audiobook Progress Event Listener ---
  useEffect(() => {
    const handleIframeMessage = (event) => {
      if (event.data && event.data.type === 'audio-progress') {
        const { link, name, currentTime, duration, percent } = event.data;
        if (!activeAudioTorrent || !selectedAudioFile) return;

        // STRICT PRIVACY COMPLIANCE RULE: NEVER save Adult content progress
        if (activeAudioTorrent.category === 'Adult') return;

        const categoryVal = activeAudioTorrent.category === 'Music' ? 'Music' : 'Audiobooks';

        setContinueWatchingList(prev => {
          const updated = [
            {
              title: name,
              parentTitle: activeAudioTorrent.title,
              link: link,
              torrent: activeAudioTorrent,
              category: categoryVal,
              currentTime: currentTime,
              duration: duration,
              percent: percent,
              timestamp: Date.now()
            },
            ...prev.filter(item => !item.parentTitle || item.parentTitle.toLowerCase() !== activeAudioTorrent.title.toLowerCase())
          ].slice(0, 12);
          localStorage.setItem('premium_search_continue_watching', JSON.stringify(updated));
          return updated;
        });
      } else if (event.data && event.data.type === 'audio-ended') {
        const { link } = event.data;
        removeFromContinueWatching(link);
        triggerToast("Album / Audiobook completed! Progress cleared.", "success");
      } else if (event.data && event.data.type === 'audio-player-ready') {
        const iframe = document.querySelector('.main-audio-frame');
        if (iframe && iframe.contentWindow) {
          console.log('Sending playlist data via postMessage to iframe...');
          const meta = getMetadata(activeAudioTorrent);
          iframe.contentWindow.postMessage({
            type: 'audio-playlist-data',
            playlist: audioPlayableFiles.map(f => ({
              name: f.name,
              link: f.link,
              size: f.size
            })),
            meta: meta,
            initialRom: selectedAudioFile.link,
            resumeTime: resumeAudioTime
          }, '*');
        }
      }
    };

    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, [activeAudioTorrent, selectedAudioFile]);

  // --- Secret Developer Settings Lock ---
  const handleLogoClick = () => {
    if (isKids) return; // Prevent unlocking developer options on Kids profile
    const now = Date.now();
    // Keep only clicks within the last 2000ms
    logoClicksRef.current = [...logoClicksRef.current, now].filter(t => now - t < 2000);
    
    if (logoClicksRef.current.length >= 5) {
      logoClicksRef.current = []; // Clear click history immediately
      
      setAdultControlsUnlocked(unlocked => {
        const newState = !unlocked;
        triggerToast(newState ? 'Secret settings unlocked!': 'Secret settings locked!', 'success');
        // Automatically hide adult options when locked
        if (!newState) {
          setHideAdult(true);
        }
        return newState;
      });
    }
  };

  // --- Cloud Sync On Startup ---
  useEffect(() => {
    syncFromCloud();
  }, []);

  // --- Keyboard Playback Hotkeys ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!activePlayerTorrent) return;

      const video = document.querySelector('.main-video-player');
      if (!video) return;

      // Avoid capturing keys when the user is typing in forms or search fields
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      // Keys we fully own while a video is open. When the <video controls>
      // element or a control button holds focus (e.g. right after a mouse
      // click on the player), the browser ALSO runs its native action — the
      // <video> space-toggle, or a button's keyup "click" — on top of ours.
      // The two fight and cancel out: the intermittent "pause for a split
      // second then resume" double-toggle. Dropping focus to <body> first
      // removes that second actor, so one press = exactly one action.
      const ownedKeys = [' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 's', 'S', 'f', 'F'];
      if (ownedKeys.includes(e.key)) {
        const ae = document.activeElement;
        if (ae && ae !== document.body && typeof ae.blur === 'function') ae.blur();
      }

      switch (e.key) {
        case ' ': // Spacebar - Play/Pause Toggle
          e.preventDefault();
          if (video.paused) {
            video.play();
            triggerToast('▶ Play', 'success');
          } else {
            video.pause();
            triggerToast('Pause', 'success');
          }
          break;
        case 'ArrowLeft': // Left Arrow - Seek Back 10s
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          triggerToast('-10s', 'success');
          break;
        case 'ArrowRight': // Right Arrow - Seek Forward 10s
          e.preventDefault();
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
          triggerToast('+10s', 'success');
          break;
        case 'ArrowUp': // Up Arrow - Volume Up 10%
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          triggerToast(` Volume ${Math.round(video.volume * 100)}%`, 'success');
          break;
        case 'ArrowDown': // Down Arrow - Volume Down 10%
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          triggerToast(` Volume ${Math.round(video.volume * 100)}%`, 'success');
          break;
        case 's':
        case 'S': // 's' / 'S' - Toggle Subtitle Visibility
          e.preventDefault();
          if (video.textTracks && video.textTracks.length > 0) {
            const track = video.textTracks[0];
            const isShowing = track.mode === 'showing';
            track.mode = isShowing ? 'disabled' : 'showing';
            triggerToast(isShowing ? 'Subtitles Off': 'Subtitles On', 'success');
          } else {
            triggerToast('No subtitle track loaded', 'error');
          }
          break;
        case 'f':
        case 'F': // 'f' / 'F' - Toggle Player Fullscreen Mode
          e.preventDefault();
          if (!document.fullscreenElement) {
            video.requestFullscreen().catch(err => {
              console.error('Fullscreen request failed:', err.message);
            });
            triggerToast('Fullscreen On', 'success');
          } else {
            document.exitFullscreen().catch(err => {
              console.error('Exit fullscreen failed:', err.message);
            });
            triggerToast('Fullscreen Off', 'success');
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePlayerTorrent]);


  // a11y: Escape closes the topmost open overlay (drawer, dialog, menu), so
  // keyboard users aren't trapped. The media player is intentionally excluded —
  // there Escape exits fullscreen (browser default). Priority = visual stacking.
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (showKeysPinPrompt) { setShowKeysPinPrompt(false); setRevealPinInput(''); setRevealPinError(false); return; }
      if (showLegalDisclaimer) { setShowLegalDisclaimer(false); return; }
      if (metadataDrawerItem) { setMetadataDrawerItem(null); return; }
      if (showPlaylistChoiceModal) { setShowPlaylistChoiceModal(false); return; }
      if (showSettings) { setShowSettings(false); return; }
      if (showAICopilot) { setShowAICopilot(false); return; }
      if (isProfileDropdownOpen) { setIsProfileDropdownOpen(false); return; }
      if (isProfilePickerOpen) { setIsProfilePickerOpen(false); return; }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [showKeysPinPrompt, showLegalDisclaimer, metadataDrawerItem, showSettings, showPlaylistChoiceModal, showAICopilot, isProfileDropdownOpen, isProfilePickerOpen]);


  // --- Subtitle compiler engine ---
  useEffect(() => {
    if (!selectedSubtitleFile) {
      setSubtitleTrackUrl(null);
      setAiTranslateLanguage('');
      return;
    }

    let active = true;
    const fetchAndCompileSubtitle = async () => {
      try {
        // Online-fetched subtitle (OpenSubtitles / SubDL): the SRT text is already
        // resolved. Re-request a translated copy from the provider when AI-translate
        // is on (reuses the server's translateSubtitleText), else use it as-is.
        if (selectedSubtitleFile._online) {
          let srt = selectedSubtitleFile.srtText;
          if (aiTranslateLanguage && aiToken && aiEnabled) {
            triggerToast(`Translating subtitle to ${aiTranslateLanguage}...`, 'info');
            const tr = await fetchWithCredentials('/api/subtitles/download', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...selectedSubtitleFile._dl, translateTo: aiTranslateLanguage, token: aiToken, model: aiModel })
            });
            if (tr.ok) srt = (await tr.json()).srt;
          }
          if (!active) return;
          const compiledVtt = srt.startsWith('WEBVTT') ? srt : convertSrtToVtt(srt);
          const blob = new Blob([compiledVtt], { type: 'text/vtt' });
          const objectUrl = URL.createObjectURL(blob);
          setSubtitleTrackUrl(objectUrl);
          if (aiTranslateLanguage && aiToken && aiEnabled) triggerToast(`Subtitle translated to ${aiTranslateLanguage}!`, 'success');
          return;
        }

        let fetchUrl = `/api/proxy-subtitle?url=${encodeURIComponent(selectedSubtitleFile.link)}`;
        if (aiTranslateLanguage && aiToken && aiEnabled) {
          triggerToast(` Translating subtitle to ${aiTranslateLanguage}...`, 'info');
          fetchUrl += `&translateTo=${encodeURIComponent(aiTranslateLanguage)}&token=${encodeURIComponent(aiToken)}&model=${encodeURIComponent(aiModel)}`;
        }

        const res = await fetchWithCredentials(fetchUrl);
        if (!res.ok) throw new Error('Subtitle track unreachable.');
        
        const rawText = await res.text();
        if (!active) return;

        let compiledVtt = rawText;
        // Compile SRT files into WebVTT on-the-fly
        if (selectedSubtitleFile.name.toLowerCase().endsWith('.srt') || !rawText.startsWith('WEBVTT')) {
          compiledVtt = convertSrtToVtt(rawText);
        }

        const blob = new Blob([compiledVtt], { type: 'text/vtt' });
        const objectUrl = URL.createObjectURL(blob);
        setSubtitleTrackUrl(objectUrl);

        if (aiTranslateLanguage && aiToken && aiEnabled) {
          triggerToast(` Subtitle successfully translated to ${aiTranslateLanguage}!`, 'success');
        }
      } catch (err) {
        console.error('Subtitle compiler failed:', err.message);
        if (aiTranslateLanguage && aiToken && aiEnabled) {
          triggerToast('AI Subtitle translation failed. Loaded original.', 'error');
        }
      }
    };

    fetchAndCompileSubtitle();

    return () => {
      active = false;
      if (subtitleTrackUrl) {
        URL.revokeObjectURL(subtitleTrackUrl);
      }
    };
  }, [selectedSubtitleFile, aiTranslateLanguage, aiToken, aiModel, aiEnabled]);

  // Search online subtitle providers (OpenSubtitles primary + SubDL fallback) for
  // the currently-playing title, using the TMDb-resolved IMDb id (+ season/episode
  // for TV). Opens the picker panel with the matched releases.
  const fetchOnlineSubtitles = async () => {
    if (!activePlayerTorrent) return;
    if (!userOpenSubsKey && !userSubdlKey) {
      triggerToast('Add an OpenSubtitles or SubDL key in Settings to fetch subtitles.', 'warning');
      return;
    }
    setSubSearchOpen(true);
    setSubSearchLoading(true);
    setSubSearchError('');
    setSubSearchResults([]);
    try {
      const cat = activePlayerTorrent.category || 'Movies';
      const metaUrl = `/api/metadata?title=${encodeURIComponent(activePlayerTorrent.title || activePlayerTorrent.name)}&category=${encodeURIComponent(cat)}`;
      const metaRes = await fetchWithCredentials(metaUrl);
      const metaData = metaRes.ok ? await metaRes.json() : null;
      const imdbId = metaData?.metadata?.imdbId;
      if (!imdbId) {
        setSubSearchError('Could not resolve an IMDb id for this title — a TMDb key is required for subtitle search.');
        setSubSearchLoading(false);
        return;
      }
      const params = new URLSearchParams({ imdbId, language: subSearchLang });
      if (cat === 'TV' && selectedVideoFile) {
        const sd = parseShowDetails(selectedVideoFile.name);
        if (sd) { params.set('season', sd.season); params.set('episode', sd.episode); }
      }
      const res = await fetchWithCredentials(`/api/subtitles/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) { setSubSearchError(data.error || 'Subtitle search failed.'); setSubSearchLoading(false); return; }
      setSubSearchResults(data.results || []);
      if ((data.results || []).length === 0) setSubSearchError('No subtitles found for this title and language. Try another language.');
    } catch (err) {
      setSubSearchError(err.message || 'Subtitle search failed.');
    } finally {
      setSubSearchLoading(false);
    }
  };

  // Download a chosen online subtitle and load it into the player's compiler.
  const selectOnlineSubtitle = async (result) => {
    setSubDownloadingId(result.id);
    try {
      const res = await fetchWithCredentials('/api/subtitles/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: result.provider, id: result.id })
      });
      const data = await res.json();
      if (!res.ok) { triggerToast(data.error || 'Subtitle download failed.', 'error'); return; }
      setSelectedSubtitleFile({
        name: `${result.release.slice(0, 45)} · ${result.provider === 'opensubtitles' ? 'OpenSubtitles' : 'SubDL'}`,
        srtText: data.srt,
        _online: true,
        _dl: { provider: result.provider, id: result.id }
      });
      triggerToast('Subtitle loaded into player!', 'success');
      setSubSearchOpen(false);
    } catch (err) {
      triggerToast(err.message || 'Subtitle download failed.', 'error');
    } finally {
      setSubDownloadingId(null);
    }
  };

  // Programmatically mount and force-refresh the active subtitle track
  // to bypass HTML5 text track loading bugs and prevent manual CC toggling
  useEffect(() => {
    const videoElement = document.querySelector('.main-video-player');
    if (!videoElement) return;

    // Remove any existing track element inside the video tag
    const existingTracks = videoElement.querySelectorAll('track');
    existingTracks.forEach(t => t.remove());

    if (subtitleTrackUrl) {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = selectedSubtitleFile?.name || 'Subtitles';
      track.srclang = 'en';
      track.src = subtitleTrackUrl;
      track.default = true;
      
      // Append track to DOM
      videoElement.appendChild(track);
      
      // Force subtitle track mode to 'showing' programmatically
      track.addEventListener('load', () => {
        track.track.mode = 'showing';
      });
      
      // Fallback timer reinforcement
      setTimeout(() => {
        if (videoElement.textTracks && videoElement.textTracks.length > 0) {
          videoElement.textTracks[0].mode = 'showing';
        }
      }, 100);
    }
  }, [subtitleTrackUrl, selectedSubtitleFile]);

  // --- TV Show "Previously On..." Recap logic ---
  useEffect(() => {
    setRecapOpen(false);
    setRecapText(null);
    setRecapError('');
    setRecapLoading(false);
  }, [selectedVideoFile]);

  // Fetch IntroDB timestamps for TV episodes when playback begins
  useEffect(() => {
    setIntroSegment(null);
    setShowSkipButton(false);
    setSkipTimer(0);

    if (!selectedVideoFile || !activePlayerTorrent) return;
    const cat = activePlayerTorrent.category || 'Movies';
    if (cat !== 'TV') return;

    const showDetails = parseShowDetails(selectedVideoFile.name);
    if (!showDetails) return;

    const fetchIntro = async () => {
      try {
        console.log(`🔍 [IntroDB] Resolving IMDb ID for TV show: "${activePlayerTorrent.title}"`);
        const metadataUrl = `/api/metadata?title=${encodeURIComponent(activePlayerTorrent.title || activePlayerTorrent.name)}&category=TV`;
        const metaRes = await fetchWithCredentials(metadataUrl);
        if (!metaRes.ok) return;

        const metaData = await metaRes.json();
        if (metaData.status === 'success' && metaData.metadata) {
          const imdbId = metaData.metadata.imdbId;
          if (imdbId) {
            console.log(`🌐 [IntroDB] Fetching segments for IMDb ID: ${imdbId}, S${showDetails.season}E${showDetails.episode}`);
            const segmentsUrl = `https://api.introdb.app/segments?imdb_id=${encodeURIComponent(imdbId)}&season=${showDetails.season}&episode=${showDetails.episode}`;
            const segmentsRes = await fetch(segmentsUrl);
            if (segmentsRes.ok) {
              const data = await segmentsRes.json();
              const segments = data.segments || data;
              if (Array.isArray(segments)) {
                const intro = segments.find(s => s.type === 'intro' || s.segment_type === 'intro');
                if (intro) {
                  const start = parseFloat(intro.start !== undefined ? intro.start : intro.start_sec);
                  const end = parseFloat(intro.end !== undefined ? intro.end : intro.end_sec);
                  if (!isNaN(start) && !isNaN(end) && end > start) {
                    console.log(`✅ [IntroDB] Found intro: ${start}s - ${end}s`);
                    setIntroSegment({ start, end });
                  }
                } else {
                  console.log(`ℹ️ [IntroDB] No intro segment found for this episode.`);
                }
              }
            } else {
              console.warn(`[IntroDB] API returned status ${segmentsRes.status}`);
            }
          } else {
            console.log(`ℹ️ [IntroDB] No IMDb ID available for metadata enrichment.`);
          }
        }
      } catch (err) {
        console.error('❌ [IntroDB] Failed to fetch intro timestamps:', err.message);
      }
    };

    fetchIntro();
  }, [selectedVideoFile, activePlayerTorrent]);

  // 10 second countdown timer for the Skip Intro popup button
  useEffect(() => {
    let interval;
    if (showSkipButton && skipTimer > 0) {
      interval = setInterval(() => {
        setSkipTimer(prev => {
          if (prev <= 1) {
            setShowSkipButton(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [showSkipButton, skipTimer]);

  const handleSkipIntro = () => {
    const video = document.querySelector('.main-video-player');
    if (video && introSegment) {
      video.currentTime = introSegment.end;
      triggerToast("Skipped intro!", "success");
      setIntroSegment(null);
      setShowSkipButton(false);
    }
  };

  const handleToggleRecap = async () => {
    const nextState = !recapOpen;
    setRecapOpen(nextState);
    
    if (nextState && !recapText && !recapLoading) {
      if (!aiEnabled || !aiToken) {
        setRecapError('Premiumize AI is disabled or token is missing. Please check settings.');
        return;
      }
      
      const showDetails = parseShowDetails(selectedVideoFile?.name);
      if (!showDetails) {
        setRecapError('Failed to identify show details from filename.');
        return;
      }
      
      setRecapLoading(true);
      setRecapError('');
      
      try {
        const systemPrompt = `You are a TV show expert. Provide a concise, spoiler-free 3-bullet-point summary of the preceding events in the TV show "${showDetails.showName}" leading up to Season ${showDetails.season}, Episode ${showDetails.episode}.
Focus ONLY on key plot points needed to catch up. Do NOT reveal what happens in Season ${showDetails.season} Episode ${showDetails.episode} itself.
Output ONLY the 3 bullet points (each starting with a bullet character "• "). No introductory text, no conversational replies, and no spoilers for the current episode.`;
        
        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Give me a recap for ${showDetails.showName} before S${showDetails.season}E${showDetails.episode}` }
        ];
        
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: aiToken,
            model: aiModel,
            messages: messages
          })
        });
        
        if (!res.ok) {
          throw new Error('AI Recap request failed');
        }
        
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) {
          setRecapText(content);
        } else {
          throw new Error('Invalid response from AI');
        }
      } catch (err) {
        console.error(err);
        setRecapError('Failed to generate recap. Check your token or connection.');
      } finally {
        setRecapLoading(false);
      }
    }
  };

  // --- TV Series Autoplay Countdown Timer Hooks ---
  useEffect(() => {
    if (showAutoplayOverlay && autoplayCountdown > 0) {
      autoplayTimerRef.current = setTimeout(() => {
        setAutoplayCountdown(prev => prev - 1);
      }, 1000);
    } else if (showAutoplayOverlay && autoplayCountdown === 0) {
      setShowAutoplayOverlay(false);
      if (nextEpisodeFile) {
        triggerToast(` Autoplaying next episode: ${nextEpisodeFile.name.split('/').pop()}`, 'success');
        setSelectedVideoFile(nextEpisodeFile);
      }
    }
    return () => {
      if (autoplayTimerRef.current) clearTimeout(autoplayTimerRef.current);
    };
  }, [showAutoplayOverlay, autoplayCountdown, nextEpisodeFile]);

  useEffect(() => {
    setShowAutoplayOverlay(false);
    setNextEpisodeFile(null);
    autoplayDeclinedRef.current = false; // Reset decline flag on track swap!
    if (autoplayTimerRef.current) clearTimeout(autoplayTimerRef.current);
  }, [selectedVideoFile]);

  // --- Handlers & API Calls ---

  // --- Importer and Drag-and-Drop Handlers ---
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processImportedFile = async (file) => {
    if (!file) return;
    const isTorrent = file.name.toLowerCase().endsWith('.torrent');
    const isNzb = file.name.toLowerCase().endsWith('.nzb');
    
    if (!isTorrent && !isNzb) {
      triggerToast('Only .torrent and .nzb files are supported for import!', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setLoading(true);
        const base64Data = reader.result.split(',')[1];
        
        const res = await fetchWithCredentials('/api/parse-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileContent: base64Data,
            fileName: file.name,
            fileType: isTorrent ? 'torrent' : 'nzb'
          })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to parse file');
        }

        const data = await res.json();

        if (data.type === 'torrent') {
          setSearchMode('torrent');
          setResults([]);
          setSearched(true);
          setActiveTab('search');
          
          const checkRes = await fetchWithCredentials('/api/cache-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hashes: [data.infoHash] })
          });
          
          let isCached = false;
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            isCached = checkData.response && checkData.response[data.infoHash] === true;
          }
          
          setResults([{
            title: data.title,
            size: data.size,
            seeders: 10,
            peers: 3,
            magnet: data.magnet,
            torrentFile: null,
            infoHash: data.infoHash,
            tracker: 'Imported Torrent File',
            category: category,
            publishDate: new Date().toISOString(),
            cached: isCached
          }]);
          triggerToast('Torrent imported successfully and CDN cache status checked!', 'success');
        } else if (data.type === 'usenet') {
          setSearchMode('usenet');
          setResults([]);
          setSearched(true);
          setActiveTab('search');
          
          setResults([{
            title: data.title,
            size: data.size,
            nzbUrl: data.nzbUrl,
            ageDays: 0,
            grabs: 1,
            health: 100,
            imdb: null,
            tvdbid: null,
            coverurl: null,
            password: null,
            category: category,
            indexer: 'Imported NZB File'
          }]);
          triggerToast('NZB imported successfully! Ready for 1-click cloud transfer.', 'success');
        }
      } catch (err) {
        triggerToast(` Import failed: ${err.message}`, 'error');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImportedFile(e.dataTransfer.files[0]);
    }
  };

  const handleImportFile = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processImportedFile(e.target.files[0]);
    }
  };

  const handleImportMagnet = async () => {
    if (!magnetInput.trim()) return;
    
    const isMagnet = magnetInput.trim().toLowerCase().startsWith('magnet:?');
    if (!isMagnet) {
      triggerToast('Provided input is not a valid magnet link!', 'error');
      return;
    }

    try {
      setLoading(true);
      const res = await fetchWithCredentials('/api/parse-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: magnetInput })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to parse magnet link');
      }

      const data = await res.json();

      if (data.type === 'torrent') {
        setSearchMode('torrent');
        setResults([]);
        setSearched(true);
        setActiveTab('search');
        
        const checkRes = await fetchWithCredentials('/api/cache-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hashes: [data.infoHash] })
        });
        
        let isCached = false;
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          isCached = checkData.response && checkData.response[data.infoHash] === true;
        }
        
        setResults([{
          title: data.title,
          size: data.size,
          seeders: 10,
          peers: 3,
          magnet: data.magnet,
          torrentFile: null,
          infoHash: data.infoHash,
          tracker: 'Imported Magnet Link',
          category: category,
          publishDate: new Date().toISOString(),
          cached: isCached
        }]);
        setMagnetInput('');
        triggerToast('Magnet link imported and CDN cache status checked!', 'success');
      }
    } catch (err) {
      triggerToast(` Import failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Trigger search
  const handleSearch = async (e, forcedMode = null, overrideQuery = null) => {
    if (e) e.preventDefault();
    const currentQuery = overrideQuery !== null ? overrideQuery : query;
    if (!currentQuery.trim()) return;

    setLoading(true);
    setSearched(true);
    setSearchError('');
    setResults([]);

    const activeSearchMode = forcedMode || searchMode;

    if (!userPmKey) {
      triggerToast('Premiumize API Key is missing. Showing simulated mock results. Configure in Settings.', 'warning');
    } else if (activeSearchMode === 'torrent' && !userJackettUrl) {
      triggerToast('Jackett URL is missing. Showing simulated mock torrents. Configure in Settings.', 'warning');
    }

    // STRICT PRIVACY COMPLIANCE RULE:
    // Do NOT save search queries to history if they are in the Adult category.
    if (category !== 'Adult') {
      const updatedQueries = [currentQuery, ...recentSearches.filter(q => q !== currentQuery)].slice(0, 8);
      setRecentSearches(updatedQueries);
      localStorage.setItem('premium_search_recent_queries', JSON.stringify(updatedQueries));
    } else {
      console.log('🛡️ Privacy Filter: Adult category query omitted from search history.');
    }

    try {
      const activeProf = profiles.find(p => p.id === activeProfileId);
      if (activeProf && activeProf.isKids && (category === 'Movies' || category === 'TV')) {
        try {
          const metadataUrl = `/api/metadata?title=${encodeURIComponent(currentQuery)}&category=${category}`;
          const metaRes = await fetchWithCredentials(metadataUrl);
          if (metaRes.ok) {
            const metaData = await metaRes.json();
            if (metaData.status === 'success' && metaData.metadata) {
              const allowed = isRatingAllowed(metaData.metadata.certification, category, activeProf);
              if (!allowed) {
                triggerToast(` Blocked: "${metaData.metadata.title}"is rated ${metaData.metadata.certification || 'Unrated'} and cannot be searched.`, 'error');
                setLoading(false);
                return;
              }
            }
          }
        } catch (err) {
          console.error('Failed search rating verification:', err.message);
        }
      }
      const fetchUrl = activeSearchMode === 'usenet'
        ? `/api/usenet/search?q=${encodeURIComponent(currentQuery)}&category=${category}`
        : `/api/search?q=${encodeURIComponent(currentQuery)}&category=${category}`;

      const res = await fetchWithCredentials(fetchUrl);
      if (!res.ok) throw new Error('Search request failed.');
      
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error(err);
      setSearchError(err.message || 'Search request failed.');
      triggerToast(`Search failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Trigger Download to Premiumize (With fallback to .torrent file URL)
  const triggerDownload = async (torrent) => {
    if (!userPmKey) {
      triggerToast('Premiumize API Key is required to download files. Please configure it in onboarding/settings.', 'error');
      setShowOnboarding(true);
      setOnboardingStep(1);
      return;
    }
    const downloadSource = torrent.magnet || torrent.torrentFile;
    if (!downloadSource) {
      triggerToast('No download link or magnet available for this item.', 'error');
      return;
    }

    const activeProf = profiles.find(p => p.id === activeProfileId);
    if (activeProf && activeProf.isKids && (category === 'Movies' || category === 'TV' || torrent.category === 'Movies' || torrent.category === 'TV')) {
      const activeCat = torrent.category || category;
      try {
        const metadataUrl = `/api/metadata?title=${encodeURIComponent(torrent.title || torrent.name)}&category=${activeCat}`;
        const metaRes = await fetchWithCredentials(metadataUrl);
        if (metaRes.ok) {
          const metaData = await metaRes.json();
          if (metaData.status === 'success' && metaData.metadata) {
            const allowed = isRatingAllowed(metaData.metadata.certification, activeCat, activeProf);
            if (!allowed) {
              triggerToast(` Blocked: "${metaData.metadata.title}"is rated ${metaData.metadata.certification || 'Unrated'} and cannot be added.`, 'error');
              return;
            }
          }
        }
      } catch (err) {
        console.error('Failed download rating verification:', err.message);
      }
    }

    // Identify this specific item uniquely
    const itemIdentifier = torrent.infoHash || torrent.magnet || torrent.torrentFile;
    setActiveDownloadId(itemIdentifier);

    try {
      const res = await fetchWithCredentials('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: downloadSource })
      });

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        throw new Error(`Failed to parse server response: ${res.statusText} (${res.status})`);
      }

      if (!res.ok) {
        throw new Error(data.error || data.message || `Server error: ${res.status}`);
      }

      if (data.status === 'success') {
        triggerToast(`Successfully sent "${torrent.title}" to Premiumize!`, 'success');
        
        // Immediately set cached to true in both search results and library states
        setResults(prev => prev.map(item => {
          if ((item.magnet && item.magnet === torrent.magnet) || (item.torrentFile && item.torrentFile === torrent.torrentFile)) {
            return { ...item, cached: true };
          }
          return item;
        }));
        setLibraryList(prev => {
          const updated = prev.map(item => {
            if ((item.magnet && item.magnet === torrent.magnet) || (item.torrentFile && item.torrentFile === torrent.torrentFile)) {
              return { ...item, cached: true };
            }
            return item;
          });
          localStorage.setItem('premium_search_library', JSON.stringify(updated));
          return updated;
        });
        
        // STRICT PRIVACY COMPLIANCE RULE:
        // Do NOT store adult downloads in any local history logs.
        if (torrent.category !== 'Adult') {
          const newHistory = [
            {
              title: torrent.title,
              infoHash: torrent.infoHash || 'N/A',
              size: torrent.size,
              timestamp: new Date().toISOString()
            },
            ...recentDownloads
          ].slice(0, 10);
          setRecentDownloads(newHistory);
          localStorage.setItem('premium_search_downloads', JSON.stringify(newHistory));
        } else {
          console.log('🛡️ Privacy Filter: Adult category transfer omitted from local download history.');
        }

      } else {
        throw new Error(data.message || 'Unknown response from Premiumize.');
      }
    } catch (err) {
      console.error(err);
      triggerToast(err.message, 'error');
    } finally {
      setActiveDownloadId(null);
    }
  };

  // Trigger Direct CDN Download (Bypasses PM Cloud box to save personal space)
  const triggerDirectDownload = async (torrent) => {
    const downloadSource = torrent.magnet || torrent.torrentFile || torrent.link;
    if (!downloadSource) {
      triggerToast('No download source link available.', 'error');
      return;
    }

    // If it's a direct cloud link or HTTP resource, download/open it directly
    if (torrent.isCloudFile || (downloadSource && (downloadSource.startsWith('http://') || downloadSource.startsWith('https://')) && !downloadSource.includes('magnet:'))) {
      triggerToast(` Downloading: ${torrent.title || torrent.name || 'Cloud File'}`, 'success');
      window.open(downloadSource, '_blank');
      return;
    }

    setPlayerLoading(true);
    triggerToast('Fetching direct high-speed CDN links...', 'success');

    try {
      const res = await fetchWithCredentials('/api/stream-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: downloadSource, password: torrent.password })
      });

      if (!res.ok) throw new Error('Failed to fetch direct download links.');

      const data = await res.json();

      if (data.status === 'success' && data.files && data.files.length > 0) {
        const targetFiles = data.files.filter(f => f.type !== 'subtitle');
        
        if (targetFiles.length === 1) {
          const dlLink = targetFiles[0].link;
          triggerToast(` Downloading: ${targetFiles[0].name}`, 'success');
          window.open(dlLink, '_blank');
        } else if (targetFiles.length > 1) {
          triggerToast(` Starting batch download for ${targetFiles.length} files...`, 'success');
          targetFiles.forEach((file, index) => {
            // Stagger window.open slightly to bypass browser pop-up blockers
            setTimeout(() => {
              window.open(file.link, '_blank');
            }, index * 400);
          });
        } else {
          throw new Error('No files found inside this release.');
        }
      } else {
        throw new Error(data.message || 'Failed to resolve high-speed direct CDN links.');
      }
    } catch (err) {
      console.error(err);
      triggerToast(err.message, 'error');
    } finally {
      setPlayerLoading(false);
    }
  };

  // Trigger Instant Stream Playback
  const startStreaming = async (torrent, seekTimeSec = 0, resumeFileName = null) => {
    if (!userPmKey) {
      triggerToast('Premiumize API Key is required to stream files. Please configure it in onboarding/settings.', 'error');
      setShowOnboarding(true);
      setOnboardingStep(1);
      return;
    }
    const downloadSource = torrent.magnet || torrent.torrentFile || torrent.link;
    if (!downloadSource) {
      triggerToast('No streamable link available for this item.', 'error');
      return;
    }

    const activeProf = profiles.find(p => p.id === activeProfileId);
    if (activeProf && activeProf.isKids && (category === 'Movies' || category === 'TV' || torrent.category === 'Movies' || torrent.category === 'TV')) {
      const activeCat = torrent.category || category;
      try {
        const metadataUrl = `/api/metadata?title=${encodeURIComponent(torrent.title || torrent.name)}&category=${activeCat}`;
        const metaRes = await fetchWithCredentials(metadataUrl);
        if (metaRes.ok) {
          const metaData = await metaRes.json();
          if (metaData.status === 'success' && metaData.metadata) {
            const allowed = isRatingAllowed(metaData.metadata.certification, activeCat, activeProf);
            if (!allowed) {
              triggerToast(` Blocked: "${metaData.metadata.title}"is rated ${metaData.metadata.certification || 'Unrated'} and cannot be played.`, 'error');
              return;
            }
          }
        }
      } catch (err) {
        console.error('Failed playback rating verification:', err.message);
      }
    }

    setPlayerLoading(true);
    setActivePlayerTorrent(torrent);
    setActiveRetroTorrent(null); // Clear active retro arcade session
    setSelectedRetroRomFile(null);
    setPlayerFiles([]);
    setSelectedVideoFile(null);
    setSelectedSubtitleFile(null);
    setSubtitleTrackUrl(null);
    setResumeTime(seekTimeSec); // Track if we need to seek on load

    // If it's a direct cloud file link (starts with http/https and is not a magnet), bypass API backend stream-link parsing
    if (torrent.isCloudFile || (downloadSource && (downloadSource.startsWith('http://') || downloadSource.startsWith('https://')) && !downloadSource.includes('magnet:'))) {
      const files = torrent.files || [{
        name: torrent.title || torrent.name || 'Cloud Video',
        link: downloadSource,
        size: torrent.size || 0,
        type: 'video',
        id: torrent.id || null
      }];
      
      setPlayerFiles(files);
      
      const videos = files.filter(f => f.type === 'video');
      const selectedVideo = videos.length > 0 ? videos[0] : files[0];
      
      const ext = selectedVideo.name.split('.').pop().toLowerCase();
      const isUnplayable = ['avi', 'mkv', 'ts', 'divx', 'xvid'].includes(ext);
      
      if (isUnplayable && !torrent.forceBrowser) {
        setPendingPlaylistFiles(files);
        setPendingPlaylistName(torrent.title || torrent.name || selectedVideo.name);
        setPendingItemId(selectedVideo.id || torrent.id || null);
        setPendingItemType(selectedVideo.id || torrent.id ? 'file' : 'torrent');
        setHasAviOrMkvInPending(true);
        setPlayerLoading(false);
        setShowPlaylistChoiceModal(true);
        return;
      }

      setSelectedVideoFile(selectedVideo);
      
      // Auto-select subtitle if available
      const subtitles = files.filter(f => f.type === 'subtitle');
      if (subtitles.length > 0) {
        setSelectedSubtitleFile(subtitles[0]);
      }
      
      setPlayerLoading(false);
      return;
    }

    try {
      const res = await fetchWithCredentials('/api/stream-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: downloadSource, password: torrent.password })
      });

      if (!res.ok) throw new Error('Failed to fetch streaming links.');

      const data = await res.json();

      if (data.status === 'success') {
        const files = data.files || [];
        
        // Sort files naturally so episodes and season files are listed in sequential order
        files.sort((a, b) => {
          const aName = a.name.split('/').pop().toLowerCase();
          const bName = b.name.split('/').pop().toLowerCase();
          return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
        });
        
        setPlayerFiles(files);
        
        // Find and select the correct video file to play/resume
        const videos = files.filter(f => f.type === 'video');
        let selectedVideo = null;
        if (videos.length > 0) {
          selectedVideo = videos[0];
          if (resumeFileName) {
            const matched = videos.find(v => v.name === resumeFileName);
            if (matched) selectedVideo = matched;
          }
        } else {
          throw new Error('No streamable video files found in this release.');
        }

        const ext = selectedVideo.name.split('.').pop().toLowerCase();
        const isUnplayable = ['avi', 'mkv', 'ts', 'divx', 'xvid'].includes(ext);
        
        if (isUnplayable && !torrent.forceBrowser) {
          setPendingPlaylistFiles(files);
          setPendingPlaylistName(torrent.title || torrent.name || selectedVideo.name);
          setPendingItemId(null);
          setPendingItemType('torrent');
          setHasAviOrMkvInPending(true);
          setPlayerLoading(false);
          setShowPlaylistChoiceModal(true);
          return;
        }

        setSelectedVideoFile(selectedVideo);

        // Auto-select the matching subtitle track for the active video file
        const subtitles = files.filter(f => f.type === 'subtitle');
        if (subtitles.length > 0 && selectedVideo) {
          const videoEp = matchEpisode(selectedVideo.name);
          let matchedSub = null;
          if (videoEp) {
            matchedSub = subtitles.find(s => matchEpisode(s.name) === videoEp);
          }
          if (!matchedSub) {
            const cleanVideoName = selectedVideo.name.split('.')[0].toLowerCase();
            matchedSub = subtitles.find(s => s.name.toLowerCase().includes(cleanVideoName) || cleanVideoName.includes(s.name.split('.')[0].toLowerCase()));
          }
          if (!matchedSub) {
            const vidIdx = videos.indexOf(selectedVideo);
            if (vidIdx !== -1 && subtitles[vidIdx]) {
              matchedSub = subtitles[vidIdx];
            }
          }
          setSelectedSubtitleFile(matchedSub || subtitles[0]);
        } else {
          setSelectedSubtitleFile(null);
        }
      } else {
        throw new Error(data.message || 'Streaming extraction failed.');
      }
    } catch (err) {
      console.error(err);
      triggerToast(err.message, 'error');
      setActivePlayerTorrent(null);
    } finally {
      setPlayerLoading(false);
    }
  };

  // Helper: Map ROM extensions to target EmulatorJS console systems

  // Trigger Retro Emulation Arcade Playback
  const startRetroPlayer = async (torrent, resumeLink = null) => {
    const downloadSource = torrent.magnet || torrent.torrentFile;
    if (!downloadSource) {
      triggerToast('No ROM download link available.', 'error');
      return;
    }

    setPlayerLoading(true);
    setActivePlayerTorrent(null); // Clear video player
    setSelectedVideoFile(null);
    setSelectedSubtitleFile(null);
    setSubtitleTrackUrl(null);
    
    setActiveRetroTorrent(torrent);
    setSelectedRetroRomFile(null);

    try {
      // If it's a direct cloud file link (starts with http/https and is not a magnet), bypass API backend stream-link parsing
      if (torrent.isCloudFile || (downloadSource && (downloadSource.startsWith('http://') || downloadSource.startsWith('https://')) && !downloadSource.includes('magnet:'))) {
        const playableFile = {
          name: torrent.title || torrent.name || 'ROM Game',
          link: downloadSource,
          size: torrent.size || 0
        };
        setRetroPlayableFiles([playableFile]);
        setSelectedRetroRomFile(playableFile);
        setPlayerLoading(false);
        return;
      }

      const res = await fetchWithCredentials('/api/stream-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: downloadSource, password: torrent.password })
      });

      if (!res.ok) throw new Error('Failed to extract ROM links.');

      const data = await res.json();

      if (data.status === 'success') {
        const files = data.files || [];
        
        // Find a valid ROM file or a Zip file inside the torrent
        const playableFiles = files.filter(f => {
          const name = f.name.toLowerCase();
          return getEmulatorSystem(name) !== null || name.endsWith('.zip');
        });

        if (playableFiles.length === 0) {
          throw new Error('No compatible retro ROM files or ZIP packages found in this release.');
        }

        // Sort files in natural numerical order
        playableFiles.sort((a, b) => {
          const aName = a.name.split('/').pop().toLowerCase();
          const bName = b.name.split('/').pop().toLowerCase();
          return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
        });

        // Robust Resume Auto-Selection: match saved progress file link
        const targetLink = resumeLink || (continueWatchingList.find(p => cleanUrl(p.parentTitle) === cleanUrl(torrent.title))?.link);
        const targetFile = targetLink ? playableFiles.find(f => cleanUrl(f.link) === cleanUrl(targetLink)) : null;

        setRetroPlayableFiles(playableFiles);
        setSelectedRetroRomFile(targetFile || playableFiles[0]);
      } else {
        throw new Error(data.message || 'ROM extraction failed.');
      }
    } catch (err) {
      console.error(err);
      triggerToast(err.message, 'error');
      setActiveRetroTorrent(null);
    } finally {
      setPlayerLoading(false);
    }
  };

  // Trigger EBook Reader Playback
  const startEbookPlayer = async (torrent, resumeLink = null, resumeChapterIdx = null, resumeScroll = null) => {
    const downloadSource = torrent.magnet || torrent.torrentFile || torrent.link;
    if (!downloadSource) {
      triggerToast('No eBook download link available.', 'error');
      return;
    }

    setPlayerLoading(true);
    setActivePlayerTorrent(null); // Clear video player
    setSelectedVideoFile(null);
    setSelectedSubtitleFile(null);
    setSubtitleTrackUrl(null);
    setActiveRetroTorrent(null); // Clear retro player
    setSelectedRetroRomFile(null);

    setActiveEbookTorrent(torrent);
    setSelectedEbookFile(null);
    setEbookPlayableFiles([]);
    setEbookSearchQuery('');
    setResumeEbookChapter(resumeChapterIdx);
    setResumeEbookScroll(resumeScroll);

    // If it's a direct cloud file link (starts with http/https and is not a magnet), bypass API backend stream-link parsing
    if (torrent.isCloudFile || (downloadSource && (downloadSource.startsWith('http://') || downloadSource.startsWith('https://')) && !downloadSource.includes('magnet:'))) {
      const playableFile = {
        name: torrent.title || torrent.name || 'eBook File',
        link: downloadSource,
        size: torrent.size || 0
      };
      setEbookPlayableFiles([playableFile]);
      setSelectedEbookFile(playableFile);
      setPlayerLoading(false);
      return;
    }

    try {
      const res = await fetchWithCredentials('/api/stream-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: downloadSource, password: torrent.password })
      });

      if (!res.ok) throw new Error('Failed to extract eBook links.');

      const data = await res.json();

      if (data.status === 'success') {
        const files = data.files || [];
        
        // Find EPUB or PDF files inside the torrent
        const playableFiles = files.filter(f => {
          const name = f.name.toLowerCase();
          return name.endsWith('.epub') || name.endsWith('.pdf');
        });

        if (playableFiles.length === 0) {
          throw new Error('No compatible EPUB or PDF eBook files found in this release.');
        }

        // Sort files in natural numerical order
        playableFiles.sort((a, b) => {
          const aName = a.name.split('/').pop().toLowerCase();
          const bName = b.name.split('/').pop().toLowerCase();
          return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
        });

        // Robust Resume Auto-Selection: match saved progress file link
        const targetLink = resumeLink || (continueWatchingList.find(p => cleanUrl(p.parentTitle) === cleanUrl(torrent.title))?.link);
        const targetFile = targetLink ? playableFiles.find(f => cleanUrl(f.link) === cleanUrl(targetLink)) : null;

        // Auto-resolve chapter index and scroll top dynamically if not passed
        const finalFile = targetFile || playableFiles[0];
        let finalChapter = resumeChapterIdx;
        let finalScroll = resumeScroll;

        const activeProgress = continueWatchingList.find(p => cleanUrl(p.link) === cleanUrl(finalFile.link));
        if (activeProgress) {
          if (finalChapter === null && activeProgress.chapterIndex !== undefined) {
            finalChapter = activeProgress.chapterIndex;
          }
          if (finalScroll === null && activeProgress.scrollTop !== undefined) {
            finalScroll = activeProgress.scrollTop;
          }
        }

        setResumeEbookChapter(finalChapter);
        setResumeEbookScroll(finalScroll);

        setEbookPlayableFiles(playableFiles);
        setSelectedEbookFile(finalFile);
      } else {
        throw new Error(data.message || 'eBook extraction failed.');
      }
    } catch (err) {
      console.error(err);
      triggerToast(err.message, 'error');
      setActiveEbookTorrent(null);
    } finally {
      setPlayerLoading(false);
    }
  };

  // Trigger Audio / Audiobook Player Playback
  const startAudioPlayer = async (torrent, resumeLink = null, resumeTimeSec = 0) => {
    const downloadSource = torrent.magnet || torrent.torrentFile || torrent.link;
    if (!downloadSource) {
      triggerToast('No audio download link available.', 'error');
      return;
    }

    setPlayerLoading(true);
    setActivePlayerTorrent(null); // Clear video player
    setSelectedVideoFile(null);
    setSelectedSubtitleFile(null);
    setSubtitleTrackUrl(null);
    setActiveRetroTorrent(null); // Clear retro player
    setSelectedRetroRomFile(null);
    setActiveEbookTorrent(null); // Clear eBook reader
    setSelectedEbookFile(null);

    setActiveAudioTorrent(torrent);
    setSelectedAudioFile(null);
    setAudioPlayableFiles([]);
    setAudioSearchQuery('');
    setResumeAudioTime(resumeTimeSec);

    // If it's a direct cloud file link (starts with http/https and is not a magnet), bypass API backend stream-link parsing
    if (torrent.isCloudFile || (downloadSource && (downloadSource.startsWith('http://') || downloadSource.startsWith('https://')) && !downloadSource.includes('magnet:'))) {
      const files = torrent.files || [{
        name: torrent.title || torrent.name || 'Cloud Audio',
        link: downloadSource,
        size: torrent.size || 0
      }];
      setAudioPlayableFiles(files);
      const activeIdx = torrent.activeIndex !== undefined ? torrent.activeIndex : 0;
      setSelectedAudioFile(files[activeIdx] || files[0]);
      setPlayerLoading(false);
      return;
    }

    try {
      const res = await fetchWithCredentials('/api/stream-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: downloadSource, password: torrent.password })
      });

      if (!res.ok) throw new Error('Failed to extract audio links.');

      const data = await res.json();

      if (data.status === 'success') {
        const files = data.files || [];
        
        // Find audio files inside the torrent
        const playableFiles = files.filter(f => {
          const name = f.name.toLowerCase();
          return name.endsWith('.mp3') || name.endsWith('.m4b') || name.endsWith('.flac') || name.endsWith('.wav') || name.endsWith('.m4a') || name.endsWith('.ogg') || name.endsWith('.wma');
        });

        if (playableFiles.length === 0) {
          throw new Error('No compatible audio files (.mp3, .m4b, .flac, .wav, .m4a, .ogg, .wma) found in this release.');
        }

        // Sort files by folder path and filename in natural numerical order
        playableFiles.sort((a, b) => {
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase(), undefined, { numeric: true, sensitivity: 'base' });
        });

        // Robust Resume Auto-Selection: match saved progress file link
        const targetLink = resumeLink || (continueWatchingList.find(p => cleanUrl(p.parentTitle) === cleanUrl(torrent.title))?.link);
        let targetFile = targetLink ? playableFiles.find(f => cleanUrl(f.link) === cleanUrl(targetLink)) : null;

        // Fallback: match by clean filename if dynamic CDN path parameters mutated
        if (!targetFile && targetLink) {
          const cleanName = (url) => {
            try {
              return decodeURIComponent(url).split('/').pop().split('?')[0].toLowerCase();
            } catch(e) {
              return url.split('/').pop().split('?')[0].toLowerCase();
            }
          };
          const targetFileName = cleanName(targetLink);
          targetFile = playableFiles.find(f => cleanName(f.link) === targetFileName);
        }

        // Auto-resolve audio track and time dynamically if not passed
        const finalFile = targetFile || playableFiles[0];
        let finalTime = resumeTimeSec;

        const activeProgress = continueWatchingList.find(p => cleanUrl(p.link) === cleanUrl(finalFile.link));
        if (activeProgress && activeProgress.currentTime !== undefined) {
          if (!finalTime) finalTime = activeProgress.currentTime;
        }

        setResumeAudioTime(finalTime);
        setAudioPlayableFiles(playableFiles);
        setSelectedAudioFile(finalFile);
      } else {
        throw new Error(data.message || 'Audio extraction failed.');
      }
    } catch (err) {
      console.error(err);
      triggerToast(err.message, 'error');
      setActiveAudioTorrent(null);
    } finally {
      setPlayerLoading(false);
    }
  };

  // Seek video by offset seconds
  const seekVideo = (seconds) => {
    const video = document.querySelector('.main-video-player');
    if (video) {
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    }
  };

  // --- Continue Watching & Autoplay logic ---
  const handleTimeUpdate = (e) => {
    const video = e.target;
    if (!video || !selectedVideoFile || !activePlayerTorrent) return;

    // STRICT PRIVACY COMPLIANCE RULE: NEVER save Adult content progress in Continue Watching
    if (activePlayerTorrent.category === 'Adult') return;

    const currentSecs = video.currentTime;
    const totalSecs = video.duration;

    // IntroDB Skip Intro Trigger
    if (introSegment) {
      if (currentSecs >= introSegment.start && currentSecs <= introSegment.end) {
        if (autoSkipEnabled) {
          video.currentTime = introSegment.end;
          triggerToast("Auto-skipped intro!", "success");
          setIntroSegment(null);
          setShowSkipButton(false);
        } else if (!showSkipButton && skipTimer === 0) {
          setShowSkipButton(true);
          setSkipTimer(10);
        }
      } else if (showSkipButton && (currentSecs < introSegment.start || currentSecs > introSegment.end)) {
        setShowSkipButton(false);
      }
    }

    if (totalSecs > 0 && currentSecs > 10) { // Start saving after 10 seconds of playback
      const progressPercent = (currentSecs / totalSecs) * 100;
      
      // If completed > 97% and it's a TV show, check for autoplay next episode
      if (progressPercent > 97) {
        const cat = activePlayerTorrent.category || 'Movies';
        if (cat === 'TV') {
          const videos = playerFiles.filter(f => f.type === 'video');
          const currentIndex = videos.findIndex(v => v.link === selectedVideoFile.link);
          const nextVideo = (currentIndex !== -1 && currentIndex < videos.length - 1) ? videos[currentIndex + 1] : null;

          if (nextVideo && !showAutoplayOverlay && !autoplayDeclinedRef.current) {
            setNextEpisodeFile(nextVideo);
            setShowAutoplayOverlay(true);
            setAutoplayCountdown(15);
          }
        }
        
        removeFromContinueWatching(selectedVideoFile.link);
        return;
      }

      const updatedList = [
        {
          title: selectedVideoFile.name,
          parentTitle: activePlayerTorrent.title,
          link: selectedVideoFile.link,
          torrent: activePlayerTorrent,
          category: activePlayerTorrent.category, // Explicitly save category
          currentTime: currentSecs,
          duration: totalSecs,
          percent: progressPercent,
          timestamp: Date.now()
        },
        ...continueWatchingList.filter(item => cleanUrl(item.link) !== cleanUrl(selectedVideoFile.link))
      ].slice(0, 12);

      setContinueWatchingList(updatedList);
      localStorage.setItem('premium_search_continue_watching', JSON.stringify(updatedList));
    }
  };

  // --- Continue-Watching removal tombstones (so deletions survive a merge) ---
  const tombstoneKeyFor = (pid) => `premium_search_cw_removed_${pid || activeProfileId}`;
  const readTombstones = (pid) => {
    try { return JSON.parse(localStorage.getItem(tombstoneKeyFor(pid)) || '[]'); } catch { return []; }
  };
  const recordTombstone = (fileLink, pid = activeProfileId) => {
    const merged = mergeTombstoneLists(readTombstones(pid), [{ link: cleanUrl(fileLink), removedAt: Date.now() }]);
    localStorage.setItem(tombstoneKeyFor(pid), JSON.stringify(merged));
    return merged;
  };

  const removeFromContinueWatching = (fileLink) => {
    const updated = continueWatchingList.filter(item => cleanUrl(item.link) !== cleanUrl(fileLink));
    setContinueWatchingList(updated);
    localStorage.setItem('premium_search_continue_watching', JSON.stringify(updated));
    recordTombstone(fileLink); // remember the deletion so a peer sync can't resurrect it
    syncToCloud(libraryList, updated); // Sync deletion to cloud immediately!
  };

  const handleVideoLoadedMetadata = (e) => {
    if (resumeTime > 0) {
      e.target.currentTime = resumeTime;
      setResumeTime(0); // Clear after seek
    }
  };

  const handleVideoEnded = () => {
    if (!selectedVideoFile || !activePlayerTorrent) return;
    const cat = activePlayerTorrent.category || 'Movies';
    if (cat === 'TV') {
      const videos = playerFiles.filter(f => f.type === 'video');
      const currentIndex = videos.findIndex(v => v.link === selectedVideoFile.link);
      const nextVideo = (currentIndex !== -1 && currentIndex < videos.length - 1) ? videos[currentIndex + 1] : null;
      if (nextVideo) {
        triggerToast(` Playing next episode: ${nextVideo.name.split('/').pop()}`, 'success');
        setSelectedVideoFile(nextVideo);
      }
    }
  };

  // --- My Library logic ---
  const isItemInLibrary = (item) => {
    return libraryList.some(libItem => 
      (libItem.magnet && libItem.magnet === item.magnet) || 
      (libItem.torrentFile && libItem.torrentFile === item.torrentFile)
    );
  };

  const toggleLibraryItem = (torrent) => {
    const alreadyIn = isItemInLibrary(torrent);

    if (alreadyIn) {
      const updated = libraryList.filter(item => 
        !(item.magnet === torrent.magnet && item.torrentFile === torrent.torrentFile)
      );
      setLibraryList(updated);
      localStorage.setItem('premium_search_library', JSON.stringify(updated));
      triggerToast('Removed from your Library.', 'success');
      syncToCloud(updated, continueWatchingList); // Sync to Premiumize Cloud
    } else {
      // Adult items are saved normally, but their visibility in the Library is governed by privacy settings
      const entry = {
        title: torrent.title,
        magnet: torrent.magnet,
        torrentFile: torrent.torrentFile,
        size: torrent.size,
        seeders: torrent.seeders,
        peers: torrent.peers,
        category: torrent.category,
        tracker: torrent.tracker,
        cached: torrent.cached,
        publishDate: torrent.publishDate,
        timestamp: Date.now()
      };

      const updated = [entry, ...libraryList];
      setLibraryList(updated);
      localStorage.setItem('premium_search_library', JSON.stringify(updated));
      triggerToast('Added to your Library!', 'success');
      syncToCloud(updated, continueWatchingList); // Sync to Premiumize Cloud
    }
  };

  // --- Custom Playlists Logic ---
  const createPlaylistAndAdd = (name, track) => {
    if (!name.trim()) return;
    if (playlists.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      triggerToast("A playlist with that name already exists.", "error");
      return;
    }
    const newPl = {
      name: name.trim(),
      tracks: [
        {
          name: track.displayName || track.name.split('/').pop(),
          link: track.link,
          size: track.size || 0,
          torrent: track.torrent || activeAudioTorrent // Store the parent torrent
        }
      ]
    };
    const updated = [...playlists, newPl];
    setPlaylists(updated);
    localStorage.setItem('premium_search_playlists', JSON.stringify(updated));
    syncToCloud(libraryList, continueWatchingList, updated);
    setPlaylistSelectionTrack(null);
    triggerToast(`Added to new playlist "${name}"!`, "success");
  };

  const addTrackToPlaylist = (name, track) => {
    const updated = playlists.map(p => {
      if (p.name === name) {
        // Prevent duplicates inside the playlist
        const exists = p.tracks.some(t => cleanUrl(t.link) === cleanUrl(track.link));
        if (exists) {
          triggerToast("This track is already in the playlist.", "error");
          return p;
        }
        return {
          ...p,
          tracks: [
            ...p.tracks,
            {
              name: track.displayName || track.name.split('/').pop(),
              link: track.link,
              size: track.size || 0,
              torrent: track.torrent || activeAudioTorrent
            }
          ]
        };
      }
      return p;
    });
    
    // Check if it was actually added (didn't return early due to duplicates)
    const targetPl = playlists.find(p => p.name === name);
    const updatedPl = updated.find(p => p.name === name);
    if (targetPl && updatedPl && updatedPl.tracks.length > targetPl.tracks.length) {
      triggerToast(`Added to playlist "${name}"!`, "success");
      setPlaylistSelectionTrack(null);
    }
    
    setPlaylists(updated);
    localStorage.setItem('premium_search_playlists', JSON.stringify(updated));
    syncToCloud(libraryList, continueWatchingList, updated);
  };

  const removeTrackFromPlaylist = (playlistName, trackIndex) => {
    const updated = playlists.map(p => {
      if (p.name === playlistName) {
        return {
          ...p,
          tracks: p.tracks.filter((_, idx) => idx !== trackIndex)
        };
      }
      return p;
    });
    setPlaylists(updated);
    localStorage.setItem('premium_search_playlists', JSON.stringify(updated));
    syncToCloud(libraryList, continueWatchingList, updated);
    triggerToast("Track removed from playlist.", "success");
  };

  const deletePlaylist = (playlistName) => {
    const updated = playlists.filter(p => p.name !== playlistName);
    setPlaylists(updated);
    localStorage.setItem('premium_search_playlists', JSON.stringify(updated));
    syncToCloud(libraryList, continueWatchingList, updated);
    triggerToast(`Playlist "${playlistName}" deleted.`, "success");
  };

  const playPlaylist = async (playlist) => {
    if (playlist.tracks.length === 0) {
      triggerToast("This playlist has no tracks.", "error");
      return;
    }
    
    setPlayerLoading(true);
    setActiveAudioTorrent({ title: `Playlist: ${playlist.name}`, category: 'Music' }); // Set virtual torrent
    setSelectedAudioFile(null);
    setAudioPlayableFiles([]);
    setResumeAudioTime(0);
    
    try {
      triggerToast("Resolving latest Premiumize CDN links for playlist...", "success");
      
      // 1. Identify all unique parent torrents in the playlist
      const uniqueTorrentsMap = {};
      playlist.tracks.forEach(track => {
        if (track.torrent) {
          const id = track.torrent.infoHash || track.torrent.magnet || track.torrent.torrentFile;
          if (id) {
            uniqueTorrentsMap[id] = track.torrent;
          }
        }
      });
      
      const uniqueTorrents = Object.values(uniqueTorrentsMap);
      
      // 2. Fetch fresh CDN links for all these torrents in parallel!
      const resolvedTorrents = {};
      await Promise.all(
        uniqueTorrents.map(async (torrent) => {
          const downloadSource = torrent.magnet || torrent.torrentFile;
          if (!downloadSource) return;
          
          try {
            const res = await fetchWithCredentials('/api/stream-links', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ magnet: downloadSource, password: torrent.password })
            });
            
            if (res.ok) {
              const data = await res.json();
              if (data.status === 'success' && data.files) {
                const id = torrent.infoHash || torrent.magnet || torrent.torrentFile;
                resolvedTorrents[id] = data.files;
              }
            }
          } catch (e) {
            console.error(`Error resolving links for torrent ${torrent.title}:`, e.message);
          }
        })
      );
      
      // 3. Re-assemble the playlist tracks with fresh CDN links!
      const freshTracks = playlist.tracks.map(track => {
        const id = track.torrent?.infoHash || track.torrent?.magnet || track.torrent?.torrentFile;
        const parentFiles = resolvedTorrents[id];
        
        let freshLink = track.link; // Fallback
        if (parentFiles) {
          // Match by filename
          const cleanName = (url) => {
            try {
              return decodeURIComponent(url).split('/').pop().split('?')[0].toLowerCase();
            } catch(e) {
              return url.split('/').pop().split('?')[0].toLowerCase();
            }
          };
          const targetName = cleanName(track.link);
          const matchedFile = parentFiles.find(f => cleanName(f.link) === targetName);
          if (matchedFile) {
            freshLink = matchedFile.link;
          }
        }
        
        return {
          name: track.name,
          link: freshLink,
          size: track.size,
          torrent: track.torrent // Maintain original torrent object
        };
      });
      
      setAudioPlayableFiles(freshTracks);
      setSelectedAudioFile(freshTracks[0]);
      
    } catch (err) {
      console.error("Failed to play playlist:", err);
      triggerToast("Failed to resolve streaming links for this playlist.", "error");
    } finally {
      setPlayerLoading(false);
    }
  };

  // Delete individual query pill from history
  const deleteHistoryItem = (e, queryToRemove) => {
    e.stopPropagation(); // Avoid triggering search when clicking the X
    const updated = recentSearches.filter(q => q !== queryToRemove);
    setRecentSearches(updated);
    localStorage.setItem('premium_search_recent_queries', JSON.stringify(updated));
    triggerToast('Search term removed from history.', 'success');
  };

  // Clear local search histories
  const clearHistory = async () => {
    localStorage.removeItem('premium_search_recent_queries');
    localStorage.removeItem('premium_search_downloads');
    localStorage.removeItem('premium_search_continue_watching');
    localStorage.removeItem('premium_search_library');
    localStorage.removeItem('premio_ai_copilot_messages');
    setRecentSearches([]);
    setRecentDownloads([]);
    setContinueWatchingList([]);
    setLibraryList([]);
    setCopilotMessages([
      { role: 'assistant', content: 'Hello! I am your Premio AI Co-pilot. How can I help you manage your library or recommend something to stream today?'}
    ]);
    
    try {
      // Overwrite the cloud sync file with empty states to purge data on Premiumize
      await fetchWithCredentials('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryList: [], continueWatchingList: [] })
      });
      setLastSynced(new Date());
      triggerToast('All local logs and Premiumize Cloud records cleared successfully!', 'success');
    } catch (err) {
      console.error('Failed to clear cloud sync:', err.message);
      triggerToast('Local logs cleared, but cloud sync wipe encountered an error.', 'error');
    }
  };

  // --- Premiumize AI Helper Functions ---
  const fetchAiModels = async () => {
    if (!aiToken) {
      triggerToast('Please enter your Premiumize.ai JWT Token first.', 'error');
      return;
    }
    setFetchingModels(true);
    try {
      const res = await fetch(`/api/ai/models?token=${encodeURIComponent(aiToken)}`);
      if (!res.ok) {
        throw new Error('Failed to fetch models from Premiumize.ai proxy');
      }
      const data = await res.json();
      const models = data.models || data.data || [];
      const formattedModels = models.map(m => ({
        id: m.id,
        name: m.name || m.id,
        owned_by: m.owned_by || 'unknown'
      }));
      if (formattedModels.length > 0) {
        setAiModelsList(formattedModels);
        localStorage.setItem('premio_ai_models_list', JSON.stringify(formattedModels));
        triggerToast(`Successfully loaded ${formattedModels.length} AI models!`, 'success');
        
        if (!formattedModels.find(m => m.id === aiModel)) {
          setAiModel(formattedModels[0].id);
          localStorage.setItem('premio_ai_model', formattedModels[0].id);
        }
      } else {
        triggerToast('No models found in your Premiumize.ai list.', 'warning');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Failed to fetch models. Check your token.', 'error');
    } finally {
      setFetchingModels(false);
    }
  };

  const handleAiSemanticSearch = async (e) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;
    if (!aiEnabled || !aiToken) {
      triggerToast('AI is disabled or token is missing. Please check settings.', 'error');
      return;
    }
    setLoading(true);
    triggerToast('AI is interpreting your search phrase...', 'info');
    try {
      const systemPrompt = "You are a movie and TV show search assistant. The user will give you a conceptual description, recommendation request, or search phrase.\nYour job is to translate it into one or more exact, clean movie or TV show titles.\nIf the request is for a single movie/show (e.g., 'the nolan movie about dreams'), output just the clean title (e.g., 'Inception').\nIf the request implies multiple movies/shows (e.g., 'top 5 horror movies this year' or 'recommend 3 sci-fi movies'), determine the matching list of titles, and output them separated by '|||' (e.g., 'A Quiet Place: Day One ||| Smile 2 ||| Heretic ||| Longlegs ||| Oddity').\nOutput ONLY the title(s) separated by '|||' if multiple. No extra text, no markdown, no explanations, no numbering, and no quotes. Keep it strictly to the exact titles.";
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ];
      
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: aiToken,
          model: aiModel,
          messages: messages
        })
      });
      
      if (!res.ok) {
        throw new Error('AI Semantic Search request failed');
      }
      
      const data = await res.json();
      const rawContent = data.choices?.[0]?.message?.content?.trim();
      if (!rawContent) {
        throw new Error('Invalid response from AI');
      }

      const sanitized = rawContent.replace(/^["']|["']$/g, '').trim();
      const titles = sanitized.split('|||').map(t => t.trim().replace(/^["']|["']$/g, '').trim()).filter(Boolean);

      if (titles.length === 0) {
        throw new Error('No titles returned by AI');
      }

      if (titles.length === 1) {
        const singleTitle = titles[0];
        setQuery(singleTitle);
        triggerToast(` Translated to: "${singleTitle}"`, 'success');
        handleSearch(null, null, singleTitle);
      } else {
        // Multi-search mode!
        const friendlyQuery = titles.join(' & ');
        setQuery(friendlyQuery);
        setSearched(true);
        setResults([]);
        triggerToast(` Searching for ${titles.length} titles concurrently: ${titles.slice(0, 3).join(', ')}${titles.length > 3 ? '...': ''}`, 'info');

        const activeSearchMode = searchMode;
        const fetchPromises = titles.map(async (title) => {
          try {
            const fetchUrl = activeSearchMode === 'usenet'
              ? `/api/usenet/search?q=${encodeURIComponent(title)}&category=${category}`
              : `/api/search?q=${encodeURIComponent(title)}&category=${category}`;
            
            const searchRes = await fetchWithCredentials(fetchUrl);
            if (!searchRes.ok) throw new Error(`Search failed for ${title}`);
            const searchData = await searchRes.json();
            return Array.isArray(searchData) ? searchData : [];
          } catch (fetchErr) {
            console.error(`Fetch failed for title "${title}":`, fetchErr.message);
            return [];
          }
        });

        const resultsLists = await Promise.all(fetchPromises);
        const combinedResults = resultsLists.flat();

        // Deduplicate combined results by torrent unique identifiers
        const uniqueResultsMap = new Map();
        combinedResults.forEach(item => {
          const id = item.infoHash || item.magnet || item.torrentFile || item.title;
          if (id && !uniqueResultsMap.has(id)) {
            uniqueResultsMap.set(id, item);
          }
        });
        const finalResults = Array.from(uniqueResultsMap.values());

        setResults(finalResults);
        triggerToast(` Found ${finalResults.length} releases across all ${titles.length} searches!`, 'success');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Failed to perform AI search. Check your token or connection.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAICleanName = async (originalName, setNameCallback) => {
    if (!aiEnabled || !aiToken) {
      triggerToast('AI is disabled or token is missing. Please check settings.', 'error');
      return;
    }
    setAiLoading(true);
    try {
      const systemPrompt = "You are a specialized filename cleaner. Your task is to take a messy movie, TV show, folder, or media release filename, clean it up to be human-readable, and output ONLY the cleaned name. Strip out resolution (1080p, 4k, etc.), source (WEB-DL, BluRay, HDTV), codecs (x264, h265, HEVC), release groups (EDITH, GalaxyTV, Joy, AVS), format extensions (.mkv, .mp4, .avi), and replace periods or underscores with spaces. Keep the title, season and episode numbers (e.g. S01E02), and release year if present. Never output any introductory text, explanation, warnings, or punctuation. If you cannot clean it, return the input name exactly.";
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Clean up this name: "${originalName}"` }
      ];
      
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: aiToken,
          model: aiModel,
          messages: messages
        })
      });
      
      if (!res.ok) {
        throw new Error('AI request failed');
      }
      
      const data = await res.json();
      const cleaned = data.choices?.[0]?.message?.content?.trim();
      if (cleaned) {
        const sanitized = cleaned.replace(/^["']|["']$/g, '').trim();
        setNameCallback(sanitized);
        triggerToast('Filename cleaned by AI!', 'success');
      } else {
        throw new Error('Empty response from AI');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Failed to clean filename with AI.', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAICuratePlaylist = async () => {
    if (!aiToken || !aiCuratePrompt.trim()) {
      triggerToast('Please configure AI token and enter a curation request.', 'error');
      return;
    }
    setAiLoading(true);
    try {
      const fileNames = pendingPlaylistFiles.map((f, i) => `${i}: ${f.name}`).join('\n');
      const systemPrompt = "You are an expert playlist curator. You receive a list of files in a directory in the format 'index: filename'. Your task is to filter, select, or sort these files based on the user's specific request. You MUST respond with ONLY a valid JSON array containing the indices of the matching files in the requested order (e.g., [0, 2, 5]). Do not include any explanation, code blocks, or formatting. Only return the JSON array of numbers. If no files match, return an empty array [].";
      const userContent = `Here is the playlist file list:\n${fileNames}\n\nUser request: "${aiCuratePrompt}"`;
      
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ];
      
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: aiToken,
          model: aiModel,
          messages: messages
        })
      });
      
      if (!res.ok) {
        throw new Error('AI curation request failed');
      }
      
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (content) {
        const jsonStr = content.replace(/```json|```/g, '').trim();
        const indices = JSON.parse(jsonStr);
        if (Array.isArray(indices)) {
          const curatedFiles = indices
            .map(idx => pendingPlaylistFiles[Number(idx)])
            .filter(f => f !== undefined);
             
          if (curatedFiles.length > 0) {
            setPendingPlaylistFiles(curatedFiles);
            triggerToast(` AI Playlist Curation applied: Kept ${curatedFiles.length} of ${pendingPlaylistFiles.length} items!`, 'success');
            setShowAICurateInput(false);
          } else {
            triggerToast('AI curation returned 0 matching files.', 'warning');
          }
        } else {
          throw new Error('AI did not return a valid array');
        }
      } else {
        throw new Error('Empty response from AI');
      }
    } catch (err) {
      console.error(err);
      triggerToast('Failed to apply AI curation. Please check your request formatting.', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const handleNewChat = () => {
    localStorage.removeItem('premio_ai_copilot_messages');
    setCopilotMessages([
      { role: 'assistant', content: 'Hello! I am your Premio AI Co-pilot. How can I help you manage your library or recommend something to stream today?' }
    ]);
    triggerToast('Started a new chat session.', 'success');
  };

  const handleSendCopilotMessage = async () => {
    if (!copilotInput.trim()) return;
    if (!aiToken) {
      triggerToast('Please configure your Premiumize.ai JWT Token first.', 'error');
      return;
    }
    
    const userMsg = { role: 'user', content: copilotInput.trim() };
    const updatedMessages = [...copilotMessages, userMsg];
    setCopilotMessages(updatedMessages);
    setCopilotInput('');
    setAiLoading(true);
    
    try {
      const systemMessage = {
        role: 'system',
        content: "You are Premio Co-pilot, a helpful AI assistant built into Premio (a debrid cache streaming dashboard). You help the user manage their cloud locker, search for media, curate sleep show playlists, and recommend movies or shows. Keep your responses friendly, concise, and formatted in Markdown. If the user asks about playlists, mention that they can curate M3U files natively in the Choose Playback Mode modal using AI!"
      };
      
      const payloadMessages = [
        systemMessage,
        ...updatedMessages.filter(m => m.role !== 'system')
      ];
      
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: aiToken,
          model: aiModel,
          messages: payloadMessages
        })
      });
      
      if (!res.ok) {
        throw new Error('AI chat request failed');
      }
      
      const data = await res.json();
      const assistantText = data.choices?.[0]?.message?.content;
      if (assistantText) {
        const newHistory = [...updatedMessages, { role: 'assistant', content: assistantText }];
        setCopilotMessages(newHistory);
        localStorage.setItem('premio_ai_copilot_messages', JSON.stringify(newHistory));
      } else {
        throw new Error('No content returned');
      }
    } catch (err) {
      console.error(err);
      const errorHistory = [...updatedMessages, { role: 'assistant', content: 'Sorry, I encountered an error connecting to the Premiumize AI service. Please check your token in the settings.'}];
      setCopilotMessages(errorHistory);
    } finally {
      setAiLoading(false);
    }
  };

  // Filter category list based on adult toggle setting
  const visibleCategories = CATEGORIES.filter(c => !(c === 'Adult' && hideAdult));

  // --- Filtering & Sorting Machinery (Real-Time Frontend Calculations) ---
  
  const getSortedResults = () => {
    return [...results].sort((a, b) => {
      const isUsenet = searchMode === 'usenet' || a.nzbUrl !== undefined;
      
      switch (sortBy) {
        case 'cached-seeders':
          if (isUsenet) {
            return (Number(b.grabs) || 0) - (Number(a.grabs) || 0);
          }
          if (a.cached && !b.cached) return -1;
          if (!a.cached && b.cached) return 1;
          return (Number(b.seeders) || 0) - (Number(a.seeders) || 0);
        case 'seeders':
          if (isUsenet) {
            return (Number(b.grabs) || 0) - (Number(a.grabs) || 0);
          }
          return (Number(b.seeders) || 0) - (Number(a.seeders) || 0);
        case 'size-desc':
          return b.size - a.size;
        case 'size-asc':
          return a.size - b.size;
        case 'date':
          if (isUsenet) {
            return (Number(a.ageDays) || 0) - (Number(b.ageDays) || 0);
          }
          return new Date(b.publishDate || 0) - new Date(a.publishDate || 0);
        default:
          return 0;
      }
    });
  };

  const getFilteredResults = () => {
    const sorted = getSortedResults();
    
    return sorted.filter(item => {
      const isUsenet = searchMode === 'usenet' || item.nzbUrl !== undefined;
      
      // 1. Resolution / Quality filter
      if (filterQuality !== 'All') {
        const titleLower = item.title.toLowerCase();
        if (filterQuality === '4K' && !/\b(4k|2160p|uhd)\b/i.test(titleLower)) return false;
        if (filterQuality === '1080p' && !/\b(1080p|fhd)\b/i.test(titleLower)) return false;
        if (filterQuality === '720p' && !/\b(720p|hd)\b/i.test(titleLower)) return false;
      }

      // 2. Max Size filter
      if (filterMaxSize < 100) {
        const maxBytes = filterMaxSize * 1024 * 1024 * 1024;
        if (item.size > maxBytes) return false;
      }

      // 3. Min Seeders filter (Skip for Usenet NZBs)
      if (!isUsenet && item.seeders < filterMinSeeders) return false;

      // 4. Excluded Keywords filter
      if (excludeKeywords.trim()) {
        const titleLower = item.title.toLowerCase();
        const keywords = excludeKeywords.toLowerCase().split(',').map(kw => kw.trim()).filter(Boolean);
        if (keywords.some(kw => titleLower.includes(kw))) return false;
      }

      return true;
    });
  };

  // (filteredRetroFiles moved into RetroPlayerModal)

  // (filteredEbookFiles moved into EbookReaderModal)

  // (filteredAudioFiles moved into AudioPlayerModal)

  // Filter library items by active sub-tab category shelf
  const filteredLibraryList = libraryList.filter(item => {
    // Globally hide adult items from library views if adult settings are hidden/locked
    if (item.category === 'Adult' && (!adultControlsUnlocked || hideAdult)) {
      return false;
    }
    if (librarySubTab === 'All') return true;
    if (librarySubTab === 'Other') {
      return item.category === 'Other' || item.category === 'Music';
    }
    return item.category === librarySubTab;
  });

  const processedResults = getFilteredResults();

  // Incremental rendering: start each new result set at one batch.
  useEffect(() => { setVisibleCount(RESULTS_BATCH); }, [rawResults, searchMode]);

  // Reveal more cards as the sentinel scrolls into view (IntersectionObserver).
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount(c => c + RESULTS_BATCH);
    }, { rootMargin: '600px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [visibleCount, processedResults.length]);

  // Calculate cached count for stats indicator
  const cachedCount = processedResults.filter(item => item.cached).length;

  // (showDetails + showRecapOption moved into VideoPlayerModal)

  const showPicker = isProfilePickerOpen || !activeProfileId;

  return (
    <div className="app-container">

      {/* Reveal-keys PIN gate — shown when revealing API keys on a PIN-locked profile */}
      {showKeysPinPrompt && (
        <div className="modal-overlay fade-in" role="dialog" aria-modal="true" aria-label="Enter PIN to reveal keys"
          style={{ position: 'fixed', inset: 0, zIndex: 10000, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="profile-pin-card glass-panel fade-in"
            style={{ padding: '2.5rem 2rem', borderRadius: '16px', maxWidth: '340px', width: '90%', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.6)', border: '1px solid var(--glass-border)', background: 'var(--panel-glass)' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-primary-glow)', color: 'var(--color-primary)', animation: revealPinError ? 'shake 0.5s' : 'none' }}>
              <Icon name="eye" size={30} />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', color: 'var(--text-primary)' }}>Enter PIN to Reveal Keys</h3>
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>This profile is PIN-locked. Enter the PIN to show your API keys.</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginBottom: '1.75rem' }}>
              {[0, 1, 2, 3].map(idx => {
                const filled = revealPinInput.length > idx;
                return <div key={idx} className={`pin-dot ${filled ? 'filled' : ''} ${revealPinError ? 'shake-pin' : ''}`}
                  style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid var(--glass-border)', backgroundColor: filled ? 'var(--color-primary)' : 'transparent', boxShadow: filled ? '0 0 10px var(--color-primary)' : 'none', transition: 'all 0.15s ease' }} />;
              })}
            </div>
            <input type="text" pattern="\d*" maxLength={4} autoFocus value={revealPinInput}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').substring(0, 4);
                setRevealPinInput(val);
                setRevealPinError(false);
                if (val.length === 4) submitRevealPin(val);
              }}
              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', maxWidth: '200px', margin: '0 auto' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button key={num} className="glass-panel"
                  onClick={() => {
                    if (revealPinInput.length < 4) {
                      const val = revealPinInput + num;
                      setRevealPinInput(val);
                      if (val.length === 4) submitRevealPin(val);
                    }
                  }}
                  style={{ fontSize: '1.2rem', fontWeight: 'bold', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white', cursor: 'pointer' }}>
                  {num}
                </button>
              ))}
              <button onClick={() => { setShowKeysPinPrompt(false); setRevealPinInput(''); setRevealPinError(false); }}
                style={{ fontSize: '0.8rem', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', background: 'rgba(255,255,255,0.02)', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button className="glass-panel"
                onClick={() => {
                  if (revealPinInput.length < 4) {
                    const val = revealPinInput + '0';
                    setRevealPinInput(val);
                    if (val.length === 4) submitRevealPin(val);
                  }
                }}
                style={{ fontSize: '1.2rem', fontWeight: 'bold', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white', cursor: 'pointer' }}>
                0
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Selection Overlay */}
      {showPicker && (
        <div className="modal-overlay profile-picker-overlay fade-in" style={{ zIndex: '9999', backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(25px)' }}>
          <div className="profile-picker-container" role="dialog" aria-modal="true" aria-label="Choose a profile" style={{ textAlign: 'center', maxWidth: '800px', width: '95%', margin: '0 auto' }}>
            
            {pinTargetProfile ? (
              // PIN Entry Dialog
              <div className="profile-pin-card glass-panel fade-in" style={{ padding: '2.5rem 2rem', borderRadius: '16px', maxWidth: '360px', margin: '0 auto', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.6)', border: '1px solid var(--glass-border)', background: 'var(--panel-glass)' }}>
                <div 
                  className={`profile-avatar-large ${pinTargetProfile.color}`}
                  style={{
                    width: '90px',
                    height: '90px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '3.5rem',
                    margin: '0 auto 1.5rem auto',
                    boxShadow: '0 8px 25px rgba(0,0,0,0.3)',
                    animation: pinError ? 'shake 0.5s' : 'none'
                  }}
                >
                  {pinTargetProfile.avatar}
                </div>
                
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', color: 'var(--text-primary)' }}>Profile Lock</h3>
                <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Enter PIN to access <strong>{pinTargetProfile.name}</strong>
                </p>

                {/* PIN dots container */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginBottom: '2rem' }}>
                  {[0, 1, 2, 3].map(idx => {
                    const filled = pinInput.length > idx;
                    return (
                      <div 
                        key={idx}
                        className={`pin-dot ${filled ? 'filled' : ''} ${pinError ? 'shake-pin' : ''}`}
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          border: '2px solid var(--glass-border)',
                          backgroundColor: filled ? 'var(--color-primary, #9333ea)' : 'transparent',
                          boxShadow: filled ? '0 0 10px var(--color-primary, #9333ea)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      />
                    );
                  })}
                </div>

                {/* Hidden input to capture physical keyboard input */}
                <input
                  type="text"
                  pattern="\d*"
                  maxLength={4}
                  autoFocus
                  value={pinInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').substring(0, 4);
                    setPinInput(val);
                    setPinError(false);
                    
                    if (val.length === 4) {
                      if (val === pinTargetProfile.pin) {
                        if (pinTargetAction === 'edit') {
                          startEditProfile(pinTargetProfile);
                        } else {
                          switchProfile(pinTargetProfile.id);
                          setIsProfilePickerOpen(false);
                        }
                        setPinTargetProfile(null);
                      } else {
                        setPinError(true);
                        triggerToast('Incorrect PIN. Please try again.', 'error');
                        setTimeout(() => {
                          setPinInput('');
                          setPinError(false);
                        }, 600);
                      }
                    }
                  }}
                  style={{
                    position: 'absolute',
                    opacity: 0,
                    pointerEvents: 'none'
                  }}
                />

                {/* Virtual Keypad */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', maxWidth: '200px', margin: '0 auto 1.5rem auto' }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                    <button
                      key={num}
                      onClick={() => {
                        if (pinInput.length < 4) {
                          const val = pinInput + num;
                          setPinInput(val);
                          if (val.length === 4) {
                            if (val === pinTargetProfile.pin) {
                              if (pinTargetAction === 'edit') {
                                startEditProfile(pinTargetProfile);
                              } else {
                                switchProfile(pinTargetProfile.id);
                                setIsProfilePickerOpen(false);
                              }
                              setPinTargetProfile(null);
                            } else {
                              setPinError(true);
                              triggerToast('Incorrect PIN. Please try again.', 'error');
                              setTimeout(() => {
                                setPinInput('');
                                setPinError(false);
                              }, 600);
                            }
                          }
                        }
                      }}
                      className="glass-panel"
                      style={{
                        fontSize: '1.2rem',
                        fontWeight: 'bold',
                        borderRadius: '50%',
                        width: '48px',
                        height: '48px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--glass-border)',
                        color: 'white',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {num}
                    </button>
                  ))}
                  
                  {/* Cancel button */}
                  <button
                    onClick={() => {
                      setPinTargetProfile(null);
                      setPinInput('');
                    }}
                    style={{
                      fontSize: '0.8rem',
                      borderRadius: '50%',
                      width: '48px',
                      height: '48px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto',
                      background: 'rgba(255,255,255,0.02)',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>

                  {/* 0 Key */}
                  <button
                    onClick={() => {
                      if (pinInput.length < 4) {
                        const val = pinInput + '0';
                        setPinInput(val);
                        if (val.length === 4) {
                          if (val === pinTargetProfile.pin) {
                            if (pinTargetAction === 'edit') {
                              startEditProfile(pinTargetProfile);
                            } else {
                              switchProfile(pinTargetProfile.id);
                              setIsProfilePickerOpen(false);
                            }
                            setPinTargetProfile(null);
                          } else {
                            setPinError(true);
                            triggerToast('Incorrect PIN. Please try again.', 'error');
                            setTimeout(() => {
                              setPinInput('');
                              setPinError(false);
                            }, 600);
                          }
                        }
                      }
                    }}
                    className="glass-panel"
                    style={{
                      fontSize: '1.2rem',
                      fontWeight: 'bold',
                      borderRadius: '50%',
                      width: '48px',
                      height: '48px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--glass-border)',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    0
                  </button>

                  {/* Backspace Key */}
                  <button
                    onClick={() => {
                      setPinInput(prev => prev.slice(0, -1));
                    }}
                    style={{
                      fontSize: '1rem',
                      borderRadius: '50%',
                      width: '48px',
                      height: '48px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto',
                      background: 'rgba(255,255,255,0.02)',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    <Icon name="backspace" size={20} />
                  </button>
                </div>
              </div>
            ) : editingProfile ? (
              // Edit/Create Profile Form
              <div className="profile-edit-card glass-panel" style={{ padding: '2rem', borderRadius: '16px', position: 'relative', textAlign: 'left' }}>
                <h2 style={{ marginTop: '0', marginBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                  {editingProfile.id === 'new'? 'Create Profile': 'Edit Profile'}
                </h2>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* Name field */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Profile Name</label>
                    <input 
                      type="text" 
                      value={editName} 
                      onChange={(e) => setEditName(e.target.value)} 
                      placeholder="e.g. Guest" 
                      className="settings-text-input"
                      maxLength={15}
                      style={{ fontSize: '1rem', padding: '10px 14px' }}
                    />
                  </div>
                  
                  {/* Avatar & Color Picker */}
                  <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                    
                    {/* Preview circle */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Preview</span>
                      <div 
                        className={`profile-avatar-large ${editColor}`}
                        style={{
                          width: '80px',
                          height: '80px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '3rem',
                          boxShadow: '0 8px 20px rgba(0,0,0,0.3)'
                        }}
                      >
                        {editAvatar}
                      </div>
                    </div>
                    
                    {/* Emoji Select */}
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Choose Avatar Icon</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {EMOJIS.map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setEditAvatar(emoji)}
                            style={{
                              fontSize: '1.5rem',
                              width: '40px',
                              height: '40px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: editAvatar === emoji ? '2px solid var(--color-primary)' : '1px solid var(--glass-border)',
                              borderRadius: '8px',
                              background: editAvatar === emoji ? 'var(--color-primary-glow)' : 'transparent',
                              cursor: 'pointer',
                              color: 'var(--text-primary)',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Gradient Select */}
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Choose Theme Gradient</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {GRADIENTS.map(grad => (
                          <button
                            key={grad.class}
                            type="button"
                            onClick={() => setEditColor(grad.class)}
                            className={`profile-color-selector ${grad.class}`}
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              border: editColor === grad.class ? '3px solid var(--text-primary)' : '1px solid rgba(255,255,255,0.1)',
                              cursor: 'pointer',
                              boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)',
                              transition: 'all 0.2s ease'
                            }}
                            title={grad.name}
                          />
                        ))}
                      </div>
                    </div>
                    
                  </div>
                  
                  {/* Kids Mode Toggle */}
                  <div className="glass-panel" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--panel-glass)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ margin: '0', fontSize: '0.9rem'}}> Kids Mode (Parental Controls)</h4>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Hides adult content, applies strict keyword filters, disables dev tools, and restricts trackers.
                        </p>
                      </div>
                      <label className="switch">
                        <input 
                          type="checkbox" 
                          checked={editIsKids} 
                          onChange={(e) => setEditIsKids(e.target.checked)}
                        />
                        <span className="slider round"></span>
                      </label>
                    </div>

                    {editIsKids && (
                      <div className="kids-trackers-whitelist" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '12px', marginTop: '4px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                          Allowed Trackers & Indexers (empty means all)
                        </span>
                        
                        {/* Tracker Checklist */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                          {COMMON_TRACKERS.map(tracker => {
                            const isChecked = editAllowedTrackers.includes(tracker);
                            return (
                              <label key={tracker} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setEditAllowedTrackers(editAllowedTrackers.filter(t => t !== tracker));
                                    } else {
                                      setEditAllowedTrackers([...editAllowedTrackers, tracker]);
                                    }
                                  }}
                                />
                                {tracker}
                              </label>
                            );
                          })}
                          {userIndexers.map(idx => {
                            const isChecked = editAllowedTrackers.includes(idx.name);
                            return (
                              <label key={idx.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setEditAllowedTrackers(editAllowedTrackers.filter(t => t !== idx.name));
                                    } else {
                                      setEditAllowedTrackers([...editAllowedTrackers, idx.name]);
                                    }
                                  }}
                                />
                                 {idx.name}
                              </label>
                            );
                          })}
                        </div>

                        {/* Custom Tracker input */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Or add custom tracker names (comma-separated):</label>
                          <input
                            type="text"
                            placeholder="e.g. Rarbg, YggTorrent"
                            value={customTrackerInput}
                            onChange={(e) => setCustomTrackerInput(e.target.value)}
                            className="settings-text-input small"
                          />
                        </div>

                        {/* Rating Limits Config */}
                        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '12px', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                            Age Rating Limits (TMDb verification)
                          </span>
                          
                          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '120px' }}>
                              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Max Movie Rating</label>
                              <select 
                                value={editMaxMovieRating} 
                                onChange={(e) => setEditMaxMovieRating(e.target.value)}
                                className="theme-dropdown-select"
                                style={{ width: '100%', padding: '6px', fontSize: '0.8rem' }}
                              >
                                <option value="G">G</option>
                                <option value="PG">PG</option>
                                <option value="PG-13">PG-13</option>
                                <option value="R">R</option>
                                <option value="Any">Any (No Movie Limit)</option>
                              </select>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '120px' }}>
                              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Max TV Rating</label>
                              <select 
                                value={editMaxTvRating} 
                                onChange={(e) => setEditMaxTvRating(e.target.value)}
                                className="theme-dropdown-select"
                                style={{ width: '100%', padding: '6px', fontSize: '0.8rem' }}
                              >
                                <option value="TV-G">TV-G</option>
                                <option value="TV-PG">TV-PG</option>
                                <option value="TV-14">TV-14</option>
                                <option value="TV-MA">TV-MA</option>
                                <option value="Any">Any (No TV Limit)</option>
                              </select>
                            </div>
                          </div>
                          
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', cursor: 'pointer', marginTop: '4px' }}>
                            <input
                              type="checkbox"
                              checked={editBlockUnrated}
                              onChange={(e) => setEditBlockUnrated(e.target.checked)}
                            />
                            Block Unrated/Not Rated Content
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* PIN Lock Toggle */}
                  <div className="glass-panel" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--panel-glass)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ margin: '0', fontSize: '0.9rem'}}> Profile PIN Lock</h4>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Requires a 4-digit PIN to access this profile.
                        </p>
                      </div>
                      <label className="switch">
                        <input 
                          type="checkbox" 
                          checked={editEnablePin} 
                          onChange={(e) => {
                            setEditEnablePin(e.target.checked);
                            if (!e.target.checked) setEditPin('');
                          }}
                        />
                        <span className="slider round"></span>
                      </label>
                    </div>

                    {editEnablePin && (
                      <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '12px', marginTop: '4px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                          Enter 4-Digit PIN
                        </label>
                        <input
                          type="text"
                          pattern="\d*"
                          maxLength={4}
                          placeholder="e.g. 1234"
                          value={editPin}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setEditPin(val);
                          }}
                          className="settings-text-input"
                          style={{ width: '100px', fontSize: '1.2rem', letterSpacing: '8px', textAlign: 'center', padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '4px', color: 'white' }}
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Actions buttons */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '1rem' }}>
                    <div>
                      {editingProfile.id !== 'new' && profiles.length > 1 && (
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete profile "${editingProfile.name}"? All local history for this profile will be removed.`)) {
                              deleteProfileHandler(editingProfile.id);
                            }
                          }}
                          style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                        >
                           Delete Profile
                        </button>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        className="danger-btn text-only"
                        onClick={() => setEditingProfile(null)}
                        style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="action-btn"
                        onClick={saveProfileHandler}
                        style={{ padding: '8px 24px', fontSize: '0.9rem', fontWeight: 'bold' }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                  
                </div>
              </div>
            ) : (
              // Netflix style Profile Grid
              <div className="profile-selector-view">
                <h1 style={{ fontSize: '2.5rem', marginBottom: '2.5rem', fontWeight: 'bold', textShadow: '0 4px 10px rgba(0,0,0,0.4)', color: 'var(--text-primary)' }}>
                  {isManagingProfiles ? 'Manage Profiles' : "Who's watching?"}
                </h1>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '2.5rem', marginBottom: '3.5rem' }}>
                  {profiles.map(p => (
                    <div 
                      key={p.id} 
                      className={`profile-card ${isManagingProfiles ? 'managing' : ''}`}
                      onClick={() => {
                        handleProfileSelect(p.id, isManagingProfiles ? 'edit' : 'switch');
                      }}
                      style={{
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px',
                        width: '120px'
                      }}
                    >
                      <div style={{ position: 'relative' }}>
                        <div 
                          className={`profile-avatar ${p.color}`}
                          style={{
                            width: '100px',
                            height: '100px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '3.5rem',
                            boxShadow: '0 8px 25px rgba(0,0,0,0.3)',
                            border: p.id === activeProfileId && !isManagingProfiles ? '4px solid var(--color-primary)' : '3px solid transparent'
                          }}
                        >
                          {p.avatar}
                          
                          {p.isKids && (
                            <span 
                              style={{
                                position: 'absolute',
                                bottom: '-4px',
                                right: '-4px',
                                background: 'var(--color-primary)',
                                padding: '2px 6px',
                                borderRadius: '10px',
                                fontSize: '0.65rem',
                                fontWeight: 'bold',
                                color: 'white',
                                boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
                              }}
                            >
                              KIDS
                            </span>
                          )}
                        </div>

                        {isManagingProfiles && (
                          <div 
                            style={{
                              position: 'absolute',
                              top: 0, left: 0, width: '100%', height: '100%',
                              background: 'rgba(0,0,0,0.6)',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.5rem',
                              color: 'white'
                            }}
                          >
                            <Icon name="pencil" size={22} />
                          </div>
                        )}
                      </div>
                      
                      <span 
                        style={{ 
                          fontSize: '1.05rem', 
                          fontWeight: '500', 
                          color: p.id === activeProfileId && !isManagingProfiles ? 'var(--color-primary)' : 'var(--text-primary)',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {p.name}
                      </span>
                    </div>
                  ))}
                  
                  {isManagingProfiles && (
                    <div 
                      className="profile-card add-profile"
                      onClick={() => startEditProfile({ id: 'new', name: '', avatar: '🦁', color: 'avatar-grad-purple-pink', isKids: false, allowedTrackers: [] })}
                      style={{
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px',
                        width: '120px'
                      }}
                    >
                      <div 
                        style={{
                          width: '100px',
                          height: '100px',
                          borderRadius: '50%',
                          border: '3px dashed var(--glass-border)',
                          background: 'rgba(255,255,255,0.03)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '3rem',
                          color: 'var(--text-muted)',
                          transition: 'all 0.3s ease'
                        }}
                        className="avatar-add-button"
                      >
                        ＋
                      </div>
                      <span style={{ fontSize: '1.05rem', fontWeight: '500', color: 'var(--text-muted)' }}>
                        Add Profile
                      </span>
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setIsManagingProfiles(!isManagingProfiles)}
                    style={{ padding: '10px 24px', fontSize: '1rem', border: '1px solid var(--text-muted)', borderRadius: '4px', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
                  >
                    {isManagingProfiles ? 'Done' : 'Manage Profiles'}
                  </button>
                  
                  {activeProfileId && (
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() => setIsProfilePickerOpen(false)}
                      style={{ padding: '10px 24px', fontSize: '1rem' }}
                    >
                      Go Back
                    </button>
                  )}
                </div>
              </div>
            )}
            
          </div>
        </div>
      )}
      
      {/* a11y: always-present live region so screen readers announce every toast
          (the visual toast below is mounted/unmounted, which SRs don't reliably read). */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {toast ? toast.message : ''}
      </div>

      {/* Toast Notification Banner */}
      {toast && (
        <div className={`toast-notification toast-${toast.type}`}>
          <div className="toast-icon">
            <Icon name={toast.type === 'success' ? 'check' : toast.type === 'info' ? 'info' : 'alert-triangle'} size={18} />
          </div>
          <div className="toast-text">{toast.message}</div>
        </div>
      )}

      {/* Header Panel */}
      <header className="app-header">
        <div className="logo-group" onClick={handleLogoClick} style={{ cursor: 'pointer' }} title="Premio">
          <h1>Premio</h1>
        </div>
        <p className="app-tagline">Real-Time Premiumize & Usenet (Newznab) Aggregator • Personal Cloud Media Center</p>

        {/* Global Toolbar */}
        <div className="header-actions">
          {/* Profile Switcher Header Widget */}
          {activeProfileId && (
            <div className="header-profile-menu-container" ref={profileDropdownRef} style={{ position: 'relative', marginRight: '0.5rem' }}>
              <button
                className="header-profile-trigger"
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--panel-glass)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '30px',
                  padding: '4px 12px 4px 6px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: '500',
                  height: '36px',
                  boxSizing: 'border-box'
                }}
              >
                <div 
                  className={`profile-avatar-mini ${activeProfile?.color || 'avatar-grad-purple-pink'}`}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    lineHeight: '1'
                  }}
                >
                  {activeProfile?.avatar || '🦁'}
                </div>
                <span>{activeProfile?.name || 'User'}</span>
                <span style={{ fontSize: '0.65rem', opacity: '0.7' }}>▼</span>
              </button>
              
              {isProfileDropdownOpen && (
                <div 
                  className="profile-dropdown-menu glass-panel"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: '0',
                    marginTop: '8px',
                    width: '180px',
                    zIndex: '1000',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '6px',
                    gap: '4px',
                    background: 'var(--panel-glass)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(20px)'
                  }}
                >
                  <div style={{ padding: '6px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--glass-border)', marginBottom: '4px', textAlign: 'left' }}>
                    Profiles
                  </div>
                  {profiles.map(p => (
                    <button
                      key={p.id}
                      className={`dropdown-profile-item ${p.id === activeProfileId ? 'active' : ''}`}
                      onClick={() => {
                        handleProfileSelect(p.id);
                        setIsProfileDropdownOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '6px 8px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '0.8rem'
                      }}
                    >
                      <span className={`profile-avatar-mini ${p.color}`} style={{ width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>
                        {p.avatar}
                      </span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name} {p.isKids && ''}
                      </span>
                    </button>
                  ))}
                  <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: '4px', paddingTop: '4px' }}>
                    <button
                      onClick={() => {
                        setIsProfilePickerOpen(true);
                        setIsProfileDropdownOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '6px 8px',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-primary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '0.8rem',
                        fontWeight: '500'
                      }}
                    >
                      <Icon name="users" size={16} style={{ display: 'inline-block', verticalAlign: '-3px', marginRight: '4px' }} /> Manage Profiles
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="theme-selector-container" style={{ marginRight: '0.5rem' }}>
            <select 
              value={selectedTheme} 
              onChange={(e) => {
                const newTheme = e.target.value;
                setSelectedTheme(newTheme);
                if (activeProfileId) {
                  syncToCloud(libraryList, continueWatchingList, playlists, newTheme);
                }
              }} 
              className="theme-dropdown-select"
              title="Switch Ambient UI Theme Preset"
            >
              <option value="midnight-nebula"> Midnight Nebula</option>
              <option value="nordic-frost"> Nordic Frost</option>
              <option value="retro-synthwave"> Retro Synthwave</option>
              <option value="obsidian-slate"> Obsidian Slate</option>
            </select>
          </div>

          <button
            className={`action-btn ${isSyncing ? 'loading' : ''}`}
            onClick={syncFromCloud}
            disabled={isSyncing}
            title="Sync your Library and checkpoints with Premiumize Cloud"
          >
            {isSyncing
              ? <><Icon name="refresh" size={16} className="spin" /> Syncing...</>
              : lastSynced
                ? <><Icon name="check" size={16} /> Cloud Synced</>
                : <><Icon name="cloud-up" size={16} /> Cloud Sync</>}
          </button>
          
          <button 
            className={`action-btn ${showSettings ? 'active' : ''}`} 
            onClick={() => {
              setShowSettings(!showSettings);
              if (showFilters) setShowFilters(false);
            }}
            aria-label="Toggle Settings"
            id="btn-settings"
          >
            <Icon name="settings" size={16} /> Settings
          </button>
        </div>
      </header>

      {/* Core Room Navigation Tabs */}
      <nav className="room-navigation glass-panel" aria-label="Primary">
        <button
          className={`nav-tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
          aria-label="Search"
          aria-current={activeTab === 'search' ? 'page' : undefined}
        >
          <Icon name="search" size={18} /> <span className="nav-tab-label">Search</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
          aria-label={`Library, ${libraryList.filter(item => !(item.category === 'Adult' && (!adultControlsUnlocked || hideAdult))).length} items`}
          aria-current={activeTab === 'library' ? 'page' : undefined}
        >
          <Icon name="bookmark" size={18} /> <span className="nav-tab-label">Library</span> <span className="nav-badge">{libraryList.filter(item => !(item.category === 'Adult' && (!adultControlsUnlocked || hideAdult))).length}</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'progress' ? 'active' : ''}`}
          onClick={() => setActiveTab('progress')}
          aria-label={`Continue watching, ${continueWatchingList.length} items`}
          aria-current={activeTab === 'progress' ? 'page' : undefined}
        >
          <Icon name="player-play" size={18} /> <span className="nav-tab-label">Continue</span> <span className="nav-badge">{continueWatchingList.length}</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'watchlist' ? 'active' : ''}`}
          onClick={() => setActiveTab('watchlist')}
          aria-label={`Watchlist, ${watchlist.length} items`}
          aria-current={activeTab === 'watchlist' ? 'page' : undefined}
        >
          <Icon name="bell" size={18} /> <span className="nav-tab-label">Watchlist</span> <span className="nav-badge">{watchlist.length}</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'cloud' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('cloud');
            fetchCloudFolder(null);
            fetchAccountQuota();
          }}
          aria-label="Cloud storage"
          aria-current={activeTab === 'cloud' ? 'page' : undefined}
        >
          <Icon name="folder" size={18} /> <span className="nav-tab-label">Cloud</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'transfers' ? 'active' : ''}`}
          onClick={() => setActiveTab('transfers')}
          aria-label="Transfers"
          aria-current={activeTab === 'transfers' ? 'page' : undefined}
        >
          <Icon name="cloud-up" size={18} /> <span className="nav-tab-label">Transfers</span>
        </button>
      </nav>

      <main className="app-main">
        
        {/* Settings Expander Card */}
        {showSettings && <SettingsPanel handleToggleShowKeys={handleToggleShowKeys} fetchAiModels={fetchAiModels} clearHistory={clearHistory} syncFromCloud={syncFromCloud} />}

        {/* tab: Torrent Searcher */}
        {activeTab === 'search' && <SearchPanel processedResults={processedResults} results={results} cachedCount={cachedCount} handleSearch={handleSearch} handleAiSemanticSearch={handleAiSemanticSearch} handleDragOver={handleDragOver} handleDragLeave={handleDragLeave} handleDrop={handleDrop} handleImportFile={handleImportFile} handleImportMagnet={handleImportMagnet} deleteHistoryItem={deleteHistoryItem} getMetadata={getMetadata} isItemInLibrary={isItemInLibrary} isInWatchlist={isInWatchlist} toggleLibraryItem={toggleLibraryItem} toggleWatchlist={toggleWatchlist} startStreaming={startStreaming} startAudioPlayer={startAudioPlayer} startEbookPlayer={startEbookPlayer} startRetroPlayer={startRetroPlayer} triggerDirectDownload={triggerDirectDownload} triggerDownload={triggerDownload} />}

        {/* Tab: My Library Bookshelf */}
        {activeTab === 'library' && <LibraryPanel filteredLibraryList={filteredLibraryList} getMetadata={getMetadata} startStreaming={startStreaming} startAudioPlayer={startAudioPlayer} startEbookPlayer={startEbookPlayer} startRetroPlayer={startRetroPlayer} triggerDirectDownload={triggerDirectDownload} toggleLibraryItem={toggleLibraryItem} playPlaylist={playPlaylist} deletePlaylist={deletePlaylist} removeTrackFromPlaylist={removeTrackFromPlaylist} />}

        {/* Tab: Watchlist */}
        {activeTab === 'watchlist' && <WatchlistPanel checkWatchlist={checkWatchlist} findWatchlistItem={findWatchlistItem} persistWatchlist={persistWatchlist} />}

        {/* Tab: Continue... Dashboard */}
        {activeTab === 'progress' && <ProgressPanel getMetadata={getMetadata} removeFromContinueWatching={removeFromContinueWatching} startStreaming={startStreaming} startAudioPlayer={startAudioPlayer} startEbookPlayer={startEbookPlayer} />}

        {/* Tab: Cloud Storage Manager */}
        {activeTab === 'cloud' && <CloudBrowserPanel buildFolderPlaylist={buildFolderPlaylist} fetchAccountQuota={fetchAccountQuota} fetchCloudFolder={fetchCloudFolder} handleAICleanName={handleAICleanName} handleCloudDelete={handleCloudDelete} handleCloudRename={handleCloudRename} handleCloudStream={handleCloudStream} />}
        {/* Tab: Active Downloads Transfer Manager */}
        {activeTab === 'transfers' && <TransfersPanel cancelTransfer={cancelTransfer} fetchActiveTransfers={fetchActiveTransfers} />}

        {/* Premium Streaming Video Player Modal */}
        <VideoPlayerModal syncToCloud={syncToCloud} handleTimeUpdate={handleTimeUpdate} handleVideoLoadedMetadata={handleVideoLoadedMetadata} handleVideoEnded={handleVideoEnded} handleSkipIntro={handleSkipIntro} handleToggleRecap={handleToggleRecap} fetchOnlineSubtitles={fetchOnlineSubtitles} selectOnlineSubtitle={selectOnlineSubtitle} />

        {/* Retro Arcade Player Modal */}
        <RetroPlayerModal />

        {/* EBook Reader Modal */}
        <EbookReaderModal />

        {/* Audio Player Modal */}
        <AudioPlayerModal syncToCloud={syncToCloud} />

        {/* Custom Playlist Selection Modal Overlay */}
        {playlistSelectionTrack && <PlaylistSelectorModal addTrackToPlaylist={addTrackToPlaylist} createPlaylistAndAdd={createPlaylistAndAdd} />}
        {/* Metadata Detail Drawer */}
        <DetailDrawer activeMeta={activeMeta} toggleReviews={toggleReviews} toggleLbReviews={toggleLbReviews} startRetroPlayer={startRetroPlayer} startEbookPlayer={startEbookPlayer} startAudioPlayer={startAudioPlayer} triggerDirectDownload={triggerDirectDownload} startStreaming={startStreaming} triggerDownload={triggerDownload} isItemInLibrary={isItemInLibrary} toggleLibraryItem={toggleLibraryItem} isInWatchlist={isInWatchlist} toggleWatchlist={toggleWatchlist} />

      </main>

      <footer className="app-footer">
        <p>Premio — Built by BioHapHazard • <button type="button"className="link-button footer-disclaimer-btn"onClick={() => setShowLegalDisclaimer(true)}> Legal Disclaimer & TOS</button></p>
        <p className="sub-footer">Stateless, fast, and secure API-driven interface</p>
      </footer>

      {/* Terms of Service & Legal Disclaimer Modal */}
      {showLegalDisclaimer && (
        <div className="modal-overlay legal-modal-overlay fade-in">
          <div className="modal-card legal-modal-card glass-panel" role="dialog" aria-modal="true" aria-label="Legal disclaimer and terms of service" style={{ maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2> Legal Disclaimer & Terms of Service</h2>
            </div>
            <div className="modal-body" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '12px', lineHeight: '1.4' }}>
              <p>
                Welcome to <strong>Premio</strong>. Before proceeding, please read and agree to the following terms:
              </p>
              
              <div className="legal-section" style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', borderLeft: '3px solid var(--color-primary)' }}>
                <h4 style={{ color: 'var(--text-primary)', margin: '0 0 4px 0' }}>1. Stateless Client Architecture</h4>
                <p style={{ margin: 0 }}>
                  Premio is a client-side user interface. All API credentials (including your Premiumize API Key, TMDb API Key, Jackett URLs, and Usenet indexer details) are stored exclusively in your browser&apos;s local storage. This application does not run a remote database and never logs, shares, or retains your keys on any external server.
                </p>
              </div>

              <div className="legal-section" style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', borderLeft: '3px solid var(--color-primary)' }}>
                <h4 style={{ color: 'var(--text-primary)', margin: '0 0 4px 0' }}>2. Third-Party Integrations</h4>
                <p style={{ margin: 0 }}>
                  All searches and indexer queries are executed client-side or proxies through your own self-configured third-party indexer endpoints. Premio does not host, index, or distribute any torrents, NZB files, or video content. Users are solely responsible for ensuring their searches comply with local regulations.
                </p>
              </div>

              <div className="legal-section" style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', borderLeft: '3px solid var(--color-primary)' }}>
                <h4 style={{ color: 'var(--text-primary)', margin: '0 0 4px 0' }}>3. Fair-Use Point System Notice</h4>
                <p style={{ margin: 0 }}>
                  Downloading or streaming items via Premiumize can deduct points from your Premiumize account quota according to their Fair-Use rules. In particular, non-cached downloads (like Usenet NZBs or unseeded torrents) incur points for both cloud downloading (1 pt/GB) and streaming (1 pt/GB). Premio is not responsible for any point consumption.
                </p>
              </div>

              <p style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                By checking the box below and clicking &quot;I Agree&quot;, you acknowledge that Premio is a stateless wrapper tool and agree to use it in accordance with applicable laws.
              </p>
            </div>
            
            <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  id="chk-agree-tos" 
                  defaultChecked={localStorage.getItem('premio_legal_acknowledged') === 'true'} 
                  onChange={(e) => {
                    if (e.target.checked) {
                      localStorage.setItem('premio_legal_acknowledged', 'true');
                    } else {
                      localStorage.removeItem('premio_legal_acknowledged');
                    }
                  }}
                />
                <span>I read, understand, and agree to the Terms of Service & Disclaimer.</span>
              </label>
              <button 
                type="button" 
                className="action-btn"
                id="btn-agree-tos"
                onClick={() => {
                  if (localStorage.getItem('premio_legal_acknowledged') !== 'true') {
                    triggerToast('Please check the agreement box to proceed.', 'error');
                    return;
                  }
                  setShowLegalDisclaimer(false);
                  triggerToast('Terms of Service acknowledged.', 'success');
                  if (localStorage.getItem('premio_onboarding_completed') !== 'true') {
                    setShowOnboarding(true);
                    setOnboardingStep(1);
                  }
                }}
              >
                I Agree & Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Wizard Modal */}
      {showOnboarding && (
        <div className="modal-overlay legal-modal-overlay fade-in">
          <div className="modal-card legal-modal-card glass-panel" role="dialog" aria-modal="true" aria-label="Setup guide" style={{ maxWidth: '600px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2> Setup Guide (Step {onboardingStep} of 3)</h2>
              <button 
                type="button" 
                className="close-btn" 
                onClick={() => {
                  setShowOnboarding(false);
                  localStorage.setItem('premio_onboarding_completed', 'true');
                  triggerToast('Setup Guide completed. You can rerun it from Settings.', 'info');
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                <Icon name="x" size={20} />
              </button>
            </div>
            
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {onboardingStep === 1 && (
                <div className="onboarding-step fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}> Connect your Premiumize Account</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                    Premio is completely client-side and serverless. To check file cache status, create downloads, and stream files, you must connect your Premiumize.me account.
                  </p>
                  
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid var(--color-primary)', fontSize: '0.8rem' }}>
                    <strong>Don&apos;t have a Premiumize account?</strong><br />
                    <a href={PM_SIGNUP_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline', display: 'inline-block', marginTop: '4px', fontWeight: 'bold' }}>
                      Click here to visit Premiumize.me & Sign Up
                    </a>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Premiumize API Key (Required)</label>
                    <input 
                      type="password"
                      value={userPmKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        setUserPmKey(val);
                        localStorage.setItem('premio_user_pm_key', val);
                      }}
                      placeholder="Paste your Premiumize API Key..."
                      style={{
                        padding: '10px 14px',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '0.85rem',
                        outline: 'none'
                      }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      You can find your API key by logging into your account page at <a href="https://www.premiumize.me/account" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>premiumize.me/account</a> (click &quot;Show API Key&quot;).
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!userPmKey) { triggerToast('Enter your Premiumize API key first.', 'warning'); return; }
                          testKey('pm', '/api/account/info');
                        }}
                        disabled={keyTestStatus.pm?.state === 'testing'}
                        style={{ padding: '8px 14px', background: 'rgba(45, 212, 191, 0.12)', border: '1px solid rgba(45, 212, 191, 0.4)', borderRadius: '8px', color: '#5eead4', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {keyTestStatus.pm?.state === 'testing' ? 'Testing…' : 'Test connection'}
                      </button>
                      {renderKeyTestResult('pm')}
                    </div>
                  </div>
                </div>
              )}

              {onboardingStep === 2 && (
                <div className="onboarding-step fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}> Configure Jackett (Optional)</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                    To search public torrent indexes, connect Premio to a local or remote Jackett or Prowlarr instance. If you only plan to stream cached direct files or use Usenet, you can skip this step.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Jackett Server URL</label>
                      <input 
                        type="text"
                        value={userJackettUrl}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUserJackettUrl(val);
                          localStorage.setItem('premio_user_jackett_url', val);
                        }}
                        placeholder="http://localhost:9117"
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(0,0,0,0.2)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '0.85rem',
                          outline: 'none'
                        }}
                      />
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Jackett API Key</label>
                      <input 
                        type="password"
                        value={userJackettKey}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUserJackettKey(val);
                          localStorage.setItem('premio_user_jackett_key', val);
                        }}
                        placeholder="Paste your Jackett API Key..."
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(0,0,0,0.2)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '0.85rem',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!userJackettUrl || !userJackettKey) { triggerToast('Enter both the Jackett URL and API key first.', 'warning'); return; }
                        testKey('jackett', '/api/jackett/test');
                      }}
                      disabled={keyTestStatus.jackett?.state === 'testing'}
                      style={{ alignSelf: 'flex-start', padding: '8px 14px', background: 'rgba(45, 212, 191, 0.12)', border: '1px solid rgba(45, 212, 191, 0.4)', borderRadius: '8px', color: '#5eead4', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {keyTestStatus.jackett?.state === 'testing' ? 'Testing…' : 'Test Jackett connection'}
                    </button>
                    {renderKeyTestResult('jackett')}
                  </div>

                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                     Set up trackers (e.g. LimeTorrents, EZTV) inside your Jackett dashboard so search queries return cached media.
                  </p>
                </div>
              )}

              {onboardingStep === 3 && (
                <div className="onboarding-step fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}> Fetch Metadata & TMDb (Optional)</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                    Optionally configure a free TMDb v3 API key to load posters, backdrops, cast info, and ratings directly in your browser.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>TMDb v3 API Key</label>
                    <input 
                      type="text"
                      value={userTmdbKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        setUserTmdbKey(val);
                        localStorage.setItem('premio_user_tmdb_key', val);
                      }}
                      placeholder="Enter TMDb API Key..."
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '0.85rem',
                        outline: 'none'
                      }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Register a free account on <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>themoviedb.org</a> to generate your v3 key.
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!userTmdbKey) { triggerToast('Enter your TMDb key first.', 'warning'); return; }
                          testKey('tmdb', '/api/tmdb/test');
                        }}
                        disabled={keyTestStatus.tmdb?.state === 'testing'}
                        style={{ alignSelf: 'flex-start', padding: '8px 14px', background: 'rgba(45, 212, 191, 0.12)', border: '1px solid rgba(45, 212, 191, 0.4)', borderRadius: '8px', color: '#5eead4', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {keyTestStatus.tmdb?.state === 'testing' ? 'Testing…' : 'Test TMDb key'}
                      </button>
                      {renderKeyTestResult('tmdb')}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(74, 222, 128, 0.05)', borderLeft: '3px solid #4ade80', padding: '10px', borderRadius: '6px', fontSize: '0.8rem', color: '#4ade80', marginTop: '10px' }}>
                     Setup Complete! You can edit these keys or add Usenet indexers inside the Control Panel at any time.
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button 
                type="button"
                className="action-btn"
                onClick={() => setOnboardingStep(prev => Math.max(1, prev - 1))}
                disabled={onboardingStep === 1}
                style={{ opacity: onboardingStep === 1 ? 0.4 : 1 }}
              >
                ◀ Back
              </button>
              
              {onboardingStep < 3 ? (
                <button 
                  type="button"
                  className="action-btn"
                  onClick={() => {
                    if (onboardingStep === 1 && !userPmKey.trim()) {
                      triggerToast('Note: You skipped adding a Premiumize key. The app will run in Developer Mock Mode.', 'warning');
                    }
                    setOnboardingStep(prev => prev + 1);
                  }}
                >
                  Next Step ▶
                </button>
              ) : (
                <button 
                  type="button"
                  className="action-btn success"
                  style={{ background: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)' }}
                  onClick={() => {
                    setShowOnboarding(false);
                    localStorage.setItem('premio_onboarding_completed', 'true');
                    triggerToast('Onboarding completed! You are ready to search.', 'success');
                  }}
                >
                   Finish & Start Searching
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Playlist Choice Modal */}
      {showPlaylistChoiceModal && (
        <div className="modal-overlay legal-modal-overlay fade-in">
          <div className="modal-card legal-modal-card glass-panel" role="dialog" aria-modal="true" aria-label="Choose playback mode" style={{ maxWidth: '520px', width: '90%' }}>
            <div className="modal-header">
              <h2 style={{ background: 'linear-gradient(135deg, #ffffff 40%, var(--color-primary) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}> Choose Playback Mode</h2>
            </div>
            
            <div className="modal-body" style={{ fontSize: '0.95rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '12px', lineHeight: '1.4' }}>
              <p>
                {pendingPlaylistFiles.length > 1 ? (
                  <>We found <strong>{pendingPlaylistFiles.length} videos</strong> inside <strong>&quot;{pendingPlaylistName}&quot;</strong>.</>
                ) : (
                  <>You are streaming <strong>&quot;{pendingPlaylistName}&quot;</strong>.</>
                )}
              </p>
              
              {hasAviOrMkvInPending && (
                <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #ef4444', fontSize: '0.82rem', color: '#fca5a5', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px'}}> Browser Codec Compatibility Warning:</span>
                  <span>
                    This video is in <strong>.avi</strong> or <strong>.mkv</strong> format (or contains codecs like DivX/XviD). Modern web browsers (Chrome, Safari, Edge) do not natively support these formats and will display a black screen or fail to load.
                  </span>
                  <span style={{ fontSize: '0.78rem', opacity: 0.9, marginTop: '2px' }}>
                     Premiumize retired their public transcoding API, but their official website still transcodes files automatically when played in their web player.
                  </span>
                </div>
              )}

              <p>
                How would you like to play this {pendingPlaylistFiles.length > 1 ? 'playlist' : 'video'}?
              </p>

              {aiEnabled && pendingPlaylistFiles.length > 1 && (
                <div style={{ marginTop: '8px', border: '1px solid var(--glass-border)', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                     Curate Playlist with Premiumize AI
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <input 
                      type="text" 
                      placeholder="e.g. only seasons 1 and 2, chronological, only fingerprint cases"
                      value={aiCuratePrompt}
                      onChange={(e) => setAiCuratePrompt(e.target.value)}
                      className="settings-text-input small"
                      style={{ height: '36px' }}
                    />
                    <button 
                      type="button" 
                      className="cache-badge badge-stream hover-action"
                      style={{ border: 'none', cursor: 'pointer', padding: '8px 12px', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      onClick={handleAICuratePlaylist}
                      disabled={aiLoading}
                    >
                      {aiLoading ? 'Curating...': 'Apply AI Curation'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              
              {/* Option 1: Download M3U Playlist/File (Recommended for VLC) */}
              <button 
                type="button" 
                className="action-btn success"
                onClick={() => downloadM3UPlaylist(pendingPlaylistFiles, pendingPlaylistName)}
                style={{ 
                  width: '100%', 
                  background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
                  padding: '12px',
                  fontWeight: 'bold',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  color: '#ffffff'
                }}
              >
                 {pendingPlaylistFiles.length > 1 ? 'Download M3U Playlist (Recommended for VLC)': 'Download M3U Stream File (Recommended for VLC)'}
              </button>

              {/* Option 2: Stream on Premiumize.me website (if ID is available) */}
              {pendingItemId && (
                <a 
                  href={pendingItemType === 'file' ? `https://www.premiumize.me/file?id=${pendingItemId}` : `https://www.premiumize.me/files?folder_id=${pendingItemId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="action-btn"
                  onClick={() => setShowPlaylistChoiceModal(false)}
                  style={{ 
                    width: '100%', 
                    background: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
                    padding: '12px',
                    fontWeight: 'bold',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    color: '#ffffff',
                    textDecoration: 'none',
                    textAlign: 'center',
                    boxSizing: 'border-box'
                  }}
                >
                   {pendingItemType === 'file'? 'Play on Premiumize.me Web Player': 'Open Folder on Premiumize.me Website'}
                </a>
              )}
              
              {/* Option 3: Try in browser anyway */}
              <button 
                type="button" 
                className="action-btn"
                onClick={() => handleLaunchBrowserPlaylist(pendingPlaylistFiles, pendingPlaylistName)}
                style={{ 
                  width: '100%', 
                  background: 'linear-gradient(135deg, #4f46e5 0%, #312e81 100%)',
                  padding: '12px',
                  fontWeight: 'bold',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  color: '#ffffff'
                }}
              >
                 Try Playing in Web Browser (HTML5)
              </button>

              {/* Close/Cancel Button */}
              <button 
                type="button" 
                className="action-btn text-only"
                onClick={() => setShowPlaylistChoiceModal(false)}
                style={{ 
                  width: '100%', 
                  padding: '8px',
                  color: 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  marginTop: '4px'
                }}
              >
                 Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Premiumize AI Co-pilot Floating Button & Sidebar */}
      {aiEnabled && (
        <>
          {/* Floating Action Button */}
          <button 
            type="button"
            className="copilot-floating-btn hover-glow"
            onClick={() => setShowAICopilot(!showAICopilot)}
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--color-primary) 0%, #4f46e5 100%)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 8px 25px rgba(139, 92, 246, 0.4), 0 0 15px var(--color-primary-glow)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.6rem',
              color: '#fff',
              cursor: 'pointer',
              zIndex: 999,
              transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }}
            title={showAICopilot ? 'Close AI Co-pilot' : 'Open Premio AI Co-pilot'}
            aria-label={showAICopilot ? 'Close AI Co-pilot' : 'Open Premio AI Co-pilot'}
          >
            {showAICopilot ? (
              <Icon name="x" size={24} />
            ) : (
              <>
                <Icon name="message-chatbot" size={28} />
                <span className="copilot-fab-spark"><Icon name="sparkles" size={13} fill /></span>
              </>
            )}
          </button>

          {/* Slide-out Sidebar Panel */}
          {showAICopilot && (
            <div className="copilot-sidebar glass-panel" role="complementary" aria-label="AI Co-pilot chat" style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: '400px',
              maxWidth: '100%',
              height: '100vh',
              borderRadius: 0,
              borderLeft: '1px solid var(--glass-border)',
              borderTop: 'none',
              borderRight: 'none',
              borderBottom: 'none',
              zIndex: 1001,
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.5)'
            }}>
              {/* Sidebar Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0, 0, 0, 0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'flex', color: 'var(--color-primary)' }}><Icon name="wand" size={20} /></span>
                  <h3 style={{ margin: 0, background: 'linear-gradient(135deg, #ffffff 40%, var(--color-primary) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 'bold' }}>Premio Co-pilot</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    type="button" 
                    className="text-only"
                    onClick={handleNewChat}
                    style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', cursor: 'pointer', border: 'none', background: 'none' }}
                    title="Start New Chat"
                    aria-label="Start New Chat"
                  >
                    <Icon name="plus" size={20} />
                  </button>
                  <button 
                    type="button" 
                    className="text-only"
                    onClick={() => setShowAICopilot(false)}
                    style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', cursor: 'pointer', border: 'none', background: 'none' }}
                    title="Close Co-pilot"
                    aria-label="Close Co-pilot"
                  >
                    <Icon name="x" size={20} />
                  </button>
                </div>
              </div>

              {/* Messages Thread */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {copilotMessages.map((msg, index) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div 
                      key={index} 
                      style={{ 
                        alignSelf: isUser ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}
                    >
                      <div style={{
                        background: isUser ? 'linear-gradient(135deg, var(--color-primary) 0%, #4f46e5 100%)' : 'rgba(255, 255, 255, 0.05)',
                        border: isUser ? 'none' : '1px solid var(--glass-border)',
                        color: '#ffffff',
                        padding: '10px 14px',
                        borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                        fontSize: '0.88rem',
                        lineHeight: '1.4',
                        boxShadow: isUser ? '0 4px 12px rgba(139, 92, 246, 0.15)' : 'none'
                      }}>
                        {renderMarkdown(msg.content)}
                      </div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', alignSelf: isUser ? 'flex-end' : 'flex-start' }}>
                        {isUser ? 'You' : 'Co-pilot'}
                      </span>
                    </div>
                  );
                })}
                {aiLoading && (
                  <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', borderRadius: '12px', fontSize: '0.85rem' }}>
                    <div className="spinner" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--color-primary)' }}></div>
                    <span style={{ color: 'var(--text-muted)' }}>Co-pilot is thinking...</span>
                  </div>
                )}
              </div>

              {/* Quick Action Suggestions */}
              <div style={{ padding: '0.5rem 1.25rem', display: 'flex', gap: '6px', overflowX: 'auto', whiteSpace: 'nowrap', borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.1)' }} className="hide-scrollbar">
                <button 
                  type="button" 
                  className="presets-badge" 
                  onClick={() => { setCopilotInput("What TV shows can you recommend?"); }}
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                >
                   Show Recommendations
                </button>
                <button 
                  type="button" 
                  className="presets-badge" 
                  onClick={() => { setCopilotInput("How do I use the AI Playlist Curator?"); }}
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                >
                   Curating Playlists
                </button>
                <button 
                  type="button" 
                  className="presets-badge" 
                  onClick={() => { setCopilotInput("Explain how the AI filename clean button works."); }}
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                >
                   Filename Cleaner
                </button>
              </div>

              {/* Chat Input Box */}
              <div style={{ padding: '1.25rem', borderTop: '1px solid var(--glass-border)', background: 'rgba(0, 0, 0, 0.2)' }}>
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendCopilotMessage();
                  }}
                  style={{ display: 'flex', gap: '8px' }}
                >
                  <input 
                    type="text" 
                    value={copilotInput}
                    onChange={(e) => setCopilotInput(e.target.value)}
                    placeholder="Ask Premio Co-pilot..."
                    className="settings-text-input"
                    style={{ flex: 1, height: '42px', borderRadius: '24px' }}
                    disabled={aiLoading}
                  />
                  <button
                    type="submit"
                    className="search-submit-btn"
                    style={{ width: '42px', height: '42px', minWidth: 'auto', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    disabled={aiLoading || !copilotInput.trim()}
                    aria-label="Send message to AI Co-pilot"
                  >
                    <Icon name="send" size={18} />
                  </button>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
