# 🎯 Test Coverage Improvement Plan

**Based on Audit Results**: 2026-03-10 20:38 NZDT  
**Current Status**: Frontend 84.21%, Backend 39%  
**Target**: Frontend 95%, Backend 85%

---

## 🚨 Phase 1: Critical Infrastructure Tests (Week 1)

### Backend Core Application Tests

#### 1. Main FastAPI Application (`main.py`)
```python
# tests/unit/test_main.py
def test_health_endpoint():
    """Test /health endpoint returns 200"""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

def test_cors_middleware():
    """Test CORS headers are present"""
    response = client.options("/api/jobs")
    assert "access-control-allow-origin" in response.headers
```

#### 2. Mailer Service Tests
```python
# tests/unit/test_mailer_complete.py
def test_send_job_notification():
    """Test job notification email sending"""
    with patch('services.mailer.smtplib.SMTP') as mock_smtp:
        send_job_notification(job_id=123, recipient="test@example.com")
        mock_smtp.assert_called_once()

def test_send_invoice_email():
    """Test invoice email generation and sending"""
    with patch('services.mailer.smtplib.SMTP') as mock_smtp:
        send_invoice_email(invoice_data, recipient="client@example.com")
        mock_smtp.assert_called_once()
```

#### 3. Math Utils Tests
```python
# tests/unit/test_math_utils_complete.py
def test_calculate_gst():
    """Test GST calculation accuracy"""
    amount = Decimal("100.00")
    gst_rate = Decimal("0.15")
    result = calculate_gst(amount, gst_rate)
    assert result == Decimal("15.00")

def test_calculate_total_with_markup():
    """Test total calculation with material markup"""
    base_price = Decimal("100.00")
    markup_rate = Decimal("0.20")
    result = calculate_total_with_markup(base_price, markup_rate)
    assert result == Decimal("120.00")
```

### Frontend Critical Component Tests

#### 1. AddressAutocomplete Tests
```tsx
// src/components/__tests__/AddressAutocomplete.test.tsx
describe("AddressAutocomplete", () => {
  it("filters out council/government components", () => {
    const addresses = [
      { label: "123 Queen Street, Auckland", components: [] },
      { label: "Auckland Council Building", components: [{ type: "government" }] }
    ];
    // Test filtering logic
  });

  it("prioritizes suburb > neighbourhood > city_district", () => {
    // Test address formatting priority
  });
});
```

#### 2. JobsList Tests
```tsx
// src/components/__tests__/JobsList.test.tsx
describe("JobsList", () => {
  it("displays jobs with correct status badges", () => {
    const jobs = [
      { id: "1", status: "DONE", client_name: "Test Client" },
      { id: "2", status: "SYNCING", client_name: "Another Client" }
    ];
    // Test status badge rendering
  });

  it("handles job deletion correctly", () => {
    // Test delete functionality
  });
});
```

---

## 🔧 Phase 2: Service Layer Tests (Week 2)

### Backend Service Improvements

#### 1. Translation Service Tests
```python
# tests/unit/test_translator_complete.py
def test_translate_material_code():
    """Test material code translation"""
    result = translate_material_code("RCD")
    assert result == "Residual Current Device"

def test_translate_safety_test_result():
    """Test safety test result translation"""
    result = translate_safety_test_result("PASS")
    assert result == "Passed"
```

#### 2. Router Tests
```python
# tests/unit/test_routers.py
def test_eta_calculation_endpoint():
    """Test ETA calculation API"""
    response = client.post("/api/eta", json={
        "current_location": {"lat": -36.85, "lng": 174.76},
        "job_location": {"lat": -36.86, "lng": 174.77}
    })
    assert response.status_code == 200
    assert "eta_minutes" in response.json()

def test_twilio_webhook_validation():
    """Test Twilio webhook signature validation"""
    # Test webhook security
```

### Frontend Page Tests

#### 1. Dashboard Page Tests
```tsx
// src/app/dashboard/__tests__/page.test.tsx
describe("Dashboard Page", () => {
  it("displays pulse data correctly", () => {
    // Test dashboard metrics display
  });

  it("shows install prompt when available", () => {
    // Test PWA install prompt
  });

  it("handles session expiration", () => {
    // Test session expiry handling
  });
});
```

#### 2. Jobs Page Tests
```tsx
// src/app/jobs/__tests__/page.test.tsx
describe("Jobs Page", () => {
  it("displays jobs list with filtering", () => {
    // Test job filtering and display
  });

  it("handles job creation flow", () => {
    // Test new job creation
  });
});
```

---

## 📊 Phase 3: Comprehensive Coverage (Week 3-4)

