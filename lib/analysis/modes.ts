export type IntelligenceMode = 'coach' | 'explainer' | 'analyst' | 'moderator';

export type ModeConfig = {
  depth: number;
  multiPv: number;
  useEngine: boolean;
  timeoutMs: number;
};

const MODE_CONFIG: Record<IntelligenceMode, ModeConfig> = {
  coach: { depth: 10, multiPv: 1, useEngine: true, timeoutMs: 6000 },
  explainer: { depth: 8, multiPv: 1, useEngine: false, timeoutMs: 4000 },
  analyst: { depth: 12, multiPv: 2, useEngine: true, timeoutMs: 9000 },
  moderator: { depth: 10, multiPv: 1, useEngine: true, timeoutMs: 6000 },
};

export function configForMode(mode: IntelligenceMode): ModeConfig {
  return MODE_CONFIG[mode];
}
