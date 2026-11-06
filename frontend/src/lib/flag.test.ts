import { describe, expect, it } from 'vitest';
import { flagEmoji } from './flag';

describe('flagEmoji', () => {
  it('converts country codes', () => {
    expect(flagEmoji('US')).toBe('🇺🇸');
    expect(flagEmoji('pk')).toBe('🇵🇰');
  });
  it('returns empty for invalid input', () => {
    expect(flagEmoji(null)).toBe('');
    expect(flagEmoji('USA')).toBe('');
    expect(flagEmoji('1x')).toBe('');
  });
});
