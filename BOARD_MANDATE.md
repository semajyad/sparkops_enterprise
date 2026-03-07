# 🏛️ SPARK OPS EXECUTIVE MANDATE
> Initiative: Initiative: SparkOps V1.0 Master Roadmap. Break down the entire build into sequential sprints. For each sprint, define the core business goal, the strict technical constraints (e.g., local PII scrubbing, decimal math), and the Definition of Done required before funding the next sprint.
> Date: 2026-03-06

## 1. Executive Debate Transcript

ROUND 1:
*** VP_Finance_and_Risk OPENING STATEMENT ***
As VP of Finance & Risk, my mandate is clear: **We are building a defensible data asset, not a liability trap.** 

If we fail to meet the $50/mo OpEx ceiling, we burn our runway. If we fail AS/NZS 3000 compliance, we face litigation that will bankrupt this entity before we reach our first exit milestone. We will not trade regulatory integrity for development speed.

### Executive Core Demands

1.  **Zero-Float Financial Integrity:** Any developer or agent found using `float` for currency calculations will be terminated from the project. All financial logic must utilize `decimal.Decimal` with `ROUND_HALF_UP` precision. GST (15%) must be calculated as a discrete, immutable step in the pipeline.
2.  **Liability Shielding (The "Sandwich" Protocol):** The "Auditor" agent is non-negotiable. If the Auditor cannot verify a CoC against the AS/NZS 3000 vector database, the document **must not be generated**. We will not ship "good enough" compliance.
3.  **OpEx Hard-Cap:** The $50/mo limit is a hard constraint. We will prioritize local, open-source processing for PII scrubbing and initial data normalization to minimize API token consumption. If a feature pushes us toward the $50 limit, it is discarded.
4.  **Audit-Ready Data Architecture:** Every CoC generated must be immutable. We will implement a "Write-Once-Read-Many" (WORM) pattern for compliance documents to satisfy the 7-year NZ regulatory retention requirement.
5.  **PII Sanitization:** No PII leaves the local client environment without being scrubbed via local regex. We are not feeding customer home addresses into third-party LLMs.

---

### SparkOps V1.0 Master Roadmap

#### Sprint 1: The Foundation (Infrastructure & Compliance)
*   **Goal:** Establish the secure, compliant environment.
*   **Constraints:** Supabase setup with `pgvector` (3072 dims). Local PII scrubbing utility.
*   **Definition of Done:** Successful deployment of the FastAPI boilerplate on Railway; local regex successfully strips PII from dummy voice transcripts; `decimal.Decimal` math library integrated into `backend/utils/`.

#### Sprint 2: The "Basement" Engine (Offline-First)
*   **Goal:** Enable the "Voice-to-Cash" workflow without internet.
*   **Constraints:** IndexedDB implementation in PWA. Local queueing logic.
*   **Definition of Done:** PWA captures audio/photo in "Airplane Mode"; data syncs to Redis/Supabase upon reconnection; 100% data integrity check on sync.

#### Sprint 3: The Auditor (AS/NZS 3000 Compliance)
*   **Goal:** Implement the "Sandwich" architecture.
*   **Constraints:** Embed AS/NZS 3000 rules into `pgvector`.
*   **Definition of Done:** Auditor agent successfully flags a missing "Earth Loop Impedance" test in a test CoC; system blocks document finalization until missing data is provided.

#### Sprint 4: The Penny Pincher (Receipt Normalization)
*   **Goal:** Extract and verify supplier data for the "Share of Wallet" asset.
*   **Constraints:** `text-embedding-3-large` for SKU mapping.
*   **Definition of Done:** System correctly maps "100m 2.5 tps" to "CAB-TPS-2.5-2C+E"; math verification confirms (Sum + 15% GST) == Total; supplier tagged correctly.

#### Sprint 5: Admin & Analytics (The Exit Asset)
*   **Goal:** Enable business owner oversight.
*   **Constraints:** Admin subdomain, strict environment variable auth.
*   **Definition of Done:** Admin portal displays real-time "Share of Wallet" metrics; user management CRUD operations functional; system passes simulated bank-level audit.

