# Legal Compliance & Liability Shield

## The Risk
Electricians are legally liable for the safety of their work. A faulty Certificate of Compliance (CoC) can result in loss of license or prosecution under New Zealand law. SparkOps must act as a liability shield, not a liability generator.

## The Regulatory Framework
All electrical work documented in SparkOps must be checked against **AS/NZS 3000** (The Wiring Rules). 

## AI Guardrails & "The Sandwich" Architecture
We cannot trust a single LLM to write legal documents safely.
1. **The Drafter (gpt-4o-mini):** Converts the Sparky's raw voice notes into professional text.
2. **The Auditor (o3-mini):** A cyclic LangGraph agent that reviews the drafted text against the AS/NZS 3000 rules embedded in our vector database. 
3. **The Loop:** If the Auditor detects missing mandatory tests (e.g., Earth Loop Impedance not mentioned for a new socket), it rejects the draft and prompts the user for the missing data. It never outputs an illegal CoC.

## Privacy & PII
Do not send unscrubbed Personally Identifiable Information (customer names, home addresses, credit card numbers) to Free Tier AI models. PII must be scrubbed using local regex before hitting external AI services whenever possible.

## Data Retention & Security
All user data must be encrypted at rest and in transit. Access logs must be maintained for audit purposes. Data retention policy: 7 years for compliance with New Zealand electrical safety regulations.
Should be able to pass a bank level audit.