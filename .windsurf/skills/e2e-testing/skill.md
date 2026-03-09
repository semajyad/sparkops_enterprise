# 🎭 E2E Testing Skill

**Purpose**: End-to-end test setup, execution, and troubleshooting for SparkOps  
**Trigger**: When E2E testing is needed or staging deployment verification required  
**Scope**: Complete user journey testing with real browser automation

---

## 🎯 Skill Activation

### Automatic Triggers
- Staging deployment completed
- Pull request targeting main branch
- Release preparation requested
- Critical user journey changes

### Manual Invocation
```bash
# Use the skill when you need:
@skill e2e-testing
- Set up E2E test environment
- Execute critical user journeys
- Troubleshoot E2E test failures
- Verify staging deployment
```

---

## 🌐 E2E Test Environment Setup

### Prerequisites
```bash
# Install Playwright
cd frontend
npm install --save-dev @playwright/test
npx playwright install

# Configure test environment
cp .env.example .env.test
# Edit .env.test with staging credentials
```

### Environment Configuration
```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

### Test Data Setup
```typescript
// tests/e2e/fixtures/test-data.ts
export const testUsers = {
  fieldTechnician: {
    email: process.env.PLAYWRIGHT_TEST_EMAIL || 'test@example.com',
    password: process.env.PLAYWRIGHT_TEST_PASSWORD || 'test123',
    role: 'FIELD',
  },
  admin: {
    email: process.env.PLAYWRIGHT_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.PLAYWRIGHT_ADMIN_PASSWORD || 'admin123',
    role: 'OWNER',
  },
};

export const testJobs = {
  voiceJob: {
    description: 'Replace RCD at customer premises',
    clientName: 'Test Customer',
    materials: [{ code: 'RCD', quantity: 1 }],
    laborHours: 2,
  },
  receiptJob: {
    description: 'Install new lighting circuit',
    clientName: 'Another Customer',
    hasReceipt: true,
    materials: [{ code: 'LED_LIGHT', quantity: 5 }],
  },
};
```

---

## 🎯 Critical User Journey Tests

### Golden Path: Voice-to-Cash Workflow
```typescript
// tests/e2e/golden-path.spec.ts
import { test, expect } from '@playwright/test';
import { testUsers, testJobs } from '../fixtures/test-data';

