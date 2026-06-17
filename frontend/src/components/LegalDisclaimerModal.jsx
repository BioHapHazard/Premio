import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';

// Terms of Service & Legal Disclaimer modal (first-run + footer link). Context-only.
export default function LegalDisclaimerModal() {
  const { setShowLegalDisclaimer, setShowOnboarding, setOnboardingStep, triggerToast } = useAppState();

  return (
        <div className="modal-overlay legal-modal-overlay fade-in">
          <div className="modal-card legal-modal-card glass-panel" role="dialog" aria-modal="true" aria-label="Legal disclaimer and terms of service" style={{ maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2> Legal Disclaimer & Terms of Service</h2>
            </div>
            <div className="modal-body" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '12px', lineHeight: '1.4' }}>
              <p>
                Welcome to <strong>Premio</strong>. Before proceeding, please read and agree to the following terms:
              </p>
              
              <div className="legal-section" style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', borderLeft: '3px solid var(--color-primary)' }}>
                <h4 style={{ color: 'var(--text-primary)', margin: '0 0 4px 0' }}>1. Stateless Client Architecture</h4>
                <p style={{ margin: 0 }}>
                  Premio is a client-side user interface. All API credentials (including your Premiumize API Key, TMDb API Key, Jackett URLs, and Usenet indexer details) are stored exclusively in your browser&apos;s local storage. This application does not run a remote database and never logs, shares, or retains your keys on any external server.
                </p>
              </div>

              <div className="legal-section" style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', borderLeft: '3px solid var(--color-primary)' }}>
                <h4 style={{ color: 'var(--text-primary)', margin: '0 0 4px 0' }}>2. Third-Party Integrations</h4>
                <p style={{ margin: 0 }}>
                  All searches and indexer queries are executed client-side or proxies through your own self-configured third-party indexer endpoints. Premio does not host, index, or distribute any torrents, NZB files, or video content. Users are solely responsible for ensuring their searches comply with local regulations.
                </p>
              </div>

              <div className="legal-section" style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', borderLeft: '3px solid var(--color-primary)' }}>
                <h4 style={{ color: 'var(--text-primary)', margin: '0 0 4px 0' }}>3. Fair-Use Point System Notice</h4>
                <p style={{ margin: 0 }}>
                  Downloading or streaming items via Premiumize can deduct points from your Premiumize account quota according to their Fair-Use rules. In particular, non-cached downloads (like Usenet NZBs or unseeded torrents) incur points for both cloud downloading (1 pt/GB) and streaming (1 pt/GB). Premio is not responsible for any point consumption.
                </p>
              </div>

              <p style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                By checking the box below and clicking &quot;I Agree&quot;, you acknowledge that Premio is a stateless wrapper tool and agree to use it in accordance with applicable laws.
              </p>
            </div>
            
            <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  id="chk-agree-tos" 
                  defaultChecked={localStorage.getItem('premio_legal_acknowledged') === 'true'} 
                  onChange={(e) => {
                    if (e.target.checked) {
                      localStorage.setItem('premio_legal_acknowledged', 'true');
                    } else {
                      localStorage.removeItem('premio_legal_acknowledged');
                    }
                  }}
                />
                <span>I read, understand, and agree to the Terms of Service & Disclaimer.</span>
              </label>
              <button 
                type="button" 
                className="action-btn"
                id="btn-agree-tos"
                onClick={() => {
                  if (localStorage.getItem('premio_legal_acknowledged') !== 'true') {
                    triggerToast('Please check the agreement box to proceed.', 'error');
                    return;
                  }
                  setShowLegalDisclaimer(false);
                  triggerToast('Terms of Service acknowledged.', 'success');
                  if (localStorage.getItem('premio_onboarding_completed') !== 'true') {
                    setShowOnboarding(true);
                    setOnboardingStep(1);
                  }
                }}
              >
                I Agree & Accept
              </button>
            </div>
          </div>
        </div>
  );
}