### Authentication System Tests
```python
# tests/integration/test_auth_complete.py
def test_user_registration_flow():
    """Test complete user registration"""
    # Test signup, email verification, login

def test_session_management():
    """Test session creation and expiry"""
    # Test JWT token handling

def test_role_based_access():
    """Test OWNER vs FIELD role permissions"""
    # Test role-based UI rendering
```

### Component Library Tests
```tsx
// src/components/__tests__/TrackingMap.test.tsx
describe("TrackingMap", () => {
  it("displays staff locations correctly", () => {
    // Test map rendering with staff data
  });

  it("handles location updates", () => {
    // Test real-time location updates
  });
});
```

### Error Handling Tests
```python
# tests/unit/test_error_handling.py
def test_api_error_responses():
    """Test API error handling"""
    # Test 400, 401, 403, 500 responses

def test_database_connection_failure():
    """Test database connection failure handling"""
    # Test graceful degradation
```

---

## 🎯 Coverage Targets by Week

### Week 1 Targets
- **Frontend**: 84.21% → 90% (+5.79%)
- **Backend**: 39% → 60% (+21%)
- **Focus**: Core infrastructure tests

### Week 2 Targets  
- **Frontend**: 90% → 95% (+5%)
- **Backend**: 60% → 80% (+20%)
- **Focus**: Service layer and page tests

### Week 3-4 Targets
- **Frontend**: 95% → 95% (maintain)
- **Backend**: 80% → 85% (+5%)
- **Focus**: Edge cases and integration

---

## 🔄 Test Strategy

### 1. Test Types Distribution
```
Unit Tests:         70% (Fast, isolated)
Integration Tests: 20% (API and database)
E2E Tests:          10% (Critical user journeys)
```

### 2. Mock Strategy
- **External APIs**: Always mocked (OpenAI, Twilio, Supabase)
- **Database**: Use test database with transactions
- **File System**: Use temporary files for PDF tests

### 3. Test Data Management
- **Fixtures**: Use pytest fixtures for consistent test data
- **Factories**: Use factory pattern for complex objects
- **Cleanup**: Ensure test isolation with proper cleanup

---

## 📈 Quality Gates Implementation

### Automated Checks
```yaml
# .github/workflows/test-coverage.yml
name: Test Coverage Check
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Frontend Tests
        run: |
          cd frontend
          npm test -- --coverage --coverageReporters=json
          # Check coverage thresholds
      - name: Backend Tests  
        run: |
          cd backend
          pytest --cov=. --cov-fail-under=85
```

### Coverage Thresholds
```javascript
// frontend/jest.config.js
module.exports = {
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 95,
      functions: 95,
      lines: 95
    }
  }
};
```

---

## 🚀 Implementation Checklist

### Week 1 Tasks
- [ ] Add main.py health endpoint tests
- [ ] Add mailer service tests
- [ ] Add math utils tests  
- [ ] Add AddressAutocomplete component tests
- [ ] Add JobsList component tests
- [ ] Verify coverage targets met

### Week 2 Tasks
- [ ] Add translation service tests
- [ ] Add router tests (ETA, Twilio)
- [ ] Add dashboard page tests
- [ ] Add jobs page tests
- [ ] Add profile page tests
- [ ] Verify coverage targets met

### Week 3-4 Tasks
- [ ] Add authentication system tests
- [ ] Add remaining component tests
- [ ] Add error handling tests
- [ ] Add performance tests
- [ ] Add security tests
- [ ] Verify final coverage targets

---

## 📊 Success Metrics

### Coverage Metrics
- Frontend statements: 95% ✅
- Frontend branches: 95% ✅  
- Frontend functions: 95% ✅
- Backend statements: 85% ✅
- Backend branches: 85% ✅
- Backend functions: 85% ✅

### Quality Metrics
- All tests pass in CI/CD ✅
- No critical production bugs ✅
- Performance benchmarks met ✅
- Security scans pass ✅

### Business Metrics
- Reduced production defects by 50% ✅
- Faster deployment confidence ✅
- Better code maintainability ✅

---

## 🔄 Continuous Improvement

### Maintenance Strategy
1. **New Features**: Require tests before merge
2. **Bug Fixes**: Add regression tests
3. **Refactoring**: Maintain coverage
4. **Dependencies**: Update test mocks

### Monitoring
1. **Coverage Trends**: Track coverage over time
2. **Test Performance**: Monitor test execution time
3. **Flaky Tests**: Identify and fix unreliable tests
4. **Coverage Decay**: Prevent coverage regression

---

**Priority**: 🔴 **CRITICAL** - Execute immediately

**Timeline**: 3-4 weeks for full compliance

**Success Criteria**: Meet all quality gates and coverage thresholds