**Proceed with Sprint 1. I expect a report on the local PII scrubbing utility before any external API calls are authorized.**

*** Strategist OPENING STATEMENT ***
### Executive Opening Statement

As Head of Strategy & M&A, I am evaluating SparkOps not as a software utility, but as a **Supply Chain Intelligence Engine**. 

In the New Zealand trade market, electrical wholesalers (J.A. Russell, Corys, etc.) operate in a high-volume, low-margin environment where the "Holy Grail" is **predictive procurement**. Currently, wholesalers have visibility into what a Sparky buys *from them*, but they are blind to what that same Sparky buys from their competitors. 

SparkOps solves this. By capturing the "Voice-to-Cash" workflow, we are positioned to aggregate the most granular, real-time dataset of trade material consumption in the country. A $10M exit is not predicated on the $10k MRR—that is merely the "proof of life" to demonstrate user stickiness. The $10M valuation is predicated on the **Data Moat**: the ability to provide a wholesaler with a dashboard showing exactly which of their customers is leaking spend to a competitor, and why. 

To reach this exit, every line of code must prioritize **data normalization**. If the data is messy, the asset is worthless. If the data is structured, we are an acquisition target.

---

### The SparkOps V1.0 Master Roadmap

#### Sprint 1: The "Basement" Foundation (Data Capture)
*   **Business Goal:** Validate the "Offline-First" value proposition. Ensure the Sparky can generate a CoC in a basement with zero connectivity.
*   **Technical Constraints:** Implement IndexedDB for local storage. PWA deployment. Local Python-based PII scrubbing (regex) before any data touches the cloud.
*   **Definition of Done:** Successful generation of a CoC and Invoice while in "Airplane Mode," with successful background sync to Supabase upon reconnection.

#### Sprint 2: The "Reasoning Vision" Engine (Data Extraction)
*   **Business Goal:** Automate the "Penny Pincher" math. Eliminate manual data entry for the user.
*   **Technical Constraints:** Use `gpt-4o-mini` for OCR. Implement `decimal.Decimal` for all GST/Total calculations. Ensure 100% math integrity against the 15% NZ GST rule.
*   **Definition of Done:** User takes a photo of a receipt; system returns a JSON object with Vendor, Date, Items, and Total. Math must be verified by local Python script.

#### Sprint 3: The "SKU Normalization" Moat (Data Asset)
*   **Business Goal:** Transform raw OCR text into standardized "Master Electrical SKUs." This is the core M&A value.
*   **Technical Constraints:** `text-embedding-3-large` (3072 dimensions) mapped to `pgvector`. Build the Master SKU database.
*   **Definition of Done:** System correctly maps "100m 2.5 tps" to "CAB-TPS-2.5-2C+E" with >95% confidence.

#### Sprint 4: The "Compliance Shield" (Liability & Trust)
*   **Business Goal:** Mitigate legal risk. Ensure the platform is a "Liability Shield" for the electrician.
*   **Technical Constraints:** Implement the "Sandwich Architecture." The `o3-mini` Auditor agent must cross-reference the CoC against AS/NZS 3000 rules.
*   **Definition of Done:** Auditor agent successfully flags a missing "Earth Loop Impedance" test result and prevents the final CoC generation until the user inputs the value.

#### Sprint 5: The "Share of Wallet" Dashboard (Exit Readiness)
*   **Business Goal:** Package the data for the buyer. Create the Admin Portal analytics that visualize the "Share of Wallet."
*   **Technical Constraints:** Aggregate data by Vendor, SKU, and User. Ensure all PII is scrubbed for the analytics view.
*   **Definition of Done:** Admin portal displays a report: "User X spends 60% of budget at J.A. Russell and 40% at Corys." This is the "Acquisition Pitch" in a dashboard.

---

