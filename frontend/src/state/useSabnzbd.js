import { useState } from 'react';
import { getIndexerShortName } from '../lib/format';

// Owns the SABnzbd downloader state: the active queue slots, the completed history
// slots, the active download speed, and connection check status.
// Also manages automatic fallback tracking states and recorded indexers.
//
// NOTE: all actual API requests (polling, adding, deleting, testing) are defined
// as handlers in AppContent (using credentialed fetch) and update these states.
export function useSabnzbd() {
  const [sabQueue, setSabQueue] = useState([]);
  const [sabHistory, setSabHistory] = useState([]);
  const [sabSpeed, setSabSpeed] = useState('0 B/s');
  const [sabLoading, setSabLoading] = useState(false);
  const [sabConnected, setSabConnected] = useState(null); // null, 'success', 'error', 'testing'

  const [sabnzbdAutoFallbacks, setSabnzbdAutoFallbacks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('premio_sab_fallbacks') || '{}');
    } catch (e) {
      return {};
    }
  });

  const [completedIndexers, setCompletedIndexers] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('premio_completed_indexers') || '{}');
    } catch (e) {
      return {};
    }
  });

  const [indexerStats, setIndexerStats] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('premio_indexer_stats') || '{}');
    } catch (e) {
      return {};
    }
  });

  const updateIndexerStats = (rawIndexerName, type, bytes = 0) => {
    if (!rawIndexerName) return;
    const indexerName = getIndexerShortName(rawIndexerName);

    setIndexerStats(prev => {
      const updated = { ...prev };
      if (!updated[indexerName]) {
        updated[indexerName] = {
          attempts: 0,
          successes: 0,
          failures: 0,
          totalBytes: 0,
          lastUsed: null
        };
      }

      const stats = updated[indexerName];
      stats.lastUsed = new Date().toISOString();

      if (type === 'attempt') {
        stats.attempts += 1;
      } else if (type === 'success') {
        stats.successes += 1;
        if (bytes > 0) {
          stats.totalBytes += bytes;
        }
      } else if (type === 'failure') {
        stats.failures += 1;
      }

      localStorage.setItem('premio_indexer_stats', JSON.stringify(updated));
      return updated;
    });
  };

  const resetIndexerStats = () => {
    setIndexerStats({});
    localStorage.removeItem('premio_indexer_stats');
  };

  return {
    sabQueue, setSabQueue,
    sabHistory, setSabHistory,
    sabSpeed, setSabSpeed,
    sabLoading, setSabLoading,
    sabConnected, setSabConnected,
    sabnzbdAutoFallbacks, setSabnzbdAutoFallbacks,
    completedIndexers, setCompletedIndexers,
    indexerStats, updateIndexerStats,
    resetIndexerStats,
  };
}

