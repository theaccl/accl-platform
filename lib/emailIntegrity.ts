/**
 * Pure email normalization, syntax validation, and conservative domain typo hints.
 * No DNS/MX checks; no silent rewrites.
 */

/** High-confidence typo domain → canonical consumer domain. */
export const DOMAIN_TYPO_CORRECTIONS: Readonly<Record<string, string>> = {
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'outllok.com': 'outlook.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'hotmial.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'iclod.com': 'icloud.com',
  'protonmai.com': 'protonmail.com',
  'protn.me': 'proton.me',
};

/** Practical syntax gate — not a full RFC parser. */
const EMAIL_SYNTAX_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailSyntaxValidation =
  | { ok: true; email: string }
  | { ok: false; error: string };

export type EmailTypoSuggestion = {
  entered: string;
  suggested: string;
  suggestedDomain: string;
};

export type EmailTypoDecision = 'accepted' | 'use_original';

/** Typo decision bound to the normalized email that produced it. */
export type EmailTypoDecisionState = {
  email: string;
  decision: EmailTypoDecision;
};

export function normalizeEmailInput(raw: string): string {
  const trimmed = raw.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) {
    return trimmed;
  }
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  return `${local}@${domain}`;
}

export function validateEmailSyntax(raw: string): EmailSyntaxValidation {
  const normalized = normalizeEmailInput(raw);
  if (!normalized) {
    return { ok: false, error: 'Email is required.' };
  }
  if (!normalized.includes('@')) {
    return { ok: false, error: 'Enter a valid email address (missing @).' };
  }
  const at = normalized.lastIndexOf('@');
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (!local) {
    return { ok: false, error: 'Enter a valid email address (missing name before @).' };
  }
  if (!domain) {
    return { ok: false, error: 'Enter a valid email address (missing domain after @).' };
  }
  if (!EMAIL_SYNTAX_RE.test(normalized)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  return { ok: true, email: normalized };
}

export function detectEmailTypoSuggestion(normalizedEmail: string): EmailTypoSuggestion | null {
  const at = normalizedEmail.lastIndexOf('@');
  if (at <= 0) {
    return null;
  }
  const local = normalizedEmail.slice(0, at);
  const domain = normalizedEmail.slice(at + 1);
  const correctedDomain = DOMAIN_TYPO_CORRECTIONS[domain];
  if (!correctedDomain || correctedDomain === domain) {
    return null;
  }
  return {
    entered: normalizedEmail,
    suggested: `${local}@${correctedDomain}`,
    suggestedDomain: correctedDomain,
  };
}

/** True when signup must pause for an explicit typo decision. */
export function isTypoGateBlocking(
  normalizedEmail: string,
  decision: EmailTypoDecisionState | null,
): boolean {
  const typo = detectEmailTypoSuggestion(normalizedEmail);
  if (!typo) {
    return false;
  }
  if (
    decision &&
    decision.email === normalizedEmail &&
    (decision.decision === 'accepted' || decision.decision === 'use_original')
  ) {
    return false;
  }
  return true;
}

export function formatTypoPrompt(suggestion: EmailTypoSuggestion): string {
  return `Did you mean ${suggestion.suggested}?`;
}
