import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslations } from "next-intl";
import Image from "next/image";
import loginImage from "@/assets/login-image.webp";
import { Smartphone, ShieldCheck, Headset } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("Auth.layout");
  
  return (
    <div className="flex min-h-screen bg-gray-50 flex-col md:flex-row relative">
      {/* Language Switcher - Absolute Top Right */}
      <div className="absolute top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      {/* Visual Section - Banner on Mobile, 50% on Desktop */}
      <div className="relative flex flex-col items-center justify-center text-white p-10 md:w-1/2 w-full min-h-[30vh] md:min-h-screen overflow-hidden">
        {/* Background Image */}
        <Image
          src={loginImage}
          alt="Login Background"
          fill
          className="object-cover absolute inset-0 z-0"
          priority
        />
        {/* Gradient Overlay for Readability */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 to-secondary/90 z-10"></div>
        
        <div className="relative z-20 flex flex-col items-center text-center space-y-6 w-full max-w-lg px-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-2">
            <Image src="/logo-clubSOS.webp" alt="Club SOS" width={64} height={64} className="object-contain drop-shadow-lg" />
            <h1 className="text-3xl md:text-5xl font-poppins font-bold tracking-tight text-white">
              {t('title')}
            </h1>
          </div>
          <p className="text-lg text-white/90 font-roboto drop-shadow-md max-w-md font-bold">
            {t('description')}
          </p>

          <div className="mt-8 space-y-4 w-full text-left pt-6">
            <div className="flex items-start space-x-4 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 hover:bg-white/20 transition-colors">
              <div className="bg-white/20 p-2 rounded-xl shrink-0">
                <Smartphone className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white font-poppins">{t('feature1Title')}</h3>
                <p className="text-xs text-white/80 mt-1 font-roboto">{t('feature1Desc')}</p>
              </div>
            </div>

            <div className="flex items-start space-x-4 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 hover:bg-white/20 transition-colors">
              <div className="bg-white/20 p-2 rounded-xl shrink-0">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white font-poppins">{t('feature2Title')}</h3>
                <p className="text-xs text-white/80 mt-1 font-roboto">{t('feature2Desc')}</p>
              </div>
            </div>

            <div className="flex items-start space-x-4 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 hover:bg-white/20 transition-colors">
              <div className="bg-white/20 p-2 rounded-xl shrink-0">
                <Headset className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white font-poppins">{t('feature3Title')}</h3>
                <p className="text-xs text-white/80 mt-1 font-roboto">{t('feature3Desc')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form Section - Takes up full width on mobile, 50% on Desktop */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 w-full bg-white relative z-30 rounded-t-3xl md:rounded-none -mt-8 md:mt-0 shadow-[0_-15px_30px_rgba(0,0,0,0.05)] md:shadow-none min-h-[70vh]">
        <div className="w-full max-w-md flex flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}
