import { expect, test } from '@playwright/test';

import {
  captureShortcutSignal,
  decideWebCaptureProtection,
  nativeCaptureProtectionContract,
} from '../../lib/imageGenerator/captureProtection';
import {
  CANDIDATE_REVIEW_HOURS,
  CANDIDATE_SIGNED_URL_SECONDS,
  extensionForMimeType,
  imageGenerationReviewExpired,
  MAX_INITIAL_IMAGE_CANDIDATES,
  MAX_IMAGE_CANDIDATES,
} from '../../lib/imageGenerator/domain';
import { parseClaimedRequest } from '../../lib/imageGenerator/provider';
import {
  candidatePresentationPhase,
  generationStatusFetchDisposition,
  generationStatusRetryDelay,
} from '../../lib/imageGenerator/presentationState';

test('expanded membership generation limits stay locked', () => {
  expect(MAX_INITIAL_IMAGE_CANDIDATES).toBe(5);
  expect(MAX_IMAGE_CANDIDATES).toBe(13);
  expect(CANDIDATE_REVIEW_HOURS).toBe(24);
  expect(CANDIDATE_SIGNED_URL_SECONDS).toBe(60);
});

test('candidate presentation motion ends when a candidate is accepted', () => {
  expect(candidatePresentationPhase({ status: 'review', accepted: false, firstPresentation: true, motionAllowed: true })).toBe('reveal');
  expect(candidatePresentationPhase({ status: 'review', accepted: false, firstPresentation: false, motionAllowed: true })).toBe('holding');
  expect(candidatePresentationPhase({ status: 'review', accepted: false, firstPresentation: true, motionAllowed: false })).toBe('still');
  expect(candidatePresentationPhase({ status: 'approved', accepted: true, firstPresentation: true, motionAllowed: true })).toBe('accepted_still');
  expect(candidatePresentationPhase({ status: 'rejected', accepted: false, firstPresentation: true, motionAllowed: true })).toBe('rejected_still');
});

test('web capture handling is a cover/deterrent and never claims a hard block', () => {
  expect(captureShortcutSignal({ key: 'PrintScreen' })).toBe('print_screen_key');
  expect(captureShortcutSignal({ key: '4', shiftKey: true, metaKey: true })).toBe(
    'system_capture_shortcut'
  );
  expect(captureShortcutSignal({ key: 'a', ctrlKey: true })).toBeNull();

  const decision = decideWebCaptureProtection('print_screen_key');
  expect(decision.coverCandidate).toBe(true);
  expect(decision.blockPointerInput).toBe(true);
  expect(decision.hardBlockExpected).toBe(false);
});

test('native adapters distinguish Android hard blocking from iOS capture covering', () => {
  expect(nativeCaptureProtectionContract.android.hardBlockExpected).toBe(true);
  expect(nativeCaptureProtectionContract.ios.hardBlockExpected).toBe(false);
});

test('published derivatives use safe extensions', () => {
  expect(extensionForMimeType('image/png')).toBe('png');
  expect(extensionForMimeType('image/jpeg')).toBe('jpg');
  expect(extensionForMimeType('image/webp')).toBe('webp');
});

test('review expiry is fail-closed at the exact server deadline', () => {
  const deadline = '2026-08-31T18:00:00.000Z';
  expect(imageGenerationReviewExpired('review', deadline, Date.parse(deadline) - 1)).toBe(false);
  expect(imageGenerationReviewExpired('review', deadline, Date.parse(deadline))).toBe(true);
  expect(imageGenerationReviewExpired('approved', deadline, Date.parse(deadline) + 1)).toBe(false);
  expect(imageGenerationReviewExpired('review', null, Date.parse(deadline) + 1)).toBe(true);
  expect(imageGenerationReviewExpired('review', 'not-a-date', Date.parse(deadline) + 1)).toBe(true);
});

test('worker only accepts a running claimed request', () => {
  expect(parseClaimedRequest(null)).toBeNull();
  expect(parseClaimedRequest({ id: 'one', owner_id: 'owner', status: 'queued' })).toBeNull();
  expect(parseClaimedRequest({ id: 'one', owner_id: 'owner', status: 'running' })).toMatchObject({
    id: 'one',
    owner_id: 'owner',
    status: 'running',
  });
});

test('generation review polling retries only temporary failures', () => {
  expect(generationStatusFetchDisposition(200)).toBe('success');
  expect(generationStatusFetchDisposition(401)).toBe('signed_out');
  expect(generationStatusFetchDisposition(403)).toBe('unavailable');
  expect(generationStatusFetchDisposition(404)).toBe('unavailable');
  expect(generationStatusFetchDisposition(408)).toBe('retry');
  expect(generationStatusFetchDisposition(429)).toBe('retry');
  expect(generationStatusFetchDisposition(503)).toBe('retry');
  expect(generationStatusRetryDelay(0)).toBe(3_000);
  expect(generationStatusRetryDelay(1)).toBe(6_000);
  expect(generationStatusRetryDelay(20)).toBe(15_000);
});
