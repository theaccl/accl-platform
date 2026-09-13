import { chessAnalysisFromEngineResult, safeParseChessAnalysis } from '@/lib/chess/analysisSchema';
import type { EngineAnalysisResult, EngineSearchLimits } from '@/lib/chess';
import { isLegalUciPv, parsePosition } from '@/lib/chess/position';

export type EngineComparisonCorpus = {
  schemaVersion: 'accl.engine-comparison.1';
  cases: Array<{
    id: string;
    engineFen: string;
    limits: Required<EngineSearchLimits>;
    expectedWhiteMateSign?: 1 | -1;
  }>;
};
export type ComparisonEvaluator = (input: {
  position: ReturnType<typeof parsePosition>;
  limits: Required<EngineSearchLimits>;
}) => Promise<EngineAnalysisResult>;
export type EngineComparisonArtifacts = {
  nativeBinarySha256: string;
  liteJavaScriptSha256: string;
  liteWasmSha256: string;
  nativeUpstreamCommit: string;
  nativeBigNnueSha256: string;
  nativeSmallNnueSha256: string;
  liteNnueSha256: string;
  liteWrapperVersion: string;
};
type Distribution = { count: number; min: number | null; max: number | null; mean: number | null; p50: number | null; p95: number | null };
export type EngineComparisonReport = {
  schemaVersion: 'accl.engine-comparison-report.1';
  artifacts: EngineComparisonArtifacts;
  identities: { native: string | null; lite: string | null };
  cases: Array<{
    id: string;
    nativeBestMove: string | null;
    liteBestMove: string | null;
    nativeScore: string | null;
    liteScore: string | null;
    rankOneAgreement: boolean;
    mateSignAgreement: boolean | null;
    differenceDisposition: 'AGREEMENT' | 'REVIEW_REQUIRED';
  }>;
  centipawnDeltaSummary: { unit: 'native-minus-lite-cp'; signed: Distribution; absolute: Distribution };
  contractFailures: string[];
};

const UNKNOWN_ARTIFACTS: EngineComparisonArtifacts = {
  nativeBinarySha256: 'unknown', liteJavaScriptSha256: 'unknown', liteWasmSha256: 'unknown',
  nativeUpstreamCommit: 'unknown', nativeBigNnueSha256: 'unknown', nativeSmallNnueSha256: 'unknown',
  liteNnueSha256: 'unknown', liteWrapperVersion: 'unknown',
};

export async function compareEngineCorpus(
  corpus: EngineComparisonCorpus,
  evaluateNative: ComparisonEvaluator,
  evaluateLite: ComparisonEvaluator,
  artifacts: EngineComparisonArtifacts = UNKNOWN_ARTIFACTS
): Promise<EngineComparisonReport> {
  if (corpus.schemaVersion !== 'accl.engine-comparison.1') throw new Error('comparison_schema_invalid');
  const report: EngineComparisonReport = {
    schemaVersion: 'accl.engine-comparison-report.1',
    artifacts: validateArtifacts(artifacts),
    identities: { native: null, lite: null },
    cases: [],
    centipawnDeltaSummary: {
      unit: 'native-minus-lite-cp', signed: distribution([]), absolute: distribution([]),
    },
    contractFailures: [],
  };
  const seen = new Set<string>();
  const cpDeltas: number[] = [];
  for (const item of corpus.cases) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(item.id) || seen.has(item.id)) {
      throw new Error('comparison_case_id_invalid');
    }
    seen.add(item.id);
    const position = parsePosition(item.engineFen);
    const [native, lite] = await Promise.all([
      evaluateNative({ position, limits: item.limits }),
      evaluateLite({ position, limits: item.limits }),
    ]);
    recordIdentity(report, 'native', native.identity.version, item.id);
    recordIdentity(report, 'lite', lite.identity.version, item.id);
    validateResult(item.id, 'native', native, position, item.expectedWhiteMateSign, report.contractFailures);
    validateResult(item.id, 'lite', lite, position, item.expectedWhiteMateSign, report.contractFailures);
    const nativeBestMove = native.lines.find((line) => line.rank === 1)?.move ?? native.bestMove;
    const liteBestMove = lite.lines.find((line) => line.rank === 1)?.move ?? lite.bestMove;
    const rankOneAgreement = nativeBestMove === liteBestMove;
    const nativeScore = native.lines.find((line) => line.rank === 1)?.score ?? null;
    const liteScore = lite.lines.find((line) => line.rank === 1)?.score ?? null;
    if (nativeScore?.kind === 'cp' && liteScore?.kind === 'cp') {
      cpDeltas.push(nativeScore.cp - liteScore.cp);
    }
    const mateSignAgreement = nativeScore?.kind === 'mate' && liteScore?.kind === 'mate'
      ? Math.sign(nativeScore.mate) === Math.sign(liteScore.mate)
      : null;
    const nativeCompact = compactScore(nativeScore);
    const liteCompact = compactScore(liteScore);
    report.cases.push({
      id: item.id, nativeBestMove, liteBestMove,
      nativeScore: nativeCompact, liteScore: liteCompact,
      rankOneAgreement, mateSignAgreement,
      differenceDisposition:
        rankOneAgreement && nativeCompact === liteCompact ? 'AGREEMENT' : 'REVIEW_REQUIRED',
    });
  }
  report.centipawnDeltaSummary = {
    unit: 'native-minus-lite-cp',
    signed: distribution(cpDeltas),
    absolute: distribution(cpDeltas.map(Math.abs)),
  };
  return report;
}

