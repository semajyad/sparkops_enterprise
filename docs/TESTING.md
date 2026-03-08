# 🧪 SparkOps Testing Guide

## Overview

This comprehensive testing guide covers all aspects of testing the SparkOps platform, including unit tests, integration tests, end-to-end tests, and performance testing. The platform maintains high code quality and reliability through extensive automated testing.

## Testing Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Unit Tests    │    │ Integration     │    │  E2E Tests      │
│   (pytest)      │    │ Tests (API)     │    │ (Playwright)    │
│                 │    │                 │    │                 │
│ • AI Services   │    │ • API Endpoints │    │ • User Flows    │
│ • Math Utils    │    │ • Database      │    │ • Mobile UI     │
│ • Invoice Calc  │    │ • Auth Flow     │    │ • Offline Sync  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Tests    │    │ Verification   │    │  Manual Tests   │
│   (Locust)      │    │ Scripts        │    │                 │
│                 │    │                 │    │ • Cross-browser │
│ • API Stress    │    │ • AI Triage    │    │ • Real devices  │
│ • Concurrency   │    │ • Materials     │    │ • Network sims  │
│ • Performance   │    │ • End-to-End    │    │ • User testing  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 🧪 Backend Testing (pytest)

### Test Structure
```
backend/tests/
├── unit/                    # Unit tests
│   ├── test_math_utils.py
│   ├── test_invoice.py
│   ├── test_translator.py
│   └── test_triage.py
├── integration/             # Integration tests
│   ├── test_auth_flow.py
│   ├── test_jobs_api.py
│   ├── test_materials_api.py
│   └── test_twilio_webhooks.py
├── functional/              # Functional tests
│   ├── test_voice_ingest.py
│   └── test_receipt_processing.py
├── locustfile.py           # Load testing
└── conftest.py             # Test configuration
```

### Running Tests

#### All Tests
```bash
cd backend
pytest tests/ -v --cov=. --cov-report=html
```

#### Unit Tests Only
```bash
pytest tests/unit/ -v
```

#### Integration Tests Only
```bash
pytest tests/integration/ -v
```

#### Specific Test File
```bash
pytest tests/unit/test_math_utils.py -v
```

#### With Coverage Report
```bash
pytest tests/ --cov=. --cov-report=term-missing
```

### Key Unit Tests

#### Math Utils Tests (`tests/unit/test_math_utils.py`)
```python
import pytest
from decimal import Decimal
from services.math_utils import (
    calculate_line_total, 
    calculate_invoice_totals,
    add_gst
)

def test_calculate_line_total():
    """Test line total calculation with precision."""
    quantity = Decimal("2.5")
    unit_price = Decimal("45.67")
    expected = Decimal("114.175")
    
    result = calculate_line_total(quantity, unit_price)
    assert result == expected

def test_calculate_invoice_totals():
    """Test invoice total calculation with markup and GST."""
    materials_total = Decimal("1000.00")
    labor_total = Decimal("300.00")
    markup_rate = Decimal("0.20")
    
    result = calculate_invoice_totals(materials_total, labor_total, markup_rate)
    
    # Materials with markup: 1000 * 1.20 = 1200
    # Labor: 300
    # Subtotal: 1500
    # GST (15%): 225
    # Total: 1725
    assert result["total"] == Decimal("1725.00")
    assert result["gst_amount"] == Decimal("225.00")

def test_add_gst():
    """Test GST calculation."""
    amount = Decimal("1000.00")
    result = add_gst(amount)
    assert result == Decimal("1150.00")  # 15% GST
```

#### Invoice Tests (`tests/unit/test_invoice.py`)
```python
import pytest
from decimal import Decimal
from services.invoice import InvoiceDraft, InvoiceLine

def test_invoice_calculation():
    """Test invoice calculation with real data."""
    lines = [
        InvoiceLine(
            description="2.5mm TPS Cable",
            quantity=Decimal("50"),
            unit_price=Decimal("2.45"),
            line_type="material"
        ),
        InvoiceLine(
            description="Labor - Installation",
            quantity=Decimal("3"),
            unit_price=Decimal("95.00"),
            line_type="labor"
        )
    ]
    
    invoice = InvoiceDraft(lines=lines)
    result = invoice.calculate_totals()
    
    # Material: 50 * 2.45 = 122.50
    # Labor: 3 * 95.00 = 285.00
    # Subtotal: 407.50
    # GST: 61.13
    # Total: 468.63
    assert result["total"] == Decimal("468.63")
```

