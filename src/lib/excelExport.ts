import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Product } from '../types';
import { formatSupplierCode } from './supplierUtils';

/**
 * Converts any image DataURL (including WebP, AVIF, HEIC, etc.)
 * into a clean JPEG/PNG Base64 string compatible with Microsoft Office 2024.
 */
async function processImageForExcel(dataUrl: string): Promise<{ base64: string; extension: 'jpeg' | 'png' } | null> {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
    return null;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const maxDim = 300; // Optimal size for Excel cell thumbnails
        let w = img.width || 120;
        let h = img.height || 120;

        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        // Fill white background (handles transparent PNGs nicely when converted to JPEG)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const jpegUrl = canvas.toDataURL('image/jpeg', 0.88);
        const base64Data = jpegUrl.replace(/^data:image\/jpeg;base64,/, '');
        resolve({ base64: base64Data, extension: 'jpeg' });
      } catch (e) {
        console.error("Canvas export failed:", e);
        const matches = dataUrl.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches[2]) {
          const format = matches[1].toLowerCase();
          const ext: 'jpeg' | 'png' = format === 'png' ? 'png' : 'jpeg';
          resolve({ base64: matches[2], extension: ext });
        } else {
          resolve(null);
        }
      }
    };
    img.onerror = () => {
      const matches = dataUrl.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches[2]) {
        const format = matches[1].toLowerCase();
        const ext: 'jpeg' | 'png' = format === 'png' ? 'png' : 'jpeg';
        resolve({ base64: matches[2], extension: ext });
      } else {
        resolve(null);
      }
    };
    img.src = dataUrl;
  });
}

