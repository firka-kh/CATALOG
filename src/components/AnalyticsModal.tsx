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
  Flame,
  Compass,
  Table as TableIcon,
  LayoutGrid,
  Info,
  ChevronRight,
  UserCheck,
  PieChart,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Medal,
  Maximize2,
  ArrowLeft,
  Copy,
} from "lucide-react";
import { Product } from "../types";
import { formatSupplierCode } from "../lib/supplierUtils";
import { QuoteRecord, fetchQuotesHistory } from "../lib/quotesHistory";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import Workbook from "exceljs";
import { saveAs } from "file-saver";
import { DISTRICTS_BY_REGION } from "../App";
import { PWAInstallButton } from "./PWAInstallButton";

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  globalDict: {
    regions?: string[];
    districtsByRegion?: Record<string, string[]>;
    spheres?: string[];
    suppliers?: string[];
    pricingRules?: Record<string, Record<string, number>>;
    supplierPhones?: Record<string, string>;
    supplierLegalNames?: Record<string, string>;
    supplierAssignedCodes?: Record<string, string>;
    [key: string]: any;
  };
  onEditProduct?: (product: Product) => void;
  onViewProduct?: (product: Product) => void;
  isStandalone?: boolean;
  onToggleStandalone?: () => void;
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
  isOpen,
  onClose,
  products,
  globalDict,
  onEditProduct,
  onViewProduct,
  isStandalone = false,
  onToggleStandalone,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "heatmap" | "anomalies" | "sales" | "regions" | "facilitators"
  >("heatmap");

  const handleCopyMonitoringLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?view=monitoring`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    }
  };

  // District Heatmap Controls & Drill-down State
  const [heatmapMetric, setHeatmapMetric] = useState<"sum" | "quotes" | "beneficiaries">("sum");
  const [heatmapView, setHeatmapView] = useState<"cards" | "table">("cards");
  const [heatmapRegionFilter, setHeatmapRegionFilter] = useState<string>("");
  const [heatmapSearchDistrict, setHeatmapSearchDistrict] = useState<string>("");
  const [tableSortField, setTableSortField] = useState<
    "rank" | "district" | "region" | "intensity" | "totalSum" | "share" | "quotesCount" | "beneficiariesCount" | "itemsCount" | "topSphere"
  >("totalSum");
  const [tableSortAsc, setTableSortAsc] = useState<boolean>(false);
  const [selectedDistrictDetail, setSelectedDistrictDetail] = useState<{
    region: string;
    district: string;
    totalSum: number;
    quotesCount: number;
    beneficiariesCount: number;
    itemsCount: number;
    topSphere: string;
    topProducts: { name: string; qty: number; sum: number }[];
    specialists: string[];
    beneficiaries: string[];
    quotes: QuoteRecord[];
    intensity: number;
    heatLevel: "high" | "warm" | "moderate" | "low" | "zero";
  } | null>(null);

  // Dynamic available supplier keys
  const availableSupplierKeys = useMemo(() => {
    const keySet = new Set<string>();
    if (globalDict.supplierAssignedCodes) {
      Object.keys(globalDict.supplierAssignedCodes).forEach((k) => keySet.add(k));
    }
    if (globalDict.supplierLegalNames) {
      Object.keys(globalDict.supplierLegalNames).forEach((k) => keySet.add(k));
    }
    if (globalDict.suppliers && Array.isArray(globalDict.suppliers)) {
      globalDict.suppliers.forEach((_, idx) => keySet.add(`supplier${idx + 2}`));
    }
    if (keySet.size === 0) {
      return ["supplier2", "supplier3", "supplier4"];
    }
    return Array.from(keySet).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });
  }, [globalDict.supplierAssignedCodes, globalDict.supplierLegalNames, globalDict.suppliers]);

  // Quick Price Edit State
  const [quickEditProduct, setQuickEditProduct] = useState<Product | null>(null);
  const [quickPrices, setQuickPrices] = useState<Record<string, string>>({});
  const [isSavingQuickPrice, setIsSavingQuickPrice] = useState(false);
  const [quickSaveSuccess, setQuickSaveSuccess] = useState(false);

  const handleOpenQuickEdit = (product: Product) => {
    setQuickEditProduct(product);
    setQuickSaveSuccess(false);

    const baseP = product.price !== undefined && product.price !== null ? String(product.price) : "";
    const newPrices: Record<string, string> = {
      price: baseP,
    };

    const activeReg = selectedRegionFilter || "Душанбе";
    availableSupplierKeys.forEach((supKey) => {
      let pVal = "";
      if (product.prices && product.prices[supKey] && product.prices[supKey][activeReg] !== undefined) {
        pVal = String(product.prices[supKey][activeReg]);
      } else {
        const mapId =
          supKey === "supplier2" ? "priceSupplier2" :
          supKey === "supplier3" ? "priceSupplier3" :
          supKey === "supplier4" ? "priceSupplier4" : undefined;
        if (mapId && product[mapId as keyof Product]) {
          pVal = String(product[mapId as keyof Product]);
        }
      }
      newPrices[supKey] = pVal;
    });

    setQuickPrices(newPrices);
  };

  const handleSaveQuickPrices = async () => {
    if (!quickEditProduct) return;
    setIsSavingQuickPrice(true);
    try {
      const baseVal = quickPrices.price !== "" && quickPrices.price !== undefined ? parseFloat(quickPrices.price) : 0;
      const updatedFields: any = {
        price: baseVal,
      };

      const existingPrices: Record<string, Record<string, number>> = quickEditProduct.prices ? { ...quickEditProduct.prices } : {};
      const activeReg = selectedRegionFilter || "Душанбе";

      availableSupplierKeys.forEach((supKey) => {
        const valStr = quickPrices[supKey];
        if (valStr !== undefined && valStr.trim() !== "") {
          const valNum = parseFloat(valStr) || 0;
          if (supKey === "supplier2") updatedFields.priceSupplier2 = valNum;
          if (supKey === "supplier3") updatedFields.priceSupplier3 = valNum;
          if (supKey === "supplier4") updatedFields.priceSupplier4 = valNum;

          if (!existingPrices[supKey]) existingPrices[supKey] = {};
          existingPrices[supKey] = {
            ...existingPrices[supKey],
            [activeReg]: valNum,
          };
        }
      });

      updatedFields.prices = existingPrices;

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

  // Supplier Names Helper (System codes SPMEI-xxx)
  const getSupplierName = (key: string) => {
    if (key === "supplier1") return "Логистика (Пост. 0)";
    const idx = parseInt(key.replace(/\D/g, ""), 10) - 2;
    const assignedCode = globalDict.supplierAssignedCodes?.[key];
    let listEntry: string | undefined = undefined;
    if (idx >= 0 && globalDict.suppliers && globalDict.suppliers[idx]) {
      listEntry = globalDict.suppliers[idx];
    }
    return formatSupplierCode(key, assignedCode || listEntry, idx >= 0 ? idx : undefined);
  };

  // Helper to calculate price of a product for a supplier in a region
  const getProductPrice = (
    p: Product,
    supplier: string,
    region?: string
  ): number => {
    if (!p) return 0;
    if (region && p.prices && p.prices[supplier] && p.prices[supplier][region] !== undefined) {
      const val = parseFloat(String(p.prices[supplier][region]));
      if (val > 0) return val;
    }
    const mapId =
      supplier === "supplier2"
        ? "priceSupplier2"
        : supplier === "supplier3"
          ? "priceSupplier3"
          : supplier === "supplier4"
            ? "priceSupplier4"
            : undefined;
    if (mapId) {
      const legacyPrice = parseFloat(String(p[mapId as keyof Product])) || 0;
      if (legacyPrice > 0) return legacyPrice;
    }

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
      prices: Record<string, number>;
      minPrice: number;
      maxPrice: number;
      cheapestSupplier: string;
      expensivestSupplier: string;
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

      const validPrices: Array<{ sup: string; price: number }> = [];
      const pricesMap: Record<string, number> = {};

      availableSupplierKeys.forEach((supKey) => {
        const pr = getProductPrice(p, supKey, activeRegion);
        pricesMap[supKey] = pr;
        if (pr > 0) {
          validPrices.push({ sup: supKey, price: pr });
        }
      });

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
              prices: pricesMap,
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
  }, [products, selectedRegionFilter, selectedSphereFilter, minAnomalyPercent, searchQuery, availableSupplierKeys]);

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

    const productsList = (Array.from(productMap.values()) as { product: Product; totalQty: number; totalSum: number; ordersCount: number }[])
      .filter((p) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        return p.product.name.toLowerCase().includes(q) || (p.product.code && p.product.code.toLowerCase().includes(q));
      })
      .sort((a, b) => b.totalQty - a.totalQty);

    const totalSalesVolume = filteredQuotes.reduce((acc, q) => acc + (q.totalAmount || 0), 0);
    const totalItemsPurchased = (Array.from(productMap.values()) as { product: Product; totalQty: number; totalSum: number; ordersCount: number }[]).reduce((acc, p) => acc + p.totalQty, 0);

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
      suppliers: Record<string, { qty: number; sum: number }>;
    }>();

    const supplierTotals: Record<string, { qty: number; sum: number }> = {};
    availableSupplierKeys.forEach((s) => {
      supplierTotals[s] = { qty: 0, sum: 0 };
    });

    filteredQuotes.forEach((q) => {
      const reg = q.selectedRegion || "Душанбе";
      if (!regionMap.has(reg)) {
        const initialSups: Record<string, { qty: number; sum: number }> = {};
        availableSupplierKeys.forEach((s) => {
          initialSups[s] = { qty: 0, sum: 0 };
        });
        regionMap.set(reg, {
          totalOrders: 0,
          totalSum: 0,
          suppliers: initialSups,
        });
      }

      const regData = regionMap.get(reg)!;
      regData.totalOrders += 1;
      regData.totalSum += q.totalAmount || 0;

      q.items.forEach((item) => {
        const sup = item.selectedSupplier || availableSupplierKeys[0] || "supplier2";
        const sum = (item.selectedPrice || 0) * (item.quantity || 1);
        const qty = item.quantity || 1;

        if (!regData.suppliers[sup]) regData.suppliers[sup] = { qty: 0, sum: 0 };
        if (!supplierTotals[sup]) supplierTotals[sup] = { qty: 0, sum: 0 };

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
  }, [filteredQuotes, availableSupplierKeys]);

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

    return (Array.from(facMap.values()) as {
      name: string;
      quotesCount: number;
      totalSum: number;
      itemsCount: number;
      regionsCount: Record<string, number>;
      spheresCount: Record<string, number>;
      lastOrderDate: string;
    }[])
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

  // 5. DISTRICT HEATMAP & GEOGRAPHY ENGINE
  const districtHeatmapStats = useMemo(() => {
    const allDistrictsMap = (globalDict.districtsByRegion && Object.keys(globalDict.districtsByRegion).length > 0)
      ? globalDict.districtsByRegion
      : DISTRICTS_BY_REGION;

    const regions = (globalDict.regions && globalDict.regions.length > 0)
      ? globalDict.regions
      : Object.keys(allDistrictsMap);

    interface DistrictAccumulator {
      region: string;
      district: string;
      totalSum: number;
      quotesCount: number;
      beneficiariesSet: Set<string>;
      itemsCount: number;
      spheresMap: Map<string, number>;
      productsMap: Map<string, { name: string; qty: number; sum: number }>;
      specialistsSet: Set<string>;
      quotes: QuoteRecord[];
    }

    const map = new Map<string, DistrictAccumulator>();

    // Pre-populate all known districts from official dictionary so we identify 0-coverage "white spots"
    regions.forEach((reg) => {
      const distList = allDistrictsMap[reg] || [];
      distList.forEach((dist) => {
        const key = `${reg}:::${dist}`;
        map.set(key, {
          region: reg,
          district: dist,
          totalSum: 0,
          quotesCount: 0,
          beneficiariesSet: new Set(),
          itemsCount: 0,
          spheresMap: new Map(),
          productsMap: new Map(),
          specialistsSet: new Set(),
          quotes: [],
        });
      });
    });

    // Populate with actual quotes from filteredQuotes
    filteredQuotes.forEach((q) => {
      const reg = q.selectedRegion || "Душанбе";
      const dist = (q.selectedDistrict || "").trim();
      const effectiveKey = dist ? `${reg}:::${dist}` : `${reg}:::Не указан`;

      if (!map.has(effectiveKey)) {
        map.set(effectiveKey, {
          region: reg,
          district: dist || "Район не указан",
          totalSum: 0,
          quotesCount: 0,
          beneficiariesSet: new Set(),
          itemsCount: 0,
          spheresMap: new Map(),
          productsMap: new Map(),
          specialistsSet: new Set(),
          quotes: [],
        });
      }

      const record = map.get(effectiveKey)!;
      record.totalSum += q.totalAmount || 0;
      record.quotesCount += 1;
      if (q.clientName) record.beneficiariesSet.add(q.clientName.trim());
      if (q.specialistName) record.specialistsSet.add(q.specialistName.trim());
      record.quotes.push(q);

      const sph = q.selectedSphere || "Общие";
      record.spheresMap.set(sph, (record.spheresMap.get(sph) || 0) + (q.totalAmount || 0));

      q.items.forEach((item) => {
        const qty = item.quantity || 1;
        const sum = (item.selectedPrice || 0) * qty;
        record.itemsCount += qty;

        const pName = item.product.name;
        if (!record.productsMap.has(pName)) {
          record.productsMap.set(pName, { name: pName, qty: 0, sum: 0 });
        }
        const pAcc = record.productsMap.get(pName)!;
        pAcc.qty += qty;
        pAcc.sum += sum;
      });
    });

    // Convert to rich district list
    const allDistrictList = (Array.from(map.values()) as DistrictAccumulator[]).map((d) => {
      let topSphere = "—";
      let maxSphereSum = -1;
      d.spheresMap.forEach((sSum, sName) => {
        if (sSum > maxSphereSum) {
          maxSphereSum = sSum;
          topSphere = sName;
        }
      });

      const topProducts = (Array.from(d.productsMap.values()) as { name: string; qty: number; sum: number }[])
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      return {
        region: d.region,
        district: d.district,
        totalSum: d.totalSum,
        quotesCount: d.quotesCount,
        beneficiariesCount: d.beneficiariesSet.size,
        itemsCount: d.itemsCount,
        topSphere,
        topProducts,
        specialists: Array.from(d.specialistsSet),
        beneficiaries: Array.from(d.beneficiariesSet),
        quotes: d.quotes.sort((a, b) => (b.createdAtTimestamp || 0) - (a.createdAtTimestamp || 0)),
      };
    });

    // Max values for relative intensity
    let maxMetricVal = 0;
    allDistrictList.forEach((d) => {
      const metricVal = heatmapMetric === "sum" ? d.totalSum : heatmapMetric === "quotes" ? d.quotesCount : d.beneficiariesCount;
      if (metricVal > maxMetricVal) maxMetricVal = metricVal;
    });

    const computedDistricts = allDistrictList.map((d) => {
      const val = heatmapMetric === "sum" ? d.totalSum : heatmapMetric === "quotes" ? d.quotesCount : d.beneficiariesCount;
      const intensity = maxMetricVal > 0 ? Math.round((val / maxMetricVal) * 100) : 0;
      let heatLevel: "high" | "warm" | "moderate" | "low" | "zero" = "zero";

      if (val === 0) {
        heatLevel = "zero";
      } else if (intensity >= 70) {
        heatLevel = "high";
      } else if (intensity >= 40) {
        heatLevel = "warm";
      } else if (intensity >= 15) {
        heatLevel = "moderate";
      } else {
        heatLevel = "low";
      }

      return {
        ...d,
        intensity,
        heatLevel,
      };
    });

    const totalDistrictsCount = computedDistricts.length;
    const coveredDistricts = computedDistricts.filter((d) => d.quotesCount > 0);
    const uncoveredDistricts = computedDistricts.filter((d) => d.quotesCount === 0);
    const coveragePercent = totalDistrictsCount > 0 ? Math.round((coveredDistricts.length / totalDistrictsCount) * 100) : 0;

    const totalCountrySum = computedDistricts.reduce((acc, d) => acc + d.totalSum, 0);
    const totalCountryQuotes = computedDistricts.reduce((acc, d) => acc + d.quotesCount, 0);
    const totalCountryBeneficiaries = computedDistricts.reduce((acc, d) => acc + d.beneficiariesCount, 0);

    const districtsWithShare = computedDistricts.map((d) => {
      const shareOfTotalSum = totalCountrySum > 0 ? (d.totalSum / totalCountrySum) * 100 : 0;
      return {
        ...d,
        shareOfTotalSum,
      };
    });

    const sortedBySum = [...coveredDistricts].sort((a, b) => b.totalSum - a.totalSum);
    const topDistrict = sortedBySum[0] || null;

    // Grouping by Region for Heatmap Grid
    const byRegionMap = new Map<string, typeof districtsWithShare>();
    regions.forEach((r) => byRegionMap.set(r, []));

    districtsWithShare.forEach((d) => {
      if (!byRegionMap.has(d.region)) byRegionMap.set(d.region, []);
      byRegionMap.get(d.region)!.push(d);
    });

    byRegionMap.forEach((list) => {
      list.sort((a, b) => {
        const valA = heatmapMetric === "sum" ? a.totalSum : heatmapMetric === "quotes" ? a.quotesCount : a.beneficiariesCount;
        const valB = heatmapMetric === "sum" ? b.totalSum : heatmapMetric === "quotes" ? b.quotesCount : b.beneficiariesCount;
        if (valB !== valA) return valB - valA;
        return a.district.localeCompare(b.district);
      });
    });

    // Region Summaries for Header Tiles
    const regionSummaries = regions.map((region) => {
      const distList = districtsWithShare.filter((d) => d.region === region);
      const regTotalSum = distList.reduce((acc, d) => acc + d.totalSum, 0);
      const regCoveredCount = distList.filter((d) => d.quotesCount > 0).length;
      const regTotalCount = distList.length;
      const regCoveragePercent = regTotalCount > 0 ? Math.round((regCoveredCount / regTotalCount) * 100) : 0;
      const regShareOfTotalSum = totalCountrySum > 0 ? (regTotalSum / totalCountrySum) * 100 : 0;
      const regQuotesCount = distList.reduce((acc, d) => acc + d.quotesCount, 0);
      const regBeneficiariesCount = distList.reduce((acc, d) => acc + d.beneficiariesCount, 0);

      // Top sphere in this region:
      const sphereAmounts: Record<string, number> = {};
      distList.forEach((d) => {
        d.quotes.forEach((q) => {
          const sph = q.selectedSphere || "Общее";
          sphereAmounts[sph] = (sphereAmounts[sph] || 0) + (q.totalAmount || 1);
        });
      });
      const topSphere = Object.entries(sphereAmounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

      return {
        region,
        districts: distList.sort((a, b) => {
          const valA = heatmapMetric === "sum" ? a.totalSum : heatmapMetric === "quotes" ? a.quotesCount : a.beneficiariesCount;
          const valB = heatmapMetric === "sum" ? b.totalSum : heatmapMetric === "quotes" ? b.quotesCount : b.beneficiariesCount;
          if (valB !== valA) return valB - valA;
          return a.district.localeCompare(b.district);
        }),
        totalSum: regTotalSum,
        coveredCount: regCoveredCount,
        totalCount: regTotalCount,
        coveragePercent: regCoveragePercent,
        shareOfTotalSum: regShareOfTotalSum,
        quotesCount: regQuotesCount,
        beneficiariesCount: regBeneficiariesCount,
        topSphere,
      };
    });

    return {
      allDistricts: districtsWithShare,
      coveredDistricts,
      uncoveredDistricts,
      totalDistrictsCount,
      coveragePercent,
      topDistrict,
      byRegionMap,
      regions,
      maxMetricVal,
      totalCountrySum,
      totalCountryQuotes,
      totalCountryBeneficiaries,
      regionSummaries,
    };
  }, [globalDict, filteredQuotes, heatmapMetric]);

  // Sorted districts for Table Rating View
  const sortedDistricts = useMemo(() => {
    const list = districtHeatmapStats.allDistricts.filter((d) => {
      if (heatmapRegionFilter && d.region !== heatmapRegionFilter) return false;
      if (heatmapSearchDistrict.trim()) {
        const q = heatmapSearchDistrict.toLowerCase().trim();
        const matchDistrict = d.district.toLowerCase().includes(q);
        const matchRegion = d.region.toLowerCase().includes(q);
        const matchSphere = d.topSphere.toLowerCase().includes(q);
        if (!matchDistrict && !matchRegion && !matchSphere) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let cmp = 0;
      switch (tableSortField) {
        case "district":
          cmp = a.district.localeCompare(b.district);
          break;
        case "region":
          cmp = a.region.localeCompare(b.region);
          break;
        case "intensity":
          cmp = a.intensity - b.intensity;
          break;
        case "totalSum":
        case "share":
          cmp = a.totalSum - b.totalSum;
          break;
        case "quotesCount":
          cmp = a.quotesCount - b.quotesCount;
          break;
        case "beneficiariesCount":
          cmp = a.beneficiariesCount - b.beneficiariesCount;
          break;
        case "itemsCount":
          cmp = a.itemsCount - b.itemsCount;
          break;
        case "topSphere":
          cmp = a.topSphere.localeCompare(b.topSphere);
          break;
        case "rank":
        default:
          cmp = a.totalSum - b.totalSum;
          break;
      }
      return tableSortAsc ? cmp : -cmp;
    });

    return list;
  }, [districtHeatmapStats.allDistricts, heatmapRegionFilter, heatmapSearchDistrict, tableSortField, tableSortAsc]);

  const handleTableSort = (field: typeof tableSortField) => {
    if (tableSortField === field) {
      setTableSortAsc(!tableSortAsc);
    } else {
      setTableSortField(field);
      setTableSortAsc(field === "district" || field === "region" ? true : false);
    }
  };

  // EXPORT ANALYTICS TO EXCEL REPORT
  const handleExportAnalyticsExcel = async () => {
    const wb = new Workbook.Workbook();
    wb.creator = "B2B Analytics System";
    wb.created = new Date();

    // 1. Anomalies Sheet
    const sheet1 = wb.addWorksheet("Аномалии цен");
    const cols: any[] = [
      { header: "Код", key: "code", width: 12 },
      { header: "Наименование товара", key: "name", width: 35 },
      { header: "Ед.изм.", key: "unit", width: 10 },
    ];
    availableSupplierKeys.forEach((supKey) => {
      cols.push({
        header: getSupplierName(supKey),
        key: `sup_${supKey}`,
        width: 16,
      });
    });
    cols.push(
      { header: "Мин. цена", key: "min", width: 14 },
      { header: "Макс. цена", key: "max", width: 14 },
      { header: "Разница (сомони)", key: "spread", width: 18 },
      { header: "Разница (%)", key: "spreadPct", width: 15 },
      { header: "Уровень риска", key: "risk", width: 16 },
    );
    sheet1.columns = cols;

    priceAnomalies.forEach((a) => {
      const rowData: Record<string, any> = {
        code: a.product.code || a.product.id,
        name: a.product.name,
        unit: a.product.unit || "шт.",
        min: a.minPrice,
        max: a.maxPrice,
        spread: a.spreadAmount,
        spreadPct: `${a.spreadPercent}%`,
        risk: a.severity === "critical" ? "Критический (>50%)" : a.severity === "warning" ? "Высокий (>25%)" : "Умеренный (>15%)",
      };
      availableSupplierKeys.forEach((supKey) => {
        const val = a.prices[supKey];
        rowData[`sup_${supKey}`] = val && val > 0 ? val : "-";
      });
      sheet1.addRow(rowData);
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

    // 4. District Heatmap Sheet
    const sheet4 = wb.addWorksheet("Тепловая карта районов");
    sheet4.columns = [
      { header: "Регион", key: "region", width: 22 },
      { header: "Район", key: "district", width: 25 },
      { header: "Статус охвата", key: "status", width: 18 },
      { header: "Сумма купонов (с.)", key: "sum", width: 20 },
      { header: "Кол-во купонов", key: "quotes", width: 16 },
      { header: "Бенефициаров", key: "beneficiaries", width: 16 },
      { header: "Ведущая сфера", key: "sphere", width: 22 },
      { header: "Топ товар", key: "topProduct", width: 30 },
      { header: "Специалисты", key: "specialists", width: 25 },
    ];
    districtHeatmapStats.allDistricts.forEach((d) => {
      sheet4.addRow({
        region: d.region,
        district: d.district,
        status: d.quotesCount > 0 ? "Охвачен" : "Белое пятно (0 КП)",
        sum: d.totalSum,
        quotes: d.quotesCount,
        beneficiaries: d.beneficiariesCount,
        sphere: d.topSphere,
        topProduct: d.topProducts[0]?.name || "—",
        specialists: d.specialists.join(", ") || "—",
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Analytics_Report_${Date.now()}.xlsx`);
  };

  if (!isOpen) return null;

  return (
    <div
      className={
        isStandalone
          ? "fixed inset-0 z-[100] w-screen h-screen flex flex-col bg-slate-100 overflow-hidden print:hidden"
          : "fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-6 bg-slate-950/70 backdrop-blur-md transition-all print:hidden"
      }
    >
      <div
        className={`bg-white flex flex-col overflow-hidden ${
          isStandalone
            ? "w-full h-full rounded-none border-0 shadow-none"
            : "rounded-2xl shadow-2xl w-full max-w-7xl h-[92vh] border border-slate-200"
        }`}
      >
        {/* Top Header */}
        <div className="bg-slate-900 text-white px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600/90 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  {isStandalone
                    ? "Панель мониторинга и аналитики цен (SPMEI Monitoring)"
                    : "Аналитика и Аномалии цен"}
                </h2>
                <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {isStandalone ? "Специалист по мониторингу" : "Эксклюзивный инструмент"}
                </span>
                {isStandalone && (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider hidden md:inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Без бокового меню
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isStandalone
                  ? "Специализированное рабочее место: выявление критических разниц цен, тепловая карта районов, анализ охвата и активности фасилитаторов"
                  : "Выявление критических разниц цен поставщиков, закупки по сферам, анализ регионов и активных фасилитаторов"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Copy monitoring link button */}
            <button
              onClick={handleCopyMonitoringLink}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
              title="Скопировать прямую ссылку на панель мониторинга для специалиста"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300 font-bold">Ссылка скопирована!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-400" />
                  <span className="hidden md:inline">Ссылка мониторинга</span>
                </>
              )}
            </button>

            {/* Install on PC button */}
            <PWAInstallButton variant="monitoring" />

            {/* Standalone toggle button in modal mode */}
            {!isStandalone && (
              <button
                onClick={() => {
                  if (onToggleStandalone) {
                    onToggleStandalone();
                  } else {
                    window.open(`${window.location.origin}${window.location.pathname}?view=monitoring`, "_blank");
                  }
                }}
                className="px-3 py-2 bg-indigo-600/80 hover:bg-indigo-600 active:scale-95 text-white text-xs font-semibold rounded-xl border border-indigo-500/50 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                title="Развернуть как отдельное полноэкранное окно мониторинга без бокового меню"
              >
                <Maximize2 className="w-4 h-4" />
                <span className="hidden sm:inline">В отдельное окно</span>
              </button>
            )}

            <button
              onClick={handleExportAnalyticsExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2 shrink-0 cursor-pointer"
              title="Выгрузить сводный отчет в Excel"
            >
              <Download className="w-4 h-4" />
              <span>Экспорт в Excel</span>
            </button>

            <button
              onClick={loadQuotesData}
              disabled={loadingHistory}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors shrink-0 cursor-pointer"
              title="Обновить данные"
            >
              <RefreshCw className={`w-4 h-4 ${loadingHistory ? "animate-spin text-indigo-400" : ""}`} />
            </button>

            {isStandalone ? (
              <button
                onClick={onClose}
                className="px-3 py-2 bg-rose-600/90 hover:bg-rose-600 active:scale-95 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-md shadow-rose-600/20"
                title="Вернуться в основной каталог товаров"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>В Каталог</span>
              </button>
            ) : (
              <button
                onClick={onClose}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
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
            onClick={() => setActiveTab("heatmap")}
            className={`flex items-center gap-2 py-3.5 px-4 font-bold text-xs border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "heatmap"
                ? "border-amber-600 text-amber-600 bg-amber-50/50"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Flame className="w-4 h-4 text-amber-500" />
            <span>Тепловая карта районов</span>
            <span className="text-[10px] bg-amber-100 text-amber-800 font-extrabold px-1.5 py-0.5 rounded-full border border-amber-200">
              {districtHeatmapStats.coveragePercent}% охват
            </span>
          </button>

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
          {/* TAB 0: DISTRICT HEATMAP & GEOGRAPHY INTELLIGENCE */}
          {activeTab === "heatmap" && (
            <div className="space-y-5">
              {/* Controls bar */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Metric Selector */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mr-1">
                    <Flame className="w-3.5 h-3.5 text-amber-500" />
                    Метрика интенсивности:
                  </span>
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setHeatmapMetric("sum")}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        heatmapMetric === "sum"
                          ? "bg-indigo-600 text-white shadow-xs font-bold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      💰 Сумма (сомони)
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeatmapMetric("quotes")}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        heatmapMetric === "quotes"
                          ? "bg-indigo-600 text-white shadow-xs font-bold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      📦 Купоны (шт.)
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeatmapMetric("beneficiaries")}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        heatmapMetric === "beneficiaries"
                          ? "bg-indigo-600 text-white shadow-xs font-bold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      👥 Бенефициары (чел.)
                    </button>
                  </div>
                </div>

                {/* Region, Search & View Controls */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Region Filter */}
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <select
                      value={heatmapRegionFilter}
                      onChange={(e) => setHeatmapRegionFilter(e.target.value)}
                      className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none font-medium cursor-pointer"
                    >
                      <option value="">Все регионы ({districtHeatmapStats.regions.length})</option>
                      {districtHeatmapStats.regions.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  {/* District Search */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Поиск района..."
                      value={heatmapSearchDistrict}
                      onChange={(e) => setHeatmapSearchDistrict(e.target.value)}
                      className="w-36 sm:w-44 pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                    />
                    {heatmapSearchDistrict && (
                      <button
                        onClick={() => setHeatmapSearchDistrict("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* View Mode Toggle */}
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setHeatmapView("cards")}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                        heatmapView === "cards"
                          ? "bg-white text-indigo-700 shadow-xs font-bold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                      title="Вид: Тепловая сетка плиток"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Плитки</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeatmapView("table")}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                        heatmapView === "table"
                          ? "bg-white text-indigo-700 shadow-xs font-bold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                      title="Вид: Таблица рейтинга"
                    >
                      <TableIcon className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Таблица</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Geo KPI Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Охват районов
                    </div>
                    <div className="text-xl font-black text-slate-900 mt-0.5">
                      {districtHeatmapStats.coveredDistricts.length}{" "}
                      <span className="text-xs font-bold text-slate-400">
                        из {districtHeatmapStats.totalDistrictsCount}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${districtHeatmapStats.coveragePercent}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0 ml-2 font-black text-xs">
                    {districtHeatmapStats.coveragePercent}%
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      «Белые пятна» (0 КП)
                    </div>
                    <div className="text-xl font-black text-rose-600 mt-0.5">
                      {districtHeatmapStats.uncoveredDistricts.length}{" "}
                      <span className="text-xs font-bold text-slate-400">районов</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 font-medium">
                      Требуют внимания и выездов
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0 ml-2">
                    <Compass className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Лидер по объему
                    </div>
                    <div className="text-base font-black text-indigo-900 truncate mt-0.5" title={districtHeatmapStats.topDistrict?.district || "—"}>
                      {districtHeatmapStats.topDistrict?.district || "—"}
                    </div>
                    <div className="text-xs font-bold text-emerald-600">
                      {districtHeatmapStats.topDistrict ? `${districtHeatmapStats.topDistrict.totalSum.toLocaleString("ru-RU")} с.` : "0 с."}
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0 ml-2">
                    <Flame className="w-5 h-5 text-amber-500" />
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Всего бенефициаров
                    </div>
                    <div className="text-xl font-black text-slate-900 mt-0.5">
                      {districtHeatmapStats.coveredDistricts.reduce((acc, d) => acc + d.beneficiariesCount, 0)}{" "}
                      <span className="text-xs font-bold text-slate-400">семей</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 font-medium">
                      В {districtHeatmapStats.coveredDistricts.length} активных районах
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0 ml-2">
                    <Users className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Heatmap Legend */}
              <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="font-bold text-slate-600 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400" />
                  Шкала интенсивности активности:
                </span>
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-indigo-900 border border-indigo-700" />
                    <span>Высокая (&ge;70%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-blue-500" />
                    <span>Повышенная (40-69%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-emerald-500" />
                    <span>Умеренная (15-39%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-amber-400" />
                    <span>Начальная (1-14%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-slate-100 border border-dashed border-slate-300" />
                    <span className="text-slate-400">Белое пятно (0 КП)</span>
                  </div>
                </div>
              </div>

              {/* Heatmap Views */}
              {heatmapView === "cards" ? (
                /* REGIONS & DISTRICTS TILES VIEW */
                <div className="space-y-6">
                  {districtHeatmapStats.regionSummaries
                    .filter((r) => !heatmapRegionFilter || r.region === heatmapRegionFilter)
                    .map((reg) => {
                      const districts = reg.districts.filter((d) => {
                        if (!heatmapSearchDistrict.trim()) return true;
                        const q = heatmapSearchDistrict.toLowerCase().trim();
                        return (
                          d.district.toLowerCase().includes(q) ||
                          d.region.toLowerCase().includes(q) ||
                          d.topSphere.toLowerCase().includes(q)
                        );
                      });

                      if (districts.length === 0) return null;

                      return (
                        <div key={reg.region} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                          {/* Region Header: Охват, Суммарный бюджет, Ведущая сфера, Мини-график интенсивности */}
                          <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50 via-indigo-50/25 to-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <div className="w-8 h-8 rounded-lg bg-indigo-600/10 text-indigo-700 flex items-center justify-center shrink-0">
                                  <MapPin className="w-4 h-4 text-indigo-600" />
                                </div>
                                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                                  {reg.region}
                                </h3>
                                {/* Процент охвата каждого региона */}
                                <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border shadow-2xs ${
                                  reg.coveragePercent >= 70
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : reg.coveragePercent >= 40
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : reg.coveragePercent > 0
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-slate-100 text-slate-500 border-slate-200"
                                }`}>
                                  {reg.coveredCount} из {reg.totalCount} районов ({reg.coveragePercent}%) охват
                                </span>
                              </div>

                              {/* Ведущая сфера и сводка активности */}
                              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap pt-0.5">
                                <span className="flex items-center gap-1.5 font-medium">
                                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                                  <span>Ведущая сфера:</span>
                                  <strong className="text-slate-800 font-bold bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                                    {reg.topSphere}
                                  </strong>
                                </span>
                                <span className="text-slate-300 hidden sm:inline">•</span>
                                <span className="font-semibold text-slate-600">{reg.quotesCount} купонов</span>
                                <span className="text-slate-300 hidden sm:inline">•</span>
                                <span className="font-semibold text-slate-600">{reg.beneficiariesCount} семей бенефициаров</span>
                              </div>
                            </div>

                            {/* Right: Суммарный бюджет и мини-график интенсивности */}
                            <div className="flex items-center gap-4 sm:gap-6 shrink-0 self-start lg:self-center">
                              {/* Суммарный бюджет региона */}
                              <div className="text-left lg:text-right">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Суммарный бюджет региона
                                </div>
                                <div className="text-lg font-black text-slate-900 flex items-baseline gap-1 lg:justify-end mt-0.5">
                                  <span>{reg.totalSum.toLocaleString("ru-RU")}</span>
                                  <span className="text-xs font-bold text-slate-400">с.</span>
                                </div>
                                <div className="text-[10px] font-extrabold text-indigo-600 mt-0.5">
                                  {districtHeatmapStats.totalCountrySum > 0 && reg.totalSum > 0
                                    ? `${reg.shareOfTotalSum.toFixed(1)}% от общего объема закупок`
                                    : "0 купонов оформлено"}
                                </div>
                              </div>

                              {/* Мини-график интенсивности */}
                              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs min-w-[150px] space-y-1.5">
                                <div className="flex items-center justify-between text-[10px] font-bold">
                                  <span className="text-slate-500 flex items-center gap-1">
                                    <Flame className="w-3 h-3 text-amber-500" />
                                    <span>Шкала охвата</span>
                                  </span>
                                  <span className="text-indigo-700 font-black">{reg.coveragePercent}%</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      reg.coveragePercent >= 70
                                        ? "bg-emerald-500"
                                        : reg.coveragePercent >= 40
                                        ? "bg-blue-500"
                                        : reg.coveragePercent > 0
                                        ? "bg-amber-400"
                                        : "bg-slate-300"
                                    }`}
                                    style={{ width: `${Math.max(reg.coveragePercent, 4)}%` }}
                                  />
                                </div>
                                <div className="flex items-center justify-between text-[9px] text-slate-400 font-semibold">
                                  <span>Доля в закупках: {reg.totalSum > 0 ? `${reg.shareOfTotalSum.toFixed(1)}%` : "0%"}</span>
                                  <span>{reg.coveredCount} / {reg.totalCount} р-нов</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Districts Grid */}
                          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {districts.map((d) => {
                              const isZero = d.heatLevel === "zero";
                              const isHigh = d.heatLevel === "high";

                              return (
                                <div
                                  key={d.district}
                                  onClick={() => setSelectedDistrictDetail(d)}
                                  className={`rounded-xl p-3.5 border transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden ${
                                    isZero
                                      ? "bg-slate-50/60 border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-100/70"
                                      : isHigh
                                      ? "bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 border-indigo-600 text-white shadow-md hover:shadow-lg hover:scale-[1.01]"
                                      : d.heatLevel === "warm"
                                      ? "bg-white border-blue-400 hover:border-blue-500 shadow-xs hover:shadow-md ring-1 ring-blue-300/40"
                                      : d.heatLevel === "moderate"
                                      ? "bg-white border-emerald-300 hover:border-emerald-400 shadow-xs hover:shadow-md"
                                      : "bg-white border-amber-200 hover:border-amber-300 shadow-xs"
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                                      <h4 className={`text-xs font-bold truncate ${isHigh ? "text-white" : isZero ? "text-slate-500 font-medium" : "text-slate-900"}`} title={d.district}>
                                        {d.district}
                                      </h4>
                                      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 ${
                                        isZero
                                          ? "bg-slate-200 text-slate-500"
                                          : isHigh
                                          ? "bg-indigo-500/30 text-indigo-200 border border-indigo-400/30"
                                          : d.heatLevel === "warm"
                                          ? "bg-blue-100 text-blue-700"
                                          : d.heatLevel === "moderate"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : "bg-amber-100 text-amber-800"
                                      }`}>
                                        {isZero ? "0 КП" : `${d.intensity}%`}
                                      </span>
                                    </div>

                                    {/* Metric value display */}
                                    <div className="my-1.5 flex items-baseline justify-between">
                                      <div>
                                        {heatmapMetric === "sum" ? (
                                          <div className={`text-base font-black ${isHigh ? "text-amber-400" : isZero ? "text-slate-400" : "text-slate-900"}`}>
                                            {d.totalSum.toLocaleString("ru-RU")} <span className="text-[10px] font-bold text-slate-400">с.</span>
                                          </div>
                                        ) : heatmapMetric === "quotes" ? (
                                          <div className={`text-base font-black ${isHigh ? "text-indigo-200" : isZero ? "text-slate-400" : "text-slate-900"}`}>
                                            {d.quotesCount} <span className="text-[10px] font-bold text-slate-400">купонов</span>
                                          </div>
                                        ) : (
                                          <div className={`text-base font-black ${isHigh ? "text-emerald-300" : isZero ? "text-slate-400" : "text-slate-900"}`}>
                                            {d.beneficiariesCount} <span className="text-[10px] font-bold text-slate-400">бенеф.</span>
                                          </div>
                                        )}
                                      </div>
                                      {!isZero && districtHeatmapStats.totalCountrySum > 0 && (
                                        <span className={`text-[10px] font-extrabold ${isHigh ? "text-indigo-300" : "text-slate-400"}`} title="Доля района в общем объеме закупок">
                                          {d.shareOfTotalSum.toFixed(1)}% закупок
                                        </span>
                                      )}
                                    </div>

                                    {/* Heat Intensity Bar */}
                                    {!isZero && (
                                      <div className={`w-full h-1.5 rounded-full overflow-hidden my-2 ${isHigh ? "bg-white/10" : "bg-slate-100"}`}>
                                        <div
                                          className={`h-full rounded-full transition-all duration-300 ${
                                            isHigh
                                              ? "bg-gradient-to-r from-amber-400 to-indigo-400"
                                              : d.heatLevel === "warm"
                                              ? "bg-blue-500"
                                              : d.heatLevel === "moderate"
                                              ? "bg-emerald-500"
                                              : "bg-amber-400"
                                          }`}
                                          style={{ width: `${Math.max(d.intensity, 6)}%` }}
                                        />
                                      </div>
                                    )}

                                    {/* District Metadata summary */}
                                    <div className={`text-[10px] space-y-0.5 mt-2 ${isHigh ? "text-indigo-200/80" : isZero ? "text-slate-400" : "text-slate-500"}`}>
                                      <div className="flex items-center justify-between">
                                        <span>Купонов / Людей:</span>
                                        <strong className={isHigh ? "text-white" : isZero ? "text-slate-400" : "text-slate-800"}>
                                          {d.quotesCount} КП / {d.beneficiariesCount} чел.
                                        </strong>
                                      </div>
                                      <div className="flex items-center justify-between truncate" title={d.topSphere}>
                                        <span>Ведущая сфера:</span>
                                        <strong className={`truncate max-w-[100px] ${isHigh ? "text-amber-300" : isZero ? "text-slate-400" : "text-indigo-600"}`}>
                                          {d.topSphere}
                                        </strong>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-3 pt-2 border-t border-slate-100/20 flex items-center justify-between text-[10px] font-bold">
                                    <span className={isHigh ? "text-indigo-300" : isZero ? "text-slate-400 italic" : "text-indigo-600"}>
                                      {isZero ? "Не охвачен" : "Подробнее"}
                                    </span>
                                    <ChevronRight className={`w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 ${isHigh ? "text-indigo-300" : "text-slate-400"}`} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                /* TABLE RATING VIEW WITH COLUMN SORTING & SHARE METRICS */
                <div className="space-y-3">
                  {/* Table Toolbar: Search & Region Quick Filter */}
                  <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mr-1">
                        <Filter className="w-3.5 h-3.5 text-indigo-600" />
                        Фильтр региона:
                      </span>
                      <button
                        type="button"
                        onClick={() => setHeatmapRegionFilter("")}
                        className={`px-2.5 py-1 text-xs rounded-lg transition-all font-semibold cursor-pointer ${
                          heatmapRegionFilter === ""
                            ? "bg-indigo-600 text-white shadow-2xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        Все ({districtHeatmapStats.totalDistrictsCount})
                      </button>
                      {districtHeatmapStats.regions.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setHeatmapRegionFilter(heatmapRegionFilter === r ? "" : r)}
                          className={`px-2.5 py-1 text-xs rounded-lg transition-all font-semibold cursor-pointer ${
                            heatmapRegionFilter === r
                              ? "bg-indigo-600 text-white shadow-2xs"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-xs font-bold text-slate-500">
                        Показано: <span className="text-indigo-600 font-black">{sortedDistricts.length}</span> из {districtHeatmapStats.totalDistrictsCount} районов
                      </div>
                    </div>
                  </div>

                  {/* Table with interactive sorting */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 select-none">
                          <tr>
                            {/* Rank */}
                            <th
                              onClick={() => handleTableSort("rank")}
                              className="p-3 w-14 text-center cursor-pointer hover:bg-slate-200/70 transition-colors"
                              title="Сортировать по рейтингу"
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span>#</span>
                                {tableSortField === "rank" ? (
                                  tableSortAsc ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                ) : (
                                  <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                                )}
                              </div>
                            </th>

                            {/* District */}
                            <th
                              onClick={() => handleTableSort("district")}
                              className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors"
                            >
                              <div className="flex items-center gap-1">
                                <span>Район</span>
                                {tableSortField === "district" ? (
                                  tableSortAsc ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                ) : (
                                  <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                                )}
                              </div>
                            </th>

                            {/* Region */}
                            <th
                              onClick={() => handleTableSort("region")}
                              className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors"
                            >
                              <div className="flex items-center gap-1">
                                <span>Регион</span>
                                {tableSortField === "region" ? (
                                  tableSortAsc ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                ) : (
                                  <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                                )}
                              </div>
                            </th>

                            {/* Intensity */}
                            <th
                              onClick={() => handleTableSort("intensity")}
                              className="p-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors"
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span>Интенсивность</span>
                                {tableSortField === "intensity" ? (
                                  tableSortAsc ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                ) : (
                                  <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                                )}
                              </div>
                            </th>

                            {/* Total Sum */}
                            <th
                              onClick={() => handleTableSort("totalSum")}
                              className="p-3 text-right cursor-pointer hover:bg-slate-200/70 transition-colors"
                            >
                              <div className="flex items-center justify-end gap-1">
                                <span>Сумма купонов (с.)</span>
                                {tableSortField === "totalSum" ? (
                                  tableSortAsc ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                ) : (
                                  <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                                )}
                              </div>
                            </th>

                            {/* Share of Total (%) */}
                            <th
                              onClick={() => handleTableSort("share")}
                              className="p-3 text-right cursor-pointer hover:bg-slate-200/70 transition-colors"
                              title="Доля района в общем объеме закупок"
                            >
                              <div className="flex items-center justify-end gap-1">
                                <span>Доля в закупках (%)</span>
                                {tableSortField === "share" ? (
                                  tableSortAsc ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                ) : (
                                  <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                                )}
                              </div>
                            </th>

                            {/* Quotes Count */}
                            <th
                              onClick={() => handleTableSort("quotesCount")}
                              className="p-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors"
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span>Купонов</span>
                                {tableSortField === "quotesCount" ? (
                                  tableSortAsc ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                ) : (
                                  <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                                )}
                              </div>
                            </th>

                            {/* Beneficiaries Count */}
                            <th
                              onClick={() => handleTableSort("beneficiariesCount")}
                              className="p-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors"
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span>Бенефициаров</span>
                                {tableSortField === "beneficiariesCount" ? (
                                  tableSortAsc ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                ) : (
                                  <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                                )}
                              </div>
                            </th>

                            {/* Items count */}
                            <th
                              onClick={() => handleTableSort("itemsCount")}
                              className="p-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors"
                            >
                              <div className="flex items-center justify-center gap-1">
                                <span>Товаров</span>
                                {tableSortField === "itemsCount" ? (
                                  tableSortAsc ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                ) : (
                                  <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                                )}
                              </div>
                            </th>

                            {/* Top Sphere */}
                            <th
                              onClick={() => handleTableSort("topSphere")}
                              className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors"
                            >
                              <div className="flex items-center gap-1">
                                <span>Ведущая сфера</span>
                                {tableSortField === "topSphere" ? (
                                  tableSortAsc ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                ) : (
                                  <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                                )}
                              </div>
                            </th>

                            <th className="p-3">Топ товар</th>
                            <th className="p-3 text-center">Действие</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedDistricts.length === 0 ? (
                            <tr>
                              <td colSpan={12} className="p-8 text-center text-slate-400">
                                Ничего не найдено по заданным критериям поиска
                              </td>
                            </tr>
                          ) : (
                            sortedDistricts.map((d, index) => {
                              const isZero = d.heatLevel === "zero";
                              const rank = index + 1;

                              return (
                                <tr
                                  key={`${d.region}-${d.district}`}
                                  onClick={() => setSelectedDistrictDetail(d)}
                                  className={`hover:bg-indigo-50/40 transition-colors cursor-pointer group ${
                                    isZero ? "bg-slate-50/50 text-slate-400" : ""
                                  }`}
                                >
                                  {/* Rank */}
                                  <td className="p-3 text-center font-bold">
                                    {rank === 1 && !isZero ? (
                                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs shadow-2xs font-black">
                                        🥇
                                      </span>
                                    ) : rank === 2 && !isZero ? (
                                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-xs shadow-2xs font-black">
                                        🥈
                                      </span>
                                    ) : rank === 3 && !isZero ? (
                                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-200/70 text-amber-900 text-xs shadow-2xs font-black">
                                        🥉
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 font-mono">{rank}</span>
                                    )}
                                  </td>

                                  {/* District */}
                                  <td className="p-3 font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                                    <div className="flex items-center gap-1.5">
                                      <span>{d.district}</span>
                                      {isZero && (
                                        <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-normal shrink-0">
                                          Белое пятно
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Region */}
                                  <td className="p-3 text-slate-600">
                                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium text-[11px]">
                                      {d.region}
                                    </span>
                                  </td>

                                  {/* Intensity */}
                                  <td className="p-3 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${
                                            d.heatLevel === "high"
                                              ? "bg-indigo-600"
                                              : d.heatLevel === "warm"
                                              ? "bg-blue-500"
                                              : d.heatLevel === "moderate"
                                              ? "bg-emerald-500"
                                              : d.heatLevel === "low"
                                              ? "bg-amber-400"
                                              : "bg-slate-200"
                                          }`}
                                          style={{ width: `${d.intensity}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] font-bold text-slate-600 w-8 text-right">
                                        {d.intensity}%
                                      </span>
                                    </div>
                                  </td>

                                  {/* Total Sum */}
                                  <td className="p-3 text-right font-black text-slate-900">
                                    {d.totalSum.toLocaleString("ru-RU")} с.
                                  </td>

                                  {/* Share of Total */}
                                  <td className="p-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                        <div
                                          className="bg-emerald-500 h-full rounded-full transition-all"
                                          style={{ width: `${Math.min(d.shareOfTotalSum * 2.5, 100)}%` }}
                                        />
                                      </div>
                                      <span className="font-extrabold text-slate-700 w-11 text-right text-[11px]">
                                        {d.shareOfTotalSum.toFixed(1)}%
                                      </span>
                                    </div>
                                  </td>

                                  {/* Quotes Count */}
                                  <td className="p-3 text-center font-bold text-slate-700">
                                    {d.quotesCount}
                                  </td>

                                  {/* Beneficiaries Count */}
                                  <td className="p-3 text-center font-bold text-slate-700">
                                    {d.beneficiariesCount}
                                  </td>

                                  {/* Items Count */}
                                  <td className="p-3 text-center text-slate-600 font-medium">
                                    {d.itemsCount}
                                  </td>

                                  {/* Top Sphere */}
                                  <td className="p-3">
                                    <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-medium text-[11px] truncate max-w-[130px] inline-block" title={d.topSphere}>
                                      {d.topSphere}
                                    </span>
                                  </td>

                                  {/* Top Product */}
                                  <td className="p-3 text-slate-600 truncate max-w-[140px]" title={d.topProducts[0]?.name || "—"}>
                                    {d.topProducts[0]?.name || "—"}
                                  </td>

                                  {/* Action */}
                                  <td className="p-3 text-center">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDistrictDetail(d);
                                      }}
                                      className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-200 rounded-lg transition-all cursor-pointer shadow-2xs"
                                    >
                                      Детали
                                    </button>
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
            </div>
          )}

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
                        <div className={`bg-slate-50 rounded-xl p-3 border border-slate-200 grid gap-2 text-center text-xs ${
                          availableSupplierKeys.length > 4 ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-5" :
                          availableSupplierKeys.length === 4 ? "grid-cols-2 sm:grid-cols-4" :
                          "grid-cols-1 sm:grid-cols-3"
                        }`}>
                          {availableSupplierKeys.map((supKey) => {
                            const pr = a.prices[supKey] || 0;
                            const isCheapest = pr > 0 && a.cheapestSupplier === supKey;
                            const isExpensivest = pr > 0 && a.expensivestSupplier === supKey && a.cheapestSupplier !== supKey;

                            return (
                              <div
                                key={supKey}
                                className={`p-2 rounded-lg border transition-all ${
                                  isCheapest
                                    ? "bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300"
                                    : isExpensivest
                                    ? "bg-rose-50 border-rose-300"
                                    : "bg-white border-slate-200"
                                }`}
                              >
                                <div className="text-[10px] font-bold text-slate-500 truncate" title={getSupplierName(supKey)}>
                                  {getSupplierName(supKey)}
                                </div>
                                <div className="font-extrabold text-sm text-slate-900 mt-0.5">
                                  {pr > 0 ? `${pr.toFixed(2)} с.` : "—"}
                                </div>
                                {isCheapest && (
                                  <div className="text-[9px] font-bold text-emerald-700 bg-emerald-100 rounded mt-1 py-0.5">
                                    Выгодно ★
                                  </div>
                                )}
                                {isExpensivest && (
                                  <div className="text-[9px] font-bold text-rose-700 bg-rose-100 rounded mt-1 py-0.5">
                                    Максимум
                                  </div>
                                )}
                              </div>
                            );
                          })}
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
              <div className={`grid gap-3 ${
                availableSupplierKeys.length > 4 ? "grid-cols-2 md:grid-cols-5" :
                availableSupplierKeys.length === 4 ? "grid-cols-2 md:grid-cols-4" :
                "grid-cols-2 md:grid-cols-3"
              }`}>
                {availableSupplierKeys.map((sup) => {
                  const data = regionSupplierStats.supplierTotals[sup] || { sum: 0, qty: 0 };
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
                        {availableSupplierKeys.map((sup) => (
                          <th key={sup} className="p-3 text-center">{getSupplierName(sup)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {regionSupplierStats.regionsList.length === 0 ? (
                        <tr>
                          <td colSpan={3 + availableSupplierKeys.length} className="p-6 text-center text-slate-400">
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
                            {availableSupplierKeys.map((sup) => {
                              const sData = r.suppliers[sup] || { sum: 0, qty: 0 };
                              return (
                                <td key={sup} className="p-3 text-center">
                                  <div className="font-bold text-slate-800">
                                    {sData.sum.toLocaleString("ru-RU")} с.
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-medium">
                                    {sData.qty} шт.
                                  </div>
                                </td>
                              );
                            })}
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
                const nums = availableSupplierKeys
                  .map((k) => parseFloat(quickPrices[k] || "") || 0)
                  .filter((n) => n > 0);

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
                  value={quickPrices.price || ""}
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
                  Цены Поставщиков ({selectedRegionFilter || "Душанбе"}):
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableSupplierKeys.map((supKey) => (
                    <div key={supKey} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <label className="block font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                        <span className="text-indigo-700">{getSupplierName(supKey)}</span>
                        <span className="text-[10px] text-slate-400 font-normal">{supKey}</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={quickPrices[supKey] || ""}
                        onChange={(e) =>
                          setQuickPrices((prev) => ({ ...prev, [supKey]: e.target.value }))
                        }
                        placeholder="0.00"
                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  ))}
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

      {/* DISTRICT DRILL-DOWN MODAL */}
      {selectedDistrictDetail && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>{selectedDistrictDetail.district}</span>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                      {selectedDistrictDetail.region}
                    </span>
                    {selectedDistrictDetail.quotesCount === 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        Белое пятно (0 КП)
                      </span>
                    )}
                  </h3>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Детализированный срез выданных купонов и потребностей жителей района
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDistrictDetail(null)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* District KPI Summary */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-400">Сумма помощи</div>
                <div className="text-lg font-black text-indigo-900 mt-0.5">
                  {selectedDistrictDetail.totalSum.toLocaleString("ru-RU")} с.
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-400">Купонов оформлено</div>
                <div className="text-lg font-black text-slate-800 mt-0.5">
                  {selectedDistrictDetail.quotesCount} КП
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-400">Бенефициаров</div>
                <div className="text-lg font-black text-slate-800 mt-0.5">
                  {selectedDistrictDetail.beneficiariesCount} чел.
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-400">Товаров выдано</div>
                <div className="text-lg font-black text-slate-800 mt-0.5">
                  {selectedDistrictDetail.itemsCount} шт.
                </div>
              </div>
            </div>

            {/* Body: Quotes List & Top Products */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {selectedDistrictDetail.quotesCount === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <Compass className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h4 className="text-sm font-bold text-slate-700">В этом районе еще не оформлялись купоны</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Район относится к «белым пятнам». При поступлении заявок от бенефициаров здесь появится подробная статистика.
                  </p>
                </div>
              ) : (
                <>
                  {/* Notice if district is not specified */}
                  {selectedDistrictDetail.district === "Район не указан" && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">Купоны, оформленные без указания района</div>
                        <div className="text-amber-800 text-[11px] mt-0.5">
                          В этих {selectedDistrictDetail.quotesCount} купонах при оформлении не был выбран район из справочника (например, купоны были созданы до внедрения обязательного поля района). Все они сохранены в базе и учтены в аналитике.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Top Products In District */}
                  {selectedDistrictDetail.topProducts.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-indigo-600" />
                        Самые востребованные товары в районе
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {selectedDistrictDetail.topProducts.map((p, idx) => (
                          <div key={idx} className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs shadow-xs">
                            <div className="min-w-0 pr-2">
                              <div className="font-bold text-slate-800 truncate" title={p.name}>{p.name}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{p.sum.toLocaleString("ru-RU")} с.</div>
                            </div>
                            <span className="text-[11px] font-black bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg shrink-0">
                              {p.qty} шт.
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Specialists working in district */}
                  {selectedDistrictDetail.specialists.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <span className="font-bold text-slate-700 flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                        Специалисты в районе:
                      </span>
                      {selectedDistrictDetail.specialists.map((spec) => (
                        <span key={spec} className="bg-white text-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 font-semibold shadow-xs">
                          {spec}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Table of all quotes in this district */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <BarChart2 className="w-3.5 h-3.5 text-indigo-600" />
                      Список оформленных купонов ({selectedDistrictDetail.quotes.length})
                    </h4>
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                            <tr>
                              <th className="p-2.5">Номер купона</th>
                              <th className="p-2.5">Дата</th>
                              <th className="p-2.5">Бенефициар</th>
                              <th className="p-2.5">Специалист</th>
                              <th className="p-2.5">Сфера</th>
                              <th className="p-2.5 text-center">Товаров</th>
                              <th className="p-2.5 text-right">Сумма (с.)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selectedDistrictDetail.quotes.map((q) => (
                              <tr key={q.id} className="hover:bg-slate-50">
                                <td className="p-2.5 font-mono font-bold text-indigo-600">{q.id}</td>
                                <td className="p-2.5 text-slate-500">{q.createdAt}</td>
                                <td className="p-2.5 font-bold text-slate-900">{q.clientName || "—"}</td>
                                <td className="p-2.5 text-slate-600">{q.specialistName || "—"}</td>
                                <td className="p-2.5">
                                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-700">
                                    {q.selectedSphere || "Общее"}
                                  </span>
                                </td>
                                <td className="p-2.5 text-center font-bold text-slate-700">{q.items.length}</td>
                                <td className="p-2.5 text-right font-black text-slate-900">
                                  {q.totalAmount.toLocaleString("ru-RU")} с.
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedDistrictDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
