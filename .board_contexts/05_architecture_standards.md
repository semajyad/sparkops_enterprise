# SparkOps Enterprise Architecture Standards

## Strict File Structure
Do not dump code into monolithic files. Windsurf MUST adhere to the following directory structure:
* **Backend Models:** All Pydantic models belong in `backend/models/schemas.py`.
* **Backend Logic:** All math and utilities belong in `backend/utils/`.
* **Backend API:** All endpoints belong in `backend/api/routes/`. `backend/main.py` is strictly for FastAPI initialization and router inclusion.
* **Frontend Types:** All TypeScript interfaces belong in `frontend/src/types/`. Do not put interfaces inside React components.

## Database Standards (Supabase)
* **pgvector:** When initializing vector columns, you MUST ensure the `vector` extension is created first. 
* **Dimensions:** We use `text-embedding-3-large`. The vector column dimension MUST be exactly `3072`.
* **Naming:** Use `snake_case` for all PostgreSQL tables and columns.