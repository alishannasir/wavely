import { allowedOrigins, isOriginAllowed, primaryFrontendUrl } from './cors';

describe('cors origins', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('allows the configured origin, and any localhost port outside production', () => {
    delete process.env.NODE_ENV;
    process.env.FRONTEND_URL = 'https://app.example.com';
    expect(isOriginAllowed('https://app.example.com')).toBe(true);
    expect(isOriginAllowed('http://localhost:5174')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:3000')).toBe(true);
    expect(isOriginAllowed('https://evil.example')).toBe(false);
    expect(isOriginAllowed('http://localhost.evil.example')).toBe(false);
  });

  it('is strict in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://app.example.com';
    expect(isOriginAllowed('https://app.example.com')).toBe(true);
    expect(isOriginAllowed('http://localhost:5173')).toBe(false);
  });

  it('accepts several origins; the first is the redirect target', () => {
    process.env.FRONTEND_URL = 'https://a.example.com, https://b.example.com';
    expect(allowedOrigins()).toEqual(['https://a.example.com', 'https://b.example.com']);
    expect(primaryFrontendUrl()).toBe('https://a.example.com');
    expect(isOriginAllowed('https://b.example.com')).toBe(true);
  });

  it('treats requests without an Origin header as allowed (not a browser CORS request)', () => {
    expect(isOriginAllowed(undefined)).toBe(true);
  });

  it('defaults to the Vite dev server', () => {
    delete process.env.FRONTEND_URL;
    expect(primaryFrontendUrl()).toBe('http://localhost:5173');
  });
});
