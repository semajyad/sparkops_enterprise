# SparkOps Auth Forensic Diagnosis (Supabase SSR + Next.js 15/16)

## Research Sources

- Supabase official SSR migration/troubleshooting guide (Next.js App Router + `@supabase/ssr`):
  - https://supabase.com/docs/guides/troubleshooting/how-to-migrate-from-supabase-auth-helpers-to-ssr-package-5NRunM
- Supabase SSR client creation guide:
  - https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Supabase issues/discussions on `getUser()` null/session missing with cookie chunking and middleware adapters:
  - https://github.com/supabase/supabase/issues/24194
  - https://github.com/supabase/ssr/issues/36

## What is actually failing

The failure is **not** that the browser has zero cookies. The failure is that the middleware/server adapter path is not consistently resolving a valid **`sb-...-auth-token` cookie set** for `createServerClient(...).auth.getUser()` at request time.

In this state, middleware can still see some `sb-` cookies (for example verifier/chunk artifacts), while `getUser()` returns missing/session-missing because the effective auth token set is not reconstructed/available in that request flow.

## Why this happens (based on official guidance + issue patterns)

1. **Cookie adapter mismatch / non-official shape**
   - Using non-official cookie adapter patterns (`get/set/remove`) or custom request/response rewiring causes chunked auth cookies to be missed.
   - Official pattern is `getAll()` + `setAll()` for middleware and server clients.

2. **Chunked cookie handling sensitivity**
   - Supabase auth cookie may be split into chunks (`...-auth-token`, `...-auth-token.0`, etc.).
   - If adapter logic does not pass through all cookies correctly, `getUser()` can fail even when some `sb-` cookies exist.

3. **Response cookie propagation mistakes**
   - If middleware builds a new `NextResponse` without propagating Supabase cookie writes correctly, browser/server can desync.
   - Supabase docs explicitly warn to return the response that has cookie updates from `setAll`.

4. **Multiple auth middleware entrypoints/custom logic drift**
   - Divergent logic across `middleware.ts`, `proxy.ts`, and custom route guards can produce inconsistent cookie refresh/write behavior between requests.

## Definitive correction pattern

Use the official Next.js App Router SSR setup:

- `src/middleware.ts` should be a thin wrapper that calls `updateSession(request)`.
- `src/lib/supabase/proxy.ts` should own `createServerClient(...cookies.getAll/setAll...)` refresh logic.
- `src/lib/supabase/server.ts` should use `await cookies()` and `getAll/setAll` with server-component-safe try/catch in `setAll`.
- Avoid custom session caching/optimistic rewrites in middleware until baseline is stable.

This is the pattern implemented in the code changes accompanying this diagnosis.