### Strategic M&A Guidance
*   **Avoid Feature Creep:** Do not build project management or CRM features that don't contribute to the "Share of Wallet" data. If it doesn't help us track a SKU or a Vendor, it is a distraction.
*   **The "Lock-in" Metric:** Our primary KPI for the buyer is not just MRR; it is **"Percentage of total material spend captured."** If we can prove that our users are using SparkOps to manage 80%+ of their material purchasing, the $10M valuation becomes a conservative floor, not a ceiling.
*   **Compliance as a Moat:** By embedding AS/NZS 3000 compliance, we make the software "sticky." A Sparky won't leave a platform that keeps them out of legal trouble. This is our retention strategy.

*** Product_Lead OPENING STATEMENT ***
### Executive Statement: The "Basement" Mandate

Listen up. We are not building a "cool app." We are building a **high-velocity, legally-defensible, data-harvesting machine.** 

Our users are in the mud, in the dark, and under the house. They don't care about our tech stack; they care about getting paid and getting home to their families. If they have to tap their screen more than three times to start a job, we have failed. If the app hangs because they’re in a concrete basement, we have failed. If the CoC is legally shaky, we are liable.

**My Veto Power is active.** I will kill any feature that adds "bloat" or friction. We are here to capture the "Share of Wallet" data asset. Every line of code must either accelerate the ingestion of that data or ensure the legal integrity of the CoC. If it doesn't do that, it doesn't exist.

---

### SparkOps V1.0 Master Roadmap

#### Sprint 1: The "Offline-First" Capture Engine
*   **Business Goal:** Validate the "Voice-to-Cash" loop.
*   **Technical Constraints:** PWA implementation with IndexedDB. Local PII scrubbing (regex) before any API call.
*   **Definition of Done:** 
    *   User can record voice notes and snap receipt photos while in "Airplane Mode."
    *   Data persists in IndexedDB.
    *   Sync triggers automatically upon reconnection.
    *   Local `decimal.Decimal` math verification for receipt totals.

#### Sprint 2: The Reasoning Vision Engine (The Moat)
*   **Business Goal:** Automate SKU normalization to build the "Share of Wallet" database.
*   **Technical Constraints:** `text-embedding-3-large` (3072 dimensions) in `pgvector`. `gpt-4o-mini` for vision extraction.
*   **Definition of Done:** 
    *   Receipt photos are converted to JSON.
    *   Items are mapped to Master Electrical SKUs via vector search.
    *   Vendor name is extracted and tagged for the exit-strategy dashboard.

#### Sprint 3: The "Sandwich" Compliance Shield
*   **Business Goal:** Protect the user (and us) from liability.
*   **Technical Constraints:** `o3-mini` Auditor agent. AS/NZS 3000 rules embedded in vector store.
*   **Definition of Done:** 
    *   Drafted CoC is rejected if mandatory fields (e.g., Earth Loop Impedance) are missing.
    *   System forces user input for missing safety data before final generation.
    *   Audit logs created for every CoC generation.

#### Sprint 4: The Admin Command Center
*   **Business Goal:** Enable business owners to manage staff and monitor cash flow.
*   **Technical Constraints:** Subdomain `admin.sparkops.nz`. Environment-variable-based auth.
*   **Definition of Done:** 
    *   Dashboard displays real-time "Share of Wallet" analytics.
    *   Admin can assign jobs to specific electricians.
    *   Billing/Subscription management integrated.

#### Sprint 5: The "Zero-Friction" Deployment
*   **Business Goal:** Reach 100 active users.
*   **Technical Constraints:** Railway deployment. 95% response time < 2s.
*   **Definition of Done:** 
    *   Full load testing for 100 concurrent users.
    *   Automated marketing triggers (onboarding emails/SMS).
    *   System passes "Bank-Level" security audit (OWASP compliance).

---

**Head of Product Directive:** We move to Sprint 1 immediately. No fluff. No "nice-to-haves." Build the capture engine. If the Sparky can't use it in a basement, we don't have a business. **Get to work.**

*** CTO OPENING STATEMENT ***
### Executive Statement: The CTO’s Mandate

As Chief Technology Officer, my objective is to transform SparkOps from a concept into a high-value data asset. We are not merely building a utility; we are building a **precision instrument for the electrical trade**. 

