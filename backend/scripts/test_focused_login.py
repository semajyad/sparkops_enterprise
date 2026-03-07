#!/usr/bin/env python3
"""Focused login test - capture only login-related console messages

"""

import asyncio
import sys
from playwright.async_api import async_playwright

# Configuration
FRONTEND_URL = "https://proactive-strength-staging.up.railway.app"
TEST_EMAIL = "jimmybobday1@hotmail.com"
TEST_PASSWORD = "Samdoggy1!"

class FocusedLoginTest:
    def __init__(self):
        self.login_logs = []
        self.error_logs = []

    async def run_test(self) -> dict:
        """Run focused test to capture login console messages"""
        print("🎯 Starting Focused Login Test")
        print("=" * 50)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            # Capture only relevant console messages
            page.on("console", lambda msg: self.filter_console(msg))
            
            try:
                # Load login page
                await page.goto(f"{FRONTEND_URL}/login", wait_until="networkidle")
                await page.wait_for_timeout(2000)
                
                # Fill and submit form
                await page.fill('input[type="email"]', TEST_EMAIL)
                await page.fill('input[type="password"]', TEST_PASSWORD)
                
                print("🔐 Submitting login...")
                await page.click('button[type="submit"]')
                
                # Wait for processing
                await page.wait_for_timeout(5000)
                
                # Check final state
                current_url = page.url
                print(f"📍 Final URL: {current_url}")
                
            except Exception as e:
                print(f"❌ Test error: {e}")
            
            finally:
                await browser.close()
        
        # Print results
        self.print_results()
        return {"login_logs": self.login_logs, "error_logs": self.error_logs}

    def filter_console(self, msg):
        """Filter and capture only relevant console messages"""
        text = msg.text.lower()
        
        # Capture login-related messages
        if any(keyword in text for keyword in ["login", "redirect", "attempting", "successful", "error", "failed"]):
            log_entry = f"{msg.type.upper()}: {msg.text}"
            self.login_logs.append(log_entry)
            print(f"📝 {log_entry}")
        
        # Capture errors
        if msg.type == "error":
            error_entry = f"ERROR: {msg.text}"
            self.error_logs.append(error_entry)
            print(f"❌ {error_entry}")

    def print_results(self):
        """Print focused results"""
        print("\n" + "=" * 50)
        print("📊 FOCUSED LOGIN TEST RESULTS")
        print("=" * 50)
        
        if self.login_logs:
            print(f"\n📝 Login-Related Console Messages ({len(self.login_logs)}):")
            for i, log in enumerate(self.login_logs, 1):
                print(f"  {i}. {log}")
        
        if self.error_logs:
            print(f"\n❌ Error Messages ({len(self.error_logs)}):")
            for i, error in enumerate(self.error_logs, 1):
                print(f"  {i}. {error}")
        
        if not self.login_logs and not self.error_logs:
            print("\n⚠️  No login-related console messages captured")
            print("   This might indicate a JavaScript execution issue")

async def main():
    """Main test runner"""
    tester = FocusedLoginTest()
    results = await tester.run_test()
    
    sys.exit(0 if not results["error_logs"] else 1)

if __name__ == "__main__":
    asyncio.run(main())