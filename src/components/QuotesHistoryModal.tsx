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
  RefreshCw
} from 'lucide-react';
import { QuoteRecord, fetchQuotesHistory, deleteQuoteFromHistory } from '../lib/quotesHistory';
import { downloadCartExcel } from '../lib/excelExport';

interface QuotesHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: string[];
  onLoadCartToActive: (items: any[], region?: string, sphere?: string) => void;
  onTriggerPdfPrint: (data: {
    cart: any[];
    logisticsCost: number;
    selectedRegion: string;
    selectedSphere?: string;
    clientName: string;
    facilitatorName: string;
    note?: string;
    createdAt?: string;
  }) => void;
}

export const QuotesHistoryModal: React.FC<QuotesHistoryModalProps> = ({
  isOpen,
  onClose,
  suppliers,
  onLoadCartToActive,
  onTriggerPdfPrint,
}) => {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
        quote.note
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
      selectedSphere: quote.selectedSphere,
      clientName: quote.clientName,
      facilitatorName: quote.facilitatorName,
      note: quote.note,
      createdAt: quote.createdAt,
    });
    showToast("Отправка на печать / PDF...");
  };

  const handleRestoreToCart = (quote: QuoteRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    onLoadCartToActive(quote.items, quote.selectedRegion, quote.selectedSphere);
    showToast(`Товары подборки для "${quote.clientName}" загружены в корзину`);
    onClose();
  };

  const filteredQuotes = quotes.filter(q => {
    const qTerm = searchQuery.toLowerCase().trim();
    if (!qTerm) return true;
    const clientMatch = q.clientName.toLowerCase().includes(qTerm);
    const facMatch = q.facilitatorName.toLowerCase().includes(qTerm);
    const dateMatch = q.createdAt.toLowerCase().includes(qTerm);
    const regionMatch = q.selectedRegion.toLowerCase().includes(qTerm);
    const sphereMatch = (q.selectedSphere || '').toLowerCase().includes(qTerm);
    const itemMatch = q.items.some(i => 
      i.product.name.toLowerCase().includes(qTerm) || 
      (i.product.code && i.product.code.toLowerCase().includes(qTerm))
    );
    return clientMatch || facMatch || dateMatch || regionMatch || sphereMatch || itemMatch;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-200">
      {/* Toast banner */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-lg font-medium text-sm flex items-center gap-2 animate-in slide-in-from-top duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0 border-b border-indigo-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 rounded-xl border border-indigo-400/30 text-indigo-300">
              <Archive className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                История подборок
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  Архив КП
                </span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                Реестр сохраненных выборок с фиксированным снимком цен (Price Snapshot)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Toolbar & Search */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row gap-3 items-center justify-between shrink-0">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Поиск по имени клиента, дате, фасилитатору или товару..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                Очистить
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <span className="text-xs text-slate-500 font-medium">
              Всего записей: <strong className="text-slate-900">{filteredQuotes.length}</strong>
            </span>
            <button
              onClick={loadHistory}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-all disabled:opacity-50"
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
                  : "В архиве пока нет сохраненных КП. Вы можете сохранить любую подборку непосредственно из корзины при выборе или выгрузке товаров."}
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
                      </div>

                      <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5 font-medium">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>Фасилитатор: <strong className="text-slate-800">{quote.facilitatorName}</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{quote.createdAt}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-600">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{quote.selectedRegion}</span>
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
                          onClick={(e) => handleRestoreToCart(quote, e)}
                          title="Загрузить товары в активную корзину"
                          className="p-2 text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold"
                        >
                          <ShoppingCart className="w-4 h-4 shrink-0" />
                          <span className="hidden lg:inline">В корзину</span>
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

                  {/* Expanded Items Drawer */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 p-4 sm:p-5 bg-slate-50/70 space-y-3 animate-in slide-in-from-top-2 duration-150">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        <span>Зафиксированный состав товаров ({quote.items.length})</span>
                        <span className="text-slate-500 font-normal normal-case">
                          Цены зафиксированы на момент сохранения: {quote.createdAt}
                        </span>
                      </div>

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
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-right shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
