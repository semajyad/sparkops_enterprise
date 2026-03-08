# 🚀 SparkOps Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying SparkOps to production environments. The platform is designed for cloud-native deployment with Railway (backend), Vercel (frontend), and managed database services.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Vercel App    │    │  Railway API    │    │  PostgreSQL DB  │
│   (Frontend)    │◄──►│   (Backend)     │◄──►│   (Database)    │
│   Next.js 16    │    │   FastAPI       │    │   pgvector      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
    ┌─────────┐            ┌─────────────┐         ┌─────────────┐
    │ Supabase│            │   OpenAI    │         │   Twilio    │
    │   Auth  │            │   AI/ML     │         │   SMS/Voice │
    └─────────┘            └─────────────┘         └─────────────┘
```

## Prerequisites

### Required Accounts
- **Railway**: Backend hosting (https://railway.app)
- **Vercel**: Frontend hosting (https://vercel.com)
- **Supabase**: Authentication service (https://supabase.com)
- **OpenAI**: AI processing (https://openai.com)
- **Twilio**: SMS/Voice services (https://twilio.com)
- **PostgreSQL**: Database (Railway-provided or external)

### Development Tools
- Git for version control
- Node.js 18+ and npm
- Python 3.11+ and pip
- Railway CLI (optional)
- Vercel CLI (optional)

---

## 🗄️ Database Setup

### Option 1: Railway PostgreSQL (Recommended)
1. Create new Railway project
2. Add PostgreSQL service
3. Copy connection string from Railway dashboard

### Option 2: External PostgreSQL
1. Set up PostgreSQL instance (AWS RDS, Neon, etc.)
2. Create database and user
3. Configure connection string

### Database Initialization
```bash
# Clone repository
git clone <sparkops-repo>
cd sparkops_enterprise/backend

# Install dependencies
pip install -r requirements.txt

# Set DATABASE_URL environment variable
export DATABASE_URL="postgresql://user:pass@host:5432/dbname"

# Run database migrations
python -c "
from database import ENGINE
from models.database import create_db_and_tables
create_db_and_tables(ENGINE)
print('Database initialized successfully')
"
```

---

## 🔧 Backend Deployment (Railway)

### Step 1: Prepare Repository
```bash
# Ensure backend is in git repository
cd sparkops_enterprise
git init
git add .
git commit -m "Initial commit - SparkOps backend"
```

### Step 2: Create Railway Project
1. Sign in to Railway dashboard
2. Click "New Project" → "Deploy from GitHub repo"
3. Connect your GitHub repository
4. Select `backend` folder as root directory

### Step 3: Configure Railway Service
Create `backend/railway.yaml`:
```yaml
# railway.yaml
services:
  - type: web
    name: sparkops-api
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /health
    envVars:
      - key: DATABASE_URL
        value: ${DATABASE_URL}
      - key: OPENAI_API_KEY
        value: ${OPENAI_API_KEY}
      - key: SECRET_KEY
        value: ${SECRET_KEY}
      - key: SUPABASE_JWT_SECRET
        value: ${SUPABASE_JWT_SECRET}
      - key: TWILIO_ACCOUNT_SID
        value: ${TWILIO_ACCOUNT_SID}
      - key: TWILIO_AUTH_TOKEN
        value: ${TWILIO_AUTH_TOKEN}
      - key: TWILIO_PHONE_NUMBER
        value: ${TWILIO_PHONE_NUMBER}
```

### Step 4: Set Environment Variables
In Railway dashboard, configure these variables:

#### Required Variables
```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
OPENAI_API_KEY=sk-your-openai-key
SECRET_KEY=your-super-secret-key-here
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
```

#### Optional Variables (Twilio)
```bash
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+64212345678
```

### Step 5: Deploy
1. Push changes to GitHub
2. Railway will auto-deploy
3. Monitor deployment logs
4. Test health endpoint: `https://your-app.railway.app/health`

### Step 6: Verify API
```bash
# Test health endpoint
curl https://your-app.railway.app/health

# Test API docs
# Visit: https://your-app.railway.app/docs
```

---

## 🎨 Frontend Deployment (Vercel)

### Step 1: Prepare Frontend
```bash
cd sparkops_enterprise/frontend

# Install dependencies
npm install

# Create production environment file
cp .env.local .env.production
```

