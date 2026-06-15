// Continue-Watching title normalization & conflict-free merge helpers (no React).
import { cleanUrl } from './format';

// Reduce a release name to a canonical "title (+ year)" key so different releases
// of the same movie/episode (varying quality, codec, group) collapse to one key.
// Used to share TMDb metadata across sibling results when one resolved and another
// didn't (because its messy release name cleaned to a non-matching title).
export const normalizeTitle = (raw) => {
  if (!raw) return '';
  const t = String(raw).toLowerCase().replace(/[._]/g, ' ');
  // Find the year first (it's the strongest anchor), then keep only the text before it.
  const ym = t.match(/\b(19|20)\d{2}\b/);
  const year = ym ? ym[0] : '';
  let core = ym
    ? t.slice(0, ym.index)
    : t.split(/\b(2160p|1080p|720p|480p|4k|uhd|bluray|blu-ray|web-?dl|webrip|brrip|hdrip|dvdrip|x264|x265|h ?264|h ?265|hevc|remux|av1)\b/i)[0];
  core = core
    .replace(/[[(][^\])]*[\])]/g, ' ')                                            // drop [bracket]/(paren) groups
    .replace(/\b(reup|proper|repack|internal|read nfo|multi|complete)\b/gi, ' ')  // release-action words
    .replace(/\b(imax|extended|unrated|remastered|directors? cut|theatrical|10 ?bit|hdr)\b/gi, ' ') // editions
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return year ? `${core} ${year}`.trim() : core;
};

// Continue-Watching conflict-free merge. Cloud sync used to OVERWRITE the local
// list, so a peer instance (or a stale background pull) could wipe the movie you're
// actively watching. Instead we union local + cloud keyed by the token-independent
// file path (cleanUrl), keep the newer entry by timestamp, and honor removal
// "tombstones" so a manual delete stays deleted instead of being resurrected.
export const mergeTombstoneLists = (a = [], b = []) => {
  const m = new Map();
  for (const t of [...a, ...b]) {
    if (!t || !t.link) continue;
    m.set(t.link, Math.max(m.get(t.link) || 0, t.removedAt || 0));
  }
  const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 60; // drop tombstones older than 60 days
  return [...m.entries()].filter(([, removedAt]) => removedAt > cutoff).map(([link, removedAt]) => ({ link, removedAt }));
};

export const mergeProgress = (local = [], cloud = [], tombstones = [], limit = 12) => {
  const tomb = new Map();
  for (const t of tombstones) { if (t && t.link) tomb.set(t.link, t.removedAt || 0); }
  const byKey = new Map();
  // cloud first, then local, so an equal-or-newer local entry wins ties
  for (const item of [...cloud, ...local]) {
    if (!item || !item.link) continue;
    const k = cleanUrl(item.link);
    const cur = byKey.get(k);
    if (!cur || (item.timestamp || 0) >= (cur.timestamp || 0)) byKey.set(k, item);
  }
  const out = [];
  for (const [k, item] of byKey) {
    if ((tomb.get(k) || 0) >= (item.timestamp || 0)) continue; // removed after last watch → stays removed
    out.push(item);
  }
  return out.sort((x, y) => (y.timestamp || 0) - (x.timestamp || 0)).slice(0, limit);
};