test.describe('Voice-to-Cash Golden Path', () => {
  test('complete job creation and submission', async ({ page }) => {
    // 1. Login as field technician
    await page.goto('/login');
    await page.fill('[data-testid="email"]', testUsers.fieldTechnician.email);
    await page.fill('[data-testid="password"]', testUsers.fieldTechnician.password);
    await page.click('[data-testid="login-button"]');
    
    // Verify dashboard loaded
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
    
    // 2. Start new job
    await page.click('[data-testid="new-job-button"]');
    await expect(page.locator('[data-testid="job-form"]')).toBeVisible();
    
    // 3. Enter client information
    await page.fill('[data-testid="client-name"]', testJobs.voiceJob.clientName);
    
    // 4. Record voice description
    await page.click('[data-testid="voice-record-button"]');
    await page.waitForTimeout(2000); // Simulate recording
    await page.click('[data-testid="voice-stop-button"]');
    
    // Verify voice transcription
    await expect(page.locator('[data-testid="voice-transcription"]')).toContainText(
      testJobs.voiceJob.description
    );
    
    // 5. Add materials
    await page.click('[data-testid="add-material-button"]');
    await page.fill('[data-testid="material-code"]', testJobs.voiceJob.materials[0].code);
    await page.fill('[data-testid="material-quantity"]', testJobs.voiceJob.materials[0].quantity.toString());
    
    // 6. Set labor hours
    await page.fill('[data-testid="labor-hours"]', testJobs.voiceJob.laborHours.toString());
    
    // 7. Submit job
    await page.click('[data-testid="submit-job-button"]');
    
    // 8. Verify job saved and appears in dashboard
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await page.goto('/jobs');
    await expect(page.locator('[data-testid="job-list"]')).toContainText(testJobs.voiceJob.clientName);
    
    // 9. Verify job details
    await page.click(`[data-testid="job-${testJobs.voiceJob.clientName}"]`);
    await expect(page.locator('[data-testid="job-details"]')).toContainText(testJobs.voiceJob.description);
  });
});
```

### Offline Resilience Test
```typescript
// tests/e2e/offline-resilience.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Offline Resilience', () => {
  test('save job offline and sync when online', async ({ page, context }) => {
    // 1. Login and go to job creation
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'test@example.com');
    await page.fill('[data-testid="password"]', 'test123');
    await page.click('[data-testid="login-button"]');
    
    await page.click('[data-testid="new-job-button"]');
    
    // 2. Simulate offline mode
    await context.setOffline(true);
    await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
    
    // 3. Create job while offline
    await page.fill('[data-testid="client-name"]', 'Offline Customer');
    await page.fill('[data-testid="job-description"]', 'Test offline job');
    await page.click('[data-testid="save-job-button"]');
    
    // 4. Verify job saved locally
    await expect(page.locator('[data-testid="offline-saved-message"]')).toBeVisible();
    
    // 5. Go back online
    await context.setOffline(false);
    await expect(page.locator('[data-testid="online-indicator"]')).toBeVisible();
    
    // 6. Verify automatic sync
    await page.waitForTimeout(3000); // Wait for sync
    await expect(page.locator('[data-testid="sync-success-message"]')).toBeVisible();
    
    // 7. Verify job appears in job list
    await page.goto('/jobs');
    await expect(page.locator('[data-testid="job-list"]')).toContainText('Offline Customer');
  });
});
```

### Admin Workflow Test
```typescript
// tests/e2e/admin-workflow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Admin Workflow', () => {
  test('complete admin management tasks', async ({ page }) => {
    // 1. Login as admin
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'admin@example.com');
    await page.fill('[data-testid="password"]', 'admin123');
    await page.click('[data-testid="login-button"]');
    
    // 2. Navigate to admin suite
    await page.click('[data-testid="admin-tab"]');
    await expect(page.locator('[data-testid="admin-dashboard"]')).toBeVisible();
    
    // 3. Configure business settings
    await page.click('[data-testid="settings-tab"]');
    await page.fill('[data-testid="business-name"]', 'Test Electrical Co');
    await page.fill('[data-testid="gst-rate"]', '15');
    await page.click('[data-testid="save-settings"]');
    
    // 4. Manage team members
    await page.click('[data-testid="team-tab"]');
    await page.click('[data-testid="add-team-member"]');
    await page.fill('[data-testid="member-email"]', 'newtech@example.com');
    await page.selectOption('[data-testid="member-role"]', 'FIELD');
    await page.click('[data-testid="save-member"]');
    
    // 5. Manage fleet
    await page.click('[data-testid="fleet-tab"]');
    await page.click('[data-testid="add-vehicle"]');
    await page.fill('[data-testid="vehicle-plate"]', 'ABC123');
    await page.fill('[data-testid="vehicle-make"]', 'Toyota');
    await page.fill('[data-testid="vehicle-model"]', 'Hilux');
    await page.click('[data-testid="save-vehicle"]');
    
    // 6. Generate reports
    await page.click('[data-testid="reports-tab"]');
    await page.selectOption('[data-testid="report-period"]', 'this-month');
    await page.click('[data-testid="generate-report"]');
    
    // 7. Verify report generation
    await expect(page.locator('[data-testid="report-preview"]')).toBeVisible();
  });
});
```

---

## 🔧 Test Utilities and Helpers

### Custom Test Commands
```typescript
// tests/e2e/helpers/test-commands.ts
import { Page, expect } from '@playwright/test';

export class TestCommands {
  constructor(private page: Page) {}
  
