"""
Test user management API router for E2E testing
"""
from fastapi import APIRouter
from .create_user import router as create_user_router

router = APIRouter(prefix="/api/test", tags=["test"])

# Include the create_user router
router.include_router(create_user_router, prefix="")
