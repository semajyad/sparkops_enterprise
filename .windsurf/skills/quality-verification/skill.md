# ✅ Quality Verification Skill

**Purpose**: Complete Definition of Done verification for all development work  
**Trigger**: Before merge, before deployment, or when quality verification is needed  
**Scope**: Comprehensive quality gates validation and compliance checking

---

## 🎯 Skill Activation

### Automatic Triggers
- Pull request creation
- Deployment to staging
- Release preparation
- Code review request

### Manual Invocation
```bash
# Use the skill when you need:
@skill quality-verification
- Verify Definition of Done compliance
- Check all quality gates
- Validate test coverage
- Ensure deployment readiness
```

---

## 📋 Definition of Done Checklist

### ✅ Code Quality (MANDATORY)
- [ ] **Code Review**: Peer review completed and approved
- [ ] **Linting**: No linting errors or warnings
- [ ] **Type Safety**: TypeScript compilation without errors
- [ ] **Code Style**: Consistent formatting and naming
- [ ] **Documentation**: Code comments and API docs updated

### ✅ Testing Requirements (MANDATORY)
- [ ] **Unit Tests**: All new code has unit tests
- [ ] **Coverage Thresholds**: Backend >85%, Frontend >90%
- [ ] **Integration Tests**: API endpoints tested
- [ ] **E2E Tests**: Critical user journeys verified
- [ ] **Test Quality**: No flaky or unreliable tests

### ✅ Security & Compliance (MANDATORY)
- [ ] **Security Scan**: No vulnerabilities detected
- [ ] **API Security**: Authentication and authorization verified
- [ ] **Data Privacy**: PII properly handled and protected
- [ ] **Compliance**: AS/NZS 3000 requirements met
- [ ] **Environment Variables**: No secrets in code

### ✅ Performance & Reliability (MANDATORY)
- [ ] **Performance Tests**: Response times within limits
- [ ] **Load Testing**: Handles expected user load
- [ ] **Error Handling**: Graceful error handling implemented
- [ ] **Monitoring**: Logging and metrics configured
- [ ] **Offline Support**: Offline functionality verified

---

## 🔍 Verification Process

### Phase 1: Automated Checks
```bash
# Step 1: Code Quality Checks
cd frontend && npm run lint
cd backend && python -m flake8 services/

# Step 2: Type Safety
cd frontend && npm run type-check
cd backend && mypy services/

# Step 3: Test Coverage
cd backend && pytest --cov=. --cov-fail-under=85
cd frontend && npm test -- --coverage --coverageReporters=json

# Step 4: Security Scans
npm audit
safety check
```

### Phase 2: Manual Verification
```bash
# Step 5: Code Review
# - Review business logic implementation
# - Verify error handling
# - Check performance considerations
# - Validate security practices

# Step 6: Integration Testing
# - Test API contracts
# - Verify database operations
# - Check external service integrations
# - Validate data flow integrity
```

### Phase 3: End-to-End Validation
```bash
# Step 7: E2E Testing
cd frontend && npx playwright test

# Step 8: Staging Deployment
# - Deploy to staging environment
# - Run smoke tests
# - Verify functionality
# - Check performance metrics
```

---

## 📊 Quality Metrics Dashboard

### Coverage Metrics
| Component | Target | Current | Status | Trend |
|-----------|--------|---------|--------|-------|
| Backend Overall | >85% | 39% | 🔴 Critical | 📉 Down |
| Triage Service | >90% | 75% | 🟡 Warning | 📈 Up |
| Vision Service | >90% | 86% | 🟡 Warning | 📈 Up |
| PDF Service | >90% | 90% | ✅ Good | ➡️ Stable |
| Frontend Overall | >90% | 84.21% | 🔴 Critical | 📈 Up |
| API Client | >95% | 77.27% | 🔴 Critical | 📈 Up |
| Sync Manager | >95% | 100% | ✅ Excellent | ➡️ Stable |
| Jobs Utils | >95% | 84.21% | 🔴 Critical | 📈 Up |

### Test Health Metrics
| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Test Execution Time | <5 min | 2.3 min | ✅ Good |
| Test Reliability | >95% | 100% | ✅ Excellent |
| Flaky Test Rate | <5% | 0% | ✅ Excellent |
| Test Coverage | >85% | 61% | 🔴 Critical |

### Performance Metrics
| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| API Response Time | <500ms | 320ms | ✅ Good |
| Frontend Load Time | <3s | 2.1s | ✅ Good |
| Database Query Time | <100ms | 67ms | ✅ Good |
| Memory Usage | <512MB | 384MB | ✅ Good |

---

## 🚨 Quality Gates Enforcement

### Blocking Issues (Cannot Proceed)
1. **Coverage Below Threshold**: Backend <85%, Frontend <90%
2. **Security Vulnerabilities**: High or critical severity
3. **Test Failures**: Any failing test in the suite
4. **Performance Regression**: >20% performance degradation
5. **Compliance Violations**: AS/NZS 3000 non-compliance

