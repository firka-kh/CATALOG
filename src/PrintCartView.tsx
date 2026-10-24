import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Product } from './types';
import { formatSupplierCode } from './lib/supplierUtils';
import {
  Mail,
  Phone,
  User,
  UserCheck,
  Building2,
  MapPin,
  Navigation,
  FileText,
  Briefcase,
  Truck,
  ShieldCheck,
  QrCode,
} from 'lucide-react';

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
  // Resolve client and beneficiary details with multiple robust fallbacks
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  let cachedPrintMeta: any = null;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem("spmei_pending_print_meta");
      if (raw) cachedPrintMeta = JSON.parse(raw);
    } catch (_) {}
  }

  const effectiveClientName = (
    clientName ||
    cachedPrintMeta?.cartPrintMetadata?.clientName ||
    cachedPrintMeta?.clientName ||
    urlParams?.get('clientName') ||
    ""
  ).trim();

  const effectiveBeneficiaryId = (
    beneficiaryId ||
    cachedPrintMeta?.cartPrintMetadata?.beneficiaryId ||
    cachedPrintMeta?.beneficiaryId ||
    urlParams?.get('beneficiaryId') ||
    ""
  ).trim();

  const effectiveQuoteId =
    quoteId ||
    cachedPrintMeta?.cartPrintMetadata?.quoteId ||
    urlParams?.get('quoteId') ||
    (effectiveBeneficiaryId ? `QP-${effectiveBeneficiaryId}` : `QP-${Date.now().toString(36).toUpperCase()}`);

  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let origin = window.location.origin;
    if (origin.includes('ais-dev-')) {
      origin = origin.replace('ais-dev-', 'ais-pre-');
    }
    const verifyUrl = `${origin}/?verify=${encodeURIComponent(effectiveQuoteId)}`;

    QRCode.toDataURL(verifyUrl, {
      width: 360,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate verification QR in PrintCartView:', err));
  }, [effectiveQuoteId]);

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

  // Cart items to display in coupon (always include all items in the coupon/cart)
  const cartItems = (cart && Array.isArray(cart)) ? cart : [];

  const getItemPrice = (item: CartItem): number => {
    if (typeof item.selectedPrice === 'number' && !isNaN(item.selectedPrice) && item.selectedPrice !== Infinity && item.selectedPrice > 0) {
      return item.selectedPrice;
    }
    const parsed = Number(item.selectedPrice);
    if (!isNaN(parsed) && parsed !== Infinity && parsed > 0) {
      return parsed;
    }
    const supp = item.selectedSupplier || 'supplier2';
    const regionPrice = item.product?.prices?.[supp]?.[selectedRegion];
    if (typeof regionPrice === 'number' && !isNaN(regionPrice) && regionPrice > 0) {
      return regionPrice;
    }
    if (typeof item.product?.price === 'number' && !isNaN(item.product.price) && item.product.price > 0) {
      return item.product.price;
    }
    return 0;
  };

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

  const suppliersInCart = Array.from(
    new Set(cartItems.map(item => item.selectedSupplier || 'supplier2'))
  ) as ('supplier1' | 'supplier2' | 'supplier3' | 'supplier4')[];

  const grandItemsTotal = cartItems.reduce((sum, item) => {
    return sum + getItemPrice(item) * (item.quantity || 1);
  }, 0);
  const grandTotal = grandItemsTotal + (cartItems.length > 0 ? (logisticsCost || 0) : 0);

  return (
    <div ref={ref} className="hidden print:block bg-white text-black text-sm">
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 6mm;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            height: auto !important;
            min-height: 0 !important;
          }
          tfoot {
            display: table-row-group !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>

      <div className="flex flex-col p-3 bg-white text-slate-900">
        {/* Document Header - First Page Only */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-300">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold uppercase tracking-wider text-slate-900">КУПОН</h1>
              {effectiveQuoteId && (
                <span className="font-mono text-sm font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  № {effectiveQuoteId}
                </span>
              )}
            </div>
            {effectiveBeneficiaryId && (
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Идентификатор бенефициара: <strong className="text-slate-800">{effectiveBeneficiaryId}</strong>
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-800">
              Дата: {createdAt || new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-[11px] text-slate-400">Автоматизированная система учета</p>
          </div>
        </div>

        {/* 3-Column Metadata Card - Clean, Flat, Hairline Borders */}
        <div className="mb-2.5 grid grid-cols-3 gap-2.5 items-stretch break-inside-avoid">
          {/* Column 1: Client & Geographic Parameters */}
          <div className="p-2.5 border border-slate-200 rounded-lg bg-slate-50/50 flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2.5 pb-1 border-b border-slate-200 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span>1. Заказчик</span>
                </span>
                <span className="text-[10px] font-semibold text-slate-500">Клиент</span>
              </div>
              
              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Бенефициар:</span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5 flex items-center gap-1.5 flex-wrap">
                    {effectiveBeneficiaryId && (
                      <span className="bg-slate-800 text-white font-mono text-[11px] px-1.5 py-0.2 rounded font-bold">
                        ID: {effectiveBeneficiaryId}
                      </span>
                    )}
                    <span>{effectiveClientName || "—"}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 text-xs">
                  <span className="text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    <span>Регион:</span>
                  </span>
                  <span className="font-semibold text-slate-800">{selectedRegion || "—"}</span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 text-xs">
                  <span className="text-slate-500 flex items-center gap-1">
                    <Navigation className="w-3 h-3 text-slate-400" />
                    <span>Район:</span>
                  </span>
                  <span className="font-semibold text-slate-800">{selectedDistrict || "—"}</span>
                </div>

                {note && (
                  <div className="pt-1 border-t border-slate-200/70 text-[11px]">
                    <span className="text-slate-400 block">Заметка:</span>
                    <span className="text-slate-700 italic block mt-0.5">{note}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Column 2: Facilitator Organization Information */}
          <div className="p-3.5 border border-slate-200 rounded-lg bg-slate-50/50 flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2.5 pb-1 border-b border-slate-200 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>2. Фасилитатор</span>
                </span>
                <span className="text-[10px] font-semibold text-slate-500">Организация</span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Юр. лицо / Название:</span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {resolvedFacLegalName || facilitatorName || "—"}
                  </div>
                </div>

                {resolvedFacRep && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 text-xs">
                    <span className="text-slate-500">Представитель:</span>
                    <span className="font-semibold text-slate-800 text-right">{resolvedFacRep}</span>
                  </div>
                )}

                {resolvedFacPhone && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 text-xs">
                    <span className="text-slate-500">Тел:</span>
                    <span className="font-mono font-semibold text-slate-800">{resolvedFacPhone}</span>
                  </div>
                )}

                {resolvedFacEmail && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 text-xs">
                    <span className="text-slate-500">Email:</span>
                    <span className="font-medium text-slate-700 text-[11px]">{resolvedFacEmail}</span>
                  </div>
                )}

                {specialistName && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 text-xs">
                    <span className="text-slate-500">Специалист:</span>
                    <span className="font-bold text-slate-900">{specialistName}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Column 3: Selected Supplier(s) */}
          <div className="p-3.5 border border-slate-200 rounded-lg bg-slate-50/50 flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2.5 pb-1 border-b border-slate-200 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {suppliersInCart.length > 1
                      ? `3. Поставщики (${suppliersInCart.length})`
                      : "3. Поставщик"}
                  </span>
                </span>
                <span className="text-[10px] font-semibold text-slate-500">Поставщик</span>
              </div>

              {suppliersInCart.length <= 1 ? (
                <div className="space-y-1.5 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">Код поставщика:</span>
                    <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      {suppliersInCart[0] ? getSupplierName(suppliersInCart[0]) : "—"}
                    </div>
                  </div>

                  {suppliersInCart[0] && supplierPhones?.[suppliersInCart[0]] && (
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 text-xs">
                      <span className="text-slate-500">Тел:</span>
                      <span className="font-mono font-semibold text-slate-800">{supplierPhones[suppliersInCart[0]]}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 text-xs">
                    <span className="text-slate-500">Сфера:</span>
                    <span className="font-medium text-slate-800 truncate max-w-[130px]">{selectedSphere || "Все сферы"}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 text-xs">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Поставщики в купоне:</span>
                  <div className="space-y-1 max-h-[110px] overflow-y-auto">
                    {suppliersInCart.map((sKey) => {
                      const sName = getSupplierName(sKey);
                      const sPhone = supplierPhones?.[sKey];
                      const sItems = cartItems.filter(it => (it.selectedSupplier || 'supplier2') === sKey);
                      return (
                        <div key={sKey} className="flex items-center justify-between py-1 px-1.5 bg-white rounded border border-slate-200 text-xs">
                          <span className="font-mono font-bold text-slate-900">{sName}</span>
                          <span className="text-[11px] text-slate-500">
                            {sItems.length} поз. {sPhone ? `• ${sPhone}` : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 text-xs">
                    <span className="text-slate-500">Сфера:</span>
                    <span className="font-medium text-slate-800 truncate max-w-[130px]">{selectedSphere || "Все сферы"}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Goods Tables by Supplier */}
        {(() => {
          let runningItemIndex = 0;
          return suppliersInCart.map((supplierKey, sIndex) => {
            const supplierItems = cartItems.filter(item => (item.selectedSupplier || 'supplier2') === supplierKey);
            const supplierName = getSupplierName(supplierKey);
            const supplierSubtotal = supplierItems.reduce((sum, item) => {
              return sum + getItemPrice(item) * (item.quantity || 1);
            }, 0);

            const isNewPage = sIndex > 0;

            return (
              <div 
                key={supplierKey}
                style={isNewPage ? { breakBefore: 'page', pageBreakBefore: 'always' } : undefined}
                className={isNewPage ? "pt-2" : ""}
              >
                {/* Clean Supplier Header */}
                <div className="mb-2 pb-1 border-b border-slate-400 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs uppercase tracking-wider text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                      ПОСТАВЩИК — {supplierName}
                    </span>
                    {supplierPhones?.[supplierKey] && (
                      <span className="text-xs text-slate-500 font-mono">
                        тел: {supplierPhones[supplierKey]}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {suppliersInCart.length > 1 && (
                      <span className="mr-2 text-slate-400 font-mono">
                        Раздел {sIndex + 1} из {suppliersInCart.length}
                      </span>
                    )}
                    <span>Позиций: <strong className="text-slate-900">{supplierItems.length}</strong></span>
                  </div>
                </div>

                {/* Streamlined Clean Table */}
                <table className="w-full text-left border-collapse border border-slate-200 mb-2">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-700 uppercase text-[10px] font-semibold border-b border-slate-300">
                      <th className="py-1 px-2 w-8 text-center border-r border-slate-200">№</th>
                      <th className="py-1.5 px-2 w-24 text-center border-r border-slate-200">Фото</th>
                      <th className="py-1 px-2.5 w-1/4 border-r border-slate-200">Наименование</th>
                      <th className="py-1 px-2 w-44 max-w-[190px] border-r border-slate-200">Технические характеристики</th>
                      <th className="py-1 px-2.5 w-24 text-right border-r border-slate-200">Цена</th>
                      <th className="py-1 px-2 w-16 text-center border-r border-slate-200">Кол-во</th>
                      <th className="py-1 px-2.5 w-28 text-right">Сумма</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {supplierItems.map((item) => {
                      runningItemIndex++;
                      const currentItemNum = runningItemIndex;
                      const unitPrice = getItemPrice(item);
                      const rowTotal = unitPrice * (item.quantity || 1);

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
                        <tr key={`${item.product.id}-${item.selectedSupplier}`} className="break-inside-avoid hover:bg-slate-50/50">
                          <td className="py-1 px-2 text-center font-medium text-slate-500 border-r border-slate-200">{currentItemNum}</td>
                          <td className="py-1.5 px-2 text-center border-r border-slate-200">
                            {imgSrc ? (
                              <img
                                src={imgSrc}
                                alt=""
                                className="w-20 h-20 object-contain bg-white border border-slate-200 mx-auto rounded p-0.5"
                              />
                            ) : (
                              <div className="w-20 h-20 bg-slate-50 border border-slate-200 flex items-center justify-center text-[9px] text-slate-400 mx-auto rounded">
                                Нет фото
                              </div>
                            )}
                          </td>
                          <td className="py-1 px-2.5 border-r border-slate-200">
                            <div className="flex flex-col items-start gap-0.5">
                              {item.product.code && (
                                <span className="font-mono text-[9px] text-slate-500 font-semibold leading-tight">
                                  #{item.product.code}
                                </span>
                              )}
                              <span className="font-semibold text-slate-900 leading-snug">
                                {item.product.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-1 px-2 border-r border-slate-200 text-slate-600 leading-tight text-[10px] w-44 max-w-[190px]">
                            {item.product.description ? (
                              <div className="whitespace-pre-line break-words max-h-24 overflow-hidden">{item.product.description}</div>
                            ) : (
                              <span className="text-slate-300 italic">—</span>
                            )}
                          </td>
                          <td className="py-1 px-2.5 text-right font-mono text-slate-800 border-r border-slate-200">
                            {unitPrice <= 0 ? (
                              <span className="text-rose-600 font-semibold">НЕТ ЦЕНЫ</span>
                            ) : (
                              `${unitPrice.toFixed(2)} с.`
                            )}
                          </td>
                          <td className="py-1 px-2 text-center font-mono text-slate-800 border-r border-slate-200">
                            {item.quantity} {item.product.unit || 'шт.'}
                          </td>
                          <td className="py-1 px-2.5 text-right font-mono font-bold text-slate-900">
                            {unitPrice <= 0 ? (
                              <span className="text-rose-600 font-semibold">—</span>
                            ) : (
                              `${rowTotal.toFixed(2)} с.`
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Итого по товарам / поставщику - размещено в конце tbody, чтобы выводиться строго в конце таблицы и не повторяться на каждой печатной странице */}
                    <tr className="bg-slate-100 font-bold text-xs border-t-2 border-slate-300 break-inside-avoid">
                      <td colSpan={6} className="py-1.5 px-2.5 text-right text-slate-700 uppercase tracking-wide">
                        {suppliersInCart.length > 1 ? `Подытог (${supplierName}):` : 'Итого по товарам:'}
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-mono font-bold text-slate-900">
                        {supplierSubtotal.toFixed(2)} с.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          });
        })()}

        {/* Row above signatures: Verification QR (Left) and Summary Totals (Right) */}
        <div className="flex items-end justify-between gap-6 mb-3 break-inside-avoid">
          {/* Enhanced High-Contrast Verification QR (Left) */}
          <div className="flex items-center gap-3.5 p-2 bg-slate-50 border border-slate-300 rounded-lg">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR-код проверки подлинности"
                className="w-24 h-24 object-contain rounded bg-white p-1 border border-slate-300 shrink-0"
              />
            ) : (
              <div className="w-24 h-24 bg-white flex items-center justify-center border border-dashed border-slate-300 rounded shrink-0">
                <QrCode className="w-8 h-8 text-slate-400 animate-pulse" />
              </div>
            )}
            <div className="text-left pr-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-900 leading-tight">
                Электронный контроль
              </div>
              <div className="text-[9px] text-slate-500 mt-1 leading-snug max-w-[160px]">
                Проверка подлинности бланка через сканер или камеру смартфона
              </div>
              {effectiveQuoteId && (
                <div className="text-[9px] text-slate-700 font-mono mt-1.5 font-bold bg-white px-2 py-0.5 rounded border border-slate-200 inline-block" title={effectiveQuoteId}>
                  № {effectiveQuoteId}
                </div>
              )}
            </div>
          </div>

          {/* Clean Summary Totals (Right) */}
          <div className="border border-slate-300 rounded-lg p-2.5 bg-slate-50/60 max-w-xs w-full">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between items-center text-slate-700">
                <span className="font-medium">Сумма товаров:</span>
                <span className="font-mono font-bold text-slate-900">{grandItemsTotal.toFixed(2)} с.</span>
              </div>
              {logisticsCost > 0 && (
                <div className="flex justify-between items-center text-slate-700 pb-1 border-b border-slate-200">
                  <span className="font-medium">Логистика ({selectedRegion || "Все регионы"}):</span>
                  <span className="font-mono font-bold text-slate-900">{logisticsCost.toFixed(2)} с.</span>
                </div>
              )}
              <div className="flex justify-between items-center text-xs font-bold text-slate-900 pt-1 border-t border-slate-300">
                <span className="uppercase tracking-wider">ИТОГО К ОПЛАТЕ:</span>
                <span className="font-mono text-sm font-extrabold text-blue-700">{grandTotal.toFixed(2)} с.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Physical Signatures - lowered to the bottom, without full-width divider line */}
        <div className="mt-8 grid grid-cols-3 gap-8 pt-2 break-inside-avoid items-start">
          {/* 1. Бенефициар (первый блок: Заявка, второй блок: Принял) */}
          <div className="text-center flex flex-col items-center gap-6">
            {/* Первый блок: Бенефициар - ЗАЯВКА */}
            <div className="w-full flex flex-col items-center">
              <div className="w-full max-w-[220px] flex flex-col items-center">
                <span className="text-[10px] text-slate-400 font-normal tracking-wide select-none" style={{ color: '#94a3b8' }}>
                  подпись
                </span>
                <div className="w-full border-b-2 border-slate-500 mb-2 mt-0.5" style={{ borderColor: '#64748b' }} />
              </div>
              <div className="text-[12px] font-black uppercase tracking-wider text-slate-900">
                БЕНЕФИЦИАР
              </div>
              <div className="min-h-[28px] flex flex-col items-center justify-center mt-1 px-1">
                {effectiveClientName ? (
                  <span className="text-xs font-black text-slate-900 tracking-tight leading-tight block">
                    {effectiveClientName}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 italic">
                    ФИО бенефициара не указано
                  </span>
                )}
                {effectiveBeneficiaryId && (
                  <span className="font-mono text-[10px] text-slate-600 font-bold mt-0.5 block">
                    ID: {effectiveBeneficiaryId}
                  </span>
                )}
              </div>
              <div className="mt-2">
                <span
                  className="inline-block text-blue-600 text-xs font-black tracking-wider uppercase"
                  style={{ color: '#2563eb' }}
                >
                  ЗАЯВКА
                </span>
              </div>
            </div>

            {/* Второй блок: Бенефициар - ПРИНЯЛ */}
            <div className="w-full flex flex-col items-center">
              <div className="w-full max-w-[220px] flex flex-col items-center">
                <span className="text-[10px] text-slate-400 font-normal tracking-wide select-none" style={{ color: '#94a3b8' }}>
                  подпись
                </span>
                <div className="w-full border-b-2 border-slate-500 mb-2 mt-0.5" style={{ borderColor: '#64748b' }} />
              </div>
              <div className="text-[12px] font-black uppercase tracking-wider text-slate-900">
                БЕНЕФИЦИАР
              </div>
              <div className="min-h-[28px] flex flex-col items-center justify-center mt-1 px-1">
                {effectiveClientName ? (
                  <span className="text-xs font-black text-slate-900 tracking-tight leading-tight block">
                    {effectiveClientName}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 italic">
                    ФИО бенефициара не указано
                  </span>
                )}
                {effectiveBeneficiaryId && (
                  <span className="font-mono text-[10px] text-slate-600 font-bold mt-0.5 block">
                    ID: {effectiveBeneficiaryId}
                  </span>
                )}
              </div>
              <div className="mt-2">
                <span
                  className="inline-block text-blue-600 text-xs font-black tracking-wider uppercase"
                  style={{ color: '#2563eb' }}
                >
                  ПРИНЯЛ
                </span>
              </div>
            </div>
          </div>

          {/* 2. ГРП МТМЗН РТ */}
          <div className="text-center flex flex-col items-center justify-between">
            <div className="w-full max-w-[220px] flex flex-col items-center">
              <span className="text-[10px] text-slate-400 font-normal tracking-wide select-none" style={{ color: '#94a3b8' }}>
                подпись
              </span>
              <div className="w-full border-b-2 border-slate-500 mb-2 mt-0.5" style={{ borderColor: '#64748b' }} />
            </div>
            <div className="text-[12px] font-black uppercase tracking-wider text-slate-900">
              ГРП МТМЗН РТ
            </div>
            <div className="min-h-[30px] flex items-center justify-center mt-1 px-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider select-none">
                ОФИЦИАЛЬНЫЙ КОНТРОЛЬ
              </span>
            </div>
            <div className="mt-2.5">
              <span
                className="inline-block text-blue-600 text-xs font-black tracking-wider uppercase"
                style={{ color: '#2563eb' }}
              >
                ОДОБРИЛ
              </span>
            </div>
          </div>

          {/* 3. Поставщик */}
          <div className="text-center flex flex-col items-center justify-between">
            <div className="w-full max-w-[220px] flex flex-col items-center">
              <span className="text-[10px] text-slate-400 font-normal tracking-wide select-none" style={{ color: '#94a3b8' }}>
                подпись
              </span>
              <div className="w-full border-b-2 border-slate-500 mb-2 mt-0.5" style={{ borderColor: '#64748b' }} />
            </div>
            <div className="text-[12px] font-black uppercase tracking-wider text-slate-900">
              ПОСТАВЩИК
            </div>
            <div className="min-h-[30px] flex items-center justify-center mt-1 px-1">
              <span className="text-[11px] text-slate-800 font-bold truncate max-w-[220px]">
                {suppliersInCart.length > 0
                  ? suppliersInCart.map(s => getSupplierName(s)).join(', ')
                  : "SPMEI-100"}
              </span>
            </div>
            <div className="mt-2.5">
              <span
                className="inline-block text-blue-600 text-xs font-black tracking-wider uppercase"
                style={{ color: '#2563eb' }}
              >
                СДАЛ
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

PrintCartView.displayName = 'PrintCartView';
