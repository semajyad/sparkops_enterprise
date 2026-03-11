"""TradeOps Sprint 1 API entrypoint.



This module exposes the voice-and-receipt ingestion endpoint that transforms

raw inputs into verified invoice JSON.

"""



from __future__ import annotations



import csv

from datetime import datetime, timedelta, timezone
import json
import hashlib
import hmac

import logging

import os
import secrets

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("WARNING: python-dotenv not installed, environment variables from .env file will not be loaded")

import base64

import io
from urllib.parse import quote, urlencode
from urllib.error import HTTPError
from urllib.request import Request as UrlRequest, urlopen



from decimal import Decimal

from typing import Any

from uuid import UUID



from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Request, UploadFile

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

from models.database import (
    Affiliate,
    Commission,
    Integration,
    Invite,
    JobDraft,
    Material,
    OrganizationSettings,
    Referral,
    SafetyPlan,
    SafetyTest,
    Vehicle,
    create_db_and_tables,
)



from routers.eta import router as eta_router

from routers.twilio import router as twilio_router

from app.api.test import router as test_router

from services.billing import (
    BillingError,
    create_checkout_session,
    create_customer_portal_session,
    retrieve_subscription,
    verify_webhook_signature,
)
from services.math_utils import (

    InvoiceMathLine,

    calculate_invoice_totals,

    calculate_line_total,

)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)



app = FastAPI(

    title="TradeOps Data Factory API",

    description="Voice-to-cash ingestion engine for NZ electricians.",

    version="1.0.0",

)



app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://proactive-strength-staging.up.railway.app",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,

    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allow_headers=["Content-Type", "Authorization", "X-Twilio-Signature"],

)



app.include_router(twilio_router)

app.include_router(eta_router)

app.include_router(test_router)



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



# translator_service = KiwiTranslator()  # Commented out - not available
# vision_service = ReceiptVisionEngine()  # Commented out - not available



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

    date_scheduled: datetime | None = None

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

    date_scheduled: datetime | None = None

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

    trade: str

    organization_default_trade: str

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
    client_generated_id: UUID | None = None
    assigned_to_user_id: UUID | None = None
    required_trade: str | None = Field(default=None, max_length=32)
    scheduled_date: str | None = Field(default=None, max_length=64)
    client_email: str | None = Field(default=None, max_length=255)


class JobCompleteRequest(BaseModel):
    """Complete-job payload requiring client email when missing in draft."""

    client_email: str | None = Field(default=None, max_length=255)


class JobVoiceNoteAppendRequest(BaseModel):
    """Append-only voice-note payload for an existing job."""

    voice_note: str | None = Field(default=None, max_length=8000)
    audio_url: str | None = Field(default=None, max_length=2000)


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
    website_url: str | None = None
    business_name: str | None = None
    gst_number: str | None = None
    default_trade: str = "ELECTRICAL"
    tax_rate: Decimal | None = None
    standard_markup: Decimal | None = None
    terms_and_conditions: str | None = None
    bank_account_name: str | None = None
    bank_account_number: str | None = None
    subscription_status: str = "INACTIVE"
    plan_type: str = "BASE"
    licensed_seats: int = 1
    trial_started_at: datetime | None = None
    trial_ends_at: datetime | None = None
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None
    updated_at: datetime


class OrganizationSettingsUpsertRequest(BaseModel):
    """Owner-updatable organization settings payload."""

    logo_url: str | None = Field(default=None, max_length=1000)
    website_url: str | None = Field(default=None, max_length=1000)
    business_name: str | None = Field(default=None, max_length=255)
    gst_number: str | None = Field(default=None, max_length=64)
    default_trade: str | None = Field(default=None, max_length=32)
    tax_rate: Decimal | None = Field(default=None, ge=Decimal("0"), le=Decimal("1"))
    standard_markup: Decimal | None = Field(default=None, ge=Decimal("0"), le=Decimal("5"))
    terms_and_conditions: str | None = Field(default=None, max_length=5000)
    bank_account_name: str | None = Field(default=None, max_length=255)
    bank_account_number: str | None = Field(default=None, max_length=128)


class XeroConnectResponse(BaseModel):
    """OAuth connect URL payload for starting Xero authorization."""

    provider: str
    auth_url: str
    state: str


class XeroConnectCallbackResponse(BaseModel):
    """OAuth callback token exchange response."""

    status: str
    organization_id: UUID
    provider: str
    tenant_id: str | None = None


class XeroPushInvoiceRequest(BaseModel):
    """Payload for pushing a completed JobDraft invoice into Xero."""

    job_id: UUID


class XeroPushInvoiceResponse(BaseModel):
    """Result payload for Xero push operation."""

    status: str
    provider: str
    job_id: UUID
    invoice_payload: dict[str, Any]


class StripeCheckoutRequest(BaseModel):
    """Request payload for creating Stripe checkout sessions."""

    success_url: str = Field(min_length=5, max_length=2000)
    cancel_url: str = Field(min_length=5, max_length=2000)
    quantity: int = Field(default=1, ge=1, le=200)


class StripeCheckoutResponse(BaseModel):
    """Checkout session response with hosted URL."""

    session_id: str
    url: str


class StripePortalRequest(BaseModel):
    """Request payload for Stripe customer portal session."""

    return_url: str = Field(min_length=5, max_length=2000)


class StripePortalResponse(BaseModel):
    """Customer portal response with hosted URL."""

    url: str


class BillingEntitlementsResponse(BaseModel):
    """Seat/billing entitlement snapshot for team management gating."""

    subscription_status: str
    licensed_seats: int
    active_users: int
    pending_invites: int
    total_allocated: int
    can_add_member: bool


class ReferralCaptureRequest(BaseModel):
    """Capture referral attribution during signup."""

    email: str = Field(min_length=3, max_length=320)
    referral_code: str = Field(min_length=2, max_length=64)
    organization_id: UUID | None = None


class ReferralCaptureResponse(BaseModel):
    """Referral capture response payload."""

    status: str
    referral_id: UUID


