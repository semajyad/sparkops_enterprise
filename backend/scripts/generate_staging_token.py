#!/usr/bin/env python3
"""Generate mock JWT token for staging environment"""

import jwt
import os
from datetime import datetime, timedelta

# Use the actual staging JWT secret
SECRET = "nFMBcPg6S8M8/4dXa2E1C/sP8oOEtFdUhJ7npxZQkIDPOU2rPO2MMKv6qf0GGu1xxPzTfoAemT9imfeIR72snw="

def generate_staging_token():
    """Generate a mock JWT token for staging testing"""
    
    payload = {
        "user_id": "00000000-0000-0000-0000-000000000001",
        "organization_id": "00000000-0000-0000-0000-000000000001", 
        "role": "OWNER",
        "exp": datetime.utcnow() + timedelta(hours=24),
        "iat": datetime.utcnow(),
        "iss": "sparkops"
    }
    
    token = jwt.encode(payload, SECRET, algorithm="HS256")
    
    print("🔑 Staging Mock JWT Token:")
    print(token)
    print()
    print("📋 Use this token in Authorization header:")
    print(f"Authorization: Bearer {token}")
    
    return token

if __name__ == "__main__":
    generate_staging_token()