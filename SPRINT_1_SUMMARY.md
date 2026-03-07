# Sprint 1 Summary: SparkOps Data Factory (Voice-to-Cash)

## Architecture Overview

Sprint 1 delivers the SparkOps **Data Factory** pipeline for NZ electricians:

1. Voice notes (audio/text) are normalized into professional invoice descriptions.
2. Receipt images are extracted into structured supplier/date/line items.
3. Material matching is performed against pgvector embeddings in PostgreSQL.
4. Invoice totals are calculated locally with `decimal.Decimal` (no AI math).

### Core Components

- **API**: `backend/main.py` (FastAPI)
- **Translator**: `backend/services/translator.py` (`gpt-5.4` + `gpt-5-nano` fallback)
- **Vision**: `backend/services/vision.py` (`gpt-5.4` multimodal)
- **Math Engine**: `backend/services/math_utils.py` (`Decimal` only)
- **Schema**: `backend/models/database.py` (`SQLModel` + `pgvector`)

## Data Flow

### 1) Ingest Request
`POST /api/ingest` accepts:

- `voice_notes` (optional plain text)
- `audio_base64` (optional base64 audio)
- `receipt_image_base64` (optional base64 image)

### 2) Voice Path
- If `voice_notes` is present, it is used directly.
- Otherwise `audio_base64` is transcribed with **`gpt-4o-mini-transcribe`**.

### 3) Translation Path
- Translator applies hardcoded Kiwi mappings first for deterministic high-value phrases.
- For non-trivial slang, **`gpt-5.4`** performs professional extraction.
- If formatting is invalid JSON, **`gpt-5-nano`** repairs output into strict JSON.

### 4) Vision Path
- `receipt_image_base64` is sent to **`gpt-5.4`** with extraction instructions.
- Supplier, date, and line items are extracted.
- Trade-vs-retail rule: **lowest numerical price is always selected**.

### 5) Vector Match
- Invoice descriptions are embedded and compared with `Material.vector_embedding`.
- Nearest material(s) are returned as `vector_matches`.

### 6) Math Verification
- Subtotal = sum(qty × unit_price)
- GST = subtotal × 0.15
- Total = subtotal + GST
- Validation: `|(total - gst) - subtotal| <= 0.01`

## API Schema (Ingest)

### Request
```json
{
  "voice_notes": "Hori in the cupboard",
  "audio_base64": null,
  "receipt_image_base64": "..."
}
```

### Response
```json
{
  "transcript": "Hori in the cupboard",
  "supplier": "J.A. Russell",
  "receipt_date": "2026-03-07",
  "invoice_lines": [
    {
      "description": "Installed Horizontal Hot Water Cylinder.",
      "qty": "1.00",
      "unit_price": "450.00",
      "line_total": "450.00",
      "type": "Material"
    }
  ],
  "subtotal": "450.00",
  "gst": "67.50",
  "total": "517.50",
  "vector_matches": []
}
```

## Test Suite

From `backend/`:

```bash
pytest tests/unit/test_math.py
pytest tests/unit/test_translator.py
pytest tests/functional/test_ingest_api.py
pytest
```

### Performance (Locust)

From `backend/`:

```bash
locust -f tests/locustfile.py --host http://127.0.0.1:8000
```

### Security SAST (Bandit)

From repo root:

```bash
sh backend/scripts/run_security_sast.sh
```

## Notes

- Financial calculations are strictly local using `Decimal`.
- No AI tool use for arithmetic.
- Translator includes deterministic Kiwi slang mapping for:
  - "Chucked a Hori in the cupboard"
  - "Hori in the cupboard"
  - "Ran some 2.5 twin and earth"
  - "Stuck a jbox in the roof"
