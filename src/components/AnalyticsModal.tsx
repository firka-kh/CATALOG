import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Search,
  Calendar,
  Filter,
  AlertTriangle,
  TrendingUp,
  BarChart2,
  Users,
  MapPin,
  Building2,
  Package,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  SlidersHorizontal,
  CheckCircle2,
  Layers,
  HelpCircle,
  Eye,
  Edit3,
  Sliders,
  Check,
  Loader2,
  Save,
} from "lucide-react";
import { Product } from "../types";
import { QuoteRecord, fetchQuotesHistory } from "../lib/quotesHistory";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import Workbook from "exceljs";
import { saveAs } from "file-saver";

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  globalDict: {
    regions?: string[];
    spheres?: string[];
    suppliers?: string[];
    pricingRules?: Record<string, Record<string, number>>;
    supplierPhones?: Record<string, string>;
  };
  onEditProduct?: (product: Product) => void;
  onViewProduct?: (product: Product) => void;
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
  isOpen,
  onClose,
  products,
  globalDict,
  onEditProduct,
  onViewProduct,
}) => {
  const [activeTab, setActiveTab] = useState<
    "anomalies" | "sales" | "regions" | "facilitators"
  >("anomalies");

  // Quick Price Edit State
  const [quickEditProduct, setQuickEditProduct] = useState<Product | null>(null);
  const [quickPrices, setQuickPrices] = useState<{
    price: string;
    supplier1: string;
    supplier2: string;
    supplier3: string;
    supplier4: string;
  }>({
    price: "",
    supplier1: "",
    supplier2: "",
    supplier3: "",
    supplier4: "",
  });
  const [isSavingQuickPrice, setIsSavingQuickPrice] = useState(false);
  const [quickSaveSuccess, setQuickSaveSuccess] = useState(false);

  const handleOpenQuickEdit = (product: Product) => {
    setQuickEditProduct(product);
    setQuickSaveSuccess(false);

    const p1 = product.priceSupplier1 !== undefined && product.priceSupplier1 !== null ? String(product.priceSupplier1) : "";
    const p2 = product.priceSupplier2 !== undefined && product.priceSupplier2 !== null ? String(product.priceSupplier2) : "";
    const p3 = product.priceSupplier3 !== undefined && product.priceSupplier3 !== null ? String(product.priceSupplier3) : "";
    const p4 = product.priceSupplier4 !== undefined && product.priceSupplier4 !== null ? String(product.priceSupplier4) : "";
    const baseP = product.price !== undefined && product.price !== null ? String(product.price) : "";

    setQuickPrices({
      price: baseP,
      supplier1: p1,
      supplier2: p2,
      supplier3: p3,
      supplier4: p4,
    });
  };

  const handleSaveQuickPrices = async () => {
    if (!quickEditProduct) return;
    setIsSavingQuickPrice(true);
    try {
      const p1Val = quickPrices.supplier1 !== "" ? parseFloat(quickPrices.supplier1) : 0;
      const p2Val = quickPrices.supplier2 !== "" ? parseFloat(quickPrices.supplier2) : 0;
      const p3Val = quickPrices.supplier3 !== "" ? parseFloat(quickPrices.supplier3) : 0;
      const p4Val = quickPrices.supplier4 !== "" ? parseFloat(quickPrices.supplier4) : 0;
      const baseVal = quickPrices.price !== "" ? parseFloat(quickPrices.price) : 0;

      const updatedFields = {
        price: baseVal,
        priceSupplier1: p1Val,
        priceSupplier2: p2Val,
        priceSupplier3: p3Val,
        priceSupplier4: p4Val,
      };

      await updateDoc(doc(db, "products", quickEditProduct.id), updatedFields);
      setQuickSaveSuccess(true);
      setTimeout(() => {
        setQuickSaveSuccess(false);
        setQuickEditProduct(null);
      }, 1200);
    } catch (err) {
      console.error("Error updating quick prices:", err);
      alert("Ошибка при сохранении цен: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSavingQuickPrice(false);
    }
  };

  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Filters
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<string>("");
  const [selectedSphereFilter, setSelectedSphereFilter] = useState<string>("");
  const [periodFilter, setPeriodFilter] = useState<"all" | "30days" | "7days">("all");
  const [minAnomalyPercent, setMinAnomalyPercent] = useState<number>(15);

  // Supplier Names Helper
  const getSupplierName = (key: "supplier1" | "supplier2" | "supplier3" | "supplier4") => {
    if (key === "supplier1") return "Логистика (Пост. 0)";
    const list = globalDict.suppliers || [];
    if (key === "supplier2") return list[0] || "Поставщик 1";
    if (key === "supplier3") return list[1] || "Поставщик 2";
    return list[2] || "Поставщик 3";
  };

  // Helper to calculate price of a product for a supplier in a region
  const getProductPrice = (
    p: Product,
    supplier: "supplier2" | "supplier3" | "supplier4",
    region?: string
  ): number => {
    if (!p) return 0;
    if (region && p.prices && p.prices[supplier] && p.prices[supplier][region]) {
      const val = parseFloat(String(p.prices[supplier][region]));
      if (val > 0) return val;
    }
    const mapId =
      supplier === "supplier2"
        ? "priceSupplier2"
        : supplier === "supplier3"
          ? "priceSupplier3"
          : "priceSupplier4";
    const legacyPrice = parseFloat(String(p[mapId as keyof Product])) || 0;
    if (legacyPrice > 0) return legacyPrice;

    const basePrice = parseFloat(String(p.price)) || 0;
    if (basePrice > 0) {
      const markup = (region && globalDict?.pricingRules?.[supplier]?.[region]) ?? 0;
      const autoPrice = basePrice * (1 + markup / 100);
      return Math.round(autoPrice * 100) / 100;
    }
    return 0;
  };

  const loadQuotesData = async () => {
    setLoadingHistory(true);
    try {
      const data = await fetchQuotesHistory();
      setQuotes(data);
    } catch (e) {
      console.error("Failed to load quotes for analytics:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadQuotesData();
    }
  }, [isOpen]);

  // Filter quotes by date period
  const filteredQuotes = useMemo(() => {
    const now = Date.now();
    return quotes.filter((q) => {
      const time = q.createdAtTimestamp || 0;
      if (periodFilter === "7days" && now - time > 7 * 24 * 3600 * 1000) return false;
      if (periodFilter === "30days" && now - time > 30 * 24 * 3600 * 1000) return false;
      if (selectedRegionFilter && q.selectedRegion !== selectedRegionFilter) return false;
      if (selectedSphereFilter && q.selectedSphere !== selectedSphereFilter) return false;
      return true;
    });
  }, [quotes, periodFilter, selectedRegionFilter, selectedSphereFilter]);

  // 1. PRICE ANOMALY DETECTION ENGINE
  const priceAnomalies = useMemo(() => {
    const results: Array<{
      product: Product;
      prices: { supplier2: number; supplier3: number; supplier4: number };
      minPrice: number;
      maxPrice: number;
      cheapestSupplier: "supplier2" | "supplier3" | "supplier4";
      expensivestSupplier: "supplier2" | "supplier3" | "supplier4";
      spreadAmount: number;
      spreadPercent: number;
      severity: "critical" | "warning" | "moderate";
    }> = [];

    const activeRegion = selectedRegionFilter || undefined;

    products.forEach((p) => {
      // Check search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(q);
        const matchCode = p.code ? p.code.toLowerCase().includes(q) : false;
        if (!matchName && !matchCode) return;
      }

      // Check sphere filter for product
      if (selectedSphereFilter) {
        const spheres = p.spheres && p.spheres.length > 0 ? p.spheres : (p.sphere ? [p.sphere] : []);
        if (!spheres.includes(selectedSphereFilter)) return;
      }

      const p2 = getProductPrice(p, "supplier2", activeRegion);
      const p3 = getProductPrice(p, "supplier3", activeRegion);
      const p4 = getProductPrice(p, "supplier4", activeRegion);

      const validPrices: Array<{ sup: "supplier2" | "supplier3" | "supplier4"; price: number }> = [];
      if (p2 > 0) validPrices.push({ sup: "supplier2", price: p2 });
      if (p3 > 0) validPrices.push({ sup: "supplier3", price: p3 });
      if (p4 > 0) validPrices.push({ sup: "supplier4", price: p4 });

      // Need at least 2 suppliers with prices to detect price anomaly
      if (validPrices.length >= 2) {
        validPrices.sort((a, b) => a.price - b.price);
        const minObj = validPrices[0];
        const maxObj = validPrices[validPrices.length - 1];

        const minPrice = minObj.price;
        const maxPrice = maxObj.price;

        if (minPrice > 0) {
          const spreadAmount = maxPrice - minPrice;
          const spreadPercent = Math.round(((maxPrice - minPrice) / minPrice) * 100);

          if (spreadPercent >= minAnomalyPercent) {
            let severity: "critical" | "warning" | "moderate" = "moderate";
            if (spreadPercent >= 50) severity = "critical";
            else if (spreadPercent >= 25) severity = "warning";

            results.push({
              product: p,
              prices: { supplier2: p2, supplier3: p3, supplier4: p4 },
              minPrice,
              maxPrice,
              cheapestSupplier: minObj.sup,
              expensivestSupplier: maxObj.sup,
              spreadAmount,
              spreadPercent,
              severity,
            });
          }
        }
      }
    });

    return results.sort((a, b) => b.spreadPercent - a.spreadPercent);
  }, [products, selectedRegionFilter, selectedSphereFilter, minAnomalyPercent, searchQuery]);

  // 2. DEMAND BY PRODUCT & SPHERE
  const sphereAndProductStats = useMemo(() => {
    const sphereMap = new Map<string, { count: number; sum: number; itemsCount: number }>();
    const productMap = new Map<string, { product: Product; totalQty: number; totalSum: number; ordersCount: number }>();

    filteredQuotes.forEach((q) => {
      const qSphere = q.selectedSphere || "Общие товары";
      
      q.items.forEach((item) => {
        const itemSum = (item.selectedPrice || 0) * (item.quantity || 1);
        const itemQty = item.quantity || 1;

        // Sphere aggregation
        const pSpheres = item.product.spheres && item.product.spheres.length > 0 
          ? item.product.spheres 
          : [item.product.sphere || qSphere];

        pSpheres.forEach((sph) => {
          const current = sphereMap.get(sph) || { count: 0, sum: 0, itemsCount: 0 };
          sphereMap.set(sph, {
            count: current.count + 1,
            sum: current.sum + itemSum,
            itemsCount: current.itemsCount + itemQty,
          });
        });

        // Product aggregation
        const prodId = item.product.id || item.product.name;
        const currentProd = productMap.get(prodId) || {
          product: item.product,
          totalQty: 0,
          totalSum: 0,
          ordersCount: 0,
        };
        productMap.set(prodId, {
          product: item.product,
          totalQty: currentProd.totalQty + itemQty,
          totalSum: currentProd.totalSum + itemSum,
          ordersCount: currentProd.ordersCount + 1,
        });
      });
    });

    const spheresList = Array.from(sphereMap.entries())
      .map(([name, stat]) => ({ name, ...stat }))
      .sort((a, b) => b.sum - a.sum);

    const productsList = Array.from(productMap.values())
      .filter((p) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        return p.product.name.toLowerCase().includes(q) || (p.product.code && p.product.code.toLowerCase().includes(q));
      })
      .sort((a, b) => b.totalQty - a.totalQty);

    const totalSalesVolume = filteredQuotes.reduce((acc, q) => acc + (q.totalAmount || 0), 0);
    const totalItemsPurchased = Array.from(productMap.values()).reduce((acc, p) => acc + p.totalQty, 0);

    return {
      spheresList,
      productsList,
      totalSalesVolume,
      totalItemsPurchased,
    };
  }, [filteredQuotes, searchQuery]);

  // 3. REGIONAL BREAKDOWN BY SUPPLIER
  const regionSupplierStats = useMemo(() => {
    const regionMap = new Map<string, {
      totalOrders: number;
      totalSum: number;
      suppliers: Record<"supplier1" | "supplier2" | "supplier3" | "supplier4", { qty: number; sum: number }>;
    }>();

    const supplierTotals = {
      supplier1: { qty: 0, sum: 0 },
      supplier2: { qty: 0, sum: 0 },
      supplier3: { qty: 0, sum: 0 },
      supplier4: { qty: 0, sum: 0 },
    };

    filteredQuotes.forEach((q) => {
      const reg = q.selectedRegion || "Душанбе";
      if (!regionMap.has(reg)) {
        regionMap.set(reg, {
          totalOrders: 0,
          totalSum: 0,
          suppliers: {
            supplier1: { qty: 0, sum: 0 },
            supplier2: { qty: 0, sum: 0 },
            supplier3: { qty: 0, sum: 0 },
            supplier4: { qty: 0, sum: 0 },
          },
        });
      }

      const regData = regionMap.get(reg)!;
      regData.totalOrders += 1;
      regData.totalSum += q.totalAmount || 0;

      q.items.forEach((item) => {
        const sup = item.selectedSupplier || "supplier2";
        const sum = (item.selectedPrice || 0) * (item.quantity || 1);
        const qty = item.quantity || 1;

        regData.suppliers[sup].qty += qty;
        regData.suppliers[sup].sum += sum;

        supplierTotals[sup].qty += qty;
        supplierTotals[sup].sum += sum;
      });
    });

    const regionsList = Array.from(regionMap.entries())
      .map(([region, data]) => ({ region, ...data }))
      .sort((a, b) => b.totalSum - a.totalSum);

    return {
      regionsList,
      supplierTotals,
    };
  }, [filteredQuotes]);

  // 4. FACILITATOR PERFORMANCE
  const facilitatorStats = useMemo(() => {
    const facMap = new Map<string, {
      name: string;
      quotesCount: number;
      totalSum: number;
      itemsCount: number;
      regionsCount: Record<string, number>;
      spheresCount: Record<string, number>;
      lastOrderDate: string;
    }>();

    filteredQuotes.forEach((q) => {
      const facName = (q.facilitatorName || "").trim() || "Фасилитатор";
      if (!facMap.has(facName)) {
        facMap.set(facName, {
          name: facName,
          quotesCount: 0,
          totalSum: 0,
          itemsCount: 0,
          regionsCount: {},
          spheresCount: {},
          lastOrderDate: q.createdAt,
        });
      }

      const data = facMap.get(facName)!;
      data.quotesCount += 1;
      data.totalSum += q.totalAmount || 0;
      data.itemsCount += q.items.reduce((acc, i) => acc + (i.quantity || 1), 0);

      const reg = q.selectedRegion || "Душанбе";
      data.regionsCount[reg] = (data.regionsCount[reg] || 0) + 1;

      const sph = q.selectedSphere || "Общее";
      data.spheresCount[sph] = (data.spheresCount[sph] || 0) + 1;
    });

    return Array.from(facMap.values())
      .map((fac) => {
        const topRegion = Object.entries(fac.regionsCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
        const topSphere = Object.entries(fac.spheresCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
        const avgOrder = fac.quotesCount > 0 ? Math.round(fac.totalSum / fac.quotesCount) : 0;
        return {
          ...fac,
          topRegion,
          topSphere,
          avgOrder,
        };
      })
      .sort((a, b) => b.totalSum - a.totalSum);
  }, [filteredQuotes]);

  // EXPORT ANALYTICS TO EXCEL REPORT
  const handleExportAnalyticsExcel = async () => {
    const wb = new Workbook.Workbook();
    wb.creator = "B2B Analytics System";
    wb.created = new Date();

    // 1. Anomalies Sheet
    const sheet1 = wb.addWorksheet("Аномалии цен");
    sheet1.columns = [
      { header: "Код", key: "code", width: 12 },
      { header: "Наименование товара", key: "name", width: 35 },
      { header: "Ед.изм.", key: "unit", width: 10 },
      { header: getSupplierName("supplier2"), key: "sup2", width: 16 },
      { header: getSupplierName("supplier3"), key: "sup3", width: 16 },
      { header: getSupplierName("supplier4"), key: "sup4", width: 16 },
      { header: "Мин. цена", key: "min", width: 14 },
      { header: "Макс. цена", key: "max", width: 14 },
      { header: "Разница (сомони)", key: "spread", width: 18 },
      { header: "Разница (%)", key: "spreadPct", width: 15 },
      { header: "Уровень риска", key: "risk", width: 16 },
    ];

    priceAnomalies.forEach((a) => {
      sheet1.addRow({
        code: a.product.code || a.product.id,
        name: a.product.name,
        unit: a.product.unit || "шт.",
        sup2: a.prices.supplier2 > 0 ? a.prices.supplier2 : "-",
        sup3: a.prices.supplier3 > 0 ? a.prices.supplier3 : "-",
        sup4: a.prices.supplier4 > 0 ? a.prices.supplier4 : "-",
        min: a.minPrice,
        max: a.maxPrice,
        spread: a.spreadAmount,
        spreadPct: `${a.spreadPercent}%`,
        risk: a.severity === "critical" ? "Критический (>50%)" : a.severity === "warning" ? "Высокий (>25%)" : "Умеренный (>15%)",
      });
    });

    // 2. Spheres & Demands Sheet
    const sheet2 = wb.addWorksheet("Продажи по Сферам");
    sheet2.columns = [
      { header: "Сфера деятельности", key: "sphere", width: 28 },
      { header: "Кол-во позиций в КП", key: "count", width: 20 },
      { header: "Кол-во штук", key: "itemsCount", width: 16 },
      { header: "Общая сумма (с.)", key: "sum", width: 20 },
    ];
    sphereAndProductStats.spheresList.forEach((s) => {
      sheet2.addRow({
        sphere: s.name,
        count: s.count,
        itemsCount: s.itemsCount,
        sum: s.sum,
      });
    });

    // 3. Facilitators Leaderboard Sheet
    const sheet3 = wb.addWorksheet("Фасилитаторы");
    sheet3.columns = [
      { header: "Имя Фасилитатора", key: "name", width: 28 },
      { header: "Создано заказов (КП)", key: "count", width: 20 },
      { header: "Общая сумма заказов (с.)", key: "total", width: 25 },
      { header: "Средний чек (с.)", key: "avg", width: 16 },
      { header: "Основной регион", key: "reg", width: 20 },
      { header: "Основная сфера", key: "sph", width: 20 },
    ];
    facilitatorStats.forEach((f) => {
      sheet3.addRow({
        name: f.name,
        count: f.quotesCount,
        total: f.totalSum,
        avg: f.avgOrder,
        reg: f.topRegion,
        sph: f.topSphere,
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Analytics_Report_${Date.now()}.xlsx`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-md transition-all print:hidden">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Top Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600/90 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-white">
                  Аналитика и Аномалии цен
                </h2>
                <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Эксклюзивный инструмент
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Выявление критических разниц цен поставщиков, закупки по сферам, анализ регионов и активных фасилитаторов
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportAnalyticsExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2 shrink-0"
              title="Выгрузить сводный отчет в Excel"
            >
              <Download className="w-4 h-4" />
              <span>Экспорт в Excel</span>
            </button>
            <button
              onClick={loadQuotesData}
              disabled={loadingHistory}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors shrink-0"
              title="Обновить данные"
            >
              <RefreshCw className={`w-4 h-4 ${loadingHistory ? "animate-spin text-indigo-400" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Controls & KPI Summary Bar */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 space-y-3 shrink-0">
          {/* KPI Cards Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="w-9 h-9 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center shrink-0 border border-rose-100">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Аномалии цен</div>
                <div className="text-lg font-black text-rose-600 leading-tight">
                  {priceAnomalies.length} <span className="text-xs font-normal text-slate-500">товаров</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0 border border-indigo-100">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Оформили заказов</div>
                <div className="text-lg font-black text-slate-800 leading-tight">
                  {filteredQuotes.length} <span className="text-xs font-normal text-slate-500">КП</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0 border border-emerald-100">
                <BarChart2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Общий объем закупок</div>
                <div className="text-lg font-black text-emerald-700 leading-tight">
                  {sphereAndProductStats.totalSalesVolume.toLocaleString("ru-RU")} <span className="text-xs font-bold text-emerald-800">с.</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center shrink-0 border border-amber-100">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Фасилитаторов</div>
                <div className="text-lg font-black text-slate-800 leading-tight">
                  {facilitatorStats.length} <span className="text-xs font-normal text-slate-500">чел.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Поиск по названию или артикулу товара..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  Очистить
                </button>
              )}
            </div>

            {/* Region Filter */}
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={selectedRegionFilter}
                onChange={(e) => setSelectedRegionFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">Все регионы</option>
                {(globalDict.regions || []).map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Sphere Filter */}
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={selectedSphereFilter}
                onChange={(e) => setSelectedSphereFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none max-w-[160px] truncate"
              >
                <option value="">Все сферы</option>
                {(globalDict.spheres || []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Date Period Filter */}
            <div className="flex items-center bg-white border border-slate-300 rounded-xl p-0.5 text-xs font-semibold shrink-0">
              <button
                onClick={() => setPeriodFilter("all")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${periodFilter === "all" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"}`}
              >
                Всё время
              </button>
              <button
                onClick={() => setPeriodFilter("30days")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${periodFilter === "30days" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"}`}
              >
                30 дней
              </button>
              <button
                onClick={() => setPeriodFilter("7days")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${periodFilter === "7days" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"}`}
              >
                7 дней
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-2 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab("anomalies")}
            className={`flex items-center gap-2 py-3.5 px-4 font-bold text-xs border-b-2 transition-all whitespace-nowrap ${
              activeTab === "anomalies"
                ? "border-rose-600 text-rose-600 bg-rose-50/50"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Аномалии цен поставщиков ({priceAnomalies.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("sales")}
            className={`flex items-center gap-2 py-3.5 px-4 font-bold text-xs border-b-2 transition-all whitespace-nowrap ${
              activeTab === "sales"
                ? "border-indigo-600 text-indigo-600 bg-indigo-50/50"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            <span>Закупки по Сферам и Товарам</span>
          </button>

          <button
            onClick={() => setActiveTab("regions")}
            className={`flex items-center gap-2 py-3.5 px-4 font-bold text-xs border-b-2 transition-all whitespace-nowrap ${
              activeTab === "regions"
                ? "border-indigo-600 text-indigo-600 bg-indigo-50/50"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Регионы и Поставщики</span>
          </button>

          <button
            onClick={() => setActiveTab("facilitators")}
            className={`flex items-center gap-2 py-3.5 px-4 font-bold text-xs border-b-2 transition-all whitespace-nowrap ${
              activeTab === "facilitators"
                ? "border-indigo-600 text-indigo-600 bg-indigo-50/50"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Фасилитаторы ({facilitatorStats.length})</span>
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/60">
          {/* TAB 1: PRICE ANOMALY DETECTION */}
          {activeTab === "anomalies" && (
            <div className="space-y-4">
              {/* Threshold control bar */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <SlidersHorizontal className="w-4 h-4 text-slate-500" />
                  <span>Порог фильтрации аномалии ценового разброса:</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold">
                  {[10, 15, 25, 50].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => setMinAnomalyPercent(pct)}
                      className={`px-3 py-1.5 rounded-lg border transition-all ${
                        minAnomalyPercent === pct
                          ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      &gt; {pct}% разницы
                    </button>
                  ))}
                </div>
              </div>

              {priceAnomalies.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                  <h3 className="text-base font-bold text-slate-800">
                    Аномалий в ценах не выявлено
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Цены поставщиков соответствуют рыночным параметрам и не превышают выбранный порог разброса ({minAnomalyPercent}%).
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {priceAnomalies.map((a) => {
                    const isCritical = a.severity === "critical";
                    const isWarning = a.severity === "warning";

                    return (
                      <div
                        key={a.product.id}
                        className={`bg-white rounded-2xl p-5 border shadow-sm transition-all relative overflow-hidden flex flex-col justify-between ${
                          isCritical
                            ? "border-rose-300 ring-1 ring-rose-200"
                            : isWarning
                            ? "border-amber-300"
                            : "border-slate-200"
                        }`}
                      >
                        {/* Status banner */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                                isCritical
                                  ? "bg-rose-100 text-rose-800 border-rose-200"
                                  : isWarning
                                  ? "bg-amber-100 text-amber-800 border-amber-200"
                                  : "bg-indigo-100 text-indigo-800 border-indigo-200"
                              }`}
                            >
                              {isCritical ? "🔴 Критический разброс" : isWarning ? "🟡 Высокий разброс" : "🔵 Заметная разница"}
                            </span>
                            {a.product.code && (
                              <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                #{a.product.code}
                              </span>
                            )}
                          </div>

                          <div className="text-right">
                            <div className="text-xs font-bold text-rose-600 flex items-center justify-end gap-1">
                              <ArrowUpRight className="w-4 h-4" />
                              <span>+{a.spreadPercent}%</span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-medium">
                              Разница: {a.spreadAmount.toLocaleString("ru-RU")} с.
                            </div>
                          </div>
                        </div>

                        {/* Product Title & Info */}
                        <div
                          onClick={() => onViewProduct?.(a.product)}
                          className="flex gap-3 mb-4 cursor-pointer group"
                          title="Нажмите, чтобы открыть карточку товара"
                        >
                          {a.product.imageBase64 ? (
                            <img
                              src={a.product.imageBase64}
                              alt=""
                              className="w-14 h-14 object-cover rounded-xl border border-slate-200 shrink-0 bg-slate-50 group-hover:border-indigo-400 group-hover:shadow-sm transition-all"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0 group-hover:border-indigo-400 transition-all">
                              <Package className="w-6 h-6 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-sm text-slate-900 leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
                              {a.product.name}
                            </h4>
                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                              <span>Ед: <strong>{a.product.unit || "шт."}</strong></span>
                              {a.product.spheres && a.product.spheres.length > 0 && (
                                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-semibold">
                                  {a.product.spheres.join(", ")}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Price Comparison Cards Grid */}
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 grid grid-cols-3 gap-2 text-center text-xs">
                          {/* Supplier 2 */}
                          <div
                            className={`p-2 rounded-lg border ${
                              a.cheapestSupplier === "supplier2"
                                ? "bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300"
                                : a.expensivestSupplier === "supplier2"
                                ? "bg-rose-50 border-rose-300"
                                : "bg-white border-slate-200"
                            }`}
                          >
                            <div className="text-[10px] font-bold text-slate-500 truncate" title={getSupplierName("supplier2")}>
                              {getSupplierName("supplier2")}
                            </div>
                            <div className="font-extrabold text-sm text-slate-900 mt-0.5">
                              {a.prices.supplier2 > 0 ? `${a.prices.supplier2} с.` : "—"}
                            </div>
                            {a.cheapestSupplier === "supplier2" && (
                              <div className="text-[9px] font-bold text-emerald-700 bg-emerald-100 rounded mt-1 py-0.5">
                                Выгодно ★
                              </div>
                            )}
                            {a.expensivestSupplier === "supplier2" && (
                              <div className="text-[9px] font-bold text-rose-700 bg-rose-100 rounded mt-1 py-0.5">
                                Максимум
                              </div>
                            )}
                          </div>

                          {/* Supplier 3 */}
                          <div
                            className={`p-2 rounded-lg border ${
                              a.cheapestSupplier === "supplier3"
                                ? "bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300"
                                : a.expensivestSupplier === "supplier3"
                                ? "bg-rose-50 border-rose-300"
                                : "bg-white border-slate-200"
                            }`}
                          >
                            <div className="text-[10px] font-bold text-slate-500 truncate" title={getSupplierName("supplier3")}>
                              {getSupplierName("supplier3")}
                            </div>
                            <div className="font-extrabold text-sm text-slate-900 mt-0.5">
                              {a.prices.supplier3 > 0 ? `${a.prices.supplier3} с.` : "—"}
                            </div>
                            {a.cheapestSupplier === "supplier3" && (
                              <div className="text-[9px] font-bold text-emerald-700 bg-emerald-100 rounded mt-1 py-0.5">
                                Выгодно ★
                              </div>
                            )}
                            {a.expensivestSupplier === "supplier3" && (
                              <div className="text-[9px] font-bold text-rose-700 bg-rose-100 rounded mt-1 py-0.5">
                                Максимум
                              </div>
                            )}
                          </div>

                          {/* Supplier 4 */}
                          <div
                            className={`p-2 rounded-lg border ${
                              a.cheapestSupplier === "supplier4"
                                ? "bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300"
                                : a.expensivestSupplier === "supplier4"
                                ? "bg-rose-50 border-rose-300"
                                : "bg-white border-slate-200"
                            }`}
                          >
                            <div className="text-[10px] font-bold text-slate-500 truncate" title={getSupplierName("supplier4")}>
                              {getSupplierName("supplier4")}
                            </div>
                            <div className="font-extrabold text-sm text-slate-900 mt-0.5">
                              {a.prices.supplier4 > 0 ? `${a.prices.supplier4} с.` : "—"}
                            </div>
                            {a.cheapestSupplier === "supplier4" && (
                              <div className="text-[9px] font-bold text-emerald-700 bg-emerald-100 rounded mt-1 py-0.5">
                                Выгодно ★
                              </div>
                            )}
                            {a.expensivestSupplier === "supplier4" && (
                              <div className="text-[9px] font-bold text-rose-700 bg-rose-100 rounded mt-1 py-0.5">
                                Максимум
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Card Action Buttons Bar */}
                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                          <button
                            onClick={() => onViewProduct?.(a.product)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5"
                            title="Открыть подробную карточку товара"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-600" />
                            <span>Карточка</span>
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenQuickEdit(a.product)}
                              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center gap-1.5"
                              title="Быстро поправить цены поставщиков в аналитике"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                              <span>Поправить цены</span>
                            </button>
                            {onEditProduct && (
                              <button
                                onClick={() => onEditProduct(a.product)}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-lg transition-colors flex items-center gap-1"
                                title="Редактировать всё (открыть полную форму)"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DEMAND BY PRODUCT & SPHERE */}
          {activeTab === "sales" && (
            <div className="space-y-6">
              {/* Spheres Summary */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  Объем закупок по Сферам применения (Категориям)
                </h3>

                {sphereAndProductStats.spheresList.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">
                    Данные по заказам отсутствует за выбранный период
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sphereAndProductStats.spheresList.map((s, idx) => {
                      const totalVol = sphereAndProductStats.totalSalesVolume || 1;
                      const percent = Math.round((s.sum / totalVol) * 100);

                      return (
                        <div key={s.name} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-slate-800 font-bold">
                              #{idx + 1} {s.name}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-500">{s.itemsCount} шт. ({s.count} позиций)</span>
                              <span className="text-indigo-900 font-extrabold">{s.sum.toLocaleString("ru-RU")} с.</span>
                              <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded text-[10px] font-bold">
                                {percent}%
                              </span>
                            </div>
                          </div>
                          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-500 to-indigo-700 rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(4, percent)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Top Products Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-600" />
                    Самые приобретаемые товары (Рейтинг)
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    Всего уникальных товаров в заказах: <strong>{sphereAndProductStats.productsList.length}</strong>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-3 w-12 text-center">#</th>
                        <th className="p-3">Артикул / Код</th>
                        <th className="p-3">Наименование товара</th>
                        <th className="p-3 text-center">Приобретено (шт)</th>
                        <th className="p-3 text-right">Сумма заказов</th>
                        <th className="p-3 text-right">Ср. цена</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sphereAndProductStats.productsList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400">
                            Товары в историях заказов не найдены
                          </td>
                        </tr>
                      ) : (
                        sphereAndProductStats.productsList.map((p, idx) => {
                          const avgPrice = p.totalQty > 0 ? Math.round(p.totalSum / p.totalQty) : 0;

                          return (
                            <tr key={p.product.id || idx} className="hover:bg-indigo-50/40 transition-colors">
                              <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                              <td className="p-3 font-mono font-bold text-slate-600">{p.product.code || "—"}</td>
                              <td className="p-3 font-bold text-slate-900">{p.product.name}</td>
                              <td className="p-3 text-center">
                                <span className="bg-indigo-100 text-indigo-800 font-bold px-2.5 py-1 rounded-full text-[11px]">
                                  {p.totalQty} {p.product.unit || "шт."}
                                </span>
                              </td>
                              <td className="p-3 text-right font-extrabold text-slate-900">
                                {p.totalSum.toLocaleString("ru-RU")} с.
                              </td>
                              <td className="p-3 text-right text-slate-600 font-medium">
                                {avgPrice.toLocaleString("ru-RU")} с.
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: REGIONS & SUPPLIER MATRIX */}
          {activeTab === "regions" && (
            <div className="space-y-6">
              {/* Supplier Total Volume Header Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["supplier1", "supplier2", "supplier3", "supplier4"] as const).map((sup) => {
                  const data = regionSupplierStats.supplierTotals[sup];
                  return (
                    <div key={sup} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                      <div className="text-xs font-bold text-slate-500 truncate" title={getSupplierName(sup)}>
                        {getSupplierName(sup)}
                      </div>
                      <div className="text-lg font-black text-slate-900 mt-1">
                        {data.sum.toLocaleString("ru-RU")} <span className="text-xs font-bold text-slate-500">с.</span>
                      </div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">
                        Объем: {data.qty} шт.
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Regional Matrix Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-indigo-600" />
                    Распределение заказов по Регионам и Поставщикам
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-3">Регион</th>
                        <th className="p-3 text-center">Всего КП</th>
                        <th className="p-3 text-right">Общая сумма</th>
                        <th className="p-3 text-center">{getSupplierName("supplier2")}</th>
                        <th className="p-3 text-center">{getSupplierName("supplier3")}</th>
                        <th className="p-3 text-center">{getSupplierName("supplier4")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {regionSupplierStats.regionsList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400">
                            Данные по регионам отсутствуют
                          </td>
                        </tr>
                      ) : (
                        regionSupplierStats.regionsList.map((r) => (
                          <tr key={r.region} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span>{r.region}</span>
                            </td>
                            <td className="p-3 text-center font-bold text-slate-700">{r.totalOrders}</td>
                            <td className="p-3 text-right font-extrabold text-indigo-900">
                              {r.totalSum.toLocaleString("ru-RU")} с.
                            </td>
                            <td className="p-3 text-center">
                              <div className="font-bold text-slate-800">
                                {r.suppliers.supplier2.sum.toLocaleString("ru-RU")} с.
                              </div>
                              <div className="text-[10px] text-slate-400 font-medium">
                                {r.suppliers.supplier2.qty} шт.
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <div className="font-bold text-slate-800">
                                {r.suppliers.supplier3.sum.toLocaleString("ru-RU")} с.
                              </div>
                              <div className="text-[10px] text-slate-400 font-medium">
                                {r.suppliers.supplier3.qty} шт.
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <div className="font-bold text-slate-800">
                                {r.suppliers.supplier4.sum.toLocaleString("ru-RU")} с.
                              </div>
                              <div className="text-[10px] text-slate-400 font-medium">
                                {r.suppliers.supplier4.qty} шт.
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FACILITATOR PERFORMANCE */}
          {activeTab === "facilitators" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {facilitatorStats.length === 0 ? (
                  <div className="col-span-2 bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-400 text-xs">
                    История активности фасилитаторов пока пуста
                  </div>
                ) : (
                  facilitatorStats.map((f, idx) => (
                    <div
                      key={f.name}
                      className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-indigo-300 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 bg-indigo-100 text-indigo-700 font-black text-sm rounded-xl flex items-center justify-center shrink-0">
                              #{idx + 1}
                            </div>
                            <div>
                              <h4 className="font-bold text-sm text-slate-900">{f.name}</h4>
                              <div className="text-[10px] text-slate-400 font-medium">
                                Последний заказ: {f.lastOrderDate}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold px-2.5 py-1 rounded-lg">
                              {f.quotesCount} КП
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 mb-3 text-xs">
                          <div>
                            <div className="text-[10px] text-slate-400 uppercase font-semibold">Общая сумма</div>
                            <div className="font-extrabold text-sm text-indigo-950 mt-0.5">
                              {f.totalSum.toLocaleString("ru-RU")} с.
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400 uppercase font-semibold">Средний чек</div>
                            <div className="font-extrabold text-sm text-slate-800 mt-0.5">
                              {f.avgOrder.toLocaleString("ru-RU")} с.
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>Регион: <strong>{f.topRegion}</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-slate-400" />
                          <span>Сфера: <strong>{f.topSphere}</strong></span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* QUICK PRICE EDIT MODAL OVERLAY */}
      {quickEditProduct && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 px-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-rose-600 rounded-xl flex items-center justify-center text-white shrink-0">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white leading-tight">
                    Поправить цены товара
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Быстрая корректировка цен поставщиков в базе
                  </p>
                </div>
              </div>
              <button
                onClick={() => setQuickEditProduct(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Summary */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
              {quickEditProduct.imageBase64 ? (
                <img
                  src={quickEditProduct.imageBase64}
                  alt=""
                  className="w-12 h-12 object-cover rounded-lg border border-slate-200 shrink-0 bg-white"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg border border-slate-200 bg-white flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-slate-400" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 line-clamp-1">
                    {quickEditProduct.name}
                  </span>
                  {quickEditProduct.code && (
                    <span className="text-[10px] font-mono font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                      #{quickEditProduct.code}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                  <span>Ед: <strong>{quickEditProduct.unit || "шт."}</strong></span>
                  {quickEditProduct.spheres && quickEditProduct.spheres.length > 0 && (
                    <span className="truncate max-w-[200px]">
                      Сферы: {quickEditProduct.spheres.join(", ")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Inputs & Live Spread Calculation */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Live difference indicator */}
              {(() => {
                const nums = [
                  parseFloat(quickPrices.supplier2) || 0,
                  parseFloat(quickPrices.supplier3) || 0,
                  parseFloat(quickPrices.supplier4) || 0,
                ].filter((n) => n > 0);

                if (nums.length >= 2) {
                  const minP = Math.min(...nums);
                  const maxP = Math.max(...nums);
                  const diff = maxP - minP;
                  const pct = Math.round((diff / minP) * 100);
                  const isHigh = pct > 25;

                  return (
                    <div
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                        isHigh
                          ? "bg-rose-50 border-rose-200 text-rose-900"
                          : "bg-emerald-50 border-emerald-200 text-emerald-900"
                      }`}
                    >
                      <div>
                        <div className="font-bold">
                          {isHigh ? "Высокий ценовой разброс" : "Допустимый разброс"} (+{pct}%)
                        </div>
                        <div className="text-[11px] opacity-80 mt-0.5">
                          Мин: {minP} с. | Макс: {maxP} с. (Разница: {diff} с.)
                        </div>
                      </div>
                      <span className="font-black text-sm">
                        +{pct}%
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Base catalog price */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <label className="block font-bold text-slate-700 mb-1">
                  Базовая цена (Главный каталог) (сомони):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={quickPrices.price}
                  onChange={(e) =>
                    setQuickPrices((prev) => ({ ...prev, price: e.target.value }))
                  }
                  placeholder="0.00"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Supplier Prices Inputs */}
              <div className="space-y-3">
                <span className="block font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                  Цены Поставщиков:
                </span>

                {/* Supplier 2 */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span>{getSupplierName("supplier2")}</span>
                    <span className="text-[10px] text-slate-400 font-normal">Поставщик 2</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={quickPrices.supplier2}
                    onChange={(e) =>
                      setQuickPrices((prev) => ({ ...prev, supplier2: e.target.value }))
                    }
                    placeholder="0.00"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                {/* Supplier 3 */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span>{getSupplierName("supplier3")}</span>
                    <span className="text-[10px] text-slate-400 font-normal">Поставщик 3</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={quickPrices.supplier3}
                    onChange={(e) =>
                      setQuickPrices((prev) => ({ ...prev, supplier3: e.target.value }))
                    }
                    placeholder="0.00"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                {/* Supplier 4 */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span>{getSupplierName("supplier4")}</span>
                    <span className="text-[10px] text-slate-400 font-normal">Поставщик 4</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={quickPrices.supplier4}
                    onChange={(e) =>
                      setQuickPrices((prev) => ({ ...prev, supplier4: e.target.value }))
                    }
                    placeholder="0.00"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              {onEditProduct ? (
                <button
                  onClick={() => {
                    const prod = quickEditProduct;
                    setQuickEditProduct(null);
                    onEditProduct(prod);
                  }}
                  className="px-3 py-2 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors font-semibold text-xs flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Полная форма</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQuickEditProduct(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl transition-colors font-medium text-xs"
                  disabled={isSavingQuickPrice}
                >
                  Отмена
                </button>
                <button
                  onClick={handleSaveQuickPrices}
                  disabled={isSavingQuickPrice}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2"
                >
                  {isSavingQuickPrice ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Сохранение...
                    </>
                  ) : quickSaveSuccess ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      Сохранено!
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Сохранить цены
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
