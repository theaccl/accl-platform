import {
  captureShortcutSignal,
  decideWebCaptureProtection,
  type CaptureProtectionAdapter,
  type CaptureProtectionDecision,
} from '@/lib/imageGenerator/captureProtection';

type WebCaptureProtectionOptions = {
  onDecision: (decision: CaptureProtectionDecision) => void;
  coverDurationMs?: number;
  documentRef?: Document;
};

/** Browser-only deterrence adapter for unapproved candidate review. */
export class WebCaptureProtectionAdapter implements CaptureProtectionAdapter {
  readonly platform = 'web' as const;
  readonly mode = 'web_deter_and_cover' as const;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private readonly documentRef: Document | null;
  private readonly coverDurationMs: number;

  constructor(private readonly options: WebCaptureProtectionOptions) {
    this.documentRef = options.documentRef ?? (typeof document === 'undefined' ? null : document);
    this.coverDurationMs = Math.max(500, options.coverDurationMs ?? 1500);
  }

  private clearCover = () => {
    this.options.onDecision(decideWebCaptureProtection(null));
    this.timeout = null;
  };

  private cover(signal: Parameters<typeof decideWebCaptureProtection>[0]) {
    if (!signal) return;
    this.options.onDecision(decideWebCaptureProtection(signal));
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(this.clearCover, this.coverDurationMs);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    this.cover(captureShortcutSignal(event));
  };

  private onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    this.cover('context_menu');
  };

  enable() {
    this.documentRef?.addEventListener('keydown', this.onKeyDown, true);
    this.documentRef?.addEventListener('contextmenu', this.onContextMenu, true);
  }

  disable() {
    this.documentRef?.removeEventListener('keydown', this.onKeyDown, true);
    this.documentRef?.removeEventListener('contextmenu', this.onContextMenu, true);
    if (this.timeout) clearTimeout(this.timeout);
    this.clearCover();
  }
}
