import { Fragment, useState } from 'react';
import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';
import { formatBytes } from '../lib/format';
import { getEmulatorSystem } from '../lib/emulator';

// Google Drive view of the Cloud tab: breadcrumb navigation through the Premio
// folder and its subfolders, with play / rename / delete-to-Trash actions. Mirrors
// the Premiumize CloudBrowserPanel styling. Reads Drive browse state from context;
// receives the Drive action handlers as props.
export default function GDriveBrowserPanel({
  fetchGdriveCloudFolder,
  playGdriveCloudFile,
  renameGdriveCloudItem,
  trashGdriveCloudItem,
  isCloudInLibrary,
  toggleCloudLibrary,
}) {
  const {
    gdriveConnected,
    gdriveBrowse, gdriveBrowseCrumbs, gdriveBrowseFolderId,
    gdriveCloudRenameId, setGdriveCloudRenameId,
    gdriveCloudRenameName, setGdriveCloudRenameName,
  } = useAppState();

  const [filter, setFilter] = useState('');

  const crumbs = gdriveBrowseCrumbs || [];
  const rootId = crumbs[0]?.id || null;

  const enterFolder = (folder) => {
    fetchGdriveCloudFolder(folder.id, [...crumbs, { id: folder.id, name: folder.name }]);
  };
  const goToCrumb = (idx) => {
    fetchGdriveCloudFolder(crumbs[idx].id, crumbs.slice(0, idx + 1));
  };
  const refresh = () => fetchGdriveCloudFolder(gdriveBrowseFolderId, crumbs);

  if (!gdriveConnected) {
    return (
      <section className="cloud-section fade-in" aria-label="Google Drive storage">
        <div className="empty-state glass-panel" style={{ padding: '4rem 2rem' }}>
          <div className="empty-icon"><Icon name="database" size={44} /></div>
          <h2>Google Drive isn't connected</h2>
          <p>Connect Google Drive in Settings to browse your Premio folder here.</p>
        </div>
      </section>
    );
  }

  const folders = (gdriveBrowse.folders || []).filter(f => f.name.toLowerCase().includes(filter.toLowerCase()));
  const files = (gdriveBrowse.files || []).filter(f => f.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <section className="cloud-section fade-in" aria-label="Google Drive storage">
      <div className="results-header-row" style={{ marginBottom: '1.5rem' }}>
        <div className="results-header">
          <h2 className="heading-ico"><Icon name="database" size={20} /> Google Drive — Premio Archive</h2>
          <span className="results-subtitle">Browse, play, rename, and organize the files Premio archived to Google Drive</span>
        </div>
      </div>

      {/* Breadcrumb Navigation Bar */}
      <div className="cloud-breadcrumbs-bar glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1.5rem', borderRadius: '8px', flexWrap: 'wrap' }}>
        {crumbs.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>Loading…</span>
        ) : crumbs.map((crumb, idx) => (
          <Fragment key={crumb.id || idx}>
            {idx > 0 && <span style={{ color: 'var(--glass-border)' }}>/</span>}
            <button
              className="cloud-breadcrumb-btn text-only"
              onClick={() => goToCrumb(idx)}
              style={{ cursor: 'pointer', fontWeight: idx === 0 ? 'bold' : 'normal', color: idx === crumbs.length - 1 ? 'var(--color-text)' : 'var(--color-primary)' }}
            >
              {crumb.name}
            </button>
          </Fragment>
        ))}
      </div>

      {/* Filter + refresh */}
      <div className="search-row" style={{ marginBottom: '1.5rem', gap: '1rem' }}>
        <div className="input-container" style={{ flex: 1 }}>
          <span className="input-search-icon"><Icon name="search" size={18} /></span>
          <input
            type="text"
            placeholder="Filter items in this folder..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="search-input"
          />
        </div>
        <button
          type="button"
          className="search-submit-btn hover-action"
          style={{ width: 'auto', padding: '0.5rem 1.5rem', height: '42px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}
          onClick={refresh}
          disabled={gdriveBrowse.loading}
        >
          Refresh
        </button>
      </div>

      {gdriveBrowse.loading ? (
        <div className="loading-state glass-panel" style={{ padding: '4rem 2rem' }}>
          <div className="spinner"></div>
          <h2>Loading Google Drive…</h2>
          <p>Reading your Premio folder.</p>
        </div>
      ) : gdriveBrowse.error ? (
        <div className="empty-state glass-panel" style={{ padding: '3rem 2rem', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <div className="empty-icon"><Icon name="alert-triangle" size={40} style={{ color: 'rgba(239, 68, 68, 0.8)' }} /></div>
          <h2>Failed to Load Google Drive</h2>
          <p>{gdriveBrowse.error}</p>
          <button className="cache-badge badge-stream hover-action" style={{ marginTop: '1rem', border: 'none', cursor: 'pointer' }} onClick={refresh}>
            Retry
          </button>
        </div>
      ) : (folders.length === 0 && files.length === 0) ? (
        <div className="empty-state glass-panel" style={{ padding: '4rem 2rem' }}>
          <div className="empty-icon"><Icon name="folder" size={44} /></div>
          <h2>No files or folders here</h2>
          <p>{filter ? 'No items match your filter.' : 'This folder is empty.'}</p>
          {rootId && gdriveBrowseFolderId !== rootId && (
            <button
              className="cache-badge badge-listen hover-action"
              style={{ marginTop: '1rem', border: 'none', cursor: 'pointer' }}
              onClick={() => { const i = crumbs.length - 2; goToCrumb(i < 0 ? 0 : i); }}
            >
              Go Back Up
            </button>
          )}
        </div>
      ) : (
        <div className="cloud-contents-view" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {folders.length > 0 && (
            <div className="cloud-folders-section">
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-primary)' }} className="heading-ico"><Icon name="folder" size={18} /> Folders ({folders.length})</h3>
              <div className="results-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {folders.map((folder) => {
                  const isEditing = gdriveCloudRenameId === folder.id;
                  return (
                    <div
                      key={folder.id}
                      className="cloud-card is-folder fade-in"
                      onClick={(e) => {
                        if (e.target.tagName !== 'INPUT' && !e.target.closest('button') && !isEditing) enterFolder(folder);
                      }}
                    >
                      <div className="cloud-card-head">
                        <span className="cloud-card-thumb"><Icon name="folder" size={22} /></span>
                        {isEditing ? (
                          <div className="cloud-rename-row" onClick={e => e.stopPropagation()}>
                            <input
                              type="text"
                              value={gdriveCloudRenameName}
                              onChange={(e) => setGdriveCloudRenameName(e.target.value)}
                              className="search-input"
                              style={{ height: '32px', padding: '0 0.5rem', fontSize: '0.9rem' }}
                              autoFocus
                            />
                            <button className="cloud-act primary icon-only" title="Save" onClick={() => renameGdriveCloudItem(folder.id, gdriveCloudRenameName)}>
                              <Icon name="check" size={14} />
                            </button>
                            <button className="cloud-act icon-only" title="Cancel" onClick={() => setGdriveCloudRenameId(null)}>
                              <Icon name="x" size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="cloud-card-meta">
                            <h4 title={folder.name}>{folder.name}</h4>
                            {folder.createdTime && <div className="cloud-card-sub"><Icon name="clock" size={12} /> Created {new Date(folder.createdTime).toLocaleDateString()}</div>}
                          </div>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="cloud-card-actions" onClick={e => e.stopPropagation()}>
                          <button className="cloud-act primary" onClick={() => enterFolder(folder)}>
                            <Icon name="folder" size={13} /> Open
                          </button>
                          <span className="cloud-act-spacer" />
                          <button
                            className={`cloud-act icon-only${isCloudInLibrary('gdrive', 'show', folder.id) ? ' active' : ''}`}
                            title={isCloudInLibrary('gdrive', 'show', folder.id) ? 'Remove show from Library' : 'Add show to Library'}
                            onClick={() => toggleCloudLibrary(folder, 'show', 'gdrive')}
                          >
                            <Icon name="star" size={15} fill={isCloudInLibrary('gdrive', 'show', folder.id)} />
                          </button>
                          <button
                            className="cloud-act icon-only"
                            title="Rename folder"
                            onClick={() => { setGdriveCloudRenameId(folder.id); setGdriveCloudRenameName(folder.name); }}
                          >
                            <Icon name="pencil" size={15} />
                          </button>
                          <button
                            className="cloud-act icon-only danger"
                            title="Delete folder (to Trash)"
                            onClick={() => trashGdriveCloudItem(folder.id, folder.name, 'folder')}
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {files.length > 0 && (
            <div className="cloud-files-section">
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-primary)' }} className="heading-ico"><Icon name="file" size={18} /> Files ({files.length})</h3>
              <div className="results-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                {files.map((file) => {
                  const isEditing = gdriveCloudRenameId === file.id;
                  const ext = (file.name.split('.').pop() || '').toLowerCase();
                  let fileIcon = 'file';
                  let actionLabel = 'Open';
                  let actionIcon = 'download';
                  if (['mkv', 'mp4', 'avi', 'mov', 'webm', 'm4v', 'ts'].includes(ext)) {
                    fileIcon = 'movie'; actionLabel = 'Play Stream'; actionIcon = 'player-play';
                  } else if (['mp3', 'flac', 'wav', 'm4a', 'ogg', 'wma'].includes(ext)) {
                    fileIcon = 'music'; actionLabel = 'Listen'; actionIcon = 'headphones';
                  } else if (['m4b'].includes(ext)) {
                    fileIcon = 'headphones'; actionLabel = 'Listen Audiobook'; actionIcon = 'headphones';
                  } else if (['epub', 'pdf'].includes(ext)) {
                    fileIcon = 'book'; actionLabel = 'Read Book'; actionIcon = 'book';
                  } else if (getEmulatorSystem(file.name)) {
                    fileIcon = 'device-gamepad'; actionLabel = 'Play Game'; actionIcon = 'device-gamepad';
                  }

                  return (
                    <div key={file.id} className="cloud-card fade-in">
                      <div className="cloud-card-head">
                        <span className="cloud-card-thumb"><Icon name={fileIcon} size={22} /></span>
                        {isEditing ? (
                          <div className="cloud-rename-row">
                            <input
                              type="text"
                              value={gdriveCloudRenameName}
                              onChange={(e) => setGdriveCloudRenameName(e.target.value)}
                              className="search-input"
                              style={{ height: '32px', padding: '0 0.5rem', fontSize: '0.9rem' }}
                              autoFocus
                            />
                            <button className="cloud-act primary icon-only" title="Save" onClick={() => renameGdriveCloudItem(file.id, gdriveCloudRenameName)}>
                              <Icon name="check" size={14} />
                            </button>
                            <button className="cloud-act icon-only" title="Cancel" onClick={() => setGdriveCloudRenameId(null)}>
                              <Icon name="x" size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="cloud-card-meta">
                            <h4 title={file.name}>{file.name}</h4>
                            <div className="cloud-card-sub">
                              <span>{formatBytes(file.size)}</span>
                              {file.createdTime && <><span>•</span><span>Added {new Date(file.createdTime).toLocaleDateString()}</span></>}
                            </div>
                          </div>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="cloud-card-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
                          <button className="cloud-act primary" style={{ width: '100%' }} onClick={() => playGdriveCloudFile(file)}>
                            <Icon name={actionIcon} size={14} fill={actionIcon === 'player-play'} /> {actionLabel}
                          </button>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              className={`cloud-act icon-only${isCloudInLibrary('gdrive', 'file', file.id) ? ' active' : ''}`}
                              title={isCloudInLibrary('gdrive', 'file', file.id) ? 'Remove from Library' : 'Add to Library'}
                              onClick={() => toggleCloudLibrary(file, 'file', 'gdrive')}
                            >
                              <Icon name="star" size={15} fill={isCloudInLibrary('gdrive', 'file', file.id)} />
                            </button>
                            <button
                              className="cloud-act icon-only"
                              title="Rename file"
                              onClick={() => { setGdriveCloudRenameId(file.id); setGdriveCloudRenameName(file.name); }}
                            >
                              <Icon name="pencil" size={15} />
                            </button>
                            <span className="cloud-act-spacer" />
                            <button
                              className="cloud-act icon-only danger"
                              title="Delete file (to Trash)"
                              onClick={() => trashGdriveCloudItem(file.id, file.name, 'file')}
                            >
                              <Icon name="trash" size={15} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