### Warning Issues (Can Proceed with Acknowledgment)
1. **Code Style Issues**: Minor formatting inconsistencies
2. **Documentation Gaps**: Missing or outdated documentation
3. **Test Coverage Gaps**: Specific components below target
4. **Performance Warning**: Response times approaching limits

### Informational Issues (Note Only)
1. **Code Complexity**: High cyclomatic complexity
2. **Technical Debt**: Areas needing refactoring
3. **Duplicate Code**: Code duplication opportunities
4. **Best Practices**: Improvement suggestions

---

## 🔧 Quality Improvement Recommendations

### Immediate Actions (This Sprint)
1. **Frontend Coverage Improvement**
   - Add tests for `api.ts` error handling
   - Improve `jobs.ts` branch coverage
   - Add component tests for critical UI elements

2. **Backend Service Testing**
   - Complete `triage.py` test coverage
   - Add integration tests for API endpoints
   - Implement error handling tests

3. **E2E Test Enhancement**
   - Add admin workflow tests
   - Implement offline resilience tests
   - Add performance benchmark tests

### Short-term Improvements (Next Sprint)
1. **Test Infrastructure**
   - Set up local test environment
   - Implement test data factories
   - Add automated test reporting

2. **Code Quality Tools**
   - Configure SonarQube for code quality
   - Add automated security scanning
   - Implement code complexity monitoring

3. **Performance Monitoring**
   - Add application performance monitoring
   - Implement database query optimization
   - Set up load testing framework

### Long-term Strategy (Next Quarter)
1. **Quality Culture**
   - Establish coding standards
   - Implement peer review process
   - Create quality training program

2. **Automation Enhancement**
   - Implement continuous quality monitoring
   - Add automated regression testing
   - Create quality dashboards

3. **Process Optimization**
   - Optimize CI/CD pipeline performance
   - Implement shift-left testing
   - Create quality gate automation

---

## 📋 Verification Report Template

### Quality Verification Report
**Date**: [Current Date]  
**Project**: SparkOps Enterprise  
**Branch**: [Branch Name]  
**Commit**: [Commit Hash]

#### Summary
- **Overall Status**: [✅ Pass/🟡 Warning/🔴 Fail]
- **Coverage**: [Backend/Frontend percentages]
- **Test Results**: [Pass/Fail counts]
- **Security**: [Scan results]
- **Performance**: [Benchmark results]

#### Detailed Results
```
✅ Code Quality: [Details]
✅ Testing: [Details]  
✅ Security: [Details]
✅ Performance: [Details]
✅ Compliance: [Details]
```

#### Issues Found
```
🔴 Critical: [List of critical issues]
🟡 Warning: [List of warning issues]
ℹ️ Info: [List of informational issues]
```

#### Recommendations
```
🎯 Immediate: [Immediate action items]
📈 Short-term: [Short-term improvements]
🚀 Long-term: [Long-term strategy]
```

#### Approval
- [ ] **Developer**: Code ready for review
- [ ] **Reviewer**: Code review approved
- [ ] **QA**: Quality gates passed
- [ ] **Lead**: Approved for merge/deployment

---

## 🔍 Common Quality Issues

### Code Quality Issues
1. **Missing Error Handling**: Functions don't handle edge cases
2. **Inconsistent Naming**: Variable/function naming not following conventions
3. **Code Duplication**: Same logic repeated in multiple places
4. **Complex Functions**: Functions doing too many things
5. **Missing Documentation**: No comments or API documentation

### Testing Issues
1. **Insufficient Coverage**: Critical code paths not tested
2. **Brittle Tests**: Tests dependent on implementation details
3. **Missing Edge Cases**: Tests don't cover error conditions
4. **Test Dependencies**: Tests depending on each other
5. **Slow Tests**: Tests taking too long to execute

### Security Issues
1. **Hardcoded Secrets**: API keys or passwords in code
2. **Input Validation**: Missing input sanitization
3. **Authentication Gaps**: Insufficient access controls
4. **Data Exposure**: Sensitive data in logs or responses
5. **Dependency Vulnerabilities**: Outdated or vulnerable packages

---

## 📚 Quality Standards Reference

### Code Quality Standards
- **Python**: PEP 8, Black formatter, mypy type checking
- **TypeScript**: ESLint, Prettier, strict type checking
- **React**: Component testing, accessibility standards
- **API**: OpenAPI specification, REST conventions

### Testing Standards
- **Unit Tests**: pytest (Python), Jest (TypeScript)
- **Integration Tests**: API contract testing, database testing
- **E2E Tests**: Playwright, real browser automation
- **Performance Tests**: Load testing, benchmarking

### Security Standards
- **OWASP Top 10**: Web application security risks
- **AS/NZS 3000**: Electrical safety compliance
- **Data Privacy**: PII protection and GDPR compliance
- **Infrastructure**: Security scanning and monitoring

---

*Skill Version: 1.0*  
*Last Updated: 2026-03-10*  
*Next Review: 2026-03-17*