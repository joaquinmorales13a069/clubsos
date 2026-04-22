import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { updateSession } from './utils/supabase/middleware';

const intlMiddleware = createMiddleware(routing);

// Páginas de auth donde usuarios autenticados no deben entrar
const AUTH_PAGES = ['/login', '/signup'];

export async function middleware(request: NextRequest) {
  // Manejo del routing de internacionalización (next-intl)
  const response = intlMiddleware(request);

  // Actualización de la sesión de Supabase + obtener usuario actual
  const { response: updatedResponse, user } = await updateSession(request, response);

  // Si hay sesión activa y el usuario intenta acceder a una página de auth,
  // redirigir al dashboard con el locale correspondiente
  if (user) {
    const pathname = request.nextUrl.pathname;
    const isAuthPage = AUTH_PAGES.some((page) =>
      routing.locales.some((locale) => pathname === `/${locale}${page}`)
    );

    if (isAuthPage) {
      const locale =
        routing.locales.find((l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`) ??
        routing.defaultLocale;
      return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
    }
  }

  return updatedResponse;
}

export const config = {
  // Omite todas las rutas que no deberían ser internacionalizadas.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
