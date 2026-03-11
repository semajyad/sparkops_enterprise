"""
Test user management API endpoints for E2E testing
"""
import os
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from supabase import create_client, Client
import asyncio

router = APIRouter()

class TestUserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    organization: str
    trade: str = "ELECTRICAL"
    auto_confirm: bool = True

class TestUserCleanup(BaseModel):
    email: str

def get_supabase_admin() -> Client:
    """Get Supabase client with admin privileges"""
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not supabase_url or not service_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase admin credentials not configured"
        )
    
    # Use proper client options for admin operations
    from supabase.lib.client_options import ClientOptions
    return create_client(
        supabase_url, 
        service_key, 
        options=ClientOptions(
            auto_refresh_token=False, 
            persist_session=False
        )
    )

@router.post("/create-user")
async def create_test_user(user_data: TestUserCreate) -> Dict[str, Any]:
    """Create a test user with optional auto-confirmation"""
    try:
        supabase = get_supabase_admin()
        
        # Create user with admin privileges
        user_response = supabase.auth.admin.create_user({
            "email": user_data.email,
            "password": user_data.password,
            "email_confirm": user_data.auto_confirm,
            "user_metadata": {
                "full_name": user_data.full_name,
                "organization": user_data.organization,
                "trade": user_data.trade,
                "is_test_user": True
            }
        })
        
        if user_response.user is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create test user"
            )
        
        return {
            "success": True,
            "email": user_data.email,
            "id": user_response.user.id,
            "auto_confirmed": user_data.auto_confirm,
            "message": f"Test user {'auto-confirmed' if user_data.auto_confirm else 'created'} successfully"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create test user: {str(e)}"
        )

@router.post("/cleanup-user")
async def cleanup_test_user(cleanup_data: TestUserCleanup) -> Dict[str, Any]:
    """Clean up a test user"""
    try:
        supabase = get_supabase_admin()
        
        # List users to find the test user
        users_response = supabase.auth.admin.list_users()
        target_user = None
        
        # Handle different response structures
        users_list = getattr(users_response, 'users', users_response) if hasattr(users_response, 'users') else users_response
        
        for user in users_list:
            user_email = getattr(user, 'email', None) if hasattr(user, 'email') else (user.get('email') if isinstance(user, dict) else None)
            if user_email == cleanup_data.email:
                target_user = user
                break
        
        if not target_user:
            return {
                "success": False,
                "message": f"Test user {cleanup_data.email} not found"
            }
        
        # Delete the user
        user_id = getattr(target_user, 'id', None) if hasattr(target_user, 'id') else (target_user.get('id') if isinstance(target_user, dict) else None)
        delete_response = supabase.auth.admin.delete_user(user_id)
        
        return {
            "success": True,
            "email": cleanup_data.email,
            "id": user_id,
            "message": "Test user cleaned up successfully"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cleanup test user: {str(e)}"
        )

@router.get("/health")
async def health_check() -> Dict[str, str]:
    """Health check endpoint"""
    return {"status": "healthy", "service": "test-user-management"}
