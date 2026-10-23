import TelegramBot from "node-telegram-bot-api";
import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  orderBy,
  limit,
} from "firebase/firestore";
import fs from "fs";
import os from "os";
import PDFDocument from "pdfkit";
import path from "path";
import axios from "axios";
import sharp from "sharp";
import ExcelJS from "exceljs";

// Ensure Cyrillic font is available
const fontPath = path.join(os.tmpdir(), "Roboto-Regular.ttf");
const fontBoldPath = path.join(os.tmpdir(), "Roboto-Medium.ttf");
let fontDownloadPromise: Promise<unknown> | null = null;
async function ensureFont() {
  try {
    if (!fs.existsSync(fontPath) || !fs.existsSync(fontBoldPath)) {
      if (!fontDownloadPromise) {
        fontDownloadPromise = (async () => {
          try {
            const res = await axios({
              method: "get",
              url: "https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Regular.ttf",
              responseType: "stream",
              timeout: 6000,
            });
            const writer = fs.createWriteStream(fontPath);
            res.data.pipe(writer);

            const resBold = await axios({
              method: "get",
              url: "https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Medium.ttf",
              responseType: "stream",
              timeout: 6000,
            });
            const writerBold = fs.createWriteStream(fontBoldPath);
            resBold.data.pipe(writerBold);

            return Promise.all([
              new Promise<void>((resolve) => writer.on("finish", () => resolve())),
              new Promise<void>((resolve) =>
                writerBold.on("finish", () => resolve()),
              ),
            ]);
          } catch (dlErr) {
            console.warn("Font download warning (non-fatal):", dlErr);
          }
        })();
      }
      await fontDownloadPromise;
    }
  } catch (e) {
    console.warn("ensureFont warning (non-fatal):", e);
  }
}
ensureFont().catch(() => {});

// Firebase init
const firebaseConfig = (() => {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf-8")
    );
  } catch (e) {
    console.error("Failed to read firebase-applet-config.json, falling back to basic config", e);
    return {
      projectId: "gen-lang-client-0196317953",
      firestoreDatabaseId: "ai-studio-5f59c4a4-c929-485c-8d2d-607080775340",
    };
  }
})();

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(
  app,
  { experimentalForceLongPolling: true },
  firebaseConfig.firestoreDatabaseId,
);

const token = "8983529729:AAGNc2kvtXQgP0qCin4E_Dzwr4FHiYOv3KU";

export let bot: TelegramBot | null = null;
try {
  const useWebhook = process.env.BOT_WEBHOOK_URL !== undefined;

  if (useWebhook) {
    bot = new TelegramBot(token, { webHook: true });
    bot.setWebHook(process.env.BOT_WEBHOOK_URL!);
    console.log(
      "Telegram Bot running in Webhook mode:",
      process.env.BOT_WEBHOOK_URL,
    );
  } else {
    bot = new TelegramBot(token, { polling: true });
    console.log("Telegram Bot running in Polling mode.");
  }

  if (bot) {
    bot.on("error", (error: any) => {
      const errMsg = error?.message || String(error);
      if (errMsg.includes("409 Conflict") || errMsg.includes("ETELEGRAM")) {
        console.warn("Telegram Bot error (conflict/network):", errMsg);
      } else {
        console.error("Telegram Bot error:", errMsg);
      }
    });
    bot.on("polling_error", (error: any) => {
      const errMsg = error?.message || String(error);
      if (errMsg.includes("409 Conflict") || errMsg.includes("ETELEGRAM")) {
        console.warn("Telegram Bot polling conflict (another instance active):", errMsg);
      } else {
        console.error("Telegram Bot polling error:", errMsg);
      }
    });
    bot.on("webhook_error", (error: any) => {
      console.error("Telegram Bot webhook error:", error?.message || error);
    });

    // Sync menu button URL with Telegram
    setTimeout(() => {
      syncTelegramMenuButton();
    }, 2000);
  }

  // Graceful shutdown to prevent polling conflicts
  process.once("SIGINT", () => {
    if (bot && !useWebhook) bot.stopPolling();
  });
  process.once("SIGTERM", () => {
    if (bot && !useWebhook) bot.stopPolling();
  });
} catch (e) {
  console.error("Bot initialization error:", e);
}

// Global dictionary getter
async function getGlobalDict() {
  const metaRef = doc(db, "settings", "dictionaries");
  const snap = await getDoc(metaRef);
  if (snap.exists()) {
    return (
      snap.data() || {
        suppliers: [],
        regions: [],
        logisticsCosts: {},
      }
    );
  }
  return { suppliers: [], regions: [], logisticsCosts: {} };
}

// Get Spheres List Helper
async function getSpheresList() {
  let spheresProps: string[] = [
    "Водоснабжение",
    "Электрика",
    "Вентиляция",
    "Отопление",
    "Канализация",
  ];
  try {
    const dictDoc = await getDoc(doc(db, "settings", "dictionaries"));
    if (dictDoc.exists()) {
      const dictData = dictDoc.data();
      if (
        dictData.spheres &&
        Array.isArray(dictData.spheres) &&
        dictData.spheres.length > 0
      ) {
        spheresProps = dictData.spheres;
      }
    }
  } catch (e) {
    console.error("Error loading spheres", e);
  }
  return spheresProps;
}

// Build Spheres Keyboard Helper
function buildSpheresKeyboard(spheresList: string[], selectedSpheres: string[]) {
  const keyboard: TelegramBot.InlineKeyboardButton[][] = [];
  
  // Create a row for each sphere
  spheresList.forEach((sphere) => {
    const isSelected = selectedSpheres.includes(sphere);
    const icon = isSelected ? "✅" : "⬜";
    keyboard.push([
      {
        text: `${icon} ${sphere}`,
        callback_data: `toggle_sphere:${sphere}`,
      },
    ]);
  });

  // Action buttons
  keyboard.push([
    {
      text: "📥 Подтвердить выбор",
      callback_data: "done_spheres",
    },
    {
      text: "⏩ Пропустить (Общее)",
      callback_data: "skip_spheres",
    }
  ]);

  return { inline_keyboard: keyboard };
}

// Get Regions List Helper
async function getRegionsList() {
  let regionsProps: string[] = ["Душанбе"];
  try {
    const dictDoc = await getDoc(doc(db, "settings", "dictionaries"));
    if (dictDoc.exists()) {
      const dictData = dictDoc.data();
      if (
        dictData.regions &&
        Array.isArray(dictData.regions) &&
        dictData.regions.length > 0
      ) {
        regionsProps = dictData.regions;
      }
    }
  } catch (e) {
    console.error("Error loading regions", e);
  }
  return regionsProps;
}

// Build Regions Keyboard Helper
function buildRegionsKeyboard(regionsList: string[], selectedRegions: string[]) {
  const keyboard: TelegramBot.InlineKeyboardButton[][] = [];
  
  // Create a row for each region
  regionsList.forEach((region) => {
    const isSelected = selectedRegions.includes(region);
    const icon = isSelected ? "✅" : "⬜";
    keyboard.push([
      {
        text: `${icon} ${region}`,
        callback_data: `toggle_region:${region}`,
      },
    ]);
  });

  // Action buttons
  keyboard.push([
    {
      text: "📥 Подтвердить выбор",
      callback_data: "done_regions",
    },
    {
      text: "⏩ Пропустить регион",
      callback_data: "skip_regions",
    }
  ]);

  return { inline_keyboard: keyboard };
}

// Simple pricing logic duplication
function getProductPriceForSupplierAndRegion(
  p: any,
  supplier: string,
  region: string,
  globalDict: any,
) {
  if (supplier === "supplier1") {
    return globalDict.logisticsCosts?.[region] || 0;
  }
  if (
    region &&
    p.prices?.[supplier]?.[region] !== undefined &&
    p.prices[supplier][region] !== null
  ) {
    const cp = parseFloat(p.prices[supplier][region]) || 0;
    if (cp > 0) return cp;
  }

  const mapId =
    supplier === "supplier2"
      ? "priceSupplier2"
      : supplier === "supplier3"
        ? "priceSupplier3"
        : "priceSupplier4";
  const legacyPrice = parseFloat(p[mapId]) || 0;
  if (legacyPrice > 0) return legacyPrice;
  return 0;
}
import { GoogleGenAI } from "@google/genai";

