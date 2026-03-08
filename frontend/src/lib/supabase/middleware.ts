import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = {
  name: string
  value: string
  options: CookieOptions
}

const AUTH_TRACE_ENABLED = process.env.AUTH_TRACE === 'true' || process.env.NEXT_PUBLIC_AUTH_TRACE === 'true'

function authTrace(message: string): void {
  if (AUTH_TRACE_ENABLED) {
    console.log(message)
  }
}

const PROTECTED_PREFIXES = ['/dashboard', '/capture', '/jobs', '/profile', '/settings', '/tracking', '/ladder']

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function copyResponseCookies(source: NextResponse, target: NextResponse): void {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie)
  })
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

  const hasSupabaseCookie = request.cookies.getAll().some((cookie) => cookie.name.startsWith('sb-'))
  authTrace(`[AUTH-TRACE] Middleware: Cookie ${hasSupabaseCookie ? 'found' : 'missing'} path=${request.nextUrl.pathname}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError) {
    authTrace(
      `[AUTH-TRACE] Middleware: getUser error name=${userError.name} status=${String((userError as { status?: number }).status ?? 'n/a')} message=${userError.message}`
    )
  }

  const pathname = request.nextUrl.pathname
  const hasUser = Boolean(user)
  const isAuthPage = pathname === '/login' || pathname === '/signup'

  if (!hasUser && isProtectedPath(pathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    const redirectResponse = NextResponse.redirect(redirectUrl)
    copyResponseCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  if (hasUser && isAuthPage) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    const redirectResponse = NextResponse.redirect(redirectUrl)
    copyResponseCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  authTrace(`[AUTH-TRACE] Middleware: User ${hasUser ? 'found' : 'missing'} path=${request.nextUrl.pathname}`)

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  return supabaseResponse
}