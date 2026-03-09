# 🚂 Railway Deployment Skill

**Purpose**: Complete Railway deployment process with safety checks and verification  
**Trigger**: When deployment to staging or production is needed  
**Scope**: Full deployment workflow including pre-deployment checks and post-deployment verification

---

## 🎯 Skill Activation

### Automatic Triggers
- Code merged to dev branch
- Staging deployment requested
- Production deployment requested
- Deployment failure recovery

### Manual Invocation
```bash
# Use the skill when you need:
@skill railway-deployment
- Deploy to staging environment
- Verify deployment health
- Troubleshoot deployment issues
- Monitor deployment logs
```

---

## 📋 Pre-Deployment Checklist (MANDATORY)

### Code Quality Verification
- [ ] **All tests pass**: Unit, integration, E2E tests
- [ ] **Coverage thresholds met**: Backend >85%, Frontend >90%
- [ ] **Linting clean**: No linting errors or warnings
- [ ] **Type safety**: TypeScript compilation successful
- [ ] **Security scan**: No vulnerabilities detected

### Environment Preparation
- [ ] **Railway CLI installed**: `railway version` returns valid version
- [ ] **Project linked**: `railway status` shows project connection
- [ ] **Environment variables**: All required env vars configured
- [ ] **Database migrations**: Applied and verified
- [ ] **Build artifacts**: Frontend build completed successfully

### Service Configuration
- [ ] **Backend service**: `sparkops_staging_backend` configured
- [ ] **Frontend service**: `sparkops_staging_frontend` configured
- [ ] **Database service**: PostgreSQL instance running
- [ ] **Environment**: Staging environment selected
- [ ] **Domains**: Custom domains configured (if needed)

---

## 🚀 Deployment Process

### Step 1: Environment Verification
```bash
# Check Railway CLI status
railway status

# Verify project linkage
railway link --project <project-id>

# Check current environment
railway environment
```

### Step 2: Service Deployment
```bash
# Deploy backend service
railway up --service sparkops_staging_backend --environment staging

# Deploy frontend service  
railway up --service sparkops_staging_frontend --environment staging

# Check deployment status
railway deployment list --environment staging
```

### Step 3: Health Verification
```bash
# Check backend health
curl -f https://<backend-url>.railway.app/health

# Check frontend accessibility
curl -f https://<frontend-url>.railway.app/

# Verify database connectivity
railway logs --service sparkops_staging_backend --lines 50
```

---

## 🔍 Post-Deployment Verification

### Health Checks
```bash
# Backend health endpoint
curl -s https://<backend-url>.railway.app/health

# Expected response: {"status": "healthy", "service": "sparkops-api"}

# Frontend accessibility
curl -I https://<frontend-url>.railway.app/

# Expected response: 200 OK with proper headers
```

### Service Logs Analysis
```bash
# Backend service logs
railway logs --service sparkops_staging_backend --environment staging --lines 200

# Frontend service logs
railway logs --service sparkops_staging_frontend --environment staging --lines 200

# Database service logs
railway logs --service postgres --environment staging --lines 100
```

### E2E Test Execution
```bash
# Run E2E tests against staging
cd frontend
PLAYWRIGHT_BASE_URL=https://<frontend-url>.railway.app \
npx playwright test tests/e2e/golden-path.spec.ts

# Run offline resilience tests
PLAYWRIGHT_BASE_URL=https://<frontend-url>.railway.app \
npx playwright test tests/e2e/offline-resilience.spec.ts
```

---

## 📊 Deployment Monitoring

### Real-time Monitoring
```bash
# Monitor deployment progress
watch -n 5 'railway deployment list --environment staging'

# Monitor service logs in real-time
railway logs --service sparkops_staging_backend --environment staging --follow

# Check service metrics
railway status --service sparkops_staging_backend
```

### Performance Metrics
```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s https://<backend-url>.railway.app/health

# Monitor database performance
railway logs --service postgres --environment staging --lines 50 | grep -i "performance\|slow"

# Check memory usage
railway status --service sparkops_staging_backend | grep -i "memory\|cpu"
```

---

## 🚨 Troubleshooting Guide

### Common Deployment Issues

#### Build Failures
```bash
# Issue: Frontend build fails
# Solution: Check build logs and fix errors
railway logs --service sparkops_staging_frontend --lines 100

# Issue: Backend build fails
# Solution: Check Python dependencies and requirements
railway logs --service sparkops_staging_backend --lines 100

# Issue: Database migration fails
# Solution: Check database connection and migration scripts
railway logs --service postgres --lines 50
```

