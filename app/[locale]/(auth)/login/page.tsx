"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PhoneInput, { isPossiblePhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { sendOtpAction, verifyOtpAction, loginWithPasswordAction } from "./actions";

export default function LoginPage() {
  const t = useTranslations("Auth.login");
  const tf = useTranslations("Auth.footer");
  const router = useRouter();
  const [loginMethod, setLoginMethod] = useState<"otp" | "password">("otp");
  const [phone, setPhone] = useState<string>();
  const [phoneError, setPhoneError] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  // Loading and server-side error states
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Validate phone locally, then call Server Action to trigger WhatsApp OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !isPossiblePhoneNumber(phone)) {
      setPhoneError(true);
      return;
    }
    setPhoneError(false);
    setServerError(null);
    setIsLoading(true);
    const result = await sendOtpAction(phone);
    setIsLoading(false);
    if (result.redirectToSignup) {
      router.push("/signup");
      return;
    }
    if (result.error) {
      setServerError(result.error);
      return;
    }
    setOtpSent(true);
  };

  // Verify the OTP code — Server Action redirects on success
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsLoading(true);
    const result = await verifyOtpAction(phone!, otpCode);
    setIsLoading(false);
    if (result?.error) setServerError(result.error);
  };

  // Username + password login — Server Action redirects on success
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsLoading(true);
    const result = await loginWithPasswordAction(username, password);
    setIsLoading(false);
    if (result?.error) setServerError(result.error);
  };

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-center md:justify-start mb-8">
        <Image 
          src="/logo-SOSMedical.webp" 
          alt="SOS Medical Logo" 
          width={180} 
          height={70} 
          className="object-contain"
          priority
        />
      </div>
      <div className="mb-8 text-center md:text-left">
        <h2 className="text-2xl font-poppins font-bold text-gray-900">
          {t("title")}
        </h2>
        <p className="text-gray-500 mt-2 text-sm font-roboto font-bold">{t("subtitle")}</p>
      </div>

      {loginMethod === "otp" ? (
        <div className="space-y-6">
          {!otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  {t("phoneLabel")}
                </label>
                <div className={`border rounded-xl focus-within:ring-2 focus-within:ring-ring focus-within:border-transparent transition-all ${
                    phoneError ? "border-red-400" : "border-input"
                  } bg-transparent`}>
                  <PhoneInput
                    international
                    defaultCountry="NI"
                    value={phone}
                    onChange={(val) => {
                      setPhone(val);
                      // Clear error as user types
                      if (val && isPossiblePhoneNumber(val)) setPhoneError(false);
                    }}
                    className="flex h-11 w-full px-3 py-2 text-sm [&>input]:bg-transparent [&>input]:border-none [&>input]:outline-none [&>input]:w-full"
                  />
                </div>
                {/* Inline error shown when phone number is too short */}
                {phoneError && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <span>⚠</span> {t("phoneError")}
                  </p>
                )}
                {/* Server-side error display */}
                {serverError && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <span>⚠</span> {serverError}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary hover:bg-primary/90 text-white rounded-xl h-11"
              >
                {isLoading ? "Enviando..." : t("receiveOtpBtn")}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  {t("otpLabel")}
                </label>
                <Input
                  type="text"
                  placeholder={t("otpPlaceholder")}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="rounded-xl h-11 text-center tracking-widest text-lg"
                  maxLength={6}
                />
                <p className="text-xs text-gray-500 text-center mt-2">
                  {t("sentTo", { phone: phone ?? "" })} ·{" "}
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="text-secondary font-medium hover:underline"
                  >
                    {t("changeNumber")}
                  </button>
                </p>
                {/* Show server error on OTP verification */}
                {serverError && (
                  <p className="text-xs text-red-500 text-center mt-1">⚠ {serverError}</p>
                )}
              </div>
              <Button
                type="submit"
                disabled={isLoading || otpCode.length < 6}
                className="w-full bg-primary hover:bg-primary/90 text-white rounded-xl h-11"
              >
                {isLoading ? "Verificando..." : t("verifyBtn")}
              </Button>
            </form>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">{t("orText")}</span>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => setLoginMethod("password")}
            className="w-full rounded-xl border-gray-200 h-11 text-gray-700 hover:bg-gray-50"
          >
            {t("usePasswordBtn")}
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                {t("usernameLabel")}
              </label>
              <Input
                type="text"
                placeholder={t("usernamePlaceholder")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="rounded-xl h-11"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  {t("passwordLabel")}
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-secondary font-medium hover:underline"
                >
                  {t("forgotPassword")}
                </Link>
              </div>
              <Input
                type="password"
                placeholder={t("passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl h-11"
              />
            </div>
            {serverError && (
              <p className="text-xs text-red-500 mt-1">⚠ {serverError}</p>
            )}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary/90 text-white rounded-xl h-11"
            >
              {isLoading ? "Ingresando..." : t("loginBtn")}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">{t("orText")}</span>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => setLoginMethod("otp")}
            className="w-full rounded-xl border-gray-200 h-11 text-gray-700 hover:bg-gray-50"
          >
            {t("useOtpBtn")}
          </Button>
        </div>
      )}

      <p className="mt-8 text-center text-sm text-gray-500 font-inter">
        {t("noAccount")}{" "}
        <Link
          href="/signup"
          className="font-semibold text-secondary hover:text-secondary/80 transition-colors"
        >
          {t("signupLink")}
        </Link>
      </p>

      <footer className="mt-10 pt-6 border-t border-gray-100 text-center space-y-2">
        <p className="text-xs text-gray-400">© {new Date().getFullYear()} {tf("copyright")}</p>
        <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
          <a href="#" className="hover:text-gray-600 transition-colors">{tf("terms")}</a>
          <a href="#" className="hover:text-gray-600 transition-colors">{tf("privacy")}</a>
          <a href="#" className="hover:text-gray-600 transition-colors">{tf("help")}</a>
        </div>
      </footer>
    </div>
  );
}
