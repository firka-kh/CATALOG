import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { fetchQuotesHistory } from "./quotesHistory";

export type AuditActionType =
  | "USER_LOGIN"
  | "ADMIN_LOGIN"
  | "FACILITATOR_SWITCH"
  | "CREATE_QUOTE"
  | "EDIT_QUOTE"
  | "DELETE_QUOTE"
  | "PRINT_CART"
  | "PRINT_CATALOG"
  | "UPDATE_PRICE_EXCEL"
  | "EXPORT_EXCEL"
  | "UPDATE_DICTIONARY"
  | "CLEAR_CART";

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  dateFormatted: string;
  actionType: AuditActionType;
  actorName: string;
  actorRole: "admin" | "facilitator" | "specialist" | "operator";
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

/**
 * Log an audit action into Firestore collection `audit_logs`
 * Non-blocking, fails gracefully
 */
export async function logAuditEvent(entry: {
  actionType: AuditActionType;
  actorName: string;
  actorRole?: "admin" | "facilitator" | "specialist" | "operator";
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
  details: string;
  metadata?: Record<string, any>;
}): Promise<string | null> {
  try {
    const now = Date.now();
    const id = `LOG-${now}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
    const sessionToken = getSessionToken();

    const fullEntry: AuditLogEntry = {
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
      details: entry.details,
      metadata: entry.metadata || {},
      sessionToken,
    };

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
