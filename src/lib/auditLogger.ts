import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { fetchQuotesHistory } from "./quotesHistory";
import { captureDeviceAudit, getQuickDeviceSnapshot } from "./deviceFingerprint";

export type AuditActionType =
  | "USER_LOGIN"
  | "ADMIN_LOGIN"
  | "ADMIN_LOGOUT"
  | "FACILITATOR_LOGIN"
  | "FACILITATOR_LOGOUT"
  | "FACILITATOR_SWITCH"
  | "SUPPLIER_LOGIN"
  | "SUPPLIER_LOGOUT"
  | "SUPPLIER_UPDATE_PRICE"
  | "SUPPLIER_BATCH_PRICE_UPDATE"
  | "SUPPLIER_ADD_PRODUCT"
  | "SUPPLIER_EDIT_PRODUCT"
  | "SUPPLIER_DELETE_PRODUCT"
  | "SUPPLIER_IMPORT_EXCEL"
  | "SUPPLIER_EXPORT_EXCEL"
  | "SUPPLIER_CLEAR_PRICES"
  | "CREATE_QUOTE"
  | "EDIT_QUOTE"
  | "DELETE_QUOTE"
  | "PRINT_CART"
  | "PRINT_CATALOG"
  | "UPDATE_PRICE_EXCEL"
  | "EXPORT_EXCEL"
  | "UPDATE_DICTIONARY"
  | "SECURITY_AUDIT"
  | "CLEAR_CART";

export type AuditActorRole = "admin" | "facilitator" | "specialist" | "operator" | "supplier";

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  dateFormatted: string;
  actionType: AuditActionType;
  actorName: string;
  actorRole: AuditActorRole;
  facilitatorName?: string;
  facilitatorRep?: string;
  facilitatorPhone?: string;
  region?: string;
  district?: string;
  beneficiaryName?: string;
  beneficiaryId?: string;
  quoteId?: string;
  totalAmount?: number;
  itemsCount?: number;
  supplierId?: string;
  supplierName?: string;
  supplierCode?: string;
  productId?: string;
  productName?: string;
  productCode?: string;
  oldPrice?: number;
  newPrice?: number;
  diffAmount?: number;
  details: string;
  metadata?: Record<string, any>;
  sessionToken: string;
}

// Generate or retrieve persistent browser session token
export function getSessionToken(): string {
  try {
    let token = sessionStorage.getItem("spmei_session_token");
    if (!token) {
      token = "SES-" + Math.random().toString(36).substring(2, 9).toUpperCase() + "-" + Date.now().toString(36);
      sessionStorage.setItem("spmei_session_token", token);
    }
    return token;
  } catch (e) {
    return "SES-" + Date.now().toString(36);
  }
}

// Format date in Dushanbe / RU locale with seconds
export function formatAuditDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function cleanAuditObject<T>(val: T): T {
  if (val === undefined || val === null) {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(cleanAuditObject) as unknown as T;
  }
  if (typeof val === "object" && !(val instanceof Date)) {
    const res: any = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        res[k] = cleanAuditObject(v);
      }
    }
    return res;
  }
  return val;
}

/**
 * Log an audit action into Firestore collection `audit_logs`
 * Non-blocking, fails gracefully
 */
