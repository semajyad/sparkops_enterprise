# 🤝 Contributing to SparkOps

## Overview

SparkOps is a production-ready voice-to-cash platform for New Zealand electrical contractors. We welcome contributions from developers, QA engineers, designers, and domain experts. This guide provides comprehensive instructions for contributing to the project.

## 🎯 Contribution Types

### Code Contributions
- **Feature development**: New functionality
- **Bug fixes**: Issue resolution
- **Performance improvements**: Optimization
- **Code refactoring**: Maintainability improvements
- **Testing**: Unit, integration, and E2E tests

### Documentation Contributions
- **API documentation**: Endpoint specifications
- **User guides**: Feature explanations
- **Deployment guides**: Setup instructions
- **Code comments**: In-code documentation

### Design Contributions
- **UI/UX improvements**: Interface enhancements
- **Mobile optimization**: Responsive design
- **Accessibility improvements**: ARIA labels, contrast
- **User experience flows**: Journey optimization

### Domain Expertise
- **Electrical industry knowledge**: NZ-specific requirements
- **Business process optimization**: Workflow improvements
- **User feedback**: Real-world usage insights

---

## 🚀 Getting Started

### Prerequisites
- **Git**: Version control
- **Node.js 18+**: Frontend development
- **Python 3.11+**: Backend development
- **PostgreSQL**: Local database
- **Docker**: Optional containerization

### Development Setup

#### 1. Fork and Clone
```bash
# Fork the repository on GitHub
git clone https://github.com/your-username/sparkops_enterprise.git
cd sparkops_enterprise
```

#### 2. Set Up Development Environment
```bash
# Backend setup
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend setup
cd ../frontend
npm install

# Environment setup
cp .env.example .env.local
# Configure your environment variables
```

#### 3. Database Setup
```bash
cd backend
export DATABASE_URL="postgresql://user:pass@localhost:5432/sparkops_dev"
python -c "
from database import ENGINE
from models.database import create_db_and_tables
create_db_and_tables(ENGINE)
"
```

#### 4. Verify Setup
```bash
# Backend tests
cd backend
pytest tests/unit/ -v

# Frontend tests
cd frontend
npm test

# Start development servers
# Backend: uvicorn main:app --reload
# Frontend: npm run dev
```

---

## 🌿 Branch Strategy

### Branch Types
- **`main`**: Production-ready code
- **`develop`**: Integration branch for features
- **`feature/*`**: New feature development
- **`bugfix/*`**: Bug fixes
- **`hotfix/*`**: Critical production fixes
- **`release/*`**: Release preparation

### Branch Naming Conventions
```bash
feature/voice-recording-enhancement
bugfix/materials-import-validation
hotfix/security-vulnerability-fix
release/v1.1.0-prep
```

### Workflow
1. **Create branch** from `develop`
2. **Develop and test** your changes
3. **Submit pull request** to `develop`
4. **Code review** and integration
5. **Merge** to `develop`
6. **Release** to `main` when ready

---

## 📝 Development Guidelines

### Code Standards

#### Python (Backend)
```python
# Use type hints
def process_job_draft(data: JobDraftData) -> JobDraftResponse:
    """Process job draft with AI triage."""
    
    # Follow PEP 8 formatting
    if not data.audio_base64 and not data.image_base64:
        raise ValueError("Either audio or image data required")
    
    # Use context managers for resources
    with Session(ENGINE) as session:
        # Database operations
        pass
    
    # Return structured response
    return JobDraftResponse(status="processed")

# Use descriptive variable names
material_price = calculate_material_price(material_description)
labor_hours = extract_labor_hours(transcript_text)
```

