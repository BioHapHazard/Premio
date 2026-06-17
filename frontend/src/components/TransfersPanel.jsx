import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';

// Active Downloads / Transfer Manager tab: lists Premiumize transfers with status
// bars and a cancel/refresh action. Reads transfers state from context.
export default function TransfersPanel({ cancelTransfer, fetchActiveTransfers }) {
  const { transfers, transfersLoading } = useAppState();

  return (
          <section className="transfers-section fade-in" aria-label="Transfers">
            <div className="results-header-row" style={{ marginBottom: '1.5rem' }}>
              <div className="results-header">
                <h2 className="heading-ico"><Icon name="download" size={20} /> Real-Time Active Downloads</h2>
                <span className="results-subtitle">Monitor and manage torrent transfers downloading to your cloud</span>
              </div>
              <button 
                onClick={fetchActiveTransfers} 
                className="action-btn"
                title="Refresh Active Transfers List"
              >
                 Refresh Queue
              </button>
            </div>

            {transfersLoading && transfers.length === 0 ? (
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
                           Cancel & Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
  );
}
