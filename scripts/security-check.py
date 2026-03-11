#!/usr/bin/env python3
"""
Security check script to ensure no API keys or secrets are committed to git.
Run this before committing or add it as a pre-commit hook.
"""

import os
import re
import sys
from pathlib import Path

# Patterns that should never be in committed code
SECRET_PATTERNS = [
    r'eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*',  # JWT tokens
    r'sb_secret_[a-zA-Z0-9_-]+',  # Supabase secret keys
    r'sb_publishable_[a-zA-Z0-9_-]+',  # Supabase publishable keys
    r'SUPABASE_SERVICE_ROLE_KEY\s*=\s*["\'][^"\']+["\']',  # Service role key assignments
    r'sk-svcacct-[a-zA-Z0-9_-]+',  # OpenAI service account keys
    r'AIza[a-zA-Z0-9_-]{35}',  # Google API keys
    r'[a-zA-Z0-9_-]{32,}',  # Generic long keys (32+ chars)
]

# Files to check (exclude common non-source files)
EXCLUDE_PATTERNS = [
    r'\.git/',
    r'node_modules/',
    r'\.next/',
    r'build/',
    r'dist/',
    r'\.env',
    r'\.log',
    r'\.png',
    r'\.jpg',
    r'\.jpeg',
    r'\.gif',
    r'\.svg',
    r'\.ico',
    r'\.pdf',
    r'\.zip',
    r'\.tar\.gz',
    r'test-results/',
    r'playwright-report/',
]

def should_check_file(file_path):
    """Check if file should be scanned for secrets."""
    file_path_str = str(file_path)
    
    # Skip excluded patterns
    for pattern in EXCLUDE_PATTERNS:
        if re.search(pattern, file_path_str):
            return False
    
    # Only check text files
    text_extensions = {'.py', '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.yml', '.yaml', '.env', '.txt', '.html', '.css'}
    if not any(file_path_str.endswith(ext) for ext in text_extensions):
        return False
    
    return True

def check_for_secrets(file_path):
    """Check a single file for secret patterns."""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            lines = content.split('\n')
            
        for line_num, line in enumerate(lines, 1):
            for pattern in SECRET_PATTERNS:
                matches = re.finditer(pattern, line, re.IGNORECASE)
                for match in matches:
                    # Skip if it's clearly a comment or example
                    if 'example' in line.lower() or 'placeholder' in line.lower() or 'xxx' in line.lower():
                        continue
                    
                    return {
                        'file': str(file_path),
                        'line': line_num,
                        'content': line.strip(),
                        'pattern': pattern,
                        'match': match.group()
                    }
    except Exception:
        pass
    
    return None

def main():
    """Main security check function."""
    print("🔒 Security Check: Scanning for secrets and API keys...")
    
    # Get current directory or use provided path
    root_dir = Path('.')
    issues = []
    
    # Check all files
    for file_path in root_dir.rglob('*'):
        if file_path.is_file() and should_check_file(file_path):
            issue = check_for_secrets(file_path)
            if issue:
                issues.append(issue)
    
    # Report results
    if issues:
        print("\n❌ SECURITY ISSUES FOUND:")
        print("The following files contain potential secrets that should not be committed:")
        print()
        
        for issue in issues:
            print(f"📁 File: {issue['file']}")
            print(f"📍 Line {issue['line']}: {issue['content']}")
            print(f"🔍 Pattern: {issue['pattern']}")
            print(f"⚠️  Match: {issue['match']}")
            print()
        
        print("🚨 PLEASE REMOVE THESE SECRETS BEFORE COMMITTING!")
        print("💡 Use environment variables instead of hardcoding secrets.")
        sys.exit(1)
    else:
        print("✅ No secrets found. Safe to commit!")
        sys.exit(0)

if __name__ == "__main__":
    main()
