import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';
import { formatBytes } from '../lib/format';
import { getEmulatorSystem } from '../lib/emulator';

// Retro Arcade (EmulatorJS) player overlay. Reads its state from context and
// renders nothing unless a retro torrent is active.
export default function RetroPlayerModal() {
  const {
    activeRetroTorrent, setActiveRetroTorrent,
    selectedRetroRomFile, setSelectedRetroRomFile,
    retroPlayableFiles, setRetroPlayableFiles,
    retroSearchQuery, setRetroSearchQuery,
    playerLoading,
  } = useAppState();

  if (!activeRetroTorrent) return null;

  // Filter ROMs alphabetically by their clean file name (pack/folder torrents).
  const filteredRetroFiles = retroPlayableFiles
    .map(f => ({ ...f, displayName: f.name.split('/').pop() }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true, sensitivity: 'base' }))
    .filter(f => f.displayName.toLowerCase().includes(retroSearchQuery.toLowerCase()));

  return (
    <div className="player-modal-backdrop">
      <div className="player-modal glass-panel fade-in" role="dialog" aria-modal="true" aria-label="Retro arcade console">
        <div className="player-header">
          <h2 className="heading-ico"><Icon name="device-gamepad" size={22} /> Retro Arcade Console</h2>
          <button
            className="close-player-btn"
            onClick={() => {
              setActiveRetroTorrent(null);
              setSelectedRetroRomFile(null);
              setRetroPlayableFiles([]);
              setRetroSearchQuery('');
            }}
            id="btn-close-retro"
          >
             Close Arcade
          </button>
        </div>

        {playerLoading ? (
          <div className="player-loading-container">
            <span className="spinner-micro white large"></span>
            <p>Extracting ROM links from Premiumize CDN...</p>
          </div>
        ) : selectedRetroRomFile ? (
          <div className="player-active-layout">
            <div className="player-screen-canvas">
              <iframe
                src={`/emulator.html?system=${getEmulatorSystem(selectedRetroRomFile.name)}&rom=${encodeURIComponent(
                  selectedRetroRomFile.link.startsWith('http://localhost:3001/mock-download')
                    ? selectedRetroRomFile.link
                    : `/api/proxy-rom?url=${encodeURIComponent(selectedRetroRomFile.link)}`
                )}&file=${encodeURIComponent(selectedRetroRomFile.name)}`}
                className="main-arcade-frame"
                allowFullScreen
                scrolling="no"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  background: '#000',
                  borderRadius: '8px',
                  boxShadow: '0 0 20px var(--color-primary-glow)'
                }}
              ></iframe>
            </div>

            {/* Select active ROM file (for pack / folder torrents!) */}
            {retroPlayableFiles.length > 1 && (
              <div className="player-controls-row" style={{ marginTop: '1rem', width: '100%', flexDirection: 'column', gap: '0.5rem' }}>
                <div className="retro-search-box">
                  <label htmlFor="search-retro-rom" style={{ color: 'var(--color-arcade)', fontWeight: '700', display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                     Search & Select Game from Pack (Alphabetical):
                  </label>
                  <input
                    type="text"
                    id="search-retro-rom"
                    placeholder="Type to filter ROMs in pack... (e.g. Mario)"
                    value={retroSearchQuery}
                    onChange={(e) => setRetroSearchQuery(e.target.value)}
                    className="retro-search-input"
                  />
                </div>

                <div className="retro-games-grid">
                  {filteredRetroFiles.map((file, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`retro-game-pill ${selectedRetroRomFile?.link === file.link ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedRetroRomFile(file);
                      }}
                      title={file.displayName}
                    >
                      <span className="game-icon"><Icon name="device-gamepad" size={20} /></span>
                      <span className="game-name">{file.displayName}</span>
                      <span className="game-size">{formatBytes(file.size)}</span>
                    </button>
                  ))}
                  {filteredRetroFiles.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', gridColumn: '1 / -1', textAlign: 'center', padding: '1rem' }}>
                      No matching ROMs found in this pack.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Controller & Inputs Guide HUD */}
            <div className="player-meta-pane">
              <h3> Arcade Control Guide</h3>
              <div className="controller-guide-grid">
                <div className="guide-group">
                  <h4>Keyboard Bindings</h4>
                  <ul>
                    <li><strong>D-Pad / Movement</strong>: Arrow Keys</li>
                    <li><strong>A Button / Primary</strong>: Z Key</li>
                    <li><strong>B Button / Secondary</strong>: X Key</li>
                    <li><strong>Start Button</strong>: Enter Key</li>
                    <li><strong>Select Button</strong>: Shift Key</li>
                    <li><strong>Turbo A / B</strong>: A Key / S Key</li>
                  </ul>
                </div>
                <div className="guide-group">
                  <h4>External Gamepads</h4>
                  <p>Pair an Xbox, PlayStation, or generic Bluetooth/USB gamepad. Browser Gamepad APIs will pair and map controls automatically!</p>
                </div>
                <div className="guide-group">
                  <h4>Game Save States</h4>
                  <p>Save and load your progress at any time. EmulatorJS automatically stores save states inside your local browser IndexedDB cache.</p>
                </div>
              </div>
            </div>

            {/* Playing info */}
            <div className="player-file-info">
              <p className="playing-title"><strong>Playing:</strong> {selectedRetroRomFile.name}</p>
              <p className="playing-size"> Size: {formatBytes(selectedRetroRomFile.size)}</p>
            </div>

          </div>
        ) : (
          <div className="player-error-container">
            <p> No compatible retro ROM or Zip files could be extracted from this release.</p>
          </div>
        )}
      </div>
    </div>
  );
}
