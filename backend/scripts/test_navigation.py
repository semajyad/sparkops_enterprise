#!/usr/bin/env python3
"""Comprehensive Frontend Navigation Test

Tests login and navigation to all menu items to ensure session persistence
"""

import asyncio
import sys
from playwright.async_api import async_playwright

# Configuration
FRONTEND_URL = "https://proactive-strength-staging.up.railway.app"
TEST_EMAIL = "jimmybobday1@hotmail.com"
TEST_PASSWORD = "Samdoggy1!"

class NavigationTest:
    def __init__(self):
        self.results = {
            "login_success": False,
            "dashboard_access": False,
            "menu_items": {},
            "errors": []
        }

    async def run_test(self) -> dict:
        """Run comprehensive navigation test"""
        print("🧭 Starting Comprehensive Navigation Test")
        print("=" * 60)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            # Capture console messages
            page.on("console", lambda msg: self.log_console(msg))
            
            try:
                # Step 1: Login
                await self.test_login(page)
                
                # Step 2: Test dashboard access
                if self.results["login_success"]:
                    await self.test_dashboard(page)
                
                # Step 3: Test navigation to menu items
                if self.results["dashboard_access"]:
                    await self.test_menu_navigation(page)
                
            except Exception as e:
                self.add_error(f"Navigation test failed: {e}")
            
            finally:
                await browser.close()
        
        # Print results
        self.print_results()
        return self.results

    async def test_login(self, page):
        """Test login process"""
        print("🔐 Testing Login...")
        try:
            await page.goto(f"{FRONTEND_URL}/login", wait_until="networkidle")
            await page.wait_for_timeout(2000)
            
            # Fill and submit login
            await page.fill('input[type="email"]', TEST_EMAIL)
            await page.fill('input[type="password"]', TEST_PASSWORD)
            await page.click('button[type="submit"]')
            
            # Wait for redirect
            try:
                await page.wait_for_url("**/", timeout=10000)
                print("✅ Login successful - redirected to dashboard")
                self.results["login_success"] = True
            except:
                print("❌ Login failed - still on login page")
                self.add_error("Login redirect failed")
                
        except Exception as e:
            self.add_error(f"Login test failed: {e}")

    async def test_dashboard(self, page):
        """Test dashboard access after login"""
        print("📊 Testing Dashboard Access...")
        try:
            # Wait a moment for dashboard to load
            await page.wait_for_timeout(3000)
            
            current_url = page.url
            if "/login" not in current_url:
                print("✅ Dashboard accessible")
                self.results["dashboard_access"] = True
            else:
                print("❌ Redirected back to login")
                self.add_error("Dashboard access failed")
                
        except Exception as e:
            self.add_error(f"Dashboard test failed: {e}")

    async def test_menu_navigation(self, page):
        """Test navigation to common menu items"""
        print("🧭 Testing Menu Navigation...")
        
        # Common routes to test
        routes = [
            ("/", "Dashboard"),
            ("/capture", "Capture Page"),
            ("/jobs", "Jobs Page"),
            ("/settings", "Settings Page"),
            ("/profile", "Profile Page")
        ]
        
        for route, name in routes:
            try:
                print(f"  📍 Testing {name}...")
                
                # Navigate to route
                await page.goto(f"{FRONTEND_URL}{route}", wait_until="networkidle")
                await page.wait_for_timeout(2000)
                
                # Check if still authenticated
                current_url = page.url
                if "/login" not in current_url:
                    print(f"    ✅ {name} accessible")
                    self.results["menu_items"][route] = True
                else:
                    print(f"    ❌ {name} redirected to login")
                    self.results["menu_items"][route] = False
                    self.add_error(f"{name} authentication failed")
                
            except Exception as e:
                print(f"    ❌ {name} test failed: {e}")
                self.results["menu_items"][route] = False
                self.add_error(f"{name} navigation error: {e}")

    def log_console(self, msg):
        """Log relevant console messages"""
        if msg.type == "error":
            print(f"🔴 Console Error: {msg.text}")
        elif "auth" in msg.text.lower() or "session" in msg.text.lower():
            print(f"📝 Console Auth: {msg.text}")

    def add_error(self, error: str):
        """Add error to results"""
        print(f"❌ {error}")
        self.results["errors"].append(error)

    def print_results(self):
        """Print comprehensive results"""
        print("\n" + "=" * 60)
        print("📊 COMPREHENSIVE NAVIGATION TEST RESULTS")
        print("=" * 60)
        
        print(f"🔐 Login Success: {'✅' if self.results['login_success'] else '❌'}")
        print(f"📊 Dashboard Access: {'✅' if self.results['dashboard_access'] else '❌'}")
        
        if self.results["menu_items"]:
            print(f"\n🧭 Menu Navigation Results:")
            total_routes = len(self.results["menu_items"])
            successful_routes = sum(success for success in self.results["menu_items"].values())
            
            for route, success in self.results["menu_items"].items():
                status = "✅" if success else "❌"
                route_name = route.replace("/", "Dashboard") if route == "/" else route.replace("/", "").title()
                print(f"  {status} {route_name}")
            
            print(f"\n📈 Navigation Success Rate: {successful_routes}/{total_routes} routes")
        
        if self.results["errors"]:
            print(f"\n❌ Errors ({len(self.results['errors'])}):")
            for i, error in enumerate(self.results["errors"], 1):
                print(f"  {i}. {error}")
        
        # Overall assessment
        if self.results["login_success"] and self.results["dashboard_access"]:
            if all(self.results["menu_items"].values()):
                print(f"\n🎉 PERFECT! All navigation working correctly!")
            else:
                print(f"\n⚠️  Login works but some routes have authentication issues")
        else:
            print(f"\n❌ Login or dashboard access failing")

async def main():
    """Main test runner"""
    tester = NavigationTest()
    results = await tester.run_test()
    
    # Success if login works and at least dashboard is accessible
    success = results["login_success"] and results["dashboard_access"]
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())