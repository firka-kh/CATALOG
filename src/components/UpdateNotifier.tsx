import React, { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

export const UpdateNotifier: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [initialBuildId, setInitialBuildId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const checkVersion = async () => {
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Pragma": "no-cache" }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.buildId) return;

        if (!isMounted) return;

        setInitialBuildId((prev) => {
          if (prev === null) {
            return data.buildId;
          }
          if (prev !== data.buildId) {
            setUpdateAvailable(true);
          }
          return prev;
        });
      } catch (e) {
        // Ignore fetch errors during network turbulence
      }
    };

    // Initial check
    checkVersion();

    // Poll every 25 seconds
    const interval = setInterval(checkVersion, 25000);

    // Check on window focus or visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkVersion();
      }
    };
    window.addEventListener("focus", checkVersion);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Service Worker update detection if PWA is active
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                setUpdateAvailable(true);
              }
            });
          }
        });
      }).catch(() => {});
    }

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener("focus", checkVersion);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  if (!updateAvailable) return null;

  const handleReload = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
        }
      }
    } catch (e) {
      console.error("Cache clear error:", e);
    }
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("_v", Date.now().toString());
    window.location.href = currentUrl.toString();
  };

  return (
    <div className="fixed top-0 inset-x-0 z-[99999] p-2 sm:p-3 bg-gradient-to-r from-red-600 via-amber-500 to-red-600 text-white shadow-2xl animate-pulse flex items-center justify-between gap-3 font-sans border-b-2 border-yellow-300">
      <div className="flex items-center gap-2 sm:gap-3 mx-auto sm:mx-0 flex-wrap justify-center sm:justify-start">
        <span className="flex items-center justify-center p-1.5 bg-white/20 rounded-full animate-bounce">
          <AlertTriangle className="w-5 h-5 text-yellow-200" />
        </span>
        <div>
          <span className="font-extrabold text-sm sm:text-base tracking-wide uppercase text-yellow-100 mr-2 drop-shadow">
            ОБНОВЛЕНИЕ СИСТЕМЫ!
          </span>
          <span className="text-xs sm:text-sm font-medium text-white/90 hidden sm:inline">
            Вышла новая версия приложения. Обновите страницу для применения изменений.
          </span>
        </div>
      </div>

      <button
        onClick={handleReload}
        className="flex items-center gap-2 bg-yellow-300 hover:bg-yellow-200 active:scale-95 text-slate-900 font-extrabold px-4 py-2 rounded-xl text-xs sm:text-sm shadow-lg transition-all transform hover:scale-105 cursor-pointer border border-yellow-400 whitespace-nowrap animate-bounce"
      >
        <RefreshCw className="w-4 h-4 animate-spin text-slate-900" />
        <span>ОБНОВИТЬ СЕЙЧАС</span>
      </button>
    </div>
  );
};
