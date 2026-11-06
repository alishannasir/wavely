import { describe, expect, it } from 'vitest';
import { EXPLICIT_THRESHOLD, explicitScore } from './nsfw';

describe('explicitScore', () => {
  it('sums Porn and Hentai only', () => {
    expect(
      explicitScore([
        { className: 'Porn', probability: 0.5 },
        { className: 'Hentai', probability: 0.25 },
        { className: 'Sexy', probability: 0.9 },
        { className: 'Neutral', probability: 0.1 },
      ]),
    ).toBeCloseTo(0.75);
  });
  it('is below the threshold for ordinary video', () => {
    expect(explicitScore([{ className: 'Neutral', probability: 0.9 }, { className: 'Sexy', probability: 0.8 }])).toBeLessThan(
      EXPLICIT_THRESHOLD,
    );
  });
});
