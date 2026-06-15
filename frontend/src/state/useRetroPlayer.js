import { useState, useEffect } from 'react';

// Owns the retro arcade (EmulatorJS) player state: the active torrent, the
// selected ROM file, the list of playable ROMs, and the ROM search filter.
// Also installs the scroll-lock that stops arrow keys / space from scrolling
// the page while a ROM is active (so they reach the emulator instead).
export function useRetroPlayer() {
  const [activeRetroTorrent, setActiveRetroTorrent] = useState(null);
  const [selectedRetroRomFile, setSelectedRetroRomFile] = useState(null);
  const [retroPlayableFiles, setRetroPlayableFiles] = useState([]);
  const [retroSearchQuery, setRetroSearchQuery] = useState('');

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

  return {
    activeRetroTorrent, setActiveRetroTorrent,
    selectedRetroRomFile, setSelectedRetroRomFile,
    retroPlayableFiles, setRetroPlayableFiles,
    retroSearchQuery, setRetroSearchQuery,
  };
}
