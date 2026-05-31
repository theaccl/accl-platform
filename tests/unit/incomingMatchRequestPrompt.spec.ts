import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  incomingMatchRequestPromptBody,
  incomingMatchRequestPromptTitle,
  outgoingDeclinedFeedbackMessage,
} from '@/lib/matchRequestPromptCopy';

test.describe('incomingMatchRequestPrompt copy', () => {
  test('rematch prompt title and body', () => {
    expect(incomingMatchRequestPromptTitle('rematch')).toBe('REMATCH REQUEST');
    expect(incomingMatchRequestPromptBody('rematch', 'Test_player1')).toBe(
      'Test_player1 wants a rematch.',
    );
  });

  test('challenge prompt preserves direct-challenge copy', () => {
    expect(incomingMatchRequestPromptTitle('challenge')).toBe('CHALLENGE REQUEST');
    expect(incomingMatchRequestPromptBody('challenge', 'Alice')).toBe(
      'Alice sent you a direct challenge.',
    );
  });

  test('sender declined feedback for rematch', () => {
    expect(outgoingDeclinedFeedbackMessage('rematch')).toBe('Rematch declined');
  });
});

test.describe('incomingMatchRequestPrompt wiring (static)', () => {
  test('prompt mounts globally in AppProviders', () => {
    const providers = readFileSync(join(process.cwd(), 'components', 'AppProviders.tsx'), 'utf8');
    expect(providers).toContain('IncomingMatchRequestPrompt');
    expect(providers).toContain('OutgoingMatchRequestDeclinedToast');
    expect(providers).toContain('SenderChallengeGameRedirectListener');
  });

  test('prompt reuses match_requests and accept API', () => {
    const prompt = readFileSync(
      join(process.cwd(), 'components', 'IncomingMatchRequestPrompt.tsx'),
      'utf8',
    );
    expect(prompt).toContain("from('match_requests')");
    expect(prompt).toContain('acceptMatchRequestViaApi');
    const actions = readFileSync(join(process.cwd(), 'lib', 'matchRequestClientActions.ts'), 'utf8');
    expect(actions).toContain('/api/match-requests/accept');
    expect(prompt).toContain('declineIncomingMatchRequest');
    expect(prompt).toContain('data-testid="incoming-match-request-accept"');
    expect(prompt).toContain('data-testid="incoming-match-request-decline"');
    expect(prompt).not.toContain('.insert(');
  });

  test('prompt uses fixed overlay without shifting layout', () => {
    const prompt = readFileSync(
      join(process.cwd(), 'components', 'IncomingMatchRequestPrompt.tsx'),
      'utf8',
    );
    expect(prompt).toContain("position: 'fixed'");
    expect(prompt).toContain('pointerEvents: \'none\'');
    expect(prompt).toContain('zIndex: 200');
  });

  test('accept routes via navigateAfterAcceptIfAllowed', () => {
    const prompt = readFileSync(
      join(process.cwd(), 'components', 'IncomingMatchRequestPrompt.tsx'),
      'utf8',
    );
    expect(prompt).toContain('navigateAfterAcceptIfAllowed');
    expect(prompt).toContain("flow: 'incoming-match-request-prompt'");
  });

  test('inbox banner listens for inbox-changed event', () => {
    const banner = readFileSync(
      join(process.cwd(), 'components', 'PendingMatchRequestsBanner.tsx'),
      'utf8',
    );
    expect(banner).toContain('MATCH_REQUEST_INBOX_CHANGED_EVENT');
    expect(banner).toContain('Open inbox');
  });

  test('sender listener repairs finished-board redirect and resolution fallback', () => {
    const listener = readFileSync(
      join(process.cwd(), 'components', 'SenderChallengeGameRedirectListener.tsx'),
      'utf8',
    );
    expect(listener).toContain('resolvePathBoardHint');
    expect(listener).toContain('select("id,tempo,status")');
    expect(listener).toContain('resolution_game_id');
    expect(listener).toContain('rematch_request');
  });

  test('declined toast surfaces rematch declined', () => {
    const toast = readFileSync(
      join(process.cwd(), 'components', 'OutgoingMatchRequestDeclinedToast.tsx'),
      'utf8',
    );
    expect(toast).toContain('outgoingDeclinedFeedbackMessage');
    expect(toast).toContain('data-testid="outgoing-match-request-declined-toast"');
    expect(toast).toContain("filter: `from_user_id=eq.${uid}`");
  });

  test('clock slice files untouched in this pass', () => {
    const display = readFileSync(join(process.cwd(), 'lib', 'liveClockDisplay.ts'), 'utf8');
    expect(display).toContain('shouldShowViewerImmersivePressure');
    const sound = readFileSync(join(process.cwd(), 'lib', 'liveClockLowTimeSound.ts'), 'utf8');
    expect(sound).toContain('LOW_TIME_SOUND_PEAK_GAIN');
  });
});
