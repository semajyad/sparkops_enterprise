"""Authentication and authorization dependencies for Supabase JWT RBAC."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ValidationError
from sqlalchemy import text
from sqlmodel import Session

from database import engine


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AuthenticatedUser:
    """Authenticated API user enriched with profile role and organization."""

    id: UUID
    organization_id: UUID
    role: str
    email: str | None = None
    full_name: str | None = None


security = HTTPBearer(auto_error=False)


class SupabaseJwtClaims(BaseModel):
    """Contract for Supabase access token claims used by backend auth handshake."""

    sub: UUID
    exp: int
    email: str | None = None
    full_name: str | None = None
    user_metadata: dict[str, object] | None = None


def _claim_full_name(claims: SupabaseJwtClaims) -> str | None:
    full_name = claims.full_name
    if isinstance(full_name, str) and full_name.strip():
        return full_name.strip()

    metadata = claims.user_metadata if isinstance(claims.user_metadata, dict) else None
    metadata_name = metadata.get("full_name") if metadata else None
    if isinstance(metadata_name, str) and metadata_name.strip():
        return metadata_name.strip()

    return None


def _validate_claims_payload(payload: object) -> SupabaseJwtClaims:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid bearer token payload.")

    try:
        return SupabaseJwtClaims.model_validate(payload)
    except ValidationError as exc:
        logger.warning("Supabase bearer token payload failed contract validation")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token contract is invalid.") from exc


@lru_cache(maxsize=4)
def _get_jwks_client(jwks_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(jwks_url)


def _decode_supabase_jwt(token: str) -> SupabaseJwtClaims:
    secret = os.getenv("SUPABASE_JWT_SECRET")
    if secret:
        try:
            payload = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
            return _validate_claims_payload(payload)
        except jwt.ExpiredSignatureError as exc:
            logger.warning("Supabase bearer token expired")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired.") from exc
        except jwt.InvalidAlgorithmError:
            logger.info("Supabase token is not HS256; attempting JWKS verification")
        except jwt.PyJWTError:
            logger.info("Supabase HS256 verification failed; attempting JWKS verification")

    supabase_url = (os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL") or "").strip()
    if not supabase_url:
        logger.error("Supabase URL is not configured for JWKS verification")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase JWT verification config is missing.",
        )

    jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    try:
        signing_key = _get_jwks_client(jwks_url).get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            options={"verify_aud": False},
        )
        return _validate_claims_payload(payload)
    except jwt.ExpiredSignatureError as exc:
        logger.warning("Supabase bearer token expired")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired.") from exc
    except jwt.PyJWTError as exc:
        logger.exception("Supabase bearer token decode failed")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired bearer token.") from exc


def _provision_fallback_profile(session: Session, user_id: UUID, claims: SupabaseJwtClaims) -> tuple[UUID, str, str | None]:
    full_name = _claim_full_name(claims)

    # Generate a random organization_id for the fallback profile
    organization_id = UUID('00000000-0000-0000-0000-000000000001')  # Fixed fallback org ID

    session.exec(
        text(
            """
            INSERT INTO public.profiles(id, organization_id, role, full_name)
            VALUES (:id, :organization_id, 'OWNER', :full_name)
            ON CONFLICT (id) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                organization_id = EXCLUDED.organization_id
            """
        ),
        params={"id": str(user_id), "organization_id": str(organization_id), "full_name": full_name},
    )
    session.commit()
    logger.warning("Provisioned fallback profile for user_id=%s", user_id)
    return organization_id, "OWNER", full_name


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> AuthenticatedUser:
    """Resolve authenticated user from Supabase bearer token and profile mapping."""

    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token.")

    claims = _decode_supabase_jwt(credentials.credentials)
    user_id = claims.sub

    with Session(engine) as session:
        try:
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
                logger.warning("Profile not found for user_id=%s; provisioning fallback profile", user_id)
                organization_id, role_normalized, full_name = _provision_fallback_profile(session, user_id, claims)
            else:
                organization_id_raw, role, full_name = row
                organization_id = UUID(str(organization_id_raw))
                role_normalized = str(role or "").upper()
                if not isinstance(full_name, str) or not full_name.strip():
                    full_name = _claim_full_name(claims)
        except HTTPException:
            session.rollback()
            raise
        except ValueError as exc:
            session.rollback()
            logger.exception("Profile row has invalid UUID values for user_id=%s", user_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Profile organization_id is invalid.",
            ) from exc
        except Exception as exc:
            session.rollback()
            logger.exception("Auth profile lookup/provision failed for user_id=%s", user_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to resolve authenticated profile.",
            ) from exc

    if role_normalized not in {"OWNER", "EMPLOYEE"}:
        logger.error("Profile role is invalid for user_id=%s role=%s", user_id, role_normalized)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Profile role is invalid.")

    return AuthenticatedUser(
        id=user_id,
        organization_id=organization_id,
        role=role_normalized,
        email=claims.email.strip() if isinstance(claims.email, str) and claims.email.strip() else None,
        full_name=str(full_name).strip() if full_name is not None else None,
    )


def require_owner(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    """Ensure caller is an OWNER user."""

    if current_user.role != "OWNER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner role is required.")
    return current_user