export async function logAuditEvent(entry: {
  actionType: AuditActionType;
  actorName: string;
  actorRole?: AuditActorRole;
  facilitatorName?: string;
  facilitatorRep?: string;
  facilitatorPhone?: string;
  region?: string;
  district?: string;
  beneficiaryName?: string;
  beneficiaryId?: string;
  quoteId?: string;
  totalAmount?: number;
  itemsCount?: number;
  supplierId?: string;
  supplierName?: string;
  supplierCode?: string;
  productId?: string;
  productName?: string;
  productCode?: string;
  oldPrice?: number;
  newPrice?: number;
  diffAmount?: number;
  details: string;
  metadata?: Record<string, any>;
}): Promise<string | null> {
  try {
    const now = Date.now();
    const id = `LOG-${now}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
    const sessionToken = getSessionToken();

    let meta = { ...(entry.metadata || {}) };
    if (!meta.deviceAudit) {
      try {
        const snap = await captureDeviceAudit();
        meta.deviceAudit = snap;
        meta.deviceFingerprintId = snap.fingerprintId;
        meta.deviceSummary = snap.summary;
      } catch {
        const quick = getQuickDeviceSnapshot();
        meta.deviceSummary = quick.summary;
        meta.deviceFingerprintId = quick.fingerprintId;
      }
    }

    const rawEntry: AuditLogEntry = {
      id,
      timestamp: now,
      dateFormatted: formatAuditDate(now),
      actionType: entry.actionType,
      actorName: entry.actorName?.trim() || "Неизвестный пользователь",
      actorRole: entry.actorRole || "specialist",
      facilitatorName: entry.facilitatorName?.trim() || undefined,
      facilitatorRep: entry.facilitatorRep?.trim() || undefined,
      facilitatorPhone: entry.facilitatorPhone?.trim() || undefined,
      region: entry.region?.trim() || undefined,
      district: entry.district?.trim() || undefined,
      beneficiaryName: entry.beneficiaryName?.trim() || undefined,
      beneficiaryId: entry.beneficiaryId?.trim() || undefined,
      quoteId: entry.quoteId?.trim() || undefined,
      totalAmount: entry.totalAmount !== undefined ? Number(entry.totalAmount.toFixed(2)) : undefined,
      itemsCount: entry.itemsCount !== undefined ? Number(entry.itemsCount) : undefined,
      supplierId: entry.supplierId?.trim() || undefined,
      supplierName: entry.supplierName?.trim() || undefined,
      supplierCode: entry.supplierCode?.trim() || undefined,
      productId: entry.productId?.trim() || undefined,
      productName: entry.productName?.trim() || undefined,
      productCode: entry.productCode?.trim() || undefined,
      oldPrice: entry.oldPrice !== undefined ? Number(entry.oldPrice) : undefined,
      newPrice: entry.newPrice !== undefined ? Number(entry.newPrice) : undefined,
      diffAmount: entry.diffAmount !== undefined ? Number(entry.diffAmount) : undefined,
      details: entry.details,
      metadata: meta,
      sessionToken,
    };

    const fullEntry = cleanAuditObject(rawEntry);

    // Save to Firestore
    await setDoc(doc(db, "audit_logs", id), fullEntry);

    // Also store the last 50 in local storage as fallback / instant cache
    try {
      const cached = JSON.parse(localStorage.getItem("spmei_recent_audit_logs") || "[]");
      cached.unshift(fullEntry);
      if (cached.length > 50) cached.length = 50;
      localStorage.setItem("spmei_recent_audit_logs", JSON.stringify(cached));
    } catch {
      // Ignore localStorage quotas
    }

    return id;
  } catch (error) {
    console.warn("Failed to write audit log to Firestore:", error);
    return null;
  }
}

/**
 * Fetch all audit logs from Firestore
 */
export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  try {
    const q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(1000));
    const snapshot = await getDocs(q);
    const logs: AuditLogEntry[] = [];
    snapshot.forEach((d) => {
      logs.push(d.data() as AuditLogEntry);
    });
    return logs;
  } catch (error) {
    console.warn("Error fetching audit logs, trying fallback:", error);
    try {
      const cached = JSON.parse(localStorage.getItem("spmei_recent_audit_logs") || "[]");
      return cached;
    } catch {
      return [];
    }
  }
}

/**
 * Subscribe in real-time to audit logs stream
 */
export function subscribeToAuditLogs(callback: (logs: AuditLogEntry[]) => void): () => void {
  try {
    const q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(1000));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logs: AuditLogEntry[] = [];
        snapshot.forEach((d) => {
          logs.push(d.data() as AuditLogEntry);
        });
        callback(logs);
      },
      (error) => {
        console.warn("Firestore onSnapshot error for audit_logs, using polling fallback:", error);
        getAuditLogs().then(callback);
      }
    );
    return unsubscribe;
  } catch (err) {
    console.warn("Failed to initiate audit_logs snapshot subscription:", err);
    getAuditLogs().then(callback);
    return () => {};
  }
}

/**
 * Sync existing quote history records into audit_logs if they are not yet indexed
 */
export async function syncHistoricalQuotesToAudit(): Promise<number> {
  try {
    const quotes = await fetchQuotesHistory();
    const existingLogs = await getAuditLogs();
    const existingQuoteLogMap = new Set(existingLogs.map((l) => l.quoteId).filter(Boolean));

    let createdCount = 0;
    for (const q of quotes) {
      if (!existingQuoteLogMap.has(q.id)) {
        const id = `LOG-${q.createdAtTimestamp || Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
        const entry: AuditLogEntry = {
          id,
          timestamp: q.createdAtTimestamp || Date.now(),
          dateFormatted: formatAuditDate(q.createdAtTimestamp || Date.now()),
          actionType: "CREATE_QUOTE",
          actorName: q.specialistName || q.facilitatorRep || q.facilitatorName || "Фасилитатор",
          actorRole: "facilitator",
          facilitatorName: q.facilitatorName,
          facilitatorRep: q.facilitatorRep,
          facilitatorPhone: q.facilitatorPhone,
          region: q.selectedRegion,
          district: q.selectedDistrict,
          beneficiaryName: q.clientName,
          beneficiaryId: q.beneficiaryId,
          quoteId: q.id,
          totalAmount: q.totalAmount,
          itemsCount: q.items?.length || 0,
          details: `Оформлена спецификация КП на ${q.items?.length || 0} товаров на сумму ${q.totalAmount?.toLocaleString("ru-RU")} сомони (архивная запись)`,
          metadata: {
            isArchivedImport: true,
            items: q.items?.map((it) => ({
              name: it.product.name,
              qty: it.quantity,
              supplier: it.selectedSupplier,
              price: it.selectedPrice,
            })),
          },
          sessionToken: "HISTORICAL_SYNC",
        };
        await setDoc(doc(db, "audit_logs", id), entry);
        createdCount++;
      }
    }
    return createdCount;
  } catch (err) {
    console.error("Failed to sync historical quotes to audit:", err);
    return 0;
  }
}

