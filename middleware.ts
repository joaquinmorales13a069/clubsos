import type { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { updateSession } from './utils/supabase/middleware';

const intlMiddleware = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  // Manejo del routing de internacionalización (next-intl)
  const response = intlMiddleware(request);

  // Actualización de la sesión de Supabase
  return await updateSession(request, response);
}

export const config = {
  // Omite todas las rutas que no deberían ser internacionalizadas.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
