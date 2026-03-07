"""Verify database connection and show materials."""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text


def verify_database():
    """Verify which database we're connected to and show materials."""
    
    load_dotenv()
    
    # Try different database URLs
    urls_to_try = [
        os.getenv("DATABASE_URL"),
        os.getenv("SUPABASE_URL"),
        "postgresql://postgres.mpdvcydpiatasvreqlvx:Samdoggy122!@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
    ]
    
    for i, url in enumerate(urls_to_try, 1):
        if not url:
            continue
            
        print(f"\n🔗 Testing connection {i}: {url[:50]}...")
        
        # Convert to psycopg format
        if url.startswith("postgresql://"):
            test_url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        else:
            continue
        
        try:
            engine = create_engine(test_url)
            
            with engine.connect() as conn:
                # Get database info
                result = conn.execute(text("SELECT current_database(), version()"))
                db_name, version = result.fetchone()
                print(f"  ✅ Connected to: {db_name}")
                print(f"  📊 Version: {version[:50]}...")
                
                # Check materials table
                try:
                    result = conn.execute(text("SELECT COUNT(*) FROM materials"))
                    count = result.scalar()
                    print(f"  📦 Materials count: {count}")
                    
                    if count > 0:
                        print("  📋 Sample materials:")
                        result = conn.execute(text("SELECT sku, name, trade_price FROM materials LIMIT 3"))
                        for sku, name, price in result:
                            print(f"    - {sku}: {name} (${price})")
                            
                except Exception as exc:
                    print(f"  ❌ Materials table error: {exc}")
                
                # Check vector extension
                try:
                    result = conn.execute(text("SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector')"))
                    has_vector = result.scalar()
                    print(f"  🔍 pgvector available: {has_vector}")
                except Exception as exc:
                    print(f"  ❌ Vector check error: {exc}")
                
                engine.dispose()
                print(f"  ✅ Connection {i} successful")
                return test_url
                
        except Exception as exc:
            print(f"  ❌ Connection {i} failed: {exc}")
            try:
                engine.dispose()
            except:
                pass
    
    print("\n❌ No successful database connections found")
    return None


if __name__ == "__main__":
    verify_database()