#### TypeScript (Frontend)
```typescript
// Use interfaces for type safety
interface JobDraft {
  id: string;
  clientName: string;
  materials: Material[];
  laborHours: number;
  status: JobStatus;
}

// Use functional components with hooks
export function JobCard({ job, onUpdate }: JobCardProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  
  const handleUpdate = useCallback(async () => {
    setIsLoading(true);
    try {
      await onUpdate(job.id);
    } finally {
      setIsLoading(false);
    }
  }, [job.id, onUpdate]);
  
  return (
    <div className="job-card">
      {/* Component content */}
    </div>
  );
}

// Use proper error boundaries
export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <div className="error-boundary">
      {/* Error handling */}
    </div>
  );
}
```

### Testing Requirements

#### Backend Tests
```python
# Unit tests for business logic
def test_calculate_invoice_totals():
    """Test invoice calculation with edge cases."""
    
    # Test with zero values
    result = calculate_invoice_totals(
        materials_total=Decimal("0"),
        labor_total=Decimal("0"),
        markup_rate=Decimal("0.20")
    )
    assert result["total"] == Decimal("0")
    
    # Test with maximum values
    result = calculate_invoice_totals(
        materials_total=Decimal("99999.99"),
        labor_total=Decimal("99999.99"),
        markup_rate=Decimal("0.50")
    )
    assert result["total"] > Decimal("0")

# Integration tests for API endpoints
def test_job_ingestion_api():
    """Test complete job ingestion pipeline."""
    
    with TestClient(app) as client:
        response = client.post(
            "/api/ingest",
            headers={"Authorization": f"Bearer {valid_token}"},
            json={
                "audio_base64": "base64_data",
                "transcript": "test transcript",
                "type": "voice"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "processed"
```

#### Frontend Tests
```typescript
// Component tests
import { render, screen, fireEvent } from '@testing-library/react';
import { JobCard } from './JobCard';

describe('JobCard', () => {
  test('renders job information correctly', () => {
    const mockJob = {
      id: 'test-job',
      clientName: 'Test Client',
      status: 'draft'
    };
    
    render(<JobCard job={mockJob} onUpdate={jest.fn()} />);
    
    expect(screen.getByText('Test Client')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });
  
  test('calls onUpdate when update button clicked', () => {
    const mockOnUpdate = jest.fn();
    const mockJob = { id: 'test-job', clientName: 'Test Client', status: 'draft' };
    
    render(<JobCard job={mockJob} onUpdate={mockOnUpdate} />);
    
    fireEvent.click(screen.getByText('Update'));
    expect(mockOnUpdate).toHaveBeenCalledWith('test-job');
  });
});

// E2E tests
import { test, expect } from '@playwright/test';

test('complete job creation flow', async ({ page }) => {
  await page.goto('/capture');
  
  // Record voice note
  await page.click('[data-testid="record-button"]');
  await page.waitForTimeout(2000);
  await page.click('[data-testid="stop-button"]');
  
  // Submit for processing
  await page.click('[data-testid="submit-button"]');
  
  // Verify job created
  await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
  await page.goto('/jobs');
  await expect(page.locator('text=Test Client')).toBeVisible();
});
```

### Documentation Standards

#### Code Documentation
```python
def analyze_transcript(transcript: str) -> Dict[str, Any]:
    """Analyze voice transcript using GPT-5 triage.
    
    Args:
        transcript: Raw voice transcript text
        
    Returns:
        Dictionary containing:
        - client: Extracted client name
        - materials: List of material descriptions
        - labor_hours: Estimated labor time
        - urgency: Classified urgency level
        
    Raises:
        ValueError: If transcript is empty or invalid
        OpenAIError: If AI service fails
        
    Example:
        >>> result = analyze_transcript("installed hot water cylinder in cupboard")
        >>> print(result['materials'][0])
        'Horizontal Hot Water Cylinder'
    """
```

#### API Documentation
```python
@app.post("/api/ingest", response_model=JobDraftResponse)
async def ingest_job_data(
    request: JobIngestRequest,
    current_user: AuthenticatedUser = Depends(get_current_user)
) -> JobDraftResponse:
    """Process voice or receipt data into structured job draft.
    
    Accepts either audio recordings or receipt images and uses AI
    to extract structured job information including materials,
    labor estimates, and client details.
    
    Args:
        request: Job ingestion data with audio/image
        current_user: Authenticated user from JWT token
        
    Returns:
        Processed job draft with extracted information
        
    Raises:
        HTTP_401: Unauthorized access
        HTTP_422: Invalid request data
        HTTP_500: Processing error
    """
```

