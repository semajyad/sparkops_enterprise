"""SparkOps Sprint 1 API entrypoint.



This module exposes the voice-and-receipt ingestion endpoint that transforms

raw inputs into verified invoice JSON.

"""



from __future__ import annotations



import csv

from datetime import datetime, timezone

import logging

import os

import base64

import io



from decimal import Decimal

from typing import Any

from uuid import UUID



from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Request, UploadFile

from fastapi.exceptions import RequestValidationError

from fastapi.middleware.cors import CORSMiddleware

from fastapi.responses import JSONResponse, StreamingResponse

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

from dependencies import AuthenticatedUser, get_current_user, require_owner

from models.database import Invite, JobDraft, Material, OrganizationSettings, SafetyTest, Vehicle, create_db_and_tables



from routers.eta import router as eta_router

from routers.twilio import router as twilio_router

from services.math_utils import (

    InvoiceMathLine,

    calculate_invoice_totals,

    calculate_line_total,

)

from services.invoice import calculate_invoice, get_default_markup

from services.mailer import MailDeliveryError, send_certificate_email

from services.translator import KiwiTranslator

from services.triage import triage_service

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

    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],

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

        gps_lat: Optional GPS latitude.

        gps_lng: Optional GPS longitude.

    """



    voice_notes: str | None = None

    audio_base64: str | None = None

    receipt_image_base64: str | None = None

    gps_lat: Decimal | None = None

    gps_lng: Decimal | None = None





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

    client_email: str | None = None

    compliance_status: str | None = None

    certificate_pdf_url: str | None = None

    created_at: datetime





class JobDraftListItemResponse(BaseModel):

    """Compact JobDraft payload for dashboard and jobs list views."""



    id: UUID

    status: str

    compliance_status: str | None = None

    created_at: datetime

    client_name: str

    extracted_data: dict[str, Any]





class JobDeleteResponse(BaseModel):

    """Deletion acknowledgment for JobDraft resources."""



    status: str

    id: UUID





class MaterialsUploadResponse(BaseModel):

    """Immediate acknowledgment for async materials upload processing."""



    status: str

    message: str

    filename: str





class MaterialsImportResponse(BaseModel):

    """Summary response for synchronous materials import processing."""



    status: str

    imported_count: int

    failed_count: int

    total_rows: int

    message: str





class AuthMeResponse(BaseModel):

    """Authenticated user response payload for frontend role-aware UI."""



    id: UUID

    organization_id: UUID

    role: str

    email: str | None = None

    full_name: str | None = None





class ManualJobCreateRequest(BaseModel):

    """Payload for manually creating a draft job."""

    client_name: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=500)
    location: str = Field(min_length=1, max_length=500)
    address: str | None = Field(default=None, max_length=500)
    latitude: float | None = None
    longitude: float | None = None
    assigned_to_user_id: UUID | None = None
    scheduled_date: str | None = Field(default=None, max_length=64)
    client_email: str | None = Field(default=None, max_length=255)


class JobCompleteRequest(BaseModel):
    """Complete-job payload requiring client email when missing in draft."""

    client_email: str | None = Field(default=None, max_length=255)


class JobCompleteResponse(BaseModel):
    """Response payload after successful compliance completion and send."""

    status: str
    compliance_status: str
    certificate_pdf_url: str
    message: str


class InviteCreateRequest(BaseModel):
    """Payload for creating a pending user invite record."""

    email: str = Field(min_length=3, max_length=320)
    full_name: str = Field(min_length=1, max_length=255)
    role: str = Field(default="TRADESMAN", max_length=32)


class InviteResponse(BaseModel):
    """Organization-scoped invite response model."""

    id: UUID
    organization_id: UUID
    email: str
    full_name: str
    role: str
    status: str
    invited_by_user_id: UUID
    created_at: datetime
    accepted_at: datetime | None = None


class OrganizationSettingsResponse(BaseModel):
    """Organization-level branding and billing settings payload."""

    organization_id: UUID
    logo_url: str | None = None
    business_name: str | None = None
    gst_number: str | None = None
    terms_and_conditions: str | None = None
    bank_account_name: str | None = None
    bank_account_number: str | None = None
    updated_at: datetime


class OrganizationSettingsUpsertRequest(BaseModel):
    """Owner-updatable organization settings payload."""

    logo_url: str | None = Field(default=None, max_length=1000)
    business_name: str | None = Field(default=None, max_length=255)
    gst_number: str | None = Field(default=None, max_length=64)
    terms_and_conditions: str | None = Field(default=None, max_length=5000)
    bank_account_name: str | None = Field(default=None, max_length=255)
    bank_account_number: str | None = Field(default=None, max_length=128)


class VehicleCreateRequest(BaseModel):
    """Owner payload to create a fleet vehicle."""

    name: str = Field(min_length=1, max_length=255)
    plate: str = Field(min_length=1, max_length=64)
    notes: str | None = Field(default=None, max_length=500)


class VehicleUpdateRequest(BaseModel):
    """Owner payload to update a fleet vehicle."""

    name: str = Field(min_length=1, max_length=255)
    plate: str = Field(min_length=1, max_length=64)
    notes: str | None = Field(default=None, max_length=500)


class VehicleResponse(BaseModel):
    """Fleet vehicle payload for admin suite."""

    id: UUID
    organization_id: UUID
    name: str
    plate: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class VehicleDeleteResponse(BaseModel):
    """Delete acknowledgment for fleet vehicle."""

    status: str
    id: UUID


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





def embed_text_batch(texts: list[str]) -> list[list[float]]:

    """Generate embeddings for a batch of texts in a single API call."""
    if not texts:

        return []

    client = get_openai_client()

    response = client.embeddings.create(model="text-embedding-3-large", input=texts)

    return [item.embedding for item in response.data]


def _normalize_safety_tests(extracted_data: dict[str, Any], gps_lat: Decimal | None, gps_lng: Decimal | None) -> list[dict[str, Any]]:
    tests_raw = extracted_data.get("safety_tests", []) if isinstance(extracted_data, dict) else []
    if not isinstance(tests_raw, list):
        return []

    normalized: list[dict[str, Any]] = []
    for row in tests_raw:
        if not isinstance(row, dict):
            continue
        test_type = str(row.get("type", "")).strip()
        if not test_type:
            continue
        normalized.append(
            {
                "test_type": test_type,
                "value_text": str(row.get("value") or "").strip() or None,
                "unit": str(row.get("unit") or "").strip() or None,
                "result": str(row.get("result") or "").strip().upper() or None,
                "gps_lat": gps_lat,
                "gps_lng": gps_lng,
            }
        )
    return normalized


def _compute_guardrail_status(raw_transcript: str, tests: list[dict[str, Any]]) -> tuple[str, list[str], str]:
    text = (raw_transcript or "").lower()
    mentions_keyword = ("socket" in text) or ("light" in text)

    has_earth_loop = any(str(test.get("test_type", "")).lower() == "earth loop" for test in tests)
    has_polarity = any(str(test.get("test_type", "")).lower() == "polarity" for test in tests)

    missing: list[str] = []
    if mentions_keyword and not has_earth_loop:
        missing.append("Earth Loop")
    if mentions_keyword and not has_polarity:
        missing.append("Polarity")

    if not mentions_keyword:
        return "NOT_REQUIRED", [], "Job scope does not require traffic-light guardrail checks."
    if missing:
        return "RED_SHIELD", missing, "Mandatory safety tests are missing for compliant closure."
    return "GREEN_SHIELD", [], "Job is compliant to close with mandatory safety tests present."


def _assert_job_write_access(draft: JobDraft, current_user: AuthenticatedUser) -> None:
    if draft.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Job draft belongs to another organization.")
    if current_user.role == "OWNER":
        return
    if draft.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions for this job draft.")


def _materials_supports_vector_column() -> bool:
    """Return whether materials table supports vector_embedding writes."""

    return hasattr(Material, "vector_embedding")


def _upsert_materials_rows(
    rows: list[dict[str, str]],
    embeddings: list[list[float]] | None,
    with_vector: bool,
    organization_id: UUID,
    user_id: UUID,
) -> int:
    """Upsert normalized material rows and return imported count."""

    imported_count = 0
    with Session(ENGINE) as session:
        for index, row in enumerate(rows):
            payload: dict[str, Any] = {
                "sku": row["sku"],
                "name": row["name"],
                "trade_price": Decimal(row["price"]),
                "organization_id": organization_id,
                "user_id": user_id,
            }
            if with_vector and embeddings is not None and index < len(embeddings):
                payload["vector_embedding"] = embeddings[index]

            session.merge(Material(**payload))
            imported_count += 1

        session.commit()

    return imported_count


def _parse_materials_csv(contents: bytes) -> list[dict[str, str]]:
    """Parse materials CSV and return valid rows. Raises on empty parse."""

    try:
        decoded = contents.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("CSV must be UTF-8 encoded.") from exc

    reader = csv.DictReader(io.StringIO(decoded))
    if not reader.fieldnames:
        raise ValueError("CSV headers are required.")

    rows: list[dict[str, str]] = []
    for item in reader:
        sku = str(item.get("sku") or "").strip()
        name = str(item.get("name") or "").strip()
        price = str(item.get("price") or "").strip()
        if not sku or not name or not price:
            continue
        rows.append({"sku": sku, "name": name, "price": price})

    if not rows:
        raise ValueError("CSV did not contain valid materials rows.")

    return rows


def import_materials(contents: bytes, filename: str, current_user: AuthenticatedUser) -> MaterialsImportResponse:
    """Import materials CSV rows and return summary counts."""

    decoded = contents.decode("utf-8")
    reader = csv.DictReader(io.StringIO(decoded))
    parsed_rows: list[dict[str, str]] = []
    total_rows = 0
    for item in reader:
        total_rows += 1
        sku = str(item.get("sku") or "").strip()
        name = str(item.get("name") or "").strip()
        price = str(item.get("price") or "").strip()
        if not sku or not name or not price:
            continue
        parsed_rows.append({"sku": sku, "name": name, "price": price})

    failed_count = max(total_rows - len(parsed_rows), 0)
    if not parsed_rows:
        raise ValueError("CSV did not contain valid materials rows.")

    with_vector = _materials_supports_vector_column()
    embeddings = embed_text_batch([f"{row['sku']} {row['name']}" for row in parsed_rows]) if with_vector else None
    imported_count = _upsert_materials_rows(
        parsed_rows,
        embeddings,
        with_vector,
        current_user.organization_id,
        current_user.id,
    )

    return MaterialsImportResponse(
        status="ok",
        imported_count=imported_count,
        failed_count=failed_count,
        total_rows=total_rows,
        message=f"Imported {imported_count} materials from {filename}.",
    )


@app.get("/", response_model=HealthResponse)

def root() -> HealthResponse:

    """Return API health status.



    Returns:

        HealthResponse: Health metadata for root endpoint.

    """



    return HealthResponse(status="healthy", service="sparkops-data-factory", version="1.0.0")





@app.post("/api/ingest", response_model=JobDraftResponse)

def ingest(payload: IngestRequest, current_user: AuthenticatedUser = Depends(get_current_user)) -> JobDraftResponse:

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
        safety_tests = _normalize_safety_tests(extracted_data, payload.gps_lat, payload.gps_lng)
        compliance_status, missing_items, compliance_note = _compute_guardrail_status(transcript, safety_tests)
        extracted_data["compliance_summary"] = {
            "status": compliance_status,
            "missing_items": missing_items,
            "notes": compliance_note,
        }



        with Session(ENGINE) as session:



            draft = JobDraft(

                user_id=current_user.id,

                organization_id=current_user.organization_id,

                raw_transcript=transcript,

                extracted_data=extracted_data,

                compliance_status=compliance_status,

            )



            session.add(draft)
            session.flush()

            for test in safety_tests:
                session.add(
                    SafetyTest(
                        job_id=draft.id,
                        organization_id=current_user.organization_id,
                        user_id=current_user.id,
                        test_type=str(test.get("test_type") or "Unknown"),
                        value_text=test.get("value_text"),
                        unit=test.get("unit"),
                        result=test.get("result"),
                        gps_lat=test.get("gps_lat"),
                        gps_lng=test.get("gps_lng"),
                    )
                )

            session.commit()

            session.refresh(draft)



            return JobDraftResponse(

                id=draft.id,

                raw_transcript=draft.raw_transcript,

                extracted_data=draft.extracted_data,

                status=draft.status,

                client_email=draft.client_email,

                compliance_status=draft.compliance_status,

                certificate_pdf_url=draft.certificate_pdf_url,

                created_at=draft.created_at,

            )



    except HTTPException:

        raise

    except Exception as exc:

        logger.exception("Ingest pipeline failed")

        raise HTTPException(status_code=500, detail=f"Ingest failed: {exc}") from exc





@app.post("/api/materials/upload", response_model=MaterialsUploadResponse)

async def upload_materials_csv(

    background_tasks: BackgroundTasks,

    file: UploadFile = File(...),

    current_user: AuthenticatedUser = Depends(get_current_user),

) -> MaterialsUploadResponse:

    """Accept a wholesaler CSV and process material upserts asynchronously."""



    filename = file.filename or "materials.csv"

    if not filename.lower().endswith(".csv"):

        raise HTTPException(status_code=400, detail="Only .csv files are supported.")



    contents = await file.read()



    if not contents:

        raise HTTPException(status_code=400, detail="Uploaded CSV file is empty.")



    try:

        _parse_materials_csv(contents)

    except ValueError as exc:

        raise HTTPException(status_code=400, detail=str(exc)) from exc



    background_tasks.add_task(

        process_materials_upload,

        contents,

        filename,

        current_user.organization_id,

        current_user.id,

    )



    return MaterialsUploadResponse(

        status="accepted",

        message="Processing materials CSV in the background.",

        filename=filename,

    )





@app.post("/api/materials/import", response_model=MaterialsImportResponse)

async def import_materials_csv(

    file: UploadFile = File(...),

    current_user: AuthenticatedUser = Depends(require_owner),

) -> MaterialsImportResponse:

    """Bulk-import wholesaler materials and return import summary."""



    filename = file.filename or "materials.csv"

    if not filename.lower().endswith(".csv"):

        raise HTTPException(status_code=400, detail="Only .csv files are supported.")



    contents = await file.read()

    if not contents:

        raise HTTPException(status_code=400, detail="Uploaded CSV file is empty.")

    try:

        return import_materials(contents, filename, current_user)

    except ValueError as exc:

        raise HTTPException(status_code=400, detail=str(exc)) from exc

    except Exception as exc:

        logger.exception("Materials import failed")

        raise HTTPException(status_code=500, detail=f"Materials import failed: {exc}") from exc



def _build_auth_me_response(current_user: AuthenticatedUser) -> AuthMeResponse:
    """Build auth handshake payload for both legacy and versioned endpoints."""

    return AuthMeResponse(
        id=current_user.id,
        organization_id=current_user.organization_id,
        role=current_user.role,
        email=current_user.email,
        full_name=current_user.full_name,
    )


@app.get("/api/auth/me", response_model=AuthMeResponse)
def auth_me(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthMeResponse:
    """Return authenticated user identity and role for frontend gating."""

    return _build_auth_me_response(current_user)


@app.get("/api/v1/auth/handshake", response_model=AuthMeResponse)
def auth_handshake_v1(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthMeResponse:
    """Versioned auth handshake contract for frontend/backend identity checks."""

    return _build_auth_me_response(current_user)


def _to_invite_response(record: Invite) -> InviteResponse:
    return InviteResponse(
        id=record.id,
        organization_id=record.organization_id,
        email=record.email,
        full_name=record.full_name,
        role=record.role,
        status=record.status,
        invited_by_user_id=record.invited_by_user_id,
        created_at=record.created_at,
        accepted_at=record.accepted_at,
    )


def _to_org_settings_response(record: OrganizationSettings) -> OrganizationSettingsResponse:
    return OrganizationSettingsResponse(
        organization_id=record.organization_id,
        logo_url=record.logo_url,
        business_name=record.business_name,
        gst_number=record.gst_number,
        terms_and_conditions=record.terms_and_conditions,
        bank_account_name=record.bank_account_name,
        bank_account_number=record.bank_account_number,
        updated_at=record.updated_at,
    )


def _to_vehicle_response(record: Vehicle) -> VehicleResponse:
    return VehicleResponse(
        id=record.id,
        organization_id=record.organization_id,
        name=record.name,
        plate=record.plate,
        notes=record.notes,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@app.get("/api/v1/invites", response_model=list[InviteResponse])
@app.get("/api/invites", response_model=list[InviteResponse])
def list_pending_invites(current_user: AuthenticatedUser = Depends(require_owner)) -> list[InviteResponse]:
    """List pending invites for the authenticated owner's organization."""

    with Session(ENGINE) as session:
        invites = session.exec(
            select(Invite)
            .where(Invite.organization_id == current_user.organization_id)
            .where(Invite.status == "PENDING")
            .order_by(Invite.created_at.desc())
        ).all()
        return [_to_invite_response(invite) for invite in invites]