#### Runtime Errors
```bash
# Issue: Service crashes on startup
# Solution: Check environment variables and configuration
railway logs --service sparkops_staging_backend --lines 200

# Issue: Database connection errors
# Solution: Verify database URL and credentials
railway logs --service postgres --lines 100

# Issue: Frontend cannot reach backend
# Solution: Check CORS configuration and API URLs
railway logs --service sparkops_staging_frontend --lines 100
```

#### Performance Issues
```bash
# Issue: Slow response times
# Solution: Check resource limits and optimize queries
railway status --service sparkops_staging_backend

# Issue: Memory leaks
# Solution: Monitor memory usage and restart service
railway restart --service sparkops_staging_backend
```

### Recovery Procedures

#### Service Restart
```bash
# Restart backend service
railway restart --service sparkops_staging_backend

# Restart frontend service
railway restart --service sparkops_staging_frontend

# Restart database service
railway restart --service postgres
```

#### Redeployment
```bash
# Force redeploy backend
railway up --service sparkops_staging_backend --force

# Force redeploy frontend
railway up --service sparkops_staging_frontend --force

# Redeploy all services
railway up --force
```

#### Rollback
```bash
# List previous deployments
railway deployment list --environment staging

# Rollback to previous deployment
railway rollback --deployment <deployment-id>
```

---

## 📈 Deployment Best Practices

### Environment Management
```bash
# Use separate environments for staging and production
railway environment create production
railway environment create staging

# Configure environment-specific variables
railway variables set NODE_ENV=production --environment production
railway variables set NODE_ENV=staging --environment staging
```

### Service Configuration
```yaml
# railway.toml (Backend)
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

[[services]]
name = "sparkops-staging-backend"
source = "."
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
```

```yaml
# railway.toml (Frontend)
[build]
builder = "NIXPACKS"
buildCommand = "npm run build"

[deploy]
startCommand = "npm start"
healthcheckPath = "/"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
```

### Security Configuration
```bash
# Set secure environment variables
railway variables set DATABASE_URL=$DATABASE_URL --environment staging
railway variables set JWT_SECRET=$JWT_SECRET --environment staging
railway variables set OPENAI_API_KEY=$OPENAI_API_KEY --environment staging

# Configure CORS
railway variables set CORS_ORIGINS=https://<frontend-url>.railway.app --environment staging
```

---

## 📋 Deployment Report Template

### Deployment Summary
**Date**: [Current Date]  
**Environment**: [Staging/Production]  
**Version**: [Git Commit Hash]  
**Deployer**: [Deployer Name]

#### Services Deployed
```
✅ Backend: [Service Name] - [Status]
✅ Frontend: [Service Name] - [Status]  
✅ Database: [Service Name] - [Status]
```

#### Health Checks
```
✅ Backend Health: [URL] - [Status]
✅ Frontend Health: [URL] - [Status]
✅ Database Health: [Status]
```

#### Test Results
```
✅ E2E Tests: [Pass/Fail] - [Details]
✅ Performance Tests: [Pass/Fail] - [Details]
✅ Security Tests: [Pass/Fail] - [Details]
```

#### Issues Found
```
🔴 Critical: [List of critical issues]
🟡 Warning: [List of warning issues]
ℹ️ Info: [List of informational issues]
```

#### Next Steps
```
🎯 Immediate: [Immediate action items]
📈 Short-term: [Short-term improvements]
🚀 Long-term: [Long-term strategy]
```

---

## 🔧 Railway CLI Commands Reference

### Project Management
```bash
railway login                    # Login to Railway
railway status                   # Show project status
railway link                     # Link to project
railway projects                 # List projects
```

### Environment Management
```bash
railway environment              # List environments
railway environment create <name>  # Create environment
railway environment use <name>  # Switch environment
```

### Service Management
```bash
railway up                       # Deploy services
railway up --service <name>     # Deploy specific service
railway restart --service <name> # Restart service
railway logs --service <name>   # View service logs
```

### Deployment Management
```bash
railway deployment list         # List deployments
railway rollback <deployment-id> # Rollback deployment
railway status --service <name>  # Check service status
```

### Variable Management
```bash
railway variables               # List variables
railway variables set <key>=<value>  # Set variable
railway variables delete <key>  # Delete variable
```

---

## 📚 Resources and References

### Documentation
- [Railway Documentation](https://docs.railway.app/)
- [Railway CLI Reference](https://docs.railway.app/reference/cli)
- [Deployment Guides](https://docs.railway.app/guides/deploying)

### Best Practices
- Use environment-specific configurations
- Implement proper health checks
- Monitor deployment logs
- Test thoroughly before production
- Use proper error handling

### Troubleshooting
- Check service logs for errors
- Verify environment variables
- Test health endpoints
- Monitor resource usage
- Check network connectivity

---

*Skill Version: 1.0*  
*Last Updated: 2026-03-10*  
*Next Review: 2026-03-17*