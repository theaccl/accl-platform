import { moderatorTest as test, expect } from '../fixtures/moderatorAuthFixtures';
import {
  cleanupModeratorQueueDetailFixture,
  getEnforcementOverrideAction,
  getModeratorQueueStatus,
  seedModeratorQueueDetailFixture,
} from '../helpers/moderatorSeed';

test.describe.configure({ mode: 'serial' });

test('moderator can load queue detail and execute status actions', async ({ page}, testInfo) => {
  const runId = process.env.E2E_RUN_ID?.trim() || `moderator-e2e-${testInfo.project.name}-w${testInfo.workerIndex}`;
  const seeded = await seedModeratorQueueDetailFixture(runId);

  try {
    await page.goto('/moderator');
    await expect(page.getByTestId('moderator-queue-root')).toBeVisible();
    await expect(page.getByTestId(`moderator-queue-row-${seeded.queueId}`)).toBeVisible();

    await page.getByTestId(`moderator-queue-row-${seeded.queueId}`).getByRole('link', { name: 'Open review detail' }).click();
    await expect(page).toHaveURL(new RegExp(`/moderator/queue/${seeded.queueId}$`));
    await expect(page.getByTestId('moderator-detail-root')).toBeVisible();
    await expect(page.getByTestId('moderator-detail-root').getByText(seeded.antiCheatEventId).first()).toBeVisible();
    await expect(page.getByTestId('moderator-enforcement-state')).toBeVisible();

    await page.getByTestId('moderator-action-select').selectOption('MARK_IN_REVIEW');
    await page.getByTestId('moderator-note-input').fill(`in-review ${runId}`);
    await page.getByTestId('moderator-action-submit').click();
    await expect(page.getByText('Current state: IN_REVIEW')).toBeVisible();
    await expect.poll(() => getModeratorQueueStatus(seeded.queueId)).toBe('IN_REVIEW');
    await expect(page.getByTestId('moderator-detail-root').getByRole('alert')).toHaveCount(0);

    await page.getByTestId('moderator-action-select').selectOption('MARK_RESOLVED');
    await page.getByTestId('moderator-resolution-note-input').fill(`resolved ${runId}`);
    await page.getByTestId('moderator-action-submit').click();
    await expect(page.getByText('Current state: RESOLVED')).toBeVisible();
    await expect.poll(() => getModeratorQueueStatus(seeded.queueId)).toBe('RESOLVED');
    await expect(page.getByTestId('moderator-detail-root').getByRole('alert')).toHaveCount(0);

    await page.getByTestId('moderator-action-select').selectOption('MARK_DISMISSED');
    await page.getByTestId('moderator-resolution-note-input').fill(`dismissed ${runId}`);
    await page.getByTestId('moderator-action-submit').click();
    await expect(page.getByText('Current state: DISMISSED')).toBeVisible();
    await expect.poll(() => getModeratorQueueStatus(seeded.queueId)).toBe('DISMISSED');
    await expect(page.getByTestId('moderator-detail-root').getByRole('alert')).toHaveCount(0);

    await page.getByTestId('moderator-enforcement-action-select').selectOption('CLEAR_RESTRICTION');
    await page.getByTestId('moderator-enforcement-reason-input').fill(`clear ${runId}`);
    await page.getByTestId('moderator-enforcement-submit').click();
    await expect(page.getByTestId('moderator-enforcement-success')).toContainText('Enforcement override applied.');
    await expect.poll(() => getEnforcementOverrideAction(seeded.seededUserId)).toBe('CLEAR_RESTRICTION');

    await page.getByTestId('moderator-enforcement-action-select').selectOption('TEMPORARY_UNLOCK');
    await page.getByTestId('moderator-enforcement-reason-input').fill(`temporary ${runId}`);
    await page.getByTestId('moderator-enforcement-expires-input').fill('2099-01-01T00:00');
    await page.getByTestId('moderator-enforcement-submit').click();
    await expect.poll(() => getEnforcementOverrideAction(seeded.seededUserId)).toBe('TEMPORARY_UNLOCK');

    await page.getByTestId('moderator-enforcement-action-select').selectOption('KEEP_LOCKED_PENDING_REVIEW');
    await page.getByTestId('moderator-enforcement-reason-input').fill(`keep-locked ${runId}`);
    await page.getByTestId('moderator-enforcement-expires-input').fill('');
    await page.getByTestId('moderator-enforcement-submit').click();
    await expect.poll(() => getEnforcementOverrideAction(seeded.seededUserId)).toBe('KEEP_LOCKED_PENDING_REVIEW');

    await page.getByTestId('moderator-enforcement-reason-input').fill('');
    await page.getByTestId('moderator-enforcement-submit').click();
    await expect(page.getByTestId('moderator-enforcement-error')).toContainText('Override reason is required.');

    await page.getByTestId('moderator-enforcement-action-select').selectOption('TEMPORARY_UNLOCK');
    await page.getByTestId('moderator-enforcement-reason-input').fill(`missing-expiry ${runId}`);
    await page.getByTestId('moderator-enforcement-expires-input').fill('');
    await page.getByTestId('moderator-enforcement-submit').click();
    await expect(page.getByTestId('moderator-enforcement-error')).toContainText(
      'Expiration is required for TEMPORARY_UNLOCK.'
    );
  } finally {
    await cleanupModeratorQueueDetailFixture(seeded);
  }
});
