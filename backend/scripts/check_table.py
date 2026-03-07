"""Check materials table structure."""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text


def check_table_structure():
    """Check the structure of the materials table."""
    
    load_dotenv()
    
    database_url = os.getenv("DATABASE_URL")
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    
    engine = create_engine(database_url)
    
    try:
        with engine.connect() as conn:
            # Get table structure
            result = conn.execute(text("""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = 'materials'
                ORDER BY ordinal_position
            """))
            
            print("📋 Materials table structure:")
            for col_name, data_type, is_nullable, default_val in result:
                nullable = "NULL" if is_nullable == "YES" else "NOT NULL"
                default = f" DEFAULT {default_val}" if default_val else ""
                print(f"  - {col_name}: {data_type} {nullable}{default}")
                
            # Check if vector column exists
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'materials' AND column_name = 'vector_embedding'
                )
            """))
            has_vector = result.scalar()
            print(f"\n🔍 Vector column exists: {has_vector}")
            
    except Exception as exc:
        print(f"❌ Error: {exc}")
    
    finally:
        engine.dispose()


if __name__ == "__main__":
    check_table_structure()