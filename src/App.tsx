import React, { useState, useEffect, useRef, useCallback } from "react";
import { Product } from "./types";
import { downloadCatalogExcel } from "./lib/excelExport";
import { downloadPriceEditExcel, importPriceEditExcel } from "./lib/priceExcelSync";
import {
  Loader2,
  Package,
  Search,
  LayoutGrid,
  List as ListIcon,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  Plus,
  X,
  Printer,
  Pencil,
  BookOpen,
  ShoppingCart,
  Minus,
  Menu,
  Wand2,
  Wifi,
  WifiOff,
  CheckCircle,
  Clock,
  Lock,
} from "lucide-react";
import { db, handleFirestoreError, OperationType } from "./lib/firebase";
import { generateNextProductCode } from "./lib/generateNextCode";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  limit,
  orderBy,
  where,
  getDocs,
} from "firebase/firestore";
import { PrintCatalogView } from "./PrintCatalogView";
import { DictionaryModal } from "./DictionaryModal";
import { CartModal } from "./CartModal";
import { PrintCartView } from "./PrintCartView";
// @ts-ignore
import { useRegisterSW } from "virtual:pwa-register/react";

const DISTRICTS_BY_REGION: Record<string, string[]> = {
  Душанбе: ["Исмоили Сомони", "Сино", "Фирдавси", "Шохмансур"],
  ГБАО: [
    "г. Хорог",
    "Дарвазский",
    "Ванчский",
    "Рушанский",
    "Шугнанский",
    "Рошткалинский",
    "Ишкашимский",
    "Мургабский",
  ],
  "Согдийская область": [
    "г. Худжанд",
    "г. Истаравшан",
    "г. Канибадам",
    "г. Исфара",
    "г. Пенджикент",
    "г. Бустон",
    "г. Гулистон",
    "г. Истиклол",
    "Айнинский",
    "Аштский",
    "Б. Гафуровский",
    "Деваштич",
    "Дж. Расуловский",
    "Зафарабадский",
    "Кухистони Мастчох",
    "Матчинский",
    "Спитаменский",
    "Шахристанский",
  ],
  "Хатлон 1 (Бохтар)": [
    "г. Бохтар",
    "г. Левакант",
    "Кушониён",
    "Вахшский",
    "Дж. Балхи",
    "А. Джоми",
    "Дусти",
    "Джайхун",
    "Хуросонский",
    "Н. Хусрав",
    "Пянджский",
    "Кубодиёнский",
    "Шахритусский",
    "Яванский",
  ],
  "Хатлон 2 (Куляб)": [
    "г. Куляб",
    "г. Нурек",
    "Бальджуванский",
    "Восеъский",
    "Дангаринский",
    "Фархорский",
    "Хамадони",
    "Муминабадский",
    "Ш. Шохин",
    "Темурмаликский",
    "Ховалингский",
  ],
  РРП: [
    "г. Вахдат",
    "г. Гиссар",
    "г. Рогун",
    "г. Турсунзаде",
    "Варзобский",
    "Раштский",
    "Лахш",
    "Нурабадский",
    "Сангвор",
    "Таджикабадский",
    "Рудаки",
    "Файзабадский",
    "Шахринавский",
  ],
};

const KHATLON_1_DISTRICTS = [
  "г. Бохтар",
  "г. Левакант",
  "Кушониён",
  "Вахшский",
  "Дж. Балхи",
  "А. Джоми",
  "Дусти",
  "Джайхун",
  "Хуросонский",
  "Н. Хусрав",
  "Пянджский",
  "Кубодиёнский",
  "Шахритусский",
  "Яванский",
];

const cropImage = async (base64: string, box_2d: number[]): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx || !box_2d || box_2d.length !== 4) {
        resolve(base64);
        return;
      }

      const [ymin, xmin, ymax, xmax] = box_2d;

      const pxMin = (xmin / 1000) * img.width;
      const pyMin = (ymin / 1000) * img.height;
      const pxMax = (xmax / 1000) * img.width;
      const pyMax = (ymax / 1000) * img.height;

      let width = pxMax - pxMin;
      let height = pyMax - pyMin;

      if (width <= 0) width = img.width;
      if (height <= 0) height = img.height;

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, pxMin, pyMin, width, height, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.src = base64;
  });
};

const DEFAULT_SPHERES = [
  "Сварщик",
  "Автослесарь",
  "Сантехник",
  "Плотник",
  "Парикмахер",
  "Выпечка",
  "Швея",
  "Мастер салона красоты",
  "Электрик",
  "Кондитер",
  "Консервирование",
];

const compressImageBase64 = (
  base64: string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.7,
): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return reject(new Error("no context"));
      }
      ctx.drawImage(img, 0, 0, width, height);

      // force webp to save space
      const compressedRes = canvas.toDataURL("image/webp", quality);
      resolve({ base64: compressedRes, mimeType: "image/webp" });
    };
    img.onerror = reject;
    img.src = base64;
  });
};

