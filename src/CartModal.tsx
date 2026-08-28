import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  X,
  Printer,
  Plus,
  Minus,
  Trash2,
  Package,
  FileDown,
  Search,
  Check,
  Truck,
  Loader2,
  User,
  Archive,
  BookmarkCheck,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Product } from "./types";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "./lib/firebase";

import { downloadCartExcel } from "./lib/excelExport";
import { saveQuoteToHistory } from "./lib/quotesHistory";

interface CartItem {
  product: Product;
  quantity: number;
  selectedSupplier: "supplier1" | "supplier2" | "supplier3" | "supplier4";
  selectedPrice: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  updateQuantity: (
    productId: string,
    supplier: "supplier1" | "supplier2" | "supplier3" | "supplier4",
    delta: number,
  ) => void;
  onPrint: () => void;
  onPrintWithMeta?: (clientName: string, facilitatorName: string, note: string, quoteId?: string) => void;
  onOpenQuotesHistory?: () => void;
  suppliers: string[];
  products: Product[];
  onAddToCart: (
    p: Product,
    supplier?: "supplier1" | "supplier2" | "supplier3" | "supplier4",
    price?: number,
  ) => void;
  selectedRegion: string;
  getProductPrice: (
    p: Product,
    supplier: "supplier1" | "supplier2" | "supplier3" | "supplier4",
    region: string,
  ) => number;
  onUpdateSupplier?: (
    productId: string,
    oldSupplier: "supplier1" | "supplier2" | "supplier3" | "supplier4",
    newSupplier: "supplier1" | "supplier2" | "supplier3" | "supplier4",
  ) => void;
  regions?: string[];
  onRegionChange?: (region: string) => void;
  logisticsCost?: number;
  showBestPrice?: boolean;
  supplierPhones?: Record<string, string>;
  supplierLegalNames?: Record<string, string>;
  selectedSphere?: string;
  onClearCart?: () => void;
  defaultFacilitatorName?: string;
  restoredMetadata?: { clientName?: string; facilitatorName?: string; note?: string };
}

