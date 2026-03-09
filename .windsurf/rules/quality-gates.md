# 🛡️ Quality Gates (MANDATORY)

> **Effective Date**: 2026-03-10  
> **Review Frequency**: Weekly  
> **Enforcement**: Strict - No exceptions without written approval
> **Status**: ACTIVELY ENFORCED via test-coverage-guardian skill

---

## 🚨 IMMEDIATE STOP WORK CONDITIONS

**STOP ALL DEVELOPMENT** if any of these occur:
1. Coverage drops below any minimum threshold
2. Unit tests make real external API calls
3. Any test suite exceeds timeout limits
4. E2E golden paths fail
5. Missing mocks for external dependencies

---

## 📊 Coverage Requirements (NON-NEGOTIABLE)

### Backend Services (MANDATORY)
- **Minimum Coverage**: **> 85%** statements, branches, functions, lines
- **Focus Areas**: Triage, Vision, PDF, Sync services
- **Critical Services**: 
  - `services/triage.py` - Voice processing (Target: 90%)
  - `services/vision.py` - Receipt OCR (Target: 90%)
  - `services/pdf.py` - Certificate generation (Target: 90%)
  - `services/sync.py` - Data synchronization (Target: 90%)

### Frontend Utilities (MANDATORY)
- **Minimum Coverage**: **> 90%** statements, branches, functions, lines
- **Focus Areas**: `api.ts`, `syncManager.ts`, `jobs.ts`
- **Critical Components**:
  - `src/lib/api.ts` - API client (Target: 95%)
  - `src/lib/syncManager.ts` - Sync logic (Target: 95%)
  - `src/lib/jobs.ts` - Job utilities (Target: 95%)

### New Features (MANDATORY)
- **No new feature** may be marked "Done" without accompanying unit tests
- **Minimum Feature Coverage**: 80% for new code
- **Integration Tests**: Required for all new API endpoints

---

## 🎯 E2E Golden Paths (MANDATORY)

### Critical User Journeys
1. **Login → Capture → Sync** - Core voice-to-cash workflow
2. **Offline Resilience** - Save offline, sync when online
3. **Admin Suite** - Settings, fleet management, reporting

### Test Requirements
- **Environment**: Staging environment with real data
- **Credentials**: Configured and validated
- **Performance**: Sub-100ms interaction response times
- **Coverage**: All critical user paths tested

---

## 🔄 Mock-First Law (ZERO TOLERANCE)

### External APIs (NEVER in Unit Tests)
- **OpenAI**: Voice processing, text analysis
- **Xero**: Accounting integration
- **Supabase**: Database operations
- **Google Maps**: Geocoding services
- **Twilio**: SMS notifications
- **SendGrid**: Email delivery

### Mock Strategy
```python
# Python - Use unittest.mock
@patch('services.triage.openai_client')
def test_voice_processing(mock_openai):
    mock_openai.audio.transcriptions.create.return_value = {"text": "test"}
    # Test implementation

# TypeScript - Use jest.spyOn
jest.spyOn(api, 'post').mockResolvedValue(mockResponse);
// Test implementation
```

---

## ⏱️ Hangman Protocol (MANDATORY)

### Timeout Rules
- **Unit Tests**: Kill if > 2 minutes
- **Integration Tests**: Kill if > 5 minutes  
- **E2E Tests**: Kill if > 10 minutes
- **Coverage Reports**: Kill if > 3 minutes

### Diagnosis Protocol
1. **Check HTTP clients** for missing timeouts
2. **Verify external API mocks** are properly configured
3. **Inspect database connections** for hanging transactions
4. **Review async operations** for proper cleanup

---

## 👻 Ghost Rule (Data Integrity)

### Deletion Logic (MANDATORY)
- **Optimistic UI**: Navigate immediately on delete action
- **Resilient Backend**: Swallow 404 errors gracefully
- **Cleanup Strategy**: Best-effort local + Supabase cleanup

