import React, { useState, useEffect, useMemo } from 'react';
import { db } from './lib/firebase';
import { collection, onSnapshot, query, orderBy, doc, getDoc, setDoc } from 'firebase/firestore';
import { Product } from './types';
import { Loader2, Plus, Minus, Search, MapPin, Briefcase } from 'lucide-react';

export default function MiniApp() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [globalDict, setGlobalDict] = useState<any>({});
  const [region, setRegion] = useState("Душанбе");
  const [sphere, setSphere] = useState("");

  const tg = (window as any).Telegram?.WebApp;

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

  useEffect(() => {
    let unmounted = false;
    async function loadSettings() {
      const gDoc = await getDoc(doc(db, "settings", "dictionaries"));
      if (gDoc.exists() && !unmounted) {
        setGlobalDict(gDoc.data() || {});
      }
      
      const userId = tg?.initDataUnsafe?.user?.id;
      if (userId) {
         const uDoc = await getDoc(doc(db, "telegram_users", userId.toString()));
         if (uDoc.exists() && !unmounted) {
            if (uDoc.data().region) setRegion(uDoc.data().region);
            if (uDoc.data().sphere) setSphere(uDoc.data().sphere);
         }
      }
    }
    loadSettings();
    return () => { unmounted = true; };
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--tg-theme-bg-color)] text-[var(--tg-theme-text-color)]">
        <Loader2 className="animate-spin w-8 h-8 text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 bg-[var(--tg-theme-bg-color,#f3f4f6)] text-[var(--tg-theme-text-color,#111827)] font-sans pb-24">
      <div className="sticky top-0 z-10 bg-[var(--tg-theme-bg-color,#f3f4f6)] pb-4 space-y-3">
        {/* Region & Sphere Selectors */}
        <div className="flex gap-2 w-full">
           <div className="relative flex-1">
             <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-blue-500" />
             <select 
               value={region} 
               onChange={(e) => handleSetRegion(e.target.value)}
               className="w-full pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-sm appearance-none outline-none focus:ring-2 focus:ring-blue-500"
             >
               <option value="" disabled>Регион</option>
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
        {filteredProducts.map(p => (
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
