import { test as base, expect } from '@playwright/test';
export { expect };
export type { Page } from '@playwright/test';
export const test = base.extend({
  page: async ({ page }, use) => {
    const response = await page.request.post('/api/account', {
      // Each test registers from its own address so the per-IP sign-up limit (kept intact)
      // does not throttle a growing suite. Only the local server honours this header.
      headers: {
        Origin: 'http://localhost:3000',
        'X-Forwarded-For': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`,
      },
      data: {
        action: 'register',
        name: 'Pessoa de teste',
        email: 'test.' + crypto.randomUUID() + '@example.test',
        password: 'valid-test-password',
      },
    });
    expect(response.status()).toBe(200);
    await use(page);
  },
});
