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
  MAX_IMAGE_CANDIDATES,
} from '../../lib/imageGenerator/domain';
import { parseClaimedRequest } from '../../lib/imageGenerator/provider';

test('Slice 1 generation limits stay locked', () => {
  expect(MAX_IMAGE_CANDIDATES).toBe(4);
  expect(CANDIDATE_REVIEW_HOURS).toBe(24);
  expect(CANDIDATE_SIGNED_URL_SECONDS).toBe(60);
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

test('worker only accepts a running claimed request', () => {
  expect(parseClaimedRequest(null)).toBeNull();
  expect(parseClaimedRequest({ id: 'one', owner_id: 'owner', status: 'queued' })).toBeNull();
  expect(parseClaimedRequest({ id: 'one', owner_id: 'owner', status: 'running' })).toMatchObject({
    id: 'one',
    owner_id: 'owner',
    status: 'running',
  });
});
