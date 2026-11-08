import { describe, expect, it } from 'vitest';
import { safeAvatarSrc } from './Avatar';

describe('safeAvatarSrc', () => {
  it('shows embedded pictures and Google account photos', () => {
    expect(safeAvatarSrc('data:image/jpeg;base64,/9j/4AAQ==')).not.toBeNull();
    expect(safeAvatarSrc('https://lh3.googleusercontent.com/a/abc=s96-c')).not.toBeNull();
  });
  it('never loads anything that could tell a stranger who is looking', () => {
    expect(safeAvatarSrc('https://evil.example/p.png?u=1')).toBeNull();
    expect(safeAvatarSrc('https://googleusercontent.com.evil.example/x')).toBeNull();
    expect(safeAvatarSrc('http://lh3.googleusercontent.com/x')).toBeNull();
    expect(safeAvatarSrc('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(safeAvatarSrc('javascript:alert(1)')).toBeNull();
    expect(safeAvatarSrc(null)).toBeNull();
  });
});
