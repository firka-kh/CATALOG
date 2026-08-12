import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from './lib/firebase';
import { collection, onSnapshot, query, orderBy, doc, getDoc, setDoc } from 'firebase/firestore';
import { Product } from './types';
import { Loader2, Plus, Minus, Search, MapPin, Briefcase, Printer, Lock, X, Check, User, AlertTriangle, FileDown, ShoppingBag, Archive } from 'lucide-react';
import { PrintCatalogView } from './PrintCatalogView';
import { PrintCartView } from './PrintCartView';
import { QuotesHistoryModal } from './components/QuotesHistoryModal';
import { downloadCartExcel } from './lib/excelExport';
import { saveQuoteToHistory } from './lib/quotesHistory';

export default function MiniApp({ portalFacilitator: initialPortalFacilitator }: { portalFacilitator?: string }) {
  const params = new URLSearchParams(window.location.search);
  const portalFacilitator = initialPortalFacilitator || params.get('facilitator') || params.get('portal') || params.get('startapp') || params.get('tgWebAppStartParam') || undefined;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, { qty: number; supplier: string }>>({});
  const [tempSelectedSuppliers, setTempSelectedSuppliers] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [globalDict, setGlobalDict] = useState<any>({});
  const [region, setRegion] = useState("");
  const [sphere, setSphere] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);

  // Customer Metadata state in MiniApp
  const [clientName, setClientName] = useState("");
  const [facilitatorName, setFacilitatorName] = useState("");
  const [note, setNote] = useState("");
  const [clientNameError, setClientNameError] = useState(false);
  const [isSavedToHistory, setIsSavedToHistory] = useState(false);
  const [saveRequiredError, setSaveRequiredError] = useState(false);
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const [historySavedMsg, setHistorySavedMsg] = useState<string | null>(null);
  const [isCartPrinting, setIsCartPrinting] = useState(false);
  const [isQuotesHistoryOpen, setIsQuotesHistoryOpen] = useState(false);
  const clientNameInputRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  const handleLoadQuoteToActiveCart = (
    items: any[],
    newRegion?: string,
    newSphere?: string,
    newClientName?: string,
    newFacilitatorName?: string,
    newNote?: string
  ) => {
    const newCart: Record<string, { qty: number; supplier: string }> = {};
    items.forEach((item: any) => {
      if (item.product?.id) {
        newCart[item.product.id] = {
          qty: item.quantity || 1,
          supplier: item.selectedSupplier || 'supplier2'
        };
      }
    });
    setCart(newCart);
    if (newRegion) setRegion(newRegion);
    if (newSphere) setSphere(newSphere);
    if (newClientName) setClientName(newClientName);
    if (newFacilitatorName) setFacilitatorName(newFacilitatorName);
    if (newNote) setNote(newNote);
    setIsSavedToHistory(true);
    setIsQuotesHistoryOpen(false);
  };

  const [historyPrintData, setHistoryPrintData] = useState<{
    cart: any[];
    clientName: string;
    facilitatorName: string;
    note?: string;
    createdAt?: string;
    selectedRegion?: string;
    selectedSphere?: string;
    logisticsCost?: number;
  } | null>(null);

  const handleTriggerPdfPrintFromHistory = (data: any) => {
    setHistoryPrintData(data);
    setIsCartPrinting(true);
    setTimeout(() => {
      window.print();
      setIsCartPrinting(false);
      setHistoryPrintData(null);
    }, 300);
  };

  const [authenticatedFacilitatorKey, setAuthenticatedFacilitatorKey] = useState(() => {
    return sessionStorage.getItem("auth_facilitator_key") || "";
  });

  useEffect(() => {
    setVisibleCount(30);
  }, [search, sphere, region]);
  const [showPrintAlert, setShowPrintAlert] = useState(false);

  const [isFacilitatorAuthenticated, setIsFacilitatorAuthenticated] = useState(() => {
    if (portalFacilitator) {
      const savedKey = sessionStorage.getItem("auth_facilitator_key");
      if (savedKey && savedKey === portalFacilitator) return true;
      return sessionStorage.getItem(`auth_${portalFacilitator}`) === "true";
    }
    return sessionStorage.getItem("auth_resolved") === "true" || !!sessionStorage.getItem("auth_facilitator_key");
  });
  const [facilitatorInputCode, setFacilitatorInputCode] = useState("");

  const tg = (window as any).Telegram?.WebApp;

  // Dynamic supplier list derived from globalDict
  const supplierList = useMemo(() => {
    const list = (globalDict?.suppliers && Array.isArray(globalDict.suppliers) && globalDict.suppliers.length > 0)
      ? globalDict.suppliers
      : ["Поставщик 1", "Поставщик 2", "Поставщик 3"];
    return list.map((name: string, idx: number) => ({
      key: `supplier${idx + 2}`,
      label: name || `Поставщик ${idx + 1}`,
      index: idx,
    }));
  }, [globalDict?.suppliers]);

  const resolvedFacilitator = useMemo(() => {
    let targetKey = portalFacilitator || authenticatedFacilitatorKey || "";
    if (!targetKey) {
      return { key: "", code: "", name: "Фасилитатор", region: "" };
    }

    if (targetKey.startsWith("facilitator")) {
      const idx = parseInt(targetKey.replace("facilitator", ""), 10) - 2;
      const name = (idx >= 0 && globalDict?.facilitators?.[idx]) ? globalDict.facilitators[idx] : "Фасилитатор";
      const region = globalDict?.facilitatorRegions?.[targetKey] || "";
      const code = String(globalDict?.facilitatorCodes?.[targetKey] || "");
      return {
        key: targetKey,
        code,
        name,
        region,
      };
    }

    if (globalDict?.facilitatorCodes) {
      for (const [key, codeVal] of Object.entries(globalDict.facilitatorCodes)) {
        if (key === targetKey || String(codeVal).trim().toLowerCase() === targetKey.trim().toLowerCase()) {
          const idx = parseInt(key.replace("facilitator", ""), 10) - 2;
          const name = (idx >= 0 && globalDict?.facilitators?.[idx]) ? globalDict.facilitators[idx] : "Фасилитатор";
          const region = globalDict?.facilitatorRegions?.[key] || "";
          return {
            key,
            code: String(codeVal),
            name,
            region,
          };
        }
      }
    }

    return { key: targetKey, code: "", name: "Фасилитатор", region: "" };
  }, [portalFacilitator, authenticatedFacilitatorKey, globalDict]);

  // Set facilitator's assigned region once loaded or authenticated, or default to first region
  useEffect(() => {
    if (resolvedFacilitator.region) {
      setRegion(resolvedFacilitator.region);
    } else if (!region && globalDict?.regions && globalDict.regions.length > 0) {
      setRegion(globalDict.regions[0]);
    } else if (!region) {
      setRegion("Душанбе");
    }
  }, [resolvedFacilitator.region, globalDict?.regions]);

  const getProductPriceForSupplierAndRegion = (
    p: Product,
    supplier: string,
    reg: string,
  ): number => {
    if (supplier === "supplier1") {
      return globalDict?.logisticsCosts?.[reg] || 0;
    }

    if (
      reg &&
      (p.prices as any)?.[supplier]?.[reg] !== undefined &&
      (p.prices as any)?.[supplier]?.[reg] !== null
    ) {
      const customPrice = parseFloat(String((p.prices as any)[supplier][reg])) || 0;
      if (customPrice > 0) {
        return customPrice;
      }
    }

    const mapId = `price${supplier.charAt(0).toUpperCase() + supplier.slice(1)}`;
    const legacyPrice = parseFloat(String((p as any)[mapId])) || 0;
    if (legacyPrice > 0) {
      return legacyPrice;
    }

    const basePrice = parseFloat(String(p.price)) || 0;
    if (basePrice > 0) {
      const markup = (reg && globalDict?.pricingRules?.[supplier]?.[reg]) ?? 0;
      const autoPrice = basePrice * (1 + markup / 100);
      return Math.round(autoPrice * 100) / 100;
    }

    return 0;
  };

  const getProductMinPrice = (p: Product) => {
    let minP = Infinity;
    for (const sup of supplierList) {
      const pr = getProductPriceForSupplierAndRegion(p, sup.key, region);
      if (pr > 0 && pr < minP) minP = pr;
    }
    
    if (minP === Infinity) {
      return null;
    }
    return minP;
  };

  // Load settings and user profile with real-time cached onSnapshot
  useEffect(() => {
    // 1. Listen to dictionaries document
    const unsubDict = onSnapshot(doc(db, "settings", "dictionaries"), (snapshot) => {
      if (snapshot.exists()) {
        setGlobalDict(snapshot.data() || {});
      }
    }, (error) => {
      console.error("Error listening to dictionaries:", error);
    });

    // 2. Listen to user profile document if user ID is available
    let unsubUser: (() => void) | undefined;
    const userId = tg?.initDataUnsafe?.user?.id;
    if (userId) {
      unsubUser = onSnapshot(doc(db, "telegram_users", userId.toString()), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (!portalFacilitator) {
            if (data?.region) setRegion(data.region);
          }
        }
      }, (error) => {
        console.error("Error listening to user settings:", error);
      });
    }

    // 3. Listen to facilitator status document if portalFacilitator is active
    let unsubFacilitator: (() => void) | undefined;
    if (portalFacilitator) {
      unsubFacilitator = onSnapshot(doc(db, "facilitator_states", portalFacilitator), (snapshot) => {
        if (snapshot.exists()) {
          // Facilitator state listener (region / state sync if needed)
        }
      }, (error) => {
        console.error("Error listening to facilitator state:", error);
      });
    }

    return () => {
      unsubDict();
      if (unsubUser) unsubUser();
      if (unsubFacilitator) unsubFacilitator();
    };
  }, [tg?.initDataUnsafe?.user?.id, portalFacilitator]);

  const handleSetRegion = async (r: string) => {
     setRegion(r);
     const userId = tg?.initDataUnsafe?.user?.id;
     if (userId) {
        await setDoc(doc(db, "telegram_users", userId.toString()), { region: r }, { merge: true });
     }
     if (portalFacilitator) {
        await setDoc(doc(db, "facilitator_states", portalFacilitator), { region: r }, { merge: true });
     }
  };

  const handleSetSphere = async (s: string) => {
     setSphere(s);
     const userId = tg?.initDataUnsafe?.user?.id;
     if (userId) {
        await setDoc(doc(db, "telegram_users", userId.toString()), { sphere: s }, { merge: true });
     }
     if (portalFacilitator) {
        await setDoc(doc(db, "facilitator_states", portalFacilitator), { sphere: s }, { merge: true });
     }
  };

  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
      // Optional: Set colors from Telegram theme
      document.documentElement.style.setProperty('--tg-theme-bg-color', tg.themeParams.bg_color || '#ffffff');
      document.documentElement.style.setProperty('--tg-theme-text-color', tg.themeParams.text_color || '#000000');
    }

    const q = query(collection(db, 'products'), orderBy('code', 'asc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach(docSnap => {
        prods.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });
      setProducts(prods);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const getDefaultSupplier = (p: Product) => {
    let minPrice = Infinity;
    let best = supplierList[0]?.key || 'supplier2';
    for (const sup of supplierList) {
      const pr = getProductPriceForSupplierAndRegion(p, sup.key, region);
      if (pr > 0 && pr < minPrice) {
        minPrice = pr;
        best = sup.key;
      }
    }
    return best;
  };

  const cartArray = useMemo(() => {
    return Object.entries(cart)
      .filter(([_, item]) => item && (item as any).qty > 0)
      .map(([id, item]) => {
        const prod = products.find(p => p.id === id);
        const casted = item as { qty: number; supplier: string };
        return { prod, qty: casted.qty, selectedSupplier: casted.supplier };
      });
  }, [cart, products]);

  const totalSum = useMemo(() => {
    return cartArray.reduce((acc, item) => {
      if (!item.prod) return acc;
      const price = getProductPriceForSupplierAndRegion(item.prod, item.selectedSupplier, region) || 0;
      return acc + (price * item.qty);
    }, 0);
  }, [cartArray, globalDict, region]);

  useEffect(() => {
    if (resolvedFacilitator.name && !facilitatorName) {
      setFacilitatorName(resolvedFacilitator.name);
    }
  }, [resolvedFacilitator.name]);

  // Reset saved state if cart or metadata changes, and clear client data when cart becomes empty
  useEffect(() => {
    setIsSavedToHistory(false);
    setSaveRequiredError(false);
    if (cartArray.length === 0) {
      setClientName("");
      setNote("");
      setClientNameError(false);
    }
  }, [clientName, facilitatorName, note, cartArray, region, sphere]);

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
    if (!isSavedToHistory) {
      setSaveRequiredError(true);
      if (saveButtonRef.current) {
        saveButtonRef.current.focus();
        saveButtonRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return false;
    }
    setSaveRequiredError(false);
    return true;
  };

  const handleSaveToHistory = async () => {
    if (cartArray.length === 0) return;
    if (!validateClientName()) return;
    setIsSavingHistory(true);
    try {
      const formattedCart = cartArray
        .filter((i) => i.prod)
        .map((i) => ({
          product: i.prod!,
          quantity: i.qty,
          selectedSupplier: (i.selectedSupplier || "supplier2") as any,
          selectedPrice: getProductPriceForSupplierAndRegion(i.prod!, i.selectedSupplier, region) || 0,
        }));

      await saveQuoteToHistory({
        clientName: clientName.trim(),
        facilitatorName: facilitatorName.trim() || resolvedFacilitator.name || "Фасилитатор",
        note: note.trim(),
        selectedRegion: region || "Все регионы",
        selectedSphere: sphere || "Все сферы",
        logisticsCost: cartArray.length > 0 ? (globalDict?.logisticsCosts?.[region] || 0) : 0,
        cart: formattedCart,
      });

      setIsSavedToHistory(true);
      setSaveRequiredError(false);
      setHistorySavedMsg("✓ Сохранено в Архив КП!");
      setTimeout(() => setHistorySavedMsg(null), 3500);
    } catch (err: any) {
      console.error("Error saving quote in MiniApp:", err);
      alert(`Не удалось сохранить в архив: ${err?.message || "Ошибка соединения"}`);
    } finally {
      setIsSavingHistory(false);
    }
  };

  const handlePrintCatalog = () => {
    if (!validateCanExportOrPrint()) return;
    setShowPrintAlert(true);
    setTimeout(() => {
      window.print();
    }, 800);
  };

  const handlePrintCartInvoice = () => {
    if (!validateCanExportOrPrint()) return;
    setIsCartPrinting(true);
    const afterPrint = () => {
      setIsCartPrinting(false);
      window.removeEventListener("afterprint", afterPrint);
    };
    window.addEventListener("afterprint", afterPrint);
    setTimeout(() => {
      window.print();
      setTimeout(() => setIsCartPrinting(false), 2000);
    }, 400);
  };

  const handleCartExcelExport = async () => {
    if (!validateCanExportOrPrint()) return;
    const formattedCart = cartArray
      .filter((i) => i.prod)
      .map((i) => ({
        product: i.prod!,
        quantity: i.qty,
        selectedSupplier: (i.selectedSupplier || "supplier2") as any,
        selectedPrice: getProductPriceForSupplierAndRegion(i.prod!, i.selectedSupplier, region),
      }));
    const logCost = globalDict?.logisticsCosts?.[region] || 0;
    await downloadCartExcel(
      formattedCart,
      logCost,
      globalDict?.suppliers,
      region,
      sphere,
      clientName.trim(),
      facilitatorName.trim() || resolvedFacilitator.name || "Фасилитатор",
      note.trim()
    );
  };

  useEffect(() => {
    if (!tg) return;
    if (cartArray.length > 0) {
      tg.MainButton.show();
      tg.MainButton.setParams({
        text: `ОФОРМИТЬ ЗАКАЗ (${totalSum.toFixed(2)} с.)`,
        color: '#28a745'
      });
    } else {
      tg.MainButton.hide();
    }

    let clicked = false;
    const onMainButtonClick = () => {
      if (!validateCanExportOrPrint()) return;
      if (clicked) return;
      clicked = true;
      const itemsString = cartArray
         .filter(i => i.prod)
         .map(i => `${i.prod!.code}.${i.qty}`)
         .join(' ');
      
      // Send data back (works if opened via keyboard button)
      tg.sendData(itemsString);
      setTimeout(() => {
        tg.close();
      }, 50);
    };

    tg.onEvent('mainButtonClicked', onMainButtonClick);
    return () => tg.offEvent('mainButtonClicked', onMainButtonClick);
  }, [cartArray, totalSum, clientName]);

  const updateCart = (id: string, delta: number, selectedSup?: string) => {
    setCart(prev => {
      const existing = prev[id];
      const sup = selectedSup || tempSelectedSuppliers[id] || existing?.supplier || getDefaultSupplier(products.find(p => p.id === id)!);
      const newQty = (existing?.qty || 0) + delta;
      if (newQty <= 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return {
        ...prev,
        [id]: { qty: newQty, supplier: sup }
      };
    });
  };

  const selectSupplierForProduct = (productId: string, sup: string) => {
    setTempSelectedSuppliers(prev => ({ ...prev, [productId]: sup }));
    if (cart[productId]) {
      setCart(prev => ({
        ...prev,
        [productId]: { ...prev[productId], supplier: sup }
      }));
    }
  };

  const filteredProducts = products.filter(p => {
    if (sphere && sphere !== "Все сферы") {
      const pSpheres = p.spheres && p.spheres.length > 0 ? p.spheres : (p.sphere ? [p.sphere] : []);
      if (!pSpheres.includes(sphere)) return false;
    }
    if (getProductMinPrice(p) === null) {
      return false; // Hide products with no price in this region
    }
    if (search.trim()) {
      const v = search.toLowerCase();
      if (!p.name?.toLowerCase().includes(v) && !p.code?.toLowerCase().includes(v)) {
        return false;
      }
    }
    return true;
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const inputClean = facilitatorInputCode.trim().toLowerCase();
    if (!inputClean) return;

    let matchedKey: string | null = null;
    if (globalDict?.facilitatorCodes) {
      for (const [key, codeVal] of Object.entries(globalDict.facilitatorCodes)) {
        if (String(codeVal).trim().toLowerCase() === inputClean) {
          matchedKey = key;
          break;
        }
      }
    }

    const expectedCode = resolvedFacilitator.code || "";

    if (matchedKey) {
      setIsFacilitatorAuthenticated(true);
      setAuthenticatedFacilitatorKey(matchedKey);
      sessionStorage.setItem("auth_facilitator_key", matchedKey);
      sessionStorage.setItem(`auth_${portalFacilitator || matchedKey}`, "true");
      sessionStorage.setItem("auth_resolved", "true");

      const matchedRegion = globalDict?.facilitatorRegions?.[matchedKey];
      if (matchedRegion) {
        setRegion(matchedRegion);
        if (portalFacilitator) {
          setDoc(doc(db, "facilitator_states", portalFacilitator), { region: matchedRegion }, { merge: true }).catch(console.error);
        }
      }
    } else if (expectedCode && inputClean === expectedCode.trim().toLowerCase()) {
      setIsFacilitatorAuthenticated(true);
      sessionStorage.setItem(`auth_${portalFacilitator}`, "true");
      sessionStorage.setItem("auth_resolved", "true");
      if (resolvedFacilitator.region) {
        setRegion(resolvedFacilitator.region);
      }
    } else {
      alert("Неверный код доступа");
    }
  };

  if ((portalFacilitator || resolvedFacilitator.key) && !isFacilitatorAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 font-sans p-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-slate-200 dark:border-gray-700 max-w-sm w-full">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2 text-center">Вход для Фасилитаторов</h2>
          <p className="text-xs text-slate-500 dark:text-gray-400 mb-6 text-center font-medium">Введите секретный код для доступа к каталогу фасилитатора.</p>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            <input 
              type="password" 
              value={facilitatorInputCode} 
              onChange={e => setFacilitatorInputCode(e.target.value)}
              placeholder="Секретный код..." 
              className="w-full border border-slate-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button 
              type="submit" 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl transition-colors text-sm"
            >
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }



  return (
    <div className="min-h-screen p-4 bg-[var(--tg-theme-bg-color,#f3f4f6)] text-[var(--tg-theme-text-color,#111827)] font-sans pb-24">
      <div className="sticky top-0 z-10 bg-[var(--tg-theme-bg-color,#f3f4f6)] pb-4 space-y-3">
        {clientNameError && (
          <div className="bg-rose-500/15 border border-rose-500/40 text-rose-800 dark:text-rose-200 p-3 rounded-xl text-xs flex items-center justify-between gap-2 shadow-md animate-pulse print:hidden">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>
                <strong>Ошибка:</strong> Пожалуйста, укажите <strong>Ф.И.О Бенефициара / Клиента *</strong> перед сохранением, печатью или скачиванием Excel!
              </span>
            </div>
            <button onClick={() => setClientNameError(false)} className="text-rose-500 hover:text-rose-700 p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {saveRequiredError && !clientNameError && (
          <div className="bg-amber-500/20 border border-amber-500/50 text-amber-900 dark:text-amber-200 p-3 rounded-xl text-xs flex items-center justify-between gap-2 shadow-md animate-pulse print:hidden">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong>Предупреждение:</strong> Необходимы данные! Подборка ещё не сохранена в Архив КП. Нажмите синюю кнопку <strong>«Сохранить подборку в Архив КП»</strong> для получения доступа к Excel и печати!
              </span>
            </div>
            <button onClick={() => setSaveRequiredError(false)} className="text-amber-500 hover:text-amber-700 p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {(portalFacilitator || isFacilitatorAuthenticated || resolvedFacilitator.key) && (
          <div className="flex flex-col gap-2">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 py-2.5 rounded-xl text-xs flex justify-between items-center shadow-sm">
              <span>Вошли как: <strong className="font-bold">{resolvedFacilitator.name}</strong></span>
              <div className="flex items-center gap-2">
                <span className="bg-white/20 px-2.5 py-0.5 rounded-full text-[10px] font-semibold">Региональный доступ</span>
                <button
                  onClick={() => {
                    setIsFacilitatorAuthenticated(false);
                    setFacilitatorInputCode("");
                    sessionStorage.removeItem("auth_resolved");
                    sessionStorage.removeItem("auth_facilitator_key");
                    if (portalFacilitator) {
                      sessionStorage.removeItem(`auth_${portalFacilitator}`);
                    }
                  }}
                  className="bg-red-500/80 hover:bg-red-600 active:scale-95 text-white px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors shadow-sm"
                  title="Заблокировать / Выйти из сессии"
                >
                  Выйти
                </button>
              </div>
            </div>
            <button
              onClick={handlePrintCatalog}
              className="w-full bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 font-bold py-2 px-3 rounded-xl transition-all text-xs flex items-center justify-center gap-2 border border-indigo-200/50 print:hidden shadow-sm"
            >
              <Printer className="w-4 h-4 text-indigo-600" />
              Распечатать каталог
            </button>
          </div>
        )}

        {/* Customer Metadata Card in MiniApp */}
        <div className="bg-slate-900 text-white p-3.5 rounded-2xl shadow-sm border border-slate-800 print:hidden space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="font-bold text-xs text-white uppercase tracking-wider">
                Карточка клиента / Метаданные выборки
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsQuotesHistoryOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600/40 hover:bg-indigo-600/70 text-indigo-100 border border-indigo-400/40 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                title="Открыть Архив КП (История подборок)"
              >
                <Archive className="w-3.5 h-3.5 text-indigo-300" />
                <span>Архив КП</span>
              </button>
              {isSavedToHistory ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" /> В Архиве КП
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400" /> Требуется архив
                </span>
              )}
            </div>
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
                className={`w-full bg-slate-800 border rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none font-medium transition-all ${
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
                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-300 font-medium cursor-not-allowed select-none focus:outline-none"
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
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
            <button
              ref={saveButtonRef}
              type="button"
              onClick={handleSaveToHistory}
              disabled={isSavingHistory || cartArray.length === 0}
              className={`w-full font-bold py-2 px-3 rounded-xl transition-all text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 ${
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
                <Check className="w-4 h-4 text-white" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-300" />
              )}
              <span>
                {isSavingHistory
                  ? "Сохранение..."
                  : isSavedToHistory
                  ? "✓ Сохранено в Архив КП (Экспорт разрешён)"
                  : historySavedMsg || "Сохранить подборку в Архив КП (Обязательно)"}
              </span>
            </button>

            {cartArray.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintCartInvoice}
                  disabled={!isSavedToHistory}
                  className={`flex-1 font-bold py-2 px-3 rounded-xl transition-all text-xs flex items-center justify-center gap-1.5 border shadow-sm ${
                    isSavedToHistory
                      ? "bg-slate-800 hover:bg-slate-700 text-white border-slate-700 opacity-100 cursor-pointer active:scale-95"
                      : "bg-slate-800/40 text-slate-500 border-slate-800 opacity-50 cursor-not-allowed"
                  }`}
                  title={!isSavedToHistory ? "Сначала укажите Ф.И.О Бенефициара и сохраните подборку в Архив КП!" : undefined}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Печать (Лист выборки)</span>
                </button>
                <button
                  type="button"
                  onClick={handleCartExcelExport}
                  disabled={!isSavedToHistory}
                  className={`flex-1 font-bold py-2 px-3 rounded-xl transition-all text-xs flex items-center justify-center gap-1.5 shadow-sm ${
                    isSavedToHistory
                      ? "bg-emerald-700 hover:bg-emerald-600 text-white opacity-100 cursor-pointer active:scale-95"
                      : "bg-emerald-900/40 text-emerald-400/50 opacity-50 cursor-not-allowed"
                  }`}
                  title={!isSavedToHistory ? "Сначала укажите Ф.И.О Бенефициара и сохраните подборку в Архив КП!" : undefined}
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Скачать Excel</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {showPrintAlert && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-xs flex items-start gap-2 animate-fade-in shadow-sm print:hidden">
            <Printer className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong>Информация:</strong> как фасилитатор вы можете распечатывать каталог по всем поставщикам, но только по своему району ({region || "свой район"}).
            </div>
            <button onClick={() => setShowPrintAlert(false)} className="text-amber-500 hover:text-amber-700 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Region & Sphere Selectors */}
        <div className="flex gap-2 w-full">
           <div className="relative flex-1">
             <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-blue-500 z-10" />
             <select 
               disabled={!!portalFacilitator}
               value={region} 
               onChange={(e) => handleSetRegion(e.target.value)}
               className="w-full pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-sm appearance-none outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-75 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:cursor-not-allowed font-medium text-slate-700 dark:text-slate-300"
             >
               <option value="" disabled>Выбрать регион</option>
               {portalFacilitator && region && !globalDict.regions?.includes(region) && (
                 <option value={region}>{region}</option>
               )}
               {(globalDict.regions || []).map((r: string) => (
                 <option key={r} value={r}>{r}</option>
               ))}
             </select>
           </div>
           <div className="relative flex-1">
             <Briefcase className="absolute left-3 top-2.5 w-4 h-4 text-green-500" />
             <select 
               value={sphere} 
               onChange={(e) => handleSetSphere(e.target.value)}
               className="w-full pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-sm appearance-none outline-none focus:ring-2 focus:ring-green-500"
             >
               <option value="">Все сферы</option>
               {(globalDict.spheres || []).map((s: string) => (
                 <option key={s} value={s}>{s}</option>
               ))}
             </select>
           </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск товаров..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
          />
        </div>
      </div>

      <div className="space-y-4">
        {(!region) && (
          <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
             <MapPin className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
             <p className="text-gray-500 dark:text-gray-400 font-medium">Пожалуйста, выберите регион для просмотра товаров.</p>
          </div>
        )}
        {(region && loading) && (
          <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
             <Loader2 className="animate-spin w-8 h-8 text-blue-500 mb-2" />
             <p className="text-gray-500 dark:text-gray-400 text-sm">Загрузка каталога товаров...</p>
          </div>
        )}
        {(region && !loading && filteredProducts.length === 0) && (
          <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
             <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
             <p className="text-gray-500 dark:text-gray-400 font-medium">Товары не найдены</p>
          </div>
        )}
        {(!loading) && filteredProducts.slice(0, visibleCount).map(p => {
          const currentSupplier = tempSelectedSuppliers[p.id] || cart[p.id]?.supplier || getDefaultSupplier(p);
          const activePrice = getProductPriceForSupplierAndRegion(p, currentSupplier, region);
          
          return (
            <div key={p.id} className="flex flex-col p-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex gap-4 items-center">
                {p.imageBase64 ? (
                  <img src={p.imageBase64} alt={p.name} className="w-20 h-20 object-cover rounded-xl shrink-0 border border-gray-100 dark:border-gray-700" />
                ) : (
                  <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-xl shrink-0 flex items-center justify-center text-xs text-gray-400">Нет фото</div>
                )}
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm line-clamp-2 leading-tight text-slate-900 dark:text-white">{p.name || 'Без названия'}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">Код: {p.code}</p>
                  
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="font-extrabold text-base text-blue-600 dark:text-blue-400">
                      {activePrice > 0 ? `${activePrice.toFixed(2)} с.` : 'Цена не указана'}
                    </span>
                    {activePrice > 0 && (
                      <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full truncate max-w-[140px]">
                        Выбран: {supplierList.find(s => s.key === currentSupplier)?.label || 'Поставщик'}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="shrink-0 flex flex-col items-center gap-2">
                  {activePrice > 0 ? (
                    cart[p.id] ? (
                       <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-1">
                         <button onClick={() => updateCart(p.id, -1, currentSupplier)} className="w-7 h-7 flex items-center justify-center bg-white dark:bg-gray-600 rounded-full shadow-sm text-blue-600 dark:text-blue-400 active:scale-95 transition-transform">
                           <Minus className="w-4 h-4" />
                         </button>
                         <span className="text-sm font-bold min-w-[1ch] text-center">{cart[p.id].qty}</span>
                         <button onClick={() => updateCart(p.id, 1, currentSupplier)} className="w-7 h-7 flex items-center justify-center bg-white dark:bg-gray-600 rounded-full shadow-sm text-blue-600 dark:text-blue-400 active:scale-95 transition-transform">
                           <Plus className="w-4 h-4" />
                         </button>
                       </div>
                    ) : (
                      <button 
                        onClick={() => updateCart(p.id, 1, currentSupplier)}
                        className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-full hover:bg-blue-700 active:scale-95 transition-transform shadow-sm"
                        title="Добавить в подборку"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    )
                  ) : (
                    <div className="text-[10px] text-red-500 text-center font-bold bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-lg">Нет цены</div>
                  )}
                </div>
              </div>

              {/* Supplier Offers Choice (All Suppliers displayed) */}
              <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/50 space-y-1.5 w-full">
                <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  <span>Цены от всех поставщиков:</span>
                  <span className="text-gray-400 font-normal lowercase">(нажмите для выбора)</span>
                </div>
                <div className={`grid gap-1.5 ${supplierList.length > 3 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                  {supplierList.map((s) => {
                    const price = getProductPriceForSupplierAndRegion(p, s.key, region);
                    const isSelected = currentSupplier === s.key;
                    const hasPrice = price > 0;
                    return (
                      <button
                        key={s.key}
                        disabled={!hasPrice}
                        onClick={() => selectSupplierForProduct(p.id, s.key)}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all duration-200 relative ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-300 font-bold shadow-sm ring-1 ring-blue-400'
                            : hasPrice
                            ? 'bg-gray-50/80 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:bg-gray-100 text-gray-700 dark:text-gray-200'
                            : 'bg-gray-50/30 dark:bg-gray-900/10 border-gray-100 dark:border-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-50'
                        }`}
                      >
                        <span className="text-[9px] font-medium truncate max-w-full uppercase tracking-tight">{s.label}</span>
                        <span className="text-xs font-extrabold mt-0.5 whitespace-nowrap">
                          {hasPrice ? `${price.toFixed(2)} с.` : '—'}
                        </span>
                        {isSelected && (
                          <span className="absolute -top-1 -right-1 bg-blue-600 text-white rounded-full p-0.5 shadow-sm border border-white">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {visibleCount < filteredProducts.length && (
          <div className="flex justify-center pt-2 pb-6">
            <button
              onClick={() => setVisibleCount(prev => prev + 30)}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-sm rounded-full shadow-md transition-all flex items-center gap-2"
            >
              Показать еще (+30)
            </button>
          </div>
        )}
      </div>

      {/* Floating Bottom Sticky Cart Bar on Mobile/Tablet */}
      {cartArray.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-slate-900/95 backdrop-blur-md text-white border-t border-slate-800 shadow-2xl flex items-center justify-between gap-3 print:hidden">
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] text-slate-400 font-medium truncate">
              Выбрано: <strong className="text-white font-bold">{cartArray.length} поз.</strong>
            </span>
            <span className="text-base font-extrabold font-mono text-emerald-400">
              {totalSum.toFixed(2)} с.
            </span>
          </div>

          <button
            onClick={() => {
              if (!isSavedToHistory) {
                handleSaveToHistory();
              } else {
                handleCartExcelExport();
              }
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md active:scale-95 shrink-0 ${
              isSavedToHistory
                ? "bg-emerald-600 text-white"
                : "bg-indigo-600 hover:bg-indigo-500 text-white"
            }`}
          >
            {isSavedToHistory ? (
              <>
                <FileDown className="w-4 h-4" />
                <span>Скачать Excel</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-300" />
                <span>Сохранить в Архив КП</span>
              </>
            )}
          </button>
        </div>
      )}

      <QuotesHistoryModal
        isOpen={isQuotesHistoryOpen}
        onClose={() => setIsQuotesHistoryOpen(false)}
        onLoadCartToActive={handleLoadQuoteToActiveCart}
        onTriggerPdfPrint={handleTriggerPdfPrintFromHistory}
        suppliers={globalDict?.suppliers || []}
        isAdmin={false}
        currentFacilitatorName={facilitatorName || resolvedFacilitator.name}
      />

      <PrintCatalogView
        printMode="all"
        suppliers={globalDict?.suppliers}
        selectedRegion={region}
        selectedSupplier={null}
        isFacilitator={true}
        products={products.map((p) => {
          const productRegion = region || "Душанбе";
          return {
            ...p,
            priceSupplier1: getProductPriceForSupplierAndRegion(p, "supplier1", productRegion),
            priceSupplier2: getProductPriceForSupplierAndRegion(p, "supplier2", productRegion),
            priceSupplier3: getProductPriceForSupplierAndRegion(p, "supplier3", productRegion),
            priceSupplier4: getProductPriceForSupplierAndRegion(p, "supplier4", productRegion),
          };
        })}
      />

      <PrintCartView
        cart={
          historyPrintData?.cart
            ? historyPrintData.cart
            : cartArray.map((i) => ({
                product: i.prod!,
                quantity: i.qty,
                selectedSupplier: (i.selectedSupplier || "supplier2") as any,
                selectedPrice: getProductPriceForSupplierAndRegion(i.prod!, i.selectedSupplier, region) || 0,
              }))
        }
        isPrinting={isCartPrinting}
        suppliers={globalDict?.suppliers}
        allProducts={products}
        logisticsCost={
          historyPrintData
            ? (historyPrintData.logisticsCost ?? 0)
            : (cartArray.length > 0 ? (globalDict?.logisticsCosts?.[region] || 0) : 0)
        }
        selectedRegion={historyPrintData?.selectedRegion ?? region}
        selectedSphere={historyPrintData?.selectedSphere ?? sphere}
        clientName={historyPrintData?.clientName ?? clientName}
        facilitatorName={historyPrintData?.facilitatorName ?? facilitatorName}
        note={historyPrintData?.note ?? note}
        createdAt={historyPrintData?.createdAt}
      />
    </div>
  );
}
