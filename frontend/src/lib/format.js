// Pure string/number formatting & release-name parsing helpers (no React).

// Deterministic hue (0-359) from a string, for gradient poster fallbacks.
export const hashHue = (str) => { let h = 0; for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) % 360; return h; };

// Formatter: Convert bytes to readable sizes
export function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper: Strip domain/host and query parameters from CDN URLs to make them edge-server independent
// Helper: Strip domain/host, dynamic worker subdomains, and temporary IP/token routes from PM CDN URLs
export function cleanUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    // Decode first to ensure we compare standard decoded characters (space instead of %20)
    const decoded = decodeURIComponent(url);
    const parsed = new URL(decoded);
    let pathname = parsed.pathname;

    // Premiumize directdl links have the format: /dl/IP_OR_GEO/TOKEN/Path/To/File
    // Stripping the first 3 segments makes the clean path edge-agnostic and token-independent
    if (pathname.startsWith('/dl/')) {
      const parts = pathname.split('/');
      if (parts.length > 4) {
        return '/' + parts.slice(4).join('/');
      }
    }
    return pathname;
  } catch (e) {
    const decoded = decodeURIComponent(url);
    const parts = decoded.split('?')[0].split('/');
    return parts.length > 3 ? '/' + parts.slice(3).join('/') : decoded;
  }
}

// Formatter: Parse release quality and specs from title
export function extractQuality(title) {
  if (!title || typeof title !== 'string') return [];
  const tags = [];
  const lowercaseTitle = title.toLowerCase();

  // Resolution tags
  if (/\b(4k|2160p|uhd)\b/i.test(lowercaseTitle)) {
    tags.push({ text: '4K 2160p', type: 'ultra' });
  } else if (/\b(1080p|fhd)\b/i.test(lowercaseTitle)) {
    tags.push({ text: '1080p', type: 'hd' });
  } else if (/\b(720p|hd)\b/i.test(lowercaseTitle)) {
    tags.push({ text: '720p', type: 'sd' });
  }

  // Source tags
  if (/\b(bluray|blu-ray|bdrip|brrip)\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'BluRay', type: 'source' });
  } else if (/\b(web-dl|webdl|webrip|web\.dl|web)\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'WEB-DL', type: 'source' });
  } else if (/\b(hdtv|dsr|pdtv)\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'HDTV', type: 'source' });
  }

  // Encoding & HDR tags
  if (/\bhdr\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'HDR', type: 'extra' });
  }
  if (/\b(hevc|x265|h265)\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'x265', type: 'codec' });
  } else if (/\b(x264|h264)\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'x264', type: 'codec' });
  }

  // Audio / Document tags
  if (/\bflac\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'FLAC', type: 'audio' });
  } else if (/\bmp3\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'MP3', type: 'audio' });
  }

  if (/\bepub\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'EPUB', type: 'doc' });
  } else if (/\bpdf\b/i.test(lowercaseTitle)) {
    tags.push({ text: 'PDF', type: 'doc' });
  }

  return tags;
}

// TV Show Episode matcher: Extracts episode indicators (e.g. S01E05, 1x05, E05, Ep 5, or standalone index) robustly
export function matchEpisode(name) {
  if (!name || typeof name !== 'string') return '';
  const nameLower = name.toLowerCase();

  // 1. Match standard S01E05 / S1E5 / s01e05 style
  const sXexMatch = nameLower.match(/\bs\d+e\d+\b/);
  if (sXexMatch) return sXexMatch[0];

  // 2. Match 1x05 style
  const crossMatch = nameLower.match(/\b\d+x\d+\b/);
  if (crossMatch) return crossMatch[0];

  // 3. Match E05 / Ep05 / Episode 05 style
  const epMatch = nameLower.match(/\b(?:ep|episode|e)\s*(\d+)\b/);
  if (epMatch) return 'e' + parseInt(epMatch[1], 10);

  // 4. Match standalone two-digit episode number like " - 05 - " or " 05 "
  const standaloneMatch = nameLower.match(/(?:\s+|-)\s*(\d{2})\s*(?:\s+|-|\.)/);
  if (standaloneMatch) return 'e' + parseInt(standaloneMatch[1], 10);

  // 5. Fallback: match first sequence of digits that isn't a resolution (e.g. 2160, 1080, 720, 480)
  const allNumbers = nameLower.match(/\b\d+\b/g);
  if (allNumbers) {
    const nonResNumber = allNumbers.find(num => !['2160', '1080', '720', '480'].includes(num));
    if (nonResNumber) return 'e' + parseInt(nonResNumber, 10);
  }

  return '';
}

// TV Show Details parser: extracts show name, season, and episode for recap lookup
export function parseShowDetails(filename) {
  if (!filename || typeof filename !== 'string') return null;
  const cleanName = filename.split('/').pop(); // Get basename

  // Match standard S01E02 / S1E5 style
  const sxe = cleanName.match(/(.*?)\bS(\d+)E(\d+)\b/i);
  if (sxe) {
    return {
      showName: sxe[1].replace(/[\._\-]/g, ' ').trim(),
      season: parseInt(sxe[2], 10),
      episode: parseInt(sxe[3], 10)
    };
  }

  // Match 1x02 style
  const cross = cleanName.match(/(.*?)\b(\d+)x(\d+)\b/i);
  if (cross) {
    return {
      showName: cross[1].replace(/[\._\-]/g, ' ').trim(),
      season: parseInt(cross[2], 10),
      episode: parseInt(cross[3], 10)
    };
  }

  return null;
}
