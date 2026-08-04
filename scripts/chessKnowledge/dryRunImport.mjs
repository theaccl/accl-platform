/**
 * Dry-run inventory + validation for opening / puzzle staging inputs.
 * No production DB writes. No copyrighted book ingestion.
 *
 * Usage:
 *   node scripts/chessKnowledge/dryRunImport.mjs --input ./data/staging/opening-puzzle-zips --report ./tmp/chess-data-dry-run-report.json
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Chess } from 'chess.js';

const ECO_RE = /^[A-E]\d{2}$/i;
const SUPPORTED_PUZZLE_CATEGORIES = new Set([
  'mate_in_1',
  'mate_in_2',
  'mate_in_3',
  'combination',
  'simple_endgame',
]);
const KNOWN_MOTIF_TAGS = new Set([
  'pin',
  'skewer',
  'fork',
  'back_rank_mate',
  'deflection',
  'decoy',
  'discovered_attack',
  'overloaded_defender',
  'clearance',
  'attraction',
  'mating_net',
  'promotion_tactic',
  'perpetual_check',
  'stalemate_trick',
]);
const FORBIDDEN_GENERIC_TABLES = ['chess_knowledge', 'chess_knowledge_entries', 'generic_chess_knowledge'];
const LIVE_HOOK_PATTERNS = [
  /submit-move/i,
  /play\.theaccl\.com/i,
  /\/api\/bot\/game\/start/i,
  /create_seated_game_guard/i,
  /tournament_try_spawn/i,
];
const TOURNAMENT_HOOK_PATTERNS = [
  /tournament_try_spawn/i,
  /\/api\/[^"'\s]*tournament/i,
  /spawn_tournament/i,
  /create_seated_game_guard/i,
];

function parseArgs(argv) {
  const out = { input: './data/staging/opening-puzzle-zips', report: './tmp/chess-data-dry-run-report.json' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--input' && argv[i + 1]) out.input = argv[++i];
    else if (argv[i] === '--report' && argv[i + 1]) out.report = argv[++i];
  }
  return out;
}

function emptyReport() {
  return {
    generated_at: new Date().toISOString(),
    inputs: { zip_files: [], extracted_files: 0, file_types: {} },
    buckets: {
      opening_classification: 0,
      opening_moves: 0,
      opening_sources: 0,
      puzzles: 0,
      puzzle_solutions: 0,
      source_metadata: 0,
      import_logs: 0,
      normalized_accl_data: 0,
      unsafe_reference_only: 0,
      unknown_manual_review: 0,
    },
    validation: {
      legal_fens: 0,
      illegal_fens: 0,
      valid_san_sequences: 0,
      invalid_san_sequences: 0,
      valid_uci_sequences: 0,
      invalid_uci_sequences: 0,
      duplicate_positions: 0,
      duplicate_puzzles: 0,
      transposition_candidates: 0,
      wrong_move_order_candidates: 0,
      bad_eco_labels: 0,
      missing_source_labels: 0,
      missing_license_metadata: 0,
      legal_puzzle_fens: 0,
      illegal_puzzle_fens: 0,
      invalid_puzzle_side_to_move: 0,
      missing_puzzle_solutions: 0,
      unknown_puzzle_categories: 0,
      unknown_motif_tags: 0,
      puzzle_live_eligible_violations: 0,
      puzzle_tournament_eligible_violations: 0,
    },
    openings: {
      count: 0,
      unique_fen_count: 0,
      duplicate_fen_count: 0,
      unique_eco_count: 0,
      source_labels: [],
      bot_start_eligible: 0,
      trainer_eligible: 0,
      position_setup_eligible: 0,
      live_competitive_eligible: 0,
      tournament_eligible: 0,
      transposition_candidates: 0,
    },
    puzzles: {
      candidate_count: 0,
      legal_fens: 0,
      illegal_fens: 0,
      valid_solution_san: 0,
      invalid_solution_san: 0,
      valid_solution_uci: 0,
      invalid_solution_uci: 0,
      unknown_categories: 0,
      unknown_motif_tags: 0,
      duplicate_positions: 0,
      missing_source_labels: 0,
      missing_license_metadata: 0,
      live_eligible_violations: 0,
      tournament_eligible_violations: 0,
    },
    safety: {
      production_mutations_attempted: false,
      live_game_hooks_detected: false,
      tournament_hooks_detected: false,
      copyrighted_prose_detected: false,
      scanned_or_ocr_material_detected: false,
      generic_chess_knowledge_table_detected: false,
    },
    inventory: [],
    recommendations: [],
    blockers: [],
  };
}

function inc(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

function walkFiles(root, acc = []) {
  if (!existsSync(root)) return acc;
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    const st = statSync(full);
    if (st.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

function listZipEntries(zipPath) {
  if (process.platform === 'win32') {
    try {
      const ps = [
        'Add-Type -AssemblyName System.IO.Compression.FileSystem',
        `$z = [System.IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}')`,
        '$z.Entries | ForEach-Object { $_.FullName + "|" + $_.Length }',
        '$z.Dispose()',
      ].join('; ');
      const raw = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const [entry, size] = line.split('|');
          return { entry: entry.trim(), size: Number(size) || 0 };
        });
    } catch {
      return [];
    }
  }
  try {
    const raw = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
    return raw
      .split(/\r?\n/)
      .slice(3)
      .filter((l) => /^\s+\d+/.test(l))
      .map((l) => {
        const m = l.trim().split(/\s+/);
        return { entry: m.slice(3).join(' '), size: Number(m[0]) || 0 };
      });
  } catch {
    return [];
  }
}

function classifyPath(relPath, ext) {
  const lower = relPath.toLowerCase();
  const notes = [];

  if (/modern-chess-openings|mco[- ]?15/i.test(lower)) {
    notes.push('MCO-15 reference material — private taxonomy only');
    return { bucket: 'unsafe_reference_only', category: 'copyrighted_opening_book_pdf', safe: false, notes };
  }
  if (/polgar|5334/i.test(lower)) {
    notes.push('POLGAR-5334 reference material — private taxonomy only');
    return { bucket: 'unsafe_reference_only', category: 'copyrighted_puzzle_book_pdf', safe: false, notes };
  }
  if (ext === '.pdf' || ext === '.docx' || ext === '.doc') {
    notes.push('Document likely contains copyrighted prose — reference-only');
    return { bucket: 'unsafe_reference_only', category: 'document_reference_only', safe: false, notes };
  }
  if (ext === '.zip') {
    if (/video|logo|badge|banner|pic/i.test(lower)) {
      return { bucket: 'unknown_manual_review', category: 'non_chess_zip', safe: false, notes: ['Unrelated to opening/puzzle staging'] };
    }
    return { bucket: 'unknown_manual_review', category: 'zip_container', safe: false, notes: ['Inspect zip contents manually before staging'] };
  }
  if (ext === '.json' && /source|provenance|license/i.test(lower)) {
    return { bucket: 'source_metadata', category: 'source_metadata_json', safe: true, notes };
  }
  if (ext === '.json' && /opening|eco|family|line/i.test(lower)) {
    return { bucket: 'opening_classification', category: 'opening_json', safe: true, notes };
  }
  if (ext === '.json' && /puzzle|tactic|motif|drill/i.test(lower)) {
    return { bucket: 'puzzles', category: 'puzzle_json', safe: true, notes };
  }
  if (ext === '.json' && /solution/i.test(lower)) {
    return { bucket: 'puzzle_solutions', category: 'puzzle_solution_json', safe: true, notes };
  }
  if (ext === '.json' && /normalized|accl/i.test(lower)) {
    return { bucket: 'normalized_accl_data', category: 'accl_normalized_json', safe: true, notes };
  }
  if (ext === '.pgn') {
    return { bucket: 'opening_moves', category: 'pgn', safe: true, notes: ['Verify license before import'] };
  }
  if (ext === '.csv') {
    return { bucket: 'unknown_manual_review', category: 'csv', safe: false, notes: ['Requires schema review'] };
  }
  if (ext === '.log' || ext === '.txt') {
    return { bucket: 'import_logs', category: 'log', safe: true, notes };
  }
  if (['.png', '.jpg', '.jpeg', '.mp4', '.ico'].includes(ext)) {
    return { bucket: 'unknown_manual_review', category: 'media_asset', safe: false, notes: ['Not chess data staging'] };
  }
  if (ext === '.json') {
    return { bucket: 'unknown_manual_review', category: 'json_unclassified', safe: false, notes };
  }
  return { bucket: 'unknown_manual_review', category: 'other', safe: false, notes: [`Unknown type ${ext || '(none)'}`] };
}

function fenKey(fen) {
  return String(fen).split(' ').slice(0, 4).join(' ');
}

function validateFen(fen, report) {
  if (!fen || typeof fen !== 'string') {
    report.validation.illegal_fens++;
    return null;
  }
  try {
    const c = new Chess(fen.trim());
    report.validation.legal_fens++;
    return c;
  } catch {
    report.validation.illegal_fens++;
    return null;
  }
}

function sideFromTurn(turn) {
  return turn === 'w' ? 'white' : 'black';
}

function validateSanSequence(chess, sans, report, scope = 'opening') {
  if (!Array.isArray(sans) || sans.length === 0) {
    report.validation.invalid_san_sequences++;
    if (scope === 'puzzle') report.puzzles.invalid_solution_san++;
    return null;
  }
  const board = new Chess(chess.fen());
  for (const san of sans) {
    let m;
    try {
      m = board.move(String(san));
    } catch {
      m = null;
    }
    if (!m) {
      report.validation.invalid_san_sequences++;
      if (scope === 'puzzle') report.puzzles.invalid_solution_san++;
      return null;
    }
  }
  report.validation.valid_san_sequences++;
  if (scope === 'puzzle') report.puzzles.valid_solution_san++;
  return board.fen();
}

function validateUciSequence(chess, ucis, report) {
  if (!Array.isArray(ucis) || ucis.length === 0) {
    report.validation.invalid_uci_sequences++;
    report.puzzles.invalid_solution_uci++;
    return null;
  }
  const board = new Chess(chess.fen());
  for (const uci of ucis) {
    const move = String(uci);
    const from = move.slice(0, 2);
    const to = move.slice(2, 4);
    const promotion = move.length > 4 ? move[4] : undefined;
    let m;
    try {
      m = board.move({ from, to, promotion });
    } catch {
      m = null;
    }
    if (!m) {
      report.validation.invalid_uci_sequences++;
      report.puzzles.invalid_solution_uci++;
      return null;
    }
  }
  report.validation.valid_uci_sequences++;
  report.puzzles.valid_solution_uci++;
  return board.fen();
}

function validatePuzzleFen(fen, report) {
  if (!fen || typeof fen !== 'string') {
    report.validation.illegal_puzzle_fens++;
    report.puzzles.illegal_fens++;
    report.validation.illegal_fens++;
    return null;
  }
  try {
    const c = new Chess(fen.trim());
    report.validation.legal_puzzle_fens++;
    report.puzzles.legal_fens++;
    report.validation.legal_fens++;
    return c;
  } catch {
    report.validation.illegal_puzzle_fens++;
    report.puzzles.illegal_fens++;
    report.validation.illegal_fens++;
    return null;
  }
}

function trackMetadata(row, report, scope) {
  if (!row.source_label && !row.sourceLabel) {
    report.validation.missing_source_labels++;
    if (scope === 'puzzle') report.puzzles.missing_source_labels++;
  }
  if (!row.license && !row.provenance && !row.source_type) {
    report.validation.missing_license_metadata++;
    if (scope === 'puzzle') report.puzzles.missing_license_metadata++;
  }
}

function processOpeningRecord(row, report, openingState) {
  trackMetadata(row, report, 'opening');
  validateEco(row.eco ?? row.eco_code ?? row.ecoFamily, report);

  if (row.source_label) openingState.sourceLabels.add(String(row.source_label));
  if (row.eco_code ?? row.eco) openingState.ecoCodes.add(String(row.eco_code ?? row.eco).toUpperCase());

  report.openings.count++;
  if (row.usable_for_bot_start) report.openings.bot_start_eligible++;
  if (row.usable_for_trainer) report.openings.trainer_eligible++;
  if (row.usable_for_position_setup) report.openings.position_setup_eligible++;
  if (row.usable_for_live_competitive) report.openings.live_competitive_eligible++;
  if (row.usable_for_tournament) report.openings.tournament_eligible++;

  const startFen = row.start_fen ?? row.position_fen;
  const startBoard = startFen ? validateFen(startFen, report) : null;

  if (row.resulting_fen) validateFen(row.resulting_fen, report);

  let terminalKey = null;
  if (row.move_prefix_san || row.movePrefixSan || row.san_sequence || row.moves_san) {
    const sans = row.san_sequence ?? row.moves_san ?? String(row.move_prefix_san ?? row.movePrefixSan ?? '').split(/\s+/).filter(Boolean);
    const start = startBoard ?? new Chess();
    const resultFen = validateSanSequence(start, sans, report, 'opening');
    if (resultFen) {
      if (row.resulting_fen && fenKey(resultFen) !== fenKey(row.resulting_fen)) {
        report.validation.invalid_san_sequences++;
        report.validation.valid_san_sequences = Math.max(0, report.validation.valid_san_sequences - 1);
      }
      terminalKey = fenKey(row.resulting_fen ?? resultFen);
    }
  } else if (row.resulting_fen) {
    terminalKey = fenKey(row.resulting_fen);
  }

  if (terminalKey) {
    if (openingState.fenCounts.has(terminalKey)) {
      report.validation.duplicate_positions++;
      report.openings.duplicate_fen_count++;
      if (openingState.fenCounts.get(terminalKey) !== String(row.id ?? row.opening_id ?? '')) {
        report.validation.transposition_candidates++;
        report.openings.transposition_candidates++;
      }
    } else {
      openingState.fenCounts.set(terminalKey, String(row.id ?? row.opening_id ?? terminalKey));
    }
  }

  if (row.alternate_move_orders && Array.isArray(row.alternate_move_orders)) {
    report.validation.wrong_move_order_candidates += row.alternate_move_orders.length;
  }
}

function processPuzzleCandidate(row, report, puzzleIndex, puzzleFenCounts) {
  trackMetadata(row, report, 'puzzle');
  report.puzzles.candidate_count++;

  if (row.usable_for_live_competitive) {
    report.validation.puzzle_live_eligible_violations++;
    report.puzzles.live_eligible_violations++;
  }
  if (row.usable_for_tournament) {
    report.validation.puzzle_tournament_eligible_violations++;
    report.puzzles.tournament_eligible_violations++;
  }

  if (row.category && !SUPPORTED_PUZZLE_CATEGORIES.has(String(row.category))) {
    report.validation.unknown_puzzle_categories++;
    report.puzzles.unknown_categories++;
  }

  for (const tag of row.motif_tags ?? []) {
    if (!KNOWN_MOTIF_TAGS.has(String(tag))) {
      report.validation.unknown_motif_tags++;
      report.puzzles.unknown_motif_tags++;
    }
  }

  const pFen = row.puzzle_fen ?? row.tactic_fen ?? row.fen;
  const pBoard = pFen ? validatePuzzleFen(pFen, report) : null;
  if (!pBoard) return;

  const expectedSide = row.side_to_move ?? row.sideToMove;
  if (expectedSide && sideFromTurn(pBoard.turn()) !== String(expectedSide)) {
    report.validation.invalid_puzzle_side_to_move++;
  }

  const pid = String(row.puzzle_id ?? row.id ?? createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0, 12));
  const fenPosKey = fenKey(pBoard.fen());
  if (puzzleIndex.has(pid)) report.validation.duplicate_puzzles++;
  else puzzleIndex.set(pid, fenPosKey);

  if (puzzleFenCounts.has(fenPosKey)) {
    report.validation.duplicate_puzzles++;
    report.puzzles.duplicate_positions++;
  } else {
    puzzleFenCounts.set(fenPosKey, pid);
  }

  const solution = row.solution_san ?? row.solution ?? row.solution_line;
  if (!solution || (Array.isArray(solution) && solution.length === 0)) {
    report.validation.missing_puzzle_solutions++;
    return;
  }

  const sol = Array.isArray(solution) ? solution : [solution];
  const sanFinal = validateSanSequence(pBoard, sol, report, 'puzzle');
  if (sanFinal && row.solution_uci) {
    const uciFinal = validateUciSequence(new Chess(pFen), row.solution_uci, report);
    if (uciFinal && fenKey(uciFinal) !== fenKey(sanFinal)) {
      report.validation.invalid_uci_sequences++;
      report.puzzles.invalid_solution_uci++;
      report.validation.valid_uci_sequences = Math.max(0, report.validation.valid_uci_sequences - 1);
      report.puzzles.valid_solution_uci = Math.max(0, report.puzzles.valid_solution_uci - 1);
    }
  } else if (row.solution_uci) {
    validateUciSequence(new Chess(pFen), row.solution_uci, report);
  }

  if (
    sanFinal &&
    typeof row.category === 'string' &&
    row.category.startsWith('mate_in_') &&
    !new Chess(sanFinal).isCheckmate()
  ) {
    report.validation.invalid_san_sequences++;
    report.puzzles.invalid_solution_san++;
    report.blockers.push(
      `Puzzle ${pid}: mate category but solution does not end in checkmate`,
    );
  }

  if (row.engine_verified === true || row.verification_status === 'engine_verified') {
    const prov = row.engine_provenance;
    const claimsWithoutRun =
      !prov ||
      !prov.engine_name ||
      !prov.verified_at ||
      (prov.depth == null && prov.movetime_ms == null);
    if (claimsWithoutRun) {
      report.blockers.push(
        `Puzzle ${pid}: verification metadata claims engine completion without reproducible provenance`,
      );
    }
  }
}

function validateEco(eco, report) {
  if (!eco) return;
  if (!ECO_RE.test(String(eco).trim())) report.validation.bad_eco_labels++;
}

function scanTextForHooks(text, report) {
  for (const p of LIVE_HOOK_PATTERNS) {
    if (p.test(text)) report.safety.live_game_hooks_detected = true;
  }
  for (const p of TOURNAMENT_HOOK_PATTERNS) {
    if (p.test(text)) report.safety.tournament_hooks_detected = true;
  }
  for (const t of FORBIDDEN_GENERIC_TABLES) {
    if (text.includes(t)) report.safety.generic_chess_knowledge_table_detected = true;
  }
}

function processStructuredJson(fullPath, data, report, positionIndex, puzzleIndex, openingState, puzzleFenCounts) {
  scanTextForHooks(JSON.stringify(data), report);

  const records = Array.isArray(data) ? data : [data];
  for (const row of records) {
    if (!row || typeof row !== 'object') continue;

    const recordType = row.record_type ?? row.recordType;

    if (recordType === 'opening_position') {
      processOpeningRecord(row, report, openingState);
      continue;
    }

    if (recordType === 'puzzle_candidate') {
      processPuzzleCandidate(row, report, puzzleIndex, puzzleFenCounts);
      continue;
    }

    if (recordType === 'tactical_taxonomy' || row.import_allowed !== undefined) {
      trackMetadata(row, report, 'opening');
      continue;
    }

    // Legacy fallback for unstructured records.
    trackMetadata(row, report, 'opening');
    validateEco(row.eco ?? row.eco_code ?? row.ecoFamily, report);

    if (row.puzzle_fen || row.tactic_fen || row.type === 'puzzle' || (row.fen && (row.solution_san || row.solution))) {
      processPuzzleCandidate(row, report, puzzleIndex, puzzleFenCounts);
      continue;
    }

    if (row.san_sequence || row.resulting_fen || row.opening_family) {
      processOpeningRecord(row, report, openingState);
    }
  }
}

function processPgn(fullPath, text, report, positionIndex) {
  scanTextForHooks(text, report);
  const games = text.split(/\n\n(?=\[)/).filter((g) => g.includes('[Event') || g.includes('[FEN'));
  for (const game of games) {
    const fenMatch = /\[FEN\s+"([^"]+)"/i.exec(game);
    const start = fenMatch ? validateFen(fenMatch[1], report) : validateFen(new Chess().fen(), report);
    if (!start) continue;
    const moves = game.replace(/\[.*?\]\s*/gs, '').trim();
    const sans = moves
      .replace(/\d+\.\s*/g, ' ')
      .split(/\s+/)
      .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
    const resultFen = validateSanSequence(start, sans, report);
    if (resultFen) {
      const key = fenKey(resultFen);
      if (positionIndex.has(key)) report.validation.duplicate_positions++;
      else positionIndex.set(key, basename(fullPath));
    }
  }
}

