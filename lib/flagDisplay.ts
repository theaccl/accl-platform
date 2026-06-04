import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';

countries.registerLocale(en);

/** Visible label for null/empty profile flag and explicit OTHER. */
export const FLAG_PREFER_NOT_TO_SAY_LABEL = 'Other / prefer not to say';

export function flagEmojiFromIso2(code: string | null | undefined): string | null {
  const c = code?.trim().toUpperCase();
  if (!c || c === 'OTHER' || c.length !== 2) {
    return null;
  }
  const A = 0x1f1e6;
  const pts: number[] = [];
  for (const ch of c) {
    const o = ch.charCodeAt(0);
    if (o < 65 || o > 90) {
      return null;
    }
    pts.push(A + (o - 65));
  }
  return String.fromCodePoint(...pts);
}

export function countryLabelFromIso2(code: string | null | undefined): string | null {
  const c = code?.trim().toUpperCase();
  if (!c) {
    return null;
  }
  if (c === 'OTHER') {
    return FLAG_PREFER_NOT_TO_SAY_LABEL;
  }
  return countries.getName(c, 'en') ?? null;
}

export type FlagIdentityPresentation = {
  code: string;
  label: string;
  /** PNG flag icon for public UI (not emoji-only). */
  iconUrl: string | null;
  emoji: string | null;
};

function isValidIso2Letters(code: string): boolean {
  if (code.length !== 2) {
    return false;
  }
  for (const ch of code) {
    const o = ch.charCodeAt(0);
    if (o < 65 || o > 90) {
      return false;
    }
  }
  return true;
}

/** CDN PNG used for reliable cross-platform flag graphics in profile UI. */
export function flagIconUrlFromIso2(code: string | null | undefined): string | null {
  const c = code?.trim().toUpperCase();
  if (!c || c === 'OTHER' || !isValidIso2Letters(c)) {
    return null;
  }
  return `https://flagcdn.com/w40/${c.toLowerCase()}.png`;
}

function preferNotToSayIdentity(storedCode: '' | 'OTHER'): FlagIdentityPresentation {
  return {
    code: storedCode,
    label: FLAG_PREFER_NOT_TO_SAY_LABEL,
    iconUrl: null,
    emoji: null,
  };
}

export function resolveFlagIdentity(code: string | null | undefined): FlagIdentityPresentation {
  const c = code?.trim().toUpperCase();
  if (!c) {
    return preferNotToSayIdentity('');
  }
  if (c === 'OTHER') {
    return preferNotToSayIdentity('OTHER');
  }
  const label = countryLabelFromIso2(c) ?? c;
  return {
    code: c,
    label,
    iconUrl: flagIconUrlFromIso2(c),
    emoji: flagEmojiFromIso2(c),
  };
}

/** e.g. `🇺🇸 United States` or `Other / prefer not to say` */
export function formatFlagDisplay(code: string | null | undefined): string | null {
  const c = code?.trim().toUpperCase();
  if (!c) {
    return null;
  }
  if (c === 'OTHER') {
    return FLAG_PREFER_NOT_TO_SAY_LABEL;
  }
  const label = countryLabelFromIso2(c);
  const emoji = flagEmojiFromIso2(c);
  if (label && emoji) {
    return `${emoji} ${label}`;
  }
  if (label) {
    return label;
  }
  return c;
}
