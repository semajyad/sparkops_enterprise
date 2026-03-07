#!/usr/bin/env python3
"""Test login with middleware delay

Tests if middleware needs time to detect the session
"""

import asyncio
import sys
from playwright.async_api import async_playwright

# Configuration
FRONTEND_URL = "https://proactive-strength-staging.up.railway.app"
TEST_EMAIL = "jimmybobday1@hotmail.com"
TEST_PASSWORD = "Samdoggy1!"

class MiddlewareDelayTest:
    def __init__(self):
        self.success = False

    async def run_test(self) -> dict:
        """Test login with middleware delay"""
        print("⏱️  Testing Login with Middleware Delay")
        print("=" * 50)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            try:
                # Load login page
                await page.goto(f"{FRONTEND_URL}/login", wait_until="networkidle")
                await page.wait_for_timeout(2000)
                
                # Fill and submit form
                await page.fill('input[type="email"]', TEST_EMAIL)
                await page.fill('input[type="password"]', TEST_PASSWORD)
                await page.click('button[type="submit"]')
                
                print("🔐 Login submitted, waiting for middleware redirect...")
                
                # Wait up to 10 seconds for redirect
                for i in range(10):
                    await page.wait_for_timeout(1000)
                    current_url = page.url
                    
                    if "/login" not in current_url:
                        print(f"✅ Redirect successful after {i+1} seconds!")
                        print(f"📍 Final URL: {current_url}")
                        self.success = True
                        break
                    
                    print(f"   ⏳ Waiting... {i+1}/10 seconds")
                
                if not self.success:
                    print("❌ No redirect occurred after 10 seconds")
                    print(f"📍 Still on: {page.url}")
                
            except Exception as e:
                print(f"❌ Test error: {e}")
            
            finally:
                await browser.close()
        
        return {"success": self.success}

async def main():
    """Main test runner"""
    tester = MiddlewareDelayTest()
    results = await tester.run_test()
    
    sys.exit(0 if results["success"] else 1)

if __name__ == "__main__":
    asyncio.run(main())