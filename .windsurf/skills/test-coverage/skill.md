# 📊 Test Coverage Analysis Skill

**Purpose**: Comprehensive test coverage analysis and improvement recommendations  
**Trigger**: When coverage analysis is needed or coverage thresholds are not met  
**Scope**: Backend and frontend test coverage with detailed reporting

---

## 🎯 Skill Activation

### Automatic Triggers
- Coverage thresholds not met in CI/CD
- New feature added without sufficient tests
- Test coverage regression detected
- Code quality review requested

### Manual Invocation
```bash
# Use the skill when you need:
@skill test-coverage
- Analyze current coverage levels
- Identify coverage gaps
- Generate improvement plan
- Verify coverage targets met
```

---

## 📈 Coverage Analysis Process

### Step 1: Current Coverage Assessment
```bash
# Backend coverage analysis
cd backend
python -m pytest tests/ --cov=. --cov-report=html --cov-report=term

# Frontend coverage analysis
cd frontend
npm test -- --coverage --coverageReporters=json --coverageReporters=html
```

### Step 2: Gap Identification
- **Backend Services**: Focus on Triage, Vision, PDF, Sync
- **Frontend Utilities**: Focus on api.ts, syncManager.ts, jobs.ts
- **Critical Paths**: Voice-to-cash workflow components
- **Integration Points**: API contracts and database operations

### Step 3: Improvement Prioritization
1. **Critical Business Logic** (Priority 1)
   - Voice processing (triage.py)
   - Receipt OCR (vision.py)
   - Certificate generation (pdf.py)
   - Data synchronization (sync.py)

2. **User-Facing Components** (Priority 2)
   - API client error handling
   - Job management utilities
   - Offline sync functionality
   - Admin suite operations

3. **Infrastructure Services** (Priority 3)
   - Authentication flows
   - Email notifications
   - Material management
   - Reporting functions

---

## 🎯 Coverage Targets by Component

### Backend Service Targets
| Service | Current | Target | Priority | Status |
|---------|---------|--------|----------|---------|
| triage.py | 75% | 90% | Critical | 🟡 Needs Work |
| vision.py | 86% | 90% | Critical | 🟡 Needs Work |
| pdf.py | 90% | 90% | Critical | ✅ On Target |
| sync.py | ?% | 90% | Critical | 🔴 Missing |
| mailer.py | 100% | 90% | Standard | ✅ Exceeded |
| math_utils.py | 100% | 85% | Standard | ✅ Exceeded |
| invoice.py | 62% | 85% | Standard | 🔴 Below Target |
| translator.py | 45% | 85% | Standard | 🔴 Below Target |

### Frontend Utility Targets
| Utility | Current | Target | Priority | Status |
|---------|---------|--------|----------|---------|
| api.ts | 77.27% | 95% | Critical | 🔴 Below Target |
| syncManager.ts | 100% | 95% | Critical | ✅ Exceeded |
| jobs.ts | 84.21% | 95% | Critical | 🔴 Below Target |
| db.ts | 100% | 90% | Standard | ✅ Exceeded |

---

## 🔧 Test Implementation Templates

### Backend Service Test Template
```python
# tests/unit/test_{service_name}.py
import pytest
from unittest.mock import patch, Mock
from services.{service_name} import {function_name}
from decimal import Decimal

class Test{ServiceName}:
    """Test {service_name} functionality"""
    
    @pytest.fixture
    def mock_dependencies(self):
        """Mock external dependencies"""
        with patch('services.{service_name}.external_service') as mock:
            yield mock
    
    def test_{function_name}_success(self, mock_dependencies):
        """Test successful {function_name} execution"""
        # Arrange
        input_data = {"key": "value"}
        expected_output = {"result": "success"}
        mock_dependencies.return_value = expected_output
        
        # Act
        result = {function_name}(input_data)
        
        # Assert
        assert result == expected_output
        mock_dependencies.assert_called_once_with(input_data)
    
    def test_{function_name}_error_handling(self, mock_dependencies):
        """Test error handling in {function_name}"""
        # Arrange
        mock_dependencies.side_effect = Exception("Service error")
        
        # Act & Assert
        with pytest.raises(Exception, match="Service error"):
            {function_name}({"key": "value"})
    
    def test_{function_name}_edge_cases(self):
        """Test edge cases for {function_name}"""
        # Test empty input, null values, edge cases
        assert {function_name}({}) == {"result": "default"}
        assert {function_name}(None) == {"result": "error"}
```

