import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { updateSession } from './utils/supabase/middleware';

const intlMiddleware = createMiddleware(routing);

const AUTH_PAGES = ['/login', '/signup'];

const ROLE_ROUTES = {
  admin: '/dashboard/admin',
  empresa_admin: '/dashboard/empresa',
  miembro: '/dashboard',
} as const;

function getExpectedDashboard(role: string | null): string {
  if (role === 'admin') return ROLE_ROUTES.admin;
  if (role === 'empresa_admin') return ROLE_ROUTES.empresa_admin;
  return ROLE_ROUTES.miembro;
}

function canAccessDashboard(path: string, role: string | null, locale: string): boolean {
  const adminBase = `/${locale}${ROLE_ROUTES.admin}`;
  const empresaBase = `/${locale}${ROLE_ROUTES.empresa_admin}`;

  if (role === 'admin') return true;
  if (role === 'empresa_admin') return !path.startsWith(adminBase);
  return !path.startsWith(adminBase) && !path.startsWith(empresaBase);
}

export async function proxy(request: NextRequest) {
  const response = intlMiddleware(request);
  const { response: updatedResponse, user, role, aalNext, aalCurrent } = await updateSession(request, response);

  const pathname = request.nextUrl.pathname;

  const locale =
    routing.locales.find((l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`) ??
    routing.defaultLocale;

  const isServerAction = request.headers.has('next-action');

  // ── MFA AAL guard ─────────────────────────────────────────────────────────
  // If the user has TOTP enrolled (nextLevel=aal2) but hasn't verified this
  // session (currentLevel=aal1), send them to the TOTP challenge page.
  const isMfaPage = routing.locales.some((l) => pathname.startsWith(`/${l}/mfa`));
  if (user && !isServerAction && !isMfaPage && aalNext === 'aal2' && aalCurrent !== 'aal2') {
    return NextResponse.redirect(new URL(`/${locale}/mfa/verificar`, request.url));
  }

  // ── Guard: auth pages ─────────────────────────────────────────────────────
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
    if (!user) {
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }
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