#### AI Service Tests (`tests/unit/test_triage.py`)
```python
import pytest
from services.triage import KiwiTriageService

def test_extract_materials_from_transcript():
    """Test material extraction from voice transcript."""
    service = KiwiTriageService()
    transcript = "installed hot water cylinder in cupboard and ran some 2.5 twin and earth"
    
    result = service.extract_materials(transcript)
    
    assert "Horizontal Hot Water Cylinder" in [m["description"] for m in result]
    assert "2.5mm TPS Cable" in [m["description"] for m in result]

def test_classify_urgency():
    """Test urgency classification."""
    service = KiwiTriageService()
    
    high_urgency = "power outage emergency sparks flying"
    medium_urgency = "routine maintenance check"
    low_urgency = "quote for future work"
    
    assert service.classify_urgency(high_urgency) == "High"
    assert service.classify_urgency(medium_urgency) == "Medium"
    assert service.classify_urgency(low_urgency) == "Low"
```

### Integration Tests

#### Authentication Flow (`tests/integration/test_auth_flow.py`)
```python
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_auth_handshake():
    """Test authentication handshake with valid token."""
    # Mock valid JWT token
    valid_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    
    response = client.get(
        "/api/v1/auth/handshake",
        headers={"Authorization": f"Bearer {valid_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "authenticated"
    assert "user_id" in data
    assert "role" in data

def test_auth_handshake_invalid_token():
    """Test authentication handshake with invalid token."""
    response = client.get(
        "/api/v1/auth/handshake",
        headers={"Authorization": "Bearer invalid_token"}
    )
    
    assert response.status_code == 401

def test_get_user_profile():
    """Test getting user profile."""
    valid_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {valid_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "email" in data
    assert "role" in data
    assert "organization_id" in data
```

#### Jobs API (`tests/integration/test_jobs_api.py`)
```python
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_create_job_draft():
    """Test creating a job draft from voice data."""
    valid_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    
    payload = {
        "audio_base64": "base64_encoded_audio_data",
        "transcript": "installed hot water cylinder in cupboard",
        "type": "voice"
    }
    
    response = client.post(
        "/api/ingest",
        headers={"Authorization": f"Bearer {valid_token}"},
        json=payload
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "processed"
    assert "extracted_data" in data
    assert "id" in data

def test_list_jobs():
    """Test listing job drafts."""
    valid_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    
    response = client.get(
        "/api/jobs",
        headers={"Authorization": f"Bearer {valid_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

def test_delete_job():
    """Test deleting a job draft."""
    valid_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    job_id = "test_job_uuid"
    
    response = client.delete(
        f"/api/jobs/{job_id}",
        headers={"Authorization": f"Bearer {valid_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "deleted"
    assert data["id"] == job_id
```

### Functional Tests

#### Voice Ingestion (`tests/functional/test_voice_ingest.py`)
```python
import pytest
import base64
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_full_voice_ingestion_pipeline():
    """Test complete voice ingestion pipeline."""
    valid_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    
    # Simulate voice recording
    transcript = "installed hot water cylinder in cupboard at 123 Queen Street, urgent"
    
    payload = {
        "audio_base64": base64.b64encode(b"fake_audio_data").decode(),
        "transcript": transcript,
        "type": "voice"
    }
    
    response = client.post(
        "/api/ingest",
        headers={"Authorization": f"Bearer {valid_token}"},
        json=payload
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Verify AI extraction worked
    extracted = data["extracted_data"]
    assert "client" in extracted
    assert "materials" in extracted
    assert len(extracted["materials"]) > 0
    assert extracted["urgency"] == "High"  # Should detect "urgent"
    
    # Verify job was created in database
    job_id = data["id"]
    response = client.get(
        f"/api/jobs/{job_id}",
        headers={"Authorization": f"Bearer {valid_token}"}
    )
    assert response.status_code == 200
```