@app.post("/api/v1/invites", response_model=InviteResponse)
@app.post("/api/invites", response_model=InviteResponse)
def create_invite(
    payload: InviteCreateRequest,
    current_user: AuthenticatedUser = Depends(require_owner),
) -> InviteResponse:
    """Create (or update) a pending invite record in the invites table."""

    email = payload.email.strip().lower()
    full_name = payload.full_name.strip()
    normalized_role = "OWNER" if payload.role.strip().upper() == "OWNER" else "TRADESMAN"

    with Session(ENGINE) as session:
        existing = session.exec(
            select(Invite)
            .where(Invite.organization_id == current_user.organization_id)
            .where(Invite.email == email)
            .where(Invite.status == "PENDING")
            .limit(1)
        ).first()

        if existing:
            existing.full_name = full_name
            existing.role = normalized_role
            existing.invited_by_user_id = current_user.id
            session.add(existing)
            session.commit()
            session.refresh(existing)
            return _to_invite_response(existing)

        invite = Invite(
            organization_id=current_user.organization_id,
            invited_by_user_id=current_user.id,
            email=email,
            full_name=full_name,
            role=normalized_role,
            status="PENDING",
        )
        session.add(invite)
        session.commit()
        session.refresh(invite)
        return _to_invite_response(invite)


