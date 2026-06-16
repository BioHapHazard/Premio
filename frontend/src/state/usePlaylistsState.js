import { useState } from 'react';

// Owns the custom playlists list + the currently-selected track, plus the
// "add track(s) to a playlist" chooser-modal state (which playlist, the pending
// files, the source item's id/type, and whether the pending set has AVI/MKV).
export function usePlaylistsState() {
  const [playlists, setPlaylists] = useState(() => {
    const saved = localStorage.getItem('premium_search_playlists');
    return saved ? JSON.parse(saved) : [];
  });
  const [playlistSelectionTrack, setPlaylistSelectionTrack] = useState(null);
  const [showPlaylistChoiceModal, setShowPlaylistChoiceModal] = useState(false);
  const [pendingPlaylistFiles, setPendingPlaylistFiles] = useState([]);
  const [pendingPlaylistName, setPendingPlaylistName] = useState('');
  const [hasAviOrMkvInPending, setHasAviOrMkvInPending] = useState(false);
  const [pendingItemId, setPendingItemId] = useState(null);
  const [pendingItemType, setPendingItemType] = useState(''); // 'file', 'folder', or 'torrent'

  return {
    playlists, setPlaylists,
    playlistSelectionTrack, setPlaylistSelectionTrack,
    showPlaylistChoiceModal, setShowPlaylistChoiceModal,
    pendingPlaylistFiles, setPendingPlaylistFiles,
    pendingPlaylistName, setPendingPlaylistName,
    hasAviOrMkvInPending, setHasAviOrMkvInPending,
    pendingItemId, setPendingItemId,
    pendingItemType, setPendingItemType,
  };
}
