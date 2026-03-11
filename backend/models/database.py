"""Database models and engine helpers for SparkOps Sprint 1.

This module defines SQLModel entities for invoice generation and helper
functions used to initialize PostgreSQL with pgvector support.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Any, Optional
from urllib.parse import quote_plus
from uuid import UUID, uuid4

try:  # pragma: no cover - import side-effect guard for local test environments
    import psycopg  # noqa: F401
except Exception:  # pragma: no cover - allow sqlite/unit-test runtime without psycopg binary
    psycopg = None  # type: ignore[assignment]
try:
    from pgvector.sqlalchemy import Vector
    VECTOR_AVAILABLE = True
except ImportError:
    VECTOR_AVAILABLE = False
from sqlalchemy import JSON, Column, Numeric, Text, text
from sqlalchemy.engine import Engine
from sqlmodel import Field, SQLModel, create_engine


logger = logging.getLogger(__name__)


def is_vector_enabled() -> bool:
    """Return whether vector functionality can be used by this runtime."""

    return VECTOR_AVAILABLE


class InvoiceLineType(str, Enum):
    """Supported invoice line categories.

    Attributes:
        MATERIAL: Line represents a material item.
        LABOR: Line represents labor work.
    """

    MATERIAL = "Material"
    LABOR = "Labor"


class Material(SQLModel, table=True):
    """Catalog item that can be matched from receipt/transcript extraction.

    Attributes:
        sku: Unique stock keeping unit.
        name: Human-readable material name.
        vector_embedding: 3072-dimensional semantic vector for matching (optional).
        trade_price: Trade unit price used for invoicing.
    """

    __tablename__ = "materials"

    sku: str = Field(primary_key=True, max_length=64)
    organization_id: UUID = Field(index=True, nullable=False)
    user_id: UUID = Field(index=True, nullable=False)
    name: str = Field(index=True, max_length=255)
    trade_price: Decimal = Field(sa_column=Column(Numeric(10, 2), nullable=False))
    
    # Only include vector column when pgvector package is available.
    if VECTOR_AVAILABLE:
        vector_embedding: list[float] = Field(sa_column=Column(Vector(3072), nullable=False))


class InvoiceLine(SQLModel, table=True):
    """Normalized invoice line produced by ingestion pipeline.

    Attributes:
        id: Surrogate primary key.
        description: Professional line description.
        qty: Quantity for the line.
        unit_price: Unit currency price.
        line_total: Quantity multiplied by unit price.
        type: Line classification (Material or Labor).
    """

    __tablename__ = "invoice_lines"

    id: Optional[int] = Field(default=None, primary_key=True)
    description: str = Field(max_length=500)
    qty: Decimal = Field(sa_column=Column(Numeric(10, 2), nullable=False))
    unit_price: Decimal = Field(sa_column=Column(Numeric(10, 2), nullable=False))
    line_total: Decimal = Field(sa_column=Column(Numeric(12, 2), nullable=False))
    type: InvoiceLineType = Field(nullable=False)


class JobDraft(SQLModel, table=True):
    """Persisted triage draft extracted from a transcript."""

    __tablename__ = "job_drafts"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(index=True, nullable=False)
    organization_id: UUID = Field(index=True, nullable=False)
    raw_transcript: str = Field(sa_column=Column(Text, nullable=False))
    extracted_data: dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))
    status: str = Field(default="DRAFT", max_length=32)
    required_trade: str = Field(default="ELECTRICAL", max_length=32)
    date_scheduled: datetime | None = Field(default=None, nullable=True)
    client_email: str | None = Field(default=None, max_length=255)
    compliance_status: str = Field(default="UNKNOWN", max_length=32)
    certificate_pdf_url: str | None = Field(default=None, max_length=1000)
    completed_at: datetime | None = Field(default=None, nullable=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)


class SafetyTest(SQLModel, table=True):
    """Persisted safety test evidence linked to a job draft."""

    __tablename__ = "safety_tests"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    job_id: UUID = Field(foreign_key="job_drafts.id", index=True, nullable=False)
    organization_id: UUID = Field(index=True, nullable=False)
    user_id: UUID = Field(index=True, nullable=False)
    test_type: str = Field(max_length=64)
    value_text: str | None = Field(default=None, max_length=64)
    unit: str | None = Field(default=None, max_length=32)
    result: str | None = Field(default=None, max_length=16)
    gps_lat: Decimal | None = Field(default=None, sa_column=Column(Numeric(9, 6), nullable=True))
    gps_lng: Decimal | None = Field(default=None, sa_column=Column(Numeric(9, 6), nullable=True))
    captured_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)


class Invite(SQLModel, table=True):
    """Pending/accepted organization invite records for team management."""

    __tablename__ = "invites"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(index=True, nullable=False)
    invited_by_user_id: UUID = Field(index=True, nullable=False)
    email: str = Field(index=True, max_length=320)
    full_name: str = Field(max_length=255)
    role: str = Field(default="TRADESMAN", max_length=32)
    status: str = Field(default="PENDING", max_length=32)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)
    accepted_at: datetime | None = Field(default=None, nullable=True)


class OrganizationSettings(SQLModel, table=True):
    """Organization-level branding and billing profile used by Admin Suite."""

    __tablename__ = "organization_settings"

    organization_id: UUID = Field(primary_key=True)
    logo_url: str | None = Field(default=None, max_length=1000)
    website_url: str | None = Field(default=None, max_length=1000)
    business_name: str | None = Field(default=None, max_length=255)
    gst_number: str | None = Field(default=None, max_length=64)
    default_trade: str = Field(default="ELECTRICAL", max_length=32)
    terms_and_conditions: str | None = Field(default=None, max_length=5000)
    bank_account_name: str | None = Field(default=None, max_length=255)
    bank_account_number: str | None = Field(default=None, max_length=128)
    tax_rate: Decimal = Field(sa_column=Column(Numeric(6, 4), nullable=False, server_default="0.1500"))
    standard_markup: Decimal = Field(sa_column=Column(Numeric(6, 4), nullable=False, server_default="0.2000"))
    stripe_customer_id: str | None = Field(default=None, max_length=255)
    stripe_subscription_id: str | None = Field(default=None, max_length=255)
    stripe_subscription_item_id: str | None = Field(default=None, max_length=255)
    subscription_status: str = Field(default="INACTIVE", max_length=32)
    licensed_seats: int = Field(default=1, nullable=False)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)


class Vehicle(SQLModel, table=True):
    """Organization fleet vehicle records for owner admin controls."""

    __tablename__ = "vehicles"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(index=True, nullable=False)
    name: str = Field(max_length=255)
    plate: str = Field(max_length=64)
    notes: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)


class UserLocation(SQLModel, table=True):
    """Latest beaconed location per user for live fleet tracking."""

    __tablename__ = "user_locations"

    user_id: UUID = Field(primary_key=True)
    lat: Decimal = Field(sa_column=Column(Numeric(9, 6), nullable=False))
    lng: Decimal = Field(sa_column=Column(Numeric(9, 6), nullable=False))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)


class UserSettings(SQLModel, table=True):
    """Global user-configurable defaults used during invoice pricing."""

    __tablename__ = "user_settings"

    id: int = Field(default=1, primary_key=True)
    default_markup: Decimal = Field(sa_column=Column(Numeric(6, 4), nullable=False, server_default="0.2000"))


class Integration(SQLModel, table=True):
    """Third-party integration credentials linked to an organization."""

    __tablename__ = "integrations"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(index=True, nullable=False)
    provider: str = Field(index=True, max_length=32)
    access_token: str = Field(sa_column=Column(Text, nullable=False))
    refresh_token: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    tenant_id: str | None = Field(default=None, max_length=255)
    expires_at: datetime | None = Field(default=None, nullable=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)


class Affiliate(SQLModel, table=True):
    """Bookkeeper/partner affiliate profile with referral code."""

    __tablename__ = "affiliates"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(max_length=255)
    email: str = Field(index=True, max_length=320)
    referral_code: str = Field(index=True, max_length=64)
    payout_details: str | None = Field(default=None, max_length=1000)
    is_active: bool = Field(default=True, nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)


class Referral(SQLModel, table=True):
    """Captured referral attribution for organization onboarding and conversion."""

    __tablename__ = "referrals"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    affiliate_id: UUID = Field(index=True, nullable=False)
    organization_id: UUID | None = Field(default=None, index=True, nullable=True)
    referred_email: str = Field(index=True, max_length=320)
    referral_code: str = Field(max_length=64)
    status: str = Field(default="PENDING", max_length=32)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)
    converted_at: datetime | None = Field(default=None, nullable=True)


class Commission(SQLModel, table=True):
    """Recurring commission ledger for affiliate-attributed subscriptions."""

    __tablename__ = "commissions"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    referral_id: UUID = Field(index=True, nullable=False)
    affiliate_id: UUID = Field(index=True, nullable=False)
    organization_id: UUID = Field(index=True, nullable=False)
    amount_nzd: Decimal = Field(sa_column=Column(Numeric(10, 2), nullable=False))
    currency: str = Field(default="NZD", max_length=8)
    status: str = Field(default="PENDING", max_length=32)
    stripe_invoice_id: str | None = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)


class SafetyPlan(SQLModel, table=True):
    """Pre-job Site Specific Safety Plan captured from voice check-in."""

    __tablename__ = "safety_plans"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    job_id: UUID = Field(index=True, nullable=False)
    organization_id: UUID = Field(index=True, nullable=False)
    user_id: UUID = Field(index=True, nullable=False)
    trade: str = Field(max_length=32)
    source_transcript: str = Field(sa_column=Column(Text, nullable=False))
    plan_json: dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))
    acknowledged: bool = Field(default=False, nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)
    acknowledged_at: datetime | None = Field(default=None, nullable=True)


def get_database_url() -> str:
    """Return DB URL from environment configuration.

    Returns:
        str: SQLAlchemy-compatible PostgreSQL URL.
    """

    # Prefer explicit SQL connection URLs from Railway/Supabase/hosting env.
    database_url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or os.getenv("POSTGRESQL_URL")
    if database_url:
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql+psycopg://", 1)
        elif database_url.startswith("postgresql://"):
            database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        return database_url

    # Individual PostgreSQL environment variables
    pg_host = os.getenv("PGHOST")
    pg_port = os.getenv("PGPORT")
    pg_user = os.getenv("PGUSER")
    pg_password = os.getenv("PGPASSWORD")
    pg_database = os.getenv("PGDATABASE")

    if all([pg_host, pg_port, pg_user, pg_password, pg_database]):
        safe_user = quote_plus(pg_user)
        safe_password = quote_plus(pg_password)
        return f"postgresql+psycopg://{safe_user}:{safe_password}@{pg_host}:{pg_port}/{pg_database}"

    return "postgresql+psycopg://postgres:postgres@localhost:5432/sparkops"


def get_engine(database_url: Optional[str] = None) -> Engine:
    """Create SQLAlchemy engine for SQLModel and pgvector usage.

    Args:
        database_url: Optional explicit database URL override.

    Returns:
        Engine: SQLAlchemy engine bound to configured database.
    """

    return create_engine(database_url or get_database_url(), echo=False)


def enable_pgvector_extension(engine: Engine) -> bool:
    """Ensure pgvector extension is available in the connected database.

    Args:
        engine: SQLAlchemy engine instance.

    Returns:
        bool: True when pgvector extension is available for use.
    """

    # Skip pgvector for SQLite
    if engine.dialect.name == 'sqlite':
        logger.info("Skipping pgvector extension for SQLite")
        return False

    try:
        with engine.begin() as connection:
            extension_available = connection.execute(
                text("SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector')")
            ).scalar()
            if not extension_available:
                logger.warning("pgvector extension is not available on this PostgreSQL instance; vector features disabled.")
                return False

            connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        return True
    except Exception as exc:  # pragma: no cover - environment-specific DB capabilities
        logger.warning("Skipping pgvector extension enablement: %s", exc)
        return False


def create_db_and_tables(engine: Optional[Engine] = None) -> Engine:
    """Create database engine and all required tables.

    Args:
        engine: Optional existing engine to reuse.

    Returns:
        Engine: Configured SQLAlchemy engine with tables created.
    """

    db_engine = engine or get_engine()
    vector_enabled = enable_pgvector_extension(db_engine)
    
    # Create all tables, but handle vector columns gracefully
    try:
        SQLModel.metadata.create_all(db_engine)
        logger.info("Database tables created successfully")
    except Exception as exc:
        logger.warning("Some tables failed to create due to missing pgvector: %s", exc)
        # Create non-vector tables manually
        non_vector_tables = [
            table for table in SQLModel.metadata.sorted_tables 
            if table.name != Material.__tablename__
        ]
        SQLModel.metadata.create_all(db_engine, tables=non_vector_tables)
        logger.info("Non-vector tables created successfully")

    # Backwards-compatible schema guard for older deployments that created
    # job_drafts before user_id existed on the model.
    # Skip PostgreSQL-specific migrations for SQLite
    if db_engine.dialect.name != 'sqlite':
        try:
            with db_engine.begin() as connection:
                connection.execute(
                    text(
                        """
                    ALTER TABLE IF EXISTS public.job_drafts
                    ADD COLUMN IF NOT EXISTS user_id UUID,
                    ADD COLUMN IF NOT EXISTS organization_id UUID,
                    ADD COLUMN IF NOT EXISTS required_trade VARCHAR(32) NOT NULL DEFAULT 'ELECTRICAL',
                    ADD COLUMN IF NOT EXISTS date_scheduled TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS client_email VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS compliance_status VARCHAR(32),
                    ADD COLUMN IF NOT EXISTS certificate_pdf_url VARCHAR(1000),
                    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ
                    """
                    )
                )

                connection.execute(
                    text(
                        """
                    ALTER TABLE IF EXISTS public.organization_settings
                    ADD COLUMN IF NOT EXISTS logo_url VARCHAR(1000),
                    ADD COLUMN IF NOT EXISTS website_url VARCHAR(1000),
                    ADD COLUMN IF NOT EXISTS business_name VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS gst_number VARCHAR(64),
                    ADD COLUMN IF NOT EXISTS default_trade VARCHAR(32) NOT NULL DEFAULT 'ELECTRICAL',
                    ADD COLUMN IF NOT EXISTS terms_and_conditions VARCHAR(5000),
                    ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(128),
                    ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(6,4) NOT NULL DEFAULT 0.1500,
                    ADD COLUMN IF NOT EXISTS standard_markup NUMERIC(6,4) NOT NULL DEFAULT 0.2000,
                    ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS stripe_subscription_item_id VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(32) NOT NULL DEFAULT 'INACTIVE',
                    ADD COLUMN IF NOT EXISTS licensed_seats INTEGER NOT NULL DEFAULT 1,
                    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    """
                    )
                )

                connection.execute(
                    text(
                        """
                    ALTER TABLE IF EXISTS public.profiles
                    ADD COLUMN IF NOT EXISTS trade VARCHAR(32)
                    """
                    )
                )

            connection.execute(
                text(
                    """
                    ALTER TABLE IF EXISTS public.vehicles
                    ADD COLUMN IF NOT EXISTS notes VARCHAR(500),
                    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    """
                )
            )

            connection.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS public.integrations (
                        id UUID PRIMARY KEY,
                        organization_id UUID NOT NULL,
                        provider VARCHAR(32) NOT NULL,
                        access_token TEXT NOT NULL,
                        refresh_token TEXT,
                        tenant_id VARCHAR(255),
                        expires_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
            )

            connection.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS public.user_locations (
                        user_id UUID PRIMARY KEY,
                        lat NUMERIC(9,6) NOT NULL,
                        lng NUMERIC(9,6) NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
            )

            connection.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS public.affiliates (
                        id UUID PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        email VARCHAR(320) NOT NULL,
                        referral_code VARCHAR(64) NOT NULL,
                        payout_details VARCHAR(1000),
                        is_active BOOLEAN NOT NULL DEFAULT TRUE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
            )

            connection.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS public.referrals (
                        id UUID PRIMARY KEY,
                        affiliate_id UUID NOT NULL,
                        organization_id UUID,
                        referred_email VARCHAR(320) NOT NULL,
                        referral_code VARCHAR(64) NOT NULL,
                        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        converted_at TIMESTAMPTZ
                    )
                    """
                )
            )

            connection.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS public.commissions (
                        id UUID PRIMARY KEY,
                        referral_id UUID NOT NULL,
                        affiliate_id UUID NOT NULL,
                        organization_id UUID NOT NULL,
                        amount_nzd NUMERIC(10,2) NOT NULL,
                        currency VARCHAR(8) NOT NULL DEFAULT 'NZD',
                        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
                        stripe_invoice_id VARCHAR(255),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
            )

            connection.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS public.safety_plans (
                        id UUID PRIMARY KEY,
                        job_id UUID NOT NULL,
                        organization_id UUID NOT NULL,
                        user_id UUID NOT NULL,
                        trade VARCHAR(32) NOT NULL,
                        source_transcript TEXT NOT NULL,
                        plan_json JSON NOT NULL,
                        acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        acknowledged_at TIMESTAMPTZ
                    )
                    """
                )
            )

        except Exception as exc:
            logger.warning("Unable to apply job_drafts schema guard: %s", exc)
    
    return db_engine