@app.get("/api/v1/admin/settings", response_model=OrganizationSettingsResponse)
@app.get("/api/admin/settings", response_model=OrganizationSettingsResponse)
def get_organization_settings(current_user: AuthenticatedUser = Depends(require_owner)) -> OrganizationSettingsResponse:
    """Return owner organization's branding and billing profile."""

    with Session(ENGINE) as session:
        settings = session.get(OrganizationSettings, current_user.organization_id)
        if settings is None:
            settings = OrganizationSettings(organization_id=current_user.organization_id)
            session.add(settings)
            session.commit()
            session.refresh(settings)
        return _to_org_settings_response(settings)


@app.put("/api/v1/admin/settings", response_model=OrganizationSettingsResponse)
@app.put("/api/admin/settings", response_model=OrganizationSettingsResponse)
def upsert_organization_settings(
    payload: OrganizationSettingsUpsertRequest,
    current_user: AuthenticatedUser = Depends(require_owner),
) -> OrganizationSettingsResponse:
    """Create/update owner organization's branding and billing profile."""

    with Session(ENGINE) as session:
        settings = session.get(OrganizationSettings, current_user.organization_id)
        if settings is None:
            settings = OrganizationSettings(organization_id=current_user.organization_id)

        settings.logo_url = payload.logo_url.strip() if isinstance(payload.logo_url, str) and payload.logo_url.strip() else None
        settings.business_name = payload.business_name.strip() if isinstance(payload.business_name, str) and payload.business_name.strip() else None
        settings.gst_number = payload.gst_number.strip() if isinstance(payload.gst_number, str) and payload.gst_number.strip() else None
        settings.terms_and_conditions = (
            payload.terms_and_conditions.strip()
            if isinstance(payload.terms_and_conditions, str) and payload.terms_and_conditions.strip()
            else None
        )
        settings.bank_account_name = payload.bank_account_name.strip() if isinstance(payload.bank_account_name, str) and payload.bank_account_name.strip() else None
        settings.bank_account_number = payload.bank_account_number.strip() if isinstance(payload.bank_account_number, str) and payload.bank_account_number.strip() else None
        settings.updated_at = datetime.now(timezone.utc)

        session.add(settings)
        session.commit()
        session.refresh(settings)
        return _to_org_settings_response(settings)


