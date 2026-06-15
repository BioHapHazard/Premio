# App.jsx Componentization — Refactor Plan

Living document tracking the multi-phase refactor of `frontend/src/App.jsx`
(a single ~9.2k-line `App()` component with 160 `useState`, 9 `useRef`, ~30 effects).

**Target architecture:** Context + domain hooks. State is grouped into domain
hooks (`useSearch`, `usePlayers`, …) composed by a provider; extracted panel
components consume them via context instead of prop-drilling.

**Safety net:** no tests, no linter. Each step is verified by `npm run build`
(in `frontend/`) + manual smoke in the preview, and lands as its own revertible
commit.

---

## Phase status

- [x] **Phase 1 — Extract pure helpers/constants** → `src/lib/` (commit `3ab8732`, pushed).
      `App.jsx` 9,780 → 9,243 lines.
- [~] **Phase 2 — Group state into domain hooks** (`src/state/`). ← in progress
  - [x] `useThemeState` (`7d3374e`) — takes `activeProfileId`.
  - [x] `useRetroPlayer` (`0a59721`) — self-contained (state + scroll-lock effect).
  - [x] `useEbookReader` (`011d4bf`) — state + progress effect; takes `setContinueWatchingList`.
  - [x] `useAudioPlayer` (`906053e`) — **state only**; iframe progress effect stays in App
        (its `getMetadata`/`removeFromContinueWatching`/`triggerToast` collaborators are
        declared after the hook call site → TDZ). Fold the effect in once those move to the provider.
  - [x] `useToast` (`fdaeeeb`) — self-contained (toast + triggerToast + auto-dismiss).
  - [ ] AppStateProvider seeded with `useProfiles` + `useSettings` (next session).
  - [ ] `useMetadata`, `useVideoPlayer`, data domains, cloud, AI, ui-shell, cloud-sync.
- [ ] **Phase 3 — Extract presentational leaf components** (cards, pills, shimmer).
- [ ] **Phase 4 — Extract panels & player overlays as components** (consume context).
- [ ] **Phase 5 — Split `App.css`** (optional, deferred).

> **Lesson (Phase 2):** a domain hook can only fold in its effect if the effect's
> collaborators are in scope at the hook's *call site*. Functions declared later in
> `App()` (e.g. `getMetadata`, `removeFromContinueWatching`) are in the temporal dead
> zone there, so such effects stay in App until those collaborators also live in the
> provider. Also: relocating a hook makes Fast Refresh emit a one-off "order of Hooks"
> warning — always confirm with a **full reload**, not just HMR.

---

## State inventory (domain groups)

### Core / shared (read by many domains)
- **useSettings (API keys):** userPmKey, userTmdbKey, userOmdbKey, userOpenSubsKey,
  userSubdlKey, userJackettUrl, userJackettKey, userIndexers, showKeys,
  showKeysPinPrompt, revealPinInput, revealPinError, showJackettGuide,
  newIdx{Name,Url,Key}, showLegalDisclaimer, showOnboarding, onboardingStep,
  keyTestStatus. Effects: onboarding trigger, persist hideAdult.
- **useMetadata:** metadataResults, metadataDrawerItem, reviews{Open,Loading,Data,Error},
  lb{Rating,ReviewsOpen,ReviewsLoading,ReviewsData,ReviewsError}; refs
  metadataCacheRef, metadataInFlightRef, metadataDrawerCloseRef. Effect: drawer focus/esc.
- **useTheme:** selectedTheme. Effect: data-theme attr + localStorage.
  ⚠ effect also reads **activeProfileId** (writes per-profile theme key) — not isolated.

### Per-profile data domains
- **useSearch:** query, category, rawResults, loading, searched, searchError,
  visibleCount, activeDownloadId, searchMode, hideUsenetWarning, isDragging,
  magnetInput, showFilters, filter{Quality,MaxSize,MinSeeders}, excludeKeywords,
  sortBy, recentSearches, recentDownloads; ref loadMoreRef. Effects: metadata fetch
  for displayed results, reset visibleCount, infinite-scroll IntersectionObserver.
- **useLibrary:** libraryList. Effects: cache-status check, background metadata fetch.
- **useWatchlist:** watchlist, watchlistChecking. Effect: reload on profile change.
- **useContinueWatching:** continueWatchingList + cwArtSignature memo. Effect: cover-art fetch.
- **usePlaylists:** playlists, playlistSelectionTrack, showPlaylistChoiceModal,
  pending{PlaylistFiles,PlaylistName,ItemId,ItemType}, hasAviOrMkvInPending.

