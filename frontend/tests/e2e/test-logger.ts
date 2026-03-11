import { Page } from '@playwright/test';

export function setupPageLogger(page: Page) {
  page.on('console', msg => console.log('[PAGE LOG] ' + msg.type() + ': ' + msg.text()));
  page.on('pageerror', err => console.log('[PAGE ERROR] ' + err.message));
  page.on('requestfailed', request => console.log('[PAGE REQ FAILED] ' + request.url() + ' ' + (request.failure()?.errorText || '')));
  page.on('dialog', async dialog => {
    console.log('[PAGE DIALOG] ' + dialog.message());
    await dialog.accept();
  });
}
