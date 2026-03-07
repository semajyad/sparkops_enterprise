# SparkOps QA Report

## Scope Executed

This report covers:

1. Frontend architecture cleanup and canonical path enforcement.
2. Backend QA additions for Sprint 1 ingest and math edge cases.
3. Frontend QA additions for Sprint 2 IndexedDB + network indicator behavior.
4. Playwright E2E setup and offline-sync execution attempt.

---

## Phase 1: Architecture Cleanup Results

### Canonical Frontend Structure

Standardized to `src/` implementation path:

- `frontend/src/app/*`
- `frontend/src/components/*`
- `frontend/src/lib/*`

Duplicate folders outside `src/` were removed:

- `frontend/components` (deleted)
- `frontend/lib` (deleted)

### Dependency Installation

Executed in `frontend/`:

- `npm install` (base install)
- `npm install` (after adding Jest/Playwright/testing dependencies)

Both succeeded.

### Build Proof

Executed:

- `npm run build`

Result: **failed due environment runtime constraint**

- Next.js requires Node `>=20.9.0`
- Local environment currently Node `20.2.0`

No unresolved import-path errors were reported in the build step; failure occurred before compile due Node version gate.

---

## Backend Testing Added (Sprint 1)

### Integration Tests (main.py, mocked OpenAI dependencies)

File:
- `backend/tests/integration/test_main_ingest_integration.py`

Covers:

1. Full ingest flow from audio payload to invoice output with mocked OpenAI-dependent calls:
   - audio transcription mocked via `main.get_openai_client`
   - receipt extraction mocked
   - vector matches mocked
   - validates transcript, supplier/date, line outputs, subtotal/GST/total
2. Input contract validation:
   - 400 response when neither `voice_notes` nor `audio_base64` is provided

### Edge Case Unit Tests (math_utils.py)

File:
- `backend/tests/unit/test_math.py`

Added edge coverage:

1. Zero values path (`0 qty`, `0 unit_price`)
2. Massive quantity arithmetic (large Decimal totals)
3. Missing field / invalid input behavior:
   - `unit_price=None` raises `TypeError`
   - incomplete line object raises `AttributeError`

### Backend Test Execution

Executed:

- `python -m pytest tests/unit/test_math.py tests/integration/test_main_ingest_integration.py -q`

Result:

- `7 passed, 1 skipped`

---

## Frontend Testing Added (Sprint 2)

### Jest Setup

Added:

- `frontend/jest.config.js`
- `frontend/jest.setup.ts`
- package scripts: `test`, `test:watch`, `test:e2e`
- testing dependencies in `frontend/package.json`

### IndexedDB Unit Tests

File:
- `frontend/src/lib/__tests__/db.test.ts`

Covers:

1. Draft save + pending retrieval path
2. Draft update path and pending queue removal after status changes to `synced`

### Capture Interface Component Tests

File:
- `frontend/src/app/capture/__tests__/page.test.tsx`

Covers:

1. Offline indicator visibility (`Offline · N pending`)
2. Syncing indicator visibility (`Syncing · N pending`)

### Frontend Jest Execution

Executed:

- `npm test -- --runInBand`

Result:

- `2 test suites passed`
- `4 tests passed`

---

## End-to-End Testing (Playwright)

### Setup and Test Added

Added:

- `frontend/playwright.config.ts`
- `frontend/tests/e2e/offline-sync.spec.ts`

E2E scenario implemented:

1. Load capture page
2. Switch browser context offline
3. Save voice note draft
4. Assert pending drafts in IndexedDB
5. Switch online
6. Trigger sync and assert pending count returns to zero

### Playwright Execution

Executed:

- `npx playwright install` (successful)
- `npm run test:e2e` (failed)

Failure reason:

- Next dev server cannot start with Node 20.2.0
- Required Node version for Next 16 is `>=20.9.0`

---

## Vulnerabilities / Risks Discovered

1. **Runtime Compatibility Risk (High, environment blocker)**
   - Frontend build/e2e blocked by Node version mismatch (`20.2.0` vs required `>=20.9.0`).

2. **Dependency Security Signal (Low)**
   - `npm install` reported **4 low severity vulnerabilities** in frontend dependency graph.
   - Recommended follow-up: `npm audit` then selectively patch.

3. **Offline Data Retention Risk (Design-level, medium)**
   - Drafts marked `failed` are not currently surfaced distinctly in capture UI.
   - Status exists in schema but UX lacks explicit failed-sync remediation workflow.

---

## Recommended Immediate Remediation

1. Upgrade local Node runtime to `>=20.9.0` and re-run:
   - `npm run build`
   - `npm run test:e2e`
2. Run `npm audit` and apply safe dependency upgrades.
3. Add explicit UI lane for `failed` sync records (retry/inspect controls).