@app.get("/api/v1/admin/vehicles", response_model=list[VehicleResponse])
@app.get("/api/admin/vehicles", response_model=list[VehicleResponse])
def list_vehicles(current_user: AuthenticatedUser = Depends(require_owner)) -> list[VehicleResponse]:
    """List owner organization's fleet vehicles."""

    with Session(ENGINE) as session:
        rows = session.exec(
            select(Vehicle)
            .where(Vehicle.organization_id == current_user.organization_id)
            .order_by(Vehicle.updated_at.desc())
        ).all()
        return [_to_vehicle_response(vehicle) for vehicle in rows]


@app.post("/api/v1/admin/vehicles", response_model=VehicleResponse)
@app.post("/api/admin/vehicles", response_model=VehicleResponse)
def create_vehicle(
    payload: VehicleCreateRequest,
    current_user: AuthenticatedUser = Depends(require_owner),
) -> VehicleResponse:
    """Create a fleet vehicle for the owner organization."""

    timestamp = datetime.now(timezone.utc)
    with Session(ENGINE) as session:
        vehicle = Vehicle(
            organization_id=current_user.organization_id,
            name=payload.name.strip(),
            plate=payload.plate.strip().upper(),
            notes=payload.notes.strip() if isinstance(payload.notes, str) and payload.notes.strip() else None,
            created_at=timestamp,
            updated_at=timestamp,
        )
        session.add(vehicle)
        session.commit()
        session.refresh(vehicle)
        return _to_vehicle_response(vehicle)


