# 🔥 SparkOps - Voice-to-Cash Platform for NZ Electricians

## 📋 Overview

SparkOps is a production-ready enterprise platform that transforms voice notes and receipts into professional invoices for New Zealand electrical contractors. Built with **Next.js 16**, **FastAPI**, and **PostgreSQL**, it features AI-powered job triage, offline-first capabilities, and intelligent telecommunications integration.

### 🎯 Core Value Proposition
- **Voice Capture**: Record job notes → AI extracts structured data → Professional invoices
- **Receipt Processing**: Photo receipts → OCR extraction → Material catalog integration  
- **Offline-First**: Works without internet → Auto-syncs when connection returns
- **Smart Triage**: Phone call interception → Urgency classification → Real-time notifications
- **GPS Tracking**: Live job tracking → SMS client updates → Public tracking links

---

## 🏗️ Architecture

### Frontend Stack
- **Next.js 16** with App Router and Server Components
- **React 19** with TypeScript and Suspense
- **Tailwind CSS** with industrial dark theme
- **Framer Motion** for smooth animations
- **Supabase** for authentication and SSR
- **Leaflet** for interactive maps
- **IndexedDB** for offline storage

### Backend Stack  
- **FastAPI** with async/await and Pydantic validation
- **PostgreSQL** with pgvector for vector embeddings
- **SQLModel** for ORM with proper relationships
- **OpenAI** GPT models for AI processing
- **Twilio** for telecommunications
- **ReportLab** for PDF generation
- **Pytest** for comprehensive testing

### AI Integration
- **gpt-4o-mini-transcribe**: Voice transcription
- **gpt-5**: Job triage and classification
- **gpt-5-nano**: Simple formatting and translation
- **gpt-5.4**: Complex reasoning and vision tasks

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Python 3.11+ and pip
- PostgreSQL database
- OpenAI API key
- Twilio account (for phone features)

### Environment Setup

#### Frontend (.env.local)
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# API Configuration  
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

#### Backend (.env)
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/sparkops

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Twilio (optional)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_number

# Security
SECRET_KEY=your_secret_key_here
SUPABASE_JWT_SECRET=your_supabase_jwt_secret
```

### Installation

#### Frontend
```bash
cd frontend
npm install
npm run dev
```
Visit: http://localhost:3000

#### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```
Visit: http://localhost:8000/docs

---

## 📱 Features

### 🎤 Voice Capture & AI Processing
- **Real-time recording** with WebM audio capture
- **GPT-5 triage** extracts client, materials, labor, and urgency
- **Kiwi slang translation** (hot water cylinder in cupboard → Horizontal Hot Water Cylinder)
- **Automatic job classification** into materials vs labor
- **Invoice calculation** with configurable markup rates

### 📸 Receipt Processing
- **Camera capture** with base64 encoding
- **OCR extraction** using GPT-5.4 vision
- **Line item parsing** with trade vs retail price selection
- **Material catalog integration** with vector search
- **Automatic quantity and price normalization**

### 📱 Offline-First PWA
- **IndexedDB storage** for job drafts and materials
- **Service Worker** with background sync
- **Network awareness** with online/offline detection
- **Auto-sync** when connection returns ("Zombie Mode")
- **Manual sync** with retry logic and error handling

### 📞 Smart Triage (Ladder Mode)
- **Call interception** via Twilio webhooks
- **Voicemail transcription** with urgency classification
- **Real-time feed** sorted by priority (High/Medium/Low)
- **One-tap activation** from mobile dashboard
- **Structured notifications** with client details

### 🗺️ GPS Tracking & Client Updates
- **Secure tracking links** with token-based access
- **SMS notifications** with tracking URLs
- **Live countdown timers** with ETA updates
- **Interactive maps** using Leaflet
- **Public tracking pages** for client access

### 🔐 Authentication & Security
- **Supabase SSR** with JWT token management
- **Role-based access** (OWNER vs EMPLOYEE)
- **Session management** with automatic refresh
- **Protected routes** with middleware
- **Secure API endpoints** with proper validation

### 📊 Dashboard & Analytics
- **Business pulse metrics** (pending jobs, billable hours, material spend)
- **Recent activity feed** with job status updates
- **Real-time updates** with WebSocket-style polling
- **Mobile-responsive** design with bottom navigation
- **Session expiry handling** with graceful re-authentication

---

## 🧪 Testing

### Backend Tests
```bash
cd backend
pytest tests/ -v --cov=.
```