class AffiliateSummaryRow(BaseModel):
    """Affiliate performance summary row for owner reporting."""

    affiliate_id: UUID
    name: str
    referral_code: str
    referrals: int
    converted: int
    pending_commission_nzd: Decimal



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

    canonical_types = {
        "earth loop": "Earth Loop",
        "polarity": "Polarity",
        "insulation": "Insulation Resistance",
        "insulation resistance": "Insulation Resistance",
        "ir test": "Insulation Resistance",
        "rcd": "RCD Test",
        "rcd test": "RCD Test",
        "gas pressure": "Gas Pressure",
        "water flow": "Water Flow",
        "backflow": "Backflow Prevention",
        "backflow prevention": "Backflow Prevention",
    }

    normalized: list[dict[str, Any]] = []
    for row in tests_raw:
        if not isinstance(row, dict):
            continue
        raw_test_type = str(row.get("type", "")).strip()
        test_type = canonical_types.get(raw_test_type.lower(), raw_test_type)
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


def _normalize_trade(value: str | None, *, default: str = "ELECTRICAL") -> str:
    candidate = (value or "").strip().upper()
    if candidate in {"ELECTRICAL", "PLUMBING", "ANY"}:
        return candidate
    return default


def _required_tests_for_trade(trade: str) -> tuple[str, ...]:
    if trade == "PLUMBING":
        return ("Gas Pressure", "Water Flow", "Backflow Prevention", "RCD Test")
    if trade == "ANY":
        return (
            "Earth Loop",
            "Polarity",
            "Insulation Resistance",
            "Gas Pressure",
            "Water Flow",
            "Backflow Prevention",
            "RCD Test",
        )
    return ("Earth Loop", "Polarity", "Insulation Resistance", "RCD Test")


def _compute_guardrail_status(
    raw_transcript: str,
    tests: list[dict[str, Any]],
    required_trade: str,
) -> tuple[str, list[str], str]:
    normalized_trade = _normalize_trade(required_trade)
    required_tests = _required_tests_for_trade(normalized_trade)
    present = {str(test.get("test_type", "")).strip().lower() for test in tests if isinstance(test, dict)}
    missing = [label for label in required_tests if label.lower() not in present]
    compliance_basis = (
        "AS/NZS 3500 + G12/G13 plumbing compliance evidence"
        if normalized_trade == "PLUMBING"
        else "AS/NZS 3000 electrical compliance evidence"
    )

    if not raw_transcript.strip() and not tests:
        return "NOT_REQUIRED", [], f"No transcript captured yet. Record required safety evidence before closure ({compliance_basis})."

    if missing:
        return "RED_SHIELD", missing, f"Mandatory safety tests are missing for compliant closure ({compliance_basis})."
    return "GREEN_SHIELD", [], f"Job is compliant to close with mandatory safety tests present ({compliance_basis})."


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



    return HealthResponse(status="healthy", service="tradeops-data-factory", version="1.0.0")





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

        required_trade = _normalize_trade(current_user.organization_default_trade)
        extracted_data = triage_service.analyze_transcript(transcript, required_trade)
        extracted_data["required_trade"] = required_trade
        safety_tests = _normalize_safety_tests(extracted_data, payload.gps_lat, payload.gps_lng)
        compliance_status, missing_items, compliance_note = _compute_guardrail_status(transcript, safety_tests, required_trade)
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
                required_trade=required_trade,

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
        trade=current_user.trade,
        organization_default_trade=current_user.organization_default_trade,
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


def _to_org_settings_response(settings: OrganizationSettings) -> OrganizationSettingsResponse:
    return OrganizationSettingsResponse(
        organization_id=settings.organization_id,
        logo_url=settings.logo_url,
        website_url=settings.website_url,
        business_name=settings.business_name,
        gst_number=settings.gst_number,
        default_trade=_normalize_trade(settings.default_trade),
        tax_rate=settings.tax_rate,
        standard_markup=settings.standard_markup,
        terms_and_conditions=settings.terms_and_conditions,
        bank_account_name=settings.bank_account_name,
        bank_account_number=settings.bank_account_number,
        subscription_status=(settings.subscription_status or "INACTIVE").upper(),
        plan_type=(settings.plan_type or "BASE").upper(),
        licensed_seats=max(1, int(settings.licensed_seats or 1)),
        trial_started_at=settings.trial_started_at,
        trial_ends_at=settings.trial_ends_at,
        stripe_customer_id=settings.stripe_customer_id,
        stripe_subscription_id=settings.stripe_subscription_id,
        updated_at=settings.updated_at,
    )


def _ensure_org_settings(session: Session, organization_id: UUID, default_trade: str = "ELECTRICAL") -> OrganizationSettings:
    settings = session.get(OrganizationSettings, organization_id)
    if settings is None:
        settings = OrganizationSettings(organization_id=organization_id)
        settings.default_trade = _normalize_trade(default_trade)
        settings.subscription_status = "INACTIVE"
        settings.plan_type = "BASE"
        settings.licensed_seats = 1
        settings.trial_started_at = datetime.now(timezone.utc)
        settings.trial_ends_at = datetime.now(timezone.utc) + timedelta(days=14)
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


def _has_active_subscription_or_trial(settings: OrganizationSettings) -> bool:
    status = str(settings.subscription_status or "INACTIVE").upper()
    if status in {"ACTIVE", "TRIALING"}:
        return True
    if settings.trial_ends_at and settings.trial_ends_at >= datetime.now(timezone.utc):
        return True
    return False


def _billing_entitlements(session: Session, organization_id: UUID) -> BillingEntitlementsResponse:
    settings = _ensure_org_settings(session, organization_id)
    active_users = 0
    try:
        with ENGINE.begin() as connection:
            active_users = int(
                connection.execute(
                    text("SELECT COUNT(*) FROM public.profiles WHERE organization_id = :org_id"),
                    {"org_id": str(organization_id)},
                ).scalar()
                or 0
            )
    except Exception:
        active_users = 0

    pending_invites = len(
        session.exec(
            select(Invite).where(
                Invite.organization_id == organization_id,
                Invite.status == "PENDING",
            )
        ).all()
    )
    seats = max(1, int(settings.licensed_seats or 1))
    allocated = active_users + pending_invites
    return BillingEntitlementsResponse(
        subscription_status=(settings.subscription_status or "INACTIVE").upper(),
        licensed_seats=seats,
        active_users=active_users,
        pending_invites=pending_invites,
        total_allocated=allocated,
        can_add_member=allocated < seats,
    )


