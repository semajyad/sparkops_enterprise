# 🔒 Security Practices

## API Keys and Secrets

**NEVER commit API keys or secrets to version control!** This project has multiple layers of protection:

### 1. Git Ignore Protection
The `.gitignore` file includes patterns to prevent secrets:
- `.env` files (all environment files)
- Specific secret patterns (`**/SUPABASE_SERVICE_ROLE_KEY*`, `**/service_role_key*`, etc.)

### 2. Pre-commit Security Check
A pre-commit hook automatically scans for secrets before allowing commits:
```bash
# Runs automatically before each commit
python scripts/security-check.py
```

### 3. Manual Security Check
You can manually run the security check:
```bash
python scripts/security-check.py
```

## Environment Variables

### Local Development
- **Backend**: `backend/.env` (contains service role key)
- **Frontend**: `frontend/.env.local` (contains public keys)

### Staging/Production
- Use Railway environment variables or your deployment platform's secret management
- Never hardcode secrets in application code

## Current Secret Configuration

### Supabase Service Role Key
- **Location**: `backend/.env`
- **Purpose**: Admin operations (create/delete users)
- **Format**: JWT token (starts with `eyJ`)
- **Security**: ⚠️ HIGHLY SECRET - Never expose in client code

### Required Environment Variables
```bash
# Backend (.env)
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # 🔒 SECRET
SUPABASE_JWT_SECRET=...

# Frontend (.env.local)  
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...  # ✅ Public key only
PLAYWRIGHT_TEST_EMAIL=...
PLAYWRIGHT_TEST_PASSWORD=...
```

## Security Checklist

Before committing code:

- [ ] No secrets in source code
- [ ] All secrets in `.env` files
- [ ] `.env` files in `.gitignore`
- [ ] Run `python scripts/security-check.py`
- [ ] Pre-commit hook passes automatically

## If Secrets Are Exposed

If you accidentally commit a secret:

1. **Immediately revoke** the exposed key in Supabase dashboard
2. **Generate a new key** from Supabase
3. **Update local `.env`** with the new key
4. **Remove the secret from git history**:
   ```bash
   git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch filename' --prune-empty --tag-name-filter cat -- --all
   ```
5. **Force push** to remove from remote history
6. **Rotate all other potentially exposed keys**

## Auto-Confirmed User System

The test user creation system uses the service role key for:
- Creating users without email confirmation
- Cleaning up test users after tests

This is **only for local development and testing** - never expose this endpoint in production without proper authentication.

---

⚠️ **Remember**: The service role key has admin privileges. Treat it like a root password!