### Players (self-contained modals; share "open(torrent) → list files" pattern)
- **useVideoPlayer:** activePlayerTorrent, playerLoading, playerFiles,
  selectedVideoFile, selectedSubtitleFile, subtitleTrackUrl,
  subSearch{Open,Loading,Results,Error,Lang}, subDownloadingId, resumeTime,
  introSegment, showSkipButton, skipTimer, autoSkipEnabled, nextEpisodeFile,
  showAutoplayOverlay, autoplayCountdown; refs autoplay{Declined,Timer}Ref.
  Effects: esc, subtitle load, video element listener, recap reset, intro reset,
  skip-timer interval, autoplay countdown, autoplay reset.
- **useAudioPlayer:** activeAudioTorrent, selectedAudioFile, audioPlayableFiles,
  audioSearchQuery, resumeAudioTime.
- **useEbookReader:** activeEbookTorrent, selectedEbookFile, ebookPlayableFiles,
  ebookSearchQuery, resumeEbook{Chapter,Scroll}. Effect: iframe message.
- **useRetroPlayer:** activeRetroTorrent, selectedRetroRomFile, retroPlayableFiles,
  retroSearchQuery. Effects: rom load, iframe message.

### Infrastructure / shell
- **useProfiles:** profiles, activeProfileId, isProfilePickerOpen, isManagingProfiles,
  isProfileDropdownOpen, editingProfile + 15 edit* fields, 6 pin* fields; refs
  profileDropdownRef, logoClicksRef. Effects: outside-click, migration/init.
- **useCloud (browser):** cloudContents, cloudFolderId, cloudFolderName,
  cloudBreadcrumbs, cloudLoading, cloudError, cloudRename{Id,Name,Type}, cloudFilter,
  cloudPlaylist{Loading,Status}.
- **useCloudSync:** isSyncing, lastSynced; ref autoSaveDataRef. Effects: autosave, sync on mount.
- **useAccount:** accountInfo, transfers, transfersLoading. Effect: transfers poll.
- **useAi:** aiEnabled, aiToken, aiModel, aiModelsList, fetchingModels, aiLoading,
  aiTranslateLanguage, recap{Open,Text,Loading,Error}, showAICurateInput,
  aiCuratePrompt, showAICopilot, copilotMessages, copilotInput.
- **useUiShell:** activeTab, librarySubTab, continueSubTab, showSettings, hideAdult,
  adultControlsUnlocked, toast. Effects: toast timeout, global keydown.

---

## Cross-domain entanglements (the hard parts)

1. **Profiles is the root.** Switching `activeProfileId` reloads library, watchlist,
   continue-watching, playlists, settings, and theme (all per-profile localStorage).
   The provider must orchestrate this; these domains are not independent islands.
2. **CloudSync touches almost everything** — `autoSaveDataRef` snapshots library +
   watchlist + CW + playlists + recents + settings; `syncFromCloud` writes them back.
   Extracts last.
3. **AI is cross-cutting** — recap → video player, aiCuratePrompt → playlists/cloud,
   aiTranslateLanguage → subtitles.
4. **Metadata is shared by 6 consumers** (search, library, CW, watchlist, drawer,
   players-for-IMDb-id). Make it a context early.
5. **API keys are foundational** — every network handler reads them.
6. **Theme ↔ Profiles** — theme effect writes a per-profile key, so the theme hook
   needs `activeProfileId`. (Found while implementing step 1.)

---

## Extraction order (each = one verified commit)

Because data flows provider → children, a domain can only move into the provider
once the domains it depends on are also in the provider. Theme depends on profiles,
so the clean provider seed is **profiles/settings**, not theme.

Pragmatic sequence:
1. **useTheme** — extract as a domain hook called inside `App()` (takes
   `activeProfileId` as an arg). No provider yet — proves the `src/state/` pattern
   on the smallest surface. ← current step
2. Introduce the **AppStateProvider** seeded with **useProfiles + useSettings**
   (the root); move theme into the provider at this point.
3. **useMetadata** (shared core).
4. Player hooks: retro / ebook / audio, then **useVideoPlayer**.
5. Data domains: search, library, watchlist, continue-watching, playlists.
6. **useCloud**, **useAccount**, **useAi**, **useUiShell**.
7. **useCloudSync** last.

> Note: Phase 2 decouples state but does **not** shrink `App()` much by itself — the
> ~5,160 lines of JSX stay until Phase 4 consumes the context. If visible line
> reduction is the priority, pair `useVideoPlayer` with extracting the player modal
> as a component.