@app.get("/api/v1/admin/settings", response_model=OrganizationSettingsResponse)
@app.get("/api/admin/settings", response_model=OrganizationSettingsResponse)
def get_organization_settings(current_user: AuthenticatedUser = Depends(require_owner)) -> OrganizationSettingsResponse:
    """Return owner organization's branding and billing profile."""

    with Session(ENGINE) as session:
        settings = session.get(OrganizationSettings, current_user.organization_id)
        if settings is None:
            settings = OrganizationSettings(organization_id=current_user.organization_id)
            settings.default_trade = _normalize_trade(current_user.organization_default_trade)
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

        settings.logo_url = payload.logo_url
        settings.website_url = payload.website_url
        settings.business_name = payload.business_name
        settings.gst_number = payload.gst_number
        settings.default_trade = _normalize_trade(payload.default_trade, default=settings.default_trade)

        if payload.tax_rate is not None:
            settings.tax_rate = payload.tax_rate
        if payload.standard_markup is not None:
            settings.standard_markup = payload.standard_markup

        settings.terms_and_conditions = (
            payload.terms_and_conditions.strip()
            if isinstance(payload.terms_and_conditions, str) and payload.terms_and_conditions.strip()
            else None
        )
        settings.bank_account_name = (
            payload.bank_account_name.strip()
            if isinstance(payload.bank_account_name, str) and payload.bank_account_name.strip()
            else None
        )
        settings.bank_account_number = (
            payload.bank_account_number.strip()
            if isinstance(payload.bank_account_number, str) and payload.bank_account_number.strip()
            else None
        )
        settings.updated_at = datetime.now(timezone.utc)

        session.add(settings)
        session.commit()
        session.refresh(settings)
        return _to_org_settings_response(settings)


@app.get("/api/v1/admin/billing/entitlements", response_model=BillingEntitlementsResponse)
@app.get("/api/admin/billing/entitlements", response_model=BillingEntitlementsResponse)
def get_billing_entitlements(current_user: AuthenticatedUser = Depends(require_owner)) -> BillingEntitlementsResponse:
    with Session(ENGINE) as session:
        return _billing_entitlements(session, current_user.organization_id)


@app.get("/api/v1/invites", response_model=list[InviteResponse])
@app.get("/api/invites", response_model=list[InviteResponse])
def list_invites(current_user: AuthenticatedUser = Depends(require_owner)) -> list[InviteResponse]:
    with Session(ENGINE) as session:
        rows = session.exec(
            select(Invite)
            .where(Invite.organization_id == current_user.organization_id)
            .order_by(Invite.created_at.desc())
        ).all()
        return [_to_invite_response(row) for row in rows]


@app.post("/api/v1/invites", response_model=InviteResponse)
@app.post("/api/invites", response_model=InviteResponse)
def create_invite(payload: InviteCreateRequest, current_user: AuthenticatedUser = Depends(require_owner)) -> InviteResponse:
    with Session(ENGINE) as session:
        settings = _ensure_org_settings(session, current_user.organization_id, current_user.organization_default_trade)
        if not _has_active_subscription_or_trial(settings):
            raise HTTPException(
                status_code=402,
                detail=(
                    "Subscription inactive and trial expired. Activate your base plan in Billing to continue."
                ),
            )
        entitlements = _billing_entitlements(session, current_user.organization_id)
        if not entitlements.can_add_member:
            raise HTTPException(
                status_code=402,
                detail=(
                    "Licensed seat limit reached. Purchase additional technician licenses in Billing before inviting more team members."
                ),
            )

        existing = session.exec(
            select(Invite).where(
                Invite.organization_id == current_user.organization_id,
                Invite.email == payload.email.strip().lower(),
                Invite.status == "PENDING",
            )
        ).first()
        if existing is not None:
            return _to_invite_response(existing)

        invite = Invite(
            organization_id=current_user.organization_id,
            invited_by_user_id=current_user.id,
            email=payload.email.strip().lower(),
            full_name=payload.full_name.strip(),
            role=payload.role.strip().upper() if payload.role else "TRADESMAN",
            status="PENDING",
            created_at=datetime.now(timezone.utc),
        )
        session.add(invite)
        session.commit()
        session.refresh(invite)
        return _to_invite_response(invite)


@app.post("/api/v1/referrals/capture", response_model=ReferralCaptureResponse)
@app.post("/api/referrals/capture", response_model=ReferralCaptureResponse)
def capture_referral(payload: ReferralCaptureRequest) -> ReferralCaptureResponse:
    with Session(ENGINE) as session:
        code = payload.referral_code.strip().upper()
        affiliate = session.exec(
            select(Affiliate).where(Affiliate.referral_code == code, Affiliate.is_active == True)  # noqa: E712
        ).first()
        if affiliate is None:
            raise HTTPException(status_code=404, detail="Referral code not found.")

        email = payload.email.strip().lower()
        existing = session.exec(
            select(Referral).where(Referral.referred_email == email, Referral.referral_code == code)
        ).first()
        if existing is not None:
            if payload.organization_id and existing.organization_id is None:
                existing.organization_id = payload.organization_id
                existing.updated_at = datetime.now(timezone.utc) if hasattr(existing, "updated_at") else None
                session.add(existing)
                session.commit()
                session.refresh(existing)
            return ReferralCaptureResponse(status="captured", referral_id=existing.id)

        referral = Referral(
            affiliate_id=affiliate.id,
            organization_id=payload.organization_id,
            referred_email=email,
            referral_code=code,
            status="PENDING",
            created_at=datetime.now(timezone.utc),
        )
        session.add(referral)
        session.commit()
        session.refresh(referral)
        return ReferralCaptureResponse(status="captured", referral_id=referral.id)


