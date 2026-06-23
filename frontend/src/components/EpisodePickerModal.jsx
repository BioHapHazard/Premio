import Icon from '../Icon';
import { formatBytes, matchEpisode } from '../lib/format';

// Episode picker for a cloud "show" library item. Lists the videos found under the
// show's folder (already recursively scanned + sorted by the caller) and plays the
// chosen one — the rest are queued after it so the player auto-advances.
export default function EpisodePickerModal({ picker, onPlay, onClose }) {
  if (!picker) return null;
  const { show, episodes = [], loading, error } = picker;
  const title = show?.cloudFolderName || show?.title || 'Show';

  return (
    <div
      className="modal-overlay fade-in"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
    >
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '640px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', borderRadius: '12px', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '1rem 1.25rem', borderBottom: '1px solid var(--glass-border)' }}>
          <h3 className="heading-ico" style={{ margin: 0, fontSize: '1.05rem' }}>
            <Icon name="movie" size={18} /> {title} — select an episode
          </h3>
          <button type="button" className="cloud-act icon-only" title="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {loading ? (
          <div className="loading-state" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
            <div className="spinner"></div>
            <p style={{ marginTop: '0.75rem' }}>Loading episodes…</p>
          </div>
        ) : error ? (
          <div style={{ padding: '2.5rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Icon name="alert-triangle" size={32} style={{ color: 'rgba(239,68,68,0.8)' }} />
            <p style={{ marginTop: '0.75rem' }}>{error}</p>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0 0.5rem 0.5rem' }}>
              {episodes.length} episode{episodes.length === 1 ? '' : 's'} — the rest auto-play after the one you pick.
            </div>
            {episodes.map((ep) => {
              const epTag = matchEpisode(ep.name);
              return (
                <button
                  key={ep.id}
                  type="button"
                  className="episode-row hover-action"
                  onClick={() => onPlay(ep)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', textAlign: 'left', padding: '0.6rem 0.75rem', marginBottom: '0.35rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer' }}
                >
                  <Icon name="player-play" size={15} fill />
                  {epTag && (
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-primary)', minWidth: '54px' }}>{epTag}</span>
                  )}
                  <span style={{ flex: 1, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ep.name}>{ep.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatBytes(ep.size)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
