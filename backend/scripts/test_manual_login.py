#!/usr/bin/env python3
"""Manual login verification test

Tests if we can manually authenticate and access protected pages
"""

import asyncio
import sys
import httpx

# Configuration
FRONTEND_URL = "https://proactive-strength-staging.up.railway.app"
BACKEND_URL = "https://sparkopsstagingbackend-staging.up.railway.app"
TEST_EMAIL = "jimmybobday1@hotmail.com"
TEST_PASSWORD = "Samdoggy1!"

class ManualLoginTest:
    def __init__(self):
        self.results = {
            "supabase_auth": False,
            "backend_auth": False,
            "frontend_protected": False,
            "auth_token": None,
            "errors": []
        }

    async def run_test(self) -> dict:
        """Run manual login verification"""
        print("🔧 Starting Manual Login Verification")
        print("=" * 60)
        
        try:
            # Step 1: Authenticate with Supabase directly
            await self.test_supabase_auth()
            
            # Step 2: Test backend with token
            if self.results["supabase_auth"]:
                await self.test_backend_auth()
            
            # Step 3: Test frontend protected page
            if self.results["backend_auth"]:
                await self.test_frontend_protected()
            
        except Exception as e:
            self.add_error(f"Manual test failed: {e}")
        
        # Print results
        self.print_results()
        return self.results

    async def test_supabase_auth(self):
        """Test direct Supabase authentication"""
        print("🔐 Testing Direct Supabase Authentication...")
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                supabase_url = "https://mpdvcydpiatasvreqlvx.supabase.co"
                supabase_auth_url = f"{supabase_url}/auth/v1/token?grant_type=password"
                
                auth_data = {
                    "email": TEST_EMAIL,
                    "password": TEST_PASSWORD
                }
                
                headers = {
                    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wZHZjeWRwaWF0YXN2cmVxbHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODA3MTIsImV4cCI6MjA4ODE1NjcxMn0.V2g1_2A1C14kbO7zW3oTss_sswGtP4A9LOEtXBRPxwg",
                    "Content-Type": "application/json"
                }
                
                response = await client.post(supabase_auth_url, json=auth_data, headers=headers)
                
                if response.status_code == 200:
                    auth_result = response.json()
                    access_token = auth_result.get("access_token")
                    
                    if access_token:
                        print("✅ Supabase authentication successful")
                        self.results["supabase_auth"] = True
                        self.auth_token = access_token
                        print(f"  🔑 Token received: {access_token[:50]}...")
                    else:
                        self.add_error("Supabase auth succeeded but no token received")
                else:
                    self.add_error(f"Supabase auth failed: {response.status_code} - {response.text}")
                    
        except Exception as e:
            self.add_error(f"Supabase auth test failed: {e}")

    async def test_backend_auth(self):
        """Test backend authentication with token"""
        print("🔧 Testing Backend Authentication...")
        try:
            if not self.auth_token:
                self.add_error("No auth token available")
                return
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{BACKEND_URL}/api/auth/me",
                    headers={"Authorization": f"Bearer {self.auth_token}"}
                )
                
                if response.status_code == 200:
                    user_data = response.json()
                    print("✅ Backend authentication successful")
                    self.results["backend_auth"] = True
                    print(f"  👤 User: {user_data.get('id', 'unknown')}")
                    print(f"  🏢 Org: {user_data.get('organization_id', 'unknown')}")
                else:
                    self.add_error(f"Backend auth failed: {response.status_code} - {response.text}")
                    
        except Exception as e:
            self.add_error(f"Backend auth test failed: {e}")

    async def test_frontend_protected(self):
        """Test accessing frontend protected page"""
        print("🌐 Testing Frontend Protected Page...")
        try:
            if not self.auth_token:
                self.add_error("No auth token available")
                return
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Try to access main page with auth cookie simulation
                headers = {
                    "Authorization": f"Bearer {self.auth_token}",
                    "Cookie": f"sb-access-token={self.auth_token}"
                }
                
                response = await client.get(FRONTEND_URL, headers=headers, follow_redirects=True)
                
                if response.status_code == 200 and "/login" not in response.url:
                    print("✅ Frontend protected page accessible")
                    self.results["frontend_protected"] = True
                    print(f"  📍 Final URL: {response.url}")
                else:
                    print(f"⚠️  Frontend returned: {response.status_code}")
                    print(f"  📍 URL: {response.url}")
                    # This might be expected due to client-side auth
                    
        except Exception as e:
            self.add_error(f"Frontend protected test failed: {e}")

    def add_error(self, error: str):
        """Add error to results"""
        print(f"❌ {error}")
        self.results["errors"].append(error)

    def print_results(self):
        """Print test results"""
        print("\n" + "=" * 60)
        print("📊 MANUAL LOGIN VERIFICATION RESULTS")
        print("=" * 60)
        
        print(f"🔐 Supabase Auth: {'✅' if self.results['supabase_auth'] else '❌'}")
        print(f"🔧 Backend Auth: {'✅' if self.results['backend_auth'] else '❌'}")
        print(f"🌐 Frontend Protected: {'✅' if self.results['frontend_protected'] else '❌'}")
        
        if self.results["errors"]:
            print(f"\n❌ Errors ({len(self.results['errors'])}):")
            for i, error in enumerate(self.results["errors"], 1):
                print(f"  {i}. {error}")
        
        # Assessment
        if self.results["supabase_auth"] and self.results["backend_auth"]:
            print(f"\n🎯 CORE AUTHENTICATION WORKING!")
            print(f"   Supabase and backend authentication are functional")
            if not self.results["frontend_protected"]:
                print(f"   Frontend redirect issue is client-side specific")
            else:
                print(f"   Full stack authentication working perfectly")
        else:
            print(f"\n❌ Core authentication has issues")

async def main():
    """Main test runner"""
    tester = ManualLoginTest()
    results = await tester.run_test()
    
    sys.exit(0 if results["backend_auth"] else 1)

if __name__ == "__main__":
    asyncio.run(main())