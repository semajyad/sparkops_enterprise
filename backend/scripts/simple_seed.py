"""Simple seed script to populate materials table."""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text


def simple_seed():
    """Simple seed with fixed data and no embeddings."""
    
    load_dotenv()
    
    # Get database URL
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ DATABASE_URL not found")
        return
    
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    
    print("🔗 Connecting to Supabase...")
    engine = create_engine(database_url)
    
    # Simple materials data
    materials = [
        ("PDL692WH", "PDL 600 Series Double Socket Horizontal White", 12.50),
        ("TPS25100", "TPS 2.5mm Twin + Earth Cable 100m Roll", 89.90),
        ("PDL690WH", "PDL 600 Series Single Switch White", 7.90),
        ("HAGERRCBO16A", "Hager RCBO 16A Single Pole 30mA", 45.90),
        ("DL9WLED", "9W LED Downlight Warm White 3000K Dimmable", 18.90),
    ]
    
    try:
        with engine.connect() as conn:
            # Create table without vector column first
            print("📋 Creating materials table...")
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS materials (
                    sku VARCHAR(64) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    trade_price NUMERIC(10,2) NOT NULL
                )
            """))
            
            # Clear existing data
            conn.execute(text("DELETE FROM materials"))
            
            # Insert materials
            print("📦 Inserting materials...")
            for sku, name, price in materials:
                conn.execute(text("""
                    INSERT INTO materials (sku, name, trade_price)
                    VALUES (:sku, :name, :price)
                    ON CONFLICT (sku) DO UPDATE SET
                        name = EXCLUDED.name,
                        trade_price = EXCLUDED.trade_price
                """), {"sku": sku, "name": name, "price": price})
                print(f"  ✅ Inserted: {sku}")
            
            conn.commit()
            
            # Verify
            result = conn.execute(text("SELECT COUNT(*) FROM materials"))
            count = result.scalar()
            print(f"\n✅ Successfully seeded {count} materials")
            
            # Show sample
            result = conn.execute(text("SELECT sku, name, trade_price FROM materials LIMIT 3"))
            for sku, name, price in result:
                print(f"  📋 {sku}: {name} (${price})")
                
    except Exception as exc:
        print(f"❌ Error: {exc}")
        conn.rollback()
    
    finally:
        engine.dispose()


if __name__ == "__main__":
    simple_seed()