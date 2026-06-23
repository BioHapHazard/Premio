import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { Readable, Transform } from 'stream';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import AdmZip from 'adm-zip';
import { createExtractorFromFile } from 'node-unrar-js';
import { spawn } from 'node:child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const ffmpegPath = ffmpegInstaller.path;

// Load environment variables from .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, 'temp_archives');

// Clean up/initialize temp archives folder at startup
try {
  if (fs.existsSync(TEMP_DIR)) {
    const files = fs.readdirSync(TEMP_DIR);
    for (const f of files) {
      fs.rmSync(path.join(TEMP_DIR, f), { recursive: true, force: true });
    }
    console.log('🧹 Cleaned up old temporary archives.');
  } else {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
} catch (e) {
  console.error('Failed to initialize/clean temp_archives:', e);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Behind Fly's proxy: trust the first hop so req.ip is the real client (rate limiting).
app.set('trust proxy', 1);

// Security headers. CSP/COEP/CORP are disabled because the player pages
// (audio/reader/emulator) rely on inline scripts and cross-origin CDN/streamed
// assets; revisit CSP with nonces later. HSTS + nosniff + frameguard still apply.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

// CORS: allow same-origin / non-browser (no Origin) requests and an explicit
// allow-list of browser origins. Replaces the previous wildcard so a malicious
// website can no longer drive the API from a victim's browser. Set
// CORS_ALLOWED_ORIGINS (comma-separated) to your public origin in production.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5174')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);                // curl / same-origin / server-side
    return cb(null, allowedOrigins.includes(origin));  // disallowed -> no ACAO header
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Range', 'Authorization',
    'X-Premiumize-Key', 'X-TMDb-Key', 'X-Jackett-Url', 'X-Jackett-Key', 'X-Usenet-Indexers',
    'X-Sabnzbd-Url', 'X-Sabnzbd-Key', 'X-Sabnzbd-Category', 'X-Sabnzbd-Complete-Dir'],
}));

app.use(express.json({ limit: '5mb' }));

// Rate limiting (per-IP). Generous global cap, with a stricter cap on the
// expensive, keyless, upstream-querying endpoints (search / metadata / proxy).
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, slow down.' } });
const heavyLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, slow down.' } });
app.use('/api/', apiLimiter);
// /api/metadata is intentionally NOT in the strict bucket: it's a cached, BYOK,
// read-only TMDb proxy that a single search legitimately calls for many results
// (poster/rating enrichment). It stays under the general apiLimiter instead.
app.use(['/api/search', '/api/usenet/search', '/api/reviews', '/api/letterboxd-reviews', '/api/proxy-rom', '/api/proxy-subtitle', '/api/subtitles/search', '/api/subtitles/download'], heavyLimiter);

// Dedicated, generous bucket for the high-volume cached metadata endpoint.
const metadataLimiter = rateLimit({ windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, slow down.' } });
app.use('/api/metadata', metadataLimiter);

// Header extraction middleware to support stateless webapp deployments
app.use((req, res, next) => {
  req.userPmKey = (req.headers['x-premiumize-key'] || '').trim();
  req.userTmdbKey = (req.headers['x-tmdb-key'] || '').trim();
  req.userOmdbKey = (req.headers['x-omdb-key'] || '').trim();
  req.userOpenSubsKey = (req.headers['x-opensubtitles-key'] || '').trim();
  req.userSubdlKey = (req.headers['x-subdl-key'] || '').trim();
  req.userJackettUrl = (req.headers['x-jackett-url'] || '').trim();
  req.userJackettKey = (req.headers['x-jackett-key'] || '').trim();
  req.userSabUrl = (req.headers['x-sabnzbd-url'] || '').trim();
  req.userSabKey = (req.headers['x-sabnzbd-key'] || '').trim();
  req.userSabCategory = (req.headers['x-sabnzbd-category'] || '').trim();
  req.userSabCompleteDir = (req.headers['x-sabnzbd-complete-dir'] || '').trim();

  let indexers = [];
  const headerIndexers = req.headers['x-usenet-indexers'];
  if (headerIndexers) {
    try {
      const parsed = JSON.parse(headerIndexers);
      if (Array.isArray(parsed)) {
        indexers = parsed.map(idx => ({
          name: (idx.name || '').trim(),
          url: (idx.url || '').trim(),
          key: (idx.key || '').trim()
        })).filter(idx => idx.name && idx.url);
      }
    } catch (e) {
      console.error('Failed to parse X-Usenet-Indexers header:', e.message);
    }
  }
  req.userUsenetIndexers = indexers;
  next();
});

// Print a welcoming startup check
console.log('=============================================');
console.log('🚀 Premio Backend Starting...');
console.log(`Port: ${PORT}`);
if (!process.env.JACKETT_API_KEY) {
  console.warn('⚠️  Warning: JACKETT_API_KEY is missing in .env. Running in Developer Mock Mode for Jackett.');
} else {
  console.log(`🔗 Jackett URL: ${process.env.JACKETT_URL || 'http://localhost:9117'}`);
}
if (!process.env.PREMIUMIZE_API_KEY) {
  console.warn('⚠️  Warning: PREMIUMIZE_API_KEY is missing in .env. Running in Developer Mock Mode for Premiumize Cache Check.');
}
if (!process.env.NZBGEEK_API_KEY || process.env.NZBGEEK_API_KEY === 'your_nzbgeek_api_key_here') {
  console.warn('⚠️  Warning: NZBGEEK_API_KEY is missing or set to default in .env. Usenet search will run in Developer Mock Mode.');
} else {
  console.log('⚡ NZBGeek API Key: Configured (Usenet searches enabled)');
}
console.log('=============================================');

// Bring-your-own-key model: a request's own key (sent as a header) always wins.
// The owner's .env keys are used ONLY when ALLOW_ENV_KEYS=true (local/sandbox dev),
// never in public production — so anonymous visitors can never spend the owner's
// Premiumize account / quota / AI credits.
const envKeysAllowed = () => process.env.ALLOW_ENV_KEYS === 'true';
const sharedTmdbAllowed = () => envKeysAllowed() || process.env.ENABLE_SHARED_TMDB === 'true';

// OMDb (omdbapi.com) — read-only IMDb / Rotten Tomatoes / Metacritic ratings.
// Same trust model as TMDb: caller's header key first, owner env key only when shared metadata is allowed.
const resolveOmdbKey = (req) => {
  if (req.userOmdbKey) return req.userOmdbKey;
  if (sharedTmdbAllowed() && process.env.OMDB_API_KEY) return process.env.OMDB_API_KEY.trim();
  return '';
};

// Fetch IMDb / Rotten Tomatoes / Metacritic ratings for a known IMDb id.
async function fetchOmdbRatings(imdbId, omdbKey) {
  if (!imdbId || !omdbKey) return null;
  let id = imdbId.toString().trim();
  if (!/^tt\d+$/i.test(id)) id = 'tt' + id.replace(/^tt/i, '');
  if (!/^tt\d+$/i.test(id)) return null;
  try {
    const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(omdbKey)}&i=${encodeURIComponent(id)}`;
    const r = await fetchWithTimeout(url, {}, 8000);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || d.Response === 'False') return null;
    const src = {};
    (d.Ratings || []).forEach(rt => {
      if (rt.Source === 'Internet Movie Database') src.imdb = rt.Value;       // "8.5/10"
      else if (rt.Source === 'Rotten Tomatoes') src.rt = rt.Value;            // "93%"
      else if (rt.Source === 'Metacritic') src.meta = rt.Value;              // "78/100"
    });
    const clean = (v) => (v && v !== 'N/A' ? v : null);
    const ratings = {
      imdbRating: clean(d.imdbRating) || (src.imdb ? src.imdb.split('/')[0] : null),   // "8.5"
      imdbVotes: clean(d.imdbVotes),
      rottenTomatoes: src.rt || null,                                                  // "93%"
      metacritic: (src.meta ? src.meta.split('/')[0] : clean(d.Metascore)),            // "78"
      rated: clean(d.Rated),
      awards: clean(d.Awards)
    };
    // Only return when at least one external rating was found.
    if (ratings.imdbRating || ratings.rottenTomatoes || ratings.metacritic) return ratings;
    return null;
  } catch (e) {
    console.error('❌ OMDb lookup failed:', e.message);
    return null;
  }
}

// Helper: decode common HTML entities left over after tag-stripping scraped text.
function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

// Helper: parse the Letterboxd aggregate rating (out of 5) from an already-fetched page.
function parseLetterboxdRating(html) {
  let rating = null;
  const jsonLdRegex = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    const cleanJson = match[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    try {
      const parsed = JSON.parse(cleanJson);
      if (parsed && parsed.aggregateRating && parsed.aggregateRating.ratingValue) {
        rating = parseFloat(parsed.aggregateRating.ratingValue);
        break;
      }
    } catch (e) {}
  }
  if (rating === null) {
    const metaMatch = html.match(/<meta\s+name="twitter:data2"\s+content="([0-9.]+)\s+out of 5"/i);
    if (metaMatch) rating = parseFloat(metaMatch[1]);
  }
  return rating;
}

// Helper: Parse Letterboxd popular reviews from HTML
function parseLetterboxdReviews(html) {
  const reviews = [];
  const articleRegex = /<article[^>]*class="[^"]*js-production-viewing[^"]*"[\s\S]*?<\/article>/gi;
  let match;
  while ((match = articleRegex.exec(html)) !== null && reviews.length < 8) {
    const articleHtml = match[0];
    
    // Author
    let author = 'Anonymous';
    const authorMatch = articleHtml.match(/<strong class="displayname">([^<]+)<\/strong>/i);
    if (authorMatch) {
      author = decodeEntities(authorMatch[1].trim());
    } else {
      const personMatch = articleHtml.match(/data-person="([^"]+)"/i);
      if (personMatch) {
        author = decodeEntities(personMatch[1].trim());
      }
    }
    
    // Rating
    let ratingValue = null;
    const ratingMatch = articleHtml.match(/aria-label="([★½]+)"/i) || articleHtml.match(/<title>([★½]+)<\/title>/i);
    if (ratingMatch) {
      const stars = ratingMatch[1];
      let val = 0;
      for (let char of stars) {
        if (char === '★') val += 2;
        else if (char === '½') val += 1;
      }
      ratingValue = val;
    }
    
    // Content
    let content = '';
    const bodyMatch = articleHtml.match(/<div class="body-text -prose -reset js-review-body js-collapsible-text"[^>]*>([\s\S]*?)<\/div>/i);
    if (bodyMatch) {
      content = decodeEntities(
        bodyMatch[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );
    }
    
    // URL
    let reviewUrl = null;
    const urlMatch = articleHtml.match(/href="(\/[a-zA-Z0-9_-]+\/film\/[^/"]+)/i);
    if (urlMatch) {
      reviewUrl = `https://letterboxd.com${urlMatch[1]}`;
    }
    
    if (content) {
      reviews.push({
        author,
        rating: ratingValue,
        content,
        url: reviewUrl
      });
    }
  }
  return reviews;
}

// Helper: Resolve Premiumize Key prioritizing user settings header
const resolvePremiumizeKey = (req) => {
  if (req.userPmKey) return req.userPmKey;
  if (envKeysAllowed() && process.env.PREMIUMIZE_API_KEY) return process.env.PREMIUMIZE_API_KEY.trim();
  return '';
};

// Helper: Resolve SABnzbd config prioritizing user settings headers.
//
// SECURITY: these routes are intended for a localhost/LAN deployment only. They
// proxy a user-supplied sabUrl (deliberately exempt from the private-IP SSRF
// guard, since SABnzbd lives on the local network) and must NOT be exposed
// publicly without an auth layer in front of them.
//
// `allowQueryCreds` is opt-in and granted ONLY to the video-element routes
// (/api/sab/stream, /api/sab/transcode): the HTML5 <video> element fetches its
// src directly, bypassing fetchWithCredentials, so those URLs carry credentials
// as query params. The JSON API routes (test/status/add/delete) always use
// request headers — they never honor query-param creds, which prevents a
// cross-site GET from SSRF-triggering them (custom headers can't be set
// cross-origin). The query-param key is LAN-only and lands in access logs;
// acceptable for local use, replace with a signed token before any public deploy.
const resolveSab = (req, { allowQueryCreds = false } = {}) => {
  const q = allowQueryCreds ? (req.query || {}) : {};
  const sabUrl = req.userSabUrl || q.sabUrl || (envKeysAllowed() ? process.env.SABNZBD_URL : '') || '';
  const sabKey = req.userSabKey || q.sabKey || (envKeysAllowed() ? process.env.SABNZBD_API_KEY : '') || '';
  const sabCategory = req.userSabCategory || q.sabCategory || (envKeysAllowed() ? process.env.SABNZBD_CATEGORY : '') || '';
  const sabCompleteDir = req.userSabCompleteDir || q.sabCompleteDir || (envKeysAllowed() ? process.env.SABNZBD_COMPLETE_DIR : '') || '';
  return {
    sabUrl: sabUrl.replace(/\/+$/, ''),
    sabKey,
    sabCategory,
    sabCompleteDir
  };
};

// --- SSRF guard ---------------------------------------------------------------
// The subtitle / ROM proxy endpoints fetch a user-supplied URL. Without a guard a
// visitor could make the server reach internal addresses (Fly 6PN, cloud metadata
// 169.254.169.254, localhost services, etc.). assertPublicHttpUrl() resolves the
// host and rejects the request if ANY resolved address is private/reserved.
function ipv4ToLong(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    n = (n << 8) | octet;
  }
  return n >>> 0;
}
function isPrivateIp(ip) {
  if (!ip) return true;
  let addr = ip.trim().toLowerCase();
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped IPv6
  if (mapped) addr = mapped[1];
  if (addr.includes(':')) {
    if (addr === '::1' || addr === '::') return true;       // loopback / unspecified
    if (addr.startsWith('fe80')) return true;               // link-local
    if (addr.startsWith('ff')) return true;                 // multicast
    const hi = parseInt(addr.split(':')[0] || '0', 16);
    if ((hi & 0xfe00) === 0xfc00) return true;              // fc00::/7 ULA (incl. Fly fdaa::/16)
    return false;
  }
  const n = ipv4ToLong(addr);
  if (n === null) return true; // unparseable -> treat as unsafe
  const inRange = (base, bits) => (n >>> (32 - bits)) === (ipv4ToLong(base) >>> (32 - bits));
  return (
    inRange('0.0.0.0', 8) || inRange('10.0.0.0', 8) || inRange('100.64.0.0', 10) ||
    inRange('127.0.0.0', 8) || inRange('169.254.0.0', 16) || inRange('172.16.0.0', 12) ||
    inRange('192.0.0.0', 24) || inRange('192.168.0.0', 16) || inRange('198.18.0.0', 15) ||
    inRange('224.0.0.0', 4) || inRange('240.0.0.0', 4)
  );
}
async function assertPublicHttpUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { throw new Error('invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http(s) URLs are allowed');
  const host = u.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  let addresses;
  try {
    addresses = await dns.promises.lookup(host, { all: true });
  } catch {
    throw new Error('could not resolve host');
  }
  for (const a of addresses) {
    if (isPrivateIp(a.address)) throw new Error('target resolves to a private/reserved address');
  }
  return u;
}

// Category mappings from Name to Torznab codes (supports multiple categories)
const CATEGORY_MAP = {
  'Movies': [2000],
  'TV': [5000],
  'Music': [
    3000, 3050, 100013, 100062, 100117, 100051, 100118, 100046, 100066, 100122,
    100123, 100126, 100127, 100128, 100121, 100195, 100052, 100065, 100134, 100059,
    100061, 100040, 100074, 100080, 100082, 100111, 100135, 100041, 100130, 100054,
    100064, 100075, 100108, 100081, 100091, 100058, 100092, 100112, 100137, 100047,
    100060, 100129, 100203, 100154, 100133, 100140, 100110, 100180, 100050, 100171,
    100132, 100125, 100049, 100099, 100083, 100109, 100136, 100043, 100048, 100178,
    100090, 100172, 100042, 100115, 100116, 100056, 100053, 100139, 100076, 100162,
    100193, 100068, 100179, 100096, 100067, 100069, 100157, 100120, 100173, 100170,
    100119, 100114, 100044, 100077, 100131, 100089, 100113, 100078, 100138, 100100,
    100057, 100187, 100029, 100167, 100184, 100166, 100163, 100200, 100165, 100164,
    100168, 100201, 100084, 100087, 100086, 100088, 100085, 100093
  ],
  'Audiobooks': [3030],
  'Ebooks': [7000, 100027, 100101, 100226, 100211, 100105, 100239],
  'Software': [
    4000, 4030, 4040, 4060, 4070, 100012, 100175, 100177, 100032, 100037, 100034,
    100176, 100174, 100018, 100186, 100207, 100214, 100215, 100235, 100224, 100106,
    100160, 100161, 100185, 100021
  ],
  'VST': [100015, 100072, 100181, 100188, 100189, 100210, 100223, 100225, 100245, 4000, 4030, 3050],
  'Adult': [6000],
  'Other': [
    8000, 100019, 100020, 100197, 100183, 100141, 100142, 100143, 100144, 100145,
    100196, 100146, 100147, 100148, 100199, 100149, 100194, 100150, 100151, 100152,
    100182, 100028, 100153, 100190, 100219, 100227, 100228, 100229, 100230, 100250,
    100246, 100247, 100249, 100231, 100222, 100237, 100212, 100213, 100233, 100234,
    100243, 100244, 100220, 100216, 100217, 100218, 100232, 100238, 100221
  ],
  'Retro Games': [1000]
};

// Global cache for imported NZB files
const importedNzbsCache = new Map();

// Helper: Decode bencode to extract torrent info hash, name, and total size
function decodeBencode(buffer) {
  let pos = 0;

  function peek() {
    return buffer[pos];
  }

  function readChar() {
    return String.fromCharCode(buffer[pos++]);
  }

  function readUntil(char) {
    let start = pos;
    while (pos < buffer.length && buffer[pos] !== char.charCodeAt(0)) {
      pos++;
    }
    const val = buffer.toString('utf8', start, pos);
    pos++; // skip the char
    return val;
  }

  function parseVal() {
    const char = readChar();
    if (char === 'i') {
      const numStr = readUntil('e');
      return Number(numStr);
    }
    if (char === 'l') {
      const list = [];
      while (peek() !== 'e'.charCodeAt(0)) {
        list.push(parseVal());
      }
      pos++; // skip 'e'
      return list;
    }
    if (char === 'd') {
      const dict = {};
      while (peek() !== 'e'.charCodeAt(0)) {
        const key = parseVal();
        
        const valStart = pos;
        const val = parseVal();
        const valEnd = pos;
        
        dict[key] = val;
        
        if (key === 'info') {
          dict._rawInfo = buffer.subarray(valStart, valEnd);
        }
      }
      pos++; // skip 'e'
      return dict;
    }
    // String
    pos--; // backtrack string length start
    const lenStr = readUntil(':');
    const len = Number(lenStr);
    const strBuffer = buffer.subarray(pos, pos + len);
    pos += len;
    return strBuffer.toString('utf8');
  }

  try {
    return parseVal();
  } catch (e) {
    throw new Error('Failed to parse bencode: ' + e.message);
  }
}

// Helper: Parse NZB XML to extract clean title and total size
function parseNzbFile(xmlString, filename) {
  let totalSize = 0;
  const byteMatches = xmlString.matchAll(/bytes="(\d+)"/gi);
  for (const match of byteMatches) {
    totalSize += Number(match[1]) || 0;
  }

  let title = filename ? filename.replace(/\.nzb$/i, '') : 'Imported Usenet Release';
  const subjectMatch = xmlString.match(/subject="([^"]+)"/i);
  if (subjectMatch) {
    let subject = subjectMatch[1];
    const quoteMatch = subject.match(/&quot;([^&]+)&quot;/i) || subject.match(/"([^"]+)"/i);
    if (quoteMatch) {
      title = quoteMatch[1];
    } else {
      title = subject.replace(/yEnc.*$/i, '').trim();
    }
  }

  return { title, size: totalSize };
}

// Helper: Decode Base32 to Hex for magnet links (useful for older/base32 torrent hashes)
function base32ToHex(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  let hex = '';
  for (let i = 0; i < base32.length; i++) {
    const val = alphabet.indexOf(base32[i].toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    const chunk = bits.substring(i, i + 4);
    hex += parseInt(chunk, 2).toString(16);
  }
  return hex;
}

// Helper: Extract infohash (40-char hex) from magnet link
function extractInfoHash(magnetUri) {
  if (!magnetUri || typeof magnetUri !== 'string') return null;
  
  // Try 40-character hex pattern
  const matchHex = magnetUri.match(/xt=urn:btih:([a-fA-F0-9]{40})/i);
  if (matchHex) return matchHex[1].toLowerCase();
  
  // Try 32-character base32 pattern
  const matchB32 = magnetUri.match(/xt=urn:btih:([a-zA-Z2-7]{32})/i);
  if (matchB32) {
    try {
      return base32ToHex(matchB32[1]).toLowerCase();
    } catch (e) {
      console.error('Error converting base32 magnet hash:', e);
    }
  }
  return null;
}

// Mock Search Results generator for developer testing
function generateMockResults(q, category) {
  const categoryMockData = {
    'Movies': [
      { Title: `${q}.2024.2160p.REPACK.WEB-DL.H265.HDR-Antigravity`, Size: 14852924108, Seeders: 124, Peers: 12 },
      { Title: `${q}.2023.1080p.BluRay.x264.DTS-SPARKS`, Size: 8482924108, Seeders: 82, Peers: 8 },
      { Title: `${q}.2024.1080p.WEB.h264-GalaxyRG`, Size: 2482924108, Seeders: 310, Peers: 45 },
      { Title: `${q}.1999.Remastered.2160p.UHD.BluRay.x265-TERMiNAL`, Size: 23145292410, Seeders: 45, Peers: 2 }
    ],
    'TV': [
      { Title: `${q}.S01E01.1080p.WEB.h264-EDITH`, Size: 1652924108, Seeders: 154, Peers: 23 },
      { Title: `${q}.S01.Season.Complete.1080p.BluRay.x265-GalaxyTV`, Size: 15852924108, Seeders: 72, Peers: 14 },
      { Title: `${q}.S02.720p.HDTV.x264-AVS`, Size: 852924108, Seeders: 22, Peers: 3 }
    ],
    'Music': [
      { Title: `${q} - Compilation Album (2024) [FLAC 24bit]`, Size: 852924108, Seeders: 44, Peers: 5 },
      { Title: `${q} - Ultimate Hits (1998) MP3 320kbps`, Size: 185292410, Seeders: 95, Peers: 10 }
    ],
    'Audiobooks': [
      { Title: `${q} (Unabridged) - Narrated by Stephen Fry [M4B]`, Size: 585292410, Seeders: 19, Peers: 1 },
      { Title: `${q} Audiobook (Complete) MP3`, Size: 385292410, Seeders: 8, Peers: 0 }
    ],
    'Ebooks': [
      { Title: `${q} - First Edition (2023) PDF`, Size: 145292410, Seeders: 55, Peers: 2 },
      { Title: `${q} - Full Study Guide EPUB`, Size: 15292410, Seeders: 28, Peers: 1 }
    ],
    'Adult': [
      { Title: `[Adult] Beautiful ${q} Star - Mega Collection 1080p`, Size: 4852924108, Seeders: 34, Peers: 4 },
      { Title: `[XXX] Premium ${q} Scene 1`, Size: 1852924108, Seeders: 12, Peers: 1 }
    ],
    'Software': [
      { Title: `${q} Studio Suite VST Plugin Bundle - Mac/Win`, Size: 8452924108, Seeders: 148, Peers: 12 },
      { Title: `${q} Professional OS Installer Image 2026`, Size: 5852924108, Seeders: 94, Peers: 6 },
      { Title: `${q} Utility Tool Suite Pre-Activated [Portable]`, Size: 452924108, Seeders: 32, Peers: 1 }
    ],
    'VST': [
      { Title: `${q} Synthesizer VSTi AU AAX 2026 - Win/Mac [R2R]`, Size: 3452924108, Seeders: 124, Peers: 12 },
      { Title: `${q} Limiter & Compressor Plugin VST3 - Pre-Activated`, Size: 185292410, Seeders: 82, Peers: 8 },
      { Title: `${q} Virtual Instrument Library Kontakt Native`, Size: 15452924108, Seeders: 45, Peers: 2 }
    ],
    'Other': [
      { Title: `${q} Miscellaneous Archive Collection Pack`, Size: 2452924108, Seeders: 48, Peers: 2 },
      { Title: `${q} Digital Art Fan Edition Pack`, Size: 952924108, Seeders: 24, Peers: 1 }
    ],
    'Retro Games': [
      { Title: `${q} (USA) [NES].nes`, Size: 131072, Seeders: 154, Peers: 12 },
      { Title: `${q} (USA) [SNES].sfc`, Size: 2097152, Seeders: 94, Peers: 8 },
      { Title: `${q} (USA) [Sega].md`, Size: 1048576, Seeders: 62, Peers: 4 },
      { Title: `${q} Classics Multi-ROM Pack.zip`, Size: 5242880, Seeders: 215, Peers: 30 }
    ]
  };

  const templates = categoryMockData[category] || categoryMockData['Movies'];
  return templates.map((t, index) => {
    const dummyHash = `a1b2c3d4e5f607182930415263748596a7b8c9d${index}`;
    return {
      Title: t.Title,
      Size: t.Size,
      Seeders: t.Seeders,
      Peers: t.Peers,
      MagnetUri: `magnet:?xt=urn:btih:${dummyHash}&dn=${encodeURIComponent(t.Title)}`,
      Link: `http://localhost:3001/mock-download/${dummyHash}`,
      Tracker: 'MockTracker',
      CategoryDesc: category,
      PublishDate: new Date(Date.now() - index * 86400000).toISOString()
    };
  });
}

// Local helper to parse magnet links
function parseMagnetString(magnetStr) {
  try {
    const url = new URL(magnetStr);
    const xt = url.searchParams.get('xt');
    const dn = url.searchParams.get('dn') || 'Imported Magnet Link';
    if (xt && xt.startsWith('urn:btih:')) {
      const hash = xt.substring(9).toLowerCase();
      return { title: dn, infoHash: hash };
    }
  } catch (e) {
    const hashMatch = magnetStr.match(/btih:([a-fA-F0-9]{40})/i) || magnetStr.match(/btih:([2-7a-zA-Z]{32})/i);
    const nameMatch = magnetStr.match(/dn=([^&]+)/i);
    if (hashMatch) {
      const hash = hashMatch[1].toLowerCase();
      const dn = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : 'Imported Magnet Link';
      return { title: dn, infoHash: hash };
    }
  }
  return null;
}

// 1.10. File Import Parser Endpoint (torrents, NZBs, magnet links)
app.post('/api/parse-import', async (req, res) => {
  const { fileContent, fileName, fileType, magnet } = req.body;

  if (magnet) {
    const parsed = parseMagnetString(magnet);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid magnet link format' });
    }
    return res.json({
      type: 'torrent',
      title: parsed.title,
      size: 0,
      infoHash: parsed.infoHash,
      magnet: magnet
    });
  }

  if (!fileContent) {
    return res.status(400).json({ error: 'Missing fileContent or magnet parameter' });
  }

  try {
    const buffer = Buffer.from(fileContent, 'base64');
    const lowercaseName = (fileName || '').toLowerCase();

    if (fileType === 'torrent' || lowercaseName.endsWith('.torrent')) {
      const torrent = decodeBencode(buffer);
      if (!torrent || !torrent.info || !torrent._rawInfo) {
        throw new Error('Invalid torrent structure (missing info block)');
      }
      const infoHash = crypto.createHash('sha1').update(torrent._rawInfo).digest('hex');
      let title = torrent.info.name || fileName.replace(/\.torrent$/i, '');
      let size = 0;
      if (torrent.info.length) {
        size = torrent.info.length;
      } else if (Array.isArray(torrent.info.files)) {
        size = torrent.info.files.reduce((acc, f) => acc + (f.length || 0), 0);
      }

      const generatedMagnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}`;

      return res.json({
        type: 'torrent',
        title,
        size,
        infoHash,
        magnet: generatedMagnet
      });
    } else if (fileType === 'nzb' || lowercaseName.endsWith('.nzb')) {
      const xmlString = buffer.toString('utf8');
      const parsed = parseNzbFile(xmlString, fileName);

      const importId = crypto.randomUUID();
      importedNzbsCache.set(importId, buffer);

      // Automatically clean up import cache after 4 hours to prevent memory leaks
      setTimeout(() => {
        importedNzbsCache.delete(importId);
      }, 4 * 60 * 60 * 1000);

      // Build the callback URL from a trusted PUBLIC_BASE_URL when configured,
      // rather than attacker-spoofable x-forwarded-* headers. Falls back to the
      // forwarded host for local/dev where PUBLIC_BASE_URL isn't set.
      const base = process.env.PUBLIC_BASE_URL
        ? process.env.PUBLIC_BASE_URL.replace(/\/+$/, '')
        : `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
      const nzbUrl = `${base}/api/imported-nzb/${importId}`;

      return res.json({
        type: 'usenet',
        importId,
        title: parsed.title,
        size: parsed.size,
        nzbUrl
      });
    } else {
      return res.status(400).json({ error: 'Unsupported file format' });
    }
  } catch (err) {
    console.error('❌ Failed to parse imported file:', err);
    return res.status(500).json({ error: 'Failed to parse file: ' + err.message });
  }
});

