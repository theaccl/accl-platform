import type { GeneratedImage } from '@/lib/imageGenerator/provider';

export type ImagePromptSafetyCode =
  | 'sexual_minors'
  | 'sexual_exploitation'
  | 'graphic_self_harm'
  | 'extremist_praise'
  | 'hateful_targeting'
  | 'graphic_violence'
  | 'explicit_real_person';

export type ImagePromptSafetyDecision =
  | { allowed: true; code: null }
  | { allowed: false; code: ImagePromptSafetyCode };

function normalizedPrompt(prompt: string): string {
  return prompt.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function containsAny(value: string, expressions: RegExp[]): boolean {
  return expressions.some((expression) => expression.test(value));
}

/** Deterministic, high-confidence gate before any provider cost is incurred. */
export function moderateImagePrompt(prompt: string): ImagePromptSafetyDecision {
  const value = normalizedPrompt(prompt);
  const sexual = [/\bnud(?:e|ity)\b/, /\bporn(?:ographic)?\b/, /\bexplicit sex(?:ual)?\b/, /\berotic\b/];
  const minor = [/\bchild(?:ren)?\b/, /\bminor\b/, /\bunderage\b/, /\bpreteen\b/, /\byoung teen\b/];
  if (containsAny(value, sexual) && containsAny(value, minor)) {
    return { allowed: false, code: 'sexual_minors' };
  }
  if (/\b(?:rape|sexual assault|forced sex|non[- ]consensual sex)\b/.test(value)) {
    return { allowed: false, code: 'sexual_exploitation' };
  }
  if (/\b(?:suicide|self[- ]harm|cutting oneself)\b/.test(value)) {
    return { allowed: false, code: 'graphic_self_harm' };
  }
  if (
    /\b(?:isis|kkk|ku klux klan|neo[- ]nazi)\b/.test(value) &&
    /\b(?:praise|glorif(?:y|ication)|propaganda|recruit(?:ing|ment)?|support)\b/.test(value)
  ) {
    return { allowed: false, code: 'extremist_praise' };
  }
  if (
    /\b(?:kill|exterminate|erase|subhuman|inferior)\b.{0,30}\b(?:jews|muslims|christians|black people|white people|asian people|gay people|lesbians|trans people|disabled people)\b/.test(
      value
    )
  ) {
    return { allowed: false, code: 'hateful_targeting' };
  }
  if (/\b(?:beheading|dismemberment|disembowelment|exposed intestines|graphic gore)\b/.test(value)) {
    return { allowed: false, code: 'graphic_violence' };
  }
  if (containsAny(value, sexual) && /\b(?:photo|photograph|celebrity|actor|actress|real person)\b/.test(value)) {
    return { allowed: false, code: 'explicit_real_person' };
  }
  return { allowed: true, code: null };
}

function hasMatchingMagicBytes(image: GeneratedImage): boolean {
  const bytes = image.bytes;
  if (image.mimeType === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (image.mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  );
}

/** Candidate integrity gate layered after the provider's `moderation: auto` decision. */
export function validateGeneratedCandidateSafety(image: GeneratedImage): void {
  if (image.bytes.byteLength < 8 || image.bytes.byteLength > 20 * 1024 * 1024) {
    throw new Error('candidate_safety_size_invalid');
  }
  if (!hasMatchingMagicBytes(image)) throw new Error('candidate_safety_signature_invalid');
  if (
    image.width == null ||
    image.height == null ||
    image.width < 256 ||
    image.height < 256 ||
    image.width > 8192 ||
    image.height > 8192
  ) {
    throw new Error('candidate_safety_dimensions_invalid');
  }
}