@app.get("/api/v1/admin/affiliates/summary", response_model=list[AffiliateSummaryRow])
@app.get("/api/admin/affiliates/summary", response_model=list[AffiliateSummaryRow])
def affiliate_summary(current_user: AuthenticatedUser = Depends(require_owner)) -> list[AffiliateSummaryRow]:
    with Session(ENGINE) as session:
        affiliates = session.exec(select(Affiliate).where(Affiliate.is_active == True)).all()  # noqa: E712
        rows: list[AffiliateSummaryRow] = []
        for affiliate in affiliates:
            referrals = session.exec(select(Referral).where(Referral.affiliate_id == affiliate.id)).all()
            referral_ids = [ref.id for ref in referrals]
            commissions = session.exec(select(Commission).where(Commission.affiliate_id == affiliate.id, Commission.status == "PENDING")).all()
            rows.append(
                AffiliateSummaryRow(
                    affiliate_id=affiliate.id,
                    name=affiliate.name,
                    referral_code=affiliate.referral_code,
                    referrals=len(referrals),
                    converted=len([ref for ref in referrals if ref.status == "CONVERTED"]),
                    pending_commission_nzd=sum((commission.amount_nzd for commission in commissions), Decimal("0.00")),
                )
            )
        return rows


def _stripe_base_price_id() -> str:
    return (os.getenv("STRIPE_BASE_PRICE_ID") or os.getenv("STRIPE_PRICE_ID") or "").strip()


def _stripe_seat_price_id() -> str:
    return (os.getenv("STRIPE_SEAT_PRICE_ID") or "").strip()


def _stripe_seat_count_from_subscription(subscription_payload: dict[str, Any]) -> int:
    seat_price_id = _stripe_seat_price_id()
    items = (((subscription_payload or {}).get("items") or {}).get("data") or [])
    seats = 1
    for item in items:
        if not isinstance(item, dict):
            continue
        price_id = str(((item.get("price") or {}).get("id") or "")).strip()
        if seat_price_id and price_id == seat_price_id:
            seats += max(0, int(item.get("quantity") or 0))
    return max(1, seats)


@app.post("/api/v1/integrations/stripe/checkout/base", response_model=StripeCheckoutResponse)
@app.post("/api/integrations/stripe/checkout/base", response_model=StripeCheckoutResponse)
def stripe_checkout_base(
    payload: StripeCheckoutRequest,
    current_user: AuthenticatedUser = Depends(require_owner),
) -> StripeCheckoutResponse:
    price_id = _stripe_base_price_id()
    if not price_id:
        raise HTTPException(status_code=500, detail="STRIPE_BASE_PRICE_ID or STRIPE_PRICE_ID is not configured.")

    try:
        with Session(ENGINE) as session:
            settings = _ensure_org_settings(session, current_user.organization_id, current_user.organization_default_trade)
            result = create_checkout_session(
                customer_id=settings.stripe_customer_id,
                success_url=payload.success_url,
                cancel_url=payload.cancel_url,
                price_id=price_id,
                quantity=1,
                metadata={
                    "organization_id": str(current_user.organization_id),
                    "purchase_type": "base",
                },
            )
            customer = result.get("customer")
            if isinstance(customer, str) and customer.strip() and not settings.stripe_customer_id:
                settings.stripe_customer_id = customer.strip()
                settings.updated_at = datetime.now(timezone.utc)
                session.add(settings)
                session.commit()
    except BillingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    session_id = str(result.get("id") or "")
    url = str(result.get("url") or "")
    if not session_id or not url:
        raise HTTPException(status_code=500, detail="Stripe checkout session payload was incomplete.")
    return StripeCheckoutResponse(session_id=session_id, url=url)


@app.post("/api/v1/integrations/stripe/checkout/seats", response_model=StripeCheckoutResponse)
@app.post("/api/integrations/stripe/checkout/seats", response_model=StripeCheckoutResponse)
def stripe_checkout_seats(
    payload: StripeCheckoutRequest,
    current_user: AuthenticatedUser = Depends(require_owner),
) -> StripeCheckoutResponse:
    seat_price_id = _stripe_seat_price_id()
    if not seat_price_id:
        raise HTTPException(status_code=500, detail="STRIPE_SEAT_PRICE_ID is not configured.")

    try:
        with Session(ENGINE) as session:
            settings = _ensure_org_settings(session, current_user.organization_id, current_user.organization_default_trade)
            result = create_checkout_session(
                customer_id=settings.stripe_customer_id,
                success_url=payload.success_url,
                cancel_url=payload.cancel_url,
                price_id=seat_price_id,
                quantity=payload.quantity,
                metadata={
                    "organization_id": str(current_user.organization_id),
                    "purchase_type": "seat_addon",
                },
            )
            customer = result.get("customer")
            if isinstance(customer, str) and customer.strip() and not settings.stripe_customer_id:
                settings.stripe_customer_id = customer.strip()
                settings.updated_at = datetime.now(timezone.utc)
                session.add(settings)
                session.commit()
    except BillingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    session_id = str(result.get("id") or "")
    url = str(result.get("url") or "")
    if not session_id or not url:
        raise HTTPException(status_code=500, detail="Stripe checkout session payload was incomplete.")
    return StripeCheckoutResponse(session_id=session_id, url=url)


@app.post("/api/v1/integrations/stripe/portal", response_model=StripePortalResponse)
@app.post("/api/integrations/stripe/portal", response_model=StripePortalResponse)
def stripe_customer_portal(
    payload: StripePortalRequest,
    current_user: AuthenticatedUser = Depends(require_owner),
) -> StripePortalResponse:
    with Session(ENGINE) as session:
        settings = _ensure_org_settings(session, current_user.organization_id, current_user.organization_default_trade)
        if not settings.stripe_customer_id:
            raise HTTPException(status_code=400, detail="No Stripe customer is linked yet. Start with base subscription checkout.")

    try:
        result = create_customer_portal_session(customer_id=settings.stripe_customer_id, return_url=payload.return_url)
    except BillingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    url = str(result.get("url") or "")
    if not url:
        raise HTTPException(status_code=500, detail="Stripe portal session payload was incomplete.")
    return StripePortalResponse(url=url)


