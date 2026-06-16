import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';
import { formatBytes } from '../lib/format';

// eBook / PDF reader overlay. Reads its state from context and renders nothing
// unless an eBook torrent is active.
export default function EbookReaderModal() {
  const {
    activeEbookTorrent, setActiveEbookTorrent,
    selectedEbookFile, setSelectedEbookFile,
    ebookPlayableFiles, setEbookPlayableFiles,
    ebookSearchQuery, setEbookSearchQuery,
    resumeEbookChapter, setResumeEbookChapter,
    resumeEbookScroll,
    playerLoading,
  } = useAppState();

  if (!activeEbookTorrent) return null;

  // Filter eBook files alphabetically by their clean file name (pack/folder torrents).
  const filteredEbookFiles = ebookPlayableFiles
    .map(f => ({ ...f, displayName: f.name.split('/').pop() }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true, sensitivity: 'base' }))
    .filter(f => f.displayName.toLowerCase().includes(ebookSearchQuery.toLowerCase()));

  return (
    <div className="player-modal-backdrop">
      <div className="player-modal glass-panel fade-in" role="dialog" aria-modal="true" aria-label="eBook reader">
        <div className="player-header">
          <h2 className="heading-ico"><Icon name="book" size={22} /> EBook Reader Panel</h2>
          <button
            className="close-player-btn"
            onClick={() => {
              setActiveEbookTorrent(null);
              setSelectedEbookFile(null);
              setEbookPlayableFiles([]);
              setEbookSearchQuery('');
              setResumeEbookChapter(null);
            }}
            id="btn-close-ebook"
          >
             Close Reader
          </button>
        </div>

        {playerLoading ? (
          <div className="player-loading-container">
            <span className="spinner-micro white large"></span>
            <p>Extracting eBook links from Premiumize CDN...</p>
          </div>
        ) : selectedEbookFile ? (
          <div className="player-active-layout">
            <div className="player-screen-canvas" style={{ minHeight: '600px', height: '70vh' }}>
              <iframe
                src={`/reader.html?system=${selectedEbookFile.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub'}&rom=${encodeURIComponent(
                  selectedEbookFile.link.startsWith('http://localhost:3001/mock-download')
                    ? selectedEbookFile.link
                    : `/api/proxy-rom?url=${encodeURIComponent(selectedEbookFile.link)}`
                )}${resumeEbookChapter !== null ? `&chapter=${resumeEbookChapter}` : ''}${resumeEbookScroll !== null && resumeEbookScroll !== undefined ? `&scroll=${resumeEbookScroll}` : ''}`}
                className="main-ebook-frame"
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

            {/* Select active eBook file (for pack / folder torrents!) */}
            {ebookPlayableFiles.length > 1 && (
              <div className="player-controls-row" style={{ marginTop: '1rem', width: '100%', flexDirection: 'column', gap: '0.5rem' }}>
                <div className="retro-search-box">
                  <label htmlFor="search-ebook" style={{ color: 'var(--color-primary)', fontWeight: '700', display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                     Search & Select Book from Pack (Alphabetical):
                  </label>
                  <input
                    type="text"
                    id="search-ebook"
                    placeholder="Type to filter books in pack... (e.g. Orwell)"
                    value={ebookSearchQuery}
                    onChange={(e) => setEbookSearchQuery(e.target.value)}
                    className="retro-search-input"
                  />
                </div>

                <div className="retro-games-grid">
                  {filteredEbookFiles.map((file, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`retro-game-pill ${selectedEbookFile?.link === file.link ? 'active' : ''}`}
                      onClick={() => {
                        setResumeEbookChapter(null);
                        setSelectedEbookFile(file);
                      }}
                      title={file.displayName}
                    >
                      <span className="game-icon"><Icon name="book" size={20} /></span>
                      <span className="game-name">{file.displayName}</span>
                      <span className="game-size">{formatBytes(file.size)}</span>
                    </button>
                  ))}
                  {filteredEbookFiles.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', gridColumn: '1 / -1', textAlign: 'center', padding: '1rem' }}>
                      No matching books found in this pack.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Reading Info pane */}
            <div className="player-file-info">
              <p className="playing-title"><strong>Reading:</strong> {selectedEbookFile.name}</p>
              <p className="playing-size"> Size: {formatBytes(selectedEbookFile.size)}</p>
            </div>

          </div>
        ) : (
          <div className="player-error-container">
            <p> No compatible eBook files (.epub, .pdf) could be extracted from this release.</p>
          </div>
        )}
      </div>
    </div>
  );
}