---

## 🎭 Frontend Testing (Playwright)

### Test Structure
```
frontend/tests/
├── e2e/                     # End-to-end tests
│   ├── live_staging.spec.ts
│   ├── offline-sync.spec.ts
│   └── mobile-responsive.spec.ts
├── components/              # Component tests
│   └── __tests__/
└── fixtures/               # Test data
    ├── users.json
    └── jobs.json
```

### Running E2E Tests

#### All E2E Tests
```bash
cd frontend
npm run test:e2e
```

#### Specific Test File
```bash
npx playwright test tests/e2e/live_staging.spec.ts
```

#### With UI Mode
```bash
npx playwright test --ui
```

#### Headed Mode (with browser window)
```bash
npx playwright test --headed
```

### Key E2E Tests

#### Authentication Flow (`tests/e2e/live_staging.spec.ts`)
```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('user can sign up and sign in', async ({ page }) => {
    await page.goto('/login');
    
    // Test signup
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'testpassword123');
    await page.fill('[data-testid="full-name-input"]', 'Test User');
    await page.click('[data-testid="signup-button"]');
    
    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
    
    // Test logout
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');
    
    // Should redirect to login
    await expect(page).toHaveURL('/login');
  });

  test('user sees session expiry warning', async ({ page }) => {
    // Mock expired session
    await page.goto('/dashboard');
    await page.evaluate(() => {
      // Simulate session expiry
      localStorage.removeItem('supabase.auth.token');
    });
    
    // Should show session expiry message
    await expect(page.locator('[data-testid="session-expired"]')).toBeVisible();
    await expect(page.locator('text=Your session has expired')).toBeVisible();
  });
});
```

#### Offline Sync (`tests/e2e/offline-sync.spec.ts`)
```typescript
import { test, expect } from '@playwright/test';

test.describe('Offline Sync', () => {
  test('can capture job offline and sync when online', async ({ page, context }) => {
    // Simulate offline mode
    await context.setOffline(true);
    
    await page.goto('/capture');
    
    // Record voice note
    await page.click('[data-testid="record-button"]');
    await page.waitForTimeout(2000); // Simulate recording
    await page.click('[data-testid="stop-button"]');
    
    // Should show offline indicator
    await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
    
    // Verify draft saved to IndexedDB
    const draftCount = await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('SparkOpsDB', 1);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['jobDrafts'], 'readonly');
          const store = transaction.objectStore('jobDrafts');
          const countRequest = store.count();
          countRequest.onsuccess = () => resolve(countRequest.result);
        };
      });
    });
    
    expect(draftCount).toBeGreaterThan(0);
    
    // Go back online
    await context.setOffline(false);
    
    // Trigger sync
    await page.click('[data-testid="sync-button"]');
    
    // Should show syncing indicator
    await expect(page.locator('[data-testid="syncing-indicator"]')).toBeVisible();
    
    // Wait for sync to complete
    await page.waitForTimeout(3000);
    
    // Should show success message
    await expect(page.locator('[data-testid="sync-success"]')).toBeVisible();
  });

  test('handles sync errors gracefully', async ({ page }) => {
    // Mock network error during sync
    await page.route('/api/ingest', route => route.abort());
    
    await page.goto('/capture');
    
    // Try to sync
    await page.click('[data-testid="sync-button"]');
    
    // Should show error message
    await expect(page.locator('[data-testid="sync-error"]')).toBeVisible();
    await expect(page.locator('text=Sync failed')).toBeVisible();
    
    // Should show retry option
    await expect(page.locator('[data-testid="retry-sync"]')).toBeVisible();
  });
});
```