function getGenAI() {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY is not set.");
    return null;
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

type BotState =
  | "IDLE"
  | "WAITING_PASSWORD"
  | "ADMIN_MENU"
  | "WAITING_SEARCH"
  | "WAITING_REGION"
  | "WAITING_SPHERE"
  | "WAITING_PHOTO_PRODUCT"
  | "WAITING_PHOTO_SPEC"
  | "WAITING_PRICE";
interface UserState {
  state: BotState;
  tempProductData?: any;
}
import { generateNextProductCode } from "./src/lib/generateNextCode.ts";

const userStates = new Map<number, UserState>();
const adminUsers = new Set<number>();
const supplierUsers = new Map<number, string>();
const facilitatorUsers = new Map<number, string>();
const SECRET_CODE = "@020779@";

// Helper to check if a message represents a cancellation request
function isCancelMessage(text: string): boolean {
  if (!text) return false;
  const norm = text.trim().toLowerCase();
  return (
    norm === "/cancel" ||
    norm === "❌ отмена" ||
    norm === "отмена" ||
    norm === "отменить" ||
    norm === "cancel"
  );
}

// Helper to get Main WebApp URL with cache buster
function getMainCatalogUrl() {
  const miniAppUrl = process.env.MINI_APP_URL || "https://ais-pre-6dg2jc6u5llox5aqwgbixu-461007728319.asia-east1.run.app/mini-app";
  const sep = miniAppUrl.includes("?") ? "&" : "?";
  return `${miniAppUrl}${sep}_v=${Date.now()}`;
}

async function syncTelegramMenuButton(chatId?: number) {
  if (!bot) return;
  try {
    let url = getMainCatalogUrl();
    let text = "🛍 Каталог";

    if (chatId) {
      await ensureUserRoleLoaded(chatId);
      if (facilitatorUsers.has(chatId)) {
        const facId = facilitatorUsers.get(chatId) || "";
        url = getFacilitatorUrl(facId);
        text = "🛍 Лист выборки";
      } else if (supplierUsers.has(chatId)) {
        const supId = supplierUsers.get(chatId) || "supplier2";
        url = getSupplierPortalUrl(supId);
        text = "🛍 Портал цен";
      }
      await bot.setChatMenuButton({
        chat_id: chatId,
        menu_button: JSON.stringify({
          type: "web_app",
          text,
          web_app: { url },
        }) as any,
      });
    } else {
      await bot.setChatMenuButton({
        menu_button: JSON.stringify({
          type: "web_app",
          text: "🛍 Каталог",
          web_app: { url },
        }) as any,
      });
    }
  } catch (err: any) {
    console.warn("Could not sync Telegram chat menu button:", err?.message || err);
  }
}

// Helper to get Facilitator WebApp URL
function getFacilitatorUrl(facilitatorId: string) {
  const miniAppUrl = process.env.MINI_APP_URL || "https://ais-pre-6dg2jc6u5llox5aqwgbixu-461007728319.asia-east1.run.app/mini-app";
  const sep = miniAppUrl.includes("?") ? "&" : "?";
  return `${miniAppUrl}${sep}portal=${facilitatorId}&_v=${Date.now()}`;
}

// Helper to get Supplier WebApp URL
function getSupplierPortalUrl(supplierId: string) {
  const miniAppUrl = process.env.MINI_APP_URL || "https://ais-pre-6dg2jc6u5llox5aqwgbixu-461007728319.asia-east1.run.app";
  const baseUrl = miniAppUrl.replace(/\/mini-app\/?$/, "");
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}portal=${supplierId}&_v=${Date.now()}`;
}

// Helper to check user role and restore from Firestore if needed
async function ensureUserRoleLoaded(chatId: number) {
  if (adminUsers.has(chatId) || supplierUsers.has(chatId) || facilitatorUsers.has(chatId)) {
    return;
  }
  try {
    const userDoc = await getDoc(doc(db, "telegram_users", chatId.toString()));
    if (userDoc.exists()) {
      const data = userDoc.data();
      if (data.role === "admin") {
        adminUsers.add(chatId);
      } else if (data.role === "supplier" && data.supplierId) {
        supplierUsers.set(chatId, data.supplierId);
      } else if (data.role === "facilitator" && data.facilitatorId) {
        facilitatorUsers.set(chatId, data.facilitatorId);
      }
    }
  } catch (e) {
    console.error("Error loading user role from db:", e);
  }
}

// Helper to get Main Menu Keyboard depending on user role
async function getMainKeyboard(chatId: number) {
  await ensureUserRoleLoaded(chatId);
  syncTelegramMenuButton(chatId).catch(() => {});

  if (facilitatorUsers.has(chatId)) {
    const facilitatorId = facilitatorUsers.get(chatId) || "";
    return {
      keyboard: [
        [
          {
            text: "🛍 Открыть Каталог (Выборка)",
            web_app: {
              url: getFacilitatorUrl(facilitatorId),
            },
          },
        ],
        [{ text: "🔍 Поиск оборудования" }, { text: "📜 Мои спецификации (КП)" }],
        [{ text: "ℹ️ Памятка фасилитатора" }, { text: "🚪 Выйти" }],
      ],
      resize_keyboard: true,
    };
  }

  if (supplierUsers.has(chatId)) {
    const supplierId = supplierUsers.get(chatId) || "supplier2";
    let supplierName = "Поставщик";
    try {
      const globalDict = await getGlobalDict();
      const supIdx = supplierId.replace("supplier", "");
      if (supIdx === "2" && globalDict.suppliers?.[0]) supplierName = globalDict.suppliers[0];
      else if (supIdx === "3" && globalDict.suppliers?.[1]) supplierName = globalDict.suppliers[1];
      else if (supIdx === "4" && globalDict.suppliers?.[2]) supplierName = globalDict.suppliers[2];
      else supplierName = `Поставщик ${supIdx}`;
    } catch (e) {
      console.warn("Could not load dict for supplier label:", e);
    }

    return {
      keyboard: [
        [
          {
            text: `🛍 Открыть Портал (${supplierName})`,
            web_app: {
              url: getSupplierPortalUrl(supplierId),
            },
          },
        ],
        [{ text: "➕ Добавить товар" }, { text: "📋 Мои товары / Цены" }],
        [{ text: "🔍 Поиск оборудования" }, { text: "ℹ️ Инструкция поставщика" }],
        [{ text: "🚪 Выйти" }],
      ],
      resize_keyboard: true,
    };
  }

  if (adminUsers.has(chatId)) {
    return {
      keyboard: [
        [
          {
            text: "🛍 Открыть Главный Каталог",
            web_app: {
              url: getMainCatalogUrl(),
            },
          },
        ],
        [{ text: "➕ Добавить товар" }, { text: "📊 Статистика Каталога" }],
        [{ text: "📥 Скачать Каталог (Excel)" }, { text: "🔑 Коды доступа" }],
        [{ text: "🔍 Поиск оборудования" }, { text: "🚪 Выйти" }],
      ],
      resize_keyboard: true,
    };
  }

  return {
    keyboard: [
      [
        {
          text: "🛍 Открыть Каталог (Просмотр)",
          web_app: {
            url: getMainCatalogUrl(),
          },
        },
      ],
      [{ text: "🔍 Поиск оборудования" }, { text: "🔑 Войти (Авторизация)" }],
      [{ text: "❓ Справка о проекте" }],
    ],
    resize_keyboard: true,
  };
}

// Helper to authenticate code strings against admin, supplier, and facilitator credentials
async function tryAuthenticateCode(rawCodeText: string): Promise<string | null> {
  if (!rawCodeText) return null;
  let cleanCode = rawCodeText.trim();
  // Strip leading /admin or /start if present
  cleanCode = cleanCode.replace(/^\/(admin|start)\s*/i, "").trim();
  if (!cleanCode) return null;

  const norm = cleanCode.toLowerCase().replace(/["'@\s]/g, "");
  if (!norm) return null;

  const globalDict = await getGlobalDict();

  // 1. Check Admin password
  const adminPass = globalDict.adminPassword ? String(globalDict.adminPassword).trim().toLowerCase().replace(/["'@\s]/g, "") : "";
  const secretPass = SECRET_CODE ? SECRET_CODE.toLowerCase().replace(/["'@\s]/g, "") : "";
  const defaultAdminCodes = ["020779", "admin", "secret", secretPass, adminPass].filter(Boolean);

  if (defaultAdminCodes.includes(norm)) {
    return "admin";
  }

  // 2. Check Supplier codes
  const supplierCodes = globalDict.supplierCodes || {};
  for (const [supId, code] of Object.entries(supplierCodes)) {
    if (code) {
      const normSupCode = String(code).trim().toLowerCase().replace(/["'@\s]/g, "");
      if (normSupCode === norm) {
        return "supplier:" + supId;
      }
    }
  }

  // 3. Check Facilitator codes
  const facilitatorCodes = globalDict.facilitatorCodes || {};
  for (const [facId, code] of Object.entries(facilitatorCodes)) {
    if (code) {
      const normFacCode = String(code).trim().toLowerCase().replace(/["'@\s]/g, "");
      if (normFacCode === norm) {
        return "facilitator:" + facId;
      }
    }
  }

  return null;
}

// Helper: Generate and send complete Catalog Excel
async function generateAndSendCatalogExcel(chatId: number) {
  try {
    bot?.sendMessage(chatId, "⏳ Формирую полный каталог оборудования в Excel...");
    const productsSnap = await getDocs(collection(db, "products"));
    const products: any[] = [];
    productsSnap.forEach((d) => products.push({ id: d.id, ...d.data() }));

    // Sort by code
    products.sort((a, b) => {
      const codeA = parseInt(a.code || a.id, 10) || 0;
      const codeB = parseInt(b.code || b.id, 10) || 0;
      return codeA - codeB;
    });

    const globalDict = await getGlobalDict();
    const supNames = globalDict.suppliers || ["Поставщик 1", "Поставщик 2", "Поставщик 3"];

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Каталог оборудования");

    ws.columns = [
      { header: "№", key: "idx", width: 6 },
      { header: "Код", key: "code", width: 10 },
      { header: "Наименование", key: "name", width: 38 },
      { header: "Сфера", key: "sphere", width: 20 },
      { header: "Ед.", key: "unit", width: 8 },
      { header: "Мин. цена (с.)", key: "minPrice", width: 16 },
      { header: supNames[0] || "Поставщик 1", key: "p1", width: 16 },
      { header: supNames[1] || "Поставщик 2", key: "p2", width: 16 },
      { header: supNames[2] || "Поставщик 3", key: "p3", width: 16 },
      { header: "Спецификация", key: "description", width: 50 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF3B82F6" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    products.forEach((p, idx) => {
      const p1 = parseFloat(p.priceSupplier2) || (p.prices?.supplier2?.["Душанбе"]) || 0;
      const p2 = parseFloat(p.priceSupplier3) || (p.prices?.supplier3?.["Душанбе"]) || 0;
      const p3 = parseFloat(p.priceSupplier4) || (p.prices?.supplier4?.["Душанбе"]) || 0;
      const validPrices = [p1, p2, p3].filter((x) => x > 0);
      const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : (parseFloat(p.price) || 0);

      const r = ws.addRow({
        idx: idx + 1,
        code: p.code || p.id,
        name: p.name || "—",
        sphere: p.sphere || (p.spheres?.[0] || "Общее"),
        unit: p.unit || "шт.",
        minPrice: minPrice > 0 ? minPrice : "—",
        p1: p1 > 0 ? p1 : "—",
        p2: p2 > 0 ? p2 : "—",
        p3: p3 > 0 ? p3 : "—",
        description: (p.description || "").replace(/\n/g, "; "),
      });

      r.eachCell((cell, colNum) => {
        cell.alignment = {
          vertical: "middle",
          horizontal: [1, 2, 4, 5].includes(colNum) ? "center" : [6, 7, 8, 9].includes(colNum) ? "right" : "left",
          wrapText: colNum === 3 || colNum === 10,
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
    });

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    await bot?.sendDocument(
      chatId,
      buffer,
      { caption: `📊 Полный каталог оборудования проекта ГРП\nВсего товаров: ${products.length} шт.` },
      { filename: "Katalog_Oborudovaniya_GRP.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
    );
  } catch (err: any) {
    console.error("Error generating catalog excel:", err);
    bot?.sendMessage(chatId, `⚠️ Не удалось сформировать Excel файл: ${err?.message || err}`);
  }
}

// Helper: Universal Search across Firestore Catalog
async function handleSearchQuery(chatId: number, queryText: string) {
  const normQuery = queryText.toLowerCase().trim();
  if (!normQuery) return;

  bot?.sendMessage(chatId, `🔍 Ищу «${queryText}» в каталоге...`);

  try {
    const productsSnap = await getDocs(collection(db, "products"));
    const matches: any[] = [];
    productsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const code = String(data.code || docSnap.id || "").toLowerCase();
      const name = String(data.name || "").toLowerCase();
      const desc = String(data.description || "").toLowerCase();
      const sphere = String(data.sphere || (data.spheres?.[0] || "")).toLowerCase();
      const cat = String(data.category || "").toLowerCase();

      if (
        code.includes(normQuery) ||
        name.includes(normQuery) ||
        desc.includes(normQuery) ||
        sphere.includes(normQuery) ||
        cat.includes(normQuery)
      ) {
        matches.push({ id: docSnap.id, ...data });
      }
    });

    if (matches.length === 0) {
      const keyboard = await getMainKeyboard(chatId);
      bot?.sendMessage(
        chatId,
        `🔎 По запросу «${queryText}» ничего не найдено.\n\nПопробуйте ввести другое название (например, «перфоратор», «швея», «makita») или откройте каталог:`,
        { reply_markup: keyboard }
      );
      return;
    }

    const topMatches = matches.slice(0, 5);
    let resultMsg = `🔎 *Найдено товаров: ${matches.length}*\n\n`;

    topMatches.forEach((p, idx) => {
      const code = p.code || p.id;
      const sphere = p.sphere || (p.spheres?.[0] || "Общее");
      const p1 = parseFloat(p.priceSupplier2) || 0;
      const p2 = parseFloat(p.priceSupplier3) || 0;
      const p3 = parseFloat(p.priceSupplier4) || 0;
      const validPrices = [p1, p2, p3, parseFloat(p.price) || 0].filter((x) => x > 0);
      const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
      const priceText = minPrice > 0 ? `*${minPrice} сомони*` : "_цена по запросу_";

      resultMsg += `${idx + 1}. *#${code}* — ${p.name}\n`;
      resultMsg += `   📂 Сфера: ${sphere} | Ед: ${p.unit || "шт."}\n`;
      resultMsg += `   💰 Мин. цена: ${priceText}\n\n`;
    });

    if (matches.length > 5) {
      resultMsg += `_Показаны первые 5 из ${matches.length} товаров. Для полного просмотра откройте каталог кнопкой ниже._\n`;
    }

    const keyboard = await getMainKeyboard(chatId);
    bot?.sendMessage(chatId, resultMsg, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (err: any) {
    console.error("Search error:", err);
    bot?.sendMessage(chatId, `⚠️ Ошибка при поиске: ${err?.message || err}`);
  }
}