function runDryRun(inputRoot, reportPath) {
  const report = emptyReport();
  const inputAbs = resolve(inputRoot);
  const positionIndex = new Map();
  const puzzleIndex = new Map();
  const puzzleFenCounts = new Map();
  const openingState = {
    fenCounts: new Map(),
    ecoCodes: new Set(),
    sourceLabels: new Set(),
  };

  if (!existsSync(inputAbs)) {
    report.blockers.push(`Input path does not exist: ${inputAbs}`);
    report.recommendations.push('Create data/staging/opening-puzzle-zips and add ACCL-normalized JSON/PGN only.');
  } else {
    const files = walkFiles(inputAbs);
    report.inputs.extracted_files = files.length;

    for (const full of files) {
      const rel = relative(inputAbs, full);
      const ext = extname(full).toLowerCase();
      inc(report.inputs.file_types, ext || '(none)');

      const cls = classifyPath(rel, ext);
      report.buckets[cls.bucket]++;

      const entry = {
        path: full,
        relative_path: rel,
        bytes: statSync(full).size,
        extension: ext || '(none)',
        category: cls.category,
        bucket: cls.bucket,
        safe_for_structured_staging: cls.safe,
        notes: cls.notes,
      };
      report.inventory.push(entry);

      if (cls.bucket === 'unsafe_reference_only') {
        report.safety.copyrighted_prose_detected = true;
        if (ext === '.pdf') report.safety.scanned_or_ocr_material_detected = true;
      }

      if (ext === '.zip') {
        report.inputs.zip_files.push(rel);
        const entries = listZipEntries(full);
        for (const z of entries) {
          inc(report.inputs.file_types, extname(z.entry).toLowerCase() || '(zip-entry)');
          const zCls = classifyPath(z.entry, extname(z.entry).toLowerCase());
          report.buckets[zCls.bucket]++;
          report.inventory.push({
            path: `${full}::${z.entry}`,
            relative_path: `${rel}::${z.entry}`,
            bytes: z.size,
            extension: extname(z.entry).toLowerCase() || '(none)',
            category: zCls.category,
            bucket: zCls.bucket,
            safe_for_structured_staging: zCls.safe,
            notes: [...zCls.notes, 'zip entry inventory only — not extracted'],
          });
          if (zCls.bucket === 'unsafe_reference_only') {
            report.safety.copyrighted_prose_detected = true;
          }
        }
      }

      if (ext === '.json' && cls.safe) {
        try {
          const data = JSON.parse(readFileSync(full, 'utf8'));
          processStructuredJson(full, data, report, positionIndex, puzzleIndex, openingState, puzzleFenCounts);
        } catch {
          report.blockers.push(`Malformed JSON: ${rel}`);
        }
      }

      if (ext === '.pgn' && cls.safe) {
        try {
          processPgn(full, readFileSync(full, 'utf8'), report, positionIndex);
        } catch {
          report.blockers.push(`Malformed PGN: ${rel}`);
        }
      }
    }
  }

  report.openings.unique_fen_count = openingState.fenCounts.size;
  report.openings.unique_eco_count = openingState.ecoCodes.size;
  report.openings.source_labels = [...openingState.sourceLabels].sort();

  if (report.openings.live_competitive_eligible > 0 || report.openings.tournament_eligible > 0) {
    report.recommendations.push('Opening seed records must keep live/tournament usability flags false for staging.');
  }
  if (report.puzzles.live_eligible_violations > 0 || report.puzzles.tournament_eligible_violations > 0) {
    report.blockers.push('Puzzle candidate live/tournament usability flags must remain false.');
  }
  if (report.puzzles.unknown_categories > 0 || report.puzzles.unknown_motif_tags > 0) {
    report.recommendations.push('Align puzzle categories and motif tags with tactical-taxonomy-seed-sample.json.');
  }
  if (report.puzzles.candidate_count > 0 && report.puzzles.invalid_solution_san === 0) {
    report.recommendations.push('Puzzle candidates passed legality validation; engine verification remains a separate step.');
  }

  if (report.buckets.normalized_accl_data === 0 && report.buckets.opening_classification === 0 && report.buckets.puzzles === 0) {
    report.recommendations.push(
      'No ACCL-normalized structured staging files found. Add source-tagged JSON/PGN under data/staging/opening-puzzle-zips/.',
    );
  }
  if (report.safety.scanned_or_ocr_material_detected) {
    report.blockers.push('PDF/book reference material detected — keep private; do not ingest prose or scans.');
    report.recommendations.push('Use MCO-15 / POLGAR-5334 only as private taxonomy labels (MCO-15, POLGAR-5334).');
  }
  if (report.validation.missing_source_labels > 0) {
    report.recommendations.push('Every staged record needs source_label and license/provenance before real import.');
  }
  if (report.safety.generic_chess_knowledge_table_detected) {
    report.blockers.push('Generic chess_knowledge table reference detected — forbidden by ACCL doctrine.');
  }
  if (report.safety.live_game_hooks_detected) {
    report.blockers.push('Live-game hook patterns detected in staged content — not allowed.');
  }

  report.recommendations.push('Dry-run only — no production DB mutations performed.');
  report.recommendations.push('Next: author ACCL-normalized opening line seeds + puzzle candidates with explicit licenses.');

  const outPath = resolve(reportPath);
  mkdirSync(resolve(outPath, '..'), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  return report;
}

export {
  parseArgs,
  emptyReport,
  fenKey,
  validateFen,
  validateSanSequence,
  validateUciSequence,
  validatePuzzleFen,
  processOpeningRecord,
  processPuzzleCandidate,
  runDryRun,
};

function isDirectCliRun() {
  const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
  return import.meta.url === entry;
}

if (isDirectCliRun()) {
  const { input, report } = parseArgs(process.argv);
  const result = runDryRun(input, report);
  console.log(`Chess data dry-run complete.`);
  console.log(`  input:  ${resolve(input)}`);
  console.log(`  report: ${resolve(report)}`);
  console.log(`  files:  ${result.inputs.extracted_files}`);
  console.log(`  zips:   ${result.inputs.zip_files.length}`);
  console.log(`  blockers: ${result.blockers.length}`);
  if (result.blockers.length) {
    for (const b of result.blockers) console.log(`    - ${b}`);
  }
  process.exit(result.blockers.length > 0 ? 2 : 0);
}
