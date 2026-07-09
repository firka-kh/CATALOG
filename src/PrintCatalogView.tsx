import React from "react";
import { Product } from "./types";
import { Package, BookOpen } from "lucide-react";

export const PrintCatalogView = ({
  products,
  suppliers,
  printMode = "all",
  selectedRegion,
  selectedSupplier,
}: {
  products: Product[];
  suppliers?: string[];
  printMode?: 'all' | 'lowest';
  selectedRegion?: string;
  selectedSupplier?: "supplier1" | "supplier2" | "supplier3" | "supplier4" | null;
}) => {
  const getSupLabel = (
    sup: "supplier1" | "supplier2" | "supplier3" | "supplier4",
  ) => {
    if (sup === "supplier1") return "Логистика";
    const list = suppliers || [];
    if (sup === "supplier2") return list[0] || "Поставщик 1";
    if (sup === "supplier3") return list[1] || "Поставщик 2";
    return list[2] || "Поставщик 3";
  };

  const grouped = products.reduce(
    (acc, p) => {
      const sphere = p.sphere || "Общее";

      if (!acc[sphere]) acc[sphere] = [];

      acc[sphere].push(p);
      return acc;
    },
    {} as Record<string, Product[]>,
  );

  return (
    <div className="hidden print:block w-full font-sans bg-white text-black text-left notranslate" translate="no">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 10mm 10mm 10mm;
          }
          body {
            background: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            user-select: none !important;
            -webkit-user-select: none !important;
          }
          
          /* Cover page takes exact viewport space and breaks */
          .print-cover-page {
            page-break-after: always;
            break-after: page;
            height: 270mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            box-sizing: border-box;
            padding: 20mm 10mm;
          }

          /* Separate Region Intro Page centered exactly */
          .print-region-cover {
            page-break-before: always;
            break-before: page;
            page-break-after: always;
            break-after: page;
            height: 270mm;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            box-sizing: border-box;
            padding: 20mm;
          }
          
          /* Sphere section always starts on its own page */
          .print-sphere-section {
            page-break-before: always;
            break-before: page;
            padding-top: 5mm;
            page-break-inside: auto;
            break-inside: auto;
          }

          /* Extremely compact product cards preventing text/layout breaks */
          .print-product-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            box-sizing: border-box;
          }
          
          /* Grid showing exactly 6+ small elegant cards per page */
          .print-grid {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 12px !important;
          }
        }
      `}</style>

      {/* Page 1: Elegant Cover Page */}
      <div className="print-cover-page border-[6px] border-double border-slate-900 rounded-lg m-1">
        <div className="text-center w-full mt-8 border-b-2 border-slate-100 pb-8">
          <span className="text-xs font-bold uppercase tracking-[0.4em] text-slate-400 block mb-2">
            Каталог Товарных Категорий
          </span>
          <h1 className="text-5xl font-black uppercase tracking-wider text-slate-950 my-4 leading-tight">
            ОБЩИЙ КАТАЛОГ
          </h1>
          <div className="h-1 bg-slate-900 w-28 mx-auto mt-6 mb-2"></div>
          <p className="text-xs text-slate-500 font-mono tracking-widest mt-2">
            B2B СИСТЕМА ДИСТРИБЬЮЦИИ
          </p>
        </div>

        {/* Central Logo */}
        <div className="flex-1 flex items-center justify-center w-full py-10">
          <div className="relative w-64 h-64 flex items-center justify-center bg-white p-4">
            {/* 
              Пользователь может загрузить свой логотип в папку public с именем logo.png (или logo.jpg) 
            */}
            <img 
              src="/logo.png" 
              alt="Логотип" 
              className="w-full h-full object-contain"
              onError={(e) => {
                // Фоллбэк, если logo.png не найден
                e.currentTarget.style.display = "none";
                const fallback = document.getElementById("logo-fallback");
                if (fallback) fallback.style.display = "flex";
              }}
            />
            <div 
              id="logo-fallback" 
              className="absolute inset-0 hidden items-center justify-center flex-col text-slate-300 border-2 border-dashed border-slate-200 rounded-full"
            >
              <BookOpen className="w-20 h-20 mb-2 opacity-50" />
              <span className="text-[10px] uppercase font-bold tracking-widest">Логотип (logo.png)</span>
            </div>
          </div>
        </div>

        {/* Banner with secure fallbacks */}
        <div className="w-full flex justify-center my-4 max-w-lg hidden">
          <div className="w-full max-h-[85mm] overflow-hidden rounded-xl border border-slate-200 shadow-sm flex items-center justify-center bg-slate-50">
            <img
              src="/banner.jpg"
              alt="Баннер"
              className="w-full h-full object-contain max-h-[85mm]"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.parentElement!.style.display = "none";
              }}
            />
          </div>
        </div>

        <div className="text-center w-full mb-8">
          <div className="text-slate-700 text-xs font-bold uppercase tracking-[0.25em] leading-relaxed max-w-md mx-auto">
            {selectedSupplier && selectedRegion ? (
              <span>{getSupLabel(selectedSupplier)} • {selectedRegion}</span>
            ) : selectedSupplier ? (
              <span>{getSupLabel(selectedSupplier)}</span>
            ) : selectedRegion ? (
              <span>{selectedRegion}</span>
            ) : (
              <>
                {getSupLabel("supplier1")} • {getSupLabel("supplier2")} <br />
                {getSupLabel("supplier3")} • {getSupLabel("supplier4")}
              </>
            )}
          </div>
          <div className="border-t border-slate-200 pt-6 mt-8 max-w-sm mx-auto flex justify-between text-[11px] text-slate-400 font-mono tracking-wider">
            <span>ДАТА: {new Date().toLocaleDateString("ru-RU")}</span>
            <span>ПОЗИЦИЙ: {products.length}</span>
          </div>
        </div>
      </div>

      {/* Page 2+: Catalog Spheres */}
      {Object.entries(grouped).map(([sphere, prods]) => (
        <React.Fragment key={sphere}>
            <div className="print-sphere-section">
              {/* Header inside the Sphere page */}
              <div className="border-b-2 border-slate-900 pb-2 mb-4 flex justify-between items-end">
                <div>
                  <h3 className="text-lg font-black uppercase text-slate-950 tracking-tight flex items-center gap-2">
                    {sphere}
                  </h3>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {prods.length} тов.
                </div>
              </div>

              {/* 2-column grid of compact cards: Easily fits 3 rows (6 cards) or more per page */}
              <div className="print-grid grid grid-cols-2 gap-3 mb-6">
                {prods.map((p) => {
                  const specs = p.description
                    ? p.description
                        .split(/(?:;|\n|•)+/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                    : [];

                  return (
                    <div
                      key={p.id}
                      className="print-product-card border border-slate-200 rounded-lg p-3 flex flex-col justify-between min-h-[58mm] bg-white text-left"
                    >
                      {/* Top Bar with unit and code */}
                      <div>
                        <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 pb-1 mb-1.5">
                          <span className="font-mono text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100/50">
                            {p.code ? `#${p.code}` : `ID: ${p.id.substring(0, 5)}`}
                          </span>
                          <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
                            Уп.: {p.unit || "шт."}
                          </span>
                        </div>

                        {/* Info & Photo Row */}
                        <div className="flex gap-2.5">
                          {p.imageBase64 ? (
                            <img
                              src={
                                p.imageBase64.startsWith("data:")
                                  ? p.imageBase64
                                  : `data:${p.mimeType || "image/jpeg"};base64,${p.imageBase64}`
                              }
                              alt={p.name}
                              className="w-16 h-16 object-cover rounded-lg border border-slate-100 bg-slate-50 shrink-0"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-lg flex flex-col items-center justify-center text-slate-300 shrink-0">
                              <Package className="w-5 h-5 mb-0.5 opacity-40" />
                              <span className="text-[7px] uppercase tracking-wider font-semibold opacity-50">
                                Нет фото
                              </span>
                            </div>
                          )}

                          <div className="flex flex-col flex-1 min-w-0">
                            <h5 className="font-bold text-slate-900 text-[11.5px] leading-tight mb-1">
                              {p.name}
                            </h5>
                            
                            {specs.length > 0 ? (
                              <div className="space-y-0.5 text-[8px] text-slate-600 leading-tight">
                                {specs.map((spec, sIdx) => (
                                  <div key={sIdx} className="flex items-start gap-1">
                                    <span className="text-indigo-500 font-bold select-none shrink-0 text-[9px] leading-[8px]">•</span>
                                    <span className="break-words font-medium">{spec}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[8.5px] text-slate-400 italic leading-tight">
                                Без описания
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                    {/* Sequential pricing list under each other or Lowest Price */}
                    <div className="border border-slate-100 bg-slate-50/70 rounded-lg p-2 space-y-1">
                      {printMode === 'all' ? (
                        <div className="w-full flex flex-col gap-1">
                          <div className="flex justify-between items-center text-[8.5px] pb-1 border-b border-slate-200/40">
                            <span className="text-slate-400 font-medium truncate max-w-[124px]">{getSupLabel("supplier2")}:</span>
                            <span className="font-bold text-slate-900">
                              {p.priceSupplier2 !== undefined && p.priceSupplier2 > 0
                                ? `${p.priceSupplier2} с.`
                                : "—"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[8.5px] pb-1 border-b border-slate-200/40">
                            <span className="text-slate-400 font-medium truncate max-w-[124px]">{getSupLabel("supplier3")}:</span>
                            <span className="font-bold text-slate-900">
                              {p.priceSupplier3 !== undefined && p.priceSupplier3 > 0
                                ? `${p.priceSupplier3} с.`
                                : "—"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[8.5px]">
                            <span className="text-slate-400 font-medium truncate max-w-[124px]">{getSupLabel("supplier4")}:</span>
                            <span className="font-bold text-slate-900">
                              {p.priceSupplier4 !== undefined && p.priceSupplier4 > 0
                                ? `${p.priceSupplier4} с.`
                                : "—"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center text-[10px] py-1">
                          <span className="text-slate-500 font-medium uppercase tracking-wider">Лучшая цена:</span>
                          <span className="font-bold text-indigo-700 text-[12px]">
                            {(() => {
                              const prices = [p.priceSupplier2, p.priceSupplier3, p.priceSupplier4]
                                .filter((val): val is number => val !== undefined && val > 0);
                              if (prices.length === 0) return "—";
                              const minPrice = Math.min(...prices);
                              return `${minPrice} с.`;
                            })()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
        </React.Fragment>
      ))}
    </div>
  );
};
