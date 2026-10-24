import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { Product } from "../types";
import { logAuditEvent } from "./auditLogger";
import { captureDeviceAudit, DeviceAuditInfo } from "./deviceFingerprint";

export interface QuoteItem {
  product: Product;
  quantity: number;
  selectedSupplier: "supplier1" | "supplier2" | "supplier3" | "supplier4";
  selectedPrice: number;
}

export interface QuoteRevision {
  id: string;
  timestamp: number;
  dateFormatted: string;
  specialistName?: string;
  facilitatorName?: string;
  clientName?: string;
  itemsCount: number;
  totalAmount: number;
  changeSummary: string;
  previousTotalAmount?: number;
  previousItemsCount?: number;
  addedItems?: string[];
  removedItems?: string[];
  modifiedItems?: string[];
  items?: QuoteItem[];
  deviceAudit?: DeviceAuditInfo;
  deviceAuditSummary?: string;
}

export interface QuoteRecord {
  id: string;
  clientName: string;
  beneficiaryId?: string;
  facilitatorName: string;
  facilitatorLegalName?: string;
  facilitatorRep?: string;
  facilitatorPhone?: string;
  facilitatorEmail?: string;
  specialistName?: string;
  note?: string;
  createdAt: string;
  createdAtTimestamp: number;
  updatedAt?: string;
  updatedAtTimestamp?: number;
  selectedRegion: string;
  selectedDistrict?: string;
  selectedSphere?: string;
  logisticsCost: number;
  items: QuoteItem[];
  totalAmount: number;
  revisions?: QuoteRevision[];
  deviceAudit?: DeviceAuditInfo;
  deviceAuditSummary?: string;
}

