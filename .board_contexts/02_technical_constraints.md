# SparkOps Technical & Financial Constraints

## Financial Gravity (Strict Rules)
We are bootstrapping. Operating costs must remain under $50 NZD per month during the build and scaling phase. Margin target is >90%.
* **No OpenAI Containers:** Do not use OpenAI "Code Interpreter" or "Hosted Shell". It costs $0.03 per session. All math and logic must run in local Python.
* **Voice Model:** Use `gpt-4o-mini-transcribe` ($0.003/min) over standard Whisper ($0.006/min) for a 50% cost reduction.
* **Currency:** All financial logic must default to NZD. GST is exactly 15%.
* **Math Integrity:** Use Python `decimal.Decimal` for all currency calculations. Never use floats.

## Architecture Guidelines
* **Infrastructure:** Docker containerization deployed on Railway. Backend is Python FastAPI. Frontend is Next.js.
* **Offline-First (The Basement Rule):** The frontend Progressive Web App (PWA) must capture voice and photos locally using IndexedDB. Syncing to the backend queue (Redis) only happens when internet connectivity returns.
* **Database:** Supabase (PostgreSQL). Use `pgvector` for AI embeddings.

## Security & Performance
* **Security:** All user data must be encrypted at rest and in transit. Use HTTPS only. Must meet all OWASP security standards.
* **Performance:** The system must handle at least 100 concurrent users with a response time of under 2 seconds for 95% of requests.

## Business Administration
* **Admin Portal:** The admin portal must be accessible via a subdomain (e.g., admin.sparkops.nz) and use environment variables for authentication.
* **User Management:** The admin portal must allow for user management, including creating, updating, and deleting users.
* **Billing Management:** The admin portal must allow for billing management, including creating, updating, and deleting billing records.
* **Analytics:** The admin portal must allow for analytics, including viewing user activity, billing records, and system performance.