/**
 * Delete a single audit log entry from Firestore
 */
export async function deleteAuditLog(id: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, "audit_logs", id));
    try {
      const cached = JSON.parse(localStorage.getItem("spmei_recent_audit_logs") || "[]");
      const updated = cached.filter((l: AuditLogEntry) => l.id !== id);
      localStorage.setItem("spmei_recent_audit_logs", JSON.stringify(updated));
    } catch {
      // ignore
    }
    return true;
  } catch (err) {
    console.error("Failed to delete audit log entry:", err);
    throw err;
  }
}

/**
 * Delete multiple audit log entries from Firestore in bulk batches
 */
export async function deleteBulkAuditLogs(ids: string[]): Promise<number> {
  if (!ids || ids.length === 0) return 0;
  try {
    const chunkSize = 400; // Under Firestore 500 ops per batch limit
    let totalDeleted = 0;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((id) => {
        batch.delete(doc(db, "audit_logs", id));
      });
      await batch.commit();
      totalDeleted += chunk.length;
    }

    try {
      const idSet = new Set(ids);
      const cached = JSON.parse(localStorage.getItem("spmei_recent_audit_logs") || "[]");
      const updated = cached.filter((l: AuditLogEntry) => !idSet.has(l.id));
      localStorage.setItem("spmei_recent_audit_logs", JSON.stringify(updated));
    } catch {
      // ignore
    }

    return totalDeleted;
  } catch (err) {
    console.error("Failed to bulk delete audit log entries:", err);
    throw err;
  }
}
