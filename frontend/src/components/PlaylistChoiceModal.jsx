import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';

// Playback-mode chooser for a folder/playlist: launch as an in-browser playlist or
// AI-curate the track order. Reads pending-playlist + AI state from context;
// receives handleLaunchBrowserPlaylist + handleAICuratePlaylist as props.
export default function PlaylistChoiceModal({ handleLaunchBrowserPlaylist, handleAICuratePlaylist, downloadM3UPlaylist }) {
  const {
    pendingPlaylistFiles, pendingPlaylistName, hasAviOrMkvInPending,
    pendingItemId, pendingItemType,
    aiEnabled, aiLoading, aiCuratePrompt, setAiCuratePrompt,
    setShowPlaylistChoiceModal,
  } = useAppState();

  return (
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
  );
}
