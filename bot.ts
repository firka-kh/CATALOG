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
  if (!fs.existsSync(fontPath) || !fs.existsSync(fontBoldPath)) {
    if (!fontDownloadPromise) {
      fontDownloadPromise = (async () => {
        const res = await axios({
          method: "get",
          url: "https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Regular.ttf",
          responseType: "stream",
        });
        const writer = fs.createWriteStream(fontPath);
        res.data.pipe(writer);

        const resBold = await axios({
          method: "get",
          url: "https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Medium.ttf",
          responseType: "stream",
        });
        const writerBold = fs.createWriteStream(fontBoldPath);
        resBold.data.pipe(writerBold);

        return Promise.all([
          new Promise<void>((resolve) => writer.on("finish", () => resolve())),
          new Promise<void>((resolve) =>
            writerBold.on("finish", () => resolve()),
          ),
        ]);
      })();
    }
    await fontDownloadPromise;
  }
}
ensureFont();

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
  | "WAITING_REGION"
  | "WAITING_SPHERE"
  | "WAITING_PHOTO_PRODUCT"
  | "WAITING_PHOTO_SPEC"
  | "WAITING_PRICE";
interface UserState {
  state: BotState;
  tempProductData?: any;
}
import { generateNextProductCode } from "./src/lib/generateNextCode";

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

// Helper to get Facilitator WebApp URL
function getFacilitatorUrl(facilitatorId: string) {
  const miniAppUrl = process.env.MINI_APP_URL || "https://ais-pre-6dg2jc6u5llox5aqwgbixu-461007728319.asia-east1.run.app/mini-app";
  return `${miniAppUrl}?portal=${facilitatorId}`;
}

// Helper to ensure user role is restored from Firestore
async function ensureUserRoleLoaded(chatId: number) {
  if (adminUsers.has(chatId) || supplierUsers.has(chatId) || facilitatorUsers.has(chatId)) {
    return;
  }
  try {
    const userDoc = await getDoc(doc(db, "telegram_users", chatId.toString()));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (userData.role === "admin") {
        adminUsers.add(chatId);
      } else if (userData.role === "supplier" && userData.supplierId) {
        supplierUsers.set(chatId, userData.supplierId);
      } else if (userData.role === "facilitator" && userData.facilitatorId) {
        facilitatorUsers.set(chatId, userData.facilitatorId);
      }
    }
  } catch (e) {
    console.error("Failed to restore user role from Firestore", e);
  }
}

