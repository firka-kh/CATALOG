import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Product } from "../types";
import { db } from "./firebase";
import { doc, writeBatch, deleteField } from "firebase/firestore";

export async function downloadPriceEditExcel(
  products: Product[],
  suppliers: string[],
  region: string,
  sphere: string,
) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Цены");

  // Header
  const headers = [
    "ID",
    "Код",
    "Наименование",
    "Сфера",
    "Регион",
    "Ед. изм.",
    suppliers[0] || "Поставщик 1",
    suppliers[1] || "Поставщик 2",
    suppliers[2] || "Поставщик 3",
  ];

  ws.addRow(headers);

  ws.getRow(1).font = { bold: true };
  ws.getColumn(1).width = 25; // ID // HIDDEN -> Wait, if we hide it, user might be confused. Better to keep it visible but tell them not to change
  ws.getColumn(2).width = 10; // Код
  ws.getColumn(3).width = 40; // Наименование
  ws.getColumn(4).width = 20; // Сфера
  ws.getColumn(5).width = 20; // Регион
  ws.getColumn(6).width = 10; // Ед. изм.
  ws.getColumn(7).width = 15; // Пост 1
  ws.getColumn(8).width = 15; // Пост 2
  ws.getColumn(9).width = 15; // Пост 3

  for (const p of products) {
    if (sphere && p.sphere !== sphere) continue;

    ws.addRow([
      p.id, // Column A (ID)
      p.code || "",
      p.name || "",
      p.sphere || "",
      region || "",
      p.unit || "",
      p.prices?.supplier2?.[region] !== undefined
        ? p.prices.supplier2[region]
        : "",
      p.prices?.supplier3?.[region] !== undefined
        ? p.prices.supplier3[region]
        : "",
      p.prices?.supplier4?.[region] !== undefined
        ? p.prices.supplier4[region]
        : "",
    ]);
  }

  // Instruction sheet
  const instructionRow = workbook.addWorksheet("Инструкция");
  instructionRow.getColumn(1).width = 100;
  instructionRow.addRow(["ИНСТРУКЦИЯ ПО РЕДАКТИРОВАНИЮ ЦЕН"]);
  instructionRow.getRow(1).font = { bold: true, size: 14 };
  instructionRow.addRow([""]);
  instructionRow.addRow([
    "1. Не изменяйте значения в колонке ID (Колонка A) и Регион (Колонка E)! Они нужны для обновления товара.",
  ]);
  instructionRow.addRow([
    '2. Редактируйте цены в 3-х колонках поставщиков ("Поставщик 1", "Поставщик 2", "Поставщик 3").',
  ]);
  instructionRow.addRow([
    '3. Если нужно удалить цену, поставьте символ "-" (минус). Оставление пустой ячейки проигнорирует обновление.',
  ]);
  instructionRow.addRow([
    "4. Цены будут записаны ИМЕННО ДЛЯ указанного региона в строке.",
  ]);

  let safeRegionName = (region || "ВСЕ").replace(/[/\\?%*:|"<>]/g, "-");
  let safeSphereName = (sphere || "ВСЕ").replace(/[/\\?%*:|"<>]/g, "-");

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(
    blob,
    `Цены_${safeRegionName}_${safeSphereName}_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "_")}.xlsx`,
  );
}

export async function importPriceEditExcel(
  file: File,
): Promise<{ updated: number; errors: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result as ArrayBuffer;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(data);
        const ws = workbook.getWorksheet("Цены");

        if (!ws) {
          throw new Error(
            "Лист с именем 'Цены' не найден. Убедитесь, что вы загружаете правильный файл.",
          );
        }

        const updates: any[] = [];
        let rowCount = ws.rowCount;

        for (let i = 2; i <= rowCount; i++) {
          const row = ws.getRow(i);
          const id = row.getCell(1).value?.toString()?.trim();
          if (!id || id === "ID") continue;

          const region = row.getCell(5).value?.toString()?.trim();
          if (!region) continue; // we need region to update region-specific prices

          const getPriceVal = (cell: ExcelJS.Cell) => {
            let val = cell.value;
            if (val && typeof val === "object" && "result" in val) {
              val = val.result;
            }
            if (val === "-" || val === "—") return "DELETE";
            if (val === null || val === undefined || val === "")
              return "IGNORE";
            const num = Number(val);
            return isNaN(num) ? "IGNORE" : num;
          };

          const p2 = getPriceVal(row.getCell(7)); // Поставщик 1 => supplier2 (assuming suppliers[0] maps to supplier2?)
          const p3 = getPriceVal(row.getCell(8)); // Поставщик 2 => supplier3
          const p4 = getPriceVal(row.getCell(9)); // Поставщик 3 => supplier4

          // Actually, let's map directly to prices.supplier2.region
          // Firestore partial update syntax for nested maps is 'prices.supplier2.ГБАО': value
          const updateData: any = {};

          if (p2 === "DELETE")
            updateData[`prices.supplier2.${region}`] = deleteField();
          else if (p2 !== "IGNORE")
            updateData[`prices.supplier2.${region}`] = p2;

          if (p3 === "DELETE")
            updateData[`prices.supplier3.${region}`] = deleteField();
          else if (p3 !== "IGNORE")
            updateData[`prices.supplier3.${region}`] = p3;

          if (p4 === "DELETE")
            updateData[`prices.supplier4.${region}`] = deleteField();
          else if (p4 !== "IGNORE")
            updateData[`prices.supplier4.${region}`] = p4;

          if (Object.keys(updateData).length > 0) {
            updates.push({ id, data: updateData });
          }
        }

        if (updates.length === 0) {
          return resolve({ updated: 0, errors: [] });
        }

        let totalUpdated = 0;
        for (let i = 0; i < updates.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = updates.slice(i, i + 500);
          for (const u of chunk) {
            batch.update(doc(db, "products", u.id), u.data);
            totalUpdated++;
          }
          await batch.commit();
        }

        resolve({ updated: totalUpdated, errors: [] });
      } catch (err: any) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}
