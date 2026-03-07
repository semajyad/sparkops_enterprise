# Sprint 2 Summary: SparkOps "Basement" Interface (The Ear)

## Objective

Deliver an **offline-first PWA frontend** for NZ electricians that captures job data instantly in low/no-signal conditions and automatically syncs to Sprint 1 backend ingest when connectivity returns.

---

## Implemented Architecture

### Frontend Stack

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS
- **Offline Storage:** IndexedDB
- **Sync Triggering:** Service Worker + online event listeners

### Key Modules

- Capture UI: `frontend/src/app/capture/page.tsx`
- Sync context provider: `frontend/components/SyncProvider.tsx`
- IndexedDB layer: `frontend/lib/db.ts`
- Sync engine: `frontend/lib/syncManager.ts`
- PWA manifest: `frontend/public/manifest.json`
- Service worker: `frontend/public/sw.js`

---

## Data Model (IndexedDB)

Store: `jobDrafts`

Schema fields:

- `id` (auto-increment)
- `timestamp`
- `voice_text` (optional)
- `audio_blob_base64` (optional)
- `receipt_image_base64` (optional)
- `sync_status` (`pending` | `synced` | `failed`)

---

## Offline-First Behavior

### Immediate Local Persistence

User inputs are saved to IndexedDB **without waiting for network requests**:

- Voice text changes are persisted locally.
- Audio captures are persisted locally.
- Receipt image captures are persisted locally.

This guarantees zero-latency capture in basement/no-signal scenarios.

### Zombie Mode Sync

When online:

1. App queries drafts where `sync_status === "pending"`.
2. Each draft is POSTed to `/api/ingest`.
3. On success:
   - `sync_status` set to `synced`
   - `audio_blob_base64` and `receipt_image_base64` cleared to free storage.
4. On failure:
   - record remains `pending` for retry.

Triggers:

- App load
- Browser `online` event
- Service worker background sync message (`TRIGGER_SYNC`)
- Manual "Force Sync Pending Drafts" button

---

## UX/Status Indicators

Capture page includes:

- Network state badge: **Offline / Online / Syncing**
- Pending draft count
- Status messages for local save and sync progress
- Large action controls:
  - **Record Voice**
  - **Scan Receipt**
  - **Save Draft Offline Now**

---

## PWA Configuration

- Manifest configured for installability: `frontend/public/manifest.json`
- Service worker script: `frontend/public/sw.js`
- Next.js headers enforce manifest/SW freshness: `frontend/next.config.ts`

---

## How to Run

From `frontend/`:

```bash
npm install
npm run dev
```

Open: `http://localhost:3000/capture`

---

## Offline Test Procedure

1. Open app at `/capture`.
2. Open browser DevTools → Network → set **Offline**.
3. Enter text and/or upload audio/image.
4. Confirm status message indicates local IndexedDB persistence.
5. In Application tab → IndexedDB, verify records in `jobDrafts` with `sync_status: pending`.
6. Switch Network back to **Online**.
7. Confirm auto-sync begins (badge shows `Syncing`) and pending count decreases.
8. Verify synced records have heavy base64 payloads removed.

---

## Notes

- Backend endpoint expected: `${NEXT_PUBLIC_API_BASE_URL}/api/ingest`
- Default API base fallback: `http://127.0.0.1:8000`
- This implementation prioritizes immediate local durability before network activity.
