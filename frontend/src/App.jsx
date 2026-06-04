import { useState, useEffect, useRef, Fragment } from 'react';

// Configuration constants
const PM_SIGNUP_URL = "https://www.premiumize.me";

// Category Definitions
const CATEGORIES = ['Movies', 'TV', 'Music', 'Audiobooks', 'Ebooks', 'Software', 'VST', 'Adult', 'Other', 'Retro Games'];

// Formatter: Convert bytes to readable sizes
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper: Strip domain/host and query parameters from CDN URLs to make them edge-server independent
// Helper: Strip domain/host, dynamic worker subdomains, and temporary IP/token routes from PM CDN URLs
function cleanUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    // Decode first to ensure we compare standard decoded characters (space instead of %20)
    const decoded = decodeURIComponent(url);
    const parsed = new URL(decoded);
    let pathname = parsed.pathname;
    
    // Premiumize directdl links have the format: /dl/IP_OR_GEO/TOKEN/Path/To/File
    // Stripping the first 3 segments makes the clean path edge-agnostic and token-independent
    if (pathname.startsWith('/dl/')) {
      const parts = pathname.split('/');
      if (parts.length > 4) {
        return '/' + parts.slice(4).join('/');
      }
    }
    return pathname;
  } catch (e) {
    const decoded = decodeURIComponent(url);
    const parts = decoded.split('?')[0].split('/');
    return parts.length > 3 ? '/' + parts.slice(3).join('/') : decoded;
  }
}

// Formatter: Parse release quality and specs from title
function extractQuality(title) {
  if (!title || typeof title !== 'string') return [];
  const tags = [];
  const lowercaseTitle = title.toLowerCase();

  // Resolution tags
  if (/\b(4k|2160p|uhd)\b/i.test(lowercaseTitle)) {
    tags.push({ text: '4K 2160p', type: 'ultra' });
  } else if (/\b(1080p|fhd)\b/i.test(lowercaseTitle)) {
    tags.push({ text: '1080p', type: 'hd' });
  } else if (/\b(720p|hd)\b/i.test(lowercaseTitle)) {
    tags.push({ text: '720p', type: 'sd' });
  }

  // Source tags
  if (/\b(bluray|blu-ray|bdrip|brrip)\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'BluRay', type: 'source' });
  } else if (/\b(web-dl|webdl|webrip|web\.dl|web)\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'WEB-DL', type: 'source' });
  } else if (/\b(hdtv|dsr|pdtv)\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'HDTV', type: 'source' });
  }

  // Encoding & HDR tags
  if (/\bhdr\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'HDR', type: 'extra' });
  }
  if (/\b(hevc|x265|h265)\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'x265', type: 'codec' });
  } else if (/\b(x264|h264)\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'x264', type: 'codec' });
  }

  // Audio / Document tags
  if (/\bflac\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'FLAC', type: 'audio' });
  } else if (/\bmp3\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'MP3', type: 'audio' });
  }

  if (/\bepub\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'EPUB', type: 'doc' });
  } else if (/\bpdf\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'PDF', type: 'doc' });
  }

  return tags;
}

// Client-side SRT to WebVTT converter
const convertSrtToVtt = (srtText) => {
  let vttText = 'WEBVTT\n\n';
  const cleanSrt = srtText.replace(/\r/g, '');
  const blocks = cleanSrt.split(/\n\n+/);
  
  blocks.forEach(block => {
    const lines = block.split('\n').filter(Boolean);
    if (lines.length >= 2) {
      const timingLineIdx = lines.findIndex(l => l.includes('-->'));
      if (timingLineIdx !== -1) {
        let timing = lines[timingLineIdx];
        timing = timing.replace(/,/g, '.'); // Convert SRT timing commas to VTT periods
        const dialogue = lines.slice(timingLineIdx + 1).join('\n');
        vttText += `${timing}\n${dialogue}\n\n`;
      }
    }
  });
  
  return vttText;
};

// TV Show Episode matcher: Extracts episode indicators (e.g. S01E05, 1x05, E05, Ep 5, or standalone index) robustly
function matchEpisode(name) {
  if (!name || typeof name !== 'string') return '';
  const nameLower = name.toLowerCase();
  
  // 1. Match standard S01E05 / S1E5 / s01e05 style
  const sXexMatch = nameLower.match(/\bs\d+e\d+\b/);
  if (sXexMatch) return sXexMatch[0];
  
  // 2. Match 1x05 style
  const crossMatch = nameLower.match(/\b\d+x\d+\b/);
  if (crossMatch) return crossMatch[0];
  
  // 3. Match E05 / Ep05 / Episode 05 style
  const epMatch = nameLower.match(/\b(?:ep|episode|e)\s*(\d+)\b/);
  if (epMatch) return 'e' + parseInt(epMatch[1], 10);
  
  // 4. Match standalone two-digit episode number like " - 05 - " or " 05 "
  const standaloneMatch = nameLower.match(/(?:\s+|-)\s*(\d{2})\s*(?:\s+|-|\.)/);
  if (standaloneMatch) return 'e' + parseInt(standaloneMatch[1], 10);
  
  // 5. Fallback: match first sequence of digits that isn't a resolution (e.g. 2160, 1080, 720, 480)
  const allNumbers = nameLower.match(/\b\d+\b/g);
  if (allNumbers) {
    const nonResNumber = allNumbers.find(num => !['2160', '1080', '720', '480'].includes(num));
    if (nonResNumber) return 'e' + parseInt(nonResNumber, 10);
  }
  
  return '';
}

