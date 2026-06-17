import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';
import { hashHue } from '../lib/format';
import { keyActivate } from '../lib/a11y';

// Watchlist tab: tracked titles with a "check for cached" action and per-item
// find/remove. Reads watchlist state from context; receives the action handlers.
export default function WatchlistPanel({ checkWatchlist, findWatchlistItem, persistWatchlist }) {
  const { watchlist, watchlistChecking } = useAppState();

  return (
          <section className="watchlist-section fade-in" aria-label="Watchlist">
            <div className="results-header-row" style={{ marginBottom: '1.5rem' }}>
              <div className="results-header">
                <h2>Watchlist ({watchlist.length})</h2>
                <span className="results-subtitle">Track titles and check when a new cached release appears</span>
              </div>
              {watchlist.length > 0 && (
                <button className="btn-primary subtle" onClick={checkWatchlist} disabled={watchlistChecking} style={{ alignSelf: 'center' }}>
                  {watchlistChecking ? <span className="spinner-micro"></span> : <Icon name="refresh" size={15} />} Check for cached
                </button>
              )}
            </div>

            {watchlist.length === 0 ? (
              <div className="empty-state glass-panel">
                <div className="empty-icon"><Icon name="bell" size={40} /></div>
                <h2>Your watchlist is empty</h2>
                <p>Tap the bell on any search result or detail page to track a title. Use &quot;Check for cached&quot; here to see when an instant release shows up.</p>
              </div>
            ) : (
              <div className="library-grid">
                {watchlist.map((w, idx) => {
                  const hue = hashHue(w.title);
                  return (
                    <div key={idx} className="lib-tile" role="button" tabIndex={0} aria-label={`Find releases for ${w.title}`} onClick={() => findWatchlistItem(w)} onKeyDown={keyActivate(() => findWatchlistItem(w))} title={`Find releases for ${w.title}`}>
                      <div className="lib-poster" style={w.poster ? { backgroundImage: `url(${w.poster})` } : { background: `linear-gradient(150deg, hsl(${hue}, 42%, 26%), hsl(${(hue + 35) % 360}, 48%, 15%))` }}>
                        {!w.poster && <span className="lib-poster-icon"><Icon name="bell" size={30} /></span>}
                        {w.cachedCount > 0 && <span className="watch-count" title={`${w.cachedCount} cached release(s) found`}><Icon name="bolt" size={11} /> {w.cachedCount}</span>}
                        <div className="lib-hover">
                          <button className="lib-remove" onClick={(e) => { e.stopPropagation(); persistWatchlist(watchlist.filter(x => x.key !== w.key)); }} aria-label="Remove from watchlist" title="Remove from watchlist"><Icon name="x" size={15} /></button>
                          <button className="lib-play" onClick={(e) => { e.stopPropagation(); findWatchlistItem(w); }} aria-label="Find releases" title="Find releases"><Icon name="search" size={20} /></button>
                        </div>
                      </div>
                      <div className="lib-title" title={w.title}>{w.title}</div>
                      <div className="lib-sub">{(w.cachedCount !== null && w.cachedCount !== undefined) ? `${w.cachedCount} cached now` : (w.year || w.category)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
  );
}