Our engineering culture is defined by three pillars:
1. **Financial Discipline:** Every line of code has a cost. We prioritize local execution over cloud compute to maintain our >90% margin.
2. **Resilience as a Feature:** Our users work in basements and remote sites. If the application requires a stable internet connection to function, it is a failure. "Offline-first" is not an aspiration; it is our baseline.
3. **Regulatory Integrity:** We are handling legal documents (CoCs). Our "Sandwich" architecture is non-negotiable. We will not ship code that allows a user to generate an invalid or non-compliant document.

We will build this with the rigor of a financial institution. If it doesn't scale, if it isn't secure, or if it doesn't contribute to our "Share of Wallet" data moat, we do not build it.

***

### SparkOps V1.0 Master Roadmap

#### Sprint 1: The Foundation (The "Offline-First" Core)
*   **Business Goal:** Enable a user to capture voice notes and receipt photos in a basement with zero connectivity.
*   **Technical Constraints:** Implement PWA service workers for local caching. Use local storage for temporary queuing. Implement local regex-based PII scrubbing before any data leaves the device.
*   **Definition of Done:** Successful capture, storage, and retrieval of voice/image data while in "Airplane Mode."

#### Sprint 2: The Data Moat (The Vision & Math Engine)
*   **Business Goal:** Automate the extraction of SKU data from receipts to build the "Share of Wallet" intelligence.
*   **Technical Constraints:** Implement the "Penny Pincher" math verification logic using `decimal.Decimal`. Ensure all currency calculations are performed server-side to maintain audit integrity.
*   **Definition of Done:** Receipt photo uploaded, processed, and verified against total sum; SKU data correctly mapped to the vector database.

#### Sprint 3: The Compliance Shield (The "Sandwich" Architecture)
*   **Business Goal:** Generate a legally compliant CoC that passes the "Auditor" check.
*   **Technical Constraints:** Implement the cyclic LangGraph agent. Embed AS/NZS 3000 rules into the vector database. Ensure the Auditor rejects any CoC missing mandatory safety test data.
*   **Definition of Done:** A draft CoC is rejected by the Auditor if mandatory fields (e.g., Earth Loop Impedance) are missing, and accepted only when compliant.

#### Sprint 4: The Admin Command Center
*   **Business Goal:** Provide business owners with oversight of their electricians and job status.
*   **Technical Constraints:** Build the admin subdomain. Implement role-based access control (RBAC) to ensure electricians only see their own jobs, while admins see the fleet.
*   **Definition of Done:** Admin can view, assign, and audit CoCs/Invoices for multiple users via the dashboard.

#### Sprint 5: The Integration & Exit Readiness
*   **Business Goal:** Finalize the "Share of Wallet" reporting and ensure audit-readiness for acquisition.
*   **Technical Constraints:** Finalize the 7-year data retention policy and audit logging. Ensure all database schemas are optimized for the 10,000-user scale.
*   **Definition of Done:** System passes a simulated "Bank-Level Audit" and exports a clean "Share of Wallet" report for a single vendor.

***

### Engineering Policies

**1. Resilience Policy**
*   **Offline-First:** All user-facing interactions must be functional without a network. The application must treat the network as an unreliable transport layer, not a dependency.
*   **Queueing:** All outgoing data must be placed in a local persistent queue. Retries must use exponential backoff to avoid overwhelming the backend upon reconnection.

**2. Data Integrity & Security Policy**
*   **Math:** Floating-point arithmetic is strictly forbidden for financial data. `Decimal` types are mandatory.
*   **PII:** No raw PII shall be sent to third-party AI providers. All inputs must be scrubbed locally.
*   **Auditability:** Every CoC generated must be linked to the specific version of the "Auditor" agent that approved it, ensuring we can trace compliance in the event of a legal dispute.

**3. Architectural Hygiene**
*   **Strict Separation:** Logic, models, and routes must remain in their designated directories. Any violation of the directory structure defined in `05_architecture_standards.md` will result in a failed PR review.
*   **Vector Integrity:** All vector operations must use the `3072` dimension standard. No exceptions.

