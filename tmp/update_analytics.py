import re

with open("src/components/AnalyticsModal.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add import formatSupplierCode
if "formatSupplierCode" not in content:
    content = content.replace(
        'import { Product } from "../types";',
        'import { Product } from "../types";\nimport { formatSupplierCode } from "../lib/supplierUtils";'
    )

# 2. Update AnalyticsModalProps globalDict
target_props = """  globalDict: {
    regions?: string[];
    districtsByRegion?: Record<string, string[]>;
    spheres?: string[];
    suppliers?: string[];
    pricingRules?: Record<string, Record<string, number>>;
    supplierPhones?: Record<string, string>;
  };"""

replacement_props = """  globalDict: {
    regions?: string[];
    districtsByRegion?: Record<string, string[]>;
    spheres?: string[];
    suppliers?: string[];
    pricingRules?: Record<string, Record<string, number>>;
    supplierPhones?: Record<string, string>;
    supplierLegalNames?: Record<string, string>;
    supplierAssignedCodes?: Record<string, string>;
    [key: string]: any;
  };"""

assert target_props in content, "Target props not found"
content = content.replace(target_props, replacement_props, 1)

# 3. Update quickPrices state and open/save handlers
target_quick = """  // Quick Price Edit State
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
  };"""

replacement_quick = """  // Dynamic available supplier keys
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
      const numA = parseInt(a.replace(/\\D/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\\D/g, ""), 10) || 0;
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
  };"""

assert target_quick in content, "Target quick not found"
content = content.replace(target_quick, replacement_quick, 1)

# 4. Update getSupplierName and getProductPrice
target_helper = """  // Supplier Names Helper
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
  };"""

replacement_helper = """  // Supplier Names Helper (System codes SPMEI-xxx)
  const getSupplierName = (key: string) => {
    if (key === "supplier1") return "Логистика (Пост. 0)";
    const idx = parseInt(key.replace(/\\D/g, ""), 10) - 2;
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
  };"""

assert target_helper in content, "Target helper not found"
content = content.replace(target_helper, replacement_helper, 1)

# 5. Update priceAnomalies calculation
target_anomalies = """  // 1. PRICE ANOMALY DETECTION ENGINE
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
  }, [products, selectedRegionFilter, selectedSphereFilter, minAnomalyPercent, searchQuery]);"""

replacement_anomalies = """  // 1. PRICE ANOMALY DETECTION ENGINE
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
  }, [products, selectedRegionFilter, selectedSphereFilter, minAnomalyPercent, searchQuery, availableSupplierKeys]);"""

assert target_anomalies in content, "Target anomalies not found"
content = content.replace(target_anomalies, replacement_anomalies, 1)

# 6. Update regionSupplierStats
target_reg = """  // 3. REGIONAL BREAKDOWN BY SUPPLIER
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
  }, [filteredQuotes]);"""

replacement_reg = """  // 3. REGIONAL BREAKDOWN BY SUPPLIER
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
  }, [filteredQuotes, availableSupplierKeys]);"""

assert target_reg in content, "Target reg not found"
content = content.replace(target_reg, replacement_reg, 1)

# 7. Update Excel Export sheet1 columns & rows
target_excel = """    // 1. Anomalies Sheet
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
    });"""

replacement_excel = """    // 1. Anomalies Sheet
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
    });"""

assert target_excel in content, "Target excel not found"
content = content.replace(target_excel, replacement_excel, 1)

# 8. Update Price Comparison Cards Grid in anomalies tab
target_cards = """                        {/* Price Comparison Cards Grid */}
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
                        </div>"""

replacement_cards = """                        {/* Price Comparison Cards Grid */}
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
                        </div>"""

assert target_cards in content, "Target cards not found"
content = content.replace(target_cards, replacement_cards, 1)

# 9. Update TAB 3 UI
target_tab3 = """              {/* Supplier Total Volume Header Cards */}
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
              </div>"""

replacement_tab3 = """              {/* Supplier Total Volume Header Cards */}
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
              </div>"""

assert target_tab3 in content, "Target tab3 not found"
content = content.replace(target_tab3, replacement_tab3, 1)

# 10. Update Quick Price Edit Modal UI
target_quick_ui = """              {/* Live difference indicator */}
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
              </div>"""

replacement_quick_ui = """              {/* Live difference indicator */}
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
              </div>"""

assert target_quick_ui in content, "Target quick_ui not found"
content = content.replace(target_quick_ui, replacement_quick_ui, 1)

with open("src/components/AnalyticsModal.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("AnalyticsModal.tsx updated successfully!")
