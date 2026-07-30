import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Product } from '../types';

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

        // Add image
        if (p.imageBase64) {
            try {
                // Extract pure base64 data and format
                const matches = p.imageBase64.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
                let ext: 'jpeg' | 'png' | 'gif' = 'jpeg';
                let base64Data = p.imageBase64;
                
                if (matches && matches.length === 3) {
                    const format = matches[1].toLowerCase();
                    if (format === 'png') ext = 'png';
                    else if (format === 'gif') ext = 'gif';
                    base64Data = matches[2];
                }

                const imageId = workbook.addImage({
                    base64: base64Data,
                    extension: ext,
                });
                
                ws.addImage(imageId, {
                    tl: { col: 1.1, row: rowIndex - 1 + 0.1 },
                    ext: { width: 110, height: 110 },
                    editAs: 'oneCell'
                });
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

  // Helper to get supplier name
  const getSupName = (supp?: string) => {
    if (!supp || supp === "supplier1") return "Логистика";
    const list = suppliers || [];
    if (supp === "supplier2") return list[0] || "Поставщик 1";
    if (supp === "supplier3") return list[1] || "Поставщик 2";
    if (supp === "supplier4") return list[2] || "Поставщик 3";
    return "Логистика";
  };

  // Group cart items by supplier using filtered cart
  const uniqueCartSuppliers = Array.from(new Set(filteredCart.map(i => i.selectedSupplier || "supplier2")));

  for (const supplierKey of uniqueCartSuppliers) {
    const supplierItems = filteredCart.filter(i => (i.selectedSupplier || "supplier2") === supplierKey);
    const supplierName = getSupName(supplierKey);

    // Limit worksheet title to 31 chars and filter invalid chars
    const rawTitle = `Инвойс - ${supplierName}`;
    const sheetTitle = rawTitle.substring(0, 31).replace(/[\\/*?:\[\]]/g, '');
    const summaryWs = workbook.addWorksheet(sheetTitle);

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
    summaryWs.mergeCells(`A${rowCursor}:G${rowCursor}`);
    const titleCell = summaryWs.getCell(`A${rowCursor}`);
    titleCell.value = "Буҷети сармоягузорӣ / Выборка товаров";
    titleCell.font = { bold: true, size: 12 };
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

    const infoRow2 = summaryWs.addRow(["Сфера (Бахш):", selectedSphere || "Ҳамаи сфераҳо", "", "", "", "", ""]);
    summaryWs.mergeCells(`B${rowCursor}:G${rowCursor}`);
    infoRow2.getCell(1).font = { bold: true, size: 10 };
    infoRow2.getCell(2).font = { size: 10 };
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
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4BA0DC" } };
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });

    // Assign each item to exactly one primary sphere to prevent duplicate listing in different spheres
    const itemToPrimarySphere = new Map<string, string>();
    supplierItems.forEach((i) => {
      const pSpheres = i.product.spheres && i.product.spheres.length > 0 ? i.product.spheres : [i.product.sphere || "Общее"];
      let primary = pSpheres[0] || "Общее";
      if (selectedSphere && pSpheres.includes(selectedSphere)) {
        primary = selectedSphere;
      }
      itemToPrimarySphere.set(i.product.id, primary);
    });

    const spheresSet = new Set<string>(itemToPrimarySphere.values());

    let overallExcelTotal = 0;

    for (const sphere of Array.from(spheresSet)) {
      const itemsInSphere = supplierItems.filter(i => itemToPrimarySphere.get(i.product.id) === sphere);
      if (itemsInSphere.length === 0) continue;

      const sRow = summaryWs.addRow(["", sphere, "", "", "", "", ""]);
      summaryWs.mergeCells(`B${summaryWs.rowCount}:G${summaryWs.rowCount}`);
      sRow.getCell(2).font = { bold: true, underline: true };
      sRow.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
      for (let c = 1; c <= 7; c++) {
        sRow.getCell(c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      }

      let sphereTotal = 0;
      itemsInSphere.forEach((item, idx) => {
        const sum = item.quantity * item.selectedPrice;
        sphereTotal += sum;
        const codeVal = item.product.code || item.product.id?.substring(0, 8) || "";

        const r = summaryWs.addRow([
          idx + 1,
          codeVal,
          item.product.name,
          item.product.unit || "шт.",
          item.quantity,
          item.selectedPrice > 0 ? item.selectedPrice : "-",
          item.selectedPrice > 0 ? sum : "-"
        ]);
        r.eachCell((cell, colNumber) => {
          let horz: "left" | "center" | "right" = "right";
          if (colNumber === 1) horz = "center";
          if (colNumber === 2) horz = "center";
          if (colNumber === 3) horz = "left";
          if (colNumber === 4) horz = "center";
          if (colNumber === 5) horz = "center";
          if (colNumber === 6) horz = "right";
          if (colNumber === 7) horz = "right";

          cell.alignment = { vertical: "middle", horizontal: horz, wrapText: true };
          cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        });
      });

      overallExcelTotal += sphereTotal;

      const subRow = summaryWs.addRow(["", "", "", "", "", "Ҷамъ", sphereTotal]);
      subRow.eachCell((cell) => {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });
      subRow.getCell(6).font = { bold: true };
      subRow.getCell(7).font = { bold: true };
    }

    if (logisticsCost > 0) {
      const logRow = summaryWs.addRow(["", "", "", "Логистика", "", "", logisticsCost]);
      overallExcelTotal += logisticsCost;
      logRow.eachCell((cell) => {
        cell.alignment = { vertical: "middle", horizontal: "right" };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });
      logRow.getCell(4).font = { bold: true };
      logRow.getCell(7).font = { bold: true };
    }

    const totalRow = summaryWs.addRow(["", "", "", "", "", "Ҳамагӣ", overallExcelTotal]);
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
