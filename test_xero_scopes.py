#!/usr/bin/env python3
"""
Xero Scope Testing Script
Tests different scope combinations to find what works with the current Xero app
"""

import os
from dotenv import load_dotenv
from urllib.parse import urlencode, quote

load_dotenv()

def test_scope_combination(scopes, description):
    """Test a specific scope combination"""
    print(f"\n{'='*60}")
    print(f"TESTING: {description}")
    print(f"SCOPES: {scopes}")
    print(f"{'='*60}")
    
    # Build the auth URL like the app does
    client_id = os.getenv('XERO_CLIENT_ID', '1C89F3218B374C458F8F3ACB8E9B2B1D')
    redirect_uri = os.getenv('XERO_REDIRECT_URI', 'https://sparkopsstagingbackend-staging.up.railway.app/api/integrations/xero/callback')
    state = 'test-state-123'
    
    encoded_scope = quote(scopes, safe="")
    
    auth_query = urlencode({
        'response_type': 'code',
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'state': state,
    }) + f"&scope={encoded_scope}"
    
    auth_url = f"https://login.xero.com/identity/connect/authorize?{auth_query}"
    
    print(f"AUTH URL: {auth_url}")
    print("\nTEST INSTRUCTIONS:")
    print("1. Copy the above URL and paste it in your browser")
    print("2. Try to authorize with your Xero account")
    print("3. Note the result:")
    print("   - SUCCESS: If you see the Xero authorization screen")
    print("   - FAILURE: If you get 'unauthorized_client' or 'invalid_scope' error")
    print("\nAfter testing, enter the result (SUCCESS/FAILURE):")
    
    return auth_url

def main():
    """Run systematic scope tests"""
    print("XERO SCOPE TESTING - SYSTEMATIC APPROACH")
    print("=========================================")
    print("This will test different scope combinations to find what works.")
    print("We'll start with minimal scopes and gradually add more.\n")
    
    # Test cases in order of complexity
    test_cases = [
        # Test 1: Minimal OpenID scopes only
        ("openid profile email offline_access", "Minimal OpenID scopes only"),
        
        # Test 2: Add accounting.transactions
        ("openid profile email offline_access accounting.transactions", "Add accounting.transactions"),
        
        # Test 3: Add accounting.contacts  
        ("openid profile email offline_access accounting.transactions accounting.contacts", "Add accounting.contacts"),
        
        # Test 4: Try accounting.contacts only
        ("openid profile email offline_access accounting.contacts", "Accounting contacts only"),
        
        # Test 5: Try with accounting.settings (if available)
        ("openid profile email offline_access accounting.settings", "Try accounting.settings"),
        
        # Test 6: Try single accounting scope
        ("openid profile email offline_access accounting.transactions", "Single accounting scope"),
        
        # Test 7: Try without offline_access
        ("openid profile email accounting.transactions accounting.contacts", "No offline_access"),
        
        # Test 8: Try just OpenID
        ("openid profile email", "Just OpenID scopes"),
    ]
    
    results = []
    
    for i, (scopes, description) in enumerate(test_cases, 1):
        print(f"\n{'#'*60}")
        print(f"TEST {i}/{len(test_cases)}")
        print(f"{'#'*60}")
        
        auth_url = test_scope_combination(scopes, description)
        
        # Wait for user input
        result = input(f"\nEnter result for Test {i} (SUCCESS/FAILURE/skip): ").strip().upper()
        
        if result == "SUCCESS":
            results.append((scopes, description, "SUCCESS"))
            print(f"\n✅ SUCCESS! Found working scopes: {scopes}")
            break
        elif result == "FAILURE":
            results.append((scopes, description, "FAILURE"))
            print(f"\n❌ FAILED: {scopes} don't work")
        elif result == "SKIP":
            print(f"\n⏭️  SKIPPED: {scopes}")
            break
        else:
            print(f"\n❓ Unknown result, skipping...")
    
    # Summary
    print(f"\n{'='*60}")
    print("TESTING SUMMARY")
    print(f"{'='*60}")
    
    for scopes, description, result in results:
        status = "✅" if result == "SUCCESS" else "❌" if result == "FAILURE" else "⏭️"
        print(f"{status} {description}: {scopes}")
    
    # Find successful scopes
    successful = [r for r in results if r[2] == "SUCCESS"]
    if successful:
        print(f"\n🎉 WORKING SCOPES FOUND:")
        for scopes, description, _ in successful:
            print(f"   - {scopes}")
        
        print(f"\n📝 UPDATE YOUR .env FILE WITH:")
        print(f"XERO_SCOPES={successful[0][0]}")
    else:
        print(f"\n❌ NO WORKING SCOPES FOUND")
        print(f"This confirms the Xero platform issue. Contact Xero support.")

if __name__ == "__main__":
    main()
