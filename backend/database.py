"""Central database engine configuration for backend runtime.

This module resolves DATABASE_URL for Railway/local usage and exposes a shared
SQLModel engine for app startup.
"""

from __future__ import annotations

import os
from urllib.parse import quote_plus

from sqlmodel import create_engine


DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    DATABASE_URL = os.getenv("POSTGRES_URL") or os.getenv("POSTGRESQL_URL")

if not DATABASE_URL:
    pg_host = os.getenv("PGHOST")
    pg_port = os.getenv("PGPORT")
    pg_user = os.getenv("PGUSER")
    pg_password = os.getenv("PGPASSWORD")
    pg_database = os.getenv("PGDATABASE")

    if all([pg_host, pg_port, pg_user, pg_password, pg_database]):
        safe_user = quote_plus(pg_user)
        safe_password = quote_plus(pg_password)
        DATABASE_URL = f"postgresql://{safe_user}:{safe_password}@{pg_host}:{pg_port}/{pg_database}"

if not DATABASE_URL:
    print("WARNING: DATABASE_URL not found, using localhost fallback.")
    DATABASE_URL = "postgresql+psycopg://postgres:password@localhost:5432/sparkops_db"

# Fix Railway's `postgres://` schema for SQLAlchemy compatibility.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

# Test PostgreSQL connection and fallback to SQLite if not available
try:
    engine = create_engine(
        DATABASE_URL,
        echo=True,
        pool_size=20,
        max_overflow=0,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 5},  # 5 second timeout
    )
    # Test connection with timeout
    with engine.connect() as conn:
        from sqlalchemy import text
        conn.execute(text("SELECT 1"))
    print("✅ PostgreSQL connection successful")
except Exception as exc:
    print(f"WARNING: PostgreSQL connection failed, falling back to SQLite: {exc}")
    engine = create_engine(
        "sqlite:///./sparkops_local.db",
        echo=False,
        connect_args={"check_same_thread": False},
    )
    print("✅ Using SQLite for local development")
