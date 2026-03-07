"""Simple JWT-based authentication for development/testing."""

import os
from datetime import datetime, timedelta
from typing import Optional
import jwt
from uuid import UUID

# Simple JWT auth for development
JWT_SECRET = os.getenv("JWT_SECRET", "sparkops-dev-secret-key")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

def create_mock_user_token(user_id: str, organization_id: str, role: str = "OWNER") -> str:
    """Create a mock JWT token for testing."""
    payload = {
        "user_id": user_id,
        "organization_id": organization_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
        "iat": datetime.utcnow(),
        "iss": "sparkops"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_mock_token(token: str) -> Optional[dict]:
    """Verify a mock JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

# Generate a mock token for testing
if __name__ == "__main__":
    mock_token = create_mock_user_token(
        user_id="00000000-0000-0000-0000-000000000001",
        organization_id="00000000-0000-0000-0000-000000000001",
        role="OWNER"
    )
    print("🔑 Mock JWT Token for Testing:")
    print(mock_token)
    print("\n📋 Use this token in Authorization header:")
    print(f"Authorization: Bearer {mock_token}")