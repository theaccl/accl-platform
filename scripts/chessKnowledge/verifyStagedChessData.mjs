/**
 * Offline engine verification for staged opening / puzzle JSON.
 * No DB writes. No production hooks.
 *
 * Usage:
 *   node scripts/chessKnowledge/verifyStagedChessData.mjs --input ./data/staging/opening-puzzle-zips --report ./tmp/chess-data-engine-verification-report.json
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Chess } from 'chess.js';

const LIVE_HOOK_PATTERNS = [/submit-move/i, /play\.theaccl\.com/i, /\/api\/bot\/game\/start/i];
const TOURNAMENT_HOOK_PATTERNS = [/tournament_try_spawn/i, /\/api\/[^"'\s]*tournament/i];
const DEFAULT_DEPTH = 10;
const DEFAULT_MULTIPV = 3;

export function parseArgs(argv) {
  const out = {
    input: './data/staging/opening-puzzle-zips',
    report: './tmp/chess-data-engine-verification-report.json',
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--input' && argv[i + 1]) out.input = argv[++i];
    else if (argv[i] === '--report' && argv[i + 1]) out.report = argv[++i];
  }
  return out;
}

export function emptyProvenance(
  status = 'engine_not_available',
  unavailableReason = 'engine_verification_not_run'
) {
  return {
    engine_name: null,
    engine_version: null,
    depth: null,
    movetime_ms: null,
    multipv: null,
    score_unit: null,
    score_value: null,
    verification_status: status,
    verified_at: null,
    unavailable_reason: unavailableReason,
  };
}

export function emptyReport(inputPath) {
  return {
    generated_at: new Date().toISOString(),
    input_path: inputPath,
    openings: {
      total: 0,
      legal_sequences: 0,
      fen_matches: 0,
      fen_mismatches: 0,
      side_to_move_mismatches: 0,
      engine_checked: 0,
      engine_not_required: 0,
    },
    puzzles: {
      total: 0,
      legal_fens: 0,
      legal_solution_san: 0,
      legal_solution_uci: 0,
      engine_checked: 0,
      engine_verified: 0,
      engine_not_available: 0,
      needs_manual_review: 0,
      failed: 0,
    },
    records: [],
    safety: {
      production_mutations_attempted: false,
      live_game_hooks_detected: false,
      tournament_hooks_detected: false,
      db_writes_attempted: false,
    },
    recommendations: [],
    blockers: [],
  };
}

function pushRecord(report, { id, record_type, status, notes, provenance }) {
  report.records.push({
    id,
    record_type,
    engine_verification_status: status,
    engine_provenance: provenance ?? emptyProvenance(status),
    notes,
  });
}

export function fenKey(fen) {
  return String(fen).split(' ').slice(0, 4).join(' ');
}

function sideFromTurn(turn) {
  return turn === 'w' ? 'white' : 'black';
}

function walkJsonFiles(root, acc = []) {
  if (!existsSync(root)) return acc;
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    const st = statSync(full);
    if (st.isDirectory()) walkJsonFiles(full, acc);
    else if (extname(full).toLowerCase() === '.json') acc.push(full);
  }
  return acc;
}

function loadRecords(fullPath) {
  const data = JSON.parse(readFileSync(fullPath, 'utf8'));
  return Array.isArray(data) ? data : [data];
}

function scanSafety(text, report) {
  for (const p of LIVE_HOOK_PATTERNS) {
    if (p.test(text)) report.safety.live_game_hooks_detected = true;
  }
  for (const p of TOURNAMENT_HOOK_PATTERNS) {
    if (p.test(text)) report.safety.tournament_hooks_detected = true;
  }
}

export function replaySan(fen, sans) {
  const board = new Chess(fen);
  for (const san of sans) {
    let m;
    try {
      m = board.move(String(san));
    } catch {
      m = null;
    }
    if (!m) return { ok: false, board, error: `illegal_san:${san}` };
  }
  return { ok: true, board };
}

export function replayUci(fen, ucis) {
  const board = new Chess(fen);
  for (const uci of ucis) {
    const move = String(uci);
    let m;
    try {
      m = board.move({
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        promotion: move.length > 4 ? move[4] : undefined,
      });
    } catch {
      m = null;
    }
    if (!m) return { ok: false, board, error: `illegal_uci:${uci}` };
  }
  return { ok: true, board };
}

function verifyOpening(record, report) {
  const id = String(record.id ?? record.opening_id ?? 'opening-unknown');
  const notes = [];
  report.openings.total++;

  const sans = record.san_sequence ?? record.moves_san ?? [];
  if (!Array.isArray(sans) || sans.length === 0) {
    notes.push('Missing SAN sequence');
    pushRecord(report, {
      id,
      record_type: 'opening_position',
      status: 'needs_manual_review',
      notes,
      provenance: emptyProvenance('needs_manual_review', 'engine_verification_not_run'),
    });
    report.blockers.push(`Opening ${id}: missing SAN sequence`);
    return;
  }

  const replay = replaySan(new Chess().fen(), sans);
  if (!replay.ok) {
    notes.push(replay.error);
    pushRecord(report, {
      id,
      record_type: 'opening_position',
      status: 'engine_verification_failed',
      notes,
      provenance: emptyProvenance('engine_verification_failed', replay.error),
    });
    report.blockers.push(`Opening ${id}: ${replay.error}`);
    return;
  }

  report.openings.legal_sequences++;

  if (record.resulting_fen) {
    if (fenKey(replay.board.fen()) === fenKey(record.resulting_fen)) {
      report.openings.fen_matches++;
    } else {
      report.openings.fen_mismatches++;
      notes.push('resulting_fen mismatch');
      report.blockers.push(`Opening ${id}: resulting_fen mismatch`);
    }
  } else {
    report.openings.fen_matches++;
  }

  if (record.side_to_move && sideFromTurn(replay.board.turn()) !== String(record.side_to_move)) {
    report.openings.side_to_move_mismatches++;
    notes.push('side_to_move mismatch');
    report.blockers.push(`Opening ${id}: side_to_move mismatch`);
  }

  report.openings.engine_not_required++;
  pushRecord(report, {
    id,
    record_type: 'opening_position',
    status: 'legal_moves_validated',
    notes: [...notes, 'Opening book context — engine truth not required'],
    provenance: emptyProvenance('legal_moves_validated', 'engine_verification_not_run'),
  });
}

function isMateCategory(category) {
  return typeof category === 'string' && category.startsWith('mate_in_');
}

function isFirstMoveCredible(firstUci, evalResult) {
  if (!firstUci || !evalResult?.bestMove) return false;
  if (firstUci === evalResult.bestMove) return true;
  return (evalResult.lines ?? []).some((line) => line.move === firstUci && line.rank <= 3);
}

function scoreFromEval(evalResult) {
  const top = evalResult?.lines?.[0];
  if (!top) return { score_unit: null, score_value: null };
  if (typeof top.scoreCp === 'number') return { score_unit: 'cp', score_value: top.scoreCp };
  if (typeof top.scoreMate === 'number') return { score_unit: 'mate', score_value: top.scoreMate };
  return { score_unit: null, score_value: null };
}

async function createStockfishEvaluator() {
  try {
    const stockfishInit = (await import('stockfish')).default;
    const engine = await stockfishInit('asm');
    let engineVersion = null;
    return {
      available: true,
      engineName: 'stockfish',
      get engineVersion() {
        return engineVersion;
      },
      async evaluate(fen, { depth = DEFAULT_DEPTH, timeoutMs = 8000, multipv = DEFAULT_MULTIPV } = {}) {
        return await new Promise((resolve, reject) => {
          const linesByRank = new Map();
          let bestMove = null;
          const timeout = setTimeout(() => {
            try {
              engine.sendCommand('quit');
            } catch {}
            reject(new Error('engine_eval_timeout'));
          }, timeoutMs);

          engine.listener = (raw) => {
            const line = String(raw ?? '').trim();
            if (!line) return;
            if (line.startsWith('id name ') && !engineVersion) {
              // Capture reported identity only; never fabricate a version string.
              const name = line.slice('id name '.length).trim();
              engineVersion = name || null;
              return;
            }
            if (line.startsWith('info ')) {
              const rankMatch = /\bmultipv\s+(\d+)\b/i.exec(line);
              const pvMatch = /\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)/i.exec(line);
              const cpMatch = /\bscore cp\s+(-?\d+)\b/i.exec(line);
              const mateMatch = /\bscore mate\s+(-?\d+)\b/i.exec(line);
              if (rankMatch && pvMatch) {
                linesByRank.set(Number(rankMatch[1]), {
                  rank: Number(rankMatch[1]),
                  move: pvMatch[1].toLowerCase(),
                  scoreCp: cpMatch ? Number(cpMatch[1]) : null,
                  scoreMate: mateMatch ? Number(mateMatch[1]) : null,
                });
              }
              return;
            }
            if (line.startsWith('bestmove ')) {
              const m = /^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/i.exec(line);
              bestMove = m ? m[1].toLowerCase() : null;
              clearTimeout(timeout);
              try {
                engine.sendCommand('quit');
                engine.terminate?.();
              } catch {}
              resolve({
                bestMove,
                lines: [...linesByRank.values()].sort((a, b) => a.rank - b.rank),
                depth,
                multipv,
                movetime_ms: null,
              });
            }
          };

          try {
            engine.sendCommand('uci');
            engine.sendCommand('isready');
            engine.sendCommand('ucinewgame');
            engine.sendCommand(`setoption name MultiPV value ${multipv}`);
            engine.sendCommand(`position fen ${fen}`);
            engine.sendCommand(`go depth ${depth}`);
          } catch (e) {
            clearTimeout(timeout);
            reject(e);
          }
        });
      },
    };
  } catch {
    return {
      available: false,
      engineName: null,
      engineVersion: null,
      evaluate: async () => null,
    };
  }
}

async function verifyPuzzle(record, report, engine) {
  const id = String(record.id ?? record.puzzle_id ?? 'puzzle-unknown');
  const notes = [];
  report.puzzles.total++;

  let status = 'legal_moves_validated';
  let legal = true;

  let board;
  try {
    board = new Chess(String(record.fen));
    report.puzzles.legal_fens++;
  } catch {
    legal = false;
    report.puzzles.failed++;
    notes.push('illegal_fen');
    pushRecord(report, {
      id,
      record_type: 'puzzle_candidate',
      status: 'engine_verification_failed',
      notes,
      provenance: emptyProvenance('engine_verification_failed', 'illegal_fen'),
    });
    report.blockers.push(`Puzzle ${id}: illegal FEN`);
    return;
  }

  if (record.side_to_move && sideFromTurn(board.turn()) !== String(record.side_to_move)) {
    legal = false;
    notes.push('side_to_move mismatch');
    report.blockers.push(`Puzzle ${id}: side_to_move mismatch`);
  }

  const sanReplay = replaySan(record.fen, record.solution_san ?? []);
  if (!sanReplay.ok) {
    legal = false;
    notes.push(sanReplay.error);
    report.blockers.push(`Puzzle ${id}: ${sanReplay.error}`);
  } else {
    report.puzzles.legal_solution_san++;
  }

  const uciReplay = replayUci(record.fen, record.solution_uci ?? []);
  if (!uciReplay.ok) {
    legal = false;
    notes.push(uciReplay.error);
    report.blockers.push(`Puzzle ${id}: ${uciReplay.error}`);
  } else {
    report.puzzles.legal_solution_uci++;
    if (sanReplay.ok && fenKey(sanReplay.board.fen()) !== fenKey(uciReplay.board.fen())) {
      legal = false;
      notes.push('san_uci_final_mismatch');
      report.blockers.push(`Puzzle ${id}: SAN/UCI final mismatch`);
    }
  }

  if (!legal) {
    report.puzzles.failed++;
    pushRecord(report, {
      id,
      record_type: 'puzzle_candidate',
      status: 'engine_verification_failed',
      notes,
      provenance: emptyProvenance('engine_verification_failed', notes.join('; ') || 'validation_failed'),
    });
    return;
  }

  const finalBoard = sanReplay.board;
  if (isMateCategory(record.category) && !finalBoard.isCheckmate()) {
    report.puzzles.failed++;
    notes.push('mate_claim_not_met');
    report.blockers.push(`Puzzle ${id}: mate category but final position is not checkmate`);
    pushRecord(report, {
      id,
      record_type: 'puzzle_candidate',
      status: 'engine_verification_failed',
      notes,
      provenance: emptyProvenance('engine_verification_failed', 'mate_claim_not_met'),
    });
    return;
  }

  if (!engine.available) {
    report.puzzles.engine_not_available++;
    status = 'engine_not_available';
    notes.push('Stockfish asm engine unavailable in this environment');
    pushRecord(report, {
      id,
      record_type: 'puzzle_candidate',
      status,
      notes,
      provenance: emptyProvenance(status, 'stockfish_asm_unavailable'),
    });
    return;
  }

  report.puzzles.engine_checked++;
  try {
    const evalResult = await engine.evaluate(record.fen, {
      depth: DEFAULT_DEPTH,
      timeoutMs: 8000,
      multipv: DEFAULT_MULTIPV,
    });
    const firstUci = Array.isArray(record.solution_uci) ? record.solution_uci[0] : null;
    const credible = isFirstMoveCredible(firstUci, evalResult);
    const score = scoreFromEval(evalResult);
    let unavailableReason = null;
    let verifiedAt = null;

    if (isMateCategory(record.category)) {
      if (credible && finalBoard.isCheckmate()) {
        status = 'engine_verified';
        report.puzzles.engine_verified++;
        verifiedAt = new Date().toISOString();
        notes.push('Mate claim verified; first move matches shallow engine top line');
      } else if (finalBoard.isCheckmate()) {
        status = 'needs_manual_review';
        report.puzzles.needs_manual_review++;
        unavailableReason = 'first_move_not_in_shallow_top3';
        notes.push('Mate verified by replay; first move not in shallow engine top 3');
      } else {
        status = 'engine_verification_failed';
        report.puzzles.failed++;
        unavailableReason = 'mate_claim_not_met_after_engine';
      }
    } else if (credible) {
      status = 'engine_verified';
      report.puzzles.engine_verified++;
      verifiedAt = new Date().toISOString();
      notes.push('First solution move in shallow engine top 3');
    } else {
      status = 'needs_manual_review';
      report.puzzles.needs_manual_review++;
      unavailableReason = 'first_move_not_in_shallow_top3';
      notes.push('Legal line; first move not in shallow engine top 3 (non-mate puzzle)');
    }

    pushRecord(report, {
      id,
      record_type: 'puzzle_candidate',
      status,
      notes,
      provenance: {
        engine_name: engine.engineName,
        engine_version: engine.engineVersion ?? null,
        depth: DEFAULT_DEPTH,
        movetime_ms: null,
        multipv: DEFAULT_MULTIPV,
        score_unit: score.score_unit,
        score_value: score.score_value,
        verification_status: status,
        verified_at: verifiedAt,
        unavailable_reason: unavailableReason,
      },
    });
  } catch (e) {
    report.puzzles.engine_not_available++;
    status = 'engine_not_available';
    const reason = `engine_eval_failed:${String(e?.message ?? e)}`;
    notes.push(`Engine eval failed: ${String(e?.message ?? e)}`);
    pushRecord(report, {
      id,
      record_type: 'puzzle_candidate',
      status,
      notes,
      provenance: {
        engine_name: engine.engineName,
        engine_version: engine.engineVersion ?? null,
        depth: null,
        movetime_ms: null,
        multipv: null,
        score_unit: null,
        score_value: null,
        verification_status: status,
        verified_at: null,
        unavailable_reason: reason,
      },
    });
  }
}

export async function runVerification(inputRoot, reportPath) {
  const inputAbs = resolve(inputRoot);
  const report = emptyReport(inputAbs);

  if (!existsSync(inputAbs)) {
    report.blockers.push(`Input path does not exist: ${inputAbs}`);
  } else {
    const engine = await createStockfishEvaluator();
    if (!engine.available) {
      report.recommendations.push(
        'Stockfish asm engine not available — puzzle legality verified; engine pass marked engine_not_available.',
      );
    }

    for (const file of walkJsonFiles(inputAbs)) {
      const records = loadRecords(file);
      scanSafety(JSON.stringify(records), report);

      for (const row of records) {
        if (!row || typeof row !== 'object') continue;
        const recordType = row.record_type ?? row.recordType;
        if (recordType === 'opening_position') verifyOpening(row, report);
        else if (recordType === 'puzzle_candidate') await verifyPuzzle(row, report, engine);
      }
    }
  }

  if (report.safety.live_game_hooks_detected) {
    report.blockers.push('Live-game hook patterns detected in staged content.');
  }
  if (report.safety.tournament_hooks_detected) {
    report.blockers.push('Tournament hook patterns detected in staged content.');
  }

  report.recommendations.push('Offline verification only — no DB writes attempted.');
  report.recommendations.push(
    'Opening seeds require legality/consistency only; engine truth is not applied to book lines.',
  );
  report.recommendations.push(
    'Engine provenance never fabricates version/score; configured parameters alone do not imply verification.',
  );
  if (report.puzzles.engine_verified > 0) {
    report.recommendations.push('Some puzzle candidates passed shallow Stockfish verification.');
  }
  if (report.puzzles.needs_manual_review > 0) {
    report.recommendations.push('Review puzzle candidates flagged needs_manual_review before Trainer eligibility.');
  }

  const outPath = resolve(reportPath);
  mkdirSync(resolve(outPath, '..'), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  return report;
}

function isDirectCliRun() {
  const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
  return import.meta.url === entry;
}

if (isDirectCliRun()) {
  const { input, report } = parseArgs(process.argv);
  const result = await runVerification(input, report);
  console.log('Chess data engine verification complete.');
  console.log(`  input:  ${resolve(input)}`);
  console.log(`  report: ${resolve(report)}`);
  console.log(`  openings: ${result.openings.total} (${result.openings.fen_mismatches} fen mismatches)`);
  console.log(
    `  puzzles:  ${result.puzzles.total} (engine_verified=${result.puzzles.engine_verified}, not_available=${result.puzzles.engine_not_available})`,
  );
  console.log(`  blockers: ${result.blockers.length}`);
  if (result.blockers.length) {
    for (const b of result.blockers) console.log(`    - ${b}`);
  }
  process.exit(result.blockers.length > 0 ? 2 : 0);
}
