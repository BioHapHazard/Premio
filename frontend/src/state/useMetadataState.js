import { useState, useRef } from 'react';

// Owns the rich-metadata domain state shared across search, library, continue-
// watching, watchlist, the detail drawer, and the players: the resolved metadata
// map, the currently-open drawer item, the TMDb reviews panel state, and the
// Letterboxd rating/reviews panel state. Also owns the three metadata refs (the
// resolved-metadata cache, the in-flight de-dupe set, and the drawer close-button
// ref for focus management).
//
// NOTE: the derived canonicalMeta/activeMeta memos, the drawer-open effect, and
// the fetch logic (fetchMetadataBatch, getMetadata, toggleReviews) stay in
// AppContent — they depend on the search category and the credentialed fetch
// helper. They read this state via context.
export function useMetadataState() {
  const metadataCacheRef = useRef(new Map());
  const metadataInFlightRef = useRef(new Set());
  const metadataDrawerCloseRef = useRef(null);

  const [metadataResults, setMetadataResults] = useState({});
  const [metadataDrawerItem, setMetadataDrawerItem] = useState(null);

  // TMDb reviews panel (detail drawer)
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsData, setReviewsData] = useState([]);
  const [reviewsError, setReviewsError] = useState('');

  // Letterboxd rating + reviews panel (detail drawer) — fetched lazily on open.
  const [lbRating, setLbRating] = useState(null); // { rating, url } | null
  const [lbReviewsOpen, setLbReviewsOpen] = useState(false);
  const [lbReviewsLoading, setLbReviewsLoading] = useState(false);
  const [lbReviewsData, setLbReviewsData] = useState([]);
  const [lbReviewsError, setLbReviewsError] = useState('');

  return {
    metadataCacheRef, metadataInFlightRef, metadataDrawerCloseRef,
    metadataResults, setMetadataResults,
    metadataDrawerItem, setMetadataDrawerItem,
    reviewsOpen, setReviewsOpen,
    reviewsLoading, setReviewsLoading,
    reviewsData, setReviewsData,
    reviewsError, setReviewsError,
    lbRating, setLbRating,
    lbReviewsOpen, setLbReviewsOpen,
    lbReviewsLoading, setLbReviewsLoading,
    lbReviewsData, setLbReviewsData,
    lbReviewsError, setLbReviewsError,
  };
}
