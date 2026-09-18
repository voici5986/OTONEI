import { describe, expect, it } from 'vitest';
import { alignTranslatedLyrics } from '../utils/lyricAlignment';

describe('alignTranslatedLyrics', () => {
  it('matches translations by timestamp when line counts differ', () => {
    const source = [
      { time: 1, text: '第一句' },
      { time: 2, text: '第二句' },
      { time: 3, text: '第三句' },
    ];
    const translated = [
      { time: 1.04, text: 'First' },
      { time: 3.02, text: 'Third' },
    ];

    expect(alignTranslatedLyrics(source, translated)).toEqual([
      { time: 1, text: '第一句', translatedText: 'First' },
      { time: 2, text: '第二句', translatedText: '' },
      { time: 3, text: '第三句', translatedText: 'Third' },
    ]);
  });
});
