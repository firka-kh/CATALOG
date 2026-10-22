import React from 'react';
import { Product } from './types';
import { formatSupplierCode } from './lib/supplierUtils';

interface CartItem {
  product: Product;
  quantity: number;
  selectedSupplier: 'supplier1' | 'supplier2' | 'supplier3' | 'supplier4';
  selectedPrice: number;
}

interface Props {
  cart: CartItem[];
  isPrinting: boolean;
  suppliers?: string[];
  logisticsCost?: number;
  selectedRegion?: string;
  selectedDistrict?: string;
  selectedSphere?: string;
  supplierPhones?: Record<string, string>;
  supplierLegalNames?: Record<string, string>;
  supplierAssignedCodes?: Record<string, string>;
  clientName?: string;
  beneficiaryId?: string;
  facilitatorName?: string;
  facilitatorLegalName?: string;
  facilitatorRep?: string;
  facilitatorPhone?: string;
  facilitatorEmail?: string;
  facilitatorLegalNames?: Record<string, string>;
  facilitatorRepresentatives?: Record<string, string>;
  facilitatorPhones?: Record<string, string>;
  facilitatorEmails?: Record<string, string>;
  facilitatorRegions?: Record<string, string>;
  facilitators?: string[];
  specialistName?: string;
  note?: string;
  createdAt?: string;
  quoteId?: string;
  allProducts?: Product[];
}

const getImageSrc = (img?: string, mime?: string) => {
  if (!img) return "";
  const trimmed = img.trim();
  if (trimmed.startsWith("data:") || trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("blob:")) {
    return trimmed;
  }
  return `data:${mime || "image/jpeg"};base64,${trimmed}`;
};