export async function saveQuoteToHistory(data: {
  clientName: string;
  beneficiaryId?: string;
  facilitatorName?: string;
  facilitatorLegalName?: string;
  facilitatorRep?: string;
  facilitatorPhone?: string;
  facilitatorEmail?: string;
  specialistName?: string;
  note?: string;
  selectedRegion: string;
  selectedDistrict?: string;
  selectedSphere?: string;
  logisticsCost: number;
  cart: QuoteItem[];
}): Promise<string> {
  const quoteId = `QP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const now = new Date();
  
  // Calculate total amount with sealed snapshot prices
  const cartLinesTotal = data.cart.reduce((sum, item) => {
    const p = (!item.selectedPrice || item.selectedPrice === Infinity) ? 0 : Number(item.selectedPrice);
    return sum + p * item.quantity;
  }, 0);
  const totalAmount = cartLinesTotal + (data.cart.length > 0 ? data.logisticsCost : 0);

  // Sanitize products to make sure snapshot stores clean serializable product info
  // Strip large imageBase64 strings (>30KB) to strictly avoid Firestore 1MB document limit
  const itemsSnapshot: QuoteItem[] = data.cart.map((item) => {
    const rawImg = item.product?.imageBase64 || "";
    // Preserve imageBase64 up to ~200KB to ensure print quality without hitting Firestore document limit
    const cleanImg = rawImg.length > 0 && rawImg.length < 300000 ? rawImg : "";

    return {
      product: {
        id: item.product?.id || "",
        name: item.product?.name || "Без названия",
        code: item.product?.code || "",
        unit: item.product?.unit || "шт.",
        sphere: item.product?.sphere || "",
        spheres: Array.isArray(item.product?.spheres) ? item.product.spheres : [],
        category: item.product?.category || "",
        description: item.product?.description || "",
        imageBase64: cleanImg,
        mimeType: item.product?.mimeType || "image/jpeg",
      },
      quantity: item.quantity || 1,
      selectedSupplier: item.selectedSupplier || "supplier2",
      selectedPrice: (!item.selectedPrice || item.selectedPrice === Infinity) ? 0 : Number(item.selectedPrice),
    };
  });

  // Capture hardware / device digital fingerprint snapshot quietly
  let deviceAudit: DeviceAuditInfo | undefined;
  try {
    deviceAudit = await captureDeviceAudit();
  } catch (e) {
    console.warn("Failed to capture device audit:", e);
  }

  const deviceAuditSummary = deviceAudit
    ? `Купон № ${quoteId} создан с: ${deviceAudit.summary}`
    : undefined;

  const record: QuoteRecord = {
    id: quoteId,
    clientName: (data.clientName || "").trim() || "Заказчик не указан",
    beneficiaryId: (data.beneficiaryId || "").trim() || undefined,
    facilitatorName: (data.facilitatorName || "").trim() || "Фасилитатор",
    facilitatorLegalName: (data.facilitatorLegalName || "").trim(),
    facilitatorRep: (data.facilitatorRep || "").trim(),
    facilitatorPhone: (data.facilitatorPhone || "").trim(),
    facilitatorEmail: (data.facilitatorEmail || "").trim(),
    specialistName: (data.specialistName || "").trim(),
    note: (data.note || "").trim(),
    createdAt: now.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    createdAtTimestamp: now.getTime(),
    selectedRegion: data.selectedRegion || "Все регионы",
    selectedDistrict: (data.selectedDistrict || "").trim(),
    selectedSphere: data.selectedSphere || "Все сферы",
    logisticsCost: Number(data.logisticsCost) || 0,
    items: itemsSnapshot,
    totalAmount: Number(totalAmount.toFixed(2)),
    deviceAudit,
    deviceAuditSummary,
  };

  try {
    const docRef = doc(db, "quotes_history", quoteId);
    
    // Wrap setDoc with a 10 second timeout so the UI never hangs indefinitely
    const savePromise = setDoc(docRef, record);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Таймаут подключения к серверу (10 сек). Проверьте интернет-соединение.")), 10000)
    );

    await Promise.race([savePromise, timeoutPromise]);

    // Asynchronously log audit event without blocking
    logAuditEvent({
      actionType: "CREATE_QUOTE",
      actorName: data.specialistName || data.facilitatorRep || data.facilitatorName || "Фасилитатор",
      actorRole: "facilitator",
      facilitatorName: data.facilitatorName,
      facilitatorRep: data.facilitatorRep,
      facilitatorPhone: data.facilitatorPhone,
      region: data.selectedRegion,
      district: data.selectedDistrict,
      beneficiaryName: data.clientName,
      beneficiaryId: data.beneficiaryId,
      quoteId,
      totalAmount,
      itemsCount: itemsSnapshot.length,
      details: `Оформлена спецификация КП на ${itemsSnapshot.length} товаров на сумму ${totalAmount.toLocaleString("ru-RU")} сомони (Бенефициар: ${data.clientName || "Не указан"})`,
      metadata: {
        deviceAudit,
        deviceFingerprintId: deviceAudit?.fingerprintId,
        deviceSummary: deviceAudit?.summary,
        items: itemsSnapshot.map((it) => ({
          name: it.product.name,
          qty: it.quantity,
          supplier: it.selectedSupplier,
          price: it.selectedPrice,
        })),
      },
    }).catch((err) => console.warn("Audit log error:", err));

    return quoteId;
  } catch (error) {
    console.error("Error saving quote to history:", error);
    throw error;
  }
}

export async function updateQuoteInHistory(
  quoteId: string,
  data: {
    clientName: string;
    beneficiaryId?: string;
    facilitatorName?: string;
    facilitatorLegalName?: string;
    facilitatorRep?: string;
    facilitatorPhone?: string;
    facilitatorEmail?: string;
    specialistName?: string;
    note?: string;
    selectedRegion: string;
    selectedDistrict?: string;
    selectedSphere?: string;
    logisticsCost: number;
    cart: QuoteItem[];
  }
): Promise<string> {
  const now = new Date();
  const dateFormatted = now.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const cartLinesTotal = data.cart.reduce((sum, item) => {
    const p = (!item.selectedPrice || item.selectedPrice === Infinity) ? 0 : Number(item.selectedPrice);
    return sum + p * item.quantity;
  }, 0);
  const totalAmount = Number((cartLinesTotal + (data.cart.length > 0 ? data.logisticsCost : 0)).toFixed(2));

  const itemsSnapshot: QuoteItem[] = data.cart.map((item) => {
    const rawImg = item.product?.imageBase64 || "";
    const cleanImg = rawImg.length > 0 && rawImg.length < 300000 ? rawImg : "";

    return {
      product: {
        id: item.product?.id || "",
        name: item.product?.name || "Без названия",
        code: item.product?.code || "",
        unit: item.product?.unit || "шт.",
        sphere: item.product?.sphere || "",
        spheres: Array.isArray(item.product?.spheres) ? item.product.spheres : [],
        category: item.product?.category || "",
        description: item.product?.description || "",
        imageBase64: cleanImg,
        mimeType: item.product?.mimeType || "image/jpeg",
      },
      quantity: item.quantity || 1,
      selectedSupplier: item.selectedSupplier || "supplier2",
      selectedPrice: (!item.selectedPrice || item.selectedPrice === Infinity) ? 0 : Number(item.selectedPrice),
    };
  });

  const docRef = doc(db, "quotes_history", quoteId);
  let existingData: Partial<QuoteRecord> = {};
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      existingData = docSnap.data() as QuoteRecord;
    }
  } catch (e) {
    console.warn("Could not fetch existing quote for diff, proceeding with merge", e);
  }

  const prevRevisions: QuoteRevision[] = Array.isArray(existingData.revisions) ? existingData.revisions : [];
  const revisionsList = [...prevRevisions];

  // If this is the very first revision, record the baseline creation revision
  if (revisionsList.length === 0 && existingData.createdAt) {
    revisionsList.push({
      id: `rev-initial-${existingData.createdAtTimestamp || Date.now() - 60000}`,
      timestamp: existingData.createdAtTimestamp || Date.now() - 60000,
      dateFormatted: existingData.createdAt,
      specialistName: existingData.specialistName || "Специалист",
      facilitatorName: existingData.facilitatorName || "Фасилитатор",
      clientName: existingData.clientName || "",
      itemsCount: existingData.items?.length || 0,
      totalAmount: existingData.totalAmount || 0,
      changeSummary: "Первоначальное сохранение купона в архив",
      items: existingData.items || [],
    });
  }

  // Calculate detailed differences between old and new cart
  const oldItems = existingData.items || [];
  const addedItems: string[] = [];
  const removedItems: string[] = [];
  const modifiedItems: string[] = [];

  const oldMap = new Map<string, QuoteItem>();
  oldItems.forEach((it) => {
    const key = it.product?.id || it.product?.name;
    if (key) oldMap.set(key, it);
  });

  const newMap = new Map<string, QuoteItem>();
  itemsSnapshot.forEach((it) => {
    const key = it.product?.id || it.product?.name;
    if (key) newMap.set(key, it);
  });

  itemsSnapshot.forEach((it) => {
    const key = it.product?.id || it.product?.name;
    const oldIt = key ? oldMap.get(key) : undefined;
    if (!oldIt) {
      addedItems.push(`+ ${it.product?.name || "Товар"} (${it.quantity} ${it.product?.unit || "шт."})`);
    } else {
      const isQtyDiff = oldIt.quantity !== it.quantity;
      const isSupDiff = oldIt.selectedSupplier !== it.selectedSupplier;
      const isPriceDiff = oldIt.selectedPrice !== it.selectedPrice;
      if (isQtyDiff || isSupDiff || isPriceDiff) {
        const changes: string[] = [];
        if (isQtyDiff) changes.push(`кол-во: ${oldIt.quantity} ➔ ${it.quantity} ${it.product?.unit || "шт."}`);
        if (isPriceDiff) changes.push(`цена: ${oldIt.selectedPrice} ➔ ${it.selectedPrice} с.`);
        if (isSupDiff) changes.push(`поставщик изменен`);
        modifiedItems.push(`${it.product?.name || "Товар"} (${changes.join(", ")})`);
      }
    }
  });

  oldItems.forEach((it) => {
    const key = it.product?.id || it.product?.name;
    if (key && !newMap.has(key)) {
      removedItems.push(`- ${it.product?.name || "Товар"} (${it.quantity} ${it.product?.unit || "шт."})`);
    }
  });

  // Create new revision record
  const prevTotal = existingData.totalAmount;
  const prevCount = existingData.items?.length;
  const priceDiff = prevTotal !== undefined ? Number((totalAmount - prevTotal).toFixed(2)) : 0;

  let summaryParts: string[] = [];
  summaryParts.push(`Позиций: ${itemsSnapshot.length}`);
  if (prevCount !== undefined && prevCount !== itemsSnapshot.length) {
    summaryParts.push(`(было ${prevCount})`);
  }
  summaryParts.push(`• Итого: ${totalAmount.toFixed(2)} с.`);
  if (prevTotal !== undefined && priceDiff !== 0) {
    summaryParts.push(`(${priceDiff > 0 ? "+" : ""}${priceDiff.toFixed(2)} с.)`);
  }
  if (data.specialistName && data.specialistName !== existingData.specialistName) {
    summaryParts.push(`• Специалист: ${data.specialistName}`);
  }

  // Capture hardware / device digital fingerprint snapshot quietly on update
  let deviceAudit: DeviceAuditInfo | undefined;
  try {
    deviceAudit = await captureDeviceAudit();
  } catch (e) {
    console.warn("Failed to capture device audit on edit:", e);
  }

  const deviceAuditSummary = deviceAudit
    ? `Изменено с: ${deviceAudit.summary}`
    : undefined;

  const newRevision: QuoteRevision = {
    id: `rev-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: now.getTime(),
    dateFormatted,
    specialistName: (data.specialistName || "").trim() || existingData.specialistName || "",
    facilitatorName: (data.facilitatorName || "").trim() || existingData.facilitatorName || "",
    clientName: (data.clientName || "").trim() || existingData.clientName || "",
    itemsCount: itemsSnapshot.length,
    totalAmount,
    previousTotalAmount: prevTotal,
    previousItemsCount: prevCount,
    changeSummary: summaryParts.join(" "),
    addedItems,
    removedItems,
    modifiedItems,
    items: itemsSnapshot,
    deviceAudit,
    deviceAuditSummary,
  };

  revisionsList.unshift(newRevision); // Most recent revision at top

  const updatedRecord: Partial<QuoteRecord> = {
    clientName: (data.clientName || "").trim() || existingData.clientName || "Заказчик не указан",
    beneficiaryId: data.beneficiaryId !== undefined ? (data.beneficiaryId.trim() || undefined) : existingData.beneficiaryId,
    facilitatorName: (data.facilitatorName || "").trim() || existingData.facilitatorName || "Фасилитатор",
    facilitatorLegalName: (data.facilitatorLegalName || "").trim() || existingData.facilitatorLegalName || "",
    facilitatorRep: (data.facilitatorRep || "").trim() || existingData.facilitatorRep || "",
    facilitatorPhone: (data.facilitatorPhone || "").trim() || existingData.facilitatorPhone || "",
    facilitatorEmail: (data.facilitatorEmail || "").trim() || existingData.facilitatorEmail || "",
    specialistName: (data.specialistName || "").trim() || existingData.specialistName || "",
    note: (data.note || "").trim(),
    updatedAt: dateFormatted,
    updatedAtTimestamp: now.getTime(),
    selectedRegion: data.selectedRegion || existingData.selectedRegion || "Все регионы",
    selectedDistrict: (data.selectedDistrict || "").trim() || existingData.selectedDistrict || "",
    selectedSphere: data.selectedSphere || existingData.selectedSphere || "Все сферы",
    logisticsCost: Number(data.logisticsCost) || 0,
    items: itemsSnapshot,
    totalAmount,
    revisions: revisionsList,
    deviceAudit: deviceAudit || existingData.deviceAudit,
    deviceAuditSummary: deviceAudit ? `Купон № ${quoteId} обновлен с: ${deviceAudit.summary}` : existingData.deviceAuditSummary,
  };

  try {
    const savePromise = setDoc(docRef, updatedRecord, { merge: true });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Таймаут подключения к серверу (10 сек). Проверьте интернет-соединение.")), 10000)
    );
    await Promise.race([savePromise, timeoutPromise]);

    // Asynchronously log audit event for quote edit
    logAuditEvent({
      actionType: "EDIT_QUOTE",
      actorName: data.specialistName || data.facilitatorRep || data.facilitatorName || "Специалист",
      actorRole: "specialist",
      facilitatorName: data.facilitatorName || existingData.facilitatorName,
      facilitatorRep: data.facilitatorRep || existingData.facilitatorRep,
      facilitatorPhone: data.facilitatorPhone || existingData.facilitatorPhone,
      region: data.selectedRegion || existingData.selectedRegion,
      district: data.selectedDistrict || existingData.selectedDistrict,
      beneficiaryName: data.clientName || existingData.clientName,
      beneficiaryId: data.beneficiaryId || existingData.beneficiaryId,
      quoteId,
      totalAmount,
      itemsCount: itemsSnapshot.length,
      details: `Внесены изменения в спецификацию: ${summaryParts.join(" ")}`,
      metadata: {
        changeSummary: summaryParts.join(" "),
        addedItems,
        removedItems,
        modifiedItems,
        deviceAudit,
        deviceFingerprintId: deviceAudit?.fingerprintId,
        deviceSummary: deviceAudit?.summary,
      },
    }).catch((err) => console.warn("Audit log error:", err));

    return quoteId;
  } catch (error) {
    console.error("Error updating quote in history:", error);
    throw error;
  }
}