@app.put("/api/v1/admin/vehicles/{vehicle_id}", response_model=VehicleResponse)
@app.put("/api/admin/vehicles/{vehicle_id}", response_model=VehicleResponse)
def update_vehicle(
    vehicle_id: UUID,
    payload: VehicleUpdateRequest,
    current_user: AuthenticatedUser = Depends(require_owner),
) -> VehicleResponse:
    """Update an existing fleet vehicle."""

    with Session(ENGINE) as session:
        vehicle = session.get(Vehicle, vehicle_id)
        if vehicle is None:
            raise HTTPException(status_code=404, detail="Vehicle not found.")
        if vehicle.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Vehicle does not belong to your organization.")

        vehicle.name = payload.name.strip()
        vehicle.plate = payload.plate.strip().upper()
        vehicle.notes = payload.notes.strip() if isinstance(payload.notes, str) and payload.notes.strip() else None
        vehicle.updated_at = datetime.now(timezone.utc)

        session.add(vehicle)
        session.commit()
        session.refresh(vehicle)
        return _to_vehicle_response(vehicle)


@app.delete("/api/v1/admin/vehicles/{vehicle_id}", response_model=VehicleDeleteResponse)
@app.delete("/api/admin/vehicles/{vehicle_id}", response_model=VehicleDeleteResponse)
def delete_vehicle(vehicle_id: UUID, current_user: AuthenticatedUser = Depends(require_owner)) -> VehicleDeleteResponse:
    """Delete a fleet vehicle."""

    with Session(ENGINE) as session:
        vehicle = session.get(Vehicle, vehicle_id)
        if vehicle is None:
            raise HTTPException(status_code=404, detail="Vehicle not found.")
        if vehicle.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Vehicle does not belong to your organization.")

        session.delete(vehicle)
        session.commit()
    return VehicleDeleteResponse(status="deleted", id=vehicle_id)


