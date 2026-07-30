import React from 'react';
import { Product } from './types';

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
  selectedSphere?: string;
  supplierPhones?: Record<string, string>;
  supplierLegalNames?: Record<string, string>;
  clientName?: string;
  facilitatorName?: string;
  note?: string;
  createdAt?: string;
}

export const PrintCartView = React.forwardRef<HTMLDivElement, Props>(({ cart, isPrinting, suppliers, logisticsCost = 0, selectedRegion = 'Душанбе', selectedSphere, supplierPhones, supplierLegalNames, clientName, facilitatorName, note, createdAt }, ref) => {
  if (!isPrinting) return null;

  // Filter cart items by selected sphere if provided
  let filteredCart = cart;
  if (selectedSphere) {
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
    const list = suppliers || [];
    if (supp === 'supplier2') return list[0] || 'Поставщик 1';
    if (supp === 'supplier3') return list[1] || 'Поставщик 2';
    if (supp === 'supplier4') return list[2] || 'Поставщик 3';
    return 'Логистика';
  };

  const suppliersInCart = Array.from(new Set(filteredCart.map(item => item.selectedSupplier || 'supplier2'))) as ('supplier1' | 'supplier2' | 'supplier3' | 'supplier4')[];

  return (
    <div ref={ref} className="hidden print:block bg-white text-black text-sm">
      {suppliersInCart.map((supplierKey, sIndex) => {
        const supplierItems = filteredCart.filter(item => (item.selectedSupplier || 'supplier2') === supplierKey);
        const supplierName = getSupplierName(supplierKey);
        const cartLinesTotal = supplierItems.reduce((sum, item) => {
          const p = (!item.selectedPrice || item.selectedPrice === Infinity) ? 0 : Number(item.selectedPrice);
          return sum + p * item.quantity;
        }, 0);
        const total = cartLinesTotal + (supplierItems.length > 0 ? logisticsCost : 0);

        return (
          <div 
            key={supplierKey} 
            className="flex flex-col p-8 bg-white text-black min-h-screen"
            style={{
              pageBreakAfter: sIndex < suppliersInCart.length - 1 ? 'always' : 'auto',
              breakAfter: sIndex < suppliersInCart.length - 1 ? 'page' : 'auto'
            }}
          >
            <div className="flex items-center justify-between mb-6 border-b-2 border-black pb-4">
              <div>
                <h1 className="text-2xl font-bold uppercase tracking-wider">Лист выборки товаров</h1>
                <p className="text-gray-600 mt-1">Официальный коммерческий пакет</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">Дата формирования: {createdAt || new Date().toLocaleDateString('ru-RU')}</p>
                <p className="text-gray-500">Документ сгенерирован автоматически</p>
              </div>
            </div>

            {/* Client, Facilitator, Supplier and Selection Parameters Header Section */}
            {clientName && (
              <div className="mb-4 p-4 border border-slate-300 rounded-lg bg-indigo-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-indigo-700">Заказчик (ФИО / Объект):</div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">{clientName}</div>
                </div>
                {facilitatorName && (
                  <div className="text-right">
                    <div className="text-xs font-semibold uppercase text-slate-500">Фасилитатор:</div>
                    <div className="text-sm font-bold text-slate-800">{facilitatorName}</div>
                  </div>
                )}
              </div>
            )}

            <div className="mb-6 grid grid-cols-2 gap-4">
              <div className="p-4 border border-gray-300 rounded-lg bg-gray-50/70">
                <div className="text-xs font-bold uppercase tracking-wider text-indigo-700 mb-2">Выбранный поставщик:</div>
                <div className="text-sm space-y-1">
                  <div className="font-bold text-slate-950 flex items-center gap-1.5 text-base">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 block"></span>
                    <span>{supplierName}</span>
                  </div>
                  {supplierLegalNames?.[supplierKey] && (
                    <div className="text-xs text-gray-700 font-medium pl-3 mt-1">
                      <span className="text-gray-500">Юридическое название:</span> {supplierLegalNames[supplierKey]}
                    </div>
                  )}
                  {supplierPhones?.[supplierKey] && (
                    <div className="text-xs text-gray-700 font-medium pl-3">
                      <span className="text-gray-500">Телефон:</span> {supplierPhones[supplierKey]}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border border-gray-300 rounded-lg bg-gray-50/70">
                <div className="text-xs font-bold uppercase tracking-wider text-indigo-700 mb-2">Параметры формирования листа:</div>
                <div className="text-sm space-y-1.5 mt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500">Регион:</span>
                    <span className="font-bold text-slate-900 bg-slate-200 px-2.5 py-0.5 rounded text-xs border border-slate-300">
                      {selectedRegion || "—"}
                    </span>
                  </div>
                  {note && (
                    <div className="text-xs text-slate-600 italic mt-1 pt-1 border-t border-slate-200">
                      Заметка: {note}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <table className="w-full text-left border-collapse mb-8">
              <thead>
                <tr className="bg-gray-100 uppercase text-xs font-bold border-y-2 border-black">
                  <th className="p-3 w-16">№</th>
                  <th className="p-3 w-20">Фото</th>
                  <th className="p-3">Наименование</th>
                  <th className="p-3 w-24 text-right border-l border-gray-200">Цена</th>
                  <th className="p-3 w-24 text-center border-l border-gray-200">Кол-во</th>
                  <th className="p-3 w-28 text-right border-l border-gray-200">Сумма</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300">
                {supplierItems.map((item, index) => (
                  <tr key={`${item.product.id}-${item.selectedSupplier}`} className="break-inside-avoid">
                    <td className="p-3 font-semibold">{index + 1}</td>
                    <td className="p-3">
                      {item.product.imageBase64 ? (
                        <img src={item.product.imageBase64} alt="" className="w-16 h-16 object-cover border border-gray-200" />
                      ) : (
                        <div className="w-16 h-16 bg-gray-100 border border-gray-200 flex items-center justify-center text-xs text-gray-400">Нет фото</div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col items-start gap-1">
                        {item.product.code ? (
                          <span className={`font-mono text-xs font-semibold px-1.5 py-0.5 rounded border ${(!item.selectedPrice || item.selectedPrice === Infinity) ? 'text-red-700 bg-red-50 border-red-200' : 'text-gray-500 bg-gray-100 border-gray-200'}`}>#{item.product.code}</span>
                        ) : (
                          <span className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border max-w-[100px] truncate ${(!item.selectedPrice || item.selectedPrice === Infinity) ? 'text-red-700 bg-red-50 border-red-200' : 'text-gray-400 bg-gray-50 border-gray-100'}`}>{item.product.id}</span>
                        )}
                        <span className="font-bold text-base text-gray-900 leading-tight">
                          {item.product.name}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono border-l border-gray-100">
                      {(!item.selectedPrice || item.selectedPrice === Infinity) ? (
                        <span className="text-red-600 font-bold">НЕТ ЦЕНЫ</span>
                      ) : (
                        `${Number(item.selectedPrice).toFixed(2)} с.`
                      )}
                    </td>
                    <td className="p-3 text-center font-mono font-medium text-gray-900 border-x border-gray-100">
                       {item.quantity} {item.product.unit || 'шт.'}
                    </td>
                    <td className="p-3 text-right font-mono font-bold border-l border-gray-100">
                      {(!item.selectedPrice || item.selectedPrice === Infinity) ? (
                        <span className="text-red-600 font-bold">—</span>
                      ) : (
                        `${(Number(item.selectedPrice) * item.quantity).toFixed(2)} с.`
                      )}
                    </td>
                  </tr>
                ))}
                {/* Logistics cost and Total row directly in tbody to prevent multi-page tfoot repetition and overlapping issues */}
                {logisticsCost > 0 && (
                  <tr className="font-semibold text-base bg-gray-50/50 break-inside-avoid border-t-2 border-black">
                     <td colSpan={5} className="p-4 text-right">Логистика ({selectedRegion || "Все регионы"}):</td>
                     <td className="p-4 text-right font-mono">
                         {logisticsCost.toFixed(2)} с.
                     </td>
                  </tr>
                )}
                <tr className="border-t-2 border-black font-bold text-base bg-gray-50/80 break-inside-avoid">
                   <td colSpan={5} className="p-4 text-right uppercase">Итого к оплате:</td>
                   <td className="p-4 text-right font-mono whitespace-nowrap">
                       {total.toFixed(2)} с.
                   </td>
                </tr>
              </tbody>
            </table>

            <div className="mt-12 flex justify-between px-12 pt-8 border-t border-gray-300 break-inside-avoid">
                <div className="text-center">
                    <div className="w-48 border-b border-black mb-2"></div>
                    <div className="text-xs font-semibold uppercase text-gray-500">Подпись клиента</div>
                </div>
                <div className="text-center">
                    <div className="w-48 border-b border-black mb-2"></div>
                    <div className="text-xs font-semibold uppercase text-gray-500">Подпись менеджера</div>
                </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

PrintCartView.displayName = 'PrintCartView';
