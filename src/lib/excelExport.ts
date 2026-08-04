import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Product } from '../types';

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

export async function downloadCatalogExcel(products: Product[], suppliers?: string[], selectedSupplierScope?: 'supplier2' | 'supplier3' | 'supplier4') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AI Catalog Creator';
  workbook.created = new Date();

  const getSupLabel = (sup: 'supplier2' | 'supplier3' | 'supplier4', withCurrency = false) => {
    const suffix = withCurrency ? ' (с.)' : '';
    const list = suppliers || [];
    if (sup === 'supplier2') return (list[0] || 'Поставщик 1') + suffix;
    if (sup === 'supplier3') return (list[1] || 'Поставщик 2') + suffix;
    return (list[2] || 'Поставщик 3') + suffix;
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
  note?: string
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
    if (supp === "supplier2") return list[0] || "Поставщик 1";
    if (supp === "supplier3") return list[1] || "Поставщик 2";
    if (supp === "supplier4") return list[2] || "Поставщик 3";
    return "Поставщик";
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
      const clientRow = summaryWs.addRow(["Миҷоз / Заказчик (ФИО):", clientName, "", "", "", "", ""]);
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

    const infoRow1 = summaryWs.addRow(["Минтақа (Регион):", selectedRegion || "Ҳамаи минтақаҳо", "", "", "", "", ""]);
    summaryWs.mergeCells(`B${rowCursor}:G${rowCursor}`);
    infoRow1.getCell(1).font = { bold: true, size: 10 };
    infoRow1.getCell(2).font = { size: 10 };
    for (let c = 1; c <= 7; c++) {
      summaryWs.getCell(rowCursor, c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    }
    rowCursor++;

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
