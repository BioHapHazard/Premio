import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';
import { formatBytes } from '../lib/format';

// In-browser audio player overlay (music albums & audiobooks). Reads its state
// from context; renders nothing unless an audio torrent is active. Takes
// syncToCloud as a prop (the cloud-sync engine still lives in AppContent) so the
// close button can push the latest progress checkpoints.
export default function AudioPlayerModal({ syncToCloud }) {
  const {
    activeAudioTorrent, setActiveAudioTorrent,
    selectedAudioFile, setSelectedAudioFile,
    audioPlayableFiles, setAudioPlayableFiles,
    audioSearchQuery, setAudioSearchQuery,
    resumeAudioTime, setResumeAudioTime,
    setPlaylistSelectionTrack,
    libraryList, continueWatchingList,
    playerLoading,
  } = useAppState();

  if (!activeAudioTorrent) return null;

  // Filter audio files by their clean file name, sorted by folder path hierarchy.
  const filteredAudioFiles = audioPlayableFiles
    .map(f => ({ ...f, displayName: f.name.split('/').pop() }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), undefined, { numeric: true, sensitivity: 'base' }))
    .filter(f => f.displayName.toLowerCase().includes(audioSearchQuery.toLowerCase()));

  return (
    <div className="player-modal-backdrop">
      <div className="player-modal glass-panel fade-in" role="dialog" aria-modal="true" aria-label="Audio player">
        <div className="player-header">
          <h2 className="heading-ico"><Icon name="headphones" size={22} /> Audio WebPlayer</h2>
          <button
            className="close-player-btn"
            onClick={() => {
              setActiveAudioTorrent(null);
              setSelectedAudioFile(null);
              setAudioPlayableFiles([]);
              setAudioSearchQuery('');
              setResumeAudioTime(0);
              syncToCloud(libraryList, continueWatchingList); // Push latest progress checkpoints to Cloud
            }}
            id="btn-close-audio"
          >
             Close Player
          </button>
        </div>

        {playerLoading ? (
          <div className="player-loading-container">
            <span className="spinner-micro white large"></span>
            <p>Extracting audio links from Premiumize CDN...</p>
          </div>
        ) : selectedAudioFile ? (
          <div className="player-active-layout">
            <div className="player-screen-canvas" style={{ minHeight: '520px', height: '62vh' }}>
              <iframe
                src={`/audio.html?rom=${encodeURIComponent(selectedAudioFile.link)}${resumeAudioTime > 0 ? `&time=${resumeAudioTime}` : ''}`}
                className="main-audio-frame"
                allowFullScreen
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  background: '#0d0f14',
                  borderRadius: '8px',
                  boxShadow: '0 0 20px var(--color-primary-glow)'
                }}
              ></iframe>
            </div>

            {/* Select active track (for folder torrents / albums!) */}
            {audioPlayableFiles.length > 1 && (
              <div className="player-controls-row" style={{ marginTop: '1rem', width: '100%', flexDirection: 'column', gap: '0.5rem' }}>
                <div className="retro-search-box">
                  <label htmlFor="search-audio" style={{ color: '#f59e0b', fontWeight: '700', display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                     Search & Select Track from Album (Alphabetical):
                  </label>
                  <input
                    type="text"
                    id="search-audio"
                    placeholder="Type to filter tracks in playlist... (e.g. Chapter 01)"
                    value={audioSearchQuery}
                    onChange={(e) => setAudioSearchQuery(e.target.value)}
                    className="retro-search-input"
                  />
                </div>

                <div className="retro-games-grid">
                  {filteredAudioFiles.map((file, idx) => (
                    <div key={idx} className="playlist-track-row" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', width: '100%' }}>
                      <button
                        type="button"
                        className={`retro-game-pill ${selectedAudioFile?.link === file.link ? 'active' : ''}`}
                        onClick={() => {
                          setResumeAudioTime(0);
                          setSelectedAudioFile(file);
                        }}
                        title={file.displayName}
                        style={{
                          flex: 1,
                          marginRight: 0,
                          borderColor: selectedAudioFile?.link === file.link ? '#f59e0b' : 'var(--glass-border)',
                          background: selectedAudioFile?.link === file.link ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.02)'
                        }}
                      >
                        <span className="game-icon" style={{ color: '#f59e0b' }}><Icon name="music" size={20} /></span>
                        <span className="game-name">{file.displayName}</span>
                        <span className="game-size">{formatBytes(file.size)}</span>
                      </button>
                      <button
                        type="button"
                        className="add-to-playlist-btn"
                        onClick={() => setPlaylistSelectionTrack(file)}
                        title="Add this track to a custom playlist"
                      >
                        <Icon name="plus" size={16} />
                      </button>
                    </div>
                  ))}
                  {filteredAudioFiles.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', gridColumn: '1 / -1', textAlign: 'center', padding: '1rem' }}>
                      No matching tracks found in this playlist.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Playing Info pane */}
            <div className="player-file-info">
              <p className="playing-title"><strong>Track:</strong> {selectedAudioFile.name}</p>
              <p className="playing-size"> Size: {formatBytes(selectedAudioFile.size)}</p>
            </div>

          </div>
        ) : (
          <div className="player-error-container">
            <p> No compatible audio files (.mp3, .m4b, .flac, .wav, .m4a) could be extracted from this release.</p>
          </div>
        )}
      </div>
    </div>
  );
}
