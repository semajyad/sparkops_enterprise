# 🧪 Testing Requirements (MANDATORY)

> **Purpose**: Define comprehensive testing strategy for SparkOps Enterprise  
> **Scope**: All code changes, new features, and infrastructure updates  
> **Enforcement**: Automated checks + manual verification

---

## 🎯 Testing Philosophy

### Voice-to-Cash Business Criticality
- **Financial Impact**: Every bug affects customer revenue
- **Compliance Risk**: AS/NZS 3000 electrical safety requirements
- **User Trust**: Field technicians depend on reliable tools
- **Data Integrity**: Job and financial data must be accurate

### Testing Pyramid
```
E2E Tests (10%)     - Critical user journeys
Integration (20%)  - API contracts, database
Unit Tests (70%)    - Business logic, utilities
```

---

## 📊 Backend Testing Requirements

### Unit Tests (MANDATORY)

#### Coverage Requirements
- **Overall**: >85% statements, branches, functions, lines
- **Critical Services**: >90% coverage
- **New Code**: >80% coverage before merge

#### Critical Service Tests
```python
# services/triage.py - Voice Processing
def test_voice_to_job_extraction():
    """Test complete voice-to-job conversion"""
    
def test_material_classification():
    """Test material vs labor classification"""
    
def test_urgency_scoring():
    """Test job urgency calculation"""
    
def test_safety_test_extraction():
    """Test AS/NZS 3000 compliance extraction"""

# services/vision.py - Receipt OCR  
def test_receipt_image_processing():
    """Test receipt OCR processing"""
    
def test_line_item_extraction():
    """Test individual line item extraction"""
    
def test_supplier_identification():
    """Test supplier name extraction"""
    
def test_price_normalization():
    """Test price and tax calculation"""
    
# services/pdf.py - Certificate Generation
def test_certificate_generation():
    """Test electrical safety certificate creation"""
    
def test_compliance_fields():
    """Test required compliance field inclusion"""
    
def test_digital_signature():
    """Test digital signature application"""
    
# services/sync.py - Data Synchronization
def test_offline_to_online_sync():
    """Test data sync when connection restored"""
    
def test_conflict_resolution():
    """Test sync conflict handling"""
    
def test_incremental_sync():
    """Test incremental data sync"""
```

#### Test Structure
```
backend/tests/
├── conftest.py              # pytest configuration
├── unit/                   # Isolated unit tests
│   ├── test_math_utils.py  # Financial calculations
│   ├── test_invoice.py     # Invoice generation
│   ├── test_translator.py  # Code translation
│   ├── test_mailer.py      # Email notifications
│   ├── test_triage.py      # Voice processing
│   ├── test_vision.py      # Receipt OCR
│   ├── test_pdf.py         # Certificate generation
│   └── test_sync.py        # Data synchronization
├── integration/            # API integration tests
│   ├── test_auth_flow.py   # Authentication
│   ├── test_jobs_api.py    # Job management
│   ├── test_admin_api.py   # Admin endpoints
│   └── test_materials_api.py # Materials management
├── fixtures/              # Test data
│   ├── sample_jobs.json
│   ├── sample_invoices.json
│   └── test_certificates.pdf
└── helpers/               # Test utilities
    ├── mock_services.py
    └── test_utils.py
```

### Integration Tests (MANDATORY)

#### API Contract Testing
```python
# Test all REST endpoints
def test_job_crud_operations():
    """Test job creation, read, update, delete"""
    
def test_material_management():
    """Test material catalog operations"""
    
def test_user_management():
    """Test user registration and authentication"""
    
def test_admin_endpoints():
    """Test admin-only endpoints with proper authorization"""
```

#### Database Testing
```python
# Test database operations
def test_database_transactions():
    """Test transaction rollback on errors"""
    
def test_data_consistency():
    """Test referential integrity constraints"""
    
def test_performance_queries():
    """Test query performance under load"""
```

---

## 🎨 Frontend Testing Requirements

### Unit Tests (MANDATORY)

#### Coverage Requirements
- **Overall**: >90% statements, branches, functions, lines
- **Critical Utilities**: >95% coverage
- **Components**: >85% coverage

#### Critical Utility Tests
```typescript
// src/lib/api.ts - API Client
describe('API Client', () => {
  it('handles network errors gracefully')
  it('retries failed requests')
  it('manages authentication tokens')
  it('validates response data')
  it('times out appropriately')
});

// src/lib/syncManager.ts - Sync Logic
describe('Sync Manager', () => {
  it('queues offline changes')
  it('syncs when online')
  it('resolves conflicts')
  it('handles partial failures')
  it('maintains data integrity')
});

// src/lib/jobs.ts - Job Utilities
describe('Job Utilities', () => {
  it('calculates job totals correctly')
  it('validates job data')
  it('formats job displays')
  it('filters job lists')
  it('sorts job priorities');
});
```

#### Component Tests
```typescript
// src/components/__tests__/AddressAutocomplete.test.tsx
describe('AddressAutocomplete', () => {
  it('filters council/government components')
  it('prioritizes suburb > neighbourhood > city')
  it('handles NZ address formats')
  it('validates address selection')
  it('manages loading states')
});

// src/components/__tests__/JobsList.test.tsx
describe('JobsList', () => {
  it('displays jobs with status badges')
  it('handles job deletion')
  it('filters job lists')
  it('sorts by priority')
  it('shows loading states');
});

// src/components/__tests__/TrackingMap.test.tsx
describe('TrackingMap', () => {
  it('displays staff locations')
  it('handles real-time updates')
  it('manages map interactions')
  it('shows job routes')
  it('handles GPS errors');
});
```

