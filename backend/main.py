from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import os
from typing import Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Security
security = HTTPBearer()

# FastAPI app
app = FastAPI(
    title="SparkOps Enterprise API",
    description="Enterprise operations management platform",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class HealthResponse(BaseModel):
    status: str
    service: str
    version: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str

# Dependency for token validation
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        # In production, implement proper JWT validation
        # For now, just check if token exists
        if not credentials.credentials:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"user_id": "temp_user"}
    except Exception as e:
        logger.error(f"Token validation error: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")

@app.get("/", response_model=HealthResponse)
async def root():
    """Root endpoint with health check"""
    return HealthResponse(
        status="healthy",
        service="sparkops-enterprise-api",
        version="1.0.0"
    )

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        service="sparkops-enterprise-api",
        version="1.0.0"
    )

@app.get("/api/user/profile", response_model=UserResponse)
async def get_user_profile(current_user: dict = Depends(verify_token)):
    """Get current user profile"""
    # Mock user data - replace with actual database query
    return UserResponse(
        id=current_user["user_id"],
        email="user@example.com",
        name="SparkOps User"
    )

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Global exception: {exc}")
    return HTTPException(status_code=500, detail="Internal server error")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)