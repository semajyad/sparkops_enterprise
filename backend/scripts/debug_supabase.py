#!/usr/bin/env python3
"""Debug Supabase connection and environment variables"""

import asyncio
import sys
from playwright.async_api import async_playwright

# Configuration
FRONTEND_URL = "https://proactive-strength-staging.up.railway.app"

class SupabaseDebugTest:
    def __init__(self):
        self.results = []

    async def run_test(self) -> dict:
        """Run Supabase debug test"""
        print("🔍 Starting Supabase Connection Debug Test")
        print("=" * 50)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            # Capture all console messages and network requests
            page.on("console", lambda msg: self.log_console(msg))
            page.on("request", lambda req: self.log_request(req))
            
            try:
                # Step 1: Go to login page and check for Supabase errors
                print("📍 Step 1: Navigate to login page")
                await page.goto(f"{FRONTEND_URL}/login", wait_until="networkidle")
                await page.wait_for_timeout(3000)
                
                # Step 2: Check if Supabase client initializes
                print("📍 Step 2: Check Supabase client initialization")
                
                # Look for Supabase-related console messages
                supabase_logs = [log for log in self.results if "supabase" in log.lower()]
                if supabase_logs:
                    print("✅ Supabase client logs found:")
                    for log in supabase_logs[:5]:  # Show first 5
                        print(f"   {log}")
                else:
                    print("❌ No Supabase client logs found")
                
                # Step 3: Try to fill form and check for validation errors
                print("📍 Step 3: Test form validation")
                await page.fill('input[type="email"]', "test@example.com")
                await page.fill('input[type="password"]', "test")
                await page.wait_for_timeout(1000)
                
                # Step 4: Check environment variables by looking at network requests
                print("📍 Step 4: Check for Supabase API requests")
                
                # Wait a bit to see if any Supabase requests are made
                await page.wait_for_timeout(2000)
                
                supabase_requests = [req for req in self.results if "supabase" in req.lower() and "request" in req.lower()]
                if supabase_requests:
                    print("✅ Supabase API requests found:")
                    for req in supabase_requests[:3]:  # Show first 3
                        print(f"   {req}")
                else:
                    print("❌ No Supabase API requests detected")
                
            except Exception as e:
                print(f"❌ Test error: {e}")
            
            finally:
                await browser.close()
        
        return {"results": self.results}

    def log_console(self, msg):
        """Log console messages"""
        if any(keyword in msg.text.lower() for keyword in ["supabase", "auth", "error", "failed"]):
            print(f"📝 CONSOLE: {msg.type.upper()}: {msg.text}")
            self.results.append(f"CONSOLE: {msg.type.upper()}: {msg.text}")

    def log_request(self, req):
        """Log network requests"""
        if "supabase" in req.url.lower():
            print(f"🌐 REQUEST: {req.method} {req.url}")
            self.results.append(f"REQUEST: {req.method} {req.url}")

async def main():
    """Main test runner"""
    tester = SupabaseDebugTest()
    results = await tester.run_test()
    
    sys.exit(0)

if __name__ == "__main__":
    asyncio.run(main())