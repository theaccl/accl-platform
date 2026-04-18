import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';

countries.registerLocale(en);

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
    return 'Other / prefer not to say';
  }
  return countries.getName(c, 'en') ?? null;
}

/** e.g. `🇺🇸 United States` or `Other / prefer not to say` */
export function formatFlagDisplay(code: string | null | undefined): string | null {
  const c = code?.trim().toUpperCase();
  if (!c) {
    return null;
  }
  if (c === 'OTHER') {
    return 'Other / prefer not to say';
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