export function CartModal({
  isOpen,
  onClose,
  cart,
  updateQuantity,
  onPrint,
  onPrintWithMeta,
  onOpenQuotesHistory,
  suppliers,
  products,
  onAddToCart,
  selectedRegion,
  getProductPrice,
  onUpdateSupplier,
  regions = [],
  onRegionChange,
  logisticsCost = 0,
  showBestPrice = false,
  supplierPhones,
  supplierLegalNames,
  selectedSphere,
  onClearCart,
  defaultFacilitatorName = "Фасилитатор",
  restoredMetadata,
}: Props) {
  const [addMode, setAddMode] = useState<"single" | "mass">("single");
  const [massInputText, setMassInputText] = useState("");

  const [searchIdQuery, setSearchIdQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedQuickProduct, setSelectedQuickProduct] =
    useState<Product | null>(null);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);

  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  // Customer metadata state
  const [clientName, setClientName] = useState("");
  const [facilitatorName, setFacilitatorName] = useState(defaultFacilitatorName);
  const [note, setNote] = useState("");
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const [historySavedMsg, setHistorySavedMsg] = useState<string | null>(null);
  const [clientNameError, setClientNameError] = useState(false);
  const [isSavedToHistory, setIsSavedToHistory] = useState(false);
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null);
  const [saveRequiredError, setSaveRequiredError] = useState(false);
  const clientNameInputRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (restoredMetadata?.clientName) {
      setClientName(restoredMetadata.clientName);
      if (restoredMetadata.facilitatorName) setFacilitatorName(restoredMetadata.facilitatorName);
      if (restoredMetadata.note !== undefined) setNote(restoredMetadata.note);
      setIsSavedToHistory(true);
    }
  }, [restoredMetadata]);

  const displayedCart = useMemo(() => {
    if (!selectedSphere || selectedSphere === "Все сферы" || selectedSphere.toLowerCase().includes("все") || selectedSphere.trim() === "") return cart;
    return cart.filter((item) => {
      const prodSpheres = item.product.spheres && item.product.spheres.length > 0 
        ? item.product.spheres 
        : [item.product.sphere || "Общее"];
      return prodSpheres.some(s => 
        s === selectedSphere || 
        s.includes(selectedSphere) || 
        selectedSphere.includes(s)
      );
    });
  }, [cart, selectedSphere]);

  const validateClientName = (): boolean => {
    if (!clientName.trim()) {
      setClientNameError(true);
      setSaveRequiredError(false);
      if (clientNameInputRef.current) {
        clientNameInputRef.current.focus();
        clientNameInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return false;
    }
    setClientNameError(false);
    return true;
  };

  const validateCanExportOrPrint = (): boolean => {
    if (!validateClientName()) return false;
    setSaveRequiredError(false);
    return true;
  };

  useEffect(() => {
    if (defaultFacilitatorName) {
      setFacilitatorName(defaultFacilitatorName);
    }
  }, [defaultFacilitatorName]);

  useEffect(() => {
    if (!isOpen) {
      setIsConfirmingClear(false);
    }
  }, [isOpen]);

  const handleClearCartClick = () => {
    if (!isConfirmingClear) {
      setIsConfirmingClear(true);
    } else {
      onClearCart?.();
      setClientName("");
      setNote("");
      setIsSavedToHistory(false);
      setClientNameError(false);
      setSaveRequiredError(false);
      setIsConfirmingClear(false);
    }
  };

  useEffect(() => {
    if (cart.length === 0) {
      setClientName("");
      setNote("");
      setIsSavedToHistory(false);
      setClientNameError(false);
      setSaveRequiredError(false);
    }
  }, [cart.length]);

  useEffect(() => {
    if (isConfirmingClear) {
      const t = setTimeout(() => setIsConfirmingClear(false), 4000);
      return () => clearTimeout(t);
    }
  }, [isConfirmingClear]);

  const cartLinesTotal = displayedCart.reduce(
    (sum, item) => sum + (item.selectedPrice === Infinity ? 0 : (item.selectedPrice || 0)) * item.quantity,
    0,
  );
  const total = cartLinesTotal + (displayedCart.length > 0 ? logisticsCost : 0);

  const getSupplierName = (
    supp?: "supplier1" | "supplier2" | "supplier3" | "supplier4" | string,
  ) => {
    if (!supp || supp === "supplier1") return "Логистика";
    const list = suppliers || [];
    if (supp === "supplier2") return list[0] || "Поставщик 1";
    if (supp === "supplier3") return list[1] || "Поставщик 2";
    if (supp === "supplier4") return list[2] || "Поставщик 3";
    return "Логистика";
  };

  const filteredProducts = useMemo(() => {
    const q = searchIdQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => {
        const codeMatch = p.code
          ? String(p.code).toLowerCase().includes(q)
          : false;
        const idMatch = p.id ? p.id.toLowerCase().includes(q) : false;
        const nameMatch = p.name ? p.name.toLowerCase().includes(q) : false;
        return codeMatch || idMatch || nameMatch;
      })
      .slice(0, 10);
  }, [searchIdQuery, products]);

  // Find cheapest supplier and price on region selection automatically for quick product
  const cheapestQuickInfo = useMemo(() => {
    if (!selectedQuickProduct) return null;
    const sups: ("supplier2" | "supplier3" | "supplier4")[] = [
      "supplier2",
      "supplier3",
      "supplier4",
    ];
    let minPrice = Infinity;
    let bestSupplier: "supplier2" | "supplier3" | "supplier4" | "supplier1" = "supplier2";

    const searchRegions = selectedRegion ? [selectedRegion] : regions;

    searchRegions.forEach((reg) => {
      sups.forEach((sup) => {
        const pr = getProductPrice(selectedQuickProduct, sup, reg);
        if (pr > 0 && pr < minPrice) {
          minPrice = pr;
          bestSupplier = sup;
        }
      });
    });

    if (minPrice === Infinity) {
      return { supplier: bestSupplier, price: Infinity };
    }

    return { supplier: bestSupplier, price: minPrice };
  }, [selectedQuickProduct, selectedRegion, regions, getProductPrice]);

  const handleQuickAdd = () => {
    if (!selectedQuickProduct || !cheapestQuickInfo) return;

    if (cheapestQuickInfo.price === Infinity) {
      setAddedMessage(`Игнорировано (нет цены): ${selectedQuickProduct.name}`);
      setTimeout(() => setAddedMessage(null), 3000);
      setSearchIdQuery("");
      setSelectedQuickProduct(null);
      setShowSuggestions(false);
      return;
    }

    onAddToCart(
      selectedQuickProduct,
      cheapestQuickInfo.supplier,
      cheapestQuickInfo.price,
    );

    // Set success notification
    setAddedMessage(
      `Добавлено: ${selectedQuickProduct.name} (${getSupplierName(cheapestQuickInfo.supplier)}: ${cheapestQuickInfo.price.toFixed(2)} с.)`,
    );
    setTimeout(() => setAddedMessage(null), 3000);

    // Reset selection after adding
    setSearchIdQuery("");
    setSelectedQuickProduct(null);
    setShowSuggestions(false);
  };

  // Mass input analysis
  const [massAnalysis, setMassAnalysis] = useState<{
    found: Product[];
    notFound: string[];
    totalCount: number;
  }>({ found: [], notFound: [], totalCount: 0 });
  const [isAnalyzingMass, setIsAnalyzingMass] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    if (!massInputText.trim()) {
      setMassAnalysis({ found: [], notFound: [], totalCount: 0 });
      setIsAnalyzingMass(false);
      return;
    }

    const analyze = async () => {
      setIsAnalyzingMass(true);
      const items = massInputText
        .split(/[\s,;\n\t]+/)
        .map((s) => s.trim().replace(/^#/, ""))
        .filter(Boolean);

      const foundMap = new Map<string, Product>();
      const notFoundLocallyMap = new Set<string>();

      // 1. Local check
      items.forEach((rawItem) => {
        const lowered = rawItem.toLowerCase();
        const matched = products.find((p) => {
          const pCode = p.code ? String(p.code).toLowerCase() : "";
          const pId = p.id ? p.id.toLowerCase() : "";
          return pCode === lowered || pId === lowered;
        });

        if (matched) {
          foundMap.set(matched.id, matched);
        } else {
          notFoundLocallyMap.add(rawItem);
        }
      });

      // 2. Fetch missing from Firestore
      if (notFoundLocallyMap.size > 0 && !isCancelled) {
        const fetchPromises = Array.from(notFoundLocallyMap).map(
          async (rawItem) => {
            try {
              // First try direct document lookup (ID)
              const docRef = doc(db, "products", rawItem);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                return { id: docSnap.id, ...docSnap.data() } as Product;
              }
              // Then try code lookup
              const q = query(
                collection(db, "products"),
                where("code", "==", rawItem),
              );
              const qs = await getDocs(q);
              if (!qs.empty) {
                const d = qs.docs[0];
                return { id: d.id, ...d.data() } as Product;
              }
            } catch (e) {
              console.error("Error fetching " + rawItem, e);
            }
            return null;
          },
        );

        const fetched = await Promise.all(fetchPromises);
        fetched.forEach((p) => {
          if (p) {
            foundMap.set(p.id, p);
          }
        });
      }

      if (isCancelled) return;

      // 3. Finalize match array
      const finalFound: Product[] = [];
      const finalNotFound: string[] = [];

      items.forEach((rawItem) => {
        const lowered = rawItem.toLowerCase();
        const p = Array.from(foundMap.values()).find(
          (x) =>
            (x.code ? String(x.code).toLowerCase() === lowered : false) ||
            (x.id ? x.id.toLowerCase() === lowered : false),
        );

        if (p) {
          if (!finalFound.some((x) => x.id === p.id)) {
            finalFound.push(p);
          }
        } else {
          if (!finalNotFound.includes(rawItem)) {
            finalNotFound.push(rawItem);
          }
        }
      });

      setMassAnalysis({
        found: finalFound,
        notFound: finalNotFound,
        totalCount: items.length,
      });
      setIsAnalyzingMass(false);
    };

    const handler = setTimeout(analyze, 300);
    return () => {
      isCancelled = true;
      clearTimeout(handler);
    };
  }, [massInputText, products]);

  const handleMassAdd = () => {
    const { found } = massAnalysis;
    if (found.length === 0) return;

    let addedCount = 0;

    found.forEach((p) => {
      const sups: ("supplier2" | "supplier3" | "supplier4")[] = [
        "supplier2",
        "supplier3",
        "supplier4",
      ];
      let minPrice = Infinity;
      let bestSupplier: "supplier2" | "supplier3" | "supplier4" | "supplier1" = "supplier2";

      const searchRegions = selectedRegion ? [selectedRegion] : regions;

      searchRegions.forEach((reg) => {
        sups.forEach((sup) => {
          const pr = getProductPrice(p, sup, reg);
          if (pr > 0 && pr < minPrice) {
            minPrice = pr;
            bestSupplier = sup;
          }
        });
      });

      if (minPrice !== Infinity) {
        onAddToCart(p, bestSupplier, minPrice);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      setAddedMessage(
        `Успешно добавлено ${addedCount} товаров!`,
      );
      setTimeout(() => setAddedMessage(null), 3000);
      setMassInputText("");
    } else {
      setAddedMessage("Ни один товар не добавлен (нет цен).");
      setTimeout(() => setAddedMessage(null), 3000);
    }
  };

  const handleSaveToHistory = async () => {
    if (displayedCart.length === 0) return;
    if (!validateClientName()) return;
    setIsSavingHistory(true);
    try {
      const qId = await saveQuoteToHistory({
        clientName: clientName.trim(),
        facilitatorName: facilitatorName.trim() || "Фасилитатор",
        note: note.trim(),
        selectedRegion: selectedRegion || "Все регионы",
        selectedSphere: selectedSphere || "Все сферы",
        logisticsCost: displayedCart.length > 0 ? logisticsCost : 0,
        cart: displayedCart,
      });
      setIsSavedToHistory(true);
      setSavedQuoteId(qId);
      setSaveRequiredError(false);
      setHistorySavedMsg("✓ Успешно сохранено в Архив КП!");
      setTimeout(() => setHistorySavedMsg(null), 3500);
    } catch (err: any) {
      console.error("Error saving quote to history:", err);
      alert(`Не удалось сохранить подборку в архив: ${err?.message || "Ошибка подключения"}`);
    } finally {
      setIsSavingHistory(false);
    }
  };

  const handleExcelExport = async () => {
    if (!validateCanExportOrPrint()) return;
    await downloadCartExcel(
      displayedCart,
      displayedCart.length > 0 ? logisticsCost : 0,
      suppliers,
      selectedRegion,
      selectedSphere,
      clientName.trim(),
      facilitatorName.trim(),
      note.trim()
    );
  };

  const handlePrintAction = () => {
    if (!validateCanExportOrPrint()) return;
    if (onPrintWithMeta) {
      onPrintWithMeta(clientName.trim(), facilitatorName.trim(), note.trim(), savedQuoteId || undefined);
    } else {
      onPrint();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[95vh] sm:h-auto max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between p-4 sm:p-6 border-b border-slate-100 shrink-0 gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              Лист выборки (корзина)
            </h2>
            <div className="text-xs sm:text-sm text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{displayedCart.length} наименований</span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] sm:text-xs border border-slate-200">
                Регион: {selectedRegion || "Все регионы"}
              </span>
              <span className="font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px] sm:text-xs border border-indigo-100">
                Сфера: {selectedSphere || "Все сферы"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              type="button"
              onClick={handleExcelExport}
              disabled={!isSavedToHistory || displayedCart.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-md transition-all text-xs sm:text-sm font-medium flex-1 sm:flex-none justify-center ${
                isSavedToHistory && displayedCart.length > 0
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-sm cursor-pointer opacity-100"
                  : "bg-slate-700 text-slate-400 cursor-not-allowed opacity-50 border border-slate-600"
              }`}
              title={!isSavedToHistory ? "Сначала укажите Ф.И.О Бенефициара и сохраните подборку в Архив КП!" : undefined}
            >
              <FileDown className="w-4 h-4 shrink-0" />
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={handlePrintAction}
              disabled={!isSavedToHistory || displayedCart.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-md transition-all text-xs sm:text-sm font-medium flex-1 sm:flex-none justify-center ${
                isSavedToHistory && displayedCart.length > 0
                  ? "bg-slate-800 hover:bg-slate-700 text-white shadow-sm cursor-pointer opacity-100"
                  : "bg-slate-700 text-slate-400 cursor-not-allowed opacity-50 border border-slate-600"
              }`}
              title={!isSavedToHistory ? "Сначала укажите Ф.И.О Бенефициара и сохраните подборку в Архив КП!" : undefined}
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>Печать</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
            >
              <X className="w-5 h-5 shrink-0" />
            </button>
          </div>
        </div>

        {/* Customer Metadata / Archive KP Card */}
        <div className="bg-slate-900 text-white p-3.5 sm:p-4 border-b border-slate-800 shrink-0">
          {clientNameError && (
            <div className="bg-rose-500/20 border border-rose-500/50 text-rose-200 p-3 rounded-lg text-xs flex items-center justify-between gap-2 mb-3 shadow-lg animate-pulse">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  <strong>Ошибка:</strong> Пожалуйста, укажите <strong>Ф.И.О Бенефициара / Клиента *</strong> перед сохранением, печатью или скачиванием Excel!
                </span>
              </div>
              <button
                onClick={() => setClientNameError(false)}
                className="text-rose-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {saveRequiredError && !clientNameError && (
            <div className="bg-amber-500/20 border border-amber-500/50 text-amber-200 p-3 rounded-lg text-xs flex items-center justify-between gap-2 mb-3 shadow-lg animate-pulse">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Предупреждение:</strong> Необходимы данные! Подборка ещё не сохранена в Архив КП. Нажмите синюю кнопку <strong>«Сохранить подборку в Архив КП»</strong> для получения доступа к Excel и печати!
                </span>
              </div>
              <button
                onClick={() => setSaveRequiredError(false)}
                className="text-amber-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="font-bold text-xs sm:text-sm text-white">
                Карточка клиента / Метаданные выборки
              </span>
              {isSavedToHistory ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Сохранено в Архив
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400" /> Требуется сохранение
                </span>
              )}
            </div>
            {onOpenQuotesHistory && (
              <button
                type="button"
                onClick={onOpenQuotesHistory}
                className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-400/30 rounded text-xs font-semibold transition-all self-start md:self-auto"
              >
                <Archive className="w-3.5 h-3.5 text-indigo-300" />
                <span>Реестр (Архив КП)</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Ф.И.О Бенефициара / Клиента <span className="text-rose-400">*</span>
              </label>
              <input
                ref={clientNameInputRef}
                type="text"
                placeholder="Ф.И.О бенефициара / клиента..."
                value={clientName}
                onChange={(e) => {
                  setClientName(e.target.value);
                  if (e.target.value.trim()) setClientNameError(false);
                }}
                className={`w-full bg-slate-800 border rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none font-medium transition-all ${
                  clientNameError
                    ? "border-rose-500 ring-2 ring-rose-500/50 bg-rose-950/40"
                    : "border-slate-700 focus:border-indigo-500"
                }`}
              />
              {clientNameError && (
                <span className="text-[10px] font-bold text-rose-400 mt-1 block">
                  Заполните Ф.И.О Бенефициара / Клиента!
                </span>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Кто создал (Фасилитатор)
              </label>
              <input
                type="text"
                readOnly
                disabled
                value={facilitatorName}
                className="w-full bg-slate-800/60 border border-slate-700/60 rounded px-2.5 py-1.5 text-xs text-slate-300 font-medium cursor-not-allowed select-none focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Заметка к КП
              </label>
              <input
                type="text"
                placeholder="Примечание к заказу..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-2.5 pt-2 border-t border-slate-800">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              При сохранении система запечатывает точные цены и открывает экспорт/печать
            </span>
            <button
              ref={saveButtonRef}
              type="button"
              onClick={handleSaveToHistory}
              disabled={isSavingHistory || displayedCart.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all shadow-md shrink-0 active:scale-95 ${
                isSavedToHistory
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/50"
                  : saveRequiredError
                  ? "bg-rose-600 hover:bg-rose-500 text-white ring-4 ring-rose-500/50 animate-bounce"
                  : "bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white"
              }`}
            >
              {isSavingHistory ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isSavedToHistory ? (
                <CheckCircle2 className="w-4 h-4 text-white" />
              ) : (
                <BookmarkCheck className="w-4 h-4" />
              )}
              <span>
                {isSavingHistory
                  ? "Сохранение..."
                  : isSavedToHistory
                  ? "✓ Сохранено в Архив КП"
                  : historySavedMsg || "Сохранить подборку в Архив КП"}
              </span>
            </button>
          </div>
        </div>

        {/* Quick Add Form Section */}
        <div className="bg-slate-100 border-b border-slate-200 px-3.5 sm:px-6 py-3 sm:py-4 shrink-0 flex flex-col gap-3 relative z-20">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white border border-slate-200/65 p-3 rounded-xl shadow-sm">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setAddMode("single")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                    addMode === "single"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  Одиночный поиск
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("mass")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                    addMode === "mass"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  Массовый ввод
                </button>
              </div>

              {/* Region Selector right here inside CartModal */}
              {regions.length > 0 && (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-inner">
                  <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider font-sans">
                    Регион:
                  </span>
                  <select
                    value={selectedRegion}
                    onChange={(e) => onRegionChange?.(e.target.value)}
                    className="bg-transparent border-0 text-xs font-black text-slate-800 focus:outline-none cursor-pointer hover:text-slate-950 font-sans leading-none p-0 pr-1 h-auto"
                  >
                    <option value="">Все регионы</option>
                    {regions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {addedMessage && (
              <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-3 py-1 rounded text-xs font-bold flex items-center gap-1.5 animate-fade-in font-sans shrink-0">
                <Check className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                <span>{addedMessage}</span>
              </div>
            )}
          </div>

          {addMode === "single" ? (
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-end">
              <div className="relative flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Введите ID, код товара или название для поиска..."
                    value={searchIdQuery}
                    onChange={(e) => {
                      setSearchIdQuery(e.target.value);
                      setShowSuggestions(true);
                      if (
                        selectedQuickProduct &&
                        e.target.value !==
                          (selectedQuickProduct.code
                            ? `#${selectedQuickProduct.code}`
                            : selectedQuickProduct.id)
                      ) {
                        setSelectedQuickProduct(null);
                      }
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-950 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
                  />
                  {searchIdQuery && (
                    <button
                      onClick={() => {
                        setSearchIdQuery("");
                        setSelectedQuickProduct(null);
                        setShowSuggestions(false);
                      }}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {showSuggestions && searchIdQuery.trim() && (
                  <div className="absolute top-full left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl shrink-0">
                    {filteredProducts.length === 0 ? (
                      <div className="p-3 text-sm text-slate-400 text-center italic">
                        Товары не найдены
                      </div>
                    ) : (
                      filteredProducts.map((p) => {
                        let hasPrice = false;
                        const sups: ("supplier2" | "supplier3" | "supplier4")[] = [
                          "supplier2",
                          "supplier3",
                          "supplier4",
                        ];
                        const searchRegions = selectedRegion ? [selectedRegion] : regions;
                        for (const reg of searchRegions) {
                          for (const sup of sups) {
                            const pr = getProductPrice(p, sup, reg);
                            if (pr > 0) {
                              hasPrice = true;
                              break;
                            }
                          }
                          if (hasPrice) break;
                        }

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedQuickProduct(p);
                              setSearchIdQuery(p.code ? `#${p.code}` : p.id);
                              setShowSuggestions(false);
                            }}
                            className="w-full text-left p-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center justify-between gap-3 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {p.imageBase64 ? (
                                <img
                                  src={p.imageBase64}
                                  alt=""
                                  className="w-8 h-8 object-cover rounded border border-slate-200 shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 bg-slate-100 rounded border border-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                                  <Package className="w-4 h-4" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900 leading-tight truncate flex items-center gap-1.5">
                                  {p.code ? (
                                    <span className={`${hasPrice ? "text-indigo-600 border-indigo-100 bg-indigo-50" : "text-rose-600 bg-rose-50 border-rose-100"} border px-1 py-0.5 rounded font-mono`}>
                                      #{p.code}
                                    </span>
                                  ) : (
                                    <span className={`${hasPrice ? "text-slate-500 border-slate-200 bg-slate-50" : "text-rose-600 bg-rose-50 border-rose-100"} border px-1 py-0.5 rounded font-mono text-[9px] max-w-[80px] truncate`}>
                                      {p.id}
                                    </span>
                                  )}
                                  <span className="truncate">{p.name}</span>
                                </div>
                                <div className={`text-[10px] truncate mt-0.5 ${hasPrice ? "text-slate-500" : "text-rose-400"}`}>
                                  {p.id}
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0 flex items-center gap-2">
                              {!hasPrice && (
                                <span className="text-[9px] font-bold bg-rose-50 border border-rose-100 text-rose-600 px-1.5 py-0.5 rounded">
                                  НЕТ ЦЕНЫ
                                </span>
                              )}
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono select-none">
                                {(p.spheres && p.spheres.length > 0) ? p.spheres.join(", ") : (p.sphere || "Каталог")}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {selectedQuickProduct && cheapestQuickInfo && (
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end shrink-0 md:w-auto w-full">
                  <div className="flex flex-col min-w-[200px]">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                      Поставщик с мин. ценой ({selectedRegion || "Все регионы"})
                    </label>
                    {cheapestQuickInfo.price === Infinity ? (
                      <div className="bg-rose-50 border border-rose-150 text-rose-850 px-2.5 py-2.5 rounded-lg text-xs font-bold leading-none flex items-center justify-between gap-2 shadow-sm shrink-0">
                        <span className="truncate max-w-[130px]">
                          НЕТ ЦЕНЫ
                        </span>
                      </div>
                    ) : (
                      <div className="bg-emerald-50 border border-emerald-150 text-emerald-850 px-2.5 py-2.5 rounded-lg text-xs font-bold leading-none flex items-center justify-between gap-2 shadow-sm shrink-0">
                        <span className="truncate max-w-[130px]">
                          {getSupplierName(cheapestQuickInfo.supplier)}
                        </span>
                        <span className="text-[9px] bg-emerald-650 text-white px-1 py-0.5 rounded uppercase font-black tracking-wide shrink-0 font-sans leading-none">
                          Мин
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-end text-right px-2 py-0.5 min-w-[80px]">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                      Цена
                    </span>
                    <span className="text-sm font-black text-slate-900 font-mono">
                      {cheapestQuickInfo.price === Infinity ? "—" : `${cheapestQuickInfo.price.toFixed(2)} с.`}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={cheapestQuickInfo.price === Infinity}
                    onClick={handleQuickAdd}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm shrink-0 hover:shadow-md ${cheapestQuickInfo.price === Infinity ? "bg-slate-300 text-slate-500 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
                  >
                    Добавить в корзину
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="text-[11px] text-slate-500 font-medium">
                Введите коды или ID товаров через <strong>запятую</strong>,{" "}
                <strong>пробел</strong> или в <strong>новую строку</strong>{" "}
                (можно вставить столбиком из Excel):
              </div>
              <div className="flex flex-col md:flex-row gap-4 items-stretch">
                <div className="flex-1">
                  <textarea
                    rows={2}
                    value={massInputText}
                    onChange={(e) => setMassInputText(e.target.value)}
                    placeholder="Например: 10405, 10408, #10410 10412"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-950 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono resize-none animate-fade-in"
                  />
                </div>

                <div className="flex flex-row md:flex-col gap-3 shrink-0 items-end justify-between md:justify-end min-w-[240px]">
                  <div className="flex flex-col w-full text-slate-600 text-[11px] leading-tight bg-emerald-50 border border-emerald-100 p-2.5 rounded-lg animate-fade-in">
                    <span className="font-bold text-emerald-800 mb-1 flex items-center gap-1 font-sans">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Автовыбор цен
                    </span>
                    <span>Система автоматически добавит каждый товар у поставщика с </span>
                    <span>{selectedRegion ? `меньшей ценой для региона ${selectedRegion}.` : "наименьшей ценой среди всех регионов."}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleMassAdd}
                    disabled={massAnalysis.found.length === 0}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-sm w-full shrink-0 flex items-center justify-center gap-1.5 animate-fade-in"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Добавить ({massAnalysis.found.length})
                  </button>
                </div>
              </div>

              {/* Dynamic feedback of matched products */}
              {massInputText.trim() && (
                <div className="bg-white/80 border border-slate-200 rounded-lg p-3 text-xs flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                    <span className="font-bold text-slate-700 flex items-center gap-2">
                      Анализ ввода:
                      {isAnalyzingMass && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                      )}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded font-bold">
                        Найдено: {massAnalysis.found.length} тов.
                      </span>
                      {massAnalysis.notFound.length > 0 && (
                        <span className="text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded font-bold">
                          Не совпадает: {massAnalysis.notFound.length}
                        </span>
                      )}
                    </div>
                  </div>

                  {massAnalysis.found.length > 0 && (
                    <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                      {massAnalysis.found.map((p) => {
                        const bestInfo = (() => {
                          const sups: (
                            | "supplier2"
                            | "supplier3"
                            | "supplier4"
                          )[] = [
                            "supplier2",
                            "supplier3",
                            "supplier4",
                          ];
                          let minPrice = Infinity;
                          let bestSupplier:
                            | "supplier2"
                            | "supplier3"
                            | "supplier4"
                            | "supplier1" = "supplier2";

                          const searchRegions = selectedRegion ? [selectedRegion] : regions;
                          searchRegions.forEach((reg) => {
                            sups.forEach((sup) => {
                              const pr = getProductPrice(p, sup, reg);
                              if (pr > 0 && pr < minPrice) {
                                minPrice = pr;
                                bestSupplier = sup;
                              }
                            });
                          });

                          return { supplier: bestSupplier, price: minPrice };
                        })();

                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-3 bg-white border border-slate-100 p-2 rounded shadow-sm animate-fade-in"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {p.code ? (
                                <span className={`${bestInfo.price === Infinity ? "text-rose-600 bg-rose-50 border-rose-100" : "text-indigo-600 bg-indigo-50 border-indigo-100"} border font-mono text-[10px] px-1 py-0.5 rounded shrink-0`}>
                                  #{p.code}
                                </span>
                              ) : (
                                <span className={`${bestInfo.price === Infinity ? "text-rose-600 bg-rose-50 border-rose-100" : "text-slate-500 bg-slate-50 border-slate-100"} border font-mono text-[9px] px-1 py-0.5 rounded shrink-0 max-w-[100px] truncate`}>
                                  {p.id}
                                </span>
                              )}
                              <span className="font-medium text-slate-800 truncate text-[11px]">
                                {p.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] text-slate-400 font-medium">
                                Мин:
                              </span>
                              {bestInfo.price === Infinity ? (
                                <span className="text-rose-500 font-bold text-[10px]">
                                  НЕТ ЦЕНЫ
                                </span>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="bg-emerald-50 text-emerald-750 border border-emerald-100 px-1.5 py-0.5 rounded font-bold text-[10px] truncate max-w-[100px]"
                                    title={getSupplierName(bestInfo.supplier)}
                                  >
                                    {getSupplierName(bestInfo.supplier)}
                                  </span>
                                  <span className="font-mono font-bold text-slate-900 text-[11px]">
                                    {bestInfo.price.toFixed(2)} с.
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {massAnalysis.notFound.length > 0 && (
                    <div className="text-[10px] text-slate-500 flex flex-wrap gap-1.5 items-center">
                      <span className="text-rose-500 font-bold shrink-0">
                        Не найденные в каталоге коды/символы:
                      </span>
                      {massAnalysis.notFound.map((u, i) => (
                        <span
                          key={i}
                          className="bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-mono text-[9px]"
                        >
                          {u}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-50 relative z-10">
          {displayedCart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 py-16">
              <Package className="w-12 h-12 mb-4 text-slate-300" />
              <p>Корзина пуста. Добавьте товары из каталога.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {displayedCart.map((item) => (
                <div
                  key={`${item.product.id}-${item.selectedSupplier}`}
                  className="bg-white border border-slate-200 p-3 sm:p-4 rounded-lg flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 shadow-sm"
                >
                  <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1 min-w-0 w-full">
                    {/* Image */}
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-100 rounded border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center text-slate-300">
                      {item.product.imageBase64 ? (
                        <img
                          src={item.product.imageBase64}
                          alt={item.product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-6 h-6 sm:w-8 sm:h-8" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 line-clamp-1 flex items-center leading-normal text-sm sm:text-base">
                        {item.product.code ? (
                          <span className={`font-mono text-[10px] sm:text-xs font-semibold mr-2 px-1.5 py-0.5 rounded leading-none shrink-0 border ${item.selectedPrice === Infinity ? "text-rose-600 bg-rose-50 border-rose-100" : "text-slate-400 bg-slate-100 border-slate-100"}`}>
                            #{item.product.code}
                          </span>
                        ) : (
                          <span className={`font-mono text-[10px] font-semibold mr-2 px-1.5 py-0.5 rounded leading-none shrink-0 border max-w-[100px] truncate ${item.selectedPrice === Infinity ? "text-rose-600 bg-rose-50 border-rose-100" : "text-slate-400 bg-slate-100 border-slate-100"}`}>
                            {item.product.id}
                          </span>
                        )}
                        <span className="truncate">{item.product.name}</span>
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-500 line-clamp-1 mt-0.5">
                        {item.product.description || "Нет описания"}
                      </p>
                      <div className="text-[10px] sm:text-xs text-slate-400 mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                         {item.selectedPrice === Infinity ? (
                           <span className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-600 px-2 py-0.5 sm:py-1 rounded-md font-bold border border-rose-100 text-[10px] sm:text-[11px]">
                             НЕТ ЦЕНЫ
                           </span>
                         ) : showBestPrice ? (
                           <span
                             className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 px-2 py-0.5 sm:py-1 rounded-md font-bold border border-emerald-100 text-[10px] sm:text-[11px]"
                             title="Выбран поставщик с минимальной ценой"
                           >
                             <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0"></span>
                             {getSupplierName(item.selectedSupplier || 'supplier2')}
                             <span className="text-[9px] bg-emerald-600 text-white px-1 rounded-sm uppercase tracking-wider font-extrabold scale-90">
                               мин
                             </span>
                           </span>
                         ) : (() => {
                           const availableSuppliers = (["supplier2", "supplier3", "supplier4"] as const).map(sup => {
                             const price = getProductPrice(item.product, sup, selectedRegion || "Душанбе");
                             return { id: sup, price };
                           }).filter(s => s.price > 0);

                           if (onUpdateSupplier && availableSuppliers.length > 1) {
                             return (
                               <div className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-2 py-0.5 sm:py-1 rounded-md text-indigo-800 font-bold text-[10px] sm:text-[11px] shadow-sm">
                                 <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">Поставщик:</span>
                                 <select
                                   value={item.selectedSupplier}
                                   onChange={(e) => {
                                     const newSup = e.target.value as "supplier2" | "supplier3" | "supplier4";
                                     onUpdateSupplier(item.product.id, item.selectedSupplier, newSup);
                                   }}
                                   className="bg-transparent border-none text-indigo-900 font-bold text-[10px] sm:text-[11px] focus:outline-none cursor-pointer transition-colors p-0 pr-1"
                                 >
                                   {availableSuppliers.map((s) => (
                                     <option key={s.id} value={s.id} className="bg-white text-slate-900 font-medium">
                                       {getSupplierName(s.id)} ({s.price.toFixed(2)} с.)
                                     </option>
                                   ))}
                                 </select>
                               </div>
                             );
                           }

                           return (
                             <span
                               className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-800 px-2 py-0.5 sm:py-1 rounded-md font-bold border border-indigo-100 text-[10px] sm:text-[11px]"
                             >
                               <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0"></span>
                               {getSupplierName(item.selectedSupplier || 'supplier2')}
                             </span>
                           );
                         })()}

                        {item.selectedPrice !== Infinity && (supplierLegalNames?.[item.selectedSupplier || 'supplier2'] || supplierPhones?.[item.selectedSupplier || 'supplier2']) && (
                          <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 text-[9px] sm:text-[10px] text-slate-500 px-1.5 sm:px-2 py-0.5 rounded font-medium">
                            {supplierLegalNames?.[item.selectedSupplier || 'supplier2'] && (
                              <span>Юр: {supplierLegalNames[item.selectedSupplier || 'supplier2']}</span>
                            )}
                            {supplierLegalNames?.[item.selectedSupplier || 'supplier2'] && supplierPhones?.[item.selectedSupplier || 'supplier2'] && (
                              <span className="text-slate-300">|</span>
                            )}
                            {supplierPhones?.[item.selectedSupplier || 'supplier2'] && (
                              <span>Тел: {supplierPhones[item.selectedSupplier || 'supplier2']}</span>
                            )}
                          </span>
                        )}

                        <span className="bg-slate-100 text-slate-700 px-1.5 sm:px-2 py-0.5 rounded font-medium text-[10px] sm:text-[11px] truncate max-w-full">
                          {selectedSphere ? (
                            (() => {
                              const prodSpheres = item.product.spheres && item.product.spheres.length > 0 
                                ? item.product.spheres 
                                : [item.product.sphere || "Общее"];
                              const matched = prodSpheres.find(s => 
                                s === selectedSphere || 
                                s.includes(selectedSphere) || 
                                selectedSphere.includes(s)
                              );
                              return matched || selectedSphere;
                            })()
                          ) : (
                            item.product.spheres && item.product.spheres.length > 0 
                              ? item.product.spheres.join(", ") 
                              : (item.product.sphere || "—")
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Price X Quantity */}
                  <div className="text-left sm:text-right flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 w-full sm:w-auto min-w-0 sm:min-w-[120px] pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="font-mono font-bold text-slate-900 text-base sm:text-lg">
                      {item.selectedPrice === Infinity ? (
                        <span className="text-rose-500 text-sm">—</span>
                      ) : (
                        `${((item.selectedPrice || 0) * item.quantity).toFixed(2)} с.`
                      )}
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1 scale-90 sm:scale-100 origin-right">
                      <button
                        onClick={() =>
                          updateQuantity(
                            item.product.id,
                            item.selectedSupplier,
                            -1,
                          )
                        }
                        className="p-1 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded"
                      >
                        {item.quantity === 1 ? (
                          <Trash2 className="w-4 h-4 text-red-500" />
                        ) : (
                          <Minus className="w-4 h-4" />
                        )}
                      </button>
                      <span className="text-sm font-medium px-1.5 text-center whitespace-nowrap min-w-8">
                        {item.quantity} {item.product.unit || "шт."}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantity(
                            item.product.id,
                            item.selectedSupplier,
                            1,
                          )
                        }
                        className="p-1 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {logisticsCost > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded border border-indigo-200 flex items-center justify-center text-indigo-500 shrink-0">
                      <Truck className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-indigo-900">
                        Логистика ({selectedRegion || "Все регионы"})
                      </h3>
                      <p className="text-sm text-indigo-700 mt-0.5">
                        Доставка до выбранного региона
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end min-w-[120px]">
                    <div className="font-mono font-bold text-indigo-900">
                      {logisticsCost.toFixed(2)} с.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {displayedCart.length > 0 && (
          <div className="border-t border-slate-200 p-3.5 sm:p-6 bg-slate-50 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <button
              onClick={handleClearCartClick}
              className={`flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-lg border transition-all text-xs sm:text-sm font-semibold w-full sm:w-auto justify-center shadow-sm ${
                isConfirmingClear
                  ? "bg-red-600 hover:bg-red-700 text-white border-red-700 animate-pulse"
                  : "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
              }`}
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>{isConfirmingClear ? "Вы уверены? Нажмите для подтверждения" : "Очистить корзину"}</span>
            </button>
            <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
              <div className="text-slate-700 font-bold text-sm sm:text-base">Итого:</div>
              <div className="text-2xl sm:text-3xl font-bold font-mono text-slate-900">
                {total.toFixed(2)} с.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