// 1.11. Imported NZB Proxy Streaming Endpoint
app.get('/api/imported-nzb/:id', (req, res) => {
  const { id } = req.params;
  const nzbBuffer = importedNzbsCache.get(id);

  if (!nzbBuffer) {
    return res.status(404).send('NZB file not found or has expired');
  }

  res.setHeader('Content-Type', 'application/x-nzb');
  res.setHeader('Content-Disposition', `attachment; filename="imported_${id}.nzb"`);
  return res.send(nzbBuffer);
});

// Cache check endpoint (checks cache status of multiple hashes)
app.post('/api/cache-check', async (req, res) => {
  const { hashes } = req.body;
  if (!hashes || !Array.isArray(hashes)) {
    return res.json({ status: 'error', message: 'Missing hashes array' });
  }

  const premiumizeApiKey = resolvePremiumizeKey(req); // optional: keyless falls back to mock below
  if (!premiumizeApiKey || premiumizeApiKey === 'your_premiumize_api_key_here') {
    // Mock response for dev
    const mockCache = {};
    hashes.forEach(h => { mockCache[h] = true; });
    return res.json({ status: 'success', response: mockCache });
  }

  try {
    const cacheMap = {};
    const BATCH_SIZE = 100;
    const batchPromises = [];

    for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
      const batchHashes = hashes.slice(i, i + BATCH_SIZE);
      
      const checkPromise = (async () => {
        const params = new URLSearchParams();
        batchHashes.forEach(h => params.append('items[]', h));

        const cacheCheckResponse = await fetch('https://www.premiumize.me/api/cache/check', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${premiumizeApiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params
        });

        if (!cacheCheckResponse.ok) {
          throw new Error(`Premiumize cache check returned status: ${cacheCheckResponse.status}`);
        }

        const cacheData = await cacheCheckResponse.json();
        
        if (cacheData.status === 'success') {
          batchHashes.forEach((hash, idx) => {
            cacheMap[hash] = cacheData.response?.[idx] === true;
          });
        }
      })();

      batchPromises.push(checkPromise);
    }

    await Promise.all(batchPromises);
    res.json({ status: 'success', response: cacheMap });
  } catch (err) {
    console.error('Cache check failed:', err.message);
    res.json({ status: 'error', message: err.message });
  }
});

// Classify a raw Jackett result into one of the app's content lanes (used by the
// unified "All" search to group mixed results). Uses torznab category codes first,
// then title/filename heuristics for the ambiguous audio/book types.
function classifyResult(item) {
  const cats = Array.isArray(item.Category) ? item.Category.map(Number) : [];
  const inRange = (lo, hi) => cats.some(c => c >= lo && c <= hi);
  const title = (item.Title || '').toLowerCase();
  if (/\b(audiobook|audio book|unabridged|narrated|m4b)\b/.test(title)) return 'Audiobooks';
  if (/\.(epub|mobi|azw3?|pdf|cbz|cbr)\b|\bebook\b/.test(title)) return 'Ebooks';
  if (/\b(vst|vsti|kontakt|sample pack|soundbank|presets?)\b/.test(title)) return 'VST';
  if (inRange(2000, 2999)) return 'Movies';
  if (inRange(5000, 5999)) return 'TV';
  if (inRange(1000, 1999)) return 'Retro Games';
  if (inRange(7000, 7999)) return 'Ebooks';
  if (inRange(3000, 3999)) return 'Music';
  if (inRange(4000, 4999)) return 'Software';
  if (inRange(6000, 6999)) return 'Adult';
  if (/\bs\d{2}e\d{2}\b|\bseason\b|\bcomplete series\b/.test(title)) return 'TV';
  if (/\b(flac|mp3|320|album|discography|ost|soundtrack)\b/.test(title)) return 'Music';
  return 'Other';
}

// Derive a usable display title: prefer the indexer's Title, else recover the
// magnet display-name (dn=). Returns null when nothing usable exists (e.g. "."),
// so the caller can drop nameless junk results.
function deriveTitle(item, magnet) {
  const raw = (item.Title || '').trim();
  if (raw && /[a-z0-9]{2,}/i.test(raw)) return raw;
  if (magnet) {
    const m = magnet.match(/[?&]dn=([^&]+)/i);
    if (m) {
      try {
        const dn = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
        if (dn && /[a-z0-9]{2,}/i.test(dn)) return dn;
      } catch { /* ignore malformed dn */ }
    }
  }
  return null;
}

// 1. Search Endpoint
app.get('/api/search', async (req, res) => {
  const { q, category } = req.query;
  
  if (!q || typeof q !== 'string') {
    return res.json([]);
  }

  const selectedCategory = category || 'Movies';
  // Unified search: "All" queries every top-level torznab category at once
  // (Adult/6000 is intentionally excluded and stays behind its own lane).
  const torznabCategoryCodes = selectedCategory === 'All'
    ? [1000, 2000, 3000, 4000, 5000, 7000, 8000]
    : (CATEGORY_MAP[selectedCategory] || [2000]);

  console.log(`🔍 Search Request: "${q}" in Category "${selectedCategory}" (Torznab Codes: ${torznabCategoryCodes.join(', ')})`);

  let rawResults = [];

  // A. Check if Jackett API key is configured. If not, generate high-quality mock data
  const jackettApiKey = req.userJackettKey || (envKeysAllowed() ? process.env.JACKETT_API_KEY : '');
  const jackettUrl = req.userJackettUrl || (envKeysAllowed() ? process.env.JACKETT_URL : '') || 'http://localhost:9117';

  if (!jackettApiKey || jackettApiKey === 'your_jackett_api_key_here') {
    console.log('ℹ️  Jackett key not configured. Serving mock results.');
    rawResults = generateMockResults(q, selectedCategory);
  } else {
    try {
      // Build aggregate Jackett internal JSON API search URL
      const searchUrl = new URL(`${jackettUrl}/api/v2.0/indexers/all/results`);
      searchUrl.searchParams.append('apikey', jackettApiKey);
      searchUrl.searchParams.append('Query', q);
      torznabCategoryCodes.forEach(code => {
        searchUrl.searchParams.append('Category[]', code.toString());
      });

      console.log(`🌐 Fetching from Jackett: ${jackettUrl}/api/v2.0/indexers/all/results?...`);

      // 90s cap so a slow/hung indexer can never wedge the request indefinitely.
      const jackettResponse = await fetchWithTimeout(searchUrl.toString(), {
        headers: { 'Accept': 'application/json' }
      }, 90000);

      if (!jackettResponse.ok) {
        throw new Error(`Jackett replied with status: ${jackettResponse.status}`);
      }

      const jackettData = await jackettResponse.json();
      rawResults = jackettData.Results || [];
      console.log(`✅ Jackett returned ${rawResults.length} raw results.`);
    } catch (err) {
      const reason = err.name === 'AbortError' ? 'Jackett search timed out after 90s' : err.message;
      console.error('❌ Jackett search failed:', reason);
      // Fall back to mock data so the app doesn't crash
      console.log('ℹ️  Falling back to mock results due to error.');
      rawResults = generateMockResults(q, selectedCategory);
    }
  }

  // Internet Archive (a Jackett indexer) returns a flood of unrelated user uploads
  // — game footage, review clips, lectures — that pollute Movie/TV (and "All")
  // searches with junk titles. It's only genuinely useful for audio, so restrict
  // it to Music searches and drop it everywhere else.
  const IA_ALLOWED_CATEGORIES = ['Music'];
  const isInternetArchive = (item) =>
    /internet\s*archive/i.test(item.Tracker || '') || /^internetarchive$/i.test(item.TrackerId || '');
  if (!IA_ALLOWED_CATEGORIES.includes(selectedCategory)) {
    const before = rawResults.length;
    rawResults = rawResults.filter(item => !isInternetArchive(item));
    const dropped = before - rawResults.length;
    if (dropped > 0) console.log(`🗑️  Dropped ${dropped} Internet Archive result(s) from "${selectedCategory}" search.`);
  }

  // B. Process and map torrent data
  const processedResults = rawResults.map(item => {
    const magnet = item.MagnetUri || (item.Link && item.Link.startsWith('magnet:') ? item.Link : null);
    const infoHash = magnet ? extractInfoHash(magnet) : (item.InfoHash || null);
    const title = deriveTitle(item, magnet);
    if (!title) return null; // drop nameless junk results (e.g. "." with no dn)
    return {
      title,
      size: Number(item.Size) || 0,
      seeders: Number(item.Seeders) || 0,
      peers: Number(item.Peers) || 0,
      magnet: magnet,
      torrentFile: item.Link && !item.Link.startsWith('magnet:') ? item.Link : null,
      infoHash: infoHash,
      tracker: item.Tracker || 'Unknown Tracker',
      publishDate: item.PublishDate || null,
      category: selectedCategory,
      detectedType: selectedCategory === 'All' ? classifyResult(item) : null,
      cached: false // default
    };
  }).filter(Boolean);

  // Filter items that actually have hashes to query Premiumize Cache
  const itemsWithHash = processedResults.filter(item => item.infoHash);

  if (itemsWithHash.length === 0) {
    return res.json(processedResults);
  }

  const premiumizeApiKey = resolvePremiumizeKey(req); // optional: keyless falls back to mock below

  if (!premiumizeApiKey || premiumizeApiKey === 'your_premiumize_api_key_here') {
    console.log('ℹ️  Premiumize key not configured. Mocking cache status (50% hit rate).');
    // Deterministic mock caching based on hash characters
    processedResults.forEach(item => {
      if (item.infoHash) {
        // Mock cached state (e.g. if the first character of the hash is a-h or 0-4)
        const char = item.infoHash.charAt(0);
        item.cached = /[a-h0-9]/.test(char);
      }
    });
    return res.json(processedResults);
  }

  try {
    const hashes = itemsWithHash.map(item => item.infoHash);
    const cacheMap = {}; // infoHash -> { cached, filename, filesize }

    // Batch queries in groups of 100 max, as requested
    const BATCH_SIZE = 100;
    const batchPromises = [];

    for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
      const batchHashes = hashes.slice(i, i + BATCH_SIZE);
      
      const checkPromise = (async () => {
        const params = new URLSearchParams();
        batchHashes.forEach(h => params.append('items[]', h));

        const cacheCheckResponse = await fetch('https://www.premiumize.me/api/cache/check', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${premiumizeApiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params
        });

        if (!cacheCheckResponse.ok) {
          throw new Error(`Premiumize cache check returned status: ${cacheCheckResponse.status}`);
        }

        const cacheData = await cacheCheckResponse.json();
        
        if (cacheData.status === 'success') {
          batchHashes.forEach((hash, idx) => {
            cacheMap[hash] = {
              cached: cacheData.response?.[idx] === true,
              filename: cacheData.filename?.[idx] || null,
              filesize: Number(cacheData.filesize?.[idx]) || 0
            };
          });
        }
      })();

      batchPromises.push(checkPromise);
    }

    // Wait for all batches to finish checking
    await Promise.all(batchPromises);
    console.log(`✅ Premiumize cache status retrieved for ${hashes.length} items.`);

    // Merge cache results back into original items
    processedResults.forEach(item => {
      if (item.infoHash && cacheMap[item.infoHash]) {
        const cacheInfo = cacheMap[item.infoHash];
        item.cached = cacheInfo.cached;
        if (cacheInfo.cached) {
          // Use Premiumize's cached filename only when it's a real name — some
          // cached items report "." (or other junk), which must not clobber the
          // title deriveTitle() already recovered from the magnet's dn=.
          if (cacheInfo.filename && /[a-z0-9]{2,}/i.test(cacheInfo.filename)) item.title = cacheInfo.filename;
          if (cacheInfo.filesize > 0) item.size = cacheInfo.filesize; // Use Premiumize actual file size
        }
      }
    });

  } catch (err) {
    console.error('❌ Premiumize cache check failed:', err.message);
    // Continue without cache info, or mock on error
  }

  return res.json(processedResults);
});

// Global cache for clean search term -> IMDb ID mapping
const titleToImdbCache = new Map();

// Segmented Newznab category mapping for Usenet
const USENET_CATEGORY_MAP = {
  'Movies': 2000,
  'TV': 5000,
  'Music': 3000,
  'Audiobooks': 3030,
  'Ebooks': 7000,
  'Software': 4000,
  'VST': 4000,
  'Adult': 6000,
  'Retro Games': 1000,
  'Other': 8000
};

// 1.5. Usenet NZBGeek Search Endpoint
// 1.5. Usenet NZBGeek & Multi-Indexer Search Aggregator Endpoint
app.get('/api/usenet/search', async (req, res) => {
  const { q, category } = req.query;

  if (!q || typeof q !== 'string') {
    return res.json([]);
  }

  const selectedCategory = category || 'Movies';
  const newznabCat = USENET_CATEGORY_MAP[selectedCategory] || 2000;

  console.log(`⚡ Usenet Search Request: "${q}" in Category "${selectedCategory}" (Newznab Code: ${newznabCat})`);

  // Parse multi-indexer endpoints
  let indexers = [];

  // Check if header contains indexers
  if (req.userUsenetIndexers && req.userUsenetIndexers.length > 0) {
    indexers = [...req.userUsenetIndexers];
  } else {
    const envIndexers = envKeysAllowed() ? process.env.USENET_INDEXERS : '';
    if (envIndexers) {
      envIndexers.split(',').forEach(item => {
        const parts = item.split('|');
        if (parts.length >= 3) {
          indexers.push({
            name: parts[0].trim(),
            url: parts[1].trim(),
            key: parts[2].trim()
          });
        }
      });
    }

    const nzbgeekApiKey = envKeysAllowed() ? process.env.NZBGEEK_API_KEY : '';
    const hasNzbGeekKey = nzbgeekApiKey && nzbgeekApiKey !== 'your_nzbgeek_api_key_here';

    // Fallback to NZBGeek primary if no indexers configured
    if (indexers.length === 0) {
      indexers.push({
        name: 'Usenet Indexer',
        url: 'https://api.nzbgeek.info/api',
        key: hasNzbGeekKey ? nzbgeekApiKey : 'mock'
      });
    }
  }

  // Check if all indexers are in mock mode
  const allMock = indexers.every(idx => idx.key === 'mock' || !idx.key);

  let rawResults = [];

  if (allMock) {
    console.log('ℹ️  All Usenet indexers in mock mode. Serving aggregated mock results.');
    rawResults = generateMockUsenetResults(q, selectedCategory).map(item => ({
      ...item,
      _indexerName: 'NZBGeek (Mock)'
    }));
  } else {
    // Run parallel queries across all indexers
    const fetchPromises = indexers.map(async (idx) => {
      if (idx.key === 'mock' || !idx.key) {
        console.log(`ℹ️  Aggregator: ${idx.name} is in mock mode. Serving mock results.`);
        return generateMockUsenetResults(q, selectedCategory).map(item => ({
          ...item,
          _indexerName: `${idx.name} (Mock)`
        }));
      }

      try {
        let cleanUrl = idx.url;
        const pathPart = cleanUrl.replace(/^https?:\/\/[^\/]+/, '');
        if (!pathPart.includes('api') && !cleanUrl.endsWith('.php') && !cleanUrl.endsWith('.xml')) {
          cleanUrl = cleanUrl.replace(/\/$/, '') + '/api';
        }
        const searchUrl = `${cleanUrl}?t=search&apikey=${idx.key}&q=${encodeURIComponent(q)}&cat=${newznabCat}&o=json`;
        console.log(`🌐 Aggregator: Querying indexer "${idx.name}": ${cleanUrl}?cat=${newznabCat}...`);

        const response = await fetchWithTimeout(searchUrl, {}, 5000);
        if (!response.ok) {
          throw new Error(`API status ${response.status}`);
        }

        const data = await response.json();
        const channel = data.channel || {};
        const items = channel.item || [];

        let list = [];
        if (Array.isArray(items)) {
          list = items;
        } else if (typeof items === 'object' && items) {
          list = [items];
        }

        console.log(`✅ Indexer "${idx.name}" returned ${list.length} results.`);
        return list.map(item => ({ ...item, _indexerName: idx.name }));
      } catch (err) {
        console.error(`❌ Indexer "${idx.name}" search failed:`, err.message);
        if (idx.name === 'NZBGeek') {
          console.log('ℹ️  Falling back to mock results for primary indexer NZBGeek.');
          return generateMockUsenetResults(q, selectedCategory).map(item => ({
            ...item,
            _indexerName: 'NZBGeek (Mock)'
          }));
        }
        return [];
      }
    });

    const resultsLists = await Promise.all(fetchPromises);
    const allRawResults = resultsLists.flat();

    // Deduplicate by clean title (case-insensitive)
    const uniqueItemsMap = new Map();
    allRawResults.forEach(item => {
      const cleanTitle = (item.title || '').trim().toLowerCase();
      
      let nzbUrl = null;
      if (item.enclosure && item.enclosure['@attributes'] && item.enclosure['@attributes'].url) {
        nzbUrl = item.enclosure['@attributes'].url;
      } else {
        nzbUrl = item.link || null;
      }

      const currentName = item._indexerName || 'Usenet';

      if (!uniqueItemsMap.has(cleanTitle)) {
        item._indexersList = [{ name: currentName, nzbUrl }];
        uniqueItemsMap.set(cleanTitle, item);
      } else {
        const existing = uniqueItemsMap.get(cleanTitle);
        const existingName = existing._indexerName || '';
        if (currentName && !existingName.split(', ').includes(currentName)) {
          existing._indexerName = `${existingName}, ${currentName}`;
        }
        if (!existing._indexersList) {
          existing._indexersList = [];
        }
        if (currentName && !existing._indexersList.some(i => i.name === currentName)) {
          existing._indexersList.push({ name: currentName, nzbUrl });
        }
      }
    });
    rawResults = Array.from(uniqueItemsMap.values());
  }

  // Process and map aggregated results
  const processedResults = rawResults.map(item => {
    let size = 0;
    let imdb = null;
    let tvdbid = null;
    let coverurl = null;
    let grabs = 0;

    // Parse password from release subject line
    let password = null;
    const cleanTitleText = item.title || 'Unknown NZB Release';
    const pwMatch = cleanTitleText.match(/\[(?:pw|password)[:\s=]+([^\]]+)\]/i) || cleanTitleText.match(/\b(?:pw|password)[:\s=]+([a-zA-Z0-9]+)/i);
    if (pwMatch) {
      password = pwMatch[1].trim();
    }

    // Parse Newznab attributes
    const attrs = item.attr || [];
    if (Array.isArray(attrs)) {
      attrs.forEach(a => {
        const attrObj = a['@attributes'] || a;
        if (attrObj && attrObj.name) {
          const name = attrObj.name.toLowerCase();
          const value = attrObj.value;
          if (name === 'size') {
            size = Number(value) || 0;
          } else if (name === 'imdb') {
            imdb = value;
          } else if (name === 'tvdbid' || name === 'tvdb') {
            tvdbid = value;
          } else if (name === 'coverurl') {
            coverurl = value;
          } else if (name === 'grabs') {
            grabs = Number(value) || 0;
          } else if (name === 'password') {
            password = value;
          }
        }
      });
    }

    // Check direct XML attribute structure for grabs
    if (!grabs && item.grabs) {
      grabs = Number(item.grabs) || 0;
    }

    // Size fallback
    if (!size && item.enclosure && item.enclosure['@attributes']) {
      size = Number(item.enclosure['@attributes'].length) || 0;
    }

    // Download link
    let nzbUrl = null;
    if (item.enclosure && item.enclosure['@attributes'] && item.enclosure['@attributes'].url) {
      nzbUrl = item.enclosure['@attributes'].url;
    } else {
      nzbUrl = item.link || null;
    }

    // Age in days
    let ageDays = null;
    if (item.pubDate) {
      const pubTime = new Date(item.pubDate).getTime();
      const nowTime = Date.now();
      const diffMs = nowTime - pubTime;
      ageDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    // Calculate Usenet health score (completion probability)
    let health = 100;
    if (ageDays !== null) {
      if (ageDays <= 7) {
        health = 99; // Extremely fresh
      } else if (ageDays <= 90) {
        health = 98 - (grabs < 5 ? 3 : 0);
      } else if (ageDays <= 365) {
        health = 95 - (grabs < 10 ? 5 : 0);
      } else {
        // Decay score for old posts based on age
        const agePenalty = Math.min(45, Math.floor((ageDays - 365) / 100) * 2);
        health = 90 - agePenalty;
        
        // Boost score if other users grabbed it successfully
        if (grabs > 50) {
          health = Math.min(99, health + 10);
        } else if (grabs > 10) {
          health = Math.min(99, health + 5);
        } else if (grabs === 0) {
          health = Math.max(35, health - 15); // suspected takedown/incomplete
        }
      }
    }

    if (password) {
      health = Math.max(30, Math.floor(health * 0.7)); // passworded archives penalty
    }
    health = Math.round(Math.max(30, Math.min(100, health)));

    // Cache clean title -> IMDb ID for torrent results cross-referencing
    const parsed = parseReleaseTitle(cleanTitleText, selectedCategory);
    const cleanTitleLower = parsed.cleanTitle.toLowerCase();
    
    if (imdb && !titleToImdbCache.has(cleanTitleLower)) {
      let cleanedImdb = imdb.toString();
      if (!cleanedImdb.startsWith('tt') && /^\d+$/.test(cleanedImdb)) {
        cleanedImdb = 'tt' + cleanedImdb.padStart(7, '0');
      }
      titleToImdbCache.set(cleanTitleLower, cleanedImdb);
      console.log(`🏷️  Usenet Metadata Resolver: Cached Clean Title "${parsed.cleanTitle}" ➡️ IMDb ID "${cleanedImdb}"`);
    }

    return {
      title: cleanTitleText,
      size,
      nzbUrl,
      ageDays,
      grabs,
      health,
      imdb: imdb ? (imdb.toString().startsWith('tt') ? imdb : 'tt' + imdb.toString().padStart(7, '0')) : null,
      tvdbid,
      coverurl,
      password,
      category: selectedCategory,
      indexer: item._indexerName || 'Usenet',
      indexersList: item._indexersList || []
    };
  });

  // Sort: healthy and newest first
  processedResults.sort((a, b) => {
    if (b.health !== a.health && (a.health < 60 || b.health < 60)) {
      return b.health - a.health;
    }
    return (a.ageDays || 9999) - (b.ageDays || 9999);
  });

  return res.json(processedResults);
});

