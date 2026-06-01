import { ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";

interface DetailPanelProps {
  title: string;
  closeHref?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export default function DetailPanel({
  title,
  closeHref,
  actions,
  children,
}: DetailPanelProps) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-white/60">
        <h2 className="text-base font-poppins font-semibold text-gray-900 truncate">
          {title}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          {closeHref && (
            <Link
              href={closeHref}
              className="hidden lg:inline-flex p-1 rounded-full text-neutral hover:bg-gray-100"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
      <div className="p-4 max-h-[calc(100vh-10rem)] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