// Helper: AI Photo Recognition and Product Preparation
async function handlePhotoAI(chatId: number, photo: TelegramBot.PhotoSize, caption?: string) {
  try {
    bot?.sendMessage(chatId, "⏳ Распознаю параметры оборудования через ИИ...");

    const fileLink = await bot?.getFileLink(photo.file_id);
    if (!fileLink) throw new Error("Could not get photo file link");

    const response = await axios.get(fileLink, { responseType: "arraybuffer" });
    const imageBuffer = Buffer.from(response.data, "binary");
    const base64Image = "data:image/jpeg;base64," + imageBuffer.toString("base64");

    const ai = getGenAI();
    if (!ai) {
      bot?.sendMessage(chatId, "❌ Ошибка: Gemini API ключ не настроен.");
      return;
    }

    const spheresList = await getSpheresList();
    const prompt = `
Проанализируй фото оборудования${caption ? ` и комментарий: "${caption}"` : ""}.
Извлеки следующие данные:
- name: Название товара с обязательным указанием типа, бренда и модели (например: "Перфоратор - Makita HR2470", "Швейная машина - Jack F4", "Сварочный аппарат - Ресанта САИ 220"). Не обобщай, сохраняй бренд и модель!
- description: Технические характеристики для тендера (стандарты проекта). Каждый параметр пиши с новой строки (\\n). Используй математические символы: '≤' для максимальных ограничений (вес, габариты, энергопотребление) и '≥' для минимальных возможностей (мощность, обороты, производительность). Исключи рекламные фразы и перечисление содержимого коробки (сумка, инструкция, коробка).
- unit: Единица измерения ("шт.", "компл.", "м", "кг"). По умолчанию "шт."
- sphere: Подбери самую точную сферу из списка: [${spheresList.join(", ")}]. Если нет точного соответствия, напиши "Общее".

Ответь строго валидным JSON:
{"name": "...", "description": "...", "unit": "шт.", "sphere": "..."}
`;

    const genAIResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: imageBuffer.toString("base64") } },
          ],
        },
      ],
      config: {
        systemInstruction: "You are an expert procurement and tender data extraction engineer. Output strictly raw JSON.",
        responseMimeType: "application/json",
      },
    });

    const parsed = JSON.parse(genAIResponse.text || "{}");
    const productName = (parsed.name || "Оборудование").trim();
    const productDesc = (parsed.description || "").trim();
    const productUnit = (parsed.unit || "шт.").trim();
    const productSphere = (parsed.sphere || "Общее").trim();

    const supplierId = supplierUsers.get(chatId) || "";

    userStates.set(chatId, {
      state: "WAITING_PRICE",
      tempProductData: {
        supplierId,
        name: productName,
        description: productDesc,
        unit: productUnit,
        sphere: productSphere,
        spheres: [productSphere],
        imageBase64: base64Image,
      },
    });

    const previewMsg = `✨ *Оборудование успешно распознано!*\n\n📦 *Наименование:* ${productName}\n📂 *Сфера:* ${productSphere}\n🏷 *Единица:* ${productUnit}\n\n📋 *Спецификация:*\n${productDesc}\n\n💰 *Отправьте цену товара в сомони:*\n_(например: \`1450\` или \`1450.50\`)_`;

    bot?.sendMessage(chatId, previewMsg, {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [[{ text: "❌ Отмена" }]],
        resize_keyboard: true,
      },
    });
  } catch (err: any) {
    console.error("AI Photo error:", err);
    bot?.sendMessage(chatId, `⚠️ Не удалось распознать фото: ${err?.message || err}. Попробуйте отправить фото еще раз или нажмите «❌ Отмена».`);
  }
}

