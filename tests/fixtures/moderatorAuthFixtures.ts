import { test as base } from '@playwright/test';

import { MODERATOR_AUTH_STATE_PATH, NON_MODERATOR_AUTH_STATE_PATH } from './authState';

export const moderatorTest = base.extend({
  storageState: MODERATOR_AUTH_STATE_PATH,
});

export const nonModeratorTest = base.extend({
  storageState: NON_MODERATOR_AUTH_STATE_PATH,
});

export const unauthenticatedTest = base.extend({
  storageState: { cookies: [], origins: [] },
});

export { expect } from '@playwright/test';
