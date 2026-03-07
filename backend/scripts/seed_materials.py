"""Seed materials database with NZ electrical items and vector embeddings.

This script populates the materials table with 50 common electrical items
including TPS cable, GPOs, switches, RCBOs, and downlights with proper
vector embeddings for semantic search functionality.
"""

from __future__ import annotations

import os
import sys
from decimal import Decimal
from typing import Dict, List

import psycopg
from dotenv import load_dotenv
from openai import OpenAI

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import get_database_url


# NZ Electrical Materials Data
MATERIALS_DATA: List[Dict[str, str]] = [
    # TPS Cable
    {"sku": "TPS25100", "name": "TPS 2.5mm Twin + Earth Cable 100m Roll", "price": "89.90"},
    {"sku": "TPS2550", "name": "TPS 2.5mm Twin + Earth Cable 50m Roll", "price": "45.50"},
    {"sku": "TPS15100", "name": "TPS 1.5mm Twin + Earth Cable 100m Roll", "price": "65.90"},
    {"sku": "TPS1550", "name": "TPS 1.5mm Twin + Earth Cable 50m Roll", "price": "35.50"},
    {"sku": "TPS16100", "name": "TPS 16mm Twin + Earth Cable 100m Roll", "price": "289.90"},
    {"sku": "TPS10100", "name": "TPS 10mm Twin + Earth Cable 100m Roll", "price": "189.90"},
    
    # GPOs (Power Points)
    {"sku": "PDL692WH", "name": "PDL 600 Series Double Socket Horizontal White", "price": "12.50"},
    {"sku": "PDL692IV", "name": "PDL 600 Series Double Socket Horizontal Ivory", "price": "12.50"},
    {"sku": "PDL694WH", "name": "PDL 600 Series Double Socket Vertical White", "price": "13.90"},
    {"sku": "PDL691WH", "name": "PDL 600 Series Single Socket Horizontal White", "price": "8.90"},
    {"sku": "PDL693WH", "name": "PDL 600 Series Single Socket Vertical White", "price": "9.90"},
    {"sku": "HAGER415WH", "name": "Hager 415 Series Double Socket White", "price": "14.50"},
    {"sku": "HAGER415IV", "name": "Hager 415 Series Double Socket Ivory", "price": "14.50"},
    {"sku": "CLIPSAL4032WH", "name": "Clipsal Classic 2000 Double Socket White", "price": "11.90"},
    
    # Light Switches
    {"sku": "PDL690WH", "name": "PDL 600 Series Single Switch White", "price": "7.90"},
    {"sku": "PDL690IV", "name": "PDL 600 Series Single Switch Ivory", "price": "7.90"},
    {"sku": "PDL691SWH", "name": "PDL 600 Series Double Switch White", "price": "11.90"},
    {"sku": "PDL692SWH", "name": "PDL 600 Series Triple Switch White", "price": "15.90"},
    {"sku": "HAGER410WH", "name": "Hager 415 Series Single Switch White", "price": "8.50"},
    {"sku": "HAGER412WH", "name": "Hager 415 Series Double Switch White", "price": "12.50"},
    {"sku": "CLIPSAL4031WH", "name": "Clipsal Classic 2000 Single Switch White", "price": "6.90"},
    
    # RCBOs and Circuit Protection
    {"sku": "HAGERRCBO16A", "name": "Hager RCBO 16A Single Pole 30mA", "price": "45.90"},
    {"sku": "HAGERRCBO20A", "name": "Hager RCBO 20A Single Pole 30mA", "price": "48.90"},
    {"sku": "HAGERRCBO32A", "name": "Hager RCBO 32A Single Pole 30mA", "price": "52.90"},
    {"sku": "PDLRCBO16A", "name": "PDL RCBO 16A Single Pole 30mA", "price": "42.90"},
    {"sku": "PDLRCBO20A", "name": "PDL RCBO 20A Single Pole 30mA", "price": "45.90"},
    {"sku": "PDLRCBO32A", "name": "PDL RCBO 32A Single Pole 30mA", "price": "49.90"},
    {"sku": "HAGERMCB16A", "name": "Hager MCB 16A Single Pole", "price": "12.90"},
    {"sku": "HAGERMCB20A", "name": "Hager MCB 20A Single Pole", "price": "13.90"},
    {"sku": "HAGERMCB32A", "name": "Hager MCB 32A Single Pole", "price": "15.90"},
    
    # Downlights
    {"sku": "DL9WLED", "name": "9W LED Downlight Warm White 3000K Dimmable", "price": "18.90"},
    {"sku": "DL9WLEDNW", "name": "9W LED Downlight Natural White 4000K Dimmable", "price": "18.90"},
    {"sku": "DL12WLED", "name": "12W LED Downlight Warm White 3000K Dimmable", "price": "22.90"},
    {"sku": "DL12WLEDNW", "name": "12W LED Downlight Natural White 4000K Dimmable", "price": "22.90"},
    {"sku": "DL5WLEDTRIM", "name": "5W LED Downlight with White Trim Warm White", "price": "15.90"},
    {"sku": "DL7WLEDTRIM", "name": "7W LED Downlight with Chrome Trim Warm White", "price": "17.90"},
    {"sku": "DLGU10LED", "name": "GU10 LED Downlight 7W Warm White Dimmable", "price": "19.90"},
    
    # Junction Boxes and Accessories
    {"sku": "JBOX4GANG", "name": "4 Gang Junction Box IP55", "price": "8.90"},
    {"sku": "JBOX6GANG", "name": "6 Gang Junction Box IP55", "price": "12.90"},
    {"sku": "JBOX8GANG", "name": "8 Gang Junction Box IP55", "price": "15.90"},
    {"sku": "JBOXPLASTIC", "name": "Plastic Junction Box 4 Terminal", "price": "4.90"},
    {"sku": "JBOXMETAL", "name": "Metal Junction Box 6 Terminal", "price": "7.90"},
    
    # Conduit and Fittings
    {"sku": "COND20PVC", "name": "20mm PVC Conduit 3m Length", "price": "3.90"},
    {"sku": "COND25PVC", "name": "25mm PVC Conduit 3m Length", "price": "4.90"},
    {"sku": "CONDBEND20", "name": "20mm PVC Conduit Bend 90 Degree", "price": "1.90"},
    {"sku": "CONDBEND25", "name": "25mm PVC Conduit Bend 90 Degree", "price": "2.20"},
    {"sku": "CONDCOUPLER20", "name": "20mm PVC Conduit Coupler", "price": "0.90"},
    
    # Switchboard Equipment
    {"sku": "SWBRD32WAY", "name": "32 Way Switchboard Enclosure", "price": "89.90"},
    {"sku": "SWBRD48WAY", "name": "48 Way Switchboard Enclosure", "price": "129.90"},
    {"sku": "DINRAIL35MM", "name": "35mm DIN Rail 1m Length", "price": "6.90"},
    {"sku": "DINRAILMOUNT", "name": "DIN Rail Mounting Kit", "price": "12.90"},
    {"sku": "SWBRDLOCK", "name": "Switchboard Door Lock Kit", "price": "15.90"},
]