// Mock Usenet generator for offline testing
function generateMockUsenetResults(q, category) {
  console.log(`🧪 Generating realistic mock Usenet releases for query: "${q}"`);
  
  const mockReleases = [
    {
      title: `${q}.1080p.NF.WEBRip.DDP5.1.x264-GeekUsenet`,
      pubDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toUTCString(),
      grabs: 142,
      attr: [
        { '@attributes': { name: 'size', value: '3456789012' } },
        { '@attributes': { name: 'imdb', value: '15398776' } }
      ]
    },
    {
      title: `${q}.2160p.UHD.BluRay.REMUX.HEVC.DTS-HD.MA.7.1-RetroNZB [Password: GeekSecure]`,
      pubDate: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toUTCString(),
      grabs: 89,
      attr: [
        { '@attributes': { name: 'size', value: '45678901234' } },
        { '@attributes': { name: 'imdb', value: '15398776' } }
      ]
    },
    {
      title: `${q}.720p.HDTV.x264-GeekTV`,
      pubDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toUTCString(),
      grabs: 412,
      attr: [
        { '@attributes': { name: 'size', value: '1234567890' } }
      ]
    },
    {
      title: `${q}.EXTENDED.1080p.Bluray.x265.10bit.DTS-HD-Geeky`,
      pubDate: new Date(Date.now() - 3400 * 24 * 60 * 60 * 1000).toUTCString(),
      grabs: 18,
      attr: [
        { '@attributes': { name: 'size', value: '18765432100' } }
      ]
    }
  ];

  return mockReleases;
}

// --- Helper: Scan directory for the largest video file ---
const getLargestVideoFile = (dirPath) => {
  let largestFile = null;
  let maxSize = 0;
  const MAX_DEPTH = 16; // guard against pathological nesting

  // Use lstatSync (does NOT follow symlinks) so a symlink loop in a downloaded
  // folder can't cause infinite recursion / stack overflow. Symlinks are skipped.
  const traverse = (currentPath, depth) => {
    if (depth > MAX_DEPTH) return;
    try {
      const stats = fs.lstatSync(currentPath);
      if (stats.isSymbolicLink()) {
        return;
      } else if (stats.isDirectory()) {
        const files = fs.readdirSync(currentPath);
        for (const file of files) {
          traverse(path.join(currentPath, file), depth + 1);
        }
      } else if (stats.isFile()) {
        const ext = path.extname(currentPath).toLowerCase().substring(1);
        const videoExtensions = ['mp4', 'mkv', 'avi', 'ts', 'webm', 'mov', 'm4v'];
        if (videoExtensions.includes(ext) && stats.size > maxSize) {
          maxSize = stats.size;
          largestFile = currentPath;
        }
      }
    } catch (err) {
      // Ignore errors for unreadable paths
    }
  };

  traverse(dirPath, 0);
  return largestFile;
};


// --- Google Drive Helpers and Endpoints ---
let activeUploads = {};
if (fs.existsSync('gdrive_uploads.json')) {
  try {
    activeUploads = JSON.parse(fs.readFileSync('gdrive_uploads.json', 'utf8') || '{}');
  } catch (err) {
    console.error('Failed to load gdrive_uploads.json:', err.message);
  }
}

const saveActiveUploads = () => {
  try {
    fs.writeFileSync('gdrive_uploads.json', JSON.stringify(activeUploads, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save gdrive_uploads.json:', err.message);
  }
};

const getGdriveFolderName = () => {
  if (fs.existsSync('gdrive_credentials.json')) {
    try {
      const creds = JSON.parse(fs.readFileSync('gdrive_credentials.json', 'utf8') || '{}');
      return creds.folderName || 'Premio';
    } catch (e) {
      // fallback
    }
  }
  return 'Premio';
};

const getGdriveAccessToken = async () => {
  if (!fs.existsSync('gdrive_credentials.json')) {
    throw new Error('Google Drive is not connected.');
  }
  const creds = JSON.parse(fs.readFileSync('gdrive_credentials.json', 'utf8') || '{}');
  if (!creds.refreshToken) {
    throw new Error('Google Drive is not connected.');
  }

  if (creds.accessToken && creds.expiresAt && (creds.expiresAt - Date.now() > 60000)) {
    return creds.accessToken;
  }

  console.log('🔄 Google Drive access token expired or missing. Refreshing...');
  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const params = new URLSearchParams();
  params.append('client_id', creds.clientId);
  params.append('client_secret', creds.clientSecret);
  params.append('refresh_token', creds.refreshToken);
  params.append('grant_type', 'refresh_token');

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to refresh Google Drive token: ${errText}`);
  }

  const data = await res.json();
  creds.accessToken = data.access_token;
  creds.expiresAt = Date.now() + (data.expires_in * 1000);
  fs.writeFileSync('gdrive_credentials.json', JSON.stringify(creds, null, 2), 'utf8');
  return creds.accessToken;
};

// SECURITY: the /api/gdrive/* stream, transcode and audio-tracks routes are
// unauthenticated GETs intended for a localhost/LAN deployment only. They serve
// any file the stored OAuth token can reach (drive.file scope = files Premio
// created). Do NOT expose them publicly without an auth layer in front.

// Google Drive search queries wrap string values in single quotes; backslash and
// single-quote must be escaped or the query breaks (and could be manipulated).
const escapeDriveQueryValue = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Drive file ids are opaque [A-Za-z0-9_-] tokens. Validate before interpolating
// into the googleapis file URL so a crafted id can't inject path/query segments.
const isValidDriveFileId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(id);

// Moves a single Drive file or folder to the Trash (recoverable for ~30 days),
// rather than permanently deleting it. We use files.update {trashed:true} — the
// DELETE verb purges immediately and bypasses Trash, so an accidental "Delete Disk
// & History" would be unrecoverable. Trashing a folder takes its contents with it.
// Treats 404 (already gone) as success since the end state is what the caller wants.
const deleteGdriveFile = async (accessToken, fileId) => {
  if (!isValidDriveFileId(fileId)) return false;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true })
  });
  if (!res.ok && res.status !== 404) {
    const errText = await res.text();
    throw new Error(`Drive trash failed (HTTP ${res.status}): ${errText}`);
  }
  return true;
};

const findGdriveFile = async (accessToken, fileName, parentFolderId = null) => {
  let query = `name='${escapeDriveQueryValue(fileName)}' and trashed=false`;
  if (parentFolderId) {
    query += ` and '${parentFolderId}' in parents`;
  }
  const encodedQuery = encodeURIComponent(query);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodedQuery}&fields=files(id,name)`;
  const res = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive search failed (HTTP ${res.status}): ${errText}`);
  }
  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
};

const findOrCreateGdriveFolder = async (accessToken, folderName, parentId = null) => {
  let query = `name='${escapeDriveQueryValue(folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }
  const encodedQuery = encodeURIComponent(query);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodedQuery}&fields=files(id,name)`;
  const searchRes = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!searchRes.ok) {
    const errText = await searchRes.ok ? '' : await searchRes.text();
    throw new Error(`Google Drive folder search failed: ${errText}`);
  }
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  console.log(`📁 Creating folder "${folderName}" on Google Drive...`);
  const createUrl = 'https://www.googleapis.com/drive/v3/files';
  const body = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentId) {
    body.parents = [parentId];
  }
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create Google Drive folder: ${errText}`);
  }
  const createData = await createRes.json();
  return createData.id;
};

const listGdriveFolderFiles = async (accessToken, folderId) => {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size)&pageSize=1000`;
  const res = await fetch(listUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to list Google Drive files: ${errText}`);
  }
  const data = await res.json();
  return data.files || [];
};

// Video + sidecar extensions we archive to Drive. (Video list mirrors
// getLargestVideoFile.) Junk like .par2/.rar/.sfv/.nzb is intentionally skipped.
const GDRIVE_VIDEO_EXTS = ['mp4', 'mkv', 'avi', 'ts', 'webm', 'mov', 'm4v'];
const GDRIVE_SIDECAR_EXTS = ['srt', 'sub', 'idx', 'ass', 'ssa', 'vtt', 'nfo'];

// --- Drive foldering: organize archived releases under Premio/<Category>/<Name> ---

// Best-effort category for foldering, from the SAB category + release name. Mirrors
// the frontend guessCategory closely enough to file releases sensibly.
const guessGdriveCategory = (sabCategory, title = '') => {
  const c = String(sabCategory || '').toLowerCase();
  const t = String(title || '').toLowerCase();
  if (c.includes('audiobook')) return 'Audiobooks';
  if (c.includes('book') || c.includes('ebook') || /\.(epub|mobi|azw3?|pdf|cbz|cbr)\b/.test(t)) return 'Ebooks';
  if (/\bs\d{1,2}e\d{1,2}\b|\bs\d{1,2}\b|\bseason\b|\bcomplete series\b|\b\d{1,2}x\d{2}\b/.test(t)) return 'TV';
  if (c.includes('tv') || c.includes('show') || c.includes('series') || c.includes('sonarr') || c.includes('season')) return 'TV';
  if (c.includes('movie') || c.includes('radarr') || c === 'film' || c === 'films') return 'Movies';
  if (c.includes('music') || /\b(flac|mp3|album|discography|ost|soundtrack)\b/.test(t)) return 'Music';
  if (c.includes('game') || c.includes('rom')) return 'Games';
  if (/\b(yify|yts|x264|x265|hevc|h264|h265|1080p|720p|2160p|4k|bluray|webrip|web-dl|hdtv|remux)\b/.test(t)) return 'Movies';
  return 'Other';
};

const GDRIVE_CATEGORY_FOLDER = { Movies: 'Movies', TV: 'TV Shows', Music: 'Music', Audiobooks: 'Audiobooks', Ebooks: 'Ebooks', Games: 'Games', Other: 'Other' };

// Strip filesystem/Drive-reserved characters so a title is safe as a folder name.
const sanitizeFolderName = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

// Extract the season number from a release name (S02E03, 2x03, "Season 2", S02).
// Returns null when none is present (e.g. a complete-series pack or specials).
const parseSeasonNumber = (name) => {
  const t = String(name || '');
  let m = t.match(/\bS(\d{1,2})E\d{1,2}\b/i); if (m) return parseInt(m[1], 10);
  m = t.match(/\b(\d{1,2})x\d{2}\b/); if (m) return parseInt(m[1], 10);
  m = t.match(/\bSeason[\s._-]*(\d{1,2})\b/i); if (m) return parseInt(m[1], 10);
  m = t.match(/\bS(\d{1,2})\b/i); if (m) return parseInt(m[1], 10);
  return null;
};

// Resolve the { categoryFolder, subFolders } a release is archived under, where
// subFolders is the ordered nested path beneath the category folder:
//   Movies → "Movies" / ["Title (Year)"]
//   TV     → "TV Shows" / ["Show Name", "Season 0X"]  (season omitted if unknown)
// so every episode of a season collects in one folder, every season under its
// show, and deletion can remove empty leaves bottom-up without touching the
// category folder.
const resolveGdriveFolders = (sabCategory, releaseName) => {
  const cat = guessGdriveCategory(sabCategory, releaseName);
  const categoryFolder = GDRIVE_CATEGORY_FOLDER[cat] || 'Other';
  const subFolders = [];
  if (cat === 'TV') {
    const parsed = parseReleaseTitle(releaseName, 'TV');
    // Show name = everything before the first season/episode marker; also drop a
    // trailing "complete"/"series" that leaks in for full-series packs.
    let show = (parsed.showName || parsed.cleanTitle || releaseName)
      .replace(/\bS\d{1,2}(?:E\d{1,2})?\b.*$/i, '')
      .replace(/\b\d{1,2}x\d{2}\b.*$/i, '')
      .replace(/\bSeason[\s._-]*\d{1,2}\b.*$/i, '')
      .replace(/\b(?:complete series|complete|series)\b.*$/i, '')
      .trim();
    show = sanitizeFolderName(show) || sanitizeFolderName(parsed.showName || releaseName) || 'Unknown';
    subFolders.push(show);
    const season = parseSeasonNumber(releaseName);
    if (season != null) subFolders.push(`Season ${String(season).padStart(2, '0')}`);
  } else {
    const parsed = parseReleaseTitle(releaseName, 'Movies');
    const name = parsed.cleanTitle ? (parsed.cleanTitle + (parsed.year ? ` (${parsed.year})` : '')) : releaseName;
    subFolders.push(sanitizeFolderName(name) || sanitizeFolderName(releaseName) || 'Unknown');
  }
  return { categoryFolder, subFolders };
};

// Recursively collect non-folder media files under a Drive folder (releases now
// live in Premio/<Category>/<Name>, so a flat listing of the root would miss them).
// Excludes folders and the profile-sync *.json files kept in the Premio root.
const listGdriveFilesRecursive = async (accessToken, folderId, depth = 0) => {
  if (depth > 6) return [];
  const children = await listGdriveFolderFiles(accessToken, folderId);
  let out = [];
  for (const c of children) {
    if (c.mimeType === 'application/vnd.google-apps.folder') {
      out = out.concat(await listGdriveFilesRecursive(accessToken, c.id, depth + 1));
    } else if (!/\.json$/i.test(c.name || '')) {
      out.push(c);
    }
  }
  return out;
};

// True if a local folder still holds a real video (≥100MB — ignores tiny sample
// clips, subs, nfo). Used so deleting a release only removes its folder when no
// real media remains, preserving a shared show/season folder with other episodes.
const folderHasRealMedia = (dir) => {
  const MIN_BYTES = 100 * 1024 * 1024;
  let found = false;
  const walk = (p, depth) => {
    if (found || depth > 16) return;
    let st; try { st = fs.lstatSync(p); } catch { return; }
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) {
      let entries = []; try { entries = fs.readdirSync(p); } catch { return; }
      for (const e of entries) walk(path.join(p, e), depth + 1);
    } else if (st.isFile()) {
      const ext = path.extname(p).toLowerCase().slice(1);
      if (GDRIVE_VIDEO_EXTS.includes(ext) && st.size >= MIN_BYTES) found = true;
    }
  };
  walk(dir, 0);
  return found;
};

// Collect every video + sidecar file under a completed release path so a
// multi-file release (e.g. a season pack with subtitles) is fully archived
// before any local deletion. Recursive, skips symlinks, depth-capped.
const getUploadableReleaseFiles = (rootPath) => {
  const out = [];
  const MAX_DEPTH = 16;
  const walk = (p, depth) => {
    if (depth > MAX_DEPTH) return;
    let st;
    try { st = fs.lstatSync(p); } catch { return; }
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) {
      let entries = [];
      try { entries = fs.readdirSync(p); } catch { return; }
      for (const e of entries) walk(path.join(p, e), depth + 1);
    } else if (st.isFile()) {
      const ext = path.extname(p).toLowerCase().slice(1);
      const isVideo = GDRIVE_VIDEO_EXTS.includes(ext);
      const isSidecar = GDRIVE_SIDECAR_EXTS.includes(ext);
      if (isVideo || isSidecar) out.push({ path: p, name: path.basename(p), size: st.size, isVideo });
    }
  };
  walk(rootPath, 0);
  return out;
};

// Core single-file resumable upload. Returns the Drive file id; reports per-chunk
// byte deltas via onProgress so a caller can aggregate progress across files.
const uploadSingleFileToGdrive = async (accessToken, filePath, filename, parentFolderId, onProgress) => {
  const totalSize = fs.statSync(filePath).size;

  const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/octet-stream'
    },
    body: JSON.stringify({ name: filename, parents: [parentFolderId] })
  });
  if (!initRes.ok) {
    throw new Error(`Failed to initiate Google Drive upload session: ${await initRes.text()}`);
  }
  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) throw new Error('Google Drive API did not return an upload Location header.');

  console.log(`📤 Uploading "${filename}" (${totalSize} bytes) to Google Drive...`);

  const progressTracker = new Transform({
    transform(chunk, encoding, callback) {
      if (onProgress) onProgress(chunk.length);
      callback(null, chunk);
    }
  });
  const trackedStream = fs.createReadStream(filePath).pipe(progressTracker);

  // 0-byte files would produce an invalid "bytes 0--1/0" range header.
  const headers = { 'Content-Length': totalSize.toString() };
  if (totalSize > 0) headers['Content-Range'] = `bytes 0-${totalSize - 1}/${totalSize}`;

  const uploadRes = await fetch(uploadUrl, { method: 'PUT', headers, body: trackedStream, duplex: 'half' });
  if (!uploadRes.ok) {
    throw new Error(`Google Drive upload failed (HTTP ${uploadRes.status}): ${await uploadRes.text()}`);
  }
  return (await uploadRes.json()).id;
};

// Upload an entire completed release (all videos + sidecars) to Drive under a
// single nzoId, tracking aggregate progress. The local folder is deleted ONLY
// after every file uploads successfully (when autoArchive is on); a failure
// leaves all local files intact. driveFileId points at the largest video so
// playback resolution keeps working.
const uploadReleaseToGdrive = async (accessToken, storagePath, parentFolderId, nzoId, autoArchive, folderMeta = {}) => {
  const rootStats = fs.statSync(storagePath);
  const files = rootStats.isDirectory()
    ? getUploadableReleaseFiles(storagePath)
    : [{ path: storagePath, name: path.basename(storagePath), size: rootStats.size, isVideo: true }];

  if (files.length === 0) {
    activeUploads[nzoId] = { status: 'failed', progress: 0, filename: path.basename(storagePath), error: 'No video or subtitle files found to upload.' };
    saveActiveUploads();
    return;
  }

  const videos = files.filter(f => f.isVideo);
  const primary = (videos.length ? videos : files).reduce((a, b) => (b.size > a.size ? b : a));
  const totalBytes = files.reduce((s, f) => s + f.size, 0) || 1;

  // Resume support: files uploaded in a prior attempt are recorded in driveFiles
  // (persisted to gdrive_uploads.json, so this survives a server restart). Skip
  // re-uploading them so a retry after a partial failure never creates Drive
  // duplicates. Keyed by basename — all files land flat in the Premio folder.
  const priorDriveFiles = Array.isArray(activeUploads[nzoId]?.driveFiles) ? activeUploads[nzoId].driveFiles : [];
  const alreadyUploaded = new Map(priorDriveFiles.map(f => [f.name, f]));
  const driveFiles = [...priorDriveFiles];
  let primaryDriveFileId = alreadyUploaded.get(primary.name)?.id || null;
  // Pre-count bytes of already-uploaded files so the progress bar resumes, not resets.
  let uploadedBytes = files.filter(f => alreadyUploaded.has(f.name)).reduce((s, f) => s + f.size, 0);
  let lastSaved = 0;

  activeUploads[nzoId] = {
    status: 'uploading',
    progress: Math.min(99, Math.round((uploadedBytes / totalBytes) * 100)),
    filename: primary.name,
    totalFiles: files.length,
    completedFiles: driveFiles.length,
    driveFiles,
    // Drive folders this release was archived into (Premio/<Category>/<...>), so
    // deletion can remove now-empty leaf folders bottom-up (season → show) without
    // touching the shared category folder. driveFolderChain is top→leaf.
    driveFolderId: folderMeta.leafFolderId || parentFolderId || null,
    driveFolderName: folderMeta.leafFolderName || null,
    driveCategoryFolderId: folderMeta.categoryFolderId || null,
    driveFolderChain: Array.isArray(folderMeta.folderChain) ? folderMeta.folderChain : null,
    error: null
  };
  saveActiveUploads();

  try {
    for (const f of files) {
      if (alreadyUploaded.has(f.name)) {
        console.log(`⏭️  Resume: skipping already-uploaded "${f.name}" for ${nzoId}.`);
        continue;
      }
      const id = await uploadSingleFileToGdrive(accessToken, f.path, f.name, parentFolderId, (chunkLen) => {
        uploadedBytes += chunkLen;
        activeUploads[nzoId].progress = Math.min(99, Math.round((uploadedBytes / totalBytes) * 100));
        // Throttle disk writes to ~once per 5% so we don't thrash gdrive_uploads.json.
        if (activeUploads[nzoId].progress - lastSaved >= 5) { lastSaved = activeUploads[nzoId].progress; saveActiveUploads(); }
      });
      driveFiles.push({ name: f.name, id, isVideo: f.isVideo });
      if (f.path === primary.path) primaryDriveFileId = id;
      activeUploads[nzoId].completedFiles = driveFiles.length;
      activeUploads[nzoId].driveFiles = driveFiles;
      saveActiveUploads();
    }

    activeUploads[nzoId].status = 'completed';
    activeUploads[nzoId].progress = 100;
    activeUploads[nzoId].driveFileId = primaryDriveFileId || driveFiles[0]?.id || null;
    activeUploads[nzoId].driveFiles = driveFiles;
    saveActiveUploads();
    console.log(`✅ Release upload complete for ${nzoId}: ${driveFiles.length} file(s).`);

    if (autoArchive) {
      // Permanently free the local copy now that every file is safely on Drive, so a
      // queue larger than the disk keeps draining. fs.rmSync is a real unlink/rmdir —
      // it does NOT go through the OS Trash, so space is reclaimed immediately.
      // Crucially, remove the whole JOB FOLDER, not just storagePath: when storage
      // points at a single file the parent folder would otherwise linger.
      try {
        const st = fs.existsSync(storagePath) ? fs.statSync(storagePath) : null;
        if (st && st.isDirectory()) {
          // storage is the job's own folder — remove it and everything in it.
          fs.rmSync(storagePath, { recursive: true, force: true });
          console.log(`🧹 Auto-Archive: removed local folder for ${nzoId} → ${storagePath}`);
        } else if (st && st.isFile()) {
          // storage is a single file (possibly sorted into a shared folder): remove
          // the file, then the parent too unless it still holds other real media.
          fs.rmSync(storagePath, { force: true });
          const parent = path.dirname(storagePath);
          if (fs.existsSync(parent) && !folderHasRealMedia(parent)) {
            fs.rmSync(parent, { recursive: true, force: true });
            console.log(`🧹 Auto-Archive: removed local file + folder for ${nzoId} → ${parent}`);
          } else {
            console.log(`🧹 Auto-Archive: removed local file for ${nzoId} (kept shared folder with other media) → ${storagePath}`);
          }
        }
        // Verify nothing lingered; surface it loudly if it did.
        if (fs.existsSync(storagePath)) {
          console.warn(`⚠️ Auto-Archive: local path still exists after delete for ${nzoId} → ${storagePath}`);
        }
      } catch (delErr) {
        console.error(`⚠️ Auto-Archive delete failed for ${nzoId}:`, delErr.message);
      }
    }
  } catch (err) {
    // Leave ALL local files in place on any failure — never delete a partial upload.
    console.error(`❌ Google Drive release upload failed for ${nzoId}:`, err.message);
    activeUploads[nzoId].status = 'failed';
    activeUploads[nzoId].error = err.message;
    saveActiveUploads();
  }
};

app.post('/api/gdrive/config', async (req, res) => {
  const { clientId, clientSecret } = req.body;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'Missing clientId or clientSecret' });
  }
  try {
    let creds = {};
    if (fs.existsSync('gdrive_credentials.json')) {
      creds = JSON.parse(fs.readFileSync('gdrive_credentials.json', 'utf8') || '{}');
    }
    creds.clientId = clientId;
    creds.clientSecret = clientSecret;
    fs.writeFileSync('gdrive_credentials.json', JSON.stringify(creds, null, 2), 'utf8');
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ error: `Failed to save Google Drive config: ${err.message}` });
  }
});

app.get('/api/gdrive/auth-url', (req, res) => {
  try {
    if (!fs.existsSync('gdrive_credentials.json')) {
      return res.status(400).json({ error: 'Google Drive Client ID and Client Secret must be configured first.' });
    }
    const creds = JSON.parse(fs.readFileSync('gdrive_credentials.json', 'utf8') || '{}');
    if (!creds.clientId || !creds.clientSecret) {
      return res.status(400).json({ error: 'Google Drive Client ID and Client Secret must be configured first.' });
    }
    
    const redirectUri = 'http://localhost:3001/api/gdrive/callback';
    const scope = 'https://www.googleapis.com/auth/drive.file';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(creds.clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
    
    return res.json({ status: 'success', authUrl });
  } catch (err) {
    return res.status(500).json({ error: `Failed to generate Auth URL: ${err.message}` });
  }
});

app.get('/api/gdrive/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('<h1>Error</h1><p>Missing authorization code from Google.</p>');
  }

  try {
    if (!fs.existsSync('gdrive_credentials.json')) {
      throw new Error('Google Drive credentials file not found on server.');
    }
    const creds = JSON.parse(fs.readFileSync('gdrive_credentials.json', 'utf8') || '{}');
    const redirectUri = 'http://localhost:3001/api/gdrive/callback';

    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const params = new URLSearchParams();
    params.append('client_id', creds.clientId);
    params.append('client_secret', creds.clientSecret);
    params.append('code', code);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', redirectUri);

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Google returned HTTP ${tokenRes.status}: ${errText}`);
    }

    const tokenData = await tokenRes.json();
    
    creds.accessToken = tokenData.access_token;
    if (tokenData.refresh_token) {
      creds.refreshToken = tokenData.refresh_token;
    }
    creds.expiresAt = Date.now() + (tokenData.expires_in * 1000);
    fs.writeFileSync('gdrive_credentials.json', JSON.stringify(creds, null, 2), 'utf8');

    return res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Google Drive Authorized</title></head>
      <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #121212; color: #ffffff;">
        <h2 style="color: #10b981;">🟢 Google Drive Successfully Connected!</h2>
        <p>This window will close automatically.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage('gdrive-connected', '*');
          }
          setTimeout(() => window.close(), 1500);
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('❌ Google Drive OAuth2 callback failed:', err.message);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Auth Failed</title></head>
      <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #121212; color: #ffffff;">
        <h2 style="color: #ef4444;">❌ Connection Failed</h2>
        <p>${err.message}</p>
      </body>
      </html>
    `);
  }
});