export default function App() {
  // --- UI Layout Navigation state ---
  const [activeTab, setActiveTab] = useState('search'); // Options: search, library, progress, cloud
  const [librarySubTab, setLibrarySubTab] = useState('All');
  const [continueSubTab, setContinueSubTab] = useState('All');

  // --- Cloud Storage Manager States ---
  const [cloudContents, setCloudContents] = useState([]);
  const [cloudFolderId, setCloudFolderId] = useState(null);
  const [cloudFolderName, setCloudFolderName] = useState('Root Folder');
  const [cloudBreadcrumbs, setCloudBreadcrumbs] = useState([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState(null);
  const [cloudRenameId, setCloudRenameId] = useState(null);
  const [cloudRenameName, setCloudRenameName] = useState('');
  const [cloudRenameType, setCloudRenameType] = useState('folder');
  const [cloudFilter, setCloudFilter] = useState('');

  // --- Custom UI Themes, Storage Quota & Active Downloads States ---
  const [selectedTheme, setSelectedTheme] = useState(() => {
    return localStorage.getItem('premium_search_theme') || 'midnight-nebula';
  });
  const [accountInfo, setAccountInfo] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [transfersLoading, setTransfersLoading] = useState(false);

  // --- UI & Application State ---
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Movies');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [activeDownloadId, setActiveDownloadId] = useState(null);
  const [searchMode, setSearchMode] = useState('torrent'); // 'torrent' or 'usenet'
  const [hideUsenetWarning, setHideUsenetWarning] = useState(() => {
    return localStorage.getItem('premio_hide_usenet_warning') === 'true';
  });
  const [isDragging, setIsDragging] = useState(false);
  const [magnetInput, setMagnetInput] = useState('');
  
  // --- Settings States ---
  const [showSettings, setShowSettings] = useState(false);
  const [hideAdult, setHideAdult] = useState(() => {
    const saved = localStorage.getItem('premium_search_hide_adult');
    return saved !== null ? JSON.parse(saved) : true; // Default to hiding adult for safety
  });
  const [userPmKey, setUserPmKey] = useState(() => {
    return localStorage.getItem('premio_user_pm_key') || '';
  });
  const [userTmdbKey, setUserTmdbKey] = useState(() => {
    return localStorage.getItem('premio_user_tmdb_key') || '';
  });
  const [userJackettUrl, setUserJackettUrl] = useState(() => {
    return localStorage.getItem('premio_user_jackett_url') || '';
  });
  const [userJackettKey, setUserJackettKey] = useState(() => {
    return localStorage.getItem('premio_user_jackett_key') || '';
  });
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
  const [cloudPlaylistLoading, setCloudPlaylistLoading] = useState(false);
  const [cloudPlaylistStatus, setCloudPlaylistStatus] = useState('');
  const [showPlaylistChoiceModal, setShowPlaylistChoiceModal] = useState(false);
  const [pendingPlaylistFiles, setPendingPlaylistFiles] = useState([]);
  const [pendingPlaylistName, setPendingPlaylistName] = useState('');
  const [hasAviOrMkvInPending, setHasAviOrMkvInPending] = useState(false);

  // --- Secret Developer Options states ---
  const logoClicksRef = useRef([]);
  const [adultControlsUnlocked, setAdultControlsUnlocked] = useState(false);

  // --- Dynamic Filters States ---
  const [showFilters, setShowFilters] = useState(false);
  const [filterQuality, setFilterQuality] = useState('All');
  const [filterMaxSize, setFilterMaxSize] = useState(100); // Max size in GB, 100 = Unlimited
  const [filterMinSeeders, setFilterMinSeeders] = useState(0);
  const [excludeKeywords, setExcludeKeywords] = useState('');
  const [sortBy, setSortBy] = useState('cached-seeders'); // Options: cached-seeders, seeders, size-desc, size-asc, date

  // --- Search History & Download Log States (Strict Privacy Filtered) ---
  const [recentSearches, setRecentSearches] = useState(() => {
    const saved = localStorage.getItem('premium_search_recent_queries');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [recentDownloads, setRecentDownloads] = useState(() => {
    const saved = localStorage.getItem('premium_search_downloads');
    return saved ? JSON.parse(saved) : [];
  });

  // --- My Library bookshelf State (Strict Privacy Filtered) ---
  const [libraryList, setLibraryList] = useState(() => {
    const saved = localStorage.getItem('premium_search_library');
    return saved ? JSON.parse(saved) : [];
  });

  // --- Continue Watching log State (Strict Privacy Filtered) ---
  const [continueWatchingList, setContinueWatchingList] = useState(() => {
    const saved = localStorage.getItem('premium_search_continue_watching');
    return saved ? JSON.parse(saved) : [];
  });

  // --- Custom Playlists States ---
  const [playlists, setPlaylists] = useState(() => {
    const saved = localStorage.getItem('premium_search_playlists');
    return saved ? JSON.parse(saved) : [];
  });
  const [playlistSelectionTrack, setPlaylistSelectionTrack] = useState(null);

  // --- Cloud Sync States & Actions ---
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);

  // --- Stateless Custom Fetch Interceptor ---
  const fetchWithCredentials = async (url, options = {}) => {
    if (url.startsWith('/api')) {
      const customHeaders = {
        'X-Premiumize-Key': userPmKey || '',
        'X-TMDb-Key': userTmdbKey || '',
        'X-Jackett-Url': userJackettUrl || '',
        'X-Jackett-Key': userJackettKey || '',
        'X-Usenet-Indexers': JSON.stringify(userIndexers || [])
      };
      
      options.headers = {
        ...(options.headers || {}),
        ...customHeaders
      };
    }
    return fetch(url, options);
  };

  const syncToCloud = async (currentLib = libraryList, currentProgress = continueWatchingList) => {
    try {
      const res = await fetchWithCredentials('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryList: currentLib, continueWatchingList: currentProgress })
      });
      if (res.ok) {
        setLastSynced(new Date());
      }
    } catch (err) {
      console.error('Cloud sync upload failed:', err.message);
    }
  };

  const syncFromCloud = async () => {
    setIsSyncing(true);
    try {
      const res = await fetchWithCredentials('/api/sync');
      if (!res.ok) throw new Error('Could not contact sync endpoint.');
      const data = await res.json();
      
      if (data.success) {
        if (data.synced && data.data) {
          const cloudLib = data.data.libraryList || [];
          const cloudProgress = data.data.continueWatchingList || [];
          
          // Overwrite local state with cloud master lists for absolute cross-device sync
          const mergedLib = cloudLib;
          const mergedProgress = cloudProgress;

          const slicedProgress = mergedProgress.slice(0, 12); // Sync up to 12 watch progress items

          // Update local states
          setLibraryList(mergedLib);
          localStorage.setItem('premium_search_library', JSON.stringify(mergedLib));

          setContinueWatchingList(slicedProgress);
          localStorage.setItem('premium_search_continue_watching', JSON.stringify(slicedProgress));

          setLastSynced(new Date());
          triggerToast('☁️ Cloud storage synchronized!', 'success');
        } else {
          // If folder/file doesn't exist yet, upload current local storage to initialize
          if (libraryList.length > 0 || continueWatchingList.length > 0) {
            console.log('ℹ️ Syncing local storage up to cloud...');
            await syncToCloud(libraryList, continueWatchingList);
            triggerToast('☁️ Cloud sync backup created!', 'success');
          }
        }
      } else {
        console.warn('Sync notice:', data.error);
      }
    } catch (err) {
      console.error('Sync error:', err.message);
    } finally {
      setIsSyncing(false);
    }
  };


  // --- Account Quota & Active Downloads API Controllers ---

  // Fetch Storage Quota Info
  const fetchAccountQuota = async () => {
    try {
      const res = await fetchWithCredentials('/api/account/info');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === 'success') {
        setAccountInfo(data);
      }
    } catch (err) {
      console.error('❌ Failed to fetch storage quota:', err);
    }
  };

  // Fetch Active Queue Transfers
  const fetchActiveTransfers = async () => {
    try {
      const res = await fetchWithCredentials('/api/transfers');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === 'success') {
        setTransfers(data.transfers || []);
      }
    } catch (err) {
      console.error('❌ Failed to fetch active transfers:', err);
    } finally {
      setTransfersLoading(false);
    }
  };

  // Cancel / Delete Queue Transfer
  const cancelTransfer = async (transferId, name) => {
    try {
      const res = await fetchWithCredentials('/api/transfers/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transferId })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === 'success') {
        triggerToast(`Removed transfer: "${name.slice(0, 30)}..."`, 'success');
        fetchActiveTransfers();
        fetchAccountQuota();
      } else {
        throw new Error(data.message || 'Failed to cancel transfer');
      }
    } catch (err) {
      triggerToast(`Cancellation failed: ${err.message}`, 'error');
    }
  };


  // --- Premiumize Cloud Storage Manager Actions ---

  // 1. Fetch cloud folder contents
  const fetchCloudFolder = async (folderId = null) => {
    setCloudLoading(true);
    setCloudError(null);
    setCloudFilter(''); // Clear local search on folder navigation
    
    try {
      const url = folderId ? `/api/cloud/list?id=${encodeURIComponent(folderId)}` : '/api/cloud/list';
      const res = await fetchWithCredentials(url);
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned HTTP ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.status === 'success') {
        setCloudContents(data.content || []);
        setCloudFolderId(folderId);
        setCloudFolderName(data.name || (folderId ? 'Folder' : 'Root Cloud'));
        
        // Map breadcrumbs: if missing from API, we can build custom parent navigators from folder list
        const crumbs = data.breadcrumbs || [];
        setCloudBreadcrumbs(crumbs);
      } else {
        throw new Error(data.message || 'Failed to retrieve folder contents.');
      }
    } catch (err) {
      console.error('❌ Failed to fetch cloud folder:', err);
      setCloudError(err.message);
      triggerToast(`Cloud error: ${err.message}`, 'error');
    } finally {
      setCloudLoading(false);
    }
  };

  // 1.5. Recursively build folder playlist for "Play All"
  const buildFolderPlaylist = async (startFolderId, startFolderName) => {
    setCloudPlaylistLoading(true);
    setCloudPlaylistStatus(`Analyzing "${startFolderName}"...`);
    triggerToast(`🔄 Initializing Play All for "${startFolderName}"...`, 'info');
    
    try {
      const fetchedFiles = [];

      // Depth-first search (sequential subfolder recursion) to maintain perfect chronological order
      const scanFolder = async (folderId, folderName) => {
        setCloudPlaylistStatus(`Scanning: ${folderName}...`);
        
        const url = folderId ? `/api/cloud/list?id=${encodeURIComponent(folderId)}` : '/api/cloud/list';
        const res = await fetchWithCredentials(url);
        if (!res.ok) throw new Error(`Failed to read folder "${folderName}"`);
        
        const data = await res.json();
        if (data.status !== 'success') throw new Error(data.message || `Failed to list folder "${folderName}"`);
        
        const contents = data.content || [];
        
        // A. Filter and sort files in the current folder alphanumerically
        const currentFiles = contents
          .filter(item => item.type === 'file')
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
          
        const videos = currentFiles.filter(f => {
          const ext = f.name.split('.').pop().toLowerCase();
          return ['mkv', 'mp4', 'avi', 'mov', 'webm'].includes(ext);
        }).map(f => ({
          name: f.name,
          link: f.stream_link || f.link,
          size: f.size || 0,
          type: 'video',
          id: f.id
        }));
        
        fetchedFiles.push(...videos);
        
        // B. Filter and sort subfolders alphanumerically
        const subfolders = contents
          .filter(item => item.type === 'folder')
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
          
        // C. Process subfolders recursively
        for (const sub of subfolders) {
          await scanFolder(sub.id, sub.name);
        }
      };

      await scanFolder(startFolderId, startFolderName);

      if (fetchedFiles.length === 0) {
        triggerToast('⚠️ No streamable video files found in this folder or its subfolders.', 'warning');
        return;
      }

      setPendingPlaylistFiles(fetchedFiles);
      setPendingPlaylistName(startFolderName);
      const hasUnplayable = fetchedFiles.some(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        return ['avi', 'mkv', 'ts', 'divx', 'xvid'].includes(ext);
      });
      setHasAviOrMkvInPending(hasUnplayable);
      setShowPlaylistChoiceModal(true);
    } catch (err) {
      console.error('❌ Play All Failed:', err);
      triggerToast(`Failed to build playlist: ${err.message}`, 'error');
    } finally {
      setCloudPlaylistLoading(false);
      setCloudPlaylistStatus('');
    }
  };

  // Helper: Open browser streaming playlist
  const handleLaunchBrowserPlaylist = async (files, name) => {
    setShowPlaylistChoiceModal(false);
    setPlayerLoading(true);
    try {
      const virtualTorrent = {
        title: name,
        category: 'TV', // Set to 'TV' to activate sequential autoplay!
        isCloudFile: true,
        isCloudPlaylist: true,
        link: files[0].link,
        files: files
      };
      await startStreaming(virtualTorrent);
    } catch (e) {
      console.error(e);
      triggerToast('Failed to start browser streaming', 'error');
    } finally {
      setPlayerLoading(false);
    }
  };

  // Helper: Generate and download M3U playlist file for VLC / external players
  const downloadM3UPlaylist = (files, playlistName) => {
    setShowPlaylistChoiceModal(false);
    let m3uContent = '#EXTM3U\n';
    files.forEach(file => {
      m3uContent += `#EXTINF:-1,${file.name}\n${file.link}\n`;
    });
    
    const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${playlistName.replace(/[/\\?%*:|"<>\s]/g, '_')}_playlist.m3u`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    triggerToast('📥 M3U Playlist downloaded! Open it with VLC to play all.', 'success');
  };

  // 2. Rename item (File or Folder)
  const handleCloudRename = async (itemId, type, newName) => {
    if (!newName || !newName.trim()) {
      triggerToast('Name cannot be empty.', 'error');
      return;
    }
    
    try {
      const res = await fetchWithCredentials('/api/cloud/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, type, name: newName.trim() })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to rename item.');
      }
      
      const data = await res.json();
      
      if (data.status === 'success') {
        triggerToast(`Successfully renamed ${type}!`, 'success');
        setCloudRenameId(null);
        setCloudRenameName('');
        // Refresh active folder
        fetchCloudFolder(cloudFolderId);
      } else {
        throw new Error(data.message || 'Failed to rename.');
      }
    } catch (err) {
      console.error('❌ Cloud rename error:', err);
      triggerToast(err.message, 'error');
    }
  };

  // 3. Delete item (File or Folder)
  const handleCloudDelete = async (itemId, type, itemName) => {
    const doubleCheck = window.confirm(`Are you absolutely sure you want to permanently delete the ${type} "${itemName}"?`);
    if (!doubleCheck) return;
    
    try {
      const res = await fetchWithCredentials('/api/cloud/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, type })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete item.');
      }
      
      const data = await res.json();
      
      if (data.status === 'success') {
        triggerToast(`Successfully deleted "${itemName}" from Cloud!`, 'success');
        // Refresh active folder
        fetchCloudFolder(cloudFolderId);
      } else {
        throw new Error(data.message || 'Failed to delete.');
      }
    } catch (err) {
      console.error('❌ Cloud delete error:', err);
      triggerToast(err.message, 'error');
    }
  };

  // 4. Bookmark cloud folder/file to bookshelf library
  const bookmarkCloudItem = (item) => {
    // Check if already in library
    const exists = libraryList.some(lib => lib.id === item.id);
    if (exists) {
      triggerToast('This item is already bookmarked in your Library.', 'info');
      return;
    }

    // Determine category based on extension or folder
    let targetCat = 'Other';
    if (item.type === 'folder') {
      targetCat = 'Other';
    } else {
      const ext = item.name.split('.').pop().toLowerCase();
      if (['mkv', 'mp4', 'avi'].includes(ext)) targetCat = 'Movies';
      else if (['mp3', 'flac', 'wav', 'm4a', 'ogg', 'wma'].includes(ext)) targetCat = 'Music';
      else if (['m4b'].includes(ext)) targetCat = 'Audiobooks';
      else if (['epub', 'pdf'].includes(ext)) targetCat = 'Ebooks';
      else if (['nes', 'sfc', 'smc', 'md', 'gen', 'bin', 'gb', 'gbc', 'gba', 'a26', 'a78'].includes(ext)) targetCat = 'Retro Games';
      else if (ext === 'zip' && (item.name.toLowerCase().includes('rom') || item.name.toLowerCase().includes('game') || item.name.toLowerCase().includes('retro') || item.name.toLowerCase().includes('arcade') || item.name.toLowerCase().includes('atari') || item.name.toLowerCase().includes('nes') || item.name.toLowerCase().includes('snes') || item.name.toLowerCase().includes('sega'))) targetCat = 'Retro Games';
      else if (['exe', 'dmg', 'pkg', 'zip'].includes(ext)) targetCat = 'Software';
    }

    const bookmarkedItem = {
      id: item.id,
      title: item.name,
      size: item.size || 0,
      category: targetCat,
      torrentFile: item.link,
      magnet: item.link || item.stream_link,
      tracker: 'Personal Cloud Storage',
      publishDate: new Date().toISOString(),
      cached: true, // Personal cloud items are always cached by definition
      isCloudFile: true
    };

    const newLibrary = [bookmarkedItem, ...libraryList];
    setLibraryList(newLibrary);
    localStorage.setItem('premium_search_library', JSON.stringify(newLibrary));
    
    // Sync to cloud in the background
    syncToCloud(newLibrary, continueWatchingList);
    triggerToast(`"${item.name}" bookmarked directly to your library bookshelves!`, 'success');
  };

  // 5. Stream cloud media directly
  const handleCloudStream = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    
    // A. Video streaming
    if (['mkv', 'mp4', 'avi'].includes(ext)) {
      // Find any subtitle files in the current cloud contents to make them available in the player
      const subtitleFiles = cloudContents
        .filter(c => c.type === 'file' && ['srt', 'vtt', 'ass'].includes(c.name.split('.').pop().toLowerCase()))
        .map(c => ({
          name: c.name,
          link: c.link || c.stream_link,
          type: 'subtitle'
        }));
      
      const videoFile = {
        name: file.name,
        link: file.stream_link || file.link,
        size: file.size || 0,
        type: 'video'
      };

      startStreaming({
        title: file.name,
        link: file.stream_link || file.link,
        size: file.size || 0,
        category: 'Movies',
        isCloudFile: true,
        files: [videoFile, ...subtitleFiles]
      });
    } 
    // B. Audio/Music streaming
    else if (['mp3', 'flac', 'wav', 'm4a', 'ogg', 'wma', 'm4b'].includes(ext)) {
      // Find all audio files in the current cloud contents to build a local playlist
      const cloudAudioFiles = cloudContents
        .filter(c => c.type === 'file' && ['mp3', 'flac', 'wav', 'm4a', 'ogg', 'wma', 'm4b'].includes(c.name.split('.').pop().toLowerCase()))
        .map(c => ({
          name: c.name,
          path: c.name,
          link: c.link || c.stream_link,
          size: c.size || 0
        }));

      // Find selected file's index
      const activeIdx = cloudAudioFiles.findIndex(c => c.name === file.name);
      
      startAudioPlayer({
        title: file.name,
        link: file.link || file.stream_link,
        category: ext === 'm4b' ? 'Audiobooks' : 'Music',
        isCloudFile: true,
        files: cloudAudioFiles,
        activeIndex: activeIdx !== -1 ? activeIdx : 0
      });
    } 
    // C. Ebook reading
    else if (['epub', 'pdf'].includes(ext)) {
      startEbookPlayer({
        title: file.name,
        link: file.link || file.stream_link,
        isCloudFile: true
      });
    } 
    // D. Retro emulator
    else if (getEmulatorSystem(file.name)) {
      startRetroPlayer({
        title: file.name,
        magnet: file.link || file.stream_link,
        size: file.size || 0,
        isCloudFile: true
      });
    } 
    // E. General Direct Download fallback
    else {
      triggerDirectDownload({
        title: file.name,
        link: file.link || file.stream_link,
        isCloudFile: true
      });
    }
  };


  // --- Premium Streaming Video Player States ---
  const [activePlayerTorrent, setActivePlayerTorrent] = useState(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [playerFiles, setPlayerFiles] = useState([]);
  const [selectedVideoFile, setSelectedVideoFile] = useState(null);
  const [selectedSubtitleFile, setSelectedSubtitleFile] = useState(null);
  const [subtitleTrackUrl, setSubtitleTrackUrl] = useState(null);
  const [resumeTime, setResumeTime] = useState(0);
  const autoplayDeclinedRef = useRef(false);

  // --- Retro Emulation Arcade States ---
  const [activeRetroTorrent, setActiveRetroTorrent] = useState(null);
  const [selectedRetroRomFile, setSelectedRetroRomFile] = useState(null);
  const [retroPlayableFiles, setRetroPlayableFiles] = useState([]);
  const [retroSearchQuery, setRetroSearchQuery] = useState('');


  // --- Digital EBook Reader States ---
  const [activeEbookTorrent, setActiveEbookTorrent] = useState(null);
  const [selectedEbookFile, setSelectedEbookFile] = useState(null);
  const [ebookPlayableFiles, setEbookPlayableFiles] = useState([]);
  const [ebookSearchQuery, setEbookSearchQuery] = useState('');
  const [resumeEbookChapter, setResumeEbookChapter] = useState(null);
  const [resumeEbookScroll, setResumeEbookScroll] = useState(null);

  // --- Premium Audio Player States ---
  const [activeAudioTorrent, setActiveAudioTorrent] = useState(null);
  const [selectedAudioFile, setSelectedAudioFile] = useState(null);
  const [audioPlayableFiles, setAudioPlayableFiles] = useState([]);
  const [audioSearchQuery, setAudioSearchQuery] = useState('');
  const [resumeAudioTime, setResumeAudioTime] = useState(0);

  // --- Netflix-Style Autoplay States ---
  const [nextEpisodeFile, setNextEpisodeFile] = useState(null);
  const [showAutoplayOverlay, setShowAutoplayOverlay] = useState(false);
  const [autoplayCountdown, setAutoplayCountdown] = useState(15);
  const autoplayTimerRef = useRef(null);

  // --- Rich Metadata Enrichment States ---
  const metadataCacheRef = useRef(new Map());
  const [metadataResults, setMetadataResults] = useState({});
  const [metadataDrawerItem, setMetadataDrawerItem] = useState(null);
  const metadataInFlightRef = useRef(new Set());

  // Fetch metadata for a given torrent item, with deduplication
  const fetchMetadata = async (item) => {
    const cat = item.category || category;
    // Skip categories that don't have metadata APIs
    if (['Software', 'Other', 'Retro Games', 'Adult', 'VST'].includes(cat)) {
      return null;
    }
    
    const cacheKey = `${cat}::${item.title}`;
    
    // Already cached?
    if (metadataCacheRef.current.has(cacheKey)) {
      return metadataCacheRef.current.get(cacheKey);
    }
    
    // Already in flight?
    if (metadataInFlightRef.current.has(cacheKey)) {
      return null;
    }
    metadataInFlightRef.current.add(cacheKey);
    
    try {
      let url = `/api/metadata?title=${encodeURIComponent(item.title)}&category=${encodeURIComponent(cat)}`;
      if (item.imdb) url += `&imdb=${encodeURIComponent(item.imdb)}`;
      if (item.tvdbid) url += `&tvdb=${encodeURIComponent(item.tvdbid)}`;
      const res = await fetchWithCredentials(url);
      if (!res.ok) {
        console.error(`Backend returned HTTP error ${res.status} for "${item.title}"`);
        return null;
      }
      const data = await res.json();
      
      if (data.status === 'success' && data.metadata) {
        metadataCacheRef.current.set(cacheKey, data.metadata);
        return data.metadata;
      }
      // Cache misses too to avoid repeated lookups
      metadataCacheRef.current.set(cacheKey, null);
      return null;
    } catch (err) {
      console.error('Fetch error for:', item.title, err.message);
      return null;
    } finally {
      metadataInFlightRef.current.delete(cacheKey);
    }
  };

  // Batch fetch metadata for an array of items and update state
  const fetchMetadataBatch = async (items) => {
    const eligibleItems = items.filter(item => {
      const cat = item.category || category;
      return !['Software', 'Other', 'Retro Games', 'Adult', 'VST'].includes(cat);
    });
    
    if (eligibleItems.length === 0) return;
    
    // Fetch in parallel, max 4 at a time to avoid flooding
    const BATCH = 4;
    const newResults = {};
    
    for (let i = 0; i < eligibleItems.length; i += BATCH) {
      const batch = eligibleItems.slice(i, i + BATCH);
      const promises = batch.map(async (item) => {
        const metadata = await fetchMetadata(item);
        if (metadata) {
          const cat = item.category || category;
          newResults[`${cat}::${item.title}`] = metadata;
        }
      });
      await Promise.allSettled(promises);
    }
    
    if (Object.keys(newResults).length > 0) {
      setMetadataResults(prev => ({ ...prev, ...newResults }));
    }
  };

  // Helper: Get metadata for an item from state
  const getMetadata = (item) => {
    const cat = item.category || category;
    const key = `${cat}::${item.title}`;
    return metadataResults[key] || null;
  };

  // --- Custom Animated Toast System ---
  const [toast, setToast] = useState(null);

  const triggerToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // --- UI Theme Application Hook ---
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', selectedTheme);
    localStorage.setItem('premium_search_theme', selectedTheme);
  }, [selectedTheme]);

  // Prevent page scroll with arrow keys/space while retro game ROM is active
  useEffect(() => {
    if (!selectedRetroRomFile) return;

    const handlePreventScroll = (e) => {
      // Avoid intercepting keys if the user is typing in an input/textarea inside the parent doc
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.isContentEditable
      );
      if (isInput) return;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar'].includes(e.key)) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handlePreventScroll, { passive: false });
    return () => {
      window.removeEventListener('keydown', handlePreventScroll);
    };
  }, [selectedRetroRomFile]);

  // Persist show/hide adult configuration
  useEffect(() => {
    localStorage.setItem('premium_search_hide_adult', JSON.stringify(hideAdult));
    // If we suddenly hide adult while Adult is selected, revert selected category to Movies
    if (hideAdult && category === 'Adult') {
      setCategory('Movies');
    }
  }, [hideAdult, category]);

  // Auto-check Premiumize cache status for any uncached items in the Library list
  const checkLibraryCacheStatus = async () => {
    const uncachedItems = libraryList.filter(item => !item.cached && item.magnet);
    if (uncachedItems.length === 0) return;

    const hashesToCheck = [];
    uncachedItems.forEach(item => {
      let hash = null;
      const magnet = item.magnet;
      if (magnet && typeof magnet === 'string') {
        const matchHex = magnet.match(/xt=urn:btih:([a-fA-F0-9]{40})/i);
        if (matchHex) hash = matchHex[1].toLowerCase();
      }
      if (hash) {
        hashesToCheck.push(hash);
      }
    });

    if (hashesToCheck.length === 0) return;

    try {
      const res = await fetchWithCredentials('/api/cache-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashes: hashesToCheck })
      });
      if (!res.ok) return;

      const data = await res.json();
      if (data.status === 'success' && data.response) {
        const cacheMap = data.response;
        let hasChanges = false;

        const updatedLib = libraryList.map(item => {
          let itemHash = null;
          const magnet = item.magnet;
          if (magnet) {
            const matchHex = magnet.match(/xt=urn:btih:([a-fA-F0-9]{40})/i);
            if (matchHex) itemHash = matchHex[1].toLowerCase();
          }
          
          if (itemHash && cacheMap[itemHash] === true && !item.cached) {
            hasChanges = true;
            return { ...item, cached: true };
          }
          return item;
        });

        if (hasChanges) {
          setLibraryList(updatedLib);
          localStorage.setItem('premium_search_library', JSON.stringify(updatedLib));
          triggerToast('🔄 Library cache status auto-synchronized!', 'success');
        }
      }
    } catch (err) {
      console.error('Failed to auto-check library cache status:', err);
    }
  };

  // Auto-fetch metadata and cache status when library tab is shown
  useEffect(() => {
    if (activeTab === 'library' && libraryList.length > 0) {
      fetchMetadataBatch(libraryList.slice(0, 20));
      checkLibraryCacheStatus();
    }
  }, [activeTab]);

  // Active Downloads polling effect (runs every 5s while viewing 'transfers' tab)
  useEffect(() => {
    if (activeTab === 'transfers') {
      fetchActiveTransfers();
      const interval = setInterval(fetchActiveTransfers, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Auto-fetch metadata for the first 20 DISPLAYED search results (sorted & filtered)
  // This runs whenever search results, categories, sorting, or filters change.
  useEffect(() => {
    if (activeTab === 'search' && processedResults && processedResults.length > 0) {
      fetchMetadataBatch(processedResults.slice(0, 20));
    }
  }, [activeTab, results, filterQuality, filterMaxSize, filterMinSeeders, excludeKeywords, category, sortBy]);

  // --- Auto-Save: eBook Progress Event Listener ---
  useEffect(() => {
    const handleIframeMessage = (event) => {
      if (event.data && event.data.type === 'ebook-progress') {
        const { chapterIndex, chapterTitle, totalChapters, bookTitle } = event.data;
        if (!activeEbookTorrent || !selectedEbookFile) return;

        // STRICT PRIVACY COMPLIANCE RULE: NEVER save Adult content progress
        if (activeEbookTorrent.category === 'Adult') return;

        const progressPercent = totalChapters > 0 ? ((chapterIndex + 1) / totalChapters) * 100 : 0;

        setContinueWatchingList(prev => {
          const updated = [
            {
              title: selectedEbookFile.name,
              parentTitle: activeEbookTorrent.title,
              link: selectedEbookFile.link,
              torrent: activeEbookTorrent,
              category: 'Ebooks',
              chapterIndex: chapterIndex,
              chapterTitle: chapterTitle,
              totalChapters: totalChapters,
              currentTime: chapterIndex + 1,
              duration: totalChapters,
              percent: progressPercent,
              scrollTop: event.data.scrollTop || 0,
              scrollPercent: event.data.scrollPercent || 0,
              timestamp: Date.now()
            },
            ...prev.filter(item => cleanUrl(item.link) !== cleanUrl(selectedEbookFile.link))
          ].slice(0, 12);
          localStorage.setItem('premium_search_continue_watching', JSON.stringify(updated));
          return updated;
        });
      }
    };

    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, [activeEbookTorrent, selectedEbookFile]);



  // --- Auto-Save: Audio / Audiobook Progress Event Listener ---
  useEffect(() => {
    const handleIframeMessage = (event) => {
      if (event.data && event.data.type === 'audio-progress') {
        const { link, name, currentTime, duration, percent } = event.data;
        if (!activeAudioTorrent || !selectedAudioFile) return;

        // STRICT PRIVACY COMPLIANCE RULE: NEVER save Adult content progress
        if (activeAudioTorrent.category === 'Adult') return;

        const categoryVal = activeAudioTorrent.category === 'Music' ? 'Music' : 'Audiobooks';

        setContinueWatchingList(prev => {
          const updated = [
            {
              title: name,
              parentTitle: activeAudioTorrent.title,
              link: link,
              torrent: activeAudioTorrent,
              category: categoryVal,
              currentTime: currentTime,
              duration: duration,
              percent: percent,
              timestamp: Date.now()
            },
            ...prev.filter(item => !item.parentTitle || item.parentTitle.toLowerCase() !== activeAudioTorrent.title.toLowerCase())
          ].slice(0, 12);
          localStorage.setItem('premium_search_continue_watching', JSON.stringify(updated));
          return updated;
        });
      } else if (event.data && event.data.type === 'audio-ended') {
        const { link } = event.data;
        removeFromContinueWatching(link);
        triggerToast("💿 Album / Audiobook completed! Progress cleared.", "success");
      } else if (event.data && event.data.type === 'audio-player-ready') {
        const iframe = document.querySelector('.main-audio-frame');
        if (iframe && iframe.contentWindow) {
          console.log('Sending playlist data via postMessage to iframe...');
          const meta = getMetadata(activeAudioTorrent);
          iframe.contentWindow.postMessage({
            type: 'audio-playlist-data',
            playlist: audioPlayableFiles.map(f => ({
              name: f.name,
              link: f.link,
              size: f.size
            })),
            meta: meta,
            initialRom: selectedAudioFile.link,
            resumeTime: resumeAudioTime
          }, '*');
        }
      }
    };

    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, [activeAudioTorrent, selectedAudioFile]);

  // --- Secret Developer Settings Lock ---
  const handleLogoClick = () => {
    const now = Date.now();
    // Keep only clicks within the last 2000ms
    logoClicksRef.current = [...logoClicksRef.current, now].filter(t => now - t < 2000);
    
    if (logoClicksRef.current.length >= 5) {
      logoClicksRef.current = []; // Clear click history immediately
      
      setAdultControlsUnlocked(unlocked => {
        const newState = !unlocked;
        triggerToast(newState ? '🔑 Secret settings unlocked!' : '🔒 Secret settings locked!', 'success');
        // Automatically hide adult options when locked
        if (!newState) {
          setHideAdult(true);
        }
        return newState;
      });
    }
  };

  // --- Cloud Sync On Startup ---
  useEffect(() => {
    syncFromCloud();
  }, []);

  // --- Keyboard Playback Hotkeys ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!activePlayerTorrent) return;

      const video = document.querySelector('.main-video-player');
      if (!video) return;

      // Avoid capturing keys when the user is typing in forms or search fields
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      switch (e.key) {
        case ' ': // Spacebar - Play/Pause Toggle
          e.preventDefault();
          if (video.paused) {
            video.play();
            triggerToast('▶️ Play', 'success');
          } else {
            video.pause();
            triggerToast('⏸️ Pause', 'success');
          }
          break;
        case 'ArrowLeft': // Left Arrow - Seek Back 10s
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          triggerToast('⏪ -10s', 'success');
          break;
        case 'ArrowRight': // Right Arrow - Seek Forward 10s
          e.preventDefault();
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
          triggerToast('⏩ +10s', 'success');
          break;
        case 'ArrowUp': // Up Arrow - Volume Up 10%
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          triggerToast(`🔊 Volume ${Math.round(video.volume * 100)}%`, 'success');
          break;
        case 'ArrowDown': // Down Arrow - Volume Down 10%
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          triggerToast(`🔉 Volume ${Math.round(video.volume * 100)}%`, 'success');
          break;
        case 's':
        case 'S': // 's' / 'S' - Toggle Subtitle Visibility
          e.preventDefault();
          if (video.textTracks && video.textTracks.length > 0) {
            const track = video.textTracks[0];
            const isShowing = track.mode === 'showing';
            track.mode = isShowing ? 'disabled' : 'showing';
            triggerToast(isShowing ? '🚫 Subtitles Off' : '💬 Subtitles On', 'success');
          } else {
            triggerToast('⚠️ No subtitle track loaded', 'error');
          }
          break;
        case 'f':
        case 'F': // 'f' / 'F' - Toggle Player Fullscreen Mode
          e.preventDefault();
          if (!document.fullscreenElement) {
            video.requestFullscreen().catch(err => {
              console.error('Fullscreen request failed:', err.message);
            });
            triggerToast('📺 Fullscreen On', 'success');
          } else {
            document.exitFullscreen().catch(err => {
              console.error('Exit fullscreen failed:', err.message);
            });
            triggerToast('📺 Fullscreen Off', 'success');
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePlayerTorrent]);


  // --- Subtitle compiler engine ---
  useEffect(() => {
    if (!selectedSubtitleFile) {
      setSubtitleTrackUrl(null);
      return;
    }

    let active = true;
    const fetchAndCompileSubtitle = async () => {
      try {
        const res = await fetchWithCredentials(`/api/proxy-subtitle?url=${encodeURIComponent(selectedSubtitleFile.link)}`);
        if (!res.ok) throw new Error('Subtitle track unreachable.');
        
        const rawText = await res.text();
        if (!active) return;

        let compiledVtt = rawText;
        // Compile SRT files into WebVTT on-the-fly
        if (selectedSubtitleFile.name.toLowerCase().endsWith('.srt') || !rawText.startsWith('WEBVTT')) {
          compiledVtt = convertSrtToVtt(rawText);
        }

        const blob = new Blob([compiledVtt], { type: 'text/vtt' });
        const objectUrl = URL.createObjectURL(blob);
        setSubtitleTrackUrl(objectUrl);
      } catch (err) {
        console.error('Subtitle compiler failed:', err.message);
      }
    };

    fetchAndCompileSubtitle();

    return () => {
      active = false;
      if (subtitleTrackUrl) {
        URL.revokeObjectURL(subtitleTrackUrl);
      }
    };
  }, [selectedSubtitleFile]);

  // Programmatically mount and force-refresh the active subtitle track
  // to bypass HTML5 text track loading bugs and prevent manual CC toggling
  useEffect(() => {
    const videoElement = document.querySelector('.main-video-player');
    if (!videoElement) return;

    // Remove any existing track element inside the video tag
    const existingTracks = videoElement.querySelectorAll('track');
    existingTracks.forEach(t => t.remove());

    if (subtitleTrackUrl) {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = selectedSubtitleFile?.name || 'Subtitles';
      track.srclang = 'en';
      track.src = subtitleTrackUrl;
      track.default = true;
      
      // Append track to DOM
      videoElement.appendChild(track);
      
      // Force subtitle track mode to 'showing' programmatically
      track.addEventListener('load', () => {
        track.track.mode = 'showing';
      });
      
      // Fallback timer reinforcement
      setTimeout(() => {
        if (videoElement.textTracks && videoElement.textTracks.length > 0) {
          videoElement.textTracks[0].mode = 'showing';
        }
      }, 100);
    }
  }, [subtitleTrackUrl, selectedSubtitleFile]);

  // --- TV Series Autoplay Countdown Timer Hooks ---
  useEffect(() => {
    if (showAutoplayOverlay && autoplayCountdown > 0) {
      autoplayTimerRef.current = setTimeout(() => {
        setAutoplayCountdown(prev => prev - 1);
      }, 1000);
    } else if (showAutoplayOverlay && autoplayCountdown === 0) {
      setShowAutoplayOverlay(false);
      if (nextEpisodeFile) {
        triggerToast(`🍿 Autoplaying next episode: ${nextEpisodeFile.name.split('/').pop()}`, 'success');
        setSelectedVideoFile(nextEpisodeFile);
      }
    }
    return () => {
      if (autoplayTimerRef.current) clearTimeout(autoplayTimerRef.current);
    };
  }, [showAutoplayOverlay, autoplayCountdown, nextEpisodeFile]);

  useEffect(() => {
    setShowAutoplayOverlay(false);
    setNextEpisodeFile(null);
    autoplayDeclinedRef.current = false; // Reset decline flag on track swap!
    if (autoplayTimerRef.current) clearTimeout(autoplayTimerRef.current);
  }, [selectedVideoFile]);

  // --- Handlers & API Calls ---

  // --- Importer and Drag-and-Drop Handlers ---
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processImportedFile = async (file) => {
    if (!file) return;
    const isTorrent = file.name.toLowerCase().endsWith('.torrent');
    const isNzb = file.name.toLowerCase().endsWith('.nzb');
    
    if (!isTorrent && !isNzb) {
      triggerToast('⚠️ Only .torrent and .nzb files are supported for import!', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setLoading(true);
        const base64Data = reader.result.split(',')[1];
        
        const res = await fetchWithCredentials('/api/parse-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileContent: base64Data,
            fileName: file.name,
            fileType: isTorrent ? 'torrent' : 'nzb'
          })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to parse file');
        }

        const data = await res.json();

        if (data.type === 'torrent') {
          setSearchMode('torrent');
          setResults([]);
          setSearched(true);
          setActiveTab('search');
          
          const checkRes = await fetchWithCredentials('/api/cache-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hashes: [data.infoHash] })
          });
          
          let isCached = false;
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            isCached = checkData.response && checkData.response[data.infoHash] === true;
          }
          
          setResults([{
            title: data.title,
            size: data.size,
            seeders: 10,
            peers: 3,
            magnet: data.magnet,
            torrentFile: null,
            infoHash: data.infoHash,
            tracker: 'Imported Torrent File',
            category: category,
            publishDate: new Date().toISOString(),
            cached: isCached
          }]);
          triggerToast('✨ Torrent imported successfully and CDN cache status checked!', 'success');
        } else if (data.type === 'usenet') {
          setSearchMode('usenet');
          setResults([]);
          setSearched(true);
          setActiveTab('search');
          
          setResults([{
            title: data.title,
            size: data.size,
            nzbUrl: data.nzbUrl,
            ageDays: 0,
            grabs: 1,
            health: 100,
            imdb: null,
            tvdbid: null,
            coverurl: null,
            password: null,
            category: category,
            indexer: 'Imported NZB File'
          }]);
          triggerToast('⚡ NZB imported successfully! Ready for 1-click cloud transfer.', 'success');
        }
      } catch (err) {
        triggerToast(`⚠️ Import failed: ${err.message}`, 'error');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processImportedFile(e.dataTransfer.files[0]);
    }
  };

  const handleImportFile = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processImportedFile(e.target.files[0]);
    }
  };

  const handleImportMagnet = async () => {
    if (!magnetInput.trim()) return;
    
    const isMagnet = magnetInput.trim().toLowerCase().startsWith('magnet:?');
    if (!isMagnet) {
      triggerToast('⚠️ Provided input is not a valid magnet link!', 'error');
      return;
    }

    try {
      setLoading(true);
      const res = await fetchWithCredentials('/api/parse-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: magnetInput })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to parse magnet link');
      }

      const data = await res.json();

      if (data.type === 'torrent') {
        setSearchMode('torrent');
        setResults([]);
        setSearched(true);
        setActiveTab('search');
        
        const checkRes = await fetchWithCredentials('/api/cache-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hashes: [data.infoHash] })
        });
        
        let isCached = false;
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          isCached = checkData.response && checkData.response[data.infoHash] === true;
        }
        
        setResults([{
          title: data.title,
          size: data.size,
          seeders: 10,
          peers: 3,
          magnet: data.magnet,
          torrentFile: null,
          infoHash: data.infoHash,
          tracker: 'Imported Magnet Link',
          category: category,
          publishDate: new Date().toISOString(),
          cached: isCached
        }]);
        setMagnetInput('');
        triggerToast('✨ Magnet link imported and CDN cache status checked!', 'success');
      }
    } catch (err) {
      triggerToast(`⚠️ Import failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Trigger search
  const handleSearch = async (e, forcedMode = null) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    setResults([]);

    const activeSearchMode = forcedMode || searchMode;

    if (!userPmKey) {
      triggerToast('⚠️ Premiumize API Key is missing. Showing simulated mock results. Configure in Settings.', 'warning');
    } else if (activeSearchMode === 'torrent' && !userJackettUrl) {
      triggerToast('⚠️ Jackett URL is missing. Showing simulated mock torrents. Configure in Settings.', 'warning');
    }

    // STRICT PRIVACY COMPLIANCE RULE:
    // Do NOT save search queries to history if they are in the Adult category.
    if (category !== 'Adult') {
      const updatedQueries = [query, ...recentSearches.filter(q => q !== query)].slice(0, 8);
      setRecentSearches(updatedQueries);
      localStorage.setItem('premium_search_recent_queries', JSON.stringify(updatedQueries));
    } else {
      console.log('🛡️ Privacy Filter: Adult category query omitted from search history.');
    }

    try {
      const fetchUrl = activeSearchMode === 'usenet'
        ? `/api/usenet/search?q=${encodeURIComponent(query)}&category=${category}`
        : `/api/search?q=${encodeURIComponent(query)}&category=${category}`;

      const res = await fetchWithCredentials(fetchUrl);
      if (!res.ok) throw new Error('Search request failed.');
      
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error(err);
      triggerToast(`Search failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Trigger Download to Premiumize (With fallback to .torrent file URL)
  const triggerDownload = async (torrent) => {
    if (!userPmKey) {
      triggerToast('⚠️ Premiumize API Key is required to download files. Please configure it in onboarding/settings.', 'error');
      setShowOnboarding(true);
      setOnboardingStep(1);
      return;
    }
    const downloadSource = torrent.magnet || torrent.torrentFile;
    if (!downloadSource) {
      triggerToast('No download link or magnet available for this item.', 'error');
      return;
    }

    // Identify this specific item uniquely
    const itemIdentifier = torrent.infoHash || torrent.magnet || torrent.torrentFile;
    setActiveDownloadId(itemIdentifier);

    try {
      const res = await fetchWithCredentials('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: downloadSource })
      });

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        throw new Error(`Failed to parse server response: ${res.statusText} (${res.status})`);
      }

      if (!res.ok) {
        throw new Error(data.error || data.message || `Server error: ${res.status}`);
      }

      if (data.status === 'success') {
        triggerToast(`Successfully sent "${torrent.title}" to Premiumize!`, 'success');
        
        // Immediately set cached to true in both search results and library states
        setResults(prev => prev.map(item => {
          if ((item.magnet && item.magnet === torrent.magnet) || (item.torrentFile && item.torrentFile === torrent.torrentFile)) {
            return { ...item, cached: true };
          }
          return item;
        }));
        setLibraryList(prev => {
          const updated = prev.map(item => {
            if ((item.magnet && item.magnet === torrent.magnet) || (item.torrentFile && item.torrentFile === torrent.torrentFile)) {
              return { ...item, cached: true };
            }
            return item;
          });
          localStorage.setItem('premium_search_library', JSON.stringify(updated));
          return updated;
        });
        
        // STRICT PRIVACY COMPLIANCE RULE:
        // Do NOT store adult downloads in any local history logs.
        if (torrent.category !== 'Adult') {
          const newHistory = [
            {
              title: torrent.title,
              infoHash: torrent.infoHash || 'N/A',
              size: torrent.size,
              timestamp: new Date().toISOString()
            },
            ...recentDownloads
          ].slice(0, 10);
          setRecentDownloads(newHistory);
          localStorage.setItem('premium_search_downloads', JSON.stringify(newHistory));
        } else {
          console.log('🛡️ Privacy Filter: Adult category transfer omitted from local download history.');
        }

      } else {
        throw new Error(data.message || 'Unknown response from Premiumize.');
      }
    } catch (err) {
      console.error(err);
      triggerToast(err.message, 'error');
    } finally {
      setActiveDownloadId(null);
    }
  };

  // Trigger Direct CDN Download (Bypasses PM Cloud box to save personal space)
  const triggerDirectDownload = async (torrent) => {
    const downloadSource = torrent.magnet || torrent.torrentFile || torrent.link;
    if (!downloadSource) {
      triggerToast('No download source link available.', 'error');
      return;
    }

    // If it's a direct cloud link or HTTP resource, download/open it directly
    if (torrent.isCloudFile || (downloadSource && (downloadSource.startsWith('http://') || downloadSource.startsWith('https://')) && !downloadSource.includes('magnet:'))) {
      triggerToast(`📥 Downloading: ${torrent.title || torrent.name || 'Cloud File'}`, 'success');
      window.open(downloadSource, '_blank');
      return;
    }

    setPlayerLoading(true);
    triggerToast('🚀 Fetching direct high-speed CDN links...', 'success');

    try {
      const res = await fetchWithCredentials('/api/stream-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: downloadSource, password: torrent.password })
      });

      if (!res.ok) throw new Error('Failed to fetch direct download links.');

      const data = await res.json();

      if (data.status === 'success' && data.files && data.files.length > 0) {
        const targetFiles = data.files.filter(f => f.type !== 'subtitle');
        
        if (targetFiles.length === 1) {
          const dlLink = targetFiles[0].link;
          triggerToast(`📥 Downloading: ${targetFiles[0].name}`, 'success');
          window.open(dlLink, '_blank');
        } else if (targetFiles.length > 1) {
          triggerToast(`📥 Starting batch download for ${targetFiles.length} files...`, 'success');
          targetFiles.forEach((file, index) => {
            // Stagger window.open slightly to bypass browser pop-up blockers
            setTimeout(() => {
              window.open(file.link, '_blank');
            }, index * 400);
          });
        } else {
          throw new Error('No files found inside this release.');
        }
      } else {
        throw new Error(data.message || 'Failed to resolve high-speed direct CDN links.');
      }
    } catch (err) {
      console.error(err);
      triggerToast(err.message, 'error');
    } finally {
      setPlayerLoading(false);
    }
  };

  // Trigger Instant Stream Playback
  const startStreaming = async (torrent, seekTimeSec = 0, resumeFileName = null) => {
    if (!userPmKey) {
      triggerToast('⚠️ Premiumize API Key is required to stream files. Please configure it in onboarding/settings.', 'error');
      setShowOnboarding(true);
      setOnboardingStep(1);
      return;
    }
    const downloadSource = torrent.magnet || torrent.torrentFile || torrent.link;
    if (!downloadSource) {
      triggerToast('No streamable link available for this item.', 'error');
      return;
    }

    setPlayerLoading(true);
    setActivePlayerTorrent(torrent);
    setActiveRetroTorrent(null); // Clear active retro arcade session
    setSelectedRetroRomFile(null);
    setPlayerFiles([]);
    setSelectedVideoFile(null);
    setSelectedSubtitleFile(null);
    setSubtitleTrackUrl(null);
    setResumeTime(seekTimeSec); // Track if we need to seek on load

    // If it's a direct cloud file link (starts with http/https and is not a magnet), bypass API backend stream-link parsing
    if (torrent.isCloudFile || (downloadSource && (downloadSource.startsWith('http://') || downloadSource.startsWith('https://')) && !downloadSource.includes('magnet:'))) {
      const files = torrent.files || [{
        name: torrent.title || torrent.name || 'Cloud Video',
        link: downloadSource,
        size: torrent.size || 0,
        type: 'video'
      }];
      
      setPlayerFiles(files);
      
      const videos = files.filter(f => f.type === 'video');
      if (videos.length > 0) {
        setSelectedVideoFile(videos[0]);
      } else {
        setSelectedVideoFile(files[0]);
      }
      
      // Auto-select subtitle if available
      const subtitles = files.filter(f => f.type === 'subtitle');
      if (subtitles.length > 0) {
        setSelectedSubtitleFile(subtitles[0]);
      }
      
      setPlayerLoading(false);
      return;
    }

    try {
      const res = await fetchWithCredentials('/api/stream-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: downloadSource, password: torrent.password })
      });

      if (!res.ok) throw new Error('Failed to fetch streaming links.');

      const data = await res.json();

      if (data.status === 'success') {
        const files = data.files || [];
        
        // Sort files naturally so episodes and season files are listed in sequential order
        files.sort((a, b) => {
          const aName = a.name.split('/').pop().toLowerCase();
          const bName = b.name.split('/').pop().toLowerCase();
          return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
        });
        
        setPlayerFiles(files);
        
        // Find and select the correct video file to play/resume
        const videos = files.filter(f => f.type === 'video');
        let selectedVideo = null;
        if (videos.length > 0) {
          selectedVideo = videos[0];
          if (resumeFileName) {
            const matched = videos.find(v => v.name === resumeFileName);
            if (matched) selectedVideo = matched;
          }
          setSelectedVideoFile(selectedVideo);
        } else {
          throw new Error('No streamable video files found in this release.');
        }

        // Auto-select the matching subtitle track for the active video file
        const subtitles = files.filter(f => f.type === 'subtitle');
        if (subtitles.length > 0 && selectedVideo) {
          const videoEp = matchEpisode(selectedVideo.name);
          let matchedSub = null;
          if (videoEp) {
            matchedSub = subtitles.find(s => matchEpisode(s.name) === videoEp);
          }
          if (!matchedSub) {
            const cleanVideoName = selectedVideo.name.split('.')[0].toLowerCase();
            matchedSub = subtitles.find(s => s.name.toLowerCase().includes(cleanVideoName) || cleanVideoName.includes(s.name.split('.')[0].toLowerCase()));
          }
          if (!matchedSub) {
            const vidIdx = videos.indexOf(selectedVideo);
            if (vidIdx !== -1 && subtitles[vidIdx]) {
              matchedSub = subtitles[vidIdx];
            }
          }
          setSelectedSubtitleFile(matchedSub || subtitles[0]);
        } else {
          setSelectedSubtitleFile(null);
        }
      } else {
        throw new Error(data.message || 'Streaming extraction failed.');
      }
    } catch (err) {
      console.error(err);
      triggerToast(err.message, 'error');
      setActivePlayerTorrent(null);
    } finally {
      setPlayerLoading(false);
    }
  };

  // Helper: Map ROM extensions to target EmulatorJS console systems
  const getEmulatorSystem = (filename) => {
    if (!filename || typeof filename !== 'string') return null;
    const name = filename.split('?')[0].toLowerCase();
    const ext = name.split('.').pop();
    const map = {
      'nes': 'nes',
      'sfc': 'snes',
      'smc': 'snes',
      'md': 'segaMD',
      'gen': 'segaMD',
      'bin': 'segaMD',
      'gb': 'gb',
      'gbc': 'gbc',
      'gba': 'gba',
      'a26': 'atari2600',
      'a78': 'atari7800'
    };
    if (map[ext]) return map[ext];
    if (ext === 'zip') return 'zip'; // Triggers zip auto-detection inside emulator.html
    return null;
  };

  // Trigger Retro Emulation Arcade Playback
  const startRetroPlayer = async (torrent, resumeLink = null) => {
    const downloadSource = torrent.magnet || torrent.torrentFile;
    if (!downloadSource) {
      triggerToast('No ROM download link available.', 'error');
      return;
    }

    setPlayerLoading(true);
    setActivePlayerTorrent(null); // Clear video player
    setSelectedVideoFile(null);
    setSelectedSubtitleFile(null);
    setSubtitleTrackUrl(null);
    
    setActiveRetroTorrent(torrent);
    setSelectedRetroRomFile(null);

    try {
      // If it's a direct cloud file link (starts with http/https and is not a magnet), bypass API backend stream-link parsing
      if (torrent.isCloudFile || (downloadSource && (downloadSource.startsWith('http://') || downloadSource.startsWith('https://')) && !downloadSource.includes('magnet:'))) {
        const playableFile = {
          name: torrent.title || torrent.name || 'ROM Game',
          link: downloadSource,
          size: torrent.size || 0
        };
        setRetroPlayableFiles([playableFile]);
        setSelectedRetroRomFile(playableFile);
        setPlayerLoading(false);
        return;
      }

      const res = await fetchWithCredentials('/api/stream-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: downloadSource, password: torrent.password })
      });

      if (!res.ok) throw new Error('Failed to extract ROM links.');

      const data = await res.json();

      if (data.status === 'success') {
        const files = data.files || [];
        
        // Find a valid ROM file or a Zip file inside the torrent
        const playableFiles = files.filter(f => {
          const name = f.name.toLowerCase();
          return getEmulatorSystem(name) !== null || name.endsWith('.zip');
        });

        if (playableFiles.length === 0) {
          throw new Error('No compatible retro ROM files or ZIP packages found in this release.');
        }

        // Sort files in natural numerical order
        playableFiles.sort((a, b) => {
          const aName = a.name.split('/').pop().toLowerCase();
          const bName = b.name.split('/').pop().toLowerCase();
          return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
        });

        // Robust Resume Auto-Selection: match saved progress file link
        const targetLink = resumeLink || (continueWatchingList.find(p => cleanUrl(p.parentTitle) === cleanUrl(torrent.title))?.link);
        const targetFile = targetLink ? playableFiles.find(f => cleanUrl(f.link) === cleanUrl(targetLink)) : null;

        setRetroPlayableFiles(playableFiles);
        setSelectedRetroRomFile(targetFile || playableFiles[0]);
      } else {
        throw new Error(data.message || 'ROM extraction failed.');
      }
    } catch (err) {
      console.error(err);
      triggerToast(err.message, 'error');
      setActiveRetroTorrent(null);
    } finally {
      setPlayerLoading(false);
    }
  };

  // Trigger EBook Reader Playback
  const startEbookPlayer = async (torrent, resumeLink = null, resumeChapterIdx = null, resumeScroll = null) => {
    const downloadSource = torrent.magnet || torrent.torrentFile || torrent.link;
    if (!downloadSource) {
      triggerToast('No eBook download link available.', 'error');
      return;
    }

    setPlayerLoading(true);
    setActivePlayerTorrent(null); // Clear video player
    setSelectedVideoFile(null);
    setSelectedSubtitleFile(null);
    setSubtitleTrackUrl(null);
    setActiveRetroTorrent(null); // Clear retro player
    setSelectedRetroRomFile(null);

    setActiveEbookTorrent(torrent);
    setSelectedEbookFile(null);
    setEbookPlayableFiles([]);
    setEbookSearchQuery('');
    setResumeEbookChapter(resumeChapterIdx);
    setResumeEbookScroll(resumeScroll);

    // If it's a direct cloud file link (starts with http/https and is not a magnet), bypass API backend stream-link parsing
    if (torrent.isCloudFile || (downloadSource && (downloadSource.startsWith('http://') || downloadSource.startsWith('https://')) && !downloadSource.includes('magnet:'))) {
      const playableFile = {
        name: torrent.title || torrent.name || 'eBook File',
        link: downloadSource,
        size: torrent.size || 0
      };
      setEbookPlayableFiles([playableFile]);
      setSelectedEbookFile(playableFile);
      setPlayerLoading(false);
      return;
    }

    try {
      const res = await fetchWithCredentials('/api/stream-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: downloadSource, password: torrent.password })
      });

      if (!res.ok) throw new Error('Failed to extract eBook links.');

      const data = await res.json();

      if (data.status === 'success') {
        const files = data.files || [];
        
        // Find EPUB or PDF files inside the torrent
        const playableFiles = files.filter(f => {
          const name = f.name.toLowerCase();
          return name.endsWith('.epub') || name.endsWith('.pdf');
        });

        if (playableFiles.length === 0) {
          throw new Error('No compatible EPUB or PDF eBook files found in this release.');
        }

        // Sort files in natural numerical order
        playableFiles.sort((a, b) => {
          const aName = a.name.split('/').pop().toLowerCase();
          const bName = b.name.split('/').pop().toLowerCase();
          return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
        });

        // Robust Resume Auto-Selection: match saved progress file link
        const targetLink = resumeLink || (continueWatchingList.find(p => cleanUrl(p.parentTitle) === cleanUrl(torrent.title))?.link);
        const targetFile = targetLink ? playableFiles.find(f => cleanUrl(f.link) === cleanUrl(targetLink)) : null;

        // Auto-resolve chapter index and scroll top dynamically if not passed
        const finalFile = targetFile || playableFiles[0];
        let finalChapter = resumeChapterIdx;
        let finalScroll = resumeScroll;

        const activeProgress = continueWatchingList.find(p => cleanUrl(p.link) === cleanUrl(finalFile.link));
        if (activeProgress) {
          if (finalChapter === null && activeProgress.chapterIndex !== undefined) {
            finalChapter = activeProgress.chapterIndex;
          }
          if (finalScroll === null && activeProgress.scrollTop !== undefined) {
            finalScroll = activeProgress.scrollTop;
          }
        }

        setResumeEbookChapter(finalChapter);
        setResumeEbookScroll(finalScroll);

        setEbookPlayableFiles(playableFiles);
        setSelectedEbookFile(finalFile);
      } else {
        throw new Error(data.message || 'eBook extraction failed.');
      }
    } catch (err) {
      console.error(err);
      triggerToast(err.message, 'error');
      setActiveEbookTorrent(null);
    } finally {
      setPlayerLoading(false);
    }
  };

  // Trigger Audio / Audiobook Player Playback
  const startAudioPlayer = async (torrent, resumeLink = null, resumeTimeSec = 0) => {
    const downloadSource = torrent.magnet || torrent.torrentFile || torrent.link;
    if (!downloadSource) {
      triggerToast('No audio download link available.', 'error');
      return;
    }

    setPlayerLoading(true);
    setActivePlayerTorrent(null); // Clear video player
    setSelectedVideoFile(null);
    setSelectedSubtitleFile(null);
    setSubtitleTrackUrl(null);
    setActiveRetroTorrent(null); // Clear retro player
    setSelectedRetroRomFile(null);
    setActiveEbookTorrent(null); // Clear eBook reader
    setSelectedEbookFile(null);

    setActiveAudioTorrent(torrent);
    setSelectedAudioFile(null);
    setAudioPlayableFiles([]);
    setAudioSearchQuery('');
    setResumeAudioTime(resumeTimeSec);

    // If it's a direct cloud file link (starts with http/https and is not a magnet), bypass API backend stream-link parsing
    if (torrent.isCloudFile || (downloadSource && (downloadSource.startsWith('http://') || downloadSource.startsWith('https://')) && !downloadSource.includes('magnet:'))) {
      const files = torrent.files || [{
        name: torrent.title || torrent.name || 'Cloud Audio',
        link: downloadSource,
        size: torrent.size || 0
      }];
      setAudioPlayableFiles(files);
      const activeIdx = torrent.activeIndex !== undefined ? torrent.activeIndex : 0;
      setSelectedAudioFile(files[activeIdx] || files[0]);
      setPlayerLoading(false);
      return;
    }

    try {
      const res = await fetchWithCredentials('/api/stream-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: downloadSource, password: torrent.password })
      });

      if (!res.ok) throw new Error('Failed to extract audio links.');

      const data = await res.json();

      if (data.status === 'success') {
        const files = data.files || [];
        
        // Find audio files inside the torrent
        const playableFiles = files.filter(f => {
          const name = f.name.toLowerCase();
          return name.endsWith('.mp3') || name.endsWith('.m4b') || name.endsWith('.flac') || name.endsWith('.wav') || name.endsWith('.m4a') || name.endsWith('.ogg') || name.endsWith('.wma');
        });

        if (playableFiles.length === 0) {
          throw new Error('No compatible audio files (.mp3, .m4b, .flac, .wav, .m4a, .ogg, .wma) found in this release.');
        }

        // Sort files by folder path and filename in natural numerical order
        playableFiles.sort((a, b) => {
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase(), undefined, { numeric: true, sensitivity: 'base' });
        });

        // Robust Resume Auto-Selection: match saved progress file link
        const targetLink = resumeLink || (continueWatchingList.find(p => cleanUrl(p.parentTitle) === cleanUrl(torrent.title))?.link);
        let targetFile = targetLink ? playableFiles.find(f => cleanUrl(f.link) === cleanUrl(targetLink)) : null;

        // Fallback: match by clean filename if dynamic CDN path parameters mutated
        if (!targetFile && targetLink) {
          const cleanName = (url) => {
            try {
              return decodeURIComponent(url).split('/').pop().split('?')[0].toLowerCase();
            } catch(e) {
              return url.split('/').pop().split('?')[0].toLowerCase();
            }
          };
          const targetFileName = cleanName(targetLink);
          targetFile = playableFiles.find(f => cleanName(f.link) === targetFileName);
        }

        // Auto-resolve audio track and time dynamically if not passed
        const finalFile = targetFile || playableFiles[0];
        let finalTime = resumeTimeSec;

        const activeProgress = continueWatchingList.find(p => cleanUrl(p.link) === cleanUrl(finalFile.link));
        if (activeProgress && activeProgress.currentTime !== undefined) {
          if (!finalTime) finalTime = activeProgress.currentTime;
        }

        setResumeAudioTime(finalTime);
        setAudioPlayableFiles(playableFiles);
        setSelectedAudioFile(finalFile);
      } else {
        throw new Error(data.message || 'Audio extraction failed.');
      }
    } catch (err) {
      console.error(err);
      triggerToast(err.message, 'error');
      setActiveAudioTorrent(null);
    } finally {
      setPlayerLoading(false);
    }
  };

  // Seek video by offset seconds
  const seekVideo = (seconds) => {
    const video = document.querySelector('.main-video-player');
    if (video) {
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    }
  };

  // --- Continue Watching & Autoplay logic ---
  const handleTimeUpdate = (e) => {
    const video = e.target;
    if (!video || !selectedVideoFile || !activePlayerTorrent) return;

    // STRICT PRIVACY COMPLIANCE RULE: NEVER save Adult content progress in Continue Watching
    if (activePlayerTorrent.category === 'Adult') return;

    const currentSecs = video.currentTime;
    const totalSecs = video.duration;

    if (totalSecs > 0 && currentSecs > 10) { // Start saving after 10 seconds of playback
      const progressPercent = (currentSecs / totalSecs) * 100;
      
      // If completed > 97% and it's a TV show, check for autoplay next episode
      if (progressPercent > 97) {
        const cat = activePlayerTorrent.category || 'Movies';
        if (cat === 'TV') {
          const videos = playerFiles.filter(f => f.type === 'video');
          const currentIndex = videos.findIndex(v => v.link === selectedVideoFile.link);
          const nextVideo = (currentIndex !== -1 && currentIndex < videos.length - 1) ? videos[currentIndex + 1] : null;

          if (nextVideo && !showAutoplayOverlay && !autoplayDeclinedRef.current) {
            setNextEpisodeFile(nextVideo);
            setShowAutoplayOverlay(true);
            setAutoplayCountdown(15);
          }
        }
        
        removeFromContinueWatching(selectedVideoFile.link);
        return;
      }

      const updatedList = [
        {
          title: selectedVideoFile.name,
          parentTitle: activePlayerTorrent.title,
          link: selectedVideoFile.link,
          torrent: activePlayerTorrent,
          category: activePlayerTorrent.category, // Explicitly save category
          currentTime: currentSecs,
          duration: totalSecs,
          percent: progressPercent,
          timestamp: Date.now()
        },
        ...continueWatchingList.filter(item => cleanUrl(item.link) !== cleanUrl(selectedVideoFile.link))
      ].slice(0, 12);

      setContinueWatchingList(updatedList);
      localStorage.setItem('premium_search_continue_watching', JSON.stringify(updatedList));
    }
  };

  const removeFromContinueWatching = (fileLink) => {
    const updated = continueWatchingList.filter(item => cleanUrl(item.link) !== cleanUrl(fileLink));
    setContinueWatchingList(updated);
    localStorage.setItem('premium_search_continue_watching', JSON.stringify(updated));
    syncToCloud(libraryList, updated); // Sync deletion to cloud immediately!
  };

  const handleVideoLoadedMetadata = (e) => {
    if (resumeTime > 0) {
      e.target.currentTime = resumeTime;
      setResumeTime(0); // Clear after seek
    }
  };

  const handleVideoEnded = () => {
    if (!selectedVideoFile || !activePlayerTorrent) return;
    const cat = activePlayerTorrent.category || 'Movies';
    if (cat === 'TV') {
      const videos = playerFiles.filter(f => f.type === 'video');
      const currentIndex = videos.findIndex(v => v.link === selectedVideoFile.link);
      const nextVideo = (currentIndex !== -1 && currentIndex < videos.length - 1) ? videos[currentIndex + 1] : null;
      if (nextVideo) {
        triggerToast(`🍿 Playing next episode: ${nextVideo.name.split('/').pop()}`, 'success');
        setSelectedVideoFile(nextVideo);
      }
    }
  };

  // --- My Library logic ---
  const isItemInLibrary = (item) => {
    return libraryList.some(libItem => 
      (libItem.magnet && libItem.magnet === item.magnet) || 
      (libItem.torrentFile && libItem.torrentFile === item.torrentFile)
    );
  };

  const toggleLibraryItem = (torrent) => {
    const alreadyIn = isItemInLibrary(torrent);

    if (alreadyIn) {
      const updated = libraryList.filter(item => 
        !(item.magnet === torrent.magnet && item.torrentFile === torrent.torrentFile)
      );
      setLibraryList(updated);
      localStorage.setItem('premium_search_library', JSON.stringify(updated));
      triggerToast('Removed from your Library.', 'success');
      syncToCloud(updated, continueWatchingList); // Sync to Premiumize Cloud
    } else {
      // Adult items are saved normally, but their visibility in the Library is governed by privacy settings
      const entry = {
        title: torrent.title,
        magnet: torrent.magnet,
        torrentFile: torrent.torrentFile,
        size: torrent.size,
        seeders: torrent.seeders,
        peers: torrent.peers,
        category: torrent.category,
        tracker: torrent.tracker,
        cached: torrent.cached,
        publishDate: torrent.publishDate,
        timestamp: Date.now()
      };

      const updated = [entry, ...libraryList];
      setLibraryList(updated);
      localStorage.setItem('premium_search_library', JSON.stringify(updated));
      triggerToast('Added to your Library!', 'success');
      syncToCloud(updated, continueWatchingList); // Sync to Premiumize Cloud
    }
  };

  // --- Custom Playlists Logic ---
  const createPlaylistAndAdd = (name, track) => {
    if (!name.trim()) return;
    if (playlists.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      triggerToast("A playlist with that name already exists.", "error");
      return;
    }
    const newPl = {
      name: name.trim(),
      tracks: [
        {
          name: track.displayName || track.name.split('/').pop(),
          link: track.link,
          size: track.size || 0,
          torrent: track.torrent || activeAudioTorrent // Store the parent torrent
        }
      ]
    };
    const updated = [...playlists, newPl];
    setPlaylists(updated);
    localStorage.setItem('premium_search_playlists', JSON.stringify(updated));
    setPlaylistSelectionTrack(null);
    triggerToast(`Added to new playlist "${name}"!`, "success");
  };

  const addTrackToPlaylist = (name, track) => {
    const updated = playlists.map(p => {
      if (p.name === name) {
        // Prevent duplicates inside the playlist
        const exists = p.tracks.some(t => cleanUrl(t.link) === cleanUrl(track.link));
        if (exists) {
          triggerToast("This track is already in the playlist.", "error");
          return p;
        }
        return {
          ...p,
          tracks: [
            ...p.tracks,
            {
              name: track.displayName || track.name.split('/').pop(),
              link: track.link,
              size: track.size || 0,
              torrent: track.torrent || activeAudioTorrent
            }
          ]
        };
      }
      return p;
    });
    
    // Check if it was actually added (didn't return early due to duplicates)
    const targetPl = playlists.find(p => p.name === name);
    const updatedPl = updated.find(p => p.name === name);
    if (targetPl && updatedPl && updatedPl.tracks.length > targetPl.tracks.length) {
      triggerToast(`Added to playlist "${name}"!`, "success");
      setPlaylistSelectionTrack(null);
    }
    
    setPlaylists(updated);
    localStorage.setItem('premium_search_playlists', JSON.stringify(updated));
  };

  const removeTrackFromPlaylist = (playlistName, trackIndex) => {
    const updated = playlists.map(p => {
      if (p.name === playlistName) {
        return {
          ...p,
          tracks: p.tracks.filter((_, idx) => idx !== trackIndex)
        };
      }
      return p;
    });
    setPlaylists(updated);
    localStorage.setItem('premium_search_playlists', JSON.stringify(updated));
    triggerToast("Track removed from playlist.", "success");
  };

  const deletePlaylist = (playlistName) => {
    const updated = playlists.filter(p => p.name !== playlistName);
    setPlaylists(updated);
    localStorage.setItem('premium_search_playlists', JSON.stringify(updated));
    triggerToast(`Playlist "${playlistName}" deleted.`, "success");
  };

  const playPlaylist = async (playlist) => {
    if (playlist.tracks.length === 0) {
      triggerToast("This playlist has no tracks.", "error");
      return;
    }
    
    setPlayerLoading(true);
    setActiveAudioTorrent({ title: `Playlist: ${playlist.name}`, category: 'Music' }); // Set virtual torrent
    setSelectedAudioFile(null);
    setAudioPlayableFiles([]);
    setResumeAudioTime(0);
    
    try {
      triggerToast("🔄 Resolving latest Premiumize CDN links for playlist...", "success");
      
      // 1. Identify all unique parent torrents in the playlist
      const uniqueTorrentsMap = {};
      playlist.tracks.forEach(track => {
        if (track.torrent) {
          const id = track.torrent.infoHash || track.torrent.magnet || track.torrent.torrentFile;
          if (id) {
            uniqueTorrentsMap[id] = track.torrent;
          }
        }
      });
      
      const uniqueTorrents = Object.values(uniqueTorrentsMap);
      
      // 2. Fetch fresh CDN links for all these torrents in parallel!
      const resolvedTorrents = {};
      await Promise.all(
        uniqueTorrents.map(async (torrent) => {
          const downloadSource = torrent.magnet || torrent.torrentFile;
          if (!downloadSource) return;
          
          try {
            const res = await fetchWithCredentials('/api/stream-links', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ magnet: downloadSource, password: torrent.password })
            });
            
            if (res.ok) {
              const data = await res.json();
              if (data.status === 'success' && data.files) {
                const id = torrent.infoHash || torrent.magnet || torrent.torrentFile;
                resolvedTorrents[id] = data.files;
              }
            }
          } catch (e) {
            console.error(`Error resolving links for torrent ${torrent.title}:`, e.message);
          }
        })
      );
      
      // 3. Re-assemble the playlist tracks with fresh CDN links!
      const freshTracks = playlist.tracks.map(track => {
        const id = track.torrent?.infoHash || track.torrent?.magnet || track.torrent?.torrentFile;
        const parentFiles = resolvedTorrents[id];
        
        let freshLink = track.link; // Fallback
        if (parentFiles) {
          // Match by filename
          const cleanName = (url) => {
            try {
              return decodeURIComponent(url).split('/').pop().split('?')[0].toLowerCase();
            } catch(e) {
              return url.split('/').pop().split('?')[0].toLowerCase();
            }
          };
          const targetName = cleanName(track.link);
          const matchedFile = parentFiles.find(f => cleanName(f.link) === targetName);
          if (matchedFile) {
            freshLink = matchedFile.link;
          }
        }
        
        return {
          name: track.name,
          link: freshLink,
          size: track.size,
          torrent: track.torrent // Maintain original torrent object
        };
      });
      
      setAudioPlayableFiles(freshTracks);
      setSelectedAudioFile(freshTracks[0]);
      
    } catch (err) {
      console.error("Failed to play playlist:", err);
      triggerToast("Failed to resolve streaming links for this playlist.", "error");
    } finally {
      setPlayerLoading(false);
    }
  };

  // Delete individual query pill from history
  const deleteHistoryItem = (e, queryToRemove) => {
    e.stopPropagation(); // Avoid triggering search when clicking the X
    const updated = recentSearches.filter(q => q !== queryToRemove);
    setRecentSearches(updated);
    localStorage.setItem('premium_search_recent_queries', JSON.stringify(updated));
    triggerToast('Search term removed from history.', 'success');
  };

  // Clear local search histories
  const clearHistory = async () => {
    localStorage.removeItem('premium_search_recent_queries');
    localStorage.removeItem('premium_search_downloads');
    localStorage.removeItem('premium_search_continue_watching');
    localStorage.removeItem('premium_search_library');
    setRecentSearches([]);
    setRecentDownloads([]);
    setContinueWatchingList([]);
    setLibraryList([]);
    
    try {
      // Overwrite the cloud sync file with empty states to purge data on Premiumize
      await fetchWithCredentials('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryList: [], continueWatchingList: [] })
      });
      setLastSynced(new Date());
      triggerToast('All local logs and Premiumize Cloud records cleared successfully!', 'success');
    } catch (err) {
      console.error('Failed to clear cloud sync:', err.message);
      triggerToast('Local logs cleared, but cloud sync wipe encountered an error.', 'error');
    }
  };

  // Filter category list based on adult toggle setting
  const visibleCategories = CATEGORIES.filter(c => !(c === 'Adult' && hideAdult));

  // --- Filtering & Sorting Machinery (Real-Time Frontend Calculations) ---
  
  const getSortedResults = () => {
    return [...results].sort((a, b) => {
      const isUsenet = searchMode === 'usenet' || a.nzbUrl !== undefined;
      
      switch (sortBy) {
        case 'cached-seeders':
          if (isUsenet) {
            return (Number(b.grabs) || 0) - (Number(a.grabs) || 0);
          }
          if (a.cached && !b.cached) return -1;
          if (!a.cached && b.cached) return 1;
          return (Number(b.seeders) || 0) - (Number(a.seeders) || 0);
        case 'seeders':
          if (isUsenet) {
            return (Number(b.grabs) || 0) - (Number(a.grabs) || 0);
          }
          return (Number(b.seeders) || 0) - (Number(a.seeders) || 0);
        case 'size-desc':
          return b.size - a.size;
        case 'size-asc':
          return a.size - b.size;
        case 'date':
          if (isUsenet) {
            return (Number(a.ageDays) || 0) - (Number(b.ageDays) || 0);
          }
          return new Date(b.publishDate || 0) - new Date(a.publishDate || 0);
        default:
          return 0;
      }
    });
  };

  const getFilteredResults = () => {
    const sorted = getSortedResults();
    
    return sorted.filter(item => {
      const isUsenet = searchMode === 'usenet' || item.nzbUrl !== undefined;
      
      // 1. Resolution / Quality filter
      if (filterQuality !== 'All') {
        const titleLower = item.title.toLowerCase();
        if (filterQuality === '4K' && !/\b(4k|2160p|uhd)\b/i.test(titleLower)) return false;
        if (filterQuality === '1080p' && !/\b(1080p|fhd)\b/i.test(titleLower)) return false;
        if (filterQuality === '720p' && !/\b(720p|hd)\b/i.test(titleLower)) return false;
      }

      // 2. Max Size filter
      if (filterMaxSize < 100) {
        const maxBytes = filterMaxSize * 1024 * 1024 * 1024;
        if (item.size > maxBytes) return false;
      }

      // 3. Min Seeders filter (Skip for Usenet NZBs)
      if (!isUsenet && item.seeders < filterMinSeeders) return false;

      // 4. Excluded Keywords filter
      if (excludeKeywords.trim()) {
        const titleLower = item.title.toLowerCase();
        const keywords = excludeKeywords.toLowerCase().split(',').map(kw => kw.trim()).filter(Boolean);
        if (keywords.some(kw => titleLower.includes(kw))) return false;
      }

      return true;
    });
  };

  // Filter ROM files alphabetically by their clean file name
  const filteredRetroFiles = retroPlayableFiles
    .map(f => ({ ...f, displayName: f.name.split('/').pop() }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true, sensitivity: 'base' }))
    .filter(f => f.displayName.toLowerCase().includes(retroSearchQuery.toLowerCase()));

  // Filter EBook files alphabetically by their clean file name
  const filteredEbookFiles = ebookPlayableFiles
    .map(f => ({ ...f, displayName: f.name.split('/').pop() }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true, sensitivity: 'base' }))
    .filter(f => f.displayName.toLowerCase().includes(ebookSearchQuery.toLowerCase()));

  // Filter Audio files by their clean file name, sorted by folder path hierarchy
  const filteredAudioFiles = audioPlayableFiles
    .map(f => ({ ...f, displayName: f.name.split('/').pop() }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), undefined, { numeric: true, sensitivity: 'base' }))
    .filter(f => f.displayName.toLowerCase().includes(audioSearchQuery.toLowerCase()));

  // Filter library items by active sub-tab category shelf
  const filteredLibraryList = libraryList.filter(item => {
    // Globally hide adult items from library views if adult settings are hidden/locked
    if (item.category === 'Adult' && (!adultControlsUnlocked || hideAdult)) {
      return false;
    }
    if (librarySubTab === 'All') return true;
    if (librarySubTab === 'Other') {
      return item.category === 'Other' || item.category === 'Music';
    }
    return item.category === librarySubTab;
  });

  const processedResults = getFilteredResults();
  
  // Calculate cached count for stats indicator
  const cachedCount = processedResults.filter(item => item.cached).length;

  return (
    <div className="app-container">
      
      {/* Toast Notification Banner */}
      {toast && (
        <div className={`toast-notification toast-${toast.type}`}>
          <div className="toast-icon">{toast.type === 'success' ? '✨' : '⚠️'}</div>
          <div className="toast-text">{toast.message}</div>
        </div>
      )}

      {/* Header Panel */}
      <header className="app-header">
        <div className="logo-group" onClick={handleLogoClick} style={{ cursor: 'pointer' }} title="Premio">
          <div className="logo-glow-sphere"></div>
          <div className="logo-bolt">⚡</div>
          <h1>Premio</h1>
        </div>
        <p className="app-tagline">Real-Time Premiumize & Usenet (Newznab) Aggregator • Personal Cloud Media Center</p>

        {/* Global Toolbar */}
        <div className="header-actions">
          <div className="theme-selector-container" style={{ marginRight: '0.5rem' }}>
            <select 
              value={selectedTheme} 
              onChange={(e) => setSelectedTheme(e.target.value)} 
              className="theme-dropdown-select"
              title="Switch Ambient UI Theme Preset"
            >
              <option value="midnight-nebula">🌌 Midnight Nebula</option>
              <option value="nordic-frost">🧊 Nordic Frost</option>
              <option value="retro-synthwave">🍊 Retro Synthwave</option>
              <option value="obsidian-slate">🪵 Obsidian Slate</option>
            </select>
          </div>

          <button
            className={`action-btn ${isSyncing ? 'loading' : ''}`}
            onClick={syncFromCloud}
            disabled={isSyncing}
            title="Sync your Library and checkpoints with Premiumize Cloud"
          >
            {isSyncing ? '🔄 Syncing...' : lastSynced ? '☁️ Cloud Synced' : '☁️ Cloud Sync'}
          </button>
          
          <button 
            className={`action-btn ${showSettings ? 'active' : ''}`} 
            onClick={() => {
              setShowSettings(!showSettings);
              if (showFilters) setShowFilters(false);
            }}
            aria-label="Toggle Settings"
            id="btn-settings"
          >
            ⚙️ Settings
          </button>
        </div>
      </header>

      {/* Core Room Navigation Tabs */}
      <nav className="room-navigation glass-panel">
        <button 
          className={`nav-tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          🔍 Searcher
        </button>
        <button 
          className={`nav-tab ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          ⭐ My Library <span className="nav-badge">{libraryList.filter(item => !(item.category === 'Adult' && (!adultControlsUnlocked || hideAdult))).length}</span>
        </button>
        <button 
          className={`nav-tab ${activeTab === 'progress' ? 'active' : ''}`}
          onClick={() => setActiveTab('progress')}
        >
          ⏱️ Continue... <span className="nav-badge">{continueWatchingList.length}</span>
        </button>
        <button 
          className={`nav-tab ${activeTab === 'cloud' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('cloud');
            fetchCloudFolder(null);
            fetchAccountQuota();
          }}
        >
          📊 Cloud Files
        </button>
        <button 
          className={`nav-tab ${activeTab === 'transfers' ? 'active' : ''}`}
          onClick={() => setActiveTab('transfers')}
        >
          ⚡ Active Downloads
        </button>
      </nav>

      <main className="app-main">
        
        {/* Settings Expander Card */}
        {showSettings && (
          <section className="settings-card glass-panel fade-in" id="settings-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
              <h2 style={{ margin: 0 }}>⚙️ Control Panel</h2>
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
                💡 Run Setup Guide / Onboarding
              </button>
            </div>
            <div className="settings-grid">
              
              {/* Premiumize API Key Input */}
              <div className="setting-item full-width-field">
                <div className="setting-info">
                  <h3>Premiumize API Key</h3>
                  <p>Required for stream link generation, CDN cache status checks, and cloud sync features.</p>
                </div>
                <input 
                  type="password" 
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
                  type="text" 
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
                    type="password" 
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
                  {showJackettGuide ? '📖 Hide Setup Guide' : '📖 How do I set up Jackett?'}
                </button>
                {showJackettGuide && (
                  <div className="onboarding-guide-box glass-panel fade-in" style={{ marginTop: '10px', padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', borderLeft: '3px solid var(--color-primary)' }}>
                    <p style={{ margin: '0 0 6px 0', fontWeight: 'bold', color: 'var(--text-primary)' }}>🔌 Quick Start Guide: Setting Up Jackett</p>
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
                        <span>🟢 <b>{idx.name}</b> ({idx.url})</span>
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
                          ✕ Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add New Indexer Panel */}
                <div className="add-indexer-panel" style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', marginTop: '8px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>➕ Add Custom Indexer</span>
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
                      type="password" 
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
                      💾 Add Indexer
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
                      🔍 NZBFinder Free (25 Daily hits)
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
                      🕷️ Usenet-Crawler
                    </button>
                  </div>
                </div>
              </div>

              {/* Privacy Setting Toggle (Only visible if secretly unlocked) */}
              {adultControlsUnlocked && (
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
                  🗑️ Clear Logs
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
                  {isSyncing ? '🔄 Syncing...' : '☁️ Sync Storage Now'}
                </button>
              </div>
            </div>
            
            {/* Privacy Shield Active note (Only visible if secretly unlocked and adult content is enabled) */}
            {adultControlsUnlocked && !hideAdult && (
              <div className="settings-note">
                <span className="badge-shield">🛡️ Privacy Shield Active</span>
                <p>Adult content searches, library additions, and playback progress metrics are strictly excluded from history lists and local browser storage logs, regardless of settings.</p>
              </div>
            )}
          </section>
        )}

        {/* 🔍 tab: Torrent Searcher */}
        {activeTab === 'search' && (
          <>
            {/* Warning Banner when keys are missing */}
            {(!userPmKey || !userJackettUrl) && (
              <div 
                className="mock-mode-warning-banner glass-panel fade-in" 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 18px',
                  borderRadius: '12px',
                  marginBottom: '16px',
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  fontSize: '0.85rem',
                  lineHeight: '1.4',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                  <div style={{ color: 'var(--text-muted)' }}>
                    {!userPmKey && !userJackettUrl ? (
                      <>
                        <strong>Setup Required:</strong> Premiumize API Key and Jackett URL are not configured. The app is running in <strong>Developer Mock Mode</strong> returning simulated results.
                      </>
                    ) : !userPmKey ? (
                      <>
                        <strong>Premiumize Key Missing:</strong> A Premiumize API key is required to check file cache status and stream media.
                      </>
                    ) : (
                      <>
                        <strong>Jackett Server Unconfigured:</strong> Jackett configuration is missing. Torrent search results are simulated.
                      </>
                    )}
                  </div>
                </div>
                <button 
                  type="button" 
                  className="action-btn"
                  onClick={() => {
                    setShowOnboarding(true);
                    setOnboardingStep(1);
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.75rem',
                    whiteSpace: 'nowrap',
                    background: 'linear-gradient(135deg, var(--color-primary) 0%, #4f46e5 100%)'
                  }}
                >
                  Configure Now ➔
                </button>
              </div>
            )}
            <section 
              className={`search-card glass-panel ${isDragging ? 'dragging-active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragging && (
                <div className="drag-drop-overlay">
                  <div className="overlay-content">
                    <div className="overlay-icon">📂</div>
                    <h3>Drop your Torrent or NZB file here</h3>
                    <p>Premio will parse it, check Premiumize CDN cache status instantly, and present it inside the search list!</p>
                  </div>
                </div>
              )}
              <form onSubmit={handleSearch} className="search-form">
                
                {/* Category Selectors */}
                <div className="category-pill-box">
                  {visibleCategories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      className={`category-pill ${category === cat ? 'active' : ''}`}
                      onClick={() => setCategory(cat)}
                      id={`cat-pill-${cat.toLowerCase()}`}
                    >
                      {cat === 'Movies' && '🎬'}
                      {cat === 'TV' && '📺'}
                      {cat === 'Music' && '🎵'}
                      {cat === 'Audiobooks' && '🎧'}
                      {cat === 'Ebooks' && '📚'}
                      {cat === 'Software' && '💾'}
                      {cat === 'VST' && '🎛️'}
                      {cat === 'Adult' && '🔞'}
                      {cat === 'Other' && '📦'}
                      {cat === 'Retro Games' && '🎮'}
                      <span className="pill-text">{cat}</span>
                    </button>
                  ))}
                </div>
                
                {/* Search Source Selector (Segmented button group) */}
                <div className="search-mode-segmented-box">
                  <button
                    type="button"
                    className={`search-mode-btn ${searchMode === 'torrent' ? 'active' : ''}`}
                    onClick={() => {
                      setSearchMode('torrent');
                      if (searched && query.trim()) {
                        setTimeout(() => handleSearch(null, 'torrent'), 50);
                      }
                    }}
                  >
                    🟢 Torrents (PM CDN Cache)
                  </button>
                  <button
                    type="button"
                    className={`search-mode-btn ${searchMode === 'usenet' ? 'active' : ''}`}
                    onClick={() => {
                      setSearchMode('usenet');
                      if (searched && query.trim()) {
                        setTimeout(() => handleSearch(null, 'usenet'), 50);
                      }
                    }}
                  >
                    ⚡ Usenet (Double Points Cost)
                  </button>
                  <button
                    type="button"
                    className={`search-mode-info-btn ${!hideUsenetWarning ? 'active' : ''}`}
                    onClick={() => {
                      const next = !hideUsenetWarning;
                      setHideUsenetWarning(next);
                      localStorage.setItem('premio_hide_usenet_warning', next ? 'true' : 'false');
                    }}
                    title="Toggle Usenet Fair-Use points caution panel"
                  >
                    {hideUsenetWarning ? '💡 Show Info' : '💡 Hide Info'}
                  </button>
                </div>

                {/* 📂 Drag-and-Drop & Paste Importer Panel */}
                <div className="importer-inline-bar">
                  <div className="importer-divider">
                    <span>— OR IMPORT DIRECTLY —</span>
                  </div>
                  <div className="importer-controls">
                    <div className="file-uploader-wrapper">
                      <label className="file-uploader-btn">
                        📥 Upload Torrent or NZB File
                        <input
                          type="file"
                          accept=".torrent,.nzb"
                          onChange={handleImportFile}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </div>
                    <div className="magnet-paster-wrapper">
                      <input
                        type="text"
                        value={magnetInput}
                        onChange={(e) => setMagnetInput(e.target.value)}
                        placeholder="🔗 Paste Magnet Link..."
                        className="magnet-input-field"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault(); // Stop main search form submission!
                            handleImportMagnet(); // Fire parser check immediately!
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleImportMagnet}
                        className="magnet-submit-btn"
                      >
                        ⚡ Parse & Check Cache
                      </button>
                    </div>
                  </div>
                </div>

                {/* Input and Search Button */}
                <div className="search-row">
                  <div className="input-container">
                    <span className="input-search-icon">🔍</span>
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`Search for ${category.toLowerCase()}... (e.g. ${
                        category === 'Movies' ? 'Oppenheimer' : 
                        category === 'TV' ? 'Succession' : 
                        category === 'Music' ? 'Daft Punk' : 
                        category === 'Audiobooks' ? 'Andy Weir' : 
                        category === 'Ebooks' ? 'Pragmatic Programmer' : 
                        category === 'Other' ? 'Ableton VST Bundle' : 
                        category === 'Retro Games' ? 'Super Mario World' : 'Adult Release'
                      })`}
                      required
                      className="search-input"
                      id="search-input-field"
                    />
                    {query && (
                      <button type="button" className="clear-input-btn" onClick={() => setQuery('')}>
                        ✕
                      </button>
                    )}
                  </div>
                  
                  <button 
                    type="button" 
                    className={`filter-toggle-btn ${showFilters ? 'active' : ''} ${results.length > 0 ? 'glowing' : ''}`}
                    onClick={() => {
                      setShowFilters(!showFilters);
                      if (showSettings) setShowSettings(false);
                    }}
                    title="Filters and Sorting Settings"
                  >
                    🎛️ Filters
                  </button>

                  <button type="submit" className="search-submit-btn" disabled={loading} id="btn-submit-search">
                    {loading ? <span className="spinner-micro"></span> : 'Search'}
                  </button>
                </div>
              </form>

              {/* Search History quick shortcuts with individual delete 'x' button (Filtered: no adult queries will ever be displayed here) */}
              {recentSearches.length > 0 && (
                <div className="recent-searches-row">
                  <span className="recent-title">Recent searches:</span>
                  <div className="recent-tags">
                    {recentSearches.map((q, idx) => (
                      <div key={idx} className="recent-tag-wrapper">
                        <button
                          type="button"
                          className="recent-tag-btn"
                          onClick={() => {
                            setQuery(q);
                            setTimeout(() => document.getElementById('btn-submit-search')?.click(), 50);
                          }}
                        >
                          {q}
                        </button>
                        <button
                          type="button"
                          className="recent-tag-remove"
                          onClick={(e) => deleteHistoryItem(e, q)}
                          title={`Remove "${q}" from history`}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Advanced Collapsible Filters and Sorting Drawer */}
              {showFilters && (
                <div className="filters-drawer glass-inner-panel fade-in">
                  <h3>🎛️ Search Filters & Sorting</h3>
                  <div className="filters-grid">
                    
                    {/* 1. Quality dropdown */}
                    <div className="filter-group">
                      <label htmlFor="filter-quality">Resolution / Quality</label>
                      <select 
                        id="filter-quality" 
                        value={filterQuality} 
                        onChange={(e) => setFilterQuality(e.target.value)}
                        className="filter-select"
                      >
                        <option value="All">All Qualities</option>
                        <option value="4K">4K UHD (2160p)</option>
                        <option value="1080p">Full HD (1080p)</option>
                        <option value="720p">HD (720p)</option>
                      </select>
                    </div>

                    {/* 2. Sort dropdown */}
                    <div className="filter-group">
                      <label htmlFor="filter-sort">Sort Ordering</label>
                      <select 
                        id="filter-sort" 
                        value={sortBy} 
                        onChange={(e) => setSortBy(e.target.value)}
                        className="filter-select"
                      >
                        <option value="cached-seeders">Cached + Seeders (Default)</option>
                        <option value="seeders">Seeders count</option>
                        <option value="size-desc">Size: Large → Small</option>
                        <option value="size-asc">Size: Small → Large</option>
                        <option value="date">Age: Newest first</option>
                      </select>
                    </div>

                    {/* 3. Max Size Slider */}
                    <div className="filter-group">
                      <div className="slider-label-row">
                        <label htmlFor="filter-size">Max File Size</label>
                        <span className="slider-value">
                          {filterMaxSize >= 100 ? 'Unlimited' : `${filterMaxSize} GB`}
                        </span>
                      </div>
                      <input
                        type="range"
                        id="filter-size"
                        min="1"
                        max="100"
                        value={filterMaxSize}
                        onChange={(e) => setFilterMaxSize(Number(e.target.value))}
                        className="filter-slider"
                      />
                    </div>

                    {/* 4. Min Seeders Slider */}
                    <div className="filter-group">
                      <div className="slider-label-row">
                        <label htmlFor="filter-seeders">Min Seeders</label>
                        <span className="slider-value">
                          {filterMinSeeders === 0 ? 'Any' : `${filterMinSeeders}+`}
                        </span>
                      </div>
                      <input
                        type="range"
                        id="filter-seeders"
                        min="0"
                        max="50"
                        value={filterMinSeeders}
                        onChange={(e) => setFilterMinSeeders(Number(e.target.value))}
                        className="filter-slider"
                      />
                    </div>

                    {/* 5. Exclude keywords */}
                    <div className="filter-group full-width">
                      <label htmlFor="filter-exclude">Exclude Keywords</label>
                      <input
                        type="text"
                        id="filter-exclude"
                        value={excludeKeywords}
                        onChange={(e) => setExcludeKeywords(e.target.value)}
                        placeholder="Enter keywords to hide, comma separated (e.g. CAM, HC, 3D, German)"
                        className="filter-text-input"
                      />
                    </div>

                  </div>

                  {/* Reset Filters trigger */}
                  <div className="filters-footer">
                    <button
                      type="button"
                      className="reset-filters-btn"
                      onClick={() => {
                        setFilterQuality('All');
                        setFilterMaxSize(100);
                        setFilterMinSeeders(0);
                        setExcludeKeywords('');
                        setSortBy('cached-seeders');
                        triggerToast('Filters reset.', 'success');
                      }}
                    >
                      🔄 Reset Filters
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* ⚠️ Usenet Fair-Use points caution banner */}
            {searchMode === 'usenet' && !hideUsenetWarning && (
              <div className="usenet-points-warning glass-panel fade-in">
                <div className="warning-icon-col">⚠️</div>
                <div className="warning-text-col">
                  <h3>Usenet Fair-Use Points Notice</h3>
                  <p>
                    Adding a release from Usenet is a <strong>double-cost</strong> points transaction on Premiumize:
                  </p>
                  <ul>
                    <li>
                      <strong>1 point per GB</strong> to cache the release from Usenet to your cloud locker.
                    </li>
                    <li>
                      <strong>1 point per GB</strong> to download or stream the cached file to your local player.
                    </li>
                    <li>
                      <strong>Total cost = 2 points per GB</strong> (compared to cached torrents which only cost 1 point per GB to stream).
                    </li>
                  </ul>
                  <p className="warning-tip">
                    Prioritize free cached torrents (marked with glowing 🟢 Instant DL badges) to conserve your daily points balance!
                  </p>
                </div>
                <button
                  type="button"
                  className="close-warning-btn"
                  onClick={() => {
                    setHideUsenetWarning(true);
                    localStorage.setItem('premio_hide_usenet_warning', 'true');
                    triggerToast('Usenet point warning dismissed. Review at any time by toggling the 💡 button.', 'success');
                  }}
                  title="Dismiss warning permanently"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Results Grid display */}
            <section className="results-container">
              {loading ? (
                /* Shimmer loading skeleton */
                <div className="loading-grid">
                  {[1, 2, 3, 4].map(n => (
                    <div key={n} className="loading-row-skeleton glass-panel">
                      <div className="shimmer-title"></div>
                      <div className="shimmer-badges">
                        <div className="shimmer-badge"></div>
                        <div className="shimmer-badge"></div>
                      </div>
                      <div className="shimmer-footer"></div>
                    </div>
                  ))}
                </div>
              ) : results.length > 0 ? (
                <div className="results-list">
                  <div className="results-header-row">
                    <div className="results-header">
                      <h2>🔍 Search Results ({processedResults.length})</h2>
                      <span className="results-subtitle">
                        Sorted by: <strong>{
                          sortBy === 'cached-seeders' ? (searchMode === 'usenet' ? 'NZB Grabs' : 'Instant Cached first, then Seeders') :
                          sortBy === 'seeders' ? (searchMode === 'usenet' ? 'NZB Grabs' : 'Health / Seeders') :
                          sortBy === 'size-desc' ? 'Size (Large → Small)' :
                          sortBy === 'size-asc' ? 'Size (Small → Large)' : 'Release Age (Newest)'
                        }</strong>
                      </span>
                    </div>
                    
                    <div className="stats-badges">
                      {searchMode === 'usenet' ? (
                        <span className="stat-badge stat-badge-usenet">
                          ⚡ {processedResults.length} Usenet NZB Releases
                        </span>
                      ) : (
                        <>
                          <span className="stat-badge stat-badge-cached">
                            ⚡ {cachedCount} Cached
                          </span>
                          {processedResults.length !== results.length && (
                            <span className="stat-badge stat-badge-filtered">
                              ⚠️ {results.length - processedResults.length} Filtered
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline Usenet Suggestion Banner (when no torrents are cached) */}
                  {searchMode === 'torrent' && cachedCount === 0 && (
                    <div className="usenet-suggestion-banner glass-panel fade-in">
                      <span className="suggestion-icon">💡</span>
                      <div className="suggestion-text">
                        <h4>No globally cached torrents found for this search</h4>
                        <p>
                          Downloading uncached torrents on Premiumize can take time. 
                          You can search Usenet instead, which is often extremely fast and complete!
                        </p>
                      </div>
                      <button
                        type="button"
                        className="usenet-switch-inline-btn active"
                        onClick={() => {
                          setSearchMode('usenet');
                          setTimeout(() => handleSearch(null, 'usenet'), 50);
                        }}
                      >
                        ⚡ Search Usenet (Indexers)
                      </button>
                    </div>
                  )}
                  
                  {processedResults.length === 0 ? (
                    <div className="empty-state glass-panel">
                      <div className="empty-icon">🎛️</div>
                      <h2>No items match active filters</h2>
                      <p>Try adjusting your parameters in the filters panel above.</p>
                    </div>
                  ) : (
                    <div className="results-grid">
                      {processedResults.map((item, idx) => {
                        const isUsenetItem = item.nzbUrl !== undefined;
                        const qualityTags = extractQuality(item.title);
                        
                        const downloadSource = isUsenetItem ? item.nzbUrl : (item.magnet || item.torrentFile);
                        const itemIdentifier = isUsenetItem ? item.nzbUrl : (item.infoHash || item.magnet || item.torrentFile);
                        const isDownloading = activeDownloadId !== null && activeDownloadId === itemIdentifier;
                        const inLib = isItemInLibrary(item);
                        const meta = getMetadata(item);
                        
                        // Fallback to Usenet indexer custom cover art if TMDb poster is unavailable
                        const hasPoster = meta?.poster || item.coverurl;
                        const posterSrc = meta?.poster || item.coverurl;
                        
                        return (
                          <article key={idx} className={`result-card glass-panel ${isUsenetItem ? 'usenet-hit' : (item.cached ? 'cached-hit' : 'cached-miss')} ${hasPoster ? 'has-poster' : ''}`}>
                            {hasPoster && (
                              <div className="card-poster-col" onClick={() => setMetadataDrawerItem({ ...item, _metadata: meta || { poster: item.coverurl, title: item.title, overview: 'Usenet NZB Cover Art' } })}>
                                <img src={posterSrc} alt="" className="card-poster-img" loading="lazy" />
                              </div>
                            )}
                            <div className="card-content-col">
                            <div className="card-top">
                              <h3 className="result-title" title={item.title}>
                                {item.title}
                              </h3>
                              {meta && (
                                <div className="meta-info-row">
                                  {meta.voteAverage && <span className="meta-rating-badge" title="TMDb Rating">⭐ {meta.voteAverage.toFixed(1)}</span>}
                                  {meta.rating && <span className="meta-rating-badge" title="Rating">⭐ {meta.rating}</span>}
                                  {meta.genres && meta.genres.length > 0 && meta.genres.slice(0, 2).map((g, gi) => (
                                    <span key={gi} className="meta-genre-tag">{g}</span>
                                  ))}
                                  {meta.artist && <span className="meta-artist-tag">🎤 {meta.artist}</span>}
                                  {meta.author && <span className="meta-artist-tag">✍️ {meta.author}</span>}
                                  {meta.year && <span className="meta-year-tag">📅 {meta.year}</span>}
                                  <button className="meta-info-btn" onClick={(e) => { e.stopPropagation(); setMetadataDrawerItem({ ...item, _metadata: meta }); }} title="View full metadata details">
                                    ℹ️ Info
                                  </button>
                                </div>
                              )}
                              
                              {qualityTags.length > 0 && (
                                <div className="quality-tags">
                                  {qualityTags.map((tag, tagIdx) => (
                                    <span key={tagIdx} className={`quality-badge q-${tag.type}`}>
                                      {tag.text}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
 
                            <div className="card-middle">
                              <div className="stats-row">
                                <span className="stat-item" title="Size">
                                  💾 {formatBytes(item.size)}
                                </span>
                                {isUsenetItem ? (
                                  <>
                                    <span className={`stat-item ${item.ageDays > 3000 ? 'text-red' : 'text-purple'}`} title="Usenet Age">
                                      📅 {item.ageDays} days old {item.ageDays > 3000 && <span className="extreme-age-badge" title="Retention limit warn">⚠️ Old</span>}
                                    </span>
                                    <span className="stat-item text-blue" title="NZB Grabs">
                                      📥 {item.grabs} grabs
                                    </span>
                                    {item.password && (
                                      <span className="stat-item text-amber" title={`Password: ${item.password}`}>
                                        🔑 PW: {item.password}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <span className="stat-item text-green" title="Seeders">
                                      🟢 {item.seeders} <span className="stat-label">seeds</span>
                                    </span>
                                    <span className="stat-item text-grey" title="Peers">
                                      🔵 {item.peers} <span className="stat-label">peers</span>
                                    </span>
                                  </>
                                )}
                              </div>

                              {/* 🩺 Usenet Health Predictor Widget */}
                              {isUsenetItem && item.health !== undefined && (
                                <div className="health-predict-bar-container" title={`Usenet Completion Health: ${item.health}% (${item.health >= 90 ? 'Excellent' : item.health >= 70 ? 'Moderate' : 'Risk of Incomplete'})`}>
                                  <div className="health-predict-label">
                                    <span>🩺 Usenet Health:</span>
                                    <span className={`health-value ${item.health >= 90 ? 'green' : item.health >= 70 ? 'amber' : 'red'}`}>{item.health}%</span>
                                  </div>
                                  <div className="health-progress-bg">
                                    <div 
                                      className={`health-progress-fill ${item.health >= 90 ? 'green' : item.health >= 70 ? 'amber' : 'red'}`}
                                      style={{ width: `${item.health}%` }}
                                    ></div>
                                  </div>
                                  <span className="health-tooltip-text">
                                    {item.health >= 90 ? '🟢 High completion likelihood. Grab counts verify stability.' : 
                                     item.health >= 70 ? '🟡 Moderate completion likelihood. Older post or lower grabs.' : 
                                     '🔴 Risk of incomplete blocks. Password or retention takedown danger.'}
                                  </span>
                                </div>
                              )}

                              <div className="meta-row">
                                <span className="tracker-name">
                                  {isUsenetItem ? `⚡ ${item.indexer || 'Usenet'}` : `🏷️ ${item.tracker}`}
                                </span>
                                {!isUsenetItem && item.publishDate && (
                                  <span className="publish-date">
                                    📅 {new Date(item.publishDate).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
 
                            <div className="card-actions">
                              
                              {/* Add / Remove from My Library */}
                              <button
                                className={`cache-badge badge-library ${inLib ? 'active' : ''}`}
                                onClick={() => toggleLibraryItem(item)}
                                title={inLib ? "Remove from Library" : "Add to Library"}
                              >
                                {inLib ? '⭐ In Library' : '☆ Add to Library'}
                              </button>
 
                              {/* Playback triggers (Torrents cached hits only!) */}
                              {!isUsenetItem && item.cached && (
                                (category === 'Retro Games' || getEmulatorSystem(item.title) || item.category === 'Retro Games') ? (
                                  <button
                                    className="cache-badge badge-arcade hover-action"
                                    onClick={() => startRetroPlayer(item)}
                                    disabled={playerLoading}
                                    title="Instant play retro game in browser arcade"
                                    id={`btn-arcade-${idx}`}
                                  >
                                    🎮 Play Retro ROM
                                  </button>
                                ) : (category === 'Ebooks' || item.category === 'Ebooks' || item.title.toLowerCase().endsWith('.epub') || item.title.toLowerCase().endsWith('.pdf')) ? (
                                  <button
                                    className="cache-badge badge-ebook hover-action"
                                    onClick={() => startEbookPlayer(item)}
                                    disabled={playerLoading}
                                    title="Open ebook in direct browser reader"
                                    id={`btn-ebook-${idx}`}
                                  >
                                    📖 Read Book
                                  </button>
                                ) : (category === 'Audiobooks' || category === 'Music' || item.category === 'Audiobooks' || item.category === 'Music') ? (
                                  <button
                                    className="cache-badge badge-listen hover-action"
                                    onClick={() => startAudioPlayer(item)}
                                    disabled={playerLoading}
                                    title="Open audio track in direct browser player"
                                    id={`btn-audio-${idx}`}
                                  >
                                    🎧 Listen Now
                                  </button>
                                ) : (category === 'Software' || category === 'Other' || category === 'VST' || item.category === 'Software' || item.category === 'Other' || item.category === 'VST') ? (
                                  <button
                                    className="cache-badge badge-download hover-action"
                                    onClick={() => triggerDirectDownload(item)}
                                    disabled={playerLoading}
                                    title="Download directly from high-speed Premiumize CDN without using cloud storage space"
                                    id={`btn-direct-dl-${idx}`}
                                  >
                                    📥 Direct CDN Download
                                  </button>
                                ) : (
                                  <button
                                    className="cache-badge badge-stream hover-action"
                                    onClick={() => startStreaming(item)}
                                    disabled={playerLoading}
                                    title="Instant stream video in web browser or VLC"
                                    id={`btn-stream-${idx}`}
                                  >
                                    🎬 Play Stream
                                  </button>
                                )
                              )}
 
                              {/* Premiumize Cache Status / Usenet Cloud Add Dispatcher */}
                              {isUsenetItem ? (
                                <button
                                  className="cache-badge badge-usenet hover-action"
                                  onClick={() => triggerDownload(item)}
                                  disabled={isDownloading}
                                  title={`Click to send this Usenet NZB release to your Premiumize cloud queue. Consumes ${Math.round(item.size / (1024*1024*1024))} Fair-Use points.`}
                                  id={`btn-dl-usenet-${idx}`}
                                >
                                  {isDownloading ? (
                                    <span className="spinner-micro white"></span>
                                  ) : item.cached ? (
                                    <>
                                      <span className="badge-bullet">🟢</span>
                                      <span className="badge-main-text">Added to Cloud</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="badge-bullet">⚡</span>
                                      <span className="badge-main-text">Add Usenet to Cloud</span>
                                    </>
                                  )}
                                </button>
                              ) : item.cached ? (
                                <button
                                  className="cache-badge badge-cached hover-action"
                                  onClick={() => triggerDownload(item)}
                                  disabled={isDownloading}
                                  title="Cached! Click to instantly send to Premiumize cloud storage"
                                  id={`btn-dl-cached-${idx}`}
                                >
                                  {isDownloading ? (
                                    <span className="spinner-micro white"></span>
                                  ) : (
                                    <>
                                      <span className="badge-bullet">🟢</span>
                                      <span className="badge-main-text">Instant Cached DL</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <button
                                  className="cache-badge badge-uncached"
                                  onClick={() => triggerDownload(item)}
                                  disabled={isDownloading}
                                  title={downloadSource ? "Not Cached. Click to add to Premiumize downloader queue" : "No download URL available"}
                                  id={`btn-dl-uncached-${idx}`}
                                >
                                  {isDownloading ? (
                                    <span className="spinner-micro white"></span>
                                  ) : (
                                    <>
                                      <span className="badge-bullet">⚪</span>
                                      <span className="badge-main-text">Add to Premiumize</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                            </div>{/* close card-content-col */}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : searched ? (
                <div className="empty-state glass-panel usenet-fallback-panel">
                  <div className="empty-icon">📭</div>
                  <h2>No results found</h2>
                  <p>No indexers returned matching releases for "{query}".</p>
                  {searchMode === 'torrent' && (
                    <div className="usenet-fallback-card glass-inner-panel fade-in">
                      <h3>🔍 Search Usenet Indexers?</h3>
                      <p>
                        Usenet is a massive alternative repository that might have this release! 
                        Note: NZB Usenet downloads use Premiumize Fair-Use Points (2 pts/GB total download + stream).
                      </p>
                      <button
                        type="button"
                        className="usenet-fallback-btn active"
                        onClick={() => {
                          setSearchMode('usenet');
                          setTimeout(() => handleSearch(null, 'usenet'), 50);
                        }}
                      >
                        ⚡ Switch and Search Usenet
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Initial welcome guide */
                <div className="welcome-card glass-panel">
                  <h2>⚡ Welcome to Premio</h2>
                  <p>Search torrent databases and Usenet indexers instantly, check Premiumize cached state on-the-fly, and stream at blazing speed.</p>
                  
                  <div className="instructions-grid">
                    <div className="instruction-step">
                      <div className="step-num">1</div>
                      <h4>Search Releases</h4>
                      <p>Type keywords and search Torrents or Usenet instantly.</p>
                    </div>
                    <div className="instruction-step">
                      <div className="step-num">2</div>
                      <h4>Stream or Download</h4>
                      <p>Click <strong>🎬 Play Stream</strong> to watch instantly, or add Usenet NZBs to your cloud in 1-click!</p>
                    </div>
                    <div className="instruction-step">
                      <div className="step-num">3</div>
                      <h4>Build your Library</h4>
                      <p>Save items to your <strong>Library tab</strong> to build a want-to-watch queue.</p>
                    </div>
                  </div>

                  {recentDownloads.length > 0 && (
                    <div className="recent-downloads-section">
                      <h3>📥 Recent Transfers Sent to Cloud</h3>
                      <div className="recent-dl-list">
                        {recentDownloads.map((dl, idx) => (
                          <div key={idx} className="recent-dl-item">
                            <div className="recent-dl-title" title={dl.title}>
                              {dl.title}
                            </div>
                            <div className="recent-dl-details">
                              <span>💾 {formatBytes(dl.size)}</span>
                              <span>⏱️ {new Date(dl.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {/* ⭐ Tab: My Library Bookshelf */}
        {activeTab === 'library' && (
          <section className="library-section fade-in">
            <div className="results-header-row">
              <div className="results-header">
                <h2>⭐ My Library bookshelves ({librarySubTab === 'Playlists' ? playlists.length : filteredLibraryList.length})</h2>
                <span className="results-subtitle">Saved releases and custom playlists</span>
              </div>
            </div>

            {/* Always display the Library category subtabs so they can switch tabs regardless of bookshelf item counts */}
            <div className="library-sub-tabs">
              <button 
                className={`sub-tab ${librarySubTab === 'All' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('All')}
              >
                📂 All ({libraryList.filter(item => !(item.category === 'Adult' && (!adultControlsUnlocked || hideAdult))).length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'Movies' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('Movies')}
              >
                🎬 Movies ({libraryList.filter(item => item.category === 'Movies').length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'TV' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('TV')}
              >
                📺 TV Shows ({libraryList.filter(item => item.category === 'TV').length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'Retro Games' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('Retro Games')}
              >
                🎮 Retro Games ({libraryList.filter(item => item.category === 'Retro Games').length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'Audiobooks' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('Audiobooks')}
              >
                🎧 Audiobooks ({libraryList.filter(item => item.category === 'Audiobooks').length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'Ebooks' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('Ebooks')}
              >
                📚 Ebooks ({libraryList.filter(item => item.category === 'Ebooks').length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'Software' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('Software')}
              >
                💾 Software ({libraryList.filter(item => item.category === 'Software').length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'VST' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('VST')}
              >
                🎛️ VST ({libraryList.filter(item => item.category === 'VST').length})
              </button>
              <button 
                className={`sub-tab ${librarySubTab === 'Other' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('Other')}
              >
                📦 Other ({libraryList.filter(item => item.category === 'Other' || item.category === 'Music').length})
              </button>
              {adultControlsUnlocked && !hideAdult && (
                <button 
                  className={`sub-tab ${librarySubTab === 'Adult' ? 'active' : ''}`}
                  onClick={() => setLibrarySubTab('Adult')}
                >
                  🔞 Adult ({libraryList.filter(item => item.category === 'Adult').length})
                </button>
              )}
              <button 
                className={`sub-tab ${librarySubTab === 'Playlists' ? 'active' : ''}`}
                onClick={() => setLibrarySubTab('Playlists')}
              >
                🎵 Playlists ({playlists.length})
              </button>
            </div>

            {librarySubTab === 'Playlists' ? (
              playlists.length === 0 ? (
                <div className="empty-state glass-panel" style={{ marginTop: '1rem' }}>
                  <div className="empty-icon">🎵</div>
                  <h2>No Playlists Found</h2>
                  <p>Create a playlist by playing an album/audiobook search result, opening the audio player, and clicking the ➕ icon next to any track!</p>
                </div>
              ) : (
                <div className="playlists-grid">
                  {playlists.map((pl, plIdx) => {
                    const totalSize = pl.tracks.reduce((acc, t) => acc + (t.size || 0), 0);
                    return (
                      <div key={plIdx} className="playlist-card glass-panel fade-in">
                        <div className="playlist-card-header">
                          <div className="playlist-header-left">
                            <h3 className="playlist-title">🎵 {pl.name}</h3>
                            <span className="playlist-meta-badge">
                              {pl.tracks.length} track{pl.tracks.length !== 1 ? 's' : ''} • {formatBytes(totalSize)}
                            </span>
                          </div>
                          <div className="playlist-actions">
                            <button 
                              className="playlist-play-btn" 
                              onClick={() => playPlaylist(pl)}
                              title="Stream entire playlist sequentially"
                            >
                              ▶️ Play All
                            </button>
                            <button 
                              className="playlist-delete-btn" 
                              onClick={() => deletePlaylist(pl.name)}
                              title="Delete playlist"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>

                        <div className="playlist-tracks-list">
                          {pl.tracks.map((track, trackIdx) => (
                            <div key={trackIdx} className="playlist-track-item">
                              <div className="track-info">
                                <span className="track-index-badge">{trackIdx + 1}</span>
                                <div className="track-details">
                                  <span className="track-title" title={track.name}>{track.name}</span>
                                  {track.torrent?.title && (
                                    <span className="track-parent-torrent" title={track.torrent.title}>
                                      💿 {track.torrent.title}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="track-meta-actions">
                                <span className="track-size">{formatBytes(track.size)}</span>
                                <button
                                  className="track-remove-btn"
                                  onClick={() => removeTrackFromPlaylist(pl.name, trackIdx)}
                                  title="Remove from playlist"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : libraryList.filter(item => !(item.category === 'Adult' && (!adultControlsUnlocked || hideAdult))).length === 0 ? (
              <div className="empty-state glass-panel" style={{ marginTop: '1rem' }}>
                <div className="empty-icon">⭐</div>
                <h2>Your Library is empty</h2>
                <p>Click "☆ Add to Library" on any search result to populate this bookshelves page and keep track of files you want to watch!</p>
              </div>
            ) : filteredLibraryList.length === 0 ? (
              <div className="empty-state glass-panel" style={{ marginTop: '1rem' }}>
                <div className="empty-icon">📂</div>
                <h2>No items on this shelf</h2>
                <p>Add releases in the "{librarySubTab}" category to see them inside your library shelf.</p>
              </div>
            ) : (
              <div className="results-grid">
                {filteredLibraryList.map((item, idx) => {
                  const qualityTags = extractQuality(item.title);
                  const isDownloading = activeDownloadId === (item.magnet || item.torrentFile);
                  const meta = getMetadata(item);

                  return (
                    <article key={idx} className={`result-card glass-panel ${item.cached ? 'cached-hit' : 'cached-miss'} ${meta?.poster ? 'has-poster' : ''}`}>
                      {meta?.poster && (
                        <div className="card-poster-col" onClick={() => setMetadataDrawerItem({ ...item, _metadata: meta })}>
                          <img src={meta.poster} alt="" className="card-poster-img" loading="lazy" />
                        </div>
                      )}
                      <div className="card-content-col">
                      <div className="card-top">
                        <h3 className="result-title" title={item.title}>
                          {item.title}
                        </h3>
                        {meta && (
                          <div className="meta-info-row">
                            {meta.voteAverage && <span className="meta-rating-badge" title="TMDb Rating">⭐ {meta.voteAverage.toFixed(1)}</span>}
                            {meta.rating && <span className="meta-rating-badge" title="Rating">⭐ {meta.rating}</span>}
                            {meta.genres && meta.genres.length > 0 && meta.genres.slice(0, 2).map((g, gi) => (
                              <span key={gi} className="meta-genre-tag">{g}</span>
                            ))}
                            {meta.artist && <span className="meta-artist-tag">🎤 {meta.artist}</span>}
                            {meta.author && <span className="meta-artist-tag">✍️ {meta.author}</span>}
                            {meta.year && <span className="meta-year-tag">📅 {meta.year}</span>}
                            <button className="meta-info-btn" onClick={(e) => { e.stopPropagation(); setMetadataDrawerItem({ ...item, _metadata: meta }); }} title="View full metadata details">
                              ℹ️ Info
                            </button>
                          </div>
                        )}
                        
                        {qualityTags.length > 0 && (
                          <div className="quality-tags">
                            {qualityTags.map((tag, tagIdx) => (
                              <span key={tagIdx} className={`quality-badge q-${tag.type}`}>
                                {tag.text}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="card-middle">
                        <div className="stats-row">
                          <span className="stat-item">💾 {formatBytes(item.size)}</span>
                          <span className="stat-item text-green">🟢 {item.seeders} <span className="stat-label">seeds</span></span>
                        </div>
                        <div className="meta-row">
                          <span className="tracker-name">🏷️ {item.tracker}</span>
                        </div>
                      </div>

                      <div className="card-actions">
                        <button
                          className="cache-badge badge-library active"
                          onClick={() => toggleLibraryItem(item)}
                          title="Remove from Library"
                        >
                          ⭐ Remove
                        </button>

                        {item.cached && (
                          (item.category === 'Retro Games' || getEmulatorSystem(item.title)) ? (
                            <button
                              className="cache-badge badge-arcade hover-action"
                              onClick={() => startRetroPlayer(item)}
                              title="Instant play retro game"
                            >
                              🎮 Play ROM
                            </button>
                          ) : (item.category === 'Ebooks' || item.title.toLowerCase().endsWith('.epub') || item.title.toLowerCase().endsWith('.pdf')) ? (
                            <button
                              className="cache-badge badge-ebook hover-action"
                              onClick={() => startEbookPlayer(item)}
                              title="Read ebook in direct browser reader"
                            >
                              📖 Read Book
                            </button>
                          ) : (item.category === 'Audiobooks' || item.category === 'Music') ? (
                            <button
                              className="cache-badge badge-listen hover-action"
                              onClick={() => startAudioPlayer(item)}
                              title="Read or listen in direct browser player"
                            >
                              🎧 Listen
                            </button>
                          ) : (item.category === 'Software' || item.category === 'Other' || item.category === 'VST') ? (
                            <button
                              className="cache-badge badge-download hover-action"
                              onClick={() => triggerDirectDownload(item)}
                              title="Direct high-speed CDN download"
                            >
                              📥 Direct DL
                            </button>
                          ) : (
                            <button
                              className="cache-badge badge-stream hover-action"
                              onClick={() => startStreaming(item)}
                              title="Instant play stream"
                            >
                              🎬 Stream
                            </button>
                          )
                        )}

                        <button
                          className={`cache-badge ${item.cached ? 'badge-cached' : 'badge-uncached'} hover-action`}
                          onClick={() => triggerDownload(item)}
                          disabled={isDownloading}
                          title={item.cached ? "Instant transfer to Cloud" : "Add to download queue"}
                        >
                          {isDownloading ? (
                            <span className="spinner-micro white"></span>
                          ) : item.cached ? (
                            '🟢 Instant DL'
                          ) : (
                            '⚪ Add to PM'
                          )}
                        </button>
                      </div>
                      </div>{/* close card-content-col */}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ⏱️ Tab: Continue... Dashboard */}
        {activeTab === 'progress' && (() => {
          const moviesProgress = continueWatchingList.filter(item => {
            const cat = item.category || (item.torrent && item.torrent.category) || 'Movies';
            return cat === 'Movies';
          });

          const tvProgress = continueWatchingList.filter(item => {
            const cat = item.category || (item.torrent && item.torrent.category);
            return cat === 'TV';
          });

          const musicProgress = continueWatchingList.filter(item => {
            const cat = item.category || (item.torrent && item.torrent.category);
            return cat === 'Music';
          });

          const audiobooksProgress = continueWatchingList.filter(item => {
            const cat = item.category || (item.torrent && item.torrent.category);
            return cat === 'Audiobooks';
          });

          const ebooksProgress = continueWatchingList.filter(item => {
            const cat = item.category || (item.torrent && item.torrent.category);
            return cat === 'Ebooks';
          });

          return (
            <section className="progress-section fade-in">
              <div className="results-header-row" style={{ marginBottom: '1.5rem' }}>
                <div className="results-header">
                  <h2>⏱️ Continue... ({continueWatchingList.length})</h2>
                  <span className="results-subtitle">Resume your active video streams, audiobooks, music, or ebooks right where you left off</span>
                </div>
              </div>

              {continueWatchingList.length === 0 ? (
                <div className="empty-state glass-panel">
                  <div className="empty-icon">⏱️</div>
                  <h2>No media currently in progress</h2>
                  <p>Start any movie stream, TV show, audiobook, music album, or ebook from your search results. Your progress will be dynamically recorded here for instant resumption.</p>
                </div>
              ) : (
                <>
                  {/* Continue Category Sub-Tabs (Aligned with the library type selectors) */}
                  <div className="library-sub-tabs" style={{ marginBottom: '2rem' }}>
                    <button 
                      className={`sub-tab ${continueSubTab === 'All' ? 'active' : ''}`}
                      onClick={() => setContinueSubTab('All')}
                    >
                      📂 All ({continueWatchingList.length})
                    </button>
                    <button 
                      className={`sub-tab ${continueSubTab === 'Movies' ? 'active' : ''}`}
                      onClick={() => setContinueSubTab('Movies')}
                    >
                      🎬 Movies ({moviesProgress.length})
                    </button>
                    <button 
                      className={`sub-tab ${continueSubTab === 'TV' ? 'active' : ''}`}
                      onClick={() => setContinueSubTab('TV')}
                    >
                      📺 TV Shows ({tvProgress.length})
                    </button>
                    <button 
                      className={`sub-tab ${continueSubTab === 'Music' ? 'active' : ''}`}
                      onClick={() => setContinueSubTab('Music')}
                    >
                      🎵 Music ({musicProgress.length})
                    </button>
                    <button 
                      className={`sub-tab ${continueSubTab === 'Audiobooks' ? 'active' : ''}`}
                      onClick={() => setContinueSubTab('Audiobooks')}
                    >
                      🎧 Audiobooks ({audiobooksProgress.length})
                    </button>
                    <button 
                      className={`sub-tab ${continueSubTab === 'Ebooks' ? 'active' : ''}`}
                      onClick={() => setContinueSubTab('Ebooks')}
                    >
                      📚 EBooks ({ebooksProgress.length})
                    </button>
                  </div>

                  <div className="continue-shelves-container">
                    {/* Category-specific empty states */}
                    {continueSubTab === 'Movies' && moviesProgress.length === 0 && (
                      <div className="empty-state glass-panel" style={{ padding: '3rem 2rem' }}>
                        <div className="empty-icon">🎬</div>
                        <h2>No movies currently in progress</h2>
                        <p>Start playing any movie release. Your active progress will automatically be saved here.</p>
                      </div>
                    )}
                    {continueSubTab === 'TV' && tvProgress.length === 0 && (
                      <div className="empty-state glass-panel" style={{ padding: '3rem 2rem' }}>
                        <div className="empty-icon">📺</div>
                        <h2>No TV shows currently in progress</h2>
                        <p>Start playing any TV show episode. Your active progress will automatically be saved here.</p>
                      </div>
                    )}
                    {continueSubTab === 'Music' && musicProgress.length === 0 && (
                      <div className="empty-state glass-panel" style={{ padding: '3rem 2rem' }}>
                        <div className="empty-icon">🎵</div>
                        <h2>No music albums currently in progress</h2>
                        <p>Start listening to any music album. Your active progress will automatically be saved here.</p>
                      </div>
                    )}
                    {continueSubTab === 'Audiobooks' && audiobooksProgress.length === 0 && (
                      <div className="empty-state glass-panel" style={{ padding: '3rem 2rem' }}>
                        <div className="empty-icon">🎧</div>
                        <h2>No audiobooks currently in progress</h2>
                        <p>Start listening to any audiobook track to see it here.</p>
                      </div>
                    )}
                    {continueSubTab === 'Ebooks' && ebooksProgress.length === 0 && (
                      <div className="empty-state glass-panel" style={{ padding: '3rem 2rem' }}>
                        <div className="empty-icon">📚</div>
                        <h2>No eBooks currently in progress</h2>
                        <p>Open any EPUB or PDF book in the reader. Your bookmarks will be saved here automatically.</p>
                      </div>
                    )}

                    {/* Shelf A: Movies */}
                    {(continueSubTab === 'All' || continueSubTab === 'Movies') && moviesProgress.length > 0 && (
                      <div className="continue-shelf" style={{ marginBottom: '2.5rem' }}>
                        <h3 className="shelf-title" style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                          🎬 Continue Watching Movies ({moviesProgress.length})
                        </h3>
                        <div className="progress-grid">
                          {moviesProgress.map((item, idx) => (
                            <article key={idx} className="progress-card glass-panel">
                              <div className="progress-card-header">
                                <h3 className="progress-card-title" title={item.title}>
                                  {item.title}
                                </h3>
                                <p className="progress-parent-title">From: {item.parentTitle}</p>
                              </div>
                              <div className="progress-bar-container">
                                <div className="progress-bar-track">
                                  <div className="progress-bar-fill" style={{ width: `${item.percent}%` }}></div>
                                </div>
                                <div className="progress-time-readout">
                                  <span>⏱️ {Math.floor(item.currentTime / 60)}m / {Math.floor(item.duration / 60)}m</span>
                                  <span>{Math.round(item.percent)}% completed</span>
                                </div>
                              </div>
                              <div className="progress-actions">
                                <button className="danger-btn text-only" onClick={() => removeFromContinueWatching(item.link)}>✕ Remove</button>
                                <button className="cache-badge badge-stream hover-action" onClick={() => {
                                  removeFromContinueWatching(item.link);
                                  startStreaming(item.torrent, item.currentTime, item.title);
                                }}>▶️ Resume Movie</button>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Shelf B: TV Shows */}
                    {(continueSubTab === 'All' || continueSubTab === 'TV') && tvProgress.length > 0 && (
                      <div className="continue-shelf" style={{ marginBottom: '2.5rem' }}>
                        <h3 className="shelf-title" style={{ fontSize: '1.25rem', color: '#3b82f6', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                          📺 Continue Watching TV Shows ({tvProgress.length})
                        </h3>
                        <div className="progress-grid">
                          {tvProgress.map((item, idx) => (
                            <article key={idx} className="progress-card glass-panel">
                              <div className="progress-card-header">
                                <h3 className="progress-card-title" title={item.title}>
                                  {item.title}
                                </h3>
                                <p className="progress-parent-title">From: {item.parentTitle}</p>
                              </div>
                              <div className="progress-bar-container">
                                <div className="progress-bar-track">
                                  <div className="progress-bar-fill" style={{ width: `${item.percent}%`, background: '#3b82f6' }}></div>
                                </div>
                                <div className="progress-time-readout">
                                  <span>⏱️ {Math.floor(item.currentTime / 60)}m / {Math.floor(item.duration / 60)}m</span>
                                  <span>{Math.round(item.percent)}% completed</span>
                                </div>
                              </div>
                              <div className="progress-actions">
                                <button className="danger-btn text-only" onClick={() => removeFromContinueWatching(item.link)}>✕ Remove</button>
                                <button className="cache-badge badge-stream hover-action" style={{ background: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.4)', color: '#60a5fa' }} onClick={() => {
                                  removeFromContinueWatching(item.link);
                                  startStreaming(item.torrent, item.currentTime, item.title);
                                }}>▶️ Resume Episode</button>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Shelf C: Music */}
                    {(continueSubTab === 'All' || continueSubTab === 'Music') && musicProgress.length > 0 && (
                      <div className="continue-shelf" style={{ marginBottom: '2.5rem' }}>
                        <h3 className="shelf-title" style={{ fontSize: '1.25rem', color: '#ec4899', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                          🎵 Continue Listening to Music ({musicProgress.length})
                        </h3>
                        <div className="progress-grid">
                          {musicProgress.map((item, idx) => (
                            <article key={idx} className="progress-card glass-panel">
                              <div className="progress-card-header">
                                <h3 className="progress-card-title" title={item.title}>
                                  {item.title}
                                </h3>
                                <p className="progress-parent-title">From: {item.parentTitle}</p>
                              </div>
                              <div className="progress-bar-container">
                                <div className="progress-bar-track">
                                  <div className="progress-bar-fill" style={{ width: `${item.percent}%`, background: '#ec4899' }}></div>
                                </div>
                                <div className="progress-time-readout">
                                  <span>⏱️ {Math.floor(item.currentTime / 60)}m / {Math.floor(item.duration / 60)}m</span>
                                  <span>{Math.round(item.percent)}% completed</span>
                                </div>
                              </div>
                              <div className="progress-actions">
                                <button className="danger-btn text-only" onClick={() => removeFromContinueWatching(item.link)}>✕ Remove</button>
                                <button className="cache-badge badge-listen hover-action" style={{ background: 'rgba(236, 72, 153, 0.15)', borderColor: 'rgba(236, 72, 153, 0.4)', color: '#f472b6' }} onClick={() => {
                                  removeFromContinueWatching(item.link);
                                  startAudioPlayer(item.torrent, item.link, item.currentTime);
                                }}>▶️ Resume Album</button>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Shelf D: Audiobooks */}
                    {(continueSubTab === 'All' || continueSubTab === 'Audiobooks') && audiobooksProgress.length > 0 && (
                      <div className="continue-shelf" style={{ marginBottom: '2.5rem' }}>
                        <h3 className="shelf-title" style={{ fontSize: '1.25rem', color: '#fbbf24', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                          🎧 Continue Listening to Audiobooks ({audiobooksProgress.length})
                        </h3>
                        <div className="progress-grid">
                          {audiobooksProgress.map((item, idx) => (
                            <article key={idx} className="progress-card glass-panel">
                              <div className="progress-card-header">
                                <h3 className="progress-card-title" title={item.title}>
                                  {item.title}
                                </h3>
                                <p className="progress-parent-title">From: {item.parentTitle}</p>
                              </div>
                              <div className="progress-bar-container">
                                <div className="progress-bar-track">
                                  <div className="progress-bar-fill" style={{ width: `${item.percent}%` }}></div>
                                </div>
                                <div className="progress-time-readout">
                                  <span>⏱️ {Math.floor(item.currentTime / 60)}m / {Math.floor(item.duration / 60)}m</span>
                                  <span>{Math.round(item.percent)}% completed</span>
                                </div>
                              </div>
                              <div className="progress-actions">
                                <button className="danger-btn text-only" onClick={() => removeFromContinueWatching(item.link)}>✕ Remove</button>
                                <button className="cache-badge badge-listen hover-action" onClick={() => {
                                  removeFromContinueWatching(item.link);
                                  startAudioPlayer(item.torrent, item.link, item.currentTime);
                                }}>▶️ Resume Audiobook</button>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Shelf E: Ebooks / Graphic Novels */}
                    {(continueSubTab === 'All' || continueSubTab === 'Ebooks') && ebooksProgress.length > 0 && (
                      <div className="continue-shelf" style={{ marginBottom: '2.5rem' }}>
                        <h3 className="shelf-title" style={{ fontSize: '1.25rem', color: '#10b981', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                          📚 Continue Reading ({ebooksProgress.length})
                        </h3>
                        <div className="progress-grid">
                          {ebooksProgress.map((item, idx) => (
                            <article key={idx} className="progress-card glass-panel">
                              <div className="progress-card-header">
                                <h3 className="progress-card-title" title={item.title}>
                                  {item.title}
                                </h3>
                                <p className="progress-parent-title">From: {item.parentTitle}</p>
                              </div>
                              <div className="progress-bar-container">
                                <div className="progress-bar-track">
                                  <div className="progress-bar-fill" style={{ width: `${item.percent}%`, background: '#10b981' }}></div>
                                </div>
                                <div className="progress-time-readout">
                                  <span>📖 Chapter {item.currentTime} / {item.duration}</span>
                                  <span>{Math.round(item.percent)}% read</span>
                                </div>
                              </div>
                              <div className="progress-actions">
                                <button className="danger-btn text-only" onClick={() => removeFromContinueWatching(item.link)}>✕ Remove</button>
                                <button className="cache-badge badge-ebook hover-action" onClick={() => {
                                  removeFromContinueWatching(item.link);
                                  startEbookPlayer(item.torrent, item.link, item.chapterIndex !== undefined ? item.chapterIndex : (item.currentTime - 1), item.scrollTop !== undefined ? item.scrollTop : null);
                                }}>📖 Resume Reading</button>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          );
        })()}

        {/* 📊 Tab: Cloud Storage Manager */}
        {activeTab === 'cloud' && (
          <section className="cloud-section fade-in">
            <div className="results-header-row" style={{ marginBottom: '1.5rem' }}>
              <div className="results-header">
                <h2>📊 Premiumize Cloud Storage Manager</h2>
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
                    <span className="quota-title">💾 Cloud Space Status</span>
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
                      🔄 Refresh Storage Info
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
                ☁️ Cloud
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
                <span className="input-search-icon">🔍</span>
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
                🔄 Refresh
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
                  🎬 Play All
                </button>
              )}
            </div>

            {cloudPlaylistLoading ? (
              <div className="loading-state glass-panel" style={{ padding: '4rem 2rem' }}>
                <div className="spinner"></div>
                <h2>🎬 Building "Play All" Playlist...</h2>
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
                <div className="empty-icon" style={{ color: 'rgba(239, 68, 68, 0.7)' }}>⚠️</div>
                <h2>Failed to Load Cloud Contents</h2>
                <p>{cloudError}</p>
                <button 
                  className="cache-badge badge-stream hover-action" 
                  style={{ marginTop: '1rem', border: 'none', cursor: 'pointer' }}
                  onClick={() => fetchCloudFolder(cloudFolderId)}
                >
                  🔄 Retry Connection
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
                      <div className="empty-icon">📁</div>
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
                          ⬅️ Go Back Up
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
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-primary)' }}>📁 Folders ({folders.length})</h3>
                        <div className="results-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                          {folders.map((folder) => {
                            const isEditing = cloudRenameId === folder.id;
                            return (
                              <div 
                                key={folder.id} 
                                className="torrent-card glass-panel fade-in hover-glow" 
                                style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1rem', cursor: 'pointer' }}
                                onClick={(e) => {
                                  // Skip if clicking inputs or action buttons
                                  if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && !isEditing) {
                                    fetchCloudFolder(folder.id);
                                  }
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
                                  <span style={{ fontSize: '1.75rem', flexShrink: 0 }}>📁</span>
                                  {isEditing ? (
                                    <div style={{ display: 'flex', gap: '0.25rem', width: '100%' }} onClick={e => e.stopPropagation()}>
                                      <input
                                        type="text"
                                        value={cloudRenameName}
                                        onChange={(e) => setCloudRenameName(e.target.value)}
                                        className="search-input"
                                        style={{ height: '32px', padding: '0 0.5rem', fontSize: '0.9rem' }}
                                        autoFocus
                                      />
                                      <button 
                                        className="cache-badge badge-cached hover-action" 
                                        style={{ border: 'none', cursor: 'pointer', padding: '0 0.5rem' }}
                                        onClick={() => handleCloudRename(folder.id, 'folder', cloudRenameName)}
                                      >
                                        ✓
                                      </button>
                                      <button 
                                        className="cache-badge badge-uncached hover-action" 
                                        style={{ border: 'none', cursor: 'pointer', padding: '0 0.5rem' }}
                                        onClick={() => setCloudRenameId(null)}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ) : (
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                      <h4 className="torrent-title" style={{ fontSize: '1rem', margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={folder.name}>
                                        {folder.name}
                                      </h4>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Created: {new Date(folder.created_at * 1000).toLocaleDateString()}</span>
                                    </div>
                                  )}
                                </div>

                                {!isEditing && (
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem' }} onClick={e => e.stopPropagation()}>
                                    <button 
                                      className="danger-btn text-only" 
                                      style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                                      onClick={() => handleCloudDelete(folder.id, 'folder', folder.name)}
                                    >
                                      🗑️ Delete
                                    </button>
                                    <button 
                                      className="cache-badge badge-ebook hover-action" 
                                      style={{ border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: '0.8rem' }}
                                      onClick={() => {
                                        setCloudRenameId(folder.id);
                                        setCloudRenameName(folder.name);
                                        setCloudRenameType('folder');
                                      }}
                                    >
                                      ✏️ Rename
                                    </button>
                                    <button 
                                      className="cache-badge badge-listen hover-action" 
                                      style={{ border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: '0.8rem' }}
                                      onClick={() => bookmarkCloudItem(folder)}
                                    >
                                      ⭐ Bookmark
                                    </button>
                                    <button 
                                      className="cache-badge badge-stream hover-action" 
                                      style={{ border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: '0.8rem' }}
                                      onClick={() => buildFolderPlaylist(folder.id, folder.name)}
                                    >
                                      🎬 Play All
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
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-primary)' }}>📄 Files ({files.length})</h3>
                        <div className="results-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                          {files.map((file) => {
                            const isEditing = cloudRenameId === file.id;
                            const ext = file.name.split('.').pop().toLowerCase();
                            
                            // Map icon according to file extension
                            let fileIcon = '📄';
                            let actionLabel = '📥 CDN Download';
                            let actionColorClass = 'badge-download';
                            
                            if (['mkv', 'mp4', 'avi'].includes(ext)) {
                              fileIcon = '🎬';
                              actionLabel = '🎬 Play Stream';
                              actionColorClass = 'badge-stream';
                            } else if (['mp3', 'flac', 'wav', 'm4a', 'ogg', 'wma'].includes(ext)) {
                              fileIcon = '🎵';
                              actionLabel = '🎧 Ambient Listen';
                              actionColorClass = 'badge-listen';
                            } else if (['m4b'].includes(ext)) {
                              fileIcon = '🎧';
                              actionLabel = '🎧 Listen Audiobook';
                              actionColorClass = 'badge-listen';
                            } else if (['epub', 'pdf'].includes(ext)) {
                              fileIcon = '📚';
                              actionLabel = '📖 Read Book';
                              actionColorClass = 'badge-ebook';
                            } else if (getEmulatorSystem(file.name)) {
                              fileIcon = '🎮';
                              actionLabel = '🎮 Play Game';
                              actionColorClass = 'badge-game';
                            }

                            return (
                              <div 
                                key={file.id} 
                                className="torrent-card glass-panel fade-in hover-glow" 
                                style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1rem' }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
                                  <span style={{ fontSize: '1.75rem', flexShrink: 0 }}>{fileIcon}</span>
                                  {isEditing ? (
                                    <div style={{ display: 'flex', gap: '0.25rem', width: '100%' }}>
                                      <input
                                        type="text"
                                        value={cloudRenameName}
                                        onChange={(e) => setCloudRenameName(e.target.value)}
                                        className="search-input"
                                        style={{ height: '32px', padding: '0 0.5rem', fontSize: '0.9rem' }}
                                        autoFocus
                                      />
                                      <button 
                                        className="cache-badge badge-cached hover-action" 
                                        style={{ border: 'none', cursor: 'pointer', padding: '0 0.5rem' }}
                                        onClick={() => handleCloudRename(file.id, 'file', cloudRenameName)}
                                      >
                                        ✓
                                      </button>
                                      <button 
                                        className="cache-badge badge-uncached hover-action" 
                                        style={{ border: 'none', cursor: 'pointer', padding: '0 0.5rem' }}
                                        onClick={() => setCloudRenameId(null)}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ) : (
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                      <h4 className="torrent-title" style={{ fontSize: '0.95rem', margin: '0 0 4px 0', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={file.name}>
                                        {file.name}
                                      </h4>
                                      <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.7rem', color: 'var(--color-muted)' }}>
                                        <span>Size: {formatBytes(file.size)}</span>
                                        <span>•</span>
                                        <span>Added: {new Date(file.created_at * 1000).toLocaleDateString()}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {!isEditing && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem' }}>
                                    {/* Primary Media Streaming Action Button */}
                                    <button 
                                      className={`cache-badge ${actionColorClass} hover-action`} 
                                      style={{ border: 'none', cursor: 'pointer', padding: '8px 12px', fontSize: '0.85rem', fontWeight: 'bold', width: '100%', textAlign: 'center' }}
                                      onClick={() => handleCloudStream(file)}
                                    >
                                      {actionLabel}
                                    </button>
                                    
                                    {/* Secondary Organizing Action Buttons */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.25rem', width: '100%' }}>
                                      <button 
                                        className="danger-btn text-only" 
                                        style={{ padding: '2px 4px', fontSize: '0.75rem' }}
                                        onClick={() => handleCloudDelete(file.id, 'file', file.name)}
                                      >
                                        🗑️ Delete
                                      </button>
                                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button 
                                          className="cache-badge badge-ebook hover-action" 
                                          style={{ border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: '0.75rem' }}
                                          onClick={() => {
                                            setCloudRenameId(file.id);
                                            setCloudRenameName(file.name);
                                            setCloudRenameType('file');
                                          }}
                                        >
                                          ✏️ Rename
                                        </button>
                                        <button 
                                          className="cache-badge badge-listen hover-action" 
                                          style={{ border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: '0.75rem' }}
                                          onClick={() => bookmarkCloudItem(file)}
                                        >
                                          ⭐ Bookmark
                                        </button>
                                      </div>
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
        )}
        {/* ⚡ Tab: Active Downloads Transfer Manager */}
        {activeTab === 'transfers' && (
          <section className="transfers-section fade-in">
            <div className="results-header-row" style={{ marginBottom: '1.5rem' }}>
              <div className="results-header">
                <h2>⚡ Real-Time Active Downloads</h2>
                <span className="results-subtitle">Monitor and manage torrent transfers downloading to your cloud</span>
              </div>
              <button 
                onClick={fetchActiveTransfers} 
                className="action-btn"
                title="Refresh Active Transfers List"
              >
                🔄 Refresh Queue
              </button>
            </div>

            {transfersLoading && transfers.length === 0 ? (
              <div className="player-loading-container" style={{ margin: '4rem 0' }}>
                <span className="spinner-micro white large"></span>
                <p style={{ marginTop: '1rem' }}>Querying Premiumize transfer queue...</p>
              </div>
            ) : transfers.length === 0 ? (
              <div className="player-error-container" style={{ margin: '4rem 0', padding: '3rem', textAlign: 'center' }}>
                <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📭 Transfer Queue Empty</p>
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
                          🗑️ Cancel & Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Premium Streaming Video Player Modal */}
        {activePlayerTorrent && (
          <div className="player-modal-backdrop">
            <div className="player-modal glass-panel fade-in">
              <div className="player-header">
                <h2>🎬 PremiumPlayer</h2>
                <button 
                  className="close-player-btn" 
                  onClick={() => {
                    setActivePlayerTorrent(null);
                    setSelectedVideoFile(null);
                    setSelectedSubtitleFile(null);
                    setSubtitleTrackUrl(null);
                    syncToCloud(libraryList, continueWatchingList); // Push latest playback checkpoints to Cloud
                  }}
                  id="btn-close-player"
                >
                  ✕ Close
                </button>
              </div>

              {playerLoading ? (
                <div className="player-loading-container">
                  <span className="spinner-micro white large"></span>
                  <p>Retrieving instant streaming links from Premiumize CDN...</p>
                </div>
              ) : selectedVideoFile ? (
                <div className="player-content">
                  
                  {/* Custom HTML5 Video Player */}
                  <div className="video-wrapper">
                    <video 
                      key={selectedVideoFile.link} // Forces reload when active file changes
                      controls 
                      autoPlay
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleVideoLoadedMetadata}
                      onEnded={handleVideoEnded}
                      className="main-video-player"
                      crossOrigin="anonymous" // Required to inject blob subtitle tracks
                    >
                      <source src={selectedVideoFile.link} type="video/mp4" />
                      <source src={selectedVideoFile.link} type="video/webm" />
                      Your browser does not support HTML5 video playback.
                    </video>

                    {/* Netflix-Style Episode Autoplay Overlay popup */}
                    {showAutoplayOverlay && nextEpisodeFile && (
                      <div className="autoplay-overlay-container">
                        <div className="autoplay-card glass-panel animate-zoom-in">
                          <span className="autoplay-next-label">NEXT EPISODE IN</span>
                          <span className="autoplay-countdown-number">{autoplayCountdown}s</span>
                          <h4 className="autoplay-next-title" title={nextEpisodeFile.name.split('/').pop()}>
                            {nextEpisodeFile.name.split('/').pop()}
                          </h4>
                          <div className="autoplay-actions">
                            <button 
                              className="autoplay-cancel-btn"
                              onClick={() => {
                                setShowAutoplayOverlay(false);
                                autoplayDeclinedRef.current = true;
                                if (autoplayTimerRef.current) clearTimeout(autoplayTimerRef.current);
                              }}
                            >
                              ✕ Cancel
                            </button>
                            <button 
                              className="autoplay-play-now-btn"
                              onClick={() => {
                                setShowAutoplayOverlay(false);
                                if (autoplayTimerRef.current) clearTimeout(autoplayTimerRef.current);
                                triggerToast(`🍿 Playing next episode: ${nextEpisodeFile.name.split('/').pop()}`, 'success');
                                setSelectedVideoFile(nextEpisodeFile);
                              }}
                            >
                              ▶️ Play Now
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Browser audio track limitations notice & Custom controls */}
                  <div className="player-custom-controls">
                    
                    <div className="audio-notice-box">
                      <span className="badge-notice">ℹ️ Multi-Language Audio Info</span>
                      <p>Web browsers do not support switching audio tracks for raw video streams. To play this file in other languages or switch tracks, click the orange <strong>Open in VLC Player</strong> button below!</p>
                    </div>

                  </div>

                  {/* Stream selectors */}
                  <div className="player-controls-row">
                    
                    {/* Select active video file (for pack / season torrents!) */}
                    {playerFiles.filter(f => f.type === 'video').length > 1 && (
                      <div className="player-select-group">
                        <label htmlFor="select-video-track">Select File / Episode:</label>
                        <select 
                          id="select-video-track"
                          value={selectedVideoFile.link}
                          onChange={(e) => {
                            const file = playerFiles.find(f => f.link === e.target.value);
                            if (file) {
                              setSelectedVideoFile(file);
                              
                              // Automatically find and select the matching subtitle track for this episode
                              const subtitles = playerFiles.filter(f => f.type === 'subtitle');
                              if (subtitles.length > 0) {
                                const videoEp = matchEpisode(file.name);
                                let matchedSub = null;
                                if (videoEp) {
                                  matchedSub = subtitles.find(s => matchEpisode(s.name) === videoEp);
                                }
                                if (!matchedSub) {
                                  const cleanVideoName = file.name.split('.')[0].toLowerCase();
                                  matchedSub = subtitles.find(s => s.name.toLowerCase().includes(cleanVideoName) || cleanVideoName.includes(s.name.split('.')[0].toLowerCase()));
                                }
                                if (!matchedSub) {
                                  const videos = playerFiles.filter(f => f.type === 'video');
                                  const vidIdx = videos.indexOf(file);
                                  if (vidIdx !== -1 && subtitles[vidIdx]) {
                                    matchedSub = subtitles[vidIdx];
                                  }
                                }
                                setSelectedSubtitleFile(matchedSub || null);
                              } else {
                                setSelectedSubtitleFile(null);
                              }
                            }
                          }}
                          className="player-select"
                        >
                          {playerFiles
                            .filter(f => f.type === 'video')
                            .sort((a, b) => {
                              const aName = a.name.split('/').pop().toLowerCase();
                              const bName = b.name.split('/').pop().toLowerCase();
                              return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
                            })
                            .map((f, idx) => (
                              <option key={idx} value={f.link}>
                                {f.name} ({formatBytes(f.size)})
                              </option>
                            ))}
                        </select>
                      </div>
                    )}

                    {/* Select active subtitle track */}
                    {playerFiles.filter(f => f.type === 'subtitle').length > 0 && (
                      <div className="player-select-group">
                        <label htmlFor="select-subtitle-track">Select Subtitle Track:</label>
                        <select 
                          id="select-subtitle-track"
                          value={selectedSubtitleFile?.link || ""}
                          onChange={(e) => {
                            const file = playerFiles.find(f => f.link === e.target.value);
                            setSelectedSubtitleFile(file || null);
                          }}
                          className="player-select"
                        >
                          <option value="">No Subtitles</option>
                          {playerFiles
                            .filter(f => f.type === 'subtitle')
                            .sort((a, b) => {
                              const aName = a.name.split('/').pop().toLowerCase();
                              const bName = b.name.split('/').pop().toLowerCase();
                              return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
                            })
                            .map((f, idx) => (
                              <option key={idx} value={f.link}>
                                {f.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}

                  </div>

                  {/* External Player deep links */}
                  <div className="player-actions-row">
                    
                    {/* Open in VLC Link */}
                    <a 
                      href={selectedVideoFile.link.replace(/^http/, 'vlc')} 
                      className="vlc-stream-btn"
                      title="Open this direct network stream inside your VLC Media Player"
                    >
                      🍿 Open in VLC Player
                    </a>

                    {/* Copy Stream Link */}
                    <button 
                      type="button" 
                      className="copy-url-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedVideoFile.link);
                        triggerToast('CDN stream link copied to clipboard!', 'success');
                      }}
                      title="Copy direct streaming link for other players (like IINA or MPV)"
                    >
                      📋 Copy Stream Link
                    </button>
                  </div>

                  {/* Playing info */}
                  <div className="player-file-info">
                    <p className="playing-title"><strong>Playing:</strong> {selectedVideoFile.name}</p>
                    <p className="playing-size">💾 Size: {formatBytes(selectedVideoFile.size)}</p>
                  </div>

                </div>
              ) : (
                <div className="player-error-container">
                  <p>⚠️ No streamable video tracks could be extracted from this torrent.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Retro Arcade Player Modal */}
        {activeRetroTorrent && (
          <div className="player-modal-backdrop">
            <div className="player-modal glass-panel fade-in">
              <div className="player-header">
                <h2>🎮 Retro Arcade Console</h2>
                <button 
                  className="close-player-btn" 
                  onClick={() => {
                    setActiveRetroTorrent(null);
                    setSelectedRetroRomFile(null);
                    setRetroPlayableFiles([]);
                    setRetroSearchQuery('');
                    setActiveRetroRomName(null);
                  }}
                  id="btn-close-retro"
                >
                  ✕ Close Arcade
                </button>
              </div>

              {playerLoading ? (
                <div className="player-loading-container">
                  <span className="spinner-micro white large"></span>
                  <p>Extracting ROM links from Premiumize CDN...</p>
                </div>
              ) : selectedRetroRomFile ? (
                <div className="player-active-layout">
                  <div className="player-screen-canvas">
                    <iframe
                      src={`/emulator.html?system=${getEmulatorSystem(selectedRetroRomFile.name)}&rom=${encodeURIComponent(
                        selectedRetroRomFile.link.startsWith('http://localhost:3001/mock-download')
                          ? selectedRetroRomFile.link
                          : `/api/proxy-rom?url=${encodeURIComponent(selectedRetroRomFile.link)}`
                      )}&file=${encodeURIComponent(selectedRetroRomFile.name)}`}
                      className="main-arcade-frame"
                      allowFullScreen
                      scrolling="no"
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        background: '#000',
                        borderRadius: '8px',
                        boxShadow: '0 0 20px var(--color-primary-glow)'
                      }}
                    ></iframe>
                  </div>

                  {/* Select active ROM file (for pack / folder torrents!) */}
                  {retroPlayableFiles.length > 1 && (
                    <div className="player-controls-row" style={{ marginTop: '1rem', width: '100%', flexDirection: 'column', gap: '0.5rem' }}>
                      <div className="retro-search-box">
                        <label htmlFor="search-retro-rom" style={{ color: 'var(--color-arcade)', fontWeight: '700', display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                          🎮 Search & Select Game from Pack (Alphabetical):
                        </label>
                        <input 
                          type="text"
                          id="search-retro-rom"
                          placeholder="Type to filter ROMs in pack... (e.g. Mario)"
                          value={retroSearchQuery}
                          onChange={(e) => setRetroSearchQuery(e.target.value)}
                          className="retro-search-input"
                        />
                      </div>
                      
                      <div className="retro-games-grid">
                        {filteredRetroFiles.map((file, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={`retro-game-pill ${selectedRetroRomFile?.link === file.link ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedRetroRomFile(file);
                            }}
                            title={file.displayName}
                          >
                            <span className="game-icon">🎮</span>
                            <span className="game-name">{file.displayName}</span>
                            <span className="game-size">{formatBytes(file.size)}</span>
                          </button>
                        ))}
                        {filteredRetroFiles.length === 0 && (
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', gridColumn: '1 / -1', textAlign: 'center', padding: '1rem' }}>
                            No matching ROMs found in this pack.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Controller & Inputs Guide HUD */}
                  <div className="player-meta-pane">
                    <h3>🕹️ Arcade Control Guide</h3>
                    <div className="controller-guide-grid">
                      <div className="guide-group">
                        <h4>Keyboard Bindings</h4>
                        <ul>
                          <li><strong>D-Pad / Movement</strong>: Arrow Keys</li>
                          <li><strong>A Button / Primary</strong>: Z Key</li>
                          <li><strong>B Button / Secondary</strong>: X Key</li>
                          <li><strong>Start Button</strong>: Enter Key</li>
                          <li><strong>Select Button</strong>: Shift Key</li>
                          <li><strong>Turbo A / B</strong>: A Key / S Key</li>
                        </ul>
                      </div>
                      <div className="guide-group">
                        <h4>External Gamepads</h4>
                        <p>Pair an Xbox, PlayStation, or generic Bluetooth/USB gamepad. Browser Gamepad APIs will pair and map controls automatically!</p>
                      </div>
                      <div className="guide-group">
                        <h4>Game Save States</h4>
                        <p>Save and load your progress at any time. EmulatorJS automatically stores save states inside your local browser IndexedDB cache.</p>
                      </div>
                    </div>
                  </div>

                  {/* Playing info */}
                  <div className="player-file-info">
                    <p className="playing-title"><strong>Playing:</strong> {selectedRetroRomFile.name}</p>
                    <p className="playing-size">💾 Size: {formatBytes(selectedRetroRomFile.size)}</p>
                  </div>

                </div>
              ) : (
                <div className="player-error-container">
                  <p>⚠️ No compatible retro ROM or Zip files could be extracted from this release.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* EBook Reader Modal */}
        {activeEbookTorrent && (
          <div className="player-modal-backdrop">
            <div className="player-modal glass-panel fade-in">
              <div className="player-header">
                <h2>📖 EBook Reader Panel</h2>
                <button 
                  className="close-player-btn" 
                  onClick={() => {
                    setActiveEbookTorrent(null);
                    setSelectedEbookFile(null);
                    setEbookPlayableFiles([]);
                    setEbookSearchQuery('');
                    setResumeEbookChapter(null);
                  }}
                  id="btn-close-ebook"
                >
                  ✕ Close Reader
                </button>
              </div>

              {playerLoading ? (
                <div className="player-loading-container">
                  <span className="spinner-micro white large"></span>
                  <p>Extracting eBook links from Premiumize CDN...</p>
                </div>
              ) : selectedEbookFile ? (
                <div className="player-active-layout">
                  <div className="player-screen-canvas" style={{ minHeight: '600px', height: '70vh' }}>
                    <iframe
                      src={`/reader.html?system=${selectedEbookFile.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'epub'}&rom=${encodeURIComponent(
                        selectedEbookFile.link.startsWith('http://localhost:3001/mock-download')
                          ? selectedEbookFile.link
                          : `/api/proxy-rom?url=${encodeURIComponent(selectedEbookFile.link)}`
                      )}${resumeEbookChapter !== null ? `&chapter=${resumeEbookChapter}` : ''}${resumeEbookScroll !== null && resumeEbookScroll !== undefined ? `&scroll=${resumeEbookScroll}` : ''}`}
                      className="main-ebook-frame"
                      allowFullScreen
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        background: '#0d0f14',
                        borderRadius: '8px',
                        boxShadow: '0 0 20px var(--color-primary-glow)'
                      }}
                    ></iframe>
                  </div>

                  {/* Select active eBook file (for pack / folder torrents!) */}
                  {ebookPlayableFiles.length > 1 && (
                    <div className="player-controls-row" style={{ marginTop: '1rem', width: '100%', flexDirection: 'column', gap: '0.5rem' }}>
                      <div className="retro-search-box">
                        <label htmlFor="search-ebook" style={{ color: 'var(--color-primary)', fontWeight: '700', display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                          📖 Search & Select Book from Pack (Alphabetical):
                        </label>
                        <input 
                          type="text"
                          id="search-ebook"
                          placeholder="Type to filter books in pack... (e.g. Orwell)"
                          value={ebookSearchQuery}
                          onChange={(e) => setEbookSearchQuery(e.target.value)}
                          className="retro-search-input"
                        />
                      </div>
                      
                      <div className="retro-games-grid">
                        {filteredEbookFiles.map((file, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={`retro-game-pill ${selectedEbookFile?.link === file.link ? 'active' : ''}`}
                            onClick={() => {
                              setResumeEbookChapter(null);
                              setSelectedEbookFile(file);
                            }}
                            title={file.displayName}
                          >
                            <span className="game-icon">📖</span>
                            <span className="game-name">{file.displayName}</span>
                            <span className="game-size">{formatBytes(file.size)}</span>
                          </button>
                        ))}
                        {filteredEbookFiles.length === 0 && (
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', gridColumn: '1 / -1', textAlign: 'center', padding: '1rem' }}>
                            No matching books found in this pack.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Reading Info pane */}
                  <div className="player-file-info">
                    <p className="playing-title"><strong>Reading:</strong> {selectedEbookFile.name}</p>
                    <p className="playing-size">💾 Size: {formatBytes(selectedEbookFile.size)}</p>
                  </div>

                </div>
              ) : (
                <div className="player-error-container">
                  <p>⚠️ No compatible eBook files (.epub, .pdf) could be extracted from this release.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audio Player Modal */}
        {activeAudioTorrent && (
          <div className="player-modal-backdrop">
            <div className="player-modal glass-panel fade-in">
              <div className="player-header">
                <h2>🎧 Audio WebPlayer</h2>
                <button 
                  className="close-player-btn" 
                  onClick={() => {
                    setActiveAudioTorrent(null);
                    setSelectedAudioFile(null);
                    setAudioPlayableFiles([]);
                    setAudioSearchQuery('');
                    setResumeAudioTime(0);
                    syncToCloud(libraryList, continueWatchingList); // Push latest progress checkpoints to Cloud
                  }}
                  id="btn-close-audio"
                >
                  ✕ Close Player
                </button>
              </div>

              {playerLoading ? (
                <div className="player-loading-container">
                  <span className="spinner-micro white large"></span>
                  <p>Extracting audio links from Premiumize CDN...</p>
                </div>
              ) : selectedAudioFile ? (
                <div className="player-active-layout">
                  <div className="player-screen-canvas" style={{ minHeight: '520px', height: '62vh' }}>
                    <iframe
                      src={`/audio.html?rom=${encodeURIComponent(selectedAudioFile.link)}${resumeAudioTime > 0 ? `&time=${resumeAudioTime}` : ''}`}
                      className="main-audio-frame"
                      allowFullScreen
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        background: '#0d0f14',
                        borderRadius: '8px',
                        boxShadow: '0 0 20px var(--color-primary-glow)'
                      }}
                    ></iframe>
                  </div>

                  {/* Select active track (for folder torrents / albums!) */}
                  {audioPlayableFiles.length > 1 && (
                    <div className="player-controls-row" style={{ marginTop: '1rem', width: '100%', flexDirection: 'column', gap: '0.5rem' }}>
                      <div className="retro-search-box">
                        <label htmlFor="search-audio" style={{ color: '#f59e0b', fontWeight: '700', display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                          🎧 Search & Select Track from Album (Alphabetical):
                        </label>
                        <input 
                          type="text"
                          id="search-audio"
                          placeholder="Type to filter tracks in playlist... (e.g. Chapter 01)"
                          value={audioSearchQuery}
                          onChange={(e) => setAudioSearchQuery(e.target.value)}
                          className="retro-search-input"
                        />
                      </div>
                      
                      <div className="retro-games-grid">
                        {filteredAudioFiles.map((file, idx) => (
                          <div key={idx} className="playlist-track-row" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', width: '100%' }}>
                            <button
                              type="button"
                              className={`retro-game-pill ${selectedAudioFile?.link === file.link ? 'active' : ''}`}
                              onClick={() => {
                                setResumeAudioTime(0);
                                setSelectedAudioFile(file);
                              }}
                              title={file.displayName}
                              style={{
                                flex: 1,
                                marginRight: 0,
                                borderColor: selectedAudioFile?.link === file.link ? '#f59e0b' : 'var(--glass-border)',
                                background: selectedAudioFile?.link === file.link ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.02)'
                              }}
                            >
                              <span className="game-icon" style={{ color: '#f59e0b' }}>🎧</span>
                              <span className="game-name">{file.displayName}</span>
                              <span className="game-size">{formatBytes(file.size)}</span>
                            </button>
                            <button
                              type="button"
                              className="add-to-playlist-btn"
                              onClick={() => setPlaylistSelectionTrack(file)}
                              title="Add this track to a custom playlist"
                            >
                              ➕
                            </button>
                          </div>
                        ))}
                        {filteredAudioFiles.length === 0 && (
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', gridColumn: '1 / -1', textAlign: 'center', padding: '1rem' }}>
                            No matching tracks found in this playlist.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Playing Info pane */}
                  <div className="player-file-info">
                    <p className="playing-title"><strong>Track:</strong> {selectedAudioFile.name}</p>
                    <p className="playing-size">💾 Size: {formatBytes(selectedAudioFile.size)}</p>
                  </div>

                </div>
              ) : (
                <div className="player-error-container">
                  <p>⚠️ No compatible audio files (.mp3, .m4b, .flac, .wav, .m4a) could be extracted from this release.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ➕ Custom Playlist Selection Modal Overlay */}
        {playlistSelectionTrack && (
          <div className="player-modal-backdrop" style={{ zIndex: 3000 }}>
            <div className="playlist-selector-modal glass-panel fade-in" style={{ maxWidth: '480px', width: '90%', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>➕</span> Add Track to Playlist
                </h3>
                <button 
                  className="close-player-btn" 
                  onClick={() => setPlaylistSelectionTrack(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', minWidth: 'auto', padding: 0 }}
                >
                  ✕
                </button>
              </div>

              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <p style={{ margin: '0 0 0.5rem 0' }}>Track to add:</p>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: '500', wordBreak: 'break-all' }}>
                  {playlistSelectionTrack.displayName || playlistSelectionTrack.name.split('/').pop()}
                </div>
              </div>

              {/* Add to Existing Playlist section */}
              {playlists.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Choose an existing playlist:</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                    {playlists.map((pl, index) => (
                      <button
                        key={index}
                        type="button"
                        className="playlist-select-item-btn"
                        onClick={() => addTrackToPlaylist(pl.name, playlistSelectionTrack)}
                      >
                        <span style={{ color: '#f59e0b' }}>🎵</span>
                        <span style={{ flex: 1, textAlign: 'left', fontWeight: '500' }}>{pl.name}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{pl.tracks.length} track(s)</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Create & Add to New Playlist section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1.25rem' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Or create a new playlist:</span>
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const name = formData.get('playlistName');
                    if (name && name.toString().trim()) {
                      createPlaylistAndAdd(name.toString().trim(), playlistSelectionTrack);
                    }
                  }}
                  style={{ display: 'flex', gap: '0.5rem' }}
                >
                  <input
                    type="text"
                    name="playlistName"
                    placeholder="New playlist name..."
                    className="retro-search-input"
                    style={{ margin: 0, flex: 1 }}
                    required
                  />
                  <button type="submit" className="action-btn" style={{ minWidth: 'auto', padding: '0 1rem', background: '#f59e0b', border: 'none', color: '#000', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer' }}>
                    Create
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
        {/* 🎨 Metadata Detail Drawer */}
        {metadataDrawerItem && metadataDrawerItem._metadata && (() => {
          const meta = metadataDrawerItem._metadata;
          const itemCat = metadataDrawerItem.category || category;
          return (
            <div className="player-modal-backdrop metadata-drawer-backdrop" onClick={() => setMetadataDrawerItem(null)} style={{ zIndex: 2800 }}>
              <div className="metadata-drawer glass-panel fade-in" onClick={(e) => e.stopPropagation()}>
                {/* Backdrop hero image for Movies/TV */}
                {meta.backdrop && (
                  <div className="metadata-backdrop-hero">
                    <img src={meta.backdrop} alt="" className="metadata-backdrop-img" />
                    <div className="metadata-backdrop-gradient"></div>
                  </div>
                )}
                
                <button className="metadata-drawer-close" onClick={() => setMetadataDrawerItem(null)} title="Close">✕</button>

                <div className="metadata-drawer-body">
                  {/* Poster + Core Info */}
                  <div className="metadata-hero-row">
                    {meta.poster && (
                      <div className="metadata-poster-wrap">
                        <img src={meta.poster} alt="" className="metadata-poster-full" />
                      </div>
                    )}
                    <div className="metadata-core-info">
                      <h2 className="metadata-title">{meta.title || metadataDrawerItem.title}</h2>
                      
                      <div className="metadata-badges-row">
                        {meta.voteAverage && (
                          <span className="metadata-rating-pill tmdb-rating">
                            ⭐ {meta.voteAverage.toFixed(1)} <span className="rating-source">TMDb</span>
                          </span>
                        )}
                        {meta.rating && (
                          <span className="metadata-rating-pill book-rating">
                            ⭐ {meta.rating}{meta.ratingsCount ? ` (${meta.ratingsCount})` : ''} <span className="rating-source">Rating</span>
                          </span>
                        )}
                        {meta.year && <span className="metadata-year-pill">📅 {meta.year}</span>}
                        {meta.trackCount && <span className="metadata-tracks-pill">💿 {meta.trackCount} tracks</span>}
                        {meta.pageCount && <span className="metadata-tracks-pill">📄 {meta.pageCount} pages</span>}
                      </div>

                      {/* Genres */}
                      {meta.genres && meta.genres.length > 0 && (
                        <div className="metadata-genres">
                          {meta.genres.map((g, gi) => (
                            <span key={gi} className="metadata-genre-chip">{g}</span>
                          ))}
                        </div>
                      )}

                      {/* Subjects (Ebooks) */}
                      {meta.subjects && meta.subjects.length > 0 && (
                        <div className="metadata-genres">
                          {meta.subjects.map((s, si) => (
                            <span key={si} className="metadata-genre-chip">{s}</span>
                          ))}
                        </div>
                      )}

                      {/* Artist / Author */}
                      {meta.artist && <p className="metadata-artist">🎤 <strong>{meta.artist}</strong></p>}
                      {meta.author && <p className="metadata-artist">✍️ <strong>{meta.author}</strong></p>}
                      {meta.genre && <p className="metadata-genre-line">🎶 {meta.genre}</p>}
                    </div>
                  </div>

                  {/* Plot / Description */}
                  {meta.overview && (
                    <div className="metadata-overview-section">
                      <h4 className="metadata-section-title">
                        {(itemCat === 'Movies' || itemCat === 'TV') ? '📝 Plot' : '📝 Description'}
                      </h4>
                      <p className="metadata-overview-text">{meta.overview}</p>
                    </div>
                  )}

                  {/* Track List (Music) */}
                  {itemCat === 'Music' && meta.tracks && meta.tracks.length > 0 && (
                    <div className="metadata-tracks-section">
                      <h4 className="metadata-section-title">💿 Track List</h4>
                      <div className="metadata-tracks-list">
                        {meta.tracks.map((track, ti) => {
                          const formatDuration = (ms) => {
                            if (!ms) return '--:--';
                            const mins = Math.floor(ms / 60000);
                            const secs = Math.floor((ms % 60000) / 1000);
                            return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
                          };
                          return (
                            <div key={ti} className="metadata-track-row">
                              <span className="metadata-track-num">{track.number}</span>
                              <span className="metadata-track-name">{track.name}</span>
                              <span className="metadata-track-dur">{formatDuration(track.durationMs)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Cast (Movies/TV) */}
                  {meta.cast && meta.cast.length > 0 && (
                    <div className="metadata-cast-section">
                      <h4 className="metadata-section-title">🎭 Cast</h4>
                      <div className="metadata-cast-grid">
                        {meta.cast.map((c, ci) => (
                          <div key={ci} className="metadata-cast-card">
                            {c.profilePath ? (
                              <img src={c.profilePath} alt="" className="cast-headshot" loading="lazy" />
                            ) : (
                              <div className="cast-headshot-placeholder">👤</div>
                            )}
                            <div className="cast-info">
                              <span className="cast-name">{c.name}</span>
                              <span className="cast-character">{c.character}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* External Links */}
                  <div className="metadata-links-section">
                    {meta.trailer && (
                      <a href={`https://www.youtube.com/watch?v=${meta.trailer}`} target="_blank" rel="noopener noreferrer" className="metadata-ext-link trailer-link">
                        ▶️ Watch Trailer
                      </a>
                    )}
                    {meta.iTunesUrl && (
                      <a href={meta.iTunesUrl} target="_blank" rel="noopener noreferrer" className="metadata-ext-link itunes-link">
                        🎵 View on iTunes
                      </a>
                    )}
                    {meta.goodreadsUrl && (
                      <a href={meta.goodreadsUrl} target="_blank" rel="noopener noreferrer" className="metadata-ext-link goodreads-link">
                        📚 Goodreads
                      </a>
                    )}
                    {meta.googleBooksUrl && (
                      <a href={meta.googleBooksUrl} target="_blank" rel="noopener noreferrer" className="metadata-ext-link gbooks-link">
                        📖 Google Books
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      </main>

      <footer className="app-footer">
        <p>Premio — Built by BioHapHazard • <button type="button" className="link-button footer-disclaimer-btn" onClick={() => setShowLegalDisclaimer(true)}>⚖️ Legal Disclaimer & TOS</button></p>
        <p className="sub-footer">Stateless, fast, and secure API-driven interface</p>
      </footer>

      {/* ⚖️ Terms of Service & Legal Disclaimer Modal */}
      {showLegalDisclaimer && (
        <div className="modal-overlay legal-modal-overlay fade-in">
          <div className="modal-card legal-modal-card glass-panel" style={{ maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>⚖️ Legal Disclaimer & Terms of Service</h2>
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
                    triggerToast('⚠️ Please check the agreement box to proceed.', 'error');
                    return;
                  }
                  setShowLegalDisclaimer(false);
                  triggerToast('⚖️ Terms of Service acknowledged.', 'success');
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
      )}

      {/* 💡 Onboarding Wizard Modal */}
      {showOnboarding && (
        <div className="modal-overlay legal-modal-overlay fade-in">
          <div className="modal-card legal-modal-card glass-panel" style={{ maxWidth: '600px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>🚀 Setup Guide (Step {onboardingStep} of 3)</h2>
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
                ✕
              </button>
            </div>
            
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {onboardingStep === 1 && (
                <div className="onboarding-step fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}>🔌 Connect your Premiumize Account</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                    Premio is completely client-side and serverless. To check file cache status, create downloads, and stream files, you must connect your Premiumize.me account.
                  </p>
                  
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid var(--color-primary)', fontSize: '0.8rem' }}>
                    <strong>Don&apos;t have a Premiumize account?</strong><br />
                    <a href={PM_SIGNUP_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline', display: 'inline-block', marginTop: '4px', fontWeight: 'bold' }}>
                      Click here to visit Premiumize.me & Sign Up ➔
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
                  </div>
                </div>
              )}

              {onboardingStep === 2 && (
                <div className="onboarding-step fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}>🔍 Configure Jackett (Optional)</h3>
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

                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                    💡 Set up trackers (e.g. LimeTorrents, EZTV) inside your Jackett dashboard so search queries return cached media.
                  </p>
                </div>
              )}

              {onboardingStep === 3 && (
                <div className="onboarding-step fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}>🎬 Fetch Metadata & TMDb (Optional)</h3>
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
                  </div>

                  <div style={{ background: 'rgba(74, 222, 128, 0.05)', borderLeft: '3px solid #4ade80', padding: '10px', borderRadius: '6px', fontSize: '0.8rem', color: '#4ade80', marginTop: '10px' }}>
                    🎉 Setup Complete! You can edit these keys or add Usenet indexers inside the Control Panel at any time.
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
                      triggerToast('💡 Note: You skipped adding a Premiumize key. The app will run in Developer Mock Mode.', 'warning');
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
                    triggerToast('🎉 Onboarding completed! You are ready to search.', 'success');
                  }}
                >
                  🚀 Finish & Start Searching
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🎬 Playlist Choice Modal */}
      {showPlaylistChoiceModal && (
        <div className="modal-overlay legal-modal-overlay fade-in">
          <div className="modal-card legal-modal-card glass-panel" style={{ maxWidth: '500px', width: '90%' }}>
            <div className="modal-header">
              <h2 style={{ background: 'linear-gradient(135deg, #ffffff 40%, var(--color-primary) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>🎬 Choose Playback Mode</h2>
            </div>
            
            <div className="modal-body" style={{ fontSize: '0.95rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '12px', lineHeight: '1.4' }}>
              <p>
                We found <strong>{pendingPlaylistFiles.length} videos</strong> inside <strong>&quot;{pendingPlaylistName}&quot;</strong>.
              </p>
              
              {hasAviOrMkvInPending && (
                <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #ef4444', fontSize: '0.8rem', color: '#fca5a5', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontWeight: 'bold' }}>⚠️ Browser Codec Warning:</span>
                  <span>
                    Some files are in <strong>.avi</strong> or <strong>.mkv</strong> formats. Modern web browsers (Chrome, Safari, Edge) cannot play these formats natively. Since Premiumize retired their public video transcoding API, these will show a black screen or fail to play in the browser.
                  </span>
                </div>
              )}

              <p>
                How would you like to play this playlist?
              </p>
            </div>
            
            <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
              <button 
                type="button" 
                className="action-btn"
                onClick={() => handleLaunchBrowserPlaylist(pendingPlaylistFiles, pendingPlaylistName)}
                style={{ 
                  width: '100%', 
                  background: 'linear-gradient(135deg, var(--color-primary) 0%, #4f46e5 100%)',
                  padding: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                🌐 Play in Web Browser (HTML5)
              </button>
              
              <button 
                type="button" 
                className="action-btn success"
                onClick={() => downloadM3UPlaylist(pendingPlaylistFiles, pendingPlaylistName)}
                style={{ 
                  width: '100%', 
                  background: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)',
                  padding: '12px',
                  fontWeight: 'bold',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                📥 Download M3U Playlist (Recommended for VLC)
              </button>

              <button 
                type="button" 
                className="action-btn text-only"
                onClick={() => setShowPlaylistChoiceModal(false)}
                style={{ 
                  width: '100%', 
                  padding: '8px',
                  color: 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
