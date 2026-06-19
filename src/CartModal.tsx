import React, { useState, useMemo, useEffect } from "react";
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
}

export function CartModal({
  isOpen,
  onClose,
  cart,
  updateQuantity,
  onPrint,
  suppliers,
  products,
  onAddToCart,
  selectedRegion,
  getProductPrice,
  onUpdateSupplier,
  regions = [],
  onRegionChange,
  logisticsCost = 0,
}: Props) {
  if (!isOpen) return null;

  const [addMode, setAddMode] = useState<"single" | "mass">("single");
  const [massInputText, setMassInputText] = useState("");

  const [searchIdQuery, setSearchIdQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedQuickProduct, setSelectedQuickProduct] =
    useState<Product | null>(null);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);

  const cartLinesTotal = cart.reduce(
    (sum, item) => sum + (item.selectedPrice === Infinity ? 0 : (item.selectedPrice || 0)) * item.quantity,
    0,
  );
  const total = cartLinesTotal + (cart.length > 0 ? logisticsCost : 0);

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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Лист выборки (корзина)
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {cart.length} наименований
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                downloadCartExcel(cart, cart.length > 0 ? logisticsCost : 0);
              }}
              disabled={cart.length === 0}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md transition-colors text-sm font-medium"
            >
              <FileDown className="w-4 h-4" />
              <span>Скачать Excel</span>
            </button>
            <button
              onClick={onPrint}
              disabled={cart.length === 0}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md transition-colors text-sm font-medium"
            >
              <Printer className="w-4 h-4" />
              <span>Распечатать лист</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Add Form Section */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-4 shrink-0 flex flex-col gap-3 relative z-20">
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
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 relative z-10">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 py-16">
              <Package className="w-12 h-12 mb-4 text-slate-300" />
              <p>Корзина пуста. Добавьте товары из каталога.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {cart.map((item) => (
                <div
                  key={`${item.product.id}-${item.selectedSupplier}`}
                  className="bg-white border border-slate-200 p-4 rounded-lg flex items-center gap-4 shadow-sm"
                >
                  {/* Image */}
                  <div className="w-20 h-20 bg-slate-100 rounded border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center text-slate-300">
                    {item.product.imageBase64 ? (
                      <img
                        src={item.product.imageBase64}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-8 h-8" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 line-clamp-1 flex items-center leading-normal">
                      {item.product.code ? (
                        <span className={`font-mono text-xs font-semibold mr-2 px-1.5 py-0.5 rounded leading-none shrink-0 border ${item.selectedPrice === Infinity ? "text-rose-600 bg-rose-50 border-rose-100" : "text-slate-400 bg-slate-100 border-slate-100"}`}>
                          #{item.product.code}
                        </span>
                      ) : (
                        <span className={`font-mono text-[10px] font-semibold mr-2 px-1.5 py-0.5 rounded leading-none shrink-0 border max-w-[100px] truncate ${item.selectedPrice === Infinity ? "text-rose-600 bg-rose-50 border-rose-100" : "text-slate-400 bg-slate-100 border-slate-100"}`}>
                          {item.product.id}
                        </span>
                      )}
                      <span className="truncate">{item.product.name}</span>
                    </h3>
                    <p className="text-sm text-slate-500 line-clamp-1 mt-0.5">
                      {item.product.description || "Нет описания"}
                    </p>
                    <div className="text-xs text-slate-400 mt-2 flex flex-wrap items-center gap-2">
                       {item.selectedPrice === Infinity ? (
                         <span className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-600 px-2.5 py-1 rounded-md font-bold border border-rose-100 text-[11px]">
                           НЕТ ЦЕНЫ
                         </span>
                       ) : (
                        <span
                          className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-md font-bold border border-emerald-100 text-[11px]"
                          title="Выбран поставщик с минимальной ценой"
                        >
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0"></span>
                          {getSupplierName(item.selectedSupplier)}
                          <span className="text-[9px] bg-emerald-600 text-white px-1 rounded-sm uppercase tracking-wider font-extrabold scale-90">
                            мин
                          </span>
                        </span>
                       )}
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium text-[11px] truncate max-w-full">
                        {item.product.spheres && item.product.spheres.length > 0 ? item.product.spheres.join(", ") : item.product.sphere}
                      </span>
                    </div>
                  </div>

                  {/* Price X Quantity */}
                  <div className="text-right flex flex-col items-end gap-3 min-w-[120px]">
                    <div className="font-mono font-bold text-slate-900">
                      {item.selectedPrice === Infinity ? (
                        <span className="text-rose-500 text-sm">—</span>
                      ) : (
                        `${((item.selectedPrice || 0) * item.quantity).toFixed(2)} с.`
                      )}
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1">
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
        {cart.length > 0 && (
          <div className="border-t border-slate-200 p-6 bg-white shrink-0 flex items-center justify-between">
            <div className="text-slate-700 font-bold">Итого:</div>
            <div className="text-3xl font-bold font-mono text-slate-900">
              {total.toFixed(2)} с.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