app.get('/api/gdrive/status', (req, res) => {
  try {
    if (!fs.existsSync('gdrive_credentials.json')) {
      return res.json({ connected: false });
    }
    const creds = JSON.parse(fs.readFileSync('gdrive_credentials.json', 'utf8') || '{}');
    const hasRefreshToken = !!creds.refreshToken;
    return res.json({
      connected: hasRefreshToken,
      clientId: creds.clientId || '',
      clientSecret: creds.clientSecret ? '••••••••••••••••' : '',
      folderName: creds.folderName || 'Premio'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/gdrive/folder', async (req, res) => {
  const { folderName } = req.body;
  if (!folderName || !folderName.trim()) {
    return res.status(400).json({ error: 'Missing folderName' });
  }
  try {
    let creds = {};
    if (fs.existsSync('gdrive_credentials.json')) {
      creds = JSON.parse(fs.readFileSync('gdrive_credentials.json', 'utf8') || '{}');
    }
    creds.folderName = folderName.trim();
    fs.writeFileSync('gdrive_credentials.json', JSON.stringify(creds, null, 2), 'utf8');
    return res.json({ status: 'success', folderName: creds.folderName });
  } catch (err) {
    return res.status(500).json({ error: `Failed to save folder config: ${err.message}` });
  }
});

app.get('/api/gdrive/files', async (req, res) => {
  try {
    const accessToken = await getGdriveAccessToken();
    const folderName = getGdriveFolderName();
    const parentFolderId = await findOrCreateGdriveFolder(accessToken, folderName);
    // Recursive: releases now live in Premio/<Category>/<Name>, so flat-listing the
    // root would only return category folders. This returns the actual media files
    // (excluding the profile-sync JSONs) so playback resolution + Settings scan work.
    const files = await listGdriveFilesRecursive(accessToken, parentFolderId);
    return res.json({ status: 'success', files });
  } catch (err) {
    console.error('❌ Google Drive list files failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/gdrive/disconnect', (req, res) => {
  try {
    if (fs.existsSync('gdrive_credentials.json')) {
      const creds = JSON.parse(fs.readFileSync('gdrive_credentials.json', 'utf8') || '{}');
      delete creds.accessToken;
      delete creds.refreshToken;
      delete creds.expiresAt;
      fs.writeFileSync('gdrive_credentials.json', JSON.stringify(creds, null, 2), 'utf8');
    }
    return res.json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/gdrive/sync/download', async (req, res) => {
  const filename = req.query.filename || 'premio_profile_sync.json';
  try {
    const accessToken = await getGdriveAccessToken();
    const folderName = getGdriveFolderName();
    const parentFolderId = await findOrCreateGdriveFolder(accessToken, folderName);
    const file = await findGdriveFile(accessToken, filename, parentFolderId);
    if (!file) {
      return res.json({ success: true, synced: false, data: null });
    }

    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    const downloadRes = await fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!downloadRes.ok) {
      throw new Error(`Failed to download sync file (HTTP ${downloadRes.status})`);
    }

    const syncData = await downloadRes.json();
    return res.json({ success: true, synced: true, data: syncData });
  } catch (err) {
    console.error(`❌ Google Drive sync download for ${filename} failed:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/gdrive/sync/upload', async (req, res) => {
  const filename = req.query.filename || 'premio_profile_sync.json';
  const syncData = req.body.data || req.body.syncData || req.body;
  if (!syncData) {
    return res.status(400).json({ success: false, error: 'Missing sync data in request body.' });
  }

  try {
    const accessToken = await getGdriveAccessToken();
    const folderName = getGdriveFolderName();
    const parentFolderId = await findOrCreateGdriveFolder(accessToken, folderName);
    const file = await findGdriveFile(accessToken, filename, parentFolderId);
    const fileContent = JSON.stringify(syncData, null, 2);
    
    if (file) {
      const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=media`;
      const updateRes = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: fileContent
      });

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        throw new Error(`Failed to update sync file (HTTP ${updateRes.status}): ${errText}`);
      }
    } else {
      const createUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const metadata = {
        name: filename,
        mimeType: 'application/json',
        parents: [parentFolderId]
      };

      const multipartBody = 
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        fileContent +
        closeDelim;

      const createRes = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Failed to create sync file (HTTP ${createRes.status}): ${errText}`);
      }
    }

    return res.json({ success: true, status: 'success' });
  } catch (err) {
    console.error(`❌ Google Drive sync upload for ${filename} failed:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/gdrive/upload', async (req, res) => {
  const { nzoId, autoArchive = false } = req.body;
  if (!nzoId) {
    return res.status(400).json({ error: 'Missing parameter: nzoId' });
  }

  const { sabUrl, sabKey } = resolveSab(req);
  if (!sabUrl || !sabKey) {
    return res.status(400).json({ error: 'SABnzbd config must be set.' });
  }

  try {
    const accessToken = await getGdriveAccessToken();

    const historyUrl = `${sabUrl}/api?mode=history&apikey=${sabKey}&output=json`;
    const historyRes = await fetch(historyUrl);
    if (!historyRes.ok) {
      throw new Error(`Failed to fetch history (HTTP ${historyRes.status})`);
    }
    const historyData = await historyRes.json();
    const slots = historyData?.history?.slots || [];
    const slot = slots.find(s => s.nzo_id === nzoId);
    if (!slot) {
      return res.status(404).json({ error: `Completed release for job ID ${nzoId} not found in history.` });
    }

    const storage = slot.storage;
    if (!storage) {
      return res.status(400).json({ error: 'No storage path found for this history item.' });
    }
    if (!fs.existsSync(storage)) {
      return res.status(404).json({ error: `Target path does not exist on disk: ${storage}` });
    }

    const folderName = getGdriveFolderName();
    const rootFolderId = await findOrCreateGdriveFolder(accessToken, folderName);

    // Organize under Premio/<Category>/<...> (e.g. Premio/Movies/Bring Her Back
    // (2025), Premio/TV Shows/Severance/Season 02) so the archive stays tidy and
    // per-release deletion can clean up empty leaf folders bottom-up.
    const { categoryFolder, subFolders } = resolveGdriveFolders(slot.category, slot.name || path.basename(storage));
    const categoryFolderId = await findOrCreateGdriveFolder(accessToken, categoryFolder, rootFolderId);
    // Build the nested chain beneath the category folder, recording each level so
    // deletion can remove now-empty folders without touching the category folder.
    const folderChain = [];
    let parentId = categoryFolderId;
    for (const segment of subFolders) {
      const id = await findOrCreateGdriveFolder(accessToken, segment, parentId);
      folderChain.push({ id, name: segment });
      parentId = id;
    }
    const leafFolderId = parentId;

    // Fire-and-forget: uploads ALL videos + sidecars and (if autoArchive) deletes
    // the local folder only after every file succeeds. Tracks progress via activeUploads[nzoId].
    uploadReleaseToGdrive(accessToken, storage, leafFolderId, nzoId, autoArchive, { leafFolderId, leafFolderName: subFolders[subFolders.length - 1], categoryFolderId, folderChain })
      .catch((uploadErr) => {
        console.error(`❌ Background GDrive release upload failed for nzoId ${nzoId}:`, uploadErr.message);
      });

    return res.json({ status: 'success', message: 'Upload started in background.' });
  } catch (err) {
    console.error('❌ Failed to start Google Drive upload:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/gdrive/upload/status', (req, res) => {
  const { nzoId } = req.query;
  if (nzoId) {
    const status = activeUploads[nzoId];
    if (!status) return res.json({ status: 'unknown' });
    return res.json(status);
  }
  return res.json(activeUploads);
});

app.get('/api/gdrive/stream', async (req, res) => {
  const { fileId } = req.query;
  if (!isValidDriveFileId(fileId)) {
    return res.status(400).json({ error: 'Missing or invalid parameter: fileId' });
  }

  // Abort the upstream Google fetch when the client disconnects. The browser
  // opens a fresh range request on every seek and abandons the previous one —
  // without aborting, those orphaned fetches keep streaming and pile up against
  // Google Drive's per-file connection limits, which then starts refusing
  // requests and surfaces as "connection lost" mid-playback.
  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const accessToken = await getGdriveAccessToken();
    const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const headers = { 'Authorization': `Bearer ${accessToken}` };
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const driveRes = await fetch(driveUrl, { headers, signal: controller.signal });

    res.status(driveRes.status);

    const headersToCopy = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'content-disposition'
    ];
    headersToCopy.forEach((h) => {
      const val = driveRes.headers.get(h);
      if (val) res.setHeader(h, val);
    });

    if (!driveRes.body) {
      if (!res.headersSent) res.status(502).json({ error: 'Empty response from Google Drive.' });
      return;
    }

    const nodeStream = Readable.fromWeb(driveRes.body);
    nodeStream.on('error', (err) => {
      if (err.name !== 'AbortError') console.error('❌ GDrive stream pipe error:', err.message);
      res.destroy();
    });
    nodeStream.pipe(res);

  } catch (err) {
    if (err.name === 'AbortError') return; // client disconnected — expected, not an error
    console.error('❌ Google Drive stream proxy failed:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: `Stream failed: ${err.message}` });
    }
  }
});

app.get('/api/gdrive/transcode', async (req, res) => {
  const { fileId, ss, audioTrack } = req.query;
  if (!isValidDriveFileId(fileId)) {
    return res.status(400).json({ error: 'Missing or invalid parameter: fileId' });
  }

  try {
    const accessToken = await getGdriveAccessToken();
    const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    console.log(`🎥 Transcoding Google Drive file on-the-fly: ${fileId}`);

    res.setHeader('Content-Type', 'video/mp4');

    const ffmpegArgs = ['-nostats', '-loglevel', 'error'];

    if (ss !== undefined) {
      const ssNum = Number(ss);
      if (!Number.isFinite(ssNum) || ssNum < 0) {
        return res.status(400).json({ error: 'Invalid seek parameter: ss must be a non-negative number of seconds.' });
      }
      ffmpegArgs.push('-ss', ssNum.toString());
    }

    if (audioTrack) {
      if (/^\d+:\d+$/.test(audioTrack)) {
        ffmpegArgs.push('-map', '0:v:0', '-map', audioTrack);
      }
    }

    ffmpegArgs.push(
      '-headers', `Authorization: Bearer ${accessToken}\r\n`,
      '-i', driveUrl,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', '24',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      'pipe:1'
    );

    const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);

    ffmpegProcess.stdout.pipe(res);

    ffmpegProcess.stderr.on('data', (chunk) => {
      console.error(`ffmpeg (gdrive): ${chunk.toString().trim()}`);
    });

    req.on('close', () => {
      console.log('🔌 Client closed GDrive transcoding stream. Killing ffmpeg process...');
      ffmpegProcess.kill('SIGKILL');
    });

    ffmpegProcess.on('error', (err) => {
      console.error('❌ ffmpeg spawn error (gdrive):', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: `ffmpeg failed: ${err.message}` });
      }
    });

  } catch (err) {
    console.error('❌ Google Drive transcode failed:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: `Transcode failed: ${err.message}` });
    }
  }
});

app.get('/api/gdrive/audio-tracks', async (req, res) => {
  const { fileId } = req.query;
  if (!isValidDriveFileId(fileId)) {
    return res.status(400).json({ error: 'Missing or invalid parameter: fileId' });
  }

  try {
    const accessToken = await getGdriveAccessToken();
    const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const tracks = await new Promise((resolve) => {
      const ffmpegProcess = spawn(ffmpegPath, [
        '-hide_banner',
        '-headers', `Authorization: Bearer ${accessToken}\r\n`,
        '-i', driveUrl
      ]);
      let stderr = '';
      
      ffmpegProcess.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      
      ffmpegProcess.on('close', () => {
        const parsedTracks = [];
        const lines = stderr.split('\n');
        let currentTrack = null;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          const streamMatch = line.match(/Stream\s+#(\d+:\d+)(?:\(([^)]+)\))?:\s+(Audio):\s+(.*)/i);
          
          if (streamMatch) {
            if (currentTrack) {
              parsedTracks.push(currentTrack);
            }
            const index = streamMatch[1];
            const lang = streamMatch[2] || 'und';
            const codecInfo = streamMatch[4];
            
            currentTrack = {
              index,
              language: lang,
              codec: codecInfo,
              title: ''
            };
          } else if (currentTrack && line.startsWith('Metadata:')) {
            let j = i + 1;
            while (j < lines.length) {
              const nextLine = lines[j].trim();
              if (nextLine.startsWith('Stream #') || nextLine.startsWith('Input #') || nextLine.startsWith('Output #')) {
                break;
              }
              const titleMatch = nextLine.match(/title\s*:\s*(.*)/i);
              if (titleMatch) {
                currentTrack.title = titleMatch[1].trim();
                break;
              }
              j++;
            }
          }
        }
        
        if (currentTrack) {
          parsedTracks.push(currentTrack);
        }
        
        resolve(parsedTracks);
      });
    });

    return res.json({ status: 'success', tracks });

  } catch (err) {
    console.error('❌ Failed to fetch audio tracks (gdrive):', err.message);
    return res.status(500).json({ error: `Failed to retrieve audio tracks: ${err.message}` });
  }
});

// --- SABnzbd proxy endpoints ---
app.get('/api/sab/test', async (req, res) => {
  const { sabUrl, sabKey } = resolveSab(req);
  if (!sabUrl || !sabKey) {
    return res.status(400).json({ error: 'SABnzbd URL and API Key must be configured in Settings.' });
  }

  try {
    const testUrl = `${sabUrl}/api?mode=version&apikey=${sabKey}&output=json`;
    const response = await fetch(testUrl);
    if (!response.ok) {
      throw new Error(`SABnzbd returned HTTP ${response.status}`);
    }
    const data = await response.json();
    return res.json({ status: 'success', version: data.version || 'unknown' });
  } catch (err) {
    console.error('❌ SABnzbd test connection failed:', err.message);
    return res.status(500).json({ error: `Connection failed: ${err.message}. Ensure SABnzbd is running and accessible.` });
  }
});

app.post('/api/sab/add', async (req, res) => {
  const { sabUrl, sabKey, sabCategory } = resolveSab(req);
  if (!sabUrl || !sabKey) {
    return res.status(400).json({ error: 'SABnzbd URL and API Key must be configured in Settings.' });
  }

  const { nzbUrl, importId } = req.body;
  if (!nzbUrl && !importId) {
    return res.status(400).json({ error: 'Missing nzbUrl or importId in request body.' });
  }

  try {
    let addRes;
    if (importId) {
      const nzbBuffer = importedNzbsCache.get(importId);
      if (!nzbBuffer) {
        return res.status(400).json({ error: 'Imported NZB file has expired or was not found.' });
      }

      const formData = new FormData();
      const file = new File([nzbBuffer], `imported_${importId}.nzb`, { type: 'application/x-nzb' });
      formData.append('name', file);
      if (sabCategory) {
        formData.append('cat', sabCategory);
      }

      addRes = await fetch(`${sabUrl}/api?mode=addfile&apikey=${sabKey}&output=json`, {
        method: 'POST',
        body: formData
      });
    } else {
      let addUrl = `${sabUrl}/api?mode=addurl&name=${encodeURIComponent(nzbUrl)}&apikey=${sabKey}&output=json`;
      if (sabCategory) {
        addUrl += `&cat=${encodeURIComponent(sabCategory)}`;
      }
      addRes = await fetch(addUrl);
    }

    if (!addRes.ok) {
      throw new Error(`SABnzbd returned HTTP ${addRes.status}`);
    }

    const data = await addRes.json();
    if (data.status === false || (data.error && data.error.length > 0)) {
      throw new Error(data.error || 'SABnzbd failed to add NZB.');
    }

    return res.json({ status: 'success', nzo_ids: data.nzo_ids || [] });
  } catch (err) {
    console.error('❌ SABnzbd add NZB failed:', err.message);
    return res.status(500).json({ error: `Failed to add NZB: ${err.message}` });
  }
});

app.get('/api/sab/status', async (req, res) => {
  const { sabUrl, sabKey } = resolveSab(req);
  if (!sabUrl || !sabKey) {
    return res.json({ status: 'success', active: [], done: [] });
  }

  try {
    const queueUrl = `${sabUrl}/api?mode=queue&apikey=${sabKey}&output=json`;
    const historyUrl = `${sabUrl}/api?mode=history&apikey=${sabKey}&output=json`;

    const [queueRes, historyRes] = await Promise.all([
      fetch(queueUrl),
      fetch(historyUrl)
    ]);

    if (!queueRes.ok || !historyRes.ok) {
      throw new Error(`SABnzbd status fetch failed (Queue: ${queueRes.status}, History: ${historyRes.status})`);
    }

    const [queueData, historyData] = await Promise.all([
      queueRes.json(),
      historyRes.json()
    ]);

    const active = (queueData?.queue?.slots || []).map(slot => ({
      nzoId: slot.nzo_id,
      name: slot.filename,
      percent: parseFloat(slot.percentage) || 0,
      mbLeft: parseFloat(slot.mbleft) || 0,
      eta: slot.timeleft || '',
      status: slot.status,
      category: slot.category || ''
    }));

    const done = (historyData?.history?.slots || []).map(slot => {
      let resolvedVideoFile = '';
      const storage = slot.storage || '';
      if (storage && fs.existsSync(storage)) {
        try {
          const stats = fs.statSync(storage);
          if (stats.isDirectory()) {
            const largest = getLargestVideoFile(storage);
            if (largest) resolvedVideoFile = path.basename(largest);
          } else if (stats.isFile()) {
            resolvedVideoFile = path.basename(storage);
          }
        } catch (e) {
          // Ignore
        }
      }
      return {
        nzoId: slot.nzo_id,
        name: slot.name,
        status: slot.status,
        storage,
        bytes: slot.bytes || 0,
        resolvedVideoFile,
        action_line: slot.action_line || '',
        category: slot.category || ''
      };
    });

    return res.json({
      status: 'success',
      speed: queueData?.queue?.speed || '0 B',
      active,
      done
    });
  } catch (err) {
    console.error('❌ SABnzbd fetch status failed:', err.message);
    return res.json({ status: 'error', error: err.message, active: [], done: [] });
  }
});

app.post('/api/sab/delete', async (req, res) => {
  const { sabUrl, sabKey, sabCompleteDir } = resolveSab(req);
  if (!sabUrl || !sabKey) {
    return res.status(400).json({ error: 'SABnzbd URL and API Key must be configured in Settings.' });
  }

  const { nzoId, deleteFiles, fromQueue } = req.body;
  if (!nzoId) {
    return res.status(400).json({ error: 'Missing nzoId in request body.' });
  }

  try {
    let storagePath = null;
    if (deleteFiles && !fromQueue) {
      // Fetch completed folder path from history first (since SABnzbd's history
      // delete API doesn't purge local files on disk).
      try {
        const historyUrl = `${sabUrl}/api?mode=history&apikey=${sabKey}&output=json`;
        const historyRes = await fetch(historyUrl);
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          const slots = historyData?.history?.slots || [];
          const slot = slots.find(s => s.nzo_id === nzoId);
          if (slot && slot.storage) {
            storagePath = slot.storage;
          }
        }
      } catch (historyErr) {
        console.warn('⚠️ Could not resolve storage path from history for deletion:', historyErr.message);
      }
    }

    // Resolve allowed roots (for validating any filesystem deletion) and capture
    // the release's job folder NOW, while its files still exist — so we can tell a
    // single-file storage path (job folder = its parent) from a folder one.
    let allowedDir = sabCompleteDir;
    let tempDir = '';
    let jobFolder = null;
    if (storagePath) {
      try {
        const configRes = await fetch(`${sabUrl}/api?mode=get_config&apikey=${sabKey}&output=json`);
        if (configRes.ok) {
          const configData = await configRes.json();
          if (!allowedDir) allowedDir = configData?.config?.misc?.complete_dir || '';
          tempDir = configData?.config?.misc?.download_dir || '';
        }
      } catch (e) {
        console.warn('⚠️ Failed to fetch SABnzbd config for directory validation:', e.message);
      }
      try {
        if (fs.existsSync(storagePath)) {
          jobFolder = fs.statSync(storagePath).isFile() ? path.dirname(storagePath) : storagePath;
        }
      } catch { /* ignore */ }
    }

    // Is `target` strictly inside an allowed root (deeper than it, never the root
    // itself)? When no root is known we trust the SAB-reported path (not user input).
    const isDeletableLocalPath = (target) => {
      const abs = path.resolve(target);
      const roots = [allowedDir, tempDir].filter(Boolean).map(d => path.resolve(d));
      if (roots.length === 0) return true;
      return roots.some(root => abs !== root && abs.startsWith(root + path.sep));
    };

    // --- Google Drive cleanup: trash the release's files (recoverable), then the
    // leaf folder if it's now empty (so a movie folder vanishes but a show folder with other
    // episodes survives). Best-effort — never blocks local/SAB deletion.
    const deletedDriveFiles = [];
    if (deleteFiles) {
      const uploadRecord = activeUploads[nzoId];
      const driveFiles = Array.isArray(uploadRecord?.driveFiles) ? uploadRecord.driveFiles : [];
      if (driveFiles.length > 0) {
        try {
          const accessToken = await getGdriveAccessToken();
          for (const f of driveFiles) {
            try {
              await deleteGdriveFile(accessToken, f.id);
              deletedDriveFiles.push(f);
            } catch (fileErr) {
              console.warn(`⚠️ Failed to delete Drive file ${f.name} (${f.id}):`, fileErr.message);
            }
          }
          // Remove now-empty folders bottom-up (e.g. Season 02 → its show), so a
          // movie/season folder vanishes once emptied but a show/season still
          // holding other episodes is preserved. Never the category folder.
          const chain = Array.isArray(uploadRecord?.driveFolderChain) && uploadRecord.driveFolderChain.length
            ? uploadRecord.driveFolderChain
            : (uploadRecord?.driveFolderId ? [{ id: uploadRecord.driveFolderId, name: uploadRecord.driveFolderName }] : []);
          for (let i = chain.length - 1; i >= 0; i--) {
            const folder = chain[i];
            if (!folder?.id || folder.id === uploadRecord?.driveCategoryFolderId) continue;
            try {
              const remaining = await listGdriveFolderFiles(accessToken, folder.id);
              if (remaining.length > 0) break; // this level (and parents) still hold files — stop
              await deleteGdriveFile(accessToken, folder.id);
              console.log(`🗑️ Removed empty Drive folder "${folder.name || folder.id}".`);
            } catch (folderErr) {
              console.warn('⚠️ Drive folder cleanup skipped:', folderErr.message);
              break;
            }
          }
        } catch (tokenErr) {
          console.warn('⚠️ Skipping Google Drive cleanup (not connected or token error):', tokenErr.message);
        }
      }
      if (uploadRecord) {
        delete activeUploads[nzoId];
        saveActiveUploads();
      }
    }

    // Call SABnzbd API to delete from history or queue (del_files purges the job's
    // tracked files on disk).
    const mode = fromQueue ? 'queue' : 'history';
    let delUrl = `${sabUrl}/api?mode=${mode}&name=delete&value=${encodeURIComponent(nzoId)}&apikey=${sabKey}&output=json`;
    if (deleteFiles) {
      delUrl += '&del_files=1';
    }

    const delRes = await fetch(delUrl);
    if (!delRes.ok) {
      throw new Error(`SABnzbd returned HTTP ${delRes.status}`);
    }

    const data = await delRes.json();

    // --- Local folder cleanup (after SAB removed the files). Remove the release's
    // own folder so it doesn't linger. Only when no real video remains, so a shared
    // show/season folder that still holds other episodes is preserved.
    if (deleteFiles && jobFolder) {
      try {
        if (fs.existsSync(jobFolder)) {
          if (!isDeletableLocalPath(jobFolder)) {
            console.warn(`⚠️ Skipping local cleanup — "${jobFolder}" is outside allowed directories.`);
          } else if (folderHasRealMedia(jobFolder)) {
            console.log(`ℹ️ Keeping "${jobFolder}" — still holds other media (e.g. more episodes).`);
          } else {
            console.log(`🗑️ Removing leftover release folder: ${jobFolder}`);
            fs.rmSync(jobFolder, { recursive: true, force: true });
          }
        }
      } catch (localErr) {
        console.warn('⚠️ Local folder cleanup failed:', localErr.message);
      }
    }

    return res.json({ status: 'success', data, deletedDriveFiles });
  } catch (err) {
    console.error('❌ SABnzbd delete history failed:', err.message);
    return res.status(500).json({ error: `Failed to delete item: ${err.message}` });
  }
});

app.get('/api/sab/stream', async (req, res) => {
  const { nzoId } = req.query;
  if (!nzoId) {
    return res.status(400).json({ error: 'Missing parameter: nzoId' });
  }

  // allowQueryCreds: the <video> element can't send custom headers, so this route
  // (and /transcode) reads credentials from the query string. See resolveSab().
  const { sabUrl, sabKey, sabCompleteDir } = resolveSab(req, { allowQueryCreds: true });
  if (!sabUrl || !sabKey) {
    return res.status(400).json({ error: 'SABnzbd config must be set.' });
  }

  try {
    // 1. Fetch completed folder path from history
    const historyUrl = `${sabUrl}/api?mode=history&apikey=${sabKey}&output=json`;
    const historyRes = await fetch(historyUrl);
    if (!historyRes.ok) {
      throw new Error(`Failed to fetch history (HTTP ${historyRes.status})`);
    }
    const historyData = await historyRes.json();
    const slots = historyData?.history?.slots || [];
    const slot = slots.find(s => s.nzo_id === nzoId);
    if (!slot) {
      return res.status(404).json({ error: `Completed release for job ID ${nzoId} not found in history.` });
    }

    const storage = slot.storage;
    if (!storage) {
      return res.status(400).json({ error: 'No storage path found for this history item.' });
    }

    // Find the file to stream (largest video file if it's a directory)
    let targetPath = storage;
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: `Target path does not exist on disk: ${storage}` });
    }

    const stats = fs.statSync(targetPath);
    if (stats.isDirectory()) {
      const largest = getLargestVideoFile(targetPath);
      if (!largest) {
        return res.status(404).json({ error: 'No video files found in completed folder.' });
      }
      targetPath = largest;
    }

    // 2. Resolve complete directory for path allowlist verification
    let allowedDir = sabCompleteDir;
    if (!allowedDir) {
      const configUrl = `${sabUrl}/api?mode=get_config&apikey=${sabKey}&output=json`;
      const configRes = await fetch(configUrl);
      if (configRes.ok) {
        const configData = await configRes.json();
        allowedDir = configData?.config?.misc?.complete_dir || '';
      }
    }

    if (!allowedDir) {
      console.warn('⚠️ Could not resolve SABnzbd complete_dir, path verification bypassed. Configure complete_dir or ALLOW_ENV_KEYS if needed.');
    } else {
      const resolvedAllowedDir = path.resolve(allowedDir);
      const absoluteTargetPath = path.resolve(targetPath);
      if (absoluteTargetPath !== resolvedAllowedDir && !absoluteTargetPath.startsWith(resolvedAllowedDir + path.sep)) {
        return res.status(403).json({ error: `Access denied: Target path is outside the allowed directory: ${allowedDir}` });
      }
    }

    console.log(`🎵 Streaming SABnzbd local file: ${targetPath}`);

    // Same-origin request (URL built from window.location.origin), so no CORS
    // headers needed — omitting the wildcard keeps streamed bytes unreadable
    // cross-origin. Accept-Ranges enables native seeking.
    res.setHeader('Accept-Ranges', 'bytes');

    // Set content type from file extension
    const ext = path.extname(targetPath).toLowerCase();
    const contentTypes = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.avi': 'video/x-msvideo',
      '.ts': 'video/mp2t',
      '.mov': 'video/quicktime',
      '.m4v': 'video/x-m4v'
    };
    if (contentTypes[ext]) {
      res.setHeader('Content-Type', contentTypes[ext]);
    }

    // Stream the file
    return res.sendFile(targetPath);
  } catch (err) {
    console.error('❌ SABnzbd stream resolution failed:', err.message);
    return res.status(500).json({ error: `Stream resolution failed: ${err.message}` });
  }
});

