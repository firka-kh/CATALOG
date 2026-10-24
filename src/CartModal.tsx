import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  X,
  Printer,
  Plus,
  Minus,
  Trash2,
  Package,
  FileDown,
  Search,
  Check,
  Truck,
  Loader2,
  User,
  Archive,
  BookmarkCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  MapPin,
  UserCheck,
  Building2,
  FileText,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Edit3,
  History,
  HelpCircle,
  QrCode,
} from "lucide-react";
import { Product } from "./types";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "./lib/firebase";

import { downloadCartExcel } from "./lib/excelExport";
import { saveQuoteToHistory, updateQuoteInHistory, fetchQuotesHistory, QuoteRecord } from "./lib/quotesHistory";
import { logAuditEvent } from "./lib/auditLogger";
import { DISTRICTS_BY_REGION } from "./App";

interface CartItem {
  product: Product;
  quantity: number;
  selectedSupplier: "supplier1" | "supplier2" | "supplier3" | "supplier4";
  selectedPrice: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  updateQuantity: (
    productId: string,
    supplier: "supplier1" | "supplier2" | "supplier3" | "supplier4",
    delta: number,
  ) => void;
  onPrint: () => void;
  onPrintWithMeta?: (
    clientName: string,
    facilitatorName: string,
    note: string,
    quoteId?: string,
    district?: string,
    specialistName?: string,
    facilitatorLegalName?: string,
    facilitatorRep?: string,
    facilitatorPhone?: string,
    facilitatorEmail?: string,
    beneficiaryId?: string
  ) => void;
  onOpenQuotesHistory?: () => void;
  suppliers: string[];
  products: Product[];
  onAddToCart: (
    p: Product,
    supplier?: "supplier1" | "supplier2" | "supplier3" | "supplier4",
    price?: number,
  ) => void;
  selectedRegion: string;
  selectedDistrict?: string;
  onDistrictChange?: (district: string) => void;
  districtsByRegion?: Record<string, string[]>;
  getProductPrice: (
    p: Product,
    supplier: "supplier1" | "supplier2" | "supplier3" | "supplier4",
    region: string,
  ) => number;
  onUpdateSupplier?: (
    productId: string,
    oldSupplier: "supplier1" | "supplier2" | "supplier3" | "supplier4",
    newSupplier: "supplier1" | "supplier2" | "supplier3" | "supplier4",
  ) => void;
  regions?: string[];
  onRegionChange?: (region: string) => void;
  logisticsCost?: number;
  showBestPrice?: boolean;
  supplierPhones?: Record<string, string>;
  supplierLegalNames?: Record<string, string>;
  supplierAssignedCodes?: Record<string, string>;
  selectedSphere?: string;
  onClearCart?: () => void;
  defaultFacilitatorName?: string;
  facilitatorLegalName?: string;
  facilitatorRep?: string;
  facilitatorPhone?: string;
  facilitatorEmail?: string;
  facilitatorLegalNames?: Record<string, string>;
  facilitatorRepresentatives?: Record<string, string>;
  facilitatorPhones?: Record<string, string>;
  facilitatorEmails?: Record<string, string>;
  facilitatorRegions?: Record<string, string>;
  facilitators?: string[];
  restoredMetadata?: {
    quoteId?: string;
    clientName?: string;
    beneficiaryId?: string;
    facilitatorName?: string;
    facilitatorLegalName?: string;
    facilitatorRep?: string;
    facilitatorPhone?: string;
    facilitatorEmail?: string;
    specialistName?: string;
    note?: string;
    district?: string;
  };
}

