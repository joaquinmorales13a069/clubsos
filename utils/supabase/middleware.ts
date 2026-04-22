import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'

export type UserRole = 'admin' | 'empresa_admin' | 'miembro' | null

export async function updateSession(
  request: NextRequest,
  response: NextResponse
): Promise<{ response: NextResponse; user: User | null; role: UserRole }> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Fetch role from public.users if authenticated
  let role: UserRole = null
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('rol')
      .eq('id', user.id)
      .single()
    role = (profile?.rol as UserRole) ?? 'miembro'
  }

  return { response, user, role }
}