app.get('/api/sab/audio-tracks', async (req, res) => {
  const { nzoId } = req.query;
  if (!nzoId) {
    return res.status(400).json({ error: 'Missing parameter: nzoId' });
  }

  // allowQueryCreds is allowed for safety since this is a read-only metadata route.
  const { sabUrl, sabKey, sabCompleteDir } = resolveSab(req, { allowQueryCreds: true });
  if (!sabUrl || !sabKey) {
    return res.status(400).json({ error: 'SABnzbd config must be set.' });
  }

  try {
    // 1. Fetch completed folder path from history
    const historyUrl = `${sabUrl}/api?mode=history&apikey=${sabKey}&output=json`;
    const historyRes = await fetch(historyUrl);
    if (!historyRes.ok) {
      throw new Error(`Failed to fetch history (HTTP ${historyRes.status})`);
    }
    const historyData = await historyRes.json();
    const slots = historyData?.history?.slots || [];
    const slot = slots.find(s => s.nzo_id === nzoId);
    if (!slot) {
      return res.status(404).json({ error: `Completed release for job ID ${nzoId} not found in history.` });
    }

    const storage = slot.storage;
    if (!storage) {
      return res.status(400).json({ error: 'No storage path found for this history item.' });
    }

    // Find the file (largest video file if it's a directory)
    let targetPath = storage;
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: `Target path does not exist on disk: ${storage}` });
    }

    const stats = fs.statSync(targetPath);
    if (stats.isDirectory()) {
      const largest = getLargestVideoFile(targetPath);
      if (!largest) {
        return res.status(404).json({ error: 'No video files found in completed folder.' });
      }
      targetPath = largest;
    }

    // 2. Resolve complete directory for path allowlist verification
    let allowedDir = sabCompleteDir;
    if (!allowedDir) {
      const configUrl = `${sabUrl}/api?mode=get_config&apikey=${sabKey}&output=json`;
      const configRes = await fetch(configUrl);
      if (configRes.ok) {
        const configData = await configRes.json();
        allowedDir = configData?.config?.misc?.complete_dir || '';
      }
    }

    if (allowedDir) {
      const resolvedAllowedDir = path.resolve(allowedDir);
      const absoluteTargetPath = path.resolve(targetPath);
      if (absoluteTargetPath !== resolvedAllowedDir && !absoluteTargetPath.startsWith(resolvedAllowedDir + path.sep)) {
        return res.status(403).json({ error: `Access denied: Target path is outside the allowed directory: ${allowedDir}` });
      }
    }

    // 3. Query audio tracks using ffmpeg
    const tracks = await new Promise((resolve) => {
      const ffmpegProcess = spawn(ffmpegPath, ['-hide_banner', '-i', targetPath]);
      let stderr = '';
      
      ffmpegProcess.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      
      ffmpegProcess.on('close', () => {
        const parsedTracks = [];
        const lines = stderr.split('\n');
        let currentTrack = null;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Match Stream lines (e.g. Stream #0:1(eng): Audio: ac3...)
          const streamMatch = line.match(/Stream\s+#(\d+:\d+)(?:\(([^)]+)\))?:\s+(Audio):\s+(.*)/i);
          
          if (streamMatch) {
            if (currentTrack) {
              parsedTracks.push(currentTrack);
            }
            const index = streamMatch[1];
            const lang = streamMatch[2] || 'und';
            const codecInfo = streamMatch[4];
            
            currentTrack = {
              index,
              language: lang,
              codec: codecInfo,
              title: ''
            };
          } else if (currentTrack && line.startsWith('Metadata:')) {
            // Parse subsequent metadata block for title
            let j = i + 1;
            while (j < lines.length) {
              const nextLine = lines[j].trim();
              if (nextLine.startsWith('Stream #') || nextLine.startsWith('Input #') || nextLine.startsWith('Output #')) {
                break;
              }
              const titleMatch = nextLine.match(/title\s*:\s*(.*)/i);
              if (titleMatch) {
                currentTrack.title = titleMatch[1].trim();
                break;
              }
              j++;
            }
          }
        }
        
        if (currentTrack) {
          parsedTracks.push(currentTrack);
        }
        
        resolve(parsedTracks);
      });
    });

    return res.json({ status: 'success', tracks });

  } catch (err) {
    console.error('❌ Failed to fetch audio tracks:', err.message);
    return res.status(500).json({ error: `Failed to retrieve audio tracks: ${err.message}` });
  }
});

app.get('/api/sab/transcode', async (req, res) => {
  const { nzoId, ss, audioTrack } = req.query;
  if (!nzoId) {
    return res.status(400).json({ error: 'Missing parameter: nzoId' });
  }

  // allowQueryCreds: see /api/sab/stream — the <video> element authenticates via
  // query params because it can't attach custom headers.
  const { sabUrl, sabKey, sabCompleteDir } = resolveSab(req, { allowQueryCreds: true });
  if (!sabUrl || !sabKey) {
    return res.status(400).json({ error: 'SABnzbd config must be set.' });
  }

  try {
    // 1. Fetch completed folder path from history
    const historyUrl = `${sabUrl}/api?mode=history&apikey=${sabKey}&output=json`;
    const historyRes = await fetch(historyUrl);
    if (!historyRes.ok) {
      throw new Error(`Failed to fetch history (HTTP ${historyRes.status})`);
    }
    const historyData = await historyRes.json();
    const slots = historyData?.history?.slots || [];
    const slot = slots.find(s => s.nzo_id === nzoId);
    if (!slot) {
      return res.status(404).json({ error: `Completed release for job ID ${nzoId} not found in history.` });
    }

    const storage = slot.storage;
    if (!storage) {
      return res.status(400).json({ error: 'No storage path found for this history item.' });
    }

    // Find the file to stream (largest video file if it's a directory)
    let targetPath = storage;
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: `Target path does not exist on disk: ${storage}` });
    }

    const stats = fs.statSync(targetPath);
    if (stats.isDirectory()) {
      const largest = getLargestVideoFile(targetPath);
      if (!largest) {
        return res.status(404).json({ error: 'No video files found in completed folder.' });
      }
      targetPath = largest;
    }

    // 2. Resolve complete directory for path allowlist verification
    let allowedDir = sabCompleteDir;
    if (!allowedDir) {
      const configUrl = `${sabUrl}/api?mode=get_config&apikey=${sabKey}&output=json`;
      const configRes = await fetch(configUrl);
      if (configRes.ok) {
        const configData = await configRes.json();
        allowedDir = configData?.config?.misc?.complete_dir || '';
      }
    }

    if (allowedDir) {
      const resolvedAllowedDir = path.resolve(allowedDir);
      const absoluteTargetPath = path.resolve(targetPath);
      if (absoluteTargetPath !== resolvedAllowedDir && !absoluteTargetPath.startsWith(resolvedAllowedDir + path.sep)) {
        return res.status(403).json({ error: `Access denied: Target path is outside the allowed directory: ${allowedDir}` });
      }
    }

    console.log(`🎥 Transcoding SABnzbd local file on-the-fly: ${targetPath}`);

    // Same-origin request — no CORS headers (omitting the wildcard keeps the
    // transcoded stream unreadable cross-origin). Node manages Transfer-Encoding.
    res.setHeader('Content-Type', 'video/mp4');

    // Build ffmpeg arguments. Keep stderr quiet (-nostats / -loglevel error) so it
    // can't fill the OS pipe buffer; we still drain it below as a safeguard.
    const ffmpegArgs = ['-nostats', '-loglevel', 'error'];

    // Seeking support: if ss is provided, seek input using fast seek (-ss before -i).
    // Validate it's a finite, non-negative number before handing it to ffmpeg —
    // no shell injection risk (spawn, not a shell) but this rejects malformed input.
    if (ss !== undefined) {
      const ssNum = Number(ss);
      if (!Number.isFinite(ssNum) || ssNum < 0) {
        return res.status(400).json({ error: 'Invalid seek parameter: ss must be a non-negative number of seconds.' });
      }
      ffmpegArgs.push('-ss', ssNum.toString());
    }

    // Audio track mapping support: if audioTrack parameter is specified, map it
    if (audioTrack) {
      // Validate it matches format "0:x" where x is a digit to prevent command argument issues
      if (/^\d+:\d+$/.test(audioTrack)) {
        ffmpegArgs.push('-map', '0:v:0', '-map', audioTrack);
      }
    }

    ffmpegArgs.push(
      '-i', targetPath,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', '24',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2', // convert to stereo for max browser compatibility
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      'pipe:1'
    );

    const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);

    // Pipe ffmpeg stdout directly into response
    ffmpegProcess.stdout.pipe(res);

    // Drain stderr — if it isn't consumed, a full OS pipe buffer (~64KB) blocks
    // ffmpeg's writes and stalls the whole transcode. Surface any error output.
    ffmpegProcess.stderr.on('data', (chunk) => {
      console.error(`ffmpeg: ${chunk.toString().trim()}`);
    });

    // Cleanup process when client disconnects
    req.on('close', () => {
      console.log('🔌 Client closed transcoding stream. Killing ffmpeg process...');
      ffmpegProcess.kill('SIGKILL');
    });

    ffmpegProcess.on('error', (err) => {
      console.error('❌ ffmpeg spawn error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: `ffmpeg failed: ${err.message}` });
      }
    });

  } catch (err) {
    console.error('❌ SABnzbd transcode failed:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: `Transcode failed: ${err.message}` });
    }
  }
});

// 2. Download/Transfer Endpoint
app.post('/api/download', async (req, res) => {
  const { magnet } = req.body;

  if (!magnet) {
    return res.status(400).json({ error: 'Missing parameter: magnet link' });
  }

  let activeMagnet = magnet;

  console.log(`📥 Download Request received for magnet link.`);

  const premiumizeApiKey = resolvePremiumizeKey(req);
  if (!premiumizeApiKey) return res.status(401).json({ status: 'error', code: 'NO_PM_KEY', message: 'Add your Premiumize API key in Settings to use this feature.' });

  if (!premiumizeApiKey || premiumizeApiKey === 'your_premiumize_api_key_here') {
    console.log('ℹ️  Premiumize key not configured. Mocking transfer creation.');
    // Simulated delay to feel premium
    await new Promise(resolve => setTimeout(resolve, 800));
    return res.json({
      status: 'success',
      id: `mock_transfer_${Math.random().toString(36).substring(2, 11)}`,
      name: 'Simulated Torrent Added Successfully'
    });
  }

  try {
    let isTorrentFile = false;
    let torrentBuffer = null;
    let torrentFilename = 'file.torrent';

    const isNzbUrl = activeMagnet.includes('nzbgeek') || activeMagnet.includes('.nzb') || activeMagnet.includes('/getnzb/');

    if ((activeMagnet.startsWith('http://') || activeMagnet.startsWith('https://')) && !isNzbUrl) {
      isTorrentFile = true;
      let fetchUrl = activeMagnet;
      if (fetchUrl.includes('//localhost:')) {
        fetchUrl = fetchUrl.replace('//localhost:', '//127.0.0.1:');
        console.log(`🔄 Replaced 'localhost' with '127.0.0.1' for reliable loopback: ${fetchUrl}`);
      }

      console.log(`🌍 Detected HTTP/HTTPS torrent download link. Fetching locally from: ${fetchUrl}`);
      try {
        let currentUrl = fetchUrl;
        let redirectCount = 0;
        const maxRedirects = 5;
        let torrentRes = null;

        while (redirectCount < maxRedirects) {
          torrentRes = await fetch(currentUrl, {
            redirect: 'manual', // Manually handle redirects so we can intercept non-http(s) targets
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/x-bittorrent,application/octet-stream,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
          });

          // Check for standard HTTP 3xx redirect status
          if (torrentRes.status >= 300 && torrentRes.status < 400) {
            const location = torrentRes.headers.get('location');
            if (!location) {
              throw new Error(`Redirect status ${torrentRes.status} received, but no Location header found.`);
            }

            console.log(`➡️  Redirected to: ${location}`);

            // If the redirect target is a magnet link, intercept and pass it directly to Premiumize as a normal transfer
            if (location.startsWith('magnet:')) {
              console.log(`🧲 Extracted magnet link from redirect location! Passing directly to Premiumize...`);
              activeMagnet = location;
              isTorrentFile = false; // It is now treated as a magnet link
              break;
            }

            // Otherwise, resolve and follow the redirect manually
            currentUrl = new URL(location, currentUrl).toString();
            redirectCount++;
          } else {
            // Not a redirect, continue normally to read binary torrent content
            break;
          }
        }

        if (isTorrentFile) {
          if (!torrentRes.ok) {
            throw new Error(`Failed to fetch torrent file from URL (HTTP ${torrentRes.status})`);
          }
          const arrayBuffer = await torrentRes.arrayBuffer();
          torrentBuffer = Buffer.from(arrayBuffer);
          console.log(`✅ Successfully fetched torrent file locally (${torrentBuffer.length} bytes)`);
          
          // Try to extract filename from content-disposition or URL if possible
          const cd = torrentRes.headers.get('content-disposition');
          if (cd && cd.includes('filename=')) {
            const match = cd.match(/filename=["']?([^"']+)["']?/);
            if (match) torrentFilename = match[1];
          } else {
            try {
              const urlPath = new URL(currentUrl).pathname;
              const baseName = urlPath.split('/').pop();
              if (baseName && baseName.endsWith('.torrent')) {
                torrentFilename = baseName;
              }
            } catch (_) {}
          }
        }
      } catch (fetchErr) {
        console.error(`❌ Error fetching torrent file locally:`, fetchErr);
        const causeStr = fetchErr.cause ? ` (Cause: ${fetchErr.cause.message || fetchErr.cause})` : '';
        return res.status(500).json({ 
          status: 'error', 
          message: `Failed to fetch torrent file locally from Jackett/Prowlarr: ${fetchErr.message}${causeStr}`,
          code: 'fetch_error'
        });
      }
    }

    let transferResponse;

    if (isTorrentFile) {
      const formData = new FormData();
      const file = new File([torrentBuffer], torrentFilename, { type: 'application/x-bittorrent' });
      formData.append('src', file);

      console.log(`📤 Uploading .torrent file to Premiumize via multipart/form-data...`);

      transferResponse = await fetch('https://www.premiumize.me/api/transfer/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${premiumizeApiKey}`
        },
        body: formData
      });
    } else {
      const params = new URLSearchParams();
      params.append('src', activeMagnet);

      console.log(`📤 Sending magnet link to Premiumize: ${activeMagnet.substring(0, 60)}...`);

      transferResponse = await fetch('https://www.premiumize.me/api/transfer/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${premiumizeApiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      });
    }

    if (!transferResponse.ok) {
      throw new Error(`Premiumize returned status code: ${transferResponse.status}`);
    }

    const transferData = await transferResponse.json();
    console.log('✅ Premiumize transfer create reply:', transferData);
    return res.json(transferData);

  } catch (err) {
    console.error('❌ Failed to create Premiumize transfer:', err);
    return res.status(500).json({ error: `Premiumize integration error: ${err.message}` });
  }
});

// --- Archive extraction helpers for zip / rar streaming ---
function getAudioFilesRecursive(dir, rootDir = dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getAudioFilesRecursive(filePath, rootDir));
      } else {
        const ext = path.extname(file).toLowerCase();
        if (['.mp3', '.m4b', '.flac', '.wav', '.m4a', '.ogg', '.wma'].includes(ext)) {
          const relativePath = path.relative(rootDir, filePath);
          results.push({
            name: relativePath,
            absolutePath: filePath,
            size: stat.size
          });
        }
      }
    }
  } catch (err) {
    console.error(`Error reading directory recursive ${dir}:`, err.message);
  }
  return results;
}

async function downloadFile(url, dest) {
  console.log(`📥 Downloading remote archive from CDN: ${url} to ${dest}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download archive: ${response.statusText} (${response.status})`);
  }
  const fileStream = fs.createWriteStream(dest);
  const reader = response.body;
  if (!reader) throw new Error('Response body is null');
  await pipeline(Readable.from(reader), fileStream);
  console.log(`✅ Download complete: ${dest}`);
}

function extractZip(zipPath, targetDir, password) {
  console.log(`🔓 Extracting ZIP: ${zipPath} to ${targetDir} ${password ? 'with password' : 'without password'}`);
  const zip = new AdmZip(zipPath);
  // Zip-slip guard: reject any entry that would resolve outside targetDir.
  const resolvedTarget = path.resolve(targetDir);
  for (const entry of zip.getEntries()) {
    const entryPath = path.resolve(targetDir, entry.entryName);
    if (entryPath !== resolvedTarget && !entryPath.startsWith(resolvedTarget + path.sep)) {
      throw new Error(`Blocked unsafe ZIP entry (zip-slip): ${entry.entryName}`);
    }
  }
  zip.extractAllTo(targetDir, true, false, password);
  console.log(`✅ ZIP extracted successfully`);
}

async function extractRar(rarPath, targetDir, password) {
  console.log(`🔓 Extracting RAR: ${rarPath} to ${targetDir} ${password ? 'with password' : 'without password'}`);
  const extractor = await createExtractorFromFile({
    filepath: rarPath,
    targetPath: targetDir,
    password: password
  });
  // Rar-slip guard: validate every entry name resolves inside targetDir first.
  const resolvedTarget = path.resolve(targetDir);
  const list = extractor.getFileList();
  for (const header of list.fileHeaders) {
    const entryPath = path.resolve(targetDir, header.name);
    if (entryPath !== resolvedTarget && !entryPath.startsWith(resolvedTarget + path.sep)) {
      throw new Error(`Blocked unsafe RAR entry (rar-slip): ${header.name}`);
    }
  }
  extractor.extract();
  console.log(`✅ RAR extracted successfully`);
}

