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

import { beforeEach, vi } from 'vitest';
import { _resetNsfwModelForTests, loadNsfwModel } from './nsfw';

describe('loadNsfwModel', () => {
  beforeEach(() => _resetNsfwModelForTests());

  it('loads the model once and shares it between calls', async () => {
    const model = { classify: vi.fn() } as never;
    const loader = vi.fn().mockResolvedValue(model);
    const [a, b] = await Promise.all([loadNsfwModel(loader), loadNsfwModel(loader)]);
    const c = await loadNsfwModel(loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(a).toBe(model);
    expect(b).toBe(model);
    expect(c).toBe(model);
  });

  it('does not cache a failed load, so the next call retries', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ ok: true } as never);
    await expect(loadNsfwModel(loader)).rejects.toThrow('network');
    await expect(loadNsfwModel(loader)).resolves.toEqual({ ok: true });
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
