import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';

// "Add track to a playlist" chooser modal: pick an existing playlist or create one.
// Reads playlist state from context; receives addTrackToPlaylist as a prop.
export default function PlaylistSelectorModal({ addTrackToPlaylist, createPlaylistAndAdd }) {
  const { playlistSelectionTrack, playlists, setPlaylistSelectionTrack } = useAppState();

  return (
          <div className="player-modal-backdrop" style={{ zIndex: 3000 }}>
            <div className="playlist-selector-modal glass-panel fade-in" role="dialog" aria-modal="true" aria-label="Add track to playlist" style={{ maxWidth: '480px', width: '90%', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Icon name="music" size={18} /> Add Track to Playlist
                </h3>
                <button 
                  className="close-player-btn"
                  onClick={() => setPlaylistSelectionTrack(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', minWidth: 'auto', padding: 0 }}
                >
                  <Icon name="x" size={20} />
                </button>
              </div>

              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <p style={{ margin: '0 0 0.5rem 0' }}>Track to add:</p>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: '500', wordBreak: 'break-all' }}>
                  {playlistSelectionTrack.displayName || playlistSelectionTrack.name.split('/').pop()}
                </div>
              </div>

              {/* Add to Existing Playlist section */}
              {playlists.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Choose an existing playlist:</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                    {playlists.map((pl, index) => (
                      <button
                        key={index}
                        type="button"
                        className="playlist-select-item-btn"
                        onClick={() => addTrackToPlaylist(pl.name, playlistSelectionTrack)}
                      >
                        <span style={{ color: '#f59e0b', display: 'flex' }}><Icon name="music" size={16} /></span>
                        <span style={{ flex: 1, textAlign: 'left', fontWeight: '500' }}>{pl.name}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{pl.tracks.length} track(s)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Create & Add to New Playlist section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1.25rem' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Or create a new playlist:</span>
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const name = formData.get('playlistName');
                    if (name && name.toString().trim()) {
                      createPlaylistAndAdd(name.toString().trim(), playlistSelectionTrack);
                    }
                  }}
                  style={{ display: 'flex', gap: '0.5rem' }}
                >
                  <input
                    type="text"
                    name="playlistName"
                    placeholder="New playlist name..."
                    className="retro-search-input"
                    style={{ margin: 0, flex: 1 }}
                    required
                  />
                  <button type="submit" className="action-btn" style={{ minWidth: 'auto', padding: '0 1rem', background: '#f59e0b', border: 'none', color: '#000', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer' }}>
                    Create
                  </button>
                </form>
              </div>
            </div>
          </div>
  );
}
