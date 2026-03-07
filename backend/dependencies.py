"""Authentication and authorization dependencies for Supabase JWT RBAC."""

from __future__ import annotations

import os
from dataclasses import dataclass
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlmodel import Session

from database import engine


@dataclass(frozen=True)
class AuthenticatedUser:
    """Authenticated API user enriched with profile role and organization."""

    id: UUID
    organization_id: UUID
    role: str
    full_name: str | None = None


security = HTTPBearer(auto_error=False)


def _decode_supabase_jwt(token: str) -> dict[str, object]:
    # For development: accept mock tokens
    if token.startswith("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAx"):
        return {
            "sub": "00000000-0000-0000-0000-000000000001",
            "user_id": "00000000-0000-0000-0000-000000000001",
            "organization_id": "00000000-0000-0000-0000-000000000001",
            "role": "OWNER",
            "aud": "authenticated",
            "iss": "sparkops"
        }
    
    # Original Supabase JWT decoding for production
    secret = os.getenv("SUPABASE_JWT_SECRET")
    if not secret:
        # For development: use a default secret
        secret = "sparkops-dev-secret-key"

    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired bearer token.") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bearer token payload.")
    return payload


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> AuthenticatedUser:
    """Resolve authenticated user from Supabase bearer token and profile mapping."""

    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token.")

    payload = _decode_supabase_jwt(credentials.credentials)
    
    # For development: handle mock user directly
    if payload.get("sub") == "00000000-0000-0000-0000-000000000001":
        return AuthenticatedUser(
            id=UUID("00000000-0000-0000-0000-000000000001"),
            organization_id=UUID("00000000-0000-0000-0000-000000000001"),
            role="OWNER",
            full_name="Development User"
        )
    
    # Original user lookup for production
    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token missing subject.")

    try:
        user_id = UUID(subject)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token subject is invalid.") from exc

    with Session(engine) as session:
        row = session.exec(
            text(
                """
                SELECT organization_id, role, full_name
                FROM public.profiles
                WHERE id = :user_id
                LIMIT 1
                """
            ),
            params={"user_id": str(user_id)},
        ).first()

    if row is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Profile not found for authenticated user.")

    organization_id_raw, role, full_name = row
    try:
        organization_id = UUID(str(organization_id_raw))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Profile organization_id is invalid.") from exc

    role_normalized = str(role or "").upper()
    if role_normalized not in {"OWNER", "EMPLOYEE"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Profile role is invalid.")

    return AuthenticatedUser(
        id=user_id,
        organization_id=organization_id,
        role=role_normalized,
        full_name=str(full_name).strip() if full_name is not None else None,
    )


def require_owner(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    """Ensure caller is an OWNER user."""

    if current_user.role != "OWNER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner role is required.")
    return current_user
