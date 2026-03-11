---
description: Frontend Testing Enforcement Rule
---

# Frontend Testing Enforcement Rule

This rule ensures that any changes to frontend code automatically trigger comprehensive testing to prevent regressions.

## Rule Activation

This rule is automatically triggered when ANY frontend files are modified:
- React components (`*.tsx`, `*.jsx`)
- Frontend utilities (`*.ts`, `*.js` in `frontend/src/`)
- Styles (`*.css`, `*.scss`, `*.module.css`)
- E2E test files (`*.spec.ts` in `frontend/tests/`)
- Frontend configuration files

## Required Testing Workflow

When frontend changes are detected, this rule enforces the following testing sequence:

### Phase 1: Pre-Testing Setup
1. **Create Auto-Confirmed Test User**
   - Use the backend API: `POST /api/test/create-user`
   - Generate unique credentials for test isolation
   - Verify user creation success

### Phase 2: Core Authentication Tests
2. **Run Signup/Login E2E Tests**
   - Execute: `npx playwright test frontend/tests/e2e/signup-e2e.spec.ts --timeout=60000`
   - Verify user registration flow works
   - Confirm login functionality
   - Test session persistence

### Phase 3: Frontend Regression Suite
3. **Run Frontend Regression Tests**
   - Execute all E2E tests: `npx playwright test frontend/tests/e2e/ --timeout=60000`
   - Include component tests if available
   - Verify UI functionality across all major features

### Non-Interactive Command Requirements
4. **All test commands must be non-interactive**
   - Use `--timeout=60000` to prevent hanging
   - Use `--reporter=json` for automated parsing
   - Use `--max-failures=5` to limit failure impact
   - Never use commands that wait for user input

### Phase 4: Test Results Analysis
5. **Analyze Test Results**
   - Check for any failing tests
   - Identify regression issues
   - Document any new bugs discovered

### Phase 5: Issue Resolution
6. **Fix Any Breaking Tests**
   - Address test failures immediately
   - Update test expectations if behavior changes are intentional
   - Ensure all tests pass before allowing completion

### Phase 6: Cleanup
7. **Clean Up Test Data**
   - Use backend API: `POST /api/test/cleanup-user`
   - Remove test users created during testing
   - Verify cleanup success

## Automatic Skill Invocation

This rule automatically invokes the following skills in sequence:

1. **@e2e-testing** - Handles E2E test execution and environment setup
2. **@quality-verification** - Ensures code quality and test coverage
3. **@workflow-monitor** - Monitors testing progress and reports issues

## Error Handling

### Test Failure Scenarios
- **Authentication Tests Fail**: Block completion, require immediate fix
- **Regression Tests Fail**: Identify affected components, require fixes
- **Environment Issues**: Auto-heal using @self-healing skill
- **Test User Creation Fail**: Retry with new credentials, fallback to env vars

### Recovery Procedures
1. **Automatic Retry**: Up to 3 attempts for transient failures
2. **Environment Reset**: Clean test environment between runs
3. **Fallback Testing**: Use environment variables if auto-confirmed user creation fails
4. **Escalation**: Alert user if issues cannot be resolved automatically

## Quality Gates

### Must Pass Before Completion
- ✅ All signup/login E2E tests pass
- ✅ Frontend regression suite passes (100% pass rate)
- ✅ No new test failures introduced
- ✅ Test users properly created and cleaned up
- ✅ No authentication regressions

### Blocking Conditions
- ❌ Any authentication test failure
- ❌ Frontend regression test failures
- ❌ Test environment setup failures
- ❌ Incomplete test cleanup

## Integration with Existing Systems

### Auto-Confirmed User System
- Leverages the existing backend API for test user management
- Uses the Supabase service role key for admin operations
- Ensures test isolation with unique user credentials

### Security Compliance
- All test operations use secure, isolated test users
- No production data affected by testing
- Proper cleanup prevents test data accumulation

### Performance Optimization
- Parallel test execution where possible
- Efficient test user management
- Minimal environment setup overhead

## Reporting and Documentation

### Automatic Documentation
- Test results automatically documented
- Any issues discovered are recorded with solutions
- Performance metrics captured for optimization

### User Notifications
- Real-time progress updates during testing
- Clear indication of any blocking issues
- Summary report on test completion

## Enforcement Mechanism

This rule uses Windsurf's automatic skill invocation to:
1. Detect frontend file changes automatically
2. Trigger the complete testing workflow
3. Monitor progress and handle failures
4. Ensure completion only when all quality gates pass

The rule integrates with the existing memory system to:
- Learn from test patterns and optimize future runs
- Store successful test configurations
- Track and prevent recurring issues

---

**This rule ensures that frontend changes never compromise application stability or user experience through comprehensive, automated testing enforcement.**