if (bot) {
  const processedMessageIds = new Set<string>();
  const lastProcessedPayload = new Map<
    number,
    { text: string; time: number }
  >();

  // Add listener for photos
  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    await ensureUserRoleLoaded(chatId);

    if (!adminUsers.has(chatId) && !supplierUsers.has(chatId)) {
      bot?.sendMessage(
        chatId,
        "🔒 Для распознавания и добавления товаров через ИИ необходимо авторизоваться.\n\nПожалуйста, отправьте ваш секретный код доступа (код поставщика или администратора).",
        {
          reply_markup: {
            keyboard: [[{ text: "❌ Отмена" }]],
            resize_keyboard: true,
          },
        }
      );
      userStates.set(chatId, { state: "WAITING_PASSWORD" });
      return;
    }

    try {
      // Get highest resolution photo
      const photo = msg.photo![msg.photo!.length - 1];
      await handlePhotoAI(chatId, photo, msg.caption);
    } catch (e: any) {
      console.error("Photo processing error:", e);
      bot?.sendMessage(chatId, "⚠️ Ошибка при обработке фото. Попробуйте еще раз.");
    }
  });

  // Also support images sent as documents (uncompressed files)
  bot.on("document", async (msg) => {
    const mime = msg.document?.mime_type || "";
    if (mime.startsWith("image/")) {
      const fakePhotoMsg = {
        ...msg,
        photo: [{ file_id: msg.document!.file_id }],
      };
      (bot as any)?.emit("photo", fakePhotoMsg);
    }
  });

  bot.on("callback_query", (query) => {
    const chatId = query.message?.chat.id;
    if (!chatId) return;

    if (query.data === "cancel") {
      bot?.answerCallbackQuery(query.id);
      (bot as any)?.emit("message", {
        chat: { id: chatId },
        text: "❌ Отмена",
        message_id: query.message?.message_id || Date.now(),
      });
    } else {
      bot?.answerCallbackQuery(query.id);
    }
  });

  bot.on("message", async (msg) => {
    // Ignore messages with photos if we process them in "photo" handler
    if (msg.photo) return;
    const payloadForDedup =
      msg.text || (msg.web_app_data ? msg.web_app_data.data : "");
    const uniqueKey = `${msg.message_id}_${payloadForDedup}`;
    if (processedMessageIds.has(uniqueKey)) return;

    const ts = Date.now();
    const last = lastProcessedPayload.get(msg.chat.id);
    if (last && last.text === payloadForDedup && ts - last.time < 3000) {
      return;
    }
    lastProcessedPayload.set(msg.chat.id, { text: payloadForDedup, time: ts });

    processedMessageIds.add(uniqueKey);
    if (processedMessageIds.size > 1000) {
      processedMessageIds.clear();
      processedMessageIds.add(uniqueKey);
    }

    const chatId = msg.chat.id;
    await ensureUserRoleLoaded(chatId);
    let text = msg.text || "";

    if (msg.web_app_data) {
      text = msg.web_app_data.data;
    }

    // Cancellation handler
    if (isCancelMessage(text)) {
      userStates.delete(chatId);
      getMainKeyboard(chatId).then((replyMarkup) => {
        bot?.sendMessage(chatId, "Действие отменено.", {
          reply_markup: replyMarkup,
        });
      });
      return;
    }

    // Logout handler
    if (
      text === "/logout" || 
      text === "🚪 Выйти" || 
      text === "Выйти" || 
      text === "Сбросить роль" || 
      text === "Сменить роль" ||
      text === "🚪 Выйти (Сбросить роль)"
    ) {
      adminUsers.delete(chatId);
      supplierUsers.delete(chatId);
      facilitatorUsers.delete(chatId);
      userStates.delete(chatId);
      try {
        await deleteDoc(doc(db, "telegram_users", chatId.toString()));
      } catch (e) {
        console.error("Failed to delete user doc in Firestore on logout:", e);
      }
      
      getMainKeyboard(chatId).then((replyMarkup) => {
        bot?.sendMessage(
          chatId,
          "🚪 Вы успешно вышли из системы (роль сброшена).\n\nТеперь вы можете авторизоваться заново с помощью кнопки «🔑 Войти» или команды /admin.",
          {
            reply_markup: replyMarkup,
          }
        );
      });
      return;
    }

    const userState = userStates.get(chatId) || { state: "IDLE" };

    // Login prompt
    if (text === "/admin" || text === "🔑 Войти (Авторизация)" || text === "🔑 Войти" || text === "Войти") {
      userStates.set(chatId, { state: "WAITING_PASSWORD" });
      bot?.sendMessage(
        chatId,
        "🔑 *Авторизация в системе*\n\nВведите секретный код доступа администратора, поставщика или фасилитатора:\n_(например: `020779` или `@020779@`)_",
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [[{ text: "❌ Отмена" }]],
            resize_keyboard: true,
          },
        },
      );
      return;
    }

    // Check code authentication
    const isExplicitAuthAttempt =
      userState.state === "WAITING_PASSWORD" ||
      text.startsWith("/admin");

    const authResult = await tryAuthenticateCode(text);

    if (authResult) {
      const globalDict = await getGlobalDict();

      if (authResult === "admin") {
        adminUsers.add(chatId);
        await setDoc(
          doc(db, "telegram_users", chatId.toString()),
          { role: "admin", updatedAt: Date.now() },
          { merge: true }
        ).catch((err) => console.error("Error persisting admin role:", err));

        userStates.delete(chatId);
        const replyMarkup = await getMainKeyboard(chatId);
        bot?.sendMessage(
          chatId,
          "✅ *Авторизация успешна!*\n\nВы вошли как *Администратор*.\nВам доступны управление каталогом, выгрузка Excel, статистика и добавление товаров.",
          {
            parse_mode: "Markdown",
            reply_markup: replyMarkup,
          }
        );
        return;
      } else if (authResult.startsWith("supplier:")) {
        const matchedSupplierId = authResult.replace("supplier:", "");
        supplierUsers.set(chatId, matchedSupplierId);
        await setDoc(
          doc(db, "telegram_users", chatId.toString()),
          { role: "supplier", supplierId: matchedSupplierId, updatedAt: Date.now() },
          { merge: true }
        ).catch((err) => console.error("Error persisting supplier role:", err));

        userStates.delete(chatId);

        let supplierName = "";
        const supIdx = matchedSupplierId.replace("supplier", "");
        if (supIdx === "2" && globalDict.suppliers[0])
          supplierName = globalDict.suppliers[0];
        else if (supIdx === "3" && globalDict.suppliers[1])
          supplierName = globalDict.suppliers[1];
        else if (supIdx === "4" && globalDict.suppliers[2])
          supplierName = globalDict.suppliers[2];
        else supplierName = `Поставщик ${supIdx}`;

        const replyMarkup = await getMainKeyboard(chatId);
        bot?.sendMessage(
          chatId,
          `✅ *Авторизация успешна!*\n\nВы вошли как *${supplierName}*.\n\n💡 Чтобы быстро добавить товар — просто отправьте фото оборудования прямо в этот чат!`,
          {
            parse_mode: "Markdown",
            reply_markup: replyMarkup,
          }
        );
        return;
      } else if (authResult.startsWith("facilitator:")) {
        const matchedFacilitatorId = authResult.replace("facilitator:", "");
        facilitatorUsers.set(chatId, matchedFacilitatorId);
        await setDoc(
          doc(db, "telegram_users", chatId.toString()),
          { role: "facilitator", facilitatorId: matchedFacilitatorId, updatedAt: Date.now() },
          { merge: true }
        ).catch((err) => console.error("Error persisting facilitator role:", err));

        userStates.delete(chatId);

        let facilitatorName = "Фасилитатор";
        if (globalDict.facilitators) {
          const idx = parseInt(matchedFacilitatorId.replace("facilitator", ""), 10) - 2;
          facilitatorName = globalDict.facilitators[idx] || "Фасилитатор";
        }

        const replyMarkup = await getMainKeyboard(chatId);
        bot?.sendMessage(
          chatId,
          `✅ *Авторизация успешна!*\n\nВы вошли как *Фасилитатор: ${facilitatorName}*.\n\nНажмите кнопку «🛍 Открыть Каталог (Выборка)», чтобы сформировать спецификацию для бенефициара.`,
          {
            parse_mode: "Markdown",
            reply_markup: replyMarkup,
          }
        );
        return;
      }
    }

    // Handle /start command
    if (text === "/start" || text.startsWith("/start")) {
      userStates.delete(chatId);
      const replyMarkup = await getMainKeyboard(chatId);
      let greeting = "👋 *Добро пожаловать в Каталог оборудования ГРП!*\n\nЗдесь вы можете просматривать каталог, искать оборудование по моделям и формировать заказы по минимальным ценам поставщиков.";
      
      if (facilitatorUsers.has(chatId)) {
        const facilitatorId = facilitatorUsers.get(chatId) || "";
        const globalDict = await getGlobalDict();
        let facilitatorName = "Фасилитатор";
        if (globalDict.facilitators) {
          const idx = parseInt(facilitatorId.replace("facilitator", ""), 10) - 2;
          facilitatorName = globalDict.facilitators[idx] || "Фасилитатор";
        }
        greeting = `👋 *Здравствуйте, ${facilitatorName}!*\n\nВы авторизованы как *Фасилитатор*.\n\nНажмите «🛍 Открыть Каталог (Выборка)», чтобы сформировать Лист выборки товаров для бенефициаров, либо воспользуйтесь поиском оборудования.`;
      } else if (adminUsers.has(chatId)) {
        greeting = `👋 *Здравствуйте, Администратор!*\n\nВам доступен полный контроль над каталогом: добавление товаров через ИИ, выгрузка Excel, статистика и просмотр кодов доступа.`;
      } else if (supplierUsers.has(chatId)) {
        const supplierId = supplierUsers.get(chatId) || "";
        greeting = `👋 *Здравствуйте, Поставщик!*\n\nВы можете быстро добавить товар, просто отправив фото оборудования в этот чат, либо открыть веб-портал цен.`;
      }

      bot?.sendMessage(chatId, greeting, {
        parse_mode: "Markdown",
        reply_markup: replyMarkup,
      });
      return;
    }

    if (isExplicitAuthAttempt) {
      userStates.set(chatId, { state: "WAITING_PASSWORD" });
      bot?.sendMessage(
        chatId,
        "❌ Неверный код доступа.\n\nПожалуйста, проверьте код и введите его еще раз (например: `020779` или `@020779@`), либо нажмите «❌ Отмена».",
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [[{ text: "❌ Отмена" }]],
            resize_keyboard: true,
          },
        }
      );
      return;
    }

    // Role Buttons:
    // 1. Add product button
    if (text === "➕ Добавить товар" || text === "➕ Добавить товар (ИИ)") {
      const isAuth = adminUsers.has(chatId) || supplierUsers.has(chatId);
      if (!isAuth) {
        userStates.set(chatId, { state: "WAITING_PASSWORD" });
        bot?.sendMessage(
          chatId,
          "🔒 Для добавления товаров необходимо авторизоваться как Поставщик или Администратор.\n\nВведите секретный код доступа:",
          {
            reply_markup: {
              keyboard: [[{ text: "❌ Отмена" }]],
              resize_keyboard: true,
            },
          }
        );
        return;
      }

      userStates.set(chatId, { state: "WAITING_PHOTO_PRODUCT" });
      bot?.sendMessage(
        chatId,
        "📸 *Добавление оборудования через ИИ*\n\nОтправьте фото оборудования (этикетку, упаковку, шильдик или само изделие).\n\n💡 *ИИ автоматически:*\n• Распознает бренд, модель и название\n• Сформирует техническую спецификацию по ГОСТ (с символами ≤, ≥)\n• Подберет сферу деятельности\n• Запросит у вас только цену товара в сомони",
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [[{ text: "❌ Отмена" }]],
            resize_keyboard: true,
          },
        }
      );
      return;
    }

    // 2. Search button
    if (text === "🔍 Поиск оборудования" || text === "🔍 Найти в каталоге" || text === "/search") {
      userStates.set(chatId, { state: "WAITING_SEARCH" });
      bot?.sendMessage(
        chatId,
        "🔍 *Поиск оборудования*\n\nВведите название, бренд, модель, сферу или код (например: `перфоратор`, `makita`, `швея`, `0015`):",
        {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [[{ text: "❌ Отмена" }]],
            resize_keyboard: true,
          },
        }
      );
      return;
    }

    // 3. Supplier: My products & prices
    if (text === "📋 Мои товары / Цены") {
      const supplierId = supplierUsers.get(chatId) || "supplier2";
      const globalDict = await getGlobalDict();
      let supName = "Поставщик";
      const supIdx = supplierId.replace("supplier", "");
      if (supIdx === "2" && globalDict.suppliers?.[0]) supName = globalDict.suppliers[0];
      else if (supIdx === "3" && globalDict.suppliers?.[1]) supName = globalDict.suppliers[1];
      else if (supIdx === "4" && globalDict.suppliers?.[2]) supName = globalDict.suppliers[2];

      bot?.sendMessage(chatId, "⏳ Загружаю ваши товары...");
      const snap = await getDocs(collection(db, "products"));
      const myItems: any[] = [];
      snap.forEach((d) => {
        const p = d.data();
        const propKey = `price${supIdx === "2" ? "Supplier2" : supIdx === "3" ? "Supplier3" : "Supplier4"}`;
        const hasLegacyPrice = parseFloat(p[propKey]) > 0;
        const hasMatrixPrice = p.prices?.[supplierId] && Object.values(p.prices[supplierId]).some((v: any) => parseFloat(v) > 0);
        if (hasLegacyPrice || hasMatrixPrice) {
          myItems.push({ id: d.id, ...p });
        }
      });

      let msgText = `📋 *Товары поставщика: ${supName}*\n\nВсего позиций с вашими ценами: *${myItems.length} шт.*\n\n`;
      if (myItems.length > 0) {
        const sample = myItems.slice(0, 8);
        sample.forEach((it, i) => {
          const propKey = `price${supIdx === "2" ? "Supplier2" : supIdx === "3" ? "Supplier3" : "Supplier4"}`;
          const pLegacy = parseFloat(it[propKey]) || 0;
          msgText += `${i + 1}. *#${it.code || it.id}* — ${it.name}: *${pLegacy > 0 ? `${pLegacy} с.` : "цена по регионам"}*\n`;
        });
        if (myItems.length > 8) {
          msgText += `\n_...и еще ${myItems.length - 8} товаров._\n`;
        }
        msgText += `\n💡 Для массового управления ценами откройте «🛍 Открыть Портал».`;
      } else {
        msgText += `У вас пока нет позиций с установленными ценами.\nНажмите «➕ Добавить товар» или отправьте фото оборудования в чат!`;
      }

      const keyboard = await getMainKeyboard(chatId);
      bot?.sendMessage(chatId, msgText, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
      return;
    }

    // 4. Facilitator: My quote specs
    if (text === "📜 Мои спецификации (КП)" || text === "📜 Мои спецификации") {
      bot?.sendMessage(chatId, "⏳ Загружаю историю спецификаций...");
      try {
        const qSnap = await getDocs(query(collection(db, "quotes_history"), orderBy("createdAtTimestamp", "desc"), limit(6)));
        if (qSnap.empty) {
          bot?.sendMessage(chatId, "📜 Спецификации и КП пока не сформированы.\n\nОткройте Каталог кнопкой ниже, выберите товары и сформируйте первый Лист выборки!");
          return;
        }
        let msgText = "📜 *Последние сформированные Листы выборки (КП):*\n\n";
        let idx = 0;
        qSnap.forEach((d) => {
          idx++;
          const q = d.data();
          const dateStr = q.createdAt ? q.createdAt.split(",")[0] : "—";
          msgText += `${idx}. *${q.id}* (${dateStr})\n`;
          msgText += `   👤 Получатель: ${q.clientName || "Не указан"}\n`;
          msgText += `   📍 Регион: ${q.selectedRegion || "—"} | Фасилитатор: ${q.facilitatorName || "—"}\n`;
          msgText += `   💰 Сумма: *${q.totalAmount || 0} сомони* (${q.items?.length || 0} тов.)\n\n`;
        });
        msgText += "_Для создания нового листа нажмите «🛍 Открыть Каталог (Выборка)»._";
        bot?.sendMessage(chatId, msgText, { parse_mode: "Markdown" });
      } catch (err: any) {
        bot?.sendMessage(chatId, `⚠️ Не удалось загрузить историю: ${err?.message || err}`);
      }
      return;
    }

    // 5. Admin: Statistics
    if (text === "📊 Статистика Каталога") {
      bot?.sendMessage(chatId, "⏳ Считаю статистику каталога...");
      try {
        const snap = await getDocs(collection(db, "products"));
        const total = snap.size;
        let withPhoto = 0;
        const sphereCounts: Record<string, number> = {};
        snap.forEach((d) => {
          const p = d.data();
          if (p.imageBase64 || p.photoUrl) withPhoto++;
          const sph = p.sphere || (p.spheres?.[0] || "Общее");
          sphereCounts[sph] = (sphereCounts[sph] || 0) + 1;
        });

        let msgText = `📊 *Статистика Каталога Проекта*\n\n`;
        msgText += `📦 Всего позиций: *${total} шт.*\n`;
        msgText += `📸 С фотографиями: *${withPhoto} шт.* (${total > 0 ? Math.round((withPhoto / total) * 100) : 0}%)\n\n`;
        msgText += `📂 *Распределение по сферам:*\n`;
        const sortedSpheres = Object.entries(sphereCounts).sort((a, b) => b[1] - a[1]);
        sortedSpheres.forEach(([sName, cnt]) => {
          msgText += `• ${sName}: *${cnt} шт.*\n`;
        });

        bot?.sendMessage(chatId, msgText, { parse_mode: "Markdown" });
      } catch (err: any) {
        bot?.sendMessage(chatId, `⚠️ Ошибка: ${err?.message || err}`);
      }
      return;
    }

    // 6. Admin: Download Catalog Excel
    if (text === "📥 Скачать Каталог (Excel)" || text === "📥 Скачать каталог") {
      await generateAndSendCatalogExcel(chatId);
      return;
    }

    // 7. Admin: Codes directory
    if (text === "🔑 Коды доступа" || text === "🔑 Коды доступа (Справочник)") {
      const globalDict = await getGlobalDict();
      let msgText = `🔑 *Справочник кодов доступа:*\n\n`;
      msgText += `👑 *Администратор:* \`${globalDict.adminPassword || "020779"}\` (или \`@020779@\`)\n\n`;
      msgText += `🏢 *Поставщики:*\n`;
      const supCodes = globalDict.supplierCodes || {};
      const supNames = globalDict.suppliers || [];
      msgText += `• ${supNames[0] || "Поставщик 1"}: \`${supCodes.supplier2 || "—"}\`\n`;
      msgText += `• ${supNames[1] || "Поставщик 2"}: \`${supCodes.supplier3 || "—"}\`\n`;
      msgText += `• ${supNames[2] || "Поставщик 3"}: \`${supCodes.supplier4 || "—"}\`\n\n`;
      msgText += `📋 *Фасилитаторы:*\n`;
      const facCodes = globalDict.facilitatorCodes || {};
      const facNames = globalDict.facilitators || [];
      facNames.forEach((fName: string, i: number) => {
        const fId = `facilitator${i + 2}`;
        msgText += `• ${fName}: \`${facCodes[fId] || "—"}\`\n`;
      });

      bot?.sendMessage(chatId, msgText, { parse_mode: "Markdown" });
      return;
    }

    // 8. Guides & Project Info
    if (text === "ℹ️ Памятка фасилитатора") {
      const memo = `ℹ️ *Памятка Фасилитатора*\n\n1. *Открытие каталога:*\nНажмите «🛍 Открыть Каталог (Выборка)». Каталог откроется с привязкой к вашей организации.\n\n2. *Подбор оборудования:*\nУкажите регион бенефициара и сферу деятельности. Добавьте необходимое оборудование в корзину.\n\n3. *Сравнение цен:*\nСистема автоматически выбирает наименьшую цену среди аккредитованных поставщиков с учетом доставки.\n\n4. *Формирование документов:*\nНажмите «Сформировать Лист выборки». Бот сгенерирует официальный PDF и Excel с QR-кодом для защиты от подделок.\n\n5. *Поиск в чате:*\nВы также можете найти любое оборудование прямо здесь: нажмите «🔍 Поиск оборудования» и введите название или код.`;
      bot?.sendMessage(chatId, memo, { parse_mode: "Markdown" });
      return;
    }

    if (text === "ℹ️ Инструкция поставщика") {
      const memo = `ℹ️ *Инструкция Поставщика*\n\n1. *Быстрое добавление товара:*\nПросто отправьте фото оборудования или шильдика/упаковки в чат! ИИ мгновенно распознает марку, сформирует технические характеристики по ГОСТ и запросит цену.\n\n2. *Управление ценами по регионам:*\nНажмите «🛍 Открыть Портал». В веб-портале вы можете массово проставить цены на товары для разных регионов Таджикистана.\n\n3. *Просмотр позиций:*\nНажмите «📋 Мои товары / Цены» для быстрого просмотра позиций с вашими ценами прямо в Telegram.`;
      bot?.sendMessage(chatId, memo, { parse_mode: "Markdown" });
      return;
    }

    if (text === "❓ Справка о проекте") {
      const memo = `❓ *О проекте «Каталог Оборудования»*\n\nСистема централизованного каталога оборудования и прозрачного формирования коммерческих предложений для Группы Реализации Проекта (ГРП) при Министерстве труда, миграции и занятости населения Республики Таджикистан.\n\n• Автоматический выбор наименьшей цены среди поставщиков\n• Учет региональной логистики\n• Мгновенная генерация защищенных спецификаций (Листов выборки) с QR-верификацией\n• Прямая интеграция Telegram с веб-каталогом`;
      bot?.sendMessage(chatId, memo, { parse_mode: "Markdown" });
      return;
    }

    // State handling: WAITING_PHOTO_PRODUCT
    if (userState.state === "WAITING_PHOTO_PRODUCT") {
      bot?.sendMessage(
        chatId,
        "📸 Пожалуйста, отправьте фото оборудования (или шильдика/упаковки).\n\nЛибо нажмите «❌ Отмена», чтобы вернуться в меню.",
        {
          reply_markup: {
            keyboard: [[{ text: "❌ Отмена" }]],
            resize_keyboard: true,
          },
        }
      );
      return;
    }

    // State handling: WAITING_PRICE
    if (userState.state === "WAITING_PRICE") {
      const priceVal = parseFloat(text.replace(",", "."));
      if (isNaN(priceVal) || priceVal <= 0) {
        bot?.sendMessage(
          chatId,
          "Пожалуйста, отправьте корректное число для цены (например: `1450` или `1450.50`), либо нажмите «❌ Отмена»:",
          {
            parse_mode: "Markdown",
            reply_markup: {
              keyboard: [[{ text: "❌ Отмена" }]],
              resize_keyboard: true,
            },
          }
        );
        return;
      }

      try {
        const product = userState.tempProductData || {};
        const nextCode = await generateNextProductCode(db);
        const productId = nextCode;
        const isSupplier = supplierUsers.has(chatId);
        const supplierIdToUse = isSupplier ? (product.supplierId || supplierUsers.get(chatId) || "supplier2") : "supplier1";

        const finalPrices: any = {
          supplier1: {},
          supplier2: {},
          supplier3: {},
          supplier4: {},
        };
        finalPrices[supplierIdToUse] = { "Душанбе": priceVal };

        const finalProduct: any = {
          id: productId,
          code: nextCode,
          name: (product.name || "Товар без названия").trim().slice(0, 250),
          description: (product.description || "").trim().slice(0, 3990),
          unit: product.unit || "шт.",
          sphere: product.sphere || "Общее",
          spheres: product.spheres || [product.sphere || "Общее"],
          regions: ["Душанбе"],
          category: product.sphere || "Общее",
          price: isSupplier ? 0 : priceVal,
          priceSupplier1: supplierIdToUse === "supplier1" ? priceVal : 0,
          priceSupplier2: supplierIdToUse === "supplier2" ? priceVal : 0,
          priceSupplier3: supplierIdToUse === "supplier3" ? priceVal : 0,
          priceSupplier4: supplierIdToUse === "supplier4" ? priceVal : 0,
          prices: finalPrices,
          imageBase64: product.imageBase64 || "",
          mimeType: "image/jpeg",
          createdAt: Date.now(),
        };

        await setDoc(doc(db, "products", productId), finalProduct);
        userStates.delete(chatId);
        const menuKeyboard = await getMainKeyboard(chatId);
        bot?.sendMessage(
          chatId,
          `✅ *Товар успешно сохранен в Каталог!*\n\n🆔 *Код товара:* \`#${nextCode}\`\n📦 *Наименование:* ${finalProduct.name}\n📂 *Сфера:* ${finalProduct.sphere}\n💰 *Цена:* *${priceVal} сомони*\n\nТовар уже доступен в Каталоге и включен в алгоритм выбора цен!`,
          {
            parse_mode: "Markdown",
            reply_markup: menuKeyboard,
          },
        );
      } catch (err: any) {
        console.error("Error saving product from bot:", err);
        bot?.sendMessage(chatId, `⚠️ Ошибка при сохранении в базу: ${err?.message || err}`);
      }
      return;
    }

    // State handling: WAITING_SEARCH
    if (userState.state === "WAITING_SEARCH") {
      userStates.delete(chatId);
      await handleSearchQuery(chatId, text);
      return;
    }

    // Order Code Check vs Natural Query Search:
    const rawTokensText = (
      msg.web_app_data ? msg.web_app_data.data : text
    ).trim();
    if (!rawTokensText) return;

    const tokens = rawTokensText.split(/[\s,;\n\t]+/).filter(Boolean);
    const isWebApp = !!msg.web_app_data;
    const isLikelySearch =
      isWebApp ||
      (tokens.length > 0 &&
        tokens.every((t) => {
          return (
            /^#?[A-Za-z0-9_\-]+([\.\-][0-9]+)?$/.test(t) &&
            (t.startsWith("#") || /[0-9]/.test(t))
          );
        }));

    if (!isLikelySearch) {
      // Natural search across products rather than error message!
      await handleSearchQuery(chatId, rawTokensText);
      return;
    }


    const rawTokens = tokens.map((s) => s.replace(/^#/, ""));
    if (rawTokens.length === 0) return;

    const requestedItems: { code: string; qty: number }[] = [];
    for (const t of rawTokens) {
      let code = t;
      let qty = 1;
      const match = t.match(/^(.+?)[\.\-]([0-9]+)$/);
      if (match) {
        code = match[1];
        qty = parseInt(match[2], 10) || 1;
      }
      requestedItems.push({ code, qty });
    }

    bot?.sendMessage(chatId, `⏳ Ищу товары: ${requestedItems.length} шт...`);

    try {
      // Optimize product lookup to run in a single Firestore query to prevent major performance delays
      const productsSnap = await getDocs(collection(db, "products"));
      const allProductsList: any[] = [];
      productsSnap.forEach((docSnap) => {
        allProductsList.push({ id: docSnap.id, ...docSnap.data() });
      });

      const foundProducts = new Map<
        string,
        { product: any; quantity: number }
      >();
      const notFound = new Set<string>();

      for (const req of requestedItems) {
        // Search in memory by ID or by Code
        const found = allProductsList.find(
          (p) => p.id === req.code || (p.code && String(p.code).trim().toLowerCase() === String(req.code).trim().toLowerCase())
        );
        if (found) {
          foundProducts.set(found.id, {
            product: found,
            quantity: req.qty,
          });
        } else {
          notFound.add(req.code);
        }
      }

      const productsData = Array.from(foundProducts.values());
      const notFoundArr = Array.from(notFound);

      if (productsData.length === 0) {
        bot?.sendMessage(chatId, `К сожалению, ни один из товаров не найден.`);
        return;
      }

      bot?.sendMessage(
        chatId,
        `✅ Найдено товаров: ${productsData.length} \n❌ Не найдено: ${notFoundArr.length}\n\nГенерирую PDF...`,
      );

      const globalDict = await getGlobalDict();

      let region = "Душанбе";
      let sphere = "";
      try {
        const userDoc = await getDoc(
          doc(db, "telegram_users", chatId.toString()),
        );
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.region) region = userData.region;
          if (userData.sphere) sphere = userData.sphere;
        }
      } catch (e) {
        console.error("Failed to load user info", e);
      }

      const cartItems: any[] = [];
      let logisticsCost = globalDict.logisticsCosts?.[region] || 0;

      for (const pd of productsData) {
        const p = pd.product;
        const qty = pd.quantity;
        let minPrice = Infinity;
        let bestSupplier = "supplier1";

        const sups = ["supplier2", "supplier3", "supplier4"];
        for (const sup of sups) {
          const pr = getProductPriceForSupplierAndRegion(
            p,
            sup,
            region,
            globalDict,
          );
          if (pr > 0 && pr < minPrice) {
            minPrice = pr;
            bestSupplier = sup;
          }
        }

        if (minPrice === Infinity) {
          minPrice = 0; // Empty
        }

        cartItems.push({
          product: p,
          quantity: qty,
          selectedSupplier: bestSupplier,
          selectedPrice: minPrice,
        });
      }

      const docPdf = new PDFDocument({ margin: 40, size: "A4" });
      const bufs: any[] = [];
      docPdf.on("data", (d) => bufs.push(d));

      const pdfPromise = new Promise<Buffer>((resolve) => {
        docPdf.on("end", () => resolve(Buffer.concat(bufs)));
      });

      await ensureFont();

      const getSupplierName = (supp?: string) => {
        if (!supp || supp === "supplier1") return "Логистика";
        const list = globalDict.suppliers || [];
        if (supp === "supplier2") return list[0] || "Поставщик 1";
        if (supp === "supplier3") return list[1] || "Поставщик 2";
        if (supp === "supplier4") return list[2] || "Поставщик 3";
        return "Логистика";
      };

      // Filter cart items by selected sphere if provided
      let filteredCartItems = cartItems;
      if (sphere) {
        filteredCartItems = cartItems.filter((item) => {
          const prodSpheres = item.product.spheres && item.product.spheres.length > 0
            ? item.product.spheres
            : [item.product.sphere || "Общее"];
          return prodSpheres.some(
            (s: string) =>
              s === sphere ||
              s.includes(sphere) ||
              sphere.includes(s)
          );
        });
      }

      if (filteredCartItems.length === 0) {
        filteredCartItems = cartItems; // fallback
      }

      // Pre-download and process images in parallel to drastically improve PDF generation speed
      const imageCache = new Map<string, Buffer>();
      try {
        const downloadPromises = filteredCartItems.map(async (item) => {
          const p = item.product;
          if (p.imageBase64 && typeof p.imageBase64 === "string") {
            try {
              const base64Data = p.imageBase64.replace(
                /^data:image\/\w+;base64,/,
                "",
              );
              const imgBuffer = Buffer.from(base64Data, "base64");
              const jpegBuffer = await sharp(imgBuffer).jpeg().toBuffer();
              imageCache.set(p.imageBase64, jpegBuffer);
            } catch (err) {
              console.warn("Could not pre-process base64 image for PDF:", err);
            }
          } else if (p.photoUrl && p.photoUrl.startsWith("http")) {
            try {
              const imgRes = await axios.get(p.photoUrl, {
                responseType: "arraybuffer",
                timeout: 5000,
              });
              const jpegBuffer = await sharp(imgRes.data).jpeg().toBuffer();
              imageCache.set(p.photoUrl, jpegBuffer);
            } catch (err) {
              console.warn("Could not pre-fetch image for PDF:", p.photoUrl, err);
            }
          }
        });
        await Promise.all(downloadPromises);
      } catch (e) {
        console.error("Error pre-fetching images:", e);
      }

      const uniqueSuppliersInCart = Array.from(
        new Set(filteredCartItems.map((item) => item.selectedSupplier || "supplier2"))
      ) as string[];

      for (let sIndex = 0; sIndex < uniqueSuppliersInCart.length; sIndex++) {
        const supplierKey = uniqueSuppliersInCart[sIndex];
        const supplierItems = filteredCartItems.filter(
          (item) => (item.selectedSupplier || "supplier2") === supplierKey
        );
        const supplierName = getSupplierName(supplierKey);

        if (sIndex > 0) {
          docPdf.addPage();
        }

        // Draw headers for this supplier's page
        docPdf
          .font(fontBoldPath)
          .fontSize(20)
          .fillColor("black")
          .text("ЛИСТ ВЫБОРКИ ТОВАРОВ", 40, 40);

        docPdf
          .font(fontPath)
          .fontSize(10)
          .fillColor("gray")
          .text("Официальный каталог продукции", 40, 65);

        const dateStr = new Date().toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });

        docPdf
          .font(fontPath)
          .fontSize(10)
          .fillColor("#000000")
          .text("Дата формирования: " + dateStr, 250, 40, {
            width: 300,
            align: "right",
          });

        docPdf
          .font(fontPath)
          .fontSize(10)
          .fillColor("gray")
          .text("Документ сгенерирован автоматически", 250, 55, {
            width: 300,
            align: "right",
          });

        // Horizontal line
        docPdf
          .moveTo(40, 80)
          .lineTo(550, 80)
          .lineWidth(2)
          .strokeColor("black")
          .stroke();

        // 2 Columns Info Section (y=95, height=65)
        // Left Box: Supplier details
        docPdf
          .roundedRect(40, 95, 245, 65, 5)
          .lineWidth(1)
          .strokeColor("#cbd5e1")
          .stroke();

        docPdf
          .font(fontBoldPath)
          .fontSize(8)
          .fillColor("#4f46e5")
          .text("ВЫБРАННЫЙ ПОСТАВЩИК:", 50, 103);

        docPdf
          .font(fontBoldPath)
          .fontSize(10)
          .fillColor("black")
          .text(supplierName, 50, 115);

        let detailsOffset = 127;
        if (globalDict.supplierLegalNames?.[supplierKey]) {
          docPdf
            .font(fontPath)
            .fontSize(7.5)
            .fillColor("#374151")
            .text(`Юр. название: ${globalDict.supplierLegalNames[supplierKey]}`, 50, detailsOffset, { width: 225 });
          detailsOffset += 11;
        }
        if (globalDict.supplierPhones?.[supplierKey]) {
          docPdf
            .font(fontPath)
            .fontSize(7.5)
            .fillColor("#374151")
            .text(`Телефон: ${globalDict.supplierPhones[supplierKey]}`, 50, detailsOffset, { width: 225 });
        }

        // Right Box: Parameters
        docPdf
          .roundedRect(305, 95, 245, 65, 5)
          .lineWidth(1)
          .strokeColor("#cbd5e1")
          .stroke();

        docPdf
          .font(fontBoldPath)
          .fontSize(8)
          .fillColor("#4f46e5")
          .text("ПАРАМЕТРЫ ФОРМИРОВАНИЯ ЛИСТА:", 315, 103);

        docPdf
          .font(fontPath)
          .fontSize(8.5)
          .fillColor("#1e293b")
          .text(`Регион: `, 315, 120, { continued: true })
          .font(fontBoldPath)
          .text(region || "—");

        docPdf
          .font(fontPath)
          .fontSize(8.5)
          .fillColor("#1e293b")
          .text(`Сфера деятельности: `, 315, 135, { continued: true })
          .font(fontBoldPath)
          .text(sphere || "Все сферы");

        // Table Header
        docPdf
          .moveTo(40, 175)
          .lineTo(550, 175)
          .lineWidth(2)
          .strokeColor("black")
          .stroke();

        docPdf.font(fontBoldPath).fontSize(8).fillColor("black");
        docPdf.text("№", 40, 185, { width: 25, align: "center" });
        docPdf.text("ФОТО", 65, 185, { width: 50, align: "center" });
        docPdf.text("НАИМЕНОВАНИЕ", 125, 185, { width: 190 });
        docPdf.text("СФЕРА", 325, 185, { width: 60 });
        docPdf.text("ЦЕНА", 395, 185, { width: 45, align: "right" });
        docPdf.text("КОЛ-ВО", 450, 185, { width: 40, align: "center" });
        docPdf.text("СУММА", 500, 185, { width: 50, align: "right" });

        docPdf
          .moveTo(40, 205)
          .lineTo(550, 205)
          .lineWidth(2)
          .strokeColor("black")
          .stroke();

        let currentY = 215;
        let itemIndex = 1;
        let supplierTotal = 0;

        const startNewTablePage = () => {
          docPdf.addPage();
          docPdf.moveTo(40, 40).lineTo(550, 40).lineWidth(2).strokeColor("black").stroke();
          docPdf.font(fontBoldPath).fontSize(8).fillColor("black");
          docPdf.text("№", 40, 48, { width: 25, align: "center" });
          docPdf.text("ФОТО", 65, 48, { width: 50, align: "center" });
          docPdf.text("НАИМЕНОВАНИЕ", 125, 48, { width: 190 });
          docPdf.text("СФЕРА", 325, 48, { width: 60 });
          docPdf.text("ЦЕНА", 395, 48, { width: 45, align: "right" });
          docPdf.text("КОЛ-ВО", 450, 48, { width: 40, align: "center" });
          docPdf.text("СУММА", 500, 48, { width: 50, align: "right" });
          docPdf.moveTo(40, 68).lineTo(550, 68).lineWidth(2).strokeColor("black").stroke();
          return 78;
        };

        for (const item of supplierItems) {
          const p = item.product;

          // Compute wrapped text heights
          const nameH = docPdf.heightOfString(p.name || "Без названия", { width: 190, fontSize: 9 });
          const descH = 0;
          const textHeight = nameH + descH + 18;
          const rowHeight = Math.max(textHeight, 45);

          if (currentY + rowHeight > 750) {
            currentY = startNewTablePage();
          }

          const startY = currentY;

          // Col 1: Index
          docPdf
            .font(fontBoldPath)
            .fontSize(8)
            .fillColor("black")
            .text(itemIndex.toString(), 40, currentY, { width: 25, align: "center" });

          // Col 2: Photo
          let imageDrawn = false;
          if (p.imageBase64 && typeof p.imageBase64 === "string") {
            try {
              let jpegBuffer = imageCache.get(p.imageBase64);
              if (!jpegBuffer) {
                const base64Data = p.imageBase64.replace(
                  /^data:image\/\w+;base64,/,
                  "",
                );
                const imgBuffer = Buffer.from(base64Data, "base64");
                jpegBuffer = await sharp(imgBuffer).jpeg().toBuffer();
              }
              docPdf.image(jpegBuffer, 70, currentY, {
                fit: [40, 40],
                align: "center",
                valign: "center",
              });
              imageDrawn = true;
            } catch (e) {
              console.warn("Could not parse image for PDF:", e);
            }
          }
          if (!imageDrawn && p.photoUrl && p.photoUrl.startsWith("http")) {
            try {
              let jpegBuffer = imageCache.get(p.photoUrl);
              if (!jpegBuffer) {
                const imgRes = await axios.get(p.photoUrl, {
                  responseType: "arraybuffer",
                });
                jpegBuffer = await sharp(imgRes.data).jpeg().toBuffer();
              }
              docPdf.image(jpegBuffer, 70, currentY, {
                fit: [40, 40],
                align: "center",
                valign: "center",
              });
              imageDrawn = true;
            } catch (e) {
              console.warn("Could not fetch image for PDF:", p.photoUrl);
            }
          }
          if (!imageDrawn) {
            docPdf
              .font(fontPath)
              .fontSize(8)
              .fillColor("#94a3b8")
              .text("Нет фото", 65, currentY + 15, { width: 50, align: "center" });
          }

          // Col 3: Title and Code
          const codeText = p.code ? `#${p.code}` : `#${p.id.substring(0, 8)}`;
          docPdf.font(fontBoldPath).fontSize(8).fillColor("#4f46e5").text(codeText, 125, currentY);
          docPdf
            .font(fontBoldPath)
            .fontSize(9)
            .fillColor("black")
            .text(p.name || "Без названия", 125, currentY + 12, { width: 190 });

          // Col 4: Sphere
          const itemSpheres = p.spheres && p.spheres.length > 0 ? p.spheres.join(", ") : (p.sphere || "—");
          docPdf
            .font(fontPath)
            .fontSize(8)
            .fillColor("#374151")
            .text(itemSpheres, 325, currentY, { width: 60 });

          // Col 5: Price
          const hasPrice = item.selectedPrice && item.selectedPrice !== Infinity && item.selectedPrice > 0;
          const priceText = hasPrice ? `${Number(item.selectedPrice).toFixed(2)} с.` : "НЕТ ЦЕНЫ";
          docPdf
            .font(fontBoldPath)
            .fontSize(8)
            .fillColor(hasPrice ? "black" : "#dc2626")
            .text(priceText, 395, currentY, { width: 45, align: "right" });

          // Col 6: Qty
          const qtyText = `${item.quantity} ${p.unit || "шт."}`;
          docPdf
            .font(fontPath)
            .fontSize(8)
            .fillColor("black")
            .text(qtyText, 450, currentY, { width: 40, align: "center" });

          // Col 7: Sum
          const sum = hasPrice ? item.selectedPrice * item.quantity : 0;
          const sumText = hasPrice ? `${sum.toFixed(2)} с.` : "—";
          docPdf
            .font(fontBoldPath)
            .fontSize(8)
            .fillColor("black")
            .text(sumText, 500, currentY, { width: 50, align: "right" });

          if (hasPrice) {
            supplierTotal += sum;
          }

          currentY += rowHeight + 15;
          docPdf
            .moveTo(40, currentY - 5)
            .lineTo(550, currentY - 5)
            .lineWidth(0.5)
            .strokeColor("#cbd5e1")
            .stroke();

          itemIndex++;
        }

        // Logistics & Total & Signatures
        if (currentY > 600) {
          docPdf.addPage();
          currentY = 40;
        }

        if (logisticsCost > 0) {
          docPdf
            .moveTo(40, currentY)
            .lineTo(550, currentY)
            .lineWidth(1)
            .strokeColor("#e2e8f0")
            .stroke();
          currentY += 10;
          docPdf
            .font(fontBoldPath)
            .fontSize(10)
            .fillColor("black")
            .text(`Логистика (${region}):`, 300, currentY, { width: 140, align: "right" });
          docPdf.text(logisticsCost.toFixed(2) + " с.", 450, currentY, {
            width: 100,
            align: "right",
          });
          currentY += 25;
        }

        const finalTotal = supplierTotal + logisticsCost;
        docPdf
          .moveTo(40, currentY)
          .lineTo(550, currentY)
          .lineWidth(2)
          .strokeColor("black")
          .stroke();
        currentY += 10;
        docPdf
          .font(fontBoldPath)
          .fontSize(11)
          .fillColor("black")
          .text("ИТОГО К ОПЛАТЕ:", 200, currentY, { width: 230, align: "right" });
        docPdf.text(`${finalTotal.toFixed(2)} с.`, 430, currentY - 1, {
          width: 120,
          align: "right",
        });

        currentY += 40;
        docPdf
          .moveTo(60, currentY + 25)
          .lineTo(220, currentY + 25)
          .lineWidth(1)
          .strokeColor("black")
          .stroke();
        docPdf
          .font(fontPath)
          .fontSize(8)
          .fillColor("#4b5563")
          .text("Подпись клиента", 60, currentY + 30, { width: 160, align: "center" });

        docPdf
          .moveTo(370, currentY + 25)
          .lineTo(530, currentY + 25)
          .lineWidth(1)
          .strokeColor("black")
          .stroke();
        docPdf.text("Подпись менеджера", 370, currentY + 30, { width: 160, align: "center" });
      }

      docPdf.end();
      const pdfBuffer = await pdfPromise;

      // Excel generation (Same structure as downloadCartExcel in excelExport.ts)
      const wb = new ExcelJS.Workbook();
      wb.creator = "AI Catalog Creator";
      wb.created = new Date();

      const uniqueCartSuppliers = Array.from(
        new Set(filteredCartItems.map((i) => i.selectedSupplier || "supplier2"))
      );

      for (const supplierKey of uniqueCartSuppliers) {
        const supplierItems = filteredCartItems.filter(
          (i) => (i.selectedSupplier || "supplier2") === supplierKey
        );
        const supplierName = getSupplierName(supplierKey);

        const rawTitle = `Инвойс - ${supplierName}`;
        const sheetTitle = rawTitle.substring(0, 31).replace(/[\\/*?:\[\]]/g, "");
        const ws = wb.addWorksheet(sheetTitle);

        ws.columns = [
          { key: "index", width: 8 },
          { key: "code", width: 15 },
          { key: "name", width: 55 },
          { key: "unit", width: 15 },
          { key: "qty", width: 12 },
          { key: "price", width: 18 },
          { key: "total", width: 20 },
        ];

        ws.mergeCells("A1:G1");
        const titleCell = ws.getCell("A1");
        titleCell.value = "Буҷети сармоягузорӣ";
        titleCell.font = { bold: true, size: 12 };
        titleCell.alignment = { horizontal: "center", vertical: "middle" };
        titleCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF4BA0DC" },
        };
        for (let c = 1; c <= 7; c++) {
          ws.getCell(1, c).border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        }

        const infoRow1 = ws.addRow([
          "Минтақа (Регион):",
          region || "Ҳамаи минтақаҳо",
          "",
          "",
          "",
          "",
          "",
        ]);
        ws.mergeCells("B2:G2");
        infoRow1.getCell(1).font = { bold: true, size: 10 };
        infoRow1.getCell(2).font = { size: 10 };
        for (let c = 1; c <= 7; c++) {
          ws.getCell(2, c).border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        }

        const infoRow2 = ws.addRow([
          "Сфера (Бахш):",
          sphere || "Ҳамаи сфераҳо",
          "",
          "",
          "",
          "",
          "",
        ]);
        ws.mergeCells("B3:G3");
        infoRow2.getCell(1).font = { bold: true, size: 10 };
        infoRow2.getCell(2).font = { size: 10 };
        for (let c = 1; c <= 7; c++) {
          ws.getCell(3, c).border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        }

        const headerRow = ws.addRow([
          "#",
          "ID товара",
          "Ном ва хусусиятҳо",
          "Воҳид",
          "Миқдор",
          "Нархи як воҳид*",
          "Ҳамагӣ",
        ]);
        headerRow.eachCell((cell) => {
          cell.font = { bold: true };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF4BA0DC" },
          };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });

        // Assign each item to exactly one primary sphere to prevent duplicate listing in different spheres
        const itemToPrimarySphere = new Map<string, string>();
        supplierItems.forEach((i) => {
          const pSpheres = i.product.spheres && i.product.spheres.length > 0
            ? i.product.spheres
            : [i.product.sphere || "Общее"];
          let primary = pSpheres[0] || "Общее";
          if (sphere && pSpheres.includes(sphere)) {
            primary = sphere;
          }
          itemToPrimarySphere.set(i.product.id, primary);
        });

        const spheresSet = new Set<string>(itemToPrimarySphere.values());

        let overallExcelTotal = 0;

        for (const sName of Array.from(spheresSet)) {
          const itemsInSphere = supplierItems.filter((i) => itemToPrimarySphere.get(i.product.id) === sName);
          if (itemsInSphere.length === 0) continue;

          const sRow = ws.addRow(["", sName, "", "", "", "", ""]);
          sRow.getCell(2).font = { bold: true, underline: true };
          sRow.getCell(2).alignment = {
            horizontal: "center",
            vertical: "middle",
          };
          for (let c = 1; c <= 7; c++) {
            sRow.getCell(c).border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          }

          let sphereTotal = 0;
          itemsInSphere.forEach((item, idx) => {
            const sum = item.quantity * item.selectedPrice;
            sphereTotal += sum;
            const codeVal = item.product.code || item.product.id?.substring(0, 8) || "";
            const r = ws.addRow([
              idx + 1,
              codeVal,
              item.product.name,
              item.product.unit || "шт.",
              item.quantity,
              item.selectedPrice > 0 ? item.selectedPrice : "-",
              item.selectedPrice > 0 ? sum : "-",
            ]);
            r.eachCell((cell, colNumber) => {
              let horz: "left" | "center" | "right" = "right";
              if (colNumber === 1) horz = "center";
              if (colNumber === 2) horz = "center";
              if (colNumber === 3) horz = "left";
              if (colNumber === 4) horz = "center";

              cell.alignment = {
                vertical: "middle",
                horizontal: horz,
                wrapText: true,
              };
              cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            });
          });

          overallExcelTotal += sphereTotal;

          const subRow = ws.addRow(["", "", "", "", "", "Ҷамъ", sphereTotal]);
          subRow.eachCell((cell) => {
            cell.alignment = { vertical: "middle", horizontal: "right" };
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          });
          subRow.getCell(6).font = { bold: true };
          subRow.getCell(7).font = { bold: true };
        }

        if (logisticsCost > 0) {
          const logRow = ws.addRow([
            "",
            "",
            "Логистика",
            "",
            "",
            "",
            logisticsCost,
          ]);
          overallExcelTotal += logisticsCost;
          logRow.eachCell((cell) => {
            cell.alignment = { vertical: "middle", horizontal: "right" };
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          });
        }

        const totalRow = ws.addRow([
          "",
          "",
          "",
          "",
          "",
          "Ҳамагӣ",
          overallExcelTotal,
        ]);
        totalRow.eachCell((cell) => {
          cell.alignment = { vertical: "middle", horizontal: "right" };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
        totalRow.getCell(6).font = { bold: true };
        totalRow.getCell(7).font = { bold: true };
      }

      const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer());

      await bot?.sendDocument(
        chatId,
        pdfBuffer,
        {},
        { filename: "Cart.pdf", contentType: "application/pdf" },
      );

      await bot?.sendDocument(
        chatId,
        excelBuffer,
        {},
        {
          filename: "Invoice.xlsx",
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      );
    } catch (e: any) {
      console.error(e);
      bot?.sendMessage(
        chatId,
        `Произошла ошибка при обработке запроса: ${e?.message || JSON.stringify(e)}`,
      );
    }
  });
}
