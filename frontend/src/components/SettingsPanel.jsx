import { useState, useEffect } from 'react';
import { useAppState } from '../state/AppStateProvider';
import Icon from '../Icon';

// Settings control panel: BYOK API keys, Premiumize.ai config, Jackett + Usenet
// indexers, the (unlockable) adult filter, clear-local-data, and cloud sync. Reads
// its state from context; receives the four action handlers as props.
export default function SettingsPanel({ handleToggleShowKeys, fetchAiModels, clearHistory, syncFromCloud, testSabConnection }) {
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
    userSabUrl, setUserSabUrl,
    userSabKey, setUserSabKey,
    userSabCategory, setUserSabCategory,
    userSabCompleteDir, setUserSabCompleteDir,
    usenetHandler, setUsenetHandler,
    showSabnzbdGuide, setShowSabnzbdGuide,
    sabConnected, setSabConnected,
    gdriveAutoArchive, setGdriveAutoArchive,
    syncProvider, setSyncProvider,
    gdriveClientId, setGdriveClientId,
    gdriveClientSecret, setGdriveClientSecret,
    showGdriveGuide, setShowGdriveGuide,
    gdriveConnected, setGdriveConnected,
    gdriveFolderName, setGdriveFolderName,
    gdriveFiles, setGdriveFiles,
    triggerToast,
  } = useAppState();

  const [verifyingGdrive, setVerifyingGdrive] = useState(false);
  const [scanningGdrive, setScanningGdrive] = useState(false);

  const fetchGdriveStatus = async () => {
    try {
      const res = await fetch('/api/gdrive/status');
      if (res.ok) {
        const data = await res.json();
        setGdriveConnected(data.connected);
        localStorage.setItem('premio_gdrive_connected', data.connected ? 'true' : 'false');
        if (data.connected) {
          if (data.clientId && !gdriveClientId) {
            setGdriveClientId(data.clientId);
            localStorage.setItem('premio_gdrive_client_id', data.clientId);
          }
          if (data.clientSecret && !gdriveClientSecret) {
            setGdriveClientSecret('••••••••••••••••');
            localStorage.setItem('premio_gdrive_client_secret', '••••••••••••••••');
          }
          if (data.folderName) {
            setGdriveFolderName(data.folderName);
            localStorage.setItem('premio_gdrive_folder_name', data.folderName);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch GDrive status:', err);
    }
  };

  const handleGdriveScan = async () => {
    try {
      setScanningGdrive(true);
      const res = await fetch('/api/gdrive/files');
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          setGdriveFiles(data.files || []);
          const n = data.files?.length || 0;
          triggerToast(`Re-scanned Google Drive: ${n} file${n === 1 ? '' : 's'} found across the Premio folder & all subfolders and re-linked.`, 'success');
        } else {
          throw new Error(data.error || 'Failed to list files');
        }
      } else {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
    } catch (err) {
      triggerToast(`Folder scan failed: ${err.message}`, 'error');
    } finally {
      setScanningGdrive(false);
    }
  };

  useEffect(() => {
    fetchGdriveStatus();
  }, []);

  useEffect(() => {
    const handleOAuthMessage = (event) => {
      if (event.data === 'gdrive-connected') {
        triggerToast('Google Drive connected successfully!', 'success');
        fetchGdriveStatus();
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  const handleGdriveConnect = async () => {
    if (!gdriveClientId.trim() || !gdriveClientSecret.trim()) {
      triggerToast('Please fill out both Google Client ID and Secret.', 'error');
      return;
    }

    try {
      setVerifyingGdrive(true);
      const configRes = await fetch('/api/gdrive/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: gdriveClientId.trim(), clientSecret: gdriveClientSecret.trim() })
      });

      if (!configRes.ok) {
        throw new Error(`Failed to save config: HTTP ${configRes.status}`);
      }

      const authRes = await fetch('/api/gdrive/auth-url');
      if (!authRes.ok) {
        const data = await authRes.json();
        throw new Error(data.error || 'Failed to fetch Auth URL');
      }

      const authData = await authRes.json();
      
      const width = 600;
      const height = 650;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      window.open(
        authData.authUrl,
        'Connect Google Drive',
        `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes`
      );

    } catch (err) {
      triggerToast(`Connection failed: ${err.message}`, 'error');
    } finally {
      setVerifyingGdrive(false);
    }
  };

  const handleGdriveDisconnect = async () => {
    try {
      const res = await fetch('/api/gdrive/disconnect', { method: 'POST' });
      if (res.ok) {
        triggerToast('Google Drive disconnected successfully.', 'success');
        setGdriveConnected(false);
        localStorage.setItem('premio_gdrive_connected', 'false');
        setGdriveFiles([]);
      } else {
        throw new Error('Server returned error');
      }
    } catch (err) {
      triggerToast(`Disconnection failed: ${err.message}`, 'error');
    }
  };

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

              {/* Usenet Downloader Selection */}
              <div className="setting-item full-width-field" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                <div className="setting-info">
                  <h3>Usenet Downloader</h3>
                  <p>Choose whether to send Usenet NZB downloads to Premiumize Cloud or your self-hosted SABnzbd instance.</p>
                </div>
                <div style={{ display: 'flex', gap: '20px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input 
                      type="radio" 
                      name="usenetHandler" 
                      value="premiumize"
                      checked={usenetHandler === 'premiumize'}
                      onChange={() => {
                        setUsenetHandler('premiumize');
                        localStorage.setItem('premio_usenet_handler', 'premiumize');
                      }}
                    />
                    <span>Premiumize Cloud (Uses PM Points)</span>
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input 
                      type="radio" 
                      name="usenetHandler" 
                      value="sabnzbd"
                      checked={usenetHandler === 'sabnzbd'}
                      onChange={() => {
                        setUsenetHandler('sabnzbd');
                        localStorage.setItem('premio_usenet_handler', 'sabnzbd');
                      }}
                    />
                    <span>SABnzbd (Self-Hosted, No PM Points)</span>
                  </label>
                </div>
              </div>

              {/* SABnzbd Configuration */}
              <div className="setting-item full-width-field" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                <div className="setting-info">
                  <h3>SABnzbd Integration</h3>
                  <p>Configure details for your local or LAN SABnzbd service to download Usenet files.</p>
                </div>
                <div className="settings-multi-inputs" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', width: '100%' }}>
                  <input 
                    type="text" 
                    value={userSabUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setUserSabUrl(val);
                      localStorage.setItem('premio_user_sab_url', val);
                    }}
                    placeholder="SABnzbd URL (e.g. http://localhost:8080)"
                    className="settings-text-input small"
                  />
                  <input 
                    type={showKeys ? 'text' : 'password'}
                    value={userSabKey}
                    onChange={(e) => {
                      const val = e.target.value;
                      setUserSabKey(val);
                      localStorage.setItem('premio_user_sab_key', val);
                    }}
                    placeholder="SABnzbd API Key"
                    className="settings-text-input small"
                  />
                  <input 
                    type="text" 
                    value={userSabCategory}
                    onChange={(e) => {
                      const val = e.target.value;
                      setUserSabCategory(val);
                      localStorage.setItem('premio_user_sab_category', val);
                    }}
                    placeholder="Category (e.g. premio - optional)"
                    className="settings-text-input small"
                  />
                  <input 
                    type="text" 
                    value={userSabCompleteDir}
                    onChange={(e) => {
                      const val = e.target.value;
                      setUserSabCompleteDir(val);
                      localStorage.setItem('premio_user_sab_complete_dir', val);
                    }}
                    placeholder="Completed Folder Path (optional)"
                    className="settings-text-input small"
                  />
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px', alignItems: 'center' }}>
                  <button 
                    type="button" 
                    className="action-btn"
                    style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '6px' }}
                    onClick={testSabConnection}
                    disabled={sabConnected === 'testing'}
                  >
                    {sabConnected === 'testing' ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button 
                    type="button"
                    className="help-toggle-btn"
                    onClick={() => setShowSabnzbdGuide(!showSabnzbdGuide)}
                    style={{ fontSize: '0.75rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {showSabnzbdGuide ? 'Hide Setup Guide' : 'How do I set up SABnzbd?'}
                  </button>
                  {sabConnected === 'success' && <span style={{ color: '#4caf50', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>● Connected successfully!</span>}
                  {sabConnected === 'error' && <span style={{ color: '#f44336', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>● Connection failed</span>}
                </div>
                {showSabnzbdGuide && (
                  <div className="onboarding-guide-box glass-panel fade-in" style={{ marginTop: '10px', padding: '12px', fontSize: '0.8rem', color: 'var(--text-muted)', borderLeft: '3px solid var(--color-primary)', width: '100%' }}>
                    <p style={{ margin: '0 0 6px 0', fontWeight: 'bold', color: 'var(--text-primary)'}}> Quick Start Guide: Setting Up SABnzbd</p>
                    <ol style={{ margin: '0', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <li>Download & install SABnzbd for your operating system (from the <a href="https://sabnzbd.org/downloads" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>Official Downloads Page</a>).</li>
                      <li>Start SABnzbd (it runs in the background and opens its web interface, usually at <a href="http://localhost:8080" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>http://localhost:8080</a>).</li>
                      <li>Configure your Usenet server (e.g. <b>EasyUseNet</b>) details (host, username, password) inside SABnzbd under <b>Config &gt; Servers</b>.</li>
                      <li>Copy the <b>API Key</b> from <b>Config &gt; General</b> (under the API key section).</li>
                      <li>Paste the SABnzbd URL and API Key above, specify an optional category/complete directory, and test the connection!</li>
                    </ol>
                  </div>
                )}
              </div>

              {/* Google Drive Configuration */}
              <div className="setting-item full-width-field" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                <div className="setting-info">
                  <h3>Google Drive Integration</h3>
                  <p>Connect your Google Drive to enable zero-cost cloud syncing and upload completed local Usenet downloads to the cloud.</p>
                </div>
                
                <div className="settings-multi-inputs" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '8px', width: '100%', marginTop: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.8rem', opacity: 0.7 }}>Google Client ID:</label>
                    <input 
                      type="text" 
                      value={gdriveClientId}
                      onChange={(e) => {
                        setGdriveClientId(e.target.value);
                        localStorage.setItem('premio_gdrive_client_id', e.target.value);
                      }}
                      placeholder="Enter Google OAuth Client ID..."
                      className="settings-text-input small"
                      disabled={gdriveConnected}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.8rem', opacity: 0.7 }}>Google Client Secret:</label>
                    <input 
                      type={showKeys ? 'text' : 'password'}
                      value={gdriveClientSecret}
                      onChange={(e) => {
                        setGdriveClientSecret(e.target.value);
                        localStorage.setItem('premio_gdrive_client_secret', e.target.value);
                      }}
                      placeholder="Enter Google OAuth Client Secret..."
                      className="settings-text-input small"
                      disabled={gdriveConnected}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {gdriveConnected ? (
                    <button 
                      type="button" 
                      className="danger-btn"
                      style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '6px' }}
                      onClick={handleGdriveDisconnect}
                    >
                      Disconnect Google Drive
                    </button>
                  ) : (
                    <button 
                      type="button" 
                      className="action-btn"
                      style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '6px' }}
                      onClick={handleGdriveConnect}
                      disabled={verifyingGdrive}
                    >
                      {verifyingGdrive ? 'Connecting...' : 'Connect Google Drive'}
                    </button>
                  )}
                  
                  <button 
                    type="button"
                    className="help-toggle-btn"
                    onClick={() => setShowGdriveGuide(!showGdriveGuide)}
                    style={{ fontSize: '0.75rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {showGdriveGuide ? 'Hide Setup Guide' : 'How do I generate Client ID & Secret?'}
                  </button>

                  {gdriveConnected ? (
                    <span style={{ color: '#4caf50', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      ● Connected to Google Drive!
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      ● Not connected
                    </span>
                  )}
                </div>

                {showGdriveGuide && (
                  <div className="onboarding-guide-box glass-panel fade-in" style={{ marginTop: '10px', padding: '12px', fontSize: '0.8rem', color: 'var(--text-muted)', borderLeft: '3px solid var(--color-primary)', width: '100%' }}>
                    <p style={{ margin: '0 0 6px 0', fontWeight: 'bold', color: 'var(--text-primary)'}}> Quick Start Guide: Generating Google Drive Credentials</p>
                    <ol style={{ margin: '0', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <li>Go to the <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>Google Cloud Console</a> and create a new project.</li>
                      <li>Go to <b>API &amp; Services &gt; Library</b>, search for <b>Google Drive API</b>, and click <b>Enable</b>.</li>
                      <li>Go to <b>OAuth consent screen</b>, select <b>External</b>, enter any App Name/email, and save. Under <b>Scopes</b>, add `.../auth/drive.file`. Add your Google email as a **Test User** (since your app will be in testing mode).</li>
                      <li>Go to <b>Credentials &gt; Create Credentials &gt; OAuth client ID</b>.</li>
                      <li>Select Application type: <b>Web application</b>.</li>
                      <li>Under <b>Authorized redirect URIs</b>, click Add URI and enter exactly: <code style={{ color: 'var(--text-primary)', background: 'rgba(255,255,255,0.05)', padding: '2px 4px', borderRadius: '4px' }}>http://localhost:3001/api/gdrive/callback</code>.</li>
                      <li>Click <b>Create</b>, copy your <b>Client ID</b> and <b>Client Secret</b>, paste them above, and click Connect!</li>
                    </ol>
                  </div>
                )}

                {gdriveConnected && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px', background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '6px', border: '1px solid var(--glass-border)', width: '100%' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Google Drive Features:</span>

                    {/* Sync provider selector — choose where profile/library/continue-watching
                        data is stored for cross-device sync. Premiumize is disabled until a PM
                        key is set. When only one provider is available the app uses it anyway. */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ fontSize: '0.85rem' }}>Sync profile data via:</span>
                      <div style={{ display: 'inline-flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="action-btn"
                          style={{ fontSize: '0.78rem', padding: '5px 12px', borderRadius: '6px', opacity: syncProvider === 'gdrive' ? 1 : 0.55 }}
                          onClick={() => {
                            setSyncProvider('gdrive');
                            localStorage.setItem('premio_sync_provider', 'gdrive');
                            triggerToast('Profile data now syncs via Google Drive.', 'info');
                          }}
                        >
                          {syncProvider === 'gdrive' ? '● ' : ''}Google Drive
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          disabled={!userPmKey}
                          title={!userPmKey ? 'Add a Premiumize API key in Settings to use it for sync' : ''}
                          style={{ fontSize: '0.78rem', padding: '5px 12px', borderRadius: '6px', opacity: syncProvider === 'premiumize' && userPmKey ? 1 : 0.55, cursor: userPmKey ? 'pointer' : 'not-allowed' }}
                          onClick={() => {
                            if (!userPmKey) return;
                            setSyncProvider('premiumize');
                            localStorage.setItem('premio_sync_provider', 'premiumize');
                            triggerToast('Profile data now syncs via Premiumize.', 'info');
                          }}
                        >
                          {syncProvider === 'premiumize' ? '● ' : ''}Premiumize
                        </button>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {!userPmKey
                          ? 'Syncing to Google Drive. Add a Premiumize key to enable it as an alternative for cross-device sync.'
                          : `Cross-device sync uses ${syncProvider === 'premiumize' ? 'Premiumize' : 'Google Drive'}. Switching leaves the other provider untouched.`}
                      </span>
                    </div>

                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={gdriveAutoArchive}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setGdriveAutoArchive(val);
                          localStorage.setItem('premio_gdrive_auto_archive', val);
                          triggerToast(val ? 'Auto-Archive to Google Drive enabled!' : 'Auto-Archive disabled.', 'info');
                        }}
                      />
                      <span>Auto-Archive Completed Usenet Downloads</span>
                    </label>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--glass-border)', paddingTop: '10px', marginTop: '4px', width: '100%' }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexGrow: 1, minWidth: '200px' }}>
                          <label style={{ fontSize: '0.8rem', opacity: 0.7 }}>Target Upload Folder Name:</label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input 
                              type="text" 
                              value={gdriveFolderName}
                              onChange={(e) => {
                                setGdriveFolderName(e.target.value);
                                localStorage.setItem('premio_gdrive_folder_name', e.target.value);
                              }}
                              placeholder="e.g. Premio..."
                              className="settings-text-input small"
                              style={{ flexGrow: 1, height: '28px', fontSize: '0.8rem' }}
                            />
                            <button 
                              type="button" 
                              className="action-btn"
                              style={{ fontSize: '0.75rem', padding: '4px 12px', height: '28px', borderRadius: '4px', whiteSpace: 'nowrap' }}
                              onClick={async () => {
                                if (!gdriveFolderName.trim()) {
                                  triggerToast('Folder name cannot be empty.', 'error');
                                  return;
                                }
                                try {
                                  const res = await fetch('/api/gdrive/folder', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ folderName: gdriveFolderName.trim() })
                                  });
                                  if (res.ok) {
                                    triggerToast(`Target folder updated to "${gdriveFolderName.trim()}"!`, 'success');
                                  } else {
                                    const d = await res.json();
                                    throw new Error(d.error || 'Server error');
                                  }
                                } catch (err) {
                                  triggerToast(`Failed to update folder: ${err.message}`, 'error');
                                }
                              }}
                            >
                              Save Folder
                            </button>
                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignSelf: 'flex-end' }}>
                          <button 
                            type="button" 
                            className="action-btn subtle"
                            style={{ 
                              fontSize: '0.75rem', 
                              padding: '4px 12px', 
                              height: '28px', 
                              borderRadius: '4px', 
                              whiteSpace: 'nowrap', 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '6px',
                              background: 'rgba(33, 150, 243, 0.15)',
                              color: '#2196f3',
                              borderColor: 'rgba(33, 150, 243, 0.3)'
                            }}
                            onClick={handleGdriveScan}
                            disabled={scanningGdrive}
                          >
                            {scanningGdrive ? (
                              <>
                                <span className="spinner-micro white small" style={{ borderLeftColor: '#2196f3' }}></span> Scanning...
                              </>
                            ) : (
                              <>
                                <Icon name="search" size={12} /> Scan Google Drive
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                      {gdriveFiles.length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          📁 Found {gdriveFiles.length} file{gdriveFiles.length === 1 ? '' : 's'} in target folder.
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