def _apply_subscription_snapshot(session: Session, settings: OrganizationSettings, subscription_id: str) -> None:
    subscription = retrieve_subscription(subscription_id)
    settings.stripe_subscription_id = str(subscription.get("id") or settings.stripe_subscription_id or "").strip() or None
    status = str(subscription.get("status") or "").strip().upper() or "INACTIVE"
    settings.subscription_status = status
    settings.licensed_seats = _stripe_seat_count_from_subscription(subscription)
    items = (((subscription or {}).get("items") or {}).get("data") or [])
    seat_price_id = _stripe_seat_price_id()
    if seat_price_id:
        for item in items:
            if not isinstance(item, dict):
                continue
            if str(((item.get("price") or {}).get("id") or "")).strip() == seat_price_id:
                settings.stripe_subscription_item_id = str(item.get("id") or "").strip() or None
                break
    settings.updated_at = datetime.now(timezone.utc)
    session.add(settings)


def _find_settings_for_customer(session: Session, customer_id: str) -> OrganizationSettings | None:
    return session.exec(select(OrganizationSettings).where(OrganizationSettings.stripe_customer_id == customer_id)).first()


def _find_settings_for_subscription(session: Session, subscription_id: str) -> OrganizationSettings | None:
    return session.exec(select(OrganizationSettings).where(OrganizationSettings.stripe_subscription_id == subscription_id)).first()


@app.post("/api/v1/integrations/stripe/webhook")
@app.post("/api/integrations/stripe/webhook")
async def stripe_webhook(request: Request, stripe_signature: str | None = Header(default=None, alias="Stripe-Signature")) -> dict[str, str]:
    payload = await request.body()
    try:
        event = verify_webhook_signature(payload=payload, signature_header=stripe_signature)
    except BillingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    event_type = str(event.get("type") or "")
    data_object = ((event.get("data") or {}).get("object") or {}) if isinstance(event, dict) else {}

    try:
        with Session(ENGINE) as session:
            if event_type == "checkout.session.completed":
                org_id_raw = str((data_object.get("metadata") or {}).get("organization_id") or "").strip()
                customer_id = str(data_object.get("customer") or "").strip()
                subscription_id = str(data_object.get("subscription") or "").strip()

                settings = None
                if org_id_raw:
                    try:
                        settings = _ensure_org_settings(session, UUID(org_id_raw))
                    except Exception:
                        settings = None
                if settings is None and customer_id:
                    settings = _find_settings_for_customer(session, customer_id)

                if settings is not None:
                    if customer_id:
                        settings.stripe_customer_id = customer_id
                    if subscription_id:
                        _apply_subscription_snapshot(session, settings, subscription_id)
                    session.commit()

            elif event_type in {"customer.subscription.updated", "customer.subscription.created", "customer.subscription.deleted"}:
                subscription_id = str(data_object.get("id") or "").strip()
                customer_id = str(data_object.get("customer") or "").strip()
                settings = None
                if subscription_id:
                    settings = _find_settings_for_subscription(session, subscription_id)
                if settings is None and customer_id:
                    settings = _find_settings_for_customer(session, customer_id)
                if settings is not None:
                    if customer_id:
                        settings.stripe_customer_id = customer_id
                    if subscription_id:
                        settings.stripe_subscription_id = subscription_id
                        if event_type == "customer.subscription.deleted":
                            settings.subscription_status = "CANCELED"
                            settings.licensed_seats = max(1, int(settings.licensed_seats or 1))
                        else:
                            _apply_subscription_snapshot(session, settings, subscription_id)
                    settings.updated_at = datetime.now(timezone.utc)
                    session.add(settings)
                    session.commit()

            elif event_type == "invoice.payment_succeeded":
                customer_id = str(data_object.get("customer") or "").strip()
                invoice_id = str(data_object.get("id") or "").strip() or None
                paid_amount = Decimal(str((data_object.get("amount_paid") or 0))) / Decimal("100")
                settings = _find_settings_for_customer(session, customer_id) if customer_id else None
                if settings is not None:
                    referral = session.exec(
                        select(Referral).where(
                            Referral.organization_id == settings.organization_id,
                            Referral.status.in_(["PENDING", "CAPTURED", "CONVERTED"]),
                        )
                    ).first()
                    if referral is not None:
                        referral.status = "CONVERTED"
                        referral.converted_at = datetime.now(timezone.utc)
                        session.add(referral)
                        commission = Commission(
                            referral_id=referral.id,
                            affiliate_id=referral.affiliate_id,
                            organization_id=settings.organization_id,
                            amount_nzd=(paid_amount * Decimal("0.20")).quantize(Decimal("0.01")),
                            currency="NZD",
                            status="PENDING",
                            stripe_invoice_id=invoice_id,
                            created_at=datetime.now(timezone.utc),
                        )
                        session.add(commission)
                        session.commit()
    except BillingError as exc:
        logger.warning("Stripe webhook processing warning: %s", exc)

    return {"status": "ok"}


def _to_vehicle_response(vehicle: Vehicle) -> VehicleResponse:
    return VehicleResponse(
        id=vehicle.id,
        organization_id=vehicle.organization_id,
        name=vehicle.name,
        plate=vehicle.plate,
        notes=vehicle.notes,
        created_at=vehicle.created_at,
        updated_at=vehicle.updated_at,
    )


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