### Step 2: Configure Environment
Edit `frontend/.env.production`:
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# API Configuration
NEXT_PUBLIC_API_BASE_URL=https://your-app.railway.app
```

### Step 3: Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Or use web interface:
# 1. Go to vercel.com
# 2. Import GitHub repository
# 3. Select frontend folder
# 4. Configure environment variables
# 5. Deploy
```

### Step 4: Configure Vercel Environment
In Vercel dashboard:
1. Go to project settings
2. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_BASE_URL`
3. Redeploy application

### Step 5: Verify Frontend
```bash
# Test frontend
curl https://your-app.vercel.app

# Should return Next.js page or redirect to login
```

---

## 🔐 Supabase Configuration

### Step 1: Create Supabase Project
1. Go to https://supabase.com
2. Create new project
3. Note project URL and anon key

### Step 2: Configure Authentication
In Supabase dashboard:
1. Go to Authentication → Settings
2. Configure email/password signup
3. Add your frontend URL to redirect URLs:
   - `https://your-app.vercel.app/**`
   - `http://localhost:3000/**` (for development)

### Step 3: Get JWT Secret
1. Go to Project Settings → API
2. Copy `JWT Secret` (not the anon key)
3. Add to Railway environment variables

### Step 4: Create Service Role Key
1. Go to Project Settings → API
2. Copy `service_role` key
3. Add to frontend environment variables

---

## 📱 Twilio Setup (Optional)

### Step 1: Create Twilio Account
1. Sign up at https://twilio.com
2. Purchase phone number (NZ numbers recommended)
3. Note Account SID and Auth Token

### Step 2: Configure Phone Number
1. In Twilio console, select your phone number
2. Set "A call comes in" webhook to:
   `https://your-app.railway.app/api/twilio/voice`
3. Configure friendly name and capabilities

### Step 3: Test Webhook
```bash
# Test webhook endpoint
curl -X POST \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "From=+64212345678&To=+64298765432&CallSid=test" \
     https://your-app.railway.app/api/twilio/voice
```

---

## 🔍 DNS and SSL Configuration

### Custom Domain Setup (Optional)

#### Vercel Frontend
1. In Vercel dashboard, go to Domains
2. Add custom domain (e.g., `app.sparkops.co.nz`)
3. Configure DNS records as instructed
4. SSL certificate automatically provisioned

#### Railway Backend
1. In Railway dashboard, go to Settings
2. Add custom domain (e.g., `api.sparkops.co.nz`)
3. Configure DNS CNAME record
4. SSL certificate automatically provisioned

### DNS Records Example
```
# Frontend (Vercel)
app.sparkops.co.nz.    CNAME    cname.vercel-dns.com.

# Backend (Railway)  
api.sparkops.co.nz.   CNAME    proxy.railway.app

# Supabase (if custom domain)
auth.sparkops.co.nz.  CNAME    ref.supabase.co.
db.sparkops.co.nz.    CNAME    db.supabase.co.
```

---

## 🚦 Health Monitoring

### Railway Health Checks
Railway automatically monitors `/health` endpoint. Ensure it returns:
```json
{
  "status": "healthy",
  "service": "sparkops-api",
  "timestamp": "2024-03-08T15:30:00Z"
}
```

### Vercel Monitoring
Vercel provides built-in monitoring for:
- Response times
- Error rates
- Build status
- Edge network performance

### Additional Monitoring (Optional)
Consider adding:
- **Uptime Robot**: External health monitoring
- **Logtail**: Log aggregation
- **Sentry**: Error tracking
- **DataDog**: APM and metrics

---

## 🔒 Security Configuration

### Environment Security
1. Use Railway's encrypted environment variables
2. Never commit secrets to Git
3. Rotate API keys regularly
4. Use different keys for staging/production

### Network Security
1. Enable HTTPS everywhere
2. Configure proper CORS settings
3. Use Supabase RLS policies
4. Validate all webhook signatures

### Database Security
1. Use strong database passwords
2. Enable SSL connections
3. Limit database user permissions
4. Regular database backups

---

## 📊 Performance Optimization

### Frontend Optimization
```bash
# Build optimization
npm run build

# Analyze bundle size
npm run analyze

# Enable Vercel Edge Functions
# (Configure in vercel.json if needed)
```

### Backend Optimization
```python
# Add to main.py for production
from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)

# Configure connection pooling
# (Handled by Railway automatically)
```