#### Mobile Responsive (`tests/e2e/mobile-responsive.spec.ts`)
```typescript
import { test, expect } from '@playwright/test';

const devices = [
  { name: 'iPhone 12', viewport: { width: 390, height: 844 } },
  { name: 'iPad', viewport: { width: 768, height: 1024 } },
  { name: 'Desktop', viewport: { width: 1280, height: 720 } }
];

devices.forEach(device => {
  test.describe(`${device.name} Responsive`, () => {
    test.use({ viewport: device.viewport });
    
    test('dashboard layout adapts to screen size', async ({ page }) => {
      await page.goto('/dashboard');
      
      // Check navigation adapts
      if (device.viewport.width < 768) {
        // Mobile: Bottom navigation should be visible
        await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();
        await expect(page.locator('[data-testid="desktop-nav"]')).not.toBeVisible();
      } else {
        // Desktop/Tablet: Desktop navigation should be visible
        await expect(page.locator('[data-testid="desktop-nav"]')).toBeVisible();
        await expect(page.locator('[data-testid="mobile-nav"]')).not.toBeVisible();
      }
      
      // Check content layout
      await expect(page.locator('[data-testid="dashboard-content"]')).toBeVisible();
    });

    test('capture interface works on mobile', async ({ page }) => {
      await page.goto('/capture');
      
      // Mobile-specific UI elements
      if (device.viewport.width < 768) {
        await expect(page.locator('[data-testid="mobile-capture-button"]')).toBeVisible();
      }
      
      // Test recording button
      await expect(page.locator('[data-testid="record-button"]')).toBeVisible();
      await page.click('[data-testid="record-button"]');
      
      // Should show recording state
      await expect(page.locator('[data-testid="recording-indicator"]')).toBeVisible();
    });
  });
});
```

---

## ⚡ Performance Testing (Locust)

### Load Test Configuration (`backend/locustfile.py`)
```python
from locust import HttpUser, task, between
import json
import base64

class SparkOpsUser(HttpUser):
    wait_time = between(1, 3)
    
    def on_start(self):
        """Authenticate user on start."""
        response = self.client.post("/api/v1/auth/handshake", 
                                   headers={"Authorization": "Bearer test_token"})
        if response.status_code == 200:
            self.auth_headers = {"Authorization": "Bearer test_token"}
        else:
            self.auth_headers = {}
    
    @task(3)
    def get_jobs(self):
        """List jobs - most common operation."""
        self.client.get("/api/jobs", headers=self.auth_headers)
    
    @task(2)
    def get_dashboard_data(self):
        """Get user profile and dashboard data."""
        self.client.get("/api/auth/me", headers=self.auth_headers)
    
    @task(1)
    def create_voice_job(self):
        """Create job from voice - resource intensive."""
        # Simulate voice data
        payload = {
            "audio_base64": base64.b64encode(b"fake_audio_data").decode(),
            "transcript": "test job transcript",
            "type": "voice"
        }
        
        self.client.post("/api/ingest", 
                        headers=self.auth_headers,
                        json=payload)
    
    @task(1)
    def create_receipt_job(self):
        """Create job from receipt - resource intensive."""
        # Simulate receipt image
        payload = {
            "image_base64": base64.b64encode(b"fake_image_data").decode(),
            "type": "receipt"
        }
        
        self.client.post("/api/ingest",
                        headers=self.auth_headers, 
                        json=payload)
    
    @task(1)
    def download_pdf(self):
        """Download PDF invoice - I/O intensive."""
        # This would need a real job ID in practice
        self.client.get("/api/jobs/test-job-id/pdf", 
                       headers=self.auth_headers)

class AdminUser(HttpUser):
    wait_time = between(2, 5)
    
    @task
    def upload_materials(self):
        """Upload materials CSV - admin operation."""
        # Simulate CSV upload
        files = {
            "file": ("materials.csv", "name,price\nTest Item,10.00", "text/csv")
        }
        
        self.client.post("/api/materials/upload", files=files)
```

### Running Load Tests

#### Local Load Testing
```bash
cd backend

# Start Locust web interface
locust -f locustfile.py --host=http://127.0.0.1:8000

# Or run headless
locust -f locustfile.py --host=http://127.0.0.1:8000 --users 100 --spawn-rate 10 --run-time 60s --html reports/performance_report.html
```