export async function fetchQuotesHistory(): Promise<QuoteRecord[]> {
  try {
    const q = query(collection(db, "quotes_history"), orderBy("createdAtTimestamp", "desc"));
    const snap = await getDocs(q);
    const records: QuoteRecord[] = [];
    snap.forEach((d) => {
      records.push(d.data() as QuoteRecord);
    });
    return records;
  } catch (error) {
    console.error("Error fetching quotes history:", error);
    // Fallback if index fails
    try {
      const snap = await getDocs(collection(db, "quotes_history"));
      const records: QuoteRecord[] = [];
      snap.forEach((d) => {
        records.push(d.data() as QuoteRecord);
      });
      return records.sort((a, b) => (b.createdAtTimestamp || 0) - (a.createdAtTimestamp || 0));
    } catch (e) {
      console.error("Fallback fetch quotes history failed:", e);
      return [];
    }
  }
}

export async function deleteQuoteFromHistory(quoteId: string): Promise<void> {
  try {
    const docRef = doc(db, "quotes_history", quoteId);
    let deletedMeta: any = null;
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) deletedMeta = snap.data();
    } catch {
      // Ignore
    }
    await deleteDoc(docRef);

    logAuditEvent({
      actionType: "DELETE_QUOTE",
      actorName: "Администратор / Аудитор",
      actorRole: "admin",
      quoteId,
      beneficiaryName: deletedMeta?.clientName,
      beneficiaryId: deletedMeta?.beneficiaryId,
      totalAmount: deletedMeta?.totalAmount,
      region: deletedMeta?.selectedRegion,
      district: deletedMeta?.selectedDistrict,
      details: `Удалена спецификация КП № ${quoteId} (Бенефициар: ${deletedMeta?.clientName || "Не указан"}, сумма: ${deletedMeta?.totalAmount || 0} с.)`,
    }).catch((err) => console.warn("Audit log error:", err));
  } catch (error) {
    console.error("Error deleting quote from history:", error);
    throw error;
  }
}

export async function deleteAllQuotesFromHistory(): Promise<number> {
  try {
    const snap = await getDocs(collection(db, "quotes_history"));
    if (snap.empty) return 0;

    let batch = writeBatch(db);
    let count = 0;
    let total = 0;

    for (const docSnap of snap.docs) {
      batch.delete(docSnap.ref);
      count++;
      total++;
      if (count >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }
    return total;
  } catch (error) {
    console.error("Error deleting all quotes from history:", error);
    throw error;
  }
}

/**
 * Fetch a single quote by its ID for electronic verification and audit
 */
export async function fetchQuoteById(quoteId: string): Promise<QuoteRecord | null> {
  if (!quoteId) return null;
  try {
    const cleanId = quoteId.trim();
    const docRef = doc(db, "quotes_history", cleanId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as QuoteRecord;
    }
    return null;
  } catch (error) {
    console.error("Error fetching single quote by id:", error);
    return null;
  }
}