### Frontend Utility Test Template
```typescript
// src/lib/__tests__/{utility_name}.test.ts
import { {function_name} } from '../{utility_name}';
import { mockApiResponse, mockError } from '../__tests__/test-utils';

describe('{utility_name}', () => {
  describe('{function_name}', () => {
    it('should handle successful response', async () => {
      // Arrange
      const mockData = { result: 'success' };
      jest.spyOn(api, 'post').mockResolvedValue(mockData);
      
      // Act
      const result = await {function_name}('test-input');
      
      // Assert
      expect(result).toEqual(mockData);
      expect(api.post).toHaveBeenCalledWith('/endpoint', 'test-input');
    });
    
    it('should handle network errors', async () => {
      // Arrange
      const networkError = new Error('Network error');
      jest.spyOn(api, 'post').mockRejectedValue(networkError);
      
      // Act & Assert
      await expect({function_name}('test-input')).rejects.toThrow('Network error');
    });
    
    it('should validate input parameters', () => {
      // Test input validation
      expect(() => {function_name}(null)).toThrow();
      expect(() => {function_name}('')).toThrow();
    });
  });
});
```

### Component Test Template
```typescript
// src/components/__tests__/{ComponentName}.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { {ComponentName} } from '../{ComponentName}';
import { TestProviders } from '../__tests__/test-providers';

describe('{ComponentName}', () => {
  const defaultProps = {
    // Default props for testing
  };
  
  const renderComponent = (props = {}) => {
    return render(
      <TestProviders>
        <{ComponentName} {...defaultProps} {...props} />
      </TestProviders>
    );
  };
  
  it('renders correctly with default props', () => {
    renderComponent();
    expect(screen.getByTestId('{component-name}')).toBeInTheDocument();
  });
  
  it('handles user interactions', async () => {
    renderComponent();
    const button = screen.getByRole('button', { name: /submit/i });
    
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(screen.getByText(/success/i)).toBeInTheDocument();
    });
  });
  
  it('displays loading states', () => {
    renderComponent({ loading: true });
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });
  
  it('handles error states', () => {
    renderComponent({ error: 'Test error' });
    expect(screen.getByText(/test error/i)).toBeInTheDocument();
  });
});
```

---

## 📊 Coverage Report Analysis

### Backend Coverage Report Structure
```
backend/coverage/
├── index.html              # Interactive HTML report
├── {service_name}.html     # Per-service coverage
└── coverage.xml            # Machine-readable report
```

### Frontend Coverage Report Structure
```
frontend/coverage/
├── lcov-report/            # Interactive HTML report
├── coverage-final.json    # Machine-readable report
└── coverage-summary.json  # Summary statistics
```

### Key Metrics to Track
1. **Statement Coverage**: Lines of code executed
2. **Branch Coverage**: Conditional branches taken
3. **Function Coverage**: Functions called
4. **Line Coverage**: Physical lines executed

---

## 🎯 Improvement Strategies

### Quick Wins (1-2 days)
1. **Add missing test cases** for uncovered branches
2. **Improve error handling tests** with edge cases
3. **Add integration tests** for API endpoints
4. **Mock external dependencies** properly

### Medium Effort (1 week)
1. **Refactor large functions** to make them testable
2. **Add comprehensive component tests**
3. **Implement E2E test scenarios**
4. **Set up test data factories**

### Long-term Investment (2-4 weeks)
1. **Architecture improvements** for testability
2. **Performance testing framework**
3. **Automated test generation**
4. **Continuous coverage monitoring**

---

## 📋 Coverage Checklist

### Daily Development
- [ ] Run unit tests before commit
- [ ] Check coverage impact of changes
- [ ] Add tests for new functionality
- [ ] Verify no coverage regression

### Weekly Review
- [ ] Generate full coverage report
- [ ] Identify coverage gaps
- [ ] Prioritize improvement tasks
- [ ] Update coverage targets

### Monthly Assessment
- [ ] Review coverage trends
- [ ] Assess testing strategy effectiveness
- [ ] Update testing infrastructure
- [ ] Train team on best practices

---

## 🔍 Troubleshooting

### Common Coverage Issues
1. **Branch Coverage Low**: Add tests for conditional logic
2. **Function Coverage Low**: Test all function entry points
3. **Statement Coverage Low**: Add tests for uncovered code paths
4. **Integration Coverage Low**: Add API contract tests

### Performance Issues
1. **Slow Tests**: Use test doubles, optimize setup
2. **Memory Leaks**: Clean up resources in teardown
3. **Flaky Tests**: Isolate tests, remove dependencies
4. **Timeout Issues**: Increase timeouts, fix async issues

---

## 📚 Resources and References

### Documentation
- [pytest coverage documentation](https://pytest-cov.readthedocs.io/)
- [Jest coverage documentation](https://jestjs.io/docs/getting-started)
- [Playwright testing guide](https://playwright.dev/docs/intro)

### Best Practices
- Test behavior, not implementation
- Use descriptive test names
- Keep tests independent and isolated
- Mock external dependencies
- Test error conditions and edge cases

---

*Skill Version: 1.0*  
*Last Updated: 2026-03-10*  
*Next Review: 2026-03-17*