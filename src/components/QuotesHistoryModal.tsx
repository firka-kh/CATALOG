import React, { useState, useEffect } from 'react';
import { 
  X, 
  Search, 
  Calendar, 
  User, 
  FileSpreadsheet, 
  Printer, 
  Trash2, 
  ShoppingCart, 
  ChevronDown, 
  ChevronUp, 
  MapPin, 
  Briefcase, 
  CheckCircle2,
  Clock,
  Archive,
  RefreshCw,
  Lock,
  ShieldAlert,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2,
  Edit3,
  History,
  Layers,
  Building2,
  QrCode,
  ShieldCheck,
  Cpu,
  Monitor,
  Smartphone,
  Tablet,
  Copy,
  Check,
  HardDrive,
  Fingerprint,
} from 'lucide-react';
import { QuoteRecord, fetchQuotesHistory, deleteQuoteFromHistory, deleteAllQuotesFromHistory } from '../lib/quotesHistory';
import { downloadCartExcel, downloadQuotesRegistryExcel } from '../lib/excelExport';

interface QuotesHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: string[];
  currentFacilitatorName?: string;
  isAdmin?: boolean;
  adminPassword?: string;
  onLoadCartToActive: (
    items: any[],
    region?: string,
    sphere?: string,
    clientName?: string,
    facilitatorName?: string,
    note?: string,
    district?: string,
    specialistName?: string,
    facilitatorLegalName?: string,
    facilitatorRep?: string,
    facilitatorPhone?: string,
    facilitatorEmail?: string,
    quoteId?: string,
    beneficiaryId?: string
  ) => void;
  onTriggerPdfPrint: (data: {
    cart: any[];
    logisticsCost: number;
    selectedRegion: string;
    selectedDistrict?: string;
    selectedSphere?: string;
    clientName: string;
    beneficiaryId?: string;
    facilitatorName: string;
    facilitatorLegalName?: string;
    facilitatorRep?: string;
    facilitatorPhone?: string;
    facilitatorEmail?: string;
    specialistName?: string;
    note?: string;
    createdAt?: string;
    quoteId?: string;
  }) => void;
}

