import React, { useState } from "react";
import { Laptop, Download, CheckCircle2 } from "lucide-react";
import { usePWAInstall } from "../lib/usePWAInstall";
import { PWAInstallModal } from "./PWAInstallModal";

interface PWAInstallButtonProps {
  className?: string;
  variant?: "header" | "monitoring" | "sidebar";
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = "",
  variant = "header",
}) => {
  const { isInstallable, isInstalled, install, isDesktopPC } = usePWAInstall();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleClick = async () => {
    if (isInstallable) {
      const res = await install();
      if (!res) {
        setIsModalOpen(true);
      }
    } else {
      setIsModalOpen(true);
    }
  };

  // If already running inside installed standalone PWA app, don't clutter the header
  if (isInstalled) {
    if (variant === "monitoring") {
      return (
        <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold rounded-xl">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          Приложение ПК
        </span>
      );
    }
    return null;
  }

  if (variant === "monitoring") {
    return (
      <>
        <button
          onClick={handleClick}
          className={`px-3 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-600/30 flex items-center gap-1.5 shrink-0 cursor-pointer ${className}`}
          title="Установить это окно мониторинга как отдельное приложение на ПК (Windows / Mac)"
        >
          <Laptop className="w-4 h-4 text-white" />
          <span className="hidden sm:inline">Установить на ПК</span>
        </button>
        <PWAInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  if (variant === "sidebar") {
    return (
      <>
        <button
          onClick={handleClick}
          className={`w-full flex items-center gap-3 px-3 py-2 text-indigo-300 hover:bg-slate-800 hover:text-white transition-colors rounded-md font-semibold text-xs cursor-pointer ${className}`}
          title="Установить каталог и мониторинг как отдельную программу на ПК"
        >
          <Laptop className="w-4 h-4 text-indigo-400" />
          <span>Установить приложение на ПК</span>
        </button>
        <PWAInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  // Header variant
  return (
    <>
      <button
        onClick={handleClick}
        className={`flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md font-semibold transition-all shadow-sm cursor-pointer ${className}`}
        title="Установить приложение на ПК (Windows / Mac) или телефон"
      >
        <Laptop className="w-3.5 h-3.5 text-indigo-200" />
        <span className="hidden md:inline">Установить на ПК</span>
        <span className="md:hidden">На ПК</span>
      </button>
      <PWAInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
