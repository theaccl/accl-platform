export type CaptureProtectionPlatform = 'web' | 'android' | 'ios';
export type CaptureProtectionMode =
  | 'web_deter_and_cover'
  | 'android_secure_window'
  | 'ios_capture_state_cover';

export type CaptureSignal =
  | 'print_screen_key'
  | 'system_capture_shortcut'
  | 'context_menu'
  | 'document_hidden'
  | 'screen_capture_active';

export type CaptureProtectionDecision = {
  coverCandidate: boolean;
  blockPointerInput: boolean;
  hardBlockExpected: boolean;
  reason: CaptureSignal | 'none';
};

export interface CaptureProtectionAdapter {
  readonly platform: CaptureProtectionPlatform;
  readonly mode: CaptureProtectionMode;
  enable(): void | Promise<void>;
  disable(): void | Promise<void>;
}

/**
 * Web capture signals are deterrents only. Browsers cannot reliably prevent an
 * operating-system screenshot, so the UI may cover a private candidate without
 * making a false hard-block promise.
 */
export function decideWebCaptureProtection(signal: CaptureSignal | null): CaptureProtectionDecision {
  const cover =
    signal === 'print_screen_key' ||
    signal === 'system_capture_shortcut' ||
    signal === 'context_menu' ||
    signal === 'screen_capture_active';
  return {
    coverCandidate: cover,
    blockPointerInput: cover,
    hardBlockExpected: false,
    reason: signal ?? 'none',
  };
}

export function captureShortcutSignal(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}): CaptureSignal | null {
  if (event.key === 'PrintScreen') return 'print_screen_key';
  if (event.shiftKey && (event.ctrlKey || event.metaKey)) return 'system_capture_shortcut';
  return null;
}

export const nativeCaptureProtectionContract = {
  android: {
    platform: 'android',
    mode: 'android_secure_window',
    hardBlockExpected: true,
    integration: 'Enable FLAG_SECURE while an unapproved candidate screen is visible.',
  },
  ios: {
    platform: 'ios',
    mode: 'ios_capture_state_cover',
    hardBlockExpected: false,
    integration: 'Cover private candidates while UIScreen capture is active; screenshot notification is post-capture.',
  },
} as const;
