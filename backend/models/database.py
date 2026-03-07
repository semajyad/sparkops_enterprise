"""Database models and engine helpers for SparkOps Sprint 1.

This module defines SQLModel entities for invoice generation and helper
functions used to initialize PostgreSQL with pgvector support.
"""

from __future__ import annotations

import os
from decimal import Decimal
from enum import Enum
from typing import Optional
from urllib.parse import quote_plus

import psycopg  # Ensure psycopg is imported
from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, Numeric, text
from sqlalchemy.engine import Engine
from sqlmodel import Field, SQLModel, create_engine


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
        vector_embedding: 3072-dimensional semantic vector for matching.
        trade_price: Trade unit price used for invoicing.
    """

    __tablename__ = "materials"

    sku: str = Field(primary_key=True, max_length=64)
    name: str = Field(index=True, max_length=255)
    vector_embedding: list[float] = Field(sa_column=Column(Vector(3072), nullable=False))
    trade_price: Decimal = Field(sa_column=Column(Numeric(10, 2), nullable=False))


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


def get_database_url() -> str:
    """Return DB URL from environment configuration.

    Returns:
        str: SQLAlchemy-compatible PostgreSQL URL.
    """

    database_url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or os.getenv("POSTGRESQL_URL")
    if database_url:
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        return database_url

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


def enable_pgvector_extension(engine: Engine) -> None:
    """Ensure pgvector extension is available in the connected database.

    Args:
        engine: Active SQLAlchemy engine.
    """

    with engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))


def create_db_and_tables(engine: Optional[Engine] = None) -> Engine:
    """Enable extensions and create all SQLModel tables.

    Args:
        engine: Optional pre-created engine.

    Returns:
        Engine: Engine used to create schema.
    """

    db_engine = engine or get_engine()
    enable_pgvector_extension(db_engine)
    SQLModel.metadata.create_all(db_engine)
    return db_engine
