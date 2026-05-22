# ACCL Chess Knowledge Architecture

Authority-separated layers for openings, tactics, vault history, engine artifacts, repertoire, and AI explanation.

**Status:** MVP foundation (`20260601120000_chess_knowledge_layer_foundation.sql` + `lib/chessKnowledge/*`).

---

## Audit summary (pre-foundation)

| Area | Existing state |
|------|----------------|
| **Vault / finished games** | `games`, `game_move_logs`; finish pipeline |
| **Engine analysis** | `finished_game_analysis_jobs`, `finished_game_analysis_artifacts`, `get_finished_game_analysis_intake` (finished-only) |
| **Trainer (legacy)** | `player_pattern_profiles`, `trainer_generated_positions`; `assertTrainerAnalysisAllowed` blocks active/tournament |
| **Opening encyclopedia DB** | **None** — design doc only: `docs/phase-locks/OPENING_ENCYCLOPEDIA_AUDIT.md` |
| **Puzzle DB** | **None** — tactical taxonomy not yet stored |
| **Generic `chess_knowledge` table** | **None** (explicitly forbidden) |
| **Nexus / Battlefield coupling** | Nexus reads analysis artifacts via adapters; no encyclopedia tables |

---

## Layer map

| Layer | Purpose | Authority | Tables / modules |
|-------|---------|-----------|------------------|
| **Source registry** | MCO-15, POLGAR-5334 labels | Reference metadata only | `chess_knowledge_sources` |
| **Opening encyclopedia** | Names, families, prefixes, themes | Classification — **not truth** | `chess_opening_families`, `chess_opening_lines` |
| **Tactical encyclopedia** | Training categories/tags | Training material — verified before use | `chess_tactical_categories`, `chess_tactical_tags` |
| **Vault** | Canonical completed games | Historical record | `games`, `game_move_logs` (existing) |
| **Engine artifacts** | Stockfish/tablebase outputs | Chess truth (below tablebase) | `finished_game_analysis_*` (existing) |
| **Finished linkage** | Post-game opening/tactic links | Derived from finished games | `finished_game_opening_matches`, `finished_game_tactic_extractions` |
| **Repertoire intelligence** | Player opening identity | Derived — reconstructable | `player_repertoire_entries`, `player_opening_color_stats` |
| **AI explanation payloads** | Mentor-safe structs | Explanation only | `lib/chessKnowledge/mentorPayloads.ts` (no raw authority) |

---

## Truth hierarchy (constitutional)

1. Legal move validation  
2. Tablebases (where applicable)  
3. Engine evaluation  
4. Opening encyclopedia classification  
5. Repertoire / player pattern context  
6. Trainer / AI explanation  

Opening books identify the road; engine/tablebase verify it. AI never overrides engine truth.

---

## Placement routes

| Content | Route | Forbidden |
|---------|-------|-----------|
| Opening encyclopedia | PROFILE → TRAINER → Repertoire | Nexus, Battlefield, live-board assist |
| Tactical encyclopedia | PROFILE → TRAINER → Tactical / RoboDrill | Tournament-active assist, live board |
| Vault | Finished games only | Active game analysis intake |
| Engine artifacts | Post-game pipelines | Raw mentor access |

---

## Copyright / intake rules

- **MCO-15** and **POLGAR-5334** are `source_label` registry rows only.  
- No PDF text, scans, chapter summaries, or public book prose.  
- Seeds: family names, move prefixes, taxonomy tags, `source_reference` labels.  
- Puzzle positions from copyrighted books are **not** ingested in MVP.

---

## MVP stages implemented

| Stage | Delivered |
|-------|-----------|
| 1 Source registry | `MCO-15`, `POLGAR-5334` rows |
| 2 Schema separation | Layered tables (no generic blob) |
| 3 Opening seed | 17 families (metadata only) |
| 4 Tactical seed | 7 categories + 22 tags |
| 5–8 Pipelines | RPC guard + TS guards; detection/aggregation jobs **not** wired yet |
| AI payloads | `buildTrainerExplanationPayload`, sanitizers |

---

## Guards

- **DB:** `upsert_finished_game_opening_match` calls `get_finished_game_analysis_intake`.  
- **TS:** `assertFinishedGameKnowledgeIntake`, `assertNoActiveTournamentKnowledgeUse`.  
- **Trainer:** `assertTrainerAnalysisAllowed` (existing).  
- **Tests:** `tests/unit/chessKnowledgeLayerSeparation.spec.ts`.

---

## Next implementation (post-MVP)

1. Finished-game opening prefix matcher → `upsert_finished_game_opening_match`.  
2. Engine-complete tactic scanner → `finished_game_tactic_extractions`.  
3. Repertoire aggregator → `player_repertoire_entries`.  
4. Mentor API consumes `TrainerExplanationPayload` only.  
5. RoboDrill assignment from verified puzzles (new `trainer_puzzles` table when ready).

Do **not** merge opening/tactic/repertoire into one table. Do **not** expose encyclopedia data on live game routes.
