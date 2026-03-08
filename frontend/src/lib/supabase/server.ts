import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

export async function createClient() {
  const cookieStore = await cookies()
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  const cookieNames = cookieStore.getAll().map((cookie) => cookie.name)
  const hasSupabaseCookie = cookieNames.some((name) => name.startsWith('sb-'))
  const hasAuthTokenChunk = cookieNames.some((name) => name.includes('-auth-token'))
  authTrace(
    `[AUTH-TRACE] ServerClient: Cookie ${hasSupabaseCookie ? 'found' : 'missing'} auth-token=${hasAuthTokenChunk ? 'found' : 'missing'}`
  )

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          authTrace(`[AUTH-TRACE] ServerClient: setAll called count=${cookiesToSet.length}`)
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            authTrace('[AUTH-TRACE] ServerClient: setAll failed in this execution context')
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}