#!/usr/bin/env python3
"""Post-Deployment Frontend Functionality Test

Runs comprehensive tests after each deployment to ensure basic functionality works
"""

import asyncio
import sys
import httpx
from playwright.async_api import async_playwright

# Configuration
FRONTEND_URL = "https://proactive-strength-staging.up.railway.app"
BACKEND_URL = "https://sparkopsstagingbackend-staging.up.railway.app"
TEST_EMAIL = "jimmybobday1@hotmail.com"
TEST_PASSWORD = "Samdoggy1!"

class PostDeploymentTest:
    def __init__(self):
        self.results = {
            "frontend_health": False,
            "backend_health": False,
            "login_page": False,
            "login_functionality": False,
            "dashboard_access": False,
            "navigation_test": False,
            "errors": []
        }

    async def run_test(self) -> dict:
        """Run complete post-deployment test suite"""
        print("🚀 Starting Post-Deployment Functionality Test")
        print("=" * 60)
        
        # Test 1: Frontend Health
        await self.test_frontend_health()
        
        # Test 2: Backend Health
        await self.test_backend_health()
        
        # Test 3: Login Page Access
        if self.results["frontend_health"]:
            await self.test_login_page()
        
        # Test 4: Login Functionality
        if self.results["login_page"]:
            await self.test_login_functionality()
        
        # Test 5: Dashboard Access
        if self.results["login_functionality"]:
            await self.test_dashboard_access()
        
        # Test 6: Navigation Test
        if self.results["dashboard_access"]:
            await self.test_navigation()
        
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
                    self.add_error(f"Frontend health failed: {response.status_code}")
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
                    self.add_error(f"Backend health failed: {response.status_code}")
        except Exception as e:
            self.add_error(f"Backend health check failed: {e}")

    async def test_login_page(self):
        """Test login page is accessible"""
        print("🔐 Testing Login Page Access...")
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(f"{FRONTEND_URL}/login")
                if response.status_code in [200, 307]:
                    print("✅ Login page accessible")
                    self.results["login_page"] = True
                else:
                    self.add_error(f"Login page access failed: {response.status_code}")
        except Exception as e:
            self.add_error(f"Login page test failed: {e}")

    async def test_login_functionality(self):
        """Test login functionality with Playwright"""
        print("🔑 Testing Login Functionality...")
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context()
                page = await context.new_page()
                
                await page.goto(f"{FRONTEND_URL}/login", wait_until="networkidle")
                await page.wait_for_timeout(2000)
                
                # Fill and submit login
                await page.fill('input[type="email"]', TEST_EMAIL)
                await page.fill('input[type="password"]', TEST_PASSWORD)
                await page.click('button[type="submit"]')
                
                # Wait for redirect
                try:
                    await page.wait_for_url("**/", timeout=10000)
                    print("✅ Login functionality working")
                    self.results["login_functionality"] = True
                except:
                    self.add_error("Login functionality failed - no redirect")
                
                await browser.close()
                
        except Exception as e:
            self.add_error(f"Login functionality test failed: {e}")

    async def test_dashboard_access(self):
        """Test dashboard access after login"""
        print("📊 Testing Dashboard Access...")
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context()
                page = await context.new_page()
                
                # Login first
                await page.goto(f"{FRONTEND_URL}/login", wait_until="networkidle")
                await page.fill('input[type="email"]', TEST_EMAIL)
                await page.fill('input[type="password"]', TEST_PASSWORD)
                await page.click('button[type="submit"]')
                
                # Wait for redirect and check dashboard
                await page.wait_for_url("**/", timeout=10000)
                await page.wait_for_timeout(3000)
                
                current_url = page.url
                if "/login" not in current_url:
                    print("✅ Dashboard accessible")
                    self.results["dashboard_access"] = True
                else:
                    self.add_error("Dashboard access failed - redirected to login")
                
                await browser.close()
                
        except Exception as e:
            self.add_error(f"Dashboard access test failed: {e}")

    async def test_navigation(self):
        """Test navigation to key routes"""
        print("🧭 Testing Navigation...")
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context()
                page = await context.new_page()
                
                # Login first
                await page.goto(f"{FRONTEND_URL}/login", wait_until="networkidle")
                await page.fill('input[type="email"]', TEST_EMAIL)
                await page.fill('input[type="password"]', TEST_PASSWORD)
                await page.click('button[type="submit"]')
                await page.wait_for_url("**/", timeout=10000)
                
                # Test key routes
                test_routes = ["/capture", "/jobs", "/settings"]
                success_count = 0
                
                for route in test_routes:
                    await page.goto(f"{FRONTEND_URL}{route}", wait_until="networkidle")
                    await page.wait_for_timeout(2000)
                    
                    if "/login" not in page.url:
                        success_count += 1
                
                if success_count == len(test_routes):
                    print("✅ All navigation routes working")
                    self.results["navigation_test"] = True
                else:
                    self.add_error(f"Navigation test failed: {success_count}/{len(test_routes)} routes working")
                
                await browser.close()
                
        except Exception as e:
            self.add_error(f"Navigation test failed: {e}")

    def add_error(self, error: str):
        """Add error to results"""
        print(f"❌ {error}")
        self.results["errors"].append(error)

    def print_results(self):
        """Print comprehensive test results"""
        print("\n" + "=" * 60)
        print("📊 POST-DEPLOYMENT TEST RESULTS")
        print("=" * 60)
        
        tests = [
            ("Frontend Health", self.results["frontend_health"]),
            ("Backend Health", self.results["backend_health"]),
            ("Login Page", self.results["login_page"]),
            ("Login Functionality", self.results["login_functionality"]),
            ("Dashboard Access", self.results["dashboard_access"]),
            ("Navigation Test", self.results["navigation_test"])
        ]
        
        total_tests = len(tests)
        passed_tests = sum(success for _, success in tests)
        
        for test_name, success in tests:
            status = "✅" if success else "❌"
            print(f"{status} {test_name}")
        
        print(f"\n📈 Overall Success Rate: {passed_tests}/{total_tests} tests passed")
        
        if self.results["errors"]:
            print(f"\n❌ Errors ({len(self.results['errors'])}):")
            for i, error in enumerate(self.results["errors"], 1):
                print(f"  {i}. {error}")
        
        # Final assessment
        if passed_tests == total_tests:
            print(f"\n🎉 DEPLOYMENT SUCCESSFUL!")
            print(f"   All core functionality working perfectly")
        elif passed_tests >= 4:
            print(f"\n⚠️  DEPLOYMENT PARTIALLY SUCCESSFUL")
            print(f"   Core functionality works but some issues exist")
        else:
            print(f"\n❌ DEPLOYMENT FAILED")
            print(f"   Major functionality issues detected")

async def main():
    """Main test runner"""
    tester = PostDeploymentTest()
    results = await tester.run_test()
    
    # Success if core functionality works (login + dashboard)
    success = results["login_functionality"] and results["dashboard_access"]
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())