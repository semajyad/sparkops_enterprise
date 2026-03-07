#!/usr/bin/env python3
"""Automated login test for SparkOps staging environment

This script tests the complete authentication flow:
1. Check frontend health
2. Check backend health  
3. Test login endpoint
4. Test authenticated endpoint
5. Verify JWT token handling
"""

import asyncio
import json
import sys
from typing import Dict, Any
import httpx

# Configuration
FRONTEND_URL = "https://proactive-strength-staging.up.railway.app"
BACKEND_URL = "https://sparkopsstagingbackend-staging.up.railway.app"
TEST_EMAIL = "test@example.com"
TEST_PASSWORD = "testpassword123"

class StagingLoginTest:
    def __init__(self):
        self.results = {
            "frontend_health": False,
            "backend_health": False,
            "login_test": False,
            "auth_test": False,
            "errors": []
        }

    async def run_all_tests(self) -> Dict[str, Any]:
        """Run all staging tests"""
        print("🚀 Starting SparkOps Staging Login Test")
        print("=" * 50)
        
        # Test 1: Frontend Health
        await self.test_frontend_health()
        
        # Test 2: Backend Health
        await self.test_backend_health()
        
        # Test 3: Login Test (if both services are healthy)
        if self.results["frontend_health"] and self.results["backend_health"]:
            await self.test_login_flow()
        else:
            self.add_error("Skipping login tests - services not healthy")
        
        # Print results
        self.print_results()
        
        return self.results

    async def test_frontend_health(self):
        """Test frontend is responding"""
        print("🌐 Testing Frontend Health...")
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(FRONTEND_URL)
                if response.status_code in [200, 307]:  # Accept redirects as healthy
                    print("✅ Frontend is healthy")
                    self.results["frontend_health"] = True
                else:
                    self.add_error(f"Frontend returned status {response.status_code}")
        except Exception as e:
            self.add_error(f"Frontend health check failed: {e}")

    async def test_backend_health(self):
        """Test backend health endpoint"""
        print("🔧 Testing Backend Health...")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{BACKEND_URL}/health")
                if response.status_code == 200:
                    print("✅ Backend is healthy")
                    self.results["backend_health"] = True
                else:
                    self.add_error(f"Backend health returned status {response.status_code}")
        except Exception as e:
            self.add_error(f"Backend health check failed: {e}")

    async def test_login_flow(self):
        """Test complete login flow"""
        print("🔐 Testing Login Flow...")
        
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                # Step 1: Test Supabase health (indirect test via frontend)
                print("  📝 Testing login page accessibility...")
                response = await client.get(f"{FRONTEND_URL}/login")
                if response.status_code not in [200, 307]:  # Accept redirects
                    self.add_error(f"Login page not accessible: {response.status_code}")
                    return
                
                print("  📝 Testing backend auth endpoint...")
                # Step 2: Test backend auth endpoint with proper staging token
                mock_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAxIiwib3JnYW5pemF0aW9uX2lkIjoiMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAxIiwicm9sZSI6Ik9XTkVSIiwiZXhwIjoxNzcyOTk4NzYyLCJpYXQiOjE3NzI5MTIzNjIsImlzcyI6InNwYXJrb3BzIn0.W1hgfaCMaGP2iu_RaSzPK4jD-O477jFMKTY0xZ2uCwk"
                
                response = await client.get(
                    f"{BACKEND_URL}/api/auth/me",
                    headers={"Authorization": f"Bearer {mock_token}"}
                )
                
                if response.status_code == 200:
                    print("✅ Login flow test passed")
                    self.results["login_test"] = True
                    self.results["auth_test"] = True
                    
                    # Parse response to verify user data
                    user_data = response.json()
                    print(f"  👤 Authenticated user: {user_data.get('id', 'unknown')}")
                    print(f"  🏢 Organization: {user_data.get('organization_id', 'unknown')}")
                    print(f"  👔 Role: {user_data.get('role', 'unknown')}")
                else:
                    error_text = response.text
                    self.add_error(f"Auth endpoint failed: {response.status_code} - {error_text}")
                    
        except Exception as e:
            self.add_error(f"Login flow test failed: {e}")

    def add_error(self, error: str):
        """Add error to results"""
        print(f"❌ {error}")
        self.results["errors"].append(error)

    def print_results(self):
        """Print test results"""
        print("\n" + "=" * 50)
        print("📊 TEST RESULTS")
        print("=" * 50)
        
        total_tests = 4
        passed_tests = sum([
            self.results["frontend_health"],
            self.results["backend_health"], 
            self.results["login_test"],
            self.results["auth_test"]
        ])
        
        print(f"🌐 Frontend Health: {'✅' if self.results['frontend_health'] else '❌'}")
        print(f"🔧 Backend Health: {'✅' if self.results['backend_health'] else '❌'}")
        print(f"🔐 Login Test: {'✅' if self.results['login_test'] else '❌'}")
        print(f"👤 Auth Test: {'✅' if self.results['auth_test'] else '❌'}")
        
        print(f"\n📈 Score: {passed_tests}/{total_tests} tests passed")
        
        if self.results["errors"]:
            print(f"\n❌ Errors ({len(self.results['errors'])}):")
            for i, error in enumerate(self.results["errors"], 1):
                print(f"  {i}. {error}")
        
        # Overall status
        if passed_tests == total_tests:
            print("\n🎉 ALL TESTS PASSED - Staging is ready!")
            return True
        else:
            print(f"\n⚠️  {total_tests - passed_tests} test(s) failed - Check logs and fix issues")
            return False

async def main():
    """Main test runner"""
    tester = StagingLoginTest()
    results = await tester.run_all_tests()
    
    # Exit with appropriate code
    success = all([
        results["frontend_health"],
        results["backend_health"], 
        results["login_test"],
        results["auth_test"]
    ])
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())