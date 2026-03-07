#!/usr/bin/env python3
"""Debug login page rendering issues"""

import asyncio
import sys
from playwright.async_api import async_playwright

# Configuration
FRONTEND_URL = "https://proactive-strength-staging.up.railway.app"

class LoginPageDebugTest:
    def __init__(self):
        self.results = []

    async def run_test(self) -> dict:
        """Run login page debug test"""
        print("🔍 Starting Login Page Rendering Debug Test")
        print("=" * 60)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            # Capture all console messages
            page.on("console", lambda msg: self.log_console(msg))
            page.on("pageerror", lambda err: self.log_error(err))
            
            try:
                # Step 1: Go to login page
                print("📍 Step 1: Navigate to login page")
                await page.goto(f"{FRONTEND_URL}/login", wait_until="networkidle")
                await page.wait_for_timeout(3000)
                
                # Step 2: Check page title and content
                print("📍 Step 2: Check page content")
                title = await page.title()
                print(f"   Page title: {title}")
                
                # Step 3: Check for any error messages
                print("📍 Step 3: Check for error messages")
                body_text = await page.evaluate("() => document.body.innerText")
                if body_text:
                    print(f"   Body text preview: {body_text[:200]}...")
                
                # Step 4: Check what elements are actually on the page
                print("📍 Step 4: Check page elements")
                
                # Look for any input elements
                inputs = await page.query_selector_all("input")
                print(f"   Found {len(inputs)} input elements")
                
                # Look for any buttons
                buttons = await page.query_selector_all("button")
                print(f"   Found {len(buttons)} button elements")
                
                # Look for any forms
                forms = await page.query_selector_all("form")
                print(f"   Found {len(forms)} form elements")
                
                # Step 5: Check if there's a loading state
                print("📍 Step 5: Check for loading indicators")
                loading_elements = await page.query_selector_all("[data-loading], .loading, .spinner")
                print(f"   Found {len(loading_elements)} loading elements")
                
                # Step 6: Take a screenshot for debugging
                print("📍 Step 6: Capture page screenshot")
                screenshot = await page.screenshot()
                print(f"   Screenshot captured: {len(screenshot)} bytes")
                
                # Step 7: Check React DevTools for component errors
                print("📍 Step 7: Check for React errors")
                react_errors = await page.evaluate("""
                    () => {
                        const errors = [];
                        // Check for any error boundaries
                        const errorElements = document.querySelectorAll('[data-error-boundary="true"], .error-boundary');
                        errorElements.forEach(el => errors.push(el.textContent));
                        return errors;
                    }
                """)
                if react_errors:
                    print(f"   React errors found: {react_errors}")
                
            except Exception as e:
                print(f"❌ Test error: {e}")
            
            finally:
                await browser.close()
        
        return {"results": self.results}

    def log_console(self, msg):
        """Log console messages"""
        if any(keyword in msg.text.lower() for keyword in ["error", "failed", "crash", "exception"]):
            print(f"📝 CONSOLE: {msg.type.upper()}: {msg.text}")
            self.results.append(f"CONSOLE: {msg.type.upper()}: {msg.text}")

    def log_error(self, error):
        """Log page errors"""
        print(f"💥 PAGE ERROR: {error}")
        self.results.append(f"PAGE ERROR: {error}")

async def main():
    """Main test runner"""
    tester = LoginPageDebugTest()
    results = await tester.run_test()
    
    sys.exit(0)

if __name__ == "__main__":
    asyncio.run(main())