"""SparkOps Sprint 1 API entrypoint.

This module exposes the voice-and-receipt ingestion endpoint that transforms
raw inputs into verified invoice JSON.
"""

from __future__ import annotations

import base64
import logging
import os

from decimal import Decimal
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - compatibility with legacy OpenAI SDK
    OpenAI = None  # type: ignore[assignment]

from models.database import Material, create_db_and_tables, get_engine
from routers.eta import router as eta_router
from routers.twilio import router as twilio_router
from services.math_utils import (
    InvoiceMathLine,
    calculate_invoice_totals,
    calculate_line_total,
)
from services.translator import KiwiTranslator
from services.vision import ReceiptExtraction, ReceiptVisionEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="SparkOps Data Factory API",
    description="Voice-to-cash ingestion engine for NZ electricians.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://proactive-strength-staging.up.railway.app"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Twilio-Signature"],
)

app.include_router(twilio_router)
app.include_router(eta_router)

@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    """Return structured JSON errors for explicit HTTP exceptions."""

    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """Return structured JSON errors for request validation failures."""

    first_error = exc.errors()[0] if exc.errors() else {"msg": "Invalid request."}
    return JSONResponse(status_code=422, content={"error": str(first_error.get("msg", "Invalid request."))})

@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Return structured JSON errors for unexpected server failures."""

    logger.exception("Unhandled API error")
    return JSONResponse(status_code=500, content={"error": str(exc)})

translator_service = KiwiTranslator()
vision_service = ReceiptVisionEngine()

ENGINE = get_engine()
try:
    create_db_and_tables(ENGINE)
except Exception as exc:  # pragma: no cover - startup resilience for local/dev tests
    logger.warning("Database initialization skipped: %s", exc)


class HealthResponse(BaseModel):
    """Health endpoint response.

    Attributes:
        status: Service health status.
        service: Service identifier.
        version: API version string.
    """

    status: str
    service: str
    version: str


class IngestRequest(BaseModel):
    """Payload for `/api/ingest`.

    Attributes:
        voice_notes: Optional pre-transcribed text notes.
        audio_base64: Optional base64 audio to transcribe with `gpt-4o-mini-transcribe`.
        receipt_image_base64: Optional base64 receipt image.
    """

    voice_notes: str | None = None
    audio_base64: str | None = None
    receipt_image_base64: str | None = None


class InvoiceLineOut(BaseModel):
    """Invoice line response model.

    Attributes:
        description: Professional line description.
        qty: Quantity used for calculations.
        unit_price: Unit price as currency value.
        line_total: Quantity multiplied by unit price.
        type: Material or Labor classification.
    """

    description: str
    qty: Decimal
    unit_price: Decimal
    line_total: Decimal
    type: str


class MatchedMaterialOut(BaseModel):
    """Material similarity match output.

    Attributes:
        query: Source description that was matched.
        sku: Matched material SKU.
        name: Matched material catalog name.
        trade_price: Matched trade price.
    """

    query: str
    sku: str
    name: str
    trade_price: Decimal


class IngestResponse(BaseModel):
    """Structured invoice response from the ingest pipeline.

    Attributes:
        transcript: Final source text used for translation.
        supplier: Receipt supplier if detected.
        receipt_date: Receipt date if detected.
        invoice_lines: Verified invoice lines.
        subtotal: Calculated subtotal.
        gst: Calculated GST.
        total: Final invoice total.
        vector_matches: Best material matches discovered by embeddings.
    """

    transcript: str
    supplier: str | None
    receipt_date: str | None
    invoice_lines: list[InvoiceLineOut]
    subtotal: Decimal
    gst: Decimal
    total: Decimal
    vector_matches: list[MatchedMaterialOut] = Field(default_factory=list)


def get_openai_client() -> OpenAI:
    """Return a configured OpenAI client.

    Returns:
        OpenAI: OpenAI SDK client.

    Raises:
        RuntimeError: If `OPENAI_API_KEY` is not configured.
    """

    if OpenAI is None:
        raise RuntimeError("OpenAI SDK >= 1.0.0 is required. Install `openai` from requirements.txt.")

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required.")
    return OpenAI(api_key=api_key)


def transcribe_audio(audio_base64: str) -> str:
    """Transcribe base64 audio using `gpt-4o-mini-transcribe`.

    Args:
        audio_base64: Base64-encoded audio file bytes.

    Returns:
        str: Transcribed text.
    """

    normalized_audio_base64 = audio_base64.strip()
    if normalized_audio_base64.startswith("data:") and "," in normalized_audio_base64:
        normalized_audio_base64 = normalized_audio_base64.split(",", 1)[1]

    # Validate payload is decodable base64 before sending to model.
    base64.b64decode(normalized_audio_base64)

    client = get_openai_client()
    response = client.chat.completions.create(
        model="gpt-4o-mini-transcribe",
        modalities=["text"],
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Transcribe this audio exactly."},
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": normalized_audio_base64,
                            "format": "wav",
                        },
                    },
                ],
            }
        ],
    )

    message_content = response.choices[0].message.content
    if isinstance(message_content, str):
        return message_content.strip()

    if isinstance(message_content, list):
        text_chunks = [chunk.text for chunk in message_content if getattr(chunk, "type", None) == "text"]
        return "".join(text_chunks).strip()

    return ""


def embed_text(text: str) -> list[float]:
    """Generate a 3072-dimensional embedding for vector matching.

    Args:
        text: Text to embed.

    Returns:
        list[float]: Embedding vector.
    """

    client = get_openai_client()
    response = client.embeddings.create(model="text-embedding-3-large", input=text)
    return response.data[0].embedding


def vector_match_materials(descriptions: list[str], limit: int = 1) -> list[MatchedMaterialOut]:
    """Find nearest material matches in pgvector space.

    Args:
        descriptions: Normalized invoice descriptions to match.
        limit: Max matches returned per description.

    Returns:
        list[MatchedMaterialOut]: Similarity match candidates.
    """

    matches: list[MatchedMaterialOut] = []
    with Session(ENGINE) as session:
        for description in descriptions:
            try:
                query_embedding = embed_text(description)
            except Exception as exc:
                logger.warning("Embedding generation failed for '%s': %s", description, exc)
                continue

            statement = (
                select(Material)
                .order_by(Material.vector_embedding.cosine_distance(query_embedding))
                .limit(limit)
            )
            result = session.exec(statement).all()
            for material in result:
                matches.append(
                    MatchedMaterialOut(
                        query=description,
                        sku=material.sku,
                        name=material.name,
                        trade_price=material.trade_price,
                    )
                )

    return matches


def build_invoice_lines(
    translated_lines: list[str],
    receipt: ReceiptExtraction,
    vector_matches: list[MatchedMaterialOut],
) -> list[InvoiceLineOut]:
    """Build invoice lines from translated text and receipt extraction.

    Args:
        translated_lines: Professional descriptions from translator.
        receipt: Structured receipt extraction.
        vector_matches: Material matches from vector search.

    Returns:
        list[InvoiceLineOut]: Invoice-ready lines.
    """

    lines: list[InvoiceLineOut] = []
    material_price_lookup = {match.query: match.trade_price for match in vector_matches}
    default_labor_rate = Decimal(os.getenv("DEFAULT_LABOR_RATE", "95.00"))

    for description in translated_lines:
        qty = Decimal("1.00")
        matched_price = material_price_lookup.get(description)
        unit_price = matched_price if matched_price is not None else default_labor_rate
        line_type = "Material" if matched_price is not None else "Labor"
        lines.append(
            InvoiceLineOut(
                description=description,
                qty=qty,
                unit_price=unit_price,
                line_total=calculate_line_total(qty=qty, unit_price=unit_price),
                type=line_type,
            )
        )

    for receipt_item in receipt.line_items:
        lines.append(
            InvoiceLineOut(
                description=receipt_item.description,
                qty=receipt_item.quantity,
                unit_price=receipt_item.unit_price,
                line_total=calculate_line_total(
                    qty=receipt_item.quantity,
                    unit_price=receipt_item.unit_price,
                ),
                type="Material",
            )
        )

    return lines


@app.get("/", response_model=HealthResponse)
def root() -> HealthResponse:
    """Return API health status.

    Returns:
        HealthResponse: Health metadata for root endpoint.
    """

    return HealthResponse(status="healthy", service="sparkops-data-factory", version="1.0.0")


@app.post("/api/ingest", response_model=IngestResponse)
def ingest(payload: IngestRequest) -> IngestResponse:
    """Ingest voice/text + receipt image and return verified invoice JSON.

    Args:
        payload: Ingestion payload with optional audio/text/image components.

    Returns:
        IngestResponse: Verified invoice JSON payload.

    Raises:
        HTTPException: If required input is missing or pipeline execution fails.
    """

    if not payload.voice_notes and not payload.audio_base64:
        raise HTTPException(status_code=400, detail="Provide voice_notes or audio_base64.")

    try:
        transcript = payload.voice_notes.strip() if payload.voice_notes else transcribe_audio(payload.audio_base64 or "")
        translated_lines = translator_service.translate_notes(transcript)

        receipt = (
            vision_service.extract_receipt(payload.receipt_image_base64)
            if payload.receipt_image_base64
            else ReceiptExtraction(supplier="", date="", line_items=[])
        )

        match_descriptions = translated_lines + [item.description for item in receipt.line_items]
        vector_matches = vector_match_materials(match_descriptions)
        invoice_lines = build_invoice_lines(translated_lines, receipt, vector_matches)

        totals = calculate_invoice_totals(
            InvoiceMathLine(qty=line.qty, unit_price=line.unit_price) for line in invoice_lines
        )

        return IngestResponse(
            transcript=transcript,
            supplier=receipt.supplier or None,
            receipt_date=receipt.date or None,
            invoice_lines=invoice_lines,
            subtotal=totals.subtotal,
            gst=totals.gst,
            total=totals.total,
            vector_matches=vector_matches,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Ingest pipeline failed")
        raise HTTPException(status_code=500, detail=f"Ingest failed: {exc}") from exc


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Return health status for monitoring.

    Returns:
        HealthResponse: Monitoring health payload.
    """

    return HealthResponse(status="healthy", service="sparkops-data-factory", version="1.0.0")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)