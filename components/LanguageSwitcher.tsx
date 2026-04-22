"use client";

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/routing';
import { Globe } from 'lucide-react';
import { useTransition } from 'react';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const handleLanguageChange = () => {
    const nextLocale = locale === 'es' ? 'en' : 'es';
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  };

  return (
    <button
      onClick={handleLanguageChange}
      disabled={isPending}
      className="flex items-center space-x-2 text-sm font-poppins font-medium text-gray-700 hover:text-primary transition-all bg-white/80 hover:bg-white backdrop-blur-md px-4 py-2 rounded-full border border-gray-200 shadow-sm"
    >
      <Globe className="h-4 w-4" />
      <span>{locale === 'es' ? 'English' : 'Español'}</span>
    </button>
  );
}