def _xero_env_value(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise HTTPException(status_code=500, detail=f"{name} is not configured.")
    return value


def _xero_state_secret() -> str:
    return os.getenv("XERO_STATE_SECRET", os.getenv("SECRET_KEY", "sparkops-xero-state-secret"))


def _build_xero_state(organization_id: UUID) -> str:
    payload = {
        "org": str(organization_id),
        "ts": int(datetime.now(timezone.utc).timestamp()),
        "nonce": secrets.token_urlsafe(8),
    }
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")).decode("utf-8").rstrip("=")
    signature = hmac.new(_xero_state_secret().encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{signature}"


def _decode_xero_state(state: str) -> dict[str, Any]:
    try:
        encoded_payload, supplied_signature = state.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid Xero state.") from exc

    expected_signature = hmac.new(_xero_state_secret().encode("utf-8"), encoded_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_signature, supplied_signature):
        raise HTTPException(status_code=400, detail="Invalid Xero state signature.")

    padded_payload = encoded_payload + "=" * (-len(encoded_payload) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded_payload.encode("utf-8")).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid Xero state payload.") from exc

    timestamp = int(payload.get("ts") or 0)
    if timestamp <= 0:
        raise HTTPException(status_code=400, detail="Invalid Xero state timestamp.")

    age_seconds = int(datetime.now(timezone.utc).timestamp()) - timestamp
    if age_seconds > 20 * 60:
        raise HTTPException(status_code=400, detail="Xero state has expired. Retry connect.")

    return payload


def _xero_oauth_headers(client_id: str, client_secret: str) -> dict[str, str]:
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("utf-8")
    return {
        "Authorization": f"Basic {basic}",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
    }


def _xero_token_exchange(form_payload: dict[str, str]) -> dict[str, Any]:
    client_id = _xero_env_value("XERO_CLIENT_ID")
    client_secret = _xero_env_value("XERO_CLIENT_SECRET")
    token_url = "https://identity.xero.com/connect/token"
    body = urlencode(form_payload).encode("utf-8")

    request = UrlRequest(token_url, data=body, method="POST")
    for key, value in _xero_oauth_headers(client_id, client_secret).items():
        request.add_header(key, value)

    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else str(exc)
        raise HTTPException(status_code=502, detail=f"Xero token exchange failed: {details or str(exc)}") from exc


def _xero_connections(access_token: str) -> list[dict[str, Any]]:
    request = UrlRequest("https://api.xero.com/connections", method="GET")
    request.add_header("Authorization", f"Bearer {access_token}")
    request.add_header("Accept", "application/json")
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else str(exc)
        raise HTTPException(status_code=502, detail=f"Xero connections lookup failed: {details or str(exc)}") from exc

    return payload if isinstance(payload, list) else []


def _decimal_or_default(value: Any, fallback: Decimal = Decimal("0")) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    if isinstance(value, str):
        normalized = value.strip().replace("$", "")
        if not normalized:
            return fallback
        try:
            return Decimal(normalized)
        except Exception:
            return fallback
    return fallback


def _build_xero_invoice_payload(job: JobDraft) -> dict[str, Any]:
    extracted = job.extracted_data if isinstance(job.extracted_data, dict) else {}
    contact_name = str(extracted.get("client") or "TradeOps Client").strip() or "TradeOps Client"
    job_title = str(extracted.get("job_title") or "Electrical Services").strip() or "Electrical Services"
    line_items_raw = extracted.get("line_items") if isinstance(extracted.get("line_items"), list) else []

    line_items: list[dict[str, Any]] = []
    for row in line_items_raw:
        if not isinstance(row, dict):
            continue
        quantity = _decimal_or_default(row.get("qty"), Decimal("1"))
        if quantity <= 0:
            quantity = Decimal("1")
        unit_amount = _decimal_or_default(row.get("unit_price"), Decimal("0"))
        line_total = _decimal_or_default(row.get("line_total"), Decimal("0"))
        if unit_amount <= 0 and line_total > 0 and quantity > 0:
            unit_amount = (line_total / quantity).quantize(Decimal("0.01"))
        if unit_amount <= 0:
            continue

        line_items.append(
            {
                "Description": str(row.get("description") or job_title).strip() or job_title,
                "Quantity": float(quantity),
                "UnitAmount": float(unit_amount),
                "AccountCode": "200",
                "TaxType": "OUTPUT2",
            }
        )

    if not line_items:
        line_items.append(
            {
                "Description": job_title,
                "Quantity": 1.0,
                "UnitAmount": 0.01,
                "AccountCode": "200",
                "TaxType": "OUTPUT2",
            }
        )

    invoice_date = (job.date_scheduled or datetime.now(timezone.utc)).date()
    due_date = invoice_date + timedelta(days=14)
    return {
        "Type": "ACCREC",
        "Contact": {"Name": contact_name},
        "Date": invoice_date.isoformat(),
        "DueDate": due_date.isoformat(),
        "Status": "AUTHORISED",
        "Reference": str(job.id),
        "LineItems": line_items,
    }


def _refresh_xero_access_token(integration: Integration) -> dict[str, Any]:
    if not integration.refresh_token:
        raise HTTPException(status_code=401, detail="Xero refresh token unavailable. Reconnect integration.")

    token_payload = _xero_token_exchange(
        {
            "grant_type": "refresh_token",
            "refresh_token": integration.refresh_token,
        }
    )

    access_token = str(token_payload.get("access_token") or "").strip()
    if not access_token:
        raise HTTPException(status_code=502, detail="Xero refresh response missing access token.")

    integration.access_token = access_token
    refresh_token = str(token_payload.get("refresh_token") or "").strip()
    integration.refresh_token = refresh_token or integration.refresh_token
    expires_in = int(token_payload.get("expires_in") or 0)
    if expires_in > 0:
        integration.expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    integration.updated_at = datetime.now(timezone.utc)
    return token_payload


def _xero_redirect_uri() -> str:
    """Return the Xero OAuth redirect URI, consistent between connect and callback."""
    configured = os.getenv("XERO_REDIRECT_URI", "").strip()
    if configured:
        return configured
    if os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_SERVICE_NAME"):
        return "https://sparkopsstagingbackend-staging.up.railway.app/api/integrations/xero/callback"
    return "http://localhost:8000/api/integrations/xero/callback"


@app.get("/api/v1/integrations/xero/connect", response_model=XeroConnectResponse)
@app.get("/api/integrations/xero/connect", response_model=XeroConnectResponse)
def connect_xero(current_user: AuthenticatedUser = Depends(require_owner)) -> XeroConnectResponse:
    """Build the OAuth2 authorization URL for Xero connect."""

    client_id = _xero_env_value("XERO_CLIENT_ID")
    redirect_uri = _xero_redirect_uri()
    scope_string = os.getenv(
        "XERO_SCOPES",
        "openid profile email offline_access accounting.transactions accounting.contacts",
    ).strip()
    state = _build_xero_state(current_user.organization_id)
    encoded_scope = quote(scope_string, safe="")

    auth_query = urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "state": state,
        }
    ) + f"&scope={encoded_scope}"
    return XeroConnectResponse(
        provider="XERO",
        auth_url=f"https://login.xero.com/identity/connect/authorize?{auth_query}",
        state=state,
    )


