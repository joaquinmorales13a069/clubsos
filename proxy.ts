import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { updateSession } from './utils/supabase/middleware';

const intlMiddleware = createMiddleware(routing);

// Auth pages — authenticated users should not access these
const AUTH_PAGES = ['/login', '/signup'];

// Dashboard routes that require authentication and specific roles
const ROLE_ROUTES = {
  admin: '/dashboard/admin',
  empresa_admin: '/dashboard/empresa',
  miembro: '/dashboard',
} as const;

/**
 * Resolves the correct dashboard path for a given role.
 * Admins can access all routes; empresa_admins can access empresa + miembro routes.
 */
function getExpectedDashboard(role: string | null): string {
  if (role === 'admin') return ROLE_ROUTES.admin;
  if (role === 'empresa_admin') return ROLE_ROUTES.empresa_admin;
  return ROLE_ROUTES.miembro;
}

/**
 * Checks whether a dashboard path is allowed for the given role.
 * Admin can access everything; empresa_admin can access empresa and miembro; miembro only miembro.
 */
function canAccessDashboard(path: string, role: string | null, locale: string): boolean {
  const adminBase = `/${locale}${ROLE_ROUTES.admin}`;
  const empresaBase = `/${locale}${ROLE_ROUTES.empresa_admin}`;

  // Admin can access all dashboard routes (admin management + shared miembro "Mi Perfil" routes)
  if (role === 'admin') return true;
  if (role === 'empresa_admin') return !path.startsWith(adminBase);
  return !path.startsWith(adminBase) && !path.startsWith(empresaBase);
}

export async function proxy(request: NextRequest) {
  // Handle i18n routing first
  const response = intlMiddleware(request);

  // Refresh Supabase session and get user + role
  const { response: updatedResponse, user, role } = await updateSession(request, response);

  const pathname = request.nextUrl.pathname;

  // Detect locale prefix from pathname
  const locale =
    routing.locales.find((l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`) ??
    routing.defaultLocale;

  // ── Guard: auth pages ────────────────────────────────────────────────────
  // Authenticated users trying to access login/signup → redirect to their dashboard.
  // Skip this guard for Server Action requests: they POST to the page URL but must
  // not be intercepted — the `next-action` header identifies them.
  const isServerAction = request.headers.has("next-action");

  if (user && !isServerAction) {
    const isAuthPage = AUTH_PAGES.some((page) =>
      routing.locales.some((l) => pathname === `/${l}${page}`)
    );
    if (isAuthPage) {
      const dest = getExpectedDashboard(role);
      return NextResponse.redirect(new URL(`/${locale}${dest}`, request.url));
    }
  }

  // ── Guard: dashboard routes ───────────────────────────────────────────────
  const isDashboardRoute = routing.locales.some((l) =>
    pathname.startsWith(`/${l}/dashboard`)
  );

  if (isDashboardRoute) {
    // Unauthenticated → send to login
    if (!user) {
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }

    // Wrong role for this route → redirect to the correct dashboard
    if (!canAccessDashboard(pathname, role, locale)) {
      const dest = getExpectedDashboard(role);
      return NextResponse.redirect(new URL(`/${locale}${dest}`, request.url));
    }
  }

  return updatedResponse;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
