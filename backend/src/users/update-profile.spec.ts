import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { isAvatarValue, MAX_AVATAR_DATA } from '../common/avatar';

const png = 'data:image/png;base64,' + 'A'.repeat(200);
const errors = async (body: object) => (await validate(plainToInstance(UpdateProfileDto, body))).map((e) => e.property);

describe('profile photo', () => {
  it('accepts a small embedded JPEG/PNG/WebP and an https link', () => {
    expect(isAvatarValue('data:image/jpeg;base64,/9j/4AAQ==')).toBe(true);
    expect(isAvatarValue(png)).toBe(true);
    expect(isAvatarValue('data:image/webp;base64,UklGRg==')).toBe(true);
    expect(isAvatarValue('https://example.com/a.png')).toBe(true);
  });
  it('refuses anything that could run or leak: svg, html, javascript:, http, files, oversize', () => {
    expect(isAvatarValue('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isAvatarValue('data:text/html;base64,PGgxPg==')).toBe(false);
    expect(isAvatarValue('javascript:alert(1)')).toBe(false);
    expect(isAvatarValue('http://example.com/a.png')).toBe(false);
    expect(isAvatarValue('file:///etc/passwd')).toBe(false);
    expect(isAvatarValue('data:image/png;base64,' + 'A'.repeat(MAX_AVATAR_DATA))).toBe(false);
    expect(isAvatarValue('https://example.com/' + 'a'.repeat(500))).toBe(false);
    expect(isAvatarValue(42)).toBe(false);
  });
  it('null removes the photo, leaving it out keeps it', async () => {
    expect(await errors({ avatarUrl: null })).toEqual([]);
    expect(await errors({})).toEqual([]);
    expect(await errors({ avatarUrl: 'javascript:alert(1)' })).toContain('avatarUrl');
  });
});

describe('display name', () => {
  it('is trimmed, 2 to 32 characters', async () => {
    expect(plainToInstance(UpdateProfileDto, { displayName: '  Aliya  ' }).displayName).toBe('Aliya');
    expect(await errors({ displayName: '   ' })).toContain('displayName');
    expect(await errors({ displayName: 'x'.repeat(33) })).toContain('displayName');
    expect(await errors({ displayName: 'Al' })).toEqual([]);
  });
});
