#!/usr/bin/env python3
"""Enhanced login test with full console capture

Captures all console messages including debug logs from login form
"""

import asyncio
import sys
from playwright.async_api import async_playwright

# Configuration
FRONTEND_URL = "https://proactive-strength-staging.up.railway.app"
TEST_EMAIL = "jimmybobday1@hotmail.com"
TEST_PASSWORD = "Samdoggy1!"

class EnhancedLoginTest:
    def __init__(self):
        self.results = {
            "page_load": False,
            "login_form": False,
            "credentials_filled": False,
            "login_clicked": False,
            "login_success": False,
            "redirect_success": False,
            "console_logs": [],
            "errors": []
        }

    async def run_test(self) -> dict:
        """Run enhanced login test with full console capture"""
        print("🔍 Starting Enhanced Login Test")
        print("=" * 60)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            # Capture ALL console messages
            page.on("console", lambda msg: self.capture_console(msg))
            page.on("pageerror", lambda err: self.capture_error(err))
            
            try:
                # Step 1: Load login page
                await self.test_page_load(page)
                
                # Step 2: Fill form
                if self.results["page_load"]:
                    await self.test_fill_form(page)
                
                # Step 3: Submit login
                if self.results["credentials_filled"]:
                    await self.test_login_submit(page)
                
                # Step 4: Wait for redirect
                if self.results["login_clicked"]:
                    await self.test_redirect(page)
                
            except Exception as e:
                self.add_error(f"Test failed: {e}")
            
            finally:
                await browser.close()
        
        # Print results
        self.print_results()
        return self.results

    async def test_page_load(self, page):
        """Test login page load"""
        print("🌐 Testing Login Page Load...")
        try:
            response = await page.goto(f"{FRONTEND_URL}/login", wait_until="networkidle")
            
            if response.status == 200:
                print("✅ Login page loaded successfully")
                self.results["page_load"] = True
                
                # Wait for dynamic content
                await page.wait_for_timeout(2000)
                
                # Check for form elements
                email_input = await page.query_selector('input[type="email"]')
                password_input = await page.query_selector('input[type="password"]')
                login_button = await page.query_selector('button[type="submit"]')
                
                if all([email_input, password_input, login_button]):
                    print("✅ Login form elements found")
                    self.results["login_form"] = True
                else:
                    self.add_error("Login form elements not found")
            else:
                self.add_error(f"Login page failed to load: {response.status}")
        except Exception as e:
            self.add_error(f"Page load failed: {e}")

    async def test_fill_form(self, page):
        """Test filling the login form"""
        print("⌨️  Testing Form Fill...")
        try:
            await page.fill('input[type="email"]', TEST_EMAIL)
            await page.fill('input[type="password"]', TEST_PASSWORD)
            
            print("✅ Credentials filled successfully")
            self.results["credentials_filled"] = True
        except Exception as e:
            self.add_error(f"Form fill failed: {e}")

    async def test_login_submit(self, page):
        """Test login form submission"""
        print("🖱️  Testing Login Submit...")
        try:
            # Clear console logs before login
            self.results["console_logs"] = []
            
            # Click login button
            await page.click('button[type="submit"]')
            
            print("✅ Login button clicked")
            self.results["login_clicked"] = True
            
            # Wait for authentication to process
            await page.wait_for_timeout(3000)
            
        except Exception as e:
            self.add_error(f"Login submit failed: {e}")

    async def test_redirect(self, page):
        """Test redirect after login"""
        print("🔄 Testing Redirect...")
        try:
            # Check current URL
            current_url = page.url
            print(f"📍 Current URL: {current_url}")
            
            if "/login" not in current_url:
                print("✅ Redirect successful - no longer on login page")
                self.results["login_success"] = True
                self.results["redirect_success"] = True
            else:
                print("❌ Still on login page")
                
                # Check for any error messages
                error_elements = await page.query_selector('[role="alert"], .error, .text-red-600')
                if error_elements:
                    error_text = await error_elements.text_content()
                    print(f"❌ Error message found: {error_text}")
                    self.add_error(f"Login error: {error_text}")
                else:
                    print("⚠️  No error message visible - checking console logs")
                    
        except Exception as e:
            self.add_error(f"Redirect test failed: {e}")

    def capture_console(self, msg):
        """Capture all console messages"""
        log_entry = {
            "type": msg.type,
            "text": msg.text,
            "location": msg.location
        }
        self.results["console_logs"].append(log_entry)
        
        # Print important messages
        if msg.type == "error":
            print(f"🔴 Console Error: {msg.text}")
        elif msg.type == "warning":
            print(f"🟡 Console Warning: {msg.text}")
        elif "login" in msg.text.lower() or "redirect" in msg.text.lower():
            print(f"📝 Console Log: {msg.text}")

    def capture_error(self, err):
        """Capture page errors"""
        error_msg = f"Page Error: {err}"
        print(f"❌ {error_msg}")
        self.results["errors"].append(error_msg)

    def add_error(self, error: str):
        """Add error to results"""
        print(f"❌ {error}")
        self.results["errors"].append(error)

    def print_results(self):
        """Print comprehensive test results"""
        print("\n" + "=" * 60)
        print("📊 ENHANCED LOGIN TEST RESULTS")
        print("=" * 60)
        
        steps = [
            ("Page Load", self.results["page_load"]),
            ("Login Form", self.results["login_form"]),
            ("Credentials Filled", self.results["credentials_filled"]),
            ("Login Clicked", self.results["login_clicked"]),
            ("Login Success", self.results["login_success"]),
            ("Redirect Success", self.results["redirect_success"])
        ]
        
        total_tests = len(steps)
        passed_tests = sum(success for _, success in steps)
        
        for step_name, success in steps:
            status = "✅" if success else "❌"
            print(f"{status} {step_name}")
        
        print(f"\n📈 Success Rate: {passed_tests}/{total_tests} tests passed")
        
        # Show console logs
        if self.results["console_logs"]:
            print(f"\n📝 Console Logs ({len(self.results['console_logs'])}):")
            for i, log in enumerate(self.results["console_logs"], 1):
                icon = "🔴" if log["type"] == "error" else "🟡" if log["type"] == "warning" else "📝"
                print(f"  {icon} {log['text']}")
        
        # Show errors
        if self.results["errors"]:
            print(f"\n❌ Errors ({len(self.results['errors'])}):")
            for i, error in enumerate(self.results["errors"], 1):
                print(f"  {i}. {error}")
        
        # Overall assessment
        if passed_tests == total_tests:
            print(f"\n🎉 ALL TESTS PASSED! Login is working perfectly!")
        elif passed_tests >= 4:
            print(f"\n⚠️  Partial success - need to investigate console logs")
        else:
            print(f"\n❌ Major issues - login system needs fixes")

async def main():
    """Main test runner"""
    tester = EnhancedLoginTest()
    results = await tester.run_test()
    
    sys.exit(0 if results["redirect_success"] else 1)

if __name__ == "__main__":
    asyncio.run(main())