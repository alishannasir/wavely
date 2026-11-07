import { APIRequestContext, Browser, BrowserContext, Page, devices, expect } from '@playwright/test';
import Redis from 'ioredis';
import { Pool } from 'pg';

export const API = 'http://localhost:3990/api';
export const MAIL = 'http://localhost:8125/api/v1';

const pool = new Pool({ connectionString: 'postgresql://postgres:e2e@127.0.0.1:55440/videochat' });
const redis = new Redis('redis://127.0.0.1:56440');

export async function sql<T = any>(query: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(query, params)).rows as T[];
}

/** Matching, presence and call state live in Redis: wipe it so tests cannot match with leftovers. */
export async function resetRuntime(): Promise<void> {
  await redis.flushdb();
}

export const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const MEDIA = { permissions: ['camera', 'microphone'] as string[] };

/** A fresh browser context = a separate person (own storage, own device id). */
export async function newContext(browser: Browser, device: 'desktop' | 'mobile' = 'desktop'): Promise<BrowserContext> {
  const base = device === 'mobile' ? devices['Pixel 7'] : { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } };
  return browser.newContext({ ...base, ...MEDIA, baseURL: 'http://localhost:5190' });
}

export async function startAsGuest(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start chatting now!' }).first().click();
  await page.getByRole('button', { name: 'I agree' }).click();
  await expect(page).toHaveURL(/\/chat/);
}

export async function guestPage(browser: Browser, device: 'desktop' | 'mobile' = 'desktop'): Promise<Page> {
  const page = await (await newContext(browser, device)).newPage();
  await startAsGuest(page);
  return page;
}

export const pressStart = (page: Page) => page.getByRole('button', { name: 'Start', exact: true }).click();
export const waitInCall = (page: Page) => expect(page.getByText('Connection established')).toBeVisible({ timeout: 30_000 });

/** The stranger's <video> is the first one in the page. It is "playing" once frames have arrived. */
export async function expectRemoteVideo(page: Page): Promise<void> {
  await expect
    .poll(() => page.locator('video').first().evaluate((v: HTMLVideoElement) => v.videoWidth > 0 && v.readyState >= 2), { timeout: 30_000 })
    .toBe(true);
}

/** Two guests in a call with each other. */
export async function connectedPair(browser: Browser): Promise<{ a: Page; b: Page }> {
  const a = await guestPage(browser);
  const b = await guestPage(browser);
  await pressStart(a);
  await expect(a.getByText('Looking for someone')).toBeVisible();
  await pressStart(b);
  await waitInCall(a);
  await waitInCall(b);
  return { a, b };
}

// ---- accounts ----
export interface Auth {
  access_token: string;
  user: { id: string; email: string; displayName: string };
  email: string;
  password: string;
}

export async function apiRegister(request: APIRequestContext, opts: { name?: string; password?: string } = {}): Promise<Auth> {
  const name = opts.name ?? uniq('User');
  const email = `${name.toLowerCase()}@e2e.test`;
  const password = opts.password ?? 'password123';
  const res = await request.post(`${API}/auth/register`, {
    headers: { 'x-device-id': `device-${uniq('r')}-0123456789abcdef` },
    data: { email, password, displayName: name, birthdate: '1990-01-01', gender: 'MALE' },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  await sql(`update users set "emailVerifiedAt" = now(), "rulesAcceptedAt" = now() where email = $1`, [email]);
  return { ...body, email, password };
}

export async function makeRole(email: string, role: 'MODERATOR' | 'ADMIN'): Promise<void> {
  await sql(`update users set role = $2 where email = $1`, [email, role]);
}

/** Starts the page already signed in (as if the user had logged in). Call before page.goto. */
export async function signedIn(context: BrowserContext, auth: Pick<Auth, 'access_token' | 'user'>): Promise<void> {
  await context.addInitScript((a) => localStorage.setItem('ovc-auth', JSON.stringify({ state: { token: a.access_token, user: a.user }, version: 0 })), auth);
}

export async function signedInPage(browser: Browser, request: APIRequestContext, opts: { name?: string; role?: 'MODERATOR' | 'ADMIN'; device?: 'desktop' | 'mobile' } = {}) {
  const auth = await apiRegister(request, { name: opts.name });
  if (opts.role) await makeRole(auth.email, opts.role);
  // re-login so the stored user carries the role
  const login = await request.post(`${API}/auth/login`, { data: { email: auth.email, password: auth.password }, headers: { 'x-device-id': `device-${uniq('l')}-0123456789abcdef` } });
  const fresh = await login.json();
  const context = await newContext(browser, opts.device ?? 'desktop');
  await signedIn(context, fresh);
  const page = await context.newPage();
  return { page, auth: { ...auth, ...fresh, email: auth.email, password: auth.password } as Auth };
}

// ---- email (Mailpit) ----
export async function clearMail(): Promise<void> {
  await fetch(`${MAIL}/messages`, { method: 'DELETE' });
}

export async function mailTo(address: string, subjectPart: string): Promise<{ text: string; subject: string }> {
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${MAIL}/search?query=${encodeURIComponent('to:' + address)}`)).json();
    const hit = (list.messages ?? []).find((m: any) => m.Subject.includes(subjectPart));
    if (hit) {
      const full = await (await fetch(`${MAIL}/message/${hit.ID}`)).json();
      return { text: full.Text as string, subject: hit.Subject as string };
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No email to ${address} with "${subjectPart}"`);
}

/** The link in an email, as a path the test browser can open. */
export const linkIn = (mail: { text: string }): string => {
  const m = mail.text.match(/https?:\/\/[^\s]+\/([a-z-]+\?token=[0-9a-f]{64})/);
  if (!m) throw new Error('No link in email: ' + mail.text.slice(0, 200));
  return '/' + m[1];
};
