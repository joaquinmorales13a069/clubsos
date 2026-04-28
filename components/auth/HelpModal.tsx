"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Mail, MessageCircle, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function HelpModal({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("Auth.footer.helpModal");

  const whatsappNumber = "50581001226";
  const whatsappUrl = `https://wa.me/${whatsappNumber}`;
  const emailUrl = `mailto:${t("emailValue")}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hover:text-gray-600 transition-colors"
      >
        {children}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm rounded-2xl" showCloseButton={false}>
          {/* Close button */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <DialogHeader>
            <DialogTitle className="font-poppins font-bold text-gray-900 text-base">
              {t("title")}
            </DialogTitle>
            <DialogDescription className="text-xs font-roboto text-neutral/70 leading-relaxed">
              {t("desc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-1">
            {/* Email */}
            <a
              href={emailUrl}
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50
                         hover:bg-secondary/5 hover:border-secondary/20 transition-colors group"
            >
              <div className="p-2 rounded-lg bg-secondary/10 shrink-0">
                <Mail className="w-4 h-4 text-secondary" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 font-roboto">
                  {t("emailLabel")}
                </p>
                <p className="text-sm font-roboto font-medium text-gray-800 group-hover:text-secondary transition-colors">
                  {t("emailValue")}
                </p>
              </div>
            </a>

            {/* WhatsApp */}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50
                         hover:bg-green-50 hover:border-green-200 transition-colors group"
            >
              <div className="p-2 rounded-lg bg-green-100 shrink-0">
                <MessageCircle className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 font-roboto">
                  {t("whatsappLabel")}
                </p>
                <p className="text-sm font-roboto font-medium text-gray-800 group-hover:text-green-700 transition-colors">
                  {t("whatsappValue")}
                </p>
              </div>
            </a>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full py-2 text-sm font-roboto font-medium text-gray-500
                         border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              {t("close")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
