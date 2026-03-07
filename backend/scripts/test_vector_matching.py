"""Test vector matching functionality with seeded materials."""

import os
import sys
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import vector_match_materials


def test_vector_matching():
    """Test the vector matching functionality."""
    
    # Load environment variables
    load_dotenv()
    
    # Test queries
    test_queries = [
        "power points",
        "electrical cable",
        "light switches", 
        "circuit breaker",
        "led downlights",
        "junction box",
        "conduit pipe",
        "switchboard"
    ]
    
    print("🔍 Testing Vector Matching with Seeded Materials")
    print("=" * 50)
    
    for query in test_queries:
        print(f"\n📝 Query: '{query}'")
        try:
            matches = vector_match_materials([query], limit=3)
            if matches:
                for i, match in enumerate(matches, 1):
                    print(f"  {i}. {match.name} (${match.trade_price}) - SKU: {match.sku}")
            else:
                print("  ❌ No matches found")
        except Exception as exc:
            print(f"  ❌ Error: {exc}")
    
    print("\n✅ Vector matching test completed")


if __name__ == "__main__":
    test_vector_matching()