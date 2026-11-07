import { expect, test as base } from '@playwright/test';
import { closeContexts } from './helpers';

/** Same as Playwright's `test`, but always closes the contexts the test opened (even when it fails). */
export const test = base.extend<{ cleanup: void }>({
  cleanup: [
    async ({}, use) => {
      await use();
      await closeContexts();
    },
    { auto: true },
  ],
});
export { expect };