@app.get("/api/v1/integrations/xero/callback", response_model=XeroConnectCallbackResponse)
@app.get("/api/integrations/xero/callback", response_model=XeroConnectCallbackResponse)
def connect_xero_callback(
    code: str,
    state: str,
) -> XeroConnectCallbackResponse:
    """Handle Xero OAuth callback and persist access/refresh tokens."""

    parsed_state = _decode_xero_state(state)
    state_org_id = str(parsed_state.get("org") or "").strip()
    if not state_org_id:
        raise HTTPException(status_code=400, detail="Xero state is missing organization id.")
    try:
        organization_id = UUID(state_org_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Xero state organization id is invalid.") from exc

    token_payload = _xero_token_exchange(
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": _xero_redirect_uri(),
        }
    )

    access_token = str(token_payload.get("access_token") or "").strip()
    refresh_token = str(token_payload.get("refresh_token") or "").strip()
    expires_in = int(token_payload.get("expires_in") or 0)
    if not access_token:
        raise HTTPException(status_code=502, detail="Xero callback missing access token.")

    connections = _xero_connections(access_token)
    tenant_id = None
    for connection in connections:
        if isinstance(connection, dict):
            candidate = str(connection.get("tenantId") or connection.get("tenant_id") or "").strip()
            if candidate:
                tenant_id = candidate
                break

    with Session(ENGINE) as session:
        existing = session.exec(
            select(Integration)
            .where(Integration.organization_id == organization_id)
            .where(Integration.provider == "XERO")
            .limit(1)
        ).first()

        record = existing or Integration(organization_id=organization_id, provider="XERO", access_token=access_token)
        record.access_token = access_token
        record.refresh_token = refresh_token or None
        record.tenant_id = tenant_id
        record.expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in) if expires_in > 0 else None
        record.updated_at = datetime.now(timezone.utc)

        session.add(record)
        session.commit()

    return XeroConnectCallbackResponse(
        status="connected",
        organization_id=organization_id,
        provider="XERO",
        tenant_id=tenant_id,
    )


@app.post("/api/v1/integrations/xero/push-invoice", response_model=XeroPushInvoiceResponse)
@app.post("/api/integrations/xero/push-invoice", response_model=XeroPushInvoiceResponse)
def push_invoice_to_xero(
    payload: XeroPushInvoiceRequest,
    current_user: AuthenticatedUser = Depends(require_owner),
) -> XeroPushInvoiceResponse:
    """Push a completed job draft invoice payload to Xero accounting."""

    with Session(ENGINE) as session:
        integration = session.exec(
            select(Integration)
            .where(Integration.organization_id == current_user.organization_id)
            .where(Integration.provider == "XERO")
            .limit(1)
        ).first()
        if integration is None:
            raise HTTPException(status_code=404, detail="Xero integration is not connected for this organization.")
        if not integration.tenant_id:
            raise HTTPException(status_code=400, detail="Xero tenant not linked. Reconnect integration.")

        draft = session.get(JobDraft, payload.job_id)
        if draft is None:
            raise HTTPException(status_code=404, detail="Job draft not found.")
        if draft.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Job draft belongs to another organization.")
        if str(draft.status).upper() != "DONE":
            raise HTTPException(status_code=400, detail="Only completed jobs can be pushed to Xero.")

        invoice_payload = _build_xero_invoice_payload(draft)
        request_body = json.dumps({"Invoices": [invoice_payload]}).encode("utf-8")

        def send_invoice(access_token: str) -> None:
            request = UrlRequest("https://api.xero.com/api.xro/2.0/Invoices", data=request_body, method="POST")
            request.add_header("Authorization", f"Bearer {access_token}")
            request.add_header("Xero-tenant-id", integration.tenant_id or "")
            request.add_header("Content-Type", "application/json")
            request.add_header("Accept", "application/json")
            with urlopen(request, timeout=20):
                return

        try:
            send_invoice(integration.access_token)
        except HTTPError as exc:
            if exc.code == 401:
                _refresh_xero_access_token(integration)
                session.add(integration)
                session.commit()
                try:
                    send_invoice(integration.access_token)
                except HTTPError as retry_exc:
                    details = retry_exc.read().decode("utf-8", errors="ignore") if hasattr(retry_exc, "read") else str(retry_exc)
                    raise HTTPException(status_code=502, detail=f"Xero invoice push failed: {details or str(retry_exc)}") from retry_exc
            else:
                details = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else str(exc)
                raise HTTPException(status_code=502, detail=f"Xero invoice push failed: {details or str(exc)}") from exc

    return XeroPushInvoiceResponse(
        status="pushed",
        provider="XERO",
        job_id=payload.job_id,
        invoice_payload=invoice_payload,
    )


