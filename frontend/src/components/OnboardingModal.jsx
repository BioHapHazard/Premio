import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';
import { PM_SIGNUP_URL } from '../lib/constants';

// First-run setup wizard (3 steps): enter Premiumize / TMDb / Jackett keys with
// inline "test key" results. Reads onboarding + key state from context; receives
// testKey + renderKeyTestResult as props.
export default function OnboardingModal({ testKey, renderKeyTestResult }) {
  const {
    onboardingStep, setOnboardingStep, setShowOnboarding,
    userPmKey, setUserPmKey, userTmdbKey, setUserTmdbKey,
    userJackettUrl, setUserJackettUrl, userJackettKey, setUserJackettKey,
    keyTestStatus, triggerToast,
  } = useAppState();

  return (
        <div className="modal-overlay legal-modal-overlay fade-in">
          <div className="modal-card legal-modal-card glass-panel" role="dialog" aria-modal="true" aria-label="Setup guide" style={{ maxWidth: '600px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2> Setup Guide (Step {onboardingStep} of 3)</h2>
              <button 
                type="button" 
                className="close-btn" 
                onClick={() => {
                  setShowOnboarding(false);
                  localStorage.setItem('premio_onboarding_completed', 'true');
                  triggerToast('Setup Guide completed. You can rerun it from Settings.', 'info');
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                <Icon name="x" size={20} />
              </button>
            </div>
            
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {onboardingStep === 1 && (
                <div className="onboarding-step fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}> Connect your Premiumize Account</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                    Premio is completely client-side and serverless. To check file cache status, create downloads, and stream files, you must connect your Premiumize.me account.
                  </p>
                  
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid var(--color-primary)', fontSize: '0.8rem' }}>
                    <strong>Don&apos;t have a Premiumize account?</strong><br />
                    <a href={PM_SIGNUP_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline', display: 'inline-block', marginTop: '4px', fontWeight: 'bold' }}>
                      Click here to visit Premiumize.me & Sign Up
                    </a>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Premiumize API Key (Required)</label>
                    <input 
                      type="password"
                      value={userPmKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        setUserPmKey(val);
                        localStorage.setItem('premio_user_pm_key', val);
                      }}
                      placeholder="Paste your Premiumize API Key..."
                      style={{
                        padding: '10px 14px',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '0.85rem',
                        outline: 'none'
                      }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      You can find your API key by logging into your account page at <a href="https://www.premiumize.me/account" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>premiumize.me/account</a> (click &quot;Show API Key&quot;).
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!userPmKey) { triggerToast('Enter your Premiumize API key first.', 'warning'); return; }
                          testKey('pm', '/api/account/info');
                        }}
                        disabled={keyTestStatus.pm?.state === 'testing'}
                        style={{ padding: '8px 14px', background: 'rgba(45, 212, 191, 0.12)', border: '1px solid rgba(45, 212, 191, 0.4)', borderRadius: '8px', color: '#5eead4', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {keyTestStatus.pm?.state === 'testing' ? 'Testing…' : 'Test connection'}
                      </button>
                      {renderKeyTestResult('pm')}
                    </div>
                  </div>
                </div>
              )}

              {onboardingStep === 2 && (
                <div className="onboarding-step fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}> Configure Jackett (Optional)</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                    To search public torrent indexes, connect Premio to a local or remote Jackett or Prowlarr instance. If you only plan to stream cached direct files or use Usenet, you can skip this step.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Jackett Server URL</label>
                      <input 
                        type="text"
                        value={userJackettUrl}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUserJackettUrl(val);
                          localStorage.setItem('premio_user_jackett_url', val);
                        }}
                        placeholder="http://localhost:9117"
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(0,0,0,0.2)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '0.85rem',
                          outline: 'none'
                        }}
                      />
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Jackett API Key</label>
                      <input 
                        type="password"
                        value={userJackettKey}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUserJackettKey(val);
                          localStorage.setItem('premio_user_jackett_key', val);
                        }}
                        placeholder="Paste your Jackett API Key..."
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(0,0,0,0.2)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '0.85rem',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!userJackettUrl || !userJackettKey) { triggerToast('Enter both the Jackett URL and API key first.', 'warning'); return; }
                        testKey('jackett', '/api/jackett/test');
                      }}
                      disabled={keyTestStatus.jackett?.state === 'testing'}
                      style={{ alignSelf: 'flex-start', padding: '8px 14px', background: 'rgba(45, 212, 191, 0.12)', border: '1px solid rgba(45, 212, 191, 0.4)', borderRadius: '8px', color: '#5eead4', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {keyTestStatus.jackett?.state === 'testing' ? 'Testing…' : 'Test Jackett connection'}
                    </button>
                    {renderKeyTestResult('jackett')}
                  </div>

                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                     Set up trackers (e.g. LimeTorrents, EZTV) inside your Jackett dashboard so search queries return cached media.
                  </p>
                </div>
              )}

              {onboardingStep === 3 && (
                <div className="onboarding-step fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}> Fetch Metadata & TMDb (Optional)</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                    Optionally configure a free TMDb v3 API key to load posters, backdrops, cast info, and ratings directly in your browser.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>TMDb v3 API Key</label>
                    <input 
                      type="text"
                      value={userTmdbKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        setUserTmdbKey(val);
                        localStorage.setItem('premio_user_tmdb_key', val);
                      }}
                      placeholder="Enter TMDb API Key..."
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '0.85rem',
                        outline: 'none'
                      }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Register a free account on <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>themoviedb.org</a> to generate your v3 key.
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!userTmdbKey) { triggerToast('Enter your TMDb key first.', 'warning'); return; }
                          testKey('tmdb', '/api/tmdb/test');
                        }}
                        disabled={keyTestStatus.tmdb?.state === 'testing'}
                        style={{ alignSelf: 'flex-start', padding: '8px 14px', background: 'rgba(45, 212, 191, 0.12)', border: '1px solid rgba(45, 212, 191, 0.4)', borderRadius: '8px', color: '#5eead4', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {keyTestStatus.tmdb?.state === 'testing' ? 'Testing…' : 'Test TMDb key'}
                      </button>
                      {renderKeyTestResult('tmdb')}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(74, 222, 128, 0.05)', borderLeft: '3px solid #4ade80', padding: '10px', borderRadius: '6px', fontSize: '0.8rem', color: '#4ade80', marginTop: '10px' }}>
                     Setup Complete! You can edit these keys or add Usenet indexers inside the Control Panel at any time.
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button 
                type="button"
                className="action-btn"
                onClick={() => setOnboardingStep(prev => Math.max(1, prev - 1))}
                disabled={onboardingStep === 1}
                style={{ opacity: onboardingStep === 1 ? 0.4 : 1 }}
              >
                ◀ Back
              </button>
              
              {onboardingStep < 3 ? (
                <button 
                  type="button"
                  className="action-btn"
                  onClick={() => {
                    if (onboardingStep === 1 && !userPmKey.trim()) {
                      triggerToast('Note: You skipped adding a Premiumize key. The app will run in Developer Mock Mode.', 'warning');
                    }
                    setOnboardingStep(prev => prev + 1);
                  }}
                >
                  Next Step ▶
                </button>
              ) : (
                <button 
                  type="button"
                  className="action-btn success"
                  style={{ background: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)' }}
                  onClick={() => {
                    setShowOnboarding(false);
                    localStorage.setItem('premio_onboarding_completed', 'true');
                    triggerToast('Onboarding completed! You are ready to search.', 'success');
                  }}
                >
                   Finish & Start Searching
                </button>
              )}
            </div>
          </div>
        </div>
  );
}