@app.post("/api/v1/jobs", response_model=JobDraftResponse)
@app.post("/api/jobs", response_model=JobDraftResponse)
def create_job_draft(
    payload: ManualJobCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> JobDraftResponse:
    """Create a new job draft."""

    assigned_user_id = current_user.id
    if current_user.role == "OWNER" and payload.assigned_to_user_id is not None:
        with Session(ENGINE) as session:
            assignee_row = session.exec(
                text(
                    """
                    SELECT id
                    FROM public.profiles
                    WHERE id = :user_id AND organization_id = :organization_id
                    LIMIT 1
                    """
                ),
                params={
                    "user_id": str(payload.assigned_to_user_id),
                    "organization_id": str(current_user.organization_id),
                },
            ).first()
        if assignee_row is None:
            raise HTTPException(status_code=400, detail="Assigned user must belong to your organization.")
        assigned_user_id = payload.assigned_to_user_id

    client_name = payload.client_name.strip()
    title = payload.title.strip()
    location = payload.location.strip()
    address = payload.address.strip() if isinstance(payload.address, str) and payload.address.strip() else location
    latitude = float(payload.latitude) if isinstance(payload.latitude, (int, float)) else None
    longitude = float(payload.longitude) if isinstance(payload.longitude, (int, float)) else None
    scheduled_date = payload.scheduled_date.strip() if isinstance(payload.scheduled_date, str) else ""

    extracted_data: dict[str, Any] = {
        "client": client_name,
        "job_title": title,
        "location": address,
        "address": address,
        "latitude": latitude,
        "longitude": longitude,
        "assigned_to_user_id": str(assigned_user_id),
        "scheduled_date": scheduled_date or None,
        "line_items": [],
        "safety_tests": [],
    }
    compliance_status, missing_items, compliance_note = _compute_guardrail_status(f"Manual job: {title}", [])
    extracted_data["compliance_summary"] = {
        "status": compliance_status,
        "missing_items": missing_items,
        "notes": compliance_note,
    }

    with Session(ENGINE) as session:
        draft = JobDraft(
            user_id=assigned_user_id,
            organization_id=current_user.organization_id,
            raw_transcript=f"Manual job: {title}",
            extracted_data=extracted_data,
            status="DRAFT",
            client_email=payload.client_email.strip().lower() if isinstance(payload.client_email, str) and payload.client_email.strip() else None,
            compliance_status=compliance_status,
        )

        session.add(draft)
        session.commit()
        session.refresh(draft)
        return JobDraftResponse(
            id=draft.id,
            raw_transcript=draft.raw_transcript,
            extracted_data=draft.extracted_data,
            status=draft.status,
            client_email=draft.client_email,
            compliance_status=draft.compliance_status,
            certificate_pdf_url=draft.certificate_pdf_url,
            created_at=draft.created_at,
        )


@app.get("/api/jobs", response_model=list[JobDraftListItemResponse])

def list_job_drafts(current_user: AuthenticatedUser = Depends(get_current_user)) -> list[JobDraftListItemResponse]:
    """Return all visible JobDraft records for the authenticated user."""

    with Session(ENGINE) as session:

        query = (
            select(JobDraft)
            .where(JobDraft.organization_id == current_user.organization_id)
            .order_by(JobDraft.created_at.desc())
        )

        if current_user.role != "OWNER":
            query = query.where(JobDraft.user_id == current_user.id)

        drafts = session.exec(query).all()

        results: list[JobDraftListItemResponse] = []

        for draft in drafts:

            extracted_data = draft.extracted_data if isinstance(draft.extracted_data, dict) else {}

            client_name = str(extracted_data.get("client") or "Unknown Client").strip() or "Unknown Client"

            results.append(
                JobDraftListItemResponse(
                    id=draft.id,
                    status=draft.status,
                    compliance_status=draft.compliance_status,
                    created_at=draft.created_at,
                    client_name=client_name,
                    extracted_data=extracted_data,
                )
            )

        return results


@app.get("/api/jobs/{job_id}", response_model=JobDraftResponse)

def get_job_draft(job_id: UUID, current_user: AuthenticatedUser = Depends(get_current_user)) -> JobDraftResponse:
    """Return a saved JobDraft payload by id."""

    with Session(ENGINE) as session:

        draft = session.get(JobDraft, job_id)

        if draft is None:
            raise HTTPException(status_code=404, detail="Job draft not found.")

        _assert_job_write_access(draft, current_user)

        safety_rows = session.exec(select(SafetyTest).where(SafetyTest.job_id == draft.id)).all()
        safety_payload = [
            {
                "id": str(row.id),
                "type": row.test_type,
                "value": row.value_text,
                "unit": row.unit,
                "result": row.result,
                "gps_lat": float(row.gps_lat) if row.gps_lat is not None else None,
                "gps_lng": float(row.gps_lng) if row.gps_lng is not None else None,
            }
            for row in safety_rows
        ]
        extracted_data = draft.extracted_data if isinstance(draft.extracted_data, dict) else {}
        extracted_data["safety_tests"] = safety_payload

        return JobDraftResponse(
            id=draft.id,
            raw_transcript=draft.raw_transcript,
            extracted_data=extracted_data,
            status=draft.status,
            client_email=draft.client_email,
            compliance_status=draft.compliance_status,
            certificate_pdf_url=draft.certificate_pdf_url,
            created_at=draft.created_at,
        )


@app.delete("/api/jobs/{job_id}", response_model=JobDeleteResponse)

def delete_job_draft(job_id: UUID, current_user: AuthenticatedUser = Depends(get_current_user)) -> JobDeleteResponse:
    """Delete a saved JobDraft by id if the user has access."""

    with Session(ENGINE) as session:

        draft = session.get(JobDraft, job_id)

        if draft is None:
            raise HTTPException(status_code=404, detail="Job draft not found.")

        _assert_job_write_access(draft, current_user)

        session.delete(draft)
        session.commit()

    return JobDeleteResponse(status="deleted", id=job_id)


@app.post("/api/v1/jobs/{job_id}/complete", response_model=JobCompleteResponse)
@app.post("/api/jobs/{job_id}/complete", response_model=JobCompleteResponse)
def complete_job_draft(
    job_id: UUID,
    payload: JobCompleteRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> JobCompleteResponse:
    """Complete a compliant job and auto-send certificate to the client."""

    with Session(ENGINE) as session:
        draft = session.get(JobDraft, job_id)
        if draft is None:
            raise HTTPException(status_code=404, detail="Job draft not found.")

        _assert_job_write_access(draft, current_user)

        email_candidate = (
            payload.client_email.strip().lower()
            if isinstance(payload.client_email, str) and payload.client_email.strip()
            else (draft.client_email or "").strip().lower()
        )
        if not email_candidate:
            raise HTTPException(status_code=422, detail="Client email is required before completing this job.")

        safety_rows = session.exec(select(SafetyTest).where(SafetyTest.job_id == draft.id)).all()
        tests = [
            {
                "test_type": row.test_type,
                "value_text": row.value_text,
                "unit": row.unit,
                "result": row.result,
                "gps_lat": row.gps_lat,
                "gps_lng": row.gps_lng,
            }
            for row in safety_rows
        ]
        compliance_status, missing_items, compliance_note = _compute_guardrail_status(draft.raw_transcript, tests)
        if compliance_status != "GREEN_SHIELD":
            raise HTTPException(
                status_code=400,
                detail=f"missing: {', '.join(missing_items) if missing_items else 'required evidence'}",
            )

        from services.pdf import generate_certificate_pdf

        certificate_bytes = generate_certificate_pdf(draft, tests)
        filename = f"sparkops-certificate-{draft.id}.pdf"
        extracted = draft.extracted_data if isinstance(draft.extracted_data, dict) else {}
        address = str(extracted.get("address") or extracted.get("location") or "Job Site")
        client_name = str(extracted.get("client") or "Client")

        try:
            send_certificate_email(
                to_email=email_candidate,
                client_name=client_name,
                address=address,
                issued_at=datetime.now(timezone.utc),
                pdf_bytes=certificate_bytes,
                filename=filename,
            )
        except MailDeliveryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        draft.client_email = email_candidate
        draft.status = "DONE"
        draft.compliance_status = compliance_status
        draft.completed_at = datetime.now(timezone.utc)
        draft.certificate_pdf_url = f"/api/jobs/{draft.id}/certificate.pdf"
        extracted["compliance_summary"] = {
            "status": compliance_status,
            "missing_items": missing_items,
            "notes": compliance_note,
        }
        draft.extracted_data = extracted
        session.add(draft)
        session.commit()

        return JobCompleteResponse(
            status=draft.status,
            compliance_status=draft.compliance_status or "GREEN_SHIELD",
            certificate_pdf_url=draft.certificate_pdf_url or f"/api/jobs/{draft.id}/certificate.pdf",
            message="Job completed successfully.",
        )


@app.get("/api/jobs/{job_id}/certificate.pdf")
def download_job_certificate_pdf(job_id: UUID, current_user: AuthenticatedUser = Depends(get_current_user)) -> StreamingResponse:
    """Generate and return compliance certificate PDF for a completed job."""

    with Session(ENGINE) as session:
        draft = session.get(JobDraft, job_id)
        if draft is None:
            raise HTTPException(status_code=404, detail="Job draft not found.")

        _assert_job_write_access(draft, current_user)

        tests = session.exec(select(SafetyTest).where(SafetyTest.job_id == draft.id)).all()
        safety_payload = [
            {
                "test_type": row.test_type,
                "value_text": row.value_text,
                "unit": row.unit,
                "result": row.result,
                "gps_lat": row.gps_lat,
                "gps_lng": row.gps_lng,
            }
            for row in tests
        ]

    from services.pdf import generate_certificate_pdf

    pdf_bytes = generate_certificate_pdf(draft, safety_payload)
    filename = f"sparkops-certificate-{job_id}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/jobs/{job_id}/pdf")
def download_job_invoice_pdf(job_id: UUID, current_user: AuthenticatedUser = Depends(get_current_user)) -> StreamingResponse:
    """Generate and return a PDF invoice for the specified JobDraft."""

    with Session(ENGINE) as session:
        draft = session.get(JobDraft, job_id)

        if draft is None:
            raise HTTPException(status_code=404, detail="Job draft not found.")

        _assert_job_write_access(draft, current_user)

    from services.pdf import generate_invoice_pdf

    pdf_bytes = generate_invoice_pdf(draft, ENGINE)
    filename = f"sparkops-invoice-{job_id}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Return health status for monitoring."""
    return HealthResponse(status="healthy", service="sparkops-data-factory", version="1.0.0")


if __name__ == "__main__":

    import uvicorn



    uvicorn.run(app, host="0.0.0.0", port=8000)
