import { useState } from 'react';

// Owns the in-browser audio player state (music albums & audiobooks): active
// torrent, selected track, the playable track list, the track search filter,
// and the resume position.
//
// NOTE: the 'audio-progress' / 'audio-ended' / 'audio-player-ready' iframe
// message listener stays in App for now. It calls getMetadata,
// removeFromContinueWatching and triggerToast, which are declared later in the
// component body — passing them into this hook at its (early) call site would
// hit the temporal dead zone. The effect folds in here once those collaborators
// also live in the provider.
export function useAudioPlayer() {
  const [activeAudioTorrent, setActiveAudioTorrent] = useState(null);
  const [selectedAudioFile, setSelectedAudioFile] = useState(null);
  const [audioPlayableFiles, setAudioPlayableFiles] = useState([]);
  const [audioSearchQuery, setAudioSearchQuery] = useState('');
  const [resumeAudioTime, setResumeAudioTime] = useState(0);

  return {
    activeAudioTorrent, setActiveAudioTorrent,
    selectedAudioFile, setSelectedAudioFile,
    audioPlayableFiles, setAudioPlayableFiles,
    audioSearchQuery, setAudioSearchQuery,
    resumeAudioTime, setResumeAudioTime,
  };
}
