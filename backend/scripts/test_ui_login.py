#!/usr/bin/env python3
"""Frontend UI login test using Playwright

Tests the actual frontend login interface with real user credentials
"""

import asyncio
import sys
from playwright.async_api import async_playwright

# Configuration
FRONTEND_URL = "https://proactive-strength-staging.up.railway.app"
TEST_EMAIL = "jimmybobday1@hotmail.com"
TEST_PASSWORD = "Samdoggy1!"

class FrontendUILoginTest:
    def __init__(self):
        self.results = {
            "page_load": False,
            "login_form_visible": False,
            "email_entry": False,
            "password_entry": False,
            "login_click": False,
            "login_success": False,
            "dashboard_load": False,
            "errors": []
        }

    async def run_ui_test(self) -> dict:
        """Run complete UI login test"""
        print("🚀 Starting Frontend UI Login Test")
        print(f"👤 User: {TEST_EMAIL}")
        print("=" * 60)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            try:
                # Step 1: Load login page
                await self.test_page_load(page)
                
                # Step 2: Check login form
                if self.results["page_load"]:
                    await self.test_login_form(page)
                
                # Step 3: Fill credentials
                if self.results["login_form_visible"]:
                    await self.test_fill_credentials(page)
                
                # Step 4: Click login
                if self.results["email_entry"] and self.results["password_entry"]:
                    await self.test_login_click(page)
                
                # Step 5: Verify login success
                if self.results["login_click"]:
                    await self.test_login_success(page)
                
                # Step 6: Check dashboard
                if self.results["login_success"]:
                    await self.test_dashboard_load(page)
                
            except Exception as e:
                self.add_error(f"UI test failed: {e}")
            
            finally:
                await browser.close()
        
        # Print results
        self.print_results()
        return self.results

    async def test_page_load(self, page):
        """Test that login page loads"""
        print("🌐 Testing Login Page Load...")
        try:
            response = await page.goto(f"{FRONTEND_URL}/login", wait_until="networkidle")
            
            if response.status == 200:
                print("✅ Login page loaded successfully")
                self.results["page_load"] = True
            else:
                self.add_error(f"Login page failed to load: {response.status}")
        except Exception as e:
            self.add_error(f"Page load failed: {e}")

    async def test_login_form(self, page):
        """Test that login form is visible"""
        print("📝 Testing Login Form Visibility...")
        try:
            # Look for login form elements
            email_input = await page.query_selector('input[type="email"]')
            password_input = await page.query_selector('input[type="password"]')
            login_button = await page.query_selector('button[type="submit"]')
            
            if email_input and password_input and login_button:
                print("✅ Login form is visible")
                self.results["login_form_visible"] = True
                self.email_input = email_input
                self.password_input = password_input
                self.login_button = login_button
            else:
                self.add_error("Login form elements not found")
        except Exception as e:
            self.add_error(f"Login form test failed: {e}")

    async def test_fill_credentials(self, page):
        """Test filling in credentials"""
        print("⌨️  Testing Credential Entry...")
        try:
            # Fill email
            await self.email_input.fill(TEST_EMAIL)
            email_value = await self.email_input.input_value()
            
            if email_value == TEST_EMAIL:
                print("✅ Email entered successfully")
                self.results["email_entry"] = True
            else:
                self.add_error(f"Email entry failed: expected {TEST_EMAIL}, got {email_value}")
                return
            
            # Fill password
            await self.password_input.fill(TEST_PASSWORD)
            password_value = await self.password_input.input_value()
            
            if password_value == TEST_PASSWORD:
                print("✅ Password entered successfully")
                self.results["password_entry"] = True
            else:
                self.add_error("Password entry failed")
                
        except Exception as e:
            self.add_error(f"Credential entry failed: {e}")

    async def test_login_click(self, page):
        """Test clicking login button"""
        print("🖱️  Testing Login Button Click...")
        try:
            # Click login button and wait for navigation
            await self.login_button.click()
            
            # Wait for either navigation or response
            await page.wait_for_load_state("networkidle", timeout=10000)
            
            print("✅ Login button clicked")
            self.results["login_click"] = True
            
        except Exception as e:
            self.add_error(f"Login click failed: {e}")

    async def test_login_success(self, page):
        """Test that login was successful"""
        print("✅ Testing Login Success...")
        try:
            # Wait a bit for login to process
            await page.wait_for_timeout(3000)
            
            # Check current URL - should redirect from /login
            current_url = page.url
            if "/login" not in current_url:
                print("✅ Login successful - redirected from login page")
                self.results["login_success"] = True
            else:
                # Check for error messages
                error_elements = await page.query_selector('[role="alert"], .error, .text-red-600')
                if error_elements:
                    error_text = await error_elements.text_content()
                    self.add_error(f"Login failed with error: {error_text}")
                else:
                    self.add_error("Login failed - still on login page")
                    
        except Exception as e:
            self.add_error(f"Login success test failed: {e}")

    async def test_dashboard_load(self, page):
        """Test that dashboard loads after login"""
        print("📊 Testing Dashboard Load...")
        try:
            # Wait for dashboard elements to load
            await page.wait_for_timeout(2000)
            
            # Look for dashboard elements
            dashboard_elements = [
                "h1", "h2",  # Headings
                ".dashboard", ".main",  # Dashboard containers
                "nav", "header"  # Navigation
            ]
            
            dashboard_found = False
            for selector in dashboard_elements:
                element = await page.query_selector(selector)
                if element:
                    text = await element.text_content()
                    if text and text.strip():
                        dashboard_found = True
                        break
            
            if dashboard_found:
                print("✅ Dashboard loaded successfully")
                self.results["dashboard_load"] = True
            else:
                self.add_error("Dashboard elements not found")
                
        except Exception as e:
            self.add_error(f"Dashboard load test failed: {e}")

    def add_error(self, error: str):
        """Add error to results"""
        print(f"❌ {error}")
        self.results["errors"].append(error)

    def print_results(self):
        """Print UI test results"""
        print("\n" + "=" * 60)
        print("📊 FRONTEND UI LOGIN TEST RESULTS")
        print("=" * 60)
        
        steps = [
            ("Page Load", self.results["page_load"]),
            ("Login Form Visible", self.results["login_form_visible"]),
            ("Email Entry", self.results["email_entry"]),
            ("Password Entry", self.results["password_entry"]),
            ("Login Click", self.results["login_click"]),
            ("Login Success", self.results["login_success"]),
            ("Dashboard Load", self.results["dashboard_load"])
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
        
        # Overall status
        if passed_tests == total_tests:
            print(f"\n🎉 ALL UI TESTS PASSED!")
            print(f"   Frontend login interface works perfectly")
            return True
        else:
            print(f"\n⚠️  {total_tests - passed_tests} test(s) failed")
            print(f"   Frontend UI needs attention")
            return False

async def main():
    """Main UI test runner"""
    tester = FrontendUILoginTest()
    results = await tester.run_ui_test()
    
    # Exit with appropriate code
    success = all([
        results["page_load"],
        results["login_form_visible"],
        results["email_entry"],
        results["password_entry"],
        results["login_click"],
        results["login_success"],
        results["dashboard_load"]
    ])
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())