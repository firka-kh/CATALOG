import React, { useState } from "react";
import {
  Monitor,
  Download,
  X,
  CheckCircle2,
  ExternalLink,
  Laptop,
  HelpCircle,
  Sparkles,
  Compass,
  ArrowRight,
} from "lucide-react";
import { usePWAInstall } from "../lib/usePWAInstall";

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "pc" | "mobile";
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  defaultTab = "pc",
}) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<"chrome" | "edge" | "yandex" | "mobile">(
    defaultTab === "mobile" ? "mobile" : "chrome"
  );
  const [installSuccess, setInstallSuccess] = useState(false);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (isInstallable) {
      const res = await install();
      if (res) {
        setInstallSuccess(true);
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md transition-all print:hidden">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-5 sm:px-6 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
              <Laptop className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Установка приложения на ПК
                </h3>
                <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Windows & macOS
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Запуск в отдельном окне без лишних меню браузера, ярлык на рабочем столе и в Пуск
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick One-Click Action Banner if browser supported */}
        {isInstallable && !isInstalled && !installSuccess && (
          <div className="bg-indigo-50 border-b border-indigo-100 p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-indigo-950">
                  Браузер готов к мгновенной установке!
                </div>
                <div className="text-[11px] text-indigo-700">
                  Нажмите кнопку ниже, чтобы добавить приложение на рабочий стол ПК за 1 клик
                </div>
              </div>
            </div>
            <button
              onClick={handleInstallClick}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Установить в 1 клик</span>
            </button>
          </div>
        )}

        {installSuccess && (
          <div className="bg-emerald-50 border-b border-emerald-100 p-4 sm:px-6 flex items-center gap-3 shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-xs font-bold text-emerald-800">
              Приложение успешно установлено! Теперь вы можете запускать его с Рабочего стола или Панели задач.
            </div>
          </div>
        )}

        {isInstalled && (
          <div className="bg-emerald-50 border-b border-emerald-100 p-3 sm:px-6 flex items-center gap-2 text-xs font-semibold text-emerald-800 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Приложение уже установлено и работает в режиме рабочего стола ПК!
          </div>
        )}

        {/* Content Tabs */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 flex items-center gap-2 shrink-0 overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setActiveTab("chrome")}
            className={`py-3 px-3.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "chrome"
                ? "border-indigo-600 text-indigo-600 font-bold bg-white"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Google Chrome
          </button>
          <button
            onClick={() => setActiveTab("edge")}
            className={`py-3 px-3.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "edge"
                ? "border-indigo-600 text-indigo-600 font-bold bg-white"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Microsoft Edge
          </button>
          <button
            onClick={() => setActiveTab("yandex")}
            className={`py-3 px-3.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "yandex"
                ? "border-indigo-600 text-indigo-600 font-bold bg-white"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Яндекс.Браузер
          </button>
          <button
            onClick={() => setActiveTab("mobile")}
            className={`py-3 px-3.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "mobile"
                ? "border-indigo-600 text-indigo-600 font-bold bg-white"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Телефон / Планшет
          </button>
        </div>

        {/* Step-by-Step Instructions Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {activeTab === "chrome" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Способ 1: Иконка в адресной строке (самый быстрый)
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Посмотрите в <strong>правую часть адресной строки</strong> Google Chrome (где указан URL сайта). Там появится значок монитора со стрелочкой или круглый значок <strong>«Установить приложение SPMEI»</strong>. Нажмите на него и подтвердите установку.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Способ 2: Через главное меню Chrome
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    1. Нажмите в правом верхнем углу браузера <strong>меню ⋮ (три точки)</strong>.<br />
                    2. Выберите пункт <strong>«Сохранить и поделиться»</strong> ➔ <strong>«Установить приложение “SPMEI”...»</strong>.<br />
                    3. В появившемся окне нажмите <strong>«Установить»</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "edge" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Значок в адресной строке Edge
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    В правой части адресной строки Edge нажмите на значок <strong>«Приложение доступно»</strong> (квадратные плитки со знаком плюса). Нажмите <strong>«Установить»</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Через меню Edge
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Нажмите меню <strong>··· (три точки)</strong> в правом верхнем углу ➔ <strong>«Приложения»</strong> ➔ <strong>«Установить этот сайт как приложение»</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "yandex" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Установка через Яндекс.Браузер
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    В правом углу адресной строки нажмите кнопку <strong>«Установить приложение»</strong> или откройте меню <strong>≡ (три полоски)</strong> ➔ <strong>«Дополнительно»</strong> ➔ <strong>«Установить приложение на ПК»</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "mobile" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  📱
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Android (Chrome / Samsung Internet)
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Нажмите меню <strong>⋮ (три точки)</strong> ➔ <strong>«Установить приложение»</strong> или <strong>«Добавить на главный экран»</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  🍎
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    iPhone / iPad (Safari)
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Нажмите кнопку <strong>«Поделиться»</strong> (квадрат со стрелкой вверх внизу экрана) ➔ прокрутите вниз ➔ выберите <strong>«На экран «Домой»»</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Benefits summary card */}
          <div className="bg-slate-900 text-slate-200 rounded-xl p-4 space-y-2 border border-slate-800">
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Преимущества установленного приложения на ПК:
            </div>
            <ul className="text-xs space-y-1.5 text-slate-300 list-disc list-inside">
              <li>Открывается мгновенно в отдельном полноэкранном окне без вкладок и панелей поиска браузера.</li>
              <li>Специалист по мониторингу может закрепить иконку на Панели задач Windows или Dock macOS.</li>
              <li>Кэширование для плавной и быстрой работы при нестабильном интернет-соединении.</li>
              <li>Прямой переход в панель мониторинга цен и тепловую карту районов в 1 клик.</li>
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500">
            PWA (Progressive Web Application) • Поддерживает офлайн-кэш
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Понятно, закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
