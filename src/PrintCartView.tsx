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
}

export const PrintCartView = React.forwardRef<HTMLDivElement, Props>(({ cart, isPrinting, suppliers, logisticsCost = 0, selectedRegion = 'Душанбе' }, ref) => {
  if (!isPrinting) return null;

  const cartLinesTotal = cart.reduce((sum, item) => sum + (item.selectedPrice === Infinity ? 0 : (item.selectedPrice || 0)) * item.quantity, 0);
  const total = cartLinesTotal + (cart.length > 0 ? logisticsCost : 0);

  const getSupplierName = (supp?: 'supplier1' | 'supplier2' | 'supplier3' | 'supplier4' | string) => {
    if (!supp || supp === 'supplier1') return 'Логистика';
    const list = suppliers || [];
    if (supp === 'supplier2') return list[0] || 'Поставщик 1';
    if (supp === 'supplier3') return list[1] || 'Поставщик 2';
    if (supp === 'supplier4') return list[2] || 'Поставщик 3';
    return 'Логистика';
  };

  const selectedSuppliers = Array.from(new Set(
    cart.map(item => getSupplierName(item.selectedSupplier))
  ));

  return (
    <div ref={ref} className="hidden print:block p-8 bg-white text-black text-sm">
      <div className="flex items-center justify-between mb-6 border-b-2 border-black pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wider">Лист выборки товаров</h1>
          <p className="text-gray-600 mt-1">Официальный каталог продукции</p>
        </div>
        <div className="text-right">
          <p className="font-semibold">Дата формирования: {new Date().toLocaleDateString('ru-RU')}</p>
          <p className="text-gray-500">Документ сгенерирован автоматически</p>
        </div>
      </div>

      {/* Suppliers Header Section */}
      {selectedSuppliers.length > 0 && (
        <div className="mb-6 p-4 border border-gray-300 rounded-lg bg-gray-50/70">
          <div className="text-xs font-bold uppercase tracking-wider text-indigo-700 mb-2">Выбранные поставщики:</div>
          <div className="flex flex-wrap gap-4">
            {selectedSuppliers.map(s => {
              return (
                <div key={s} className="text-sm">
                  <div className="font-bold text-slate-950 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 block"></span>
                    <span>{s}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      <table className="w-full text-left border-collapse mb-8">
        <thead>
          <tr className="bg-gray-100 uppercase text-xs font-bold border-y-2 border-black">
            <th className="p-3 w-16">№</th>
            <th className="p-3 w-20">Фото</th>
            <th className="p-3">Наименование и Описание</th>
            <th className="p-3 w-48 font-semibold">Регион и Поставщик</th>
            <th className="p-3 w-24 text-right border-l border-gray-200">Цена</th>
            <th className="p-3 w-24 text-center border-l border-gray-200">Кол-во</th>
            <th className="p-3 w-28 text-right border-l border-gray-200">Сумма</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-300">
          {cart.map((item, index) => (
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
                <div className="font-bold text-base flex flex-wrap items-center gap-1.5">
                  {item.product.code ? (
                    <span className={`font-mono text-xs font-semibold px-1.5 py-0.5 rounded border ${item.selectedPrice === Infinity ? 'text-red-700 bg-red-50 border-red-200' : 'text-gray-500 bg-gray-100 border-gray-200'}`}>#{item.product.code}</span>
                  ) : (
                    <span className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border max-w-[100px] truncate ${item.selectedPrice === Infinity ? 'text-red-700 bg-red-50 border-red-200' : 'text-gray-400 bg-gray-50 border-gray-100'}`}>{item.product.id}</span>
                  )}
                  {item.product.name}
                </div>
                <div className="text-gray-600 font-serif mt-1">{item.product.description}</div>
              </td>
              <td className="p-3 text-xs flex flex-col gap-1 text-gray-700">
                <span className="font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded self-start">{item.product.region || '—'}</span>
                {item.selectedPrice !== Infinity && (
                  <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded self-start mt-1">
                    {getSupplierName(item.selectedSupplier)}
                  </span>
                )}
                <span className="italic text-gray-500 mt-1">{item.product.sphere}</span>
              </td>
              <td className="p-3 text-right font-mono border-l border-gray-100">
                {item.selectedPrice === Infinity ? <span className="text-red-600 font-bold">НЕТ ЦЕНЫ</span> : `${item.selectedPrice?.toFixed(2)} с.`}
              </td>
              <td className="p-3 text-center font-mono font-medium text-gray-900 border-x border-gray-100">
                 {item.quantity} {item.product.unit || 'шт.'}
              </td>
              <td className="p-3 text-right font-mono font-bold border-l border-gray-100">
                {item.selectedPrice === Infinity ? <span className="text-red-600 font-bold">—</span> : `${((item.selectedPrice || 0) * item.quantity).toFixed(2)} с.`}
              </td>
            </tr>
          ))}
          {/* Logitics cost and Total row directly in tbody to prevent multi-page tfoot repetition and overlapping issues */}
          {logisticsCost > 0 && (
            <tr className="font-semibold text-base bg-gray-50/50 break-inside-avoid border-t-2 border-black">
               <td colSpan={6} className="p-4 text-right">Логистика ({selectedRegion || "Все регионы"}):</td>
               <td className="p-4 text-right font-mono">
                   {logisticsCost.toFixed(2)} с.
               </td>
            </tr>
          )}
          <tr className="border-t-2 border-black font-bold text-lg bg-gray-50/80 break-inside-avoid">
             <td colSpan={6} className="p-4 text-right uppercase">Итого к оплате:</td>
             <td className="p-4 text-right font-mono">
                 {total.toFixed(2)} с.
             </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-12 flex justify-between px-12 pt-8 border-t border-gray-300">
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
});

PrintCartView.displayName = 'PrintCartView';
