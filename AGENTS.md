# 🚀 SparkOps Enterprise - Project Instructions

## 📋 Project Overview
**Voice-to-Cash SaaS platform for NZ electricians** with strict $50/month OpEx cap and AS/NZS 3000 compliance requirements.

## 🎯 Core Directives

### Primary Operating Principles
- **Research Protocol**: Use web_search for any uncertainties or bugs > 2 minutes
- **MCP Utilization**: Check available MCPs and use relevant ones for each task
- **Context7 Integration**: Always use Context7 MCP for library/API documentation without explicit requests

### Critical Constraints
- **Financial Arithmetic**: Use decimal.Decimal only (NO float math)
- **Compliance Requirements**: AS/NZS 3000 standards, PII sanitization with local regex
- **Architecture Pattern**: WORM pattern for Certificates of Compliance

### Staging Credentials
- **E2E Tests**: jimmybobday@gmail.com / Samdoggy1!

## 🛠️ Technology Stack

### Frontend Stack
- **Framework**: Next.js 16 with App Router
- **UI**: React 19, TypeScript, Tailwind CSS
- **Authentication**: Supabase auth
- **Maps**: Leaflet with Mapbox tiles
- **Storage**: IndexedDB for offline-first

### Backend Stack
- **API**: FastAPI with async/await
- **Database**: PostgreSQL with pgvector
- **ORM**: SQLModel with proper relationships
- **AI**: OpenAI GPT models
- **Telecom**: Twilio integration
- **Documents**: ReportLab for PDF generation

### AI Model Usage
- **gpt-4o-mini-transcribe**: Voice transcription
- **gpt-5**: Job triage and classification
- **gpt-5-nano**: Simple formatting and translation
- **gpt-5.4**: Complex reasoning and vision tasks

## 🏗️ Architecture Principles

### Development Standards
- All new features require unit tests
- E2E tests for Login -> Capture -> Sync golden paths
- Offline-first resilience testing mandatory
- Mock all external APIs in unit tests

### Security & Compliance
- PII sanitization with local regex patterns
- Zero-float math for all financial calculations
- WORM pattern for compliance documents
- Row-Level Security (RLS) for data isolation

## 📊 Quality Targets

### Performance Requirements
- **Load Testing**: < 200ms P95 at 1000 concurrent users
- **Contract Testing**: Frontend/Backend integration verified
- **Accessibility**: WCAG 2.1 AA compliant (Contrast > 4.5:1)

### UI/UX Standards
- **Theme**: "Industrial Dark" with 44px touch targets
- **Motion**: Framer Motion with prefers-reduced-motion support
- **States**: "Personalized Zero State" (no mock data)

## 🔧 Development Environment

### Key MCPs Available
- **Context7**: Library/API documentation
- **Railway**: Deployment and infrastructure
- **GitHub**: Code management and operations
- **Memory**: Knowledge persistence
- **Filesystem**: File operations
- **Web Search**: Research and troubleshooting

### Environment Variables
- **OpenAI**: API key for AI services
- **Supabase**: Authentication and database
- **Twilio**: SMS and voice services
- **Xero**: Accounting integration
- **Mapbox**: Mapping services

---

*This file provides always-on context for all SparkOps development activities.*