export function CartModal({
  isOpen,
  onClose,
  cart,
  updateQuantity,
  onPrint,
  onPrintWithMeta,
  onOpenQuotesHistory,
  suppliers,
  products,
  onAddToCart,
  selectedRegion,
  selectedDistrict = "",
  onDistrictChange,
  districtsByRegion,
  getProductPrice,
  onUpdateSupplier,
  regions = [],
  onRegionChange,
  logisticsCost = 0,
  showBestPrice = false,
  supplierPhones,
  supplierLegalNames,
  supplierAssignedCodes,
  selectedSphere,
  onClearCart,
  defaultFacilitatorName = "Фасилитатор",
  facilitatorLegalName,
  facilitatorRep,
  facilitatorPhone,
  facilitatorEmail,
  facilitatorLegalNames,
  facilitatorRepresentatives,
  facilitatorPhones,
  facilitatorEmails,
  facilitatorRegions,
  facilitators,
  restoredMetadata,
}: Props) {
  const [addMode, setAddMode] = useState<"single" | "mass">("single");
  const [massInputText, setMassInputText] = useState("");

  const [searchIdQuery, setSearchIdQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedQuickProduct, setSelectedQuickProduct] =
    useState<Product | null>(null);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);

  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  // Customer metadata state
  const [clientName, setClientName] = useState("");
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [existingQuotes, setExistingQuotes] = useState<QuoteRecord[]>([]);
  const [isDuplicateConfirmModalOpen, setIsDuplicateConfirmModalOpen] = useState(false);
  const [facilitatorName, setFacilitatorName] = useState(defaultFacilitatorName);
  const [currentFacilitatorLegalName, setCurrentFacilitatorLegalName] = useState(facilitatorLegalName || "");
  const [currentFacilitatorRep, setCurrentFacilitatorRep] = useState(facilitatorRep || "");
  const [currentFacilitatorPhone, setCurrentFacilitatorPhone] = useState(facilitatorPhone || "");
  const [currentFacilitatorEmail, setCurrentFacilitatorEmail] = useState(facilitatorEmail || "");
  const [specialistName, setSpecialistName] = useState("");
  const [district, setDistrict] = useState(selectedDistrict || "");
  const [note, setNote] = useState("");
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const [historySavedMsg, setHistorySavedMsg] = useState<string | null>(null);
  const [clientNameError, setClientNameError] = useState(false);
  const [specialistNameError, setSpecialistNameError] = useState(false);
  const [districtError, setDistrictError] = useState(false);
  const [isSavedToHistory, setIsSavedToHistory] = useState(false);
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null);
  const [isEditingArchiveQuote, setIsEditingArchiveQuote] = useState(false);
  const [isMetaCollapsed, setIsMetaCollapsed] = useState(true);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [saveRequiredError, setSaveRequiredError] = useState(false);
  const [isConfirmSaveModalOpen, setIsConfirmSaveModalOpen] = useState(false);
  const [saveHistoryError, setSaveHistoryError] = useState<string | null>(null);
  const [isSavedSuccessModalOpen, setIsSavedSuccessModalOpen] = useState(false);
  const [clientNameCharWarning, setClientNameCharWarning] = useState<string | null>(null);

  const clientNameInputRef = useRef<HTMLInputElement>(null);
  const specialistNameInputRef = useRef<HTMLInputElement>(null);
  const districtSelectRef = useRef<HTMLSelectElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const clientNameWarningTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchQuotesHistory()
        .then((records) => setExistingQuotes(records || []))
        .catch((err) => console.warn("Failed to load quotes for duplicate check:", err));
    }
  }, [isOpen]);

  const handleBeneficiaryIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, "").slice(0, 6);
    setBeneficiaryId(rawVal);
  };

  const duplicateMatch = useMemo(() => {
    if (!existingQuotes || existingQuotes.length === 0) return null;

    // Check ID match
    const cleanId = beneficiaryId.trim();
    let idMatch: QuoteRecord | undefined;
    if (cleanId.length > 0) {
      idMatch = existingQuotes.find((q) => {
        if (savedQuoteId && q.id === savedQuoteId) return false;
        return q.beneficiaryId && q.beneficiaryId.trim() === cleanId;
      });
    }

    // Check Name match (case-insensitive, normalized whitespace)
    const cleanName = clientName.trim().toLowerCase().replace(/\s+/g, " ");
    let nameMatch: QuoteRecord | undefined;
    if (cleanName.length >= 3) {
      nameMatch = existingQuotes.find((q) => {
        if (savedQuoteId && q.id === savedQuoteId) return false;
        const qName = (q.clientName || "").trim().toLowerCase().replace(/\s+/g, " ");
        return qName === cleanName;
      });
    }

    if (!idMatch && !nameMatch) return null;

    return {
      idMatch,
      nameMatch,
      matchedQuote: idMatch || nameMatch!,
      type: idMatch && nameMatch ? ("both" as const) : idMatch ? ("id" as const) : ("name" as const),
    };
  }, [existingQuotes, beneficiaryId, clientName, savedQuoteId]);

  const triggerClientNameWarning = (msg = "Разрешены только буквы (латиница и кириллица). Цифры и знаки запрещены!") => {
    setClientNameCharWarning(msg);
    if (clientNameWarningTimerRef.current) {
      clearTimeout(clientNameWarningTimerRef.current);
    }
    clientNameWarningTimerRef.current = setTimeout(() => {
      setClientNameCharWarning(null);
    }, 3500);
  };

  const handleClientNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow navigation, control keys, Backspace, Delete, Tab, Arrow keys, etc.
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }
    // Only allow Latin [a-zA-Z], Cyrillic [\u0400-\u04FF] (Russian + Tajik), space, hyphen
    const isAllowed = /^[a-zA-Z\u0400-\u04FF\s\-]$/.test(e.key);
    if (!isAllowed) {
      e.preventDefault();
      triggerClientNameWarning();
    }
  };

  const handleClientNamePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasteData = e.clipboardData.getData("text");
    if (/[^a-zA-Z\u0400-\u04FF\s\-]/.test(pasteData)) {
      e.preventDefault();
      const filtered = pasteData.replace(/[^a-zA-Z\u0400-\u04FF\s\-]/g, "");
      const input = e.currentTarget;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const currentVal = input.value;
      const nextVal = currentVal.slice(0, start) + filtered + currentVal.slice(end);
      setClientName(nextVal);
      if (nextVal.trim()) setClientNameError(false);
      triggerClientNameWarning("Цифры и спецсимволы отфильтрованы! Разрешены только буквы.");
    }
  };

  const handleClientNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    if (/[^a-zA-Z\u0400-\u04FF\s\-]/.test(rawVal)) {
      const filtered = rawVal.replace(/[^a-zA-Z\u0400-\u04FF\s\-]/g, "");
      setClientName(filtered);
      if (filtered.trim()) setClientNameError(false);
      triggerClientNameWarning();
    } else {
      setClientName(rawVal);
      if (rawVal.trim()) setClientNameError(false);
      if (clientNameCharWarning) setClientNameCharWarning(null);
    }
  };

  const handleClientNameBeforeInput = (e: any) => {
    if (e.data && /[^a-zA-Z\u0400-\u04FF\s\-]/.test(e.data)) {
      e.preventDefault();
      triggerClientNameWarning();
    }
  };

  useEffect(() => {
    return () => {
      if (clientNameWarningTimerRef.current) {
        clearTimeout(clientNameWarningTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedDistrict) {
      setDistrict(selectedDistrict);
    }
  }, [selectedDistrict]);

  useEffect(() => {
    if (facilitatorLegalName !== undefined && facilitatorLegalName !== "") {
      setCurrentFacilitatorLegalName(facilitatorLegalName);
    }
    if (facilitatorRep !== undefined && facilitatorRep !== "") {
      setCurrentFacilitatorRep(facilitatorRep);
    }
    if (facilitatorPhone !== undefined && facilitatorPhone !== "") {
      setCurrentFacilitatorPhone(facilitatorPhone);
    }
    if (facilitatorEmail !== undefined && facilitatorEmail !== "") {
      setCurrentFacilitatorEmail(facilitatorEmail);
    }
  }, [facilitatorLegalName, facilitatorRep, facilitatorPhone, facilitatorEmail]);

  useEffect(() => {
    // If phone, email, or representative is missing, try to resolve from dictionary
    const targetName = (currentFacilitatorLegalName || facilitatorLegalName || facilitatorName || "").trim().toLowerCase();
    if (!targetName || targetName === "фасилитатор") return;

    let matchKey: string | null = null;
    if (facilitatorLegalNames) {
      for (const [k, lName] of Object.entries(facilitatorLegalNames)) {
        const lStr = String(lName || "").trim().toLowerCase();
        if (lStr && (lStr === targetName || targetName.includes(lStr) || lStr.includes(targetName))) {
          matchKey = k;
          break;
        }
      }
    }
    if (!matchKey && facilitators) {
      const idx = facilitators.findIndex(
        (f) => f && (f.trim().toLowerCase() === targetName || targetName.includes(f.trim().toLowerCase()) || f.trim().toLowerCase().includes(targetName))
      );
      if (idx >= 0) matchKey = `facilitator${idx + 2}`;
    }
    if (matchKey) {
      if (!currentFacilitatorPhone && facilitatorPhones?.[matchKey]) {
        setCurrentFacilitatorPhone(facilitatorPhones[matchKey]);
      }
      if (!currentFacilitatorEmail && facilitatorEmails?.[matchKey]) {
        setCurrentFacilitatorEmail(facilitatorEmails[matchKey]);
      }
      if (!currentFacilitatorRep && facilitatorRepresentatives?.[matchKey]) {
        setCurrentFacilitatorRep(facilitatorRepresentatives[matchKey]);
      }
    }
  }, [
    currentFacilitatorLegalName,
    facilitatorLegalName,
    facilitatorName,
    facilitatorPhones,
    facilitatorEmails,
    facilitatorRepresentatives,
    facilitators,
    facilitatorLegalNames,
    currentFacilitatorPhone,
    currentFacilitatorEmail,
    currentFacilitatorRep,
  ]);

  useEffect(() => {
    if (restoredMetadata?.clientName || restoredMetadata?.quoteId || restoredMetadata?.beneficiaryId) {
      if (restoredMetadata.clientName) setClientName(restoredMetadata.clientName);
      if (restoredMetadata.beneficiaryId !== undefined) setBeneficiaryId(restoredMetadata.beneficiaryId);
      if (restoredMetadata.facilitatorName) setFacilitatorName(restoredMetadata.facilitatorName);
      if (restoredMetadata.facilitatorLegalName) setCurrentFacilitatorLegalName(restoredMetadata.facilitatorLegalName);
      if (restoredMetadata.facilitatorRep) setCurrentFacilitatorRep(restoredMetadata.facilitatorRep);
      if (restoredMetadata.facilitatorPhone) setCurrentFacilitatorPhone(restoredMetadata.facilitatorPhone);
      if (restoredMetadata.facilitatorEmail) setCurrentFacilitatorEmail(restoredMetadata.facilitatorEmail);
      if (restoredMetadata.specialistName) setSpecialistName(restoredMetadata.specialistName);
      if (restoredMetadata.district) {
        setDistrict(restoredMetadata.district);
        onDistrictChange?.(restoredMetadata.district);
      }
      if (restoredMetadata.note !== undefined) setNote(restoredMetadata.note);
      if (restoredMetadata.quoteId) {
        setSavedQuoteId(restoredMetadata.quoteId);
        setIsEditingArchiveQuote(true);
      } else {
        setIsEditingArchiveQuote(false);
      }
      setIsSavedToHistory(true);
    }
  }, [restoredMetadata, onDistrictChange]);

  const availableDistricts = useMemo(() => {
    if (!selectedRegion) return [];
    if (districtsByRegion && districtsByRegion[selectedRegion] && districtsByRegion[selectedRegion].length > 0) {
      return districtsByRegion[selectedRegion];
    }
    return DISTRICTS_BY_REGION[selectedRegion] || [];
  }, [districtsByRegion, selectedRegion]);

  const displayedCart = useMemo(() => {
    if (!selectedSphere || selectedSphere === "Все сферы" || selectedSphere.toLowerCase().includes("все") || selectedSphere.trim() === "") return cart;
    return cart.filter((item) => {
      const prodSpheres = item.product.spheres && item.product.spheres.length > 0 
        ? item.product.spheres 
        : [item.product.sphere || "Общее"];
      return prodSpheres.some(s => 
        s === selectedSphere || 
        s.includes(selectedSphere) || 
        selectedSphere.includes(s)
      );
    });
  }, [cart, selectedSphere]);

  const validateClientName = (shouldFocus = true): boolean => {
    if (!clientName.trim()) {
      setClientNameError(true);
      setSaveRequiredError(false);
      if (shouldFocus && clientNameInputRef.current) {
        clientNameInputRef.current.focus();
        clientNameInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return false;
    }
    setClientNameError(false);
    return true;
  };

  const validateSpecialistName = (shouldFocus = true): boolean => {
    if (!specialistName.trim()) {
      setSpecialistNameError(true);
      setSaveRequiredError(false);
      if (shouldFocus && specialistNameInputRef.current) {
        specialistNameInputRef.current.focus();
        specialistNameInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return false;
    }
    setSpecialistNameError(false);
    return true;
  };

  const validateDistrict = (shouldFocus = true): boolean => {
    if (!district.trim()) {
      setDistrictError(true);
      setSaveRequiredError(false);
      if (shouldFocus && districtSelectRef.current) {
        districtSelectRef.current.focus();
        districtSelectRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return false;
    }
    setDistrictError(false);
    return true;
  };

  const validateAllRequiredFields = (): boolean => {
    const okClient = validateClientName(false);
    const okSpec = validateSpecialistName(false);
    const okDist = validateDistrict(false);

    if (!okClient || !okSpec || !okDist) {
      setIsMetaCollapsed(false);
    }

    if (!okClient) {
      clientNameInputRef.current?.focus();
      clientNameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    if (!okSpec) {
      specialistNameInputRef.current?.focus();
      specialistNameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    if (!okDist) {
      districtSelectRef.current?.focus();
      districtSelectRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    setSaveRequiredError(false);
    return true;
  };

  const validateCanExportOrPrint = (): boolean => {
    return validateAllRequiredFields();
  };

  useEffect(() => {
    if (defaultFacilitatorName) {
      setFacilitatorName(defaultFacilitatorName);
    }
  }, [defaultFacilitatorName]);

  useEffect(() => {
    if (!isOpen) {
      setIsConfirmingClear(false);
      setIsConfirmSaveModalOpen(false);
      setIsSavedSuccessModalOpen(false);
    }
  }, [isOpen]);

  const handleClearCartClick = () => {
    if (!isConfirmingClear) {
      setIsConfirmingClear(true);
    } else {
      onClearCart?.();
      setClientName("");
      setBeneficiaryId("");
      setSpecialistName("");
      setDistrict(selectedDistrict || "");
      setNote("");
      setIsSavedToHistory(false);
      setClientNameError(false);
      setSpecialistNameError(false);
      setDistrictError(false);
      setSaveRequiredError(false);
      setIsConfirmingClear(false);
    }
  };

  useEffect(() => {
    if (cart.length === 0) {
      setClientName("");
      setBeneficiaryId("");
      setSpecialistName("");
      setDistrict(selectedDistrict || "");
      setNote("");
      setIsSavedToHistory(false);
      setClientNameError(false);
      setSpecialistNameError(false);
      setDistrictError(false);
      setSaveRequiredError(false);
    }
  }, [cart.length, selectedDistrict]);

  useEffect(() => {
    if (isConfirmingClear) {
      const t = setTimeout(() => setIsConfirmingClear(false), 4000);
      return () => clearTimeout(t);
    }
  }, [isConfirmingClear]);

  const cartLinesTotal = displayedCart.reduce(
    (sum, item) => sum + (item.selectedPrice === Infinity ? 0 : (item.selectedPrice || 0)) * item.quantity,
    0,
  );
  const total = cartLinesTotal + (displayedCart.length > 0 ? logisticsCost : 0);

  const getSupplierName = (
    supp?: "supplier1" | "supplier2" | "supplier3" | "supplier4" | string,
  ) => {
    if (!supp || supp === "supplier1") return "Логистика";
    if (supp && supplierAssignedCodes?.[supp]) {
      const code = supplierAssignedCodes[supp];
      if (code.match(/^(?:ПОС|POS)[-_]\d+$/i)) {
        const num = parseInt(code.replace(/\D/g, ""), 10) || 1;
        return `SPMEI-${99 + num}`;
      }
      return code;
    }
    const list = suppliers || [];
    const idx = supp === "supplier2" ? 0 : supp === "supplier3" ? 1 : supp === "supplier4" ? 2 : -1;
    if (idx >= 0 && list[idx]) {
      const code = list[idx];
      if (code.match(/^(?:ПОС|POS)[-_]\d+$/i)) {
        const num = parseInt(code.replace(/\D/g, ""), 10) || 1;
        return `SPMEI-${99 + num}`;
      }
      return code;
    }
    if (supp === "supplier2") return "SPMEI-100";
    if (supp === "supplier3") return "SPMEI-101";
    if (supp === "supplier4") return "SPMEI-102";
    return "Логистика";
  };

  const filteredProducts = useMemo(() => {
    const q = searchIdQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => {
        const codeMatch = p.code
          ? String(p.code).toLowerCase().includes(q)
          : false;
        const idMatch = p.id ? p.id.toLowerCase().includes(q) : false;
        const nameMatch = p.name ? p.name.toLowerCase().includes(q) : false;
        return codeMatch || idMatch || nameMatch;
      })
      .slice(0, 10);
  }, [searchIdQuery, products]);

  // Find cheapest supplier and price on region selection automatically for quick product
  const cheapestQuickInfo = useMemo(() => {
    if (!selectedQuickProduct) return null;
    const sups: ("supplier2" | "supplier3" | "supplier4")[] = [
      "supplier2",
      "supplier3",
      "supplier4",
    ];
    let minPrice = Infinity;
    let bestSupplier: "supplier2" | "supplier3" | "supplier4" | "supplier1" = "supplier2";

    const searchRegions = selectedRegion ? [selectedRegion] : regions;

    searchRegions.forEach((reg) => {
      sups.forEach((sup) => {
        const pr = getProductPrice(selectedQuickProduct, sup, reg);
        if (pr > 0 && pr < minPrice) {
          minPrice = pr;
          bestSupplier = sup;
        }
      });
    });

    if (minPrice === Infinity) {
      return { supplier: bestSupplier, price: Infinity };
    }

    return { supplier: bestSupplier, price: minPrice };
  }, [selectedQuickProduct, selectedRegion, regions, getProductPrice]);

  const handleQuickAdd = () => {
    if (!selectedQuickProduct || !cheapestQuickInfo) return;

    if (cheapestQuickInfo.price === Infinity) {
      setAddedMessage(`Игнорировано (нет цены): ${selectedQuickProduct.name}`);
      setTimeout(() => setAddedMessage(null), 3000);
      setSearchIdQuery("");
      setSelectedQuickProduct(null);
      setShowSuggestions(false);
      return;
    }

    onAddToCart(
      selectedQuickProduct,
      cheapestQuickInfo.supplier,
      cheapestQuickInfo.price,
    );

    // Set success notification
    setAddedMessage(
      `Добавлено: ${selectedQuickProduct.name} (${getSupplierName(cheapestQuickInfo.supplier)}: ${cheapestQuickInfo.price.toFixed(2)} с.)`,
    );
    setTimeout(() => setAddedMessage(null), 3000);

    // Reset selection after adding
    setSearchIdQuery("");
    setSelectedQuickProduct(null);
    setShowSuggestions(false);
  };

  // Mass input analysis
  const [massAnalysis, setMassAnalysis] = useState<{
    found: Product[];
    notFound: string[];
    totalCount: number;
  }>({ found: [], notFound: [], totalCount: 0 });
  const [isAnalyzingMass, setIsAnalyzingMass] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    if (!massInputText.trim()) {
      setMassAnalysis({ found: [], notFound: [], totalCount: 0 });
      setIsAnalyzingMass(false);
      return;
    }

    const analyze = async () => {
      setIsAnalyzingMass(true);
      const items = massInputText
        .split(/[\s,;\n\t]+/)
        .map((s) => s.trim().replace(/^#/, ""))
        .filter(Boolean);

      const foundMap = new Map<string, Product>();
      const notFoundLocallyMap = new Set<string>();

      // 1. Local check
      items.forEach((rawItem) => {
        const lowered = rawItem.toLowerCase();
        const matched = products.find((p) => {
          const pCode = p.code ? String(p.code).toLowerCase() : "";
          const pId = p.id ? p.id.toLowerCase() : "";
          return pCode === lowered || pId === lowered;
        });

        if (matched) {
          foundMap.set(matched.id, matched);
        } else {
          notFoundLocallyMap.add(rawItem);
        }
      });

      // 2. Fetch missing from Firestore
      if (notFoundLocallyMap.size > 0 && !isCancelled) {
        const fetchPromises = Array.from(notFoundLocallyMap).map(
          async (rawItem) => {
            try {
              // First try direct document lookup (ID)
              const docRef = doc(db, "products", rawItem);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                return { id: docSnap.id, ...docSnap.data() } as Product;
              }
              // Then try code lookup
              const q = query(
                collection(db, "products"),
                where("code", "==", rawItem),
              );
              const qs = await getDocs(q);
              if (!qs.empty) {
                const d = qs.docs[0];
                return { id: d.id, ...d.data() } as Product;
              }
            } catch (e) {
              console.error("Error fetching " + rawItem, e);
            }
            return null;
          },
        );

        const fetched = await Promise.all(fetchPromises);
        fetched.forEach((p) => {
          if (p) {
            foundMap.set(p.id, p);
          }
        });
      }

      if (isCancelled) return;

      // 3. Finalize match array
      const finalFound: Product[] = [];
      const finalNotFound: string[] = [];

      items.forEach((rawItem) => {
        const lowered = rawItem.toLowerCase();
        const p = Array.from(foundMap.values()).find(
          (x) =>
            (x.code ? String(x.code).toLowerCase() === lowered : false) ||
            (x.id ? x.id.toLowerCase() === lowered : false),
        );

        if (p) {
          if (!finalFound.some((x) => x.id === p.id)) {
            finalFound.push(p);
          }
        } else {
          if (!finalNotFound.includes(rawItem)) {
            finalNotFound.push(rawItem);
          }
        }
      });

      setMassAnalysis({
        found: finalFound,
        notFound: finalNotFound,
        totalCount: items.length,
      });
      setIsAnalyzingMass(false);
    };

    const handler = setTimeout(analyze, 300);
    return () => {
      isCancelled = true;
      clearTimeout(handler);
    };
  }, [massInputText, products]);

  const handleMassAdd = () => {
    const { found } = massAnalysis;
    if (found.length === 0) return;

    let addedCount = 0;

    found.forEach((p) => {
      const sups: ("supplier2" | "supplier3" | "supplier4")[] = [
        "supplier2",
        "supplier3",
        "supplier4",
      ];
      let minPrice = Infinity;
      let bestSupplier: "supplier2" | "supplier3" | "supplier4" | "supplier1" = "supplier2";

      const searchRegions = selectedRegion ? [selectedRegion] : regions;

      searchRegions.forEach((reg) => {
        sups.forEach((sup) => {
          const pr = getProductPrice(p, sup, reg);
          if (pr > 0 && pr < minPrice) {
            minPrice = pr;
            bestSupplier = sup;
          }
        });
      });

      if (minPrice !== Infinity) {
        onAddToCart(p, bestSupplier, minPrice);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      setAddedMessage(
        `Успешно добавлено ${addedCount} товаров!`,
      );
      setTimeout(() => setAddedMessage(null), 3000);
      setMassInputText("");
    } else {
      setAddedMessage("Ни один товар не добавлен (нет цен).");
      setTimeout(() => setAddedMessage(null), 3000);
    }
  };

  const handleInitiateSaveToHistory = () => {
    if (displayedCart.length === 0) return;
    if (!validateAllRequiredFields()) return;
    if (isSavedToHistory && !isEditingArchiveQuote) {
      setIsSavedSuccessModalOpen(true);
      return;
    }
    if (duplicateMatch && !isEditingArchiveQuote) {
      setIsDuplicateConfirmModalOpen(true);
      return;
    }
    setIsConfirmSaveModalOpen(true);
  };

  const executeSaveToHistory = async () => {
    if (displayedCart.length === 0) return;
    if (!validateAllRequiredFields()) return;
    setSaveHistoryError(null);
    setIsSavingHistory(true);
    try {
      if (isEditingArchiveQuote && savedQuoteId) {
        // Update existing quote in archive with full revision history
        await updateQuoteInHistory(savedQuoteId, {
          clientName: clientName.trim(),
          beneficiaryId: beneficiaryId.trim() || undefined,
          facilitatorName: facilitatorName.trim() || "Фасилитатор",
          facilitatorLegalName: (currentFacilitatorLegalName || facilitatorLegalName)?.trim(),
          facilitatorRep: (currentFacilitatorRep || facilitatorRep)?.trim(),
          facilitatorPhone: (currentFacilitatorPhone || facilitatorPhone)?.trim(),
          facilitatorEmail: (currentFacilitatorEmail || facilitatorEmail)?.trim(),
          specialistName: specialistName.trim(),
          note: note.trim(),
          selectedRegion: selectedRegion || "Все регионы",
          selectedDistrict: district.trim(),
          selectedSphere: selectedSphere || "Все сферы",
          logisticsCost: displayedCart.length > 0 ? logisticsCost : 0,
          cart: displayedCart,
        });

        setHistorySavedMsg("✓ Изменения сохранены в Архив КП! Корзина очищена.");
        setSaveRequiredError(false);
        setIsSavedToHistory(false);
        setSavedQuoteId(null);
        setIsEditingArchiveQuote(false);
        setIsConfirmSaveModalOpen(false);

        // Automatically clear cart as requested!
        onClearCart?.();
        setClientName("");
        setBeneficiaryId("");
        setSpecialistName("");
        setNote("");

        // Close cart and immediately open Archive to show updated quote with revisions
        setTimeout(() => {
          onClose();
          onOpenQuotesHistory?.();
        }, 600);
        return;
      }

      // Brand new quote creation
      const qId = await saveQuoteToHistory({
        clientName: clientName.trim(),
        beneficiaryId: beneficiaryId.trim() || undefined,
        facilitatorName: facilitatorName.trim() || "Фасилитатор",
        facilitatorLegalName: (currentFacilitatorLegalName || facilitatorLegalName)?.trim(),
        facilitatorRep: (currentFacilitatorRep || facilitatorRep)?.trim(),
        facilitatorPhone: (currentFacilitatorPhone || facilitatorPhone)?.trim(),
        facilitatorEmail: (currentFacilitatorEmail || facilitatorEmail)?.trim(),
        specialistName: specialistName.trim(),
        note: note.trim(),
        selectedRegion: selectedRegion || "Все регионы",
        selectedDistrict: district.trim(),
        selectedSphere: selectedSphere || "Все сферы",
        logisticsCost: displayedCart.length > 0 ? logisticsCost : 0,
        cart: displayedCart,
      });

      setIsConfirmSaveModalOpen(false);
      setIsSavedToHistory(true);
      setSavedQuoteId(qId);
      setSaveRequiredError(false);
      setHistorySavedMsg("✓ Успешно сохранено в Архив купонов!");
      setIsSavedSuccessModalOpen(true);
    } catch (err: any) {
      console.error("Error saving quote to history:", err);
      setSaveHistoryError(err?.message || "Ошибка подключения к серверу");
    } finally {
      setIsSavingHistory(false);
    }
  };

  const handleExcelExport = async () => {
    if (!validateCanExportOrPrint()) return;
    logAuditEvent({
      actionType: "EXPORT_EXCEL",
      actorName: specialistName.trim() || currentFacilitatorRep || facilitatorName.trim(),
      actorRole: "facilitator",
      facilitatorName: facilitatorName.trim(),
      region: selectedRegion,
      district: district.trim(),
      beneficiaryName: clientName.trim(),
      beneficiaryId: beneficiaryId.trim() || undefined,
      quoteId: savedQuoteId || undefined,
      totalAmount: total,
      itemsCount: displayedCart.length,
      details: `Экспорт спецификации КП в Excel (Бенефициар: ${clientName.trim() || "Не указан"}, сумма: ${total.toLocaleString("ru-RU")} сомони)`,
    }).catch((err) => console.warn("Audit error:", err));

    await downloadCartExcel(
      displayedCart,
      displayedCart.length > 0 ? logisticsCost : 0,
      suppliers,
      selectedRegion,
      selectedSphere,
      clientName.trim(),
      facilitatorName.trim(),
      note.trim(),
      district.trim(),
      specialistName.trim(),
      beneficiaryId.trim() || undefined
    );
  };

  const handlePrintAction = () => {
    if (!validateCanExportOrPrint()) return;
    if (onPrintWithMeta) {
      onPrintWithMeta(
        clientName.trim(),
        facilitatorName.trim(),
        note.trim(),
        savedQuoteId || undefined,
        district.trim(),
        specialistName.trim(),
        currentFacilitatorLegalName || facilitatorLegalName,
        currentFacilitatorRep || facilitatorRep,
        currentFacilitatorPhone || facilitatorPhone,
        currentFacilitatorEmail || facilitatorEmail,
        beneficiaryId.trim() || undefined
      );
    } else {
      onPrint();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[95vh] sm:h-auto max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between p-4 sm:p-6 border-b border-slate-100 shrink-0 gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              КУПОН (корзина)
            </h2>
            <div className="text-xs sm:text-sm text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{displayedCart.length} наименований</span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] sm:text-xs border border-slate-200 flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-400" />
                Регион: <strong className="text-slate-900">{selectedRegion || "Все регионы"}</strong> (закреплен)
              </span>
              {district && (
                <span className="font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px] sm:text-xs border border-indigo-200 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-indigo-500" />
                  Район: <strong>{district}</strong>
                </span>
              )}
              <span className="font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px] sm:text-xs border border-indigo-100">
                Сфера: {selectedSphere || "Все сферы"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              type="button"
              onClick={handleExcelExport}
              disabled={!isSavedToHistory || displayedCart.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-md transition-all text-xs sm:text-sm font-medium flex-1 sm:flex-none justify-center ${
                isSavedToHistory && displayedCart.length > 0
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-sm cursor-pointer opacity-100"
                  : "bg-slate-700 text-slate-400 cursor-not-allowed opacity-50 border border-slate-600"
              }`}
              title={!isSavedToHistory ? "Сначала укажите ФИО Бенефициара и сохраните купон в Архив!" : undefined}
            >
              <FileDown className="w-4 h-4 shrink-0" />
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={handlePrintAction}
              disabled={!isSavedToHistory || displayedCart.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-md transition-all text-xs sm:text-sm font-medium flex-1 sm:flex-none justify-center ${
                isSavedToHistory && displayedCart.length > 0
                  ? "bg-slate-800 hover:bg-slate-700 text-white shadow-sm cursor-pointer opacity-100"
                  : "bg-slate-700 text-slate-400 cursor-not-allowed opacity-50 border border-slate-600"
              }`}
              title={!isSavedToHistory ? "Сначала укажите ФИО Бенефициара и сохраните купон в Архив!" : undefined}
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>Печать</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
            >
              <X className="w-5 h-5 shrink-0" />
            </button>
          </div>
        </div>

        {/* Editing Archive Coupon Notice Banner */}
        {isEditingArchiveQuote && savedQuoteId && (
          <div className="bg-amber-100 border-b border-amber-300 px-3.5 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-black text-xs shrink-0 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-200 border border-amber-400 text-black shrink-0">
                <Edit3 className="w-4 h-4 text-black" />
              </div>
              <div>
                <div className="font-extrabold text-black text-xs sm:text-sm flex items-center gap-2">
                  <span className="text-black font-extrabold">Режим редактирования Купона #{savedQuoteId} (Архив КП)</span>
                  <span className="text-[10px] bg-amber-200 text-black px-2 py-0.5 rounded-full border border-amber-400 font-bold">
                    Из архива
                  </span>
                </div>
                <div className="text-black font-medium text-[11px] mt-0.5 leading-snug">
                  Внесите изменения в товары или анкету. Нажмите <strong className="text-black font-black underline">«Сохранить изменения»</strong> — купон обновится в Архиве с сохранением истории изменений, а корзина автоматически очистится.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onClearCart?.();
                setIsEditingArchiveQuote(false);
                setSavedQuoteId(null);
                setClientName("");
                setBeneficiaryId("");
                setSpecialistName("");
                setNote("");
                onClose();
              }}
              className="px-3 py-1.5 text-[11px] font-bold text-black hover:text-black bg-amber-200 hover:bg-amber-300 active:bg-amber-400 border border-amber-400 rounded-lg transition-all shrink-0 cursor-pointer shadow-xs"
              title="Отменить редактирование и закрыть"
            >
              Отменить правку
            </button>
          </div>
        )}

        {/* Customer Metadata / Archive Coupon Card */}
        <div className="bg-slate-900 text-white p-3.5 sm:p-5 border-b border-slate-800 shrink-0 shadow-inner">
          {clientNameError && (
            <div className="bg-rose-500/20 border border-rose-500/50 text-rose-200 p-3 rounded-lg text-xs flex items-center justify-between gap-2 mb-3 shadow-lg animate-pulse">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  <strong>Ошибка:</strong> Пожалуйста, укажите <strong>ФИО Бенефициара / Клиента *</strong> перед сохранением, печатью или скачиванием Excel!
                </span>
              </div>
              <button
                onClick={() => setClientNameError(false)}
                className="text-rose-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {specialistNameError && (
            <div className="bg-rose-500/20 border border-rose-500/50 text-rose-200 p-3 rounded-lg text-xs flex items-center justify-between gap-2 mb-3 shadow-lg animate-pulse">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  <strong>Ошибка:</strong> Пожалуйста, укажите <strong>ФИО специалиста *</strong>, кто заполнял купон!
                </span>
              </div>
              <button
                onClick={() => setSpecialistNameError(false)}
                className="text-rose-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {districtError && (
            <div className="bg-rose-500/20 border border-rose-500/50 text-rose-200 p-3 rounded-lg text-xs flex items-center justify-between gap-2 mb-3 shadow-lg animate-pulse">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  <strong>Ошибка:</strong> Пожалуйста, обязательно выберите <strong>Район *</strong> для закрепленного региона {selectedRegion ? `«${selectedRegion}»` : ''}!
                </span>
              </div>
              <button
                onClick={() => setDistrictError(false)}
                className="text-rose-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {saveRequiredError && !clientNameError && !specialistNameError && !districtError && (
            <div className="bg-amber-500/20 border border-amber-500/50 text-amber-200 p-3 rounded-lg text-xs flex items-center justify-between gap-2 mb-3 shadow-lg animate-pulse">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Предупреждение:</strong> Необходимы данные! Купон ещё не сохранен в Архив. Нажмите кнопку <strong>«Сохранить купон в Архив»</strong> для получения доступа к Excel и печати!
                </span>
              </div>
              <button
                onClick={() => setSaveRequiredError(false)}
                className="text-amber-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {isMetaCollapsed ? (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 py-0.5">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {/* Beneficiary */}
                <div
                  onClick={() => {
                    setIsMetaCollapsed(false);
                    setTimeout(() => clientNameInputRef.current?.focus(), 50);
                  }}
                  className="flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 px-2.5 py-1 rounded-lg cursor-pointer transition-colors shadow-xs"
                  title="Нажмите, чтобы указать или изменить ID и ФИО бенефициара"
                >
                  <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-slate-400">Бенефициар:</span>
                  {beneficiaryId && (
                    <span className="bg-slate-900 text-white font-mono font-bold text-[11px] px-1.5 py-0.5 rounded border border-slate-600 shadow-2xs">
                      ID: {beneficiaryId}
                    </span>
                  )}
                  {clientName ? (
                    <strong className="text-white font-semibold">{clientName}</strong>
                  ) : (
                    <span className="text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">
                      ⚠️ Не указан *
                    </span>
                  )}
                </div>

                {/* Specialist */}
                <div
                  onClick={() => {
                    setIsMetaCollapsed(false);
                    setTimeout(() => specialistNameInputRef.current?.focus(), 50);
                  }}
                  className="flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 px-2.5 py-1 rounded-lg cursor-pointer transition-colors shadow-xs"
                  title="Нажмите, чтобы указать или изменить ФИО специалиста"
                >
                  <UserCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-slate-400">Специалист:</span>
                  {specialistName ? (
                    <strong className="text-white font-semibold">{specialistName}</strong>
                  ) : (
                    <span className="text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">
                      ⚠️ Не указан *
                    </span>
                  )}
                </div>

                {/* District */}
                <div
                  onClick={() => {
                    setIsMetaCollapsed(false);
                    setTimeout(() => districtSelectRef.current?.focus(), 50);
                  }}
                  className="flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 px-2.5 py-1 rounded-lg cursor-pointer transition-colors shadow-xs"
                  title="Нажмите, чтобы выбрать район"
                >
                  <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-slate-400">Район:</span>
                  {district ? (
                    <strong className="text-white font-semibold">{district}</strong>
                  ) : (
                    <span className="text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">
                      ⚠️ Не выбран *
                    </span>
                  )}
                </div>

                {/* Status Badge */}
                {isEditingArchiveQuote && savedQuoteId ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shadow-xs">
                    <Edit3 className="w-3 h-3 text-amber-400" /> Правка #{savedQuoteId}
                  </span>
                ) : isSavedToHistory ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shadow-xs">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> В Архиве
                  </span>
                ) : (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shadow-xs">
                    <AlertTriangle className="w-3 h-3 text-amber-400" /> Не сохранен
                  </span>
                )}
              </div>

              {/* Action Buttons in Collapsed Strip */}
              <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                <button
                  type="button"
                  onClick={handleInitiateSaveToHistory}
                  disabled={isSavingHistory || displayedCart.length === 0 || (isSavedToHistory && !isEditingArchiveQuote)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all shadow-sm ${
                    isEditingArchiveQuote
                      ? "bg-amber-600 hover:bg-amber-500 text-white cursor-pointer"
                      : isSavedToHistory
                      ? "bg-slate-700 text-emerald-400 border border-emerald-500/40 cursor-not-allowed opacity-90"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                  }`}
                  title={
                    isSavedToHistory && !isEditingArchiveQuote
                      ? `Купон уже сохранен в Архиве КП под номером ${savedQuoteId}. Для изменения перейдите в Архив КП.`
                      : "Сохранить купон в Архив"
                  }
                >
                  {isSavingHistory ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isEditingArchiveQuote ? (
                    <Edit3 className="w-3.5 h-3.5" />
                  ) : isSavedToHistory ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <BookmarkCheck className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isSavingHistory
                      ? "Сохранение..."
                      : isEditingArchiveQuote
                      ? "Сохранить изменения"
                      : isSavedToHistory
                      ? "✓ Сохранен в Архив"
                      : "Сохранить в Архив"}
                  </span>
                </button>

                {onOpenQuotesHistory && (
                  <button
                    type="button"
                    onClick={onOpenQuotesHistory}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-xs font-semibold transition-all shadow-sm cursor-pointer"
                    title="Открыть реестр / Архив КП"
                  >
                    <Archive className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden sm:inline">Реестр (Архив)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsMetaCollapsed(false)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95"
                  title="Развернуть анкету для изменения полей"
                >
                  <span>Анкета</span>
                  <ChevronDown className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>
          ) : (
            <div>
              {/* Header when expanded */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
                    <User className="w-3 h-3 text-indigo-400" />
                  </div>
                  <span className="font-bold text-xs sm:text-sm text-white tracking-wide">
                    Анкета клиента и реквизиты купона
                  </span>
                  {isEditingArchiveQuote && savedQuoteId ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Редактирование #{savedQuoteId}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMetaCollapsed(true)}
                    className="flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white border border-slate-700 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    title="Свернуть анкету в компактную полосу"
                  >
                    <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Свернуть анкету</span>
                  </button>
                </div>
              </div>

              {/* 3 Required Fields in One Clean Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Field 1: Beneficiary ID and Name */}
                <div className="flex gap-2 items-start">
                  {/* ID Input */}
                  <div className="w-20 sm:w-24 shrink-0">
                    <label
                      className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1"
                      title="ID бенефициара (только цифры, не более 6 символов)"
                    >
                      ID
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="ID"
                      value={beneficiaryId}
                      onChange={handleBeneficiaryIdChange}
                      className="w-full h-[36px] bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none font-mono font-bold text-center transition-all shadow-sm"
                    />
                  </div>

                  {/* Beneficiary Name */}
                  <div className="flex-1 min-w-0 relative">
                    <label
                      className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1 flex items-center justify-between cursor-help"
                      title="ФИО бенефициара / получателя помощи (только буквы)"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <User className="w-3 h-3 text-indigo-400 shrink-0" />
                        <span className="truncate">ФИО Бенефициара <span className="text-rose-400 font-black">*</span></span>
                      </span>
                    </label>
                    <input
                      ref={clientNameInputRef}
                      type="text"
                      placeholder="ФИО бенефициара / клиента..."
                      value={clientName}
                      onChange={handleClientNameChange}
                      onKeyDown={handleClientNameKeyDown}
                      onPaste={handleClientNamePaste}
                      onBeforeInput={handleClientNameBeforeInput}
                      className={`w-full h-[36px] bg-slate-800 border rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none font-medium transition-all shadow-sm ${
                        clientNameCharWarning
                          ? "border-amber-400 ring-2 ring-amber-400/50 bg-amber-950/40"
                          : clientNameError
                          ? "border-rose-500 ring-2 ring-rose-500/50 bg-rose-950/40"
                          : "border-slate-700 hover:border-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
                      }`}
                    />
                    {clientNameCharWarning && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-300 bg-amber-950/90 border border-amber-500/60 px-2 py-0.5 rounded-md mt-1 shadow-lg">
                        <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>{clientNameCharWarning}</span>
                      </div>
                    )}
                    {clientNameError && !clientNameCharWarning && (
                      <span className="text-[10px] font-bold text-rose-400 mt-1 block">
                        Заполните ФИО Бенефициара!
                      </span>
                    )}
                  </div>
                </div>

                {/* Field 2: Specialist Name */}
                <div>
                  <label
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1 flex items-center justify-between cursor-help"
                    title="ФИО специалиста организации, оформившего купон"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <UserCheck className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span className="truncate">ФИО Специалиста <span className="text-rose-400 font-black">*</span></span>
                    </span>
                  </label>
                  <input
                    ref={specialistNameInputRef}
                    type="text"
                    placeholder="ФИО специалиста..."
                    value={specialistName}
                    onChange={(e) => {
                      setSpecialistName(e.target.value);
                      if (e.target.value.trim()) setSpecialistNameError(false);
                    }}
                    className={`w-full h-[36px] bg-slate-800 border rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none font-medium transition-all shadow-sm ${
                      specialistNameError
                        ? "border-rose-500 ring-2 ring-rose-500/50 bg-rose-950/40"
                        : "border-slate-700 hover:border-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
                    }`}
                  />
                  {specialistNameError && (
                    <span className="text-[10px] font-bold text-rose-400 mt-1 block">
                      Укажите ФИО специалиста!
                    </span>
                  )}
                </div>

                {/* Field 3: District */}
                <div>
                  <label
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1 flex items-center justify-between cursor-help"
                    title="Район закрепленного региона из справочника"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span className="truncate">Район <span className="text-rose-400 font-black">*</span></span>
                    </span>
                  </label>
                  <select
                    ref={districtSelectRef}
                    value={district}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDistrict(val);
                      onDistrictChange?.(val);
                      if (val.trim()) setDistrictError(false);
                    }}
                    className={`w-full h-[36px] bg-slate-800 border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none font-medium cursor-pointer transition-all shadow-sm ${
                      districtError
                        ? "border-rose-500 ring-2 ring-rose-500/50 bg-rose-950/40"
                        : "border-slate-700 hover:border-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
                    }`}
                  >
                    <option value="" className="bg-slate-900 text-slate-400">
                      {availableDistricts.length > 0 ? "-- Выберите район --" : "-- Нет районов для региона --"}
                    </option>
                    {availableDistricts.map((d) => (
                      <option key={d} value={d} className="bg-slate-900 text-white">
                        {d}
                      </option>
                    ))}
                  </select>
                  {districtError && (
                    <span className="text-[10px] font-bold text-rose-400 mt-1 block">
                      Обязательно выберите район!
                    </span>
                  )}
                </div>
              </div>

              {/* Duplicate Beneficiary Warning Banner - Strict Block */}
              {duplicateMatch && !isEditingArchiveQuote && (
                <div className="mt-3 p-3.5 rounded-xl bg-rose-950/90 border-2 border-rose-500/80 text-rose-200 text-xs shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-400 shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-rose-300 text-sm flex items-center gap-2 flex-wrap">
                        <span>⚠️ Бенефициар уже существует в базе! Создание дубликата запрещено</span>
                      </div>
                      <p className="text-rose-200/90 mt-1 text-xs leading-relaxed">
                        В Архиве КП найден купон <strong className="text-white font-mono bg-rose-900/60 px-1.5 py-0.5 rounded border border-rose-600/50">№ {duplicateMatch.matchedQuote.id}</strong> от {duplicateMatch.matchedQuote.createdAt}.
                        {duplicateMatch.matchedQuote.beneficiaryId ? ` ID: ${duplicateMatch.matchedQuote.beneficiaryId}.` : ""} Клиент: <strong className="text-white">{duplicateMatch.matchedQuote.clientName}</strong>.
                      </p>
                      <p className="text-rose-300/80 mt-1.5 text-[11px] leading-snug">
                        Создание отдельного повторного купона заблокировано правилами системы, чтобы не потерять историю изменений бенефициара. Внесите изменения или добавьте товары через <strong>«Редактировать»</strong> у существующего купона в Архиве КП.
                      </p>
                      <div className="mt-2.5 flex items-center gap-2.5 flex-wrap">
                        {onOpenQuotesHistory && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenQuotesHistory();
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs transition-all shadow-md active:scale-95 cursor-pointer"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            <span>Перейти в Архив КП для редактирования</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Second Row: Optional Note & Compact Locked Info & Save */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-3 mt-3 pt-2.5 border-t border-slate-800">
                <div className="flex items-center gap-2 w-full md:w-auto flex-1">
                  <input
                    type="text"
                    placeholder="Примечание / заметка к купону (не обязательно)..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full md:max-w-md h-[34px] bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 shadow-sm"
                  />
                  <div className="text-[11px] text-slate-400 hidden lg:flex items-center gap-1.5 shrink-0">
                    <Lock className="w-3 h-3 text-slate-500" />
                    <span>{selectedRegion || "Все регионы"}</span>
                    <span>•</span>
                    <span className="truncate max-w-[200px]" title={currentFacilitatorLegalName || facilitatorLegalName || facilitatorName}>
                      {currentFacilitatorLegalName || facilitatorLegalName || facilitatorName}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                  <button
                    type="button"
                    onClick={() => setIsMetaCollapsed(true)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all cursor-pointer"
                  >
                    Свернуть
                  </button>
                  <button
                    ref={saveButtonRef}
                    type="button"
                    onClick={handleInitiateSaveToHistory}
                    disabled={isSavingHistory || displayedCart.length === 0 || (isSavedToHistory && !isEditingArchiveQuote)}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md ${
                      isEditingArchiveQuote
                        ? "bg-amber-600 hover:bg-amber-500 text-white cursor-pointer"
                        : isSavedToHistory
                        ? "bg-slate-700 text-emerald-400 border border-emerald-500/40 cursor-not-allowed opacity-90"
                        : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                    }`}
                    title={
                      isSavedToHistory && !isEditingArchiveQuote
                        ? `Купон уже сохранен в Архиве КП под номером ${savedQuoteId}. Для изменения перейдите в Архив КП.`
                        : "Сохранить купон в Архив"
                    }
                  >
                    {isSavingHistory ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isEditingArchiveQuote ? (
                      <Edit3 className="w-3.5 h-3.5 text-white" />
                    ) : isSavedToHistory ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <BookmarkCheck className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isSavingHistory
                        ? "Сохранение..."
                        : isEditingArchiveQuote
                        ? `Сохранить изменения #${savedQuoteId}`
                        : isSavedToHistory
                        ? "✓ Сохранен в Архив"
                        : "Сохранить в Архив"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
    </div>

        {/* Quick Add Form Section - Collapsible / Space-Saving */}
        <div className="bg-slate-100 border-b border-slate-200 shrink-0 relative z-20">
          <div className="px-3.5 sm:px-6 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer ${
                  isQuickAddOpen
                    ? "bg-slate-800 text-white hover:bg-slate-700"
                    : "bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 hover:border-indigo-300"
                }`}
              >
                {isQuickAddOpen ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Скрыть поиск товаров</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Добавить товар по коду / поиску</span>
                    <ChevronDown className="w-3.5 h-3.5 text-indigo-400" />
                  </>
                )}
              </button>
              <span className="text-[11px] text-slate-500 hidden md:inline">
                Поиск по ID, коду или массовая вставка
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-600 font-medium">
                Товаров в списке: <strong className="text-slate-900 font-bold">{displayedCart.length}</strong>
              </span>
              {displayedCart.length > 0 && onClearCart && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Очистить список товаров в корзине?")) {
                      onClearCart();
                    }
                  }}
                  className="text-slate-400 hover:text-rose-600 text-xs underline cursor-pointer"
                  title="Очистить корзину"
                >
                  Очистить
                </button>
              )}
            </div>
          </div>

          {(isQuickAddOpen || displayedCart.length === 0) && (
            <div className="px-3.5 sm:px-6 pb-3 sm:pb-4 flex flex-col gap-3 border-t border-slate-200/60 pt-2.5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white border border-slate-200/65 p-2 rounded-xl shadow-xs">
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setAddMode("single")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                      addMode === "single"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    Одиночный поиск
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddMode("mass")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                      addMode === "mass"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    Массовый ввод
                  </button>
                </div>

                {addedMessage && (
                  <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-3 py-1 rounded text-xs font-bold flex items-center gap-1.5 animate-fade-in font-sans shrink-0">
                    <Check className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                    <span>{addedMessage}</span>
                  </div>
                )}
              </div>

          {addMode === "single" ? (
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-end">
              <div className="relative flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Введите ID, код товара или название для поиска..."
                    value={searchIdQuery}
                    onChange={(e) => {
                      setSearchIdQuery(e.target.value);
                      setShowSuggestions(true);
                      if (
                        selectedQuickProduct &&
                        e.target.value !==
                          (selectedQuickProduct.code
                            ? `#${selectedQuickProduct.code}`
                            : selectedQuickProduct.id)
                      ) {
                        setSelectedQuickProduct(null);
                      }
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-950 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
                  />
                  {searchIdQuery && (
                    <button
                      onClick={() => {
                        setSearchIdQuery("");
                        setSelectedQuickProduct(null);
                        setShowSuggestions(false);
                      }}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {showSuggestions && searchIdQuery.trim() && (
                  <div className="absolute top-full left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl shrink-0">
                    {filteredProducts.length === 0 ? (
                      <div className="p-3 text-sm text-slate-400 text-center italic">
                        Товары не найдены
                      </div>
                    ) : (
                      filteredProducts.map((p) => {
                        let hasPrice = false;
                        const sups: ("supplier2" | "supplier3" | "supplier4")[] = [
                          "supplier2",
                          "supplier3",
                          "supplier4",
                        ];
                        const searchRegions = selectedRegion ? [selectedRegion] : regions;
                        for (const reg of searchRegions) {
                          for (const sup of sups) {
                            const pr = getProductPrice(p, sup, reg);
                            if (pr > 0) {
                              hasPrice = true;
                              break;
                            }
                          }
                          if (hasPrice) break;
                        }

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedQuickProduct(p);
                              setSearchIdQuery(p.code ? `#${p.code}` : p.id);
                              setShowSuggestions(false);
                            }}
                            className="w-full text-left p-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center justify-between gap-3 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {p.imageBase64 ? (
                                <img
                                  src={p.imageBase64}
                                  alt=""
                                  className="w-8 h-8 object-cover rounded border border-slate-200 shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 bg-slate-100 rounded border border-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                                  <Package className="w-4 h-4" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900 leading-tight truncate flex items-center gap-1.5">
                                  {p.code ? (
                                    <span className={`${hasPrice ? "text-indigo-600 border-indigo-100 bg-indigo-50" : "text-rose-600 bg-rose-50 border-rose-100"} border px-1 py-0.5 rounded font-mono`}>
                                      #{p.code}
                                    </span>
                                  ) : (
                                    <span className={`${hasPrice ? "text-slate-500 border-slate-200 bg-slate-50" : "text-rose-600 bg-rose-50 border-rose-100"} border px-1 py-0.5 rounded font-mono text-[9px] max-w-[80px] truncate`}>
                                      {p.id}
                                    </span>
                                  )}
                                  <span className="truncate">{p.name}</span>
                                </div>
                                <div className={`text-[10px] truncate mt-0.5 ${hasPrice ? "text-slate-500" : "text-rose-400"}`}>
                                  {p.id}
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0 flex items-center gap-2">
                              {!hasPrice && (
                                <span className="text-[9px] font-bold bg-rose-50 border border-rose-100 text-rose-600 px-1.5 py-0.5 rounded">
                                  НЕТ ЦЕНЫ
                                </span>
                              )}
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono select-none">
                                {(p.spheres && p.spheres.length > 0) ? p.spheres.join(", ") : (p.sphere || "Каталог")}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {selectedQuickProduct && cheapestQuickInfo && (
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end shrink-0 md:w-auto w-full">
                  <div className="flex flex-col min-w-[200px]">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                      Поставщик с мин. ценой ({selectedRegion || "Все регионы"})
                    </label>
                    {cheapestQuickInfo.price === Infinity ? (
                      <div className="bg-rose-50 border border-rose-150 text-rose-850 px-2.5 py-2.5 rounded-lg text-xs font-bold leading-none flex items-center justify-between gap-2 shadow-sm shrink-0">
                        <span className="truncate max-w-[130px]">
                          НЕТ ЦЕНЫ
                        </span>
                      </div>
                    ) : (
                      <div className="bg-emerald-50 border border-emerald-150 text-emerald-850 px-2.5 py-2.5 rounded-lg text-xs font-bold leading-none flex items-center justify-between gap-2 shadow-sm shrink-0">
                        <span className="truncate max-w-[130px]">
                          {getSupplierName(cheapestQuickInfo.supplier)}
                        </span>
                        <span className="text-[9px] bg-emerald-650 text-white px-1 py-0.5 rounded uppercase font-black tracking-wide shrink-0 font-sans leading-none">
                          Мин
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-end text-right px-2 py-0.5 min-w-[80px]">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                      Цена
                    </span>
                    <span className="text-sm font-black text-slate-900 font-mono">
                      {cheapestQuickInfo.price === Infinity ? "—" : `${cheapestQuickInfo.price.toFixed(2)} с.`}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={cheapestQuickInfo.price === Infinity}
                    onClick={handleQuickAdd}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm shrink-0 hover:shadow-md ${cheapestQuickInfo.price === Infinity ? "bg-slate-300 text-slate-500 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
                  >
                    Добавить в корзину
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="text-[11px] text-slate-500 font-medium">
                Введите коды или ID товаров через <strong>запятую</strong>,{" "}
                <strong>пробел</strong> или в <strong>новую строку</strong>{" "}
                (можно вставить столбиком из Excel):
              </div>
              <div className="flex flex-col md:flex-row gap-4 items-stretch">
                <div className="flex-1">
                  <textarea
                    rows={2}
                    value={massInputText}
                    onChange={(e) => setMassInputText(e.target.value)}
                    placeholder="Например: 10405, 10408, #10410 10412"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-950 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono resize-none animate-fade-in"
                  />
                </div>

                <div className="flex flex-row md:flex-col gap-3 shrink-0 items-end justify-between md:justify-end min-w-[240px]">
                  <div className="flex flex-col w-full text-slate-600 text-[11px] leading-tight bg-emerald-50 border border-emerald-100 p-2.5 rounded-lg animate-fade-in">
                    <span className="font-bold text-emerald-800 mb-1 flex items-center gap-1 font-sans">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Автовыбор цен
                    </span>
                    <span>Система автоматически добавит каждый товар у поставщика с </span>
                    <span>{selectedRegion ? `меньшей ценой для региона ${selectedRegion}.` : "наименьшей ценой среди всех регионов."}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleMassAdd}
                    disabled={massAnalysis.found.length === 0}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-sm w-full shrink-0 flex items-center justify-center gap-1.5 animate-fade-in"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Добавить ({massAnalysis.found.length})
                  </button>
                </div>
              </div>

              {/* Dynamic feedback of matched products */}
              {massInputText.trim() && (
                <div className="bg-white/80 border border-slate-200 rounded-lg p-3 text-xs flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                    <span className="font-bold text-slate-700 flex items-center gap-2">
                      Анализ ввода:
                      {isAnalyzingMass && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                      )}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded font-bold">
                        Найдено: {massAnalysis.found.length} тов.
                      </span>
                      {massAnalysis.notFound.length > 0 && (
                        <span className="text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded font-bold">
                          Не совпадает: {massAnalysis.notFound.length}
                        </span>
                      )}
                    </div>
                  </div>

                  {massAnalysis.found.length > 0 && (
                    <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                      {massAnalysis.found.map((p) => {
                        const bestInfo = (() => {
                          const sups: (
                            | "supplier2"
                            | "supplier3"
                            | "supplier4"
                          )[] = [
                            "supplier2",
                            "supplier3",
                            "supplier4",
                          ];
                          let minPrice = Infinity;
                          let bestSupplier:
                            | "supplier2"
                            | "supplier3"
                            | "supplier4"
                            | "supplier1" = "supplier2";

                          const searchRegions = selectedRegion ? [selectedRegion] : regions;
                          searchRegions.forEach((reg) => {
                            sups.forEach((sup) => {
                              const pr = getProductPrice(p, sup, reg);
                              if (pr > 0 && pr < minPrice) {
                                minPrice = pr;
                                bestSupplier = sup;
                              }
                            });
                          });

                          return { supplier: bestSupplier, price: minPrice };
                        })();

                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-3 bg-white border border-slate-100 p-2 rounded shadow-sm animate-fade-in"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {p.code ? (
                                <span className={`${bestInfo.price === Infinity ? "text-rose-600 bg-rose-50 border-rose-100" : "text-indigo-600 bg-indigo-50 border-indigo-100"} border font-mono text-[10px] px-1 py-0.5 rounded shrink-0`}>
                                  #{p.code}
                                </span>
                              ) : (
                                <span className={`${bestInfo.price === Infinity ? "text-rose-600 bg-rose-50 border-rose-100" : "text-slate-500 bg-slate-50 border-slate-100"} border font-mono text-[9px] px-1 py-0.5 rounded shrink-0 max-w-[100px] truncate`}>
                                  {p.id}
                                </span>
                              )}
                              <span className="font-medium text-slate-800 truncate text-[11px]">
                                {p.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] text-slate-400 font-medium">
                                Мин:
                              </span>
                              {bestInfo.price === Infinity ? (
                                <span className="text-rose-500 font-bold text-[10px]">
                                  НЕТ ЦЕНЫ
                                </span>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="bg-emerald-50 text-emerald-750 border border-emerald-100 px-1.5 py-0.5 rounded font-bold text-[10px] truncate max-w-[100px]"
                                    title={getSupplierName(bestInfo.supplier)}
                                  >
                                    {getSupplierName(bestInfo.supplier)}
                                  </span>
                                  <span className="font-mono font-bold text-slate-900 text-[11px]">
                                    {bestInfo.price.toFixed(2)} с.
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {massAnalysis.notFound.length > 0 && (
                    <div className="text-[10px] text-slate-500 flex flex-wrap gap-1.5 items-center">
                      <span className="text-rose-500 font-bold shrink-0">
                        Не найденные в каталоге коды/символы:
                      </span>
                      {massAnalysis.notFound.map((u, i) => (
                        <span
                          key={i}
                          className="bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-mono text-[9px]"
                        >
                          {u}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-50 relative z-10">
          {displayedCart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 py-16">
              <Package className="w-12 h-12 mb-4 text-slate-300" />
              <p>Корзина пуста. Добавьте товары из каталога.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {displayedCart.map((item) => (
                <div
                  key={`${item.product.id}-${item.selectedSupplier}`}
                  className="bg-white border border-slate-200 p-3 sm:p-4 rounded-lg flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 shadow-sm"
                >
                  <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1 min-w-0 w-full">
                    {/* Image */}
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-100 rounded border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center text-slate-300">
                      {item.product.imageBase64 ? (
                        <img
                          src={item.product.imageBase64}
                          alt={item.product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-6 h-6 sm:w-8 sm:h-8" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 line-clamp-1 flex items-center leading-normal text-sm sm:text-base">
                        {item.product.code ? (
                          <span className={`font-mono text-[10px] sm:text-xs font-semibold mr-2 px-1.5 py-0.5 rounded leading-none shrink-0 border ${item.selectedPrice === Infinity ? "text-rose-600 bg-rose-50 border-rose-100" : "text-slate-400 bg-slate-100 border-slate-100"}`}>
                            #{item.product.code}
                          </span>
                        ) : (
                          <span className={`font-mono text-[10px] font-semibold mr-2 px-1.5 py-0.5 rounded leading-none shrink-0 border max-w-[100px] truncate ${item.selectedPrice === Infinity ? "text-rose-600 bg-rose-50 border-rose-100" : "text-slate-400 bg-slate-100 border-slate-100"}`}>
                            {item.product.id}
                          </span>
                        )}
                        <span className="truncate">{item.product.name}</span>
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-500 line-clamp-1 mt-0.5">
                        {item.product.description || "Нет описания"}
                      </p>
                      <div className="text-[10px] sm:text-xs text-slate-400 mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                         {item.selectedPrice === Infinity ? (
                           <span className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-600 px-2 py-0.5 sm:py-1 rounded-md font-bold border border-rose-100 text-[10px] sm:text-[11px]">
                             НЕТ ЦЕНЫ
                           </span>
                         ) : showBestPrice ? (
                           <span
                             className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 px-2 py-0.5 sm:py-1 rounded-md font-bold border border-emerald-100 text-[10px] sm:text-[11px]"
                             title="Выбран поставщик с минимальной ценой"
                           >
                             <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0"></span>
                             {getSupplierName(item.selectedSupplier || 'supplier2')}
                             <span className="text-[9px] bg-emerald-600 text-white px-1 rounded-sm uppercase tracking-wider font-extrabold scale-90">
                               мин
                             </span>
                           </span>
                         ) : (() => {
                           const supCandidates = (suppliers && suppliers.length > 0)
                             ? suppliers.map((_, idx) => "supplier" + (idx + 2))
                             : ["supplier2", "supplier3", "supplier4"];
                           const availableSuppliers = supCandidates.map(sup => {
                             const price = getProductPrice(item.product, sup as any, selectedRegion || "Душанбе");
                             return { id: sup, price };
                           }).filter(s => s.price > 0);

                           if (onUpdateSupplier && availableSuppliers.length > 1) {
                             return (
                               <div className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-2 py-0.5 sm:py-1 rounded-md text-indigo-800 font-bold text-[10px] sm:text-[11px] shadow-sm">
                                 <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">Поставщик:</span>
                                 <select
                                   value={item.selectedSupplier}
                                   onChange={(e) => {
                                     const newSup = e.target.value as any;
                                     onUpdateSupplier(item.product.id, item.selectedSupplier, newSup);
                                   }}
                                   className="bg-transparent border-none text-indigo-900 font-bold text-[10px] sm:text-[11px] focus:outline-none cursor-pointer transition-colors p-0 pr-1"
                                 >
                                   {availableSuppliers.map((s) => (
                                     <option key={s.id} value={s.id} className="bg-white text-slate-900 font-medium">
                                       {getSupplierName(s.id)} ({s.price.toFixed(2)} с.)
                                     </option>
                                   ))}
                                 </select>
                               </div>
                             );
                           }

                           return (
                             <span
                               className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-800 px-2 py-0.5 sm:py-1 rounded-md font-bold border border-indigo-100 text-[10px] sm:text-[11px]"
                             >
                               <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full shrink-0"></span>
                               {getSupplierName(item.selectedSupplier || 'supplier2')}
                             </span>
                           );
                          })()}

                        <span className="bg-slate-100 text-slate-700 px-1.5 sm:px-2 py-0.5 rounded font-medium text-[10px] sm:text-[11px] truncate max-w-full">
                          {selectedSphere ? (
                            (() => {
                              const prodSpheres = item.product.spheres && item.product.spheres.length > 0 
                                ? item.product.spheres 
                                : [item.product.sphere || "Общее"];
                              const matched = prodSpheres.find(s => 
                                s === selectedSphere || 
                                s.includes(selectedSphere) || 
                                selectedSphere.includes(s)
                              );
                              return matched || selectedSphere;
                            })()
                          ) : (
                            item.product.spheres && item.product.spheres.length > 0 
                              ? item.product.spheres.join(", ") 
                              : (item.product.sphere || "—")
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Price X Quantity */}
                  <div className="text-left sm:text-right flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 w-full sm:w-auto min-w-0 sm:min-w-[120px] pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="font-mono font-bold text-slate-900 text-base sm:text-lg">
                      {item.selectedPrice === Infinity ? (
                        <span className="text-rose-500 text-sm">—</span>
                      ) : (
                        `${((item.selectedPrice || 0) * item.quantity).toFixed(2)} с.`
                      )}
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1 scale-90 sm:scale-100 origin-right">
                      <button
                        onClick={() =>
                          updateQuantity(
                            item.product.id,
                            item.selectedSupplier,
                            -1,
                          )
                        }
                        className="p-1 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded"
                      >
                        {item.quantity === 1 ? (
                          <Trash2 className="w-4 h-4 text-red-500" />
                        ) : (
                          <Minus className="w-4 h-4" />
                        )}
                      </button>
                      <span className="text-sm font-medium px-1.5 text-center whitespace-nowrap min-w-8">
                        {item.quantity} {item.product.unit || "шт."}
                      </span>
                      <button
                        onClick={() =>
                          updateQuantity(
                            item.product.id,
                            item.selectedSupplier,
                            1,
                          )
                        }
                        className="p-1 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {logisticsCost > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded border border-indigo-200 flex items-center justify-center text-indigo-500 shrink-0">
                      <Truck className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-indigo-900">
                        Логистика ({selectedRegion || "Все регионы"})
                      </h3>
                      <p className="text-sm text-indigo-700 mt-0.5">
                        Доставка до выбранного региона
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end min-w-[120px]">
                    <div className="font-mono font-bold text-indigo-900">
                      {logisticsCost.toFixed(2)} с.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {displayedCart.length > 0 && (
          <div className="border-t border-slate-200 p-3.5 sm:p-6 bg-slate-50 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <button
              onClick={handleClearCartClick}
              className={`flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-lg border transition-all text-xs sm:text-sm font-semibold w-full sm:w-auto justify-center shadow-sm ${
                isConfirmingClear
                  ? "bg-red-600 hover:bg-red-700 text-white border-red-700 animate-pulse"
                  : "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
              }`}
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>{isConfirmingClear ? "Вы уверены? Нажмите для подтверждения" : "Очистить корзину"}</span>
            </button>
            <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
              <div className="text-slate-700 font-bold text-sm sm:text-base">Итого:</div>
              <div className="text-2xl sm:text-3xl font-bold font-mono text-slate-900">
                {total.toFixed(2)} с.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal warning when Facilitator tries to save with existing beneficiary ID or Name */}
      {isDuplicateConfirmModalOpen && duplicateMatch && (
        <div className="fixed inset-0 z-[130] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-amber-500/70 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-slate-100 animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-amber-500/30 bg-amber-950/40 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-amber-300">
                  Повторный бенефициар в базе
                </h3>
                <p className="text-xs text-amber-200/80">
                  Обнаружено совпадение {duplicateMatch.type === "both" ? "по ID и ФИО" : duplicateMatch.type === "id" ? "по ID" : "по ФИО"}
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3.5 text-xs leading-relaxed">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                <div className="text-[10px] font-bold uppercase text-slate-400">
                  Найден купон в Архиве КП:
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Номер купона:</span>
                  <span className="font-mono font-bold text-indigo-400">
                    #{duplicateMatch.matchedQuote.id}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Бенефициар:</span>
                  <span className="font-semibold text-white">
                    {duplicateMatch.matchedQuote.clientName}
                  </span>
                </div>
                {duplicateMatch.matchedQuote.beneficiaryId && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">ID бенефициара:</span>
                    <span className="font-mono font-bold text-amber-300">
                      {duplicateMatch.matchedQuote.beneficiaryId}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Дата оформления:</span>
                  <span className="text-slate-300">
                    {duplicateMatch.matchedQuote.createdAt}
                  </span>
                </div>
                {duplicateMatch.matchedQuote.totalAmount !== undefined && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Сумма:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {duplicateMatch.matchedQuote.totalAmount.toLocaleString("ru-RU")} с.
                    </span>
                  </div>
                )}
              </div>

              <p className="text-slate-300">
                В системе уже зарегистрирован купон для этого получателя. Создание отдельного купона заблокировано правилами системы, чтобы не нарушать непрерывную историю изменений бенефициара. Пожалуйста, перейдите в <strong>Архив КП</strong> и откройте существующий купон для редактирования.
              </p>
            </div>

            <div className="p-4 bg-slate-950/70 border-t border-slate-800 flex flex-col-reverse sm:flex-row gap-2 justify-end">
              <button
                type="button"
                onClick={() => setIsDuplicateConfirmModalOpen(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
              >
                Вернуться и исправить
              </button>
              {onOpenQuotesHistory && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDuplicateConfirmModalOpen(false);
                    onClose();
                    onOpenQuotesHistory();
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Archive className="w-4 h-4" />
                  <span>Перейти в Архив КП для редактирования</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal Before Saving to Archive */}
      {isConfirmSaveModalOpen && (
        <div className="fixed inset-0 z-[130] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5 mb-4">
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 shrink-0 shadow-xs">
                <HelpCircle className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 leading-tight">
                  {isEditingArchiveQuote
                    ? `Сохранить изменения в купон #${savedQuoteId}?`
                    : "Сохранить купон в Архив КП?"}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  Вы уверены, что внесли все необходимые товары и данные?
                </p>
              </div>
            </div>

            {/* Brief review box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Бенефициар:</span>
                <span className="font-bold text-slate-900 truncate max-w-[220px]" title={clientName}>
                  {beneficiaryId ? `[ID: ${beneficiaryId}] ` : ""}{clientName || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Специалист:</span>
                <span className="font-semibold text-slate-900 truncate max-w-[220px]" title={specialistName}>
                  {specialistName || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Район:</span>
                <span className="font-semibold text-slate-900">
                  {district ? `${district} (${selectedRegion})` : selectedRegion}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-1.5">
                <span className="text-slate-500 font-medium">Состав купона:</span>
                <span className="font-extrabold text-indigo-700">
                  {displayedCart.length} наим. на {total.toFixed(2)} с.
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
              {isEditingArchiveQuote
                ? "Изменения будут записаны в историю версий купона, а корзина очистится."
                : "После подтверждения данные будут зафиксированы в Архиве КП. Дальнейшие изменения будут доступны только через режим редактирования в Архиве КП."}
            </p>

            {saveHistoryError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{saveHistoryError}</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 mt-5 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsConfirmSaveModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
              >
                Нет, вернуться к редактированию
              </button>
              <button
                type="button"
                disabled={isSavingHistory}
                onClick={executeSaveToHistory}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isSavingHistory ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Сохранение...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Да, сохранить в Архив</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Center Success Notification Modal After Saving to Archive */}
      {isSavedSuccessModalOpen && (
        <div className="fixed inset-0 z-[130] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden p-6 text-center animate-in zoom-in-95 duration-150 relative">
            <button
              onClick={() => setIsSavedSuccessModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              title="Закрыть уведомление"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Emerald success icon with pulse badge */}
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3.5 shadow-sm ring-8 ring-emerald-50">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-tight">
              Купон сохранен в Архиве КП!
            </h3>

            {savedQuoteId && (
              <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-200/90 rounded-lg text-xs font-mono font-bold text-slate-800 shadow-2xs">
                <span className="text-slate-500 font-sans font-medium">Код купона:</span>
                <span className="text-indigo-600 font-black">{savedQuoteId}</span>
              </div>
            )}

            <p className="text-xs sm:text-sm text-slate-600 mt-3 leading-relaxed">
              Все данные и снимок цен зафиксированы в Архиве КП. Кнопка сохранения заблокирована во избежание дублирования.
            </p>

            <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-left text-xs text-amber-900 mt-3.5 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-snug">
                <strong>Обратите внимание:</strong> Для внесения любых изменений в этот купон перейдите в <strong>Архив КП</strong> и нажмите <strong>«Редактировать»</strong>.
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-5">
              <button
                type="button"
                onClick={() => {
                  setIsSavedSuccessModalOpen(false);
                  onClearCart?.();
                  setClientName("");
                  setBeneficiaryId("");
                  setSpecialistName("");
                  setNote("");
                  setIsSavedToHistory(false);
                  setSavedQuoteId(null);
                  onClose();
                  setTimeout(() => {
                    onOpenQuotesHistory?.();
                  }, 200);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition-all shadow-md cursor-pointer"
              >
                <Archive className="w-4 h-4" />
                <span>Перейти в Архив КП</span>
              </button>

              {savedQuoteId && (
                <button
                  type="button"
                  onClick={() => {
                    const rawOrigin = typeof window !== 'undefined' ? window.location.origin : '';
                    const origin = rawOrigin.includes('ais-dev-') ? rawOrigin.replace('ais-dev-', 'ais-pre-') : rawOrigin;
                    window.open(`${origin}/?verify=${encodeURIComponent(savedQuoteId)}`, '_blank');
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-all shadow-xs cursor-pointer"
                >
                  <QrCode className="w-4 h-4 text-emerald-600" />
                  <span>Проверить QR-код (Гос. верификация)</span>
                </button>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSavedSuccessModalOpen(false)}
                  className="flex-1 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                  title="Остаться в корзине, чтобы распечатать купон или скачать Excel"
                >
                  Остаться в купоне (Печать / Excel)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSavedSuccessModalOpen(false);
                    onClearCart?.();
                    setClientName("");
                    setBeneficiaryId("");
                    setSpecialistName("");
                    setNote("");
                    setIsSavedToHistory(false);
                    setSavedQuoteId(null);
                  }}
                  className="px-3 py-2 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer"
                  title="Очистить корзину для нового клиента"
                >
                  Новый купон
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