const CardSpheres = ({ spheres, region }: { spheres: string[]; region?: string }) => {
  const [expanded, setExpanded] = useState(false);

  if (!spheres || spheres.length === 0) {
    if (!region) return null;
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
          {region}
        </span>
      </div>
    );
  }

  const firstSphere = spheres[0];
  const extraCount = spheres.length - 1;

  if (expanded) {
    return (
      <div className="flex flex-wrap items-center gap-1 my-0.5" onClick={(e) => e.stopPropagation()}>
        {spheres.map((s, idx) => (
          <span key={idx} className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
            {s}
          </span>
        ))}
        {region && (
          <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
            {region}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
          className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline ml-1"
        >
          свернуть
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap my-0.5" onClick={(e) => e.stopPropagation()}>
      <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md truncate max-w-[140px]">
        {firstSphere}
      </span>
      {extraCount > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          className="text-[10px] font-bold text-indigo-600 bg-indigo-100/80 hover:bg-indigo-200 border border-indigo-200 px-1.5 py-0.5 rounded-md transition-colors shadow-xs"
          title={`Показать все сферы (${spheres.length})`}
        >
          +{extraCount} сфер
        </button>
      )}
      {region && (
        <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
          {region}
        </span>
      )}
    </div>
  );
};

export default function App({ portalFacilitator }: { portalFacilitator?: string }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: any) {
      console.log("SW Registered: " + r);
    },
    onRegisterError(error: any) {
      console.log("SW registration error", error);
    },
  });

  // Facilitator Auth & Lock States
  const [isDictLoaded, setIsDictLoaded] = useState(() => {
    try {
      return !!localStorage.getItem("global_dict_cache");
    } catch (e) {
      return false;
    }
  });
  
  const [isProductsLoaded, setIsProductsLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("Сервис загружается...");
  const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);

  useEffect(() => {
    // Fail-safe to ensure the app never stays stuck if firestore is slow
    const timer = setTimeout(() => {
      setIsDictLoaded(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isDictLoaded && isProductsLoaded) {
      setLoadingProgress(100);
      setLoadingText("Готово");
      const t = setTimeout(() => setIsInitialLoadDone(true), 600);
      return () => clearTimeout(t);
    } else if (isDictLoaded || isProductsLoaded) {
      setLoadingProgress(60);
      setLoadingText("Проверяем доступность");
    } else {
      setLoadingProgress(20);
      setLoadingText("Сервис загружается");
    }
  }, [isDictLoaded, isProductsLoaded]);

  const [isFacilitatorAuthenticated, setIsFacilitatorAuthenticated] = useState(() => {
    if (!portalFacilitator) return false;
    return sessionStorage.getItem(`auth_${portalFacilitator}`) === "true" || sessionStorage.getItem("auth_resolved") === "true";
  });
  const [facilitatorInputCode, setFacilitatorInputCode] = useState("");

  const [isAdminPageAuthenticated, setIsAdminPageAuthenticated] = useState(() => {
    return sessionStorage.getItem("main_admin_auth") === "true";
  });
  const [adminPageInputCode, setAdminPageInputCode] = useState("");

  const [products, setProducts] = useState<Product[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isNormalizingState, setIsNormalizingState] = useState<{
    active: boolean;
    current: number;
    total: number;
  }>({ active: false, current: 0, total: 0 });

  const [globalDict, setGlobalDict] = useState<{
    regions: string[];
    districtsByRegion: Record<string, string[]>;
    spheres: string[];
    suppliers: string[];
    pricingRules?: {
      supplier1?: Record<string, number>;
      supplier2?: Record<string, number>;
      supplier3?: Record<string, number>;
      supplier4?: Record<string, number>;
    };
    supplierCodes?: Record<string, string>;
    logisticsCosts?: Record<string, number>;
    supplierPhones?: Record<string, string>;
    supplierLegalNames?: Record<string, string>;
    facilitators?: string[];
    facilitatorRegions?: Record<string, string>;
    facilitatorCodes?: Record<string, string>;
    adminPassword?: string;
  }>(() => {
    try {
      const cached = localStorage.getItem("global_dict_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === "object" && parsed.regions) {
          return {
            regions: parsed.regions,
            districtsByRegion: parsed.districtsByRegion || DISTRICTS_BY_REGION,
            spheres: parsed.spheres || DEFAULT_SPHERES,
            suppliers: parsed.suppliers || [],
            pricingRules: parsed.pricingRules || {
              supplier1: {},
              supplier2: {},
              supplier3: {},
              supplier4: {},
            },
            supplierCodes: parsed.supplierCodes || {},
            logisticsCosts: parsed.logisticsCosts || {},
            supplierPhones: parsed.supplierPhones || {},
            supplierLegalNames: parsed.supplierLegalNames || {},
            facilitators: parsed.facilitators || [],
            facilitatorRegions: parsed.facilitatorRegions || {},
            facilitatorCodes: parsed.facilitatorCodes || {},
            adminPassword: parsed.adminPassword || "020779",
          };
        }
      }
    } catch (e) {
      console.error("Error reading cached dictionaries:", e);
    }
    return {
      regions: Object.keys(DISTRICTS_BY_REGION),
      districtsByRegion: DISTRICTS_BY_REGION,
      spheres: DEFAULT_SPHERES,
      suppliers: [],
      pricingRules: {
        supplier1: {},
        supplier2: {},
        supplier3: {},
        supplier4: {},
      },
      logisticsCosts: {},
      supplierPhones: {},
      supplierLegalNames: {},
      facilitators: [],
      facilitatorRegions: {},
      facilitatorCodes: {},
      adminPassword: "020779",
    };
  });

  // Robust facilitator lookup that automatically handles off-by-one errors and resolves single/nearby-id matches
  const getResolvedFacilitator = () => {
    if (!portalFacilitator || !globalDict.facilitatorCodes) {
      return { key: "", code: "", name: "Фасилитатор", region: "" };
    }
    
    // 1. Direct match (e.g. facilitator2)
    if (globalDict.facilitatorCodes[portalFacilitator]) {
      const idx = parseInt(portalFacilitator.replace("facilitator", ""), 10) - 2;
      const name = globalDict.facilitators?.[idx] || "Фасилитатор";
      const region = globalDict.facilitatorRegions?.[portalFacilitator] || "";
      return {
        key: portalFacilitator,
        code: String(globalDict.facilitatorCodes[portalFacilitator]),
        name,
        region
      };
    }

    // 2. Fallback check for nearby ID matches (e.g. facilitator1 vs facilitator2, or just "facilitator")
    let numStr = portalFacilitator.replace("facilitator", "");
    if (numStr === "" || numStr === "1") {
      numStr = "2"; // First facilitator is facilitator2
    }
    const num = parseInt(numStr, 10);
    if (!isNaN(num)) {
      const targets = [
        `facilitator${num}`,
        `facilitator${num + 1}`,
        `facilitator${num + 2}`,
        `facilitator${num - 1}`,
        `facilitator${num - 2}`
      ];
      for (const tk of targets) {
        if (globalDict.facilitatorCodes[tk]) {
          const idx = parseInt(tk.replace("facilitator", ""), 10) - 2;
          const name = globalDict.facilitators?.[idx] || "Фасилитатор";
          const region = globalDict.facilitatorRegions?.[tk] || "";
          return {
            key: tk,
            code: String(globalDict.facilitatorCodes[tk]),
            name,
            region
          };
        }
      }
    }

    // 3. Fallback: If only one facilitator exists in dictionaries, map any facilitator request to them
    const keys = Object.keys(globalDict.facilitatorCodes);
    if (keys.length === 1) {
      const onlyKey = keys[0];
      const idx = parseInt(onlyKey.replace("facilitator", ""), 10) - 2;
      const name = globalDict.facilitators?.[idx] || "Фасилитатор";
      const region = globalDict.facilitatorRegions?.[onlyKey] || "";
      return {
        key: onlyKey,
        code: String(globalDict.facilitatorCodes[onlyKey]),
        name,
        region
      };
    }

    return { key: "", code: "", name: "Фасилитатор", region: "" };
  };

  const resolvedFacilitator = getResolvedFacilitator();
  const facilitatorRegion = resolvedFacilitator.region || null;

  useEffect(() => {
    if (resolvedFacilitator.key && isFacilitatorAuthenticated && resolvedFacilitator.region) {
      setSelectedRegion(resolvedFacilitator.region);
    }
  }, [resolvedFacilitator.key, isFacilitatorAuthenticated, resolvedFacilitator.region]);

  const getFacilitatorName = () => {
    return resolvedFacilitator.name || "Фасилитатор";
  };

  const getSupplierLabel = (
    sup: "supplier1" | "supplier2" | "supplier3" | "supplier4",
  ) => {
    if (sup === "supplier1") return "Логистика";
    const list = globalDict.suppliers || [];
    if (sup === "supplier2") return list[0] || "Поставщик 1";
    if (sup === "supplier3") return list[1] || "Поставщик 2";
    return list[2] || "Поставщик 3";
  };

  const getSupplierFormTabName = (
    sup: "supplier1" | "supplier2" | "supplier3" | "supplier4",
  ) => {
    if (sup === "supplier1") return "Логистика";
    const list = globalDict.suppliers || [];
    if (sup === "supplier2") return list[0] || "Пост. 1";
    if (sup === "supplier3") return list[1] || "Пост. 2";
    return list[2] || "Пост. 3";
  };
  const [selectedRegion, setSelectedRegion] = useState(() => {
    const r = localStorage.getItem("catalog_region") || "";
    if (r === "Хатлонская область") return "Хатлон 1 (Бохтар)";
    return r;
  });
  const [selectedSupplier, setSelectedSupplier] = useState<
    "supplier2" | "supplier3" | "supplier4"
  >(() => {
    const saved = localStorage.getItem("catalog_supplier");
    if (saved === "supplier1" || !saved) return "supplier2";
    return saved as any;
  });
  const [selectedSphere, setSelectedSphere] = useState(
    () => localStorage.getItem("catalog_sphere") || "",
  );

  useEffect(() => {
    if (portalFacilitator && isFacilitatorAuthenticated) {
      const unsub = onSnapshot(doc(db, "facilitator_states", portalFacilitator), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data?.sphere !== undefined) {
            setSelectedSphere(data.sphere);
          }
          if (data?.region !== undefined) {
            setSelectedRegion(data.region);
          }
        }
      });
      return () => unsub();
    }
  }, [portalFacilitator, isFacilitatorAuthenticated]);
  const [showOnlyNew, setShowOnlyNew] = useState(false);
  const [aiSelectedSpheres, setAiSelectedSpheres] = useState<string[]>(() => {
    const saved = localStorage.getItem("catalog_sphere");
    return saved ? [saved] : [];
  });
  const [isAiSpheresModalOpen, setIsAiSpheresModalOpen] = useState(false);
  const [aiSpheresSearch, setAiSpheresSearch] = useState("");

  const [aiSelectedRegions, setAiSelectedRegions] = useState<string[]>([]);
  const [isAiRegionsModalOpen, setIsAiRegionsModalOpen] = useState(false);
  const [aiRegionsSearch, setAiRegionsSearch] = useState("");

  useEffect(() => {
    if (selectedSphere) {
      setAiSelectedSpheres((prev) => {
        if (prev.includes(selectedSphere)) return prev;
        return [...prev, selectedSphere];
      });
    }
  }, [selectedSphere]);
  const [exportScope, setExportScope] = useState<
    | "all"
    | "sphere"
    | "region_sphere"
    | "supplier_sphere"
    | "region_supplier_sphere"
  >("all");
  const [searchName, setSearchName] = useState("");
  const [debouncedSearchName, setDebouncedSearchName] = useState("");
  const [searchCode, setSearchCode] = useState("");
  const [debouncedSearchCode, setDebouncedSearchCode] = useState("");
  const [queryLimit, setQueryLimit] = useState(15);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [visibleCount, setVisibleCount] = useState(40);

  useEffect(() => {
    setVisibleCount(40);
  }, [searchName, searchCode, selectedSphere, selectedRegion, showOnlyNew]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchName(searchName);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchName]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchCode(searchCode);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchCode]);

  // Reset limit when sphere changes too
  useEffect(() => {
    setQueryLimit(15);
  }, [selectedSphere, debouncedSearchName, debouncedSearchCode]);

  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isImageSearchModalOpen, setIsImageSearchModalOpen] = useState(false);
  const [imageSearchResults, setImageSearchResults] = useState<any[]>([]);
  const [imageSearchQuery, setImageSearchQuery] = useState("");
  const [isSearchingImages, setIsSearchingImages] = useState(false);
  const [isDictModalOpen, setIsDictModalOpen] = useState(false);
  const [isTabletMode, setIsTabletMode] = useState(
    () => localStorage.getItem("catalog_tablet_mode") === "true",
  );
  const [showBestPrice, setShowBestPrice] = useState(
    () => localStorage.getItem("catalog_show_best_price") === "true"
  );
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(
    () => (localStorage.getItem("catalog_view_mode") as 'table' | 'grid') || "table"
  );
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    localStorage.setItem("catalog_view_mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem(
      "catalog_tablet_mode",
      isTabletMode ? "true" : "false",
    );
  }, [isTabletMode]);

  useEffect(() => {
    localStorage.setItem(
      "catalog_show_best_price",
      showBestPrice ? "true" : "false"
    );
  }, [showBestPrice]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const [cart, setCart] = useState<
    {
      product: Product;
      quantity: number;
      selectedSupplier: "supplier1" | "supplier2" | "supplier3" | "supplier4";
      selectedPrice: number;
    }[]
  >(() => {
    try {
      const saved = localStorage.getItem("catalog_cart");
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => {
          let supp = item.selectedSupplier;
          if (!supp || supp === "supplier1") {
            supp = "supplier2";
          }
          let price = item.selectedPrice;
          if (price === undefined || price === null || price === Infinity || price <= 0) {
            price = item.product?.price || 0;
          }
          return {
            product: item.product,
            quantity: item.quantity || 1,
            selectedSupplier: supp as "supplier2" | "supplier3" | "supplier4",
            selectedPrice: price,
          };
        });
      }
      return [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("catalog_cart", JSON.stringify(cart));
  }, [cart]);

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCartPrinting, setIsCartPrinting] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(() => {
    const saved = localStorage.getItem("catalog_sidebar_visible");
    return saved !== "false"; // default is true
  });
  const [isPrintOptionsOpen, setIsPrintOptionsOpen] = useState(false);
  const [showFacilitatorPrintWarning, setShowFacilitatorPrintWarning] = useState(false);
  const [printCatalogType, setPrintCatalogType] = useState<"full" | "filtered">("full");
  const [printSelectedRegion, setPrintSelectedRegion] = useState<string>("");
  const [printSelectedSupplier, setPrintSelectedSupplier] = useState<"supplier1" | "supplier2" | "supplier3" | "supplier4" | null>(null);
  const [printSelectedSphere, setPrintSelectedSphere] = useState<string>("");
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isGenerateIdsModalOpen, setIsGenerateIdsModalOpen] = useState(false);
  const [isBestPricePasswordModalOpen, setIsBestPricePasswordModalOpen] = useState(false);
  const [bestPricePasswordInput, setBestPricePasswordInput] = useState("");
  const [bestPricePasswordError, setBestPricePasswordError] = useState("");
  const [generateIdsSuccess, setGenerateIdsSuccess] = useState<string | null>(
    null,
  );
  const [isNormalizeConfirmOpen, setIsNormalizeConfirmOpen] = useState(false);
  const [normalizePasswordInput, setNormalizePasswordInput] = useState("");
  const [normalizePasswordError, setNormalizePasswordError] = useState("");
  const [deleteAllCode, setDeleteAllCode] = useState("");
  const [catalogPrintMode, setCatalogPrintMode] = useState<"all" | "lowest">(
    "all",
  );

  const [dictTab, setDictTab] = useState<"regions" | "spheres">("regions");

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "settings", "dictionaries"),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          let loadedRegions = data.regions || Object.keys(DISTRICTS_BY_REGION);
          let loadedDistricts = data.districtsByRegion || DISTRICTS_BY_REGION;

          if (
            loadedRegions.includes("Хатлонская область") ||
            "Хатлонская область" in loadedDistricts
          ) {
            loadedRegions = loadedRegions.filter(
              (r: string) => r !== "Хатлонская область",
            );
            if (!loadedRegions.includes("Хатлон 1 (Бохтар)"))
              loadedRegions.push("Хатлон 1 (Бохтар)");
            if (!loadedRegions.includes("Хатлон 2 (Куляб)"))
              loadedRegions.push("Хатлон 2 (Куляб)");

            loadedDistricts = { ...loadedDistricts };
            delete loadedDistricts["Хатлонская область"];
            loadedDistricts["Хатлон 1 (Бохтар)"] =
              DISTRICTS_BY_REGION["Хатлон 1 (Бохтар)"];
            loadedDistricts["Хатлон 2 (Куляб)"] =
              DISTRICTS_BY_REGION["Хатлон 2 (Куляб)"];

            const updatedPricingRules = {
              ...(data.pricingRules || {
                supplier1: {},
                supplier2: {},
                supplier3: {},
                supplier4: {},
              }),
            };
            (
              ["supplier1", "supplier2", "supplier3", "supplier4"] as const
            ).forEach((sup) => {
              if (updatedPricingRules[sup]) {
                const oldMarkup =
                  updatedPricingRules[sup]["Хатлонская область"] ?? 0;
                if (
                  updatedPricingRules[sup]["Хатлон 1 (Бохтар)"] === undefined
                ) {
                  updatedPricingRules[sup]["Хатлон 1 (Бохтар)"] = oldMarkup;
                }
                if (
                  updatedPricingRules[sup]["Хатлон 2 (Куляб)"] === undefined
                ) {
                  updatedPricingRules[sup]["Хатлон 2 (Куляб)"] = oldMarkup;
                }
                delete updatedPricingRules[sup]["Хатлонская область"];
              }
            });

            const migratedDict = {
              ...data,
              regions: loadedRegions,
              districtsByRegion: loadedDistricts,
              pricingRules: updatedPricingRules,
            };

            setDoc(doc(db, "settings", "dictionaries"), migratedDict).catch(
              (err) =>
                console.error("Error migrating settings dictionaries: ", err),
            );
          }

            const updatedDict = {
              regions: loadedRegions,
              districtsByRegion: loadedDistricts,
              spheres: data.spheres || DEFAULT_SPHERES,
              suppliers: data.suppliers || [],
              pricingRules: data.pricingRules || {
                supplier1: {},
                supplier2: {},
                supplier3: {},
                supplier4: {},
              },
              supplierCodes: data.supplierCodes || {},
              logisticsCosts: data.logisticsCosts || {},
              supplierPhones: data.supplierPhones || {},
              supplierLegalNames: data.supplierLegalNames || {},
              facilitators: data.facilitators || [],
              facilitatorRegions: data.facilitatorRegions || {},
              facilitatorCodes: data.facilitatorCodes || {},
            };
            setGlobalDict(updatedDict);
            try {
              localStorage.setItem("global_dict_cache", JSON.stringify(updatedDict));
            } catch (e) {
              console.error("Error caching dictionaries to localStorage:", e);
            }
        }
        setIsDictLoaded(true);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "dictionaries");
        setIsDictLoaded(true);
      },
    );
    return () => unsub();
  }, []);

  const [isCustomRegion, setIsCustomRegion] = useState(false);
  const [isCustomDistrict, setIsCustomDistrict] = useState(false);
  const [isCustomSphere, setIsCustomSphere] = useState(false);
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showPrintWarning, setShowPrintWarning] = useState(false);
  const [printWarningType, setPrintWarningType] = useState<
    "catalog" | "cart" | null
  >(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [formSelectedSupplier, setFormSelectedSupplier] = useState<
    "supplier1" | "supplier2" | "supplier3" | "supplier4"
  >("supplier2");
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [manualForm, setManualForm] = useState<{
    code?: string;
    name: string;
    description: string;
    price: string;
    category: string;
    spheres: string[];
    imageBase64: string;
    mimeType: string;
    unit: string;
    supplier: "supplier1" | "supplier2" | "supplier3" | "supplier4";
    priceSupplier1: string;
    priceSupplier2: string;
    priceSupplier3: string;
    priceSupplier4: string;
    prices: Record<
      "supplier1" | "supplier2" | "supplier3" | "supplier4",
      Record<string, string>
    >;
    createdAt?: number;
  }>({
    name: "",
    description: "",
    price: "",
    category: "",
    spheres: [],
    imageBase64: "",
    mimeType: "",
    unit: "шт.",
    supplier: "supplier1",
    priceSupplier1: "",
    priceSupplier2: "",
    priceSupplier3: "",
    priceSupplier4: "",
    prices: {
      supplier1: {},
      supplier2: {},
      supplier3: {},
      supplier4: {},
    },
  });
  const [pendingPrintMode, setPendingPrintMode] = useState<
    "catalog" | "cart" | null
  >(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cartData = params.get("cartData");
    if (cartData && products.length > 0) {
      try {
        const items: {
          product: Product;
          quantity: number;
          selectedSupplier: "supplier1" | "supplier2" | "supplier3" | "supplier4";
          selectedPrice: number;
        }[] = [];
        const parts = cartData.split(",");
        const activeReg = selectedRegion || "Душанбе";
        for (const part of parts) {
          const [id, qStr] = part.split(":");
          const skuId = id?.trim();
          if (!skuId) continue;
          const qty = parseInt(qStr || "1", 10);
          const prod = products.find((p) => p.id === skuId);
          if (prod) {
            let bestSupplier: "supplier2" | "supplier3" | "supplier4" = "supplier2";
            let minPrice = Infinity;
            const sups: ("supplier2" | "supplier3" | "supplier4")[] = [
              "supplier2",
              "supplier3",
              "supplier4",
            ];
            sups.forEach((sup) => {
              const pr = getProductPriceForSupplierAndRegion(prod, sup, activeReg);
              if (pr > 0 && pr < minPrice) {
                minPrice = pr;
                bestSupplier = sup;
              }
            });
            items.push({
              product: prod,
              quantity: qty,
              selectedSupplier: bestSupplier,
              selectedPrice: minPrice,
            });
          }
        }
        if (items.length > 0) {
          setCart(items);
        }
        const url = new URL(window.location.href);
        url.searchParams.delete("cartData");
        window.history.replaceState({}, "", url);
      } catch (err) {
        console.error("Error parsing cartData from URL:", err);
      }
    }
  }, [products]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const printParam = params.get("print");
    if (printParam === "true" || printParam === "catalog") {
      setPendingPrintMode("catalog");
      const url = new URL(window.location.href);
      url.searchParams.delete("print");
      window.history.replaceState({}, "", url);
    } else if (printParam === "cart") {
      setPendingPrintMode("cart");
      const url = new URL(window.location.href);
      url.searchParams.delete("print");
      window.history.replaceState({}, "", url);
    }

    const actionParam = params.get("action");
    if (actionParam === "cart") {
      setIsCartOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("action");
      window.history.replaceState({}, "", url);
    } else if (actionParam === "add-product") {
      setIsManualModalOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("action");
      window.history.replaceState({}, "", url);
    }
  }, []);

  useEffect(() => {
    // If pending print and we actually have products loaded (prevent printing empty skeleton immediately on load)
    if (pendingPrintMode && products.length > 0) {
      const mode = pendingPrintMode;
      setPendingPrintMode(null);
      if (mode === "cart") {
        setIsCartPrinting(true);
      }
      setTimeout(() => {
        window.print();
        if (mode === "cart") {
          setTimeout(() => setIsCartPrinting(false), 2000);
        }
      }, 500);
    }
  }, [pendingPrintMode, products]);

  const clickCountRef = useRef<number>(0);
  const clickTimestampRef = useRef<number>(0);
  const loaderRef = useRef<HTMLDivElement>(null);
  const [isAdminMode, setIsAdminMode] = useState(
    () => localStorage.getItem("catalog_admin") === "true",
  );
  const isReallyAdmin = isAdminMode && !portalFacilitator;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const priceExcelInputRef = useRef<HTMLInputElement>(null);
  const [isImportingPrices, setIsImportingPrices] = useState(false);

  useEffect(() => {
    let q = query(
      collection(db, "products"),
      orderBy("createdAt", "desc")
    );

    // Server-side filtering
    const conditions = [];
    
    // We can only apply range filters on ONE field at a time in Firestore
    // Prefer searchCode if provided, else searchName
    
    if (debouncedSearchCode) {
       const codeOrId = debouncedSearchCode.trim().replace(/^#/, "");
       q = query(
         collection(db, "products"),
         ...conditions,
         where("code", ">=", codeOrId),
         where("code", "<=", codeOrId + "\uf8ff")
       );
    } else {
       if (debouncedSearchName) {
         conditions.push(where("name", ">=", debouncedSearchName));
         conditions.push(where("name", "<=", debouncedSearchName + "\uf8ff"));
       }

       if (conditions.length > 0) {
         if (debouncedSearchName) {
           q = query(
             collection(db, "products"),
             ...conditions,
             orderBy("name")
           );
         } else {
           q = query(
             collection(db, "products"),
             ...conditions,
             orderBy("createdAt", "desc")
           );
         }
       }
    }

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const prods: Product[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          let prodRegion = data.region;
          if (prodRegion === "Хатлонская область") {
            if (data.district && KHATLON_1_DISTRICTS.includes(data.district)) {
              prodRegion = "Хатлон 1 (Бохтар)";
            } else {
              prodRegion = "Хатлон 2 (Куляб)";
            }
          }
          prods.push({
            id: docSnap.id,
            code: data.code,
            name: data.name,
            description: data.description,
            category: data.category,
            price:
              data.price !== undefined ? parseFloat(data.price) : undefined,
            priceSupplier1:
              data.priceSupplier1 !== undefined
                ? parseFloat(data.priceSupplier1)
                : undefined,
            priceSupplier2:
              data.priceSupplier2 !== undefined
                ? parseFloat(data.priceSupplier2)
                : undefined,
            priceSupplier3:
              data.priceSupplier3 !== undefined
                ? parseFloat(data.priceSupplier3)
                : undefined,
            priceSupplier4:
              data.priceSupplier4 !== undefined
                ? parseFloat(data.priceSupplier4)
                : undefined,
            prices: data.prices,
            imageBase64: data.imageBase64,
            mimeType: data.mimeType,
            sphere: data.sphere,
            spheres: data.spheres,
            unit: data.unit || "шт.",
            createdAt: data.createdAt,
          });
        });
        // Removed dynamic code generation, relying on database
        setProducts(prods);
        setIsProductsLoaded(true);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "products");
      },
    );
    return () => unsub();
  }, [debouncedSearchName, debouncedSearchCode, selectedSphere]);

  useEffect(() => {
    localStorage.setItem("catalog_region", selectedRegion);
    if (portalFacilitator && isFacilitatorAuthenticated && selectedRegion) {
      setDoc(doc(db, "facilitator_states", portalFacilitator), { region: selectedRegion }, { merge: true })
        .catch(e => console.error("Error syncing region to firestore:", e));
    }
  }, [selectedRegion, portalFacilitator, isFacilitatorAuthenticated]);

  useEffect(() => {
    localStorage.setItem("catalog_supplier", selectedSupplier);
  }, [selectedSupplier]);

  useEffect(() => {
    localStorage.setItem("catalog_sphere", selectedSphere);
    if (portalFacilitator && isFacilitatorAuthenticated) {
      setDoc(doc(db, "facilitator_states", portalFacilitator), { sphere: selectedSphere }, { merge: true })
        .catch(e => console.error("Error syncing sphere to firestore:", e));
    }
  }, [selectedSphere, portalFacilitator, isFacilitatorAuthenticated]);

  useEffect(() => {
    localStorage.setItem(
      "catalog_sidebar_visible",
      isSidebarVisible ? "true" : "false",
    );
  }, [isSidebarVisible]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (portalFacilitator) return;
      if (isParsing) return;
      const blocked = aiSelectedSpheres.length === 0;
      if (blocked) {
        alert("Выберите хотя бы одну Сферу для импорта ИИ в панели снизу.");
        return;
      }
      if (!files || files.length === 0) return;
      setIsParsing(true);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;

        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });

        try {
          const res = await fetch("/api/parse-product", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: base64,
              mimeType: file.type,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.products && Array.isArray(data.products)) {
              let parsedCount = 0;

              // Find max code
              let startNum = 1;
              try {
                const qCode = query(
                  collection(db, "products"),
                  orderBy("code", "desc"),
                  limit(1),
                );
                const snapCode = await getDocs(qCode);
                if (!snapCode.empty && snapCode.docs[0].data().code) {
                  const lastCode = snapCode.docs[0].data().code;
                  const num = parseInt(lastCode, 10);
                  if (!isNaN(num)) startNum = num + 1;
                }
              } catch (e) {}

              for (const item of data.products) {
                let croppedBase64 = base64;
                if (item.box_2d && item.box_2d.length === 4) {
                  try {
                    croppedBase64 = await cropImage(base64, item.box_2d);
                  } catch (e) {
                    console.error("Crop failed", e);
                  }
                }
                const priceVal =
                  typeof item.price === "number" ? item.price : 0;

                const newProductCode = String(startNum).padStart(4, "0");
                startNum++;

                const newProduct: Product = {
                  id: newProductCode,
                  code: newProductCode,
                  name: item.name || "Unknown Product",
                  description: item.description || "",
                  category: item.category || "Uncategorized",
                  price: priceVal,
                  imageBase64: croppedBase64,
                  mimeType: "image/jpeg",
                  unit: "шт.",
                  prices: {
                    supplier1: {},
                    supplier2: {},
                    supplier3: {},
                    supplier4: {},
                  },
                  createdAt: Date.now(),
                };
                if (selectedSupplier === "supplier1")
                  newProduct.priceSupplier1 = priceVal;
                if (selectedSupplier === "supplier2")
                  newProduct.priceSupplier2 = priceVal;
                if (selectedSupplier === "supplier3")
                  newProduct.priceSupplier3 = priceVal;
                if (selectedSupplier === "supplier4")
                  newProduct.priceSupplier4 = priceVal;

                if (aiSelectedSpheres.length > 0) {
                  newProduct.spheres = aiSelectedSpheres;
                  newProduct.sphere = aiSelectedSpheres[0];
                }

                if (aiSelectedRegions && aiSelectedRegions.length > 0) {
                  newProduct.regions = aiSelectedRegions;
                  aiSelectedRegions.forEach((reg) => {
                    if (newProduct.prices && newProduct.prices[selectedSupplier]) {
                      newProduct.prices[selectedSupplier]![reg] = priceVal;
                    }
                  });
                }

                try {
                  await setDoc(doc(db, "products", newProduct.id), newProduct);
                  parsedCount++;
                } catch (e) {
                  handleFirestoreError(e, OperationType.CREATE, "products");
                }
              }
              if (parsedCount === 0) {
                alert(
                  "Не удалось распознать товары на фото. Попробуйте обрезать фото или добавить товар вручную.",
                );
              }
            } else {
              alert("ИИ не нашел товары на изображении.");
            }
          } else {
            const errData = await res.json().catch(() => ({}));
            alert(
              `Ошибка при обработке изображения сервером: ${errData.error || res.statusText}`,
            );
          }
        } catch (err) {
          console.error("Failed to send to parse API:", err);
          alert("Ошибка сети при отправке изображения на сервер.");
        }
      }
      setIsParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [selectedRegion, selectedSupplier, aiSelectedSpheres, aiSelectedRegions],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (portalFacilitator) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (portalFacilitator) return;
      if (
        e.clipboardData &&
        e.clipboardData.files &&
        e.clipboardData.files.length > 0
      ) {
        const file = e.clipboardData.files[0];
        if (file && file.type.startsWith("image/")) {
          if (isManualModalOpen) {
            const reader = new FileReader();
            reader.onload = async (event) => {
              const base64 = event.target?.result as string;
              try {
                const compressed = await compressImageBase64(base64);
                setManualForm((prev) => ({
                  ...prev,
                  imageBase64: compressed.base64,
                  mimeType: compressed.mimeType,
                }));
              } catch (e) {
                setManualForm((prev) => ({
                  ...prev,
                  imageBase64: base64,
                  mimeType: file.type,
                }));
              }
            };
            reader.readAsDataURL(file);
          } else {
            handleFiles(e.clipboardData.files);
          }
        }
      }
    };

    document.addEventListener("paste", handleGlobalPaste);
    return () => {
      document.removeEventListener("paste", handleGlobalPaste);
    };
  }, [handleFiles, isManualModalOpen]);

  const handleDeleteProduct = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteDoc(doc(db, "products", deleteConfirmId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "products");
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleNormalizeAllNames = () => {
    setNormalizePasswordInput("");
    setNormalizePasswordError("");
    setIsNormalizeConfirmOpen(true);
  };

  const executeImageSearch = async (queryToSearch: string) => {
    if (!queryToSearch.trim()) return;
    setIsSearchingImages(true);
    setImageSearchResults([]);

    try {
      const res = await fetch("/api/search-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryToSearch.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setImageSearchResults(data.results || []);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Ошибка поиска изображений: ${err.error || res.statusText}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Сетевая ошибка при поиске: ${e.message}`);
    }
    setIsSearchingImages(false);
  };

  const handleSearchImagesClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!manualForm.name) {
      alert("Сначала введите название для поиска");
      return;
    }

    const queryParts = [manualForm.name];
    if (manualForm.sphere) queryParts.push(manualForm.sphere);
    const initialQuery = queryParts.join(" ").trim().substring(0, 100);

    setImageSearchQuery(initialQuery);
    setIsImageSearchModalOpen(true);
    await executeImageSearch(initialQuery);
  };

  const handleSelectImageResult = async (url: string) => {
    try {
      const res = await fetch("/api/fetch-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.base64) {
          try {
            const compressed = await compressImageBase64(data.base64);
            setManualForm((prev) => ({
              ...prev,
              imageBase64: compressed.base64,
              mimeType: compressed.mimeType,
            }));
          } catch (e) {
            setManualForm((prev) => ({
              ...prev,
              imageBase64: data.base64,
              mimeType: data.mimeType,
            }));
          }
          setIsImageSearchModalOpen(false);
        }
      } else {
        alert("Не удалось загрузить это изображение.");
      }
    } catch (e) {
      console.error(e);
      alert("Ошибка при загрузке изображения.");
    }
  };

  const confirmNormalizeAllNames = async () => {
    if (normalizePasswordInput !== "020779") {
      alert("Неверный пароль!");
      return;
    }
    setIsNormalizeConfirmOpen(false);
    setIsNormalizingState({ active: true, current: 0, total: products.length });

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      setIsNormalizingState({
        active: true,
        current: i + 1,
        total: products.length,
      });

      try {
        const res = await fetch("/api/normalize-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: p.name,
            description: p.description,
            category: p.category,
            imageBase64: p.imageBase64,
            mimeType: p.mimeType,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.normalizedName && data.normalizedName !== p.name) {
            const updatedProduct = { ...p, name: data.normalizedName };

            // Remove undefined fields for Firestore
            Object.keys(updatedProduct).forEach((key) => {
              if ((updatedProduct as any)[key] === undefined) {
                delete (updatedProduct as any)[key];
              }
            });

            await setDoc(doc(db, "products", p.id), updatedProduct);
          }
        }
      } catch (e) {
        console.error("Error normalizing product", p.id, e);
      }

      // Add a tiny delay to not bombard the backend too aggressively immediately
      await new Promise((r) => setTimeout(r, 600));
    }

    setIsNormalizingState({ active: false, current: 0, total: 0 });
    alert("Нормализация завершена!");
  };

  const handleDeleteAllProducts = () => {
    setDeleteAllCode("");
    setIsDeleteAllModalOpen(true);
  };

  const confirmDeleteAllProducts = async () => {
    if (deleteAllCode !== "@020779") {
      alert("Неверный код. Удаление отменено.");
      return;
    }

    try {
      setIsExporting(true); // Using this as a generic loading state for the operation
      const batch = writeBatch(db);
      let count = 0;

      for (const p of products) {
        const docRef = doc(db, "products", p.id);
        batch.delete(docRef);
        count++;

        // firestore batches can hold up to 500 ops
        if (count === 490) {
          await batch.commit();
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }

      alert("База данных успешно очищена.");
      setIsDeleteAllModalOpen(false);
    } catch (e) {
      console.error(e);
      alert("Ошибка при очистке базы данных.");
    } finally {
      setIsExporting(false);
    }
  };

  const getProductPriceForSupplierAndRegion = (
    p: Product,
    supplier: "supplier1" | "supplier2" | "supplier3" | "supplier4",
    region: string,
  ): number => {
    if (supplier === "supplier1") {
      return globalDict.logisticsCosts?.[region] || 0;
    }

    if (
      region &&
      p.prices?.[supplier]?.[region] !== undefined &&
      p.prices[supplier][region] !== null
    ) {
      const customPrice = parseFloat(String(p.prices[supplier][region])) || 0;
      if (customPrice > 0) {
        return customPrice;
      }
    }

    // Fallback to legacy price definition if no region price overrides exist
    const mapId =
      supplier === "supplier2"
        ? "priceSupplier2"
        : supplier === "supplier3"
          ? "priceSupplier3"
          : "priceSupplier4";
    const legacyPrice = parseFloat(String(p[mapId as keyof Product])) || 0;
    if (legacyPrice > 0) {
      return legacyPrice;
    }

    return 0;
  };

  const handleAddToCart = (
    p: Product,
    supplier?: "supplier1" | "supplier2" | "supplier3" | "supplier4",
    price?: number,
  ) => {
    let finalPrice = Infinity;
    let bestSupplier:
      | "supplier1"
      | "supplier2"
      | "supplier3"
      | "supplier4"
      | null = null;

    if (price !== undefined && supplier !== undefined) {
      finalPrice = price;
      bestSupplier = supplier;
    } else {
      // Find the cheapest supplier and its price for this product in the selectedRegion
      const activeReg = selectedRegion || "Душанбе";
      const sups: ("supplier2" | "supplier3" | "supplier4")[] = [
        "supplier2",
        "supplier3",
        "supplier4",
      ];

      sups.forEach((sup) => {
        const pr = getProductPriceForSupplierAndRegion(p, sup, activeReg);
        if (pr > 0 && pr < finalPrice) {
          finalPrice = pr;
          bestSupplier = sup;
        }
      });
    }

    if (finalPrice === Infinity || !bestSupplier) {
      return; // Ignore product if no price available
    }

    setCart((prev) => {
      const ext = prev.find(
        (item) =>
          item.product.id === p.id && item.selectedSupplier === bestSupplier,
      );
      if (ext) {
        return prev.map((item) =>
          item.product.id === p.id && item.selectedSupplier === bestSupplier
            ? {
                ...item,
                quantity: item.quantity + 1,
                selectedPrice: finalPrice,
              }
            : item,
        );
      }
      
      const filtered = showBestPrice
        ? prev.filter((item) => item.product.id !== p.id)
        : prev;

      return [
        ...filtered,
        {
          product: p,
          quantity: 1,
          selectedSupplier: bestSupplier as "supplier1" | "supplier2" | "supplier3" | "supplier4",
          selectedPrice: finalPrice,
        },
      ];
    });
  };

  // Automatically adjust cart items whenever selectedRegion or showBestPrice changes
  useEffect(() => {
    if (cart.length === 0) return;
    const activeReg = selectedRegion || "Душанбе";
    let changed = false;

    const updatedCart = cart.map((item) => {
      if (showBestPrice) {
        const sups: ("supplier2" | "supplier3" | "supplier4")[] = [
          "supplier2",
          "supplier3",
          "supplier4",
        ];
        let minPrice = Infinity;
        let bestSupplier: "supplier1" | "supplier2" | "supplier3" | "supplier4" =
          "supplier2";

        sups.forEach((sup) => {
          const pr = getProductPriceForSupplierAndRegion(
            item.product,
            sup,
            activeReg,
          );
          if (pr > 0 && pr < minPrice) {
            minPrice = pr;
            bestSupplier = sup;
          }
        });

        if (minPrice === Infinity) {
          bestSupplier = item.selectedSupplier || "supplier2";
        }

        if (
          item.selectedSupplier !== bestSupplier ||
          item.selectedPrice !== minPrice
        ) {
          changed = true;
          return {
            ...item,
            selectedSupplier: bestSupplier,
            selectedPrice: minPrice,
          };
        }
      } else {
        // Keep current selected supplier, update price for the new region
        const currentSup = item.selectedSupplier || "supplier2";
        const newPrice = getProductPriceForSupplierAndRegion(
          item.product,
          currentSup,
          activeReg,
        );
        const finalPrice = newPrice > 0 ? newPrice : Infinity;

        if (item.selectedPrice !== finalPrice) {
          changed = true;
          return {
            ...item,
            selectedPrice: finalPrice,
          };
        }
      }
      return item;
    });

    if (changed) {
      setCart(updatedCart);
    }
  }, [selectedRegion, products, globalDict, showBestPrice]);

  const handleUpdateCartQuantity = (
    productId: string,
    supplier: "supplier1" | "supplier2" | "supplier3" | "supplier4",
    delta: number,
  ) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (
            item.product.id === productId &&
            item.selectedSupplier === supplier
          ) {
            const newQ = item.quantity + delta;
            return { ...item, quantity: Math.max(0, newQ) };
          }
          return item;
        })
        .filter((item) => item.quantity > 0),
    );
  };

  const handleUpdateCartSupplier = (
    productId: string,
    oldSupplier: "supplier1" | "supplier2" | "supplier3" | "supplier4",
    newSupplier: "supplier1" | "supplier2" | "supplier3" | "supplier4",
  ) => {
    setCart((prev) => {
      const existingNew = prev.find(
        (item) =>
          item.product.id === productId &&
          item.selectedSupplier === newSupplier,
      );
      const targetItem = prev.find(
        (item) =>
          item.product.id === productId &&
          item.selectedSupplier === oldSupplier,
      );

      if (!targetItem) return prev;

      const activeReg = selectedRegion || "Душанбе";
      const supPrice = getProductPriceForSupplierAndRegion(
        targetItem.product,
        newSupplier,
        activeReg,
      );
      const newPrice = supPrice > 0 ? supPrice : 0;

      if (existingNew) {
        return prev
          .map((item) => {
            if (
              item.product.id === productId &&
              item.selectedSupplier === newSupplier
            ) {
              return {
                ...item,
                quantity: item.quantity + targetItem.quantity,
                selectedPrice: newPrice,
              };
            }
            return item;
          })
          .filter(
            (item) =>
              !(
                item.product.id === productId &&
                item.selectedSupplier === oldSupplier
              ),
          );
      } else {
        return prev.map((item) => {
          if (
            item.product.id === productId &&
            item.selectedSupplier === oldSupplier
          ) {
            return {
              ...item,
              selectedSupplier: newSupplier,
              selectedPrice: newPrice,
            };
          }
          return item;
        });
      }
    });
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const handleCartPrint = () => {
    if (window !== window.parent) {
      setPrintWarningType("cart");
      setShowPrintWarning(true);
    } else {
      setIsCartPrinting(true);
      const afterPrint = () => {
        setIsCartPrinting(false);
        window.removeEventListener("afterprint", afterPrint);
      };
      window.addEventListener("afterprint", afterPrint);
      setTimeout(() => {
        window.print();
        // Fallback in case afterprint doesn't fire
        setTimeout(() => setIsCartPrinting(false), 2000);
      }, 300);
    }
  };

  const pdfRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (portalFacilitator && isFacilitatorAuthenticated) {
      setShowFacilitatorPrintWarning(true);
      setPrintCatalogType("filtered");
      setPrintSelectedRegion(facilitatorRegion || selectedRegion || "");
      setPrintSelectedSupplier(null);
      setPrintSelectedSphere(selectedSphere || "");
    } else {
      setShowFacilitatorPrintWarning(false);
      setPrintCatalogType("full");
      setPrintSelectedRegion(selectedRegion || "");
      setPrintSelectedSupplier(selectedSupplier || null);
      setPrintSelectedSphere(selectedSphere || "");
    }
    setIsPrintOptionsOpen(true);
  };

  const handleConfirmPrint = () => {
    setIsPrintOptionsOpen(false);
    setTimeout(() => {
      if (window !== window.parent) {
        setPrintWarningType("catalog");
        setShowPrintWarning(true);
      } else {
        window.print();
      }
    }, 100);
  };

  const handleExportPriceExcel = async () => {
    if (!selectedRegion) {
       alert("Выберите регион перед выгрузкой");
       return;
    }
    try {
      await downloadPriceEditExcel(products, globalDict.suppliers, selectedRegion, selectedSphere);
    } catch (e) {
      console.error(e);
      alert("Ошибка при выгрузке Excel");
    }
  };

  const handleImportPriceExcel = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    
    try {
      setIsImportingPrices(true);
      const res = await importPriceEditExcel(file);
      alert(`Успешно обновлено товаров: ${res.updated}`);
    } catch (e: any) {
      console.error(e);
      alert("Ошибка импорта: " + (e.message || "Неизвестная ошибка"));
    } finally {
      setIsImportingPrices(false);
      if (priceExcelInputRef.current) {
        priceExcelInputRef.current.value = "";
      }
    }
  };

  const handleExport = async () => {
    if (products.length === 0) return;

    let exportProducts = products;
    if (
      [
        "sphere",
        "region_sphere",
        "supplier_sphere",
        "region_supplier_sphere",
      ].includes(exportScope)
    ) {
      exportProducts = exportProducts.filter((p) => {
        if (!selectedSphere) return true;
        const prodSpheres = p.spheres && p.spheres.length > 0 ? p.spheres : (p.sphere ? [p.sphere] : []);
        return prodSpheres.some(s => s === selectedSphere || s.includes(selectedSphere) || selectedSphere.includes(s));
      });
    }

    if (exportProducts.length === 0) {
      alert("Нет данных для экспорта.");
      return;
    }

    try {
      setIsExporting(true);
      const mappedProducts = exportProducts.map((p) => {
        const productRegion =
          ["region_sphere", "region_supplier_sphere"].includes(exportScope) &&
          selectedRegion
            ? selectedRegion
            : "Душанбе";
        return {
          ...p,
          priceSupplier1: getProductPriceForSupplierAndRegion(
            p,
            "supplier1",
            productRegion,
          ),
          priceSupplier2: getProductPriceForSupplierAndRegion(
            p,
            "supplier2",
            productRegion,
          ),
          priceSupplier3: getProductPriceForSupplierAndRegion(
            p,
            "supplier3",
            productRegion,
          ),
          priceSupplier4: getProductPriceForSupplierAndRegion(
            p,
            "supplier4",
            productRegion,
          ),
        };
      });

      const supplierScope =
        ["supplier_sphere", "region_supplier_sphere"].includes(exportScope) &&
        selectedSupplier !== ("supplier1" as any)
          ? selectedSupplier
          : undefined;

      await downloadCatalogExcel(
        mappedProducts,
        globalDict.suppliers,
        supplierScope as any,
      );
    } catch (err: any) {
      console.error(err);
      alert("Export failed: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSecretClick = () => {
    if (portalFacilitator) return;
    const now = Date.now();
    if (now - clickTimestampRef.current > 1000) {
      clickCountRef.current = 1;
    } else {
      clickCountRef.current += 1;
    }
    clickTimestampRef.current = now;

    if (clickCountRef.current >= 5) {
      const newAdminState = !isAdminMode;
      setIsAdminMode(newAdminState);
      localStorage.setItem("catalog_admin", String(newAdminState));
      alert(
        newAdminState
          ? "Режим управления включен"
          : "Режим управления отключен",
      );
      clickCountRef.current = 0;
    }
  };

  const handleOpenManualModal = () => {
    setEditingProductId(null);
    setIsCustomUnit(false);
    setIsCustomRegion(false);
    setIsCustomSphere(false);

    const initialPrices: Record<
      "supplier1" | "supplier2" | "supplier3" | "supplier4",
      Record<string, string>
    > = {
      supplier1: {},
      supplier2: {},
      supplier3: {},
      supplier4: {},
    };
    globalDict.regions.forEach((r) => {
      initialPrices.supplier1[r] = "";
      initialPrices.supplier2[r] = "";
      initialPrices.supplier3[r] = "";
      initialPrices.supplier4[r] = "";
    });

    setManualForm({
      name: "",
      description: "",
      price: "",
      category: "",
      spheres: selectedSphere ? [selectedSphere] : [],
      imageBase64: "",
      mimeType: "",
      unit: "шт.",
      supplier: selectedSupplier || "supplier1",
      priceSupplier1: "",
      priceSupplier2: "",
      priceSupplier3: "",
      priceSupplier4: "",
      prices: initialPrices,
      createdAt: undefined,
    });
    setIsManualModalOpen(true);
  };

  const handleEditProduct = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProductId(product.id);
    const standardUnits = [
      "шт.",
      "кг",
      "мм",
      "литр",
      "метр",
      "г",
      "т",
      "упак.",
      "короб.",
      "компл.",
    ];
    const currentUnit = product.unit || "шт.";
    setIsCustomUnit(!standardUnits.includes(currentUnit));

    const initialSupplier = selectedSupplier || "supplier1";

    const loadedPrices: Record<
      "supplier1" | "supplier2" | "supplier3" | "supplier4",
      Record<string, string>
    > = {
      supplier1: {},
      supplier2: {},
      supplier3: {},
      supplier4: {},
    };
    globalDict.regions.forEach((r) => {
      loadedPrices.supplier1[r] = "";
      loadedPrices.supplier2[r] = "";
      loadedPrices.supplier3[r] = "";
      loadedPrices.supplier4[r] = "";
    });

    if (product.prices) {
      if (product.prices.supplier1) {
        Object.entries(product.prices.supplier1).forEach(([reg, val]) => {
          if (val !== undefined && val !== null)
            loadedPrices.supplier1[reg] = val.toString();
        });
      }
      if (product.prices.supplier2) {
        Object.entries(product.prices.supplier2).forEach(([reg, val]) => {
          if (val !== undefined && val !== null)
            loadedPrices.supplier2[reg] = val.toString();
        });
      }
      if (product.prices.supplier3) {
        Object.entries(product.prices.supplier3).forEach(([reg, val]) => {
          if (val !== undefined && val !== null)
            loadedPrices.supplier3[reg] = val.toString();
        });
      }
      if (product.prices.supplier4) {
        Object.entries(product.prices.supplier4).forEach(([reg, val]) => {
          if (val !== undefined && val !== null)
            loadedPrices.supplier4[reg] = val.toString();
        });
      }
    }

    setManualForm({
      name: product.name || "",
      description: product.description || "",
      price: product.price !== undefined ? product.price.toString() : "",
      category: product.category || "",
      spheres: product.spheres && product.spheres.length > 0
          ? product.spheres
          : product.sphere
            ? [product.sphere]
            : [],
      imageBase64: product.imageBase64 || "",
      mimeType: product.mimeType || "",
      unit: currentUnit,
      supplier: initialSupplier,
      priceSupplier1:
        product.priceSupplier1 !== undefined
          ? product.priceSupplier1.toString()
          : "",
      priceSupplier2:
        product.priceSupplier2 !== undefined
          ? product.priceSupplier2.toString()
          : "",
      priceSupplier3:
        product.priceSupplier3 !== undefined
          ? product.priceSupplier3.toString()
          : "",
      priceSupplier4:
        product.priceSupplier4 !== undefined
          ? product.priceSupplier4.toString()
          : "",
      prices: loadedPrices,
      createdAt: product.createdAt,
    });
    setIsManualModalOpen(true);
  };

  const handleManualImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Пожалуйста, загрузите изображение");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      try {
        const compressed = await compressImageBase64(base64);
        setManualForm((prev) => ({
          ...prev,
          imageBase64: compressed.base64,
          mimeType: compressed.mimeType,
        }));
      } catch (e) {
        setManualForm((prev) => ({
          ...prev,
          imageBase64: base64,
          mimeType: file.type,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveDictionaries = async (updatedDict: any) => {
    try {
      await setDoc(doc(db, "settings", "dictionaries"), updatedDict);
      setGlobalDict(updatedDict);
      setIsDictModalOpen(false);
    } catch (e) {
      console.error(e);
      alert("Ошибка при сохранении справочников");
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingManual) return;

    if (!manualForm.spheres || manualForm.spheres.length === 0) {
      alert("Пожалуйста, выберите минимум одну Сферу.");
      return;
    }

    if (!manualForm.name) {
      alert("Название обязательно!");
      return;
    }

    setIsSavingManual(true);

    const basePrice = manualForm.price ? parseFloat(manualForm.price) : 0;

    // Build the final overridden prices dictionary to save
    const pricesData: Record<string, Record<string, number>> = {
      supplier1: {},
      supplier2: {},
      supplier3: {},
      supplier4: {},
    };

    globalDict.regions.forEach((reg) => {
      const p1Val = manualForm.prices.supplier1?.[reg];
      if (p1Val && p1Val.trim() !== "") {
        pricesData.supplier1[reg] = parseFloat(p1Val);
      }
      const p2Val = manualForm.prices.supplier2?.[reg];
      if (p2Val && p2Val.trim() !== "") {
        pricesData.supplier2[reg] = parseFloat(p2Val);
      }
      const p3Val = manualForm.prices.supplier3?.[reg];
      if (p3Val && p3Val.trim() !== "") {
        pricesData.supplier3[reg] = parseFloat(p3Val);
      }
      const p4Val = manualForm.prices.supplier4?.[reg];
      if (p4Val && p4Val.trim() !== "") {
        pricesData.supplier4[reg] = parseFloat(p4Val);
      }
    });

    // Populate legacy fallback values just in case
    const fallbackReg = selectedRegion || "Душанбе";
    const p1Fallback =
      pricesData.supplier1[fallbackReg] ||
      getProductPriceForSupplierAndRegion(
        { price: basePrice } as any,
        "supplier1",
        fallbackReg,
      );
    const p2Fallback =
      pricesData.supplier2[fallbackReg] ||
      getProductPriceForSupplierAndRegion(
        { price: basePrice } as any,
        "supplier2",
        fallbackReg,
      );
    const p3Fallback =
      pricesData.supplier3[fallbackReg] ||
      getProductPriceForSupplierAndRegion(
        { price: basePrice } as any,
        "supplier3",
        fallbackReg,
      );
    const p4Fallback =
      pricesData.supplier4[fallbackReg] ||
      getProductPriceForSupplierAndRegion(
        { price: basePrice } as any,
        "supplier4",
        fallbackReg,
      );

    let nextCode = manualForm.code;
    if (!editingProductId) {
      if (!manualForm.code) { // Only generate if user didn't explicitly set one
        try {
          nextCode = await generateNextProductCode(db);
        } catch (e) {
          console.error("Error generating code", e);
          nextCode = "0000";
        }
      }
    } else {
      // Find existing code
      const existing = products.find((p) => p.id === editingProductId);
      if (existing && existing.code) {
        nextCode = existing.code;
      }
    }

    const productId = editingProductId || nextCode;

    const productData: Product = {
      id: productId,
      code: nextCode,
      name: manualForm.name,
      description: manualForm.description,
      category: manualForm.category || "Без категории",
      price: basePrice,
      priceSupplier1: p1Fallback,
      priceSupplier2: p2Fallback,
      priceSupplier3: p3Fallback,
      priceSupplier4: p4Fallback,
      prices: pricesData,
      imageBase64: manualForm.imageBase64,
      mimeType: manualForm.mimeType,
      sphere: manualForm.spheres[0] || "",
      spheres: manualForm.spheres,
      unit: manualForm.unit || "шт.",
      createdAt: manualForm.createdAt || Date.now(),
    };

    try {
      await setDoc(doc(db, "products", productData.id), productData); // setDoc overwrites
      setIsManualModalOpen(false);
      setEditingProductId(null);
      setManualForm({
        name: "",
        description: "",
        price: "",
        category: "",
        spheres: [],
        imageBase64: "",
        mimeType: "",
        unit: "шт.",
        supplier: "supplier1",
        priceSupplier1: "",
        priceSupplier2: "",
        priceSupplier3: "",
        priceSupplier4: "",
        prices: {
          supplier1: {},
          supplier2: {},
          supplier3: {},
          supplier4: {},
        },
      });
    } catch (err) {
      handleFirestoreError(
        err,
        editingProductId ? OperationType.UPDATE : OperationType.CREATE,
        "products",
      );
    } finally {
      setIsSavingManual(false);
    }
  };

  const uniqueRegions = portalFacilitator && isFacilitatorAuthenticated && facilitatorRegion
    ? [facilitatorRegion]
    : Array.from(new Set([...globalDict.regions])).sort();
  const uniqueSpheres = Array.from(
    new Set([
      ...globalDict.spheres,
      ...products.flatMap((p) => p.spheres && p.spheres.length > 0 ? p.spheres : (p.sphere ? [p.sphere] : [])),
    ]),
  ).sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
  });

  const handleOpenGenerateIdsModal = () => {
    setDeleteAllCode("");
    setGenerateIdsSuccess(null);
    setIsGenerateIdsModalOpen(true);
  };

  const confirmGenerateMissingCodes = async () => {
    if (deleteAllCode !== "@020779" && deleteAllCode !== "020779") {
      alert("Неверный код. Операция отменена.");
      return;
    }

    try {
      setGenerateIdsSuccess(null);
      setIsExporting(true); // Re-use generic loading state
      const q = query(collection(db, "products"));
      const snap = await getDocs(q);
      const allProds = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Product,
      );

      if (allProds.length === 0) {
        setGenerateIdsSuccess("Нет товаров для назначения.");
        setIsExporting(false);
        return;
      }

      // First query all to memory, then we sort alphabetically to assign correctly
      allProds.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      let nextNum = 1;
      let batch = writeBatch(db);
      let count = 0;

      for (const p of allProds) {
        const newCode = String(nextNum).padStart(4, "0");
        batch.update(doc(db, "products", p.id), { code: newCode });
        nextNum++;
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
      setGenerateIdsSuccess(
        `Успешно переназначены ID для ${allProds.length} товаров.`,
      );
    } catch (e: any) {
      console.error(e);
      alert("Ошибка: " + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  const displayProducts = products
    .filter((p) => {
      if (searchName) {
        const q = searchName.toLowerCase();
        const nameMatch = p.name.toLowerCase().includes(q);
        const descMatch = p.description?.toLowerCase().includes(q);
        const codeMatch = p.code?.toLowerCase().includes(q);
        const idMatch = p.id?.toLowerCase().includes(q);
        if (!nameMatch && !descMatch && !codeMatch && !idMatch) return false;
      }
      if (searchCode) {
        const c = searchCode.toLowerCase().replace(/^#/, "");
        const codeMatch = p.code?.toLowerCase().includes(c);
        if (!codeMatch) return false;
      }
      // All products are now global. No region filter required.
      // Sphere filter still applies
      if (selectedSphere) {
          const prodSpheres = p.spheres && p.spheres.length > 0 ? p.spheres : (p.sphere ? [p.sphere] : []);
          const isMatch = prodSpheres.some(s => s === selectedSphere || s.includes(selectedSphere) || selectedSphere.includes(s));
          if (!isMatch) return false;
      }
      if (showOnlyNew) {
        if (!p.createdAt || Date.now() - p.createdAt >= 24 * 60 * 60 * 1000) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      const codeA = a.code || "";
      const codeB = b.code || "";
      if (codeA && codeB) {
        return codeA.localeCompare(codeB, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }
      return codeA.localeCompare(codeB) || a.name.localeCompare(b.name);
    });

  const hasGkPrice = displayProducts.some((p) => p.price !== undefined && p.price > 0);

  const isUploadBlocked = aiSelectedSpheres.length === 0;

  if (portalFacilitator && !isInitialLoadDone) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50 font-sans">
        <div className="max-w-xs w-full px-6 flex flex-col items-center">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-6" />
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-3">
            <div 
              className="h-full bg-indigo-600 transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="text-sm font-medium text-slate-600 animate-pulse">
            {loadingText}
          </div>
        </div>
      </div>
    );
  }

  if (!portalFacilitator && !isAdminPageAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 font-sans">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200 max-w-sm w-full mx-4">
          <h2 className="text-xl font-bold text-slate-800 mb-2 text-center">Вход Администратора</h2>
          <p className="text-sm text-slate-500 mb-6 text-center">Введите пароль для доступа к основному каталогу.</p>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              const expectedPassword = globalDict.adminPassword || "020779";
              if (adminPageInputCode === expectedPassword) {
                sessionStorage.setItem("main_admin_auth", "true");
                setIsAdminPageAuthenticated(true);
              } else {
                alert("Неверный пароль!");
                setAdminPageInputCode("");
              }
            }}
            className="flex flex-col gap-4"
          >
            <input 
              type="password"
              placeholder="Пароль"
              value={adminPageInputCode}
              onChange={(e) => setAdminPageInputCode(e.target.value)}
              className="w-full text-center tracking-widest border border-slate-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition-colors shadow-sm"
            >
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (portalFacilitator && !isFacilitatorAuthenticated) {
    const expectedCode = resolvedFacilitator.code || "";
    if (!expectedCode) {
      return (
        <div className="flex items-center justify-center h-screen bg-slate-950 font-sans text-center">
          <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200 max-w-sm w-full mx-4">
            <h2 className="text-xl font-bold text-slate-800 mb-2">Доступ не настроен</h2>
            <p className="text-sm text-slate-500">
              Код доступа для данного фасилитатора еще не задан администратором в справочнике.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 font-sans">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200 max-w-sm w-full mx-4">
          <h2 className="text-xl font-bold text-slate-800 mb-2 text-center">Вход для Фасилитаторов</h2>
          <p className="text-sm text-slate-500 mb-6 text-center">Введите секретный код для доступа к панели фасилитатора.</p>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (facilitatorInputCode.trim().toLowerCase() === expectedCode.trim().toLowerCase()) {
                setIsFacilitatorAuthenticated(true);
                sessionStorage.setItem(`auth_${portalFacilitator}`, "true");
                sessionStorage.setItem("auth_resolved", "true");
              } else {
                alert("Неверный код");
              }
            }}
            className="flex flex-col gap-4"
          >
            <input 
              type="password" 
              value={facilitatorInputCode} 
              onChange={e => setFacilitatorInputCode(e.target.value)}
              placeholder="Секретный код..." 
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <button 
              type="submit" 
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded transition-colors text-sm"
            >
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden outline-none print:hidden">
        {/* Mobile Backdrop overlay */}
        {!isTabletMode && isSidebarVisible && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsSidebarVisible(false)}
          />
        )}

        {/* Sidebar Navigation */}
        {!isTabletMode && (
          <aside
            className={`bg-slate-900 text-white flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden fixed md:static inset-y-0 left-0 z-50 h-full md:h-auto shadow-2xl md:shadow-none ${
              isSidebarVisible
                ? "w-64 opacity-100 border-r border-slate-800 translate-x-0"
                : "w-0 opacity-0 pointer-events-none border-r-0 -translate-x-full md:translate-x-0"
            }`}
          >
            <div className="p-6 border-b border-slate-800 shrink-0">
              <div
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={handleSecretClick}
              >
                <div className="w-8 h-8 bg-indigo-500 rounded flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-xl tracking-tight">
                  КАТАЛОГ
                </span>
              </div>
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              {portalFacilitator && isFacilitatorAuthenticated && (
                <div className="mb-6 p-3 bg-indigo-950/40 rounded-lg border border-indigo-800/50">
                  <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">
                    Профиль Фасилитатора
                  </div>
                  <div className="font-semibold text-sm text-white leading-snug">
                    {getFacilitatorName()}
                  </div>
                  <div className="mt-2 text-xs text-slate-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></span>
                    Регион: <span className="font-medium text-white">{facilitatorRegion || "Не привязан"}</span>
                  </div>
                </div>
              )}
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2">
                Управление
              </div>
              <a
                href="#"
                className="flex items-center gap-3 px-3 py-2 bg-slate-800 rounded-md text-white"
              >
                <ListIcon className="w-5 h-5 opacity-70" />
                Товары
              </a>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setIsCartOpen(true);
                }}
                className="flex items-center justify-between px-3 py-2 text-slate-400 hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ShoppingCart className="w-5 h-5 opacity-70" />
                  Сформировать корзину
                </div>
                {cart.length > 0 && (
                  <span className="bg-indigo-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {cart.reduce((a, b) => a + b.quantity, 0)}
                  </span>
                )}
              </a>
              {isReallyAdmin && (
                <>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsDictModalOpen(true);
                    }}
                    className="flex items-center gap-3 px-3 py-2 text-slate-400 hover:bg-slate-800 transition-colors"
                  >
                    <BookOpen className="w-5 h-5 opacity-70" />
                    Справочники
                  </a>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      handleNormalizeAllNames();
                    }}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${isNormalizingState.active ? "text-indigo-500 cursor-not-allowed opacity-50" : "text-indigo-400 hover:bg-indigo-950/50 hover:text-indigo-300"}`}
                  >
                    {isNormalizingState.active ? (
                      <Loader2 className="w-5 h-5 opacity-70 animate-spin" />
                    ) : (
                      <Wand2 className="w-5 h-5 opacity-70" />
                    )}
                    Нормализовать названия
                  </a>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      handleOpenGenerateIdsModal();
                    }}
                    className="flex items-center gap-3 px-3 py-2 text-indigo-400 hover:bg-indigo-950/50 hover:text-indigo-300 transition-colors"
                  >
                    <Plus className="w-5 h-5 opacity-70" />
                    Назначить ID товарам
                  </a>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      handleDeleteAllProducts();
                    }}
                    className="flex items-center gap-3 px-3 py-2 text-red-500 hover:bg-red-950/50 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-5 h-5 opacity-70" />
                    Очистить базу ({products.length})
                  </a>
                  <a
                    href="#"
                    className="flex items-center gap-3 px-3 py-2 text-slate-400 hover:bg-slate-800 transition-colors"
                  >
                    <Download className="w-5 h-5" />
                    История экспорта
                  </a>
                </>
              )}
            </nav>

            <div className="p-4 border-t border-slate-800 space-y-3 shrink-0">
              <button
                onClick={handleExport}
                disabled={isExporting || products.length === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 disabled:text-indigo-400 py-2.5 rounded text-sm font-semibold transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                СКАЧАТЬ КАТАЛОГ
              </button>
              <button
                onClick={handlePrint}
                disabled={products.length === 0}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 disabled:text-slate-500 py-2.5 rounded text-sm font-semibold transition-all flex items-center justify-center gap-2 text-white"
              >
                <Printer className="w-4 h-4" />
                РАСПЕЧАТАТЬ КАТАЛОГ
              </button>
            </div>
          </aside>
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {needRefresh && (
            <div className="bg-indigo-600 text-white px-4 py-2 flex items-center justify-between shadow-md z-50">
              <span className="text-sm font-medium">
                Доступна новая версия каталога.
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => updateServiceWorker(true)}
                  className="bg-white text-indigo-700 hover:bg-indigo-50 px-3 py-1 rounded text-xs font-bold transition-colors"
                >
                  Обновить
                </button>
                <button
                  onClick={() => setNeedRefresh(false)}
                  className="text-white opacity-80 hover:opacity-100 p-1 rounded transition-opacity"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Top Header */}
          <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-8 shrink-0 gap-2">
            <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
              <button
                onClick={() => setIsSidebarVisible(!isSidebarVisible)}
                className="p-1.5 sm:p-2 -ml-1 sm:-ml-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all flex items-center justify-center focus:outline-none shrink-0"
                title={
                  isSidebarVisible
                    ? "Скрыть меню (складывание влево)"
                    : "Показать меню"
                }
              >
                {isSidebarVisible ? (
                  <ChevronLeft className="w-5 h-5 text-slate-500" />
                ) : (
                  <Menu className="w-5 h-5 text-slate-700 font-bold" />
                )}
              </button>
              <div className="h-4 w-px bg-slate-200 shrink-0"></div>
              <div className="flex items-center gap-2 w-32 xs:w-44 sm:w-64 md:w-80 shrink min-w-0">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="Поиск..."
                  className="text-sm w-full outline-none text-slate-600 font-sans bg-transparent truncate"
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              <div className="hidden md:flex items-center gap-2 mr-2">
                {isOnline ? (
                  <span className="flex items-center gap-1.5 min-w-fit px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-md text-xs font-medium border border-emerald-200">
                    <Wifi className="w-3.5 h-3.5" />
                    Онлайн
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 min-w-fit px-3 py-1.5 bg-rose-50 text-rose-700 rounded-md text-xs font-medium border border-rose-200">
                    <WifiOff className="w-3.5 h-3.5" />
                    Оффлайн (синхронизация приостановлена)
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  if (showBestPrice) {
                    setShowBestPrice(false);
                  } else {
                    setBestPricePasswordInput("");
                    setBestPricePasswordError("");
                    setIsBestPricePasswordModalOpen(true);
                  }
                }}
                className={`text-xs px-2 py-1 sm:px-3 sm:py-1.5 rounded-md font-medium border transition-colors ${
                  showBestPrice
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <span className="hidden xs:inline">{showBestPrice ? "Лучшая цена: Вкл" : "Лучшая цена: Выкл"}</span>
                <span className="xs:hidden">{showBestPrice ? "Лучшая" : "Выкл"}</span>
              </button>
              <button
                onClick={() => setIsTabletMode(!isTabletMode)}
                className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 sm:px-3 sm:py-1.5 rounded-md font-medium border border-indigo-200 hover:bg-indigo-100 transition-colors"
              >
                <span className="hidden xs:inline">{isTabletMode ? "Обычный режим" : "Режим Планшета"}</span>
                <span className="xs:hidden">{isTabletMode ? "Обычный" : "Планшет"}</span>
              </button>
              {isTabletMode && (
                <button
                  onClick={() => setIsCartOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 bg-indigo-600 text-white rounded-md text-xs font-medium hover:bg-indigo-700 transition-colors relative"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Корзина</span>
                  {cart.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full">
                      {cart.reduce((a, b) => a + b.quantity, 0)}
                    </span>
                  )}
                </button>
              )}
              <span className="text-xs text-slate-500 font-medium px-2.5 py-1 bg-slate-100 rounded-full border border-slate-200 hidden md:inline-block">
                Публичный доступ
              </span>
            </div>
          </header>

          {/* Content Area */}
          <div className="flex-1 p-3 sm:p-8 bg-slate-50/50 overflow-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Каталог товаров
                </h1>
                <p className="text-sm text-slate-500">
                  Отображено {products.length} товаров
                </p>
              </div>
              <div className="flex gap-2">
                {!isTabletMode && isReallyAdmin && (
                  <>
                    <input
                      type="file"
                      accept=".xlsx, .xls"
                      className="hidden"
                      ref={priceExcelInputRef}
                      onChange={(e) => handleImportPriceExcel(e.target.files)}
                    />
                    <button
                      onClick={handleExportPriceExcel}
                      className="flex items-center gap-2 px-3 py-2 rounded-md shadow-sm transition-colors text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                      title="Выгрузить шаблон цен"
                    >
                      <Download className="w-4 h-4" />
                      Цены
                    </button>
                    <button
                      onClick={() => priceExcelInputRef.current?.click()}
                      disabled={isImportingPrices}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md shadow-sm transition-colors text-sm font-medium border mr-2 ${
                        isImportingPrices
                          ? "bg-slate-100 text-slate-400 border-slate-200 cursor-wait"
                          : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                      }`}
                      title="Загрузить обновленные цены"
                    >
                      {isImportingPrices ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                      Обновить цены
                    </button>
                  </>
                )}

                {isReallyAdmin && !isTabletMode && (
                  <button
                    onClick={handleOpenManualModal}
                    className="flex items-center gap-2 px-4 py-2 rounded-md shadow-sm transition-colors text-sm font-medium mr-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <Plus className="w-4 h-4" />
                    Добавить вручную
                  </button>
                )}
                <div className="p-1 bg-white border border-slate-200 rounded-lg flex items-center gap-1 shadow-sm">
                  <button
                    onClick={() => setViewMode("table")}
                    className={`p-1.5 rounded-md transition-all ${
                      viewMode === "table"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    }`}
                    title="Табличный вид"
                  >
                    <ListIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1.5 rounded-md transition-all ${
                      viewMode === "grid"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    }`}
                    title="Вид виджетов (карточек)"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-6 z-10 w-full">
              {/* Search by Name */}
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Поиск по названию..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-400 transition-colors"
                />
                {searchName && (
                  <button
                    onClick={() => setSearchName("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Search by Code */}
              <div className="relative w-36">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Код товара..."
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-400 transition-colors"
                />
                {searchCode && (
                  <button
                    onClick={() => setSearchCode("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {!isTabletMode && !portalFacilitator && (
                <select
                  value={selectedSupplier}
                  onChange={(e) => setSelectedSupplier(e.target.value as any)}
                  className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-400 transition-colors cursor-pointer w-44 font-semibold text-indigo-700"
                >
                  <option value="supplier2">
                    {getSupplierLabel("supplier2")}
                  </option>
                  <option value="supplier3">
                    {getSupplierLabel("supplier3")}
                  </option>
                  <option value="supplier4">
                    {getSupplierLabel("supplier4")}
                  </option>
                </select>
              )}

              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                disabled={!!portalFacilitator}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-400 transition-colors cursor-pointer w-44 disabled:opacity-75 disabled:cursor-not-allowed disabled:bg-slate-50 font-medium"
              >
                <option value="">Выберите регион...</option>
                {uniqueRegions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <select
                value={selectedSphere}
                onChange={(e) => setSelectedSphere(e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-indigo-400 transition-colors cursor-pointer w-44"
              >
                <option value="">Все сферы</option>
                {uniqueSpheres.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setShowOnlyNew(!showOnlyNew)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md border text-sm font-medium transition-all shadow-sm ${
                  showOnlyNew
                    ? "bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100"
                    : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Clock className={`w-4 h-4 ${showOnlyNew ? "text-rose-500" : "text-slate-400"}`} />
                <span>Новые товары</span>
                {showOnlyNew && (
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                )}
              </button>
            </div>

            {/* Products Display (Grid vs Table) */}
            {viewMode === "grid" ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 mb-6">
                {displayProducts.length === 0 ? (
                  <div className="py-16 text-center text-slate-500">
                    {isParsing ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                        <span className="font-medium">ИИ обрабатывает данные...</span>
                      </div>
                    ) : (
                      "Товары не найдены. Попробуйте изменить параметры поиска или добавить товары вручную."
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {displayProducts.slice(0, visibleCount).map((p) => {
                      const activeReg = selectedRegion || "Душанбе";
                      const s2Price = getProductPriceForSupplierAndRegion(p, "supplier2", activeReg);
                      const s3Price = getProductPriceForSupplierAndRegion(p, "supplier3", activeReg);
                      const s4Price = getProductPriceForSupplierAndRegion(p, "supplier4", activeReg);

                      const priceVals = [
                        s2Price > 0 ? s2Price : null,
                        s3Price > 0 ? s3Price : null,
                        s4Price > 0 ? s4Price : null,
                      ].filter((v): v is number => v !== null);

                      const minPrice = priceVals.length > 0 ? Math.min(...priceVals) : null;

                      return (
                        <div
                          key={p.id}
                          onClick={() => setViewingProduct(p)}
                          className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col justify-between group cursor-pointer"
                        >
                          <div>
                            {/* Product Image Header */}
                            <div className="relative bg-slate-100/80 border-b border-slate-100 h-56 flex items-center justify-center p-3 overflow-hidden">
                              {p.imageBase64 ? (
                                <img
                                  src={p.imageBase64}
                                  alt={p.name}
                                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                                />
                              ) : (
                                <div className="flex flex-col items-center gap-2 text-slate-300">
                                  <Package className="w-12 h-12 stroke-[1.5]" />
                                  <span className="text-xs font-medium text-slate-400">Нет фото</span>
                                </div>
                              )}

                              {/* Code badge */}
                              {p.code && (
                                <span className="absolute top-3 left-3 bg-slate-900/85 text-white backdrop-blur-md text-[11px] font-mono font-bold px-2.5 py-1 rounded-md shadow-sm">
                                  #{p.code}
                                </span>
                              )}

                              {/* New product badge */}
                              {p.createdAt && Date.now() - p.createdAt < 24 * 60 * 60 * 1000 && (
                                <span className="absolute top-3 right-3 bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md shadow-sm flex items-center gap-1">
                                  НОВЫЙ
                                </span>
                              )}

                              {/* Unit Badge */}
                              <span className="absolute bottom-2.5 right-2.5 bg-white/95 text-slate-800 backdrop-blur-sm text-[11px] font-semibold px-2.5 py-0.5 rounded-md border border-slate-200 shadow-sm">
                                1 {p.unit || "шт."}
                              </span>
                            </div>

                            {/* Product Info */}
                            <div className="p-4 space-y-2">
                              <CardSpheres
                                spheres={(p.spheres && p.spheres.length > 0) ? p.spheres : (p.sphere ? [p.sphere] : [])}
                                region={selectedRegion}
                              />

                              <h3
                                className="font-bold text-slate-900 text-base leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors"
                                title={p.name}
                              >
                                {p.name}
                              </h3>

                              {p.description && (
                                <p
                                  className="text-xs text-slate-500 line-clamp-2 leading-relaxed"
                                  title={p.description}
                                >
                                  {p.description}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* 3 Suppliers Selection Block */}
                          <div className="p-3 bg-slate-50/90 border-t border-slate-100 space-y-2" onClick={(e) => e.stopPropagation()}>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
                              <span>Поставщики и цены:</span>
                              {minPrice !== null && (
                                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  Мин: {minPrice.toFixed(2)} с.
                                </span>
                              )}
                            </div>

                            {/* Supplier 1 (supplier2) */}
                            {(() => {
                              const isMin = s2Price > 0 && minPrice === s2Price;
                              return (
                                <div className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                                  isMin ? "bg-emerald-50/80 border-emerald-300 shadow-sm" : "bg-white border-slate-200 hover:border-indigo-300"
                                }`}>
                                  <div className="flex flex-col min-w-0 pr-2">
                                    <span className="text-[11px] font-semibold text-slate-600 truncate">
                                      {getSupplierLabel("supplier2")}
                                    </span>
                                    <span className={`font-mono font-extrabold text-xs ${isMin ? "text-emerald-800" : "text-slate-900"}`}>
                                      {s2Price > 0 ? `${s2Price.toFixed(2)} с.` : "—"}
                                    </span>
                                  </div>
                                  {s2Price > 0 && (
                                    <button
                                      onClick={() => handleAddToCart(p, "supplier2", s2Price)}
                                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-lg shadow-sm transition-all shrink-0"
                                      title={`Выбрать ${getSupplierLabel("supplier2")}`}
                                    >
                                      <ShoppingCart className="w-3.5 h-3.5" />
                                      <span>Выбрать</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Supplier 2 (supplier3) */}
                            {(() => {
                              const isMin = s3Price > 0 && minPrice === s3Price;
                              return (
                                <div className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                                  isMin ? "bg-emerald-50/80 border-emerald-300 shadow-sm" : "bg-white border-slate-200 hover:border-indigo-300"
                                }`}>
                                  <div className="flex flex-col min-w-0 pr-2">
                                    <span className="text-[11px] font-semibold text-slate-600 truncate">
                                      {getSupplierLabel("supplier3")}
                                    </span>
                                    <span className={`font-mono font-extrabold text-xs ${isMin ? "text-emerald-800" : "text-slate-900"}`}>
                                      {s3Price > 0 ? `${s3Price.toFixed(2)} с.` : "—"}
                                    </span>
                                  </div>
                                  {s3Price > 0 && (
                                    <button
                                      onClick={() => handleAddToCart(p, "supplier3", s3Price)}
                                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-lg shadow-sm transition-all shrink-0"
                                      title={`Выбрать ${getSupplierLabel("supplier3")}`}
                                    >
                                      <ShoppingCart className="w-3.5 h-3.5" />
                                      <span>Выбрать</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Supplier 3 (supplier4) */}
                            {(() => {
                              const isMin = s4Price > 0 && minPrice === s4Price;
                              return (
                                <div className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                                  isMin ? "bg-emerald-50/80 border-emerald-300 shadow-sm" : "bg-white border-slate-200 hover:border-indigo-300"
                                }`}>
                                  <div className="flex flex-col min-w-0 pr-2">
                                    <span className="text-[11px] font-semibold text-slate-600 truncate">
                                      {getSupplierLabel("supplier4")}
                                    </span>
                                    <span className={`font-mono font-extrabold text-xs ${isMin ? "text-emerald-800" : "text-slate-900"}`}>
                                      {s4Price > 0 ? `${s4Price.toFixed(2)} с.` : "—"}
                                    </span>
                                  </div>
                                  {s4Price > 0 && (
                                    <button
                                      onClick={() => handleAddToCart(p, "supplier4", s4Price)}
                                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-lg shadow-sm transition-all shrink-0"
                                      title={`Выбрать ${getSupplierLabel("supplier4")}`}
                                    >
                                      <ShoppingCart className="w-3.5 h-3.5" />
                                      <span>Выбрать</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Admin Actions */}
                            {isReallyAdmin && (
                              <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-200/60">
                                <button
                                  onClick={(e) => handleEditProduct(p, e)}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                  title="Редактировать товар"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => handleDeleteProduct(p.id, e)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                  title="Удалить товар"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase align-top">
                      <th className="px-4 py-2 w-24 text-left">
                        <div className="flex flex-col gap-1.5">
                          <span>ID</span>
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Код..."
                              value={searchCode}
                              onChange={(e) => setSearchCode(e.target.value)}
                              className="w-full border border-slate-300 rounded px-1.5 py-1 pl-6 text-[11px] font-normal normal-case bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      </th>
                      <th className="px-4 py-3 w-20 align-middle">Фото</th>
                      <th className="px-4 py-2">
                        <div className="flex flex-col gap-1.5">
                          <span>Название и детали</span>
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Поиск по названию..."
                              value={searchName}
                              onChange={(e) => setSearchName(e.target.value)}
                              className="w-full border border-slate-300 rounded px-2 py-1 pl-7 text-[11px] font-normal normal-case bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        </div>
                      </th>
                      <th className="px-4 py-2 w-36 text-left">
                        <div className="flex flex-col gap-1.5">
                          <span>Регион</span>
                          <select
                            value={selectedRegion}
                            onChange={(e) => setSelectedRegion(e.target.value)}
                            disabled={!!portalFacilitator}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-[11px] font-normal normal-case bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer text-slate-700 font-sans disabled:opacity-75 disabled:cursor-not-allowed"
                          >
                            <option value="">Все регионы</option>
                            {uniqueRegions.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>
                      </th>
                      <th className="px-4 py-2 w-44 text-left">
                        <div className="flex flex-col gap-1.5">
                          <span>Сфера</span>
                          <select
                            value={selectedSphere}
                            onChange={(e) => setSelectedSphere(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-[11px] font-normal normal-case bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer text-slate-700 font-sans"
                          >
                            <option value="">Все сферы</option>
                            {uniqueSpheres.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                      </th>
                      {(isAdminMode || !!portalFacilitator) && (
                        <>
                          {isReallyAdmin && hasGkPrice && (
                            <th className="px-4 py-3 align-middle w-32 text-left text-slate-700 font-bold bg-slate-50 border-r border-slate-200">
                              ГК
                            </th>
                          )}
                          <th className="px-4 py-3 align-middle w-40 text-left text-indigo-700 font-bold bg-indigo-50/40">
                            {getSupplierLabel("supplier2")}
                          </th>
                          <th className="px-4 py-3 align-middle w-40 text-left text-indigo-700 font-bold bg-indigo-50/40">
                            {getSupplierLabel("supplier3")}
                          </th>
                          <th className="px-4 py-3 align-middle w-40 text-left text-indigo-700 font-bold bg-indigo-50/40">
                            {getSupplierLabel("supplier4")}
                          </th>
                        </>
                      )}
                      {showBestPrice && (
                        <th className="px-4 py-3 align-middle w-40 text-left text-emerald-700 font-bold bg-emerald-50/40">
                          Лучшая цена
                        </th>
                      )}
                      <th className="px-4 py-3 align-middle w-24 text-center">
                        Ед. изм.
                      </th>
                      <th className="px-4 py-3 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-slate-100">
                    {displayProducts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7 + (isReallyAdmin ? (hasGkPrice ? 4 : 3) : portalFacilitator ? 3 : 0) + (showBestPrice ? 1 : 0)}
                          className="px-6 py-12 text-center text-slate-500 bg-slate-50/50"
                        >
                          {isParsing ? (
                            <div className="flex flex-col items-center gap-3">
                              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                              <span className="font-medium">
                                ИИ обрабатывает данные...
                              </span>
                            </div>
                          ) : (
                            "Товары не найдены. Загрузите изображения ниже или добавьте товары вручную."
                          )}
                        </td>
                      </tr>
                    ) : null}
                    {displayProducts.slice(0, visibleCount).map((p, i) => {
                      const statusColorClass = "bg-slate-100 text-slate-500";
                      const statusDotClass = "bg-slate-400";
                      const statusText = "Черновик";

                      const catColors = [
                        "bg-blue-50 text-blue-600",
                        "bg-amber-50 text-amber-600",
                        "bg-purple-50 text-purple-600",
                        "bg-emerald-50 text-emerald-600",
                        "bg-rose-50 text-rose-600",
                      ];
                      // Use a simple hash code of the category string to pick a color so it's consistent
                      let hash = 0;
                      const catStr = p.category || "";
                      for (let x = 0; x < catStr.length; x++)
                        hash = catStr.charCodeAt(x) + ((hash << 5) - hash);
                      const colorIndex = Math.abs(hash) % catColors.length;
                      const catColor = catColors[colorIndex];

                      const activeReg = selectedRegion || "Душанбе";
                      const s1Price = getProductPriceForSupplierAndRegion(
                        p,
                        "supplier1",
                        activeReg,
                      );
                      const s2Price = getProductPriceForSupplierAndRegion(
                        p,
                        "supplier2",
                        activeReg,
                      );
                      const s3Price = getProductPriceForSupplierAndRegion(
                        p,
                        "supplier3",
                        activeReg,
                      );
                      const s4Price = getProductPriceForSupplierAndRegion(
                        p,
                        "supplier4",
                        activeReg,
                      );

                      const priceVals = [
                        s2Price > 0 ? s2Price : null,
                        s3Price > 0 ? s3Price : null,
                        s4Price > 0 ? s4Price : null,
                      ].filter((v): v is number => v !== null);
                      const minPrice =
                        priceVals.length > 0 ? Math.min(...priceVals) : null;

                      const isS1Override = false;
                      const s1Markup = 0;
                      const isS1Auto = false;

                      const isS2Override = !!(
                        activeReg &&
                        p.prices?.supplier2?.[activeReg] !== undefined &&
                        p.prices.supplier2[activeReg] !== null &&
                        parseFloat(String(p.prices.supplier2[activeReg])) !== 0
                      );
                      const s2Markup =
                        (activeReg &&
                          globalDict.pricingRules?.supplier2?.[activeReg]) ??
                        0;
                      const isS2Auto = !isS2Override && s2Markup !== 0;

                      const isS3Override = !!(
                        activeReg &&
                        p.prices?.supplier3?.[activeReg] !== undefined &&
                        p.prices.supplier3[activeReg] !== null &&
                        parseFloat(String(p.prices.supplier3[activeReg])) !== 0
                      );
                      const s3Markup =
                        (activeReg &&
                          globalDict.pricingRules?.supplier3?.[activeReg]) ??
                        0;
                      const isS3Auto = !isS3Override && s3Markup !== 0;

                      const isS4Override = !!(
                        activeReg &&
                        p.prices?.supplier4?.[activeReg] !== undefined &&
                        p.prices.supplier4[activeReg] !== null &&
                        parseFloat(String(p.prices.supplier4[activeReg])) !== 0
                      );
                      const s4Markup =
                        (activeReg &&
                          globalDict.pricingRules?.supplier4?.[activeReg]) ??
                        0;
                      const isS4Auto = !isS4Override && s4Markup !== 0;

                      return (
                        <tr
                          key={p.id}
                          onClick={() => setViewingProduct(p)}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-4">
                            <span className="font-mono text-xs font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {p.code || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="w-14 h-14 bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200 overflow-hidden text-slate-300">
                              {p.imageBase64 ? (
                                <img
                                  src={p.imageBase64}
                                  alt={p.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Package className="w-6 h-6" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <div
                                className="font-semibold text-slate-900 line-clamp-1"
                                title={p.name}
                              >
                                {p.name}
                              </div>
                              {p.createdAt &&
                                Date.now() - p.createdAt <
                                  24 * 60 * 60 * 1000 && (
                                  <span
                                    className="flex-shrink-0 text-[10px] font-bold tracking-wider text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-0.5"
                                    title="Новый товар, загружен менее 24 часов назад"
                                  >
                                    <X className="w-3 h-3 text-rose-500" />
                                    НОВЫЙ
                                  </span>
                                )}
                            </div>
                            <div
                              className="text-xs text-slate-400 line-clamp-1 mt-0.5"
                              title={p.description}
                            >
                              {p.description}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div
                              className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded inline-block"
                              title={selectedRegion || "Все регионы"}
                            >
                              {selectedRegion || "Все регионы"}
                            </div>
                          </td>
                          <td className="px-4 py-4 max-w-[120px] truncate">
                            <div
                              className="text-xs font-medium text-slate-600 truncate"
                              title={p.spheres?.join(", ") || p.sphere}
                            >
                              {(p.spheres && p.spheres.length > 0) ? p.spheres.join(", ") : (p.sphere || "—")}
                            </div>
                          </td>
                          {(isAdminMode || !!portalFacilitator) && (
                            <>
                              {isReallyAdmin && hasGkPrice && (
                                <td className="px-4 py-4 bg-slate-50 border-r border-slate-100 font-mono font-semibold text-xs text-slate-800">
                                  {p.price !== undefined && p.price > 0 ? (
                                    <div className="flex items-center justify-start">
                                      {p.price.toFixed(2)} с.
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 italic text-[11px]">
                                      Нет цены
                                    </span>
                                  )}
                                </td>
                              )}
                              <td
                                className="px-4 py-4 bg-indigo-50/10"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {s2Price !== undefined && s2Price > 0 ? (
                                  <div className="flex items-center gap-1.5 justify-start">
                                    <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded shadow-sm flex items-center gap-1">
                                      {s2Price.toFixed(2)} с.
                                      {isS2Auto && (
                                        <span
                                          className="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-600 px-0.5 py-0 rounded font-bold"
                                          title={`Автоматическая наценка ${s2Markup >= 0 ? "+" : ""}${s2Markup}%`}
                                        >
                                          %
                                        </span>
                                      )}
                                      {isS2Override && (
                                        <span
                                          className="text-[9px] bg-emerald-50 border border-emerald-100 text-emerald-600 px-0.5 py-0 rounded font-bold"
                                          title="Индивидуальная цена региона"
                                        >
                                          ручн.
                                        </span>
                                      )}
                                    </span>
                                    {!showBestPrice && s2Price !== undefined && s2Price > 0 && (
                                      <button
                                        onClick={() =>
                                          handleAddToCart(p, "supplier2", s2Price)
                                        }
                                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded transition-colors"
                                        title={`В выборку (${getSupplierLabel("supplier2")})`}
                                      >
                                        <ShoppingCart className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 italic text-[11px]">
                                    Нет цены
                                  </span>
                                )}
                              </td>
                              <td
                                className="px-4 py-4 bg-indigo-50/10"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {s3Price !== undefined && s3Price > 0 ? (
                                  <div className="flex items-center gap-1.5 justify-start">
                                    <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded shadow-sm flex items-center gap-1">
                                      {s3Price.toFixed(2)} с.
                                      {isS3Auto && (
                                        <span
                                          className="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-600 px-0.5 py-0 rounded font-bold"
                                          title={`Автоматическая наценка ${s3Markup >= 0 ? "+" : ""}${s3Markup}%`}
                                        >
                                          %
                                        </span>
                                      )}
                                      {isS3Override && (
                                        <span
                                          className="text-[9px] bg-emerald-50 border border-emerald-100 text-emerald-600 px-0.5 py-0 rounded font-bold"
                                          title="Индивидуальная цена региона"
                                        >
                                          ручн.
                                        </span>
                                      )}
                                    </span>
                                    {!showBestPrice && s3Price !== undefined && s3Price > 0 && (
                                      <button
                                        onClick={() =>
                                          handleAddToCart(p, "supplier3", s3Price)
                                        }
                                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded transition-colors"
                                        title={`В выборку (${getSupplierLabel("supplier3")})`}
                                      >
                                        <ShoppingCart className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 italic text-[11px]">
                                    Нет цены
                                  </span>
                                )}
                              </td>
                              <td
                                className="px-4 py-4 bg-indigo-50/10"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {s4Price !== undefined && s4Price > 0 ? (
                                  <div className="flex items-center gap-1.5 justify-start">
                                    <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded shadow-sm flex items-center gap-1">
                                      {s4Price.toFixed(2)} с.
                                      {isS4Auto && (
                                        <span
                                          className="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-600 px-0.5 py-0 rounded font-bold"
                                          title={`Автоматическая наценка ${s4Markup >= 0 ? "+" : ""}${s4Markup}%`}
                                        >
                                          %
                                        </span>
                                      )}
                                      {isS4Override && (
                                        <span
                                          className="text-[9px] bg-emerald-50 border border-emerald-100 text-emerald-600 px-0.5 py-0 rounded font-bold"
                                          title="Индивидуальная цена региона"
                                        >
                                          ручн.
                                        </span>
                                      )}
                                    </span>
                                    {!showBestPrice && s4Price !== undefined && s4Price > 0 && (
                                      <button
                                        onClick={() =>
                                          handleAddToCart(p, "supplier4", s4Price)
                                        }
                                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded transition-colors"
                                        title={`В выборку (${getSupplierLabel("supplier4")})`}
                                      >
                                        <ShoppingCart className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 italic text-[11px]">
                                    Нет цены
                                  </span>
                                )}
                              </td>
                            </>
                          )}
                          {showBestPrice && (
                            <td
                              className="px-4 py-4 bg-emerald-50/10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {minPrice !== null && minPrice > 0 ? (
                                <div className="flex items-center gap-1.5 justify-start">
                                  <span className="font-mono font-bold text-sm text-emerald-800 bg-white border border-emerald-200 px-2.5 py-1 rounded shadow-sm">
                                    {minPrice.toFixed(2)} с.
                                  </span>
                                  <button
                                    onClick={() => {
                                      let sup:
                                        | "supplier2"
                                        | "supplier3"
                                        | "supplier4" = "supplier2";
                                      if (minPrice === s3Price) sup = "supplier3";
                                      if (minPrice === s4Price) sup = "supplier4";
                                      handleAddToCart(p, sup, minPrice);
                                    }}
                                    className="p-1.5 text-emerald-100 hover:text-emerald-700 hover:bg-emerald-100 rounded transition-colors text-emerald-600"
                                    title="В выборку (по лучшей цене)"
                                  >
                                    <ShoppingCart className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-300 italic text-[11px]">
                                  Нет цены
                                </span>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-4 text-center text-slate-600 text-xs font-semibold">
                            1 {p.unit || "шт."}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-0.5 justify-end">
                              {isReallyAdmin && (
                                <>
                                  <button
                                    onClick={(e) => handleEditProduct(p, e)}
                                    className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded transition-colors"
                                    title="Редактировать"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) =>
                                      handleDeleteProduct(p.id, e)
                                    }
                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                    title="Удалить"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-medium">
                <div className="flex items-center gap-4">
                  <span>Показано {Math.min(visibleCount, displayProducts.length)} из {displayProducts.length} элементов</span>
                  {visibleCount < displayProducts.length && (
                    <button
                      onClick={() => setVisibleCount(prev => prev + 50)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-xs transition-colors shadow-sm active:scale-95"
                    >
                      Показать еще (+50)
                    </button>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  {products.length > 0 && (
                    <span className="text-slate-400">
                      {visibleCount >= displayProducts.length ? "Все товары отображены" : `Осталось скрыть: ${displayProducts.length - visibleCount}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
            )}

            {/* Pagination for Grid view */}
            {viewMode === "grid" && displayProducts.length > 0 && (
              <div className="px-6 py-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between text-xs text-slate-500 font-medium mb-6">
                <div className="flex items-center gap-4">
                  <span>Показано {Math.min(visibleCount, displayProducts.length)} из {displayProducts.length} элементов</span>
                  {visibleCount < displayProducts.length && (
                    <button
                      onClick={() => setVisibleCount(prev => prev + 50)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs transition-colors shadow-sm active:scale-95"
                    >
                      Показать еще (+50)
                    </button>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  {products.length > 0 && (
                    <span className="text-slate-400">
                      {visibleCount >= displayProducts.length ? "Все товары отображены" : `Осталось: ${displayProducts.length - visibleCount}`}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Action Area (Photo Input) */}
          {isReallyAdmin && !isTabletMode && (
            <section
              onDrop={onDrop}
              onDragOver={onDragOver}
              className="h-auto min-h-32 bg-white border-t border-slate-200 p-6 flex flex-col gap-4 shrink-0 relative"
            >
              <div className="flex items-stretch gap-8 w-full h-24">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsing || isUploadBlocked}
                  className={`flex-1 h-full border-2 border-dashed ${isUploadBlocked ? "border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed" : isParsing ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-slate-50 hover:border-indigo-400"} rounded-xl flex items-center justify-center group transition-colors`}
                >
                  <div className="flex items-center gap-4 text-left">
                    <div
                      className={`p-3 bg-white rounded-full shadow-sm ${isUploadBlocked ? "text-slate-300" : isParsing ? "text-indigo-500" : "text-slate-400 group-hover:text-indigo-500"} transition-colors`}
                    >
                      {isParsing ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <Camera className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">
                        {isUploadBlocked
                          ? "Выберите сферу справа для ИИ-импорта"
                          : isParsing
                            ? "Обработка фото..."
                            : "Перетащите или вставьте фото сюда (Ctrl+V)"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {isUploadBlocked
                          ? "Загрузка фото заблокирована"
                          : "ИИ автоматически извлечет название, цену и детали"}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Spheres Multi-select for AI Uploader */}
                <button
                  type="button"
                  onClick={() => {
                    setAiSpheresSearch("");
                    setIsAiSpheresModalOpen(true);
                  }}
                  className="w-72 h-full border border-slate-200 rounded-xl p-3 bg-slate-50 hover:bg-indigo-50/40 hover:border-indigo-300 transition-all text-left flex flex-col justify-between shrink-0 cursor-pointer group"
                >
                  <div className="w-full flex justify-between items-center select-none">
                    <span className="text-xs font-bold text-slate-700">Сферы для ИИ-импорта</span>
                    <span className="text-[10px] text-indigo-600 bg-indigo-50 group-hover:bg-indigo-100 px-1.5 py-0.5 rounded-full font-bold">
                      {aiSelectedSpheres.length}
                    </span>
                  </div>
                  <div className="flex-1 w-full overflow-hidden flex flex-wrap gap-1 items-center my-1 text-slate-500">
                    {aiSelectedSpheres.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-h-[44px] overflow-hidden">
                        {aiSelectedSpheres.map((s) => (
                          <span
                            key={s}
                            className="inline-block px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-600 truncate max-w-[120px]"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-rose-500 font-medium leading-tight">Сферы не выбраны! Нажмите, чтобы настроить...</span>
                    )}
                  </div>
                  <div className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1 group-hover:text-indigo-700 select-none">
                    <span>Нажмите, чтобы настроить сферы →</span>
                  </div>
                </button>

                {/* Regions Multi-select for AI Uploader */}
                <button
                  type="button"
                  onClick={() => {
                    setAiRegionsSearch("");
                    setIsAiRegionsModalOpen(true);
                  }}
                  className="w-72 h-full border border-slate-200 rounded-xl p-3 bg-slate-50 hover:bg-indigo-50/40 hover:border-indigo-300 transition-all text-left flex flex-col justify-between shrink-0 cursor-pointer group"
                >
                  <div className="w-full flex justify-between items-center select-none">
                    <span className="text-xs font-bold text-slate-700">Регионы для ИИ-импорта</span>
                    <span className="text-[10px] text-indigo-600 bg-indigo-50 group-hover:bg-indigo-100 px-1.5 py-0.5 rounded-full font-bold">
                      {aiSelectedRegions.length}
                    </span>
                  </div>
                  <div className="flex-1 w-full overflow-hidden flex flex-wrap gap-1 items-center my-1 text-slate-500">
                    {aiSelectedRegions.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-h-[44px] overflow-hidden">
                        {aiSelectedRegions.map((r) => (
                          <span
                            key={r}
                            className="inline-block px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-600 truncate max-w-[120px]"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-amber-600 font-medium leading-tight">Регионы не выбраны (Общее по сферам)</span>
                    )}
                  </div>
                  <div className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1 group-hover:text-indigo-700 select-none">
                    <span>Нажмите, чтобы настроить регионы →</span>
                  </div>
                </button>

                <div className="w-64 h-full relative flex flex-col gap-2">
                  <select
                    value={exportScope}
                    onChange={(e) =>
                      setExportScope(
                        e.target.value as
                          | "all"
                          | "sphere"
                          | "region_sphere"
                          | "supplier_sphere"
                          | "region_supplier_sphere",
                      )
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm"
                  >
                    <option value="all">Полный дамп</option>
                    <option value="sphere" disabled={!selectedSphere}>
                      Текущая сфера
                    </option>
                    <option
                      value="region_sphere"
                      disabled={!selectedSphere || !selectedRegion}
                    >
                      Регион + Сфера текущие
                    </option>
                    <option
                      value="supplier_sphere"
                      disabled={
                        !selectedSphere ||
                        !selectedSupplier ||
                        selectedSupplier === ("supplier1" as any)
                      }
                    >
                      Поставщик + Сфера текущие
                    </option>
                    <option
                      value="region_supplier_sphere"
                      disabled={
                        !selectedSphere ||
                        !selectedRegion ||
                        !selectedSupplier ||
                        selectedSupplier === ("supplier1" as any)
                      }
                    >
                      Регион + Поставщик + Сфера текущие
                    </option>
                  </select>
                  <button
                    onClick={handleExport}
                    disabled={isExporting || products.length === 0}
                    className="w-full flex-1 flex flex-col items-center justify-center gap-1 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-70 text-white font-bold px-4 rounded-xl shadow-md shadow-green-500/20 transition-all uppercase tracking-wide text-[13px]"
                  >
                    <div className="flex items-center gap-2">
                      {isExporting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Download className="w-5 h-5" />
                      )}
                      СКАЧАТЬ EXCEL
                    </div>
                  </button>
                </div>
              </div>
            </section>
          )}
        </main>

        {/* Normalizing Overlay */}
        {isNormalizingState.active && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm text-white">
            <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mb-4" />
            <h2 className="text-xl font-bold mb-2">Нормализация названий</h2>
            <p className="text-slate-300">
              Обрабатывается искусственным интеллектом...
            </p>
            <div className="mt-6 w-64 bg-slate-800 rounded-full h-2.5 outline outline-1 outline-slate-700">
              <div
                className="bg-indigo-500 h-2.5 rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round((isNormalizingState.current / isNormalizingState.total) * 100)}%`,
                }}
              ></div>
            </div>
            <p className="mt-2 text-sm text-indigo-300 font-mono">
              {isNormalizingState.current} / {isNormalizingState.total}
            </p>
            <p className="mt-6 text-xs text-slate-500 max-w-xs text-center border border-slate-700/50 p-3 rounded-lg bg-slate-800/50">
              Пожалуйста, не закрывайте и не перезагружайте страницу до
              завершения процесса.
            </p>
          </div>
        )}

        {/* Normalize All Modal */}
        {isNormalizeConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border border-indigo-100">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-indigo-50">
                <h2 className="text-lg font-bold text-indigo-700 flex items-center gap-2">
                  <Wand2 className="w-5 h-5" />
                  Нормализовать все ({products.length})
                </h2>
                <button
                  onClick={() => setIsNormalizeConfirmOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-indigo-700 hover:bg-indigo-100 rounded-md transition-colors"
                  disabled={isNormalizingState.active}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                  Вы уверены, что хотите запустить нормализацию всех названий
                  товаров? Искусственный интеллект автоматически проанализирует
                  текущие названия каждого товара и сделает их более
                  профессиональными. <br />
                  <br />
                  <b>Внимание:</b> Эта операция займет несколько минут и
                  изменить названия навсегда.
                </p>

                <p className="text-xs font-semibold text-slate-700 mb-2">
                  Для подтверждения введите пароль:
                </p>
                <input
                  type="password"
                  value={normalizePasswordInput}
                  onChange={(e) => {
                    setNormalizePasswordInput(e.target.value);
                    setNormalizePasswordError("");
                  }}
                  placeholder="Пароль"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-center text-slate-900 shadow-sm text-sm"
                  disabled={isNormalizingState.active}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (normalizePasswordInput === "020779") {
                        confirmNormalizeAllNames();
                      } else {
                        setNormalizePasswordError("Неверный пароль!");
                      }
                    }
                  }}
                />
                {normalizePasswordError && (
                  <p className="text-xs text-rose-600 font-semibold mb-4">{normalizePasswordError}</p>
                )}

                <div className="flex justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setIsNormalizeConfirmOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                    disabled={isNormalizingState.active}
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => {
                      if (normalizePasswordInput === "020779") {
                        confirmNormalizeAllNames();
                      } else {
                        setNormalizePasswordError("Неверный пароль!");
                      }
                    }}
                    disabled={
                      isNormalizingState.active || products.length === 0 || !normalizePasswordInput
                    }
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                  >
                    Начать обработку
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Generate IDs Modal */}
        {isGenerateIdsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border border-indigo-100">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-indigo-50">
                <h2 className="text-lg font-bold text-indigo-700 flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Назначить ID товарам
                </h2>
                <button
                  onClick={() => setIsGenerateIdsModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-indigo-700 hover:bg-indigo-100 rounded-md transition-colors"
                  disabled={isExporting}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {generateIdsSuccess ? (
                <div className="p-6 flex flex-col items-center justify-center text-center gap-3">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-2">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">
                    {generateIdsSuccess}
                  </p>
                </div>
              ) : (
                <div className="p-6">
                  <p className="text-sm font-semibold text-slate-700 mb-2">
                    Это переназначит постоянные ID (0001, 0002...) всем товарам
                    в базе. Все текущие ID будут перезаписаны.
                  </p>
                  <p className="text-sm text-slate-600 mb-4">
                    Введите пароль для подтверждения:
                  </p>

                  <input
                    type="password"
                    value={deleteAllCode}
                    onChange={(e) => setDeleteAllCode(e.target.value)}
                    placeholder="Пароль"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-center tracking-widest text-slate-900 shadow-sm"
                    disabled={isExporting}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        confirmGenerateMissingCodes();
                      }
                    }}
                  />
                </div>
              )}

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                <button
                  onClick={() => setIsGenerateIdsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-md transition-colors"
                  disabled={isExporting}
                >
                  {generateIdsSuccess ? "Закрыть" : "Отмена"}
                </button>
                {!generateIdsSuccess && (
                  <button
                    onClick={confirmGenerateMissingCodes}
                    className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-md transition-colors flex items-center gap-2"
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Загрузка...
                      </>
                    ) : (
                      "Подтвердить"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Best Price Password Modal */}
        {isBestPricePasswordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border border-indigo-100">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-indigo-50">
                <h2 className="text-sm font-bold text-indigo-700 flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Активация режима "Лучшая цена"
                </h2>
                <button
                  onClick={() => setIsBestPricePasswordModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-indigo-700 hover:bg-indigo-100 rounded-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 flex flex-col gap-4">
                <p className="text-xs text-slate-600">
                  Для отображения столбца «Лучшая цена» требуется ввести секретный код:
                </p>
                <input
                  type="password"
                  value={bestPricePasswordInput}
                  onChange={(e) => {
                    setBestPricePasswordInput(e.target.value);
                    setBestPricePasswordError("");
                  }}
                  placeholder="Введите пароль..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (bestPricePasswordInput === "020779") {
                        setShowBestPrice(true);
                        setIsBestPricePasswordModalOpen(false);
                      } else {
                        setBestPricePasswordError("Неверный пароль!");
                      }
                    }
                  }}
                  autoFocus
                />
                {bestPricePasswordError && (
                  <p className="text-xs text-rose-600 font-semibold">{bestPricePasswordError}</p>
                )}
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                <button
                  onClick={() => setIsBestPricePasswordModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-md transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={() => {
                    if (bestPricePasswordInput === "020779") {
                      setShowBestPrice(true);
                      setIsBestPricePasswordModalOpen(false);
                    } else {
                      setBestPricePasswordError("Неверный пароль!");
                    }
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-md transition-colors"
                >
                  Подтвердить
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete All Modal */}
        {isDeleteAllModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border border-red-100">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-red-50">
                <h2 className="text-lg font-bold text-red-700 flex items-center gap-2">
                  <Trash2 className="w-5 h-5" />
                  Очистить базу ({products.length})
                </h2>
                <button
                  onClick={() => setIsDeleteAllModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-100 rounded-md transition-colors"
                  disabled={isExporting}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 flex flex-col gap-4">
                <p className="text-sm font-semibold text-slate-700">
                  Внимание! Вы пытаетесь УДАЛИТЬ ВСЕ ТОВАРЫ из базы данных
                  глобального каталога.
                </p>
                <p className="text-xs text-slate-500">
                  Это действие{" "}
                  <strong className="text-red-600">нельзя отменить</strong>.
                  Пожалуйста, введите секретный код для подтверждения:
                </p>
                <input
                  type="text"
                  value={deleteAllCode}
                  onChange={(e) => setDeleteAllCode(e.target.value)}
                  placeholder="Введите код..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
                  disabled={isExporting}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmDeleteAllProducts();
                  }}
                  autoFocus
                />
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                <button
                  onClick={() => setIsDeleteAllModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-md transition-colors"
                  disabled={isExporting}
                >
                  Отмена
                </button>
                <button
                  onClick={confirmDeleteAllProducts}
                  disabled={!deleteAllCode || isExporting}
                  className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed rounded-md shadow-sm shadow-red-500/30 transition-all flex items-center gap-2"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Удалить всё
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Print Options Modal */}
        {isPrintOptionsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 px-6 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Printer className="w-5 h-5 text-indigo-600" />
                  Настройки печати каталога
                </h2>
                <button
                  onClick={() => setIsPrintOptionsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto flex flex-col gap-5 text-left">
                {showFacilitatorPrintWarning && (
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs leading-relaxed flex items-start gap-2 shadow-sm">
                    <Printer className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Режим Фасилитатора:</strong> распечатывается каталог по вашему району (<strong>{facilitatorRegion || selectedRegion || "Ваш район"}</strong>).
                    </span>
                  </div>
                )}

                {/* 1. Catalog Cover / Scope Choice */}
                {!portalFacilitator && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      1. Вариант обложки и объем каталога:
                    </label>
                    <div className="grid grid-cols-1 gap-2.5">
                      <label
                        onClick={() => setPrintCatalogType("full")}
                        className={`flex items-start gap-3 p-3.5 border rounded-xl cursor-pointer transition-all ${
                          printCatalogType === "full"
                            ? "border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-500/20"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="printCatalogType"
                          checked={printCatalogType === "full"}
                          onChange={() => setPrintCatalogType("full")}
                          className="mt-1 w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                            ПОЛНЫЙ КАТАЛОГ ТОВАРОВ
                            <span className="bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                              Все 3 поставщика
                            </span>
                          </span>
                          <span className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                            Печать всего ассортимента. На обложке выводится заголовок <strong>«ПОЛНЫЙ КАТАЛОГ ТОВАРОВ»</strong> и подпись <em>«В каталоге представлены цены всех трех поставщиков»</em>.
                          </span>
                        </div>
                      </label>

                      <label
                        onClick={() => setPrintCatalogType("filtered")}
                        className={`flex items-start gap-3 p-3.5 border rounded-xl cursor-pointer transition-all ${
                          printCatalogType === "filtered"
                            ? "border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-500/20"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="printCatalogType"
                          checked={printCatalogType === "filtered"}
                          onChange={() => setPrintCatalogType("filtered")}
                          className="mt-1 w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900">
                            ВЫБОРОЧНЫЙ КАТАЛОГ (По фильтрам)
                          </span>
                          <span className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                            Настройка под регион, поставщика или сферу. На обложке выводится, например: <strong>«КАТАЛОГ ДУШАНБЕ • ПОСТАВЩИК 1»</strong>.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                {/* 2. Filter Parameters */}
                <div className={`space-y-3 p-3.5 rounded-xl border transition-all ${
                  printCatalogType === "filtered" ? "bg-slate-50/80 border-slate-200" : "bg-slate-50/40 border-slate-100 opacity-85"
                }`}>
                  <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                    2. Фильтры и поставщики:
                  </span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Region Select */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Регион:
                      </label>
                      <select
                        value={printSelectedRegion}
                        disabled={!!portalFacilitator}
                        onChange={(e) => {
                          setPrintSelectedRegion(e.target.value);
                          if (printCatalogType === "full") setPrintCatalogType("filtered");
                        }}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-slate-100"
                      >
                        <option value="">Все регионы</option>
                        {(globalDict.regions || Object.keys(DISTRICTS_BY_REGION)).map((r: string) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Supplier Select */}
                    {!portalFacilitator && (
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Поставщик:
                        </label>
                        <select
                          value={printSelectedSupplier || ""}
                          onChange={(e) => {
                            const val = e.target.value as "supplier2" | "supplier3" | "supplier4" | "";
                            setPrintSelectedSupplier(val ? val : null);
                            if (printCatalogType === "full") setPrintCatalogType("filtered");
                          }}
                          className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        >
                          <option value="">Все поставщики</option>
                          <option value="supplier2">{globalDict.suppliers?.[0] || "Поставщик 1"}</option>
                          <option value="supplier3">{globalDict.suppliers?.[1] || "Поставщик 2"}</option>
                          <option value="supplier4">{globalDict.suppliers?.[2] || "Поставщик 3"}</option>
                        </select>
                      </div>
                    )}

                    {/* Sphere Select */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Сфера применения (Категория):
                      </label>
                      <select
                        value={printSelectedSphere}
                        onChange={(e) => {
                          setPrintSelectedSphere(e.target.value);
                          if (printCatalogType === "full") setPrintCatalogType("filtered");
                        }}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      >
                        <option value="">Все сферы (Все товары)</option>
                        {(globalDict.spheres || []).map((s: string) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 3. Pricing Display Mode */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    3. Формат отображения цен:
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <label className={`flex items-center gap-2.5 p-3 border rounded-xl cursor-pointer transition-colors ${
                      catalogPrintMode === "all" ? "border-indigo-600 bg-indigo-50/50" : "border-slate-200 hover:bg-slate-50"
                    }`}>
                      <input
                        type="radio"
                        name="printMode"
                        checked={catalogPrintMode === "all"}
                        onChange={() => setCatalogPrintMode("all")}
                        className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-semibold text-slate-800">
                        Все 3 поставщика
                      </span>
                    </label>
                    <label className={`flex items-center gap-2.5 p-3 border rounded-xl cursor-pointer transition-colors ${
                      catalogPrintMode === "lowest" ? "border-indigo-600 bg-indigo-50/50" : "border-slate-200 hover:bg-slate-50"
                    }`}>
                      <input
                        type="radio"
                        name="printMode"
                        checked={catalogPrintMode === "lowest"}
                        onChange={() => setCatalogPrintMode("lowest")}
                        className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-semibold text-slate-800">
                        Только мин. цена
                      </span>
                    </label>
                  </div>
                </div>

                {/* Live Cover Preview Box */}
                {(() => {
                  const getSupName = (supKey: string) => {
                    if (supKey === "supplier2") return globalDict.suppliers?.[0] || "Поставщик 1";
                    if (supKey === "supplier3") return globalDict.suppliers?.[1] || "Поставщик 2";
                    if (supKey === "supplier4") return globalDict.suppliers?.[2] || "Поставщик 3";
                    return "Поставщик";
                  };

                  let pTitle = "ПОЛНЫЙ КАТАЛОГ ТОВАРОВ";
                  let pSub = "В каталоге представлены цены всех трех поставщиков";
                  let pStamp = `ВСЕ РЕГИОНЫ • ВСЕ ПОСТАВЩИКИ (${getSupName("supplier2")} • ${getSupName("supplier3")} • ${getSupName("supplier4")})`;

                  if (portalFacilitator) {
                    pTitle = "КАТАЛОГ ТОВАРОВ";
                    pSub = "B2B СИСТЕМА ДИСТРИБЬЮЦИИ";
                    pStamp = printSelectedRegion ? printSelectedRegion.toUpperCase() : "РЕГИОНАЛЬНЫЙ КАТАЛОГ";
                  } else if (printCatalogType === "full") {
                    pTitle = "ПОЛНЫЙ КАТАЛОГ ТОВАРОВ";
                    pSub = "В каталоге представлены цены всех трех поставщиков";
                    pStamp = `ВСЕ РЕГИОНЫ • ВСЕ ПОСТАВЩИКИ (${getSupName("supplier2")} • ${getSupName("supplier3")} • ${getSupName("supplier4")})`;
                  } else {
                    const rText = printSelectedRegion ? printSelectedRegion.toUpperCase() : "";
                    const sText = printSelectedSupplier ? getSupName(printSelectedSupplier).toUpperCase() : "";

                    if (printSelectedRegion && printSelectedSupplier) {
                      pTitle = `КАТАЛОГ ${rText}`;
                      pSub = `ПОСТАВЩИК: ${sText}`;
                      pStamp = `КАТАЛОГ: ${rText} • ${sText}`;
                    } else if (printSelectedRegion) {
                      pTitle = `КАТАЛОГ ${rText}`;
                      pSub = "В каталоге представлены цены всех трех поставщиков";
                      pStamp = `РЕГИОН: ${rText} • ВСЕ ПОСТАВЩИКИ`;
                    } else if (printSelectedSupplier) {
                      pTitle = `КАТАЛОГ: ${sText}`;
                      pSub = "B2B СИСТЕМА ДИСТРИБЬЮЦИИ";
                      pStamp = `ПОСТАВЩИК: ${sText} • ВСЕ РЕГИОНЫ`;
                    } else {
                      pTitle = "КАТАЛОГ ТОВАРОВ";
                      pSub = "B2B СИСТЕМА ДИСТРИБЬЮЦИИ";
                      pStamp = "ВСЕ РЕГИОНЫ • ВСЕ ПОСТАВЩИКИ";
                    }
                  }

                  if (printSelectedSphere && printCatalogType === "filtered") {
                    pStamp += ` • СФЕРА: ${printSelectedSphere.toUpperCase()}`;
                  }

                  return (
                    <div className="bg-slate-900 text-white rounded-xl p-4 border border-slate-800 shadow-inner space-y-1.5 text-center">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-widest flex items-center justify-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                        Предпросмотр надписи на обложке
                      </div>
                      <div className="text-base sm:text-lg font-black tracking-wide text-white uppercase mt-1">
                        {pTitle}
                      </div>
                      <div className="text-xs text-indigo-200 font-medium italic">
                        {pSub}
                      </div>
                      <div className="text-[10px] text-slate-300 font-mono uppercase tracking-wider bg-slate-800/80 px-2.5 py-1 rounded mt-2 border border-slate-700/60 inline-block">
                        {pStamp}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Modal Footer */}
              <div className="p-4 px-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                <button
                  onClick={() => setIsPrintOptionsOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleConfirmPrint}
                  className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md shadow-indigo-500/20 transition-all flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Распечатать
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Image Search Modal */}
        {isImageSearchModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col h-[80vh]">
              <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Search className="w-5 h-5 text-indigo-500" />
                  Выберите фото для: {manualForm.name}
                </h2>
                <button
                  onClick={() => setIsImageSearchModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search query input inside modal */}
              <div className="p-3 bg-white border-b border-slate-200 flex gap-2">
                <input
                  type="text"
                  value={imageSearchQuery}
                  onChange={(e) => setImageSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      executeImageSearch(imageSearchQuery);
                    }
                  }}
                  placeholder="Введите запрос для поиска фото..."
                  className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={() => executeImageSearch(imageSearchQuery)}
                  disabled={isSearchingImages || !imageSearchQuery.trim()}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium text-sm rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                >
                  {isSearchingImages ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  Найти
                </button>
              </div>

              <div className="p-4 overflow-y-auto flex-1 bg-slate-50">
                {isSearchingImages ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-2" />
                    <p>Поиск изображений в сети...</p>
                  </div>
                ) : imageSearchResults.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {imageSearchResults.map((img, i) => (
                      <div
                        key={i}
                        onClick={() => handleSelectImageResult(img.url)}
                        className="cursor-pointer group relative aspect-square bg-white border border-slate-200 rounded-lg overflow-hidden hover:border-indigo-500 hover:shadow-md transition-all"
                      >
                        <img
                          src={img.url}
                          alt={img.title || "Search Result"}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            // If direct url breaks, hide broken thumbnail
                            (e.currentTarget.parentElement as HTMLElement).style.display = "none";
                          }}
                        />
                        <div className="absolute inset-0 bg-indigo-500/0 group-hover:bg-indigo-500/20 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 bg-indigo-600 text-white text-xs font-semibold px-2 py-1 rounded shadow-sm transition-opacity">
                            Выбрать
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
                    <p>Изображения не найдены</p>
                    <p className="text-xs text-slate-400">Попробуйте изменить поисковый запрос выше</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Manual Entry Modal */}
        {isManualModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-800">
                  {editingProductId
                    ? "Редактировать товар"
                    : "Добавить товар вручную"}
                </h2>
                <button
                  onClick={() => setIsManualModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={handleManualSubmit}
                className="flex flex-col p-6 gap-4 overflow-y-auto max-h-[85vh]"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-slate-700">
                      Сфера *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomSphere(!isCustomSphere)}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      {isCustomSphere ? "Выбрать из списка" : "+ Добавить"}
                    </button>
                  </div>
                  {isCustomSphere ? (
                    <input
                      type="text"
                      value={manualForm.spheres.join(", ")}
                      onChange={(e) =>
                        setManualForm((prev) => ({
                          ...prev,
                          spheres: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
                        }))
                      }
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                      placeholder="Введите сферы через запятую..."
                    />
                  ) : (
                    <div className="flex flex-col gap-2 max-h-40 overflow-y-auto border border-slate-300 rounded-md p-2 bg-white shadow-sm">
                      {uniqueSpheres.map((s) => (
                        <label key={s} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={manualForm.spheres.includes(s)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setManualForm((prev) => {
                                const newSpheres = checked
                                  ? [...prev.spheres, s]
                                  : prev.spheres.filter((sphere) => sphere !== s);
                                return { ...prev, spheres: newSpheres };
                              });
                            }}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                          />
                          {s}
                        </label>
                      ))}
                      {uniqueSpheres.length === 0 && (
                        <span className="text-slate-400 p-2 text-xs text-center">Нет доступных сфер</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-slate-700">
                      Название *
                    </label>
                    <button
                      type="button"
                      onClick={handleSearchImagesClick}
                      className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium bg-indigo-50 px-2 py-1 rounded-md transition-colors"
                    >
                      <Search className="w-3.5 h-3.5" />
                      Найти фото в сети
                    </button>
                  </div>
                  <input
                    type="text"
                    value={manualForm.name}
                    onChange={(e) =>
                      setManualForm((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Например, Стол из нержавеющей стали"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">
                    Описание
                  </label>
                  <textarea
                    value={manualForm.description}
                    onChange={(e) =>
                      setManualForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-24"
                    placeholder="Краткое описание товара..."
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">
                    Базовая цена товара (Главный каталог) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={manualForm.price}
                      onChange={(e) =>
                        setManualForm((prev) => ({
                          ...prev,
                          price: e.target.value,
                        }))
                      }
                      className="w-full border border-slate-300 rounded-md pl-3 pr-12 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-semibold"
                      placeholder="0.00"
                      required
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">
                      с.
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 mt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Цены по поставщикам и регионам:
                    </span>
                    <div className="flex gap-1.5 p-0.5 bg-slate-200/60 rounded-lg">
                      {(["supplier2", "supplier3", "supplier4"] as const).map(
                        (sup) => {
                          const label = getSupplierFormTabName(sup);
                          return (
                            <button
                              key={sup}
                              type="button"
                              onClick={() => setFormSelectedSupplier(sup)}
                              className={`text-[10px] px-2 py-1 rounded-md font-bold transition-all ${formSelectedSupplier === sup ? "bg-white shadow-xs text-indigo-700" : "text-slate-500 hover:text-slate-800"}`}
                            >
                              {label}
                            </button>
                          );
                        },
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 mt-1">
                    {globalDict.regions.map((reg) => {
                      const currentOverride =
                        manualForm.prices[formSelectedSupplier]?.[reg] ?? "";

                      // Live auto price calculation based on the current base price input
                      const basePriceVal = parseFloat(manualForm.price) || 0;
                      const regionMarkup =
                        globalDict.pricingRules?.[formSelectedSupplier]?.[
                          reg
                        ] ?? 0;
                      const autoPrice = basePriceVal * (1 + regionMarkup / 105); // calculate nicely

                      return (
                        <div
                          key={reg}
                          className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-100 gap-4"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-semibold text-slate-700 truncate">
                              {reg}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium font-mono leading-none mt-0.5">
                              Авто:{" "}
                              {basePriceVal > 0
                                ? `${(basePriceVal * (1 + regionMarkup / 100)).toFixed(2)} с. `
                                : "—"}
                              {regionMarkup !== 0
                                ? `(${regionMarkup >= 0 ? "+" : ""}${regionMarkup}%)`
                                : ""}
                            </span>
                          </div>
                          <div className="relative shrink-0 w-28">
                            <input
                              type="number"
                              step="0.01;any"
                              min="0"
                              value={currentOverride}
                              onChange={(e) => {
                                const val = e.target.value;
                                setManualForm((prev) => {
                                  const nextPrices = { ...prev.prices };
                                  if (!nextPrices[formSelectedSupplier]) {
                                    nextPrices[formSelectedSupplier] = {};
                                  }
                                  nextPrices[formSelectedSupplier][reg] = val;
                                  return { ...prev, prices: nextPrices };
                                });
                              }}
                              className="w-full border border-slate-300 rounded-md pl-2 pr-6 py-1 text-xs text-right font-mono font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              placeholder="Авто"
                            />
                            <span className="absolute right-1.5 top-1 px-0.5 text-[10px] text-slate-400 font-bold select-none">
                              с.
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-slate-700">
                      Ед. измерения *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomUnit(!isCustomUnit)}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      {isCustomUnit ? "Выбрать из списка" : "+ Своя"}
                    </button>
                  </div>
                  {isCustomUnit ? (
                    <input
                      type="text"
                      value={manualForm.unit}
                      onChange={(e) =>
                        setManualForm((prev) => ({
                          ...prev,
                          unit: e.target.value,
                        }))
                      }
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                      placeholder="Например: литр, метр, мм..."
                    />
                  ) : (
                    <select
                      value={manualForm.unit}
                      onChange={(e) =>
                        setManualForm((prev) => ({
                          ...prev,
                          unit: e.target.value,
                        }))
                      }
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    >
                      <option value="шт.">шт. (Штука)</option>
                      <option value="кг">кг (Килограмм)</option>
                      <option value="г">г (Грамм)</option>
                      <option value="т">т (Тонна)</option>
                      <option value="метр">метр (Метр)</option>
                      <option value="мм">мм (Миллиметр)</option>
                      <option value="см">см (Сантиметр)</option>
                      <option value="литр">литр (Литр)</option>
                      <option value="мл">мл (Миллиметр)</option>
                      <option value="упак.">упак. (Упаковка)</option>
                      <option value="короб.">короб. (Коробка)</option>
                      <option value="компл.">компл. (Комплект)</option>
                    </select>
                  )}
                </div>

                <div className="flex gap-4">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-sm font-semibold text-slate-700">
                      Фото
                    </label>
                    <label className="w-full h-24 border-2 border-dashed border-slate-300 rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-slate-50 transition-colors">
                      {manualForm.imageBase64 ? (
                        <img
                          src={manualForm.imageBase64}
                          alt="Preview"
                          className="h-full object-contain p-1"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-slate-400">
                          <Camera className="w-6 h-6" />
                          <span className="text-xs">
                            Загрузить фото (из файла или Ctrl+V)
                          </span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleManualImageUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-4 flex gap-3 justify-end pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsManualModalOpen(false)}
                    className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors text-sm"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingManual}
                    className="px-4 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed rounded-md transition-colors shadow-sm text-sm flex items-center gap-1.5"
                  >
                    {isSavingManual && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    {isSavingManual ? "Сохранение..." : "Сохранить"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h3 className="font-bold text-lg text-slate-800">
                  Удаление товара
                </h3>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                <p className="text-slate-600 text-sm">
                  Вы уверены, что хотите удалить этот товар из каталога? Это
                  действие нельзя отменить.
                </p>
              </div>

              <div className="p-5 border-t border-slate-100 flex gap-3 justify-end bg-slate-50">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-md transition-colors text-sm"
                >
                  Отмена
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors shadow-sm text-sm flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Удалить
                </button>
              </div>
            </div>
          </div>
        )}
        {/* View Product Modal */}
        {viewingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-800">
                  Информация о товаре
                </h2>
                <button
                  onClick={() => setViewingProduct(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col md:flex-row p-6 gap-6 overflow-y-auto">
                <div className="w-full md:w-1/2 flex flex-col gap-4">
                  <div className="w-full aspect-square bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200 overflow-hidden text-slate-300">
                    {viewingProduct.imageBase64 ? (
                      <img
                        src={viewingProduct.imageBase64}
                        alt={viewingProduct.name}
                        className="w-full h-full object-contain bg-slate-50"
                      />
                    ) : (
                      <Package className="w-16 h-16" />
                    )}
                  </div>
                </div>
                <div className="w-full md:w-1/2 flex flex-col gap-4">
                  <div>
                    {viewingProduct.code && (
                      <span className="font-mono text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 inline-block mb-1">
                        ID: {viewingProduct.code}
                      </span>
                    )}
                    <h3 className="text-xl font-bold text-slate-900">
                      {viewingProduct.name || "Без названия"}
                    </h3>
                  </div>

                  <div className="flex flex-col gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Цены по поставщикам ({selectedRegion || "Все регионы"}):
                      </span>
                      {viewingProduct.price !== undefined &&
                        viewingProduct.price > 0 && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            Базовая: {viewingProduct.price.toFixed(2)} с.
                          </span>
                        )}
                    </div>
                    <div className="flex flex-col gap-1.5 mt-1 font-mono">
                      <div className="flex justify-between items-center text-sm py-1 border-b border-slate-100 last:border-0">
                        <span className="text-slate-600">
                          {getSupplierLabel("supplier2")}:
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-950">
                            {(() => {
                              const activeReg = selectedRegion || "Душанбе";
                              const val = getProductPriceForSupplierAndRegion(
                                viewingProduct,
                                "supplier2",
                                activeReg,
                              );
                              return val > 0 ? `${val.toFixed(2)} с.` : "—";
                            })()}
                          </span>
                          {(() => {
                            const activeReg = selectedRegion || "Душанбе";
                            const val = getProductPriceForSupplierAndRegion(
                              viewingProduct,
                              "supplier2",
                              activeReg,
                            );
                            if (val > 0) {
                              const qty = cart.find(
                                (item) =>
                                  item.product.id === viewingProduct.id &&
                                  item.selectedSupplier === "supplier2"
                              )?.quantity || 0;

                              return (
                                <div className="flex items-center gap-1">
                                  {qty > 0 && (
                                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full shrink-0">
                                      {qty} {viewingProduct.unit || "шт"}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => {
                                      handleAddToCart(viewingProduct, "supplier2", val);
                                    }}
                                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded transition-colors"
                                    title={`Добавить в выборку (${getSupplierLabel("supplier2")})`}
                                  >
                                    <ShoppingCart className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-sm py-1 border-b border-slate-100 last:border-0">
                        <span className="text-slate-600">
                          {getSupplierLabel("supplier3")}:
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-950">
                            {(() => {
                              const activeReg = selectedRegion || "Душанбе";
                              const val = getProductPriceForSupplierAndRegion(
                                viewingProduct,
                                "supplier3",
                                activeReg,
                              );
                              return val > 0 ? `${val.toFixed(2)} с.` : "—";
                            })()}
                          </span>
                          {(() => {
                            const activeReg = selectedRegion || "Душанбе";
                            const val = getProductPriceForSupplierAndRegion(
                              viewingProduct,
                              "supplier3",
                              activeReg,
                            );
                            if (val > 0) {
                              const qty = cart.find(
                                (item) =>
                                  item.product.id === viewingProduct.id &&
                                  item.selectedSupplier === "supplier3"
                              )?.quantity || 0;

                              return (
                                <div className="flex items-center gap-1">
                                  {qty > 0 && (
                                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full shrink-0">
                                      {qty} {viewingProduct.unit || "шт"}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => {
                                      handleAddToCart(viewingProduct, "supplier3", val);
                                    }}
                                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded transition-colors"
                                    title={`Добавить в выборку (${getSupplierLabel("supplier3")})`}
                                  >
                                    <ShoppingCart className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-sm py-1 border-b border-slate-100 last:border-0">
                        <span className="text-slate-600">
                          {getSupplierLabel("supplier4")}:
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-950">
                            {(() => {
                              const activeReg = selectedRegion || "Душанбе";
                              const val = getProductPriceForSupplierAndRegion(
                                viewingProduct,
                                "supplier4",
                                activeReg,
                              );
                              return val > 0 ? `${val.toFixed(2)} с.` : "—";
                            })()}
                          </span>
                          {(() => {
                            const activeReg = selectedRegion || "Душанбе";
                            const val = getProductPriceForSupplierAndRegion(
                              viewingProduct,
                              "supplier4",
                              activeReg,
                            );
                            if (val > 0) {
                              const qty = cart.find(
                                (item) =>
                                  item.product.id === viewingProduct.id &&
                                  item.selectedSupplier === "supplier4"
                              )?.quantity || 0;

                              return (
                                <div className="flex items-center gap-1">
                                  {qty > 0 && (
                                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full shrink-0">
                                      {qty} {viewingProduct.unit || "шт"}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => {
                                      handleAddToCart(viewingProduct, "supplier4", val);
                                    }}
                                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded transition-colors"
                                    title={`Добавить в выборку (${getSupplierLabel("supplier4")})`}
                                  >
                                    <ShoppingCart className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {viewingProduct.description && (
                    <div className="mt-2">
                      <h4 className="text-sm font-semibold text-slate-700 mb-1">
                        Описание
                      </h4>
                      <div className="text-sm text-slate-600 space-y-1">
                        {viewingProduct.description
                          .split(/(?:;|\n)+/)
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .map((spec, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <span className="text-indigo-400 mt-0.5">•</span>
                              <span>{spec}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 mt-2">
                    {(() => {
                      const prodSpheres = viewingProduct.spheres && viewingProduct.spheres.length > 0
                        ? viewingProduct.spheres
                        : (viewingProduct.sphere ? [viewingProduct.sphere] : []);
                      if (prodSpheres.length === 0) return null;
                      return (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs text-slate-500">Сферы применения</span>
                          <div className="flex flex-wrap gap-1.5">
                            {prodSpheres.map((s, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
              {isReallyAdmin && (
                <div className="p-4 border-t border-slate-100 flex gap-3 justify-end bg-slate-50">
                  <button
                    onClick={(e) => {
                      handleEditProduct(viewingProduct, e);
                      setViewingProduct(null);
                    }}
                    className="px-4 py-2 font-medium text-indigo-700 hover:bg-indigo-100 bg-indigo-50 rounded-md transition-colors text-sm flex items-center gap-2"
                  >
                    <Pencil className="w-4 h-4" />
                    Редактировать
                  </button>
                  <button
                    onClick={(e) => {
                      handleDeleteProduct(viewingProduct.id, e);
                      setViewingProduct(null);
                    }}
                    className="px-4 py-2 font-medium text-red-700 hover:bg-red-100 bg-red-50 rounded-md transition-colors text-sm flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Удалить
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Print Warning Modal */}
        {showPrintWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h3 className="font-bold text-lg text-slate-800">
                  Режим предпросмотра
                </h3>
                <button
                  onClick={() => setShowPrintWarning(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                <p className="text-slate-600 text-sm leading-relaxed">
                  Похоже, вы находитесь в режиме предпросмотра (окно внутри
                  платформы предпросмотра). В этом встроенном режиме браузер
                  может блокировать печать документа.
                  <br />
                  <br />
                  Для удобной печати{" "}
                  {printWarningType === "cart" ? "корзины" : "каталога"} мы
                  рекомендуем{" "}
                  <strong>открыть приложение в новой отдельной вкладке</strong>,
                  нажав на кнопку ниже, после чего снова нажать «Распечатать».
                </p>
              </div>

              <div className="p-5 border-t border-slate-100 flex gap-3 justify-end bg-slate-50">
                <button
                  onClick={() => {
                    setShowPrintWarning(false);
                    if (printWarningType === "cart") {
                      setIsCartPrinting(true);
                    }
                    setTimeout(() => {
                      window.print();
                      if (printWarningType === "cart") {
                        setTimeout(() => setIsCartPrinting(false), 2000);
                      }
                    }, 150);
                  }}
                  className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-md transition-colors text-sm"
                >
                  Попробовать напечатать здесь
                </button>
                <button
                  onClick={() => {
                    setShowPrintWarning(false);
                    const url = new URL(window.location.href);
                    url.searchParams.set(
                      "print",
                      printWarningType || "catalog",
                    );
                    if (printWarningType === "cart" && cart.length > 0) {
                      const cartDataStr = cart
                        .map((item) => `${item.product.id}:${item.quantity}`)
                        .join(",");
                      url.searchParams.set("cartData", cartDataStr);
                    }
                    window.open(url.toString(), "_blank");
                  }}
                  className="px-4 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors shadow-sm text-sm"
                >
                  Открыть в новой вкладке ↗
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <DictionaryModal
        isOpen={isDictModalOpen}
        onClose={() => setIsDictModalOpen(false)}
        data={globalDict}
        onSave={handleSaveDictionaries}
      />

      <CartModal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        updateQuantity={handleUpdateCartQuantity}
        onPrint={handleCartPrint}
        suppliers={globalDict.suppliers || []}
        products={products}
        onAddToCart={handleAddToCart}
        selectedRegion={selectedRegion}
        getProductPrice={getProductPriceForSupplierAndRegion}
        onUpdateSupplier={handleUpdateCartSupplier}
        regions={uniqueRegions}
        onRegionChange={setSelectedRegion}
        logisticsCost={
          selectedRegion ? (globalDict.logisticsCosts?.[selectedRegion] || 0) : 0
        }
        showBestPrice={showBestPrice}
        supplierPhones={globalDict.supplierPhones}
        supplierLegalNames={globalDict.supplierLegalNames}
        selectedSphere={selectedSphere}
        onClearCart={handleClearCart}
      />

      {!isCartPrinting && (
        <PrintCatalogView
          printMode={catalogPrintMode}
          suppliers={globalDict.suppliers}
          selectedRegion={printCatalogType === "full" ? "" : printSelectedRegion}
          selectedSupplier={printCatalogType === "full" ? null : printSelectedSupplier}
          catalogType={printCatalogType}
          selectedSphere={printCatalogType === "full" ? "" : printSelectedSphere}
          isFacilitator={!!portalFacilitator}
          products={(() => {
            let filtered = products;

            // Filter by sphere if in filtered catalog mode and sphere chosen
            const sphereToUse = printCatalogType === "filtered" ? printSelectedSphere : "";
            if (sphereToUse) {
              filtered = filtered.filter((p) => {
                const prodSpheres = p.spheres && p.spheres.length > 0 ? p.spheres : (p.sphere ? [p.sphere] : []);
                return prodSpheres.some(s => s === sphereToUse || s.includes(sphereToUse) || sphereToUse.includes(s));
              });
            }

            const productRegion = (printCatalogType === "filtered" ? printSelectedRegion : "") || selectedRegion || "Душанбе";

            return filtered.map((p) => {
              return {
                ...p,
                priceSupplier1: getProductPriceForSupplierAndRegion(
                  p,
                  "supplier1",
                  productRegion,
                ),
                priceSupplier2: getProductPriceForSupplierAndRegion(
                  p,
                  "supplier2",
                  productRegion,
                ),
                priceSupplier3: getProductPriceForSupplierAndRegion(
                  p,
                  "supplier3",
                  productRegion,
                ),
                priceSupplier4: getProductPriceForSupplierAndRegion(
                  p,
                  "supplier4",
                  productRegion,
                ),
              };
            });
          })()}
        />
      )}

      {isAiSpheresModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  Выбор сфер для ИИ-импорта
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Товары, распознанные ИИ, будут прикреплены к выбранным здесь сферам применения.
                </p>
              </div>
              <button
                onClick={() => setIsAiSpheresModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Controls (Search and Select all/none) */}
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Поиск сфер..."
                  value={aiSpheresSearch}
                  onChange={(e) => setAiSpheresSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {aiSpheresSearch && (
                  <button
                    onClick={() => setAiSpheresSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    Очистить
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const filtered = uniqueSpheres.filter((s) =>
                      s.toLowerCase().includes(aiSpheresSearch.toLowerCase())
                    );
                    setAiSelectedSpheres((prev) => {
                      const next = [...prev];
                      filtered.forEach((s) => {
                        if (!next.includes(s)) next.push(s);
                      });
                      return next;
                    });
                  }}
                  className="px-3 py-1.5 font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md transition-colors border border-indigo-100"
                >
                  Выбрать все
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const filtered = uniqueSpheres.filter((s) =>
                      s.toLowerCase().includes(aiSpheresSearch.toLowerCase())
                    );
                    setAiSelectedSpheres((prev) =>
                      prev.filter((s) => !filtered.includes(s))
                    );
                  }}
                  className="px-3 py-1.5 font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-md transition-colors border border-slate-200"
                >
                  Сбросить выбор
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-6">
              {(() => {
                const filtered = uniqueSpheres.filter((s) =>
                  s.toLowerCase().includes(aiSpheresSearch.toLowerCase())
                );
                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 text-slate-400 text-sm">
                      Сферы по запросу "{aiSpheresSearch}" не найдены
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {filtered.map((s) => {
                      const isChecked = aiSelectedSpheres.includes(s);
                      return (
                        <label
                          key={s}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-sm transition-all cursor-pointer select-none ${
                            isChecked
                              ? "bg-indigo-50/50 border-indigo-300 text-indigo-900 font-medium"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAiSelectedSpheres((prev) => [...prev, s]);
                              } else {
                                setAiSelectedSpheres((prev) =>
                                  prev.filter((item) => item !== s)
                                );
                              }
                            }}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer shrink-0"
                          />
                          <span className="truncate" title={s}>
                            {s}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="text-xs text-slate-500 font-medium">
                Выбрано сфер для импорта: <strong className="text-indigo-600 font-bold">{aiSelectedSpheres.length}</strong>
              </span>
              <button
                onClick={() => setIsAiSpheresModalOpen(false)}
                className="px-5 py-2 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm text-sm"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {isAiRegionsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  Выбор регионов для ИИ-импорта
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Товары, распознанные ИИ, получат указанные цены в выбранных здесь регионах. Если регион не выбран, товар внесется глобально по сферам.
                </p>
              </div>
              <button
                onClick={() => setIsAiRegionsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Controls (Search and Select all/none) */}
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Поиск регионов..."
                  value={aiRegionsSearch}
                  onChange={(e) => setAiRegionsSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {aiRegionsSearch && (
                  <button
                    onClick={() => setAiRegionsSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    Очистить
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const filtered = uniqueRegions.filter((r) =>
                      r.toLowerCase().includes(aiRegionsSearch.toLowerCase())
                    );
                    setAiSelectedRegions((prev) => {
                      const next = [...prev];
                      filtered.forEach((r) => {
                        if (!next.includes(r)) next.push(r);
                      });
                      return next;
                    });
                  }}
                  className="px-3 py-1.5 font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md transition-colors border border-indigo-100"
                >
                  Выбрать все
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const filtered = uniqueRegions.filter((r) =>
                      r.toLowerCase().includes(aiRegionsSearch.toLowerCase())
                    );
                    setAiSelectedRegions((prev) =>
                      prev.filter((r) => !filtered.includes(r))
                    );
                  }}
                  className="px-3 py-1.5 font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-md transition-colors border border-slate-200"
                >
                  Сбросить выбор
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-6">
              {(() => {
                const filtered = uniqueRegions.filter((r) =>
                  r.toLowerCase().includes(aiRegionsSearch.toLowerCase())
                );
                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 text-slate-400 text-sm">
                      Регионы по запросу "{aiRegionsSearch}" не найдены
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {filtered.map((r) => {
                      const isChecked = aiSelectedRegions.includes(r);
                      return (
                        <label
                          key={r}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-sm transition-all cursor-pointer select-none ${
                            isChecked
                              ? "bg-indigo-50/50 border-indigo-300 text-indigo-900 font-medium"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAiSelectedRegions((prev) => [...prev, r]);
                              } else {
                                setAiSelectedRegions((prev) =>
                                  prev.filter((item) => item !== r)
                                );
                              }
                            }}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer shrink-0"
                          />
                          <span className="truncate" title={r}>
                            {r}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="text-xs text-slate-500 font-medium">
                Выбрано регионов для импорта: <strong className="text-indigo-600 font-bold">{aiSelectedRegions.length}</strong>
              </span>
              <button
                onClick={() => setIsAiRegionsModalOpen(false)}
                className="px-5 py-2 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm text-sm"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {isCartPrinting && (
        <PrintCartView
          ref={pdfRef}
          cart={cart}
          isPrinting={isCartPrinting}
          suppliers={globalDict.suppliers}
          logisticsCost={
            selectedRegion ? (globalDict.logisticsCosts?.[selectedRegion] || 0) : 0
          }
          selectedRegion={selectedRegion}
          selectedSphere={selectedSphere}
          supplierPhones={globalDict.supplierPhones}
          supplierLegalNames={globalDict.supplierLegalNames}
        />
      )}
    </>
  );
}
