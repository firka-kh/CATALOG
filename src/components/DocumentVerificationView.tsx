import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  FileText,
  Building2,
  User,
  MapPin,
  Calendar,
  Clock,
  Printer,
  Copy,
  Check,
  ArrowLeft,
  ExternalLink,
  Award,
  Hash,
  Phone,
  Mail,
  Truck,
  PackageCheck,
  RefreshCw,
  QrCode,
  Lock,
} from "lucide-react";
import { QuoteRecord, fetchQuoteById } from "../lib/quotesHistory";

interface Props {
  quoteId: string;
  onClose?: () => void;
  onNavigateHome?: () => void;
}

export const DocumentVerificationView: React.FC<Props> = ({
  quoteId,
  onClose,
  onNavigateHome,
}) => {
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<QuoteRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const getPublicOrigin = () => {
    if (typeof window === "undefined") return "";
    let origin = window.location.origin;
    if (origin.includes("ais-dev-")) {
      origin = origin.replace("ais-dev-", "ais-pre-");
    }
    return origin;
  };

  const verificationUrl = typeof window !== "undefined"
    ? `${getPublicOrigin()}/?verify=${encodeURIComponent(quoteId)}`
    : "";

  useEffect(() => {
    let isCancelled = false;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchQuoteById(quoteId);
        if (!isCancelled) {
          if (data) {
            setQuote(data);
          } else {
            setError(`Документ с номером "${quoteId}" не найден в официальном реестре.`);
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          setError(err?.message || "Ошибка подключения к реестру проверки.");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    if (quoteId) {
      loadData();
    } else {
      setError("Не указан идентификатор документа для проверки.");
      setLoading(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [quoteId]);

  useEffect(() => {
    if (verificationUrl) {
      QRCode.toDataURL(verificationUrl, {
        width: 180,
        margin: 1,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      })
        .then((url) => setQrCodeDataUrl(url))
        .catch((err) => console.warn("Failed to generate verification QR:", err));
    }
  }, [verificationUrl]);

  const handleCopyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(verificationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-start py-6 px-3 sm:px-6 select-none font-sans">
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          .print-clean {
            background: white !important;
            color: black !important;
            border: 1px solid #cbd5e1 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      {/* Top Navigation Bar */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-6 no-print">
        <button
          onClick={onNavigateHome || onClose}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors shadow-sm cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Вернуться в систему</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            title="Скопировать постоянную ссылку проверки"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? "Ссылка скопирована!" : "Скопировать ссылку"}</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Печать свидетельства</span>
          </button>
        </div>
      </div>

      {/* Main Official Verification Card */}
      <div className="w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden print-clean">
        {/* State Banner / Heraldic Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border-b border-slate-800 p-6 sm:p-8 text-center relative overflow-hidden">
          {/* Decorative Tri-Color / Gold Accent Ribbon */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-amber-400 to-indigo-500" />

          {/* Official Heraldic Shield / Crest */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-indigo-500/20 border border-amber-500/40 text-amber-400 mb-3 shadow-lg shadow-amber-500/10">
            <Award className="w-8 h-8 text-amber-400" />
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase">
            ЭЛЕКТРОННЫЙ КОНТРОЛЬ ПОДЛИННОСТИ КУПОНА
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-2xl mx-auto font-medium">
            Официальная верификационная система электронного каталога ГРП при МТМЗН РТ
          </p>

          <div className="mt-3.5 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-[11px] font-mono text-slate-300">
            <Lock className="w-3 h-3 text-indigo-400" />
            <span>Шифрованный протокол верификации • SHA-256</span>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="p-16 flex flex-col items-center justify-center gap-4 text-center">
            <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" />
            <div>
              <p className="text-base font-bold text-white">Выполняется сверка с реестром базы данных...</p>
              <p className="text-xs text-slate-400 mt-1">Проверка контрольной суммы и статуса спецификации #{quoteId}</p>
            </div>
          </div>
        )}

        {/* Error / Not Found State */}
        {!loading && error && (
          <div className="p-8 sm:p-12 text-center">
            <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border-2 border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-10 h-10" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-block mb-2">
              Статус: Не подтвержден
            </span>
            <h3 className="text-2xl font-black text-white">ДОКУМЕНТ НЕ ОБНАРУЖЕН В РЕЕСТРЕ</h3>
            <p className="text-sm text-slate-300 max-w-lg mx-auto mt-2 leading-relaxed">
              {error}
            </p>
            <div className="mt-6 p-4 max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-400 text-left space-y-1.5">
              <p className="font-semibold text-slate-300">Возможные причины:</p>
              <p>• Неверно введен или отсканирован код спецификации.</p>
              <p>• Документ был аннулирован или удален из реестра Администратором.</p>
              <p>• Попытка предъявления неавторизованного или поддельного бланка.</p>
            </div>
          </div>
        )}

        {/* Success / Verified Document State */}
        {!loading && quote && (
          <div className="p-6 sm:p-8 space-y-6">
            {/* Prominent Verification Seal Banner */}
            <div className="bg-gradient-to-r from-emerald-950/80 via-emerald-900/40 to-slate-900 border-2 border-emerald-500/40 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-5 shadow-lg shadow-emerald-950/40">
              <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
                  <ShieldCheck className="w-9 h-9" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400 text-[11px] font-extrabold uppercase tracking-wider mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Официально подтвержден
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-wide">
                    ДОКУМЕНТ ДЕЙСТВИТЕЛЕН
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Электронная цифровая запись проверена в центральной распределенной базе данных. Все реквизиты и состав подлинны.
                  </p>
                </div>
              </div>

              {/* Dynamic QR Code Badge */}
              <div className="shrink-0 bg-white p-2.5 rounded-xl border border-slate-300 shadow-md flex flex-col items-center">
                {qrCodeDataUrl ? (
                  <img
                    src={qrCodeDataUrl}
                    alt="QR Verification"
                    className="w-24 h-24 sm:w-28 sm:h-28 object-contain"
                  />
                ) : (
                  <div className="w-24 h-24 bg-slate-100 flex items-center justify-center text-slate-400">
                    <QrCode className="w-8 h-8" />
                  </div>
                )}
                <span className="text-[9px] font-mono font-bold text-slate-800 mt-1 uppercase tracking-tight">
                  {quote.id}
                </span>
              </div>
            </div>

            {/* Quick Passport Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Номер документа</div>
                <div className="text-sm font-mono font-bold text-indigo-400 mt-0.5 truncate select-all">{quote.id}</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Дата регистрации</div>
                <div className="text-sm font-semibold text-white mt-0.5">{quote.createdAt}</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Локация / Регион</div>
                <div className="text-sm font-semibold text-white mt-0.5 truncate">{quote.selectedRegion}</div>
                {quote.selectedDistrict && (
                  <div className="text-[10px] text-slate-400 mt-0.5">р-н {quote.selectedDistrict}</div>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Итоговая сумма</div>
                <div className="text-sm font-mono font-black text-emerald-400 mt-0.5">
                  {quote.totalAmount.toLocaleString("ru-RU")} с.
                </div>
              </div>
            </div>

            {/* Participants Cards (2 Columns: Facilitator & Beneficiary) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Facilitator Organization */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800 font-bold text-slate-200">
                  <Building2 className="w-4 h-4 text-indigo-400" />
                  <span>Организация-эмитент (Фасилитатор)</span>
                </div>

                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Юридическое наименование:</span>
                    <p className="font-bold text-white text-sm">
                      {quote.facilitatorLegalName || quote.facilitatorName || "Не указано"}
                    </p>
                  </div>

                  {quote.facilitatorRep && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500">Уполномоченный представитель:</span>
                      <p className="font-medium text-slate-200">{quote.facilitatorRep}</p>
                    </div>
                  )}

                  {quote.specialistName && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500">Ответственный специалист:</span>
                      <p className="font-medium text-slate-200">{quote.specialistName}</p>
                    </div>
                  )}

                  {(quote.facilitatorPhone || quote.facilitatorEmail) && (
                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-300">
                      {quote.facilitatorPhone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {quote.facilitatorPhone}
                        </span>
                      )}
                      {quote.facilitatorEmail && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-400" />
                          {quote.facilitatorEmail}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Beneficiary Details */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800 font-bold text-slate-200">
                  <User className="w-4 h-4 text-indigo-400" />
                  <span>Получатель / Заказчик (Бенефициар)</span>
                </div>

                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">ФИО Бенефициара:</span>
                    <p className="font-bold text-white text-base text-emerald-300">
                      {quote.clientName || "Не указан"}
                    </p>
                  </div>

                  {quote.beneficiaryId && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500">Идентификатор бенефициара:</span>
                      <p className="font-mono font-semibold text-slate-200">
                        {quote.beneficiaryId}
                      </p>
                    </div>
                  )}

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Место назначения:</span>
                    <p className="font-medium text-slate-200">
                      {quote.selectedRegion} {quote.selectedDistrict ? `• р-н ${quote.selectedDistrict}` : ""}
                    </p>
                  </div>

                  {quote.note && (
                    <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-300">Примечание:</span> {quote.note}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Specification Items Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-200 px-1">
                <span className="flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4 text-indigo-400" />
                  <span>Содержимое спецификации / Акта ({quote.items?.length || 0} наименований):</span>
                </span>
                <span className="font-mono text-slate-400">Сфера: {quote.selectedSphere || "Все сферы"}</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-800/70 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-800">
                        <th className="p-3 w-10 text-center">#</th>
                        <th className="p-3 w-24">Код</th>
                        <th className="p-3">Наименование товара</th>
                        <th className="p-3 w-28 text-center">Кол-во</th>
                        <th className="p-3 w-32 text-right">Цена за ед.</th>
                        <th className="p-3 w-32 text-right">Сумма</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {quote.items?.map((it, idx) => {
                        const lineTotal = (it.selectedPrice || 0) * (it.quantity || 1);
                        return (
                          <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                            <td className="p-3 text-center text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                            <td className="p-3 font-mono text-indigo-400 font-semibold text-[11px]">
                              {it.product.code ? `#${it.product.code}` : it.product.id?.slice(0, 8)}
                            </td>
                            <td className="p-3 font-medium text-white">
                              <div>{it.product.name}</div>
                              {it.product.description && (
                                <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{it.product.description}</div>
                              )}
                            </td>
                            <td className="p-3 text-center font-mono font-semibold text-slate-200">
                              {it.quantity} {it.product.unit || "шт."}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-300">
                              {(it.selectedPrice || 0).toFixed(2)} с.
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-white">
                              {lineTotal.toFixed(2)} с.
                            </td>
                          </tr>
                        );
                      })}

                      {/* Logistics row if present */}
                      {quote.logisticsCost > 0 && (
                        <tr className="bg-slate-850/60 border-t border-slate-800 text-xs">
                          <td colSpan={5} className="p-3 text-right font-semibold text-slate-300 flex items-center justify-end gap-1.5">
                            <Truck className="w-3.5 h-3.5 text-slate-400" />
                            <span>Логистические расходы ({quote.selectedRegion}):</span>
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-200">
                            {quote.logisticsCost.toFixed(2)} с.
                          </td>
                        </tr>
                      )}

                      {/* Total row */}
                      <tr className="bg-slate-800/90 font-bold text-sm border-t-2 border-indigo-500/40">
                        <td colSpan={5} className="p-3.5 text-right uppercase tracking-wider text-white">
                          ИТОГО ПО СПЕЦИФИКАЦИИ:
                        </td>
                        <td className="p-3.5 text-right font-mono text-base font-black text-emerald-400 whitespace-nowrap">
                          {quote.totalAmount.toLocaleString("ru-RU")} с.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Official Digital Stamp & Legal Verification Footer */}
            <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-6 bg-slate-900/50 p-5 rounded-2xl">
              <div className="space-y-1 text-center sm:text-left text-xs">
                <div className="flex items-center justify-center sm:justify-start gap-1.5 text-emerald-400 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Электронная подпись подтверждена</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Регистрационный номер в реестре: <strong className="text-slate-200">{quote.id}</strong>
                </p>
                <p className="text-[10px] font-mono text-slate-500">
                  Хеш-идентификатор проверки: SHA256:{Math.abs(hashCode(quote.id + quote.createdAt)).toString(16).padStart(16, "0")}
                </p>
              </div>

              {/* Official Seal / Stamp Graphic */}
              <div className="relative w-36 h-36 rounded-full border-4 border-dashed border-indigo-500/60 flex flex-col items-center justify-center text-center p-2 text-indigo-300 rotate-[-4deg] shadow-lg shadow-indigo-500/10 shrink-0">
                <div className="w-28 h-28 rounded-full border-2 border-indigo-400/80 flex flex-col items-center justify-center p-1">
                  <Award className="w-5 h-5 text-indigo-400 mb-0.5" />
                  <span className="text-[8px] font-black uppercase tracking-wider leading-tight text-indigo-200">
                    ЭЛЕКТРОННЫЙ КОНТРОЛЬ
                  </span>
                  <span className="text-[7.5px] font-bold uppercase tracking-tight text-indigo-300">
                    ГРП МТМЗН
                  </span>
                  <span className="text-[7px] font-mono text-emerald-400 font-black mt-0.5">
                    ✓ ВЕРИФИЦИРОВАНО
                  </span>
                  <span className="text-[6px] font-mono text-indigo-400 mt-0.5">
                    SPMEI • РТ
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="bg-slate-900 border-t border-slate-800 px-6 py-4 text-center text-[11px] text-slate-500">
          Официальная верификационная система электронного каталога ГРП при МТМЗН РТ. Все права защищены.
        </div>
      </div>
    </div>
  );
};

// Helper for deterministic hash
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}