// 3. Stream links generation endpoint
app.post('/api/stream-links', async (req, res) => {
  const { magnet, password } = req.body;

  if (!magnet) {
    return res.status(400).json({ error: 'Missing parameter: magnet link' });
  }

  console.log(`🎬 Stream Request received for magnet link / torrent file.`);

  const premiumizeApiKey = resolvePremiumizeKey(req);
  if (!premiumizeApiKey) return res.status(401).json({ status: 'error', code: 'NO_PM_KEY', message: 'Add your Premiumize API key in Settings to use this feature.' });

  if (!premiumizeApiKey || premiumizeApiKey === 'your_premiumize_api_key_here') {
    console.log('ℹ️  Premiumize key not configured. Mocking stream links.');
    
    const dn = magnet.includes('dn=') ? decodeURIComponent(magnet.split('dn=')[1].split('&')[0]) : '';
    const isEbook = dn.toLowerCase().includes('epub') || 
                    dn.toLowerCase().includes('pdf') || 
                    dn.toLowerCase().includes('ebook') || 
                    dn.toLowerCase().includes('book');

    if (isEbook) {
      const titleFromDn = dn ? dn.replace(/\.epub$/i, '').replace(/\.pdf$/i, '') : 'Sample Book';
      return res.json({
        status: 'success',
        files: [
          {
            name: `${titleFromDn}.epub`,
            link: 'https://github.com/IDPF/epub3-samples/releases/download/20230704/georgia-cfi-20230704.epub',
            size: 1048576,
            type: 'ebook'
          },
          {
            name: `${titleFromDn}.pdf`,
            link: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            size: 51200,
            type: 'ebook'
          }
        ]
      });
    }

    // Check if the request is for a retro ROM
    const isRetro = dn.toLowerCase().includes('nes') || 
                    dn.toLowerCase().includes('sfc') || 
                    dn.toLowerCase().includes('md') || 
                    dn.toLowerCase().includes('zip') || 
                    dn.toLowerCase().includes('rom');

    if (isRetro) {
      const isMultiZip = dn.toLowerCase().includes('pack.zip') || dn.toLowerCase().includes('multi-rom');
      if (isMultiZip) {
        return res.json({
          status: 'success',
          files: [
            {
              name: 'Super Nintendo Classics Pack.zip',
              link: 'http://localhost:3001/mock-download/multi-rom-pack.zip',
              size: 5242880,
              type: 'game'
            }
          ]
        });
      } else {
        const ext = dn.toLowerCase().includes('.sfc') ? 'sfc' : dn.toLowerCase().includes('.md') ? 'md' : 'nes';
        return res.json({
          status: 'success',
          files: [
            {
              name: dn || `Super Mario Bros (USA) [NES].nes`,
              link: `http://localhost:3001/mock-download/game_rom.${ext}`,
              size: 131072,
              type: 'game'
            }
          ]
        });
      }
    }

    return res.json({
      status: 'success',
      files: [
        {
          name: '[MOCK] Big Buck Bunny Movie (1080p).mp4',
          link: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          size: 1058292410,
          type: 'video'
        },
        {
          name: '[MOCK] Sintel CGI Short Film (1080p).mp4',
          link: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
          size: 658292410,
          type: 'video'
        },
        {
          name: '[MOCK] Tears of Steel VFX Short (1080p).mp4',
          link: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
          size: 558292410,
          type: 'video'
        },
        {
          name: '[MOCK] Sintel English Subtitles.srt',
          link: 'https://raw.githubusercontent.com/mdn/html5-assets/master/sintel-en.vtt',
          size: 15241,
          type: 'subtitle'
        }
      ]
    });
  }

  try {
    const params = new URLSearchParams();
    params.append('src', magnet);

    const directDlResponse = await fetch('https://www.premiumize.me/api/transfer/directdl', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${premiumizeApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!directDlResponse.ok) {
      throw new Error(`Premiumize directdl returned status: ${directDlResponse.status}`);
    }

    const data = await directDlResponse.json();

    if (data.status === 'success') {
      const files = (data.content || []).map(file => {
        let name = file.path || file.name || 'Unknown File';
        if (name.startsWith('/')) {
          name = name.substring(1);
        }
        const lowercaseName = name.toLowerCase();
        
        let type = 'other';
        if (/\.(mp4|mkv|avi|webm|mov|m4v)$/i.test(lowercaseName)) {
          type = 'video';
        } else if (/\.(srt|vtt|sub|ass)$/i.test(lowercaseName)) {
          type = 'subtitle';
        } else if (/\.(mp3|m4b|flac|wav|m4a|ogg|wma)$/i.test(lowercaseName)) {
          type = 'audio';
        }

        return {
          name: name,
          link: file.link,
          size: Number(file.size) || 0,
          type: type
        };
      });

      // Expand any ZIP/RAR archives to extract nested audio tracks
      const expandedFiles = [];
      for (const file of files) {
        const lowercaseName = file.name.toLowerCase();
        if (lowercaseName.endsWith('.zip') || lowercaseName.endsWith('.rar')) {
          console.log(`📦 Found archive file in stream-links: ${file.name}`);
          try {
            const hash = crypto.createHash('md5').update(file.link).digest('hex');
            const archiveDir = path.join(TEMP_DIR, hash);
            const archiveFile = path.join(TEMP_DIR, `${hash}.archive`);

            let extracted = [];
            if (fs.existsSync(archiveDir)) {
              console.log(`⚡ Archive ${file.name} already in cache.`);
              extracted = getAudioFilesRecursive(archiveDir);
            } else {
              await downloadFile(file.link, archiveFile);
              fs.mkdirSync(archiveDir, { recursive: true });
              if (lowercaseName.endsWith('.zip')) {
                extractZip(archiveFile, archiveDir, password);
              } else {
                await extractRar(archiveFile, archiveDir, password);
              }
              if (fs.existsSync(archiveFile)) {
                fs.unlinkSync(archiveFile);
              }
              extracted = getAudioFilesRecursive(archiveDir);
            }

            console.log(`🔊 Found ${extracted.length} audio tracks in archive: ${file.name}`);
            
            // Map extracted files to special stream links
            for (const item of extracted) {
              expandedFiles.push({
                name: item.name,
                link: `/api/stream-archive-file?archiveHash=${hash}&filePath=${encodeURIComponent(item.name)}`,
                size: item.size,
                type: 'audio'
              });
            }
          } catch (archiveErr) {
            console.error(`❌ Failed to process archive ${file.name}:`, archiveErr.message);
            // Fallback: keep the archive in the files list as 'other'
            expandedFiles.push(file);
          }
        } else {
          // Keep regular files
          expandedFiles.push(file);
        }
      }

      return res.json({ status: 'success', files: expandedFiles });
    } else {
      throw new Error(data.message || 'Failed to fetch streaming links from Premiumize.');
    }

  } catch (err) {
    console.error('❌ Failed to get streaming links:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Helper to clean JWT AI token
const sanitizeAiToken = (rawToken) => {
  if (!rawToken) return '';
  return rawToken.replace(/^Bearer:?\s*/i, '').trim();
};

// Helper to translate subtitle file texts using premiumize.ai in parallel batches
async function translateSubtitleText(text, targetLanguage, rawToken, model = 'gpt-5.4') {
  const token = sanitizeAiToken(rawToken);
  if (!token) {
    throw new Error('Missing Premiumize.ai JWT Token.');
  }

  // Split subtitle text into blocks (cues are separated by blank lines)
  const blocks = text.split(/\r?\n\r?\n/);
  const cues = [];
  
  const parsedBlocks = blocks.map((block, idx) => {
    const lines = block.split(/\r?\n/);
    const timestampIndex = lines.findIndex(l => l.includes('-->'));
    if (timestampIndex !== -1) {
      const prefix = lines.slice(0, timestampIndex + 1).join('\n');
      const textLines = lines.slice(timestampIndex + 1);
      
      const cue = {
        blockIndex: idx,
        prefix,
        text: textLines.join('\n').trim(),
        originalLines: textLines
      };
      cues.push(cue);
      return cue;
    } else {
      return {
        blockIndex: idx,
        isMetadata: true,
        content: block
      };
    }
  });

  // Extract texts to translate (keeping original text)
  const textsToTranslate = cues.map(c => c.text);

  // If there are no texts to translate, return original
  if (textsToTranslate.length === 0) {
    return text;
  }

  // Chunk texts to translate (chunk size of 80 is safe and fast)
  const chunkSize = 80;
  const chunks = [];
  for (let i = 0; i < textsToTranslate.length; i += chunkSize) {
    chunks.push(textsToTranslate.slice(i, i + chunkSize));
  }

  const translatedTexts = new Array(textsToTranslate.length);

  // Translate each chunk in parallel
  const promises = chunks.map(async (chunk, chunkIdx) => {
    const startIdx = chunkIdx * chunkSize;
    
    // Skip empty chunks
    if (chunk.every(t => !t)) {
      for (let j = 0; j < chunk.length; j++) {
        translatedTexts[startIdx + j] = '';
      }
      return;
    }

    try {
      const systemPrompt = `You are a professional subtitle translator. Translate the following JSON array of subtitle text strings into ${targetLanguage}.
Keep any HTML formatting tags (like <i>, <b>, <u>) or font styling tags exactly as they are in the translation.
For empty strings or numeric-only strings, return them exactly as-is.
Return the result ONLY as a raw JSON array of strings of the exact same length (${chunk.length} items).
Do not include any Markdown formatting fences, explanation, intro, or wrap-up text.`;

      const response = await fetch('https://premiumize.ai/api/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Cookie': `token=${token}`
        },
        body: JSON.stringify({
          model: model || 'gpt-5.4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(chunk) }
          ],
          stream: false
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Premiumize AI HTTP error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      
      if (content) {
        let cleaned = content;
        // Strip markdown code fences if LLM ignored instructions
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
        }
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed) && parsed.length === chunk.length) {
          for (let j = 0; j < chunk.length; j++) {
            translatedTexts[startIdx + j] = parsed[j];
          }
        } else {
          console.warn(`⚠️ Chunk ${chunkIdx} length mismatch or not an array. falling back to original.`);
          for (let j = 0; j < chunk.length; j++) {
            translatedTexts[startIdx + j] = chunk[j];
          }
        }
      } else {
        throw new Error('Empty completion content from AI.');
      }
    } catch (err) {
      console.error(`❌ Failed to translate subtitle chunk ${chunkIdx}:`, err.message);
      // Fallback to original texts for this chunk
      for (let j = 0; j < chunk.length; j++) {
        translatedTexts[startIdx + j] = chunk[j];
      }
    }
  });

  await Promise.all(promises);

  // Reassemble blocks
  cues.forEach((cue, cueIdx) => {
    cue.text = translatedTexts[cueIdx] !== undefined ? translatedTexts[cueIdx] : cue.text;
  });

  const rebuiltBlocks = parsedBlocks.map(block => {
    if (block.isMetadata) {
      return block.content;
    } else {
      return `${block.prefix}\n${block.text}`;
    }
  });

  return rebuiltBlocks.join('\n\n');
}

// 4. Subtitle proxy endpoint (to bypass browser CORS restrictions)
app.get('/api/proxy-subtitle', async (req, res) => {
  const { url, translateTo, token, model } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing parameter: url' });
  }

  let safeUrl;
  try { safeUrl = await assertPublicHttpUrl(url); }
  catch (e) { return res.status(400).json({ error: `Blocked URL: ${e.message}` }); }

  try {
    console.log(`🌐 Proxying subtitle request to bypass CORS...`);
    const response = await fetchWithTimeout(safeUrl.href, {}, 15000);
    if (!response.ok) {
      throw new Error(`Failed to fetch subtitle from source: ${response.status}`);
    }

    let text = await response.text();

    if (translateTo && token) {
      console.log(`🔮 Translating subtitle to ${translateTo} using AI...`);
      try {
        text = await translateSubtitleText(text, translateTo, token, model);
      } catch (transErr) {
        console.error('❌ AI Subtitle translation failed, returning original:', transErr.message);
      }
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(text);
  } catch (err) {
    console.error('❌ Subtitle proxy failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// 4a-bis. Online subtitle search & download (OpenSubtitles primary + SubDL fallback)
// -----------------------------------------------------------------------------
// BYOK: each visitor supplies their own OpenSubtitles and/or SubDL key via the
// X-OpenSubtitles-Key / X-SubDL-Key headers. Search is keyed by the IMDb id that
// TMDb already provides (the same id IntroDB uses), plus season/episode for TV.
// Resolved subtitles are returned as raw SRT text, which the player's existing
// SRT->WebVTT compiler renders; AI translation reuses translateSubtitleText().
// =============================================================================
const OS_API = 'https://api.opensubtitles.com/api/v1';
const OS_USER_AGENT = 'Premio v1.0';
const SUBDL_API = 'https://api.subdl.com/api/v1/subtitles';
const SUBDL_DL_BASE = 'https://dl.subdl.com';

// Normalize a TMDb/IMDb id into the two shapes the providers expect.
function normalizeImdb(imdbId) {
  const digits = String(imdbId || '').replace(/\D/g, '');
  if (!digits) return null;
  return {
    numeric: parseInt(digits, 10),            // OpenSubtitles wants the bare number
    tt: 'tt' + digits.padStart(7, '0'),       // SubDL wants the tt-prefixed form
  };
}

async function searchOpenSubtitles({ imdb, season, episode, language, apiKey }) {
  const params = new URLSearchParams({ languages: language });
  if (season && episode) {
    params.set('parent_imdb_id', String(imdb.numeric));
    params.set('season_number', String(season));
    params.set('episode_number', String(episode));
  } else {
    params.set('imdb_id', String(imdb.numeric));
  }
  // OpenSubtitles requires query params in alphabetical order, else it 301-redirects.
  params.sort();
  const resp = await fetchWithTimeout(`${OS_API}/subtitles?${params.toString()}`, {
    headers: { 'Api-Key': apiKey, 'User-Agent': OS_USER_AGENT, 'Accept': 'application/json' }
  }, 15000);
  if (!resp.ok) throw new Error(`OpenSubtitles search ${resp.status}`);
  const json = await resp.json();
  return (json.data || []).map(d => {
    const a = d.attributes || {};
    const file = (a.files && a.files[0]) || {};
    return {
      provider: 'opensubtitles',
      id: String(file.file_id || ''),
      language: a.language || language,
      release: a.release || file.file_name || 'Unknown release',
      downloads: a.download_count || 0,
      hi: !!a.hearing_impaired,
    };
  }).filter(r => r.id);
}

async function searchSubdl({ imdb, season, language, apiKey }) {
  const params = new URLSearchParams({
    api_key: apiKey,
    imdb_id: imdb.tt,
    languages: language.toUpperCase(),
    subs_per_page: '30',
  });
  if (season) params.set('season_number', String(season));
  const resp = await fetchWithTimeout(`${SUBDL_API}?${params.toString()}`, {
    headers: { 'Accept': 'application/json' }
  }, 15000);
  if (!resp.ok) throw new Error(`SubDL search ${resp.status}`);
  const json = await resp.json();
  if (!json || json.status === false) return [];
  return (json.subtitles || []).map(s => ({
    provider: 'subdl',
    id: s.url || '',                          // zip path, e.g. /subtitle/123.zip
    language: (s.language || s.lang || language).toLowerCase().slice(0, 2),
    release: s.release_name || s.name || 'Unknown release',
    downloads: 0,
    hi: !!s.hi,
  })).filter(r => r.id);
}

// Resolve a chosen result to raw subtitle text.
async function resolveOpenSubtitlesDownload(fileId, apiKey) {
  const dl = await fetchWithTimeout(`${OS_API}/download`, {
    method: 'POST',
    headers: { 'Api-Key': apiKey, 'User-Agent': OS_USER_AGENT, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ file_id: parseInt(fileId, 10) }),
  }, 15000);
  if (!dl.ok) {
    const msg = dl.status === 406 || dl.status === 429 ? 'OpenSubtitles daily download limit reached' : `OpenSubtitles download ${dl.status}`;
    throw new Error(msg);
  }
  const { link } = await dl.json();
  if (!link) throw new Error('OpenSubtitles returned no download link');
  const srtResp = await fetchWithTimeout(link, {}, 15000);
  if (!srtResp.ok) throw new Error(`Subtitle file fetch ${srtResp.status}`);
  return await srtResp.text();
}

async function resolveSubdlDownload(zipPath) {
  const url = zipPath.startsWith('http') ? zipPath : `${SUBDL_DL_BASE}${zipPath}`;
  const resp = await fetchWithTimeout(url, {}, 15000);
  if (!resp.ok) throw new Error(`SubDL download ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const zip = new AdmZip(buf);
  const srtEntry = zip.getEntries().find(e => !e.isDirectory && e.entryName.toLowerCase().endsWith('.srt'));
  if (!srtEntry) throw new Error('No .srt file inside SubDL archive');
  return srtEntry.getData().toString('utf-8');
}

// GET /api/subtitles/search?imdbId=tt..&season=&episode=&language=en
app.get('/api/subtitles/search', async (req, res) => {
  const { imdbId, season, episode, language = 'en' } = req.query;
  const imdb = normalizeImdb(imdbId);
  if (!imdb) return res.status(400).json({ error: 'A valid IMDb id is required to search subtitles.' });
  if (!req.userOpenSubsKey && !req.userSubdlKey) {
    return res.status(401).json({ error: 'Add an OpenSubtitles or SubDL API key in Settings to fetch subtitles.' });
  }

  const lang = String(language).toLowerCase().slice(0, 3);
  const s = season ? parseInt(season, 10) : null;
  const e = episode ? parseInt(episode, 10) : null;
  let results = [];
  const errors = [];

  // Primary: OpenSubtitles
  if (req.userOpenSubsKey) {
    try {
      results = await searchOpenSubtitles({ imdb, season: s, episode: e, language: lang, apiKey: req.userOpenSubsKey });
    } catch (err) { errors.push(err.message); console.warn(`⚠️  OpenSubtitles: ${err.message}`); }
  }
  // Fallback: SubDL when OpenSubtitles is unavailable or empty
  if (results.length === 0 && req.userSubdlKey) {
    try {
      results = await searchSubdl({ imdb, season: s, language: lang, apiKey: req.userSubdlKey });
    } catch (err) { errors.push(err.message); console.warn(`⚠️  SubDL: ${err.message}`); }
  }

  console.log(`💬 Subtitle search [${imdb.tt}${s ? ` S${s}E${e}` : ''} ${lang}] → ${results.length} result(s)`);
  return res.json({ results: results.slice(0, 30), errors });
});

// POST /api/subtitles/download  { provider, id, translateTo?, token?, model? }
app.post('/api/subtitles/download', async (req, res) => {
  const { provider, id, translateTo, token, model } = req.body || {};
  if (!provider || !id) return res.status(400).json({ error: 'Missing provider or id.' });

  try {
    let srt;
    if (provider === 'opensubtitles') {
      if (!req.userOpenSubsKey) return res.status(401).json({ error: 'OpenSubtitles key missing.' });
      srt = await resolveOpenSubtitlesDownload(id, req.userOpenSubsKey);
    } else if (provider === 'subdl') {
      srt = await resolveSubdlDownload(id);
    } else {
      return res.status(400).json({ error: `Unknown subtitle provider: ${provider}` });
    }

    if (translateTo && token) {
      try { srt = await translateSubtitleText(srt, translateTo, token, model); }
      catch (transErr) { console.error('❌ Subtitle translation failed, returning original:', transErr.message); }
    }
    return res.json({ srt });
  } catch (err) {
    console.error('❌ Subtitle download failed:', err.message);
    return res.status(502).json({ error: err.message });
  }
});

// 4b. ROM / Zip proxy endpoint (to bypass browser CORS restrictions for retro game emulators)
app.get('/api/proxy-rom', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing parameter: url' });
  }

  let safeUrl;
  try { safeUrl = await assertPublicHttpUrl(url); }
  catch (e) { return res.status(400).json({ error: `Blocked URL: ${e.message}` }); }

  try {
    console.log(`🌐 Proxying ROM/Zip request to bypass CORS...`);
    const response = await fetch(safeUrl.href);
    if (!response.ok) {
      throw new Error(`Failed to fetch ROM from source: ${response.status}`);
    }

    // Set wildcard CORS headers to satisfy EmulatorJS and JSZip fetches
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

    const contentType = response.headers.get('Content-Type');
    const contentLength = response.headers.get('Content-Length');
    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);

    // Stream the body reader directly
    const bodyReader = response.body;
    if (bodyReader) {
      const nodeReadable = Readable.from(bodyReader);
      nodeReadable.pipe(res);
    } else {
      throw new Error('Empty stream response from CDN.');
    }
  } catch (err) {
    console.error('❌ ROM proxy failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 4bb. Stream files extracted from zip/rar archives
app.get('/api/stream-archive-file', (req, res) => {
  const { archiveHash, filePath } = req.query;

  if (!archiveHash || !filePath) {
    return res.status(400).json({ error: 'Missing parameter: archiveHash or filePath' });
  }

  // Prevent directory traversal: archiveHash must be a 32-char hex md5, and the
  // resolved file path must stay strictly inside TEMP_DIR/<archiveHash>.
  if (!/^[a-f0-9]{32}$/i.test(archiveHash)) {
    return res.status(400).json({ error: 'Invalid archive identifier.' });
  }
  const archiveRoot = path.resolve(TEMP_DIR, archiveHash);
  const absoluteFilePath = path.resolve(archiveRoot, filePath);
  if (absoluteFilePath !== archiveRoot && !absoluteFilePath.startsWith(archiveRoot + path.sep)) {
    return res.status(403).json({ error: 'Access denied: directory traversal detected.' });
  }

  if (!fs.existsSync(absoluteFilePath)) {
    return res.status(404).json({ error: `File not found in archive: ${filePath}` });
  }

  console.log(`🎵 Streaming archived audio file: ${filePath}`);
  
  // Set headers for CORS and seeking
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Accept-Ranges', 'bytes');

  // Let res.sendFile handle Range headers and binary chunking automatically
  return res.sendFile(absoluteFilePath);
});

// 4c. Mock ROM / Zip downloader for Developer Mock Mode testing
app.get('/mock-download/:hash', (req, res) => {
  console.log(`ℹ️ Serving mock ROM binary for hash: ${req.params.hash}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.params.hash.endsWith('.zip') || req.params.hash.includes('zip')) {
    // Serve a tiny, valid zip file containing two mock ROMs:
    // "Super_Mario_Bros.nes" and "Sonic_the_Hedgehog.md"
    const tinyZipBase64 = 'UEsDBAoAAAAAAOC7NlhAAAAAAAAAAAAAAAAAFQAAAFN1cGVyX01hcmlvX0Jyb3MubmVzUEsDBAoAAAAAAOK7NlhAAAAAAAAAAAAAAAAAFgAAAFNvbmljX3RoZV9IZWRnZWhvZy5tZFBLAQIUAwoAAAAAAOC7NlhAAAAAAAAAAAAAAAAAFQAAAAAAAAAAAAAAAACAAAAAU3VwZXJfTWFyaW9fQnJvcy5uZXNQSwECFAUKAAAAAADiuzZYAAAAAAAAAAAAAAAAABYAAAAAAAAAAAAAAAAAmQAAAFNvbmljX3RoZV9IZWRnZWhvZy5tZFBLBQYAAAAAAgACAHAAAADmAAAAAAA=';
    const buffer = Buffer.from(tinyZipBase64, 'base64');
    res.setHeader('Content-Type', 'application/zip');
    return res.send(buffer);
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  
  // Return a tiny valid mock binary buffer
  const dummyBuffer = Buffer.alloc(1024);
  res.send(dummyBuffer);
});

// 5. Cloud Sync endpoints (GET: Download sync, POST: Upload sync)
app.get('/api/sync', async (req, res) => {
  const premiumizeApiKey = resolvePremiumizeKey(req);
  if (!premiumizeApiKey) return res.status(401).json({ status: 'error', code: 'NO_PM_KEY', message: 'Add your Premiumize API key in Settings to use this feature.' });
  const filename = req.query.filename || 'sync_data.json';

  if (!premiumizeApiKey || premiumizeApiKey === 'your_premiumize_api_key_here') {
    console.log('ℹ️  Premiumize key not configured. Cloud sync is disabled.');
    return res.json({ success: false, error: 'Premiumize API key is missing. Cloud sync requires an API key.' });
  }

  try {
    console.log(`🔄 Fetching cloud sync data (${filename}) from Premiumize...`);
    
    // A. List root folder to find "PremiumSearch_Sync"
    const rootListRes = await fetch('https://www.premiumize.me/api/folder/list', {
      headers: { 'Authorization': `Bearer ${premiumizeApiKey}` }
    });

    if (!rootListRes.ok) {
      throw new Error(`Failed to list folders: ${rootListRes.status}`);
    }

    const rootData = await rootListRes.json();
    if (rootData.status !== 'success') {
      throw new Error(rootData.message || 'Folder listing failed.');
    }

    const syncFolder = (rootData.content || []).find(
      item => item.name === 'PremiumSearch_Sync' && item.type === 'folder'
    );

    if (!syncFolder) {
      console.log('ℹ️ Sync folder "PremiumSearch_Sync" does not exist in Cloud yet.');
      return res.json({ success: true, synced: false, data: null });
    }

    const folderId = syncFolder.id;

    // B. List the sync folder contents to locate the file
    const folderListRes = await fetch(`https://www.premiumize.me/api/folder/list?id=${folderId}`, {
      headers: { 'Authorization': `Bearer ${premiumizeApiKey}` }
    });

    if (!folderListRes.ok) {
      throw new Error(`Failed to list sync folder contents: ${folderListRes.status}`);
    }

    const folderData = await folderListRes.json();
    if (folderData.status !== 'success') {
      throw new Error(folderData.message || 'Sync folder contents listing failed.');
    }

    const syncFile = (folderData.content || []).find(
      item => item.name === filename && item.type === 'file'
    );

    if (!syncFile) {
      console.log(`ℹ️ "${filename}" file not found in sync folder.`);
      return res.json({ success: true, synced: false, data: null });
    }

    // C. Download the file content from the secure CDN link
    const downloadRes = await fetch(syncFile.link);
    if (!downloadRes.ok) {
      throw new Error(`Failed to download sync file from CDN: ${downloadRes.status}`);
    }

    const syncContent = await downloadRes.json();
    console.log(`✅ Cloud sync data (${filename}) successfully fetched and parsed.`);
    return res.json({ success: true, synced: true, data: syncContent });

  } catch (err) {
    console.error(`❌ Cloud sync download for ${filename} failed:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sync', async (req, res) => {
  const syncData = req.body;
  const premiumizeApiKey = resolvePremiumizeKey(req);
  if (!premiumizeApiKey) return res.status(401).json({ status: 'error', code: 'NO_PM_KEY', message: 'Add your Premiumize API key in Settings to use this feature.' });
  const filename = req.query.filename || 'sync_data.json';

  if (!premiumizeApiKey || premiumizeApiKey === 'your_premiumize_api_key_here') {
    return res.status(400).json({ success: false, error: 'Premiumize API key is missing.' });
  }

  try {
    console.log(`🔄 Uploading cloud sync data (${filename}) to Premiumize...`);

    // A. Find or create the "PremiumSearch_Sync" folder in root
    const rootListRes = await fetch('https://www.premiumize.me/api/folder/list', {
      headers: { 'Authorization': `Bearer ${premiumizeApiKey}` }
    });

    if (!rootListRes.ok) {
      throw new Error(`Folder lookup failed: ${rootListRes.status}`);
    }

    const rootData = await rootListRes.json();
    let syncFolder = (rootData.content || []).find(
      item => item.name === 'PremiumSearch_Sync' && item.type === 'folder'
    );

    let folderId;

    if (!syncFolder) {
      console.log('📁 Creating new "PremiumSearch_Sync" folder...');
      const createParams = new URLSearchParams();
      createParams.append('name', 'PremiumSearch_Sync');

      const createFolderRes = await fetch('https://www.premiumize.me/api/folder/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${premiumizeApiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: createParams
      });

      if (!createFolderRes.ok) {
        throw new Error(`Failed to create sync folder: ${createFolderRes.status}`);
      }

      const createData = await createFolderRes.json();
      if (createData.status !== 'success') {
        throw new Error(createData.message || 'Folder creation failed.');
      }

      folderId = createData.id;
      console.log(`✅ Created folder "PremiumSearch_Sync" with ID: ${folderId}`);
    } else {
      folderId = syncFolder.id;
      console.log(`📁 Found existing sync folder ID: ${folderId}`);
    }

    // B. List the sync folder contents to check if the file already exists (so we can delete it first)
    const folderListRes = await fetch(`https://www.premiumize.me/api/folder/list?id=${folderId}`, {
      headers: { 'Authorization': `Bearer ${premiumizeApiKey}` }
    });

    if (folderListRes.ok) {
      const folderData = await folderListRes.json();
      if (folderData.status === 'success') {
        const existingSyncFile = (folderData.content || []).find(
          item => item.name === filename && item.type === 'file'
        );
        
        if (existingSyncFile) {
          console.log(`🗑️ Deleting old "${filename}" (ID: ${existingSyncFile.id})...`);
          const deleteParams = new URLSearchParams();
          deleteParams.append('id', existingSyncFile.id);

          await fetch('https://www.premiumize.me/api/item/delete', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${premiumizeApiKey}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: deleteParams
          });
        }
      }
    }

    // C. Get upload information for the folder
    const uploadInfoRes = await fetch(`https://www.premiumize.me/api/folder/uploadinfo?id=${folderId}`, {
      headers: { 'Authorization': `Bearer ${premiumizeApiKey}` }
    });

    if (!uploadInfoRes.ok) {
      throw new Error(`Failed to fetch uploadinfo: ${uploadInfoRes.status}`);
    }

    const uploadInfo = await uploadInfoRes.json();
    if (uploadInfo.status !== 'success') {
      throw new Error(uploadInfo.message || 'Fetching upload info failed.');
    }

    const uploadUrl = uploadInfo.url;
    const uploadToken = uploadInfo.token;

    // D. Perform the actual file upload POST using multipart/form-data with Node's native FormData
    const formData = new FormData();
    formData.append('token', uploadToken);
    
    // Convert JSON state to a Blob
    const jsonBlob = new Blob([JSON.stringify(syncData, null, 2)], { type: 'application/json' });
    formData.append('file', jsonBlob, filename);

    console.log(`📤 Posting sync payload to Premiumize CDN upload URL for ${filename}...`);
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    });

    if (!uploadRes.ok) {
      throw new Error(`File upload POST to CDN failed: ${uploadRes.status}`);
    }

    console.log(`✅ Sync upload complete for ${filename}!`);
    return res.json({ success: true });

  } catch (err) {
    console.error('❌ Cloud sync upload failed:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Metadata enrichment helpers ──────────────────────────────────────────────

// In-memory metadata cache (category+cleanTitle -> response). Max 500 entries.
const metadataCache = new Map();
const METADATA_CACHE_MAX = 500;

function setMetadataCache(key, value) {
  if (metadataCache.size >= METADATA_CACHE_MAX) {
    // Evict the oldest entry (first inserted)
    const firstKey = metadataCache.keys().next().value;
    metadataCache.delete(firstKey);
  }
  metadataCache.set(key, value);
}

/**
 * Parse and clean a raw torrent release title.
 * Returns { cleanTitle, year, artist, showName }
 */
function parseReleaseTitle(rawTitle, category) {
  let title = rawTitle || '';

  // 1. Remove common file extensions
  title = title.replace(/\.(mkv|mp4|avi|srt|epub|pdf|mp3|flac|m4b)$/i, '');

  // 2. Remove group tags (hyphen + group name at the end, e.g. -SPARKS)
  title = title.replace(/-[A-Za-z0-9]+$/, '');

  // 3. Remove Chinese / Japanese brackets and contents
  title = title.replace(/【[^】]*】/g, '');
  title = title.replace(/「[^」]*」/g, '');
  title = title.replace(/『[^』]*』/g, '');
  title = title.replace(/《[^》]*》/g, '');

  // 4. Remove standard brackets and contents
  title = title.replace(/\[([^\]]*)\]/g, '');
  title = title.replace(/\((?!\d{4}\))[^)]*\)/g, '');

  // 5. Remove websites/domains — but NOT real title words. The old single regex
  // treated "Time.to" / "Loathing.in" as domains (.to/.in/.is/.me/.us are valid
  // TLDs) and ate the word, mangling titles like "No Time to Die". So: strip
  // protocol/www. URLs with ANY tld, but strip BARE domains only for unambiguous
  // tlds that don't collide with common English words.
  title = title.replace(/\bhttps?:\/\/[\w.-]+/gi, ' ');
  title = title.replace(/\b(?:https?:\/\/)?www\.[\w.-]+\b/gi, ' ');
  title = title.replace(/\b[\w-]+\.(?:com|org|net|xyz)\b/gi, ' ');

  // 6. Remove audio channel patterns (5.1, 7.1, 2.0, 5 1, 7 1, 2 0)
  title = title.replace(/\b(?:5\.1|7\.1|2\.0|2\.1|5\s+1|7\s+1|2\s+0)\b/gi, '');

  // 7. Remove quality tags
  title = title.replace(/\b(1080p|2160p|720p|480p|4K|UHD|HDR10|HDR|DV|SDR)\b/gi, '');

  // 8. Remove encoding/audio tags, including glued channel layouts the later
  // dot→space pass would otherwise leave behind (e.g. "DDP5.1" → "DDP5 1",
  // "H.264" → "H 264", "DD+ 5 1").
  title = title.replace(/\b(?:x264|x265|h[\s.]?26[45]|HEVC|AVC|VC-?1|AV1)\b/gi, ' ');
  title = title.replace(/\b(?:DDP?\+?|DD\+|E?-?AC-?3|DTS(?:[ .-]?HD)?(?:[ .]?MA)?|TrueHD|Atmos|AAC|FLAC|LPCM|Opus|MP3)(?:[\s.]?\d(?:[\s.]?\d)?)?\b/gi, ' ');

  // 9. Remove source tags
  title = title.replace(/\b(BluRay|Blu-Ray|WEB-DL|WEBRip|WEB|HDTV|BDRip|BRRip|DVDRip|REMUX|REPACK)\b/gi, '');

  // 10. Replace dots and underscores with spaces
  title = title.replace(/[._]/g, ' ');

  // 11. Extract year
  let year = null;
  const yearMatch = title.match(/\((\d{4})\)/);
  if (yearMatch) {
    year = yearMatch[1];
    title = title.replace(yearMatch[0], '');
  } else {
    const standaloneYear = title.match(/\b((?:19|20)\d{2})\b/);
    if (standaloneYear) {
      year = standaloneYear[1];
      title = title.replace(standaloneYear[0], '');
    }
  }

  // 12. Remove common scene descriptors and release groups (case insensitive)
  const descriptors = [
    'extended', 'remastered', 'theatrical', 'directors', 'director\'s', 'cut', 'unrated', 'limited', 'special', 'edition',
    'trilogy', 'duology', 'quadrilogy', 'anthology', 'collection', 'boxset', 'repack', 'proper', 'retail', 'imax',
    'dual', 'dubbed', 'dub', 'subbed', 'sub', 'subs', 'multisubs', 'multi-subs', 'multi', 'lektor', 'pl', 'hindi', 'english',
    'rus', 'eng', '10bit', '8bit', '12xrus', '10audio', 'soundtrack', 'ost', 'bdremux', 'remux', 'web-dl', 'webdl', 'web',
    'bluray', 'bdrip', 'brrip', 'dvdrip', 'hdtv', 'hmax', 'amzn', 'nf', 'netflix', 'dsnp', 'applev', 'atvp', 'itunes',
    'hulu', 'paramount', 'stan', 'crav', 'frds', 'ctrlhd', 'wiki', 'don', 'ebp', 'tayto', 'bhdstudio', 'framestor',
    'epsilon', 'tsrg', 'sqs', 'pignus', 'bone', 'dreamhd', 'starboy', 'protonmovies', 'nine', 'dual-turko', 'turko',
    'glaringblondadderfromsirius', 'rapiro191', 'yts', 'yify', 'rarbg', 'fgt', 'galaxyrg', 'tgx', 'swtyblz', 'psa',
    'qxr', 'tigole', 'silence', 'pahe', 'ganool', 'megapeer', 'rrg', 'vppv', 'axxo', 'kickass', 'tpb', 'eztv', 'etrg'
  ];
  const descRegex = new RegExp(`\\b(${descriptors.join('|')})\\b`, 'gi');
  title = title.replace(descRegex, '');

  // 13. Collapse whitespace and trim
  title = title.replace(/\s+/g, ' ').trim();

  // 13b. Strip low-quality SOURCE tags the earlier passes miss (cam/telesync/
  // screener etc.) plus trailing LANGUAGE/format tags (e.g. "Bring Her Back TS EN",
  // "... MULTI VFF"). Without this a scene release like
  // "Bring.Her.Back.2025.TS.EN-RGB" cleans to "Bring Her Back TS EN" and misses on
  // TMDb. Guarded so it can never blank a legitimate one-word title (Cam, It, Us…):
  // if stripping would empty the title we keep the pre-strip value, and the trailing
  // tags require a preceding space so a bare one-word title is never touched.
  {
    let t2 = title.replace(/\b(?:ts|telesync|telecine|cam|camrip|hdcam|hdts|hqcam|scr|screener|dvdscr|bdscr|r5|r6|ppv|workprint|predvd|pdvd|hdrip|webcap)\b/gi, ' ');
    const trailingTag = /\s+(?:en|fr|de|es|nl|sv|da|fi|pt|ru|jp|kr|cn|hk|gr|th|ar|ja|ko|zh|pl|cz|ro|hu|tr|ua|vff?|vostfr|vo|multi|dual|dubbed|dub|subs?)$/i;
    let prevT;
    do { prevT = t2; t2 = t2.replace(trailingTag, '').trim(); } while (t2 !== prevT && t2);
    t2 = t2.replace(/\s+/g, ' ').trim();
    if (t2) title = t2; // only apply if it didn't nuke the whole title
  }

  // 14. If title starts or ends with a dash, slash, or colon, trim it
  title = title.replace(/^[\s-:/]+|[\s-:/]+$/g, '').trim();

  // 15. Mixed-language extraction:
  // If the title contains both non-ASCII (e.g. Chinese/Russian) and ASCII text,
  // we attempt to extract the English/ASCII part if it is substantial (>= 3 words or 10 chars),
  // as it is much more likely to match on TMDb.
  if (/[^\x00-\x7F]/.test(title)) {
    // Look for ASCII segments with spaces, letters, numbers, and basic punctuation
    const asciiSegments = title.match(/[A-Za-z0-9\s':-]{10,}/g) || [];
    const bestSegment = asciiSegments
      .map(s => s.trim())
      .filter(s => s.split(/\s+/).length >= 2) // must have at least 2 words
      .sort((a, b) => b.length - a.length)[0]; // get the longest one
    
    if (bestSegment) {
      console.log(`[Parser Debug] Extracted ASCII segment: "${bestSegment}" from mixed title: "${title}"`);
      title = bestSegment;
    }
  }

  let artist = null;
  let showName = null;

  if (category === 'Music') {
    const parts = title.split(/\s+-\s+/);
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }
  } else if (category === 'Ebooks' || category === 'Audiobooks') {
    const parts = title.split(/\s+-\s+/);
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }
  } else if (category === 'TV') {
    const tvMatch = title.match(/^(.+?)[\s.]*(?:S\d{1,2}|Season|Series)/i);
    if (tvMatch) {
      showName = tvMatch[1].trim();
    } else {
      showName = title;
    }
  }

  return { cleanTitle: title, year, artist, showName };
}

/**
 * Fetch wrapper with a 5-second timeout via AbortController.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// 6. Metadata Enrichment Endpoint
app.get('/api/metadata', async (req, res) => {
  const { title, category, imdb, tvdb } = req.query;

  if (!title || typeof title !== 'string') {
    return res.json({ status: 'not_found', metadata: null });
  }

  const selectedCategory = category || 'Movies';
  const parsed = parseReleaseTitle(title, selectedCategory);
  const searchTitle = parsed.cleanTitle;
  const cleanTitleLower = searchTitle.toLowerCase();

  // A. Check for exact IMDb ID (either passed or in titleToImdbCache)
  let imdbId = imdb;
  if (!imdbId && titleToImdbCache.has(cleanTitleLower)) {
    imdbId = titleToImdbCache.get(cleanTitleLower);
    console.log(`🌐 Cache Hit: Clean title "${searchTitle}" matches resolved IMDb ID "${imdbId}"`);
  }

  // Define unique cache key
  const cacheKey = imdbId 
    ? `${selectedCategory}::imdb::${imdbId.toLowerCase()}` 
    : `${selectedCategory}::${cleanTitleLower}`;

  console.log(`🏷️  Metadata Request: "${title}" (imdb: ${imdbId || 'none'}) → cleaned: "${searchTitle}" [${selectedCategory}]`);

  // Check cache first
  if (metadataCache.has(cacheKey)) {
    const cached = metadataCache.get(cacheKey);
    let cacheUpdated = false;
    // Backfill OMDb ratings onto a cached entry that predates the feature
    // (or was cached before the user supplied an OMDb key).
    if (cached && cached.status === 'success' && cached.metadata && cached.metadata.imdbId && !cached.metadata.ratings) {
      const omdbKey = resolveOmdbKey(req);
      if (omdbKey) {
        const ratings = await fetchOmdbRatings(cached.metadata.imdbId, omdbKey);
        if (ratings) {
          cached.metadata.ratings = ratings;
          cacheUpdated = true;
          console.log(`⭐ OMDb ratings backfilled onto cached "${cached.metadata.title}"`);
        }
      }
    }
    // (Letterboxd rating is fetched lazily when the detail drawer opens — see
    // /api/letterboxd-reviews — to avoid scraping Letterboxd for every search result.)
    if (cacheUpdated) {
      setMetadataCache(cacheKey, cached);
    }
    console.log('⚡ Metadata cache hit.');
    return res.json(cached);
  }

  try {
    let result;

    const userTmdbKey = req.userTmdbKey || '';

    // B. Query exact IMDb resolution if available
    if (imdbId && (selectedCategory === 'Movies' || selectedCategory === 'TV')) {
      result = await fetchMovieTvMetadataByImdb(imdbId, userTmdbKey);
      if (result && result.status === 'success' && result.metadata) {
        titleToImdbCache.set(cleanTitleLower, imdbId);
      }
    }

    // Fallback to text query if no exact result
    if (!result || result.status !== 'success') {
      if (selectedCategory === 'Movies' || selectedCategory === 'TV') {
        result = await fetchMovieTvMetadata(parsed, selectedCategory, userTmdbKey);
      } else if (selectedCategory === 'Music') {
        result = await fetchMusicMetadata(parsed);
      } else if (selectedCategory === 'Audiobooks') {
        result = await fetchAudiobookMetadata(parsed);
      } else if (selectedCategory === 'Ebooks') {
        result = await fetchEbookMetadata(parsed);
      } else {
        result = { status: 'not_found', metadata: null };
      }
    }

    // Enrich Movie/TV results with OMDb multi-source ratings (IMDb / Rotten Tomatoes / Metacritic).
    if (result && result.status === 'success' && result.metadata && result.metadata.imdbId) {
      const omdbKey = resolveOmdbKey(req);
      if (omdbKey) {
        const ratings = await fetchOmdbRatings(result.metadata.imdbId, omdbKey);
        if (ratings) {
          result.metadata.ratings = ratings;
          console.log(`⭐ OMDb ratings: IMDb ${ratings.imdbRating || '–'} · RT ${ratings.rottenTomatoes || '–'} · MC ${ratings.metacritic || '–'}`);
        }
      }
    }

    // (Letterboxd rating/reviews are fetched lazily from the detail drawer via
    // /api/letterboxd-reviews, so a single movie search no longer triggers a
    // Letterboxd scrape for every result.)

    setMetadataCache(cacheKey, result);
    return res.json(result);
  } catch (err) {
    console.error('❌ Metadata enrichment failed:', err.message);
    return res.json({ status: 'not_found', metadata: null });
  }
});

// Top TMDb user reviews for a title. Uses the same BYOK TMDb auth as /api/metadata.
app.get('/api/reviews', async (req, res) => {
  const { tmdbId, mediaType } = req.query;
  if (!tmdbId || !['movie', 'tv'].includes(mediaType)) {
    return res.status(400).json({ status: 'error', message: 'tmdbId and a valid mediaType (movie|tv) are required.' });
  }
  const tmdbKey = req.userTmdbKey || (sharedTmdbAllowed() && process.env.TMDB_API_KEY ? process.env.TMDB_API_KEY.trim() : '');
  const tmdbReadToken = sharedTmdbAllowed() && process.env.TMDB_READ_TOKEN ? process.env.TMDB_READ_TOKEN.trim() : '';
  const hasApiKey = tmdbKey && tmdbKey !== 'your_tmdb_api_key_here';
  const hasReadToken = tmdbReadToken && tmdbReadToken !== 'your_tmdb_read_access_token_here';
  if (!hasApiKey && !hasReadToken) {
    return res.status(401).json({ status: 'error', message: 'Add your TMDb key in Settings to load reviews.' });
  }
  try {
    const options = {};
    let url = `https://api.themoviedb.org/3/${mediaType}/${encodeURIComponent(tmdbId)}/reviews`;
    if (hasReadToken) {
      options.headers = { 'Authorization': `Bearer ${tmdbReadToken}`, 'Content-Type': 'application/json;charset=utf-8' };
    } else {
      url += `?api_key=${encodeURIComponent(tmdbKey)}`;
    }
    const r = await fetchWithTimeout(url, options, 12000);
    if (!r.ok) throw new Error(`TMDb reviews returned ${r.status}`);
    const data = await r.json();
    const reviews = (data.results || []).slice(0, 8).map(rv => ({
      author: rv.author || rv.author_details?.username || 'Anonymous',
      rating: (rv.author_details && typeof rv.author_details.rating === 'number') ? rv.author_details.rating : null, // 0-10
      content: rv.content || '',
      createdAt: rv.created_at || null,
      url: rv.url || null
    }));
    return res.json({ status: 'success', reviews, total: data.total_results || reviews.length });
  } catch (err) {
    console.error('❌ TMDb reviews fetch failed:', err.message);
    return res.status(502).json({ status: 'error', message: err.message });
  }
});

// Letterboxd reviews endpoint
app.get('/api/letterboxd-reviews', async (req, res) => {
  const { imdbId } = req.query;
  if (!imdbId) {
    return res.status(400).json({ status: 'error', message: 'imdbId is required.' });
  }
  let id = imdbId.toString().trim();
  if (!/^tt\d+$/i.test(id)) id = 'tt' + id.replace(/^tt/i, '');
  if (!/^tt\d+$/i.test(id)) {
    return res.status(400).json({ status: 'error', message: 'Invalid IMDb ID format.' });
  }

  try {
    const url = `https://letterboxd.com/imdb/${id}/`;
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    }, 8000);

    if (!response.ok) throw new Error(`Letterboxd returned status ${response.status}`);
    const html = await response.text();
    // One scrape returns both the aggregate rating and the popular reviews.
    const reviews = parseLetterboxdReviews(html);
    const rating = parseLetterboxdRating(html);

    return res.json({ status: 'success', rating, url: response.url, reviews });
  } catch (err) {
    console.error('❌ Letterboxd reviews fetch failed:', err.message);
    return res.status(502).json({ status: 'error', message: err.message });
  }
});

// ── Category-specific metadata fetchers ──────────────────────────────────────

async function fetchMovieTvMetadata(parsed, category, customTmdbKey) {
  const tmdbKey = customTmdbKey || (sharedTmdbAllowed() && process.env.TMDB_API_KEY ? process.env.TMDB_API_KEY.trim() : '');
  const tmdbReadToken = sharedTmdbAllowed() && process.env.TMDB_READ_TOKEN ? process.env.TMDB_READ_TOKEN.trim() : '';

  const hasApiKey = tmdbKey && tmdbKey !== 'your_tmdb_api_key_here';
  const hasReadToken = tmdbReadToken && tmdbReadToken !== 'your_tmdb_read_access_token_here';

  if (!hasApiKey && !hasReadToken) {
    console.log('ℹ️  TMDB authentication not configured. Returning mock metadata.');
    return {
      status: 'success',
      metadata: {
        poster: null,
        backdrop: null,
        title: parsed.cleanTitle,
        year: parsed.year,
        overview: 'Metadata enrichment requires a TMDb API key (v3) or Read Access Token (v4). Add TMDB_API_KEY or TMDB_READ_TOKEN to your .env file.',
        voteAverage: null,
        genres: [],
        trailer: null,
        cast: []
      }
    };
  }

  try {
    // Setup request headers & query params based on authentication method
    // v4 Bearer Token authentication is preferred if configured
    const options = {};
    if (hasReadToken) {
      options.headers = {
        'Authorization': `Bearer ${tmdbReadToken}`,
        'Content-Type': 'application/json;charset=utf-8'
      };
      console.log(`ℹ️  Using TMDb v4 API Read Access Token for auth.`);
    } else {
      console.log(`ℹ️  Using TMDb v3 API Key for auth.`);
    }

    // Search TMDb
    let searchUrl;
    if (category === 'Movies') {
      if (hasReadToken) {
        searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(parsed.cleanTitle)}`;
      } else {
        searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=${encodeURIComponent(parsed.cleanTitle)}`;
      }
      if (parsed.year) searchUrl += `&year=${parsed.year}`;
    } else {
      const query = parsed.showName || parsed.cleanTitle;
      if (hasReadToken) {
        searchUrl = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(query)}`;
      } else {
        searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${tmdbKey}&query=${encodeURIComponent(query)}`;
      }
    }

    const searchRes = await fetchWithTimeout(searchUrl, options);
    if (!searchRes.ok) throw new Error(`TMDb search returned ${searchRes.status}`);

    const searchData = await searchRes.json();
    const results = searchData.results || [];

    if (results.length === 0) {
      console.log('ℹ️  TMDb returned no results.');
      return { status: 'not_found', metadata: null };
    }

    const firstResult = results[0];
    const mediaType = category === 'Movies' ? 'movie' : 'tv';
    
    let detailUrl;
    if (hasReadToken) {
      detailUrl = `https://api.themoviedb.org/3/${mediaType}/${firstResult.id}?append_to_response=videos,credits,release_dates,content_ratings,external_ids`;
    } else {
      detailUrl = `https://api.themoviedb.org/3/${mediaType}/${firstResult.id}?api_key=${tmdbKey}&append_to_response=videos,credits,release_dates,content_ratings,external_ids`;
    }

    const detailRes = await fetchWithTimeout(detailUrl, options);
    if (!detailRes.ok) throw new Error(`TMDb detail returned ${detailRes.status}`);

    const detail = await detailRes.json();

    // Extract trailer (YouTube, type === 'Trailer')
    let trailer = null;
    if (detail.videos && detail.videos.results) {
      const trailerResult = detail.videos.results.find(
        v => v.type === 'Trailer' && v.site === 'YouTube'
      );
      if (trailerResult) trailer = trailerResult.key;
    }

    // Extract first 5 cast members
    let cast = [];
    if (detail.credits && detail.credits.cast) {
      cast = detail.credits.cast.slice(0, 5).map(c => ({
        name: c.name,
        character: c.character,
        profilePath: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null
      }));
    }

    let certification = '';
    if (detail.release_dates && detail.release_dates.results) {
      const usRelease = detail.release_dates.results.find(r => r.iso_3166_1 === 'US');
      if (usRelease && usRelease.release_dates) {
        const certObj = usRelease.release_dates.find(rd => rd.certification);
        if (certObj) certification = certObj.certification;
      }
      if (!certification) {
        for (const res of detail.release_dates.results) {
          if (res.release_dates) {
            const certObj = res.release_dates.find(rd => rd.certification);
            if (certObj) {
              certification = certObj.certification;
              break;
            }
          }
        }
      }
    }
    if (detail.content_ratings && detail.content_ratings.results) {
      const usRating = detail.content_ratings.results.find(r => r.iso_3166_1 === 'US');
      if (usRating) {
        certification = usRating.rating;
      } else {
        const anyRating = detail.content_ratings.results.find(r => r.rating);
        if (anyRating) certification = anyRating.rating;
      }
    }

    const metadata = {
      poster: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
      backdrop: detail.backdrop_path ? `https://image.tmdb.org/t/p/w1280${detail.backdrop_path}` : null,
      title: detail.title || detail.name || parsed.cleanTitle,
      year: parsed.year || (detail.release_date || detail.first_air_date || '').substring(0, 4) || null,
      overview: detail.overview || null,
      voteAverage: detail.vote_average || null,
      genres: (detail.genres || []).map(g => g.name),
      certification: certification || 'Unrated',
      trailer,
      cast,
      imdbId: detail.external_ids?.imdb_id || detail.imdb_id || null,
      tmdbId: detail.id || null,
      mediaType
    };

    console.log(`✅ TMDb metadata found: "${metadata.title}" [Rating: ${metadata.certification}]`);
    return { status: 'success', metadata };
  } catch (err) {
    console.error('❌ TMDb lookup failed:', err.message);
    return { status: 'not_found', metadata: null };
  }
}

async function fetchMovieTvMetadataByImdb(imdbId, customTmdbKey) {
  const tmdbKey = customTmdbKey || (sharedTmdbAllowed() && process.env.TMDB_API_KEY ? process.env.TMDB_API_KEY.trim() : '');
  const tmdbReadToken = sharedTmdbAllowed() && process.env.TMDB_READ_TOKEN ? process.env.TMDB_READ_TOKEN.trim() : '';

  const hasApiKey = tmdbKey && tmdbKey !== 'your_tmdb_api_key_here';
  const hasReadToken = tmdbReadToken && tmdbReadToken !== 'your_tmdb_read_access_token_here';

  if (!hasApiKey && !hasReadToken) {
    console.log('ℹ️  TMDB credentials not configured for IMDb exact lookup.');
    return { status: 'not_found', metadata: null };
  }

  let formattedImdb = imdbId.toString().trim();
  if (!formattedImdb.startsWith('tt')) {
    formattedImdb = 'tt' + formattedImdb;
  }

  try {
    const options = {};
    if (hasReadToken) {
      options.headers = {
        'Authorization': `Bearer ${tmdbReadToken}`,
        'Content-Type': 'application/json;charset=utf-8'
      };
    }

    let findUrl;
    if (hasReadToken) {
      findUrl = `https://api.themoviedb.org/3/find/${formattedImdb}?external_source=imdb_id`;
    } else {
      findUrl = `https://api.themoviedb.org/3/find/${formattedImdb}?api_key=${tmdbKey}&external_source=imdb_id`;
    }

    console.log(`🌐 Querying TMDb by IMDb ID: ${formattedImdb}`);
    const findRes = await fetchWithTimeout(findUrl, options);
    if (!findRes.ok) throw new Error(`TMDb find returned status ${findRes.status}`);

    const findData = await findRes.json();
    const movieResults = findData.movie_results || [];
    const tvResults = findData.tv_results || [];

    let firstResult = null;
    let mediaType = '';

    if (movieResults.length > 0) {
      firstResult = movieResults[0];
      mediaType = 'movie';
    } else if (tvResults.length > 0) {
      firstResult = tvResults[0];
      mediaType = 'tv';
    }

    if (!firstResult) {
      console.log(`ℹ️  No exact TMDb match found for IMDb ID: ${formattedImdb}`);
      return { status: 'not_found', metadata: null };
    }

    let detailUrl;
    if (hasReadToken) {
      detailUrl = `https://api.themoviedb.org/3/${mediaType}/${firstResult.id}?append_to_response=videos,credits,release_dates,content_ratings`;
    } else {
      detailUrl = `https://api.themoviedb.org/3/${mediaType}/${firstResult.id}?api_key=${tmdbKey}&append_to_response=videos,credits,release_dates,content_ratings`;
    }

    const detailRes = await fetchWithTimeout(detailUrl, options);
    if (!detailRes.ok) throw new Error(`TMDb detail lookup failed for ID ${firstResult.id}`);

    const detail = await detailRes.json();

    let trailer = null;
    if (detail.videos && detail.videos.results) {
      const trailerResult = detail.videos.results.find(
        v => v.type === 'Trailer' && v.site === 'YouTube'
      );
      if (trailerResult) trailer = trailerResult.key;
    }

    let cast = [];
    if (detail.credits && detail.credits.cast) {
      cast = detail.credits.cast.slice(0, 5).map(c => ({
        name: c.name,
        character: c.character,
        profilePath: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null
      }));
    }

    let certification = '';
    if (detail.release_dates && detail.release_dates.results) {
      const usRelease = detail.release_dates.results.find(r => r.iso_3166_1 === 'US');
      if (usRelease && usRelease.release_dates) {
        const certObj = usRelease.release_dates.find(rd => rd.certification);
        if (certObj) certification = certObj.certification;
      }
      if (!certification) {
        for (const res of detail.release_dates.results) {
          if (res.release_dates) {
            const certObj = res.release_dates.find(rd => rd.certification);
            if (certObj) {
              certification = certObj.certification;
              break;
            }
          }
        }
      }
    }
    if (detail.content_ratings && detail.content_ratings.results) {
      const usRating = detail.content_ratings.results.find(r => r.iso_3166_1 === 'US');
      if (usRating) {
        certification = usRating.rating;
      } else {
        const anyRating = detail.content_ratings.results.find(r => r.rating);
        if (anyRating) certification = anyRating.rating;
      }
    }

    const metadata = {
      poster: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
      backdrop: detail.backdrop_path ? `https://image.tmdb.org/t/p/w1280${detail.backdrop_path}` : null,
      title: detail.title || detail.name,
      year: (detail.release_date || detail.first_air_date || '').substring(0, 4) || null,
      overview: detail.overview || null,
      voteAverage: detail.vote_average || null,
      genres: (detail.genres || []).map(g => g.name),
      certification: certification || 'Unrated',
      trailer,
      cast,
      imdbId: formattedImdb,
      tmdbId: detail.id || null,
      mediaType
    };

    console.log(`✅ TMDb metadata found via exact IMDb match: "${metadata.title}" [Rating: ${metadata.certification}]`);
    return { status: 'success', metadata };
  } catch (err) {
    console.error('❌ TMDb IMDb lookup failed:', err.message);
    return { status: 'not_found', metadata: null };
  }
}

async function fetchWikipediaDescription(title, artist) {
  try {
    const query = `${title} ${artist || ''} album`;
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&origin=*`;
    const searchRes = await fetchWithTimeout(searchUrl);
    if (!searchRes.ok) return null;
    
    const searchData = await searchRes.json();
    const searchResults = searchData.query?.search || [];
    if (searchResults.length === 0) return null;
    
    const pageTitle = searchResults[0].title;
    const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(pageTitle)}&redirects=1&origin=*`;
    const extractRes = await fetchWithTimeout(extractUrl);
    if (!extractRes.ok) return null;
    
    const extractData = await extractRes.json();
    const pages = extractData.query?.pages || {};
    const pageKeys = Object.keys(pages);
    if (pageKeys.length === 0) return null;
    
    return pages[pageKeys[0]].extract || null;
  } catch (err) {
    console.error('ℹ️ Wikipedia description search bypassed or failed:', err.message);
    return null;
  }
}

async function fetchMusicMetadata(parsed) {
  try {
    const searchTerm = parsed.artist
      ? `${parsed.artist} ${parsed.cleanTitle}`
      : parsed.cleanTitle;

    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=music&entity=album&limit=3`;
    const itunesRes = await fetchWithTimeout(itunesUrl);

    if (!itunesRes.ok) throw new Error(`iTunes API returned ${itunesRes.status}`);

    const itunesData = await itunesRes.json();
    const results = itunesData.results || [];

    if (results.length === 0) {
      console.log('ℹ️  iTunes returned no music results.');
      return { status: 'not_found', metadata: null };
    }

    const first = results[0];
    const artwork = first.artworkUrl100
      ? first.artworkUrl100.replace('100x100', '600x600')
      : null;

    // Fetch tracklist if collectionId exists
    let tracks = [];
    if (first.collectionId) {
      try {
        const lookupUrl = `https://itunes.apple.com/lookup?id=${first.collectionId}&entity=song`;
        const lookupRes = await fetchWithTimeout(lookupUrl);
        if (lookupRes.ok) {
          const lookupData = await lookupRes.json();
          const lookupResults = lookupData.results || [];
          tracks = lookupResults
            .filter(item => item.wrapperType === 'track' && item.kind === 'song')
            .sort((a, b) => {
              const discDiff = (a.discNumber || 1) - (b.discNumber || 1);
              if (discDiff !== 0) return discDiff;
              return (a.trackNumber || 0) - (b.trackNumber || 0);
            })
            .map(item => ({
              name: item.trackName,
              number: item.trackNumber,
              durationMs: item.trackTimeMillis,
              previewUrl: item.previewUrl || null
            }));
        }
      } catch (lookupErr) {
        console.error('❌ iTunes album tracks lookup failed:', lookupErr.message);
      }
    }

    let albumDescription = first.description || null;
    if (albumDescription) {
      albumDescription = albumDescription.replace(/<\/?[89a-zA-Z]+(>|$)/g, "").replace(/<\/?[^>]+(>|$)/g, "");
    } else {
      // Fallback to Wikipedia description if iTunes doesn't provide one
      const albumTitle = first.collectionName || parsed.cleanTitle;
      const artistName = first.artistName || parsed.artist || '';
      console.log(`ℹ️ iTunes returned no description for album "${albumTitle}". Trying Wikipedia...`);
      albumDescription = await fetchWikipediaDescription(albumTitle, artistName);
    }

    const metadata = {
      poster: artwork,
      title: first.collectionName || parsed.cleanTitle,
      artist: first.artistName || parsed.artist || null,
      year: parsed.year || (first.releaseDate ? first.releaseDate.substring(0, 4) : null),
      trackCount: first.trackCount || null,
      genre: first.primaryGenreName || null,
      iTunesUrl: first.collectionViewUrl || null,
      overview: albumDescription,
      tracks: tracks.length > 0 ? tracks : null
    };

    console.log(`✅ iTunes metadata found: "${metadata.title}" by ${metadata.artist} (${tracks.length} tracks fetched, description: ${albumDescription ? 'yes' : 'no'})`);
    return { status: 'success', metadata };
  } catch (err) {
    console.error('❌ iTunes music lookup failed:', err.message);
    return { status: 'not_found', metadata: null };
  }
}

async function fetchAudiobookMetadata(parsed) {
  try {
    const searchTerm = parsed.artist
      ? `${parsed.artist} ${parsed.cleanTitle}`
      : parsed.cleanTitle;

    // Search iTunes first to get audiobook-specific details (narrator, audio link, artwork)
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=audiobook&limit=3`;
    const itunesRes = await fetchWithTimeout(itunesUrl);

    if (!itunesRes.ok) throw new Error(`iTunes API returned ${itunesRes.status}`);

    const itunesData = await itunesRes.json();
    const results = itunesData.results || [];

    if (results.length === 0) {
      console.log('ℹ️  iTunes returned no audiobook results.');
      return { status: 'not_found', metadata: null };
    }

    const first = results[0];
    const artwork = first.artworkUrl100
      ? first.artworkUrl100.replace('100x100', '600x600')
      : null;

    // Now query Google Books to fetch the description (overview) for this audiobook title
    let bookDescription = first.description || null;
    let googleBooksUrl = null;

    try {
      const gbooksSearchQuery = first.collectionName || parsed.cleanTitle;
      const gbooksRes = await fetchWithTimeout(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(gbooksSearchQuery)}&maxResults=3`);
      if (gbooksRes.ok) {
        const gbJson = await gbooksRes.json();
        const gbItems = gbJson.items || [];
        if (gbItems.length > 0 && gbItems[0].volumeInfo) {
          const gbData = gbItems[0].volumeInfo;
          // Prefer detailed description from Google Books if iTunes has a short/missing description
          if (gbData.description) {
            bookDescription = gbData.description;
          }
          googleBooksUrl = gbData.infoLink || null;
        }
      }
    } catch (gbooksErr) {
      console.log('ℹ️ Google Books description search bypassed or failed:', gbooksErr.message);
    }

    // Clean up HTML tags from description if present
    if (bookDescription) {
      bookDescription = bookDescription.replace(/<\/?[^>]+(>|$)/g, "");
    }

    const cleanTitle = first.collectionName || parsed.cleanTitle;
    const authorName = first.artistName || parsed.artist || '';
    const goodreadsUrl = `https://www.goodreads.com/search?q=${encodeURIComponent(cleanTitle + ' ' + authorName)}`;

    const metadata = {
      poster: artwork,
      title: cleanTitle,
      artist: first.artistName || parsed.artist || null,
      year: parsed.year || (first.releaseDate ? first.releaseDate.substring(0, 4) : null),
      trackCount: first.trackCount || null,
      genre: first.primaryGenreName || null,
      iTunesUrl: first.collectionViewUrl || null,
      overview: bookDescription || 'Description not found.',
      goodreadsUrl,
      googleBooksUrl
    };

    console.log(`✅ iTunes audiobook metadata + book description found: "${metadata.title}" by ${metadata.artist}`);
    return { status: 'success', metadata };
  } catch (err) {
    console.error('❌ iTunes audiobook lookup failed:', err.message);
    return { status: 'not_found', metadata: null };
  }
}

async function fetchEbookMetadata(parsed) {
  try {
    const searchTerm = parsed.artist
      ? `${parsed.artist} ${parsed.cleanTitle}`
      : parsed.cleanTitle;

    // Query Open Library and Google Books in parallel
    const [openLibRes, googleBooksRes] = await Promise.allSettled([
      fetchWithTimeout(`https://openlibrary.org/search.json?q=${encodeURIComponent(searchTerm)}&limit=3`),
      fetchWithTimeout(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(searchTerm)}&maxResults=3`)
    ]);

    // ── Open Library ──
    let olData = null;
    if (openLibRes.status === 'fulfilled' && openLibRes.value.ok) {
      try {
        const olJson = await openLibRes.value.json();
        const olDocs = olJson.docs || [];
        if (olDocs.length > 0) olData = olDocs[0];
      } catch { /* ignore parse errors */ }
    }

    // ── Google Books ──
    let gbData = null;
    if (googleBooksRes.status === 'fulfilled' && googleBooksRes.value.ok) {
      try {
        const gbJson = await googleBooksRes.value.json();
        const gbItems = gbJson.items || [];
        if (gbItems.length > 0) gbData = gbItems[0].volumeInfo || null;
      } catch { /* ignore parse errors */ }
    }

    if (!olData && !gbData) {
      console.log('ℹ️  No ebook results from Open Library or Google Books.');
      return { status: 'not_found', metadata: null };
    }

    // Build poster: prefer Open Library cover
    let poster = null;
    if (olData && olData.cover_i) {
      poster = `https://covers.openlibrary.org/b/id/${olData.cover_i}-L.jpg`;
    } else if (gbData && gbData.imageLinks && gbData.imageLinks.thumbnail) {
      poster = gbData.imageLinks.thumbnail.replace('http://', 'https://');
    }

    const mergedTitle = (olData && olData.title) || (gbData && gbData.title) || parsed.cleanTitle;
    const author = (olData && olData.author_name && olData.author_name[0])
      || (gbData && gbData.authors && gbData.authors[0])
      || parsed.artist
      || null;
    const year = parsed.year
      || (olData && olData.first_publish_year ? String(olData.first_publish_year) : null)
      || (gbData && gbData.publishedDate ? gbData.publishedDate.substring(0, 4) : null);

    // ── Description: try Google Books first, then Open Library works API ──
    let description = (gbData && gbData.description) || null;

    // Strip HTML tags from Google Books descriptions
    if (description) {
      description = description.replace(/<\/?[^>]+(>|$)/g, "");
    }

    // If no description from Google Books, try Open Library works API
    if (!description && olData && olData.key) {
      try {
        // olData.key looks like "/works/OL12345W" — fetch the works detail for description
        const worksUrl = `https://openlibrary.org${olData.key}.json`;
        const worksRes = await fetchWithTimeout(worksUrl);
        if (worksRes.ok) {
          const worksJson = await worksRes.json();
          if (worksJson.description) {
            // description can be a string or { type: "/type/text", value: "..." }
            description = typeof worksJson.description === 'string'
              ? worksJson.description
              : worksJson.description.value || null;
          }
        }
      } catch (olDescErr) {
        console.log('ℹ️  Open Library works description fetch failed:', olDescErr.message);
      }
    }

    const pageCount = (olData && olData.number_of_pages_median) || (gbData && gbData.pageCount) || null;
    const rating = (gbData && gbData.averageRating) || null;
    const ratingsCount = (gbData && gbData.ratingsCount) || null;

    let subjects = [];
    if (olData && olData.subject && Array.isArray(olData.subject)) {
      subjects = olData.subject.slice(0, 3);
    } else if (gbData && gbData.categories) {
      subjects = gbData.categories.slice(0, 3);
    }

    const googleBooksUrl = (gbData && gbData.infoLink) || null;
    const goodreadsUrl = `https://www.goodreads.com/search?q=${encodeURIComponent(mergedTitle + (author ? ' ' + author : ''))}`;

    const metadata = {
      poster,
      title: mergedTitle,
      author,
      year,
      overview: description || null,
      pageCount,
      rating,
      ratingsCount,
      subjects,
      goodreadsUrl,
      googleBooksUrl
    };

    console.log(`✅ Ebook metadata found: "${metadata.title}" by ${metadata.author}`);
    return { status: 'success', metadata };
  } catch (err) {
    console.error('❌ Ebook metadata lookup failed:', err.message);
    return { status: 'not_found', metadata: null };
  }
}

