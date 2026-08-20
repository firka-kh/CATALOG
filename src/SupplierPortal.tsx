import React, { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, writeBatch, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './lib/firebase';
import { Product, GlobalDictionary } from './types';
import { Save, Check, Loader2, ArrowRight, X, Download, Upload, Trash2, AlertCircle, Wifi, WifiOff, Plus, Pencil, Search, Camera, Package, Sparkles } from 'lucide-react';
import { downloadSupplierExcel, parseSupplierExcel } from './lib/excelSupplier';
import { sanitizeSearchQuery } from './lib/imageSearch';
import { UpdateNotifier } from './components/UpdateNotifier';

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

const compressImageBase64 = (
  base64: string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.7,
): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no context"));
      ctx.drawImage(img, 0, 0, width, height);
      const compressedRes = canvas.toDataURL("image/webp", quality);
      resolve({ base64: compressedRes, mimeType: "image/webp" });
    };
    img.onerror = reject;
    img.src = base64;
  });
};

interface SupplierPortalProps {
  supplierId: 'supplier1' | 'supplier2' | 'supplier3' | 'supplier4';
}

export default function SupplierPortal({ supplierId }: SupplierPortalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [globalDict, setGlobalDict] = useState<GlobalDictionary>({ regions: [], spheres: [], suppliers: [], pricingRules: {} });
  
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedSphere, setSelectedSphere] = useState('');
  
  const [searchName, setSearchName] = useState('');
  const [visibleCount, setVisibleCount] = useState(40);

  useEffect(() => {
    setVisibleCount(40);
  }, [searchName, selectedSphere, selectedRegion]);
  
  const [isSaving, setIsSaving] = useState(false);
  const [savedRowId, setSavedRowId] = useState<string | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);

  // Auth state
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [isProductsLoaded, setIsProductsLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("Сервис загружается...");
  const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputCode, setInputCode] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Add / Edit Product Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [isCustomSphere, setIsCustomSphere] = useState(false);
  const [productForm, setProductForm] = useState({
    name: '',
    code: '',
    spheres: [] as string[],
    category: '',
    description: '',
    unit: 'шт.',
    basePrice: '',
    supplierPrice: '',
    imageBase64: '',
    mimeType: '',
  });

  // Delete product confirm state
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Online Image Search State
  const [isImageSearchModalOpen, setIsImageSearchModalOpen] = useState(false);
  const [imageSearchQuery, setImageSearchQuery] = useState('');
  const [imageSearchResults, setImageSearchResults] = useState<Array<{ title: string; url: string; thumbnail: string; thumb?: string }>>([]);
  const [isSearchingImages, setIsSearchingImages] = useState(false);
  const [isFetchingImage, setIsFetchingImage] = useState(false);
  const [isRefiningQuery, setIsRefiningQuery] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
      setIsProductsLoaded(true);
    });

    return () => {
      unsubDict();
      unsubProducts();
    };
  }, []);

  useEffect(() => {
    if (isConfigLoaded && isProductsLoaded) {
      setLoadingProgress(100);
      setLoadingText("Готово");
      const t = setTimeout(() => setIsInitialLoadDone(true), 600);
      return () => clearTimeout(t);
    } else if (isConfigLoaded || isProductsLoaded) {
      setLoadingProgress(60);
      setLoadingText("Проверяем доступность");
    } else {
      setLoadingProgress(20);
      setLoadingText("Сервис загружается");
    }
  }, [isConfigLoaded, isProductsLoaded]);

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
      if (searchName && !p.name.toLowerCase().includes(searchName.toLowerCase()) && !(p.category && p.category.toLowerCase().includes(searchName.toLowerCase()))) return false;
      if (selectedSphere) {
        const pSpheres = p.spheres && p.spheres.length > 0 ? p.spheres : (p.sphere ? [p.sphere] : []);
        if (!pSpheres.includes(selectedSphere)) return false;
      }
      return true;
    });
  }, [products, searchName, selectedSphere]);

  const displayedProducts = filterProducts();

  const handlePriceChange = (productId: string, val: string) => {
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
        await updateDoc(ref, updateData);
      }

      setSavedRowId(productId);
      setTimeout(() => {
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
     return p.priceSupplier1 || p.price || 0;
  };

  const getCurrentOverride = (p: Product) => {
     if (supplierId === 'supplier1') return p.priceSupplier1 || '';
     if (selectedRegion && p.prices && p.prices[supplierId] && p.prices[supplierId][selectedRegion] !== undefined) {
         return p.prices[supplierId][selectedRegion];
     }
     return '';
  };

  useEffect(() => {
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
           if (!p) continue;

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

  // Open modal for manual product creation
  const handleOpenAddProduct = () => {
    setEditingProductId(null);
    setIsCustomSphere(false);
    setProductForm({
      name: '',
      code: '',
      spheres: globalDict.spheres.length > 0 ? [globalDict.spheres[0]] : [],
      category: '',
      description: '',
      unit: 'шт.',
      basePrice: '',
      supplierPrice: '',
      imageBase64: '',
      mimeType: '',
    });
    setIsProductModalOpen(true);
  };

  // Open modal for editing existing product
  const handleOpenEditProduct = (p: Product) => {
    setEditingProductId(p.id);
    setIsCustomSphere(false);
    const currentSpheres = (p.spheres && p.spheres.length > 0) ? p.spheres : (p.sphere ? [p.sphere] : []);
    const supplierCurrentPrice = getCurrentOverride(p);

    setProductForm({
      name: p.name || '',
      code: p.code || '',
      spheres: currentSpheres,
      category: p.category || '',
      description: p.description || '',
      unit: p.unit || 'шт.',
      basePrice: p.price ? String(p.price) : (p.priceSupplier1 ? String(p.priceSupplier1) : ''),
      supplierPrice: supplierCurrentPrice !== '' ? String(supplierCurrentPrice) : '',
      imageBase64: p.imageBase64 || '',
      mimeType: p.mimeType || '',
    });
    setIsProductModalOpen(true);
  };

  // Image Upload handler for Modal
  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const compressed = await compressImageBase64(base64);
        setProductForm(prev => ({
          ...prev,
          imageBase64: compressed.base64,
          mimeType: compressed.mimeType,
        }));
      } catch (err) {
        console.error("Error compressing image:", err);
        setProductForm(prev => ({
          ...prev,
          imageBase64: base64,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Image Clipboard Paste handler
  const handlePasteImage = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result as string;
          try {
            const compressed = await compressImageBase64(base64);
            setProductForm(prev => ({
              ...prev,
              imageBase64: compressed.base64,
              mimeType: compressed.mimeType,
            }));
          } catch (err) {
            setProductForm(prev => ({ ...prev, imageBase64: base64 }));
          }
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  // Image Online Search
  const executeImageSearch = async (queryToSearch: string) => {
    if (!queryToSearch.trim()) return;
    setIsSearchingImages(true);
    setImageSearchResults([]);
    try {
      const clean = sanitizeSearchQuery(queryToSearch);
      const res = await fetch("/api/search-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: clean || queryToSearch.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setImageSearchResults(data.results || []);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Ошибка поиска изображений: ${err.error || res.statusText}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Сетевая ошибка при поиске: ${e.message}`);
    } finally {
      setIsSearchingImages(false);
    }
  };

  const handleOpenImageSearch = async () => {
    if (!productForm.name) {
      alert("Сначала введите название товара для поиска");
      return;
    }
    const cleanQuery = sanitizeSearchQuery(productForm.name);
    setImageSearchQuery(cleanQuery);
    setIsImageSearchModalOpen(true);
    await executeImageSearch(cleanQuery);
  };

  const handleRefineImageQuery = async () => {
    if (!productForm.name) return;
    setIsRefiningQuery(true);
    try {
      const res = await fetch("/api/refine-image-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawName: productForm.name,
          description: productForm.description || "",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.query) {
          setImageSearchQuery(data.query);
          await executeImageSearch(data.query);
        }
      }
    } catch (e) {
      console.error("Failed to refine query:", e);
    } finally {
      setIsRefiningQuery(false);
    }
  };

  const handleSelectSearchResult = async (url: string, thumb?: string) => {
    setIsFetchingImage(true);
    try {
      const res = await fetch("/api/fetch-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, thumb }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.base64) {
          const compressed = await compressImageBase64(data.base64);
          setProductForm(prev => ({
            ...prev,
            imageBase64: compressed.base64,
            mimeType: compressed.mimeType,
          }));
          setIsImageSearchModalOpen(false);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Не удалось загрузить выбранное изображение: ${errData.error || "Ошибка сервера"}`);
      }
    } catch (err: any) {
      alert("Ошибка при загрузке фото: " + err.message);
    } finally {
      setIsFetchingImage(false);
    }
  };

  // Submit product creation or update
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name.trim()) {
      alert("Пожалуйста, введите название товара.");
      return;
    }
    if (productForm.spheres.length === 0) {
      alert("Пожалуйста, выберите хотя бы одну сферу.");
      return;
    }

    setIsSaving(true);
    try {
      const targetId = editingProductId || (`prod_sup_${Date.now()}`);
      const existingProduct = products.find(p => p.id === targetId);

      const basePriceNum = parseFloat(productForm.basePrice) || 0;
      const supplierPriceNum = parseFloat(productForm.supplierPrice) || 0;

      // Construct prices map
      const pricesMap = existingProduct?.prices || {
        supplier1: {},
        supplier2: {},
        supplier3: {},
        supplier4: {},
      };

      if (!pricesMap[supplierId]) {
        pricesMap[supplierId] = {};
      }

      if (supplierId === 'supplier1') {
        // supplier1 handles priceSupplier1
      } else {
        if (selectedRegion) {
          if (productForm.supplierPrice.trim() === '') {
            delete pricesMap[supplierId][selectedRegion];
          } else {
            pricesMap[supplierId][selectedRegion] = supplierPriceNum;
          }
        }
      }

      const productPayload: Product = {
        id: targetId,
        name: productForm.name.trim(),
        code: productForm.code.trim() || undefined,
        category: productForm.category.trim() || undefined,
        description: productForm.description.trim() || undefined,
        sphere: productForm.spheres[0] || '',
        spheres: productForm.spheres,
        unit: productForm.unit || 'шт.',
        price: basePriceNum,
        priceSupplier1: supplierId === 'supplier1' && supplierPriceNum > 0 ? supplierPriceNum : (existingProduct?.priceSupplier1 || basePriceNum),
        prices: pricesMap,
        imageBase64: productForm.imageBase64 || undefined,
        mimeType: productForm.mimeType || undefined,
        createdAt: existingProduct?.createdAt || Date.now(),
      };

      await setDoc(doc(db, "products", targetId), productPayload);

      setIsProductModalOpen(false);
      alert(editingProductId ? "Товар успешно обновлен!" : "Товар успешно добавлен!");
    } catch (err: any) {
      console.error(err);
      alert("Ошибка при сохранении товара: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete product handler
  const handleDeleteProduct = async () => {
    if (!productToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "products", productToDelete.id));
      setProductToDelete(null);
      if (viewingProduct?.id === productToDelete.id) {
        setViewingProduct(null);
      }
      alert("Товар успешно удален.");
    } catch (err: any) {
      console.error(err);
      alert("Ошибка при удалении товара: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isInitialLoadDone) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50 font-sans">
        <div className="max-w-xs w-full px-6 flex flex-col items-center">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-6" />
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-3">
            <div 
              className="h-full bg-indigo-600 transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="text-sm font-medium text-slate-600 animate-pulse">
            {loadingText}
          </div>
        </div>
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
    <>
      <UpdateNotifier />
      <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col lg:flex-row items-center justify-between shadow-sm z-10 shrink-0 gap-4">
        <div className="flex items-center justify-between w-full lg:w-auto">
           <div>
             <h1 className="text-xl font-bold text-slate-950 flex items-center md:items-baseline gap-2">
               Портал Поставщика
               <span className="text-sm font-medium text-slate-500 hidden md:inline ml-2 border-l border-slate-300 pl-4">{currentSupplierLabel}</span>
             </h1>
             <div className="text-sm text-indigo-600 font-semibold md:hidden">{currentSupplierLabel}</div>
           </div>
        </div>
        
        <div className="flex items-center gap-3 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
          <div className="hidden lg:flex items-center mr-1">
            {isOnline ? (
              <span className="flex items-center gap-1.5 min-w-fit px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-md text-xs font-medium border border-emerald-200">
                <Wifi className="w-3.5 h-3.5" />
                Онлайн
              </span>
            ) : (
              <span className="flex items-center gap-1.5 min-w-fit px-3 py-1.5 bg-rose-50 text-rose-700 rounded-md text-xs font-medium border border-rose-200">
                <WifiOff className="w-3.5 h-3.5" />
                Оффлайн
              </span>
            )}
          </div>

          {/* Add Product Button (hidden by request; set to true to show again) */}
          {false && (
            <button
              onClick={handleOpenAddProduct}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-lg shadow-sm transition-all text-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Добавить товар</span>
            </button>
          )}

          <input
            type="text"
            placeholder="Поиск по названию..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44 shrink-0"
          />
          
          <select 
            value={selectedSphere}
            onChange={(e) => setSelectedSphere(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 shrink-0"
          >
            <option value="">Все сферы</option>
            {globalDict.spheres.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {supplierId !== 'supplier1' && (
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="border border-indigo-400 rounded-lg px-3 py-1.5 text-sm bg-indigo-50 text-indigo-900 font-semibold shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 shrink-0"
            >
              <option value="">Выберите регион для цен...</option>
              {globalDict.regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}

          {requiresAuth && isAuthenticated && (
            <button
              onClick={() => {
                setIsAuthenticated(false);
                setInputCode('');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-bold transition-colors shrink-0"
              title="Выйти и заблокировать вход"
            >
              <X className="w-3.5 h-3.5" />
              <span>Выйти</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 overflow-auto bg-slate-50 p-3 sm:p-6">
        <div className="max-w-7xl mx-auto">
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
                   className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 shadow-sm rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                   {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                   Выгрузить в Excel
                </button>
                <button
                   onClick={() => fileInputRef.current?.click()}
                   disabled={isImporting || isClearing}
                   className="flex items-center gap-2 px-4 py-2 bg-indigo-600 border border-transparent shadow-sm rounded-lg text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                   {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                   Загрузить цены
                </button>
                <button
                   onClick={() => setShowClearConfirm(true)}
                   disabled={isClearing}
                   className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 shadow-sm rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50 ml-2"
                >
                   {isClearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                   Обнулить цены
                </button>
             </div>
          )}

          <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
             
             {!selectedRegion && supplierId !== 'supplier1' ? (
                <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                   <ArrowRight className="w-12 h-12 text-slate-300 mb-4 animate-bounce" />
                   <h2 className="text-lg font-semibold text-slate-700">Выберите регион в меню сверху</h2>
                   <p className="text-sm mt-2">Чтобы начать заполнять цены или добавить новый товар, укажите регион, для которого они действуют.</p>
                </div>
             ) : (
             <div className="overflow-x-auto w-full">
             <table className="w-full text-left border-collapse text-sm min-w-[850px]">
             <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10 text-[11px] uppercase tracking-wider text-slate-500">
               <tr>
                 <th className="px-3 py-3 w-16 text-center font-semibold">Фото</th>
                 <th className="px-3 py-3 font-semibold">Наименование</th>
                 <th className="px-3 py-3 w-32 font-semibold text-right">Сфера</th>
                 <th className="px-3 py-3 w-28 font-semibold text-right">Базовая цена</th>
                 <th className="px-3 py-3 w-28 font-semibold text-right">Ед. изм. *</th>
                 <th className="px-3 py-3 w-36 font-bold text-indigo-700 bg-indigo-50 text-right">
                   Твоя цена<br/>
                   <span className="text-[9px] text-indigo-400 normal-case tracking-normal">{supplierId !== 'supplier1' && selectedRegion ? selectedRegion : 'Global'}</span>
                 </th>
                 <th className="px-3 py-3 w-28 text-center font-semibold">Действия</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-200">
               {displayedProducts.slice(0, visibleCount).map(p => {
                 const baseVal = getBasePrice(p);
                 const originalVal = getCurrentOverride(p);
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
                   <td className="px-3 py-2 w-16 text-center">
                     {p.imageBase64 ? (
                        <img src={p.imageBase64} className="w-10 h-10 object-cover rounded-lg border border-slate-200 shadow-xs mx-auto" alt="" loading="lazy" />
                     ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 mx-auto flex items-center justify-center text-slate-300 text-[10px]">Нет</div>
                     )}
                   </td>
                   <td className="px-3 py-2">
                     <div className="font-semibold text-slate-900 leading-tight flex items-center gap-1.5">
                       <span>{p.name}</span>
                       {p.code && (
                         <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                           #{p.code}
                         </span>
                       )}
                     </div>
                     {p.category && <div className="text-[10px] text-slate-400 leading-tight mt-0.5 max-w-[250px] truncate">{p.category}</div>}
                   </td>
                   <td className="px-3 py-2 w-32 text-right">
                     <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">
                       {(p.spheres && p.spheres.length > 0 ? p.spheres[0] : p.sphere) || '—'}
                     </span>
                   </td>
                   <td className="px-3 py-2 w-28 text-right font-mono text-slate-500">
                      {baseVal > 0 ? `${baseVal.toFixed(2)} с.` : '—'}
                   </td>
                   <td className="px-3 py-2 w-28 text-right">
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
                   <td className="px-3 py-2 w-36 text-right bg-indigo-50/30 font-mono">
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
                   <td className="px-3 py-2 w-28 text-center border-l border-slate-200 bg-slate-50" onClick={e => e.stopPropagation()}>
                     <div className="flex items-center justify-center gap-1">
                       {savedRowId === p.id ? (
                          <span className="text-emerald-600 font-medium text-xs flex items-center justify-center gap-1 p-1">
                            <Check className="w-4 h-4" />
                          </span>
                       ) : (
                          <button
                            onClick={() => saveProductPrice(p.id)}
                            disabled={!hasChanged || isRowSaving}
                            className={`p-1.5 rounded-md transition-all ${hasChanged ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                            title="Сохранить цену"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                       )}
                       <button
                         onClick={() => handleOpenEditProduct(p)}
                         className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                         title="Редактировать товар"
                       >
                         <Pencil className="w-4 h-4" />
                       </button>
                       <button
                         onClick={() => setProductToDelete(p)}
                         className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                         title="Удалить товар"
                       >
                         <Trash2 className="w-4 h-4" />
                       </button>
                     </div>
                   </td>
                 </tr>
                 );
               })}
             </tbody>
           </table>
            </div>
           )}

           {displayedProducts.length > 0 && (
             <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-medium">
               <div className="flex flex-wrap items-center gap-3">
                 <span>Показано {Math.min(visibleCount, displayedProducts.length)} из {displayedProducts.length} элементов</span>
                 {visibleCount < displayedProducts.length && (
                   <button
                     onClick={() => setVisibleCount(prev => prev + 50)}
                     className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-xs transition-colors shadow-sm active:scale-95"
                   >
                     Показать еще (+50)
                   </button>
                 )}
               </div>
               <div>
                 {visibleCount >= displayedProducts.length ? "Все товары отображены" : `Осталось скрыть: ${displayedProducts.length - visibleCount}`}
               </div>
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

      {/* Clear Prices Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowClearConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
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
                  className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleClearPrices}
                  disabled={isClearing}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isClearing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Обнулить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Product Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setProductToDelete(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mb-4">
                 <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Удалить товар?</h3>
              <p className="text-sm text-slate-500 mb-6">
                Вы уверены, что хотите удалить «<span className="font-semibold text-slate-800">{productToDelete.name}</span>» из каталога?
              </p>
              <div className="flex w-full gap-3">
                <button
                  onClick={() => setProductToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleDeleteProduct}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Удалить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add / Edit Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">
                {editingProductId ? "Редактировать товар" : "Добавить товар в каталог"}
              </h2>
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitProduct} className="flex flex-col p-6 gap-4 overflow-y-auto" onPaste={handlePasteImage}>
              
              {/* Spheres */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold text-slate-700">
                    Сфера *
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCustomSphere(!isCustomSphere)}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    {isCustomSphere ? "Выбрать из списка" : "+ Добавить свою"}
                  </button>
                </div>
                {isCustomSphere ? (
                  <input
                    type="text"
                    value={productForm.spheres.join(", ")}
                    onChange={(e) =>
                      setProductForm(prev => ({
                        ...prev,
                        spheres: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
                      }))
                    }
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                    placeholder="Введите сферы через запятую..."
                  />
                ) : (
                  <div className="flex flex-col gap-2 max-h-36 overflow-y-auto border border-slate-300 rounded-lg p-2 bg-white shadow-xs">
                    {globalDict.spheres.map((s) => (
                      <label key={s} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={productForm.spheres.includes(s)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setProductForm(prev => {
                              const newSpheres = checked
                                ? [...prev.spheres, s]
                                : prev.spheres.filter((sphere) => sphere !== s);
                              return { ...prev, spheres: newSpheres };
                            });
                          }}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                        />
                        {s}
                      </label>
                    ))}
                    {globalDict.spheres.length === 0 && (
                      <span className="text-slate-400 p-2 text-xs text-center">Нет доступных сфер</span>
                    )}
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold text-slate-700">
                    Название товара *
                  </label>
                  <button
                    type="button"
                    onClick={handleOpenImageSearch}
                    className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium bg-indigo-50 px-2 py-1 rounded-md transition-colors"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Найти фото в сети
                  </button>
                </div>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) =>
                    setProductForm(prev => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Например, Перфоратор TOTAL 800Вт"
                  required
                />
              </div>

              {/* Code / Article */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">
                    Код / Артикул
                  </label>
                  <input
                    type="text"
                    value={productForm.code}
                    onChange={(e) =>
                      setProductForm(prev => ({
                        ...prev,
                        code: e.target.value,
                      }))
                    }
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="#0042"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">
                    Единица измерения *
                  </label>
                  <select
                    value={productForm.unit}
                    onChange={(e) => setProductForm(prev => ({ ...prev, unit: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    {UNITS.map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Category */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">
                  Категория
                </label>
                <input
                  type="text"
                  value={productForm.category}
                  onChange={(e) => setProductForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Например, Электроинструмент"
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">
                  Описание
                </label>
                <textarea
                  value={productForm.description}
                  onChange={(e) => setProductForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-20"
                  placeholder="Характеристики товара..."
                />
              </div>

              {/* Prices */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Базовая цена (Каталог)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={productForm.basePrice}
                      onChange={(e) => setProductForm(prev => ({ ...prev, basePrice: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg pl-2.5 pr-8 py-1.5 text-sm font-mono font-semibold"
                      placeholder="0.00"
                    />
                    <span className="absolute right-2.5 top-2 text-xs text-slate-400 font-bold">с.</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-indigo-700">
                    Твоя цена {selectedRegion ? `(${selectedRegion})` : ''}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={productForm.supplierPrice}
                      onChange={(e) => setProductForm(prev => ({ ...prev, supplierPrice: e.target.value }))}
                      className="w-full border border-indigo-300 bg-indigo-50/50 rounded-lg pl-2.5 pr-8 py-1.5 text-sm font-mono font-bold text-indigo-900"
                      placeholder="0.00"
                    />
                    <span className="absolute right-2.5 top-2 text-xs text-indigo-400 font-bold">с.</span>
                  </div>
                </div>
              </div>

              {/* Image Preview & Upload */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">
                  Фото товара
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 relative">
                    {productForm.imageBase64 ? (
                      <>
                        <img
                          src={productForm.imageBase64}
                          alt="Preview"
                          className="w-full h-full object-contain p-1"
                        />
                        <button
                          type="button"
                          onClick={() => setProductForm(prev => ({ ...prev, imageBase64: '', mimeType: '' }))}
                          className="absolute top-1 right-1 p-1 bg-slate-900/80 text-white rounded-full hover:bg-rose-600 transition-colors"
                          title="Удалить фото"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-slate-400 text-center p-2">
                        <Camera className="w-6 h-6" />
                        <span className="text-[10px]">Загрузить или Ctrl+V</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 flex-1">
                    <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer transition-colors border border-slate-200 text-center">
                      <span>Выберите файл с диска</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProductImageUpload}
                        className="hidden"
                      />
                    </label>
                    <span className="text-[11px] text-slate-400">Поддерживаются PNG, JPG, WEBP. Можно вставить из буфера обмена (Ctrl+V).</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-3 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors text-sm"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-all text-sm flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{editingProductId ? "Сохранить изменения" : "Добавить товар"}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Online Image Search Modal */}
      {isImageSearchModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] relative">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Search className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 text-base truncate">Поиск изображений в сети</h3>
                  <p className="text-xs text-slate-500 truncate">{productForm.name || "Товар"}</p>
                </div>
              </div>
              <button
                onClick={() => setIsImageSearchModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={imageSearchQuery}
                  onChange={(e) => setImageSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') executeImageSearch(imageSearchQuery);
                  }}
                  className="w-full border border-slate-300 rounded-xl pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Запрос для поиска (например: Bosch GBH 2-26)..."
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                {imageSearchQuery && (
                  <button
                    onClick={() => setImageSearchQuery("")}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => executeImageSearch(imageSearchQuery)}
                  disabled={isSearchingImages || !imageSearchQuery.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2 shrink-0"
                >
                  {isSearchingImages ? <Loader2 className="w-4 h-4 animate-spin" /> : "Искать"}
                </button>

                <button
                  onClick={handleRefineImageQuery}
                  disabled={isRefiningQuery || isSearchingImages}
                  title="Очистить запрос с помощью ИИ"
                  className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 font-medium text-xs rounded-xl transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                  {isRefiningQuery ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  <span className="hidden sm:inline">Очистить ИИ</span>
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 min-h-[300px] bg-slate-50/70">
              {isSearchingImages ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  <span className="text-sm font-medium">Поиск изображений в сети...</span>
                </div>
              ) : imageSearchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <Search className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-slate-700">Изображения не найдены</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      Попробуйте сократить запрос до ключевых слов (наименование + модель).
                    </p>
                  </div>
                  <button
                    onClick={handleRefineImageQuery}
                    disabled={isRefiningQuery}
                    className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 mt-2"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Оптимизировать запрос (ИИ)
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {imageSearchResults.map((res: any, i) => (
                    <div
                      key={i}
                      onClick={() => handleSelectSearchResult(res.url, res.thumb || res.thumbnail)}
                      className="group border border-slate-200 rounded-xl overflow-hidden bg-white hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between"
                    >
                      <div className="h-32 bg-slate-100 flex items-center justify-center overflow-hidden relative p-1">
                        <img
                          src={res.thumb || res.thumbnail || res.url}
                          alt={res.title}
                          referrerPolicy="no-referrer"
                          className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-200"
                          loading="lazy"
                          onError={(e) => {
                            const target = e.currentTarget as HTMLImageElement;
                            if (target.src !== res.url && res.url) {
                              target.src = res.url;
                            } else {
                              (target.parentElement?.parentElement as HTMLElement).style.display = "none";
                            }
                          }}
                        />
                      </div>
                      <div className="p-2 text-[10px] text-slate-600 line-clamp-2 leading-tight bg-white border-t border-slate-100">
                        {res.title}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Fetching overlay */}
            {isFetchingImage && (
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-30 flex flex-col items-center justify-center text-white gap-3">
                <Loader2 className="w-9 h-9 animate-spin text-indigo-400" />
                <p className="font-semibold text-sm">Загрузка и сохранение фото...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Viewing Product Details Modal */}
      {viewingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setViewingProduct(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
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
              <div className="w-full md:w-36 shrink-0 flex flex-col items-center">
                 {viewingProduct.imageBase64 ? (
                     <img src={viewingProduct.imageBase64} className="w-36 h-36 object-contain rounded-lg border border-slate-200 shadow-xs" alt={viewingProduct.name} />
                 ) : (
                     <div className="w-36 h-36 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
                         <Package className="w-10 h-10 text-slate-300" />
                     </div>
                 )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-slate-900 leading-tight">
                    {viewingProduct.name}
                  </h3>
                  {viewingProduct.code && (
                    <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                      #{viewingProduct.code}
                    </span>
                  )}
                </div>
                
                {viewingProduct.category && (
                  <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded border border-slate-200 mb-3">{viewingProduct.category}</span>
                )}
                
                {viewingProduct.description && (
                  <div className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">
                    {viewingProduct.description}
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-3 mt-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Базовая цена</span>
                    <span className="text-sm font-bold text-slate-800">
                      {getBasePrice(viewingProduct) > 0 ? getBasePrice(viewingProduct).toFixed(2) + ' с.' : '—'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wider">Твоя цена</span>
                    <span className="text-sm font-bold text-indigo-900">
                      {getCurrentOverride(viewingProduct) ? String(getCurrentOverride(viewingProduct)) + ' с.' : '—'}
                    </span>
                  </div>
                  {viewingProduct.sphere && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Сфера</span>
                      <span className="text-sm font-medium text-slate-800">{viewingProduct.sphere}</span>
                    </div>
                  )}
                  {viewingProduct.unit && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Ед. изм.</span>
                      <span className="text-sm font-medium text-slate-800">{viewingProduct.unit}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100 justify-end">
                  <button
                    onClick={() => {
                      const p = viewingProduct;
                      setViewingProduct(null);
                      handleOpenEditProduct(p);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs rounded-lg transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Редактировать</span>
                  </button>
                  <button
                    onClick={() => {
                      const p = viewingProduct;
                      setViewingProduct(null);
                      setProductToDelete(p);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