export const QuotesHistoryModal: React.FC<QuotesHistoryModalProps> = ({
  isOpen,
  onClose,
  suppliers,
  currentFacilitatorName,
  isAdmin = false,
  adminPassword = "020779",
  onLoadCartToActive,
  onTriggerPdfPrint,
}) => {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFacilitatorFilter, setSelectedFacilitatorFilter] = useState<string>('all');
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [cardTab, setCardTab] = useState<Record<string, "items" | "revisions" | "device">>({});
  const [expandedRevisionId, setExpandedRevisionId] = useState<string | null>(null);
  const [copiedFpId, setCopiedFpId] = useState<string | null>(null);

  // States for Delete All with Admin Password confirmation
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState<boolean>(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isDeletingAll, setIsDeletingAll] = useState<boolean>(false);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const records = await fetchQuotesHistory();
      setQuotes(records);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingId !== id) {
      setDeletingId(id);
      return;
    }
    try {
      await deleteQuoteFromHistory(id);
      setQuotes(prev => prev.filter(q => q.id !== id));
      setDeletingId(null);
      showToast("Запись успешно удалена из архива");
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Не удалось удалить подборку");
    }
  };

  const handleOpenDeleteAllModal = () => {
    setAdminPasswordInput('');
    setPasswordError('');
    setShowPassword(false);
    setIsDeleteAllModalOpen(true);
  };

  const handleConfirmDeleteAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const expected = (adminPassword || "020779").trim();
    const entered = adminPasswordInput.trim();

    // Check if entered password matches configured password or common admin defaults
    if (entered !== expected && entered !== "020779" && entered !== "@020779") {
      setPasswordError("Неверный пароль администратора. Доступ запрещен.");
      return;
    }

    try {
      setIsDeletingAll(true);
      const count = await deleteAllQuotesFromHistory();
      setQuotes([]);
      setIsDeleteAllModalOpen(false);
      setAdminPasswordInput('');
      setPasswordError('');
      showToast(`Архив успешно очищен (удалено: ${count} подборок)`);
    } catch (err: any) {
      console.error("Failed to delete all quotes:", err);
      setPasswordError("Ошибка при удалении: " + (err?.message || "Сбой соединения"));
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleExportExcel = async (quote: QuoteRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await downloadCartExcel(
        quote.items,
        quote.logisticsCost,
        suppliers,
        quote.selectedRegion,
        quote.selectedSphere,
        quote.clientName,
        quote.facilitatorName,
        quote.note,
        quote.selectedDistrict,
        quote.specialistName
      );
      showToast("Excel файл с запечатанными ценами успешно сформирован");
    } catch (err) {
      console.error("Excel export error:", err);
      alert("Ошибка при выгрузке Excel");
    }
  };

  const handlePrintPdf = (quote: QuoteRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    onTriggerPdfPrint({
      cart: quote.items,
      logisticsCost: quote.logisticsCost,
      selectedRegion: quote.selectedRegion,
      selectedDistrict: quote.selectedDistrict,
      selectedSphere: quote.selectedSphere,
      clientName: quote.clientName,
      beneficiaryId: quote.beneficiaryId,
      facilitatorName: quote.facilitatorName,
      facilitatorLegalName: quote.facilitatorLegalName,
      facilitatorRep: quote.facilitatorRep,
      facilitatorPhone: quote.facilitatorPhone,
      facilitatorEmail: quote.facilitatorEmail,
      specialistName: quote.specialistName,
      note: quote.note,
      createdAt: quote.createdAt,
      quoteId: quote.id,
    });
    showToast("Отправка на печать / PDF...");
  };

  const handleRestoreToCart = (quote: QuoteRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    onLoadCartToActive(
      quote.items,
      quote.selectedRegion,
      quote.selectedSphere,
      quote.clientName,
      quote.facilitatorName,
      quote.note,
      quote.selectedDistrict,
      quote.specialistName,
      quote.facilitatorLegalName,
      quote.facilitatorRep,
      quote.facilitatorPhone,
      quote.facilitatorEmail,
      quote.id,
      quote.beneficiaryId
    );
    showToast(`Купон #${quote.id} открыт в корзине для изменения`);
    onClose();
  };

  const handleExportRegistryExcel = async () => {
    if (filteredQuotes.length === 0) {
      alert("Нет подборок для экспорта в Excel");
      return;
    }
    try {
      const facilitatorFilterParam = isAdmin
        ? selectedFacilitatorFilter
        : (currentFacilitatorName || 'Фасилитатор');
      await downloadQuotesRegistryExcel(filteredQuotes, facilitatorFilterParam, suppliers);
      showToast("Реестр КП с детализацией успешно экспортирован в Excel");
    } catch (err) {
      console.error("Excel registry export error:", err);
      alert("Не удалось экспортировать реестр в Excel");
    }
  };

  // Base quotes accessible to current user:
  // If not admin, the facilitator is strictly restricted to ONLY their own quotes
  const userQuotes = quotes.filter((q) => {
    if (isAdmin) return true;
    if (!currentFacilitatorName) return true;
    const currentFac = currentFacilitatorName.trim().toLowerCase();
    const quoteFac = (q.facilitatorName || '').trim().toLowerCase();
    return quoteFac === currentFac;
  });

  const facilitatorNames: string[] = quotes
    .map((q) => q.facilitatorName)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
  const availableFacilitators: string[] = Array.from(new Set<string>(facilitatorNames)).sort((a, b) =>
    a.localeCompare(b, 'ru')
  );

  const filteredQuotes = userQuotes.filter((q) => {
    // 1. Facilitator filter selection (Admin only)
    if (isAdmin && selectedFacilitatorFilter !== 'all') {
      const targetFac = selectedFacilitatorFilter.trim().toLowerCase();
      const quoteFac = (q.facilitatorName || '').trim().toLowerCase();
      if (quoteFac !== targetFac) {
        return false;
      }
    }

    // 2. Text search query match
    const qTerm = searchQuery.toLowerCase().trim();
    if (!qTerm) return true;
    const idMatch = (q.id || '').toLowerCase().includes(qTerm);
    const benIdMatch = (q.beneficiaryId || '').toLowerCase().includes(qTerm);
    const clientMatch = (q.clientName || '').toLowerCase().includes(qTerm);
    const facMatch = (q.facilitatorName || '').toLowerCase().includes(qTerm);
    const noteMatch = (q.note || '').toLowerCase().includes(qTerm);
    const dateMatch = (q.createdAt || '').toLowerCase().includes(qTerm);
    const regionMatch = (q.selectedRegion || '').toLowerCase().includes(qTerm);
    const sphereMatch = (q.selectedSphere || '').toLowerCase().includes(qTerm);
    const itemMatch = q.items.some(
      (i) =>
        (i.product?.name || '').toLowerCase().includes(qTerm) ||
        (i.product?.code && String(i.product.code).toLowerCase().includes(qTerm)) ||
        (i.product?.id && String(i.product.id).toLowerCase().includes(qTerm))
    );
    return idMatch || benIdMatch || clientMatch || facMatch || noteMatch || dateMatch || regionMatch || sphereMatch || itemMatch;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-200 print:hidden">
      {/* Toast banner */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-lg font-medium text-sm flex items-center gap-2 animate-in slide-in-from-top duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] max-h-[900px] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0 border-b border-indigo-900/50 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-indigo-500/20 rounded-xl border border-indigo-400/30 text-indigo-300 shrink-0">
              <Archive className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
                <span>История подборок</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 whitespace-nowrap">
                  Архив КП
                </span>
                {!isAdmin && currentFacilitatorName && (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-400/30 flex items-center gap-1 whitespace-nowrap">
                    <User className="w-3.5 h-3.5 text-amber-300" />
                    {currentFacilitatorName}
                  </span>
                )}
                {isAdmin && (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 flex items-center gap-1 whitespace-nowrap">
                    Администратор (Все подборки)
                  </span>
                )}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5 truncate">
                {!isAdmin && currentFacilitatorName
                  ? `Личный архив сохраненных коммерческих предложений фасилитатора ${currentFacilitatorName}`
                  : "Полный реестр всех сохраненных подборок в системе"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all shrink-0"
            title="Закрыть"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Toolbar & Search */}
        <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between shrink-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 min-w-0">
            <div className="relative flex-1 min-w-[200px] sm:max-w-xs md:max-w-sm">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Поиск по номеру КП, клиенту..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-7 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 p-0.5"
                  title="Очистить поиск"
                >
                  ✕
                </button>
              )}
            </div>

            {isAdmin && availableFacilitators.length > 0 ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-slate-600 font-medium whitespace-nowrap">Фасилитатор:</span>
                <select
                  value={selectedFacilitatorFilter}
                  onChange={(e) => setSelectedFacilitatorFilter(e.target.value)}
                  className="px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 max-w-[220px]"
                >
                  <option value="all">Все ({quotes.length})</option>
                  {availableFacilitators.map((fac) => {
                    const count = quotes.filter(
                      (q) => (q.facilitatorName || '').trim().toLowerCase() === fac.trim().toLowerCase()
                    ).length;
                    return (
                      <option key={fac} value={fac}>
                        {fac} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : !isAdmin && currentFacilitatorName ? (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200/80 rounded-xl text-xs font-semibold text-indigo-900 shadow-xs shrink-0">
                <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="whitespace-nowrap">Личные КП ({userQuotes.length})</span>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-between sm:justify-end shrink-0">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 shrink-0">
              Отображено: <strong className="text-slate-900">{filteredQuotes.length}</strong>
            </span>

            <button
              onClick={handleExportRegistryExcel}
              disabled={filteredQuotes.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all shadow-sm shrink-0 whitespace-nowrap"
              title="Выгрузить весь список подборок с деталями в Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Реестр в Excel</span>
            </button>

            <button
              onClick={handleOpenDeleteAllModal}
              disabled={quotes.length === 0 || loading || isDeletingAll}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:hover:bg-rose-600 text-white rounded-xl text-xs font-semibold transition-all shadow-sm shrink-0 whitespace-nowrap"
              title="Удалить все сохраненные КП (требуется пароль администратора)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Удалить все</span>
            </button>

            <button
              onClick={loadHistory}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-all disabled:opacity-50 shrink-0 whitespace-nowrap"
              title="Обновить список"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Обновить</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-100/60">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-sm font-medium">Загрузка архива КП из базы данных...</p>
            </div>
          ) : filteredQuotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-center p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <Archive className="w-12 h-12 text-slate-300 mb-3" />
              <h3 className="text-base font-bold text-slate-700">Подборки не найдены</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                {searchQuery
                  ? "По вашему поисковому запросу ничего не найдено. Попробуйте изменить параметры поиска."
                  : !isAdmin && currentFacilitatorName
                  ? `У фасилитатора «${currentFacilitatorName}» пока нет сохраненных подборок в архиве.`
                  : "В архиве пока нет сохраненных КП. Подборки сохраняются непосредственно из корзины."}
              </p>
            </div>
          ) : (
            filteredQuotes.map((quote) => {
              const isExpanded = expandedQuoteId === quote.id;
              const isDeleting = deletingId === quote.id;

              return (
                <div
                  key={quote.id}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all overflow-hidden"
                >
                  {/* Card Header Summary */}
                  <div 
                    onClick={() => setExpandedQuoteId(isExpanded ? null : quote.id)}
                    className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Left Details */}
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {quote.beneficiaryId && (
                          <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded-md bg-slate-900 text-white shadow-2xs tracking-wider">
                            ID: {quote.beneficiaryId}
                          </span>
                        )}
                        <span className="font-bold text-base sm:text-lg text-slate-900 truncate">
                          {quote.clientName}
                        </span>
                        <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                          {quote.id}
                        </span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Снимок цен зафиксирован
                        </span>
                        {quote.revisions && quote.revisions.length > 0 && (
                          <span 
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedQuoteId(quote.id);
                              setCardTab((prev) => ({ ...prev, [quote.id]: "revisions" }));
                            }}
                            className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                            title="Нажмите, чтобы посмотреть историю изменений купона"
                          >
                            <History className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>История правок ({quote.revisions.length})</span>
                            {quote.updatedAt && (
                              <span className="text-amber-700 font-normal hidden sm:inline">
                                • изм. {quote.updatedAt}
                              </span>
                            )}
                          </span>
                        )}
                        {quote.deviceAudit ? (
                          <span 
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedQuoteId(quote.id);
                              setCardTab((prev) => ({ ...prev, [quote.id]: "device" }));
                            }}
                            className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                            title={`Аппаратный слепок: ${quote.deviceAudit.summary}`}
                          >
                            <Cpu className="w-3 h-3 text-indigo-600 shrink-0" />
                            <span>{quote.deviceAudit.deviceType}: {quote.deviceAudit.os}</span>
                            <span className="text-[10px] text-indigo-600 font-bold hidden sm:inline">[{quote.deviceAudit.fingerprintId.slice(0, 8)}]</span>
                          </span>
                        ) : quote.deviceAuditSummary ? (
                          <span 
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedQuoteId(quote.id);
                              setCardTab((prev) => ({ ...prev, [quote.id]: "device" }));
                            }}
                            className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                            title={quote.deviceAuditSummary}
                          >
                            <Cpu className="w-3 h-3 text-slate-600 shrink-0" />
                            <span>Слепок оборудования</span>
                          </span>
                        ) : (
                          <span 
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedQuoteId(quote.id);
                              setCardTab((prev) => ({ ...prev, [quote.id]: "device" }));
                            }}
                            className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                            title="Слепок оборудования (нажмите для просмотра)"
                          >
                            <Cpu className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>Слепок оборудования</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5 font-medium">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>Фасилитатор: <strong className="text-slate-800">{quote.facilitatorName}</strong></span>
                        </div>
                        {quote.specialistName && (
                          <div className="flex items-center gap-1.5 font-medium">
                            <span className="text-[10px] uppercase font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                              Специалист: {quote.specialistName}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{quote.createdAt}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-600">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{quote.selectedRegion}{quote.selectedDistrict ? ` / ${quote.selectedDistrict}` : ''}</span>
                        </div>
                        {quote.selectedSphere && quote.selectedSphere !== "Все сферы" && (
                          <div className="flex items-center gap-1 text-indigo-700 font-medium">
                            <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{quote.selectedSphere}</span>
                          </div>
                        )}
                      </div>

                      {quote.note && (
                        <p className="text-xs italic text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 max-w-2xl">
                          «{quote.note}»
                        </p>
                      )}
                    </div>

                    {/* Right Price & Actions */}
                    <div className="flex items-center justify-between md:justify-end gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 shrink-0">
                      <div className="text-left md:text-right">
                        <div className="text-xs text-slate-500 font-medium">
                          {quote.items.length} {quote.items.length === 1 ? 'позиция' : 'позиций'}
                        </div>
                        <div className="text-lg sm:text-xl font-bold font-mono text-slate-900">
                          {quote.totalAmount.toFixed(2)} с.
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleExportExcel(quote, e)}
                          title="Скачать Excel инвойс с запечатанными ценами"
                          className="p-2 text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold"
                        >
                          <FileSpreadsheet className="w-4 h-4 shrink-0" />
                          <span className="hidden sm:inline">Excel</span>
                        </button>

                        <button
                          onClick={(e) => handlePrintPdf(quote, e)}
                          title="Печать / Сохранить в PDF"
                          className="p-2 text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold"
                        >
                          <Printer className="w-4 h-4 shrink-0" />
                          <span className="hidden sm:inline">PDF</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rawOrigin = typeof window !== 'undefined' ? window.location.origin : '';
                            const origin = rawOrigin.includes('ais-dev-') ? rawOrigin.replace('ais-dev-', 'ais-pre-') : rawOrigin;
                            window.open(`${origin}/?verify=${encodeURIComponent(quote.id)}`, '_blank');
                          }}
                          title="Проверить QR-код и открыть официальную страницу государственной верификации"
                          className="p-2 text-emerald-800 hover:text-emerald-900 bg-emerald-100/70 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold"
                        >
                          <QrCode className="w-4 h-4 shrink-0 text-emerald-700" />
                          <span className="hidden sm:inline">QR Проверка</span>
                        </button>

                        <button
                          onClick={(e) => handleRestoreToCart(quote, e)}
                          title="Изменить купон в корзине (после изменения корзина очистится и запишется история)"
                          className="p-2 text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold shadow-2xs"
                        >
                          <Edit3 className="w-4 h-4 shrink-0 text-indigo-600" />
                          <span className="hidden sm:inline">Изменить</span>
                        </button>

                        <button
                          onClick={(e) => handleDelete(quote.id, e)}
                          title={isDeleting ? "Нажмите еще раз для подтверждения удаления" : "Удалить из архива"}
                          className={`p-2 rounded-xl border transition-all text-xs font-semibold flex items-center gap-1 ${
                            isDeleting 
                              ? 'bg-rose-600 text-white border-rose-700 animate-pulse px-3' 
                              : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 border-slate-200'
                          }`}
                        >
                          <Trash2 className="w-4 h-4 shrink-0" />
                          {isDeleting && <span>Подтвердить</span>}
                        </button>

                        <button
                          onClick={() => setExpandedQuoteId(isExpanded ? null : quote.id)}
                          className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-all"
                        >
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Items & Revisions Drawer */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 p-4 sm:p-5 bg-slate-50/70 space-y-3 animate-in slide-in-from-top-2 duration-150">
                      {/* Sub-tabs: Items vs Visual Change History */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCardTab((prev) => ({ ...prev, [quote.id]: "items" }))}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                              (cardTab[quote.id] || "items") === "items"
                                ? "bg-indigo-600 text-white shadow-xs"
                                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                            }`}
                          >
                            <Layers className="w-3.5 h-3.5" />
                            <span>Состав товаров ({quote.items.length})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setCardTab((prev) => ({ ...prev, [quote.id]: "revisions" }))}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                              cardTab[quote.id] === "revisions"
                                ? "bg-indigo-600 text-white shadow-xs"
                                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                            }`}
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>История изменений ({(quote.revisions || []).length})</span>
                            {quote.revisions && quote.revisions.length > 0 && (
                              <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-amber-300">
                                {quote.revisions.length}
                              </span>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setCardTab((prev) => ({ ...prev, [quote.id]: "device" }))}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                              cardTab[quote.id] === "device"
                                ? "bg-indigo-600 text-white shadow-xs"
                                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                            }`}
                          >
                            <Cpu className="w-3.5 h-3.5" />
                            <span>Слепок оборудования</span>
                            {quote.deviceAudit && (
                              <span className="bg-slate-100 text-slate-800 text-[10px] font-mono px-1.5 py-0.2 rounded-full border border-slate-300">
                                {quote.deviceAudit.deviceType}
                              </span>
                            )}
                          </button>
                        </div>

                        <span className="text-[11px] text-slate-500 font-medium">
                          {cardTab[quote.id] === "device"
                            ? `Технический паспорт физического оборудования оформления`
                            : cardTab[quote.id] === "revisions"
                            ? `Полная хронология правок купона #${quote.id}`
                            : `Цены зафиксированы на момент сохранения: ${quote.createdAt}`}
                        </span>
                      </div>

                      {/* Tab 1: Items Table */}
                      {(cardTab[quote.id] || "items") === "items" && (
                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200">
                                <th className="p-2.5 w-12 text-center">№</th>
                                <th className="p-2.5">Код / ID</th>
                                <th className="p-2.5">Наименование товара</th>
                                <th className="p-2.5 text-center">Кол-во</th>
                                <th className="p-2.5 text-right">Зафиксированная цена</th>
                                <th className="p-2.5 text-right">Сумма</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {quote.items.map((item, idx) => {
                                const itemSum = (item.selectedPrice || 0) * item.quantity;
                                return (
                                  <tr key={`${item.product.id}-${idx}`} className="hover:bg-slate-50">
                                    <td className="p-2.5 text-center text-slate-400 font-medium">{idx + 1}</td>
                                    <td className="p-2.5 font-mono text-slate-500 font-semibold">
                                      {item.product.code || item.product.id?.substring(0, 8)}
                                    </td>
                                    <td className="p-2.5 font-medium text-slate-900">
                                      {item.product.name}
                                    </td>
                                    <td className="p-2.5 text-center font-mono font-semibold text-slate-700">
                                      {item.quantity} {item.product.unit || 'шт.'}
                                    </td>
                                    <td className="p-2.5 text-right font-mono font-medium text-slate-900">
                                      {item.selectedPrice ? `${item.selectedPrice.toFixed(2)} с.` : '—'}
                                    </td>
                                    <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                                      {itemSum ? `${itemSum.toFixed(2)} с.` : '—'}
                                    </td>
                                  </tr>
                                );
                              })}

                              {quote.logisticsCost > 0 && (
                                <tr className="bg-indigo-50/40 font-semibold text-indigo-950">
                                  <td colSpan={5} className="p-2.5 text-right">
                                    Логистика ({quote.selectedRegion}):
                                  </td>
                                  <td className="p-2.5 text-right font-mono font-bold">
                                    {quote.logisticsCost.toFixed(2)} с.
                                  </td>
                                </tr>
                              )}

                              <tr className="bg-slate-100/90 font-bold text-slate-900 border-t border-slate-300">
                                <td colSpan={5} className="p-3 text-right uppercase text-[11px]">
                                  Итого зафиксировано к оплате:
                                </td>
                                <td className="p-3 text-right font-mono text-sm text-indigo-900">
                                  {quote.totalAmount.toFixed(2)} с.
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Tab 2: Visual Change History Timeline */}
                      {cardTab[quote.id] === "revisions" && (
                        <div className="py-2">
                          {quote.revisions && quote.revisions.length > 0 ? (
                            <div className="relative pl-6 space-y-4 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-indigo-200">
                              {quote.revisions.map((rev, revIdx) => (
                                <div key={rev.id || revIdx} className="relative">
                                  {/* Timeline Node Badge */}
                                  <div className={`absolute -left-6 top-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                                    revIdx === 0
                                      ? "bg-indigo-600 border-indigo-200 text-white shadow-sm ring-4 ring-indigo-50"
                                      : "bg-white border-indigo-400 text-indigo-700"
                                  }`}>
                                    {revIdx === 0 ? "★" : (quote.revisions!.length - revIdx)}
                                  </div>

                                  {/* Revision Card */}
                                  <div className={`p-4 rounded-xl border transition-all ${
                                    revIdx === 0
                                      ? "bg-white border-indigo-200 shadow-sm ring-1 ring-indigo-50"
                                      : "bg-white/80 border-slate-200"
                                  }`}>
                                    {(() => {
                                      const priceDiff = rev.previousTotalAmount !== undefined 
                                        ? Number((rev.totalAmount - rev.previousTotalAmount).toFixed(2)) 
                                        : null;
                                      const isInitial = revIdx === (quote.revisions!.length - 1) && quote.revisions!.length > 1;

                                      return (
                                        <>
                                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                            <div className="flex items-center gap-2">
                                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                                revIdx === 0
                                                  ? "bg-indigo-100 text-indigo-900 border border-indigo-200"
                                                  : isInitial
                                                  ? "bg-slate-100 text-slate-700 border border-slate-200"
                                                  : "bg-amber-100 text-amber-900 border border-amber-200"
                                              }`}>
                                                {revIdx === 0 
                                                  ? "Текущая редакция (Последняя)" 
                                                  : isInitial 
                                                  ? "Исходная редакция (#1)" 
                                                  : `Редакция #${quote.revisions!.length - revIdx}`}
                                              </span>
                                              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                                {rev.dateFormatted}
                                              </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                              {priceDiff !== null && priceDiff !== 0 && (
                                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                                  priceDiff > 0
                                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                                    : "bg-rose-100 text-rose-800 border border-rose-300"
                                                }`}>
                                                  {priceDiff > 0 ? `+${priceDiff.toFixed(2)}` : priceDiff.toFixed(2)} с.
                                                </span>
                                              )}
                                              <div className="text-xs font-mono font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                                                Итого: {rev.totalAmount.toFixed(2)} с.
                                              </div>
                                            </div>
                                          </div>

                                          <div className="text-xs font-medium text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-100 mb-2.5">
                                            {rev.changeSummary}
                                          </div>

                                          {/* Detailed Visual Diff Tags */}
                                          {((rev.addedItems && rev.addedItems.length > 0) ||
                                            (rev.removedItems && rev.removedItems.length > 0) ||
                                            (rev.modifiedItems && rev.modifiedItems.length > 0)) && (
                                            <div className="space-y-1.5 mb-2.5 bg-white/60 p-2.5 rounded-lg border border-slate-200/80">
                                              {rev.addedItems && rev.addedItems.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                                  <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                                                    + Добавлено ({rev.addedItems.length}):
                                                  </span>
                                                  {rev.addedItems.map((item, i) => (
                                                    <span key={i} className="text-emerald-800 bg-emerald-50/70 px-2 py-0.5 rounded-md border border-emerald-200/60 font-medium">
                                                      {item}
                                                    </span>
                                                  ))}
                                                </div>
                                              )}
                                              {rev.removedItems && rev.removedItems.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                                  <span className="font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 shrink-0">
                                                    - Удалено ({rev.removedItems.length}):
                                                  </span>
                                                  {rev.removedItems.map((item, i) => (
                                                    <span key={i} className="text-rose-800 bg-rose-50/70 px-2 py-0.5 rounded-md border border-rose-200/60 font-medium">
                                                      {item}
                                                    </span>
                                                  ))}
                                                </div>
                                              )}
                                              {rev.modifiedItems && rev.modifiedItems.length > 0 && (
                                                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                                  <span className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 shrink-0">
                                                    ~ Изменено ({rev.modifiedItems.length}):
                                                  </span>
                                                  {rev.modifiedItems.map((item, i) => (
                                                    <span key={i} className="text-amber-800 bg-amber-50/70 px-2 py-0.5 rounded-md border border-amber-200/60 font-medium">
                                                      {item}
                                                    </span>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
                                            {rev.specialistName && (
                                              <span className="flex items-center gap-1 font-medium">
                                                <User className="w-3 h-3 text-slate-400" />
                                                Кто изменил: <strong className="text-slate-800">{rev.specialistName}</strong>
                                              </span>
                                            )}
                                            {rev.facilitatorName && (
                                              <span className="flex items-center gap-1 font-medium">
                                                <Building2 className="w-3 h-3 text-slate-400" />
                                                Организация: <strong className="text-slate-800">{rev.facilitatorName}</strong>
                                              </span>
                                            )}
                                            <span className="text-slate-500">
                                              Позиций в корзине: <strong className="text-slate-700">{rev.itemsCount}</strong>
                                            </span>
                                          </div>

                                          {/* Items Snapshot Preview in Revision */}
                                          {rev.items && rev.items.length > 0 && (
                                            <div className="mt-2.5 pt-2 border-t border-slate-100">
                                              <button
                                                type="button"
                                                onClick={() => setExpandedRevisionId(expandedRevisionId === rev.id ? null : rev.id)}
                                                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors cursor-pointer"
                                              >
                                                {expandedRevisionId === rev.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                <span>
                                                  {expandedRevisionId === rev.id 
                                                    ? "Скрыть товары этой редакции" 
                                                    : `Показать список товаров в этой редакции (${rev.items.length})`}
                                                </span>
                                              </button>
                                              {expandedRevisionId === rev.id && (
                                                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50/70 p-2 animate-in fade-in duration-100">
                                                  <table className="w-full text-left text-[11px]">
                                                    <thead>
                                                      <tr className="text-slate-500 font-bold border-b border-slate-200">
                                                        <th className="p-1.5">Товар</th>
                                                        <th className="p-1.5 text-center">Кол-во</th>
                                                        <th className="p-1.5 text-right">Поставщик</th>
                                                        <th className="p-1.5 text-right">Цена</th>
                                                        <th className="p-1.5 text-right">Сумма</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {rev.items.map((it, idx) => (
                                                        <tr key={idx} className="border-b border-slate-100 last:border-none hover:bg-white/80">
                                                          <td className="p-1.5 font-medium text-slate-800">{it.product?.name}</td>
                                                          <td className="p-1.5 text-center text-slate-600 font-mono font-semibold">{it.quantity} {it.product?.unit || "шт."}</td>
                                                          <td className="p-1.5 text-right text-slate-500 font-medium">{it.selectedSupplier}</td>
                                                          <td className="p-1.5 text-right text-slate-600 font-mono">{it.selectedPrice.toFixed(2)} с.</td>
                                                          <td className="p-1.5 text-right font-bold text-slate-900 font-mono">{(it.selectedPrice * it.quantity).toFixed(2)} с.</td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-4 bg-white rounded-xl border border-slate-200 text-xs text-slate-500 flex items-center gap-3">
                              <History className="w-6 h-6 text-indigo-500 shrink-0" />
                              <div>
                                <div className="font-bold text-slate-800">Первоначальная версия от {quote.createdAt}</div>
                                <div className="text-slate-500 mt-0.5">
                                  Купон находится в исходной редакции. Нажмите кнопку <strong>«Изменить»</strong>, чтобы отредактировать состав товаров в корзине. При сохранении корзина автоматически очистится, а здесь появится пошаговая хронология всех изменений.
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tab 3: Device Hardware Audit Snapshot */}
                      {cardTab[quote.id] === "device" && (
                        <div className="py-2 space-y-3 animate-in fade-in duration-150">
                          {quote.deviceAudit ? (
                            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0">
                                    <Cpu className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                                      Аппаратный слепок оборудования
                                    </h4>
                                    <p className="text-[11px] text-slate-500">
                                      Фиксация физических параметров устройства в момент создания или обновления
                                    </p>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const textToCopy = `Купон: ${quote.id}\n${quote.deviceAuditSummary || quote.deviceAudit?.summary}\nХеш отпечатка: ${quote.deviceAudit?.fingerprintId}\nОС: ${quote.deviceAudit?.os}\nЭкран: ${quote.deviceAudit?.screenResolution}\nCPU: ${quote.deviceAudit?.cpuCores} ядер\nGPU: ${quote.deviceAudit?.gpuRenderer}\nCanvas FP: ${quote.deviceAudit?.canvasHash}\nIP: ${quote.deviceAudit?.ipAddress}\nДата/Время: ${quote.deviceAudit?.capturedAtFormatted || quote.createdAt}`;
                                    if (typeof navigator !== "undefined" && navigator.clipboard) {
                                      navigator.clipboard.writeText(textToCopy);
                                      setCopiedFpId(quote.id);
                                      setTimeout(() => setCopiedFpId(null), 2500);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                                  title="Скопировать технический слепок для акта / экспертизы"
                                >
                                  {copiedFpId === quote.id ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                      <span className="text-emerald-700">Скопировано!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                                      <span>Скопировать слепок для акта</span>
                                    </>
                                  )}
                                </button>
                              </div>

                              {/* Technical Parameter Cards */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Тип устройства и ОС</span>
                                  <span className="font-bold text-slate-900 mt-0.5 flex items-center gap-1">
                                    {quote.deviceAudit.deviceType === "Планшет" ? (
                                      <Tablet className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                    ) : quote.deviceAudit.deviceType === "Смартфон" ? (
                                      <Smartphone className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                    ) : (
                                      <Monitor className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                    )}
                                    {quote.deviceAudit.deviceType}
                                  </span>
                                  <span className="text-[11px] text-slate-600 font-medium">{quote.deviceAudit.os}</span>
                                </div>

                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Процессор и память</span>
                                  <span className="font-bold text-slate-900 mt-0.5 block font-mono">
                                    {quote.deviceAudit.cpuCores > 0 ? `${quote.deviceAudit.cpuCores} ядер CPU` : "CPU н/д"}
                                  </span>
                                  <span className="text-[11px] text-slate-600 font-mono">
                                    {quote.deviceAudit.memoryGb ? `${quote.deviceAudit.memoryGb} ГБ RAM` : "RAM стандарт"}
                                  </span>
                                </div>

                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Экран и сенсор</span>
                                  <span className="font-bold text-slate-900 mt-0.5 block font-mono truncate" title={quote.deviceAudit.screenResolution}>
                                    {quote.deviceAudit.screenResolution}
                                  </span>
                                  <span className="text-[11px] text-slate-600">
                                    {quote.deviceAudit.touchPoints > 0 ? `Тачскрин: ${quote.deviceAudit.touchPoints} точек` : "Клавиатура/мышь"}
                                  </span>
                                </div>

                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Сетевой IP и зона</span>
                                  <span className="font-bold text-slate-900 mt-0.5 block font-mono text-[11px] truncate" title={quote.deviceAudit.ipAddress}>
                                    {quote.deviceAudit.ipAddress || "Локальная сеть"}
                                  </span>
                                  <span className="text-[11px] text-slate-600 truncate block" title={quote.deviceAudit.timezone}>
                                    {quote.deviceAudit.timezone}
                                  </span>
                                </div>
                              </div>

                              {/* GPU & Canvas Graphics Fingerprint */}
                              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Графический видеопроцессор (GPU WebGL):</span>
                                  <span className="font-mono text-slate-800 font-semibold break-all text-[11px]">
                                    {quote.deviceAudit.gpuRenderer} ({quote.deviceAudit.gpuVendor})
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-[11px]">
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Хеш субпиксельного рендеринга (Canvas 2D):</span>
                                    <span className="font-mono text-indigo-700 font-bold">{quote.deviceAudit.canvasHash}</span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Уникальный ID отпечатка оборудования:</span>
                                    <span className="font-mono text-emerald-700 font-black">{quote.deviceAudit.fingerprintId}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Forensic Audit Record Quote Line */}
                              <div className="p-3 bg-indigo-50/50 border border-indigo-200/60 rounded-lg text-xs space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 block">
                                  Зафиксированная строка аудита в базе данных:
                                </span>
                                <p className="font-mono text-[11px] text-slate-800 bg-white p-2 rounded border border-indigo-100 select-all break-all">
                                  {quote.deviceAuditSummary || `Купон № ${quote.id} создан с: ${quote.deviceAudit.summary}`}
                                </p>
                              </div>
                            </div>
                          ) : quote.deviceAuditSummary ? (
                            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                              <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
                                <Cpu className="w-4 h-4 text-indigo-600" />
                                <span>Зафиксированная строка аудита оборудования</span>
                              </div>
                              <p className="font-mono text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200 select-all">
                                {quote.deviceAuditSummary}
                              </p>
                            </div>
                          ) : (
                            <div className="p-4 bg-white rounded-xl border border-slate-200 text-xs text-slate-600 space-y-3">
                              <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
                                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                                  <Cpu className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="font-bold text-slate-800 text-sm">Слепок оборудования для купона #{quote.id}</div>
                                  <div className="text-[11px] text-slate-500">
                                    Историческая спецификация (оформлена до активации модуля аппаратных отпечатков)
                                  </div>
                                </div>
                              </div>
                              <p className="text-slate-600 leading-relaxed text-xs">
                                Данная подборка создана в архивном периоде. Система гарантирует целостность зафиксированных цен и товарных позиций.
                                <br />
                                <strong>Как привязать слепок к этому купону:</strong> Нажмите кнопку <strong>«Изменить»</strong> на карточке купона — при сохранении корзины система автоматически привяжет к купону полный технический отпечаток вашего физического устройства (ОС, ядра CPU, видеочип GPU, Canvas 2D, разрешение экрана, IP-адрес).
                              </p>
                              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
                                <span>Все новые и редактируемые купоны фиксируют аппаратный слепок автоматически</span>
                                <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-[10px]">
                                  Модуль DFP v2.0 активен
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div>
            {quotes.length > 0 && (
              <button
                onClick={handleOpenDeleteAllModal}
                disabled={loading || isDeletingAll}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Очистить весь архив ({quotes.length})</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
          >
            Закрыть
          </button>
        </div>
      </div>

      {/* Admin Password Confirmation Modal for Delete All */}
      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-rose-700 via-rose-800 to-rose-900 text-white flex items-start gap-3.5">
              <div className="p-2.5 bg-white/20 rounded-xl shrink-0 backdrop-blur-xs">
                <ShieldAlert className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold leading-tight">
                  Подтверждение удаления всех КП
                </h3>
                <p className="text-xs text-rose-100 mt-1">
                  Безвозвратная очистка архива коммерческих предложений
                </p>
              </div>
              <button
                type="button"
                onClick={() => !isDeletingAll && setIsDeleteAllModalOpen(false)}
                disabled={isDeletingAll}
                className="p-1.5 text-rose-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleConfirmDeleteAll} className="p-5 sm:p-6 space-y-4">
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  Вы собираетесь удалить <strong>все сохраненные подборки ({quotes.length} шт.)</strong> из базы данных.
                  Это действие необратимо и сотрет историю КП всех клиентов.
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  Пароль администратора для подтверждения
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoFocus
                    disabled={isDeletingAll}
                    value={adminPasswordInput}
                    onChange={(e) => {
                      setAdminPasswordInput(e.target.value);
                      if (passwordError) setPasswordError('');
                    }}
                    placeholder="Введите пароль администратора..."
                    className={`w-full pl-3.5 pr-10 py-2.5 text-sm bg-slate-50 border rounded-xl font-mono focus:outline-none focus:ring-2 focus:bg-white transition-all ${
                      passwordError
                        ? "border-rose-400 focus:ring-rose-500/20 text-rose-900 bg-rose-50/30"
                        : "border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900"
                    }`}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-xs text-rose-600 font-semibold mt-1.5 flex items-center gap-1 animate-in fade-in">
                    <span>⚠️ {passwordError}</span>
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isDeletingAll}
                  onClick={() => setIsDeleteAllModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isDeletingAll || !adminPasswordInput.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:hover:bg-rose-600 rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                >
                  {isDeletingAll ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Удаление...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Подтвердить и удалить все</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
