// App-wide constant data: signup URL, category list, profile avatar gradients/emojis, common trackers.

// Configuration constants
export const PM_SIGNUP_URL = "https://www.premiumize.me";

// Category Definitions
export const CATEGORIES = ['All', 'Movies', 'TV', 'Music', 'Audiobooks', 'Ebooks', 'Software', 'VST', 'Adult', 'Other', 'Retro Games'];

// --- Multi-Profile Constants ---
export const GRADIENTS = [
  { name: 'Purple-Pink', class: 'avatar-grad-purple-pink' },
  { name: 'Blue-Green', class: 'avatar-grad-blue-green' },
  { name: 'Sunset-Orange', class: 'avatar-grad-sunset-orange' },
  { name: 'Emerald-Teal', class: 'avatar-grad-emerald-teal' },
  { name: 'Space-Gray', class: 'avatar-grad-space-gray' }
];

export const EMOJIS = ['🦁', '🐯', '🐼', '🦊', '🐨', '🦄', '🦖', '🚀', '🍿', '🎧', '🎮', '👾', '🧙', '🦸'];
export const COMMON_TRACKERS = ['1337x', 'YTS', 'LimeTorrents', 'Nyaa', 'TorrentGalaxy', 'EZTV'];

// Incremental rendering of search results — render a batch, reveal more on scroll.
export const RESULTS_BATCH = 40;
