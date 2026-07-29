import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "./firebase";
import { Product } from "../types";

export interface QuoteItem {
  product: Product;
  quantity: number;
  selectedSupplier: "supplier1" | "supplier2" | "supplier3" | "supplier4";
  selectedPrice: number;
}

export interface QuoteRecord {
  id: string;
  clientName: string;
  facilitatorName: string;
  note?: string;
  createdAt: string;
  createdAtTimestamp: number;
  selectedRegion: string;
  selectedSphere?: string;
  logisticsCost: number;
  items: QuoteItem[];
  totalAmount: number;
}

export async function saveQuoteToHistory(data: {
  clientName: string;
  facilitatorName?: string;
  note?: string;
  selectedRegion: string;
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
    // Keep image only if it's small enough (e.g. <30,000 chars ~ 20KB) to keep document tiny (<50KB)
    const cleanImg = rawImg.length > 0 && rawImg.length < 30000 ? rawImg : "";

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

  const record: QuoteRecord = {
    id: quoteId,
    clientName: (data.clientName || "").trim() || "Заказчик не указан",
    facilitatorName: (data.facilitatorName || "").trim() || "Фасилитатор",
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
    selectedSphere: data.selectedSphere || "Все сферы",
    logisticsCost: Number(data.logisticsCost) || 0,
    items: itemsSnapshot,
    totalAmount: Number(totalAmount.toFixed(2)),
  };

  try {
    const docRef = doc(db, "quotes_history", quoteId);
    
    // Wrap setDoc with a 10 second timeout so the UI never hangs indefinitely
    const savePromise = setDoc(docRef, record);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Таймаут подключения к серверу (10 сек). Проверьте интернет-соединение.")), 10000)
    );

    await Promise.race([savePromise, timeoutPromise]);
    return quoteId;
  } catch (error) {
    console.error("Error saving quote to history:", error);
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
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting quote from history:", error);
    throw error;
  }
}