// ── Premiumize Cloud Storage Manager Endpoints ───────────────────────────

// A. List Cloud Folder
app.get('/api/cloud/list', async (req, res) => {
  const { id } = req.query;
  const premiumizeApiKey = resolvePremiumizeKey(req);
  if (!premiumizeApiKey) return res.status(401).json({ status: 'error', code: 'NO_PM_KEY', message: 'Add your Premiumize API key in Settings to use this feature.' });

  if (!premiumizeApiKey || premiumizeApiKey === 'your_premiumize_api_key_here') {
    return res.status(401).json({ error: 'Premiumize API Key not configured.' });
  }

  try {
    const listUrl = new URL('https://www.premiumize.me/api/folder/list');
    if (id) listUrl.searchParams.append('id', id);
    listUrl.searchParams.append('includebreadcrumbs', 'true');

    console.log(`☁️  Listing Cloud Folder ID: ${id || 'root'}`);

    const listResponse = await fetch(listUrl.toString(), {
      headers: { 'Authorization': `Bearer ${premiumizeApiKey}` }
    });

    if (!listResponse.ok) {
      throw new Error(`Premiumize returned status: ${listResponse.status}`);
    }

    const data = await listResponse.json();
    return res.json(data);
  } catch (err) {
    console.error('❌ Failed to list Premiumize folder:', err);
    return res.status(500).json({ error: err.message });
  }
});