### Navigation Logic (MANDATORY)
- **Explicit Routes**: No hidden "modes" behind toggles
- **Clear State**: User-visible mode indicators
- **Consistent URLs**: Bookmarkable and shareable states

---

## 🧪 Test Types Distribution

### Recommended Mix
```
Unit Tests:         70% (Fast, isolated logic)
Integration Tests: 20% (API contracts, database)
E2E Tests:         10% (Critical user journeys)
```

### Test Organization
```
backend/tests/
├── unit/           # Isolated business logic
├── integration/    # API contracts
├── functional/     # End-to-end scenarios
└── fixtures/       # Test data

frontend/src/
├── __tests__/      # Unit tests for utilities
├── components/__tests__/  # Component tests
├── app/**/__tests__/      # Page tests
└── tests/e2e/     # Playwright scenarios
```

---

## 📈 Quality Metrics

### Coverage Targets (CURRENT STATUS)
| Metric | Backend | Frontend | Status |
|--------|---------|----------|---------|
| Statements | >85% | >90% | ✅ ENFORCED |
| Branches | >85% | >90% | ✅ ENFORCED |
| Functions | >85% | >90% | ✅ ENFORCED |
| Lines | >85% | >90% | ✅ ENFORCED |

### Performance Targets
| Metric | Target | Measurement |
|--------|--------|-------------|
| Unit Test Suite | <2 minutes | pytest timer |
| Frontend Test Suite | <3 minutes | Jest timer |
| E2E Test Suite | <10 minutes | Playwright timer |
| API Response Time | <500ms | Server metrics |

---

## 🚫 Blocking Issues

### Critical Blockers
1. **Coverage Below Threshold**: Cannot merge PR
2. **E2E Tests Failing**: Cannot deploy to staging
3. **Missing Mocks**: Cannot merge unit tests
4. **Test Timeouts**: Must fix before proceeding

### Resolution Process
1. **STOP WORK**: Immediately halt development
2. **Identify Root Cause**: Use diagnostic tools
3. **Implement Fix**: Follow established patterns
4. **Verify Resolution**: Re-run full test suite
5. **Document Learning**: Add to agent-learnings.md

---

## 🔄 Continuous Improvement

### Weekly Review
- **Coverage Trends**: Track week-over-week changes
- **Test Performance**: Monitor execution times
- **Flaky Tests**: Identify and fix unreliable tests
- **Quality Metrics**: Ensure targets are met

### Monthly Review
- **Gate Effectiveness**: Are rules too strict/lenient?
- **Tool Updates**: Evaluate new testing tools
- **Process Improvements**: Optimize test workflows
- **Training Needs**: Address knowledge gaps

---

## 📋 Enforcement Checklist

### Before Merge
- [ ] Backend coverage >85% (Triage, Vision, PDF, Sync)
- [ ] Frontend coverage >90% (api.ts, syncManager.ts, jobs.ts)
- [ ] All unit tests pass (<2 minutes)
- [ ] Integration tests pass (<5 minutes)
- [ ] E2E golden paths pass (<10 minutes)
- [ ] No external API calls in unit tests
- [ ] All new features have tests

### Before Deployment
- [ ] Staging deployment successful
- [ ] E2E tests pass on staging
- [ ] Performance benchmarks met
- [ ] Security scans pass
- [ ] Documentation updated

### Before Release
- [ ] All quality gates passed
- [ ] Production deployment tested
- [ ] Rollback plan verified
- [ ] Monitoring configured
- [ ] Team notification sent

---

## 🛠️ AUTOMATED ENFORCEMENT

### Available Skills
- **@test-coverage-guardian**: Automated coverage monitoring and recovery
- **@quality-verification**: Comprehensive quality gate validation
- **@e2e-testing**: E2E golden path execution and verification

### Trigger Conditions
- File modifications in critical services
- Coverage drops below thresholds
- Test failures in CI/CD
- Performance regression detected

---

*Last Updated: 2026-03-10*  
*Next Review: 2026-03-17*  
*Enforcement: ACTIVE via test-coverage-guardian skill*