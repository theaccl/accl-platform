/** User words are whitespace-separated; house art direction is not user input. */
export const MAX_PROMPT_WORDS = 50;
export function promptWordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}
export function promptWithinLimit(value: string): boolean {
  return promptWordCount(value) <= MAX_PROMPT_WORDS;
}

// Existing prompt starters, presented as optional styles. No provider call or
// extra token charge is made when choosing a style.
export const GENERATOR_STYLES = {
  automatic: { label: 'Let ACCL choose', prompt: '' },
  royal: { label: 'Royal knight crest', prompt: 'A regal chess knight crest with a crown, deep violet light, and a dark tournament shield.' },
  storm: { label: 'Storm arena', prompt: 'A lone chess king in a storm-lit arena with controlled electric energy and dramatic shadows.' },
  gold: { label: 'Gold rook emblem', prompt: 'A minimal gold rook emblem on obsidian, prestigious, sharp, and readable at profile-icon size.' },
  crimson: { label: 'Crimson shield', prompt: 'A crimson and black chess shield with a powerful queen silhouette and subtle ember highlights.' },
} as const;
export type GeneratorStyle = keyof typeof GENERATOR_STYLES;
export const DEFAULT_GENERATION_PROMPT = 'Create an original ACCL chess identity with a clear silhouette, refined detail, and a readable profile composition.';
export const DEFAULT_EDIT_PROMPT = 'Preserve this chess identity and refine its composition, lighting, and clarity.';

export function composePlayerPrompt(prompt: string, style: GeneratorStyle = 'automatic', editing = false): string {
  const direction = prompt.trim() || (editing ? DEFAULT_EDIT_PROMPT : DEFAULT_GENERATION_PROMPT);
  const effect = GENERATOR_STYLES[style].prompt;
  return effect ? `${direction}\nStyle direction: ${effect}` : direction;
}
