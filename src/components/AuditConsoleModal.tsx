import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Search,
  Filter,
  Calendar,
  Printer,
  Shield,
  ShieldAlert,
  FileText,
  Clock,
  User,
  MapPin,
  RefreshCw,
  Download,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  ArrowUpDown,
  History,
  FileSpreadsheet,
} from "lucide-react";
import {
  AuditLogEntry,
  AuditActionType,
  getAuditLogs,
  syncHistoricalQuotesToAudit,
} from "../lib/auditLogger";
import { PrintAuditProtocolView } from "./PrintAuditProtocolView";

interface AuditConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  facilitators?: string[];
  regions?: string[];
  districtsByRegion?: Record<string, string[]>;
  currentFacilitatorName?: string;
}

export const AuditConsoleModal: React.FC<AuditConsoleModalProps> = ({
  isOpen,
  onClose,
  facilitators = [],
  regions = [],
  districtsByRegion = {},
  currentFacilitatorName,
}) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedFacilitator, setSelectedFacilitator] = useState<string>("");
  const [selectedRegion, setSelectedRegion] = useState<string>("");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [selectedActionType, setSelectedActionType] = useState<string>("");
  const [datePreset, setDatePreset] = useState<"all" | "today" | "3days" | "week" | "month" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Expanded row details
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Printable Protocol View state
  const [isPrintingProtocol, setIsPrintingProtocol] = useState<boolean>(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<"table" | "timeline">("table");

  // Fetch logs on open
  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await getAuditLogs();
      setLogs(data);
    } catch (e) {
      console.error("Failed to load audit logs:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen]);

  const handleSyncHistorical = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const added = await syncHistoricalQuotesToAudit();
      if (added > 0) {
        setSyncResult(`Синхронизировано ${added} архивных спецификаций в журнал аудита!`);
        await loadLogs();
      } else {
        setSyncResult("Все существующие спецификации уже зарегистрированы в аудите.");
      }
    } catch (e) {
      setSyncResult("Ошибка синхронизации данных.");
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncResult(null), 6000);
    }
  };

  // Date filter boundaries
  const dateRange = useMemo(() => {
    const now = new Date();
    if (datePreset === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      return { start: start.getTime(), end: now.getTime() };
    }
    if (datePreset === "3days") {
      const start = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      return { start: start.getTime(), end: now.getTime() };
    }
    if (datePreset === "week") {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start: start.getTime(), end: now.getTime() };
    }
    if (datePreset === "month") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), 0, 0, 0);
      return { start: start.getTime(), end: now.getTime() };
    }
    if (datePreset === "custom") {
      const start = customStartDate ? new Date(customStartDate + "T00:00:00").getTime() : 0;
      const end = customEndDate ? new Date(customEndDate + "T23:59:59").getTime() : Infinity;
      return { start, end };
    }
    return { start: 0, end: Infinity };
  }, [datePreset, customStartDate, customEndDate]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs
      .filter((log) => {
        // Date filter
        if (log.timestamp < dateRange.start || log.timestamp > dateRange.end) {
          return false;
        }

        // Facilitator filter
        if (selectedFacilitator) {
          const matchFac =
            log.facilitatorName === selectedFacilitator ||
            log.actorName === selectedFacilitator ||
            (log.details && log.details.includes(selectedFacilitator));
          if (!matchFac) return false;
        }

        // Region filter
        if (selectedRegion && log.region && !log.region.toLowerCase().includes(selectedRegion.toLowerCase())) {
          return false;
        }

        // District filter
        if (selectedDistrict && log.district && !log.district.toLowerCase().includes(selectedDistrict.toLowerCase())) {
          return false;
        }

        // Action type filter
        if (selectedActionType) {
          if (selectedActionType === "PRINT_ALL") {
            if (log.actionType !== "PRINT_CART" && log.actionType !== "PRINT_CATALOG") return false;
          } else if (selectedActionType === "QUOTES_ALL") {
            if (log.actionType !== "CREATE_QUOTE" && log.actionType !== "EDIT_QUOTE" && log.actionType !== "DELETE_QUOTE") {
              return false;
            }
          } else if (selectedActionType === "SECURITY_ALL") {
            if (log.actionType !== "ADMIN_LOGIN" && log.actionType !== "USER_LOGIN" && log.actionType !== "UPDATE_DICTIONARY") {
              return false;
            }
          } else if (log.actionType !== selectedActionType) {
            return false;
          }
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const inBeneficiary = (log.beneficiaryName || "").toLowerCase().includes(q);
          const inBeneficiaryId = (log.beneficiaryId || "").toLowerCase().includes(q);
          const inQuoteId = (log.quoteId || "").toLowerCase().includes(q);
          const inDetails = (log.details || "").toLowerCase().includes(q);
          const inActor = (log.actorName || "").toLowerCase().includes(q);
          const inFacilitator = (log.facilitatorName || "").toLowerCase().includes(q);
          const inDistrict = (log.district || "").toLowerCase().includes(q);

          if (!inBeneficiary && !inBeneficiaryId && !inQuoteId && !inDetails && !inActor && !inFacilitator && !inDistrict) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => (sortOrder === "desc" ? b.timestamp - a.timestamp : a.timestamp - b.timestamp));
  }, [
    logs,
    dateRange,
    selectedFacilitator,
    selectedRegion,
    selectedDistrict,
    selectedActionType,
    searchQuery,
    sortOrder,
  ]);

  // Statistics KPIs
  const stats = useMemo(() => {
    const total = filteredLogs.length;
    const quotes = filteredLogs.filter((l) => l.actionType === "CREATE_QUOTE");
    const totalAmount = quotes.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);
    const prints = filteredLogs.filter((l) => l.actionType === "PRINT_CART" || l.actionType === "PRINT_CATALOG").length;
    const edits = filteredLogs.filter((l) => l.actionType === "EDIT_QUOTE").length;
    const deletes = filteredLogs.filter((l) => l.actionType === "DELETE_QUOTE").length;
    const beneficiaries = new Set(filteredLogs.map((l) => l.beneficiaryName).filter(Boolean)).size;

    return { total, quotesCount: quotes.length, totalAmount, prints, edits, deletes, beneficiaries };
  }, [filteredLogs]);

  // Available districts for selected region
  const availableDistricts = useMemo(() => {
    if (!selectedRegion) return [];
    return districtsByRegion[selectedRegion] || [];
  }, [selectedRegion, districtsByRegion]);

  // Deduplicated lists for filter dropdowns to prevent duplicate keys
  const uniqueFacilitators = useMemo(() => {
    return Array.from(new Set(facilitators.filter(Boolean)));
  }, [facilitators]);

  const uniqueRegionsList = useMemo(() => {
    return Array.from(new Set(regions.filter(Boolean)));
  }, [regions]);

  const uniqueDistrictsList = useMemo(() => {
    return Array.from(new Set(availableDistricts.filter(Boolean)));
  }, [availableDistricts]);

  // Reset filters
  const resetFilters = () => {
    setSearchQuery("");
    setSelectedFacilitator("");
    setSelectedRegion("");
    setSelectedDistrict("");
    setSelectedActionType("");
    setDatePreset("all");
    setCustomStartDate("");
    setCustomEndDate("");
  };

  const hasActiveFilters =
    searchQuery ||
    selectedFacilitator ||
    selectedRegion ||
    selectedDistrict ||
    selectedActionType ||
    datePreset !== "all";

  // Action Badge Helper
  const renderActionBadge = (type: AuditActionType) => {
    switch (type) {
      case "CREATE_QUOTE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Выдача / Заказ
          </span>
        );
      case "EDIT_QUOTE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            Корректировка
          </span>
        );
      case "DELETE_QUOTE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            Удаление
          </span>
        );
      case "PRINT_CART":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <Printer className="w-3 h-3 text-blue-600" />
            Печать Акта / КП
          </span>
        );
      case "PRINT_CATALOG":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            <Printer className="w-3 h-3 text-indigo-600" />
            Печать Каталога
          </span>
        );
      case "ADMIN_LOGIN":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <Shield className="w-3 h-3 text-purple-600" />
            Вход Администратора
          </span>
        );
      case "USER_LOGIN":
      case "FACILITATOR_SWITCH":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">
            <User className="w-3 h-3 text-slate-600" />
            Сессия фасилитатора
          </span>
        );
      case "UPDATE_PRICE_EXCEL":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-200">
            <FileSpreadsheet className="w-3 h-3 text-teal-600" />
            Импорт Excel цен
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {type}
          </span>
        );
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = [
      "ID",
      "Дата и время",
      "Действие",
      "Исполнитель",
      "Роль",
      "Фасилитатор",
      "Регион",
      "Район",
      "Бенефициар",
      "ID Бенефициара",
      "Номер КП",
      "Сумма (TJS)",
      "Кол-во товаров",
      "Детали",
      "Сессия",
    ];

    const rows = filteredLogs.map((l) => [
      `"${l.id}"`,
      `"${l.dateFormatted}"`,
      `"${l.actionType}"`,
      `"${l.actorName || ""}"`,
      `"${l.actorRole || ""}"`,
      `"${l.facilitatorName || ""}"`,
      `"${l.region || ""}"`,
      `"${l.district || ""}"`,
      `"${l.beneficiaryName || ""}"`,
      `"${l.beneficiaryId || ""}"`,
      `"${l.quoteId || ""}"`,
      l.totalAmount || 0,
      l.itemsCount || 0,
      `"${(l.details || "").replace(/"/g, '""')}"`,
      `"${l.sessionToken || ""}"`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `SPMEI_Audit_Log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[94vh] flex flex-col overflow-hidden border border-slate-200">
          {/* Header */}
          <div className="p-4 sm:px-6 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/30">
                <ShieldAlert className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold tracking-tight">
                    Центр аудита и расследований (GDPR / Compliance)
                  </h2>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    Неизменяемый журнал
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Сплошной мониторинг действий фасилитаторов, сессий, изменений спецификаций и фактов печати
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPrintingProtocol(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                title="Сформировать официальный печатный бланк Протокола ревизии"
              >
                <Printer className="w-4 h-4" />
                <span>Печать Протокола ревизии</span>
              </button>

              <button
                onClick={handleExportCSV}
                disabled={filteredLogs.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
                title="Экспорт выборки в CSV / Excel"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">CSV</span>
              </button>

              <button
                onClick={handleSyncHistorical}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
                title="Синхронизировать существующие спецификации в журнал аудита"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-indigo-400" : ""}`} />
                <span className="hidden md:inline">Синхронизировать архив</span>
              </button>

              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors ml-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Sync notification */}
          {syncResult && (
            <div className="bg-indigo-50 border-b border-indigo-200 text-indigo-900 px-6 py-2 text-xs flex items-center justify-between animate-fadeIn">
              <span className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                {syncResult}
              </span>
              <button onClick={() => setSyncResult(null)} className="text-indigo-400 hover:text-indigo-700">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Cross-Filtering Bar */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col gap-3 shrink-0">
            {/* Top row: search + action + period */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Поиск: бенефициар, КП, действие..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Action Filter */}
              <div>
                <select
                  value={selectedActionType}
                  onChange={(e) => setSelectedActionType(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                >
                  <option value="">Все операции (Сплошной аудит)</option>
                  <option value="QUOTES_ALL">Все действия с КП (создание, правка, удаление)</option>
                  <option value="CREATE_QUOTE">Оформление спецификаций</option>
                  <option value="EDIT_QUOTE">Корректировки / Изменения спецификаций</option>
                  <option value="DELETE_QUOTE">Удаления спецификаций</option>
                  <option value="PRINT_ALL">Факты печати (акты и каталоги)</option>
                  <option value="PRINT_CART">Печать Актов приема / КП</option>
                  <option value="PRINT_CATALOG">Печать Каталога цен</option>
                  <option value="SECURITY_ALL">Безопасность (входы, смены паролей, справочники)</option>
                  <option value="ADMIN_LOGIN">Вход Администратора</option>
                  <option value="UPDATE_PRICE_EXCEL">Импорт Excel-прайсов</option>
                </select>
              </div>

              {/* Facilitator Filter */}
              <div>
                <select
                  value={selectedFacilitator}
                  onChange={(e) => setSelectedFacilitator(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                >
                  <option value="">Все фасилитаторы</option>
                  {uniqueFacilitators.map((f, idx) => (
                    <option key={`fac-${f}-${idx}`} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Date Presets */}
              <div className="flex items-center gap-1 bg-white border border-slate-300 p-1 rounded-xl shadow-sm">
                <button
                  type="button"
                  onClick={() => setDatePreset("all")}
                  className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${
                    datePreset === "all" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Все
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset("today")}
                  className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${
                    datePreset === "today" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Сегодня
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset("week")}
                  className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${
                    datePreset === "week" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Неделя
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset("month")}
                  className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${
                    datePreset === "month" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Месяц
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset("custom")}
                  className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${
                    datePreset === "custom" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Период
                </button>
              </div>
            </div>

            {/* Bottom row: Region + District + Custom date pickers if active + reset */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                {/* Region */}
                <select
                  value={selectedRegion}
                  onChange={(e) => {
                    setSelectedRegion(e.target.value);
                    setSelectedDistrict("");
                  }}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm min-w-[160px]"
                >
                  <option value="">Все регионы</option>
                  {uniqueRegionsList.map((r, idx) => (
                    <option key={`reg-${r}-${idx}`} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                {/* District */}
                <select
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  disabled={!selectedRegion || uniqueDistrictsList.length === 0}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm min-w-[160px] disabled:opacity-60 disabled:bg-slate-100"
                >
                  <option value="">
                    {selectedRegion ? "Все районы региона" : "Сначала выберите регион"}
                  </option>
                  {uniqueDistrictsList.map((d, idx) => (
                    <option key={`dist-${d}-${idx}`} value={d}>
                      {d}
                    </option>
                  ))}
                </select>

                {/* Custom Date Pickers */}
                {datePreset === "custom" && (
                  <div className="flex items-center gap-1.5 bg-white border border-slate-300 px-2 py-1 rounded-lg text-xs shadow-sm">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[11px] text-slate-500">С:</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="text-xs outline-none bg-transparent"
                    />
                    <span className="text-[11px] text-slate-500">По:</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="text-xs outline-none bg-transparent"
                    />
                  </div>
                )}

                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1 rounded hover:bg-rose-50 transition-colors"
                  >
                    Сбросить все фильтры
                  </button>
                )}
              </div>

              {/* Sort & Tabs */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-white border border-slate-300 p-0.5 rounded-lg text-xs">
                  <button
                    onClick={() => setActiveTab("table")}
                    className={`px-3 py-1 rounded font-medium transition-all ${
                      activeTab === "table" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Таблица
                  </button>
                  <button
                    onClick={() => setActiveTab("timeline")}
                    className={`px-3 py-1 rounded font-medium transition-all ${
                      activeTab === "timeline" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Хронология сессий
                  </button>
                </div>

                <button
                  onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg hover:bg-slate-50 font-medium text-slate-700 shadow-sm"
                  title="Порядок сортировки по времени"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                  <span>{sortOrder === "desc" ? "Сначала новые" : "Сначала старые"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick KPIs Summary Bar */}
          <div className="bg-slate-100/90 border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs font-sans">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Записей в выборке:</span>
                <span className="font-extrabold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-300 shadow-sm">
                  {stats.total}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Спецификаций КП:</span>
                <span className="font-extrabold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shadow-sm">
                  {stats.quotesCount} шт. ({stats.beneficiaries} чел.)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Сумма распределения:</span>
                <span className="font-extrabold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 shadow-sm">
                  {stats.totalAmount.toLocaleString("ru-RU")} сомони
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Печатей:</span>
                <span className="font-extrabold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 shadow-sm">
                  {stats.prints}
                </span>
              </div>
              {stats.edits > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Корректировок:</span>
                  <span className="font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 shadow-sm">
                    {stats.edits}
                  </span>
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-500">
              База: <span className="font-mono text-slate-700">Firestore (SPMEI Project Audit)</span>
            </div>
          </div>

          {/* Main Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
                <p className="text-sm font-medium">Загрузка журнала аудита и проверка целостности...</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 text-center">
                <ShieldAlert className="w-12 h-12 text-slate-300 stroke-[1.5]" />
                <p className="text-base font-semibold text-slate-700">Записей не найдено</p>
                <p className="text-xs text-slate-500 max-w-md">
                  По заданным параметрам поиска или фильтрам записей не обнаружено. Попробуйте сбросить фильтры
                  или нажмите «Синхронизировать архив» для импорта ранее созданных заказов.
                </p>
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    Сбросить фильтры
                  </button>
                )}
              </div>
            ) : activeTab === "table" ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                        <th className="p-3 w-10 text-center">#</th>
                        <th className="p-3 w-32">Время (TJT)</th>
                        <th className="p-3 w-40">Действие</th>
                        <th className="p-3 w-48">Фасилитатор / Район</th>
                        <th className="p-3 w-52">Бенефициар / КП</th>
                        <th className="p-3">Описание операции</th>
                        <th className="p-3 w-28 text-right">Сумма (TJS)</th>
                        <th className="p-3 w-12 text-center">Детали</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredLogs.map((log, idx) => {
                        const isExpanded = expandedLogId === log.id;
                        return (
                          <React.Fragment key={log.id}>
                            <tr
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className={`hover:bg-indigo-50/40 transition-colors cursor-pointer ${
                                isExpanded ? "bg-indigo-50/50" : idx % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                              }`}
                            >
                              <td className="p-3 text-center text-slate-400 font-mono text-[11px]">
                                {idx + 1}
                              </td>
                              <td className="p-3 font-mono text-slate-700 whitespace-nowrap">
                                <div className="font-semibold text-slate-900">{log.dateFormatted.split(",")[0]}</div>
                                <div className="text-[10px] text-slate-500">{log.dateFormatted.split(",")[1] || ""}</div>
                              </td>
                              <td className="p-3">
                                {renderActionBadge(log.actionType)}
                              </td>
                              <td className="p-3 leading-tight">
                                <div className="font-bold text-slate-900 truncate max-w-[180px]">
                                  {log.facilitatorName || log.actorName}
                                </div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="truncate">
                                    {log.district ? `${log.district}` : log.region || "Не указан"}
                                  </span>
                                </div>
                              </td>
                              <td className="p-3 leading-tight">
                                <div className="font-bold text-slate-900 truncate max-w-[190px]">
                                  {log.beneficiaryName || "—"}
                                </div>
                                {log.quoteId && (
                                  <div className="text-[10px] font-mono font-semibold text-indigo-700 mt-0.5">
                                    № {log.quoteId}
                                  </div>
                                )}
                              </td>
                              <td className="p-3 text-slate-700 leading-snug">
                                <div className="line-clamp-2" title={log.details}>
                                  {log.details}
                                </div>
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                {log.totalAmount !== undefined && log.totalAmount > 0 ? (
                                  <span>{log.totalAmount.toLocaleString("ru-RU")} с.</span>
                                ) : (
                                  <span className="text-slate-400 font-normal">—</span>
                                )}
                              </td>
                              <td className="p-3 text-center text-slate-400">
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-indigo-600 inline" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-slate-400 inline" />
                                )}
                              </td>
                            </tr>

                            {/* Expanded Details Row */}
                            {isExpanded && (
                              <tr className="bg-indigo-50/20 border-b border-indigo-100">
                                <td colSpan={8} className="p-4 pl-12">
                                  <div className="bg-white border border-indigo-100 rounded-xl p-4 shadow-sm space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-xs">
                                      <div className="flex items-center gap-3">
                                        <span className="font-bold text-slate-700">ID Записи:</span>
                                        <span className="font-mono text-indigo-700 select-all">{log.id}</span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="font-bold text-slate-700">Идентификатор сессии:</span>
                                        <span className="font-mono text-slate-500 select-all">{log.sessionToken}</span>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                      <div>
                                        <div className="text-[10px] uppercase text-slate-400 font-bold">Исполнитель</div>
                                        <div className="font-semibold text-slate-800">{log.actorName} ({log.actorRole})</div>
                                        {log.facilitatorRep && (
                                          <div className="text-[11px] text-slate-500">Представитель: {log.facilitatorRep}</div>
                                        )}
                                        {log.facilitatorPhone && (
                                          <div className="text-[11px] text-slate-500">Тел: {log.facilitatorPhone}</div>
                                        )}
                                      </div>

                                      <div>
                                        <div className="text-[10px] uppercase text-slate-400 font-bold">Бенефициар</div>
                                        <div className="font-semibold text-slate-800">{log.beneficiaryName || "Не указан"}</div>
                                        {log.beneficiaryId && (
                                          <div className="text-[11px] text-slate-500">Код: {log.beneficiaryId}</div>
                                        )}
                                        <div className="text-[11px] text-slate-500">
                                          Локация: {log.region || "—"}, район: {log.district || "—"}
                                        </div>
                                      </div>

                                      <div>
                                        <div className="text-[10px] uppercase text-slate-400 font-bold">Параметры операции</div>
                                        <div className="font-semibold text-slate-800">
                                          Сумма: {log.totalAmount ? `${log.totalAmount.toLocaleString("ru-RU")} с.` : "0 с."}
                                        </div>
                                        <div className="text-[11px] text-slate-500">Позиций товаров: {log.itemsCount || 0} шт.</div>
                                      </div>
                                    </div>

                                    {/* Items snapshot if available */}
                                    {log.metadata?.items && Array.isArray(log.metadata.items) && log.metadata.items.length > 0 && (
                                      <div className="mt-2 pt-2 border-t border-slate-100">
                                        <div className="text-[10px] uppercase text-slate-500 font-bold mb-1.5">
                                          Состав товарной корзины в момент операции:
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                          {log.metadata.items.map((it: any, i: number) => (
                                            <div
                                              key={i}
                                              className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] flex justify-between items-center"
                                            >
                                              <span className="font-medium text-slate-800 truncate pr-2" title={it.name}>
                                                {it.name}
                                              </span>
                                              <span className="font-mono font-bold text-slate-900 shrink-0">
                                                {it.qty} шт. × {it.price} с.
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* Timeline View (grouped by session and facilitator) */
              <div className="space-y-6">
                {(
                  Object.entries(
                    filteredLogs.reduce<Record<string, AuditLogEntry[]>>((acc, log) => {
                      const dateKey = log.dateFormatted.split(",")[0] || "Общая дата";
                      if (!acc[dateKey]) acc[dateKey] = [];
                      acc[dateKey].push(log);
                      return acc;
                    }, {})
                  ) as [string, AuditLogEntry[]][]
                ).map(([dateStr, dayLogs]) => (
                  <div key={dateStr} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                      <Calendar className="w-4 h-4 text-indigo-600" />
                      <h3 className="font-bold text-slate-900 text-sm">
                        Хронология за {dateStr} ({dayLogs.length} событий)
                      </h3>
                    </div>

                    <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                      {dayLogs.map((log) => (
                        <div key={log.id} className="relative flex items-start gap-3 text-xs">
                          <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-indigo-600 ring-4 ring-white" />
                          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 hover:bg-slate-100/70 transition-colors">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-extrabold text-slate-900">
                                  {log.dateFormatted.split(",")[1] || log.dateFormatted}
                                </span>
                                {renderActionBadge(log.actionType)}
                              </div>
                              <span className="text-[10px] font-mono text-slate-400">
                                ID: {log.id}
                              </span>
                            </div>

                            <p className="font-semibold text-slate-800 mt-1">{log.details}</p>

                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-200/60">
                              <span>
                                <strong>Исполнитель:</strong> {log.actorName} ({log.facilitatorName || "—"})
                              </span>
                              {log.beneficiaryName && (
                                <span>
                                  <strong>Бенефициар:</strong> {log.beneficiaryName}
                                </span>
                              )}
                              {log.totalAmount !== undefined && log.totalAmount > 0 && (
                                <span className="text-emerald-700 font-bold">
                                  Сумма: {log.totalAmount.toLocaleString("ru-RU")} с.
                                </span>
                              )}
                              {log.district && (
                                <span>
                                  <strong>Район:</strong> {log.district}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0 border-t border-slate-800 text-xs">
            <div className="text-slate-400">
              Показано <strong>{filteredLogs.length}</strong> из <strong>{logs.length}</strong> событий в журнале
              {selectedFacilitator && <span> • Фильтр: <strong>{selectedFacilitator}</strong></span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPrintingProtocol(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Распечатать Протокол ({filteredLogs.length} зап.)</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Printable Protocol Modal View */}
      {isPrintingProtocol && (
        <PrintAuditProtocolView
          logs={filteredLogs}
          startDate={
            datePreset === "custom" && customStartDate
              ? customStartDate
              : datePreset === "today"
              ? "Сегодня"
              : datePreset === "week"
              ? "За неделю"
              : datePreset === "month"
              ? "За месяц"
              : undefined
          }
          endDate={datePreset === "custom" && customEndDate ? customEndDate : undefined}
          facilitatorFilter={selectedFacilitator}
          regionFilter={selectedRegion}
          districtFilter={selectedDistrict}
          actionFilter={selectedActionType}
          auditorName={currentFacilitatorName || "Инспектор группы внутреннего аудита"}
          onClose={() => setIsPrintingProtocol(false)}
        />
      )}
    </>
  );
};
