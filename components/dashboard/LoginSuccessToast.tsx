"use client";

/**
 * LoginSuccessToast — fires a welcome toast once after a successful login.
 * Reads the `just_logged_in` cookie set by the login server action,
 * shows the toast, then immediately clears the cookie so it only fires once.
 */

import { useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function LoginSuccessToast() {
  const t = useTranslations("Auth.login");

  useEffect(() => {
    if (document.cookie.includes("just_logged_in=1")) {
      document.cookie = "just_logged_in=; max-age=0; path=/";
      toast.success(t("loginSuccess"));
    }
  }, [t]);

  return null;
}