export const PrintCartView = React.forwardRef<HTMLDivElement, Props>(({
  cart,
  isPrinting,
  suppliers,
  logisticsCost = 0,
  selectedRegion = 'Душанбе',
  selectedDistrict,
  selectedSphere,
  supplierPhones,
  supplierLegalNames,
  supplierAssignedCodes,
  clientName,
  beneficiaryId,
  facilitatorName,
  facilitatorLegalName,
  facilitatorRep,
  facilitatorPhone,
  facilitatorEmail,
  facilitatorLegalNames,
  facilitatorRepresentatives,
  facilitatorPhones,
  facilitatorEmails,
  facilitatorRegions,
  facilitators,
  specialistName,
  note,
  createdAt,
  quoteId,
  allProducts,
}, ref) => {
  if (!isPrinting) return null;

  // Resolve facilitator details accurately
  let matchedFacKey: string | null = null;
  const lookupNames = [facilitatorName, facilitatorLegalName].filter(Boolean) as string[];

  // 1. Direct key match (e.g. "facilitator2")
  for (const name of lookupNames) {
    if (
      facilitatorRepresentatives?.[name] ||
      facilitatorPhones?.[name] ||
      facilitatorLegalNames?.[name] ||
      facilitatorEmails?.[name] ||
      facilitatorRegions?.[name]
    ) {
      matchedFacKey = name;
      break;
    }
  }

  // 2. Lookup in facilitators array (e.g. index -> facilitator${idx+2})
  if (!matchedFacKey && facilitators && facilitators.length > 0) {
    for (const name of lookupNames) {
      const cleanName = name.trim().toLowerCase();
      const idx = facilitators.findIndex(
        (f) => f && (f.trim().toLowerCase() === cleanName ||
                     cleanName.includes(f.trim().toLowerCase()) ||
                     f.trim().toLowerCase().includes(cleanName))
      );
      if (idx >= 0) {
        matchedFacKey = `facilitator${idx + 2}`;
        break;
      }
    }
  }

  // 3. Lookup in facilitatorLegalNames values
  if (!matchedFacKey && facilitatorLegalNames) {
    for (const name of lookupNames) {
      const cleanName = name.trim().toLowerCase();
      for (const [k, lName] of Object.entries(facilitatorLegalNames)) {
        const lStr = String(lName || "").trim().toLowerCase();
        if (lStr && (lStr === cleanName || cleanName.includes(lStr) || lStr.includes(cleanName))) {
          matchedFacKey = k;
          break;
        }
      }
      if (matchedFacKey) break;
    }
  }

  // 4. Match by selectedRegion in facilitatorRegions
  if (!matchedFacKey && selectedRegion && facilitatorRegions) {
    for (const [k, reg] of Object.entries(facilitatorRegions)) {
      const regStr = String(reg || "").trim().toLowerCase();
      if (regStr && regStr === selectedRegion.trim().toLowerCase()) {
        matchedFacKey = k;
        break;
      }
    }
  }

  // 5. Default fallback if only one facilitator is in dictionary or pick first configured
  if (!matchedFacKey && facilitators && facilitators.length > 0) {
    // Check if any facilitator has phone or email configured
    for (let i = 0; i < facilitators.length; i++) {
      const k = `facilitator${i + 2}`;
      if (facilitatorPhones?.[k] || facilitatorEmails?.[k] || facilitatorRepresentatives?.[k] || facilitatorLegalNames?.[k]) {
        matchedFacKey = k;
        break;
      }
    }
    if (!matchedFacKey) {
      matchedFacKey = 'facilitator2';
    }
  }

  const resolvedFacLegalName =
    (facilitatorLegalName && facilitatorLegalName !== "Фасилитатор" ? facilitatorLegalName : undefined) ||
    (matchedFacKey ? facilitatorLegalNames?.[matchedFacKey] : undefined) ||
    (facilitatorName && facilitatorName !== "Фасилитатор" ? facilitatorName : undefined) ||
    (facilitators && facilitators[0]) ||
    "Фасилитатор";

  const resolvedFacRep =
    facilitatorRep ||
    (matchedFacKey ? facilitatorRepresentatives?.[matchedFacKey] : undefined) ||
    "";

  const resolvedFacPhone =
    facilitatorPhone ||
    (matchedFacKey ? facilitatorPhones?.[matchedFacKey] : undefined) ||
    "";

  const resolvedFacEmail =
    facilitatorEmail ||
    (matchedFacKey ? facilitatorEmails?.[matchedFacKey] : undefined) ||
    "";

  // Filter cart items by selected sphere if provided
  let filteredCart = cart;
  if (selectedSphere && !selectedSphere.toLowerCase().includes("все") && selectedSphere.trim() !== "") {
    filteredCart = cart.filter(item => {
      const prodSpheres = item.product.spheres && item.product.spheres.length > 0 
        ? item.product.spheres 
        : [item.product.sphere || "Общее"];
      return prodSpheres.some(s => 
        s === selectedSphere || 
        s.includes(selectedSphere) || 
        selectedSphere.includes(s)
      );
    });
  }

  const getSupplierName = (supp?: 'supplier1' | 'supplier2' | 'supplier3' | 'supplier4' | string) => {
    if (!supp || supp === 'supplier1') return 'Логистика';
    const assignedCode = supp ? supplierAssignedCodes?.[supp] : undefined;
    let listEntry: string | undefined;
    let idx = -1;
    if (supp.startsWith('supplier')) {
      idx = parseInt(supp.replace(/\D/g, ''), 10) - 2;
    } else if (suppliers) {
      idx = suppliers.indexOf(supp);
    }
    if (idx >= 0 && suppliers && suppliers[idx]) {
      listEntry = suppliers[idx];
    }
    return formatSupplierCode(supp, assignedCode || listEntry, idx >= 0 ? idx : undefined);
  };

  const suppliersInCart = Array.from(new Set(filteredCart.map(item => item.selectedSupplier || 'supplier2'))) as ('supplier1' | 'supplier2' | 'supplier3' | 'supplier4')[];

  return (
    <div ref={ref} className="hidden print:block bg-white text-black text-sm">
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          body {
            background: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
      {suppliersInCart.map((supplierKey, sIndex) => {
        const supplierItems = filteredCart.filter(item => (item.selectedSupplier || 'supplier2') === supplierKey);
        const supplierName = getSupplierName(supplierKey);
        const cartLinesTotal = supplierItems.reduce((sum, item) => {
          const p = (!item.selectedPrice || item.selectedPrice === Infinity) ? 0 : Number(item.selectedPrice);
          return sum + p * item.quantity;
        }, 0);
        const total = cartLinesTotal + (supplierItems.length > 0 ? logisticsCost : 0);

        const itemSpheres = Array.from(
          new Set(
            supplierItems.flatMap(item => {
              const list = item.product.spheres && item.product.spheres.length > 0
                ? item.product.spheres
                : (item.product.sphere ? [item.product.sphere] : []);
              return list;
            }).filter(Boolean)
          )
        );

        const supplierSphere = (selectedSphere && !selectedSphere.toLowerCase().includes("все") && selectedSphere.trim() !== "")
          ? selectedSphere
          : (itemSpheres.length > 0 ? itemSpheres.join(", ") : "");

        return (
          <div 
            key={supplierKey} 
            className="flex flex-col p-8 bg-white text-black min-h-screen"
            style={{
              pageBreakAfter: sIndex < suppliersInCart.length - 1 ? 'always' : 'auto',
              breakAfter: sIndex < suppliersInCart.length - 1 ? 'page' : 'auto'
            }}
          >
            {/* Header: Document Title & Metadata */}
            <div className="flex items-center justify-between mb-5 border-b-2 border-black pb-4">
              <div>
                <h1 className="text-2xl font-bold uppercase tracking-wider text-slate-900">КУПОН</h1>
                {quoteId && (
                  <p className="text-xs font-mono font-semibold text-slate-700 mt-1">
                    Код купона: {quoteId} {beneficiaryId ? `• ID: ${beneficiaryId}` : ""}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="font-semibold text-slate-900">Дата формирования: {createdAt || new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                <p className="text-xs text-gray-500">Документ сгенерирован автоматически</p>
              </div>
            </div>

            {/* 3-Column Header Details: Client/Parameters, Facilitator Organization, and Selected Supplier */}
            <div className="mb-6 grid grid-cols-3 gap-3.5 items-stretch">
              {/* Column 1: Client & Geographic Parameters */}
              <div className="p-4 border-2 border-slate-300/90 rounded-xl bg-slate-50/70 flex flex-col justify-between shadow-xs">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 mb-3 border-b-2 border-slate-200 pb-1.5 flex items-center justify-between">
                    <span>1. Заказчик и параметры:</span>
                    <span className="text-[9px] bg-slate-200/80 text-slate-700 font-bold px-1.5 py-0.5 rounded">
                      Клиент
                    </span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                        Бенефициар (Клиент):
                      </span>
                      <div className="font-extrabold text-slate-950 text-sm leading-tight mt-0.5 flex items-center gap-2 flex-wrap">
                        {beneficiaryId && (
                          <span className="bg-slate-900 text-white font-mono text-xs px-2 py-0.5 rounded font-black tracking-wider">
                            ID: {beneficiaryId}
                          </span>
                        )}
                        <span>{clientName || "—"}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-1 border-t border-slate-200 pt-1.5">
                      <span className="text-slate-600 font-medium">Регион:</span>
                      <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded text-xs border border-slate-300 shadow-2xs">
                        {selectedRegion || "—"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1 border-t border-slate-200 pt-1.5">
                      <span className="text-slate-600 font-medium">Район:</span>
                      <span className="font-bold text-indigo-950 bg-indigo-50 px-2 py-0.5 rounded text-xs border border-indigo-200 shadow-2xs">
                        {selectedDistrict || "—"}
                      </span>
                    </div>

                    <div className="border-t border-slate-200 pt-1.5 text-[11px]">
                      <span className="text-slate-500 font-medium block text-[10px] uppercase tracking-wider">Заметка:</span>
                      <span className={`block mt-0.5 font-medium ${note ? 'text-slate-800 italic' : 'text-slate-400'}`}>
                        {note || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column 2: Facilitator Organization Information */}
              <div className="p-4 border-2 border-indigo-200 rounded-xl bg-indigo-50/40 flex flex-col justify-between shadow-xs">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-950 mb-3 border-b-2 border-indigo-200/80 pb-1.5 flex items-center justify-between">
                    <span>2. Организация-Фасилитатор:</span>
                    <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.5 rounded border border-indigo-200">
                      Партнер
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    {/* Юр. название (Организация) */}
                    <div>
                      <span className="text-[10px] uppercase font-bold text-indigo-700 tracking-wider block">
                        Юр. название (Организация) *:
                      </span>
                      <div className="font-extrabold text-indigo-950 text-sm leading-tight mt-0.5">
                        {resolvedFacLegalName || facilitatorName || "—"}
                      </div>
                    </div>

                    {/* ФИО представителя */}
                    <div className="flex items-start justify-between gap-1 border-t border-indigo-100 pt-1.5">
                      <span className="text-slate-600 font-medium whitespace-nowrap">ФИО представителя:</span>
                      <span className="font-bold text-slate-900 text-right">
                        {resolvedFacRep || "—"}
                      </span>
                    </div>

                    {/* Телефон */}
                    <div className="flex items-center justify-between gap-1 border-t border-indigo-100 pt-1.5">
                      <span className="text-slate-600 font-medium whitespace-nowrap">Телефон фирмы:</span>
                      <span className="font-bold text-slate-900 text-right">
                        {resolvedFacPhone || "—"}
                      </span>
                    </div>

                    {/* Email */}
                    <div className="flex items-center justify-between gap-1 border-t border-indigo-100 pt-1.5">
                      <span className="text-slate-600 font-medium whitespace-nowrap">Email для связи:</span>
                      <span className="font-bold text-slate-900 text-right truncate max-w-[160px]" title={resolvedFacEmail}>
                        {resolvedFacEmail || "—"}
                      </span>
                    </div>

                    {/* Заполнил специалист */}
                    <div className="pt-2 mt-1.5 border-t-2 border-indigo-200/80 bg-white/80 -mx-4 -mb-4 px-4 py-2 rounded-b-xl flex items-center justify-between">
                      <span className="text-[11px] text-slate-600 font-semibold">Специалист (заполнил):</span>
                      <span className="font-extrabold text-indigo-950 text-xs">
                        {specialistName || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column 3: Selected Supplier */}
              <div className="p-4 border-2 border-slate-300/90 rounded-xl bg-slate-50/70 flex flex-col justify-between shadow-xs">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 mb-3 border-b-2 border-slate-200 pb-1.5 flex items-center justify-between">
                    <span>3. Выбранный поставщик:</span>
                    <span className="text-[9px] bg-slate-200/80 text-slate-700 font-bold px-1.5 py-0.5 rounded">
                      Поставщик
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                        Код поставщика:
                      </span>
                      <div className="font-extrabold text-slate-950 text-sm flex items-center gap-1.5 mt-0.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-600 block shrink-0"></span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-300 font-mono">{supplierName}</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-1.5">
                      <span className="text-slate-500 font-medium block text-[10px] uppercase tracking-wider">Сфера:</span>
                      <span className="font-bold text-indigo-900 text-xs line-clamp-2 mt-0.5 block">
                        {supplierSphere || selectedSphere || "Все сферы"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <table className="w-full text-left border-collapse mb-8">
              <thead>
                <tr className="bg-gray-100 uppercase text-xs font-bold border-y-2 border-black">
                  <th className="p-2.5 w-10 text-center">№</th>
                  <th className="p-2.5 w-16 text-center">Фото</th>
                  <th className="p-2.5 w-1/4">Наименование</th>
                  <th className="p-2.5 border-l border-gray-200">Технические характеристики</th>
                  <th className="p-2.5 w-24 text-right border-l border-gray-200">Цена</th>
                  <th className="p-2.5 w-20 text-center border-l border-gray-200">Кол-во</th>
                  <th className="p-2.5 w-28 text-right border-l border-gray-200">Сумма</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300">
                {supplierItems.map((item, index) => {
                  let rawImg = item.product.imageBase64 || (item.product as any).imageUrl || (item.product as any).image || "";
                  let mime = item.product.mimeType;

                  if (!rawImg && allProducts && allProducts.length > 0) {
                    const match = allProducts.find(p => p.id === item.product.id || (p.code && item.product.code && p.code === item.product.code));
                    if (match && match.imageBase64) {
                      rawImg = match.imageBase64;
                      mime = match.mimeType || mime;
                    }
                  }

                  const imgSrc = getImageSrc(rawImg, mime);

                  return (
                    <tr key={`${item.product.id}-${item.selectedSupplier}`} className="break-inside-avoid">
                      <td className="p-2.5 text-center font-semibold text-xs text-gray-800">{index + 1}</td>
                      <td className="p-2.5 text-center">
                        {imgSrc ? (
                          <img src={imgSrc} alt="" className="w-14 h-14 object-cover border border-gray-200 mx-auto rounded" />
                        ) : (
                          <div className="w-14 h-14 bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] text-gray-400 mx-auto rounded">Нет фото</div>
                        )}
                      </td>
                    <td className="p-2.5">
                      <div className="flex flex-col items-start gap-1">
                        {item.product.code ? (
                          <span className={`font-mono text-xs font-semibold px-1.5 py-0.5 rounded border ${(!item.selectedPrice || item.selectedPrice === Infinity) ? 'text-red-700 bg-red-50 border-red-200' : 'text-gray-500 bg-gray-100 border-gray-200'}`}>#{item.product.code}</span>
                        ) : (
                          <span className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border max-w-[100px] truncate ${(!item.selectedPrice || item.selectedPrice === Infinity) ? 'text-red-700 bg-red-50 border-red-200' : 'text-gray-400 bg-gray-50 border-gray-100'}`}>{item.product.id}</span>
                        )}
                        <span className="font-bold text-sm text-gray-900 leading-tight">
                          {item.product.name}
                        </span>
                      </div>
                    </td>
                    <td className="p-2.5 border-l border-gray-100 text-xs text-gray-700 leading-snug">
                      {item.product.description ? (
                        <div className="whitespace-pre-line break-words max-w-xs">{item.product.description}</div>
                      ) : (
                        <span className="text-gray-400 italic">—</span>
                      )}
                    </td>
                    <td className="p-2.5 text-right font-mono text-xs border-l border-gray-100">
                      {(!item.selectedPrice || item.selectedPrice === Infinity) ? (
                        <span className="text-red-600 font-bold">НЕТ ЦЕНЫ</span>
                      ) : (
                        `${Number(item.selectedPrice).toFixed(2)} с.`
                      )}
                    </td>
                    <td className="p-2.5 text-center font-mono font-medium text-gray-900 text-xs border-x border-gray-100">
                       {item.quantity} {item.product.unit || 'шт.'}
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-xs border-l border-gray-100">
                      {(!item.selectedPrice || item.selectedPrice === Infinity) ? (
                        <span className="text-red-600 font-bold">—</span>
                      ) : (
                        `${(Number(item.selectedPrice) * item.quantity).toFixed(2)} с.`
                      )}
                    </td>
                  </tr>
                );
              })}
                {/* Logistics cost and Total row directly in tbody to prevent multi-page tfoot repetition and overlapping issues */}
                {logisticsCost > 0 && (
                  <tr className="font-semibold text-sm bg-gray-50/50 break-inside-avoid border-t-2 border-black">
                     <td colSpan={6} className="p-3 text-right">Логистика ({selectedRegion || "Все регионы"}):</td>
                     <td className="p-3 text-right font-mono">
                         {logisticsCost.toFixed(2)} с.
                     </td>
                  </tr>
                )}
                <tr className="border-t-2 border-black font-bold text-sm bg-gray-50/80 break-inside-avoid">
                   <td colSpan={6} className="p-3 text-right uppercase">Итого к оплате:</td>
                   <td className="p-3 text-right font-mono whitespace-nowrap">
                       {total.toFixed(2)} с.
                   </td>
                </tr>
              </tbody>
            </table>

            {/* Signature block with EXACTLY 3 signatures as requested */}
            <div className="mt-12 grid grid-cols-3 gap-8 px-6 pt-8 border-t-2 border-slate-300 break-inside-avoid">
              {/* 1. ПОДПИСЬ БЕНЕФИЦИАРА */}
              <div className="text-center">
                <div className="w-full max-w-[210px] mx-auto border-b-2 border-slate-900 mb-2.5 min-h-[30px] flex items-end justify-center">
                  {/* Space for hand signature */}
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  ПОДПИСЬ БЕНЕФИЦИАРА
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-medium truncate">
                  {clientName ? `(${beneficiaryId ? `ID: ${beneficiaryId} • ` : ""}${clientName})` : "____________________"}
                </div>
              </div>

              {/* 2. ПОДПИСЬ ФАСИЛИТАТОРА */}
              <div className="text-center">
                <div className="w-full max-w-[210px] mx-auto border-b-2 border-slate-900 mb-2.5 min-h-[30px] flex items-end justify-center">
                  {/* Space for hand signature */}
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  ПОДПИСЬ ФАСИЛИТАТОРА
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-medium truncate">
                  {resolvedFacRep ? `(${resolvedFacRep})` : resolvedFacLegalName ? `(${resolvedFacLegalName})` : specialistName ? `(${specialistName})` : "____________________"}
                </div>
              </div>

              {/* 3. ПОДПИСЬ ПОСТАВЩИКА */}
              <div className="text-center">
                <div className="w-full max-w-[210px] mx-auto border-b-2 border-slate-900 mb-2.5 min-h-[30px] flex items-end justify-center">
                  {/* Space for hand signature */}
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  ПОДПИСЬ ПОСТАВЩИКА
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-medium truncate">
                  {supplierName ? `(${supplierName})` : "____________________"}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

PrintCartView.displayName = 'PrintCartView';
