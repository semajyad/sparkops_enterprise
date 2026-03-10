import { expect, test } from "@playwright/test";

test("simple login test with environment variables", async ({ page }) => {
  const userEmail = process.env.PLAYWRIGHT_TEST_EMAIL;
  const userPassword = process.env.PLAYWRIGHT_TEST_PASSWORD;
  
  if (!userEmail || !userPassword) {
    throw new Error("Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD to run this test.");
  }
  
  console.log('Testing login with:', userEmail);
  
  // Navigate to login page
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /TradeOps/i })).toBeVisible();

  // Check if we're already in signup mode (for testing signup flow)
  const currentUrl = page.url();
  console.log('Initial URL:', currentUrl);

  // Login with test user
  await page.locator('input[name="email"]').fill(userEmail);
  await page.locator('input[name="password"]').fill(userPassword);
  await page.locator('button[type="submit"]').click();

  // Wait for login processing
  await page.waitForTimeout(10000);
  
  // Check if redirected to dashboard or still on login
  const finalUrl = page.url();
  console.log('Final URL after login:', finalUrl);
  
  if (finalUrl.includes('/login')) {
    // Check for error messages or auth messages
    const messages = [
      page.getByText(/invalid|error|failed/i),
      page.getByText(/check your email|confirm|verification/i),
      page.getByText(/welcome|dashboard|jobs/i)
    ];
    
    for (const message of messages) {
      const isVisible = await message.isVisible().catch(() => false);
      if (isVisible) {
        const text = await message.textContent();
        console.log('Found message:', text);
      }
    }
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'login-debug.png' });
    
    // Try to access a protected route to see if auth actually worked
    await page.goto("/jobs");
    await page.waitForTimeout(3000);
    const jobsUrl = page.url();
    console.log('Jobs page URL:', jobsUrl);
    
    if (jobsUrl.includes('/login')) {
      console.log('Authentication failed - redirected to login');
    } else {
      console.log('Authentication may have worked - can access jobs page');
    }
  } else {
    console.log('Login successful, redirected to:', finalUrl);
  }
});
