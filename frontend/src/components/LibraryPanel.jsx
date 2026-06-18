import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';
import { formatBytes, hashHue, guessCategory } from '../lib/format';
import { getEmulatorSystem } from '../lib/emulator';
import { keyActivate } from '../lib/a11y';

// Library bookshelf tab: sub-tab lanes (categories + Playlists), cached-status
// badges, item cards with play/read/listen/download + remove-from-library, and the
// custom-playlist sub-view. Reads library/playlist state from context; receives the
// filtered library list + action handlers as props.
export default function LibraryPanel({
  filteredLibraryList,
  getMetadata,
  startStreaming, startAudioPlayer, startEbookPlayer, startRetroPlayer, triggerDirectDownload,
  toggleLibraryItem,
  playPlaylist, deletePlaylist, removeTrackFromPlaylist,
}) {
  const {
    libraryList, librarySubTab, setLibrarySubTab,
    playlists,
    category,
    hideAdult, isKids, adultControlsUnlocked,
    setMetadataDrawerItem,
  } = useAppState();

  return (
          <section className="library-section fade-in" aria-label="Library">
            <div className="results-header-row">
              <div className="results-header">
                <h2 className="heading-ico"><Icon name="star" size={20} fill /> My Library bookshelves ({librarySubTab === 'Playlists' ? playlists.length : filteredLibraryList.length})</h2>
                <span className="results-subtitle">Saved releases and custom playlists</span>
              </div>
            </div>

            {/* Always display the Library category subtabs so they can switch tabs regardless of bookshelf item counts */}
            <div className="library-sub-tabs">
              <button 
                className={`sub-tab ${librarySubTab === 'All' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('All')}
              >
                 All ({libraryList.filter(item => !(item.category === 'Adult'&& (!adultControlsUnlocked || hideAdult))).length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'Movies' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('Movies')}
              >
                 Movies ({libraryList.filter(item => item.category === 'Movies').length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'TV' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('TV')}
              >
                 TV Shows ({libraryList.filter(item => item.category === 'TV').length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'Retro Games' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('Retro Games')}
              >
                 Retro Games ({libraryList.filter(item => item.category === 'Retro Games').length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'Audiobooks' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('Audiobooks')}
              >
                 Audiobooks ({libraryList.filter(item => item.category === 'Audiobooks').length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'Ebooks' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('Ebooks')}
              >
                 Ebooks ({libraryList.filter(item => item.category === 'Ebooks').length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'Software' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('Software')}
              >
                 Software ({libraryList.filter(item => item.category === 'Software').length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'VST' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('VST')}
              >
                 VST ({libraryList.filter(item => item.category === 'VST').length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'Other' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('Other')}
              >
                 Other ({libraryList.filter(item => item.category === 'Other'|| item.category === 'Music').length})
              </button>
              {!isKids && adultControlsUnlocked && !hideAdult && (
                <button 
                  className={`sub-tab ${librarySubTab === 'Adult' ? 'active' : ''}`}
                  onClick={() => setLibrarySubTab('Adult')}
                >
                   Adult ({libraryList.filter(item => item.category === 'Adult').length})
                </button>
              )}
              <button 
                className={`sub-tab ${librarySubTab === 'Playlists' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('Playlists')}
              >
                 Playlists ({playlists.length})
              </button>
            </div>

            {librarySubTab === 'Playlists' ? (
              playlists.length === 0 ? (
                <div className="empty-state glass-panel" style={{ marginTop: '1rem' }}>
                  <div className="empty-icon"><Icon name="music" size={44} /></div>
                  <h2>No Playlists Found</h2>
                  <p>Create a playlist by playing an album/audiobook search result, opening the audio player, and clicking the icon next to any track!</p>
                </div>
              ) : (
                <div className="playlists-grid">
                  {playlists.map((pl, plIdx) => {
                    const totalSize = pl.tracks.reduce((acc, t) => acc + (t.size || 0), 0);
                    return (
                      <div key={plIdx} className="playlist-card glass-panel fade-in">
                        <div className="playlist-card-header">
                          <div className="playlist-header-left">
                            <h3 className="playlist-title"> {pl.name}</h3>
                            <span className="playlist-meta-badge">
                              {pl.tracks.length} track{pl.tracks.length !== 1 ? 's' : ''} • {formatBytes(totalSize)}
                            </span>
                          </div>
                          <div className="playlist-actions">
                            <button 
                              className="playlist-play-btn" 
                              onClick={() => playPlaylist(pl)}
                              title="Stream entire playlist sequentially"
                            >
                              ▶ Play All
                            </button>
                            <button 
                              className="playlist-delete-btn" 
                              onClick={() => deletePlaylist(pl.name)}
                              title="Delete playlist"
                            >
                               Delete
                            </button>
                          </div>
                        </div>

                        <div className="playlist-tracks-list">
                          {pl.tracks.map((track, trackIdx) => (
                            <div key={trackIdx} className="playlist-track-item">
                              <div className="track-info">
                                <span className="track-index-badge">{trackIdx + 1}</span>
                                <div className="track-details">
                                  <span className="track-title" title={track.name}>{track.name}</span>
                                  {track.torrent?.title && (
                                    <span className="track-parent-torrent" title={track.torrent.title}>
                                       {track.torrent.title}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="track-meta-actions">
                                <span className="track-size">{formatBytes(track.size)}</span>
                                <button
                                  className="track-remove-btn"
                                  onClick={() => removeTrackFromPlaylist(pl.name, trackIdx)}
                                  title="Remove from playlist"
                                >
                                  <Icon name="x" size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : libraryList.filter(item => !(item.category === 'Adult' && (!adultControlsUnlocked || hideAdult))).length === 0 ? (
              <div className="empty-state glass-panel" style={{ marginTop: '1rem' }}>
                <div className="empty-icon"><Icon name="star" size={44} /></div>
                <h2>Your Library is empty</h2>
                <p>Click "Add to Library"on any search result to populate this bookshelves page and keep track of files you want to watch!</p>
              </div>
            ) : filteredLibraryList.length === 0 ? (
              <div className="empty-state glass-panel" style={{ marginTop: '1rem' }}>
                <div className="empty-icon"><Icon name="folder" size={44} /></div>
                <h2>No items on this shelf</h2>
                <p>Add releases in the "{librarySubTab}" category to see them inside your library shelf.</p>
              </div>
            ) : (
              <div className="library-grid">
                {filteredLibraryList.map((item, idx) => {
                  const meta = getMetadata(item);
                  const poster = meta?.poster || item.coverurl;
                  const cat = item.category || (item.isSabnzbd ? guessCategory(null, item.title) : 'Other');
                  const typeIcon = cat === 'TV' ? 'device-tv' : (cat === 'Music' ? 'music' : (cat === 'Audiobooks' ? 'headphones' : (cat === 'Ebooks' ? 'book' : (cat === 'Retro Games' ? 'device-gamepad' : ((cat === 'Software' || cat === 'VST') ? 'app' : 'movie')))));
                  const hue = hashHue(item.title);
                  const playItem = (e) => {
                    e.stopPropagation();
                    if (!item.cached && !item.isSabnzbd) { setMetadataDrawerItem({ ...item, _metadata: meta || { title: item.title } }); return; }
                    if (cat === 'Retro Games' || getEmulatorSystem(item.title)) startRetroPlayer(item);
                    else if (cat === 'Ebooks' || item.title.toLowerCase().endsWith('.epub') || item.title.toLowerCase().endsWith('.pdf')) startEbookPlayer(item);
                    else if (cat === 'Audiobooks' || cat === 'Music') startAudioPlayer(item);
                    else if (cat === 'Software' || cat === 'Other' || cat === 'VST') triggerDirectDownload(item);
                    else startStreaming(item);
                  };
                  return (
                    <div key={idx} className="lib-tile" role="button" tabIndex={0} aria-label={`View details for ${meta?.title || item.title}`} onClick={() => setMetadataDrawerItem({ ...item, _metadata: meta || { title: item.title } })} onKeyDown={keyActivate(() => setMetadataDrawerItem({ ...item, _metadata: meta || { title: item.title } }))} title={item.title}>
                      <div className="lib-poster" style={poster ? { backgroundImage: `url(${poster})` } : { background: `linear-gradient(150deg, hsl(${hue}, 42%, 26%), hsl(${(hue + 35) % 360}, 48%, 15%))` }}>
                        {!poster && <span className="lib-poster-icon"><Icon name={typeIcon} size={34} /></span>}
                        {meta?.voteAverage ? <span className="lib-rating"><Icon name="star" fill size={11} /> {meta.voteAverage.toFixed(1)}</span> : null}
                        {item.cached && <span className="lib-instant" title="Instantly available"><Icon name="bolt" size={12} /></span>}
                        <div className="lib-hover">
                          <button className="lib-remove" onClick={(e) => { e.stopPropagation(); toggleLibraryItem(item); }} aria-label="Remove from Library" title="Remove from Library"><Icon name="x" size={15} /></button>
                          <button className="lib-play" onClick={playItem} aria-label="Play" title="Play"><Icon name="player-play" fill size={20} /></button>
                        </div>
                      </div>
                      <div className="lib-title" title={item.title}>{meta?.title || item.title}</div>
                      <div className="lib-sub">{meta?.year || cat}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
  );
}
