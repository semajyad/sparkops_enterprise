#!/usr/bin/env python3
"""Test login with redirect to dashboard instead of capture

Tests if the issue is with the /capture page or the redirect itself
"""

import asyncio
import sys
from playwright.async_api import async_playwright

# Configuration
FRONTEND_URL = "https://proactive-strength-staging.up.railway.app"
TEST_EMAIL = "jimmybobday1@hotmail.com"
TEST_PASSWORD = "Samdoggy1!"

class DashboardRedirectTest:
    def __init__(self):
        self.results = {
            "login_success": False,
            "redirect_to_dashboard": False,
            "dashboard_load": False,
            "errors": []
        }

    async def run_test(self) -> dict:
        """Run login test with dashboard redirect"""
        print("🚀 Starting Dashboard Redirect Test")
        print("=" * 60)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            # Capture console messages
            page.on("console", lambda msg: self.log_console(msg))
            
            try:
                # Step 1: Go to login page
                await page.goto(f"{FRONTEND_URL}/login", wait_until="networkidle")
                
                # Step 2: Fill and submit login
                await page.fill('input[type="email"]', TEST_EMAIL)
                await page.fill('input[type="password"]', TEST_PASSWORD)
                await page.click('button[type="submit"]')
                
                # Step 3: Wait for redirect
                try:
                    await page.wait_for_url("**/capture", timeout=5000)
                    print("✅ Redirected to /capture")
                    self.results["login_success"] = True
                    
                    # Step 4: Try manual redirect to dashboard
                    await page.goto(f"{FRONTEND_URL}/", wait_until="networkidle")
                    
                    # Check if we're authenticated
                    current_url = page.url
                    if "/login" not in current_url:
                        print("✅ Successfully accessed dashboard")
                        self.results["redirect_to_dashboard"] = True
                        self.results["dashboard_load"] = True
                    else:
                        print("❌ Redirected back to login - not authenticated")
                        
                except:
                    print("⚠️  Did not redirect to /capture within timeout")
                    
                    # Check if we're still on login page
                    current_url = page.url
                    if "/login" in current_url:
                        print("❌ Still on login page")
                    else:
                        print("✅ Redirected somewhere else")
                        self.results["login_success"] = True
                
            except Exception as e:
                self.add_error(f"Test failed: {e}")
            
            finally:
                await browser.close()
        
        # Print results
        self.print_results()
        return self.results

    def log_console(self, msg):
        """Log console messages"""
        if msg.type == "error":
            print(f"🔴 Console Error: {msg.text}")
            self.results["errors"].append(msg.text)
        elif msg.type == "warning":
            print(f"🟡 Console Warning: {msg.text}")

    def add_error(self, error: str):
        """Add error to results"""
        print(f"❌ {error}")
        self.results["errors"].append(error)

    def print_results(self):
        """Print test results"""
        print("\n" + "=" * 60)
        print("📊 DASHBOARD REDIRECT TEST RESULTS")
        print("=" * 60)
        
        print(f"🔐 Login Success: {'✅' if self.results['login_success'] else '❌'}")
        print(f"🏠 Dashboard Access: {'✅' if self.results['redirect_to_dashboard'] else '❌'}")
        print(f"📊 Dashboard Load: {'✅' if self.results['dashboard_load'] else '❌'}")
        
        if self.results["errors"]:
            print(f"\n❌ Errors ({len(self.results['errors'])}):")
            for i, error in enumerate(self.results["errors"], 1):
                print(f"  {i}. {error}")
        
        # Diagnosis
        if self.results["login_success"] and self.results["dashboard_load"]:
            print(f"\n🎉 SUCCESS! Authentication and dashboard access working")
        elif self.results["login_success"]:
            print(f"\n⚠️  Login works but dashboard has issues")
        else:
            print(f"\n❌ Login process failing")

async def main():
    """Main test runner"""
    tester = DashboardRedirectTest()
    results = await tester.run_test()
    
    sys.exit(0 if results["dashboard_load"] else 1)

if __name__ == "__main__":
    asyncio.run(main())