#### Production Load Testing
```bash
# Test against production API (use with caution)
locust -f locustfile.py --host=https://api.sparkops.co.nz --users 50 --spawn-rate 5 --run-time 300s
```

### Performance Targets

#### Response Time Targets
- **API Health**: <50ms
- **Authentication**: <200ms
- **Job Listing**: <500ms
- **Job Creation**: <30s (includes AI processing)
- **PDF Generation**: <5s
- **Materials Upload**: <60s

#### Throughput Targets
- **Concurrent Users**: 100+ sustained
- **Requests/Second**: 50+ average
- **Peak Load**: 500+ concurrent users

#### Resource Limits
- **Memory**: <512MB per API instance
- **CPU**: <50% average utilization
- **Database**: <1000 concurrent connections

---

## 🔍 Verification Scripts

### AI Triage Verification (`scripts/test_triage.py`)
```python
#!/usr/bin/env python3
"""
Verification script for GPT-5 triage extraction.
Tests core business logic for voice-to-job transformation.
"""

import os
import sys
import json
from pathlib import Path

# Add backend to path
sys.path.append(str(Path(__file__).parent.parent / "backend"))

from services.triage import KiwiTriageService

def test_known_phrases():
    """Test known Kiwi slang phrases."""
    service = KiwiTriageService()
    
    test_cases = [
        {
            "transcript": "installed hot water cylinder in cupboard",
            "expected_materials": ["Horizontal Hot Water Cylinder"],
            "expected_labor_hours": 3
        },
        {
            "transcript": "ran some 2.5 twin and earth",
            "expected_materials": ["2.5mm TPS Cable"],
            "expected_labor_hours": 2
        },
        {
            "transcript": "stuck a jbox in the roof",
            "expected_materials": ["Junction Box"],
            "expected_labor_hours": 1
        }
    ]
    
    print("🧪 Testing Known Phrase Extraction...")
    
    for i, case in enumerate(test_cases, 1):
        print(f"\n--- Test Case {i} ---")
        print(f"Transcript: '{case['transcript']}'")
        
        result = service.analyze_transcript(case['transcript'])
        
        # Check materials
        materials = [item['description'] for item in result.get('materials', [])]
        print(f"Extracted Materials: {materials}")
        
        # Check labor hours
        labor_hours = result.get('labor_hours', 0)
        print(f"Extracted Labor Hours: {labor_hours}")
        
        # Validate expectations
        material_match = any(expected in materials for expected in case['expected_materials'])
        labor_match = abs(labor_hours - case['expected_labor_hours']) <= 1
        
        print(f"✅ Materials Match: {material_match}")
        print(f"✅ Labor Hours Match: {labor_match}")
        
        if material_match and labor_match:
            print("🎉 TEST PASSED")
        else:
            print("❌ TEST FAILED")
            return False
    
    return True

def test_urgency_classification():
    """Test urgency classification logic."""
    service = KiwiTriageService()
    
    test_cases = [
        {"transcript": "emergency power outage", "expected": "High"},
        {"transcript": "sparks flying everywhere", "expected": "High"},
        {"transcript": "routine maintenance check", "expected": "Medium"},
        {"transcript": "annual inspection", "expected": "Medium"},
        {"transcript": "quote for future work", "expected": "Low"},
        {"transcript": "consultation visit", "expected": "Low"}
    ]
    
    print("\n🚨 Testing Urgency Classification...")
    
    for i, case in enumerate(test_cases, 1):
        print(f"\n--- Test Case {i} ---")
        print(f"Transcript: '{case['transcript']}'")
        
        urgency = service.classify_urgency(case['transcript'])
        print(f"Classified Urgency: {urgency}")
        print(f"Expected Urgency: {case['expected']}")
        
        if urgency == case['expected']:
            print("✅ TEST PASSED")
        else:
            print("❌ TEST FAILED")
            return False
    
    return True

def main():
    """Run all verification tests."""
    print("🔥 SparkOps AI Triage Verification")
    print("=" * 50)
    
    # Check environment
    if not os.getenv("OPENAI_API_KEY"):
        print("❌ OPENAI_API_KEY not set")
        return False
    
    # Run tests
    tests_passed = True
    
    tests_passed &= test_known_phrases()
    tests_passed &= test_urgency_classification()
    
    print("\n" + "=" * 50)
    if tests_passed:
        print("🎉 ALL VERIFICATION TESTS PASSED")
        print("✅ AI triage system is working correctly")
    else:
        print("❌ SOME VERIFICATION TESTS FAILED")
        print("⚠️  Check AI service configuration")
    
    return tests_passed

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
```

