// Kids-profile content filtering: adult-keyword/tracker filtering and age-rating gating (no React).

export const filterResultsForKids = (items, profile) => {
  if (!items) return [];
  if (!profile || !profile.isKids) return items;

  // Strict adult keyword filtering on titles using word boundary regex
  const adultTerms = [
    'xxx', 'porn', 'nsfw', 'adult', 'erotica', '18\\+', 'sex', 'nude',
    'hentai', 'milf', 'blowjob', 'anal', 'ass', 'cunt', 'dick', 'cock', 'vagina',
    'orgasm', 'naked', 'softcore', 'hardcore', 'erotic', 'sensual', 'playboy'
  ];

  const regex = new RegExp('\\b(' + adultTerms.join('|') + ')\\b', 'i');

  let filtered = items.filter(item => {
    const title = item.title || item.name || '';
    return !regex.test(title);
  });

  // Tracker Whitelisting
  if (profile.allowedTrackers && profile.allowedTrackers.length > 0) {
    filtered = filtered.filter(item => {
      const trackerName = (item.tracker || item.indexer || '').toLowerCase().trim();
      return profile.allowedTrackers.some(allowed => {
        const allowedLower = allowed.toLowerCase().trim();
        return trackerName.includes(allowedLower) || allowedLower.includes(trackerName);
      });
    });
  }

  return filtered;
};

export const isRatingAllowed = (certification, category, profile) => {
  if (!profile || !profile.isKids) return true;

  const cert = (certification || '').toUpperCase().trim();

  // If no certification was resolved (meaning Unrated or empty)
  if (!cert || cert === 'UNRATED' || cert === 'NR' || cert === 'NOT RATED') {
    return !profile.blockUnrated; // True if parent allows unrated
  }

  // Handle movie categories
  if (category === 'Movies') {
    const maxMovie = profile.maxMovieRating || 'PG-13';
    if (maxMovie === 'Any') return true;

    // US Movie ratings
    const movieOrder = ['G', 'PG', 'PG-13', 'R', 'NC-17'];
    const maxIdx = movieOrder.indexOf(maxMovie);
    const itemIdx = movieOrder.indexOf(cert);

    if (itemIdx !== -1 && maxIdx !== -1) {
      return itemIdx <= maxIdx;
    }

    // International age check fallbacks (e.g. 18, 15, M18, R21)
    const ageMatch = cert.match(/\d+/);
    if (ageMatch) {
      const age = parseInt(ageMatch[0]);
      if (maxMovie === 'G') return age <= 6;
      if (maxMovie === 'PG') return age <= 12;
      if (maxMovie === 'PG-13') return age <= 13;
      if (maxMovie === 'R') return age <= 17;
    }

    // Fallback block if unrecognized rating and G/PG
    if (['G', 'PG'].includes(maxMovie)) return false;
    return true;
  }

  // Handle TV show categories
  if (category === 'TV') {
    const maxTv = profile.maxTvRating || 'TV-14';
    if (maxTv === 'Any') return true;

    const tvOrder = ['TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'];
    const maxIdx = tvOrder.indexOf(maxTv);
    const itemIdx = tvOrder.indexOf(cert);

    if (itemIdx !== -1 && maxIdx !== -1) {
      return itemIdx <= maxIdx;
    }

    // International TV rating fallback numbers
    const ageMatch = cert.match(/\d+/);
    if (ageMatch) {
      const age = parseInt(ageMatch[0]);
      if (maxTv === 'TV-G') return age <= 6;
      if (maxTv === 'TV-PG') return age <= 12;
      if (maxTv === 'TV-14') return age <= 14;
      if (maxTv === 'TV-MA') return age <= 17;
    }

    if (['TV-Y', 'TV-Y7', 'TV-G', 'TV-PG'].includes(maxTv)) return false;
    return true;
  }

  return true;
};
