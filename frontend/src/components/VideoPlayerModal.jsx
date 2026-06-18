import { useRef } from 'react';
import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';
import { formatBytes, matchEpisode, parseShowDetails } from '../lib/format';

// Premium streaming video player overlay. The largest player modal: HTML5 video,
// skip-intro, episode autoplay, AI recap, embedded + online subtitle selection,
// AI subtitle translation, and external-player deep links. Reads its state from
// context; the player-side handlers (video element events, skip, recap, subtitle
// fetch) + the cloud-sync engine stay in AppContent and are passed as props.
export default function VideoPlayerModal({
  syncToCloud,
  handleTimeUpdate,
  handleVideoLoadedMetadata,
  handleVideoEnded,
  handleSkipIntro,
  handleToggleRecap,
  fetchOnlineSubtitles,
  selectOnlineSubtitle,
  handleTranscodeSeek,
}) {
  const {
    activePlayerTorrent, setActivePlayerTorrent,
    selectedVideoFile, setSelectedVideoFile,
    selectedSubtitleFile, setSelectedSubtitleFile,
    setSubtitleTrackUrl,
    playerLoading, playerFiles,
    showSkipButton, introSegment, skipTimer,
    showAutoplayOverlay, setShowAutoplayOverlay, nextEpisodeFile, autoplayCountdown,
    autoplayDeclinedRef, autoplayTimerRef,
    autoSkipEnabled, setAutoSkipEnabled,
    recapOpen, recapLoading, recapError, recapText,
    aiTranslateLanguage, setAiTranslateLanguage, aiEnabled, aiToken,
    subSearchLang, setSubSearchLang,
    subSearchOpen, setSubSearchOpen,
    subSearchLoading, subSearchError, subSearchResults, subDownloadingId,
    libraryList, continueWatchingList,
    triggerToast,
    setResumeTime,
  } = useAppState();

  const videoRef = useRef(null);

  if (!activePlayerTorrent) return null;

  const isLocalUsenet = selectedVideoFile?.link?.includes('/api/sab/stream') || selectedVideoFile?.link?.includes('/api/sab/transcode');
  const isPlayingTranscoded = selectedVideoFile?.link?.includes('/api/sab/transcode');

  const toggleTranscoding = () => {
    if (!videoRef.current || !selectedVideoFile) return;
    
    const video = videoRef.current;
    const currentTime = video.currentTime;
    
    if (isPlayingTranscoded) {
      // Switch to native stream
      try {
        const url = new URL(selectedVideoFile.link);
        const ss = parseFloat(url.searchParams.get('ss') || '0');
        const absoluteTime = ss + currentTime;
        
        // Remove transcode route, restore stream route
        const nativeLink = selectedVideoFile.link
          .replace('/api/sab/transcode', '/api/sab/stream');
        
        // Remove ss parameter from native link
        const nativeUrl = new URL(nativeLink);
        nativeUrl.searchParams.delete('ss');
        
        setResumeTime(absoluteTime);
        setSelectedVideoFile({
          ...selectedVideoFile,
          link: nativeUrl.toString()
        });
        
        triggerToast('Switching to original stream...', 'info');
      } catch (err) {
        console.error('Error switching to original stream:', err);
      }
    } else {
      // Switch to transcoded stream
      try {
        const url = new URL(selectedVideoFile.link);
        url.searchParams.set('ss', Math.round(currentTime).toString());
        
        const transcodedLink = url.toString().replace('/api/sab/stream', '/api/sab/transcode');
        
        setSelectedVideoFile({
          ...selectedVideoFile,
          link: transcodedLink
        });
        
        triggerToast('Starting on-the-fly transcoding...', 'info');
      } catch (err) {
        console.error('Error switching to transcoded stream:', err);
      }
    }
  };

  const showDetails = parseShowDetails(selectedVideoFile?.name);
  const showRecapOption = showDetails && !(showDetails.season === 1 && showDetails.episode === 1);

  return (
    <div className="player-modal-backdrop">
      <div className="player-modal glass-panel fade-in" role="dialog" aria-modal="true" aria-label="Video player">
        <div className="player-header">
          <h2 className="heading-ico"><Icon name="movie" size={22} /> PremiumPlayer</h2>
          <button
            className="close-player-btn"
            onClick={() => {
              setActivePlayerTorrent(null);
              setSelectedVideoFile(null);
              setSelectedSubtitleFile(null);
              setSubtitleTrackUrl(null);
              syncToCloud(libraryList, continueWatchingList); // Push latest playback checkpoints to Cloud
            }}
            id="btn-close-player"
          >
             Close
          </button>
        </div>

        {playerLoading ? (
          <div className="player-loading-container">
            <span className="spinner-micro white large"></span>
            <p>Retrieving instant streaming links from Premiumize CDN...</p>
          </div>
        ) : selectedVideoFile ? (
          <div className="player-content">

            {/* Custom HTML5 Video Player */}
            <div className="video-wrapper">
              <video
                ref={videoRef}
                key={selectedVideoFile.link} // Forces reload when active file changes
                controls
                autoPlay
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleVideoLoadedMetadata}
                onEnded={handleVideoEnded}
                onSeeking={(e) => {
                  const video = e.target;
                  const currentSrc = video.src || '';
                  if (currentSrc.includes('/api/sab/transcode')) {
                    const url = new URL(currentSrc);
                    const currentSs = parseFloat(url.searchParams.get('ss') || '0');
                    const targetTime = video.currentTime;
                    // If seek is significant (> 3 seconds), restart transcode stream
                    if (Math.abs(targetTime - currentSs) > 3) {
                      handleTranscodeSeek(targetTime);
                    }
                  }
                }}
                className="main-video-player"
                crossOrigin="anonymous" // Required to inject blob subtitle tracks
              >
                <source src={selectedVideoFile.link} type="video/mp4" />
                <source src={selectedVideoFile.link} type="video/webm" />
                Your browser does not support HTML5 video playback.
              </video>

              {/* Netflix-Style Skip Intro Popup */}
              {showSkipButton && introSegment && (
                <button
                  className="skip-intro-btn glass-panel animate-zoom-in"
                  onClick={handleSkipIntro}
                  style={{
                    position: 'absolute',
                    bottom: '80px',
                    right: '30px',
                    padding: '12px 24px',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    color: 'white',
                    background: 'rgba(0, 0, 0, 0.75)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    zIndex: '1000',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span> Skip Intro</span>
                  <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>{skipTimer}s</span>
                </button>
              )}

              {/* Netflix-Style Episode Autoplay Overlay popup */}
              {showAutoplayOverlay && nextEpisodeFile && (
                <div className="autoplay-overlay-container">
                  <div className="autoplay-card glass-panel animate-zoom-in">
                    <span className="autoplay-next-label">NEXT EPISODE IN</span>
                    <span className="autoplay-countdown-number">{autoplayCountdown}s</span>
                    <h4 className="autoplay-next-title" title={nextEpisodeFile.name.split('/').pop()}>
                      {nextEpisodeFile.name.split('/').pop()}
                    </h4>
                    <div className="autoplay-actions">
                      <button
                        className="autoplay-cancel-btn"
                        onClick={() => {
                          setShowAutoplayOverlay(false);
                          autoplayDeclinedRef.current = true;
                          if (autoplayTimerRef.current) clearTimeout(autoplayTimerRef.current);
                        }}
                      >
                         Cancel
                      </button>
                      <button
                        className="autoplay-play-now-btn"
                        onClick={() => {
                          setShowAutoplayOverlay(false);
                          if (autoplayTimerRef.current) clearTimeout(autoplayTimerRef.current);
                          triggerToast(` Playing next episode: ${nextEpisodeFile.name.split('/').pop()}`, 'success');
                          setSelectedVideoFile(nextEpisodeFile);
                        }}
                      >
                        ▶ Play Now
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Browser audio track limitations notice & Custom controls */}
            <div className="player-custom-controls">

              {/* Auto Skip Intro Setting */}
              {activePlayerTorrent && activePlayerTorrent.category === 'TV' && (
                <div className="glass-panel" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255, 255, 255, 0.02)', marginBottom: '1.25rem' }}>
                  <div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-primary)', display: 'block', textAlign: 'left'}}> Auto-Skip TV Intros</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textAlign: 'left', marginTop: '2px' }}>Automatically fast-forward past intros matching IntroDB timestamps.</span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={autoSkipEnabled}
                      onChange={(e) => {
                        setAutoSkipEnabled(e.target.checked);
                        localStorage.setItem('premium_search_auto_skip_intro', e.target.checked ? 'true' : 'false');
                        triggerToast(e.target.checked ? "Auto-skip intros enabled!": "Auto-skip intros disabled.", "success");
                      }}
                    />
                    <span className="slider round"></span>
                  </label>
                </div>
              )}

              {/* TV Show AI Recap Section */}
              {showRecapOption && (
                <div className="ai-recap-box glass-panel-subtle">
                  <button
                    type="button"
                    className="ai-recap-toggle-btn"
                    onClick={handleToggleRecap}
                  >
                    <span className="recap-title-text"> {recapOpen ? 'Hide': 'Show'} "Previously On..."AI Recap</span>
                    <span className="recap-toggle-icon">{recapOpen ? '▲' : '▼'}</span>
                  </button>

                  {recapOpen && (
                    <div className="ai-recap-content-area">
                      {recapLoading ? (
                        <div className="recap-loader-container">
                          <span className="spinner-micro purple small"></span>
                          <span className="recap-loading-text">Generating recap for S{showDetails.season}E{showDetails.episode}...</span>
                        </div>
                      ) : recapError ? (
                        <p className="recap-error-text"> {recapError}</p>
                      ) : recapText ? (
                        <ul className="recap-bullets-list">
                          {recapText.split('\n').filter(line => line.trim()).map((line, idx) => (
                            <li key={idx} className="recap-bullet-item">
                              {line.replace(/^[•\-\*]\s*/, '')}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="recap-info-text">No recap loaded. Check your settings if AI is disabled.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {isLocalUsenet && (
                <div className="audio-notice-box" style={{ borderColor: 'var(--color-primary)' }}>
                  <span className="badge-notice" style={{ backgroundColor: 'var(--color-primary)' }}>ℹ Local Playback Transcoding</span>
                  <p>
                    If this video shows a black screen, does not start, or lacks audio, it likely uses codecs unsupported by your browser (e.g. HEVC/H.265 video or AC3/DTS audio). Use the <strong>Transcode Stream (ffmpeg)</strong> button below to transcode on-the-fly.
                  </p>
                </div>
              )}

              <div className="audio-notice-box">
                <span className="badge-notice">ℹ Multi-Language Audio Info</span>
                <p>Web browsers do not support switching audio tracks for raw video streams. To play this file in other languages or switch tracks, click the orange <strong>Open in VLC Player</strong> button below!</p>
              </div>

            </div>

            {/* Stream selectors */}
            <div className="player-controls-row">

              {/* Select active video file (for pack / season torrents!) */}
              {playerFiles.filter(f => f.type === 'video').length > 1 && (
                <div className="player-select-group">
                  <label htmlFor="select-video-track">Select File / Episode:</label>
                  <select
                    id="select-video-track"
                    value={selectedVideoFile.link}
                    onChange={(e) => {
                      const file = playerFiles.find(f => f.link === e.target.value);
                      if (file) {
                        setSelectedVideoFile(file);

                        // Automatically find and select the matching subtitle track for this episode
                        const subtitles = playerFiles.filter(f => f.type === 'subtitle');
                        if (subtitles.length > 0) {
                          const videoEp = matchEpisode(file.name);
                          let matchedSub = null;
                          if (videoEp) {
                            matchedSub = subtitles.find(s => matchEpisode(s.name) === videoEp);
                          }
                          if (!matchedSub) {
                            const cleanVideoName = file.name.split('.')[0].toLowerCase();
                            matchedSub = subtitles.find(s => s.name.toLowerCase().includes(cleanVideoName) || cleanVideoName.includes(s.name.split('.')[0].toLowerCase()));
                          }
                          if (!matchedSub) {
                            const videos = playerFiles.filter(f => f.type === 'video');
                            const vidIdx = videos.indexOf(file);
                            if (vidIdx !== -1 && subtitles[vidIdx]) {
                              matchedSub = subtitles[vidIdx];
                            }
                          }
                          setSelectedSubtitleFile(matchedSub || null);
                        } else {
                          setSelectedSubtitleFile(null);
                        }
                      }
                    }}
                    className="player-select"
                  >
                    {playerFiles
                      .filter(f => f.type === 'video')
                      .sort((a, b) => {
                        const aName = a.name.split('/').pop().toLowerCase();
                        const bName = b.name.split('/').pop().toLowerCase();
                        return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
                      })
                      .map((f, idx) => (
                        <option key={idx} value={f.link}>
                          {f.name} ({formatBytes(f.size)})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Select active subtitle track */}
              {playerFiles.filter(f => f.type === 'subtitle').length > 0 && (
                <div className="player-select-group">
                  <label htmlFor="select-subtitle-track">Select Subtitle Track:</label>
                  <select
                    id="select-subtitle-track"
                    value={selectedSubtitleFile?.link || ""}
                    onChange={(e) => {
                      const file = playerFiles.find(f => f.link === e.target.value);
                      setSelectedSubtitleFile(file || null);
                    }}
                    className="player-select"
                  >
                    <option value="">No Subtitles</option>
                    {playerFiles
                      .filter(f => f.type === 'subtitle')
                      .sort((a, b) => {
                        const aName = a.name.split('/').pop().toLowerCase();
                        const bName = b.name.split('/').pop().toLowerCase();
                        return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
                      })
                      .map((f, idx) => (
                        <option key={idx} value={f.link}>
                          {f.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* AI Subtitle Translation language select */}
              {selectedSubtitleFile && (
                <div className="player-select-group">
                  <label htmlFor="select-subtitle-translation"> AI Translate Subtitles:</label>
                  <select
                    id="select-subtitle-translation"
                    value={aiTranslateLanguage}
                    onChange={(e) => {
                      if (!aiEnabled || !aiToken) {
                        triggerToast('Please enable Premiumize AI and set a token in Settings first.', 'warning');
                        return;
                      }
                      const val = e.target.value;
                      setAiTranslateLanguage(val);
                      localStorage.setItem('premio_ai_translate_language', val);
                    }}
                    className="player-select ai-translator-select"
                  >
                    <option value="">Original Language</option>
                    <option value="Spanish">Spanish (Español)</option>
                    <option value="French">French (Français)</option>
                    <option value="German">German (Deutsch)</option>
                    <option value="Japanese">Japanese (日本語)</option>
                    <option value="Italian">Italian (Italiano)</option>
                    <option value="Chinese (Simplified)">Chinese (Simplified)</option>
                    <option value="Chinese (Traditional)">Chinese (Traditional)</option>
                    <option value="Korean">Korean (한국어)</option>
                    <option value="Portuguese">Portuguese (Português)</option>
                    <option value="Dutch">Dutch (Nederlands)</option>
                    <option value="Russian">Russian (Русский)</option>
                    <option value="Arabic">Arabic (العربية)</option>
                    <option value="Turkish">Turkish (Türkçe)</option>
                    <option value="Polish">Polish (Polski)</option>
                    <option value="Swedish">Swedish (Svenska)</option>
                    <option value="Vietnamese">Vietnamese (Tiếng Việt)</option>
                  </select>
                </div>
              )}

            </div>

            {/* Fetch subtitles online (OpenSubtitles primary + SubDL fallback) — full width */}
            <div className="subtitle-fetch-section">
              <label htmlFor="sub-fetch-lang" className="subtitle-fetch-label">Online Subtitles:</label>
              <div className="sub-fetch-row">
                <select
                  id="sub-fetch-lang"
                  className="player-select sub-lang-select"
                  value={subSearchLang}
                  onChange={(e) => { setSubSearchLang(e.target.value); localStorage.setItem('premio_sub_search_lang', e.target.value); }}
                  aria-label="Subtitle language"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="it">Italian</option>
                  <option value="pt">Portuguese</option>
                  <option value="nl">Dutch</option>
                  <option value="pl">Polish</option>
                  <option value="ar">Arabic</option>
                  <option value="ru">Russian</option>
                  <option value="zh">Chinese</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                </select>
                <button className="sub-fetch-btn" onClick={fetchOnlineSubtitles} disabled={subSearchLoading}>
                  {subSearchLoading ? <span className="spinner-micro"></span> : <Icon name="search" size={15} />} Fetch Subtitles
                </button>
              </div>

              {selectedSubtitleFile?._online && (
                <div className="sub-active-chip">
                  <Icon name="check" size={13} />
                  <span className="sub-active-name">{selectedSubtitleFile.name}</span>
                  <button className="sub-active-remove" onClick={() => setSelectedSubtitleFile(null)} aria-label="Remove fetched subtitle"><Icon name="x" size={13} /></button>
                </div>
              )}

              {subSearchOpen && (
                <div className="sub-results-panel" role="dialog" aria-label="Online subtitle results">
                  <div className="sub-results-head">
                    <span>Available subtitles</span>
                    <button className="sub-results-close" onClick={() => setSubSearchOpen(false)} aria-label="Close subtitle results"><Icon name="x" size={14} /></button>
                  </div>
                  {subSearchLoading && <div className="sub-results-loading"><span className="spinner-micro"></span> Searching providers…</div>}
                  {!subSearchLoading && subSearchError && <div className="sub-results-error">{subSearchError}</div>}
                  {!subSearchLoading && subSearchResults.length > 0 && (
                    <ul className="sub-results-list">
                      {subSearchResults.map((r, idx) => (
                        <li key={idx} className="sub-result-item">
                          <div className="sub-result-info">
                            <span className="sub-result-release" title={r.release}>{r.release}</span>
                            <span className="sub-result-meta">
                              <span className={`sub-provider-tag prov-${r.provider}`}>{r.provider === 'opensubtitles' ? 'OpenSubtitles' : 'SubDL'}</span>
                              <span className="sub-result-lang">{r.language.toUpperCase()}</span>
                              {r.downloads > 0 && <span className="sub-result-dl"><Icon name="download" size={11} /> {r.downloads.toLocaleString()}</span>}
                              {r.hi && <span className="sub-result-hi" title="Hearing impaired / SDH">HI</span>}
                            </span>
                          </div>
                          <button className="sub-result-load" onClick={() => selectOnlineSubtitle(r)} disabled={subDownloadingId === r.id}>
                            {subDownloadingId === r.id ? <span className="spinner-micro"></span> : 'Load'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

             {/* External Player deep links */}
            <div className="player-actions-row">

              {/* Open in VLC Link */}
              <a
                href={selectedVideoFile.link.replace(/^http/, 'vlc')}
                className="vlc-stream-btn"
                title="Open this direct network stream inside your VLC Media Player"
              >
                 Open in VLC Player
              </a>

              {/* Force Transcode (ffmpeg on-the-fly) for local SABnzbd files */}
              {isLocalUsenet && (
                <button
                  type="button"
                  className="copy-url-btn"
                  onClick={toggleTranscoding}
                  style={{
                    background: isPlayingTranscoded ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(255, 255, 255, 0.08)',
                    borderColor: isPlayingTranscoded ? '#10b981' : 'var(--glass-border)',
                    color: isPlayingTranscoded ? '#ffffff' : 'var(--text-primary)',
                    boxShadow: isPlayingTranscoded ? '0 0 12px rgba(16, 185, 129, 0.35)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                  title={isPlayingTranscoded ? "Currently playing transcoded stream. Click to switch back to original stream." : "Force transcoding with local ffmpeg (use if video shows black screen, spinner, or has no audio)."}
                >
                  <Icon name={isPlayingTranscoded ? "check" : "bolt"} size={14} />
                  {isPlayingTranscoded ? 'Playing Transcoded (ffmpeg)' : 'Transcode Stream (ffmpeg)'}
                </button>
              )}

              {/* Copy Stream Link */}
              <button
                type="button"
                className="copy-url-btn"
                onClick={() => {
                  navigator.clipboard.writeText(selectedVideoFile.link);
                  triggerToast('CDN stream link copied to clipboard!', 'success');
                }}
                title="Copy direct streaming link for other players (like IINA or MPV)"
              >
                 Copy Stream Link
              </button>
            </div>

            {/* Playing info */}
            <div className="player-file-info">
              <p className="playing-title"><strong>Playing:</strong> {selectedVideoFile.name}</p>
              <p className="playing-size"> Size: {formatBytes(selectedVideoFile.size)}</p>
            </div>

          </div>
        ) : (
          <div className="player-error-container">
            <p> No streamable video tracks could be extracted from this torrent.</p>
          </div>
        )}
      </div>
    </div>
  );
}
