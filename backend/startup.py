#!/usr/bin/env python3
"""
Railway deployment startup script
Ensures all required environment variables are present before starting the application
"""

import os
import sys
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_required_env_vars():
    """Check that all required environment variables are present"""
    required_vars = [
        'DATABASE_URL',  # or POSTGRES_URL/POSTGRESQL_URL
        'SUPABASE_JWT_SECRET',
        'NEXT_PUBLIC_SUPABASE_URL',
        'SECRET_KEY',
    ]
    
    missing_vars = []
    
    for var in required_vars:
        if not os.getenv(var):
            # Check for alternative database URLs
            if var == 'DATABASE_URL':
                if os.getenv('POSTGRES_URL') or os.getenv('POSTGRESQL_URL'):
                    continue
            # Make SECRET_KEY more lenient for Railway
            if var == 'SECRET_KEY':
                # Generate a default secret if not provided
                import secrets
                default_secret = secrets.token_urlsafe(32)
                os.environ['SECRET_KEY'] = default_secret
                logger.warning(f"Generated default SECRET_KEY for Railway deployment")
                continue
            missing_vars.append(var)
    
    if missing_vars:
        logger.error(f"Missing required environment variables: {missing_vars}")
        logger.error("Please set these variables in Railway dashboard and redeploy")
        sys.exit(1)
    
    logger.info("All required environment variables are present")

def check_optional_env_vars():
    """Log warnings for optional but recommended variables"""
    optional_vars = [
        'OPENAI_API_KEY',
        'FRONTEND_URL',
        'XERO_CLIENT_ID',
        'XERO_CLIENT_SECRET',
    ]
    
    missing_optional = [var for var in optional_vars if not os.getenv(var)]
    
    if missing_optional:
        logger.warning(f"Missing optional environment variables: {missing_optional}")
        logger.warning("Some features may not work without these variables")

if __name__ == "__main__":
    logger.info("Starting Railway deployment checks...")
    
    try:
        check_required_env_vars()
        check_optional_env_vars()
        logger.info("Environment checks passed. Starting application...")
        
        # Start the FastAPI application
        import uvicorn
        uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
        
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        sys.exit(1)