  async login(email: string, password: string) {
    await this.page.goto('/login');
    await this.page.fill('[data-testid="email"]', email);
    await this.page.fill('[data-testid="password"]', password);
    await this.page.click('[data-testid="login-button"]');
    await this.page.waitForURL('/jobs');
  }
  
  async createJob(jobData: any) {
    await this.page.click('[data-testid="new-job-button"]');
    await this.page.fill('[data-testid="client-name"]', jobData.clientName);
    await this.page.fill('[data-testid="job-description"]', jobData.description);
    
    if (jobData.materials) {
      for (const material of jobData.materials) {
        await this.page.click('[data-testid="add-material-button"]');
        await this.page.fill('[data-testid="material-code"]', material.code);
        await this.page.fill('[data-testid="material-quantity"]', material.quantity.toString());
      }
    }
    
    await this.page.click('[data-testid="submit-job-button"]');
  }
  
  async verifyJobExists(clientName: string) {
    await this.page.goto('/jobs');
    await expect(this.page.locator('[data-testid="job-list"]')).toContainText(clientName);
  }
  
  async simulateOffline() {
    await this.page.context().setOffline(true);
    await expect(this.page.locator('[data-testid="offline-indicator"]')).toBeVisible();
  }
  
  async simulateOnline() {
    await this.page.context().setOffline(false);
    await expect(this.page.locator('[data-testid="online-indicator"]')).toBeVisible();
  }
}
```

### Test Data Factory
```typescript
// tests/e2e/helpers/data-factory.ts
export class DataFactory {
  static createTestJob(overrides: any = {}) {
    return {
      clientName: 'Test Customer',
      description: 'Test job description',
      materials: [{ code: 'RCD', quantity: 1 }],
      laborHours: 2,
      ...overrides,
    };
  }
  
  static createTestUser(overrides: any = {}) {
    return {
      email: 'test@example.com',
      password: 'test123',
      role: 'FIELD',
      ...overrides,
    };
  }
  
  static createTestInvoice(overrides: any = {}) {
    return {
      items: [
        { description: 'Labor', hours: 2, rate: 85 },
        { description: 'RCD Device', quantity: 1, unitPrice: 150 },
      ],
      gstRate: 0.15,
      ...overrides,
    };
  }
}
```

---

## 🚀 Test Execution Commands

### Local Development
```bash
# Run all E2E tests
cd frontend
npx playwright test

# Run specific test file
npx playwright test tests/e2e/golden-path.spec.ts

# Run with specific browser
npx playwright test --project=chromium

# Run in headed mode (visible browser)
npx playwright test --headed

# Run with debugging
npx playwright test --debug
```

### CI/CD Pipeline
```bash
# Run tests in CI
cd frontend
npx playwright test --reporter=junit --output-dir=test-results

# Run tests on staging
PLAYWRIGHT_BASE_URL=https://sparkops-staging.example.com \
npx playwright test
```

### Performance Testing
```bash
# Run with performance metrics
npx playwright test --reporter=html,html --output-dir=performance-report

# Run with tracing
npx playwright test --trace on
```

---

## 🔍 Troubleshooting Guide

### Common Issues and Solutions

#### Test Environment Issues
```bash
# Issue: Tests can't find elements
# Solution: Check data-testid attributes and wait for elements
await expect(page.locator('[data-testid="element"]')).toBeVisible({ timeout: 10000 });

# Issue: Tests fail randomly
# Solution: Add proper waits and retries
test.setTimeout(60000); // Increase timeout
await page.waitForLoadState('networkidle');
```

#### Authentication Issues
```bash
# Issue: Login fails in tests
# Solution: Use test credentials and handle auth properly
const testEmail = process.env.PLAYWRIGHT_TEST_EMAIL;
const testPassword = process.env.PLAYWRIGHT_TEST_PASSWORD;

