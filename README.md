# Leo's Deal Hunter

Static, mobile-friendly deal board for Amazon Prime Big Deal Days.  
No build step — open with a local static server (or any host that serves the folder).

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page shell |
| `styles.css` | Dark modern UI |
| `app.js` | Filters, sort, 30s poll of `deals.json`, copy-link |
| `deals.json` | **Live data source** — edit this to update the board |
| `update-deals.example.json` | Same schema as `deals.json` (template) |
| `serve.sh` | Local static server on port **8765** |
| `assets/` | Optional images / icons |

## Quick start

```bash
cd /path/to/deal-board
./serve.sh
# open http://127.0.0.1:8765/
```

Or with Python / Node directly:

```bash
python3 -m http.server 8765
# or: npx --yes serve -l 8765 .
```

> Opening `index.html` via `file://` may block `fetch('deals.json')` in some browsers. Prefer `./serve.sh`.

## Updating deals

1. Copy the template (optional):  
   `cp update-deals.example.json deals.json`
2. Edit `deals.json`:
   - Set `updatedAt` to the verification time (ISO 8601 with offset, e.g. `2026-10-06T19:26:00-07:00`).
   - Keep `eventEnds` accurate for the sale window.
   - Update each deal’s `price`, `list`, `badge`, `atl`, `note`, and `url` as needed.
3. Save the file. The open board will pick up changes on the next **30-second poll** (or reload the page).

### Deal object fields

```json
{
  "id": "B0EXAMPLE",
  "name": "Product display name",
  "price": 99.99,
  "list": 149.99,
  "category": "kitchen",
  "badge": "Prime Big Deal",
  "atl": "near-atl",
  "atlStatus": "near-atl",
  "atlPrice": 89.99,
  "atlNote": "Camel Amazon ATL $89.99 (date/source)",
  "url": "https://www.amazon.com/dp/B0EXAMPLE",
  "note": "Optional short note",
  "image": "assets/B0EXAMPLE.webp"
}
```

- **category**: one of `electronics` | `headphones` | `home` | `kitchen` | `beauty` (chip filters).
- **atl** / **atlStatus**: `atl` | `near-atl` (board rule: every card must be one of these). Legacy `sale` / `stale` kept in CSS only.
- **atlPrice** (number, required): documented all-time-low dollar amount shown on the card (`ATL $X` or `Near-ATL · lowest $X`).
- **atlNote**: short source/date string (tooltip).
- **% off** is computed client-side from `price` and `list`.
- Deals that cannot support an ATL/near-ATL claim: list in `/workspace/deal-board-atl-gaps.md` — do not invent numbers.

### Schema root

```json
{
  "updatedAt": "2026-10-06T19:26:00-07:00",
  "eventEnds": "2026-10-07T23:59:00-07:00",
  "deals": [ /* ... */ ]
}
```

## Share / deploy

- Zip contents with `index.html` at the zip root (see `/workspace/deal-board-share.zip`).
- Upload the folder (or unzip) to any static host: GitHub Pages, Netlify, S3, nginx, etc.
- Use **Copy link** in the header once hosted.

## Notes

- Prices are verified while signed into Amazon; not financial advice; links go to Amazon.
- This site does not scrape Amazon — you update `deals.json` manually or via your own tooling.
