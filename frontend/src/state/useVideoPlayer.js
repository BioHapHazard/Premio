import { useState, useRef } from 'react';

// Owns the streaming video player state: the active torrent + file list + selected
// video/subtitle files, the resolved subtitle track URL, the online subtitle-search
// panel (OpenSubtitles + SubDL), the resume position, the IntroDB skip-intro segment
// + skip button/timer + auto-skip toggle, and the Netflix-style autoplay overlay
// (next episode + countdown). Plus the autoplay refs (declined flag, countdown timer).
//
// NOTE: all the player effects stay in AppContent — they save progress to Continue
// Watching, fetch subtitles/recaps/intros, drive the <video> element, and run the
// skip/autoplay timers, depending on getMetadata / setContinueWatchingList / AI /
// the credentialed fetch. They read this state via context.
export function useVideoPlayer() {
  const [activePlayerTorrent, setActivePlayerTorrent] = useState(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerFiles, setPlayerFiles] = useState([]);
  const [selectedVideoFile, setSelectedVideoFile] = useState(null);
  const [selectedSubtitleFile, setSelectedSubtitleFile] = useState(null);
  const [subtitleTrackUrl, setSubtitleTrackUrl] = useState(null);
  // Online subtitle fetch (OpenSubtitles primary + SubDL fallback)
  const [subSearchOpen, setSubSearchOpen] = useState(false);
  const [subSearchLoading, setSubSearchLoading] = useState(false);
  const [subSearchResults, setSubSearchResults] = useState([]);
  const [subSearchError, setSubSearchError] = useState('');
  const [subSearchLang, setSubSearchLang] = useState(() => localStorage.getItem('premio_sub_search_lang') || 'en');
  const [subDownloadingId, setSubDownloadingId] = useState(null);
  const [resumeTime, setResumeTime] = useState(0);
  const autoplayDeclinedRef = useRef(false);
  const [introSegment, setIntroSegment] = useState(null);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [skipTimer, setSkipTimer] = useState(0);
  const [autoSkipEnabled, setAutoSkipEnabled] = useState(() => {
    return localStorage.getItem('premium_search_auto_skip_intro') === 'true';
  });

  // --- Netflix-Style Autoplay ---
  const [nextEpisodeFile, setNextEpisodeFile] = useState(null);
  const [showAutoplayOverlay, setShowAutoplayOverlay] = useState(false);
  const [autoplayCountdown, setAutoplayCountdown] = useState(15);
  const autoplayTimerRef = useRef(null);

  return {
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
  };
}
