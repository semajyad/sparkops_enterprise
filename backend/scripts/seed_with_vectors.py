"""Seed materials with proper vector embeddings."""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from openai import OpenAI


def seed_with_vectors():
    """Seed materials with vector embeddings."""
    
    load_dotenv()
    
    # Check environment
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        print("❌ OPENAI_API_KEY not found")
        return
    
    # Get database URL
    database_url = os.getenv("DATABASE_URL")
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    
    print("🔗 Connecting to Supabase...")
    engine = create_engine(database_url)
    client = OpenAI(api_key=openai_key)
    
    # Materials data
    materials = [
        ("PDL692WH", "PDL 600 Series Double Socket Horizontal White", 12.50),
        ("TPS25100", "TPS 2.5mm Twin + Earth Cable 100m Roll", 89.90),
        ("PDL690WH", "PDL 600 Series Single Switch White", 7.90),
        ("HAGERRCBO16A", "Hager RCBO 16A Single Pole 30mA", 45.90),
        ("DL9WLED", "9W LED Downlight Warm White 3000K Dimmable", 18.90),
        ("JBOX4GANG", "4 Gang Junction Box IP55", 8.90),
        ("COND20PVC", "20mm PVC Conduit 3m Length", 3.90),
        ("SWBRD32WAY", "32 Way Switchboard Enclosure", 89.90),
        ("PDL691WH", "PDL 600 Series Single Socket Horizontal White", 8.90),
        ("HAGERMCB16A", "Hager MCB 16A Single Pole", 12.90),
    ]
    
    try:
        with engine.connect() as conn:
            # Clear existing data
            conn.execute(text("DELETE FROM materials"))
            print("🗑️ Cleared existing materials")
            
            # Insert materials with embeddings
            print("📦 Inserting materials with embeddings...")
            for i, (sku, name, price) in enumerate(materials, 1):
                try:
                    # Generate embedding
                    print(f"  🧠 Generating embedding for {i}/{len(materials)}: {sku}")
                    embedding_response = client.embeddings.create(
                        input=name,
                        model="text-embedding-3-large"
                    )
                    embedding = embedding_response.data[0].embedding
                    
                    # Insert with embedding
                    conn.execute(text("""
                        INSERT INTO materials (sku, name, trade_price, vector_embedding)
                        VALUES (:sku, :name, :price, :embedding)
                        ON CONFLICT (sku) DO UPDATE SET
                            name = EXCLUDED.name,
                            trade_price = EXCLUDED.trade_price,
                            vector_embedding = EXCLUDED.vector_embedding
                    """), {
                        "sku": sku,
                        "name": name,
                        "price": price,
                        "embedding": embedding
                    })
                    print(f"    ✅ Inserted: {sku}")
                    
                except Exception as exc:
                    print(f"    ❌ Error with {sku}: {exc}")
                    continue
            
            conn.commit()
            
            # Verify
            result = conn.execute(text("SELECT COUNT(*) FROM materials"))
            count = result.scalar()
            print(f"\n✅ Successfully seeded {count} materials")
            
            # Test vector search
            print("\n🔍 Testing vector search...")
            test_embedding = client.embeddings.create(
                input="power points",
                model="text-embedding-3-large"
            ).data[0].embedding
            
            result = conn.execute(text("""
                SELECT sku, name, trade_price,
                       vector_embedding <=> :embedding as distance
                FROM materials 
                ORDER BY vector_embedding <=> :embedding 
                LIMIT 3
            """), {"embedding": test_embedding})
            
            matches = result.fetchall()
            print("🎯 Vector search results for 'power points':")
            for sku, name, price, distance in matches:
                print(f"  - {name} (${price}) - Distance: {distance:.4f}")
                
    except Exception as exc:
        print(f"❌ Error: {exc}")
        conn.rollback()
    
    finally:
        engine.dispose()


if __name__ == "__main__":
    seed_with_vectors()