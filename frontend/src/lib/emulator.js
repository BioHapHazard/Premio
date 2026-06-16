// Map a ROM filename/extension to its EmulatorJS system id (or null if unsupported).
export function getEmulatorSystem(filename) {
  if (!filename || typeof filename !== 'string') return null;
  const name = filename.split('?')[0].toLowerCase();
  const ext = name.split('.').pop();
  const map = {
    'nes': 'nes',
    'sfc': 'snes',
    'smc': 'snes',
    'md': 'segaMD',
    'gen': 'segaMD',
    'bin': 'segaMD',
    'gb': 'gb',
    'gbc': 'gbc',
    'gba': 'gba',
    'a26': 'atari2600',
    'a78': 'atari7800'
  };
  if (map[ext]) return map[ext];
  if (ext === 'zip') return 'zip'; // Triggers zip auto-detection inside emulator.html
  return null;
}
