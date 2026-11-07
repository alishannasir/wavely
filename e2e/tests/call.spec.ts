import { expect, test } from './fixtures';
import { connectedPair, expectRemoteVideo, guestPage, newContext, pressStart, resetRuntime, sql, startAsGuest, waitInCall } from './helpers';

test.beforeEach(async () => {
  await resetRuntime();
});

test('a guest can start without signing up and sees their own camera', async ({ browser }) => {
  const page = await guestPage(browser);
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeDisabled();
  // the fake camera feeds the preview on the right
  await expect
    .poll(() => page.locator('video').nth(1).evaluate((v: HTMLVideoElement) => v.videoWidth > 0), { timeout: 15_000 })
    .toBe(true);
});

test('the rules notice must be accepted before a guest session starts', async ({ browser }) => {
  const page = await (await newContext(browser)).newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Start chatting now!' }).first().click();
  await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/localhost:5190\/$/);
});

test('two guests meet: video both ways, chat, then Esc moves on', async ({ browser }) => {
  const { a, b } = await connectedPair(browser);

  await expectRemoteVideo(a);
  await expectRemoteVideo(b);

  // text chat both ways
  await a.getByLabel('Chat message').fill('hello from A');
  await a.keyboard.press('Enter');
  await expect(b.getByText('hello from A')).toBeVisible();
  await b.getByLabel('Chat message').fill('hi A, this is B');
  await b.keyboard.press('Enter');
  await expect(a.getByText('hi A, this is B')).toBeVisible();

  // Esc: the first press leaves the chat box, the second goes to the next person
  await a.keyboard.press('Escape');
  await a.keyboard.press('Escape');
  await expect(a.getByText('Looking for someone')).toBeVisible();
  await expect(b.getByText('Stranger left')).toBeVisible();
  await expect(b.getByText('Looking for someone')).toBeVisible();

  // they just met, so they are not matched again right away
  await a.waitForTimeout(3000);
  await expect(a.getByText('Connection established')).toHaveCount(0);

  // the call was recorded with usage
  const rows = await sql(`select count(*)::int as n from sessions`);
  expect(rows[0].n).toBeGreaterThanOrEqual(1);
});

test('Stop returns to the idle screen and Start works again', async ({ browser }) => {
  const { a, b } = await connectedPair(browser);
  await a.getByRole('button', { name: 'Stop' }).click();
  await expect(a.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await expect(b.getByText('Stranger left')).toBeVisible();
  await pressStart(a);
  await expect(a.getByText('Looking for someone')).toBeVisible();
});

test('closing the tab ends the call for the other person', async ({ browser }) => {
  const { a, b } = await connectedPair(browser);
  await a.context().close();
  await expect(b.getByText('Stranger left')).toBeVisible({ timeout: 20_000 });
});

test('signed-out visitors cannot open the chat screen', async ({ browser }) => {
  const page = await (await newContext(browser)).newPage();
  await page.goto('/chat');
  await expect(page).toHaveURL(/localhost:5190\/$/);
  void startAsGuest;
  void waitInCall;
});

test('the camera stays on between matches: Next does not restart it, and the next call still has video', async ({ browser }) => {
  const { a, b } = await connectedPair(browser);
  const cam = (page: typeof a) =>
    page.locator('video').nth(1).evaluate((v: HTMLVideoElement) => {
      const t = (v.srcObject as MediaStream).getVideoTracks()[0];
      return `${t.id}:${t.readyState}`;
    });
  const before = await cam(a);
  expect(before).toMatch(/:live$/);

  await a.keyboard.press('Escape');
  await a.keyboard.press('Escape');
  await expect(a.getByText('Looking for someone')).toBeVisible();
  expect(await cam(a)).toBe(before); // same camera track, never stopped

  // a third person joins: A meets them with the very same camera, and video flows both ways
  const c = await guestPage(browser);
  await pressStart(c);
  await waitInCall(a);
  await waitInCall(c);
  await expectRemoteVideo(a);
  await expectRemoteVideo(c);
  expect(await cam(a)).toBe(before);
  void b;
});

test('muting works with the persistent camera and microphone', async ({ browser }) => {
  const { a } = await connectedPair(browser);
  await a.getByRole('button', { name: 'Mute microphone' }).click();
  await expect(a.getByRole('button', { name: 'Unmute microphone' })).toBeVisible();
  await a.getByRole('button', { name: 'Turn camera off' }).click();
  await expect(a.getByRole('button', { name: 'Turn camera on' })).toBeVisible();
  await a.getByRole('button', { name: 'Turn camera on' }).click();
  await a.getByRole('button', { name: 'Unmute microphone' }).click();
  await expect(a.getByRole('button', { name: 'Mute microphone' })).toBeVisible();
});

test('chat filter: guests cannot send links, swear words are masked, the original is kept as evidence', async ({ browser }) => {
  const { a, b } = await connectedPair(browser);
  await a.getByLabel('Chat message').fill('visit https://evil.example/pay now, you fuck');
  await a.keyboard.press('Enter');

  // the other person only sees the filtered text
  await expect(b.getByText('visit [link removed] now, you ****')).toBeVisible();
  await expect(b.getByText('evil.example')).toHaveCount(0);
  // the sender is told what was hidden, and sees what the other person sees
  await expect(a.getByText('visit [link removed] now, you ****')).toBeVisible();
  await expect(a.getByText(/Links and contact details are hidden/)).toBeVisible();

  // moderators still get the original in the report
  await b.getByRole('button', { name: '⚑ Report' }).click();
  await b.getByRole('button', { name: 'Harassment' }).click();
  await expect.poll(async () => (await sql(`select count(*)::int as n from reports`))[0].n).toBeGreaterThan(0);
  const [r] = await sql(`select "chatLog" from reports order by "createdAt" desc limit 1`);
  expect(JSON.stringify(r.chatLog)).toContain('https://evil.example/pay');
});

test('chat filter: repeating the same message more than 3 times is blocked', async ({ browser }) => {
  const { a, b } = await connectedPair(browser);
  for (let i = 0; i < 5; i++) {
    await a.getByLabel('Chat message').fill('buy my stuff now');
    await a.keyboard.press('Enter');
  }
  await expect(a.getByText('Please do not repeat the same message.').first()).toBeVisible();
  await expect(b.getByText('buy my stuff now')).toHaveCount(3);
});