ROUND 2:
*** VP_Finance_and_Risk REBUTTAL ***
As VP of Finance & Risk, I have reviewed the collective roadmap. While the technical ambition is aligned, I am imposing the following **Executive Overrides** to ensure we do not breach our financial and legal constraints.

### 1. The "OpEx" Hard-Cap Enforcement
The $50/mo limit is not a target; it is a survival threshold. 
*   **Challenge:** The Strategist and CTO are pushing for `text-embedding-3-large` and `gpt-4o-mini` in early sprints. These are token-heavy.
*   **Compromise:** Sprint 2 and 3 must utilize **local, quantized open-source models** (e.g., via Ollama/Llama-cpp) for initial data normalization and PII scrubbing. We will only escalate to high-cost APIs if local accuracy fails a specific benchmark. **If the API cost for a single CoC exceeds $0.02, the feature is scrapped.**

### 2. Liability & Compliance (The "Sandwich" Protocol)
*   **Challenge:** The Product Lead’s focus on "speed" and "three taps" threatens the integrity of the AS/NZS 3000 compliance check.
*   **Demand:** The "Auditor" agent is the **only** gatekeeper. If the Auditor cannot verify the test results against the vector database, the document is not just "flagged"—it is **technically impossible to export**. We will not allow a "bypass" button for the sake of user convenience. Legal liability rests with the entity, not the electrician.

### 3. Financial Math Integrity
*   **Challenge:** The CTO mentioned "server-side" math. 
*   **Demand:** Math must be **idempotent and verifiable at both ends**. The client must perform the calculation using `decimal.Decimal` (via a WASM-compiled library if necessary) and the server must re-verify. If the client-side total and server-side total differ by even $0.0000001, the transaction is rejected. **No floating-point math, ever.**

### 4. Sprint 1: The "Finance-First" Definition of Done
I am modifying the Definition of Done for Sprint 1. Before we proceed to Sprint 2, I require:
1.  **The PII Scrubbing Audit:** A report demonstrating that 100% of PII (names, addresses, phone numbers) is stripped locally before the payload hits the network.
2.  **The "WORM" Architecture Proof:** A demonstration that once a CoC is generated, the database record is locked via Postgres RLS (Row Level Security) and cannot be modified by any user, including the Admin.
3.  **Cost-Per-Transaction Baseline:** A projection of the infrastructure cost per CoC based on the current architecture. If this exceeds our $50/mo budget at scale, we redesign the stack before writing another line of code.

### Executive Directive
**We are not in the business of "shipping fast." We are in the business of "shipping defensible assets."** 

Product Lead: Stop talking about "user friction" if that friction is a legal requirement. 
CTO: If I see a `float` in the financial logic, the repository is locked. 

**Proceed with Sprint 1. I expect the PII scrubbing report on my desk before the end of the week.**

*** Strategist REBUTTAL ***
As Head of Strategy & M&A, I have reviewed the proposed roadmaps. While the technical alignment is strong, I am imposing a **Strategic Pivot** on the sequencing. 

We are building an asset for acquisition. A buyer does not pay $10M for a "PWA with offline capabilities." They pay for the **proprietary dataset that predicts market share.** 

### The Strategic Correction
I am overriding the current Sprint order. We will not prioritize "Admin Dashboards" (Sprint 4/5) until the **Data Normalization Engine** is bulletproof. If the SKU mapping is inaccurate, the "Share of Wallet" metric is noise, not an asset.

#### Revised Master Roadmap

| Sprint | Focus | Strategic Goal |
| :--- | :--- | :--- |
| **1** | **The Capture Engine** | Validate user retention via "Offline-First" utility. |
| **2** | **The SKU Moat** | **CRITICAL:** Build the Master SKU database. If we cannot map 95% of receipts to standardized SKUs, we have no exit value. |
| **3** | **The Auditor** | Liability shielding. This is our "Stickiness" factor. |
| **4** | **The Analytics Layer** | Transform raw data into the "Share of Wallet" dashboard. |
| **5** | **Hardening & Audit** | Prepare the data room for M&A due diligence. |

---

### Challenging the Executive Priorities