export async function downloadCatalogExcel(
  products: Product[],
  suppliers?: string[],
  selectedSupplierScope?: 'supplier2' | 'supplier3' | 'supplier4',
  globalDict?: any
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AI Catalog Creator';
  workbook.created = new Date();

  const getSupLabel = (sup: 'supplier2' | 'supplier3' | 'supplier4', withCurrency = false) => {
    const suffix = withCurrency ? ' (с.)' : '';
    const list = suppliers || [];
    const idx = sup === 'supplier2' ? 0 : sup === 'supplier3' ? 1 : 2;
    const code = formatSupplierCode(sup, list[idx], idx);
    return `${code}${suffix}`;
  };

  const activeSuppliers = selectedSupplierScope 
     ? [selectedSupplierScope] 
     : ['supplier2', 'supplier3', 'supplier4'] as const;

  // Create Summary Sheet First
  const summaryWs = workbook.addWorksheet('Сводная таблица');

  summaryWs.getColumn(1).width = 8;   // ID/No
  summaryWs.getColumn(2).width = 40;  // Name
  summaryWs.getColumn(3).width = 12;  // Unit
  
  let colIdx = 4;
  activeSuppliers.forEach(() => {
     summaryWs.getColumn(colIdx).width = 15;
     colIdx++;
  });

  const summaryProductsGrouped: Record<string, Product[]> = {};
  for (const p of products) {
      const pSpheres = p.spheres && p.spheres.length > 0 ? p.spheres : [p.sphere || "-"];
      for (const sphere of pSpheres) {
          const key = `${sphere.toUpperCase()}`;
          if (!summaryProductsGrouped[key]) {
              summaryProductsGrouped[key] = [];
          }
          summaryProductsGrouped[key].push(p);
      }
  }

  let rowCounter = 1;

  const numCols = 3 + activeSuppliers.length;
  const colLetter = String.fromCharCode(64 + numCols);

  for (const [groupName, groupProds] of Object.entries(summaryProductsGrouped)) {
      // Title row
      const titleRow = summaryWs.addRow([groupName]);
      summaryWs.mergeCells(`A${rowCounter}:${colLetter}${rowCounter}`);
      titleRow.font = { bold: true, size: 12 };
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
      titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF08020' } }; // Orange
      for (let c = 1; c <= numCols; c++) {
          const cell = summaryWs.getCell(rowCounter, c);
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      }
      
      rowCounter++;

      // Header row
      const headers = ['№', 'Наименование', 'Ед. изм.', ...activeSuppliers.map(s => getSupLabel(s, true))];
      const headerRow = summaryWs.addRow(headers);
      headerRow.font = { bold: true, color: { argb: 'FF004B87' } }; // Blue text
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow.eachCell(cell => {
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      
      rowCounter++;

      // Empty gap row with borders (as seen in screenshot)
      const gapRow = summaryWs.addRow(Array(numCols).fill(''));
      gapRow.eachCell(cell => {
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      
      rowCounter++;

      // Data rows
      for (let i = 0; i < groupProds.length; i++) {
          const p = groupProds[i];
          const rowData = [
            p.code || (i + 1), 
            p.name, 
            p.unit || 'шт.', 
            ...activeSuppliers.map(s => {
                const mapId = s === 'supplier2' ? 'priceSupplier2' : s === 'supplier3' ? 'priceSupplier3' : 'priceSupplier4';
                const val = p[mapId as keyof Product];
                return val !== undefined ? val : '—';
            })
          ];
          const dataRow = summaryWs.addRow(rowData);
          dataRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
          dataRow.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
          for (let c = 4; c <= numCols; c++) {
              dataRow.getCell(c).alignment = { horizontal: 'right', vertical: 'middle' };
          }
          dataRow.eachCell(cell => {
              cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          });
          rowCounter++;
      }
      
      summaryWs.addRow([]);
      rowCounter++;
  }

  // Group products by Sphere
  const groupedProducts: Record<string, Product[]> = {};
  for (const p of products) {
      const spheresToGroup = p.spheres && p.spheres.length > 0 ? p.spheres : [p.sphere || "Общее"];
      for (const sphere of spheresToGroup) {
          if (!groupedProducts[sphere]) {
              groupedProducts[sphere] = [];
          }
          groupedProducts[sphere].push(p);
      }
  }

  for (const [sphere, prods] of Object.entries(groupedProducts)) {
    // Sheet names can't exceed 31 characters
    const safeSphereName = sphere.substring(0, 31).replace(/[\\/*?:\[\]]/g, '');
    const ws = workbook.addWorksheet(safeSphereName);

    // Row 1: Sphere
    const titleRow = ws.addRow([`Сфера: ${sphere}`]);
    titleRow.font = { bold: true, size: 12 };
    
    const numCols = 4 + activeSuppliers.length;
    const colLetter = String.fromCharCode(64 + numCols);
    ws.mergeCells(`A1:${colLetter}1`);

    // Row 2: Empty
    ws.addRow([]);

    // Row 3: Headers
    const headers = ['№', 'Фото', 'Наименование', 'Ед. изм.', ...activeSuppliers.map(s => getSupLabel(s, true))];
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FF333333' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFDDDDDD' }
        };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
    });

    // Columns width
    ws.getColumn(1).width = 8;  // ID/No
    ws.getColumn(2).width = 18; // Photo
    ws.getColumn(3).width = 40; // Name
    ws.getColumn(4).width = 10; // Unit
    
    let cIdx = 5;
    activeSuppliers.forEach(() => {
        ws.getColumn(cIdx).width = 15;
        cIdx++;
    });

    let rowIndex = 4;
    for (let i = 0; i < prods.length; i++) {
        const p = prods[i];
        
        // Add row data
        const rowData = [
            p.code || (i + 1),
            '', // Image goes here
            p.name + (p.description ? `\n\n${p.description}` : ''),
            p.unit || 'шт.',
            ...activeSuppliers.map(s => {
                const mapId = s === 'supplier2' ? 'priceSupplier2' : s === 'supplier3' ? 'priceSupplier3' : 'priceSupplier4';
                const val = p[mapId as keyof Product];
                return val !== undefined ? val : '—';
            })
        ];
        const row = ws.addRow(rowData);
        
        row.height = 100;
        row.alignment = { vertical: 'middle', wrapText: true };
        
        row.eachCell((cell, colNumber) => {
            cell.border = {
                top: { style: 'thin' }, 
                left: { style: 'thin' }, 
                bottom: { style: 'thin' }, 
                right: { style: 'thin' }
            };
            if (colNumber === 1 || colNumber === 4 || colNumber >= 5) {
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            }
        });

        // Add image (processed for MS Office 2024 compatibility)
        if (p.imageBase64) {
            try {
                const imgData = await processImageForExcel(p.imageBase64);
                if (imgData) {
                    const imageId = workbook.addImage({
                        base64: imgData.base64,
                        extension: imgData.extension,
                    });
                    
                    ws.addImage(imageId, {
                        tl: { col: 1, row: rowIndex - 1 },
                        ext: { width: 110, height: 110 },
                        editAs: 'oneCell'
                    });
                }
            } catch (e) {
                console.error("Error adding image to excel", e);
            }
        }
        rowIndex++;
    }
  }

  // If globalDict is provided (e.g. Full Dump), append the complete Facilitators Registry sheet
  if (globalDict) {
    const DEFAULT_FAC_FALLBACK: Record<string, { legalName: string; rep: string; phone: string; email: string; region: string; pin: string }> = {
      facilitator2: {
        legalName: "ОО Пешсаф",
        rep: "Махмадмуродов Далер",
        phone: "909191032",
        email: "daler.mahmadmurodov@flagman.tj",
        region: "Хатлон 1 (Бохтар)",
        pin: "909191032"
      },
      facilitator3: {
        legalName: "ОО Бонувони Хатлон",
        rep: "Дилбар Шомуратова",
        phone: "927758599",
        email: "bonuvonikhatlon@gmail.com",
        region: "Согдийская область",
        pin: "927758599"
      },
      facilitator4: {
        legalName: "ОО Умедбахш",
        rep: "Курбонов Раҷабали",
        phone: "931580301",
        email: "umedbakhsh2018@mail.ru",
        region: "Хатлон 2 (Куляб)",
        pin: "931580301"
      },
      facilitator5: {
        legalName: "ОО Шарикон барои рушд",
        rep: "Қаламфурова Асел",
        phone: "990040088",
        email: "asel.potn@gmail.com",
        region: "ГБАО",
        pin: "990040088"
      },
      facilitator6: {
        legalName: "ООО Академияи рушди иҷтимои",
        rep: "Ахмадов Бахтиёр",
        phone: "907387474",
        email: "b.ahmadov.91@mail.ru",
        region: "РРП",
        pin: "907387474"
      },
      facilitator7: {
        legalName: "ООО Академияи рушди иҷтимои",
        rep: "Ахмадов Бахтиёр",
        phone: "907387474",
        email: "b.ahmadov.91@mail.ru",
        region: "Душанбе",
        pin: "907387474"
      }
    };

    const facKeys = Array.from(new Set([
      "facilitator2",
      "facilitator3",
      "facilitator4",
      "facilitator5",
      "facilitator6",
      "facilitator7",
      ...Object.keys(globalDict.facilitatorRegions || {}),
      ...Object.keys(globalDict.facilitatorLegalNames || {})
    ])).sort();

    const facWs = workbook.addWorksheet('Реестр фасилитаторов');
    facWs.mergeCells('A1:I1');
    const fTitle = facWs.getCell('A1');
    fTitle.value = 'РЕЕСТР ФАСИЛИТАТОРОВ И РЕГИОНАЛЬНЫХ ПРЕДСТАВИТЕЛЕЙ (ПОЛНЫЙ ДАМП)';
    fTitle.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    fTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    fTitle.alignment = { vertical: 'middle', horizontal: 'center' };
    facWs.getRow(1).height = 32;

    facWs.mergeCells('A2:I2');
    const fSub = facWs.getCell('A2');
    fSub.value = `Полный дамп системы • Всего фасилитаторов: ${facKeys.length} • Дата выгрузки: ${new Date().toLocaleString('ru-RU')}`;
    fSub.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
    fSub.alignment = { vertical: 'middle', horizontal: 'center' };
    facWs.getRow(2).height = 22;

    const fHeaders = [
      '№',
      'Ключ системы',
      'Организация (Юр. название)',
      'ФИО представителя',
      'Телефон',
      'Электронная почта (Email)',
      'Закрепленный регион',
      'Персональная ссылка на портал',
      'PIN / Код доступа'
    ];
    const fHeaderRow = facWs.addRow(fHeaders);
    fHeaderRow.height = 28;
    fHeaderRow.eachCell((c) => {
      c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
      c.alignment = { vertical: 'middle', horizontal: 'center' };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
    });

    facWs.getColumn(1).width = 6;
    facWs.getColumn(2).width = 16;
    facWs.getColumn(3).width = 34;
    facWs.getColumn(4).width = 26;
    facWs.getColumn(5).width = 16;
    facWs.getColumn(6).width = 28;
    facWs.getColumn(7).width = 24;
    facWs.getColumn(8).width = 44;
    facWs.getColumn(9).width = 16;

    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://catalog.tj';

    facKeys.forEach((key, idx) => {
      const def = DEFAULT_FAC_FALLBACK[key] || {
        legalName: key,
        rep: '',
        phone: '',
        email: '',
        region: '',
        pin: ''
      };

      const legalName = globalDict.facilitatorLegalNames?.[key] || globalDict.facilitators?.[idx] || def.legalName;
      const rep = globalDict.facilitatorRepresentatives?.[key] || def.rep;
      const phone = globalDict.facilitatorPhones?.[key] || def.phone;
      const email = globalDict.facilitatorEmails?.[key] || def.email;
      const region = globalDict.facilitatorRegions?.[key] || def.region;
      const pin = globalDict.facilitatorCodes?.[key] || def.pin;
      const portalUrl = `${baseOrigin}/?portal=${key}`;

      const r = facWs.addRow([
        idx + 1,
        key,
        legalName,
        rep,
        phone,
        email,
        region,
        portalUrl,
        pin
      ]);
      r.height = 22;
      r.eachCell((c, colNum) => {
        c.font = { name: 'Arial', size: 10 };
        c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        if (colNum === 1 || colNum === 2 || colNum === 5 || colNum === 9) {
          c.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          c.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Каталог_${new Date().toLocaleDateString('ru-RU').replace(/\./g, '_')}.xlsx`);
}

export async function downloadCartExcel(
  cart: any[],
  logisticsCost: number,
  suppliers?: string[],
  selectedRegion?: string,
  selectedSphere?: string,
  clientName?: string,
  facilitatorName?: string,
  note?: string,
  district?: string,
  specialistName?: string,
  beneficiaryId?: string
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AI Catalog Creator';
  workbook.created = new Date();

  // Safe cart fallback
  const rawCart = Array.isArray(cart) ? cart : [];

  // Filter cart items by selected sphere if provided (ignoring "all" filters)
  let filteredCart = rawCart;
  if (
    selectedSphere &&
    !selectedSphere.toLowerCase().includes("все") &&
    selectedSphere.trim() !== ""
  ) {
    const sLow = selectedSphere.toLowerCase().trim();
    const matched = rawCart.filter(item => {
      const prodSpheres = item.product?.spheres && item.product.spheres.length > 0 
        ? item.product.spheres 
        : [item.product?.sphere || "Общее"];
      return prodSpheres.some((s: string) => {
        const sphereStr = String(s).toLowerCase();
        return (
          sphereStr === sLow || 
          sphereStr.includes(sLow) || 
          sLow.includes(sphereStr)
        );
      });
    });
    // Only apply filter if it actually matched items; otherwise fallback to full cart
    if (matched.length > 0) {
      filteredCart = matched;
    }
  }

  // Helper to get supplier name
  const getSupName = (supp?: string) => {
    if (!supp || supp === "supplier1") return "Логистика";
    const list = suppliers || [];
    const idx = supp === "supplier2" ? 0 : supp === "supplier3" ? 1 : supp === "supplier4" ? 2 : -1;
    return formatSupplierCode(supp, idx >= 0 ? list[idx] : undefined, idx >= 0 ? idx : undefined);
  };

  // Group cart items by supplier
  let uniqueCartSuppliers = Array.from(new Set(filteredCart.map(i => i.selectedSupplier || "supplier2")));
  if (uniqueCartSuppliers.length === 0) {
    uniqueCartSuppliers = ["supplier2"];
  }

  for (const supplierKey of uniqueCartSuppliers) {
    const supplierItems = filteredCart.filter(i => (i.selectedSupplier || "supplier2") === supplierKey);
    const supplierName = getSupName(supplierKey);

    // Limit worksheet title to 31 chars and filter invalid chars
    const rawTitle = `Инвойс - ${supplierName}`;
    let sheetTitle = rawTitle.substring(0, 31).replace(/[\\/*?:\[\]]/g, '') || "Инвойс";
    
    // Ensure unique sheet name
    let sheetName = sheetTitle;
    let sheetCounter = 1;
    while (workbook.getWorksheet(sheetName)) {
      sheetName = `${sheetTitle.substring(0, 26)}_${sheetCounter++}`;
    }

    const summaryWs = workbook.addWorksheet(sheetName);

    summaryWs.columns = [
      { key: "index", width: 8 },
      { key: "code", width: 15 },
      { key: "name", width: 55 },
      { key: "unit", width: 15 },
      { key: "qty", width: 12 },
      { key: "price", width: 18 },
      { key: "total", width: 20 }
    ];

    let rowCursor = 1;

    // Header Title Banner
    summaryWs.mergeCells(`A${rowCursor}:G${rowCursor}`);
    const titleCell = summaryWs.getCell(`A${rowCursor}`);
    titleCell.value = "Буҷети сармоягузорӣ / Выборка товаров";
    titleCell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4BA0DC" } };
    for (let c = 1; c <= 7; c++) {
      summaryWs.getCell(rowCursor, c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    }
    rowCursor++;

    if (clientName) {
      const displayClient = beneficiaryId ? `[ID: ${beneficiaryId}] ${clientName}` : clientName;
      const clientRow = summaryWs.addRow(["Миҷоз / Заказчик (ФИО):", displayClient, "", "", "", "", ""]);
      summaryWs.mergeCells(`B${rowCursor}:G${rowCursor}`);
      clientRow.getCell(1).font = { bold: true, size: 10 };
      clientRow.getCell(2).font = { bold: true, size: 10 };
      for (let c = 1; c <= 7; c++) {
        summaryWs.getCell(rowCursor, c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      }
      rowCursor++;
    }

    if (facilitatorName) {
      const facRow = summaryWs.addRow(["Фасилитатор:", facilitatorName, "", "", "", "", ""]);
      summaryWs.mergeCells(`B${rowCursor}:G${rowCursor}`);
      facRow.getCell(1).font = { bold: true, size: 10 };
      facRow.getCell(2).font = { size: 10 };
      for (let c = 1; c <= 7; c++) {
        summaryWs.getCell(rowCursor, c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      }
      rowCursor++;
    }

    if (specialistName) {
      const specRow = summaryWs.addRow(["Специалист (кто заполнял):", specialistName, "", "", "", "", ""]);
      summaryWs.mergeCells(`B${rowCursor}:G${rowCursor}`);
      specRow.getCell(1).font = { bold: true, size: 10 };
      specRow.getCell(2).font = { bold: true, size: 10 };
      for (let c = 1; c <= 7; c++) {
        summaryWs.getCell(rowCursor, c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      }
      rowCursor++;
    }

    const infoRow1 = summaryWs.addRow(["Минтақа (Регион):", selectedRegion || "Ҳамаи минтақаҳо", "", "", "", "", ""]);
    summaryWs.mergeCells(`B${rowCursor}:G${rowCursor}`);
    infoRow1.getCell(1).font = { bold: true, size: 10 };
    infoRow1.getCell(2).font = { size: 10 };
    for (let c = 1; c <= 7; c++) {
      summaryWs.getCell(rowCursor, c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    }
    rowCursor++;

    if (district) {
      const distRow = summaryWs.addRow(["Ноҳия (Район):", district, "", "", "", "", ""]);
      summaryWs.mergeCells(`B${rowCursor}:G${rowCursor}`);
      distRow.getCell(1).font = { bold: true, size: 10 };
      distRow.getCell(2).font = { size: 10 };
      for (let c = 1; c <= 7; c++) {
        summaryWs.getCell(rowCursor, c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      }
      rowCursor++;
    }

    if (note) {
      const noteRow = summaryWs.addRow(["Заметка:", note, "", "", "", "", ""]);
      summaryWs.mergeCells(`B${rowCursor}:G${rowCursor}`);
      noteRow.getCell(1).font = { bold: true, size: 10 };
      noteRow.getCell(2).font = { size: 10 };
      for (let c = 1; c <= 7; c++) {
        summaryWs.getCell(rowCursor, c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      }
      rowCursor++;
    }

    const headerRow = summaryWs.addRow(["#", "ID товара", "Ном ва хусусиятҳо", "Воҳид", "Миқдор", "Нархи як воҳид*", "Ҳамагӣ"]);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4BA0DC" } };
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
    rowCursor++;

    let overallExcelTotal = 0;

    supplierItems.forEach((item, idx) => {
      const pName = item.product?.name || "Товар";
      const qtyNum = typeof item.quantity === "number" && !isNaN(item.quantity) ? item.quantity : Number(item.quantity) || 1;
      const priceNum = typeof item.selectedPrice === "number" && !isNaN(item.selectedPrice) ? item.selectedPrice : Number(item.selectedPrice) || 0;
      const sum = qtyNum * priceNum;
      overallExcelTotal += sum;
      const codeVal = item.product?.code || (item.product?.id ? String(item.product.id).substring(0, 8) : "");

      const r = summaryWs.addRow([
        idx + 1,
        codeVal,
        pName,
        item.product?.unit || "шт.",
        qtyNum,
        priceNum > 0 ? priceNum : "-",
        priceNum > 0 ? sum : "-"
      ]);
      rowCursor++;

      r.eachCell((cell, colNumber) => {
        let horz: "left" | "center" | "right" = "right";
        if (colNumber === 1 || colNumber === 2 || colNumber === 4 || colNumber === 5) horz = "center";
        if (colNumber === 3) horz = "left";

        cell.alignment = { vertical: "middle", horizontal: horz, wrapText: true };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });
    });

    const logNum = typeof logisticsCost === "number" && !isNaN(logisticsCost) ? logisticsCost : Number(logisticsCost) || 0;
    if (logNum > 0) {
      const logRow = summaryWs.addRow(["", "", "", "Логистика", "", "", logNum]);
      rowCursor++;
      overallExcelTotal += logNum;
      logRow.eachCell((cell) => {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });
      logRow.getCell(4).font = { bold: true };
      logRow.getCell(7).font = { bold: true };
    }

    const totalRow = summaryWs.addRow(["", "", "", "", "", "Ҳамагӣ", overallExcelTotal]);
    rowCursor++;
    totalRow.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });
    totalRow.getCell(6).font = { bold: true };
    totalRow.getCell(7).font = { bold: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `Invoice_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "_")}.xlsx`);
}

/**
 * Exports the entire quotes registry (or filtered by facilitator) to an Excel document
 * containing both a summary sheet and a detailed items breakdown.
 */
export async function downloadQuotesRegistryExcel(
  quotes: any[],
  filterFacilitatorName?: string,
  suppliers?: string[]
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AI Catalog Registry';
  workbook.created = new Date();

  const getSupplierName = (supp?: string) => {
    if (!supp || supp === 'supplier1') return 'Логистика';
    const list = suppliers || [];
    if (supp === 'supplier2') return list[0] || 'Поставщик 1';
    if (supp === 'supplier3') return list[1] || 'Поставщик 2';
    if (supp === 'supplier4') return list[2] || 'Поставщик 3';
    return supp;
  };

  // Sheet 1: Реестр КП
  const registryWs = workbook.addWorksheet('Реестр КП');

  registryWs.columns = [
    { key: 'num', width: 6 },
    { key: 'id', width: 22 },
    { key: 'date', width: 20 },
    { key: 'client', width: 30 },
    { key: 'facilitator', width: 22 },
    { key: 'region', width: 16 },
    { key: 'sphere', width: 18 },
    { key: 'itemCount', width: 14 },
    { key: 'note', width: 25 },
    { key: 'total', width: 18 }
  ];

  let rowCursor = 1;

  // Title Row Banner
  registryWs.mergeCells(`A${rowCursor}:J${rowCursor}`);
  const titleCell = registryWs.getCell(`A${rowCursor}`);
  titleCell.value = 'Реестр коммерческих предложений (Архив КП)';
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  for (let c = 1; c <= 10; c++) {
    registryWs.getCell(rowCursor, c).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  }
  rowCursor++;

  // Meta Info
  const facFilterText = (!filterFacilitatorName || filterFacilitatorName === 'all')
    ? 'Все фасилитаторы'
    : filterFacilitatorName;
  
  const metaRow1 = registryWs.addRow(['Фильтр фасилитатора:', facFilterText, '', '', '', '', '', '', '', '']);
  registryWs.mergeCells(`B${rowCursor}:J${rowCursor}`);
  metaRow1.getCell(1).font = { bold: true, size: 10 };
  metaRow1.getCell(2).font = { size: 10, bold: true, color: { argb: 'FF4F46E5' } };
  for (let c = 1; c <= 10; c++) {
    registryWs.getCell(rowCursor, c).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  }
  rowCursor++;

  const metaRow2 = registryWs.addRow(['Дата выгрузки:', new Date().toLocaleString('ru-RU'), '', '', '', '', '', '', '', '']);
  registryWs.mergeCells(`B${rowCursor}:J${rowCursor}`);
  metaRow2.getCell(1).font = { bold: true, size: 10 };
  metaRow2.getCell(2).font = { size: 10 };
  for (let c = 1; c <= 10; c++) {
    registryWs.getCell(rowCursor, c).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  }
  rowCursor++;

  // Headers
  const headers = [
    '№',
    'Номер КП',
    'Дата и время',
    'Заказчик (Клиент / Объект)',
    'Фасилитатор',
    'Регион',
    'Сфера',
    'Позиций',
    'Заметка',
    'Сумма (сомони)'
  ];
  const headerRow = registryWs.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });
  rowCursor++;

  let grandTotal = 0;

  quotes.forEach((q, idx) => {
    const totalAmt = q.totalAmount || (q.items ? q.items.reduce((sum: number, item: any) => sum + (item.selectedPrice || 0) * (item.quantity || 1), 0) : 0) + (q.logisticsCost || 0);
    grandTotal += totalAmt;

    const clientDisplay = q.beneficiaryId ? `[ID: ${q.beneficiaryId}] ${q.clientName || '—'}` : (q.clientName || '—');
    const row = registryWs.addRow([
      idx + 1,
      q.id || '',
      q.createdAt || '',
      clientDisplay,
      q.facilitatorName || '—',
      q.selectedRegion || 'Все регионы',
      q.selectedSphere || '—',
      q.items ? q.items.length : 0,
      q.note || '—',
      totalAmt
    ]);
    rowCursor++;

    row.eachCell((cell, colNum) => {
      let horz: 'left' | 'center' | 'right' = 'left';
      if (colNum === 1 || colNum === 2 || colNum === 3 || colNum === 6 || colNum === 8) horz = 'center';
      if (colNum === 10) horz = 'right';

      cell.alignment = { vertical: 'middle', horizontal: horz, wrapText: true };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  // Summary Row
  const summaryRow = registryWs.addRow(['', '', '', '', '', '', '', 'ВСЕГО ПО РЕЕСТРУ:', quotes.length + ' КП', grandTotal]);
  rowCursor++;
  summaryRow.eachCell((cell) => {
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
    cell.font = { bold: true, size: 11 };
    cell.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
  });

  // Sheet 2: Детализация товаров
  const itemsWs = workbook.addWorksheet('Детализация товаров');

  itemsWs.columns = [
    { key: 'quoteId', width: 22 },
    { key: 'date', width: 18 },
    { key: 'client', width: 25 },
    { key: 'facilitator', width: 20 },
    { key: 'idx', width: 6 },
    { key: 'code', width: 14 },
    { key: 'pName', width: 45 },
    { key: 'unit', width: 12 },
    { key: 'supplier', width: 18 },
    { key: 'qty', width: 12 },
    { key: 'price', width: 16 },
    { key: 'sum', width: 18 }
  ];

  let itemRowCursor = 1;

  // Title Banner
  itemsWs.mergeCells(`A${itemRowCursor}:L${itemRowCursor}`);
  const itemTitleCell = itemsWs.getCell(`A${itemRowCursor}`);
  itemTitleCell.value = 'Детализация товаров всех подборок';
  itemTitleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  itemTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  itemTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  for (let c = 1; c <= 12; c++) {
    itemsWs.getCell(itemRowCursor, c).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  }
  itemRowCursor++;

  const itemHeaders = [
    'Номер КП',
    'Дата',
    'Заказчик',
    'Фасилитатор',
    '№',
    'Код',
    'Наименование товара',
    'Ед. изм.',
    'Поставщик',
    'Количество',
    'Цена за ед. (с.)',
    'Сумма (с.)'
  ];
  const itemHeaderRow = itemsWs.addRow(itemHeaders);
  itemHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });
  itemRowCursor++;

  quotes.forEach((q) => {
    if (q.items && Array.isArray(q.items)) {
      q.items.forEach((item: any, pIdx: number) => {
        const priceNum = item.selectedPrice || 0;
        const sumNum = priceNum * (item.quantity || 1);
        const codeVal = item.product?.code || (item.product?.id ? String(item.product.id).substring(0, 8) : '');
        const suppName = getSupplierName(item.selectedSupplier);

        const r = itemsWs.addRow([
          q.id || '',
          q.createdAt || '',
          q.clientName || '—',
          q.facilitatorName || '—',
          pIdx + 1,
          codeVal,
          item.product?.name || 'Товар',
          item.product?.unit || 'шт.',
          suppName,
          item.quantity || 1,
          priceNum,
          sumNum
        ]);
        itemRowCursor++;

        r.eachCell((cell, colNum) => {
          let horz: 'left' | 'center' | 'right' = 'left';
          if (colNum === 1 || colNum === 2 || colNum === 5 || colNum === 6 || colNum === 8 || colNum === 10) horz = 'center';
          if (colNum === 11 || colNum === 12) horz = 'right';

          cell.alignment = { vertical: 'middle', horizontal: horz, wrapText: true };
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
      });
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const filenameTag = filterFacilitatorName && filterFacilitatorName !== 'all' ? `_${filterFacilitatorName.replace(/\s+/g, '_')}` : '';
  saveAs(blob, `Registry_Quotes${filenameTag}_${new Date().toLocaleDateString('ru-RU').replace(/\./g, '_')}.xlsx`);
}

export interface SupplierExportEntry {
  key: string;
  code: string;
  legalName: string;
  phone: string;
  spheres: string[];
  allRegions: boolean;
  regions: string[];
  districts: string[];
  portalUrl: string;
  pin: string;
}

export async function downloadSuppliersRegistryExcel(suppliersData: SupplierExportEntry[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Система каталога (Администратор)';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Реестр поставщиков');

  // Title Row
  ws.mergeCells('A1:I1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'РЕЕСТР ПОСТАВЩИКОВ • ТАБЛИЦА СООТВЕТСТВИЯ КОДОВ И ЮРИДИЧЕСКИХ НАЗВАНИЙ';
  titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 30;

  // Subtitle Row
  ws.mergeCells('A2:I2');
  const subtitleCell = ws.getCell('A2');
  subtitleCell.value = `Конфиденциально для администратора • Дата формирования: ${new Date().toLocaleString('ru-RU')} • Всего поставщиков: ${suppliersData.length}`;
  subtitleCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 20;

  // Header Row
  const headers = [
    '№',
    'Код в системе',
    'Юридическое (реальное) название',
    'Телефон',
    'Сферы деятельности',
    'Охват регионов',
    'Районы',
    'Ссылка на портал',
    'PIN-код'
  ];

  const headerRow = ws.addRow(headers);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }; // Indigo-700
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF312E81' } },
      bottom: { style: 'medium', color: { argb: 'FF312E81' } },
      left: { style: 'thin', color: { argb: 'FF312E81' } },
      right: { style: 'thin', color: { argb: 'FF312E81' } }
    };
  });

  // Column widths
  ws.getColumn(1).width = 6;   // No
  ws.getColumn(2).width = 16;  // Code
  ws.getColumn(3).width = 38;  // Legal Name
  ws.getColumn(4).width = 20;  // Phone
  ws.getColumn(5).width = 32;  // Spheres
  ws.getColumn(6).width = 28;  // Regions
  ws.getColumn(7).width = 34;  // Districts
  ws.getColumn(8).width = 46;  // Portal URL
  ws.getColumn(9).width = 14;  // PIN

  // Data rows
  suppliersData.forEach((s, idx) => {
    const spheresStr = s.spheres && s.spheres.length > 0 ? s.spheres.join(', ') : 'Все сферы';
    const regionsStr = s.allRegions ? 'Вся страна (все регионы)' : (s.regions && s.regions.length > 0 ? s.regions.join(', ') : 'Не указано');
    const districtsStr = s.allRegions ? 'Все районы (вся страна)' : (s.districts && s.districts.length > 0 ? s.districts.join(', ') : 'Все районы выбранных регионов');

    const row = ws.addRow([
      idx + 1,
      s.code,
      s.legalName || '—',
      s.phone || '—',
      spheresStr,
      regionsStr,
      districtsStr,
      s.portalUrl || '—',
      s.pin || '—'
    ]);

    row.height = 24;
    const isEven = idx % 2 === 0;

    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Arial', size: 10 };
      if (!isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }

      let horz: 'left' | 'center' | 'right' = 'left';
      if (colNum === 1 || colNum === 2 || colNum === 4 || colNum === 9) {
        horz = 'center';
      }

      if (colNum === 2) {
        // Highlight code
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF4338CA' } };
      }
      if (colNum === 3) {
        cell.font = { name: 'Arial', size: 10, bold: true };
      }

      cell.alignment = { vertical: 'middle', horizontal: horz, wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const dateStr = new Date().toISOString().slice(0, 10);
  saveAs(blob, `Реестр_поставщиков_коды_${dateStr}.xlsx`);
}

export interface FacilitatorExportEntry {
  key: string;
  code: string;
  legalName: string;
  representative: string;
  phone: string;
  email: string;
  region: string;
  portalUrl: string;
  pin: string;
}

export async function downloadFacilitatorsRegistryExcel(facilitatorsData: FacilitatorExportEntry[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Система каталога (Администратор)';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Реестр фасилитаторов');

  // Title Row
  ws.mergeCells('A1:I1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'РЕЕСТР ФАСИЛИТАТОРОВ И ПРЕДСТАВИТЕЛЕЙ ОРГАНИЗАЦИЙ';
  titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 30;

  // Subtitle Row
  ws.mergeCells('A2:I2');
  const subtitleCell = ws.getCell('A2');
  subtitleCell.value = `Конфиденциально для администратора • Дата формирования: ${new Date().toLocaleString('ru-RU')} • Всего фасилитаторов: ${facilitatorsData.length}`;
  subtitleCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 20;

  // Header Row
  const headers = [
    '№',
    'Код в системе',
    'Организация (Юр. название)',
    'ФИО представителя',
    'Телефон',
    'Электронная почта (Email)',
    'Регион охвата',
    'Ссылка на портал',
    'PIN / Код доступа'
  ];

  const headerRow = ws.addRow(headers);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF312E81' } },
      bottom: { style: 'medium', color: { argb: 'FF312E81' } },
      left: { style: 'thin', color: { argb: 'FF312E81' } },
      right: { style: 'thin', color: { argb: 'FF312E81' } }
    };
  });

  // Column widths
  ws.getColumn(1).width = 6;   // No
  ws.getColumn(2).width = 16;  // Code / Slot
  ws.getColumn(3).width = 36;  // Org
  ws.getColumn(4).width = 28;  // FIO
  ws.getColumn(5).width = 18;  // Phone
  ws.getColumn(6).width = 34;  // Email
  ws.getColumn(7).width = 24;  // Region
  ws.getColumn(8).width = 46;  // Portal URL
  ws.getColumn(9).width = 18;  // PIN

  // Data rows
  facilitatorsData.forEach((f, idx) => {
    const row = ws.addRow([
      idx + 1,
      f.code,
      f.legalName || '—',
      f.representative || '—',
      f.phone || '—',
      f.email || '—',
      f.region || '—',
      f.portalUrl || '—',
      f.pin || '—'
    ]);

    row.height = 24;
    const isEven = idx % 2 === 0;

    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Arial', size: 10 };
      if (!isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }

      let horz: 'left' | 'center' | 'right' = 'left';
      if (colNum === 1 || colNum === 2 || colNum === 5 || colNum === 7 || colNum === 9) {
        horz = 'center';
      }

      if (colNum === 2) {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF4338CA' } };
      }
      if (colNum === 3) {
        cell.font = { name: 'Arial', size: 10, bold: true };
      }
      if (colNum === 4) {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E293B' } };
      }

      cell.alignment = { vertical: 'middle', horizontal: horz, wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const dateStr = new Date().toISOString().slice(0, 10);
  saveAs(blob, `Реестр_фасилитаторов_${dateStr}.xlsx`);
}

