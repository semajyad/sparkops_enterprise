"""SparkOps Sprint 1 API entrypoint.

This module exposes the voice-and-receipt ingestion endpoint that transforms
raw inputs into verified invoice JSON.
"""

from __future__ import annotations

from datetime import datetime
import logging
import os
import base64
import io

from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pydub import AudioSegment
from sqlalchemy import text
from sqlmodel import Session, select

try:
    from openai import BadRequestError, OpenAI
except ImportError:  # pragma: no cover - compatibility with legacy OpenAI SDK
    BadRequestError = Exception  # type: ignore[assignment]
    OpenAI = None  # type: ignore[assignment]

from database import engine as database_engine
from models.database import JobDraft, Material, create_db_and_tables

from routers.eta import router as eta_router
from routers.twilio import router as twilio_router
from services.math_utils import (
    InvoiceMathLine,
    calculate_invoice_totals,
    calculate_line_total,
)
from services.triage import triage_service
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

ENGINE = database_engine
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
        audio_base64: Optional base64 audio to transcribe with `gpt-4o-mini-audio-preview`.

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


class JobDraftResponse(BaseModel):
    """Persisted triage draft response model."""

    id: UUID
    raw_transcript: str
    extracted_data: dict[str, Any]
    status: str
    created_at: datetime


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
    """Transcribe base64 audio using `gpt-4o-mini-audio-preview`.

    Args:
        audio_base64: Base64-encoded audio file bytes.

    Returns:
        str: Transcribed text.
    """

    if not audio_base64:
        return ""

    normalized_audio_base64 = audio_base64.strip()
    detected_format = "webm"
    if normalized_audio_base64.startswith("data:") and "," in normalized_audio_base64:
        header, normalized_audio_base64 = normalized_audio_base64.split(",", 1)
        if "audio/wav" in header or "audio/x-wav" in header:
            detected_format = "wav"
        elif "audio/webm" in header:
            detected_format = "webm"

    audio_bytes = base64.b64decode(normalized_audio_base64)

    def _to_clean_wav_base64(raw_audio: bytes, preferred_format: str) -> str:
        source_audio = io.BytesIO(raw_audio)
        source_audio.name = f"raw_input.{preferred_format}"

        formats_to_try = [preferred_format] + [fmt for fmt in ["webm", "wav", "ogg", "mp3", "m4a"] if fmt != preferred_format]
        parsed_audio: AudioSegment | None = None
        last_error: Exception | None = None

        for input_format in formats_to_try:
            try:
                source_audio.seek(0)
                parsed_audio = AudioSegment.from_file(source_audio, format=input_format)
                break
            except Exception as exc:  # pragma: no cover - format probing branch
                last_error = exc

        if parsed_audio is None:
            raise RuntimeError(f"Unable to decode input audio format: {last_error}")

        normalized = parsed_audio.set_frame_rate(16000).set_channels(1)
        wav_buffer = io.BytesIO()
        wav_buffer.name = "normalized.wav"
        normalized.export(wav_buffer, format="wav")
        return base64.b64encode(wav_buffer.getvalue()).decode("utf-8")

    def _extract_transcript(message_content: object) -> str:
        if isinstance(message_content, str):
            return message_content.strip()

        if isinstance(message_content, list):
            chunks: list[str] = []
            for item in message_content:
                chunk_type = getattr(item, "type", None)
                chunk_text = getattr(item, "text", None)
                if chunk_type == "text" and isinstance(chunk_text, str):
                    chunks.append(chunk_text)
            return "".join(chunks).strip()
        return str(message_content).strip()

    def _is_refusal(text: str) -> bool:
        lowered = text.lower()
        refusal_markers = [
            "unable to assist",
            "can't assist",
            "cannot assist",
            "cannot transcribe",
            "unable to transcribe",
            "i'm unable",
        ]
        return any(marker in lowered for marker in refusal_markers)

    try:
        clean_wav_base64 = _to_clean_wav_base64(audio_bytes, detected_format)
        logger.info("Transcribing with model: gpt-4o-mini-audio-preview")
        client = get_openai_client()
        prompts = [
            "Transcribe this audio exactly.",
            "Return only the spoken words from this audio.",
            "Produce a verbatim transcript. Output text only.",
        ]

        last_text = ""
        for prompt in prompts:
            response = client.chat.completions.create(
                model="gpt-4o-mini-audio-preview",
                modalities=["text"],
                temperature=0,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a speech-to-text engine. Only transcribe the provided audio.",
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "input_audio",
                                "input_audio": {
                                    "data": clean_wav_base64,
                                    "format": "wav",
                                },
                            },
                        ],
                    },
                ],
            )
            transcript = _extract_transcript(response.choices[0].message.content)
            if transcript and not _is_refusal(transcript):
                return transcript
            last_text = transcript

        raise RuntimeError(f"No valid transcript from audio-preview model. Last response: {last_text}")

    except BadRequestError as exc:
        logger.error("Transcription BadRequestError message: %s", getattr(exc, "message", str(exc)))
        raise HTTPException(status_code=400, detail=f"Transcription failed: {str(exc)}") from exc

    except Exception as exc:
        logger.exception("Transcription failed")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(exc)}") from exc


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