// B. Rename Item (File or Folder)
app.post('/api/cloud/rename', async (req, res) => {
  const { id, type, name } = req.body;
  const premiumizeApiKey = resolvePremiumizeKey(req);
  if (!premiumizeApiKey) return res.status(401).json({ status: 'error', code: 'NO_PM_KEY', message: 'Add your Premiumize API key in Settings to use this feature.' });

  if (!premiumizeApiKey || premiumizeApiKey === 'your_premiumize_api_key_here') {
    return res.status(401).json({ error: 'Premiumize API Key not configured.' });
  }

  if (!id || !type || !name) {
    return res.status(400).json({ error: 'Missing parameters: id, type, and name are required.' });
  }

  try {
    const apiPath = type === 'folder' ? 'folder/rename' : 'item/rename';
    const params = new URLSearchParams();
    params.append('id', id);
    params.append('name', name);

    console.log(`☁️  Renaming Cloud ${type} ID: ${id} to "${name}"`);

    const renameResponse = await fetch(`https://www.premiumize.me/api/${apiPath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${premiumizeApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!renameResponse.ok) {
      throw new Error(`Premiumize returned status: ${renameResponse.status}`);
    }

    const data = await renameResponse.json();
    return res.json(data);
  } catch (err) {
    console.error(`❌ Failed to rename cloud ${type}:`, err);
    return res.status(500).json({ error: err.message });
  }
});

// C. Delete Item (File or Folder)
app.post('/api/cloud/delete', async (req, res) => {
  const { id, type } = req.body;
  const premiumizeApiKey = resolvePremiumizeKey(req);
  if (!premiumizeApiKey) return res.status(401).json({ status: 'error', code: 'NO_PM_KEY', message: 'Add your Premiumize API key in Settings to use this feature.' });

  if (!premiumizeApiKey || premiumizeApiKey === 'your_premiumize_api_key_here') {
    return res.status(401).json({ error: 'Premiumize API Key not configured.' });
  }

  if (!id || !type) {
    return res.status(400).json({ error: 'Missing parameters: id and type are required.' });
  }

  try {
    const apiPath = type === 'folder' ? 'folder/delete' : 'item/delete';
    const params = new URLSearchParams();
    params.append('id', id);

    console.log(`☁️  Deleting Cloud ${type} ID: ${id}`);

    const deleteResponse = await fetch(`https://www.premiumize.me/api/${apiPath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${premiumizeApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!deleteResponse.ok) {
      throw new Error(`Premiumize returned status: ${deleteResponse.status}`);
    }

    const data = await deleteResponse.json();
    return res.json(data);
  } catch (err) {
    console.error(`❌ Failed to delete cloud ${type}:`, err);
    return res.status(500).json({ error: err.message });
  }
});

// D. Get Account Info (Points / Storage Quota)
app.get('/api/account/info', async (req, res) => {
  const premiumizeApiKey = resolvePremiumizeKey(req);
  if (!premiumizeApiKey) return res.status(401).json({ status: 'error', code: 'NO_PM_KEY', message: 'Add your Premiumize API key in Settings to use this feature.' });

  if (!premiumizeApiKey || premiumizeApiKey === 'your_premiumize_api_key_here') {
    // Return dummy data in developer mode so it doesn't crash
    return res.json({
      status: 'success',
      customer_id: 'DevMockUser',
      premium_until: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days
      limit_used: 0.35
    });
  }

  try {
    const response = await fetch('https://www.premiumize.me/api/account/info', {
      headers: {
        'Authorization': `Bearer ${premiumizeApiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Premiumize returned status: ${response.status}`);
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('❌ Failed to fetch Premiumize account info:', err);
    return res.status(500).json({ error: err.message });
  }
});

// D-bis. Validate a user's Jackett URL + API key (lightweight caps query, no search).
// Returns { status: 'success' | 'error', message } with HTTP 200 for a rejected key
// so the client can tell "invalid key" apart from a network failure.
app.get('/api/jackett/test', async (req, res) => {
  const jackettUrl = (req.userJackettUrl || (envKeysAllowed() ? process.env.JACKETT_URL : '') || '').replace(/\/+$/, '');
  const jackettApiKey = req.userJackettKey || (envKeysAllowed() ? process.env.JACKETT_API_KEY : '');
  if (!jackettUrl || !jackettApiKey) {
    return res.status(400).json({ status: 'error', message: 'Enter both a Jackett URL and API key first.' });
  }
  try {
    const capsUrl = `${jackettUrl}/api/v2.0/indexers/all/results/torznab/api?apikey=${encodeURIComponent(jackettApiKey)}&t=caps`;
    const r = await fetchWithTimeout(capsUrl, { headers: { 'Accept': 'application/xml' } }, 10000);
    const text = await r.text();
    if (r.ok && /<caps/i.test(text)) {
      return res.json({ status: 'success', message: 'Jackett reachable — key accepted.' });
    }
    if (r.status === 401 || /unauthor/i.test(text)) {
      return res.json({ status: 'error', message: 'Jackett rejected the API key.' });
    }
    return res.json({ status: 'error', message: `Jackett responded with status ${r.status}.` });
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'Jackett did not respond (timed out).' : `Could not reach Jackett (${err.message}).`;
    return res.json({ status: 'error', message: reason });
  }
});

// D-ter. Validate a user's TMDb key — v3 api_key, or v4 read access token (JWT).
app.get('/api/tmdb/test', async (req, res) => {
  const key = req.userTmdbKey || '';
  if (!key) return res.status(400).json({ status: 'error', message: 'Enter a TMDb key first.' });
  try {
    const r = key.startsWith('eyJ')
      ? await fetchWithTimeout('https://api.themoviedb.org/3/authentication', { headers: { 'Authorization': `Bearer ${key}`, 'Accept': 'application/json' } }, 10000)
      : await fetchWithTimeout(`https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(key)}`, { headers: { 'Accept': 'application/json' } }, 10000);
    if (r.ok) return res.json({ status: 'success', message: 'TMDb key is valid.' });
    return res.json({ status: 'error', message: 'TMDb rejected the key.' });
  } catch (err) {
    return res.json({ status: 'error', message: `Could not reach TMDb (${err.message}).` });
  }
});

// E. Get Active Transfers List (Real-Time Queue Monitor)
app.get('/api/transfers', async (req, res) => {
  const premiumizeApiKey = resolvePremiumizeKey(req);
  if (!premiumizeApiKey) return res.status(401).json({ status: 'error', code: 'NO_PM_KEY', message: 'Add your Premiumize API key in Settings to use this feature.' });

  if (!premiumizeApiKey || premiumizeApiKey === 'your_premiumize_api_key_here') {
    // Return dummy transfers in developer mode
    return res.json({
      status: 'success',
      transfers: [
        { id: 'mock1', name: 'Sega.Genesis.Complete.ROM.Pack.zip', status: 'running', progress: 0.65, message: 'Downloading - 8.4 MB/s' },
        { id: 'mock2', name: 'Atari.8bit.Computers.2000.ROMS.zip', status: 'finished', progress: 1.0, message: 'Finished' },
        { id: 'mock3', name: 'Cakewalk.Sonar.Platinum.v22.VST.zip', status: 'queued', progress: 0.0, message: 'Waiting in queue' }
      ]
    });
  }

  try {
    const response = await fetch('https://www.premiumize.me/api/transfer/list', {
      headers: {
        'Authorization': `Bearer ${premiumizeApiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Premiumize returned status: ${response.status}`);
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('❌ Failed to fetch Premiumize transfers:', err);
    return res.status(500).json({ error: err.message });
  }
});

// F. Delete Transfer (Cancel Active Download)
app.post('/api/transfers/delete', async (req, res) => {
  const { id } = req.body;
  const premiumizeApiKey = resolvePremiumizeKey(req);
  if (!premiumizeApiKey) return res.status(401).json({ status: 'error', code: 'NO_PM_KEY', message: 'Add your Premiumize API key in Settings to use this feature.' });

  if (!premiumizeApiKey || premiumizeApiKey === 'your_premiumize_api_key_here') {
    return res.json({ status: 'success', message: 'Mock transfer deleted.' });
  }

  if (!id) {
    return res.status(400).json({ error: 'Missing parameter: id is required.' });
  }

  try {
    const params = new URLSearchParams();
    params.append('id', id);

    const response = await fetch('https://www.premiumize.me/api/transfer/delete', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${premiumizeApiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!response.ok) {
      throw new Error(`Premiumize returned status: ${response.status}`);
    }

    const data = await deleteResponse.json();
    return res.json(data);
  } catch (err) {
    console.error('❌ Failed to delete Premiumize transfer:', err);
    return res.status(500).json({ error: err.message });
  }
});

// G. AI Assistant Integration (Proxy for premiumize.ai)


app.get('/api/ai/models', async (req, res) => {
  // Prefer the Authorization header; the query-param form is a deprecated fallback
  // (query strings leak into access logs / browser history).
  const rawToken = req.headers.authorization || req.query.token;
  const token = sanitizeAiToken(rawToken);

  if (!token) {
    return res.status(400).json({ error: 'Missing parameter: token is required.' });
  }

  try {
    const response = await fetch('https://premiumize.ai/api/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Cookie': `token=${token}`
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Premiumize AI returned status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('❌ Failed to fetch Premiumize AI models:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  const { messages, model, token: rawToken } = req.body;
  const token = sanitizeAiToken(rawToken);

  if (!token) {
    return res.status(400).json({ error: 'Missing parameter: token is required.' });
  }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Missing parameter: messages array is required.' });
  }

  try {
    const response = await fetch('https://premiumize.ai/api/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Cookie': `token=${token}`
      },
      body: JSON.stringify({
        model: model || 'gpt-5.4',
        messages: messages,
        stream: false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Premiumize AI returned status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('❌ Failed to execute Premiumize AI chat:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Serve static frontend assets in production
const frontendDistPath = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  // Catch-all route to redirect non-API routes to React's index.html
  app.get('*', (req, res, next) => {
    // Exclude /api routes from catch-all to prevent loops
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
  console.log(`ℹ️  Serving static frontend assets from: ${frontendDistPath}`);
} else {
  console.log('⚠️  Frontend static assets directory not found. Serving API routes only.');
}

// Start listening
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🟢 Premio Express server running on http://0.0.0.0:${PORT}`);
});