### Frontend Tests
```bash
cd frontend
npm run test
npm run test:e2e  # Playwright
```

### Verification Scripts
```bash
# Test AI triage extraction
python scripts/test_triage.py

# Test materials import
python scripts/test_materials.py
```

---

## 📁 Project Structure

```
sparkops_enterprise/
├── frontend/                 # Next.js 16 application
│   ├── src/
│   │   ├── app/             # App Router pages
│   │   ├── components/      # React components
│   │   ├── lib/            # Utilities and API clients
│   │   └── tests/          # E2E and component tests
│   ├── public/             # Static assets and Service Worker
│   └── package.json
├── backend/                  # FastAPI application
│   ├── routers/            # API route handlers
│   ├── services/           # Business logic and AI services
│   ├── models/             # SQLModel database models
│   ├── tests/              # Pytest test suite
│   ├── scripts/            # Verification and utility scripts
│   └── requirements.txt
└── README.md               # This documentation
```

---

## 🔧 API Documentation

### Core Endpoints

#### Authentication
```http
GET  /api/auth/me              # Get current user profile
GET  /api/v1/auth/handshake    # Versioned auth handshake
```

#### Job Management
```http
POST /api/ingest               # Process voice/receipt data
GET  /api/jobs                 # List jobs (role-filtered)
GET  /api/jobs/{id}            # Get job details
DELETE /api/jobs/{id}          # Delete job
GET  /api/jobs/{id}/pdf        # Download PDF invoice
```

#### Materials Management
```http
POST /api/materials/upload     # Async CSV upload
POST /api/materials/import     # Sync materials import
```

#### Telecommunications (Twilio)
```http
POST /api/twilio/voice         # Voice webhook
POST /api/twilio/recording     # Recording callback
GET  /api/twilio/voicemails    # Voicemail feed
GET  /api/twilio/ladder-mode   # Ladder mode state
POST /api/twilio/ladder-mode   # Toggle ladder mode
```

#### GPS Tracking
```http
POST /api/eta/generate         # Generate tracking link
GET  /api/eta/lookup/{id}      # Lookup tracking data
```

### Request/Response Examples

#### Voice Ingestion
```typescript
POST /api/ingest
{
  "audio_base64": "base64_encoded_webm_audio",
  "transcript": "installed hot water cylinder in cupboard",
  "type": "voice"
}

Response:
{
  "id": "uuid",
  "status": "processed",
  "extracted_data": {
    "client": "John Smith",
    "materials": ["Horizontal Hot Water Cylinder"],
    "labor_hours": 3,
    "urgency": "Medium"
  }
}
```

#### Receipt Processing
```typescript
POST /api/ingest
{
  "image_base64": "base64_encoded_jpg",
  "type": "receipt"
}

Response:
{
  "id": "uuid", 
  "status": "processed",
  "extracted_data": {
    "supplier": "J.A. Russell",
    "date": "2024-03-08",
    "line_items": [
      {
        "description": "2.5mm TPS Cable",
        "quantity": 50,
        "unit_price": 2.45
      }
    ]
  }
}
```

---

## 🗄️ Database Schema

### Core Models

#### Users & Authentication
```sql
User (id, email, created_at)
Organization (id, name, created_at)
Profile (id, user_id, organization_id, role, full_name)
UserSettings (id, default_markup, default_labor_rate)
```

#### Jobs & Materials
```sql
JobDraft (id, user_id, organization_id, extracted_data, status, created_at)
Material (id, name, description, trade_price, retail_price, supplier, embedding)
```

#### Relationships
- Users belong to Organizations
- Profiles link Users to Organizations with roles
- JobDrafts belong to Users and Organizations
- Materials are shared within Organizations

### Vector Search
Materials use pgvector embeddings for semantic search:
```python
# Find similar materials
embedding = generate_embedding("cable")
materials = vector_search(embedding, threshold=0.7)
```

---

## 🚀 Deployment

### Production Environment

#### Railway (Backend)
```yaml
# railway.yaml
services:
  - type: web
    name: sparkops-api
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: DATABASE_URL
        value: ${DATABASE_URL}
      - key: OPENAI_API_KEY
        value: ${OPENAI_API_KEY}
```

#### Vercel (Frontend)
```bash
cd frontend
npx vercel deploy --prod
```