// Helper to get Main Menu Keyboard depending on user role
async function getMainKeyboard(chatId: number) {
  await ensureUserRoleLoaded(chatId);
  if (facilitatorUsers.has(chatId)) {
    const facilitatorId = facilitatorUsers.get(chatId) || "";
    return {
      keyboard: [
        [
          {
            text: "🛍 Открыть Каталог (Фасилитатор)",
            web_app: {
              url: getFacilitatorUrl(facilitatorId),
            },
          },
        ],
        [{ text: "🛠 Личный кабинет фасилитатора" }, { text: "🚪 Выйти" }],
      ],
      resize_keyboard: true,
    };
  }

  if (supplierUsers.has(chatId)) {
    return {
      keyboard: [
        [{ text: "🛠 Панель администратора" }, { text: "🚪 Выйти" }],
      ],
      resize_keyboard: true,
    };
  }

  if (adminUsers.has(chatId)) {
    return {
      keyboard: [
        [
          {
            text: "🛍 Открыть Каталог",
            web_app: {
              url:
                process.env.MINI_APP_URL ||
                "https://ais-pre-6dg2jc6u5llox5aqwgbixu-461007728319.asia-east1.run.app/mini-app",
            },
          },
        ],
        [{ text: "🛠 Панель администратора" }, { text: "🚪 Выйти" }],
      ],
      resize_keyboard: true,
    };
  }

  return {
    keyboard: [
      [
        {
          text: "🛍 Открыть Каталог",
          web_app: {
            url:
              process.env.MINI_APP_URL ||
              "https://ais-pre-6dg2jc6u5llox5aqwgbixu-461007728319.asia-east1.run.app/mini-app",
          },
        },
      ],
      [{ text: "🔑 Войти (Авторизация)" }],
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

if (bot) {
  const processedMessageIds = new Set<string>();
  const lastProcessedPayload = new Map<
    number,
    { text: string; time: number }
  >();

  // Add listener for photos to handle WAITING_PHOTO states
  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    await ensureUserRoleLoaded(chatId);
    const userState = userStates.get(chatId) || { state: "IDLE" };

    if (
      (!adminUsers.has(chatId) && !supplierUsers.has(chatId)) ||
      (userState.state !== "WAITING_PHOTO_PRODUCT" &&
        userState.state !== "WAITING_PHOTO_SPEC")
    ) {
      return;
    }

    try {
      // Get highest resolution photo (last element in array)
      const photo = msg.photo![msg.photo!.length - 1];
      const fileLink = await bot?.getFileLink(photo.file_id);

      if (!fileLink) throw new Error("Could not get file link");

      if (userState.state === "WAITING_PHOTO_PRODUCT") {
        bot?.sendMessage(chatId, "⏳ Обрабатываю фото товара...");
        const response = await axios.get(fileLink, {
          responseType: "arraybuffer",
        });
        const imageBuffer = Buffer.from(response.data, "binary");
        const base64Image =
          "data:image/jpeg;base64," + imageBuffer.toString("base64");

        userState.tempProductData.imageBase64 = base64Image;
        userState.tempProductData.productPhotoUrl = fileLink;
        userState.state = "WAITING_PHOTO_SPEC";
        userStates.set(chatId, userState);

        bot?.sendMessage(
          chatId,
          `✅ Фото товара успешно сохранено.\n\nЕсли на этом фото есть и товар, и спецификация (например, характеристики, коробка или этикетка на одном фото), вы можете нажать кнопку ниже, чтобы распознать товар по этому же фото.\n\nИначе, отправьте фото спецификации отдельно:\n*(Можно отправить несколько фото по очереди. Когда загрузите все фото, нажмите «🔍 Распознать»)*`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "✨ Распознать по этому фото", callback_data: "recognize_single_photo" }],
                [{ text: "❌ Отмена", callback_data: "cancel" }],
              ],
            },
          },
        );
      } else if (userState.state === "WAITING_PHOTO_SPEC") {
        if (!userState.tempProductData.photos) {
          userState.tempProductData.photos = [];
        }
        userState.tempProductData.photos.push(fileLink);

        if (msg.caption) {
          if (!userState.tempProductData.textSpecs) {
            userState.tempProductData.textSpecs = "";
          }
          userState.tempProductData.textSpecs += "\n" + msg.caption;
        }

        userStates.set(chatId, userState);

        bot?.sendMessage(
          chatId,
          `📸 Принято фото спецификации (${userState.tempProductData.photos.length} шт.)${msg.caption ? " и текстовое описание" : ""}. Если есть еще, отправляйте. Если всё — жмите «🔍 Распознать»`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔍 Распознать", callback_data: "recognize" }],
                [{ text: "❌ Отмена", callback_data: "cancel" }],
              ],
            },
          },
        );
      }
    } catch (e: any) {
      console.error(e);
      bot?.sendMessage(
        chatId,
        "⚠️ Ошибка при загрузке фото. Попробуйте еще раз.",
      );
    }
  });

  bot.on("callback_query", (query) => {
    const chatId = query.message?.chat.id;
    if (!chatId) return;

    if (query.data === "recognize") {
      bot?.answerCallbackQuery(query.id);
      (bot as any)?.emit("message", {
        chat: { id: chatId },
        text: "🔍 Распознать",
        message_id: query.message?.message_id || Date.now(),
      });
    } else if (query.data === "recognize_single_photo") {
      bot?.answerCallbackQuery(query.id);
      const userState = userStates.get(chatId);
      if (userState && userState.state === "WAITING_PHOTO_SPEC") {
        if (userState.tempProductData && userState.tempProductData.productPhotoUrl) {
          userState.tempProductData.photos = [userState.tempProductData.productPhotoUrl];
          userStates.set(chatId, userState);
          (bot as any)?.emit("message", {
            chat: { id: chatId },
            text: "🔍 Распознать",
            message_id: query.message?.message_id || Date.now(),
          });
        } else {
          bot?.sendMessage(chatId, "❌ Ошибка: Не удалось найти сохраненное фото товара.");
        }
      }
    } else if (query.data?.startsWith("toggle_region:")) {
      bot?.answerCallbackQuery(query.id);
      const regionName = query.data.split(":")[1];
      const userState = userStates.get(chatId);
      if (userState && userState.state === "WAITING_REGION") {
        if (!userState.tempProductData.regions) {
          userState.tempProductData.regions = [];
        }
        const index = userState.tempProductData.regions.indexOf(regionName);
        if (index > -1) {
          userState.tempProductData.regions.splice(index, 1);
        } else {
          userState.tempProductData.regions.push(regionName);
        }
        userStates.set(chatId, userState);

        // Rebuild and edit message
        getRegionsList().then((regionsList) => {
          const selected = userState.tempProductData.regions || [];
          const text = `*Выбор регионов для товара*\n\nВыбранные регионы: *${selected.join(", ") || "не выбраны"}*\n\nВыберите один или несколько регионов применения из списка ниже с помощью кнопок-чекбоксов. Когда закончите, нажмите «📥 Подтвердить выбор».\n\n_Или выберите "Пропустить регион" чтобы внести товар глобально._`;
          const replyMarkup = buildRegionsKeyboard(regionsList, selected);
          
          bot?.editMessageText(text, {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: "Markdown",
            reply_markup: replyMarkup,
          }).catch((err) => console.error("Error editing regions keyboard", err));
        });
      }
    } else if (query.data === "done_regions") {
      const userState = userStates.get(chatId);
      if (userState && userState.state === "WAITING_REGION") {
        const selected = userState.tempProductData.regions || [];
        if (selected.length === 0) {
          bot?.answerCallbackQuery(query.id, {
            text: "Пожалуйста, выберите хотя бы один регион или нажмите 'Пропустить регион'",
            show_alert: true,
          });
          return;
        }
        bot?.answerCallbackQuery(query.id);

        userState.tempProductData.region = selected[0] || "Душанбе";
        userState.tempProductData.regions = selected;
        userState.state = "WAITING_SPHERE";
        userStates.set(chatId, userState);

        // Update inline keyboard message to show final state
        bot?.editMessageText(`✅ Выбраны регионы: *${selected.join(", ")}*`, {
          chat_id: chatId,
          message_id: query.message?.message_id,
          parse_mode: "Markdown",
        }).catch(() => {});

        bot?.sendMessage(chatId, "⏳ Загружаю список сфер...", {
          reply_markup: {
            keyboard: [[{ text: "❌ Отмена" }]],
            resize_keyboard: true,
          },
        });

        getSpheresList().then((spheresProps) => {
          const text = `*Выбор сфер для товара*\n\nВыбранные сферы: *не выбраны*\n\nВыберите одну или несколько сфер применения из списка ниже с помощью кнопок-чекбоксов. Когда закончите, нажмите «📥 Подтвердить выбор».\n\n_Или введите новое название сферы текстом:_`;
          const replyMarkup = buildSpheresKeyboard(spheresProps, []);
          
          bot?.sendMessage(chatId, text, {
            parse_mode: "Markdown",
            reply_markup: replyMarkup,
          });
        });
      } else {
        bot?.answerCallbackQuery(query.id);
      }
    } else if (query.data === "skip_regions") {
      bot?.answerCallbackQuery(query.id);
      const userState = userStates.get(chatId);
      if (userState && userState.state === "WAITING_REGION") {
        userState.tempProductData.region = "";
        userState.tempProductData.regions = [];
        userState.state = "WAITING_SPHERE";
        userStates.set(chatId, userState);

        bot?.editMessageText(`✅ Регион: *Пропущен (Глобально)*`, {
          chat_id: chatId,
          message_id: query.message?.message_id,
          parse_mode: "Markdown",
        }).catch(() => {});

        bot?.sendMessage(chatId, "⏳ Загружаю список сфер...", {
          reply_markup: {
            keyboard: [[{ text: "❌ Отмена" }]],
            resize_keyboard: true,
          },
        });

        getSpheresList().then((spheresProps) => {
          const text = `*Выбор сфер для товара*\n\nВыбранные сферы: *не выбраны*\n\nВыберите одну или несколько сфер применения из списка ниже с помощью кнопок-чекбоксов. Когда закончите, нажмите «📥 Подтвердить выбор».\n\n_Или введите новое название сферы текстом:_`;
          const replyMarkup = buildSpheresKeyboard(spheresProps, []);
          
          bot?.sendMessage(chatId, text, {
            parse_mode: "Markdown",
            reply_markup: replyMarkup,
          });
        });
      }
    } else if (query.data === "cancel") {
      bot?.answerCallbackQuery(query.id);
      (bot as any)?.emit("message", {
        chat: { id: chatId },
        text: "❌ Отмена",
        message_id: query.message?.message_id || Date.now(),
      });
    } else if (query.data?.startsWith("toggle_sphere:")) {
      bot?.answerCallbackQuery(query.id);
      const sphereName = query.data.split(":")[1];
      const userState = userStates.get(chatId);
      if (userState && userState.state === "WAITING_SPHERE") {
        if (!userState.tempProductData.spheres) {
          userState.tempProductData.spheres = [];
        }
        const index = userState.tempProductData.spheres.indexOf(sphereName);
        if (index > -1) {
          userState.tempProductData.spheres.splice(index, 1);
        } else {
          userState.tempProductData.spheres.push(sphereName);
        }
        userStates.set(chatId, userState);

        // Rebuild and edit message
        getSpheresList().then((spheresList) => {
          const selected = userState.tempProductData.spheres || [];
          const text = `*Выбор сфер для товара*\n\nВыбранные сферы: *${selected.join(", ") || "не выбраны"}*\n\nВыберите одну или несколько сфер применения из списка ниже с помощью кнопок-чекбоксов. Когда закончите, нажмите «📥 Подтвердить выбор».`;
          const replyMarkup = buildSpheresKeyboard(spheresList, selected);
          
          bot?.editMessageText(text, {
            chat_id: chatId,
            message_id: query.message?.message_id,
            parse_mode: "Markdown",
            reply_markup: replyMarkup,
          }).catch((err) => console.error("Error editing spheres keyboard", err));
        });
      }
    } else if (query.data === "done_spheres") {
      const userState = userStates.get(chatId);
      if (userState && userState.state === "WAITING_SPHERE") {
        const selected = userState.tempProductData.spheres || [];
        if (selected.length === 0) {
          bot?.answerCallbackQuery(query.id, {
            text: "Пожалуйста, выберите хотя бы одну сферу или нажмите 'Пропустить (Общее)'",
            show_alert: true,
          });
          return;
        }
        bot?.answerCallbackQuery(query.id);

        userState.tempProductData.sphere = selected[0] || "Общее";
        userState.tempProductData.spheres = selected;
        userState.tempProductData.photos = [];
        userState.state = "WAITING_PHOTO_PRODUCT";
        userStates.set(chatId, userState);

        // Update inline keyboard message to show final state
        bot?.editMessageText(`✅ Выбраны сферы: *${selected.join(", ")}*`, {
          chat_id: chatId,
          message_id: query.message?.message_id,
          parse_mode: "Markdown",
        }).catch(() => {});

        bot?.sendMessage(
          chatId,
          `Сферы успешно сохранены.\n\nТеперь отправьте фото самого товара (оно будет отображаться в каталоге).`,
          {
            reply_markup: {
              keyboard: [
                [{ text: "Пропустить фото товара" }],
                [{ text: "❌ Отмена" }],
              ],
              resize_keyboard: true,
            },
          },
        );
      } else {
        bot?.answerCallbackQuery(query.id);
      }
    } else if (query.data === "skip_spheres") {
      bot?.answerCallbackQuery(query.id);
      const userState = userStates.get(chatId);
      if (userState && userState.state === "WAITING_SPHERE") {
        userState.tempProductData.sphere = "Общее";
        userState.tempProductData.spheres = ["Общее"];
        userState.tempProductData.photos = [];
        userState.state = "WAITING_PHOTO_PRODUCT";
        userStates.set(chatId, userState);

        bot?.editMessageText(`✅ Выбрана сфера: *Общее*`, {
          chat_id: chatId,
          message_id: query.message?.message_id,
          parse_mode: "Markdown",
        }).catch(() => {});

        bot?.sendMessage(
          chatId,
          `Выбрана общая сфера.\n\nТеперь отправьте фото самого товара (оно будет отображаться в каталоге).`,
          {
            reply_markup: {
              keyboard: [
                [{ text: "Пропустить фото товара" }],
                [{ text: "❌ Отмена" }],
              ],
              resize_keyboard: true,
            },
          },
        );
      }
    } else {
      bot?.answerCallbackQuery(query.id);
    }
  });

  bot.on("message", async (msg) => {
    // Ignore messages with photos if we process them in "photo" handler
    if (msg.photo) return;
    // Unique key: messageId + text to prevent duplicate processing from double-clicks or retries
    const payloadForDedup =
      msg.text || (msg.web_app_data ? msg.web_app_data.data : "");
    const uniqueKey = `${msg.message_id}_${payloadForDedup}`;
    if (processedMessageIds.has(uniqueKey)) return;

    // Also ignore identical messages received within 3 seconds (handles button double-clicks)
    const ts = Date.now();
    const last = lastProcessedPayload.get(msg.chat.id);
    if (last && last.text === payloadForDedup && ts - last.time < 3000) {
      return;
    }
    lastProcessedPayload.set(msg.chat.id, { text: payloadForDedup, time: ts });

    processedMessageIds.add(uniqueKey);
    // basic cleanup to prevent memory leak
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

    if (isCancelMessage(text)) {
      userStates.delete(chatId);
      getMainKeyboard(chatId).then((replyMarkup) => {
        bot?.sendMessage(chatId, "Действие отменено.", {
          reply_markup: replyMarkup,
        });
      });
      return;
    }

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
          "🚪 Вы успешно вышли из системы (роль сброшена).\n\nТеперь вы можете авторизоваться заново с помощью команды /admin или кнопки «Вход» (введя код другого поставщика или фасилитатора).",
          {
            reply_markup: replyMarkup,
          }
        );
      });
      return;
    }

    const userState = userStates.get(chatId) || { state: "IDLE" };

    if (text === "/admin" || text === "🔑 Войти (Авторизация)" || text === "Войти") {
      userStates.set(chatId, { state: "WAITING_PASSWORD" });
      bot?.sendMessage(
        chatId,
        "🔑 Введите секретный код администратора, поставщика или фасилитатора:\n\n_(например: 020779 или @020779@)_",
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

    // Attempt authentication if in WAITING_PASSWORD state OR if message looks like a code / /admin command
    const isExplicitAuthAttempt =
      userState.state === "WAITING_PASSWORD" ||
      text.startsWith("/admin") ||
      text.startsWith("/start ");

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

        userStates.set(chatId, { state: "ADMIN_MENU" });
        const replyMarkup = await getMainKeyboard(chatId);
        bot?.sendMessage(
          chatId,
          "✅ Доступ разрешен!\n\nВы успешно авторизованы как *Администратор*.",
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

        userStates.set(chatId, { state: "ADMIN_MENU" });

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
          `✅ Доступ разрешен!\n\nВы авторизованы как *${supplierName}*.`,
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
          `✅ Доступ разрешен!\n\nВы авторизованы как *Фасилитатор: ${facilitatorName}*.`,
          {
            parse_mode: "Markdown",
            reply_markup: replyMarkup,
          }
        );
        return;
      }
    } else if (isExplicitAuthAttempt) {
      // Keep state as WAITING_PASSWORD so user can try entering code again easily
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

    const isAuthorized = adminUsers.has(chatId) || supplierUsers.has(chatId);
    if (text === "➕ Добавить товар") {
      if (!isAuthorized) {
        // Let it fall through to the "session expired" handler below
      } else {
        const supplierId = supplierUsers.get(chatId) || "";

        userStates.set(chatId, {
          state: "WAITING_REGION",
          tempProductData: { supplierId, regions: [], spheres: [] },
        });

        bot?.sendMessage(chatId, "⏳ Загружаю список регионов...", {
          reply_markup: {
            keyboard: [[{ text: "❌ Отмена" }]],
            resize_keyboard: true,
          },
        });

        getRegionsList().then((regionsProps) => {
          const text = `*Выбор регионов для товара*\n\nВыбранные регионы: *не выбраны*\n\nВыберите один или несколько регионов применения из списка ниже с помощью кнопок-чекбоксов. Когда закончите, нажмите «📥 Подтвердить выбор».\n\n_Или выберите "Пропустить регион" чтобы внести товар глобально по сферам._`;
          const replyMarkup = buildRegionsKeyboard(regionsProps, []);
          
          bot?.sendMessage(chatId, text, {
            parse_mode: "Markdown",
            reply_markup: replyMarkup,
          });
        });
        return;
      }
    }

    if (userState.state === "WAITING_REGION") {
      if (!adminUsers.has(chatId) && !supplierUsers.has(chatId)) return;

      const customRegion = text.trim();
      if (!userState.tempProductData.regions) {
        userState.tempProductData.regions = [];
      }
      if (!userState.tempProductData.regions.includes(customRegion)) {
        userState.tempProductData.regions.push(customRegion);
      }
      userState.tempProductData.region = customRegion;
      userState.state = "WAITING_SPHERE";
      userStates.set(chatId, userState);

      bot?.sendMessage(chatId, `✅ Регион "${customRegion}" добавлен к выбору.`);

      bot?.sendMessage(chatId, "⏳ Загружаю список сфер...", {
        reply_markup: {
          keyboard: [[{ text: "❌ Отмена" }]],
          resize_keyboard: true,
        },
      });

      getSpheresList().then((spheresProps) => {
        const text = `*Выбор сфер для товара*\n\nВыбранные сферы: *не выбраны*\n\nВыберите одну или несколько сфер применения из списка ниже с помощью кнопок-чекбоксов. Когда закончите, нажмите «📥 Подтвердить выбор».\n\n_Или введите новое название сферы текстом:_`;
        const replyMarkup = buildSpheresKeyboard(spheresProps, []);
        
        bot?.sendMessage(chatId, text, {
          parse_mode: "Markdown",
          reply_markup: replyMarkup,
        });
      });
      return;
    }

    if (userState.state === "WAITING_SPHERE") {
      if (!adminUsers.has(chatId) && !supplierUsers.has(chatId)) return;
      const sphereText =
        text === "/skip" || text === "Общее (пропустить)"
          ? "Общее"
          : text.trim();
      const spheresList = sphereText.split(",").map(s => s.trim()).filter(Boolean);
      userState.tempProductData.sphere = spheresList[0] || "Общее";
      userState.tempProductData.spheres = spheresList;
      userState.tempProductData.photos = [];
      userState.state = "WAITING_PHOTO_PRODUCT";
      userStates.set(chatId, userState);
      bot?.sendMessage(
        chatId,
        `Сфера "${sphereText}" сохранена.\n\nТеперь отправьте фото самого товара (оно будет отображаться в каталоге).`,
        {
          reply_markup: {
            keyboard: [
              [{ text: "Пропустить фото товара" }],
              [{ text: "❌ Отмена" }],
            ],
            resize_keyboard: true,
          },
        },
      );
      return;
    }

    if (
      userState.state === "WAITING_PHOTO_PRODUCT" &&
      text === "Пропустить фото товара"
    ) {
      if (!adminUsers.has(chatId) && !supplierUsers.has(chatId)) return;
      userState.state = "WAITING_PHOTO_SPEC";
      userStates.set(chatId, userState);
      bot?.sendMessage(
        chatId,
        `Теперь отправьте фото спецификации (коробку, характеристики, этикетку) для распознавания.\n*(Можно отправить несколько фото по очереди. Когда загрузите все фото, нажмите «🔍 Распознать»)*`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔍 Распознать", callback_data: "recognize" }],
              [{ text: "❌ Отмена", callback_data: "cancel" }],
            ],
          },
        },
      );
      return;
    }

    if (userState.state === "WAITING_PHOTO_SPEC" && text === "🔍 Распознать") {
      if (!adminUsers.has(chatId) && !supplierUsers.has(chatId)) return;
      const photos = userState.tempProductData.photos || [];
      const textSpecs = userState.tempProductData.textSpecs || "";
      if (photos.length === 0 && !textSpecs.trim()) {
        bot?.sendMessage(chatId, "Вы не отправляли ни спецификации, ни фото.");
        return;
      }

      bot?.sendMessage(chatId, "⏳ Обрабатываю данные и распознаю...");

      try {
        const ai = getGenAI();
        if (!ai) {
          bot?.sendMessage(
            chatId,
            "❌ Ошибка: API ключ Gemini не настроен на сервере.",
          );
          return;
        }

        const inlineDataParts = [];
        for (const fileLink of photos) {
          const response = await axios.get(fileLink, {
            responseType: "arraybuffer",
          });
          const imageBuffer = Buffer.from(response.data, "binary");
          const base64Image = imageBuffer.toString("base64");
          inlineDataParts.push({
            inlineData: { mimeType: "image/jpeg", data: base64Image },
          });
        }

        const prompt = `
          Посмотри на изображения (если есть) и проанализируй текстовое описание (если предоставлено).
          Текстовое описание от пользователя:\n${textSpecs}\n
          Обобщи информацию и извлеки следующие данные:
          - name: Название товара.
          - description: Полное описание и технические характеристики.
          - unit: Единица измерения (шт., компл., кг, м). По умолчанию "шт."

          Ответь строго в формате JSON, без маркдауна и лишних слов (просто сам JSON и всё).
        `;

        const genAIResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }, ...inlineDataParts],
            },
          ],
          config: {
            systemInstruction:
              "You are an expert procurement and tender data extraction AI. Your job is to extract product equipment specs from images.\n\nCRITICAL RESTRICTIONS AND FORMATTING RULES FOR DESCRIPTION AND NAME:\n1. Focus ONLY on main technical parameters and specifications. STRICTLY EXCLUDE promotional text, package contents/inclusions (e.g., 'В комплекте...', 'Сумка', 'инструкция', etc.), and full sentences. DO NOT include what is included in the box.\n2. BRANDS, MODELS, AND IDENTIFIERS MUST BE PRESERVED: If the photo or text mentions a specific brand, model name, manufacturer, abbreviation, or serial number, you MUST include it in the product 'name', formatted as '<Product type> - <Brand/Model>' (e.g., 'Дрель - Total 2020', 'Перфоратор - Makita HR2470', 'Кабель - ГОСТ 3х2.5'). Do NOT strip or generalize these names; include them so users can identify the exact model in the catalog.\n3. TENDER SPECIFICATION FORMAT (MATH SYMBOLS): You MUST transform parameters into a flexible format for procurement using mathematical symbols limits. For example:\n - Use '≤' for maximum limits (voltage, power, weight, dimensions that shouldn't be exceeded) -> 'Мощность: ≤ 2 кВт', 'Напряжение: ≤ 220 В', 'Вес: ≤ 1.5 кг'.\n - Use '≥' for minimum capacities (size, speed, volume, strength) -> 'Скорость: ≥ 1500 Об/мин', 'Зажим: ≥ 10мм'.\n - Append 'или аналог' to materials and specific component types -> 'Аккумулятор: Li-Ion или аналог'.\n\nEnsure ALL extracted parameters are formatted this way. Do not write 'Не более' or 'Не менее', use '≤' and '≥'.\n\nIMPORTANT: Each parameter in the 'description' field MUST be separated by a newline character (\\n). Do NOT use semicolons or commas to separate distinct parameters.",
            responseMimeType: "application/json",
          },
        });

        const textRes = genAIResponse.text || "{}";
        const parsed = JSON.parse(textRes);

        userState.tempProductData = {
          ...userState.tempProductData,
          name: parsed.name || "Без названия",
          description: parsed.description || "",
          unit: parsed.unit || "шт.",
          code: Math.random().toString(36).substring(2, 8).toUpperCase(), // Temporary random code
          prices: {}, // will be populated
          regionPrices: {},
          currentPricingRegionIndex: 0,
        };

        userState.state = "WAITING_PRICE";
        userStates.set(chatId, userState);

        const regions = userState.tempProductData.regions || [];
        if (regions.length > 0) {
          const currentRegion = regions[0];
          const preview = `✅ Спецификация распознана!\n\n*Название:* ${parsed.name}\n*Спецификация:* ${parsed.description}\n*Единица:* ${parsed.unit}\n\nТеперь укажите цену для региона *${currentRegion}* (или отправьте 0 / Нажмите «⏩ Пропустить регион»):`;
          bot?.sendMessage(chatId, preview, {
            parse_mode: "Markdown",
            reply_markup: {
              keyboard: [
                [{ text: "⏩ Пропустить регион" }],
                [{ text: "❌ Отмена" }],
              ],
              resize_keyboard: true,
            },
          });
        } else {
          const preview = adminUsers.has(chatId)
            ? `✅ Распознано:\n\n*Название:* ${parsed.name}\n*Спецификация:* ${parsed.description}\n*Единица:* ${parsed.unit}\n\nТеперь отправьте базовую цену (Главный каталог) в виде числа (в сомони).`
            : `✅ Спецификация распознана!\n\nТеперь отправьте вашу цену для этого товара (в сомони).`;

          bot?.sendMessage(chatId, preview, {
            parse_mode: "Markdown",
            reply_markup: {
              keyboard: [[{ text: "❌ Отмена" }]],
              resize_keyboard: true,
            },
          });
        }
      } catch (e) {
        console.error(e);
        bot?.sendMessage(
          chatId,
          "⚠️ Ошибка при распознавании. Попробуйте еще раз или напишите /cancel.",
        );
      }
      return;
    }

    if (userState.state === "WAITING_PRICE") {
      if (!adminUsers.has(chatId) && !supplierUsers.has(chatId)) return;

      const product = userState.tempProductData;
      const regionsToSet = product.regions && product.regions.length > 0 ? product.regions : [];

      let priceVal = 0;
      let skipCurrentRegion = false;

      if (regionsToSet.length > 0) {
        const currentIndex = product.currentPricingRegionIndex || 0;
        const currentRegion = regionsToSet[currentIndex];

        if (text === "⏩ Пропустить регион") {
          skipCurrentRegion = true;
        } else {
          priceVal = parseFloat(text.replace(",", "."));
          if (isNaN(priceVal) || priceVal < 0) {
            bot?.sendMessage(
              chatId,
              `Пожалуйста, отправьте корректное число для цены (например: 100.50) для региона *${currentRegion}* или нажмите «⏩ Пропустить регион»:`,
              {
                parse_mode: "Markdown",
                reply_markup: {
                  keyboard: [
                    [{ text: "⏩ Пропустить регион" }],
                    [{ text: "❌ Отмена" }],
                  ],
                  resize_keyboard: true,
                },
              }
            );
            return;
          }
        }

        if (!product.regionPrices) {
          product.regionPrices = {};
        }

        if (!skipCurrentRegion) {
          product.regionPrices[currentRegion] = priceVal;
        }

        const nextIndex = currentIndex + 1;
        product.currentPricingRegionIndex = nextIndex;
        userStates.set(chatId, userState);

        if (nextIndex < regionsToSet.length) {
          const nextRegion = regionsToSet[nextIndex];
          bot?.sendMessage(
            chatId,
            `Укажите цену для региона *${nextRegion}* (или отправьте 0 / Нажмите «⏩ Пропустить регион»):`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                keyboard: [
                  [{ text: "⏩ Пропустить регион" }],
                  [{ text: "❌ Отмена" }],
                ],
                resize_keyboard: true,
              },
            }
          );
          return;
        }
      } else {
        // No regions chosen - treat as global catalog price
        priceVal = parseFloat(text.replace(",", "."));
        if (isNaN(priceVal) || priceVal < 0) {
          bot?.sendMessage(
            chatId,
            "Пожалуйста, отправьте корректное число для цены (например: 100.50).",
          );
          return;
        }
      }

      // If we reach here, we have finished collecting prices! Now we save.
      try {
        const nextCode = await generateNextProductCode(db);
        const productId = nextCode;

        const finalPrices: any = {
          supplier1: {},
          supplier2: {},
          supplier3: {},
          supplier4: {},
        };

        const isSupplier = supplierUsers.has(chatId);
        const supplierIdToUse = isSupplier ? (product.supplierId || "") : "supplier1";

        // Populate regional prices
        if (product.regionPrices && Object.keys(product.regionPrices).length > 0) {
          Object.entries(product.regionPrices).forEach(([reg, val]) => {
            if (typeof val === "number" && val > 0) {
              if (finalPrices[supplierIdToUse]) {
                finalPrices[supplierIdToUse][reg] = val;
              }
            }
          });
        } else if (regionsToSet.length > 0) {
          // Fallback if we have regions but no specific regionPrices
          regionsToSet.forEach((reg: string) => {
            if (finalPrices[supplierIdToUse]) {
              finalPrices[supplierIdToUse][reg] = priceVal;
            }
          });
        }

        // Determine main display price
        let mainPrice = priceVal;
        if (product.regionPrices && Object.keys(product.regionPrices).length > 0) {
          const validPrices = Object.values(product.regionPrices).filter(
            (v) => typeof v === "number" && v > 0
          ) as number[];
          if (validPrices.length > 0) {
            mainPrice = validPrices[0];
          }
        }

        const finalProduct = {
          id: productId,
          code: nextCode,
          name: product.name,
          description: product.description,
          unit: product.unit,
          sphere: product.sphere,
          spheres: product.spheres || (product.sphere ? [product.sphere] : []),
          regions: regionsToSet,
          category: "Без категории",
          imageBase64: product.imageBase64 || "",
          price: isSupplier ? 0 : mainPrice, // Global catalog price
          prices: finalPrices,
          createdAt: Date.now(),
        };

        if (
          product.imageBase64 &&
          product.imageBase64.startsWith("data:image")
        ) {
          const mime = product.imageBase64.split(";")[0].split(":")[1];
          (finalProduct as any).mimeType = mime;
        }

        await setDoc(doc(db, "products", productId), finalProduct);
        userStates.set(chatId, { state: "ADMIN_MENU" });
        bot?.sendMessage(
          chatId,
          `✅ Товар успешно добавлен!\nID товара: ${nextCode}`,
          {
            reply_markup: {
              keyboard: [
                [{ text: "➕ Добавить товар" }],
                [{ text: "❌ Отмена" }],
              ],
              resize_keyboard: true,
            },
          },
        );
      } catch (e) {
        bot?.sendMessage(chatId, "⚠️ Ошибка при сохранении в базу данных.");
        console.error(e);
      }
      return;
    }

    // --- NORMAL USER LOGIC BELOW THIS LINE ---
    if (text === "/start") {
      getMainKeyboard(chatId).then(async (replyMarkup) => {
        let greeting = "Привет! Я бот-каталог. Жмите СТАРТ чтобы открыть каталог и собрать заказ по минимальным ценам. Или просто отправьте мне коды товаров.";
        
        if (facilitatorUsers.has(chatId)) {
          const facilitatorId = facilitatorUsers.get(chatId) || "";
          const globalDict = await getGlobalDict();
          let facilitatorName = "Фасилитатор";
          if (globalDict.facilitators) {
            const idx = parseInt(facilitatorId.replace("facilitator", ""), 10) - 2;
            facilitatorName = globalDict.facilitators[idx] || "Фасилитатор";
          }
          greeting = `Привет, ${facilitatorName}! Вы авторизованы как Фасилитатор.\nЖмите кнопку ниже, чтобы открыть каталог в режиме Фасилитатора и сформировать Лист выборки товаров.`;
        }

        bot?.sendMessage(chatId, greeting, {
          reply_markup: replyMarkup,
        });
      });
      return;
    }

    if (text === "🛠 Панель администратора" || text === "🛠 Личный кабинет фасилитатора") {
      if (adminUsers.has(chatId)) {
        userStates.set(chatId, { state: "ADMIN_MENU" });
        bot?.sendMessage(
          chatId,
          "🛠 Панель администратора открыта. Вы авторизованы как Администратор.",
          {
            reply_markup: {
              keyboard: [
                [{ text: "➕ Добавить товар" }],
                [{ text: "🚪 Выйти (Сбросить роль)" }],
                [{ text: "❌ Отмена" }],
              ],
              resize_keyboard: true,
            },
          },
        );
        return;
      }

      if (supplierUsers.has(chatId)) {
        userStates.set(chatId, { state: "ADMIN_MENU" });
        const supplierId = supplierUsers.get(chatId) || "";
        bot?.sendMessage(
          chatId,
          `🛠 Панель администратора открыта. Вы авторизованы как Поставщик (${supplierId}).`,
          {
            reply_markup: {
              keyboard: [
                [{ text: "➕ Добавить товар" }],
                [{ text: "🚪 Выйти (Сбросить роль)" }],
                [{ text: "❌ Отмена" }],
              ],
              resize_keyboard: true,
            },
          },
        );
        return;
      }

      if (facilitatorUsers.has(chatId)) {
        const facilitatorId = facilitatorUsers.get(chatId) || "";
        const globalDict = await getGlobalDict();
        let facilitatorName = "Фасилитатор";
        if (globalDict.facilitators) {
          const idx = parseInt(facilitatorId.replace("facilitator", ""), 10) - 2;
          facilitatorName = globalDict.facilitators[idx] || "Фасилитатор";
        }
        bot?.sendMessage(
          chatId,
          `🛠 Вы авторизованы как Фасилитатор: ${facilitatorName}.\n\nЗдесь вы можете открыть каталог с закрепленной за вами ролью.`,
          {
            reply_markup: {
              keyboard: [
                [
                  {
                    text: "🛍 Открыть Каталог (Фасилитатор)",
                    web_app: {
                      url: getFacilitatorUrl(facilitatorId),
                    },
                  },
                ],
                [{ text: "🚪 Выйти (Сбросить роль)" }],
                [{ text: "❌ Отмена" }],
              ],
              resize_keyboard: true,
            },
          },
        );
        return;
      }

      userStates.set(chatId, { state: "WAITING_PASSWORD" });
      bot?.sendMessage(
        chatId,
        "Введите секретный код администратора, поставщика или фасилитатора:",
        {
          reply_markup: {
            keyboard: [[{ text: "❌ Отмена" }]],
            resize_keyboard: true,
          },
        },
      );
      return;
    }

    const isUserAuthorized =
      adminUsers.has(chatId) ||
      supplierUsers.has(chatId) ||
      facilitatorUsers.has(chatId);

    if (!isUserAuthorized) {
      getMainKeyboard(chatId).then((replyMarkup) => {
        bot?.sendMessage(
          chatId,
          "⚠️ Доступ ограничен. Вы не авторизованы в системе.\n\nПожалуйста, нажмите «🔑 Войти (Авторизация)» ниже или используйте команду /admin для входа с помощью вашего секретного кода доступа.",
          {
            reply_markup: replyMarkup,
          }
        );
      });
      return;
    }

    if (userState.state !== "IDLE") {
      if (
        userState.state === "WAITING_PHOTO_SPEC" &&
        text !== "🔍 Распознать" &&
        !isCancelMessage(text) &&
        text !== "➕ Добавить товар"
      ) {
        if (!userState.tempProductData.textSpecs) {
          userState.tempProductData.textSpecs = "";
        }
        userState.tempProductData.textSpecs += "\n" + text;
        bot?.sendMessage(
          chatId,
          "✅ Текстовое описание добавлено. Если это всё, отправьте ещё или нажмите '🔍 Распознать'",
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔍 Распознать", callback_data: "recognize" }],
                [{ text: "❌ Отмена", callback_data: "cancel" }],
              ],
            },
          },
        );
        return;
      }

      let promptMessage =
        "Пожалуйста, используйте кнопки меню или нажмите '❌ Отмена', чтобы выйти.";
      if (userState.state === "ADMIN_MENU")
        promptMessage =
          "Вы находитесь в панели администратора. Нажмите '➕ Добавить товар', чтобы добавить новый товар, или '❌ Отмена', чтобы выйти в обычный режим.";
      if (userState.state === "WAITING_PHOTO_PRODUCT")
        promptMessage =
          "Вы добавляете товар. Пожалуйста, отправьте фото товара.";
      if (userState.state === "WAITING_PHOTO_SPEC")
        promptMessage =
          "Отправьте фото спецификации, введите спецификацию текстом, или нажмите '🔍 Распознать'.";

      bot?.sendMessage(chatId, promptMessage);
      return;
    }

    if (text === "➕ Добавить товар" || text === "🔍 Распознать") {
      bot?.sendMessage(
        chatId,
        "Ваша сессия истекла. Пожалуйста, зайдите в панель администратора заново: '🛠 Панель администратора'.",
        {
          reply_markup: {
            keyboard: [
              [
                {
                  text: "🛍 Открыть Каталог",
                  web_app: {
                    url:
                      process.env.MINI_APP_URL ||
                      "https://ais-pre-6dg2jc6u5llox5aqwgbixu-461007728319.asia-east1.run.app/mini-app",
                  },
                },
              ],
              [{ text: "🛠 Панель администратора" }],
            ],
            resize_keyboard: true,
          },
        },
      );
      return;
    }

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
      // Just ignore normal text messages instead of complaining, or guide them.
      bot?.sendMessage(
        chatId,
        "Для формирования корзины введите коды товаров через пробел. (Например: 0001.1 0002.5).",
      );
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
