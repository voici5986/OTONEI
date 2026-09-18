import type { LyricLine } from '../types';

const MAX_TIMESTAMP_DELTA_SECONDS = 0.75;

/**
 * Match translated lyric lines by timestamp instead of array position.
 * Translation payloads often omit instrumental or duplicated lines, so index
 * based matching can display a translation under the wrong source lyric.
 */
export const alignTranslatedLyrics = (
  sourceLines: LyricLine[],
  translatedLines: LyricLine[]
): LyricLine[] => {
  if (translatedLines.length === 0) {
    return sourceLines.map((line) => ({ ...line, translatedText: '' }));
  }

  const usedTranslationIndexes = new Set<number>();

  return sourceLines.map((sourceLine) => {
    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;

    translatedLines.forEach((translatedLine, index) => {
      if (usedTranslationIndexes.has(index)) return;
      const delta = Math.abs(translatedLine.time - sourceLine.time);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = index;
      }
    });

    if (bestIndex < 0 || bestDelta > MAX_TIMESTAMP_DELTA_SECONDS) {
      return { ...sourceLine, translatedText: '' };
    }

    usedTranslationIndexes.add(bestIndex);
    return { ...sourceLine, translatedText: translatedLines[bestIndex].text || '' };
  });
};