def generate_embedding(client: OpenAI, text: str) -> List[float]:
    """Generate vector embedding for material name.
    
    Args:
        client: OpenAI client instance.
        text: Material name to embed.
        
    Returns:
        List[float]: 3072-dimensional embedding vector.
    """
    
    try:
        response = client.embeddings.create(
            input=text,
            model="text-embedding-3-large"
        )
        return response.data[0].embedding
    except Exception as exc:
        print(f"Error generating embedding for '{text}': {exc}")
        return [0.0] * 3072  # Fallback zero vector


def seed_materials() -> None:
    """Seed the materials table with electrical items and vector embeddings."""
    
    # Load environment variables
    load_dotenv()
    
    # Initialize OpenAI client
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        print("ERROR: OPENAI_API_KEY environment variable is required")
        sys.exit(1)
    
    client = OpenAI(api_key=openai_api_key)
    
    # Get database URL directly
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable is required")
        sys.exit(1)
    
    # Convert to psycopg format
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    
    print(f"Connecting to database...")
    
    try:
        # Use SQLAlchemy engine for consistent connection
        from sqlalchemy import create_engine
        engine = create_engine(database_url)
        conn = engine.connect()
        cursor = conn.connection.cursor()
    except Exception as exc:
        print(f"ERROR: Failed to connect to database: {exc}")
        sys.exit(1)
    
    # Create table if not exists (with vector support)
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS materials (
                sku VARCHAR(64) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                trade_price NUMERIC(10,2) NOT NULL,
                vector_embedding VECTOR(3072)
            )
        """)
        conn.commit()
        print("Materials table ensured")
    except Exception as exc:
        print(f"Warning: Could not create vector column: {exc}")
        # Fallback: create table without vector column
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS materials (
                sku VARCHAR(64) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                trade_price NUMERIC(10,2) NOT NULL
            )
        """)
        conn.commit()
    
    # Clear existing data
    try:
        cursor.execute("DELETE FROM materials")
        conn.commit()
        print("Cleared existing materials")
    except Exception as exc:
        print(f"Warning: Could not clear materials: {exc}")
    
    # Insert materials with embeddings
    total_items = len(MATERIALS_DATA)
    print(f"Seeding {total_items} materials...")
    
    for i, material in enumerate(MATERIALS_DATA, 1):
        try:
            # Generate embedding
            embedding = generate_embedding(client, material["name"])
            
            # Insert material
            cursor.execute("""
                INSERT INTO materials (sku, name, trade_price, vector_embedding)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (sku) DO UPDATE SET
                    name = EXCLUDED.name,
                    trade_price = EXCLUDED.trade_price,
                    vector_embedding = EXCLUDED.vector_embedding
            """, (
                material["sku"],
                material["name"],
                Decimal(material["price"]),
                embedding
            ))
            
            conn.commit()
            print(f"Seeded {i}/{total_items}: {material['sku']} - {material['name']}")
            
        except Exception as exc:
            print(f"Error seeding material {material['sku']}: {exc}")
            conn.rollback()
    
    # Verify insertion
    try:
        cursor.execute("SELECT COUNT(*) FROM materials")
        count = cursor.fetchone()[0]
        print(f"\n✅ Successfully seeded {count} materials in database")
        
        # Show sample
        cursor.execute("SELECT sku, name, trade_price FROM materials LIMIT 3")
        samples = cursor.fetchall()
        print("\nSample materials:")
        for sku, name, price in samples:
            print(f"  {sku}: {name} - ${price}")
            
    except Exception as exc:
        print(f"Error verifying insertion: {exc}")
    
    # Close connection
    cursor.close()
    conn.close()
    engine.dispose()
    print("\nDatabase connection closed")


if __name__ == "__main__":
    seed_materials()