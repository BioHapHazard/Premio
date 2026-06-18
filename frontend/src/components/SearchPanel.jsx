import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';
import { CATEGORIES } from '../lib/constants';
import { formatBytes, extractQuality, getIndexerShortName } from '../lib/format';
import { getEmulatorSystem } from '../lib/emulator';
import { keyActivate } from '../lib/a11y';

// Search tab: keyless-key warning, search bar + category lanes + torrent/usenet mode,
// AI semantic search, drag-drop / magnet import, the filters drawer, recent searches
// & downloads, and the results grid (cards with posters, ratings, quality tags, and
// play / library / watchlist actions). Reads search state from context; receives the
// derived result lists and all action handlers as props.
export default function SearchPanel({
  processedResults, results, cachedCount,
  handleSearch, handleAiSemanticSearch,
  handleDragOver, handleDragLeave, handleDrop, handleImportFile, handleImportMagnet,
  deleteHistoryItem, getMetadata,
  isItemInLibrary, isInWatchlist, toggleLibraryItem, toggleWatchlist,
  startStreaming, startAudioPlayer, startEbookPlayer, startRetroPlayer,
  triggerDirectDownload, triggerDownload, triggerSabDownload,
  buildSabStreamUrl,
}) {
  const {
    query, setQuery,
    category, setCategory,
    searchMode, setSearchMode,
    searchError, searched, loading,
    visibleCount, loadMoreRef,
    activeDownloadId, playerLoading,
    hideUsenetWarning, setHideUsenetWarning,
    isDragging,
    magnetInput, setMagnetInput,
    showFilters, setShowFilters,
    filterQuality, setFilterQuality,
    filterMaxSize, setFilterMaxSize,
    filterMinSeeders, setFilterMinSeeders,
    excludeKeywords, setExcludeKeywords,
    sortBy, setSortBy,
    recentSearches, recentDownloads,
    aiEnabled, userPmKey, userJackettUrl, hideAdult,
    showSettings, setMetadataDrawerItem, setShowSettings, setShowOnboarding, setOnboardingStep,
    userSabUrl, userSabKey, userSabCompleteDir, usenetHandler,
    sabQueue, sabHistory, setActiveTab,
    sabnzbdAutoFallbacks, completedIndexers,
    triggerToast,
  } = useAppState();

  const visibleCategories = CATEGORIES.filter(c => !(c === 'Adult' && hideAdult));

  return (
          <>
            {/* Warning Banner when keys are missing */}
            {(!userPmKey || !userJackettUrl) && (
              <div 
                className="mock-mode-warning-banner glass-panel fade-in" 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 18px',
                  borderRadius: '12px',
                  marginBottom: '16px',
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  fontSize: '0.85rem',
                  lineHeight: '1.4',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'flex', color: '#f59e0b' }}><Icon name="alert-triangle" size={18} /></span>
                  <div style={{ color: 'var(--text-muted)' }}>
                    {!userPmKey && !userJackettUrl ? (
                      <>
                        <strong>Setup Required:</strong> Premiumize API Key and Jackett URL are not configured. The app is running in <strong>Developer Mock Mode</strong> returning simulated results.
                      </>
                    ) : !userPmKey ? (
                      <>
                        <strong>Premiumize Key Missing:</strong> A Premiumize API key is required to check file cache status and stream media.
                      </>
                    ) : (
                      <>
                        <strong>Jackett Server Unconfigured:</strong> Jackett configuration is missing. Torrent search results are simulated.
                      </>
                    )}
                  </div>
                </div>
                <button 
                  type="button" 
                  className="action-btn"
                  onClick={() => {
                    setShowOnboarding(true);
                    setOnboardingStep(1);
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.75rem',
                    whiteSpace: 'nowrap',
                    background: 'linear-gradient(135deg, var(--color-primary) 0%, #4f46e5 100%)'
                  }}
                >
                  Configure Now
                </button>
              </div>
            )}
            <section 
              className={`search-card glass-panel ${isDragging ? 'dragging-active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragging && (
                <div className="drag-drop-overlay">
                  <div className="overlay-content">
                    <div className="overlay-icon"><Icon name="upload" size={40} /></div>
                    <h3>Drop your Torrent or NZB file here</h3>
                    <p>Premio will parse it, check Premiumize CDN cache status instantly, and present it inside the search list!</p>
                  </div>
                </div>
              )}
              <form onSubmit={handleSearch} className="search-form">
                
                {/* Category Selectors */}
                <div className="category-pill-box">
                  {visibleCategories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      className={`category-pill ${category === cat ? 'active' : ''}`}
                      onClick={() => setCategory(cat)}
                      id={`cat-pill-${cat.toLowerCase()}`}
                    >
                      <Icon name={cat === 'All' ? 'app' : cat === 'Movies' ? 'movie' : cat === 'TV' ? 'device-tv' : cat === 'Music' ? 'music' : cat === 'Audiobooks' ? 'headphones' : cat === 'Ebooks' ? 'book' : cat === 'Software' ? 'app' : cat === 'VST' ? 'music' : cat === 'Retro Games' ? 'device-gamepad' : 'folder'} size={15} />
                      <span className="pill-text">{cat}</span>
                    </button>
                  ))}
                </div>
                
                {/* Search Source Selector (Segmented button group) */}
                <div className="search-mode-segmented-box">
                  <button
                    type="button"
                    className={`search-mode-btn ${searchMode === 'torrent' ? 'active' : ''}`}
                    onClick={() => {
                      setSearchMode('torrent');
                      if (searched && query.trim()) {
                        setTimeout(() => handleSearch(null, 'torrent'), 50);
                      }
                    }}
                  >
                    <Icon name="database" size={14} /> Torrents (PM CDN Cache)
                  </button>
                  <button
                    type="button"
                    className={`search-mode-btn ${searchMode === 'usenet' ? 'active' : ''} ${usenetHandler === 'sabnzbd' ? 'sabnzbd-active' : ''}`}
                    onClick={() => {
                      setSearchMode('usenet');
                      if (searched && query.trim()) {
                        setTimeout(() => handleSearch(null, 'usenet'), 50);
                      }
                    }}
                  >
                    {usenetHandler === 'sabnzbd' ? (
                      <><Icon name="download" size={14} /> Usenet (SABnzbd Downloader)</>
                    ) : (
                      <><Icon name="bolt" size={14} fill /> Usenet (Double Points Cost)</>
                    )}
                  </button>
                  <button
                    type="button"
                    className={`search-mode-info-btn ${!hideUsenetWarning ? 'active' : ''}`}
                    onClick={() => {
                      const next = !hideUsenetWarning;
                      setHideUsenetWarning(next);
                      localStorage.setItem('premio_hide_usenet_warning', next ? 'true' : 'false');
                    }}
                    title={usenetHandler === 'sabnzbd' ? "Toggle SABnzbd integration info panel" : "Toggle Usenet Fair-Use points caution panel"}
                  >
                    <Icon name="bulb" size={14} /> {hideUsenetWarning ? 'Show Info' : 'Hide Info'}
                  </button>
                </div>

                {/* Drag-and-Drop & Paste Importer Panel */}
                <div className="importer-inline-bar">
                  <div className="importer-divider">
                    <span>— OR IMPORT DIRECTLY —</span>
                  </div>
                  <div className="importer-controls">
                    <div className="file-uploader-wrapper">
                      <label className="file-uploader-btn">
                        <Icon name="upload" size={15} /> Upload Torrent or NZB File
                        <input
                          type="file"
                          accept=".torrent,.nzb"
                          onChange={handleImportFile}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </div>
                    <div className="magnet-paster-wrapper">
                      <input
                        type="text"
                        value={magnetInput}
                        onChange={(e) => setMagnetInput(e.target.value)}
                        placeholder="Paste Magnet Link..."
                        className="magnet-input-field"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault(); // Stop main search form submission!
                            handleImportMagnet(); // Fire parser check immediately!
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleImportMagnet}
                        className="magnet-submit-btn"
                      >
                        <Icon name="bolt" size={14} fill /> Parse & Check Cache
                      </button>
                    </div>
                  </div>
                </div>

                {/* Input and Search Button */}
                <div className="search-row">
                  <div className="input-container">
                    <span className="input-search-icon"><Icon name="search" size={18} /></span>
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`Search for ${category.toLowerCase()}... (e.g. ${
                        category === 'Movies' ? 'Oppenheimer' : 
                        category === 'TV' ? 'Succession' : 
                        category === 'Music' ? 'Daft Punk' : 
                        category === 'Audiobooks' ? 'Andy Weir' : 
                        category === 'Ebooks' ? 'Pragmatic Programmer' : 
                        category === 'Other' ? 'Ableton VST Bundle' : 
                        category === 'Retro Games' ? 'Super Mario World' : 'Adult Release'
                      })`}
                      required
                      className="search-input"
                      id="search-input-field"
                    />
                    {query && (
                      <button type="button" className="clear-input-btn" onClick={() => setQuery('')} aria-label="Clear search">
                        <Icon name="x" size={16} />
                      </button>
                    )}
                  </div>
                  
                  <button 
                    type="button" 
                    className={`filter-toggle-btn ${showFilters ? 'active' : ''} ${results.length > 0 ? 'glowing' : ''}`}
                    onClick={() => {
                      setShowFilters(!showFilters);
                      if (showSettings) setShowSettings(false);
                    }}
                    title="Filters and Sorting Settings"
                  >
                    <Icon name="filter" size={16} /> Filters
                  </button>

                  {aiEnabled && (
                    <button 
                      type="button" 
                      className="ai-semantic-search-btn" 
                      disabled={loading || !query.trim()} 
                      onClick={handleAiSemanticSearch}
                      title="AI Semantic Search: Translate conceptual query into clean title and search"
                    >
                      <Icon name="wand" size={15} /> AI Search
                    </button>
                  )}

                  <button type="submit" className="search-submit-btn" disabled={loading} id="btn-submit-search">
                    {loading ? <span className="spinner-micro"></span> : 'Search'}
                  </button>
                </div>
              </form>

              {/* Search History quick shortcuts with individual delete 'x' button (Filtered: no adult queries will ever be displayed here) */}
              {recentSearches.length > 0 && (
                <div className="recent-searches-row">
                  <span className="recent-title">Recent searches:</span>
                  <div className="recent-tags">
                    {recentSearches.map((q, idx) => (
                      <div key={idx} className="recent-tag-wrapper">
                        <button
                          type="button"
                          className="recent-tag-btn"
                          onClick={() => {
                            setQuery(q);
                            setTimeout(() => document.getElementById('btn-submit-search')?.click(), 50);
                          }}
                        >
                          {q}
                        </button>
                        <button
                          type="button"
                          className="recent-tag-remove"
                          onClick={(e) => deleteHistoryItem(e, q)}
                          title={`Remove "${q}" from history`}
                        >
                          <Icon name="x" size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Advanced Collapsible Filters and Sorting Drawer */}
              {showFilters && (
                <div className="filters-drawer glass-inner-panel fade-in">
                  <h3 className="heading-ico"><Icon name="filter" size={18} /> Search Filters & Sorting</h3>
                  <div className="filters-grid">
                    
                    {/* 1. Quality dropdown */}
                    <div className="filter-group">
                      <label htmlFor="filter-quality">Resolution / Quality</label>
                      <select 
                        id="filter-quality" 
                        value={filterQuality} 
                        onChange={(e) => setFilterQuality(e.target.value)}
                        className="filter-select"
                      >
                        <option value="All">All Qualities</option>
                        <option value="4K">4K UHD (2160p)</option>
                        <option value="1080p">Full HD (1080p)</option>
                        <option value="720p">HD (720p)</option>
                      </select>
                    </div>

                    {/* 2. Sort dropdown */}
                    <div className="filter-group">
                      <label htmlFor="filter-sort">Sort Ordering</label>
                      <select 
                        id="filter-sort" 
                        value={sortBy} 
                        onChange={(e) => setSortBy(e.target.value)}
                        className="filter-select"
                      >
                        <option value="cached-seeders">Cached + Seeders (Default)</option>
                        <option value="seeders">Seeders count</option>
                        <option value="size-desc">Size: Large Small</option>
                        <option value="size-asc">Size: Small Large</option>
                        <option value="date">Age: Newest first</option>
                      </select>
                    </div>

                    {/* 3. Max Size Slider */}
                    <div className="filter-group">
                      <div className="slider-label-row">
                        <label htmlFor="filter-size">Max File Size</label>
                        <span className="slider-value">
                          {filterMaxSize >= 100 ? 'Unlimited' : `${filterMaxSize} GB`}
                        </span>
                      </div>
                      <input
                        type="range"
                        id="filter-size"
                        min="1"
                        max="100"
                        value={filterMaxSize}
                        onChange={(e) => setFilterMaxSize(Number(e.target.value))}
                        className="filter-slider"
                      />
                    </div>

                    {/* 4. Min Seeders Slider */}
                    <div className="filter-group">
                      <div className="slider-label-row">
                        <label htmlFor="filter-seeders">Min Seeders</label>
                        <span className="slider-value">
                          {filterMinSeeders === 0 ? 'Any' : `${filterMinSeeders}+`}
                        </span>
                      </div>
                      <input
                        type="range"
                        id="filter-seeders"
                        min="0"
                        max="50"
                        value={filterMinSeeders}
                        onChange={(e) => setFilterMinSeeders(Number(e.target.value))}
                        className="filter-slider"
                      />
                    </div>

                    {/* 5. Exclude keywords */}
                    <div className="filter-group full-width">
                      <label htmlFor="filter-exclude">Exclude Keywords</label>
                      <input
                        type="text"
                        id="filter-exclude"
                        value={excludeKeywords}
                        onChange={(e) => setExcludeKeywords(e.target.value)}
                        placeholder="Enter keywords to hide, comma separated (e.g. CAM, HC, 3D, German)"
                        className="filter-text-input"
                      />
                    </div>

                  </div>

                  {/* Reset Filters trigger */}
                  <div className="filters-footer">
                    <button
                      type="button"
                      className="reset-filters-btn"
                      onClick={() => {
                        setFilterQuality('All');
                        setFilterMaxSize(100);
                        setFilterMinSeeders(0);
                        setExcludeKeywords('');
                        setSortBy('cached-seeders');
                        triggerToast('Filters reset.', 'success');
                      }}
                    >
                       Reset Filters
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Usenet Downloader Info/Caution banner */}
            {searchMode === 'usenet' && !hideUsenetWarning && (
              usenetHandler === 'sabnzbd' ? (
                <div className="usenet-points-warning glass-panel usenet-sabnzbd-info fade-in" style={{ borderColor: 'rgba(52, 211, 153, 0.4)', background: 'rgba(52, 211, 153, 0.03)' }}>
                  <div className="warning-icon-col" style={{ color: '#34d399' }}><Icon name="info" size={28} /></div>
                  <div className="warning-text-col">
                    <h3 style={{ color: '#34d399' }}>SABnzbd Downloader Active</h3>
                    <p>
                      Premio is configured to download Usenet releases using your self-hosted <strong>SABnzbd</strong> downloader:
                    </p>
                    <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                      <li style={{ marginBottom: '4px' }}>
                        <strong>0 PM Points Cost:</strong> Downloads bypass Premiumize entirely, conserving your cloud storage and points balance.
                      </li>
                      <li style={{ marginBottom: '4px' }}>
                        <strong>Local Storage:</strong> NZBs are sent to your local SABnzbd client and saved to: <code style={{ color: '#34d399', background: 'rgba(0, 0, 0, 0.2)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.85em' }}>{userSabCompleteDir || 'configured directory'}</code>.
                      </li>
                      <li style={{ marginBottom: '4px' }}>
                        <strong>Transfers Monitoring:</strong> You can track download/unpacking speed, ETA, and progress from the <strong>Downloads</strong> panel, play from disk, or delete them when done.
                      </li>
                    </ul>
                    <p className="warning-tip" style={{ color: '#a7f3d0', marginTop: '6px' }}>
                      Make sure your local SABnzbd application is running in the background!
                    </p>
                  </div>
                  <button
                    type="button"
                    className="close-warning-btn"
                    onClick={() => {
                      setHideUsenetWarning(true);
                      localStorage.setItem('premio_hide_usenet_warning', 'true');
                      triggerToast('SABnzbd downloader info dismissed. Review at any time by toggling the button.', 'success');
                    }}
                    title="Dismiss info panel permanently"
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
              ) : (
                <div className="usenet-points-warning glass-panel fade-in">
                  <div className="warning-icon-col"><Icon name="alert-triangle" size={28} /></div>
                  <div className="warning-text-col">
                    <h3>Usenet Fair-Use Points Notice</h3>
                    <p>
                      Adding a release from Usenet is a <strong>double-cost</strong> points transaction on Premiumize:
                    </p>
                    <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                      <li style={{ marginBottom: '4px' }}>
                        <strong>1 point per GB</strong> to cache the release from Usenet to your cloud locker.
                      </li>
                      <li style={{ marginBottom: '4px' }}>
                        <strong>1 point per GB</strong> to download or stream the cached file to your local player.
                      </li>
                      <li style={{ marginBottom: '4px' }}>
                        <strong>Total cost = 2 points per GB</strong> (compared to cached torrents which only cost 1 point per GB to stream).
                      </li>
                    </ul>
                    <p className="warning-tip">
                      Prioritize free cached torrents (marked with glowing Instant DL badges) to conserve your daily points balance!
                    </p>
                  </div>
                  <button
                    type="button"
                    className="close-warning-btn"
                    onClick={() => {
                      setHideUsenetWarning(true);
                      localStorage.setItem('premio_hide_usenet_warning', 'true');
                      triggerToast('Usenet point warning dismissed. Review at any time by toggling the button.', 'success');
                    }}
                    title="Dismiss warning permanently"
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
              )
            )}

            {/* Results Grid display */}
            <section className="results-container">
              {loading ? (
                /* Shimmer loading skeleton */
                <div className="loading-grid">
                  {[1, 2, 3, 4].map(n => (
                    <div key={n} className="loading-row-skeleton glass-panel">
                      <div className="shimmer-title"></div>
                      <div className="shimmer-badges">
                        <div className="shimmer-badge"></div>
                        <div className="shimmer-badge"></div>
                      </div>
                      <div className="shimmer-footer"></div>
                    </div>
                  ))}
                </div>
              ) : searchError ? (
                <div className="empty-state glass-panel search-error-state">
                  <div className="empty-icon" style={{ color: 'var(--color-danger)' }}><Icon name="alert-triangle" size={40} /></div>
                  <h2>Search failed</h2>
                  <p>{searchError} This usually means Jackett or the indexer is unreachable, or a key needs checking in Settings.</p>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => handleSearch(null)}
                  >
                    <Icon name="refresh" size={15} /> Retry search
                  </button>
                </div>
              ) : results.length > 0 ? (
                <div className="results-list">
                  <div className="results-header-row">
                    <div className="results-header">
                      <h2 className="heading-ico"><Icon name="search" size={20} /> Search Results ({processedResults.length})</h2>
                      <span className="results-subtitle">
                        Sorted by: <strong>{
                          sortBy === 'cached-seeders' ? (searchMode === 'usenet' ? 'NZB Grabs' : 'Instant Cached first, then Seeders') :
                          sortBy === 'seeders' ? (searchMode === 'usenet' ? 'NZB Grabs' : 'Health / Seeders') :
                          sortBy === 'size-desc'? 'Size (Large Small)':
                          sortBy === 'size-asc'? 'Size (Small Large)': 'Release Age (Newest)'
                        }</strong>
                      </span>
                    </div>
                    
                    <div className="stats-badges">
                      {searchMode === 'usenet' ? (
                        <span className={`stat-badge ${usenetHandler === 'sabnzbd' ? 'stat-badge-usenet-sabnzbd' : 'stat-badge-usenet'}`}>
                          <Icon name={usenetHandler === 'sabnzbd' ? 'download' : 'bolt'} size={14} fill={usenetHandler !== 'sabnzbd'} />{' '}
                          {processedResults.length} {usenetHandler === 'sabnzbd' ? 'SABnzbd' : 'Usenet'} NZB Releases
                        </span>
                      ) : (
                        <>
                          <span className="stat-badge stat-badge-cached">
                            <Icon name="bolt" size={14} fill /> {cachedCount} Cached
                          </span>
                          {processedResults.length !== results.length && (
                            <span className="stat-badge stat-badge-filtered">
                              <Icon name="alert-triangle" size={14} /> {results.length - processedResults.length} Filtered
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Active filter chips — one-click clear per active filter */}
                  {(filterQuality !== 'All' || filterMaxSize < 100 || filterMinSeeders > 0 || excludeKeywords.trim()) && (
                    <div className="active-filter-chips">
                      <span className="active-filter-label">Active filters:</span>
                      {filterQuality !== 'All' && (
                        <button type="button" className="filter-chip" onClick={() => setFilterQuality('All')} aria-label={`Remove filter: quality ${filterQuality}`}>
                          Quality: {filterQuality} <Icon name="x" size={12} />
                        </button>
                      )}
                      {filterMaxSize < 100 && (
                        <button type="button" className="filter-chip" onClick={() => setFilterMaxSize(100)} aria-label={`Remove filter: max size ${filterMaxSize} gigabytes`}>
                          Max size: {filterMaxSize} GB <Icon name="x" size={12} />
                        </button>
                      )}
                      {filterMinSeeders > 0 && (
                        <button type="button" className="filter-chip" onClick={() => setFilterMinSeeders(0)} aria-label={`Remove filter: minimum ${filterMinSeeders} seeders`}>
                          Min seeders: {filterMinSeeders} <Icon name="x" size={12} />
                        </button>
                      )}
                      {excludeKeywords.trim() && (
                        <button type="button" className="filter-chip" onClick={() => setExcludeKeywords('')} aria-label="Remove filter: excluded keywords">
                          Excludes: {excludeKeywords.trim()} <Icon name="x" size={12} />
                        </button>
                      )}
                      <button type="button" className="filter-chip filter-chip-clear" onClick={() => { setFilterQuality('All'); setFilterMaxSize(100); setFilterMinSeeders(0); setExcludeKeywords(''); }}>
                        Clear all
                      </button>
                    </div>
                  )}

                  {/* Inline Usenet Suggestion Banner (when no torrents are cached) */}
                  {searchMode === 'torrent' && cachedCount === 0 && (
                    <div className="usenet-suggestion-banner glass-panel fade-in">
                      <span className="suggestion-icon"><Icon name="bulb" size={22} /></span>
                      <div className="suggestion-text">
                        <h4>No globally cached torrents found for this search</h4>
                        <p>
                          Downloading uncached torrents on Premiumize can take time. 
                          You can search Usenet instead, which is often extremely fast and complete!
                        </p>
                      </div>
                      <button
                        type="button"
                        className={`usenet-switch-inline-btn active ${usenetHandler === 'sabnzbd' ? 'sabnzbd-active' : ''}`}
                        onClick={() => {
                          setSearchMode('usenet');
                          setTimeout(() => handleSearch(null, 'usenet'), 50);
                        }}
                      >
                        {usenetHandler === 'sabnzbd' ? (
                          <><Icon name="download" size={15} /> Search Usenet (SABnzbd)</>
                        ) : (
                          <><Icon name="bolt" size={15} fill /> Search Usenet (Indexers)</>
                        )}
                      </button>
                    </div>
                  )}
                  
                  {processedResults.length === 0 ? (
                    <div className="empty-state glass-panel">
                      <div className="empty-icon"><Icon name="filter" size={40} /></div>
                      <h2>No items match active filters</h2>
                      <p>Try adjusting your parameters in the filters panel above.</p>
                    </div>
                  ) : (
                    <div className="results-grid">
                      {processedResults.slice(0, visibleCount).map((item, idx) => {
                        const isUsenetItem = item.nzbUrl !== undefined;
                        const qualityTags = extractQuality(item.title);
                        
                        const downloadSource = isUsenetItem ? item.nzbUrl : (item.magnet || item.torrentFile);
                        const itemIdentifier = isUsenetItem ? item.nzbUrl : (item.infoHash || item.magnet || item.torrentFile);
                        const isDownloading = activeDownloadId !== null && activeDownloadId === itemIdentifier;
                        const inLib = isItemInLibrary(item);
                        const meta = getMetadata(item);
                        const cat = item.detectedType || item.category || category;
                        const isVideo = cat === 'Movies' || cat === 'TV';
                        
                        // Determine SABnzbd status for Usenet downloads
                        const getSabnzbdStatus = () => {
                          if (usenetHandler !== 'sabnzbd' || !isUsenetItem) return null;
                          const sTitle = item.title.toLowerCase();

                          // Helper to check if name matches
                          const isMatch = (name) => {
                            if (!name) return false;
                            const n = name.toLowerCase();
                            return n.includes(sTitle) || sTitle.includes(n);
                          };

                          // Check queue
                          const qMatch = sabQueue.find(q => isMatch(q.name));
                          if (qMatch) {
                            return { status: 'downloading', percent: qMatch.percent, eta: qMatch.eta, nzoId: qMatch.nzoId };
                          }

                          // Check history
                          const hMatch = sabHistory.find(h => isMatch(h.name));
                          if (hMatch) {
                            if (hMatch.status === 'Completed') {
                              return { status: 'completed', nzoId: hMatch.nzoId };
                            } else if (hMatch.status === 'Failed') {
                              return { status: 'failed', nzoId: hMatch.nzoId };
                            } else {
                              return { status: 'processing', stage: hMatch.status, nzoId: hMatch.nzoId };
                            }
                          }

                          if (item.cached) {
                            return { status: 'queued' };
                          }

                          return null;
                        };

                        const sabStatus = getSabnzbdStatus();
                        
                        // Fallback to Usenet indexer custom cover art if TMDb poster is unavailable
                        // For video content, we always reserve poster space to avoid layout shifts.
                        const hasPoster = !!(meta?.poster || item.coverurl || isVideo);
                        const posterSrc = meta?.poster || item.coverurl;
                        const isMetadataLoading = isVideo && !meta;
                        
                        return (
                          <article key={idx} className={`result-card glass-panel ${isUsenetItem ? (usenetHandler === 'sabnzbd' ? 'usenet-sabnzbd-hit' : 'usenet-hit') : (item.cached ? 'cached-hit' : 'cached-miss')} ${hasPoster ? 'has-poster' : ''}`}>
                            {hasPoster && (
                              <div className="card-poster-col" role="button" tabIndex={0} aria-label={`View details for ${meta?.title || item.title}`} onClick={() => setMetadataDrawerItem({ ...item, _metadata: meta || { poster: item.coverurl, title: item.title, overview: 'Loading details from TMDb...' } })} onKeyDown={keyActivate(() => setMetadataDrawerItem({ ...item, _metadata: meta || { poster: item.coverurl, title: item.title, overview: 'Loading details from TMDb...' } }))}>
                                {posterSrc ? (
                                  <img src={posterSrc} alt="" className="card-poster-img" loading="lazy" />
                                ) : (
                                  <div className="shimmer-poster">
                                    <Icon name="movie" size={24} />
                                  </div>
                                )}
                                {meta?.voteAverage ? (
                                  <span className="poster-rating"><Icon name="star" fill size={11} /> {meta.voteAverage.toFixed(1)}</span>
                                ) : null}
                                <span className="poster-hover-play"><Icon name="player-play" fill size={20} /></span>
                              </div>
                            )}
                            <div className="card-content-col">
                            <div className="card-top">
                              <div className="card-title-row">
                                <h3 className="result-title" title={item.title}>
                                  {item.title}
                                </h3>
                                {meta?.year && <span className="title-year">{meta.year}</span>}
                                {item.detectedType && (
                                  <span className="type-badge" title="Detected content type">{item.detectedType}</span>
                                )}
                              </div>
                              {isMetadataLoading ? (
                                <div className="meta-line">
                                  <span className="shimmer-badge" style={{ width: '40px', height: '18px', borderRadius: '4px' }} />
                                  <span className="shimmer-badge" style={{ width: '85px', height: '18px', borderRadius: '4px' }} />
                                  <button className="meta-details-link" onClick={(e) => { e.stopPropagation(); setMetadataDrawerItem({ ...item, _metadata: { title: item.title, overview: 'Loading details from TMDb...' } }); }} title="View full details">
                                    <Icon name="refresh" className="spin" size={14} /> Details
                                  </button>
                                </div>
                              ) : meta && (meta.voteAverage || meta.rating || meta.genres?.length || meta.artist || meta.author || meta.runtime || meta.tmdbMiss) ? (
                                <div className="meta-line">
                                  {meta.voteAverage ? <span className="meta-rating"><Icon name="star" fill size={13} /> {meta.voteAverage.toFixed(1)}</span> : null}
                                  {meta.rating ? <span className="meta-rating"><Icon name="star" fill size={13} /> {meta.rating}</span> : null}
                                  {meta.genres && meta.genres.slice(0, 2).map((g, gi) => (
                                    <span key={gi} className="meta-genre">{g}</span>
                                  ))}
                                  {meta.artist && <span className="meta-sub">{meta.artist}</span>}
                                  {meta.author && <span className="meta-sub">{meta.author}</span>}
                                  {meta.runtime ? <span className="meta-sub"><Icon name="clock" size={13} /> {Math.floor(meta.runtime / 60)}h {meta.runtime % 60}m</span> : null}
                                  {meta.tmdbMiss ? <span className="meta-genre" style={{ opacity: 0.6 }}>No TMDb Match</span> : null}
                                  <button className="meta-details-link" onClick={(e) => { e.stopPropagation(); setMetadataDrawerItem({ ...item, _metadata: meta }); }} title="View full details">
                                    <Icon name="info" size={14} /> Details
                                  </button>
                                </div>
                              ) : isVideo ? (
                                <div className="meta-line">
                                  <button className="meta-details-link" onClick={(e) => { e.stopPropagation(); setMetadataDrawerItem({ ...item, _metadata: { title: item.title, overview: 'No details found.' } }); }} title="View full details">
                                    <Icon name="info" size={14} /> Details
                                  </button>
                                </div>
                              ) : null}
                              
                              {(qualityTags.length > 0 || (isUsenetItem && usenetHandler === 'sabnzbd')) && (
                                <div className="quality-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                                  {qualityTags.map((tag, tagIdx) => (
                                    <span key={tagIdx} className={`quality-badge q-${tag.type}`}>
                                      {tag.text}
                                    </span>
                                  ))}
                                  {(() => {
                                    if (!isUsenetItem || usenetHandler !== 'sabnzbd') return null;
                                    const cleanTitle = (item.title || '').trim().toLowerCase();
                                    const successfulIndexerName = completedIndexers && completedIndexers[cleanTitle];
                                    if (successfulIndexerName) {
                                      return (
                                        <span className="indexer-completed-pill" title={`Downloaded from indexer: ${successfulIndexerName}`} style={{
                                          background: 'rgba(16, 185, 129, 0.15)',
                                          color: '#10b981',
                                          border: '1px solid rgba(16, 185, 129, 0.3)',
                                          borderRadius: '4px',
                                          padding: '2px 6px',
                                          fontSize: '0.7rem',
                                          fontWeight: '600',
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.05em',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                        }}>
                                          <Icon name="check" size={10} /> {getIndexerShortName(successfulIndexerName)}
                                        </span>
                                      );
                                    }

                                    const fallbackItem = sabnzbdAutoFallbacks && Object.values(sabnzbdAutoFallbacks).find(f => f.cleanTitle === cleanTitle);
                                    if (fallbackItem) {
                                      const currentIndexer = fallbackItem.indexersList[fallbackItem.currentIndex]?.name;
                                      if (currentIndexer) {
                                        return (
                                          <span className="indexer-downloading-pill" title={`Downloading from indexer: ${currentIndexer}`} style={{
                                            background: 'rgba(52, 211, 153, 0.1)',
                                            color: '#34d399',
                                            border: '1px solid rgba(52, 211, 153, 0.25)',
                                            borderRadius: '4px',
                                            padding: '2px 6px',
                                            fontSize: '0.7rem',
                                            fontWeight: '600',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                          }}>
                                            <span className="spinner-micro white small" style={{ borderColor: '#34d399', borderTopColor: 'transparent', width: '8px', height: '8px', borderWidth: '1px' }}></span> {getIndexerShortName(currentIndexer)}
                                          </span>
                                        );
                                      }
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}
                            </div>
 
                            <div className="card-middle">
                              <div className="stats-row">
                                <span className="stat-item" title="Size">
                                  <Icon name="database" size={14} /> {formatBytes(item.size)}
                                </span>
                                {isUsenetItem ? (
                                  <>
                                    <span className={`stat-item ${item.ageDays > 3000 ? 'text-red' : (usenetHandler === 'sabnzbd' ? 'text-emerald' : 'text-purple')}`} title="Usenet Age">
                                      <Icon name="clock" size={14} /> {item.ageDays}d {item.ageDays > 3000 && <span className="extreme-age-badge" title="Retention limit warn">old</span>}
                                    </span>
                                    <span className="stat-item text-blue" title="NZB Grabs">
                                      <Icon name="download" size={14} /> {item.grabs} grabs
                                    </span>
                                    {item.password && (
                                      <span className="stat-item text-amber" title={`Password: ${item.password}`}>
                                        <Icon name="bolt" size={14} /> PW: {item.password}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <span className="stat-item text-green" title="Seeders">
                                      <Icon name="arrow-up" size={14} /> {item.seeders} <span className="stat-label">seeds</span>
                                    </span>
                                    <span className="stat-item text-grey" title="Peers">
                                      {item.peers} <span className="stat-label">peers</span>
                                    </span>
                                  </>
                                )}
                              </div>

                              {/* Usenet Health Predictor Widget */}
                              {isUsenetItem && item.health !== undefined && (
                                <div className="health-predict-bar-container" title={`Usenet Completion Health: ${item.health}% (${item.health >= 90 ? 'Excellent' : item.health >= 70 ? 'Moderate' : 'Risk of Incomplete'})`}>
                                  <div className="health-predict-label">
                                    <span> Usenet Health:</span>
                                    <span className={`health-value ${item.health >= 90 ? 'green' : item.health >= 70 ? 'amber' : 'red'}`}>{item.health}%</span>
                                  </div>
                                  <div className="health-progress-bg">
                                    <div 
                                      className={`health-progress-fill ${item.health >= 90 ? 'green' : item.health >= 70 ? 'amber' : 'red'}`}
                                      style={{ width: `${item.health}%` }}
                                    ></div>
                                  </div>
                                  <span className="health-tooltip-text">
                                    {item.health >= 90 ? 'High completion likelihood. Grab counts verify stability.':
                                     item.health >= 70 ? 'Moderate completion likelihood. Older post or lower grabs.':
                                     'Risk of incomplete blocks. Password or retention takedown danger.'}
                                  </span>
                                </div>
                              )}

                              <div className="meta-row">
                                <span className="tracker-name">
                                  {isUsenetItem ? (item.indexer || 'Usenet') : item.tracker}
                                </span>
                                {!isUsenetItem && item.publishDate && (
                                  <span className="publish-date">
                                    {new Date(item.publishDate).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
 
                            <div className="card-actions">
                              {/* Cache status pill */}
                              {isUsenetItem ? (
                                usenetHandler === 'sabnzbd' ? (
                                  sabStatus && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      {sabStatus.status === 'downloading' ? (
                                        <span className="status-pill downloading-sab" style={{ background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                          <span className="spinner-micro white small" style={{ borderColor: '#34d399', borderTopColor: 'transparent' }}></span> Downloading ({sabStatus.percent}%)
                                        </span>
                                      ) : sabStatus.status === 'processing' ? (
                                        <span className="status-pill processing-sab" style={{ background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                          <span className="spinner-micro white small" style={{ borderColor: '#fbbf24', borderTopColor: 'transparent' }}></span> {sabStatus.stage}...
                                        </span>
                                      ) : sabStatus.status === 'completed' ? (
                                        <span className="status-pill cached" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                                          <Icon name="check" size={13} /> Completed
                                        </span>
                                      ) : sabStatus.status === 'failed' ? (
                                        <span className="status-pill uncached" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                                          <Icon name="alert-triangle" size={13} /> Failed
                                        </span>
                                      ) : (
                                        <span className="status-pill queued-sab" style={{ background: 'rgba(156, 163, 175, 0.1)', color: '#9ca3af', border: '1px solid rgba(156, 163, 175, 0.3)' }}>
                                          <Icon name="clock" size={13} /> Queued
                                        </span>
                                      )}
                                      
                                      {/* Quick link button to go to transfers page */}
                                      <button
                                        type="button"
                                        className="quick-transfers-link-btn"
                                        onClick={() => {
                                          setActiveTab('transfers');
                                        }}
                                        title="View download in Transfers page"
                                        style={{
                                          background: 'rgba(255, 255, 255, 0.05)',
                                          border: '1px solid var(--glass-border)',
                                          borderRadius: '6px',
                                          padding: '4px 8px',
                                          color: 'var(--color-text-dim)',
                                          fontSize: '0.75rem',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          transition: 'all 0.2s ease',
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                          e.currentTarget.style.color = '#fff';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                          e.currentTarget.style.color = 'var(--color-text-dim)';
                                        }}
                                      >
                                        Track <Icon name="external-link" size={12} />
                                      </button>
                                    </div>
                                  )
                                ) : (
                                  item.cached && <span className="status-pill cached"><Icon name="check" size={13} /> In cloud</span>
                                )
                              ) : item.cached ? (
                                <span className="status-pill cached"><Icon name="bolt" size={13} /> Instant</span>
                              ) : (
                                <span className="status-pill uncached"><Icon name="cloud-up" size={13} /> Not cached</span>
                              )}

                              <div className="action-cluster">
                                {/* Add / Remove from My Library */}
                                <button
                                  className={`icon-ghost ${inLib ? 'active' : ''}`}
                                  onClick={() => toggleLibraryItem(item)}
                                  title={inLib ? "Remove from Library" : "Add to Library"}
                                  aria-label={inLib ? "Remove from Library" : "Add to Library"}
                                >
                                  <Icon name={inLib ? 'check' : 'plus'} size={18} />
                                </button>

                                <button
                                  className={`icon-ghost ${isInWatchlist(item) ? 'active-watch' : ''}`}
                                  onClick={() => toggleWatchlist(item)}
                                  title={isInWatchlist(item) ? "In watchlist" : "Add to watchlist"}
                                  aria-label="Toggle watchlist"
                                >
                                  <Icon name="bell" size={18} />
                                </button>

                                {/* Push a cached torrent to Premiumize cloud (secondary) */}
                                {!isUsenetItem && item.cached && (
                                  <button
                                    className="icon-ghost"
                                    onClick={() => triggerDownload(item)}
                                    disabled={isDownloading}
                                    title="Also save to Premiumize cloud storage"
                                    aria-label="Save to Premiumize cloud"
                                  >
                                    {isDownloading ? <span className="spinner-micro"></span> : <Icon name="cloud-up" size={18} />}
                                  </button>
                                )}

                                {/* Primary action */}
                                {!isUsenetItem && item.cached ? (
                                  (category === 'Retro Games' || getEmulatorSystem(item.title) || item.category === 'Retro Games') ? (
                                    <button className="btn-primary hover-action" onClick={() => startRetroPlayer(item)} disabled={playerLoading} title="Instant play retro game in browser arcade" id={`btn-arcade-${idx}`}>
                                      <Icon name="device-gamepad" size={16} /> Play
                                    </button>
                                  ) : (category === 'Ebooks' || item.category === 'Ebooks' || item.title.toLowerCase().endsWith('.epub') || item.title.toLowerCase().endsWith('.pdf')) ? (
                                    <button className="btn-primary hover-action" onClick={() => startEbookPlayer(item)} disabled={playerLoading} title="Open ebook in direct browser reader" id={`btn-ebook-${idx}`}>
                                      <Icon name="book" size={16} /> Read
                                    </button>
                                  ) : (category === 'Audiobooks' || category === 'Music' || item.category === 'Audiobooks' || item.category === 'Music') ? (
                                    <button className="btn-primary hover-action" onClick={() => startAudioPlayer(item)} disabled={playerLoading} title="Open audio track in direct browser player" id={`btn-audio-${idx}`}>
                                      <Icon name="headphones" size={16} /> Listen
                                    </button>
                                  ) : (category === 'Software' || category === 'Other' || category === 'VST' || item.category === 'Software' || item.category === 'Other' || item.category === 'VST') ? (
                                    <button className="btn-primary hover-action" onClick={() => triggerDirectDownload(item)} disabled={playerLoading} title="Download directly from high-speed Premiumize CDN" id={`btn-direct-dl-${idx}`}>
                                      <Icon name="download" size={16} /> Download
                                    </button>
                                  ) : (
                                    <button className="btn-primary hover-action" onClick={() => startStreaming(item)} disabled={playerLoading} title="Instant stream video in web browser or VLC" id={`btn-stream-${idx}`}>
                                      <Icon name="player-play" fill size={15} /> Play PM
                                    </button>
                                  )
                                ) : isUsenetItem ? (
                                  <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                                    {userSabUrl && userSabKey && usenetHandler === 'sabnzbd' ? (
                                      sabStatus?.status === 'completed' ? (
                                        <button className="btn-primary hover-action" style={{ width: '100%', background: '#10b981', borderColor: '#10b981', boxShadow: '0 0 12px rgba(16, 185, 129, 0.35)' }} onClick={() => {
                                          const virtualTorrent = {
                                            title: sabStatus.name,
                                            name: sabStatus.name,
                                            link: buildSabStreamUrl(sabStatus.nzoId),
                                            size: sabStatus.bytes,
                                            isCloudFile: true,
                                            forceBrowser: false,
                                            isSabnzbd: true,
                                            nzoId: sabStatus.nzoId,
                                            files: sabStatus.resolvedVideoFile ? [{
                                              name: sabStatus.resolvedVideoFile,
                                              link: buildSabStreamUrl(sabStatus.nzoId),
                                              size: sabStatus.bytes,
                                              type: 'video',
                                              id: sabStatus.nzoId
                                            }] : []
                                          };
                                          startStreaming(virtualTorrent);
                                        }} title="Play this Usenet release (no PM points)" id={`btn-play-sab-${idx}`}>
                                          <Icon name="player-play" fill size={15} /> Play NZB
                                        </button>
                                      ) : (
                                        <>
                                          <button className="btn-primary subtle hover-action" style={{ flex: 1 }} onClick={() => triggerSabDownload(item)} disabled={isDownloading} title="Download this Usenet NZB via SABnzbd (no Premiumize points)." id={`btn-dl-sab-${idx}`}>
                                            {isDownloading ? <span className="spinner-micro white"></span> : <><Icon name="download" size={15} /> SABnzbd</>}
                                          </button>
                                          <button className="action-btn icon-only" style={{ padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => triggerDownload(item)} disabled={isDownloading} title={`Add to Premiumize cloud queue (~${Math.round(item.size / (1024*1024*1024))} Fair-Use points)`}>
                                            <Icon name="bolt" size={15} />
                                          </button>
                                        </>
                                      )
                                    ) : userSabUrl && userSabKey ? (
                                      <>
                                        <button className="btn-primary subtle hover-action" style={{ flex: 1 }} onClick={() => triggerDownload(item)} disabled={isDownloading} title={`Send this Usenet NZB to your Premiumize cloud queue (~${Math.round(item.size / (1024*1024*1024))} Fair-Use points).`} id={`btn-dl-usenet-${idx}`}>
                                          {isDownloading ? <span className="spinner-micro white"></span> : <><Icon name="bolt" size={15} /> {item.cached ? 'Re-add' : 'Add to cloud'}</>}
                                        </button>
                                        <button className="action-btn icon-only" style={{ padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => triggerSabDownload(item)} disabled={isDownloading} title="Download this Usenet NZB via SABnzbd (no Premiumize points).">
                                          <Icon name="download" size={15} />
                                        </button>
                                      </>
                                    ) : (
                                      <button className="btn-primary subtle hover-action" style={{ width: '100%' }} onClick={() => triggerDownload(item)} disabled={isDownloading} title={`Send this Usenet NZB to your Premiumize cloud queue (~${Math.round(item.size / (1024*1024*1024))} Fair-Use points).`} id={`btn-dl-usenet-${idx}`}>
                                        {isDownloading ? <span className="spinner-micro white"></span> : <><Icon name="bolt" size={15} /> {item.cached ? 'Re-add' : 'Add to cloud'}</>}
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <button className="btn-primary subtle hover-action" onClick={() => triggerDownload(item)} disabled={isDownloading} title={downloadSource ? "Add to Premiumize downloader queue" : "No download URL available"} id={`btn-dl-uncached-${idx}`}>
                                    {isDownloading ? <span className="spinner-micro white"></span> : <><Icon name="cloud-up" size={15} /> Add</>}
                                  </button>
                                )}
                              </div>
                            </div>
                            </div>{/* close card-content-col */}
                          </article>
                        );
                      })}
                    </div>
                  )}
                  {processedResults.length > visibleCount && (
                    <div ref={loadMoreRef} className="results-load-more">
                      <span className="spinner-micro"></span> Loading more… ({visibleCount} of {processedResults.length})
                    </div>
                  )}
                </div>
              ) : searched ? (
                <div className="empty-state glass-panel usenet-fallback-panel">
                  <div className="empty-icon"><Icon name="search" size={40} /></div>
                  <h2>No results found</h2>
                  <p>No indexers returned matching releases for "{query}".</p>
                  {searchMode === 'torrent' && (
                    <div className="usenet-fallback-card glass-inner-panel fade-in">
                      <h3> Search Usenet Indexers?</h3>
                      <p>
                        Usenet is a massive alternative repository that might have this release! 
                        {usenetHandler === 'sabnzbd' ? (
                          " Note: NZB Usenet downloads will bypass Premiumize and download directly to your local drive via SABnzbd (no Premiumize points)."
                        ) : (
                          " Note: NZB Usenet downloads use Premiumize Fair-Use Points (2 pts/GB total download + stream)."
                        )}
                      </p>
                      <button
                        type="button"
                        className={`usenet-fallback-btn active ${usenetHandler === 'sabnzbd' ? 'sabnzbd-active' : ''}`}
                        onClick={() => {
                          setSearchMode('usenet');
                          setTimeout(() => handleSearch(null, 'usenet'), 50);
                        }}
                      >
                         {usenetHandler === 'sabnzbd' ? 'Switch to Usenet (SABnzbd)' : 'Switch and Search Usenet'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Initial welcome guide */
                <div className="welcome-card glass-panel">
                  <h2 className="heading-ico"><Icon name="bolt" size={20} fill /> Welcome to Premio</h2>
                  <p>Search torrent databases and Usenet indexers instantly, check Premiumize cached state on-the-fly, and stream at blazing speed.</p>
                  
                  <div className="instructions-grid">
                    <div className="instruction-step">
                      <div className="step-num">1</div>
                      <h4>Search Releases</h4>
                      <p>Type keywords and search Torrents or Usenet instantly.</p>
                    </div>
                    <div className="instruction-step">
                      <div className="step-num">2</div>
                      <h4>Stream or Download</h4>
                      <p>Click <strong> Play Stream</strong> to watch instantly, or add Usenet NZBs to your cloud in 1-click!</p>
                    </div>
                    <div className="instruction-step">
                      <div className="step-num">3</div>
                      <h4>Build your Library</h4>
                      <p>Save items to your <strong>Library tab</strong> to build a want-to-watch queue.</p>
                    </div>
                  </div>

                  {recentDownloads.length > 0 && (
                    <div className="recent-downloads-section">
                      <h3> Recent Transfers Sent to Cloud</h3>
                      <div className="recent-dl-list">
                        {recentDownloads.map((dl, idx) => (
                          <div key={idx} className="recent-dl-item">
                            <div className="recent-dl-title" title={dl.title}>
                              {dl.title}
                            </div>
                            <div className="recent-dl-details">
                              <span> {formatBytes(dl.size)}</span>
                              <span> {new Date(dl.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
  );
}
