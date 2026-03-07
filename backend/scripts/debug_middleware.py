#!/usr/bin/env python3
"""Debug middleware session detection

Tests if middleware is properly detecting sessions
"""

import asyncio
import sys
from playwright.async_api import async_playwright

# Configuration
FRONTEND_URL = "https://proactive-strength-staging.up.railway.app"
TEST_EMAIL = "jimmybobday1@hotmail.com"
TEST_PASSWORD = "Samdoggy1!"

class MiddlewareDebugTest:
    def __init__(self):
        self.results = []

    async def run_test(self) -> dict:
        """Run middleware debug test"""
        print("🔍 Starting Middleware Debug Test")
        print("=" * 50)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            # Capture all console messages
            page.on("console", lambda msg: self.log_console(msg))
            
            try:
                # Step 1: Go to login page
                print("📍 Step 1: Navigate to login page")
                await page.goto(f"{FRONTEND_URL}/login", wait_until="networkidle")
                await page.wait_for_timeout(2000)
                
                # Step 2: Fill and submit login
                print("📍 Step 2: Submit login form")
                await page.fill('input[type="email"]', TEST_EMAIL)
                await page.fill('input[type="password"]', TEST_PASSWORD)
                await page.click('button[type="submit"]')
                
                # Step 3: Wait and check what happens
                print("📍 Step 3: Monitor for redirect")
                
                for i in range(10):
                    await page.wait_for_timeout(1000)
                    current_url = page.url
                    print(f"   Second {i+1}: {current_url}")
                    
                    if "/login" not in current_url:
                        print("✅ Redirect detected!")
                        break
                
                # Step 4: Try direct navigation to other routes
                print("📍 Step 4: Test direct navigation")
                test_routes = ["/capture", "/jobs", "/settings"]
                
                for route in test_routes:
                    await page.goto(f"{FRONTEND_URL}{route}", wait_until="networkidle")
                    await page.wait_for_timeout(2000)
                    
                    current_url = page.url
                    if "/login" in current_url:
                        print(f"   ❌ {route} -> redirected to login")
                    else:
                        print(f"   ✅ {route} -> accessible")
                
            except Exception as e:
                print(f"❌ Test error: {e}")
            
            finally:
                await browser.close()
        
        return {"results": self.results}

    def log_console(self, msg):
        """Log console messages"""
        if any(keyword in msg.text.lower() for keyword in ["login", "auth", "session", "redirect"]):
            print(f"📝 {msg.type.upper()}: {msg.text}")
            self.results.append(f"{msg.type.upper()}: {msg.text}")

async def main():
    """Main test runner"""
    tester = MiddlewareDebugTest()
    results = await tester.run_test()
    
    sys.exit(0)

if __name__ == "__main__":
    asyncio.run(main())