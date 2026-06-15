// Client-side SRT to WebVTT converter (no React).
export const convertSrtToVtt = (srtText) => {
  let vttText = 'WEBVTT\n\n';
  const cleanSrt = srtText.replace(/\r/g, '');
  const blocks = cleanSrt.split(/\n\n+/);

  blocks.forEach(block => {
    const lines = block.split('\n').filter(Boolean);
    if (lines.length >= 2) {
      const timingLineIdx = lines.findIndex(l => l.includes('-->'));
      if (timingLineIdx !== -1) {
        let timing = lines[timingLineIdx];
        timing = timing.replace(/,/g, '.'); // Convert SRT timing commas to VTT periods
        const dialogue = lines.slice(timingLineIdx + 1).join('\n');
        vttText += `${timing}\n${dialogue}\n\n`;
      }
    }
  });

  return vttText;
};
