"""Generate proper Supabase configuration and test database connection."""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
import jwt
import uuid

def generate_supabase_anon_key():
    """Generate a proper Supabase anon key format."""
    # This is a mock implementation - in production you'd get this from Supabase dashboard
    payload = {
        "iss": "https://mpdvcydpiatasvreqlvx.supabase.co",
        "sub": "anonymous",
        "aud": "authenticated",
        "role": "anon",
        "iat": 1734406876,
        "exp": 2049982876
    }
    
    # This is a mock secret key - in production use the actual Supabase secret
    secret = "your-supabase-jwt-secret"
    
    # Generate mock JWT (this won't work with real Supabase without the actual secret)
    token = jwt.encode(payload, secret, algorithm="HS256")
    return token

def test_database_connection():
    """Test if we can connect to the Supabase database."""
    load_dotenv()
    
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ DATABASE_URL not found")
        return False
    
    try:
        engine = create_engine(database_url)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            print("✅ Database connection successful")
            return True
    except Exception as exc:
        print(f"❌ Database connection failed: {exc}")
        return False

def check_supabase_setup():
    """Check current Supabase configuration."""
    load_dotenv()
    
    print("🔍 Current Supabase Configuration:")
    print(f"  URL: {os.getenv('SUPABASE_URL')}")
    print(f"  Service Role Key: {os.getenv('SUPABASE_SERVICE_ROLE_KEY')[:20]}...")
    
    # Check frontend env
    frontend_env_path = "frontend/.env.production"
    if os.path.exists(frontend_env_path):
        with open(frontend_env_path, 'r') as f:
            content = f.read()
            if "NEXT_PUBLIC_SUPABASE_ANON_KEY" in content:
                lines = content.split('\n')
                for line in lines:
                    if line.startswith('NEXT_PUBLIC_SUPABASE_ANON_KEY'):
                        print(f"  Frontend Anon Key: {line.split('=')[1][:20]}...")
    
    print("\n📋 Supabase Setup Requirements:")
    print("  1. Go to https://mpdvcydpiatasvreqlvx.supabase.co")
    print("  2. Navigate to Project Settings > API")
    print("  3. Copy the 'anon' public key")
    print("  4. Update frontend/.env.production")
    print("  5. Copy the 'service_role' key")
    print("  6. Update backend .env")

if __name__ == "__main__":
    print("🔧 SparkOps Supabase Configuration Check")
    print("=" * 50)
    
    test_database_connection()
    check_supabase_setup()
    
    print("\n🚨 ACTION REQUIRED:")
    print("The current Supabase keys appear to be placeholders.")
    print("Please update them with real keys from the Supabase dashboard.")