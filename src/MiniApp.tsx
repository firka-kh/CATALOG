import React, { useState, useEffect, useMemo } from 'react';
import { db } from './lib/firebase';
import { collection, onSnapshot, query, orderBy, doc, getDoc, setDoc } from 'firebase/firestore';
import { Product } from './types';
import { Loader2, Plus, Minus, Search, MapPin, Briefcase } from 'lucide-react';

export default function MiniApp({ portalFacilitator }: { portalFacilitator?: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [globalDict, setGlobalDict] = useState<any>({});
  const [region, setRegion] = useState("");
  const [sphere, setSphere] = useState("");

  const [isFacilitatorAuthenticated, setIsFacilitatorAuthenticated] = useState(() => {
    if (!portalFacilitator) return false;
    return sessionStorage.getItem(`auth_${portalFacilitator}`) === "true" || sessionStorage.getItem("auth_resolved") === "true";
  });
  const [facilitatorInputCode, setFacilitatorInputCode] = useState("");

  const tg = (window as any).Telegram?.WebApp;

  const resolvedFacilitator = useMemo(() => {
    if (!portalFacilitator || !globalDict?.facilitatorCodes) {
      return { key: "", code: "", name: "Фасилитатор", region: "" };
    }
    // 1. Direct match
    if (globalDict.facilitatorCodes[portalFacilitator]) {
      const idx = parseInt(portalFacilitator.replace("facilitator", ""), 10) - 2;
      const name = globalDict.facilitators?.[idx] || "Фасилитатор";
      const region = globalDict.facilitatorRegions?.[portalFacilitator] || "";
      return {
        key: portalFacilitator,
        code: String(globalDict.facilitatorCodes[portalFacilitator]),
        name,
        region,
      };
    }
    // 2. Fallback
    let numStr = portalFacilitator.replace("facilitator", "");
    let num = parseInt(numStr, 10);
    if (isNaN(num)) {
      num = 2;
    }
    const checkKeys = [
      `facilitator${num}`,
      `facilitator${num + 1}`,
      `facilitator${num + 2}`,
      `facilitator${num - 1}`,
      `facilitator${num - 2}`
    ];
    for (const tk of checkKeys) {
      if (globalDict.facilitatorCodes[tk]) {
        const idx = parseInt(tk.replace("facilitator", ""), 10) - 2;
        const name = globalDict.facilitators?.[idx] || "Фасилитатор";
        const region = globalDict.facilitatorRegions?.[tk] || "";
        return {
          key: tk,
          code: String(globalDict.facilitatorCodes[tk]),
          name,
          region,
        };
      }
    }
    // 3. Fallback: If only one exists
    const keys = Object.keys(globalDict.facilitatorCodes);
    if (keys.length === 1) {
      const onlyKey = keys[0];
      const idx = parseInt(onlyKey.replace("facilitator", ""), 10) - 2;
      const name = globalDict.facilitators?.[idx] || "Фасилитатор";
      const region = globalDict.facilitatorRegions?.[onlyKey] || "";
      return {
        key: onlyKey,
        code: String(globalDict.facilitatorCodes[onlyKey]),
        name,
        region,
      };
    }
    return { key: "", code: "", name: "Фасилитатор", region: "" };
  }, [portalFacilitator, globalDict]);

  // Set facilitator's region once loaded & authenticated
  useEffect(() => {
    if (portalFacilitator && isFacilitatorAuthenticated && resolvedFacilitator.region) {
      setRegion(resolvedFacilitator.region);
    }
  }, [portalFacilitator, isFacilitatorAuthenticated, resolvedFacilitator.region]);

  const getProductMinPrice = (p: Product) => {
    let minP = Infinity;
    const sups = ["supplier2", "supplier3", "supplier4"];
    for (const sup of sups) {
      let pr = 0;
      if (region && p.prices?.[sup]?.[region] !== undefined && p.prices[sup][region] !== null) {
         pr = parseFloat(String(p.prices[sup][region])) || 0;
      } else {
         const mapId = sup === "supplier2" ? "priceSupplier2" : sup === "supplier3" ? "priceSupplier3" : "priceSupplier4";
         pr = parseFloat(p[mapId as keyof Product] as string) || 0;
      }
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
          if (data?.region) setRegion(data.region);
          if (data?.sphere) setSphere(data.sphere);
        }
      }, (error) => {
        console.error("Error listening to user settings:", error);
      });
    }

    return () => {
      unsubDict();
      if (unsubUser) unsubUser();
    };
  }, [tg?.initDataUnsafe?.user?.id]);

  const handleSetRegion = async (r: string) => {
     setRegion(r);
     const userId = tg?.initDataUnsafe?.user?.id;
     if (userId) {
        await setDoc(doc(db, "telegram_users", userId.toString()), { region: r }, { merge: true });
     }
  };

  const handleSetSphere = async (s: string) => {
     setSphere(s);
     const userId = tg?.initDataUnsafe?.user?.id;
     if (userId) {
        await setDoc(doc(db, "telegram_users", userId.toString()), { sphere: s }, { merge: true });
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

  const cartArray = useMemo(() => {
    return Object.entries(cart)
      .filter(([_, qty]) => (qty as number) > 0)
      .map(([id, qty]) => {
        const prod = products.find(p => p.id === id);
        return { prod, qty: qty as number };
      });
  }, [cart, products]);

  const totalSum = useMemo(() => {
    return cartArray.reduce((acc, item) => {
      if (!item.prod) return acc;
      const price = getProductMinPrice(item.prod) || 0;
      return acc + (price * item.qty);
    }, 0);
  }, [cartArray, globalDict, region]);

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
  }, [cartArray, totalSum]);

  const updateCart = (id: string, delta: number) => {
    setCart(prev => {
      const newQty = (prev[id] || 0) + delta;
      return { ...prev, [id]: Math.max(0, newQty) };
    });
  };

  const filteredProducts = products.filter(p => {
    if (sphere && sphere !== "Все сферы") {
      const pSphere = p.sphere || "";
      if (pSphere !== sphere) return false;
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

  if (portalFacilitator && !isFacilitatorAuthenticated) {
    const expectedCode = resolvedFacilitator.code || "";
    if (!globalDict || Object.keys(globalDict).length === 0) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 font-sans text-center p-4">
          <Loader2 className="animate-spin w-8 h-8 text-blue-500 mb-2" />
          <div className="text-white text-sm font-medium">Загрузка данных авторизации...</div>
        </div>
      );
    }
    if (!expectedCode) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-900 font-sans text-center p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-slate-200 dark:border-gray-700 max-w-sm w-full">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Доступ не настроен</h2>
            <p className="text-xs text-slate-500 dark:text-gray-400">
              Код доступа для данного фасилитатора еще не задан администратором в справочнике.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 font-sans p-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-slate-200 dark:border-gray-700 max-w-sm w-full">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2 text-center">Вход для Фасилитаторов</h2>
          <p className="text-xs text-slate-500 dark:text-gray-400 mb-6 text-center font-medium">Введите секретный код для доступа к каталогу фасилитатора.</p>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (facilitatorInputCode.trim().toLowerCase() === expectedCode.trim().toLowerCase()) {
                setIsFacilitatorAuthenticated(true);
                sessionStorage.setItem(`auth_${portalFacilitator}`, "true");
                sessionStorage.setItem("auth_resolved", "true");
              } else {
                alert("Неверный код");
              }
            }}
            className="flex flex-col gap-4"
          >
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

  if (portalFacilitator && isFacilitatorAuthenticated && !sphere) {
    if (!globalDict || !globalDict.spheres) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 font-sans text-center p-4">
          <Loader2 className="animate-spin w-8 h-8 text-blue-500 mb-2" />
          <div className="text-white text-sm font-medium">Загрузка сфер деятельности...</div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 font-sans p-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-slate-200 dark:border-gray-700 max-w-sm w-full">
          <div className="w-12 h-12 bg-green-50 dark:bg-green-950/30 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600 dark:text-green-400">
            <Briefcase className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2 text-center text-[15px] sm:text-lg">Выбор сферы занятости</h2>
          <p className="text-xs text-slate-500 dark:text-gray-400 mb-6 text-center font-medium">
            Для просмотра каталога вам обязательно нужно выбрать вашу сферу деятельности.
          </p>
          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
            {globalDict.spheres.map((s: string) => (
              <button
                key={s}
                onClick={() => handleSetSphere(s)}
                className="w-full text-left bg-slate-50 hover:bg-blue-50 dark:bg-gray-700 dark:hover:bg-gray-600 text-slate-700 dark:text-white font-semibold py-3 px-4 rounded-xl transition-all text-sm border border-slate-200 dark:border-gray-600 hover:border-blue-300 flex items-center justify-between"
              >
                <span>{s}</span>
                <span className="w-2 h-2 bg-slate-300 dark:bg-gray-500 rounded-full"></span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 bg-[var(--tg-theme-bg-color,#f3f4f6)] text-[var(--tg-theme-text-color,#111827)] font-sans pb-24">
      <div className="sticky top-0 z-10 bg-[var(--tg-theme-bg-color,#f3f4f6)] pb-4 space-y-3">
        {portalFacilitator && (
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 py-2.5 rounded-xl text-xs flex justify-between items-center shadow-sm">
            <span>Вошли как: <strong className="font-bold">{resolvedFacilitator.name}</strong></span>
            <span className="bg-white/20 px-2.5 py-0.5 rounded-full text-[10px] font-semibold">Региональный доступ</span>
          </div>
        )}

        {/* Region & Sphere Selectors */}
        <div className="flex gap-2 w-full">
           <div className="relative flex-1">
             <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-blue-500" />
             {portalFacilitator ? (
               <input
                 type="text"
                 readOnly
                 value={region || "Загрузка региона..."}
                 className="w-full pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-sm outline-none text-slate-500 dark:text-slate-400 font-semibold"
               />
             ) : (
               <select 
                 value={region} 
                 onChange={(e) => handleSetRegion(e.target.value)}
                 className="w-full pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-sm appearance-none outline-none focus:ring-2 focus:ring-blue-500"
               >
                 <option value="" disabled>Выбрать регион</option>
                 {(globalDict.regions || []).map((r: string) => (
                   <option key={r} value={r}>{r}</option>
                 ))}
               </select>
             )}
           </div>
           <div className="relative flex-1">
             <Briefcase className="absolute left-3 top-2.5 w-4 h-4 text-green-500" />
             <select 
               value={sphere} 
               onChange={(e) => handleSetSphere(e.target.value)}
               className="w-full pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-sm appearance-none outline-none focus:ring-2 focus:ring-green-500"
             >
               {!portalFacilitator && <option value="">Все сферы</option>}
               {portalFacilitator && !sphere && <option value="" disabled>Выбрать сферу</option>}
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
        {(!loading) && filteredProducts.map(p => (
          <div key={p.id} className="flex gap-4 p-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 items-center">
            {p.imageBase64 ? (
              <img src={p.imageBase64} alt={p.name} className="w-20 h-20 object-cover rounded-xl shrink-0 border border-gray-100 dark:border-gray-700" />
            ) : (
              <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-xl shrink-0 flex items-center justify-center text-xs text-gray-400">Нет фото</div>
            )}
            
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm line-clamp-2 leading-tight">{p.name || 'Без названия'}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Код: {p.code}</p>
              <p className="font-bold text-sm mt-1">{getProductMinPrice(p) !== null ? `${getProductMinPrice(p)!.toFixed(2)} c.` : 'Цена не указана'}</p>
            </div>
            
            <div className="shrink-0 flex flex-col items-center gap-2">
              {getProductMinPrice(p) !== null ? (
                cart[p.id] ? (
                   <div className="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-1">
                     <button onClick={() => updateCart(p.id, -1)} className="w-7 h-7 flex items-center justify-center bg-white dark:bg-gray-600 rounded-full shadow-sm text-blue-600 dark:text-blue-400 active:scale-95 transition-transform">
                       <Minus className="w-4 h-4" />
                     </button>
                     <span className="text-sm font-bold min-w-[1ch] text-center">{cart[p.id]}</span>
                     <button onClick={() => updateCart(p.id, 1)} className="w-7 h-7 flex items-center justify-center bg-white dark:bg-gray-600 rounded-full shadow-sm text-blue-600 dark:text-blue-400 active:scale-95 transition-transform">
                       <Plus className="w-4 h-4" />
                     </button>
                   </div>
                ) : (
                  <button 
                    onClick={() => updateCart(p.id, 1)}
                    className="w-10 h-10 flex items-center justify-center bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/50 active:scale-95 transition-transform"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )
              ) : (
                <div className="text-xs text-red-500 text-center font-medium bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-lg">Нет цены</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
