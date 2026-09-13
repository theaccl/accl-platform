/**
 * Local dialog chrome for the landscape ticker overlay.
 * No dependency: focus trap, inert background, body-scroll lock, one-shot focus restore.
 */

export type LandscapeTickerInertSnapshot = {
  el: HTMLElement;
  hadInertProperty: boolean;
  inertPropertyValue: boolean;
  hadInertAttribute: boolean;
  inertAttributeValue: string | null;
};

export type LandscapeTickerDialogChromeOptions = {
  onClose: () => void;
};

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )].filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && isVisible(el));
}

function isVisible(el: HTMLElement): boolean {
  if (el.closest('[inert]')) return false;
  if (el.closest('[hidden]') || el.hasAttribute('hidden')) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function portalRootFor(dialog: HTMLElement): HTMLElement {
  let node: HTMLElement = dialog;
  while (node.parentElement && node.parentElement !== document.body) {
    node = node.parentElement;
  }
  return node;
}

function snapshotInert(el: HTMLElement): LandscapeTickerInertSnapshot {
  return {
    el,
    hadInertProperty: 'inert' in el,
    inertPropertyValue: Boolean(el.inert),
    hadInertAttribute: el.hasAttribute('inert'),
    inertAttributeValue: el.getAttribute('inert'),
  };
}

/** Sync native inert property and attribute. Do not rely on JSX boolean serialization. */
export function syncNativeInert(el: HTMLElement | null, inert: boolean): void {
  if (!el) return;
  el.inert = inert;
  if (inert) {
    el.setAttribute('inert', '');
  } else {
    el.removeAttribute('inert');
    el.inert = false;
  }
}

function applyInert(el: HTMLElement): LandscapeTickerInertSnapshot {
  const snap = snapshotInert(el);
  syncNativeInert(el, true);
  return snap;
}

export function restoreInertSnapshot(snap: LandscapeTickerInertSnapshot): void {
  snap.el.inert = snap.inertPropertyValue;
  if (!snap.hadInertAttribute) {
    snap.el.removeAttribute('inert');
    return;
  }
  if (snap.inertAttributeValue === null) {
    snap.el.setAttribute('inert', '');
    return;
  }
  snap.el.setAttribute('inert', snap.inertAttributeValue);
}

function applyInertToBackground(dialog: HTMLElement): LandscapeTickerInertSnapshot[] {
  const keep = portalRootFor(dialog);
  const snaps: LandscapeTickerInertSnapshot[] = [];
  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement) || child === keep) continue;
    snaps.push(applyInert(child));
  }
  return snaps;
}

function wrapFocus(dialog: HTMLElement, event: KeyboardEvent): void {
  const nodes = focusableIn(dialog);
  if (nodes.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || active === dialog || !dialog.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }
  if (active === last || active === dialog || !dialog.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Attach chrome for one open session. Cleanup restores inert/scroll/focus only
 * for this attach — callers must not rebind while still open.
 */
export function attachLandscapeTickerDialogChrome(
  dialog: HTMLElement,
  options: LandscapeTickerDialogChromeOptions,
): () => void {
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const previousOverflow = document.body.style.overflow;
  const previousHtmlOverflow = document.documentElement.style.overflow;
  const previousBodyOverscroll = document.body.style.overscrollBehavior;
  const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overscrollBehavior = 'none';
  document.documentElement.style.overscrollBehavior = 'none';
  document.body.dataset.landscapeTickerScrollLock = 'true';
  dialog.dataset.capturedFocusOnce = previousFocus?.id || previousFocus?.tagName || 'unknown';

  const inertSnapshots = applyInertToBackground(dialog);
  dialog.focus();

  let closed = false;
  const closeOnce = () => {
    if (closed) return;
    closed = true;
    options.onClose();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeOnce();
      return;
    }
    if (event.key === 'Tab') wrapFocus(dialog, event);
  };

  const onFocusIn = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof Node) || dialog.contains(target)) return;
    event.stopPropagation();
    const nodes = focusableIn(dialog);
    (nodes[0] ?? dialog).focus();
  };

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Node) || dialog.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('pointerdown', onPointerDown, true);

  let detached = false;
  return () => {
    if (detached) return;
    detached = true;
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    for (const snap of inertSnapshots) restoreInertSnapshot(snap);
    document.body.style.overflow = previousOverflow;
    document.documentElement.style.overflow = previousHtmlOverflow;
    document.body.style.overscrollBehavior = previousBodyOverscroll;
    document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    delete document.body.dataset.landscapeTickerScrollLock;
    previousFocus?.focus?.();
  };
}
