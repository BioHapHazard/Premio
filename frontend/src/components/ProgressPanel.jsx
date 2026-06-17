import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';

// Continue Watching dashboard: per-category resume shelves (movies/TV/music/
// audiobooks/ebooks) with progress bars and resume/remove. Reads continue-watching
// + sub-tab state from context; receives the resume/remove + metadata handlers as
// props. (Local helpers moviesProgress/renderProgressCard/hashHue live in the body.)
export default function ProgressPanel({ getMetadata, removeFromContinueWatching, startStreaming, startAudioPlayer, startEbookPlayer }) {
  const { continueWatchingList, continueSubTab, setContinueSubTab } = useAppState();

          const moviesProgress = continueWatchingList.filter(item => {
            const cat = item.category || (item.torrent && item.torrent.category) || 'Movies';
            return cat === 'Movies';
          });

          const tvProgress = continueWatchingList.filter(item => {
            const cat = item.category || (item.torrent && item.torrent.category);
            return cat === 'TV';
          });

          const musicProgress = continueWatchingList.filter(item => {
            const cat = item.category || (item.torrent && item.torrent.category);
            return cat === 'Music';
          });

          const audiobooksProgress = continueWatchingList.filter(item => {
            const cat = item.category || (item.torrent && item.torrent.category);
            return cat === 'Audiobooks';
          });

          const ebooksProgress = continueWatchingList.filter(item => {
            const cat = item.category || (item.torrent && item.torrent.category);
            return cat === 'Ebooks';
          });

          const hashHue = (str) => { let h = 0; for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) % 360; return h; };
          const renderProgressCard = (item, idx) => {
            const cat = item.category || (item.torrent && item.torrent.category) || 'Movies';
            const meta = getMetadata({ title: item.parentTitle, category: cat }) || getMetadata({ title: item.title, category: cat });
            const bg = meta?.backdrop || meta?.poster;
            const hue = hashHue(item.parentTitle || item.title);
            const isBook = cat === 'Ebooks';
            const pct = Math.round(item.percent || 0);
            const remainMin = (item.duration && item.currentTime) ? Math.max(0, Math.round((item.duration - item.currentTime) / 60)) : null;
            const resume = () => {
              removeFromContinueWatching(item.link);
              if (cat === 'Music' || cat === 'Audiobooks') startAudioPlayer(item.torrent, item.link, item.currentTime);
              else if (cat === 'Ebooks') startEbookPlayer(item.torrent, item.link, item.chapterIndex !== undefined ? item.chapterIndex : (item.currentTime - 1), item.scrollTop !== undefined ? item.scrollTop : null);
              else startStreaming(item.torrent, item.currentTime, item.title);
            };
            return (
              <article key={idx} className="resume-card" onClick={resume} title={`Resume ${item.title}`}>
                <div className="resume-hero" style={bg ? { backgroundImage: `url(${bg})` } : { background: `linear-gradient(135deg, hsl(${hue}, 45%, 22%), hsl(${(hue + 45) % 360}, 55%, 30%))` }}>
                  <div className="resume-scrim"></div>
                  <button className="resume-remove" onClick={(e) => { e.stopPropagation(); removeFromContinueWatching(item.link); }} aria-label="Remove from Continue Watching"><Icon name="x" size={15} /></button>
                  <span className="resume-play-fab"><Icon name="player-play" fill size={22} /></span>
                  <div className="resume-meta">
                    <div className="resume-title" title={item.title}>{item.title}</div>
                    <div className="resume-sub">
                      {item.parentTitle ? <span className="resume-parent">{item.parentTitle}</span> : null}
                      {isBook
                        ? <span className="resume-left"><Icon name="book" size={12} /> Ch {item.currentTime}/{item.duration}</span>
                        : (remainMin !== null ? <span className="resume-left"><Icon name="clock" size={12} /> {remainMin}m left</span> : null)}
                    </div>
                  </div>
                  <div className="resume-progress"><div className="resume-progress-fill" style={{ width: `${pct}%` }}></div></div>
                </div>
              </article>
            );
          };

          return (
            <section className="progress-section fade-in" aria-label="Continue watching">
              <div className="results-header-row" style={{ marginBottom: '1.5rem' }}>
                <div className="results-header">
                  <h2 className="heading-ico"><Icon name="player-play" size={20} fill /> Continue Watching ({continueWatchingList.length})</h2>
                  <span className="results-subtitle">Resume your active video streams, audiobooks, music, or ebooks right where you left off</span>
                </div>
              </div>

              {continueWatchingList.length === 0 ? (
                <div className="empty-state glass-panel">
                  <div className="empty-icon"><Icon name="player-play" size={44} /></div>
                  <h2>No media currently in progress</h2>
                  <p>Start any movie stream, TV show, audiobook, music album, or ebook from your search results. Your progress will be dynamically recorded here for instant resumption.</p>
                </div>
              ) : (
                <>
                  {/* Continue Category Sub-Tabs (Aligned with the library type selectors) */}
                  <div className="library-sub-tabs" style={{ marginBottom: '2rem' }}>
                    <button 
                      className={`sub-tab ${continueSubTab === 'All' ? 'active' : ''}`}
                      onClick={() => setContinueSubTab('All')}
                    >
                       All ({continueWatchingList.length})
                    </button>
                    <button 
                      className={`sub-tab ${continueSubTab === 'Movies' ? 'active' : ''}`}
                      onClick={() => setContinueSubTab('Movies')}
                    >
                       Movies ({moviesProgress.length})
                    </button>
                    <button 
                      className={`sub-tab ${continueSubTab === 'TV' ? 'active' : ''}`}
                      onClick={() => setContinueSubTab('TV')}
                    >
                       TV Shows ({tvProgress.length})
                    </button>
                    <button 
                      className={`sub-tab ${continueSubTab === 'Music' ? 'active' : ''}`}
                      onClick={() => setContinueSubTab('Music')}
                    >
                       Music ({musicProgress.length})
                    </button>
                    <button 
                      className={`sub-tab ${continueSubTab === 'Audiobooks' ? 'active' : ''}`}
                      onClick={() => setContinueSubTab('Audiobooks')}
                    >
                       Audiobooks ({audiobooksProgress.length})
                    </button>
                    <button 
                      className={`sub-tab ${continueSubTab === 'Ebooks' ? 'active' : ''}`}
                      onClick={() => setContinueSubTab('Ebooks')}
                    >
                       EBooks ({ebooksProgress.length})
                    </button>
                  </div>

                  <div className="continue-shelves-container">
                    {/* Category-specific empty states */}
                    {continueSubTab === 'Movies' && moviesProgress.length === 0 && (
                      <div className="empty-state glass-panel" style={{ padding: '3rem 2rem' }}>
                        <div className="empty-icon"><Icon name="movie" size={44} /></div>
                        <h2>No movies currently in progress</h2>
                        <p>Start playing any movie release. Your active progress will automatically be saved here.</p>
                      </div>
                    )}
                    {continueSubTab === 'TV' && tvProgress.length === 0 && (
                      <div className="empty-state glass-panel" style={{ padding: '3rem 2rem' }}>
                        <div className="empty-icon"><Icon name="device-tv" size={44} /></div>
                        <h2>No TV shows currently in progress</h2>
                        <p>Start playing any TV show episode. Your active progress will automatically be saved here.</p>
                      </div>
                    )}
                    {continueSubTab === 'Music' && musicProgress.length === 0 && (
                      <div className="empty-state glass-panel" style={{ padding: '3rem 2rem' }}>
                        <div className="empty-icon"><Icon name="music" size={44} /></div>
                        <h2>No music albums currently in progress</h2>
                        <p>Start listening to any music album. Your active progress will automatically be saved here.</p>
                      </div>
                    )}
                    {continueSubTab === 'Audiobooks' && audiobooksProgress.length === 0 && (
                      <div className="empty-state glass-panel" style={{ padding: '3rem 2rem' }}>
                        <div className="empty-icon"><Icon name="headphones" size={44} /></div>
                        <h2>No audiobooks currently in progress</h2>
                        <p>Start listening to any audiobook track to see it here.</p>
                      </div>
                    )}
                    {continueSubTab === 'Ebooks' && ebooksProgress.length === 0 && (
                      <div className="empty-state glass-panel" style={{ padding: '3rem 2rem' }}>
                        <div className="empty-icon"><Icon name="book" size={44} /></div>
                        <h2>No eBooks currently in progress</h2>
                        <p>Open any EPUB or PDF book in the reader. Your bookmarks will be saved here automatically.</p>
                      </div>
                    )}

                    {/* Shelf A: Movies */}
                    {(continueSubTab === 'All' || continueSubTab === 'Movies') && moviesProgress.length > 0 && (
                      <div className="continue-shelf" style={{ marginBottom: '2.5rem' }}>
                        <h3 className="shelf-title" style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                           Continue Watching Movies ({moviesProgress.length})
                        </h3>
                        <div className="progress-grid">
                          {moviesProgress.map((item, idx) => renderProgressCard(item, idx))}
                        </div>
                      </div>
                    )}

                    {/* Shelf B: TV Shows */}
                    {(continueSubTab === 'All' || continueSubTab === 'TV') && tvProgress.length > 0 && (
                      <div className="continue-shelf" style={{ marginBottom: '2.5rem' }}>
                        <h3 className="shelf-title" style={{ fontSize: '1.25rem', color: '#3b82f6', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                           Continue Watching TV Shows ({tvProgress.length})
                        </h3>
                        <div className="progress-grid">
                          {tvProgress.map((item, idx) => renderProgressCard(item, idx))}
                        </div>
                      </div>
                    )}

                    {/* Shelf C: Music */}
                    {(continueSubTab === 'All' || continueSubTab === 'Music') && musicProgress.length > 0 && (
                      <div className="continue-shelf" style={{ marginBottom: '2.5rem' }}>
                        <h3 className="shelf-title" style={{ fontSize: '1.25rem', color: '#ec4899', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                           Continue Listening to Music ({musicProgress.length})
                        </h3>
                        <div className="progress-grid">
                          {musicProgress.map((item, idx) => renderProgressCard(item, idx))}
                        </div>
                      </div>
                    )}

                    {/* Shelf D: Audiobooks */}
                    {(continueSubTab === 'All' || continueSubTab === 'Audiobooks') && audiobooksProgress.length > 0 && (
                      <div className="continue-shelf" style={{ marginBottom: '2.5rem' }}>
                        <h3 className="shelf-title" style={{ fontSize: '1.25rem', color: '#fbbf24', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                           Continue Listening to Audiobooks ({audiobooksProgress.length})
                        </h3>
                        <div className="progress-grid">
                          {audiobooksProgress.map((item, idx) => renderProgressCard(item, idx))}
                        </div>
                      </div>
                    )}

                    {/* Shelf E: Ebooks / Graphic Novels */}
                    {(continueSubTab === 'All' || continueSubTab === 'Ebooks') && ebooksProgress.length > 0 && (
                      <div className="continue-shelf" style={{ marginBottom: '2.5rem' }}>
                        <h3 className="shelf-title" style={{ fontSize: '1.25rem', color: '#10b981', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                           Continue Reading ({ebooksProgress.length})
                        </h3>
                        <div className="progress-grid">
                          {ebooksProgress.map((item, idx) => renderProgressCard(item, idx))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          );
}