#### Page Tests
```typescript
// src/app/capture/__tests__/page.test.tsx
describe('Capture Page', () => {
  it('records voice audio')
  it('captures photos')
  it('submits jobs')
  it('validates forms')
  it('works offline')
});

// src/app/dashboard/__tests__/page.test.tsx
describe('Dashboard Page', () => {
  it('displays job metrics')
  it('shows team status')
  it('handles navigation')
  it('displays install prompt')
  it('manages session expiry');
});

// src/app/admin/__tests__/page.test.tsx
describe('Admin Page', () => {
  it('manages settings')
  it('handles fleet management')
  it('generates reports')
  it('validates permissions')
  it('handles bulk operations');
});
```

### E2E Tests (MANDATORY)

#### Critical User Journeys
```typescript
// tests/e2e/golden-path.spec.ts
test('voice-to-cash complete workflow', async ({ page }) => {
  // 1. Login as field technician
  // 2. Start new job
  // 3. Record voice description
  // 4. Capture receipt photo
  // 5. Submit job
  // 6. Verify sync to backend
  // 7. Check job appears in dashboard
});

// tests/e2e/offline-resilience.spec.ts
test('offline save and sync', async ({ page }) => {
  // 1. Go offline
  // 2. Create new job
  // 3. Save locally
  // 4. Go online
  // 5. Verify automatic sync
  // 6. Check data integrity
});

// tests/e2e/admin-workflow.spec.ts
test('admin management workflow', async ({ page }) => {
  // 1. Login as admin
  // 2. Configure settings
  // 3. Manage team members
  // 4. Update fleet
  // 5. Generate reports
  // 6. Verify changes applied
});
```

---

## 🔧 Test Infrastructure Requirements

### Test Environment Setup
```yaml
# docker-compose.test.yml
version: '3.8'
services:
  test-db:
    image: postgres:15
    environment:
      POSTGRES_DB: sparkops_test
      POSTGRES_USER: test_user
      POSTGRES_PASSWORD: test_pass
    ports:
      - "5433:5432"
  
  mock-apis:
    build: ./tests/mocks
    ports:
      - "3001:3001"
    environment:
      - MOCK_OPENAI=true
      - MOCK_XERO=true
      - MOCK_TWILIO=true
```

### Mock Services Configuration
```python
# tests/conftest.py
@pytest.fixture
def mock_openai():
    with patch('services.triage.openai_client') as mock:
        mock.audio.transcriptions.create.return_value = {
            "text": "Replace RCD at customer premises"
        }
        yield mock

@pytest.fixture
def mock_supabase():
    with patch('services.db.supabase_client') as mock:
        mock.table.return_value.insert.return_value.execute.return_value = {
            "data": [{"id": "test-id"}], "error": None
        }
        yield mock
```

### Test Data Management
```python
# tests/fixtures/job_data.py
def create_test_job():
    return {
        "id": "test-job-123",
        "client_name": "Test Customer",
        "description": "Replace RCD",
        "materials": [{"code": "RCD", "quantity": 1}],
        "labor_hours": 2,
        "status": "DRAFT"
    }

def create_test_invoice():
    return {
        "job_id": "test-job-123",
        "items": [
            {"description": "RCD Device", "quantity": 1, "unit_price": 150.00},
            {"description": "Labor", "hours": 2, "rate": 85.00}
        ],
        "gst_rate": 0.15
    }
```

---

## 📈 Test Execution Requirements

### Local Development
```bash
# Backend tests
cd backend
python -m pytest tests/ --cov=. --cov-fail-under=85

# Frontend tests  
cd frontend
npm test -- --coverage --coverageReporters=json

# E2E tests
cd frontend
npx playwright test
```

### CI/CD Pipeline
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Backend Tests
        run: |
          cd backend
          pytest --cov=. --cov-fail-under=85 --junitxml=results.xml
  
  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Frontend Tests
        run: |
          cd frontend
          npm test -- --coverage --coverageReporters=json
  
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run E2E Tests
        run: |
          cd frontend
          npx playwright test
```

---

## 🚫 Test Anti-Patterns (AVOID)

### Common Mistakes
1. **Testing Implementation Details**: Test behavior, not code structure
2. **Brittle Tests**: Avoid depending on exact DOM structure
3. **Missing Cleanup**: Always clean up test data and side effects
4. **Real External Calls**: Never call real APIs in unit tests
5. **Test Coupling**: Tests should not depend on each other

### Performance Issues
1. **Slow Tests**: Keep unit tests <100ms each
2. **Database Pollution**: Use transactions and rollback
3. **Memory Leaks**: Clean up resources in teardown
4. **Parallel Test Conflicts**: Isolate test data

---

## 📋 Test Checklist

### Before Commit
- [ ] All unit tests pass
- [ ] Coverage thresholds met
- [ ] No external API calls in tests
- [ ] Tests run in <2 minutes
- [ ] New features have tests

### Before Merge
- [ ] Integration tests pass
- [ ] API contracts verified
- [ ] Database tests pass
- [ ] Mock services configured
- [ ] Test data validated

### Before Deploy
- [ ] E2E tests pass on staging
- [ ] Performance tests pass
- [ ] Security tests pass
- [ ] Load tests pass
- [ ] Documentation updated

---

*Last Updated: 2026-03-10*  
*Next Review: 2026-03-17*