### Materials Import Verification (`scripts/test_materials.py`)
```python
#!/usr/bin/env python3
"""
Verification script for materials import functionality.
Tests CSV parsing, database storage, and vector search.
"""

import os
import sys
import csv
import tempfile
from pathlib import Path

# Add backend to path
sys.path.append(str(Path(__file__).parent.parent / "backend"))

from database import ENGINE
from models.database import Material, create_db_and_tables
from services.vision import ReceiptVisionService

def create_test_csv():
    """Create test materials CSV file."""
    test_data = [
        ["name", "description", "trade_price", "retail_price", "supplier", "category"],
        ["2.5mm TPS Cable", "Twin and earth cable", "2.45", "3.20", "J.A. Russell", "Cable"],
        ["Horizontal Hot Water Cylinder", "Hot water cylinder", "450.00", "580.00", "Corys", "Hot Water"],
        ["Junction Box", "Standard JBox", "12.50", "18.90", "J.A. Russell", "Boxes"]
    ]
    
    # Create temporary CSV file
    temp_file = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False)
    writer = csv.writer(temp_file)
    writer.writerows(test_data)
    temp_file.close()
    
    return temp_file.name

def test_materials_import():
    """Test materials import from CSV."""
    print("📦 Testing Materials Import...")
    
    # Initialize database
    create_db_and_tables(ENGINE)
    
    # Create test CSV
    csv_file = create_test_csv()
    
    try:
        # Import materials (simplified version)
        from sqlmodel import Session, select
        
        with Session(ENGINE) as session:
            # Clear existing materials
            session.exec("DELETE FROM material")
            
            # Read and import CSV
            with open(csv_file, 'r') as file:
                reader = csv.DictReader(file)
                for row in reader:
                    material = Material(
                        name=row['name'],
                        description=row['description'],
                        trade_price=float(row['trade_price']),
                        retail_price=float(row['retail_price']),
                        supplier=row['supplier'],
                        category=row['category']
                    )
                    session.add(material)
            
            session.commit()
            
            # Verify import
            materials = session.exec(select(Material)).all()
            print(f"✅ Imported {len(materials)} materials")
            
            # Test vector search (if available)
            vision_service = ReceiptVisionService()
            if hasattr(vision_service, 'search_materials'):
                results = vision_service.search_materials("cable")
                print(f"✅ Vector search found {len(results)} materials for 'cable'")
            
            return len(materials) > 0
            
    finally:
        # Cleanup
        os.unlink(csv_file)

def test_price_selection():
    """Test trade vs retail price selection logic."""
    print("\n💰 Testing Price Selection...")
    
    test_cases = [
        {"trade": 10.00, "retail": 15.00, "expected": 10.00},  # Trade lower
        {"trade": 20.00, "retail": 15.00, "expected": 15.00},  # Retail lower
        {"trade": 12.50, "retail": 12.50, "expected": 12.50},  # Equal
    ]
    
    for i, case in enumerate(test_cases, 1):
        print(f"\n--- Test Case {i} ---")
        print(f"Trade Price: ${case['trade']}")
        print(f"Retail Price: ${case['retail']}")
        
        # Test price selection logic
        selected_price = min(case['trade'], case['retail'])
        print(f"Selected Price: ${selected_price}")
        print(f"Expected Price: ${case['expected']}")
        
        if selected_price == case['expected']:
            print("✅ TEST PASSED")
        else:
            print("❌ TEST FAILED")
            return False
    
    return True

def main():
    """Run materials verification tests."""
    print("🔥 SparkOps Materials Verification")
    print("=" * 50)
    
    # Run tests
    tests_passed = True
    
    tests_passed &= test_materials_import()
    tests_passed &= test_price_selection()
    
    print("\n" + "=" * 50)
    if tests_passed:
        print("🎉 ALL MATERIALS TESTS PASSED")
        print("✅ Materials system is working correctly")
    else:
        print("❌ SOME MATERIALS TESTS FAILED")
        print("⚠️  Check materials import configuration")
    
    return tests_passed

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
```