@app.post("/api/v1/jobs", response_model=JobDraftResponse)
@app.post("/api/jobs", response_model=JobDraftResponse)
def create_job_draft(
    payload: ManualJobCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> JobDraftResponse:
    """Create a new job draft."""

    assigned_user_id = current_user.id
    assigned_user_name = current_user.full_name or current_user.email or "Assigned User"
    assigned_user_trade = current_user.trade
    required_trade = _normalize_trade(current_user.organization_default_trade)
    if current_user.role == "OWNER" and payload.assigned_to_user_id is not None:
        with Session(ENGINE) as session:
            assignee_row = session.exec(
                text(
                    """
                    SELECT id, full_name, trade
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
        assignee_id, assignee_full_name, assignee_trade_raw = assignee_row
        assigned_user_id = UUID(str(assignee_id))
        assigned_user_name = str(assignee_full_name or "").strip() or assigned_user_name
        assigned_user_trade = _normalize_trade(assignee_trade_raw, default=current_user.organization_default_trade)

    if required_trade != "ANY" and assigned_user_trade != required_trade:
        raise HTTPException(
            status_code=400,
            detail=f"Assigned user trade ({assigned_user_trade}) does not match required trade ({required_trade}).",
        )

    client_name = payload.client_name.strip()
    title = payload.title.strip()
    location = payload.location.strip()
    address = payload.address.strip() if isinstance(payload.address, str) and payload.address.strip() else location
    latitude = float(payload.latitude) if isinstance(payload.latitude, (int, float)) else None
    longitude = float(payload.longitude) if isinstance(payload.longitude, (int, float)) else None
    scheduled_date = payload.scheduled_date.strip() if isinstance(payload.scheduled_date, str) else ""
    scheduled_at: datetime | None = None
    if scheduled_date:
        try:
            scheduled_at = datetime.fromisoformat(scheduled_date.replace("Z", "+00:00"))
            if scheduled_at.tzinfo is None:
                scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Scheduled date must be a valid ISO datetime.") from exc

    extracted_data: dict[str, Any] = {
        "client": client_name,
        "job_title": title,
        "location": address,
        "address": address,
        "latitude": latitude,
        "longitude": longitude,
        "assigned_to_user_id": str(assigned_user_id),
        "assigned_to_name": assigned_user_name,
        "required_trade": required_trade,
        "scheduled_date": scheduled_at.isoformat() if scheduled_at else None,
        "line_items": [],
        "safety_tests": [],
    }
    compliance_status, missing_items, compliance_note = _compute_guardrail_status(f"Manual job: {title}", [], required_trade)
    extracted_data["compliance_summary"] = {
        "status": compliance_status,
        "missing_items": missing_items,
        "notes": compliance_note,
    }

    with Session(ENGINE) as session:
        draft_kwargs: dict[str, Any] = {
            "user_id": assigned_user_id,
            "organization_id": current_user.organization_id,
            "raw_transcript": f"Manual job: {title}",
            "extracted_data": extracted_data,
            "status": "DRAFT",
            "required_trade": required_trade,
            "date_scheduled": scheduled_at,
            "client_email": payload.client_email.strip().lower() if isinstance(payload.client_email, str) and payload.client_email.strip() else None,
            "compliance_status": compliance_status,
        }
        if payload.client_generated_id is not None:
            draft_kwargs["id"] = payload.client_generated_id

        draft = JobDraft(**draft_kwargs)

        session.add(draft)
        session.commit()
        session.refresh(draft)
        return JobDraftResponse(
            id=draft.id,
            raw_transcript=draft.raw_transcript,
            extracted_data=draft.extracted_data,
            status=draft.status,
            date_scheduled=draft.date_scheduled,
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
            if "required_trade" not in extracted_data:
                extracted_data["required_trade"] = _normalize_trade(draft.required_trade)

            client_name = str(extracted_data.get("client") or "Unknown Client").strip() or "Unknown Client"

            results.append(
                JobDraftListItemResponse(
                    id=draft.id,
                    status=draft.status,
                    compliance_status=draft.compliance_status,
                    created_at=draft.created_at,
                    date_scheduled=draft.date_scheduled,
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
        extracted_data.setdefault("required_trade", _normalize_trade(draft.required_trade))

        return JobDraftResponse(
            id=draft.id,
            raw_transcript=draft.raw_transcript,
            extracted_data=extracted_data,
            status=draft.status,
            date_scheduled=draft.date_scheduled,
            client_email=draft.client_email,
            compliance_status=draft.compliance_status,
            certificate_pdf_url=draft.certificate_pdf_url,
            created_at=draft.created_at,
        )


@app.post("/api/jobs/{job_id}/voice-note")
def append_job_voice_note(
    job_id: UUID,
    payload: JobVoiceNoteAppendRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, Any]:
    """Append voice-note content to an existing job draft via UPDATE semantics."""

    next_note = payload.voice_note.strip() if isinstance(payload.voice_note, str) else ""
    next_audio_url = payload.audio_url.strip() if isinstance(payload.audio_url, str) else ""
    if not next_note and not next_audio_url:
        raise HTTPException(status_code=400, detail="Provide voice_note or audio_url.")

    with Session(ENGINE) as session:
        draft = session.get(JobDraft, job_id)
        if draft is None:
            raise HTTPException(status_code=404, detail="Job draft not found.")

        _assert_job_write_access(draft, current_user)

        extracted = draft.extracted_data if isinstance(draft.extracted_data, dict) else {}

        if next_note:
            existing_transcript = str(draft.raw_transcript or "").strip()
            if not existing_transcript:
                draft.raw_transcript = next_note
            elif existing_transcript.endswith(next_note):
                draft.raw_transcript = existing_transcript
            else:
                draft.raw_transcript = f"{existing_transcript}\n{next_note}"

            existing_notes_raw = extracted.get("voice_notes")
            existing_notes = existing_notes_raw if isinstance(existing_notes_raw, list) else []
            if next_note not in existing_notes:
                extracted["voice_notes"] = [*existing_notes, next_note]
            else:
                extracted["voice_notes"] = existing_notes

        if next_audio_url:
            existing_audio_raw = extracted.get("voice_note_audio_urls")
            existing_audio_urls = existing_audio_raw if isinstance(existing_audio_raw, list) else []
            if next_audio_url not in existing_audio_urls:
                extracted["voice_note_audio_urls"] = [*existing_audio_urls, next_audio_url]
            else:
                extracted["voice_note_audio_urls"] = existing_audio_urls

        draft.extracted_data = extracted
        session.add(draft)
        session.commit()
        session.refresh(draft)

    return {
        "raw_transcript": draft.raw_transcript,
        "extracted_data": draft.extracted_data if isinstance(draft.extracted_data, dict) else {},
    }


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
        compliance_status, missing_items, compliance_note = _compute_guardrail_status(
            draft.raw_transcript,
            tests,
            _normalize_trade(draft.required_trade),
        )
        if compliance_status != "GREEN_SHIELD":
            raise HTTPException(
                status_code=400,
                detail=f"missing: {', '.join(missing_items) if missing_items else 'required evidence'}",
            )

        from services.pdf import generate_certificate_pdf

        certificate_bytes = generate_certificate_pdf(draft, tests)
        filename = f"tradeops-certificate-{draft.id}.pdf"
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
    filename = f"tradeops-certificate-{job_id}.pdf"
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
    filename = f"tradeops-invoice-{job_id}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Return health status for monitoring."""
    return HealthResponse(status="healthy", service="tradeops-data-factory", version="1.0.0")


if __name__ == "__main__":

    import uvicorn



    uvicorn.run(app, host="0.0.0.0", port=8000)