#### Environment Variables
Configure all required environment variables in your deployment platform:
- Database URL
- OpenAI API Key
- Supabase URLs and Keys
- Twilio Credentials (optional)
- JWT Secret

### Health Checks
```bash
# Backend health
curl https://your-api.railway.app/health

# Frontend availability
curl https://your-app.vercel.app
```

---

## 🔒 Security Considerations

### Authentication Flow
1. **Supabase Authentication** handles user signup/login
2. **JWT Token** passed to backend for API requests
3. **Role Validation** ensures proper access controls
4. **Session Management** with automatic token refresh

### API Security
- **CORS Configuration** for cross-origin requests
- **Request Validation** using Pydantic models
- **SQL Injection Prevention** via SQLModel ORM
- **Rate Limiting** recommended for production

### Data Protection
- **Encryption in Transit** (HTTPS/TLS)
- **Environment Variables** for sensitive data
- **Database Security** with proper user permissions
- **Input Sanitization** throughout the application

---

## 🎯 Business Logic

### Invoice Calculation
```python
# Material pricing with markup
material_total = sum(item.quantity * item.trade_price for item in materials)
material_with_markup = material_total * (1 + markup_rate)

# Labor calculation
labor_total = labor_hours * labor_rate

# GST calculation (NZ)
subtotal = material_with_markup + labor_total
gst = subtotal * 0.15
total = subtotal + gst
```

### Urgency Classification
- **High**: Emergency electrical issues, safety concerns
- **Medium**: Routine maintenance, scheduled work
- **Low**: Quotations, consultations, non-urgent requests

### Role-Based Access
- **OWNER**: Full access to all organization data and settings
- **EMPLOYEE**: Access to own jobs only, limited settings

---

## 🐛 Troubleshooting

### Common Issues

#### Audio Recording Not Working
- Check browser permissions for microphone access
- Ensure HTTPS in production (required for microphone)
- Verify WebM format support in target browsers

#### Background Sync Not Triggering
- Confirm Service Worker is registered
- Check network connectivity and browser sync support
- Verify IndexedDB data exists and is pending sync

#### Twilio Webhooks Not Receiving
- Validate webhook signature in Twilio console
- Ensure webhook URL is publicly accessible
- Check CORS configuration for Twilio domain

#### AI Processing Errors
- Verify OpenAI API key is valid and has credits
- Check rate limits and model availability
- Review request payload format and size limits

### Debug Mode
Enable debug logging:
```bash
# Backend
export LOG_LEVEL=DEBUG
uvicorn main:app --reload

# Frontend  
export NEXT_PUBLIC_DEBUG=true
npm run dev
```

---

## 🤝 Contributing

### Development Workflow
1. **Create feature branch** from main
2. **Implement changes** with tests
3. **Run test suite** to ensure no regressions
4. **Submit pull request** for review
5. **Deploy to staging** for verification

### Code Standards
- **TypeScript** for frontend code
- **Python type hints** for backend code
- **ESLint/Prettier** for code formatting
- **Conventional commits** for commit messages

### Testing Requirements
- **Unit tests** for business logic
- **Integration tests** for API endpoints
- **E2E tests** for critical user flows
- **Minimum 80% test coverage** required

---

## 📄 License

This project is proprietary software. All rights reserved.

---

## 🆘 Support

For technical support or questions:
- Review this documentation thoroughly
- Check existing GitHub issues
- Contact the development team directly

---

## 🔄 Version History

### v1.0.0 (Current)
- ✅ Complete voice-to-job pipeline
- ✅ Offline-first PWA capabilities  
- ✅ Smart triage with Ladder Mode
- ✅ GPS tracking with SMS notifications
- ✅ Comprehensive authentication system
- ✅ Full test coverage and documentation

### Future Roadmap
- 📋 Advanced reporting and analytics
- 📱 Mobile app development
- 🔗 Third-party integrations
- 🌐 Multi-region deployment
- 🤖 Enhanced AI capabilities

---

## 📊 Metrics & KPIs

### Performance Targets
- **API Response Time**: <500ms (95th percentile)
- **Page Load Time**: <2s (first contentful paint)
- **Offline Sync**: <5s after connection restore
- **AI Processing**: <30s for voice/receipt ingestion

### Business Metrics
- **Job Processing Accuracy**: >95%
- **User Engagement**: Daily active users
- **Sync Success Rate**: >98%
- **Customer Satisfaction**: NPS score tracking

---

*🔥 SparkOps - Transforming voice into value for NZ electrical contractors*