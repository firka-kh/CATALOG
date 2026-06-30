import React, { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './lib/firebase';
import { Product, GlobalDictionary } from './types';
import { Save, Check, Loader2, ArrowRight, X, Download, Upload, Trash2, AlertCircle } from 'lucide-react';
import { downloadSupplierExcel, parseSupplierExcel } from './lib/excelSupplier';

const UNITS = [
    { value: 'шт.', label: 'шт. (Штука)' },
    { value: 'кг', label: 'кг (Килограмм)' },
    { value: 'г', label: 'г (Грамм)' },
    { value: 'т', label: 'т (Тонна)' },
    { value: 'метр', label: 'метр (Метр)' },
    { value: 'мм', label: 'мм (Миллиметр)' },
    { value: 'см', label: 'см (Сантиметр)' },
    { value: 'литр', label: 'литр (Литр)' },
    { value: 'мл', label: 'мл (Миллилитр)' },
    { value: 'упак.', label: 'упак. (Упаковка)' },
    { value: 'короб.', label: 'короб. (Коробка)' },
    { value: 'компл.', label: 'компл. (Комплект)' }
];

interface SupplierPortalProps {
  supplierId: 'supplier1' | 'supplier2' | 'supplier3' | 'supplier4';
}

export default function SupplierPortal({ supplierId }: SupplierPortalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [globalDict, setGlobalDict] = useState<GlobalDictionary>({ regions: [], spheres: [], suppliers: [], pricingRules: {} });
  
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedSphere, setSelectedSphere] = useState('');
  
  const [searchName, setSearchName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedRowId, setSavedRowId] = useState<string | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);

  // Auth state
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputCode, setInputCode] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Local state for edits before saving
  const [editedPrices, setEditedPrices] = useState<Record<string, string>>({});
  const [editedUnits, setEditedUnits] = useState<Record<string, string>>({});

  useEffect(() => {
    // Listen to global dict for regions/spheres/suppliers
    const unsubDict = onSnapshot(doc(db, 'settings', 'dictionaries'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGlobalDict({
          regions: data.regions || [],
          spheres: data.spheres || [],
          suppliers: data.suppliers || [],
          pricingRules: data.pricingRules || {},
          supplierCodes: data.supplierCodes || {}
        });
      }
      setIsConfigLoaded(true);
    });

    const qProducts = query(collection(db, 'products'));
    const unsubProducts = onSnapshot(qProducts, (snap) => {
      const prods: Product[] = [];
      snap.forEach(d => prods.push({ id: d.id, ...d.data() } as Product));
      setProducts(prods.sort((a, b) => a.name.localeCompare(b.name)));
    });

    return () => {
      unsubDict();
      unsubProducts();
    };
  }, []);

  const getSupplierLabel = (sup: 'supplier1' | 'supplier2' | 'supplier3' | 'supplier4') => {
    if (sup === 'supplier1') return 'Логистика';
    const list = globalDict.suppliers || [];
    if (sup === 'supplier2') return list[0] || 'Поставщик 1';
    if (sup === 'supplier3') return list[1] || 'Поставщик 2';
    return list[2] || 'Поставщик 3';
  };

  const currentSupplierLabel = getSupplierLabel(supplierId);

  const filterProducts = useCallback(() => {
    return products.filter(p => {
      if (searchName && !p.name.toLowerCase().includes(searchName.toLowerCase()) && !p.category.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (selectedSphere && p.sphere !== selectedSphere) return false;
      // We don't strictly filter by region for products because suppliers might want to add a price for a product that doesn't have a region yet?
      // Wait, products themselves don't have a region in their data model. Region is only used for prices.
      return true;
    });
  }, [products, searchName, selectedSphere]);

  const displayedProducts = filterProducts();

  const handlePriceChange = (productId: string, val: string) => {
    // Only allow numbers and decimal point
    if (!/^\d*\.?\d*$/.test(val)) return;
    setEditedPrices(prev => ({ ...prev, [productId]: val }));
  };

  const handleUnitChange = (productId: string, val: string) => {
    setEditedUnits(prev => ({ ...prev, [productId]: val }));
  };

  const saveProductPrice = async (productId: string) => {
    if (!selectedRegion && supplierId !== 'supplier1') {
      alert("Сначала выберите Регион, для которого вы хотите установить цену.");
      return;
    }

    const priceInput = editedPrices[productId];
    const unitInput = editedUnits[productId];
    if (priceInput === undefined && unitInput === undefined) return;

    setIsSaving(true);
    const p = products.find(x => x.id === productId);
    if (!p) return;

    try {
      const ref = doc(db, 'products', productId);
      
      const updateData: any = {};
      if (unitInput !== undefined && unitInput !== (p.unit || 'шт.')) {
        updateData.unit = unitInput;
      }

      if (priceInput !== undefined) {
        const newPriceStr = priceInput;
        const newPriceNum = parseFloat(newPriceStr) || 0;

        if (supplierId === 'supplier1') {
           // supplier1 overrides globally via priceSupplier1
           updateData.priceSupplier1 = newPriceNum;
        } else {
           // other suppliers override via prices.supplierX.[region]
           const prices = p.prices || { supplier1: {}, supplier2: {}, supplier3: {}, supplier4: {} };
           if (!prices[supplierId]) prices[supplierId] = {};
           
           if (newPriceStr === '') {
               delete prices[supplierId][selectedRegion];
           } else {
               prices[supplierId][selectedRegion] = newPriceNum;
           }
           updateData.prices = prices;
        }
      }

      if (Object.keys(updateData).length > 0) {
        await updateDoc(ref, updateData);
      }

      setSavedRowId(productId);
      const timer = setTimeout(() => {
        setSavedRowId(null);
      }, 2000);
      
    } catch (err: any) {
      alert("Ошибка при сохранении: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAllPrices = async () => {
    if (!selectedRegion && supplierId !== 'supplier1') {
      alert("Сначала выберите Регион, для которого вы хотите сохранить цены.");
      return;
    }

    const updatesToMake = displayedProducts.filter(p => {
        const priceInput = editedPrices[p.id];
        const unitInput = editedUnits[p.id];
        return priceInput !== undefined || unitInput !== undefined;
    });

    if (updatesToMake.length === 0) {
        alert("Нет измененных данных для сохранения.");
        return;
    }

    setIsSaving(true);
    let batch = writeBatch(db);
    let count = 0;
    
    try {
      for (const p of updatesToMake) {
          const priceInput = editedPrices[p.id];
          const unitInput = editedUnits[p.id];
          const ref = doc(db, 'products', p.id);
          
          const updateData: any = {};
          if (unitInput !== undefined && unitInput !== (p.unit || 'шт.')) {
            updateData.unit = unitInput;
          }

          if (priceInput !== undefined) {
            const newPriceStr = priceInput;
            const newPriceNum = parseFloat(newPriceStr) || 0;

            if (supplierId === 'supplier1') {
               updateData.priceSupplier1 = newPriceNum;
            } else {
               const prices = p.prices || { supplier1: {}, supplier2: {}, supplier3: {}, supplier4: {} };
               if (!prices[supplierId]) prices[supplierId] = {};
               
               if (newPriceStr === '') {
                   delete prices[supplierId][selectedRegion];
               } else {
                   prices[supplierId][selectedRegion] = newPriceNum;
               }
               updateData.prices = prices;
            }
          }

          if (Object.keys(updateData).length > 0) {
            batch.update(ref, updateData);
            count++;
          }

          if (count >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
          }
      }

      if (count > 0) {
          await batch.commit();
      }

      setEditedPrices({});
      setEditedUnits({});
      alert("Все изменения успешно сохранены.");
      
    } catch (err: any) {
      alert("Ошибка при сохранении: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };
  
  const getBasePrice = (p: Product) => {
     // Reference base price (typically supplier1's generic price)
     return p.priceSupplier1 || p.price || 0;
  };

  const getCurrentOverride = (p: Product) => {
     if (supplierId === 'supplier1') return p.priceSupplier1 || '';
     if (selectedRegion && p.prices && p.prices[supplierId] && p.prices[supplierId][selectedRegion] !== undefined) {
         return p.prices[supplierId][selectedRegion];
     }
     return '';
  };

  // Sync edits if viewing changes
  useEffect(() => {
    // Clear edits when changing region or supplier
    setEditedPrices({});
  }, [selectedRegion, supplierId]);

  const handleExport = async () => {
    if (products.length === 0) return;
    if (supplierId !== 'supplier1' && !selectedRegion) {
        alert("Пожалуйста, сначала выберите Регион для формирования прайса.");
        return;
    }
    try {
        setIsExporting(true);
        await downloadSupplierExcel(displayedProducts, supplierId, selectedRegion, currentSupplierLabel);
    } catch (err: any) {
        console.error(err);
        alert("Ошибка при выгрузке: " + err.message);
    } finally {
        setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (supplierId !== 'supplier1' && !selectedRegion) {
        alert("Пожалуйста, выберите Регион перед загрузкой прайса.");
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
    }

    try {
        setIsImporting(true);
        const updates = await parseSupplierExcel(file);
        
        let batch = writeBatch(db);
        let count = 0;
        let totalUpdated = 0;

        for (const update of updates) {
           const p = products.find(x => x.id === update.id);
           if (!p) continue; // invalid ID or product deleted

           const ref = doc(db, 'products', update.id);
           
           const updateData: any = {};

           if (update.unit && update.unit !== (p.unit || 'шт.')) {
               updateData.unit = update.unit;
           }

           if (supplierId === 'supplier1') {
               const val = update.price === '' ? 0 : update.price;
               updateData.priceSupplier1 = val;
           } else {
               const prices = p.prices || { supplier1: {}, supplier2: {}, supplier3: {}, supplier4: {} };
               if (!prices[supplierId]) prices[supplierId] = {};
               
               if (update.price === '') {
                   delete prices[supplierId][selectedRegion];
               } else {
                   prices[supplierId][selectedRegion] = update.price;
               }
               
               updateData.prices = prices;
           }

           batch.update(ref, updateData);

           count++;
           totalUpdated++;

           if (count === 500) {
               await batch.commit();
               batch = writeBatch(db);
               count = 0;
           }
        }

        if (count > 0) {
           await batch.commit();
        }

        alert(`Загрузка завершена! Обновлено товаров: ${totalUpdated}`);
    } catch (err: any) {
        console.error(err);
        alert("Ошибка при загрузке: " + err.message);
    } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearPrices = async () => {
    setIsClearing(true);
    try {
        let batch = writeBatch(db);
        let count = 0;
        let totalUpdated = 0;

        for (const p of products) {
            let hasPriceToClear = false;
            let updatePayload: any = {};
            
            if (supplierId === 'supplier1') {
                if (p.priceSupplier1 !== undefined && p.priceSupplier1 !== 0) {
                    hasPriceToClear = true;
                    updatePayload = { priceSupplier1: 0 };
                }
            } else {
                if (selectedRegion && p.prices && p.prices[supplierId] && p.prices[supplierId][selectedRegion] !== undefined) {
                    hasPriceToClear = true;
                    const nextPrices = structuredClone(p.prices);
                    if (nextPrices[supplierId]) {
                        delete nextPrices[supplierId][selectedRegion];
                    }
                    updatePayload = { prices: nextPrices };
                }
            }

            if (hasPriceToClear) {
                const ref = doc(db, 'products', p.id);
                batch.update(ref, updatePayload);
                count++;
                totalUpdated++;

                if (count === 500) {
                   await batch.commit();
                   batch = writeBatch(db);
                   count = 0;
                }
            }
        }

        if (count > 0) {
           await batch.commit();
        }

        setShowClearConfirm(false);
        alert(`Цены очищены! (обновлено товаров: ${totalUpdated})`);
    } catch (err: any) {
        console.error(err);
        alert("Ошибка при очистке: " + err.message);
    } finally {
        setIsClearing(false);
    }
  };

  if (!isConfigLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const expectedCode = globalDict.supplierCodes?.[supplierId];
  const requiresAuth = !!expectedCode;

  if (requiresAuth && !isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 font-sans">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200 max-w-sm w-full mx-4">
          <h2 className="text-xl font-bold text-slate-800 mb-2 text-center">Доступ закрыт</h2>
          <p className="text-sm text-slate-500 mb-6 text-center">Введите секретный код для доступа к порталу поставщика.</p>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (inputCode.trim() === expectedCode) {
                setIsAuthenticated(true);
              } else {
                alert("Неверный код");
              }
            }}
            className="flex flex-col gap-4"
          >
            <input 
              type="password" 
              value={inputCode} 
              onChange={e => setInputCode(e.target.value)} 
              placeholder="Секретный код..."
              className="px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center text-lg tracking-widest font-mono"
              autoFocus
            />
            <button 
              type="submit" 
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-md transition-colors shadow-sm"
            >
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between shadow-sm z-10 shrink-0 gap-4">
        <div>
           <h1 className="text-xl font-bold text-slate-950 flex items-center md:items-baseline gap-2">
             Портал Поставщика
             <span className="text-sm font-medium text-slate-500 hidden md:inline ml-2 border-l border-slate-300 pl-4">{currentSupplierLabel}</span>
           </h1>
           <div className="text-sm text-indigo-600 font-semibold md:hidden">{currentSupplierLabel}</div>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <input
            type="text"
            placeholder="Поиск по названию..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="border border-slate-300 rounded px-3 py-1.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48 shrink-0"
          />
          <select 
            value={selectedSphere}
            onChange={(e) => setSelectedSphere(e.target.value)}
            className="border border-slate-300 rounded px-3 py-1.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 shrink-0"
          >
            <option value="">Все сферы</option>
            {globalDict.spheres.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {supplierId !== 'supplier1' && (
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="border border-indigo-400 rounded px-3 py-1.5 text-sm bg-indigo-50 text-indigo-900 font-semibold shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 shrink-0"
            >
              <option value="">Выберите регион для цен...</option>
              {globalDict.regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 overflow-auto bg-slate-50 p-3 sm:p-6">
        <div className="max-w-6xl mx-auto">
          {(!selectedRegion && supplierId !== 'supplier1') ? null : (
             <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2 sm:gap-3 mb-4">
                <input 
                  type="file" 
                  accept=".xlsx" 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handleImport}
                />
                <button
                   onClick={handleExport}
                   disabled={isExporting}
                   className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 shadow-sm rounded-md text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                   {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                   Выгрузить в Excel
                </button>
                <button
                   onClick={() => fileInputRef.current?.click()}
                   disabled={isImporting || isClearing}
                   className="flex items-center gap-2 px-4 py-2 bg-indigo-600 border border-transparent shadow-sm rounded-md text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                   {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                   Загрузить цены
                </button>
                <button
                   onClick={() => setShowClearConfirm(true)}
                   disabled={isClearing}
                   className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 shadow-sm rounded-md text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50 ml-2"
                >
                   {isClearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                   Обнулить цены
                </button>
             </div>
          )}

          <div className="bg-white border border-slate-200 shadow-sm rounded-lg overflow-hidden">
             
             {!selectedRegion && supplierId !== 'supplier1' ? (
                <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                   <ArrowRight className="w-12 h-12 text-slate-300 mb-4 animate-bounce" />
                   <h2 className="text-lg font-semibold text-slate-700">Выберите регион в меню сверху</h2>
                   <p className="text-sm mt-2">Чтобы начать заполнять цены, укажите регион, для которого они действуют.</p>
                </div>
             ) : (
             <div className="overflow-x-auto w-full">
             <table className="w-full text-left border-collapse text-sm min-w-[750px]">
             <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10 text-[11px] uppercase tracking-wider text-slate-500">
               <tr>
                 <th className="px-3 py-3 w-16 text-center font-semibold">Фото</th>
                 <th className="px-3 py-3 font-semibold">Наименование</th>
                 <th className="px-3 py-3 w-32 font-semibold text-right">Сфера</th>
                 <th className="px-3 py-3 w-28 font-semibold text-right">Базовая цена</th>
                 <th className="px-3 py-3 w-28 font-semibold text-right">Ед. изм. *</th>
                 <th className="px-3 py-3 w-40 font-bold text-indigo-700 bg-indigo-50 text-right">
                   Твоя цена<br/>
                   <span className="text-[9px] text-indigo-400 normal-case tracking-normal">{supplierId !== 'supplier1' && selectedRegion ? selectedRegion : 'Global'}</span>
                 </th>
                 <th className="px-3 py-3 w-20 text-center font-semibold">Сохранить</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-200">
               {displayedProducts.map(p => {
                 const baseVal = getBasePrice(p);
                 const originalVal = getCurrentOverride(p); // either numeric or empty
                 const editedVal = editedPrices[p.id];
                 const originalUnit = p.unit || 'шт.';
                 const editedUnitVal = editedUnits[p.id];
                 
                 const hasChangedPrice = editedVal !== undefined && editedVal !== String(originalVal);
                 const hasChangedUnit = editedUnitVal !== undefined && editedUnitVal !== originalUnit;
                 const hasChanged = hasChangedPrice || hasChangedUnit;
                 const displayVal = editedVal !== undefined ? editedVal : (originalVal ? String(originalVal) : '');
                 const displayUnit = editedUnitVal !== undefined ? editedUnitVal : originalUnit;
                 
                 const isRowSaving = isSaving;

                 return (
                 <tr key={p.id} onClick={() => setViewingProduct(p)} className={`cursor-pointer hover:bg-slate-50 group transition-colors ${hasChanged ? 'bg-yellow-50/50 hover:bg-yellow-50/70' : ''}`}>
                   <td className="px-3 py-1.5 w-16 text-center">
                     {p.imageBase64 ? (
                        <img src={p.imageBase64} className="w-8 h-8 object-cover rounded border border-slate-200 shadow-sm mx-auto" alt="" loading="lazy" />
                     ) : (
                        <div className="w-8 h-8 rounded bg-slate-100 border border-slate-200 mx-auto flex items-center justify-center text-slate-300 text-[10px]">Нет</div>
                     )}
                   </td>
                   <td className="px-3 py-1.5">
                     <div className="font-semibold text-slate-900 leading-tight">{p.name}</div>
                     {p.category && <div className="text-[10px] text-slate-400 leading-tight mt-0.5 max-w-[250px] truncate">{p.category}</div>}
                   </td>
                   <td className="px-3 py-1.5 w-32 text-right">
                     <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">{p.sphere || '—'}</span>
                   </td>
                   <td className="px-3 py-1.5 w-28 text-right font-mono text-slate-500">
                      {baseVal > 0 ? `${baseVal.toFixed(2)} с.` : '—'}
                   </td>
                   <td className="px-3 py-1.5 w-28 text-right">
                      <select
                        onClick={e => e.stopPropagation()}
                        value={displayUnit}
                        onChange={(e) => handleUnitChange(p.id, e.target.value)}
                        className={`w-full max-w-[90px] border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white ${hasChangedUnit ? 'border-yellow-400 bg-yellow-50 text-indigo-900 shadow-inner' : ''}`}
                      >
                        {UNITS.map(u => (
                          <option key={u.value} value={u.value}>{u.value}</option>
                        ))}
                      </select>
                   </td>
                   <td className="px-3 py-1.5 w-40 text-right bg-indigo-50/30 font-mono">
                     <div className="flex justify-end gap-1 items-center relative">
                        <input
                          type="text"
                          value={displayVal}
                          onClick={e => e.stopPropagation()}
                          onChange={(e) => handlePriceChange(p.id, e.target.value)}
                          onKeyDown={(e) => {
                             if (e.key === 'Enter') {
                               saveProductPrice(p.id);
                             }
                          }}
                          placeholder={baseVal > 0 ? String(baseVal) : "0.00"}
                          className={`w-24 text-right px-2 py-1 border rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm font-semibold transition-colors
                            ${hasChanged ? 'border-yellow-400 bg-yellow-50 text-indigo-900 shadow-inner' : 'border-slate-300 bg-white text-slate-900 focus:border-indigo-400'}`}
                        />
                     </div>
                   </td>
                   <td className="px-3 py-1.5 w-20 text-center border-l border-slate-200 bg-slate-50">
                     {savedRowId === p.id ? (
                        <span className="text-green-600 font-medium text-xs flex items-center justify-center gap-1">
                          <Check className="w-4 h-4" />
                        </span>
                     ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            saveProductPrice(p.id);
                          }}
                          disabled={!hasChanged || isRowSaving}
                          className={`p-1.5 rounded transition-colors ${hasChanged ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                          title="Сохранить (Enter)"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                     )}
                   </td>
                 </tr>
                 );
               })}
             </tbody>
           </table>
            </div>
           )}
           {displayedProducts.length === 0 && selectedRegion && (
             <div className="p-8 text-center text-slate-500 text-sm">
               Товары не найдены
             </div>
           )}
          </div>
        </div>
      </div>

      {/* Floating Save All Bar */}
      {(Object.keys(editedPrices).length > 0 || Object.keys(editedUnits).length > 0) && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40 flex items-center justify-center animate-in slide-in-from-bottom-5">
           <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-center">
              <span className="text-slate-600 font-medium text-sm sm:text-base">
                Есть несохраненные изменения ({Object.keys({ ...editedPrices, ...editedUnits }).length})
              </span>
              <button
                onClick={handleSaveAllPrices}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 px-5 py-2.5 sm:px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-all disabled:opacity-50 text-sm w-full sm:w-auto"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Сохранить все изменения
              </button>
           </div>
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowClearConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                 <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Обнулить все цены?</h3>
              <p className="text-sm text-slate-500 mb-6">
                 Вы уверены, что хотите удалить ВСЕ введенные вами цены {supplierId === 'supplier1' ? 'в базе' : `для региона «${selectedRegion}»`}? Это действие необратимо.
              </p>
              <div className="flex w-full gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  disabled={isClearing}
                  className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-md transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleClearPrices}
                  disabled={isClearing}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isClearing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Обнулить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Viewing Product Modal */}
      {viewingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setViewingProduct(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-800">Информация о товаре</h3>
              <button 
                onClick={() => setViewingProduct(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 flex flex-col md:flex-row gap-5">
              <div className="w-full md:w-32 shrink-0 flex flex-col items-center">
                 {viewingProduct.imageBase64 ? (
                     <img src={viewingProduct.imageBase64} className="w-32 h-32 object-cover rounded-lg border border-slate-200 shadow-sm" alt={viewingProduct.name} />
                 ) : (
                     <div className="w-32 h-32 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
                         <span className="text-slate-400 text-sm">Нет фото</span>
                     </div>
                 )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-slate-900 leading-tight block mb-1">
                  {viewingProduct.name}
                </h3>
                
                {viewingProduct.category && (
                  <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded border border-slate-200 mb-3">{viewingProduct.category}</span>
                )}
                
                {viewingProduct.description && (
                  <div className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">
                    {viewingProduct.description}
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4 mt-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Базовая цена</span>
                    <span className="text-sm font-bold text-slate-800">
                      {getBasePrice(viewingProduct) > 0 ? getBasePrice(viewingProduct).toFixed(2) + ' с.' : '—'}
                    </span>
                  </div>
                  {viewingProduct.sphere && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Сфера</span>
                      <span className="text-sm font-medium text-slate-800">{viewingProduct.sphere}</span>
                    </div>
                  )}
                  {viewingProduct.unit && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Ед. изм.</span>
                      <span className="text-sm font-medium text-slate-800">{viewingProduct.unit}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
