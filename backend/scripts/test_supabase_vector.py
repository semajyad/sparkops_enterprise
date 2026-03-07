"""Direct test of vector matching using Supabase connection."""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from openai import OpenAI


def test_vector_search():
    """Test vector search directly on Supabase."""
    
    # Load environment
    load_dotenv()
    
    # Connect to Supabase
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ DATABASE_URL not found")
        return
    
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    
    print("🔗 Connecting to Supabase...")
    engine = create_engine(database_url)
    
    # Test OpenAI
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        print("❌ OPENAI_API_KEY not found")
        return
    
    client = OpenAI(api_key=openai_key)
    
    try:
        with engine.connect() as conn:
            # Check materials count
            result = conn.execute(text("SELECT COUNT(*) FROM materials"))
            count = result.scalar()
            print(f"📊 Found {count} materials in database")
            
            if count == 0:
                print("❌ No materials found - run seed script first")
                return
            
            # Test vector search
            test_query = "power points"
            print(f"\n🔍 Testing search for: '{test_query}'")
            
            # Generate embedding
            embedding = client.embeddings.create(
                input=test_query,
                model="text-embedding-3-large"
            ).data[0].embedding
            
            # Perform vector search
            result = conn.execute(text("""
                SELECT sku, name, trade_price,
                       vector_embedding <=> :embedding as distance
                FROM materials 
                ORDER BY vector_embedding <=> :embedding 
                LIMIT 5
            """), {"embedding": embedding})
            
            matches = result.fetchall()
            
            if matches:
                print("✅ Vector matches found:")
                for i, (sku, name, price, distance) in enumerate(matches, 1):
                    print(f"  {i}. {name} (${price}) - Distance: {distance:.4f}")
            else:
                print("❌ No matches found")
                
            # Test text search as fallback
            print(f"\n🔍 Testing text search for: '{test_query}'")
            result = conn.execute(text("""
                SELECT sku, name, trade_price
                FROM materials 
                WHERE name ILIKE :query 
                LIMIT 5
            """), {"query": f"%{test_query}%"})
            
            text_matches = result.fetchall()
            
            if text_matches:
                print("✅ Text matches found:")
                for i, (sku, name, price) in enumerate(text_matches, 1):
                    print(f"  {i}. {name} (${price})")
            else:
                print("❌ No text matches found")
                
    except Exception as exc:
        print(f"❌ Error: {exc}")
    
    finally:
        engine.dispose()


if __name__ == "__main__":
    test_vector_search()