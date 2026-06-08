import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Product } from '../types';

const UNIT_OPTIONS = [
    'шт. (Штука)',
    'кг (Килограмм)',
    'г (Грамм)',
    'т (Тонна)',
    'метр (Метр)',
    'мм (Миллиметр)',
    'см (Сантиметр)',
    'литр (Литр)',
    'мл (Миллилитр)',
    'упак. (Упаковка)',
    'короб. (Коробка)',
    'компл. (Комплект)'
];

const UNIT_MAP: Record<string, string> = {
    'шт.': 'шт. (Штука)',
    'кг': 'кг (Килограмм)',
    'г': 'г (Грамм)',
    'т': 'т (Тонна)',
    'метр': 'метр (Метр)',
    'мм': 'мм (Миллиметр)',
    'см': 'см (Сантиметр)',
    'литр': 'литр (Литр)',
    'мл': 'мл (Миллилитр)',
    'упак.': 'упак. (Упаковка)',
    'короб.': 'короб. (Коробка)',
    'компл.': 'компл. (Комплект)'
};

export async function downloadSupplierExcel(
    products: Product[],
    supplierId: 'supplier1' | 'supplier2' | 'supplier3' | 'supplier4',
    selectedRegion: string,
    supplierLabel: string
) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Supplier Portal';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Товары');

    ws.getColumn(1).width = 25; // ID
    ws.getColumn(2).width = 40; // Name
    ws.getColumn(3).width = 20; // Sphere
    ws.getColumn(4).width = 20; // Category
    ws.getColumn(5).width = 20; // Unit
    ws.getColumn(6).width = 15; // Your Price

    const headerName = supplierId === 'supplier1' ? 'Ваша цена (Основная)' : `Ваша цена (${selectedRegion || 'Всем'})`;

    const headerRow = ws.addRow([
        'ID товара (НЕ РЕДАКТИРОВАТЬ)',
        'Наименование',
        'Сфера',
        'Категория',
        'Ед. измерения *',
        headerName
    ]);

    headerRow.font = { bold: true };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEFEFEF' }
    };
    
    // Auto filter
    ws.autoFilter = 'A1:F1';

    for (const p of products) {
        let originalVal: number | string = '';

        if (supplierId === 'supplier1') {
            originalVal = p.priceSupplier1 || '';
        } else {
            if (selectedRegion && p.prices && p.prices[supplierId] && p.prices[supplierId][selectedRegion] !== undefined) {
                originalVal = p.prices[supplierId][selectedRegion];
            }
        }

        const dataRow = ws.addRow([
            p.id,
            p.name,
            p.sphere || '',
            p.category || '',
            UNIT_MAP[p.unit || 'шт.'] || 'шт. (Штука)',
            originalVal
        ]);

        dataRow.getCell(5).dataValidation = {
            type: 'list',
            allowBlank: false,
            formulae: [`"${UNIT_OPTIONS.join(',')}"`],
            showErrorMessage: true,
            errorStyle: 'error',
            errorTitle: 'Неверное значение',
            error: 'Пожалуйста, выберите значение из списка.'
        };

        dataRow.getCell(6).numFmt = '#,##0.00';
        
        // Make ID cell slightly grayed to discourage editing
        dataRow.getCell(1).font = { color: { argb: 'FF888888' } };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const safeSupName = supplierLabel.replace(/[\\/*?:\[\]]/g, '_');
    const safeRegion = selectedRegion ? `_${selectedRegion}` : '';
    saveAs(blob, `Прайс_${safeSupName}${safeRegion}.xlsx`);
}

export async function parseSupplierExcel(file: File): Promise<Array<{ id: string; price: number | '', unit?: string }>> {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const ws = workbook.getWorksheet(1);
    if (!ws) throw new Error("Лист с товарами не найден");

    const updates: Array<{ id: string; price: number | '', unit?: string }> = [];

    ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header
        
        const idCell = row.getCell(1).value;
        const unitCell = row.getCell(5).value;
        const priceCell = row.getCell(6).value;
        
        if (idCell) {
            const id = idCell.toString().trim();
            // Price can be empty, numeric, or string
            let price: number | '' = '';
            if (priceCell !== null && priceCell !== undefined) {
                if (typeof priceCell === 'number') {
                    price = priceCell;
                } else if (typeof priceCell === 'string') {
                    const parsed = parseFloat(priceCell.replace(/,/g, '.').replace(/[^\d.-]/g, ''));
                    if (!isNaN(parsed)) {
                        price = parsed;
                    }
                } else if (typeof priceCell === 'object') {
                    // Formula result
                    if ('result' in priceCell && typeof priceCell.result === 'number') {
                        price = priceCell.result;
                    } else if ('result' in priceCell && typeof priceCell.result === 'string') {
                         const parsed = parseFloat(priceCell.result.replace(/,/g, '.').replace(/[^\d.-]/g, ''));
                         if (!isNaN(parsed)) {
                             price = parsed;
                         }
                    }
                }
            }

            let unit: string | undefined = undefined;
            if (unitCell) {
                const unitStr = unitCell.toString().trim();
                const match = Object.entries(UNIT_MAP).find(([k, v]) => v === unitStr || k === unitStr);
                if (match) {
                    unit = match[0];
                } else {
                    unit = unitStr.split(' ')[0]; // Fallback
                }
            }

            updates.push({ id, price, unit });
        }
    });

    return updates;
}
