# Samplio HTTP API

This is the local POC's API, not the separate ChatPOC contributor API. No `cpn_` key is used here.

Base URL: `http://127.0.0.1:3001/api`.

JSON requests use `Content-Type: application/json`. Multipart requests let the HTTP client set the boundary. Responses are JSON except QR, backup and Excel downloads. Errors use `{ "error": "message" }` and appropriate HTTP status codes. The UI translates known server messages for English users.

## Authentication

`POST /login` accepts `username` and `password` and sets an HTTP-only, SameSite=Lax `samplio` cookie. Sessions last 24 hours. Keep the cookie for later calls. Browser writes must come from the application's origin, an explicitly configured `PUBLIC_ORIGIN`, or the local development origin when not in production mode.

Read the local fixture credentials in [README.md](../README.md#local-demo-accounts). Do not place real account passwords into committed scripts or screenshots.

```javascript
// Run on the application's origin, after signing in.
const response = await fetch('/api/samples');
const samples = await response.json();
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Unauthenticated health check |
| POST | `/login` | Sign in: `{username, password}` |
| POST | `/logout` | Revoke the current session |
| GET | `/me` | Current account and role |
| GET | `/samples` | All records visible to the current account |
| GET | `/samples/:id` | Sample with interaction totals, comments and `canEdit` |
| GET | `/samples/:id?rev=N` | Same read, with QR version validation (410 if stale) |
| POST | `/uploads` | Upload `image` as multipart; returns path, color and suggested name |
| POST | `/samples` | Create an unpublished record with an owned upload |
| PUT | `/samples/:id` | Edit owned record, or any record as administrator |
| POST | `/samples/delete` | Atomic bulk soft delete: `{ids: [...]}` |
| POST | `/samples/:id/publish` | Publish: `{deadline: ISODate, notes?: string}` |
| POST | `/samples/:id/reactions` | Toggle `{kind: "like" | "favorite"}` |
| POST | `/samples/:id/comments` | Comment or reply: `{body, parent_id?: commentId}` |
| DELETE | `/comments/:id` | Delete own comment; administrator can delete any accessible comment |
| GET | `/samples/:id/qr` | PNG QR linking to the current sample revision |
| POST | `/search/image` | Multipart `image` and `threshold` (0–100); visible matches in descending order |
| GET | `/rankings?period=all` | `today`, `week`, `month` or `all`; UTC periods |
| POST | `/export` | XLSX: `{ids: [...], period?: "today"|"week"|"month"|"all", lang?: "en"|"zh"}` |
| GET | `/settings` | Current prefix, threshold and weights |
| PUT | `/settings` | Administrator: `{prefix, threshold, like, favorite, comment}` |
| GET | `/admin/users` | Administrator: account list without password hashes |
| PUT | `/admin/users/:id` | Administrator: `{role: "admin" | "employee"}`; cannot change own role |
| GET | `/admin/logs` | Administrator: latest 500 audit events |
| GET | `/admin/trash` | Administrator: deleted samples |
| POST | `/admin/restore/:id` | Administrator: restore one deleted sample |
| GET | `/admin/backup` | Administrator: JSON business snapshot |
| POST | `/admin/backup/restore` | Administrator: transactionally restore a valid same-installation snapshot |

## Create a sample

Upload an image first; then use the returned path. A newly uploaded path must belong to the signed-in user. IDs, sample codes, owner and timestamps are generated server-side.

```json
{
  "name": "Linen table lamp",
  "category": "灯具",
  "color": "Ivory",
  "length": 28,
  "width": 28,
  "height": 45,
  "image": "/uploads/<returned-file-id>.webp",
  "notes": "Review light consistency and base stability."
}
```

Category values are stable stored identifiers: `家居饰品` (Home decor), `家具` (Furniture), `灯具` (Lighting), `纺织品` (Textiles), `其他` (Other). The interface translates their labels. Dimensions are in centimeters; use `null` or an empty string when unmeasured. Positive supplied dimensions must be at most 100,000 cm.

Uploads are limited to 8 MB and 25 million decoded pixels, re-encoded as WebP, and resized to at most 1600×1600. Original metadata is discarded. Uploads are served through an authorization check; demo thumbnails are intentionally public example assets.

## Snapshot restore

The snapshot has `version: 1`, `created_at`, `settings`, `samples`, `reactions` and `comments`.

Restore is intended for the **same installation**. It upserts sample records, restores interaction state, soft-deletes current samples absent from the snapshot and increments QR revisions. Accounts, current settings, counters, sessions and audit logs are retained. Existing image files must remain on disk. The `settings` snapshot field is informational, not applied by restore. Invalid restore operations roll back the transaction.

For a complete backup, stop the server and copy `data/` including the SQLite database and uploads. Treat business snapshots as private business data, not public repository files.

## Optional WebMCP

When supported, the page registers two tools with `document.modelContext`:

- `search_samples({query?: string})`: reads visible samples and returns a compact list.
- `open_sample_details({id: string})`: opens the same detail panel used by the UI; does not alter the record.

The tools share the signed-in user's session and API access checks. Unsupported browsers simply use the normal interface. Browser support was unavailable in the acceptance environment, so native WebMCP execution is not claimed as verified.
