import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';

// Settings control panel: BYOK API keys, Premiumize.ai config, Jackett + Usenet
// indexers, the (unlockable) adult filter, clear-local-data, and cloud sync. Reads
// its state from context; receives the four action handlers as props.
export default function SettingsPanel({ handleToggleShowKeys, fetchAiModels, clearHistory, syncFromCloud }) {
  const {
    showKeys,
    setShowSettings, setShowOnboarding, setOnboardingStep,
    userPmKey, setUserPmKey, userTmdbKey, setUserTmdbKey, userOmdbKey, setUserOmdbKey,
    userOpenSubsKey, setUserOpenSubsKey, userSubdlKey, setUserSubdlKey,
    aiEnabled, setAiEnabled, aiToken, setAiToken, aiModel, setAiModel, aiModelsList, fetchingModels,
    userJackettUrl, setUserJackettUrl, userJackettKey, setUserJackettKey, showJackettGuide, setShowJackettGuide,
    userIndexers, setUserIndexers, newIdxName, setNewIdxName, newIdxUrl, setNewIdxUrl, newIdxKey, setNewIdxKey,
    isKids, adultControlsUnlocked, hideAdult, setHideAdult,
    lastSynced, isSyncing,
    triggerToast,
  } = useAppState();

  return (
          <section className="settings-card glass-panel fade-in" id="settings-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
              <h2 style={{ margin: 0 }} className="heading-ico"><Icon name="settings" size={20} /> Control Panel</h2>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="action-btn"
                  aria-pressed={showKeys}
                  style={{
                    fontSize: '0.8rem',
                    padding: '6px 12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: showKeys ? 'var(--color-primary-glow)' : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${showKeys ? 'var(--color-primary)' : 'var(--glass-border)'}`,
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                  onClick={handleToggleShowKeys}
                  title={showKeys ? 'Hide all API keys' : 'Reveal all API keys (so you can copy them)'}
                >
                  <Icon name={showKeys ? 'eye-off' : 'eye'} size={14} /> {showKeys ? 'Hide Keys' : 'Show Keys'}
                </button>
                <button
                  type="button"
                  className="action-btn"
                  style={{
                    fontSize: '0.8rem',
                    padding: '6px 12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setShowSettings(false);
                    setShowOnboarding(true);
                    setOnboardingStep(1);
                  }}
                >
                   Run Setup Guide / Onboarding
                </button>
              </div>
            </div>
            <div className="settings-grid">
              
              {/* Premiumize API Key Input */}
              <div className="setting-item full-width-field">
                <div className="setting-info">
                  <h3>Premiumize API Key</h3>
                  <p>Required for stream link generation, CDN cache status checks, and cloud sync features.</p>
                </div>
                <input 
                  type={showKeys ? 'text' : 'password'}
                  value={userPmKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUserPmKey(val);
                    localStorage.setItem('premio_user_pm_key', val);
                  }}
                  placeholder="Enter your Premiumize API Key..."
                  className="settings-text-input"
                />
              </div>

              {/* TMDb API Key Input */}
              <div className="setting-item full-width-field">
                <div className="setting-info">
                  <h3>TMDb API Key (v3)</h3>
                  <p>Optional. Used to fetch movie posters, overview texts, and rating details directly in your browser.</p>
                </div>
                <input
                  type={showKeys ? 'text' : 'password'}
                  value={userTmdbKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUserTmdbKey(val);
                    localStorage.setItem('premio_user_tmdb_key', val);
                  }}
                  placeholder="Enter your TMDb v3 API Key..."
                  className="settings-text-input"
                />
              </div>

              {/* OMDb API Key Input */}
              <div className="setting-item full-width-field">
                <div className="setting-info">
                  <h3>OMDb API Key</h3>
                  <p>Optional. Adds IMDb, Rotten Tomatoes, and Metacritic ratings to movie &amp; TV detail pages (alongside TMDb). Free key at omdbapi.com.</p>
                </div>
                <input
                  type={showKeys ? 'text' : 'password'}
                  value={userOmdbKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUserOmdbKey(val);
                    localStorage.setItem('premio_user_omdb_key', val);
                  }}
                  placeholder="Enter your OMDb API Key..."
                  className="settings-text-input"
                />
              </div>

              {/* OpenSubtitles API Key Input */}
              <div className="setting-item full-width-field">
                <div className="setting-info">
                  <h3>OpenSubtitles API Key</h3>
                  <p>Optional. Lets the player fetch subtitles online when a video has none embedded. Free key at <strong>opensubtitles.com</strong> → Consumers. Tip: set your consumer to &quot;Under Development&quot; for 100 downloads/day without logging in.</p>
                </div>
                <input
                  type={showKeys ? 'text' : 'password'}
                  value={userOpenSubsKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUserOpenSubsKey(val);
                    localStorage.setItem('premio_user_opensubs_key', val);
                  }}
                  placeholder="Enter your OpenSubtitles API Key..."
                  className="settings-text-input"
                />
              </div>

              {/* SubDL API Key Input (fallback subtitle source) */}
              <div className="setting-item full-width-field">
                <div className="setting-info">
                  <h3>SubDL API Key <span style={{ fontWeight: 400, opacity: 0.7 }}>(fallback)</span></h3>
                  <p>Optional. Free fallback subtitle source used when OpenSubtitles returns nothing or hits its daily download cap. Free key at <strong>subdl.com</strong>.</p>
                </div>
                <input
                  type={showKeys ? 'text' : 'password'}
                  value={userSubdlKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUserSubdlKey(val);
                    localStorage.setItem('premio_user_subdl_key', val);
                  }}
                  placeholder="Enter your SubDL API Key..."
                  className="settings-text-input"
                />
              </div>

              {/* Premiumize AI Settings */}
              <div className="setting-item full-width-field" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <div className="setting-info" style={{ flex: 1 }}>
                    <h3>Premiumize AI Assistant</h3>
                    <p>Enable AI features like smart filename cleaning and conversational copilot using your Premiumize.ai subscription.</p>
                  </div>
                  <label className="switch-control" style={{ flexShrink: 0 }}>
                    <input 
                      type="checkbox" 
                      checked={aiEnabled} 
                      onChange={(e) => {
                        const val = e.target.checked;
                        setAiEnabled(val);
                        localStorage.setItem('premio_ai_enabled', val);
                      }} 
                      id="checkbox-ai-enabled"
                    />
                    <span className="switch-slider"></span>
                  </label>
                </div>
                {aiEnabled && (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <input 
                      type={showKeys ? 'text' : 'password'}
                      value={aiToken}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAiToken(val);
                        localStorage.setItem('premio_ai_token', val);
                      }}
                      placeholder="Enter Premiumize.ai JWT Token..."
                      className="settings-text-input"
                    />
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      To find this: Log in to <b>premiumize.ai</b>, open browser Developer Tools (F12) Network send a chat message look at request headers copy the <b>authorization</b> value.
                    </p>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                      <select 
                        value={aiModel}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAiModel(val);
                          localStorage.setItem('premio_ai_model', val);
                        }}
                        className="settings-text-input small"
                        style={{ flex: 2, height: '36px' }}
                      >
                        {aiModelsList.map(model => (
                          <option key={model.id} value={model.id}>{model.name} ({model.owned_by})</option>
                        ))}
                      </select>
                      <button 
                        type="button" 
                        className="action-btn"
                        style={{ flex: 1, height: '36px', fontSize: '0.8rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={fetchAiModels}
                        disabled={fetchingModels}
                      >
                        {fetchingModels ? 'Fetching...': 'Fetch Models'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Jackett Server Settings */}
              <div className="setting-item full-width-field">
                <div className="setting-info">
                  <h3>Jackett Integration</h3>
                  <p>Configure your local or remote Jackett/Prowlarr server to search public torrent indexes.</p>
                </div>
                <div className="settings-multi-inputs">
                  <input 
                    type="text" 
                    value={userJackettUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setUserJackettUrl(val);
                      localStorage.setItem('premio_user_jackett_url', val);
                    }}
                    placeholder="Server URL (e.g. http://localhost:9117)"
                    className="settings-text-input small"
                  />
                  <input 
                    type={showKeys ? 'text' : 'password'}
                    value={userJackettKey}
                    onChange={(e) => {
                      const val = e.target.value;
                      setUserJackettKey(val);
                      localStorage.setItem('premio_user_jackett_key', val);
                    }}
                    placeholder="Jackett API Key"
                    className="settings-text-input small"
                  />
                </div>
                <button 
                  type="button"
                  className="help-toggle-btn"
                  onClick={() => setShowJackettGuide(!showJackettGuide)}
                  style={{ marginTop: '6px', fontSize: '0.75rem', alignSelf: 'flex-start' }}
                >
                  {showJackettGuide ? 'Hide Setup Guide': 'How do I set up Jackett?'}
                </button>
                {showJackettGuide && (
                  <div className="onboarding-guide-box glass-panel fade-in" style={{ marginTop: '10px', padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', borderLeft: '3px solid var(--color-primary)' }}>
                    <p style={{ margin: '0 0 6px 0', fontWeight: 'bold', color: 'var(--text-primary)'}}> Quick Start Guide: Setting Up Jackett</p>
                    <ol style={{ margin: '0', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <li>Download & install Jackett for your operating system (from the <a href="https://github.com/Jackett/Jackett/releases" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>Official Releases Page</a>).</li>
                      <li>Open Jackett in your browser (usually at <a href="http://localhost:9117" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>http://localhost:9117</a>).</li>
                      <li>Click <b>+ Add Indexer</b> at the top, select public torrent indexers (e.g., <i>TorrentGalaxy, YTS, 1337x</i>), and click close.</li>
                      <li>Copy the <b>API Key</b> shown in the top right corner of the Jackett homepage.</li>
                      <li>Paste the URL and Key above! Leave blank to use developer mock data.</li>
                    </ol>
                  </div>
                )}
              </div>

              {/* Usenet Indexer Settings */}
              <div className="setting-item full-width-field">
                <div className="setting-info">
                  <h3>Usenet (Newznab) Indexers</h3>
                  <p>Add indexers to search Usenet for NZB files. Supports standard Newznab-compliant indexer feeds.</p>
                </div>
                
                {/* Active Indexers List */}
                {userIndexers.length > 0 && (
                  <div className="indexers-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '8px 0', width: '100%' }}>
                    {userIndexers.map((idx, index) => (
                      <div key={index} className="indexer-row glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', fontSize: '0.8rem' }}>
                        <span> <b>{idx.name}</b> ({idx.url})</span>
                        <button 
                          type="button" 
                          className="danger-btn text-only"
                          onClick={() => {
                            const updated = userIndexers.filter((_, i) => i !== index);
                            setUserIndexers(updated);
                            localStorage.setItem('premio_user_usenet_indexers', JSON.stringify(updated));
                            triggerToast(`Removed indexer: ${idx.name}`, 'success');
                          }}
                        >
                           Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add New Indexer Panel */}
                <div className="add-indexer-panel" style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', marginTop: '8px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold'}}> Add Custom Indexer</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input 
                      type="text" 
                      placeholder="Name (e.g. NZBFinder)"
                      value={newIdxName}
                      onChange={(e) => setNewIdxName(e.target.value)}
                      className="settings-text-input small"
                      style={{ flex: 1 }}
                    />
                    <input 
                      type="text" 
                      placeholder="API URL (e.g. https://nzbfinder.ws/api)"
                      value={newIdxUrl}
                      onChange={(e) => setNewIdxUrl(e.target.value)}
                      className="settings-text-input small"
                      style={{ flex: 2 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input 
                      type={showKeys ? 'text' : 'password'}
                      placeholder="API Key"
                      value={newIdxKey}
                      onChange={(e) => setNewIdxKey(e.target.value)}
                      className="settings-text-input small"
                      style={{ flex: 2 }}
                    />
                    <button 
                      type="button" 
                      className="action-btn"
                      style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem' }}
                      onClick={() => {
                        if (!newIdxName.trim() || !newIdxUrl.trim() || !newIdxKey.trim()) {
                          triggerToast('Please fill out all fields to add an indexer.', 'error');
                          return;
                        }
                        const updated = [...userIndexers, {
                          name: newIdxName.trim(),
                          url: newIdxUrl.trim(),
                          key: newIdxKey.trim()
                        }];
                        setUserIndexers(updated);
                        localStorage.setItem('premio_user_usenet_indexers', JSON.stringify(updated));
                        setNewIdxName('');
                        setNewIdxUrl('');
                        setNewIdxKey('');
                        triggerToast('Custom indexer added successfully!', 'success');
                      }}
                    >
                       Add Indexer
                    </button>
                  </div>
                  
                  {/* Preset Free Tier Indexers */}
                  <div className="presets-row" style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px', fontSize: '0.7rem' }}>
                    <span style={{ color: 'var(--color-muted)' }}>Presets:</span>
                    <button 
                      type="button"
                      className="presets-badge"
                      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', color: 'var(--color-text)' }}
                      onClick={() => {
                        setNewIdxName('NZBFinder (Free)');
                        setNewIdxUrl('https://nzbfinder.ws/api');
                        triggerToast('NZBFinder preset filled! Please enter your free API key to save.', 'success');
                      }}
                    >
                       NZBFinder Free (25 Daily hits)
                    </button>
                    <button 
                      type="button"
                      className="presets-badge"
                      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', color: 'var(--color-text)' }}
                      onClick={() => {
                        setNewIdxName('Usenet-Crawler');
                        setNewIdxUrl('https://www.usenet-crawler.com/api');
                        triggerToast('Usenet-Crawler preset filled! Please enter your free API key to save.', 'success');
                      }}
                    >
                       Usenet-Crawler
                    </button>
                  </div>
                </div>
              </div>

              {/* Privacy Setting Toggle (Only visible if secretly unlocked) */}
              {!isKids && adultControlsUnlocked && (
                <div className="setting-item">
                  <div className="setting-info">
                    <h3>Adult Category Filter</h3>
                    <p>Completely hide the Adult/XXX content category from selections and queries.</p>
                  </div>
                  <label className="switch-control">
                    <input 
                      type="checkbox" 
                      checked={hideAdult} 
                      onChange={(e) => setHideAdult(e.target.checked)} 
                      id="checkbox-hide-adult"
                    />
                    <span className="switch-slider"></span>
                  </label>
                </div>
              )}

              {/* Cache clear option */}
              <div className="setting-item">
                <div className="setting-info">
                  <h3>Clear Local Data</h3>
                  <p>Delete recent searches, saved library items, and playback progress logs.</p>
                </div>
                <button className="danger-btn" onClick={clearHistory} id="btn-clear-history">
                   Clear Logs
                </button>
              </div>

              {/* Cloud Sync option */}
              <div className="setting-item">
                <div className="setting-info">
                  <h3>Premiumize Cloud Sync</h3>
                  <p>Sync libraries and playback checkpoints to your cloud storage. {lastSynced ? `Last synced: ${lastSynced.toLocaleTimeString()}` : 'Not synced yet.'}</p>
                </div>
                <button 
                  className={`action-btn ${isSyncing ? 'loading' : ''}`} 
                  onClick={syncFromCloud} 
                  disabled={isSyncing}
                  id="btn-manual-sync"
                >
                  {isSyncing ? 'Syncing...': 'Sync Storage Now'}
                </button>
              </div>
            </div>
            
            {/* Privacy Shield Active note (Only visible if secretly unlocked and adult content is enabled) */}
            {!isKids && adultControlsUnlocked && !hideAdult && (
              <div className="settings-note">
                <span className="badge-shield"> Privacy Shield Active</span>
                <p>Adult content searches, library additions, and playback progress metrics are strictly excluded from history lists and local browser storage logs, regardless of settings.</p>
              </div>
            )}
          </section>
  );
}
