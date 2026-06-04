import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Readable } from 'stream';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import AdmZip from 'adm-zip';
import { createExtractorFromFile } from 'node-unrar-js';

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

// Middlewares
app.use(cors());
app.use(express.json());

// Header extraction middleware to support stateless webapp deployments
app.use((req, res, next) => {
  req.userPmKey = (req.headers['x-premiumize-key'] || '').trim();
  req.userTmdbKey = (req.headers['x-tmdb-key'] || '').trim();
  req.userJackettUrl = (req.headers['x-jackett-url'] || '').trim();
  req.userJackettKey = (req.headers['x-jackett-key'] || '').trim();

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

// Helper: Resolve Premiumize Key prioritizing user settings header
const resolvePremiumizeKey = (req) => {
  if (req.userPmKey) return req.userPmKey;
  return process.env.PREMIUMIZE_API_KEY ? process.env.PREMIUMIZE_API_KEY.trim() : '';
};

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

      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const nzbUrl = `${proto}://${host}/api/imported-nzb/${importId}`;

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

  const premiumizeApiKey = resolvePremiumizeKey(req);
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

// 1. Search Endpoint
app.get('/api/search', async (req, res) => {
  const { q, category } = req.query;
  
  if (!q || typeof q !== 'string') {
    return res.json([]);
  }

  const selectedCategory = category || 'Movies';
  const torznabCategoryCodes = CATEGORY_MAP[selectedCategory] || [2000];

  console.log(`🔍 Search Request: "${q}" in Category "${selectedCategory}" (Torznab Codes: ${torznabCategoryCodes.join(', ')})`);

  let rawResults = [];

  // A. Check if Jackett API key is configured. If not, generate high-quality mock data
  const jackettApiKey = req.userJackettKey || process.env.JACKETT_API_KEY;
  const jackettUrl = req.userJackettUrl || process.env.JACKETT_URL || 'http://localhost:9117';

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
      
      const jackettResponse = await fetch(searchUrl.toString(), {
        headers: { 'Accept': 'application/json' }
      });

      if (!jackettResponse.ok) {
        throw new Error(`Jackett replied with status: ${jackettResponse.status}`);
      }

      const jackettData = await jackettResponse.json();
      rawResults = jackettData.Results || [];
      console.log(`✅ Jackett returned ${rawResults.length} raw results.`);
    } catch (err) {
      console.error('❌ Jackett search failed:', err.message);
      // Fall back to mock data so the app doesn't crash
      console.log('ℹ️  Falling back to mock results due to error.');
      rawResults = generateMockResults(q, selectedCategory);
    }
  }

  // B. Process and map torrent data
  const processedResults = rawResults.map(item => {
    const magnet = item.MagnetUri || (item.Link && item.Link.startsWith('magnet:') ? item.Link : null);
    const infoHash = magnet ? extractInfoHash(magnet) : (item.InfoHash || null);
    return {
      title: item.Title || 'Unknown Title',
      size: Number(item.Size) || 0,
      seeders: Number(item.Seeders) || 0,
      peers: Number(item.Peers) || 0,
      magnet: magnet,
      torrentFile: item.Link && !item.Link.startsWith('magnet:') ? item.Link : null,
      infoHash: infoHash,
      tracker: item.Tracker || 'Unknown Tracker',
      publishDate: item.PublishDate || null,
      category: selectedCategory,
      cached: false // default
    };
  });

  // Filter items that actually have hashes to query Premiumize Cache
  const itemsWithHash = processedResults.filter(item => item.infoHash);

  if (itemsWithHash.length === 0) {
    return res.json(processedResults);
  }

  const premiumizeApiKey = resolvePremiumizeKey(req);

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
          if (cacheInfo.filename) item.title = cacheInfo.filename; // Use Premiumize cached filename if cleaner
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
    const envIndexers = process.env.USENET_INDEXERS;
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

    const nzbgeekApiKey = process.env.NZBGEEK_API_KEY;
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
        const searchUrl = `${idx.url}?t=search&apikey=${idx.key}&q=${encodeURIComponent(q)}&cat=${newznabCat}&o=json`;
        console.log(`🌐 Aggregator: Querying indexer "${idx.name}": ${idx.url}?cat=${newznabCat}...`);

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
      if (!uniqueItemsMap.has(cleanTitle)) {
        uniqueItemsMap.set(cleanTitle, item);
      } else {
        const existing = uniqueItemsMap.get(cleanTitle);
        const existingName = existing._indexerName || '';
        const currentName = item._indexerName || '';
        if (currentName && !existingName.split(', ').includes(currentName)) {
          existing._indexerName = `${existingName}, ${currentName}`;
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
      indexer: item._indexerName || 'Usenet'
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

// 2. Download/Transfer Endpoint
app.post('/api/download', async (req, res) => {
  const { magnet } = req.body;

  if (!magnet) {
    return res.status(400).json({ error: 'Missing parameter: magnet link' });
  }

  let activeMagnet = magnet;

  console.log(`📥 Download Request received for magnet link.`);

  const premiumizeApiKey = resolvePremiumizeKey(req);

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

// 4. Subtitle proxy endpoint (to bypass browser CORS restrictions)
app.get('/api/proxy-subtitle', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing parameter: url' });
  }

  try {
    console.log(`🌐 Proxying subtitle request to bypass CORS...`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch subtitle from source: ${response.status}`);
    }

    const text = await response.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(text);
  } catch (err) {
    console.error('❌ Subtitle proxy failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 4b. ROM / Zip proxy endpoint (to bypass browser CORS restrictions for retro game emulators)
app.get('/api/proxy-rom', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing parameter: url' });
  }

  try {
    console.log(`🌐 Proxying ROM/Zip request to bypass CORS...`);
    const response = await fetch(url);
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

  // Prevent directory traversal attacks!
  const sanitizedPath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const absoluteFilePath = path.join(TEMP_DIR, archiveHash, sanitizedPath);

  // Verify that the file exists and is within the TEMP_DIR
  if (!absoluteFilePath.startsWith(TEMP_DIR)) {
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

  if (!premiumizeApiKey || premiumizeApiKey === 'your_premiumize_api_key_here') {
    console.log('ℹ️  Premiumize key not configured. Cloud sync is disabled.');
    return res.json({ success: false, error: 'Premiumize API key is missing. Cloud sync requires an API key.' });
  }

  try {
    console.log('🔄 Fetching cloud sync data from Premiumize...');
    
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

    // B. List the sync folder contents to locate "sync_data.json"
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
      item => item.name === 'sync_data.json' && item.type === 'file'
    );

    if (!syncFile) {
      console.log('ℹ️ "sync_data.json" file not found in sync folder.');
      return res.json({ success: true, synced: false, data: null });
    }

    // C. Download the file content from the secure CDN link
    const downloadRes = await fetch(syncFile.link);
    if (!downloadRes.ok) {
      throw new Error(`Failed to download sync file from CDN: ${downloadRes.status}`);
    }

    const syncContent = await downloadRes.json();
    console.log('✅ Cloud sync data successfully fetched and parsed.');
    return res.json({ success: true, synced: true, data: syncContent });

  } catch (err) {
    console.error('❌ Cloud sync download failed:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sync', async (req, res) => {
  const syncData = req.body; // Expect { libraryList, continueWatchingList }
  const premiumizeApiKey = resolvePremiumizeKey(req);

  if (!premiumizeApiKey || premiumizeApiKey === 'your_premiumize_api_key_here') {
    return res.status(400).json({ success: false, error: 'Premiumize API key is missing.' });
  }

  try {
    console.log('🔄 Uploading cloud sync data to Premiumize...');

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

    // B. List the sync folder contents to check if "sync_data.json" already exists (so we can delete it first)
    const folderListRes = await fetch(`https://www.premiumize.me/api/folder/list?id=${folderId}`, {
      headers: { 'Authorization': `Bearer ${premiumizeApiKey}` }
    });

    if (folderListRes.ok) {
      const folderData = await folderListRes.json();
      if (folderData.status === 'success') {
        const existingSyncFile = (folderData.content || []).find(
          item => item.name === 'sync_data.json' && item.type === 'file'
        );
        
        if (existingSyncFile) {
          console.log(`🗑️ Deleting old "sync_data.json" (ID: ${existingSyncFile.id})...`);
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
    formData.append('file', jsonBlob, 'sync_data.json');

    console.log(`📤 Posting sync payload to Premiumize CDN upload URL...`);
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    });

    if (!uploadRes.ok) {
      throw new Error(`File upload POST to CDN failed: ${uploadRes.status}`);
    }

    console.log('✅ Sync upload complete!');
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

  // 5. Remove domain names and websites
  title = title.replace(/\b(?:https?:\/\/)?(?:www\.)?[\w-]+\.(?:com|org|net|me|tv|cc|cx|xyz|to|in|is|biz|info|ws|eu|uk|us|ca|tw|hk|cn|la)\b/gi, '');

  // 6. Remove audio channel patterns (5.1, 7.1, 2.0, 5 1, 7 1, 2 0)
  title = title.replace(/\b(?:5\.1|7\.1|2\.0|2\.1|5\s+1|7\s+1|2\s+0)\b/gi, '');

  // 7. Remove quality tags
  title = title.replace(/\b(1080p|2160p|720p|480p|4K|UHD|HDR10|HDR|DV|SDR)\b/gi, '');

  // 8. Remove encoding tags
  title = title.replace(/\b(x264|x265|h\.?264|h\.?265|HEVC|AVC|AAC|DTS|DDP|Atmos|TrueHD|FLAC)\b/gi, '');

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
    console.log('⚡ Metadata cache hit.');
    return res.json(metadataCache.get(cacheKey));
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

    setMetadataCache(cacheKey, result);
    return res.json(result);
  } catch (err) {
    console.error('❌ Metadata enrichment failed:', err.message);
    return res.json({ status: 'not_found', metadata: null });
  }
});

// ── Category-specific metadata fetchers ──────────────────────────────────────

async function fetchMovieTvMetadata(parsed, category, customTmdbKey) {
  const tmdbKey = customTmdbKey || (process.env.TMDB_API_KEY ? process.env.TMDB_API_KEY.trim() : '');
  const tmdbReadToken = process.env.TMDB_READ_TOKEN ? process.env.TMDB_READ_TOKEN.trim() : '';

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
      detailUrl = `https://api.themoviedb.org/3/${mediaType}/${firstResult.id}?append_to_response=videos,credits`;
    } else {
      detailUrl = `https://api.themoviedb.org/3/${mediaType}/${firstResult.id}?api_key=${tmdbKey}&append_to_response=videos,credits`;
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

    const metadata = {
      poster: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
      backdrop: detail.backdrop_path ? `https://image.tmdb.org/t/p/w1280${detail.backdrop_path}` : null,
      title: detail.title || detail.name || parsed.cleanTitle,
      year: parsed.year || (detail.release_date || detail.first_air_date || '').substring(0, 4) || null,
      overview: detail.overview || null,
      voteAverage: detail.vote_average || null,
      genres: (detail.genres || []).map(g => g.name),
      trailer,
      cast
    };

    console.log(`✅ TMDb metadata found: "${metadata.title}"`);
    return { status: 'success', metadata };
  } catch (err) {
    console.error('❌ TMDb lookup failed:', err.message);
    return { status: 'not_found', metadata: null };
  }
}

async function fetchMovieTvMetadataByImdb(imdbId, customTmdbKey) {
  const tmdbKey = customTmdbKey || (process.env.TMDB_API_KEY ? process.env.TMDB_API_KEY.trim() : '');
  const tmdbReadToken = process.env.TMDB_READ_TOKEN ? process.env.TMDB_READ_TOKEN.trim() : '';

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
      detailUrl = `https://api.themoviedb.org/3/${mediaType}/${firstResult.id}?append_to_response=videos,credits`;
    } else {
      detailUrl = `https://api.themoviedb.org/3/${mediaType}/${firstResult.id}?api_key=${tmdbKey}&append_to_response=videos,credits`;
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

    const metadata = {
      poster: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
      backdrop: detail.backdrop_path ? `https://image.tmdb.org/t/p/w1280${detail.backdrop_path}` : null,
      title: detail.title || detail.name,
      year: (detail.release_date || detail.first_air_date || '').substring(0, 4) || null,
      overview: detail.overview || null,
      voteAverage: detail.vote_average || null,
      genres: (detail.genres || []).map(g => g.name),
      trailer,
      cast,
      imdbId: formattedImdb
    };

    console.log(`✅ TMDb metadata found via exact IMDb match: "${metadata.title}"`);
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

// E. Get Active Transfers List (Real-Time Queue Monitor)
app.get('/api/transfers', async (req, res) => {
  const premiumizeApiKey = resolvePremiumizeKey(req);

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

// Start listening
app.listen(PORT, () => {
  console.log(`🟢 Premio Express server running on http://localhost:${PORT}`);
});

