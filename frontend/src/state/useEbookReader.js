import { useState, useEffect } from 'react';
import { cleanUrl } from '../lib/format';

// Owns the eBook/PDF reader state: active torrent, selected book file, the list
// of readable files, the search filter, and the resume position (chapter +
// scroll). Also listens for 'ebook-progress' postMessages from the reader iframe
// and writes reading progress into Continue Watching (setter passed in, since
// that domain still lives in App for now).
export function useEbookReader({ setContinueWatchingList }) {
  const [activeEbookTorrent, setActiveEbookTorrent] = useState(null);
  const [selectedEbookFile, setSelectedEbookFile] = useState(null);
  const [ebookPlayableFiles, setEbookPlayableFiles] = useState([]);
  const [ebookSearchQuery, setEbookSearchQuery] = useState('');
  const [resumeEbookChapter, setResumeEbookChapter] = useState(null);
  const [resumeEbookScroll, setResumeEbookScroll] = useState(null);

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

  return {
    activeEbookTorrent, setActiveEbookTorrent,
    selectedEbookFile, setSelectedEbookFile,
    ebookPlayableFiles, setEbookPlayableFiles,
    ebookSearchQuery, setEbookSearchQuery,
    resumeEbookChapter, setResumeEbookChapter,
    resumeEbookScroll, setResumeEbookScroll,
  };
}