def vector_match_materials(descriptions: list[str], limit: int = 3) -> list[MatchedMaterialOut]:
    """Find best material matches using vector similarity or fallback text matching.

    Args:
        descriptions: List of material descriptions to match.
        limit: Maximum matches per description.

    Returns:
        list[MatchedMaterialOut]: Ranked material matches.
    """

    normalized_descriptions = [description.strip() for description in descriptions if description and description.strip()]
    if not normalized_descriptions:
        return []

    if not descriptions:
        return []

    matches: list[MatchedMaterialOut] = []

    if not _materials_table_exists():
        logger.warning("Materials table is missing; skipping vector matching.")
        return []
    
    # Check if vector functionality is available
    try:
        from models.database import is_vector_enabled
        if not is_vector_enabled():
            logger.warning("Vector matching not available, using text-based fallback")
            return _text_match_materials(normalized_descriptions, limit)
    except ImportError:
        logger.warning("Could not check vector availability, using text-based fallback")
        return _text_match_materials(normalized_descriptions, limit)
    
    # Try vector matching first
    try:
        with Session(ENGINE) as session:
            for description in normalized_descriptions:
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
    except Exception as exc:
        logger.warning("Vector matching failed, falling back to text matching: %s", exc)
        return _text_match_materials(normalized_descriptions, limit)


def _materials_table_exists() -> bool:
    """Return True when the materials table exists in the active schema."""

    try:
        with Session(ENGINE) as session:
            exists = session.exec(
                text(
                    """
                    SELECT EXISTS (
                        SELECT 1
                        FROM information_schema.tables
                        WHERE table_schema = current_schema()
                          AND table_name = 'materials'
                    )
                    """
                )
            ).one()
        return bool(exists)
    except Exception as exc:
        logger.warning("Unable to verify materials table existence: %s", exc)
        return False


def _text_match_materials(descriptions: list[str], limit: int = 3) -> list[MatchedMaterialOut]:
    """Fallback text-based material matching using simple string similarity.

    Args:
        descriptions: List of material descriptions to match.
        limit: Maximum matches per description.

    Returns:
        list[MatchedMaterialOut]: Ranked material matches.
    """
    
    matches: list[MatchedMaterialOut] = []
    
    try:
        with Session(ENGINE) as session:
            materials = session.exec(select(Material)).all()
            
            for description in descriptions:
                desc_lower = description.lower()
                scored_materials = []
                
                for material in materials:
                    # Simple text matching scoring
                    name_lower = material.name.lower()
                    score = 0
                    
                    # Exact match gets highest score
                    if desc_lower == name_lower:
                        score = 100
                    # Contains match gets medium score
                    elif desc_lower in name_lower or name_lower in desc_lower:
                        score = 70
                    # Word overlap gets lower score
                    else:
                        desc_words = set(desc_lower.split())
                        name_words = set(name_lower.split())
                        common_words = desc_words.intersection(name_words)
                        if common_words:
                            score = len(common_words) * 10
                    
                    if score > 0:
                        scored_materials.append((material, score))
                
                # Sort by score and take top matches
                scored_materials.sort(key=lambda x: x[1], reverse=True)
                for material, score in scored_materials[:limit]:
                    matches.append(
                        MatchedMaterialOut(
                            query=description,
                            sku=material.sku,
                            name=material.name,
                            trade_price=material.trade_price,
                        )
                    )
                    
        return matches
    except Exception as exc:
        logger.warning("Text matching failed: %s", exc)
        return []


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


@app.post("/api/ingest", response_model=JobDraftResponse)
def ingest(payload: IngestRequest) -> JobDraftResponse:
    """Ingest voice/text and persist GPT-5 triage draft.

    Args:
        payload: Ingestion payload with optional audio/text/image components.

    Returns:
        JobDraftResponse: Saved triage draft record.

    Raises:
        HTTPException: If required input is missing or pipeline execution fails.
    """

    voice_notes = payload.voice_notes.strip() if payload.voice_notes else ""
    audio_base64 = payload.audio_base64.strip() if payload.audio_base64 else ""

    if not voice_notes and not audio_base64:
        raise HTTPException(status_code=400, detail="Provide voice_notes or audio_base64.")


    try:
        transcript = voice_notes if voice_notes else transcribe_audio(audio_base64)
        extracted_data = triage_service.analyze_transcript(transcript)

        with Session(ENGINE) as session:
            draft = JobDraft(
                raw_transcript=transcript,
                extracted_data=extracted_data,
            )
            session.add(draft)
            session.commit()
            session.refresh(draft)

            return JobDraftResponse(
                id=draft.id,
                raw_transcript=draft.raw_transcript,
                extracted_data=draft.extracted_data,
                status=draft.status,
                created_at=draft.created_at,
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