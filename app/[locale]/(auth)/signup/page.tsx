"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PhoneInput, { isPossiblePhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import Image from "next/image";
import { UserCircle, Users, Building2, Search, ShieldCheck, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import { sendSignupOtpAction, verifySignupOtpAction, completeSignupAction, buscarEmpresaAction } from "./actions";
import HelpModal from "@/components/auth/HelpModal";

export default function SignupPage() {
  const t  = useTranslations("Auth.signup");
  const tf = useTranslations("Auth.footer");
  const router = useRouter();
  const locale = useLocale();
  const [step, setStep] = useState(1);
  
  // Form State
  const [tipoCuenta, setTipoCuenta] = useState<"titular" | "familiar" | null>(null);
  const [codigoEmpresa, setCodigoEmpresa] = useState("");
  const [empresaConfirmada, setEmpresaConfirmada] = useState(false);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [empresaNombre, setEmpresaNombre] = useState<string | null>(null);
  const [titularNombre, setTitularNombre] = useState("");
  const [titularDoc, setTitularDoc] = useState("");
  const [titularEncontrado, setTitularEncontrado] = useState(false);
  const [phone, setPhone] = useState<string>();
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  
  // Signup step tracking
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [sexo, setSexo] = useState<"masculino" | "femenino" | "">("");
  const [documento, setDocumento] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [noEmail, setNoEmail] = useState(false);

  const handleNextStep = () => setStep((prev) => prev + 1);
  const handlePrevStep = () => setStep((prev) => prev - 1);

  const handleValidarEmpresa = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsLoading(true);
    const result = await buscarEmpresaAction(codigoEmpresa);
    setIsLoading(false);
    if (result.error) {
      setServerError(result.error);
      setEmpresaConfirmada(false);
      return;
    }
    setEmpresaId(result.id!);
    setEmpresaNombre(result.nombre!);
    setEmpresaConfirmada(true);
  };

  const handleBuscarTitular = (e: React.FormEvent) => {
    e.preventDefault();
    setTitularEncontrado(true);
  };

  // Step 4: Send OTP via WhatsApp
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !isPossiblePhoneNumber(phone)) {
      return;
    }
    setServerError(null);
    setIsLoading(true);
    const result = await sendSignupOtpAction(phone);
    setIsLoading(false);
    if (result.error) { setServerError(result.error); return; }
    setOtpSent(true);
  };

  // Step 4: Verify OTP — session created, continue to Step 5
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsLoading(true);
    const result = await verifySignupOtpAction(phone!, otpCode);
    setIsLoading(false);
    if (result.error) { setServerError(result.error); return; }
    handleNextStep();
  };

  // Step 5: Complete profile — Server Action saves data and redirects
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsLoading(true);
    const result = await completeSignupAction({
      nombreCompleto,
      fechaNacimiento,
      sexo: sexo as "masculino" | "femenino",
      documento,
      username,
      password,
      tipoCuenta: tipoCuenta!,
      empresaId: empresaId || undefined,
      titularId: titularDoc || undefined,
      email: noEmail ? null : email || null,
    });
    setIsLoading(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    if (result?.success) {
      router.push(`/${locale}/dashboard`);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6">
        <h2 className="text-2xl font-poppins font-bold text-gray-900">{t("step1Title")}</h2>
        <p className="text-gray-500 mt-2 text-sm">{t("step1Subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => setTipoCuenta("titular")}
          className={`p-6 rounded-2xl border-2 text-left transition-all ${tipoCuenta === "titular" ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${tipoCuenta === "titular" ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'}`}>
            <UserCircle size={24} />
          </div>
          <h3 className="font-poppins font-semibold text-gray-900">{t("titularTitle")}</h3>
          <p className="text-sm text-gray-500 mt-2">{t("titularDesc")}</p>
        </button>

        <button
          onClick={() => setTipoCuenta("familiar")}
          className={`p-6 rounded-2xl border-2 text-left transition-all ${tipoCuenta === "familiar" ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${tipoCuenta === "familiar" ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'}`}>
            <Users size={24} />
          </div>
          <h3 className="font-poppins font-semibold text-gray-900">{t("familiarTitle")}</h3>
          <p className="text-sm text-gray-500 mt-2">{t("familiarDesc")}</p>
        </button>
      </div>

      <Button 
        onClick={handleNextStep} 
        disabled={!tipoCuenta}
        className="w-full bg-primary hover:bg-primary/90 text-white rounded-xl h-11 mt-6"
      >
        {t("continueBtn")} <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="mb-6">
        <h2 className="text-2xl font-poppins font-bold text-gray-900">{t("step2Title")}</h2>
        <p className="text-gray-500 mt-2 text-sm">{t("step2Subtitle")}</p>
      </div>

      <form onSubmit={handleValidarEmpresa} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">{t("codeLabel")}</label>
          <div className="relative">
            <Building2 className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <Input
              type="text"
              placeholder={t("codePlaceholder")}
              value={codigoEmpresa}
              onChange={(e) => {
                setCodigoEmpresa(e.target.value.toUpperCase());
                setEmpresaConfirmada(false);
          setEmpresaId(null);
          setEmpresaNombre(null);
              }}
              className="rounded-xl pl-10 h-11"
              required
            />
          </div>
        </div>

        {!empresaConfirmada ? (
          <>
            <Button type="submit" disabled={!codigoEmpresa || isLoading} className="w-full bg-secondary hover:bg-secondary/90 text-white rounded-xl h-11">
              {isLoading ? "Buscando..." : t("validateBtn")}
            </Button>
            {serverError && (
              <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                <span>⚠</span> {serverError}
              </p>
            )}
          </>
        ) : (
          <div className="p-4 bg-green-50 border border-green-100 rounded-xl flex items-start space-x-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">{t("companyFound")}</p>
            <p className="text-xs text-green-600 mt-1">{empresaNombre}</p>
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4">
          <Button variant="ghost" onClick={handlePrevStep} className="rounded-xl text-gray-500">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("backBtn")}
          </Button>
          <Button 
            onClick={() => tipoCuenta === "titular" ? setStep(4) : setStep(3)} 
            disabled={!empresaConfirmada}
            className="bg-primary hover:bg-primary/90 text-white rounded-xl"
          >
            {t("continueBtn")} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="mb-6">
        <h2 className="text-2xl font-poppins font-bold text-gray-900">{t("step3Title")}</h2>
        <p className="text-gray-500 mt-2 text-sm">{t("step3Subtitle")}</p>
      </div>

      <form onSubmit={handleBuscarTitular} className="space-y-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">{t("titularNameLabel")}</label>
            <Input
              type="text"
              placeholder={t("titularNamePlaceholder")}
              value={titularNombre}
              onChange={(e) => {
                setTitularNombre(e.target.value);
                setTitularEncontrado(false);
              }}
              className="rounded-xl h-11"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">{t("titularDocLabel")}</label>
            <Input
              type="text"
              placeholder={t("titularDocPlaceholder")}
              value={titularDoc}
              onChange={(e) => {
                setTitularDoc(e.target.value);
                setTitularEncontrado(false);
              }}
              className="rounded-xl h-11"
              required
            />
          </div>
        </div>

        {!titularEncontrado ? (
          <Button type="submit" disabled={!titularNombre || !titularDoc} className="w-full bg-secondary hover:bg-secondary/90 text-white rounded-xl h-11">
            <Search className="mr-2 h-4 w-4" /> {t("searchBtn")}
          </Button>
        ) : (
          <div className="p-4 bg-green-50 border border-green-100 rounded-xl flex items-start space-x-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">{t("titularFound")}</p>
              <p className="text-xs text-green-600 mt-1">{t("titularFoundDesc")}</p>
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4">
          <Button type="button" variant="ghost" onClick={handlePrevStep} className="rounded-xl text-gray-500">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("backBtn")}
          </Button>
          <Button 
            type="button"
            onClick={handleNextStep} 
            disabled={!titularEncontrado}
            className="bg-primary hover:bg-primary/90 text-white rounded-xl"
          >
            {t("continueBtn")} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="mb-6">
        <h2 className="text-2xl font-poppins font-bold text-gray-900">{t("step4Title")}</h2>
        <p className="text-gray-500 mt-2 text-sm">{t("step4Subtitle")}</p>
      </div>

      {!otpSent ? (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">{t("phoneLabel")}</label>
            <div className="border border-input bg-transparent rounded-xl focus-within:ring-2 focus-within:ring-ring focus-within:border-transparent transition-all">
              <PhoneInput
                international
                defaultCountry="NI"
                value={phone}
                onChange={setPhone}
                className="flex h-11 w-full px-3 py-2 text-sm [&>input]:bg-transparent [&>input]:border-none [&>input]:outline-none [&>input]:w-full"
              />
            </div>
          </div>
          
          <div className="flex justify-between pt-4">
            <Button type="button" variant="ghost" onClick={() => tipoCuenta === "titular" ? setStep(2) : setStep(3)} className="rounded-xl text-gray-500">
              <ArrowLeft className="mr-2 h-4 w-4" /> {t("backBtn")}
            </Button>
            <Button type="submit" disabled={!phone || isLoading} className="bg-primary hover:bg-primary/90 text-white rounded-xl">
              {isLoading ? "Enviando..." : t("sendOtpBtn")}
            </Button>
          </div>
          {serverError && (
            <p className="text-xs text-red-500 flex items-center gap-1 mt-2">
              <span>⚠</span> {serverError}
            </p>
          )}
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">{t("otpLabel")}</label>
            <Input
              type="text"
              placeholder={t("otpPlaceholder")}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              className="rounded-xl h-11 text-center tracking-widest text-lg"
              maxLength={6}
            />
            <p className="text-xs text-gray-500 text-center mt-2">
              {t("sentTo", { phone: phone || "" })} · <button type="button" onClick={() => setOtpSent(false)} className="text-secondary font-medium hover:underline">{t("changeNumber")}</button>
            </p>
          </div>
          {serverError && (
            <p className="text-xs text-red-500 text-center mt-1">⚠ {serverError}</p>
          )}
          <Button type="submit" disabled={otpCode.length < 6 || isLoading} className="w-full bg-primary hover:bg-primary/90 text-white rounded-xl h-11">
            {isLoading ? "Verificando..." : t("verifyPhoneBtn")}
          </Button>
        </form>
      )}
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="mb-6">
        <h2 className="text-2xl font-poppins font-bold text-gray-900">{t("step5Title")}</h2>
        <p className="text-gray-500 mt-2 text-sm">{t("step5Subtitle")}</p>
      </div>

      <form onSubmit={handleFinalSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">{t("fullNameLabel")}</label>
            <Input required value={nombreCompleto} onChange={e => setNombreCompleto(e.target.value)} className="rounded-xl h-11" />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">{t("dobLabel")}</label>
            <Input type="date" required value={fechaNacimiento} onChange={e => setFechaNacimiento(e.target.value)} className="rounded-xl h-11" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">{t("sexLabel")}</label>
            <select 
              required
              value={sexo} 
              onChange={e => setSexo(e.target.value as "masculino" | "femenino")}
              className="flex h-11 w-full rounded-xl border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="" disabled>{t("sexSelect")}</option>
              <option value="masculino">{t("sexMale")}</option>
              <option value="femenino">{t("sexFemale")}</option>
            </select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">{t("docLabel")}</label>
            <Input required value={documento} onChange={e => setDocumento(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))} className="rounded-xl h-11" />
          </div>

          <div className="col-span-1 md:col-span-2 mt-4 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
              <ShieldCheck className="h-4 w-4 mr-2 text-secondary" /> {t("credentialsTitle")}
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t("usernameLabel")}</label>
                <Input required value={username} onChange={e => setUsername(e.target.value)} placeholder={t("usernamePlaceholder")} className="rounded-xl h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t("passwordLabel")}</label>
                <Input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="rounded-xl h-11" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t("emailLabel")}</label>
                <Input
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={noEmail}
                  required={!noEmail}
                  className="rounded-xl h-11 disabled:opacity-50"
                />
                <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none mt-1">
                  <input
                    type="checkbox"
                    checked={noEmail}
                    onChange={e => {
                      setNoEmail(e.target.checked);
                      if (e.target.checked) setEmail("");
                    }}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  {t("noEmailCheckbox")}
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-4">
          <Button type="button" variant="ghost" onClick={handlePrevStep} className="rounded-xl text-gray-500">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("backBtn")}
          </Button>
          <Button type="submit" className="bg-primary hover:bg-primary/90 text-white rounded-xl">
            {t("completeBtn")}
          </Button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-8 px-2">
        <div className="shrink-0 mr-4">
          <Image 
            src="/logo-SOSMedical.webp" 
            alt="SOS Medical Logo" 
            width={120} 
            height={45} 
            className="object-contain"
            priority
          />
        </div>
        <div className="flex items-center justify-end flex-1 gap-2 sm:gap-3">
          {[1, 2, 3, 4, 5].map((s) => {
            if (tipoCuenta === 'titular' && s === 3) return null; 
            
            return (
              <div key={s} className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === s ? 'bg-secondary text-white ring-4 ring-secondary/20' : 
                  step > s ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                }`}>
                  {step > s ? <CheckCircle2 size={16} /> : s}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
      {step === 5 && renderStep5()}

      {step === 1 && (
        <p className="mt-8 text-center text-sm text-gray-500 font-roboto">
          {t("hasAccount")} {" "}
          <Link href="/login" className="font-semibold text-secondary hover:text-secondary/80 transition-colors">
            {t("loginLink")}
          </Link>
        </p>
      )}

      <footer className="mt-10 pt-6 border-t border-gray-100 text-center space-y-2">
        <p className="text-xs text-gray-400">© {new Date().getFullYear()} {tf("copyright")}</p>
        <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
          <Link href="/terminos" className="hover:text-gray-600 transition-colors">{tf("terms")}</Link>
          <Link href="/privacidad" className="hover:text-gray-600 transition-colors">{tf("privacy")}</Link>
          <HelpModal>{tf("help")}</HelpModal>
        </div>
      </footer>
    </div>
  );
}
