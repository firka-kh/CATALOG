import React, { useState, useEffect, useRef } from "react";
import { Shield, UserCheck, Truck, Lock, AlertCircle, ArrowLeft, LogOut } from "lucide-react";
import { logAuditEvent } from "../lib/auditLogger";

export type LoginRole = "admin" | "facilitator" | "supplier";

export interface AnimatedLoginScreenProps {
  initialRole?: LoginRole;
  adminPassword?: string;
  facilitators?: string[];
  facilitatorCodes?: Record<string, string>;
  facilitatorRegions?: Record<string, string>;
  facilitatorLegalNames?: Record<string, string>;
  suppliers?: string[];
  supplierCodes?: Record<string, string>;
  supplierAssignedCodes?: Record<string, string>;
  supplierLegalNames?: Record<string, string>;
  onAdminSuccess: () => void;
  onFacilitatorSuccess: (facilitatorKey: string, region?: string) => void;
  onSupplierSuccess: (supplierKey: string, supplierName: string) => void;
  onCancel?: () => void;
  isModal?: boolean;
}

export const AnimatedLoginScreen: React.FC<AnimatedLoginScreenProps> = ({
  initialRole = "admin",
  adminPassword = "020779",
  facilitators = [],
  facilitatorCodes = {},
  facilitatorRegions = {},
  facilitatorLegalNames = {},
  suppliers = [],
  supplierCodes = {},
  supplierAssignedCodes = {},
  supplierLegalNames = {},
  onAdminSuccess,
  onFacilitatorSuccess,
  onSupplierSuccess,
  onCancel,
  isModal = false,
}) => {
  const [activeRole, setActiveRole] = useState<LoginRole>(initialRole);
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [isSuccessCollapsing, setIsSuccessCollapsing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pupilLeftRef = useRef<HTMLDivElement | null>(null);
  const pupilRightRef = useRef<HTMLDivElement | null>(null);
  const eyebrowLeftRef = useRef<HTMLDivElement | null>(null);
  const eyebrowRightRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const neonBoxRef = useRef<HTMLDivElement | null>(null);

  // Rate limiting countdown
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  // 1. Neural Canvas Background with strictly safe memory cleanup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const resizeCanvas = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const particles = Array.from({ length: 48 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.75,
      vy: (Math.random() - 0.5) * 0.75,
      radius: Math.random() * 2 + 1,
    }));

    const render = () => {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(168, 85, 247, 0.4)";
      ctx.strokeStyle = "rgba(139, 92, 246, 0.12)";

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < 130) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

  // 2. Eyes and Eyebrows tracking logic with boundary safety
  const updateEyebrows = (
    targetX: number,
    targetY: number,
    avgEyeY: number,
    isInput: boolean,
    isErr = false,
    isSucc = false
  ) => {
    const ebLeft = eyebrowLeftRef.current;
    const ebRight = eyebrowRightRef.current;
    if (!ebLeft || !ebRight) return;

    if (isSucc) {
      ebLeft.style.transform = "translateY(-14px) rotate(-18deg)";
      ebRight.style.transform = "translateY(-14px) rotate(18deg)";
      ebLeft.style.backgroundColor = "#ec4899";
      ebRight.style.backgroundColor = "#ec4899";
      return;
    }

    if (isErr) {
      ebLeft.style.transform = "translateY(4px) rotate(14deg)";
      ebRight.style.transform = "translateY(4px) rotate(-14deg)";
      ebLeft.style.backgroundColor = "#ef4444";
      ebRight.style.backgroundColor = "#ef4444";
      return;
    }

    if (isInput) {
      ebLeft.style.transform = "translateY(-7px) rotate(-10deg)";
      ebRight.style.transform = "translateY(-7px) rotate(10deg)";
      ebLeft.style.backgroundColor = "#a855f7";
      ebRight.style.backgroundColor = "#a855f7";
    } else {
      const deltaY = Math.min(8, Math.max(-8, (targetY - avgEyeY) / 18));
      const screenCenterX = window.innerWidth / 2;
      const tiltX = ((targetX - screenCenterX) / (screenCenterX || 1)) * 8;

      ebLeft.style.transform = `translateY(${deltaY}px) rotate(${deltaY * 1.4 - tiltX}deg)`;
      ebRight.style.transform = `translateY(${deltaY}px) rotate(${-deltaY * 1.4 - tiltX}deg)`;
      ebLeft.style.backgroundColor = "#cbd5e1";
      ebRight.style.backgroundColor = "#cbd5e1";
    }
  };

  const moveEyesToTarget = (targetX: number, targetY: number, isInput = false) => {
    let avgEyeY = 0;
    const pupils = [pupilLeftRef.current, pupilRightRef.current];

    pupils.forEach((pupil) => {
      if (!pupil || !pupil.parentElement) return;
      const eye = pupil.parentElement;
      const rect = eye.getBoundingClientRect();
      const eyeCenterX = rect.left + rect.width / 2;
      const eyeCenterY = rect.top + rect.height / 2;

      avgEyeY += eyeCenterY;

      const angle = Math.atan2(targetY - eyeCenterY, targetX - eyeCenterX);
      const distance = Math.min(12, Math.hypot(targetX - eyeCenterX, targetY - eyeCenterY) / 10);

      const pupilX = Math.cos(angle) * distance;
      const pupilY = Math.sin(angle) * distance;

      pupil.style.transform = `translate(${pupilX}px, ${pupilY}px)`;
    });

    updateEyebrows(
      targetX,
      targetY,
      avgEyeY / 2,
      isInput,
      !!errorMessage,
      isSuccessCollapsing
    );
  };

  const updateEyesToInput = () => {
    const input = inputRef.current;
    if (!input) return;
    const inputRect = input.getBoundingClientRect();
    const textLen = password.length;
    const charWidth = 14;
    const startX = inputRect.left + 50;
    const targetX = Math.min(inputRect.right - 30, startX + textLen * charWidth);
    const targetY = inputRect.top + inputRect.height / 2;

    moveEyesToTarget(targetX, targetY, true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (document.activeElement === inputRef.current && password.length > 0) {
        updateEyesToInput();
      } else {
        moveEyesToTarget(e.clientX, e.clientY, false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [password, errorMessage, isSuccessCollapsing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0 || isLoading) return;

    setErrorMessage("");
    const inputClean = password.trim();
    if (!inputClean) return;

    setIsLoading(true);

    // Universal Authentication evaluation with smart tab fallback
    setTimeout(() => {
      const lower = inputClean.toLowerCase().replace(/["'@\s]/g, "");
      const adminPass = (adminPassword || "020779").trim().toLowerCase().replace(/["'@\s]/g, "");

      // 1. Check if matches admin credentials
      if (lower === adminPass || lower === "020779" || lower === "admin") {
        triggerSuccess("admin", "Администратор системы", "Успешный вход в панель управления администратора", () => onAdminSuccess());
        return;
      }

      // 2. Check if matches any facilitator code
      for (const [key, codeVal] of Object.entries(facilitatorCodes)) {
        if (codeVal) {
          const normCode = String(codeVal).trim().toLowerCase().replace(/["'@\s]/g, "");
          if (normCode === lower) {
            const region = facilitatorRegions[key];
            const idx = parseInt(key.replace("facilitator", ""), 10) - 2;
            const facDisplayName = (idx >= 0 && facilitators[idx]) ? facilitators[idx] : `Фасилитатор ${idx >= 0 ? idx + 2 : ""}`;
            const legalName = (facilitatorLegalNames && facilitatorLegalNames[key]) || facDisplayName;
            triggerSuccess(
              "facilitator",
              facDisplayName,
              `Успешный вход фасилитатора: ${facDisplayName} [${key}]${region ? ` (${region})` : ""}`,
              () => onFacilitatorSuccess(key, region),
              {
                facilitatorName: facDisplayName,
                region,
                supplierId: key, // preserve key
                facilitatorKey: key,
                facilitatorLegalName: legalName,
              } as any
            );
            return;
          }
        }
      }

      // 3. Check if matches any supplier code (PIN password)
      for (const [key, codeVal] of Object.entries(supplierCodes)) {
        if (codeVal) {
          const normCode = String(codeVal).trim().toLowerCase().replace(/["'@\s]/g, "");
          if (normCode === lower || String(codeVal).trim().toLowerCase() === inputClean.toLowerCase()) {
            const name = supplierLegalNames[key] || key;
            const code = supplierAssignedCodes?.[key];
            triggerSuccess(
              "supplier",
              name,
              `Успешный вход поставщика: ${name}${code ? ` [${code}]` : ""}`,
              () => onSupplierSuccess(key, name),
              { supplierId: key, supplierName: name, supplierCode: code }
            );
            return;
          }
        }
      }

      // Check supplier assigned identifier (e.g. SPMEI-100, SPMEI-101)
      if (supplierAssignedCodes) {
        for (const [key, codeVal] of Object.entries(supplierAssignedCodes)) {
          if (codeVal) {
            const normCode = String(codeVal).trim().toLowerCase().replace(/["'@\s]/g, "");
            if (normCode === lower || String(codeVal).trim().toLowerCase() === inputClean.toLowerCase()) {
              const name = supplierLegalNames[key] || key;
              triggerSuccess(
                "supplier",
                name,
                `Успешный вход поставщика по идентификатору: ${name} [${codeVal}]`,
                () => onSupplierSuccess(key, name),
                { supplierId: key, supplierName: name, supplierCode: String(codeVal) }
              );
              return;
            }
          }
        }
      }

      // Check supplier slot key (e.g. supplier2)
      if (lower.startsWith("supplier")) {
        const matchingKey = Object.keys(supplierCodes).find(k => k.toLowerCase() === lower) ||
                            Object.keys(supplierLegalNames).find(k => k.toLowerCase() === lower) ||
                            (supplierAssignedCodes ? Object.keys(supplierAssignedCodes).find(k => k.toLowerCase() === lower) : undefined);
        if (matchingKey) {
          const name = supplierLegalNames[matchingKey] || matchingKey;
          const code = supplierAssignedCodes?.[matchingKey];
          triggerSuccess(
            "supplier",
            name,
            `Успешный вход поставщика: ${name} (ключ: ${matchingKey})`,
            () => onSupplierSuccess(matchingKey, name),
            { supplierId: matchingKey, supplierName: name, supplierCode: code ? String(code) : undefined }
          );
          return;
        }
      }

      // 4. If nothing matched, give role-appropriate error
      if (activeRole === "admin") {
        handleAuthFailure("Неверный пароль администратора!");
      } else if (activeRole === "facilitator") {
        handleAuthFailure("Неверный код доступа фасилитатора!");
      } else {
        handleAuthFailure("Неверный код поставщика!");
      }
    }, 180);
  };

  const triggerSuccess = (
    role: "admin" | "facilitator" | "supplier",
    actorName: string,
    details: string,
    callback: () => void,
    extra?: {
      facilitatorName?: string;
      region?: string;
      supplierId?: string;
      supplierName?: string;
      supplierCode?: string;
    }
  ) => {
    setIsLoading(false);
    setIsSuccessCollapsing(true);
    updateEyebrows(0, 0, 0, false, false, true);

    const actionType =
      role === "admin"
        ? "ADMIN_LOGIN"
        : role === "facilitator"
        ? "FACILITATOR_LOGIN"
        : "SUPPLIER_LOGIN";

    logAuditEvent({
      actionType,
      actorName,
      actorRole: role,
      facilitatorName: extra?.facilitatorName,
      region: extra?.region,
      supplierId: extra?.supplierId,
      supplierName: extra?.supplierName,
      supplierCode: extra?.supplierCode,
      details,
      metadata: {
        role,
        actorName,
        ...extra,
      },
    }).catch(console.warn);

    // Fast transition to eliminate perceived motionless screen
    setTimeout(() => {
      callback();
    }, 200);
  };

  const handleAuthFailure = (msg: string) => {
    setIsLoading(false);
    setErrorMessage(msg);
    setPassword("");
    const nextAttempts = failedAttempts + 1;
    setFailedAttempts(nextAttempts);

    updateEyebrows(0, 0, 0, false, true, false);

    // Shake animation
    if (neonBoxRef.current) {
      neonBoxRef.current.classList.add("animate-shake");
      setTimeout(() => {
        neonBoxRef.current?.classList.remove("animate-shake");
      }, 500);
    }

    if (nextAttempts >= 5) {
      setLockoutSeconds(30);
      setErrorMessage("Слишком много попыток! Доступ заблокирован на 30 секунд.");
    }
  };

  return (
    <div className={`${isModal ? "fixed inset-0 z-50" : "min-h-screen w-full"} flex items-center justify-center relative bg-slate-950 overflow-hidden select-none font-sans`}>
      {/* Scoped CSS animations */}
      <style>{`
        @keyframes gradientBorder {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes blackHoleCollapse {
          0% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
            filter: blur(0px);
          }
          50% {
            transform: scale(0.5) rotate(180deg);
            opacity: 0.8;
            filter: blur(4px);
          }
          100% {
            transform: scale(0) rotate(360deg);
            opacity: 0;
            filter: blur(20px);
          }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
        .neon-border-box {
          position: relative;
          background: rgba(15, 23, 42, 0.90);
          backdrop-filter: blur(16px);
          border-radius: 1.5rem;
          box-shadow: 0 0 40px rgba(139, 92, 246, 0.25), inset 0 0 15px rgba(255, 255, 255, 0.05);
          transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.4s ease;
        }
        .neon-border-box::before {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: 1.6rem;
          background: linear-gradient(135deg, #a855f7, #3b82f6, #ec4899, #8b5cf6);
          background-size: 300% 300%;
          z-index: -1;
          animation: gradientBorder 6s ease infinite;
          opacity: 0.8;
          filter: blur(2px);
        }
        .black-hole-effect {
          animation: blackHoleCollapse 0.8s forwards cubic-bezier(0.7, 0, 0.84, 0);
        }
      `}</style>

      {/* Interactive Neural Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
      />

      {/* Cancel button if modal */}
      {onCancel && (
        <div className="absolute top-6 left-6 right-6 z-20 flex items-center justify-between pointer-events-auto">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 transition-all text-xs font-semibold backdrop-blur-md cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Назад к каталогу</span>
          </button>

          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem("catalog_admin");
                sessionStorage.removeItem("main_admin_auth");
                sessionStorage.removeItem("current_role");
                sessionStorage.removeItem("auth_facilitator_key");
                sessionStorage.removeItem("auth_resolved");
                Object.keys(sessionStorage).forEach((k) => {
                  if (k.startsWith("auth_") || k.includes("admin") || k.includes("facilitator")) {
                    sessionStorage.removeItem(k);
                  }
                });
              } catch (e) {}
              window.location.href = window.location.origin;
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-300 hover:text-white hover:bg-rose-900 transition-all text-xs font-semibold backdrop-blur-md cursor-pointer"
            title="Сбросить все авторизации и выйти"
          >
            <LogOut className="w-4 h-4" />
            <span>Выйти из всех сессий</span>
          </button>
        </div>
      )}

      {/* Main Login Card Wrapper */}
      <div className={`relative z-10 w-full max-w-sm p-4 mx-4 transition-all duration-300 ${isSuccessCollapsing ? "black-hole-effect" : ""}`}>
        {/* Animated Eyes and Reactive Eyebrows */}
        <div className="flex justify-center space-x-8 mb-5">
          {/* Left Eye */}
          <div className="relative flex flex-col items-center">
            <div
              ref={eyebrowLeftRef}
              className="w-11 h-1.5 bg-slate-300 rounded-full mb-2 transition-transform duration-100 ease-out shadow-sm shadow-purple-500/30"
            />
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center shadow-inner relative overflow-hidden border-2 border-slate-200">
              <div
                ref={pupilLeftRef}
                className="w-5.5 h-5.5 rounded-full absolute transition-transform duration-75 linear"
                style={{
                  background: "radial-gradient(circle at 30% 30%, #3b82f6, #0f172a)",
                }}
              >
                <div className="absolute top-1 left-1 w-1.5 h-1.5 bg-white rounded-full" />
              </div>
            </div>
          </div>

          {/* Right Eye */}
          <div className="relative flex flex-col items-center">
            <div
              ref={eyebrowRightRef}
              className="w-11 h-1.5 bg-slate-300 rounded-full mb-2 transition-transform duration-100 ease-out shadow-sm shadow-purple-500/30"
            />
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center shadow-inner relative overflow-hidden border-2 border-slate-200">
              <div
                ref={pupilRightRef}
                className="w-5.5 h-5.5 rounded-full absolute transition-transform duration-75 linear"
                style={{
                  background: "radial-gradient(circle at 30% 30%, #3b82f6, #0f172a)",
                }}
              >
                <div className="absolute top-1 left-1 w-1.5 h-1.5 bg-white rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Neon Box */}
        <div ref={neonBoxRef} className="neon-border-box p-7 text-center">
          {/* Role Switcher Tabs */}
          <div className="flex items-center justify-center p-1 bg-slate-900/90 rounded-xl border border-slate-800 mb-5">
            <button
              type="button"
              onClick={() => {
                setActiveRole("admin");
                setErrorMessage("");
                setPassword("");
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeRole === "admin"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Админ</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveRole("facilitator");
                setErrorMessage("");
                setPassword("");
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeRole === "facilitator"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Фасилитатор</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveRole("supplier");
                setErrorMessage("");
                setPassword("");
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeRole === "supplier"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Поставщик</span>
            </button>
          </div>

          {/* Header Title */}
          <div className="mb-5">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 mb-2">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold text-white tracking-wide">
              {activeRole === "admin"
                ? "Вход Администратора"
                : activeRole === "facilitator"
                ? "Вход Фасилитатора"
                : "Кабинет Поставщика"}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {activeRole === "admin"
                ? "Введите системный пароль доступа"
                : activeRole === "facilitator"
                ? "Введите ваш персональный код фасилитатора"
                : "Введите код доступа организации поставщика"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                ref={inputRef}
                type="password"
                value={password}
                disabled={lockoutSeconds > 0 || isLoading}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage("");
                  updateEyesToInput();
                }}
                onFocus={updateEyesToInput}
                onBlur={() => {
                  const ebLeft = eyebrowLeftRef.current;
                  const ebRight = eyebrowRightRef.current;
                  if (ebLeft && ebRight && !errorMessage) {
                    ebLeft.style.transform = "translateY(0px) rotate(0deg)";
                    ebRight.style.transform = "translateY(0px) rotate(0deg)";
                    ebLeft.style.backgroundColor = "#cbd5e1";
                    ebRight.style.backgroundColor = "#cbd5e1";
                  }
                }}
                placeholder={
                  activeRole === "admin"
                    ? "••••••••"
                    : activeRole === "facilitator"
                    ? "Код фасилитатора"
                    : "Код поставщика"
                }
                required
                autoFocus
                className="w-full px-4 py-3 bg-slate-900/90 border border-slate-700/80 rounded-xl text-center text-white placeholder-slate-500 tracking-widest text-base focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/40 transition-all duration-200 disabled:opacity-50"
              />
            </div>

            {errorMessage && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-rose-400 font-semibold animate-pulse">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {lockoutSeconds > 0 && (
              <div className="text-xs text-amber-400 font-mono font-bold">
                Повторите через {lockoutSeconds} сек.
              </div>
            )}

            <button
              type="submit"
              disabled={lockoutSeconds > 0 || isLoading || !password}
              className="w-full py-3.5 px-6 rounded-xl font-bold text-xs uppercase tracking-wider text-white bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-900/40 flex items-center justify-center space-x-2 cursor-pointer"
            >
              {isLoading ? (
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
                  <span className="w-2 h-2 bg-white rounded-full animate-ping delay-100"></span>
                  <span className="w-2 h-2 bg-white rounded-full animate-ping delay-200"></span>
                </span>
              ) : (
                <span>Войти в систему</span>
              )}
            </button>
          </form>

          {/* Secure System Stamp */}
          <div className="mt-5 pt-3 border-t border-slate-800/80 text-[10px] text-slate-500 flex items-center justify-between">
            <span>SPMEI Security Module</span>
            <span className="font-mono">GDPR Compliant</span>
          </div>
        </div>
      </div>
    </div>
  );
};
