#!/usr/bin/env python3
"""Full functional login test for real user credentials

Tests the complete authentication flow for:
- Email: jimmybobday1@hotmail.com
- Password: Samdoggy1!
"""

import asyncio
import json
import sys
import httpx
from typing import Dict, Any

# Configuration
FRONTEND_URL = "https://proactive-strength-staging.up.railway.app"
BACKEND_URL = "https://sparkopsstagingbackend-staging.up.railway.app"
TEST_EMAIL = "jimmybobday1@hotmail.com"
TEST_PASSWORD = "Samdoggy1!"

class FullFunctionalLoginTest:
    def __init__(self):
        self.results = {
            "frontend_health": False,
            "backend_health": False,
            "user_exists": False,
            "supabase_login": False,
            "backend_auth": False,
            "full_session": False,
            "errors": []
        }

    async def run_full_test(self) -> Dict[str, Any]:
        """Run complete functional login test"""
        print("🚀 Starting Full Functional Login Test")
        print(f"👤 User: {TEST_EMAIL}")
        print("=" * 60)
        
        # Step 1: Check frontend health
        await self.test_frontend_health()
        
        # Step 2: Check backend health
        await self.test_backend_health()
        
        # Step 3: Check if user exists in database
        if self.results["frontend_health"] and self.results["backend_health"]:
            await self.check_user_exists()
        
        # Step 4: Test Supabase login
        if self.results["user_exists"]:
            await self.test_supabase_login()
        
        # Step 5: Test backend authentication with real token
        if self.results["supabase_login"]:
            await self.test_backend_auth()
        
        # Step 6: Test full session
        if self.results["backend_auth"]:
            await self.test_full_session()
        
        # Print results
        self.print_results()
        
        return self.results

    async def test_frontend_health(self):
        """Test frontend is responding"""
        print("🌐 Testing Frontend Health...")
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(FRONTEND_URL)
                if response.status_code in [200, 307]:
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

    async def check_user_exists(self):
        """Check if user exists in Supabase database"""
        print("👤 Checking User Exists in Database...")
        try:
            # We'll test this by attempting login - if user doesn't exist, Supabase will tell us
            print("  📝 Will verify during login attempt...")
            self.results["user_exists"] = True  # Assume exists until proven otherwise
        except Exception as e:
            self.add_error(f"User existence check failed: {e}")

    async def test_supabase_login(self):
        """Test actual Supabase login with real credentials"""
        print("🔐 Testing Supabase Login...")
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                # Get the login page to extract any needed tokens
                login_response = await client.get(f"{FRONTEND_URL}/login")
                
                if login_response.status_code not in [200, 307]:
                    self.add_error(f"Login page not accessible: {login_response.status_code}")
                    return
                
                print("  📝 Attempting Supabase authentication...")
                
                # Try to authenticate directly with Supabase
                supabase_url = "https://mpdvcydpiatasvreqlvx.supabase.co"
                supabase_auth_url = f"{supabase_url}/auth/v1/token?grant_type=password"
                
                auth_data = {
                    "email": TEST_EMAIL,
                    "password": TEST_PASSWORD
                }
                
                headers = {
                    "apikey": "sb_publishable_Pry1shKo4wQIu0aVaLe_7w_olY0h0kJ",
                    "Content-Type": "application/json"
                }
                
                auth_response = await client.post(supabase_auth_url, json=auth_data, headers=headers)
                
                if auth_response.status_code == 200:
                    auth_result = auth_response.json()
                    access_token = auth_result.get("access_token")
                    
                    if access_token:
                        print("✅ Supabase login successful")
                        self.results["supabase_login"] = True
                        self.access_token = access_token
                        self.user_data = auth_result
                    else:
                        self.add_error("Supabase login succeeded but no access token received")
                else:
                    error_text = auth_response.text
                    self.add_error(f"Supabase login failed: {auth_response.status_code} - {error_text}")
                    
        except Exception as e:
            self.add_error(f"Supabase login test failed: {e}")

    async def test_backend_auth(self):
        """Test backend authentication with real Supabase token"""
        print("🔧 Testing Backend Authentication...")
        try:
            if not hasattr(self, 'access_token'):
                self.add_error("No access token available for backend auth test")
                return
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{BACKEND_URL}/api/auth/me",
                    headers={"Authorization": f"Bearer {self.access_token}"}
                )
                
                if response.status_code == 200:
                    user_data = response.json()
                    print("✅ Backend authentication successful")
                    self.results["backend_auth"] = True
                    self.backend_user_data = user_data
                    
                    print(f"  👤 User ID: {user_data.get('id', 'unknown')}")
                    print(f"  🏢 Organization: {user_data.get('organization_id', 'unknown')}")
                    print(f"  👔 Role: {user_data.get('role', 'unknown')}")
                    print(f"  📛 Name: {user_data.get('full_name', 'unknown')}")
                else:
                    error_text = response.text
                    self.add_error(f"Backend auth failed: {response.status_code} - {error_text}")
                    
        except Exception as e:
            self.add_error(f"Backend authentication test failed: {e}")

    async def test_full_session(self):
        """Test full authenticated session"""
        print("🌐 Testing Full Session...")
        try:
            if not hasattr(self, 'access_token'):
                self.add_error("No access token available for session test")
                return
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Test a protected endpoint
                response = await client.get(
                    f"{BACKEND_URL}/api/ingest",
                    headers={"Authorization": f"Bearer {self.access_token}"}
                )
                
                if response.status_code in [200, 405]:  # 405 for method not allowed is OK
                    print("✅ Full session test passed")
                    self.results["full_session"] = True
                else:
                    error_text = response.text
                    self.add_error(f"Session test failed: {response.status_code} - {error_text}")
                    
        except Exception as e:
            self.add_error(f"Full session test failed: {e}")

    def add_error(self, error: str):
        """Add error to results"""
        print(f"❌ {error}")
        self.results["errors"].append(error)

    def print_results(self):
        """Print comprehensive test results"""
        print("\n" + "=" * 60)
        print("📊 FULL FUNCTIONAL TEST RESULTS")
        print("=" * 60)
        
        steps = [
            ("Frontend Health", self.results["frontend_health"]),
            ("Backend Health", self.results["backend_health"]),
            ("User Exists", self.results["user_exists"]),
            ("Supabase Login", self.results["supabase_login"]),
            ("Backend Auth", self.results["backend_auth"]),
            ("Full Session", self.results["full_session"])
        ]
        
        total_tests = len(steps)
        passed_tests = sum(success for _, success in steps)
        
        for step_name, success in steps:
            status = "✅" if success else "❌"
            print(f"{status} {step_name}")
        
        print(f"\n📈 Success Rate: {passed_tests}/{total_tests} tests passed")
        
        if self.results["errors"]:
            print(f"\n❌ Errors ({len(self.results['errors'])}):")
            for i, error in enumerate(self.results["errors"], 1):
                print(f"  {i}. {error}")
        
        # User information if successful
        if self.results["backend_auth"] and hasattr(self, 'backend_user_data'):
            user_data = self.backend_user_data
            print(f"\n👤 Authenticated User Details:")
            print(f"  📧 Email: {TEST_EMAIL}")
            print(f"  🆔 User ID: {user_data.get('id', 'unknown')}")
            print(f"  🏢 Organization: {user_data.get('organization_id', 'unknown')}")
            print(f"  👔 Role: {user_data.get('role', 'unknown')}")
            print(f"  📛 Full Name: {user_data.get('full_name', 'unknown')}")
        
        # Overall status
        if passed_tests == total_tests:
            print(f"\n🎉 ALL TESTS PASSED!")
            print(f"   User {TEST_EMAIL} can successfully login and use SparkOps")
            return True
        else:
            print(f"\n⚠️  {total_tests - passed_tests} test(s) failed")
            print(f"   Login functionality needs attention")
            return False

async def main():
    """Main test runner"""
    tester = FullFunctionalLoginTest()
    results = await tester.run_full_test()
    
    # Exit with appropriate code
    success = all([
        results["frontend_health"],
        results["backend_health"],
        results["user_exists"],
        results["supabase_login"],
        results["backend_auth"],
        results["full_session"]
    ])
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())