### Database Optimization
```sql
-- Add indexes for performance
CREATE INDEX idx_job_drafts_user_org ON job_drafts(user_id, organization_id);
CREATE INDEX idx_materials_name_vector ON materials USING ivfflat (embedding vector_cosine_ops);
```

---

## 🔄 CI/CD Pipeline

### GitHub Actions (Optional)
Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy SparkOps

on:
  push:
    branches: [main]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
      - name: Run tests
        run: |
          cd backend
          pytest tests/ -v

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: |
          cd frontend
          npm install
      - name: Run tests
        run: |
          cd frontend
          npm test
```

### Automatic Deployments
- **Railway**: Auto-deploys on Git push
- **Vercel**: Auto-deploys on Git push
- Configure branch-specific deployments for staging

---

## 🧪 Production Testing

### Health Check Tests
```bash
# Backend health
curl -f https://api.sparkops.co.nz/health

# Frontend availability  
curl -f https://app.sparkops.co.nz

# API documentation
curl -f https://api.sparkops.co.nz/docs
```

### Integration Tests
```bash
# Test authentication flow
curl -X POST \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123"}' \
     https://your-project.supabase.co/auth/v1/token?grant_type=password

# Test API with auth token
curl -H "Authorization: Bearer <token>" \
     https://api.sparkops.co.nz/api/auth/me
```

### Load Testing (Optional)
```bash
# Install locust
pip install locust

# Run load test
cd backend
locust -f tests/locustfile.py --host=https://api.sparkops.co.nz
```

---

## 🚨 Troubleshooting

### Common Issues

#### Railway Deployment Fails
```bash
# Check build logs in Railway dashboard
# Verify requirements.txt is complete
# Ensure Python version compatibility (3.11+)
# Check environment variable names
```

#### Frontend Build Errors
```bash
# Check environment variables in Vercel
# Verify NEXT_PUBLIC_ prefix for client-side vars
# Ensure all dependencies installed
# Check TypeScript compilation errors
```

#### Database Connection Issues
```bash
# Verify DATABASE_URL format
# Check database is accessible
# Test connection manually:
psql $DATABASE_URL -c "SELECT 1;"
```

#### Authentication Failures
```bash
# Verify Supabase configuration
# Check JWT secret matches
# Test Supabase connection manually
# Verify redirect URLs configured
```

#### Twilio Webhook Issues
```bash
# Check webhook URL is accessible
# Verify Twilio signature validation
# Test webhook with Twilio console
# Check Railway logs for webhook errors
```

### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=DEBUG

# Railway: Add to environment variables
LOG_LEVEL=DEBUG

# Frontend: Add to environment
NEXT_PUBLIC_DEBUG=true
```

---

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] All environment variables configured
- [ ] Database initialized and tested
- [ ] SSL certificates configured
- [ ] DNS records updated
- [ ] Health checks passing
- [ ] Security settings reviewed

### Post-Deployment
- [ ] Frontend loads correctly
- [ ] Backend API responding
- [ ] Authentication working
- [ ] Database connections stable
- [ ] Monitoring enabled
- [ ] Backup procedures documented

### Production Validation
- [ ] User signup/login flow
- [ ] Voice capture and processing
- [ ] Receipt OCR functionality
- [ ] Job creation and management
- [ ] PDF invoice generation
- [ ] Mobile responsiveness
- [ ] Offline sync functionality
- [ ] Twilio integration (if configured)

---

## 🔄 Maintenance

### Regular Tasks
- **Weekly**: Review logs and metrics
- **Monthly**: Rotate API keys and secrets
- **Quarterly**: Update dependencies
- **Annually**: Security audit and penetration testing

### Backup Procedures
- **Database**: Enable automatic backups
- **Configuration**: Document all settings
- **Recovery**: Test restore procedures

### Scaling Considerations
- **Backend**: Add Railway instances as needed
- **Frontend**: Vercel auto-scales globally
- **Database**: Consider read replicas for high load
- **CDN**: Vercel Edge Network handles static assets

---

## 📞 Support

### Emergency Contacts
- **Railway Support**: https://railway.app/support
- **Vercel Support**: https://vercel.com/support
- **Supabase Support**: https://supabase.com/support
- **Development Team**: [contact information]

### Debug Information
Collect this information when reporting issues:
- Service names and URLs
- Error messages and logs
- Steps to reproduce
- Expected vs actual behavior
- Timestamp and timezone

---

*🔥 SparkOps Production Deployment Guide - Voice-to-cash platform for NZ electrical contractors*