---

## 🔍 Code Review Process

### Pull Request Requirements

#### Title Format
```
type(scope): description

Examples:
feat(voice): add real-time transcription feedback
fix(materials): validate CSV file format
docs(api): update authentication documentation
test(e2e): add offline sync scenarios
```

#### Description Template
```markdown
## Description
Brief description of changes and motivation.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Test improvement

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Environment variables documented
- [ ] Error handling implemented
- [ ] Logging added where appropriate
- [ ] Security considerations reviewed

## Screenshots (if applicable)
Add screenshots for UI changes.

## Additional Notes
Any additional context or considerations.
```

### Review Criteria

#### Code Quality
- **Functionality**: Works as intended
- **Performance**: No performance regressions
- **Security**: No security vulnerabilities
- **Maintainability**: Clean, readable code
- **Testing**: Adequate test coverage

#### Architecture
- **Consistency**: Follows existing patterns
- **Scalability**: Handles future growth
- **Dependencies**: Minimal new dependencies
- **API Design**: RESTful principles
- **Database**: Proper schema design

#### User Experience
- **Interface**: Intuitive and responsive
- **Error Handling**: Clear error messages
- **Accessibility**: WCAG compliance
- **Mobile**: Responsive design
- **Performance**: Fast load times

---

## 🧪 Testing Strategy

### Test Pyramid
```
    E2E Tests (10%)
   ─────────────────
  Integration Tests (20%)
 ─────────────────────────
Unit Tests (70%)
```

### Coverage Requirements
- **Backend**: 80% line coverage minimum
- **Frontend**: 70% component coverage minimum
- **Critical Paths**: 100% E2E coverage
- **API Endpoints**: 100% integration coverage

### Test Categories

#### Unit Tests
- **Business logic**: Invoice calculations, AI processing
- **Utility functions**: Math utils, validators
- **Data models**: Schema validation
- **Service classes**: Individual service methods

#### Integration Tests
- **API endpoints**: Request/response validation
- **Database operations**: CRUD functionality
- **Authentication**: JWT validation, user provisioning
- **External services**: OpenAI, Twilio integration

#### E2E Tests
- **User journeys**: Complete workflows
- **Mobile responsiveness**: Cross-device testing
- **Offline functionality**: Sync behavior
- **Error scenarios**: Graceful failure handling

---

## 🚀 Release Process

### Version Management
- **Semantic Versioning**: MAJOR.MINOR.PATCH
- **Release Branches**: `release/v1.2.0`
- **Tagging**: Git tags for releases
- **Changelog**: Maintain CHANGELOG.md

### Release Checklist
```markdown
## Pre-Release
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Environment variables verified
- [ ] Security scan completed
- [ ] Performance testing passed
- [ ] Backup procedures tested

## Release
- [ ] Create release branch
- [ ] Update version numbers
- [ ] Update CHANGELOG.md
- [ ] Create Git tag
- [ ] Deploy to staging
- [ ] Run smoke tests
- [ ] Deploy to production
- [ ] Verify deployment

## Post-Release
- [ ] Monitor performance
- [ ] Check error logs
- [ ] User feedback collection
- [ ] Document any issues
- [ ] Plan next iteration
```

### Deployment Environments
- **Development**: Local development
- **Staging**: Pre-production testing
- **Production**: Live user environment
- **Hotfix**: Emergency production fixes

---

## 🔒 Security Guidelines

### Security Principles
- **Least privilege**: Minimal permissions
- **Defense in depth**: Multiple security layers
- **Secure by default**: Safe configurations
- **Regular updates**: Dependencies and patches

