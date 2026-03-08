import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { headers } from 'next/headers'
import { cookies } from 'next/headers'

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

type CookieToSet = {
  name: string
  value: string
  options: CookieOptions
}

type ParsedCookie = {
  name: string
  value: string
}

function parseCookieHeader(cookieHeader: string | null): ParsedCookie[] {
  if (!cookieHeader) {
    return []
  }

  return cookieHeader
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const separatorIndex = segment.indexOf('=')
      if (separatorIndex <= 0) {
        return null
      }

      return {
        name: segment.slice(0, separatorIndex).trim(),
        value: decodeURIComponent(segment.slice(separatorIndex + 1).trim()),
      }
    })
    .filter((cookie): cookie is ParsedCookie => cookie !== null)
}

export async function createClient() {
  const cookieStore = await cookies()
  const requestHeaders = await headers()
  const headerCookies = parseCookieHeader(requestHeaders.get('cookie'))

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          const storeCookies = cookieStore.getAll()
          const mergedCookies = new Map<string, string>()

          headerCookies.forEach(({ name, value }) => {
            mergedCookies.set(name, value)
          })

          storeCookies.forEach(({ name, value }) => {
            mergedCookies.set(name, value)
          })

          return Array.from(mergedCookies.entries()).map(([name, value]) => ({ name, value }))
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, maxAge: SESSION_MAX_AGE_SECONDS })
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
      cookieOptions: {
        maxAge: SESSION_MAX_AGE_SECONDS,
      },
    }
  )
}