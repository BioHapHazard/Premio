import { useState, useRef } from 'react';
import { RESULTS_BATCH } from '../lib/constants';

// Owns the search domain state: query + category, raw results, loading/searched/
// error flags, the incremental-render visibleCount (+ loadMoreRef sentinel), the
// active download id, torrent/usenet mode, the usenet-warning dismissal, drag-drop
// import state, the filter controls, the sort order, and the recent searches /
// downloads history.
//
// NOTE: derived values (the kids-filtered `results` memo, `processedResults`), the
// search execution, the visibleCount-reset + infinite-scroll effects, and the
// displayed-results metadata fetch all stay in AppContent — they depend on profiles,
// the credentialed fetch, and fetchMetadataBatch. They read this state via context.
export function useSearchState() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Movies');
  const [rawResults, setRawResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [visibleCount, setVisibleCount] = useState(RESULTS_BATCH);
  const loadMoreRef = useRef(null);
  const [activeDownloadId, setActiveDownloadId] = useState(null);
  const [searchMode, setSearchMode] = useState('torrent'); // 'torrent' or 'usenet'
  const [hideUsenetWarning, setHideUsenetWarning] = useState(() => {
    return localStorage.getItem('premio_hide_usenet_warning') === 'true';
  });
  const [isDragging, setIsDragging] = useState(false);
  const [magnetInput, setMagnetInput] = useState('');

  const [showFilters, setShowFilters] = useState(false);
  const [filterQuality, setFilterQuality] = useState('All');
  const [filterMaxSize, setFilterMaxSize] = useState(100); // Max size in GB, 100 = Unlimited
  const [filterMinSeeders, setFilterMinSeeders] = useState(0);
  const [excludeKeywords, setExcludeKeywords] = useState('');
  const [sortBy, setSortBy] = useState('cached-seeders'); // cached-seeders, seeders, size-desc, size-asc, date

  const [recentSearches, setRecentSearches] = useState(() => {
    const saved = localStorage.getItem('premium_search_recent_queries');
    return saved ? JSON.parse(saved) : [];
  });
  const [recentDownloads, setRecentDownloads] = useState(() => {
    const saved = localStorage.getItem('premium_search_downloads');
    return saved ? JSON.parse(saved) : [];
  });

  return {
    query, setQuery,
    category, setCategory,
    rawResults, setRawResults,
    loading, setLoading,
    searched, setSearched,
    searchError, setSearchError,
    visibleCount, setVisibleCount,
    loadMoreRef,
    activeDownloadId, setActiveDownloadId,
    searchMode, setSearchMode,
    hideUsenetWarning, setHideUsenetWarning,
    isDragging, setIsDragging,
    magnetInput, setMagnetInput,
    showFilters, setShowFilters,
    filterQuality, setFilterQuality,
    filterMaxSize, setFilterMaxSize,
    filterMinSeeders, setFilterMinSeeders,
    excludeKeywords, setExcludeKeywords,
    sortBy, setSortBy,
    recentSearches, setRecentSearches,
    recentDownloads, setRecentDownloads,
  };
}