1.  **To the CTO:** You mentioned "10,000-user scale" in Sprint 5. **Stop.** We are building for a $10M exit, not a public utility. Focus on **Data Quality at 100 users**. If the data is pristine, the valuation holds. If the data is "scaled" but messy, the valuation collapses. I want 100% SKU mapping accuracy, not 10,000 users.
2.  **To the VP Finance:** Your $50/mo OpEx cap is aggressive. I support it, but **do not sacrifice the embedding model quality.** If we use a cheaper model for SKU mapping and the accuracy drops below 95%, we lose the M&A premium. We will find the budget elsewhere; do not throttle the intelligence engine.
3.  **To the Product Lead:** You mentioned "Marketing triggers" in Sprint 5. **Delete this.** We are not a B2C SaaS play. We are a B2B data play. Every hour spent on marketing automation is an hour stolen from refining the "Share of Wallet" visualization.

---

### The "Exit-Ready" Definition of Done (For all Sprints)

Before any sprint is marked "Done," it must pass the **M&A Data Integrity Test**:
*   **Normalization Check:** Can the data be exported into a clean CSV/JSON format that a third-party analyst could ingest without manual cleaning?
*   **Attribution Check:** Is every SKU mapped to a specific Vendor? If we cannot attribute the spend, the data is useless to the wholesaler.
*   **Compliance Check:** Is the "Auditor" log immutable? If a buyer performs due diligence, they must be able to verify that every CoC was generated under strict AS/NZS 3000 rules.

### Final Directive
We are building a **Supply Chain Intelligence Engine**. 

**Sprint 1 is approved.** Focus exclusively on the local capture and the PII scrubbing. Do not build a single UI element that does not directly serve the goal of capturing a receipt or a CoC. 

**Report back once the local regex scrubbing is verified.** I want to see the PII-stripped output before we authorize a single cent of API spend.

*** Product_Lead REBUTTAL ***
As Head of Product, I have reviewed the executive statements. We are aligned on the "Basement" mandate, but I am tightening the roadmap to ensure we don't bleed time on non-essential features. 

**My Vetoes:**
1. **Veto on Sprint 5 (Admin/Analytics) as a "Sprint":** Analytics is a byproduct of data capture. We are not building an "Admin Portal" until we have a critical mass of data. The "Share of Wallet" dashboard is a *feature*, not a sprint. We will fold the necessary reporting into the core build as we go.
2. **Veto on "Marketing Triggers":** We are not a SaaS marketing play. We are a utility. If the product is good, the Sparky uses it. If it’s not, an email won't save us.
3. **Veto on "Role-Based Access Control" (RBAC) complexity:** We are building for the individual Sparky first. Multi-user fleet management is a V2.0 problem. We will not build complex admin hierarchies while we are still proving the "Voice-to-Cash" loop.

### Revised SparkOps V1.0 Roadmap

#### Sprint 1: The "Basement" Capture Engine
*   **Goal:** Zero-friction, offline-first data ingestion.
*   **Constraints:** IndexedDB for local persistence. Local regex PII scrubbing. 
*   **Definition of Done:** User records voice/photo in a basement (no signal). Data is scrubbed locally. Upon reconnection, data syncs to Supabase. **No UI beyond the capture screen.**

#### Sprint 2: The "Penny Pincher" & SKU Normalization
*   **Goal:** Automate the "Share of Wallet" data asset.
*   **Constraints:** `decimal.Decimal` for all math. `text-embedding-3-large` for SKU mapping.
*   **Definition of Done:** Receipt photo -> JSON -> SKU Mapping. Math verification (Sum + 15% GST) must be 100% accurate. If the math fails, the record is flagged and blocked from the "Asset" database.

#### Sprint 3: The "Sandwich" Compliance Shield
*   **Goal:** Liability-proof the CoC.
*   **Constraints:** `o3-mini` Auditor agent. AS/NZS 3000 vector database.
*   **Definition of Done:** Auditor agent blocks CoC generation if "Earth Loop Impedance" or other mandatory safety tests are missing. The document is immutable (WORM) once generated.

