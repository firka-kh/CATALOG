/**
 * Utility functions for Supplier system codes (SPMEI-100, SPMEI-101, SPMEI-102, SPMEI-103...).
 * Strictly hides all real company/legal names and legacy "ПОСТАВЩИК 1" labels across the entire app
 * (both for Admin on main pages and Facilitators), keeping them visible ONLY to the Admin inside the Dictionary modal.
 */

export function formatSupplierCode(
  supKeyOrCode?: string,
  assignedCode?: string,
  fallbackIndex?: number
): string {
  // If this is supplier1 (internal logistics), return "Логистика"
  if (supKeyOrCode === "supplier1") {
    return "Логистика";
  }

  const candidates = [assignedCode, supKeyOrCode].filter(Boolean) as string[];

  for (const raw of candidates) {
    const trimmed = String(raw).trim();

    // 1. If already SPMEI format, e.g. "SPMEI-100", "SPMEI_103", "SPMEI 103", "spmei-101"
    const spmeiMatch = trimmed.match(/^SPMEI[-_\s]?(\d+)$/i);
    if (spmeiMatch) {
      return `SPMEI-${spmeiMatch[1]}`;
    }

    // 2. If it has legacy "ПОСТАВЩИК 1", "ПОСТАВЩИК 2", "ПОС-1", "POS-2", etc.
    const posMatch = trimmed.match(/^(?:ПОСТАВЩИК|ПОС|POS)[-_.\s]*(\d+)$/i);
    if (posMatch) {
      const num = parseInt(posMatch[1], 10);
      if (num >= 100) {
        return `SPMEI-${num}`;
      }
      return `SPMEI-${99 + num}`; // 1 -> SPMEI-100, 2 -> SPMEI-101, 3 -> SPMEI-102, 4 -> SPMEI-103...
    }
  }

  // 3. If supKeyOrCode or assignedCode contains slot key like "supplier2", "supplier3", etc.
  const slotStr = [supKeyOrCode, assignedCode].find((s) => s && /^supplier\d+$/i.test(String(s)));
  if (slotStr) {
    const slotNum = parseInt(String(slotStr).replace(/\D/g, ""), 10);
    const offset = slotNum >= 2 ? slotNum - 2 : 0;
    return `SPMEI-${100 + offset}`;
  }

  // 4. If fallback index is provided (0 -> SPMEI-100, 1 -> SPMEI-101...)
  if (fallbackIndex !== undefined && fallbackIndex >= 0) {
    return `SPMEI-${100 + fallbackIndex}`;
  }

  return "SPMEI-100";
}
