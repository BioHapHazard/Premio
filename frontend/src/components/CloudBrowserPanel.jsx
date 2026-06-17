import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';
import { formatBytes } from '../lib/format';
import { getEmulatorSystem } from '../lib/emulator';

// Premiumize Cloud Storage Manager: quota dashboard, breadcrumb folder navigation,
// folder/file cards with rename/delete/save/stream/build-playlist actions, and the
// file-list filter. Reads cloud + account state from context; receives the cloud
// action handlers as props.
export default function CloudBrowserPanel({
  buildFolderPlaylist,
  fetchAccountQuota,
  fetchCloudFolder,
  handleAICleanName,
  handleCloudDelete,
  handleCloudRename,
  handleCloudStream,
}) {
  const {
    accountInfo,
    cloudContents, cloudBreadcrumbs, cloudError, cloudLoading,
    cloudFolderId, cloudFolderName,
    cloudFilter, setCloudFilter,
    cloudRenameId, setCloudRenameId,
    cloudRenameName, setCloudRenameName,
    cloudRenameType, setCloudRenameType,
    cloudPlaylistLoading, cloudPlaylistStatus,
    aiEnabled,
  } = useAppState();

  return (
          <section className="cloud-section fade-in" aria-label="Cloud storage">
            <div className="results-header-row" style={{ marginBottom: '1.5rem' }}>
              <div className="results-header">
                <h2 className="heading-ico"><Icon name="database" size={20} /> Premiumize Cloud Storage Manager</h2>
                <span className="results-subtitle">Browse, stream, rename, and organize your personal cloud storage</span>
              </div>
            </div>

            {/* Storage Quota Widget */}
            {accountInfo && (() => {
              // Robustly check for a valid space_used number from Premiumize API.
              // Converts raw bytes to GB, otherwise falls back to fair-use point approximation.
              const usedGb = (accountInfo.space_used !== undefined && accountInfo.space_used !== null && Number(accountInfo.space_used) > 0)
                ? (Number(accountInfo.space_used) / (1024 * 1024 * 1024)) 
                : (accountInfo.limit_used * 1000);
              const percentUsed = Math.min(100, (usedGb / 1000) * 100);
              const statusClass = percentUsed >= 85 ? 'q-high' : percentUsed >= 50 ? 'q-mid' : 'q-low';
              
              return (
                <div className="quota-card glass-panel fade-in">
                  <div className="quota-header-row">
                    <span className="quota-title heading-ico"><Icon name="database" size={15} /> Cloud Space Status</span>
                    <span className="quota-details">
                      {usedGb.toFixed(2)} GB / 1000 GB Used ({Math.round(percentUsed)}%)
                    </span>
                  </div>
                  <div className="quota-progress-track">
                    <div 
                      className={`quota-progress-fill ${statusClass}`} 
                      style={{ width: `${percentUsed}%` }}
                    ></div>
                  </div>
                  <div className="quota-footer-info">
                    <span>Customer ID: {accountInfo.customer_id || 'N/A'}</span>
                    <span>
                      Premium Until: {accountInfo.premium_until ? new Date(accountInfo.premium_until * 1000).toLocaleDateString() : 'N/A'}
                    </span>
                    <button 
                      onClick={fetchAccountQuota} 
                      className="text-only hover-action" 
                      style={{ cursor: 'pointer' }}
                    >
                       Refresh Storage Info
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Breadcrumb Navigation Bar */}
            <div className="cloud-breadcrumbs-bar glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1.5rem', borderRadius: '8px', flexWrap: 'wrap' }}>
              <button 
                className="cloud-breadcrumb-btn text-only"
                onClick={() => fetchCloudFolder(null)}
                style={{ cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 'bold' }}
              >
                 Cloud
              </button>
              {cloudBreadcrumbs && cloudBreadcrumbs.map((crumb, idx) => (
                <Fragment key={crumb.id || idx}>
                  <span style={{ color: 'var(--glass-border)' }}>/</span>
                  <button 
                    className="cloud-breadcrumb-btn text-only"
                    onClick={() => fetchCloudFolder(crumb.id)}
                    style={{ cursor: 'pointer', color: idx === cloudBreadcrumbs.length - 1 ? 'var(--color-text)' : 'var(--color-primary)' }}
                  >
                    {crumb.name}
                  </button>
                </Fragment>
              ))}
            </div>

            {/* Cloud Browser Action Row (Local filtering + refresh) */}
            <div className="search-row" style={{ marginBottom: '1.5rem', gap: '1rem' }}>
              <div className="input-container" style={{ flex: 1 }}>
                <span className="input-search-icon"><Icon name="search" size={18} /></span>
                <input
                  type="text"
                  placeholder={`Search files in "${cloudFolderName}"...`}
                  value={cloudFilter}
                  onChange={(e) => setCloudFilter(e.target.value)}
                  className="search-input"
                />
              </div>
              <button 
                type="button" 
                className="search-submit-btn hover-action"
                style={{ width: 'auto', padding: '0.5rem 1.5rem', height: '42px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}
                onClick={() => fetchCloudFolder(cloudFolderId)}
                disabled={cloudLoading}
              >
                 Refresh
              </button>
              {cloudFolderId && (
                <button 
                  type="button" 
                  className="search-submit-btn hover-action"
                  style={{ 
                    width: 'auto', 
                    padding: '0.5rem 1.5rem', 
                    height: '42px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem', 
                    fontSize: '0.95rem',
                    background: 'linear-gradient(135deg, var(--color-primary) 0%, #4f46e5 100%)',
                    border: 'none'
                  }}
                  onClick={() => buildFolderPlaylist(cloudFolderId, cloudFolderName)}
                  disabled={cloudLoading || cloudPlaylistLoading}
                >
                   Play All
                </button>
              )}
            </div>

            {cloudPlaylistLoading ? (
              <div className="loading-state glass-panel" style={{ padding: '4rem 2rem' }}>
                <div className="spinner"></div>
                <h2 className="heading-ico"><Icon name="player-play" size={20} fill /> Building "Play All" Playlist...</h2>
                <p style={{ marginTop: '0.75rem', color: 'var(--color-primary)', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  {cloudPlaylistStatus}
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Scanning directories recursively and organizing media tracks chronologically.
                </p>
              </div>
            ) : cloudLoading ? (
              <div className="loading-state glass-panel" style={{ padding: '4rem 2rem' }}>
                <div className="spinner"></div>
                <h2>Retrieving Cloud Storage contents...</h2>
                <p>Loading files and folders from Premiumize secure personal lockers</p>
              </div>
            ) : cloudError ? (
              <div className="empty-state glass-panel" style={{ padding: '3rem 2rem', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                <div className="empty-icon"><Icon name="alert-triangle" size={40} style={{ color: 'rgba(239, 68, 68, 0.8)' }} /></div>
                <h2>Failed to Load Cloud Contents</h2>
                <p>{cloudError}</p>
                <button 
                  className="cache-badge badge-stream hover-action" 
                  style={{ marginTop: '1rem', border: 'none', cursor: 'pointer' }}
                  onClick={() => fetchCloudFolder(cloudFolderId)}
                >
                   Retry Connection
                </button>
              </div>
            ) : (
              (() => {
                // Filter contents based on local filter string
                const filteredContents = cloudContents.filter(item => 
                  item.name.toLowerCase().includes(cloudFilter.toLowerCase())
                );

                // Split folders and files for clean hierarchical display
                const folders = filteredContents.filter(item => item.type === 'folder');
                const files = filteredContents.filter(item => item.type === 'file');

                if (filteredContents.length === 0) {
                  return (
                    <div className="empty-state glass-panel" style={{ padding: '4rem 2rem' }}>
                      <div className="empty-icon"><Icon name="folder" size={44} /></div>
                      <h2>No files or folders found</h2>
                      <p>{cloudFilter ? 'No items match your local search query.' : 'This cloud folder is currently empty.'}</p>
                      {cloudFolderId && (
                        <button 
                          className="cache-badge badge-listen hover-action" 
                          style={{ marginTop: '1rem', border: 'none', cursor: 'pointer' }}
                          onClick={() => {
                            const parentId = cloudBreadcrumbs.length > 1 ? cloudBreadcrumbs[cloudBreadcrumbs.length - 2].id : null;
                            fetchCloudFolder(parentId);
                          }}
                        >
                           Go Back Up
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="cloud-contents-view" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    
                    {/* Render Folders Grid if folders exist */}
                    {folders.length > 0 && (
                      <div className="cloud-folders-section">
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-primary)'}} className="heading-ico"><Icon name="folder" size={18} /> Folders ({folders.length})</h3>
                        <div className="results-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                          {folders.map((folder) => {
                            const isEditing = cloudRenameId === folder.id;
                            return (
                              <div
                                key={folder.id}
                                className="cloud-card is-folder fade-in"
                                onClick={(e) => {
                                  if (e.target.tagName !== 'INPUT' && !e.target.closest('button') && !isEditing) {
                                    fetchCloudFolder(folder.id);
                                  }
                                }}
                              >
                                <div className="cloud-card-head">
                                  <span className="cloud-card-thumb"><Icon name="folder" size={22} /></span>
                                  {isEditing ? (
                                    <div className="cloud-rename-row" onClick={e => e.stopPropagation()}>
                                      <input
                                        type="text"
                                        value={cloudRenameName}
                                        onChange={(e) => setCloudRenameName(e.target.value)}
                                        className="search-input"
                                        style={{ height: '32px', padding: '0 0.5rem', fontSize: '0.9rem' }}
                                        autoFocus
                                      />
                                      {aiEnabled && (
                                        <button
                                          type="button"
                                          className="cloud-act icon-only"
                                          onClick={() => handleAICleanName(folder.name, setCloudRenameName)}
                                          title="Clean folder name with Premiumize AI"
                                          disabled={aiLoading}
                                        >
                                          <Icon name="wand" size={14} />
                                        </button>
                                      )}
                                      <button
                                        className="cloud-act primary icon-only"
                                        title="Save"
                                        onClick={() => handleCloudRename(folder.id, 'folder', cloudRenameName)}
                                      >
                                        <Icon name="check" size={14} />
                                      </button>
                                      <button
                                        className="cloud-act icon-only"
                                        title="Cancel"
                                        onClick={() => setCloudRenameId(null)}
                                      >
                                        <Icon name="x" size={14} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="cloud-card-meta">
                                      <h4 title={folder.name}>{folder.name}</h4>
                                      <div className="cloud-card-sub"><Icon name="clock" size={12} /> Created {new Date(folder.created_at * 1000).toLocaleDateString()}</div>
                                    </div>
                                  )}
                                </div>

                                {!isEditing && (
                                  <div className="cloud-card-actions" onClick={e => e.stopPropagation()}>
                                    <button
                                      className="cloud-act primary"
                                      onClick={() => buildFolderPlaylist(folder.id, folder.name)}
                                    >
                                      <Icon name="player-play" size={13} fill /> Play All
                                    </button>
                                    <span className="cloud-act-spacer" />
                                    <button
                                      className="cloud-act icon-only"
                                      title="Bookmark folder"
                                      onClick={() => bookmarkCloudItem(folder)}
                                    >
                                      <Icon name="bookmark" size={15} />
                                    </button>
                                    <button
                                      className="cloud-act icon-only"
                                      title="Rename folder"
                                      onClick={() => {
                                        setCloudRenameId(folder.id);
                                        setCloudRenameName(folder.name);
                                        setCloudRenameType('folder');
                                      }}
                                    >
                                      <Icon name="pencil" size={15} />
                                    </button>
                                    <button
                                      className="cloud-act icon-only danger"
                                      title="Delete folder"
                                      onClick={() => handleCloudDelete(folder.id, 'folder', folder.name)}
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

                    {/* Render Files Grid if files exist */}
                    {files.length > 0 && (
                      <div className="cloud-files-section">
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-primary)'}} className="heading-ico"><Icon name="file" size={18} /> Files ({files.length})</h3>
                        <div className="results-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                          {files.map((file) => {
                            const isEditing = cloudRenameId === file.id;
                            const ext = file.name.split('.').pop().toLowerCase();
                            
                            // Map icon according to file extension
                            let fileIcon = 'file';
                            let actionLabel = 'CDN Download';
                            let actionColorClass = 'badge-download';
                            let actionIcon = 'download';

                            if (['mkv', 'mp4', 'avi'].includes(ext)) {
                              fileIcon = 'movie';
                              actionLabel = 'Play Stream';
                              actionColorClass = 'badge-stream';
                              actionIcon = 'player-play';
                            } else if (['mp3', 'flac', 'wav', 'm4a', 'ogg', 'wma'].includes(ext)) {
                              fileIcon = 'music';
                              actionLabel = 'Ambient Listen';
                              actionColorClass = 'badge-listen';
                              actionIcon = 'headphones';
                            } else if (['m4b'].includes(ext)) {
                              fileIcon = 'headphones';
                              actionLabel = 'Listen Audiobook';
                              actionColorClass = 'badge-listen';
                              actionIcon = 'headphones';
                            } else if (['epub', 'pdf'].includes(ext)) {
                              fileIcon = 'book';
                              actionLabel = 'Read Book';
                              actionColorClass = 'badge-ebook';
                              actionIcon = 'book';
                            } else if (getEmulatorSystem(file.name)) {
                              fileIcon = 'device-gamepad';
                              actionLabel = 'Play Game';
                              actionColorClass = 'badge-game';
                              actionIcon = 'device-gamepad';
                            }

                            return (
                              <div
                                key={file.id}
                                className="cloud-card fade-in"
                              >
                                <div className="cloud-card-head">
                                  <span className="cloud-card-thumb"><Icon name={fileIcon} size={22} /></span>
                                  {isEditing ? (
                                    <div className="cloud-rename-row">
                                      <input
                                        type="text"
                                        value={cloudRenameName}
                                        onChange={(e) => setCloudRenameName(e.target.value)}
                                        className="search-input"
                                        style={{ height: '32px', padding: '0 0.5rem', fontSize: '0.9rem' }}
                                        autoFocus
                                      />
                                      {aiEnabled && (
                                        <button
                                          type="button"
                                          className="cloud-act icon-only"
                                          onClick={() => handleAICleanName(file.name, setCloudRenameName)}
                                          title="Clean file name with Premiumize AI"
                                          disabled={aiLoading}
                                        >
                                          <Icon name="wand" size={14} />
                                        </button>
                                      )}
                                      <button
                                        className="cloud-act primary icon-only"
                                        title="Save"
                                        onClick={() => handleCloudRename(file.id, 'file', cloudRenameName)}
                                      >
                                        <Icon name="check" size={14} />
                                      </button>
                                      <button
                                        className="cloud-act icon-only"
                                        title="Cancel"
                                        onClick={() => setCloudRenameId(null)}
                                      >
                                        <Icon name="x" size={14} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="cloud-card-meta">
                                      <h4 title={file.name}>{file.name}</h4>
                                      <div className="cloud-card-sub">
                                        <span>{formatBytes(file.size)}</span>
                                        <span>•</span>
                                        <span>Added {new Date(file.created_at * 1000).toLocaleDateString()}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {!isEditing && (
                                  <div className="cloud-card-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
                                    <button
                                      className="cloud-act primary"
                                      style={{ width: '100%' }}
                                      onClick={() => handleCloudStream(file)}
                                    >
                                      <Icon name={actionIcon} size={14} fill={actionIcon === 'player-play'} /> {actionLabel}
                                    </button>
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                      <button
                                        className="cloud-act icon-only"
                                        title="Bookmark file"
                                        onClick={() => bookmarkCloudItem(file)}
                                      >
                                        <Icon name="bookmark" size={15} />
                                      </button>
                                      <button
                                        className="cloud-act icon-only"
                                        title="Rename file"
                                        onClick={() => {
                                          setCloudRenameId(file.id);
                                          setCloudRenameName(file.name);
                                          setCloudRenameType('file');
                                        }}
                                      >
                                        <Icon name="pencil" size={15} />
                                      </button>
                                      <span className="cloud-act-spacer" />
                                      <button
                                        className="cloud-act icon-only danger"
                                        title="Delete file"
                                        onClick={() => handleCloudDelete(file.id, 'file', file.name)}
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
                );
              })()
            )}
          </section>
  );
}