### Security Checklist
- [ ] Input validation implemented
- [ ] SQL injection prevention
- [ ] XSS protection enabled
- [ ] CSRF tokens used
- [ ] Authentication properly configured
- [ ] Authorization checks implemented
- [ ] Sensitive data encrypted
- [ ] Error messages don't leak information
- [ ] Dependencies scanned for vulnerabilities
- [ ] Security headers configured

### Reporting Security Issues
- **Private disclosure**: security@sparkops.co.nz
- **No public issues**: Don't open GitHub issues
- **Quick response**: 24-hour acknowledgment
- **Coordinated disclosure**: Work with reporter

---

## 📊 Performance Guidelines

### Performance Targets
- **API Response**: <500ms (95th percentile)
- **Page Load**: <2s (first contentful paint)
- **Mobile Performance**: <3s load time
- **Database Queries**: <50ms average
- **Memory Usage**: <512MB per instance

### Optimization Strategies
- **Database**: Proper indexing, query optimization
- **Caching**: Redis for frequently accessed data
- **CDN**: Static asset delivery
- **Compression**: Gzip for API responses
- **Lazy Loading**: Components and images

### Performance Testing
- **Load Testing**: Locust for API stress testing
- **Monitoring**: Real-time performance metrics
- **Profiling**: Identify bottlenecks
- **Benchmarking**: Regular performance baselines

---

## 🤝 Community Guidelines

### Code of Conduct
- **Respectful**: Professional and inclusive communication
- **Collaborative**: Work together toward common goals
- **Constructive**: Helpful feedback and suggestions
- **Patient**: Support contributors of all skill levels

### Communication Channels
- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
- **Pull Requests**: Code review and collaboration
- **Email**: Private security concerns

### Getting Help
- **Documentation**: Check docs first
- **Search**: Look for existing issues
- **Ask questions**: GitHub Discussions
- **Mentorship**: Request help from maintainers

---

## 🏆 Recognition

### Contribution Types
- **Code**: Features, fixes, tests
- **Documentation**: Guides, API docs
- **Design**: UI/UX improvements
- **Community**: Support, feedback
- **Security**: Vulnerability reports

### Recognition Methods
- **Contributors list**: GitHub acknowledgments
- **Release notes**: Feature attribution
- **Community highlights**: Blog posts
- **Swag**: Stickers, t-shirts for significant contributors

---

## 📋 Quick Reference

### Common Commands
```bash
# Development
npm run dev              # Frontend dev server
uvicorn main:app --reload # Backend dev server

# Testing
npm test                 # Frontend tests
pytest tests/           # Backend tests
npm run test:e2e        # E2E tests

# Code Quality
npm run lint            # Frontend linting
black .                 # Python formatting
isort .                 # Python import sorting

# Git
git checkout -b feature/new-feature
git commit -m "feat(scope): description"
git push origin feature/new-feature
```

### Environment Variables
```bash
# Backend
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
SECRET_KEY=your-secret-key

# Frontend
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### File Structure
```
sparkops_enterprise/
├── backend/                 # FastAPI application
│   ├── routers/            # API endpoints
│   ├── services/           # Business logic
│   ├── models/             # Database models
│   └── tests/              # Test suite
├── frontend/               # Next.js application
│   ├── src/
│   │   ├── app/           # App Router pages
│   │   ├── components/    # React components
│   │   └── lib/           # Utilities
│   └── tests/             # E2E tests
└── docs/                  # Documentation
```

---

## 🎉 Conclusion

Thank you for contributing to SparkOps! Your contributions help build a better platform for New Zealand electrical contractors. By following these guidelines, we ensure high-quality, maintainable code that serves our users effectively.

### Next Steps
1. **Set up** your development environment
2. **Choose** an issue or feature to work on
3. **Create** a branch and start coding
4. **Test** your changes thoroughly
5. **Submit** a pull request for review
6. **Collaborate** with the community

### Questions?
- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and ideas
- **Email**: For private matters

---

*🤝 SparkOps Contributing Guide - Building together, one commit at a time*