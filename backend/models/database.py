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
    raw_transcript: str = Field(sa_column=Column(Text, nullable=False))
    extracted_data: dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))
    status: str = Field(default="DRAFT", max_length=32)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False)


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
    
    return db_engine
