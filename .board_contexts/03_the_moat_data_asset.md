# The SparkOps Data Moat (Vector SKUs)

## The Core Technological Value
The primary technical moat of SparkOps is the "Reasoning Vision Engine". It translates messy, handwritten, or poorly formatted supplier receipts into clean, actionable, and searchable JSON data.

## The Ingestion Pipeline
1. **The Eye (Vision Extraction):** Uses `03-mini` to extract raw text, quantities, and prices from receipt photos.
2. **The Penny Pincher (Math Verification):** Local Python script verifies that (Sum of Items) + 15% GST = Total. Flags mismatches.
3. **The Brain (SKU Normalization):** This is the $1M asset. We use `text-embedding-3-large` to map messy OCR text (e.g., "100m 2.5 tps") against a `pgvector` database of Master Electrical SKUs (e.g., "CAB-TPS-2.5-2C+E"). 
4. **Supplier Tracking:** The system explicitly extracts and tags the Vendor Name (e.g., "J.A. Russell") to build the "Share of Wallet" metric for our exit strategy.

If an architectural decision does not serve the improvement of this data pipeline, it should be rejected.