# Issue: Session expires during tests
# Solution: Implement session refresh or re-login
await this.page.reload(); // Refresh to restore session
```

#### Network Issues
```bash
# Issue: Tests fail with network errors
# Solution: Handle network conditions gracefully
await page.context().setOffline(true); // Simulate offline
await page.context().setOffline(false); // Restore online

# Issue: API calls timeout
# Solution: Increase timeout or mock responses
await page.waitForResponse(response => response.url().includes('/api/jobs'), { timeout: 30000 });
```

#### Browser Compatibility Issues
```bash
# Issue: Tests fail on specific browsers
# Solution: Add browser-specific handling
if (browserName === 'webkit') {
  // Safari-specific handling
}

# Issue: Mobile viewport issues
# Solution: Configure mobile devices properly
use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }
```

### Debugging Techniques

#### Visual Debugging
```bash
# Take screenshots on failure
await page.screenshot({ path: 'failure-screenshot.png' });

# Record video of test execution
# Configure in playwright.config.ts:
video: 'retain-on-failure',

# Use trace viewer
npx playwright show-trace trace.zip
```

#### Console Debugging
```bash
# Listen for console events
page.on('console', msg => {
  console.log('PAGE LOG:', msg.text());
});

# Check network requests
page.on('request', request => {
  console.log('REQUEST:', request.url());
});
```

#### Step-by-Step Debugging
```bash
# Use debugger breakpoints
await page.pause(); // Pause execution
await page.debug(); // Debug mode

# Use console.log in tests
console.log('Current URL:', page.url());
console.log('Element text:', await element.textContent());
```

---

## 📊 Test Reports and Metrics

### HTML Report
```bash
# Generate detailed HTML report
npx playwright test --reporter=html

# View report
npx playwright show-report
```

### JUnit Report
```bash
# Generate JUnit XML for CI/CD
npx playwright test --reporter=junit --outputDir=test-results
```

### Performance Metrics
```typescript
// Measure page load time
const startTime = Date.now();
await page.goto('/dashboard');
const loadTime = Date.now() - startTime;
console.log(`Page load time: ${loadTime}ms`);

// Measure API response time
const response = await page.waitForResponse('/api/jobs');
const responseTime = response.headers()['x-response-time'];
```

### Coverage Integration
```bash
# Collect coverage during E2E tests
npx playwright test --coverage

# Generate coverage report
npx nyc report --reporter=html
```

---

## 📋 E2E Test Checklist

### Before Test Execution
- [ ] Test environment configured
- [ ] Test data prepared
- [ ] Browser dependencies installed
- [ ] Credentials configured
- [ ] Test server running

### During Test Development
- [ ] Use data-testid attributes
- [ ] Add proper waits and timeouts
- [ ] Handle async operations
- [ ] Test error conditions
- [ ] Verify accessibility

### After Test Execution
- [ ] Review test results
- [ ] Check coverage reports
- [ ] Analyze performance metrics
- [ ] Update documentation
- [ ] Fix flaky tests

---

## 🚀 Best Practices

### Test Design
1. **User-Centric**: Test from user perspective
2. **Independent**: Tests should not depend on each other
3. **Deterministic**: Same results every time
4. **Maintainable**: Clear and readable test code
5. **Comprehensive**: Cover critical user journeys

### Test Implementation
1. **Use Data Test IDs**: Stable selectors for tests
2. **Add Waits**: Handle timing and loading
3. **Mock External Services**: Control test environment
4. **Clean Up Test Data**: Ensure test isolation
5. **Handle Errors**: Test error conditions

### Test Maintenance
1. **Regular Updates**: Keep tests in sync with application
2. **Performance Monitoring**: Watch test execution time
3. **Flaky Test Detection**: Identify and fix unreliable tests
4. **Coverage Tracking**: Monitor test coverage trends
5. **Documentation**: Keep test documentation current

---

*Skill Version: 1.0*  
*Last Updated: 2026-03-10*  
*Next Review: 2026-03-17*