#### Sprint 4: The "Exit-Ready" Data Export
*   **Goal:** Prove the "Share of Wallet" asset.
*   **Constraints:** Aggregate data by Vendor/SKU.
*   **Definition of Done:** A single, clean report showing "Share of Wallet" for a test user. This is our "Acquisition Pitch" document. If we can't generate this report, we haven't built the asset.

---

**Head of Product Directive:**
We are not building an "Admin Portal" in Sprint 4; we are building a **Data Export Tool**. If it doesn't help us prove the value of the data to an acquirer, it is friction. 

**Sprint 1 starts now.** I want the local PII scrubbing utility tested against a dummy voice transcript by EOD. If the regex misses a single address or phone number, we do not move to the cloud. **Get it done.**

*** CTO REBUTTAL ***
As CTO, I have reviewed the opening statements. While the alignment on "Offline-First" and "Data Moat" is strong, I am identifying immediate friction points that threaten our core metrics.

### Executive Challenge & Compromise

1.  **To VP Finance (The $50/mo OpEx Cap):** Your $50/mo limit is incompatible with the Strategist’s demand for `text-embedding-3-large` and `gpt-4o-mini` at scale. High-dimensional vector operations and frequent LLM calls will blow through that budget in a week. 
    *   **Compromise:** We will utilize local, open-source models for initial PII scrubbing and basic classification. We will only hit the expensive APIs for the final "Auditor" pass and high-confidence SKU mapping. If the API cost per CoC exceeds $0.05, the feature is automatically throttled.

2.  **To Product Lead (The "Three-Tap" Rule):** You want speed; I want auditability. You cannot have a "three-tap" workflow if the Auditor agent is performing a deep-dive cross-reference against AS/NZS 3000. 
    *   **Compromise:** We will implement "Optimistic UI." The user completes their three taps, and the CoC is generated locally as a "Draft." The Auditor agent runs asynchronously in the background. If the Auditor finds a compliance gap, it triggers a "Correction Required" notification. We prioritize user flow, but we never finalize the legal document until the Auditor clears it.

3.  **To Strategist (The "Data Moat"):** You are pushing for "predictive procurement" analytics. This requires massive data ingestion. 
    *   **Compromise:** We will not build custom analytics engines. We will build a clean, normalized data export pipeline. Our "Data Moat" is the *structure* of the data, not the dashboard itself. We will focus on the WORM (Write-Once-Read-Many) storage pattern to ensure that when we are acquired, the buyer can ingest our data into their own systems without friction.

---

### Revised Sprint 1: The Foundation (Infrastructure & Compliance)

**Goal:** Establish the secure, offline-first environment without incurring unnecessary cloud costs.

**Strict Technical Constraints:**
*   **Local-First:** All PII scrubbing must occur on the client device using a local regex/pattern-matching library. No raw data leaves the device until it is sanitized.
*   **Math:** All financial calculations must use the `Decimal` library. Any PR containing floating-point math for currency will be rejected immediately.
*   **Infrastructure:** We will use a serverless architecture to ensure we only pay for execution time, keeping us within the $50/mo OpEx cap.

**Definition of Done (Required for Funding):**
1.  **Offline Capability:** The application successfully persists a voice transcript and receipt image to local storage while in "Airplane Mode."
2.  **Sanitization:** A test suite proves that a sample transcript containing a home address and phone number is successfully scrubbed *before* the sync-to-cloud function is triggered.
3.  **Financial Integrity:** A unit test confirms that `(100.00 + 15%)` results in `115.00` using `Decimal` precision, with no rounding errors.
4.  **Audit Trail:** The system generates a unique, immutable hash for the local draft, which will serve as the foundation for the WORM compliance record.

**Engineering Policy Update:**
*   **No "Nice-to-Haves":** If a feature does not directly support the "Offline-First" capture or the "Compliance Shield," it is deferred to V2.0. 
*   **API Budgeting:** Every API call must be logged with its associated cost. Any developer who exceeds the daily budget allocation will be required to refactor their logic to use local processing.

