# Opening / puzzle staging (local only)

Place **ACCL-normalized** JSON/CSV/PGN exports here for dry-run validation.

Do **not** commit:

- Copyrighted book PDFs or scans
- OCR dumps from MCO / Polgar books
- Raw puzzle sets copied from copyrighted books

Private reference PDFs stay outside the repo (e.g. operator `D:\ACCL\`).

Dry-run:

```bash
npm run chess-data:dry-run -- --input ./data/staging/opening-puzzle-zips --report ./tmp/chess-data-dry-run-report.json
```

Optional external reference scan (inventory only, no import):

```bash
npm run chess-data:dry-run -- --input "D:/ACCL" --report ./tmp/chess-data-dry-run-report.json
```