function recordIdentity(
  report: EngineComparisonReport,
  engine: 'native' | 'lite',
  version: string,
  id: string
): void {
  const current = report.identities[engine];
  if (current === null) report.identities[engine] = version;
  else if (current !== version) report.contractFailures.push(`${id}:${engine}:unstable_identity`);
}

function validateResult(
  id: string,
  engine: 'native' | 'lite',
  result: EngineAnalysisResult,
  position: ReturnType<typeof parsePosition>,
  expectedWhiteMateSign: 1 | -1 | undefined,
  failures: string[]
): void {
  let schemaValid = false;
  try {
    schemaValid = safeParseChessAnalysis(chessAnalysisFromEngineResult(result)).success;
  } catch {
    schemaValid = false;
  }
  const contractOk = schemaValid && result.positionKey === position.positionKey &&
    result.engineFen === position.engineFen && result.turn === position.turn && result.pov === 'white' &&
    result.lines.every((line) => isLegalUciPv(position.engineFen, line.pv));
  if (!contractOk) failures.push(`${id}:${engine}:analysis_contract`);
  const score = result.lines.find((line) => line.rank === 1)?.score;
  if (expectedWhiteMateSign !== undefined &&
      (score?.kind !== 'mate' || Math.sign(score.mate) !== expectedWhiteMateSign)) {
    failures.push(`${id}:${engine}:white_pov_mate_sign`);
  }
}

function compactScore(score: EngineAnalysisResult['lines'][number]['score'] | null): string | null {
  if (!score) return null;
  if (score.kind === 'cp') return `cp:${score.cp}`;
  if (score.kind === 'mate') return `mate:${score.mate}`;
  return `wdl:${score.win}/${score.draw}/${score.loss}`;
}

function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) return { count: 0, min: null, max: null, mean: null, p50: null, p95: null };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]!;
  return {
    count: sorted.length,
    min: sorted[0]!, max: sorted.at(-1)!,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50: percentile(0.5), p95: percentile(0.95),
  };
}

function validateArtifacts(artifacts: EngineComparisonArtifacts): EngineComparisonArtifacts {
  for (const value of [
    artifacts.nativeBinarySha256, artifacts.liteJavaScriptSha256, artifacts.liteWasmSha256,
    artifacts.nativeBigNnueSha256, artifacts.nativeSmallNnueSha256, artifacts.liteNnueSha256,
  ]) {
    if (value !== 'unknown' && !/^[a-f0-9]{64}$/.test(value)) throw new Error('comparison_artifact_identity_invalid');
  }
  if (artifacts.nativeUpstreamCommit !== 'unknown' && !/^[a-f0-9]{40}$/.test(artifacts.nativeUpstreamCommit)) {
    throw new Error('comparison_artifact_identity_invalid');
  }
  if (artifacts.liteWrapperVersion !== 'unknown' && !/^\d+\.\d+\.\d+$/.test(artifacts.liteWrapperVersion)) {
    throw new Error('comparison_artifact_identity_invalid');
  }
  return { ...artifacts };
}