**Proceed with Sprint 1. I expect the PII scrubbing utility to be verified against our test suite by EOD.**

## 2. Strategic Mandate for the Chief Architect

# Strategic Product & Business Mandate: SparkOps V1.0

**To:** Chief Architect  
**From:** Chairman of the Board  
**Subject:** Execution Mandate for SparkOps V1.0 – "The Supply Chain Intelligence Engine"

The Board has synthesized the executive debate. We are not building a generic utility; we are building a **defensible, high-margin data asset** for the New Zealand trade market. Your mandate is to prioritize **Data Integrity, Regulatory Compliance, and Financial Discipline** above all else.

---

### 1. The Business Requirements Document (BRD)
The objective is to capture the "Voice-to-Cash" workflow to create a proprietary dataset of trade material consumption. 

*   **Core Functionality:** An offline-first PWA that allows electricians to generate compliant Certificates of Compliance (CoC) and capture receipt data in zero-connectivity environments (e.g., basements).
*   **The Data Moat:** Every receipt must be normalized into a Master Electrical SKU database. This dataset is the primary asset for our $10M+ exit valuation.
*   **The Compliance Shield:** The "Auditor" agent (the "Sandwich" protocol) acts as the final gatekeeper. No CoC is valid or exportable unless it passes the AS/NZS 3000 verification.

### 2. Definition of Success
*   **Data Quality:** 95%+ accuracy in mapping raw receipt text to standardized Master Electrical SKUs.
*   **Compliance:** 100% of generated CoCs must be immutable (WORM pattern) and verifiable against AS/NZS 3000 rules.
*   **Financial Integrity:** Zero floating-point math in the entire pipeline. Every transaction must be verifiable to the cent.
*   **Exit Readiness:** The data must be exportable in a clean, structured format (JSON/CSV) that requires zero manual cleaning for a third-party M&A due diligence team.

### 3. Strict Constraints (Non-Negotiable)
*   **Financial Constraint:** **$50/mo OpEx Hard-Cap.** You must prioritize local, quantized, open-source processing for PII scrubbing and initial normalization. API calls are a last resort; if a feature pushes us over the cap, it is discarded.
*   **Regulatory Constraint:** **AS/NZS 3000 Compliance.** The Auditor agent is the *only* authority. If it cannot verify a CoC, the document is blocked. No "bypass" buttons.
*   **Security Constraint:** **PII Sanitization.** No PII (names, addresses, phone numbers) may leave the local client environment. All data must be scrubbed via local regex/logic before any network transmission.
*   **Math Constraint:** **Zero-Float Policy.** All currency calculations must use `decimal.Decimal` with `ROUND_HALF_UP` precision. Any use of `float` is grounds for immediate project termination.
*   **Architectural Constraint:** **WORM Pattern.** Once a CoC is generated, it must be locked via Postgres Row-Level Security (RLS). It cannot be modified by any user, including the Admin.

### 4. The "What" and the "Why"
*   **Why Offline-First?** Our users operate in basements. If the app requires a signal, it is useless. If it is useless, we capture no data. If we capture no data, we have no asset.
*   **Why the "Sandwich" Protocol?** We are shielding the entity from litigation. Compliance is our "stickiness" factor; it ensures the user cannot leave the platform without risking their own legal standing.
*   **Why SKU Normalization?** This is the "Share of Wallet" intelligence. Wholesalers will pay a premium to see where their customers are leaking spend. This is our exit strategy.

### 5. Architect’s Autonomy
You have full autonomy over the **"How."** You may choose the stack, the local models, and the specific database schema, provided you satisfy the following:
1.  **The $50/mo OpEx ceiling is never breached.**
2.  **The PII scrubbing is 100% effective locally.**
3.  **The math is 100% idempotent and verifiable.**
4.  **The data structure is pristine for M&A ingestion.**

**Immediate Directive:**
Proceed with **Sprint 1: The Foundation.** Before any external API calls are authorized, you must deliver a report verifying the local PII scrubbing utility against a test suite of dummy voice transcripts. 

**The Board expects a report on the PII scrubbing utility by EOD.** 

*Get to work.*