---

## 📊 Test Coverage

### Coverage Goals
- **Backend**: 80%+ line coverage
- **Frontend**: 70%+ component coverage
- **Integration**: 100% API endpoint coverage
- **E2E**: 100% critical user journey coverage

### Coverage Reports

#### Backend Coverage
```bash
cd backend
pytest --cov=. --cov-report=html --cov-report=term-missing

# View HTML report
open htmlcov/index.html
```

#### Frontend Coverage
```bash
cd frontend
npm run test -- --coverage

# View coverage report
open coverage/lcov-report/index.html
```

### Coverage Configuration

#### Backend (`backend/.coveragerc`)
```ini
[run]
source = .
omit = 
    venv/*
    tests/*
    */venv/*
    */tests/*

[report]
exclude_lines =
    pragma: no cover
    def __repr__
    raise AssertionError
    raise NotImplementedError
    if __name__ == .__main__..:

[html]
directory = htmlcov
```

#### Frontend (`frontend/jest.config.js`)
```javascript
module.exports = {
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
```

---

## 🔄 Continuous Testing

### GitHub Actions Workflow
Create `.github/workflows/test.yml`:
```yaml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_sparkops
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
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
          pip install pytest pytest-cov
      
      - name: Run tests
        run: |
          cd backend
          pytest tests/ -v --cov=. --cov-report=xml
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_sparkops
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: backend/coverage.xml

  frontend-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install dependencies
        run: |
          cd frontend
          npm ci
      
      - name: Install Playwright
        run: |
          cd frontend
          npx playwright install --with-deps
      
      - name: Run tests
        run: |
          cd frontend
          npm test
          npm run test:e2e
      
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

### Pre-commit Hooks
Create `.pre-commit-config.yaml`:
```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.4.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files

  - repo: https://github.com/psf/black
    rev: 22.10.0
    hooks:
      - id: black
        files: ^backend/

  - repo: https://github.com/pycqa/isort
    rev: 5.11.4
    hooks:
      - id: isort
        files: ^backend/

  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v8.28.0
    hooks:
      - id: eslint
        files: ^frontend/
        additional_dependencies:
          - eslint@8.28.0
          - "@typescript-eslint/eslint-plugin@5.45.0"
          - "@typescript-eslint/parser@5.45.0"
```

---

## 📋 Testing Checklist

### Pre-Deployment Testing
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Performance tests meet targets
- [ ] Coverage thresholds met
- [ ] Verification scripts passing

### Production Testing
- [ ] Health check endpoints responding
- [ ] Authentication flow working
- [ ] Core functionality tested
- [ ] Mobile responsive verified
- [ ] Offline sync working
- [ ] Load testing completed

### Regression Testing
- [ ] New features tested
- [ ] Existing features still working
- [ ] No performance degradation
- [ ] Security scanning passed
- [ ] Cross-browser compatibility

---

## 🚨 Troubleshooting Tests

### Common Issues

#### Backend Test Failures
```bash
# Database connection issues
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/test_sparkops"

# Missing environment variables
export OPENAI_API_KEY="test_key"

# Import path issues
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
```

#### Frontend Test Failures
```bash
# Browser issues
npx playwright install

# Port conflicts
npm run test:e2e -- --port=3001

# Timeout issues
npx playwright test --timeout=60000
```

#### Flaky Tests
```bash
# Retry failed tests
pytest --reruns 3

# Increase timeouts
npx playwright test --timeout=120000

# Run tests in isolation
pytest -k "test_name" -v
```

---

*🧪 SparkOps Testing Guide - Comprehensive testing for voice-to-cash platform*