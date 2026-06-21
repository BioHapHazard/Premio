import { useState } from 'react';
import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';
import { formatBytes, getIndexerShortName, guessCategory, findGdriveMatch } from '../lib/format';

// Active Downloads / Transfer Manager tab: lists Premiumize transfers or SABnzbd
// downloads with progress tracking and cancel/refresh/play/deletion actions.
export default function TransfersPanel({ 
  cancelTransfer, 
  fetchActiveTransfers,
  fetchSabStatus,
  cancelSabQueueItem,
  deleteSabHistoryItem,
  startStreaming,
  buildSabStreamUrl,
  isItemInLibrary,
  toggleLibraryItem,
  triggerGdriveUpload,
  gdriveUploads,
  gdriveConnected
}) {
  const { 
    transfers, 
    transfersLoading,
    sabQueue,
    sabHistory,
    sabSpeed,
    sabLoading,
    usenetHandler,
    userSabUrl,
    userSabKey,
    sabnzbdAutoFallbacks,
    completedIndexers,
    indexerStats,
    resetIndexerStats,
    gdriveFiles,
  } = useAppState();

  const isSabConfigured = userSabUrl && userSabKey;
  const [viewMode, setViewMode] = useState(isSabConfigured && usenetHandler === 'sabnzbd' ? 'sabnzbd' : 'premiumize');

  const handleRefresh = () => {
    if (viewMode === 'sabnzbd') {
      fetchSabStatus();
    } else {
      fetchActiveTransfers();
    }
  };

  return (
    <section className="transfers-section fade-in" aria-label="Transfers">
      {/* Header Toggle and Title */}
      <div className="results-header-row" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div className="results-header">
          <h2 className="heading-ico"><Icon name="download" size={20} /> Active Downloads &amp; Transfers</h2>
          <span className="results-subtitle">Monitor downloading queues and stream completed files</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isSabConfigured && (
            <div className="view-mode-tabs glass-panel" style={{ display: 'flex', padding: '2px', borderRadius: '8px', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--glass-border)' }}>
              <button
                type="button"
                onClick={() => setViewMode('premiumize')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: viewMode === 'premiumize' ? 'var(--color-primary-glow)' : 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  fontWeight: viewMode === 'premiumize' ? 'bold' : 'normal',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Premiumize Cloud
              </button>
              <button
                type="button"
                onClick={() => setViewMode('sabnzbd')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: viewMode === 'sabnzbd' ? 'var(--color-primary-glow)' : 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  fontWeight: viewMode === 'sabnzbd' ? 'bold' : 'normal',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                SABnzbd Downloader {sabSpeed && sabSpeed !== '0 B' && sabSpeed !== '0 B/s' && `(${sabSpeed})`}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('stats')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: viewMode === 'stats' ? 'var(--color-primary-glow)' : 'transparent',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  fontWeight: viewMode === 'stats' ? 'bold' : 'normal',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Indexer Statistics
              </button>
            </div>
          )}
          {viewMode === 'stats' ? (
            <button 
              onClick={() => {
                if (window.confirm("Are you sure you want to reset all indexer statistics? This cannot be undone.")) {
                  resetIndexerStats();
                }
              }} 
              className="danger-btn"
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#f87171',
                fontSize: '0.8rem',
              }}
            >
              <Icon name="x" size={14} /> Reset Stats
            </button>
          ) : (
            <button 
              onClick={handleRefresh} 
              className="action-btn"
              title="Refresh Active List"
            >
               Refresh Queue
            </button>
          )}
        </div>
      </div>

      {viewMode === 'premiumize' ? (
        /* --- Premiumize Cloud Transfers --- */
        transfersLoading && transfers.length === 0 ? (
          <div className="player-loading-container" style={{ margin: '4rem 0' }}>
            <span className="spinner-micro white large"></span>
            <p style={{ marginTop: '1rem' }}>Querying Premiumize transfer queue...</p>
          </div>
        ) : transfers.length === 0 ? (
          <div className="player-error-container" style={{ margin: '4rem 0', padding: '3rem', textAlign: 'center' }}>
            <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem'}}> Transfer Queue Empty</p>
            <p style={{ color: 'var(--text-muted)' }}>There are currently no active or queued downloads in your Premiumize account.</p>
          </div>
        ) : (
          <div className="transfers-container results-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {transfers.map((item) => {
              const percent = Math.round((item.progress || 0) * 100);
              const isFinished = item.status === 'finished' || item.status === 'seeding';
              
              let statusText = item.status;
              if (item.status === 'seeding') statusText = 'finished';
              
              return (
                <div key={item.id} className="transfer-item-card glass-panel fade-in hover-glow">
                  <div className="transfer-header">
                    <span className="transfer-name" title={item.name}>{item.name}</span>
                    <span className={`transfer-status-badge status-badge-${statusText}`}>
                      {statusText}
                    </span>
                  </div>
                  
                  <div className="transfer-progress-track">
                    <div 
                      className={`transfer-progress-fill ${isFinished ? 'status-finished' : ''}`}
                      style={{ width: `${percent}%` }}
                    ></div>
                  </div>
                  
                  <div className="transfer-footer">
                    <span className="transfer-msg">{item.message || (isFinished ? 'Finished' : 'Waiting...')}</span>
                    <span className="transfer-percent">{percent}%</span>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem', borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem' }}>
                    <button 
                      className="danger-btn text-only"
                      style={{ fontSize: '0.8rem', padding: '4px 8px', cursor: 'pointer' }}
                      onClick={() => cancelTransfer(item.id, item.name)}
                    >
                       Cancel &amp; Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : viewMode === 'sabnzbd' ? (
        /* --- SABnzbd Downloader Queue & History --- */
        sabLoading && sabQueue.length === 0 && sabHistory.length === 0 ? (
          <div className="player-loading-container" style={{ margin: '4rem 0' }}>
            <span className="spinner-micro white large"></span>
            <p style={{ marginTop: '1rem' }}>Querying SABnzbd status...</p>
          </div>
        ) : sabQueue.length === 0 && sabHistory.length === 0 ? (
          <div className="player-error-container" style={{ margin: '4rem 0', padding: '3rem', textAlign: 'center' }}>
            <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem'}}> SABnzbd Queue Empty</p>
            <p style={{ color: 'var(--text-muted)' }}>There are no active downloads or history entries in your local SABnzbd client.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Active Downloading Queue */}
            {sabQueue.length > 0 && (
              <div>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#ff9800', animation: 'pulse 1.5s infinite' }}></span>
                  Downloading ({sabQueue.length})
                </h3>
                <div className="transfers-container results-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                  {sabQueue.map((item) => {
                    const isPostProcessing = ['Verifying', 'Repairing', 'Unpacking', 'Checking', 'QuickCheck', 'Running'].includes(item.status);
                    const fallbackItem = sabnzbdAutoFallbacks && sabnzbdAutoFallbacks[item.nzoId];
                    const currentIndexer = fallbackItem?.indexersList[fallbackItem.currentIndex]?.name;
                    return (
                      <div key={item.nzoId} className="transfer-item-card glass-panel fade-in hover-glow">
                        <div className="transfer-header">
                          <span className="transfer-name" title={item.name}>{item.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {currentIndexer && (
                              <span className="indexer-badge" style={{
                                background: 'rgba(52, 211, 153, 0.1)',
                                color: '#34d399',
                                border: '1px solid rgba(52, 211, 153, 0.25)',
                                borderRadius: '4px',
                                padding: '2px 6px',
                                fontSize: '0.65rem',
                                fontWeight: '600',
                                textTransform: 'uppercase',
                              }}>{getIndexerShortName(currentIndexer)}</span>
                            )}
                            <span className={`transfer-status-badge status-badge-${item.status.toLowerCase()}`}>
                              {item.status}
                            </span>
                          </div>
                        </div>
                        
                        <div className="transfer-progress-track">
                          <div 
                            className={`transfer-progress-fill ${isPostProcessing ? 'status-processing' : ''}`}
                            style={{ width: `${item.percent}%` }}
                          ></div>
                        </div>
                        
                        <div className="transfer-footer">
                          <span className="transfer-msg">
                            {isPostProcessing ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span className="spinner-micro white small"></span> {item.status}...
                              </span>
                            ) : (
                              `${item.mbLeft.toFixed(1)} MB left`
                            )}
                          </span>
                          <span className="transfer-percent">
                            {item.percent}% {item.eta && item.eta !== '0:00:00' && `(ETA: ${item.eta})`}
                          </span>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem', borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem' }}>
                          <button 
                            className="danger-btn text-only"
                            style={{ fontSize: '0.8rem', padding: '4px 8px', cursor: 'pointer' }}
                            onClick={() => cancelSabQueueItem(item.nzoId, item.name)}
                          >
                             Cancel Download
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Completed Downloads History */}
            {sabHistory.length > 0 && (
              <div>
                <h3 style={{ marginBottom: '1rem' }}>Completed Downloads ({sabHistory.length})</h3>
                <div className="transfers-container results-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                  {sabHistory.map((item) => {
                    const isFinished = item.status === 'Completed';
                    const isFailed = item.status === 'Failed';
                    const isPostProcessing = ['Verifying', 'Repairing', 'Unpacking'].includes(item.status);

                    // Check if we have a match in the scanned Google Drive files list
                    const upload = gdriveUploads && gdriveUploads[item.nzoId];
                    const gdriveMatch = findGdriveMatch(gdriveFiles, item.name, item.resolvedVideoFile);
                    const driveFileId = upload?.driveFileId || (gdriveMatch ? gdriveMatch.id : null);

                    // Build a virtual torrent object to pass to startStreaming
                    const virtualTorrent = {
                      title: item.name,
                      name: item.name,
                      link: buildSabStreamUrl(item.nzoId),
                      size: item.bytes,
                      isCloudFile: true, // bypass PM direct cloud checks
                      forceBrowser: false,
                      isSabnzbd: true,
                      nzoId: item.nzoId,
                      gdriveFileId: driveFileId || undefined,
                      category: guessCategory(item.category, item.name),
                      files: item.resolvedVideoFile ? [{
                        name: item.resolvedVideoFile,
                        link: buildSabStreamUrl(item.nzoId),
                        size: item.bytes,
                        type: 'video',
                        id: item.nzoId
                      }] : []
                    };

                    const cleanTitle = (item.name || '').trim().toLowerCase();
                    const successfulIndexerName = (completedIndexers && completedIndexers[cleanTitle]) || 
                                                  (sabnzbdAutoFallbacks && sabnzbdAutoFallbacks[item.nzoId]?.indexersList[sabnzbdAutoFallbacks[item.nzoId]?.currentIndex]?.name);

                    return (
                      <div key={item.nzoId} className="transfer-item-card glass-panel fade-in hover-glow" style={{ borderLeft: isFinished ? '3px solid #4caf50' : isFailed ? '3px solid #f44336' : '3px solid var(--glass-border)' }}>
                        <div className="transfer-header">
                          <span className="transfer-name" title={item.name}>{item.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {successfulIndexerName && (
                              <span className="indexer-badge" style={{
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: '#10b981',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                borderRadius: '4px',
                                padding: '2px 6px',
                                fontSize: '0.65rem',
                                fontWeight: '600',
                                textTransform: 'uppercase',
                              }}>{getIndexerShortName(successfulIndexerName)}</span>
                            )}
                            <span className={`transfer-status-badge status-badge-${item.status.toLowerCase()}`}>
                              {item.status}
                            </span>
                          </div>
                        </div>

                        <div className="transfer-footer" style={{ marginTop: '0.5rem' }}>
                          <span className="transfer-msg" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {isPostProcessing ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#ff9800' }}>
                                <span className="spinner-micro white small"></span> Post-processing...
                              </span>
                            ) : isFinished ? (
                              `Size: ${formatBytes(item.bytes)}`
                            ) : (
                              item.action_line || 'Finished'
                            )}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {isFinished && (item.resolvedVideoFile || driveFileId) && (
                              <button 
                                className="btn-primary subtle"
                                style={{ fontSize: '0.8rem', padding: '4px 10px', height: '28px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => startStreaming(virtualTorrent)}
                              >
                                <Icon name="player-play" fill size={12} /> Play
                              </button>
                            )}

                            {isFinished && (
                              (() => {
                                const inLib = isItemInLibrary && isItemInLibrary(virtualTorrent);
                                return (
                                  <button 
                                    className={`btn-primary subtle ${inLib ? 'active' : ''}`}
                                    style={{ 
                                      fontSize: '0.8rem', 
                                      padding: '4px 10px', 
                                      height: '28px', 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '4px',
                                      background: inLib ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                      color: inLib ? '#10b981' : 'var(--text-primary)',
                                      borderColor: inLib ? 'rgba(16, 185, 129, 0.3)' : 'var(--glass-border)'
                                    }}
                                    onClick={() => toggleLibraryItem && toggleLibraryItem(virtualTorrent)}
                                    title={inLib ? "Remove from Library" : "Add to Library"}
                                  >
                                    <Icon name={inLib ? 'check' : 'plus'} size={12} /> {inLib ? 'In Library' : 'Add to Library'}
                                  </button>
                                );
                              })()
                            )}

                            {isFinished && gdriveConnected && (() => {
                              const upload = gdriveUploads && gdriveUploads[item.nzoId];
                              if (upload) {
                                if (upload.status === 'uploading') {
                                  return (
                                    <button 
                                      className="btn-primary subtle"
                                      disabled
                                      style={{ fontSize: '0.8rem', padding: '4px 10px', height: '28px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 152, 0, 0.15)', borderColor: 'rgba(255, 152, 0, 0.3)', color: '#ff9800' }}
                                    >
                                      <span className="spinner-micro white small" style={{ borderLeftColor: '#ff9800' }}></span>
                                      Uploading ({upload.progress}%)
                                    </button>
                                  );
                                }
                                if (upload.status === 'completed') {
                                  return (
                                    <button 
                                      className="btn-primary subtle"
                                      disabled
                                      style={{ fontSize: '0.8rem', padding: '4px 10px', height: '28px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#10b981' }}
                                    >
                                      <Icon name="check" size={12} /> Uploaded
                                    </button>
                                  );
                                }
                                if (upload.status === 'failed') {
                                  return (
                                    <button 
                                      className="btn-primary subtle"
                                      style={{ fontSize: '0.8rem', padding: '4px 10px', height: '28px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(244, 67, 54, 0.15)', borderColor: 'rgba(244, 67, 54, 0.3)', color: '#f44336' }}
                                      onClick={() => triggerGdriveUpload && triggerGdriveUpload(item.nzoId)}
                                      title={`Click to retry. Error: ${upload.error}`}
                                    >
                                      <Icon name="bolt" size={12} /> Retry Upload
                                    </button>
                                  );
                                }
                              }
                              return (
                                <button 
                                  className="btn-primary subtle"
                                  style={{ fontSize: '0.8rem', padding: '4px 10px', height: '28px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(33, 150, 243, 0.15)', borderColor: 'rgba(33, 150, 243, 0.3)', color: '#2196f3' }}
                                  onClick={() => triggerGdriveUpload && triggerGdriveUpload(item.nzoId)}
                                >
                                  <Icon name="upload" size={12} /> Upload
                                </button>
                              );
                            })()}
                          </div>
                          <button 
                            className="danger-btn text-only"
                            style={{ fontSize: '0.8rem', padding: '4px 8px', cursor: 'pointer' }}
                            onClick={() => deleteSabHistoryItem(item.nzoId, item.name)}
                          >
                             Delete Disk &amp; History
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        /* --- Indexer Statistics Dashboard --- */
        (() => {
          const statsKeys = Object.keys(indexerStats || {});
          let totalAttempts = 0;
          let totalSuccesses = 0;
          let totalFailures = 0;
          let totalBytes = 0;

          statsKeys.forEach(key => {
            const stat = indexerStats[key];
            totalAttempts += stat.attempts || 0;
            totalSuccesses += stat.successes || 0;
            totalFailures += stat.failures || 0;
            totalBytes += stat.totalBytes || 0;
          });

          const globalSuccessRate = totalAttempts > 0 
            ? Math.round((totalSuccesses / totalAttempts) * 100) 
            : 0;

          return (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {/* Metrics Summary Grid */}
              <div className="stats-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
                <div className="stat-summary-card glass-panel" style={{ padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(255, 255, 255, 0.03)' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Downloads</span>
                  <span style={{ fontSize: '1.75rem', fontWeight: '700', color: '#fff' }}>{totalAttempts}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Successful: {totalSuccesses}</span>
                </div>
                <div className="stat-summary-card glass-panel" style={{ padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(255, 255, 255, 0.03)' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Global Success Rate</span>
                  <span style={{ fontSize: '1.75rem', fontWeight: '700', color: globalSuccessRate >= 85 ? '#34d399' : globalSuccessRate >= 60 ? '#fbbf24' : '#f87171' }}>{globalSuccessRate}%</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target threshold: 85%</span>
                </div>
                <div className="stat-summary-card glass-panel" style={{ padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(255, 255, 255, 0.03)' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Failures &amp; Fallbacks</span>
                  <span style={{ fontSize: '1.75rem', fontWeight: '700', color: totalFailures > 0 ? '#fbbf24' : '#fff' }}>{totalFailures}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Triggered auto fallbacks</span>
                </div>
                <div className="stat-summary-card glass-panel" style={{ padding: '1.25rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(255, 255, 255, 0.03)' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Data Downloaded</span>
                  <span style={{ fontSize: '1.75rem', fontWeight: '700', color: '#34d399' }}>{formatBytes(totalBytes)}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Across all successful NZBs</span>
                </div>
              </div>

              {/* Table / Details Section */}
              <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--glass-border)', background: 'rgba(0, 0, 0, 0.15)' }}>
                <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                  <Icon name="filter" size={18} /> Indexer Performance &amp; Usage Metrics
                </h3>
                
                {statsKeys.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                    <Icon name="info" size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <p style={{ fontSize: '1rem', fontWeight: '500', marginBottom: '0.25rem' }}>No indexer metrics recorded yet</p>
                    <p style={{ fontSize: '0.85rem' }}>Start downloading NZB files via SABnzbd to collect indexer performance data.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '500px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                          <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Indexer</th>
                          <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Success Rate</th>
                          <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Succeeded</th>
                          <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Failed</th>
                          <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Attempts</th>
                          <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Data Downloaded</th>
                          <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Last Active</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsKeys.map(name => {
                          const stat = indexerStats[name];
                          const rate = stat.attempts > 0 
                            ? Math.round((stat.successes / stat.attempts) * 100) 
                            : 0;
                          return (
                            <tr key={name} className="hover-highlight" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', transition: 'background 0.2s' }}>
                              <td style={{ padding: '12px 12px', fontWeight: '600', color: '#fff' }}>{name}</td>
                              <td style={{ padding: '12px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div className="health-progress-bg" style={{ width: '80px', height: '6px', margin: 0, background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div 
                                      className={`health-progress-fill ${rate >= 85 ? 'green' : rate >= 60 ? 'amber' : 'red'}`}
                                      style={{ 
                                        width: `${rate}%`, 
                                        height: '100%', 
                                        borderRadius: '3px',
                                        background: rate >= 85 ? '#10b981' : rate >= 60 ? '#f59e0b' : '#ef4444' 
                                      }}
                                    ></div>
                                  </div>
                                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: rate >= 85 ? '#34d399' : rate >= 60 ? '#fbbf24' : '#f87171' }}>{rate}%</span>
                                </div>
                              </td>
                              <td style={{ padding: '12px 12px', textAlign: 'center', color: '#34d399' }}>{stat.successes}</td>
                              <td style={{ padding: '12px 12px', textAlign: 'center', color: stat.failures > 0 ? '#f87171' : 'var(--text-muted)' }}>{stat.failures}</td>
                              <td style={{ padding: '12px 12px', textAlign: 'center' }}>{stat.attempts}</td>
                              <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: '500' }}>{formatBytes(stat.totalBytes)}</td>
                              <td style={{ padding: '12px 12px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {stat.lastUsed ? new Date(stat.lastUsed).toLocaleDateString() : 'Never'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()
      )}
    </section>
  );
}
