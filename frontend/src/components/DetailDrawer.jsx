import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';
import { getEmulatorSystem } from '../lib/emulator';

// Metadata detail drawer: poster/backdrop hero, multi-source rating pills (TMDb /
// Letterboxd / IMDb / RT / MC) with expandable TMDb + Letterboxd review panels,
// genres, cast, track list, external links, and the primary action row
// (play/read/listen/download + library/watchlist toggles).
//
// Reads its panel state from context; receives activeMeta (an AppContent memo, also
// used by the drawer-open effect) and the action handlers as props.
export default function DetailDrawer({
  activeMeta,
  toggleReviews,
  toggleLbReviews,
  startRetroPlayer,
  startEbookPlayer,
  startAudioPlayer,
  triggerDirectDownload,
  startStreaming,
  triggerDownload,
  isItemInLibrary,
  toggleLibraryItem,
  isInWatchlist,
  toggleWatchlist,
}) {
  const {
    metadataDrawerItem, setMetadataDrawerItem, metadataDrawerCloseRef,
    category,
    reviewsOpen, setReviewsOpen, reviewsLoading, reviewsError, reviewsData,
    lbRating, lbReviewsOpen, setLbReviewsOpen, lbReviewsLoading, lbReviewsError, lbReviewsData,
  } = useAppState();

  if (!metadataDrawerItem) return null;

  const meta = activeMeta || { title: metadataDrawerItem.title, overview: 'Loading details from TMDb...' };
  const itemCat = metadataDrawerItem.category || category;
  const isVideo = itemCat === 'Movies' || itemCat === 'TV';

  return (
    <div className="player-modal-backdrop metadata-drawer-backdrop" onClick={() => setMetadataDrawerItem(null)} style={{ zIndex: 2800 }}>
      <div className="metadata-drawer glass-panel fade-in" role="dialog" aria-modal="true" aria-labelledby="metadata-drawer-title" onClick={(e) => e.stopPropagation()}>
        {/* Backdrop hero image for Movies/TV */}
        {meta.backdrop && (
          <div className="metadata-backdrop-hero">
            <img src={meta.backdrop} alt="" className="metadata-backdrop-img" />
            <div className="metadata-backdrop-gradient"></div>
          </div>
        )}

        <button className="metadata-drawer-close" ref={metadataDrawerCloseRef} onClick={() => setMetadataDrawerItem(null)} title="Close" aria-label="Close"><Icon name="x" size={18} /></button>

        <div className="metadata-drawer-body">
          {/* Poster + Core Info */}
          <div className="metadata-hero-row">
            {(meta.poster || isVideo) && (
              <div className="metadata-poster-wrap">
                {meta.poster ? (
                  <img src={meta.poster} alt="" className="metadata-poster-full" />
                ) : (
                  <div className="shimmer-poster" style={{ width: '100%', aspectRatio: '2/3' }}>
                    <Icon name="movie" size={30} />
                  </div>
                )}
              </div>
            )}
            <div className="metadata-core-info">
              <h2 className="metadata-title" id="metadata-drawer-title">{meta.title || metadataDrawerItem.title}</h2>
              {meta.tagline && <p className="metadata-tagline">{meta.tagline}</p>}

              <div className="metadata-badges-row">
                {isVideo && !meta.voteAverage && !meta.tmdbMiss && (
                  <span className="metadata-rating-pill tmdb-rating" style={{ opacity: 0.6 }}>
                    <Icon name="refresh" className="spin" size={13} /> Loading TMDb...
                  </span>
                )}
                {meta.voteAverage && !meta.tmdbMiss && (
                  (meta.tmdbId && meta.mediaType) ? (
                    <button
                      type="button"
                      className={`metadata-rating-pill tmdb-rating rating-pill-btn ${reviewsOpen ? 'is-active' : ''}`}
                      onClick={() => toggleReviews(meta)}
                      aria-expanded={reviewsOpen}
                      title="Show top TMDb reviews"
                    >
                      <Icon name="star" fill size={13} /> {meta.voteAverage.toFixed(1)} <span className="rating-source">TMDb</span>
                      <Icon name={reviewsOpen ? 'chevron-down' : 'chevron-right'} size={12} />
                    </button>
                  ) : (
                    <span className="metadata-rating-pill tmdb-rating">
                      <Icon name="star" fill size={13} /> {meta.voteAverage.toFixed(1)} <span className="rating-source">TMDb</span>
                    </span>
                  )
                )}
                {lbRating && lbRating.rating != null && (
                  <button
                    type="button"
                    className={`metadata-rating-pill lb-rating rating-pill-btn ${lbReviewsOpen ? 'is-active' : ''}`}
                    onClick={toggleLbReviews}
                    aria-expanded={lbReviewsOpen}
                    title="Show top Letterboxd reviews"
                  >
                    <span className="rating-src-tag src-lb">LB</span> {lbRating.rating.toFixed(1)}/5
                    <Icon name={lbReviewsOpen ? 'chevron-down' : 'chevron-right'} size={12} />
                  </button>
                )}
                {meta.ratings?.imdbRating && (
                  meta.imdbId ? (
                    <a className="metadata-rating-pill imdb-rating rating-pill-btn" href={`https://www.imdb.com/title/${meta.imdbId}/reviews`} target="_blank" rel="noopener noreferrer" title="Read IMDb reviews">
                      <span className="rating-src-tag src-imdb">IMDb</span> {meta.ratings.imdbRating} <Icon name="external-link" size={11} />
                    </a>
                  ) : (
                    <span className="metadata-rating-pill imdb-rating" title={meta.ratings.imdbVotes ? `${meta.ratings.imdbVotes} IMDb votes` : 'IMDb rating'}>
                      <span className="rating-src-tag src-imdb">IMDb</span> {meta.ratings.imdbRating}
                    </span>
                  )
                )}
                {meta.ratings?.rottenTomatoes && (
                  <a className="metadata-rating-pill rt-rating rating-pill-btn" href={`https://www.rottentomatoes.com/search?search=${encodeURIComponent(meta.title || '')}`} target="_blank" rel="noopener noreferrer" title="Find on Rotten Tomatoes">
                    <span className="rating-src-tag src-rt">RT</span> {meta.ratings.rottenTomatoes} <Icon name="external-link" size={11} />
                  </a>
                )}
                {meta.ratings?.metacritic && (
                  <a className="metadata-rating-pill mc-rating rating-pill-btn" href={`https://www.metacritic.com/search/${encodeURIComponent(meta.title || '')}/`} target="_blank" rel="noopener noreferrer" title="Find on Metacritic">
                    <span className="rating-src-tag src-mc">MC</span> {meta.ratings.metacritic} <Icon name="external-link" size={11} />
                  </a>
                )}
                {meta.rating && (
                  <span className="metadata-rating-pill book-rating">
                    <Icon name="star" fill size={13} /> {meta.rating}{meta.ratingsCount ? ` (${meta.ratingsCount})` : ''} <span className="rating-source">Rating</span>
                  </span>
                )}
                {meta.year && <span className="metadata-year-pill">{meta.year}</span>}
                {meta.runtime ? <span className="metadata-year-pill">{Math.floor(meta.runtime / 60)}h {meta.runtime % 60}m</span> : null}
                {meta.trackCount && <span className="metadata-tracks-pill">{meta.trackCount} tracks</span>}
                {meta.pageCount && <span className="metadata-tracks-pill">{meta.pageCount} pages</span>}
              </div>

              {/* TMDb reviews panel (toggled from the TMDb rating pill) */}
              {reviewsOpen && (
                <div className="tmdb-reviews-panel">
                  <div className="tmdb-reviews-head">
                    <span><Icon name="message-chatbot" size={14} /> Top TMDb Reviews</span>
                    <button type="button" className="tmdb-reviews-close" onClick={() => setReviewsOpen(false)} aria-label="Hide reviews"><Icon name="x" size={14} /></button>
                  </div>
                  {reviewsLoading && <div className="tmdb-reviews-loading"><span className="spinner-micro"></span> Loading reviews…</div>}
                  {!reviewsLoading && reviewsError && <div className="tmdb-reviews-empty">{reviewsError}</div>}
                  {!reviewsLoading && reviewsData.length > 0 && (
                    <ul className="tmdb-reviews-list">
                      {reviewsData.map((rv, ri) => (
                        <li key={ri} className="tmdb-review-item">
                          <div className="tmdb-review-head">
                            <span className="tmdb-review-author">{rv.author}</span>
                            {rv.rating != null && <span className="tmdb-review-rating"><Icon name="star" fill size={11} /> {rv.rating}/10</span>}
                          </div>
                          <p className="tmdb-review-content">{rv.content.length > 360 ? rv.content.slice(0, 360).trim() + '…' : rv.content}</p>
                          {rv.url && <a className="tmdb-review-link" href={rv.url} target="_blank" rel="noopener noreferrer">Read full review <Icon name="external-link" size={11} /></a>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Letterboxd reviews panel (toggled from the Letterboxd rating pill) */}
              {lbReviewsOpen && (
                <div className="lb-reviews-panel">
                  <div className="lb-reviews-head">
                    <span><Icon name="message-chatbot" size={14} /> Top Letterboxd Reviews</span>
                    <button type="button" className="lb-reviews-close" onClick={() => setLbReviewsOpen(false)} aria-label="Hide reviews"><Icon name="x" size={14} /></button>
                  </div>
                  {lbReviewsLoading && <div className="lb-reviews-loading"><span className="spinner-micro"></span> Loading reviews…</div>}
                  {!lbReviewsLoading && lbReviewsError && <div className="lb-reviews-empty">{lbReviewsError}</div>}
                  {!lbReviewsLoading && lbReviewsData.length > 0 && (
                    <ul className="lb-reviews-list">
                      {lbReviewsData.map((rv, ri) => (
                        <li key={ri} className="lb-review-item">
                          <div className="lb-review-head">
                            <span className="lb-review-author">{rv.author}</span>
                            {rv.rating != null && (
                              <span className="lb-review-rating" style={{ color: '#00e054' }}>
                                <Icon name="star" fill size={11} /> {rv.rating}/10
                              </span>
                            )}
                          </div>
                          <p className="lb-review-content">{rv.content.length > 360 ? rv.content.slice(0, 360).trim() + '…' : rv.content}</p>
                          {rv.url && <a className="lb-review-link" href={rv.url} style={{ color: '#00e054' }} target="_blank" rel="noopener noreferrer">Read full review <Icon name="external-link" size={11} /></a>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Genres */}
              {meta.genres && meta.genres.length > 0 && (
                <div className="metadata-genres">
                  {meta.genres.map((g, gi) => (
                    <span key={gi} className="metadata-genre-chip">{g}</span>
                  ))}
                </div>
              )}

              {/* Subjects (Ebooks) */}
              {meta.subjects && meta.subjects.length > 0 && (
                <div className="metadata-genres">
                  {meta.subjects.map((s, si) => (
                    <span key={si} className="metadata-genre-chip">{s}</span>
                  ))}
                </div>
              )}

              {/* Artist / Author */}
              {meta.artist && <p className="metadata-artist"><Icon name="headphones" size={15} /> <strong>{meta.artist}</strong></p>}
              {meta.author && <p className="metadata-artist"><Icon name="book" size={15} /> <strong>{meta.author}</strong></p>}
              {meta.genre && <p className="metadata-genre-line"><Icon name="music" size={14} /> {meta.genre}</p>}

              <div className="metadata-actions">
                {metadataDrawerItem.cached ? (() => {
                  const it = metadataDrawerItem;
                  const c = it.category || itemCat;
                  const isBook = c === 'Ebooks' || it.title.toLowerCase().endsWith('.epub') || it.title.toLowerCase().endsWith('.pdf');
                  const isAudio = c === 'Audiobooks' || c === 'Music';
                  const isRetro = c === 'Retro Games' || getEmulatorSystem(it.title);
                  const isDl = c === 'Software' || c === 'Other' || c === 'VST';
                  const label = isBook ? 'Read' : isAudio ? 'Listen' : isRetro ? 'Play' : isDl ? 'Download' : 'Play';
                  const ic = isBook ? 'book' : isAudio ? 'headphones' : isRetro ? 'device-gamepad' : isDl ? 'download' : 'player-play';
                  const onPlay = () => {
                    setMetadataDrawerItem(null);
                    if (isRetro) startRetroPlayer(it);
                    else if (isBook) startEbookPlayer(it);
                    else if (isAudio) startAudioPlayer(it);
                    else if (isDl) triggerDirectDownload(it);
                    else startStreaming(it);
                  };
                  return <button className="btn-primary hover-action" onClick={onPlay}><Icon name={ic} fill={ic === 'player-play'} size={16} /> {label}</button>;
                })() : (
                  <button className="btn-primary subtle hover-action" onClick={() => triggerDownload(metadataDrawerItem)}><Icon name="cloud-up" size={16} /> Add to Premiumize</button>
                )}
                <button className={`icon-ghost ${isItemInLibrary(metadataDrawerItem) ? 'active' : ''}`} onClick={() => toggleLibraryItem(metadataDrawerItem)} aria-label="Toggle library" title={isItemInLibrary(metadataDrawerItem) ? 'In Library' : 'Add to Library'}>
                  <Icon name={isItemInLibrary(metadataDrawerItem) ? 'check' : 'plus'} size={18} />
                </button>
                <button className={`icon-ghost ${isInWatchlist(metadataDrawerItem) ? 'active-watch' : ''}`} onClick={() => toggleWatchlist(metadataDrawerItem)} aria-label="Toggle watchlist" title={isInWatchlist(metadataDrawerItem) ? 'In watchlist' : 'Add to watchlist'}>
                  <Icon name="bell" size={18} />
                </button>
                {metadataDrawerItem.cached && (
                  <button className="icon-ghost" onClick={() => triggerDownload(metadataDrawerItem)} aria-label="Save to Premiumize cloud" title="Save to Premiumize cloud"><Icon name="cloud-up" size={18} /></button>
                )}
              </div>
            </div>
          </div>

          {/* Plot / Description */}
          {meta.overview && (
            <div className="metadata-overview-section">
              <h4 className="metadata-section-title">
                {(itemCat === 'Movies' || itemCat === 'TV') ? 'Plot' : 'Description'}
              </h4>
              <p className="metadata-overview-text">{meta.overview}</p>
            </div>
          )}

          {/* Track List (Music) */}
          {itemCat === 'Music' && meta.tracks && meta.tracks.length > 0 && (
            <div className="metadata-tracks-section">
              <h4 className="metadata-section-title">Track list</h4>
              <div className="metadata-tracks-list">
                {meta.tracks.map((track, ti) => {
                  const formatDuration = (ms) => {
                    if (!ms) return '--:--';
                    const mins = Math.floor(ms / 60000);
                    const secs = Math.floor((ms % 60000) / 1000);
                    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
                  };
                  return (
                    <div key={ti} className="metadata-track-row">
                      <span className="metadata-track-num">{track.number}</span>
                      <span className="metadata-track-name">{track.name}</span>
                      <span className="metadata-track-dur">{formatDuration(track.durationMs)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cast (Movies/TV) */}
          {meta.cast && meta.cast.length > 0 && (
            <div className="metadata-cast-section">
              <h4 className="metadata-section-title">Cast</h4>
              <div className="metadata-cast-grid">
                {meta.cast.map((c, ci) => (
                  <div key={ci} className="metadata-cast-card">
                    {c.profilePath ? (
                      <img src={c.profilePath} alt="" className="cast-headshot" loading="lazy" />
                    ) : (
                      <div className="cast-headshot-placeholder"><Icon name="users" size={20} /></div>
                    )}
                    <div className="cast-info">
                      <span className="cast-name">{c.name}</span>
                      <span className="cast-character">{c.character}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* External Links */}
          <div className="metadata-links-section">
            {meta.trailer && (
              <a href={`https://www.youtube.com/watch?v=${meta.trailer}`} target="_blank" rel="noopener noreferrer" className="metadata-ext-link trailer-link">
                <Icon name="player-play" fill size={15} /> Watch trailer
              </a>
            )}
            {meta.iTunesUrl && (
              <a href={meta.iTunesUrl} target="_blank" rel="noopener noreferrer" className="metadata-ext-link itunes-link">
                <Icon name="external-link" size={14} /> iTunes
              </a>
            )}
            {meta.goodreadsUrl && (
              <a href={meta.goodreadsUrl} target="_blank" rel="noopener noreferrer" className="metadata-ext-link goodreads-link">
                <Icon name="external-link" size={14} /> Goodreads
              </a>
            )}
            {meta.googleBooksUrl && (
              <a href={meta.googleBooksUrl} target="_blank" rel="noopener noreferrer" className="metadata-ext-link gbooks-link">
                <Icon name="external-link" size={14} /> Google Books
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
