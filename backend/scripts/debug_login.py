#!/usr/bin/env python3
"""Detailed frontend login debugging test

Tests the login process with detailed logging to identify issues
"""

import asyncio
import sys
from playwright.async_api import async_playwright

# Configuration
FRONTEND_URL = "https://proactive-strength-staging.up.railway.app"
TEST_EMAIL = "jimmybobday1@hotmail.com"
TEST_PASSWORD = "Samdoggy1!"

class DetailedLoginDebugTest:
    def __init__(self):
        self.results = {
            "page_load": False,
            "console_errors": [],
            "network_requests": [],
            "login_response": None,
            "redirect_url": None,
            "errors": []
        }

    async def run_debug_test(self) -> dict:
        """Run detailed login debugging"""
        print("🔍 Starting Detailed Login Debug Test")
        print("=" * 60)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            # Capture console errors and network requests
            page.on("console", lambda msg: self.log_console(msg))
            page.on("request", lambda req: self.log_request(req))
            page.on("response", lambda res: self.log_response(res))
            
            try:
                # Step 1: Load login page
                await self.test_page_load(page)
                
                # Step 2: Fill and submit login form
                if self.results["page_load"]:
                    await self.test_login_process(page)
                
                # Step 3: Analyze results
                await self.analyze_results()
                
            except Exception as e:
                self.add_error(f"Debug test failed: {e}")
            
            finally:
                await browser.close()
        
        # Print results
        self.print_results()
        return self.results

    async def test_page_load(self, page):
        """Test login page load with detailed logging"""
        print("🌐 Testing Login Page Load...")
        try:
            response = await page.goto(f"{FRONTEND_URL}/login", wait_until="networkidle")
            
            if response.status == 200:
                print("✅ Login page loaded successfully")
                self.results["page_load"] = True
                
                # Check page content
                await page.wait_for_timeout(2000)  # Wait for dynamic content
                
                # Look for Supabase client initialization
                page_content = await page.content()
                if "supabase" in page_content.lower():
                    print("✅ Supabase client detected in page")
                else:
                    print("⚠️  Supabase client not detected in page")
                
            else:
                self.add_error(f"Login page failed to load: {response.status}")
        except Exception as e:
            self.add_error(f"Page load failed: {e}")

    async def test_login_process(self, page):
        """Test login process with detailed monitoring"""
        print("🔐 Testing Login Process...")
        try:
            # Find form elements
            email_input = await page.query_selector('input[type="email"]')
            password_input = await page.query_selector('input[type="password"]')
            login_button = await page.query_selector('button[type="submit"]')
            
            if not all([email_input, password_input, login_button]):
                self.add_error("Login form elements not found")
                return
            
            # Fill credentials
            await email_input.fill(TEST_EMAIL)
            await password_input.fill(TEST_PASSWORD)
            
            print(f"✅ Credentials filled: {TEST_EMAIL}")
            
            # Clear network requests before login
            self.results["network_requests"] = []
            
            # Click login button
            await login_button.click()
            print("✅ Login button clicked")
            
            # Wait for response (longer timeout for authentication)
            try:
                await page.wait_for_load_state("networkidle", timeout=15000)
            except:
                print("⚠️  Network idle timeout - checking current state")
            
            # Check final URL
            self.results["redirect_url"] = page.url
            print(f"📍 Final URL: {page.url}")
            
            # Wait a bit more for any delayed responses
            await page.wait_for_timeout(3000)
            
        except Exception as e:
            self.add_error(f"Login process failed: {e}")

    async def analyze_results(self):
        """Analyze the test results"""
        print("🔍 Analyzing Results...")
        
        # Check for successful redirect
        if self.results["redirect_url"] and "/login" not in self.results["redirect_url"]:
            print("✅ Successful redirect from login page")
        else:
            print("❌ Still on login page - login failed")
        
        # Check for Supabase auth requests
        supabase_requests = [req for req in self.results["network_requests"] 
                           if "supabase" in req.get("url", "").lower()]
        
        if supabase_requests:
            print(f"✅ Found {len(supabase_requests)} Supabase requests:")
            for req in supabase_requests:
                print(f"  📡 {req['method']} {req['url']}")
                if req.get('status'):
                    print(f"     Status: {req['status']}")
        else:
            print("❌ No Supabase requests found")
        
        # Check for console errors
        if self.results["console_errors"]:
            print(f"⚠️  Found {len(self.results['console_errors'])} console errors:")
            for error in self.results["console_errors"]:
                print(f"  ❌ {error}")
        else:
            print("✅ No console errors")

    def log_console(self, msg):
        """Log console messages"""
        if msg.type == "error":
            self.results["console_errors"].append(msg.text)
            print(f"🔴 Console Error: {msg.text}")
        elif msg.type == "warning":
            print(f"🟡 Console Warning: {msg.text}")

    def log_request(self, req):
        """Log network requests"""
        self.results["network_requests"].append({
            "url": req.url,
            "method": req.method,
            "headers": dict(req.headers)
        })

    def log_response(self, res):
        """Log network responses"""
        # Find the corresponding request
        for req in self.results["network_requests"]:
            if req["url"] == res.url and req["method"] == res.request.method:
                req["status"] = res.status
                req["status_text"] = res.status_text
                break

    def add_error(self, error: str):
        """Add error to results"""
        print(f"❌ {error}")
        self.results["errors"].append(error)

    def print_results(self):
        """Print detailed debug results"""
        print("\n" + "=" * 60)
        print("📊 DETAILED LOGIN DEBUG RESULTS")
        print("=" * 60)
        
        print(f"🌐 Page Load: {'✅' if self.results['page_load'] else '❌'}")
        print(f"🔴 Console Errors: {len(self.results['console_errors'])}")
        print(f"📡 Network Requests: {len(self.results['network_requests'])}")
        print(f"📍 Final URL: {self.results['redirect_url']}")
        
        # Show Supabase requests
        supabase_requests = [req for req in self.results["network_requests"] 
                           if "supabase" in req.get("url", "").lower()]
        
        if supabase_requests:
            print(f"\n📡 Supabase Requests ({len(supabase_requests)}):")
            for req in supabase_requests:
                status_icon = "✅" if req.get("status") == 200 else "❌"
                print(f"  {status_icon} {req['method']} {req['url']}")
                if req.get('status'):
                    print(f"     Status: {req['status']} {req.get('status_text', '')}")
        
        # Show console errors
        if self.results["console_errors"]:
            print(f"\n🔴 Console Errors ({len(self.results['console_errors'])}):")
            for i, error in enumerate(self.results["console_errors"], 1):
                print(f"  {i}. {error}")
        
        # Show other errors
        if self.results["errors"]:
            print(f"\n❌ Other Errors ({len(self.results['errors'])}):")
            for i, error in enumerate(self.results["errors"], 1):
                print(f"  {i}. {error}")
        
        # Diagnosis
        print(f"\n🔍 Diagnosis:")
        if not supabase_requests:
            print("  ❌ No Supabase requests - client not initialized properly")
        elif any(req.get("status") != 200 for req in supabase_requests):
            print("  ❌ Some Supabase requests failed - check configuration")
        elif self.results["redirect_url"] and "/login" in self.results["redirect_url"]:
            print("  ❌ Login failed - still on login page")
        else:
            print("  ✅ Login process appears successful")

async def main():
    """Main debug test runner"""
    tester = DetailedLoginDebugTest()
    results = await tester.run_debug_test()
    
    sys.exit(0 if len(results["errors"]) == 0 else 1)

if __name__ == "__main__":
    asyncio.run(main())