"""Test vector search with correct type casting."""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from openai import OpenAI


def test_vector_search():
    """Test vector search with proper type casting."""
    
    load_dotenv()
    
    # Get database URL
    database_url = os.getenv("DATABASE_URL")
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    
    print("🔗 Connecting to Supabase...")
    engine = create_engine(database_url)
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    try:
        with engine.connect() as conn:
            # Check materials count
            result = conn.execute(text("SELECT COUNT(*) FROM materials"))
            count = result.scalar()
            print(f"📊 Found {count} materials")
            
            # Test queries
            test_queries = [
                "power points",
                "electrical cable", 
                "light switches",
                "circuit breaker",
                "led downlights"
            ]
            
            for query in test_queries:
                print(f"\n🔍 Searching: '{query}'")
                
                # Generate embedding
                embedding = client.embeddings.create(
                    input=query,
                    model="text-embedding-3-large"
                ).data[0].embedding
                
                # Vector search with correct type casting
                result = conn.execute(text("""
                    SELECT sku, name, trade_price,
                           vector_embedding <=> CAST(:embedding AS vector) as distance
                    FROM materials 
                    ORDER BY vector_embedding <=> CAST(:embedding AS vector) 
                    LIMIT 3
                """), {"embedding": embedding})
                
                matches = result.fetchall()
                
                if matches:
                    for sku, name, price, distance in matches:
                        print(f"  🎯 {name} (${price}) - Distance: {distance:.4f}")
                else:
                    print("  ❌ No matches found")
                    
            # Test text search for comparison
            print(f"\n📝 Text search for 'power points':")
            result = conn.execute(text("""
                SELECT sku, name, trade_price
                FROM materials 
                WHERE name ILIKE :query 
                LIMIT 3
            """), {"query": "%power points%"})
            
            text_matches = result.fetchall()
            if text_matches:
                for sku, name, price in text_matches:
                    print(f"  📋 {name} (${price})")
            else:
                print("  ❌ No text matches found")
                
    except Exception as exc:
        print(f"❌ Error: {exc}")
    
    finally:
        engine.dispose()


if __name__ == "__main__":
    test_vector_search()