import { useState, useEffect } from 'react';

// Owns the BYOK API-key state (Premiumize, TMDb, OMDb, OpenSubtitles, SubDL,
// Jackett URL/key, Usenet indexers), the key reveal / PIN-gate UI flags, the
// "add indexer" form fields, the legal-disclaimer + onboarding flags, and the
// onboarding key-test status. Also owns the first-run onboarding trigger effect.
//
// Keys are persisted inline by the Settings onChange handlers (setItem + setter),
// so there are no key-persist effects to own here.
export function useSettingsState() {
  const [showKeys, setShowKeys] = useState(false);
  const [showKeysPinPrompt, setShowKeysPinPrompt] = useState(false);
  const [revealPinInput, setRevealPinInput] = useState('');
  const [revealPinError, setRevealPinError] = useState(false);

  const [userPmKey, setUserPmKey] = useState(() => localStorage.getItem('premio_user_pm_key') || '');
  const [userTmdbKey, setUserTmdbKey] = useState(() => localStorage.getItem('premio_user_tmdb_key') || '');
  const [userOmdbKey, setUserOmdbKey] = useState(() => localStorage.getItem('premio_user_omdb_key') || '');
  const [userOpenSubsKey, setUserOpenSubsKey] = useState(() => localStorage.getItem('premio_user_opensubs_key') || '');
  const [userSubdlKey, setUserSubdlKey] = useState(() => localStorage.getItem('premio_user_subdl_key') || '');
  const [userJackettUrl, setUserJackettUrl] = useState(() => localStorage.getItem('premio_user_jackett_url') || '');
  const [userJackettKey, setUserJackettKey] = useState(() => localStorage.getItem('premio_user_jackett_key') || '');
  const [userIndexers, setUserIndexers] = useState(() => {
    const saved = localStorage.getItem('premio_user_usenet_indexers');
    return saved ? JSON.parse(saved) : [];
  });

  const [showJackettGuide, setShowJackettGuide] = useState(false);
  const [newIdxName, setNewIdxName] = useState('');
  const [newIdxUrl, setNewIdxUrl] = useState('');
  const [newIdxKey, setNewIdxKey] = useState('');
  const [showLegalDisclaimer, setShowLegalDisclaimer] = useState(() => {
    return localStorage.getItem('premio_legal_acknowledged') !== 'true';
  });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  // Onboarding "test key" results: { pm|jackett|tmdb: { state: 'testing'|'ok'|'fail', msg } }
  const [keyTestStatus, setKeyTestStatus] = useState({});

  const [userSabUrl, setUserSabUrl] = useState(() => localStorage.getItem('premio_user_sab_url') || '');
  const [userSabKey, setUserSabKey] = useState(() => localStorage.getItem('premio_user_sab_key') || '');
  const [userSabCategory, setUserSabCategory] = useState(() => localStorage.getItem('premio_user_sab_category') || '');
  const [userSabCompleteDir, setUserSabCompleteDir] = useState(() => localStorage.getItem('premio_user_sab_complete_dir') || '');
  const [usenetHandler, setUsenetHandler] = useState(() => localStorage.getItem('premio_usenet_handler') || 'premiumize');
  const [showSabnzbdGuide, setShowSabnzbdGuide] = useState(false);
  const [gdriveAutoArchive, setGdriveAutoArchive] = useState(() => localStorage.getItem('premio_gdrive_auto_archive') === 'true');
  const [gdriveSyncEnabled, setGdriveSyncEnabled] = useState(() => localStorage.getItem('premio_gdrive_sync_enabled') === 'true');
  const [gdriveClientId, setGdriveClientId] = useState(() => localStorage.getItem('premio_gdrive_client_id') || '');
  const [gdriveClientSecret, setGdriveClientSecret] = useState(() => localStorage.getItem('premio_gdrive_client_secret') || '');
  const [showGdriveGuide, setShowGdriveGuide] = useState(false);
  const [gdriveConnected, setGdriveConnected] = useState(false);
  const [gdriveFolderName, setGdriveFolderName] = useState(() => localStorage.getItem('premio_gdrive_folder_name') || 'Premio');
  const [gdriveFiles, setGdriveFiles] = useState([]);

  // First-run guidance for the bring-your-own-key model: once the legal notice is
  // dismissed, if no Premiumize key is set and onboarding hasn't been completed,
  // open the setup wizard so new users are guided to add their key instead of
  // hitting silent failures.
  useEffect(() => {
    if (!showLegalDisclaimer && !userPmKey && localStorage.getItem('premio_onboarding_completed') !== 'true') {
      setShowOnboarding(true);
      setOnboardingStep(1);
    }
  }, [showLegalDisclaimer]);

  return {
    showKeys, setShowKeys,
    showKeysPinPrompt, setShowKeysPinPrompt,
    revealPinInput, setRevealPinInput,
    revealPinError, setRevealPinError,
    userPmKey, setUserPmKey,
    userTmdbKey, setUserTmdbKey,
    userOmdbKey, setUserOmdbKey,
    userOpenSubsKey, setUserOpenSubsKey,
    userSubdlKey, setUserSubdlKey,
    userJackettUrl, setUserJackettUrl,
    userJackettKey, setUserJackettKey,
    userIndexers, setUserIndexers,
    showJackettGuide, setShowJackettGuide,
    newIdxName, setNewIdxName,
    newIdxUrl, setNewIdxUrl,
    newIdxKey, setNewIdxKey,
    showLegalDisclaimer, setShowLegalDisclaimer,
    showOnboarding, setShowOnboarding,
    onboardingStep, setOnboardingStep,
    keyTestStatus, setKeyTestStatus,
    userSabUrl, setUserSabUrl,
    userSabKey, setUserSabKey,
    userSabCategory, setUserSabCategory,
    userSabCompleteDir, setUserSabCompleteDir,
    usenetHandler, setUsenetHandler,
    showSabnzbdGuide, setShowSabnzbdGuide,
    gdriveAutoArchive, setGdriveAutoArchive,
    gdriveSyncEnabled, setGdriveSyncEnabled,
    gdriveClientId, setGdriveClientId,
    gdriveClientSecret, setGdriveClientSecret,
    showGdriveGuide, setShowGdriveGuide,
    gdriveConnected, setGdriveConnected,
    gdriveFolderName, setGdriveFolderName,
    gdriveFiles, setGdriveFiles,
  };
}
