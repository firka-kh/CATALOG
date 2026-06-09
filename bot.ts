import TelegramBot from "node-telegram-bot-api";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  orderBy,
  limit
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
          new Promise<void>((resolve) => writerBold.on("finish", () => resolve())),
        ]);
      })();
    }
    await fontDownloadPromise;
  }
}
ensureFont();

// Firebase init
const firebaseConfig = {
  projectId: "gen-lang-client-0196317953",
  firestoreDatabaseId: "ai-studio-5f59c4a4-c929-485c-8d2d-607080775340",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const token = "8983529729:AAGNc2kvtXQgP0qCin4E_Dzwr4FHiYOv3KU";

export let bot: TelegramBot | null = null;
try {
  const useWebhook = process.env.BOT_WEBHOOK_URL !== undefined;
  
  if (useWebhook) {
      bot = new TelegramBot(token, { webHook: true });
      bot.setWebHook(process.env.BOT_WEBHOOK_URL!);
      console.log("Telegram Bot running in Webhook mode:", process.env.BOT_WEBHOOK_URL);
  } else {
      bot = new TelegramBot(token, { polling: true });
      console.log("Telegram Bot running in Polling mode.");
      
      bot.on('polling_error', (error: any) => {
        if (error?.code !== 'ETELEGRAM') {
           console.log("Polling error:", error.message);
        }
      });
  }

  // Graceful shutdown to prevent polling conflicts
  process.once('SIGINT', () => {
    if (bot && !useWebhook) bot.stopPolling();
  });
  process.once('SIGTERM', () => {
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

type BotState = "IDLE" | "WAITING_PASSWORD" | "ADMIN_MENU" | "WAITING_REGION" | "WAITING_SPHERE" | "WAITING_PHOTO_PRODUCT" | "WAITING_PHOTO_SPEC" | "WAITING_PRICE";
interface UserState {
  state: BotState;
  tempProductData?: any;
}
import { generateNextProductCode } from "./src/lib/generateNextCode";

const userStates = new Map<number, UserState>();
const adminUsers = new Set<number>();
const supplierUsers = new Map<number, string>();
const SECRET_CODE = "@020779@";

if (bot) {
  const processedMessageIds = new Set<string>();
  const lastProcessedPayload = new Map<number, { text: string; time: number }>();

  // Add listener for photos to handle WAITING_PHOTO states
  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const userState = userStates.get(chatId) || { state: "IDLE" };
    
    if ((!adminUsers.has(chatId) && !supplierUsers.has(chatId)) || (userState.state !== "WAITING_PHOTO_PRODUCT" && userState.state !== "WAITING_PHOTO_SPEC")) {
      return; 
    }

    try {
      // Get highest resolution photo (last element in array)
      const photo = msg.photo![msg.photo!.length - 1];
      const fileLink = await bot?.getFileLink(photo.file_id);
      
      if (!fileLink) throw new Error("Could not get file link");

      if (userState.state === "WAITING_PHOTO_PRODUCT") {
         bot?.sendMessage(chatId, "⏳ Обрабатываю фото товара...");
         const response = await axios.get(fileLink, { responseType: "arraybuffer" });
         const imageBuffer = Buffer.from(response.data, "binary");
         const base64Image = "data:image/jpeg;base64," + imageBuffer.toString("base64");
         
         userState.tempProductData.imageBase64 = base64Image;
         userState.state = "WAITING_PHOTO_SPEC";
         userStates.set(chatId, userState);
         
         bot?.sendMessage(chatId, `✅ Фото товара успешно сохранено.\n\nТеперь отправьте фото спецификации (коробку, характеристики, этикетку) для распознавания.\n*(Можно отправить несколько фото по очереди. Когда загрузите все фото, нажмите «🔍 Распознать»)*`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔍 Распознать", callback_data: "recognize" }], 
              [{ text: "❌ Отмена", callback_data: "cancel" }]
            ]
          }
         });
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
  
         bot?.sendMessage(chatId, `📸 Принято фото спецификации (${userState.tempProductData.photos.length} шт.)${msg.caption ? " и текстовое описание" : ""}. Если есть еще, отправляйте. Если всё — жмите «🔍 Распознать»`, {
           reply_markup: {
             inline_keyboard: [
               [{ text: "🔍 Распознать", callback_data: "recognize" }], 
               [{ text: "❌ Отмена", callback_data: "cancel" }]
             ]
           }
         });
      }
    } catch (e: any) {
      console.error(e);
      bot?.sendMessage(chatId, "⚠️ Ошибка при загрузке фото. Попробуйте еще раз.");
    }
  });

  bot.on("callback_query", (query) => {
    const chatId = query.message?.chat.id;
    if (!chatId) return;
    bot?.answerCallbackQuery(query.id);
    
    if (query.data === "recognize") {
      (bot as any)?.emit("message", { chat: { id: chatId }, text: "🔍 Распознать", message_id: query.message?.message_id || Date.now() });
    } else if (query.data === "cancel") {
      (bot as any)?.emit("message", { chat: { id: chatId }, text: "❌ Отмена", message_id: query.message?.message_id || Date.now() });
    }
  });

  bot.on("message", async (msg) => {
    // Ignore messages with photos if we process them in "photo" handler
    if (msg.photo) return;
    // Unique key: messageId + text to prevent duplicate processing from double-clicks or retries
    const payloadForDedup = msg.text || (msg.web_app_data ? msg.web_app_data.data : "");
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
    let text = msg.text || "";

    if (msg.web_app_data) {
       text = msg.web_app_data.data;
    }

    if (text === "/cancel" || text === "❌ Отмена") {
      userStates.delete(chatId);
      bot?.sendMessage(chatId, "Действие отменено.", {
        reply_markup: {
          keyboard: [
            [{ text: "🛍 Открыть Каталог", web_app: { url: process.env.MINI_APP_URL || "https://ais-pre-6dg2jc6u5llox5aqwgbixu-461007728319.asia-east1.run.app/mini-app" } }],
            [{ text: "🛠 Панель администратора" }]
          ],
          resize_keyboard: true
        }
      });
      return;
    }

    const userState = userStates.get(chatId) || { state: "IDLE" };

    if (text === "/admin") {
      userStates.set(chatId, { state: "WAITING_PASSWORD" });
      bot?.sendMessage(chatId, "Введите секретный код администратора или поставщика:", {
        reply_markup: {
          keyboard: [[{ text: "❌ Отмена" }]],
          resize_keyboard: true
        }
      });
      return;
    }

    if (userState.state === "WAITING_PASSWORD") {
      const globalDict = await getGlobalDict();
      
      let isSupplier = false;
      let matchedSupplierId = "";
      const supplierCodes = globalDict.supplierCodes || {};
      for (const [supId, code] of Object.entries(supplierCodes)) {
        if (code === text) {
           isSupplier = true;
           matchedSupplierId = supId;
           break;
        }
      }

      if (text === SECRET_CODE) {
        adminUsers.add(chatId);
        userStates.set(chatId, { state: "ADMIN_MENU" });
        bot?.sendMessage(chatId, "✅ Доступ разрешен.\n\nПанель администратора открыта.", {
          reply_markup: {
            keyboard: [[{ text: "➕ Добавить товар" }], [{ text: "❌ Отмена" }]],
            resize_keyboard: true
          }
        });
      } else if (isSupplier) {
        supplierUsers.set(chatId, matchedSupplierId);
        userStates.set(chatId, { state: "ADMIN_MENU" });
        
        let supplierName = "";
        const supIdx = matchedSupplierId.replace("supplier", "");
        if (supIdx === "2" && globalDict.suppliers[0]) supplierName = globalDict.suppliers[0];
        else if (supIdx === "3" && globalDict.suppliers[1]) supplierName = globalDict.suppliers[1];
        else if (supIdx === "4" && globalDict.suppliers[2]) supplierName = globalDict.suppliers[2];
        else supplierName = `Поставщик ${supIdx}`;

        bot?.sendMessage(chatId, `✅ Доступ разрешен.\n\nВы авторизованы как ${supplierName}.`, {
          reply_markup: {
            keyboard: [[{ text: "➕ Добавить товар" }], [{ text: "❌ Отмена" }]],
            resize_keyboard: true
          }
        });
      } else {
        userStates.delete(chatId);
        bot?.sendMessage(chatId, "❌ Неверный код. Доступ закрыт.");
      }
      return;
    }

    if (userState.state === "ADMIN_MENU" && text === "➕ Добавить товар") {
      if (!adminUsers.has(chatId) && !supplierUsers.has(chatId)) return;
      
      const supplierId = supplierUsers.get(chatId) || "";

      if (adminUsers.has(chatId)) {
        userStates.set(chatId, { state: "WAITING_SPHERE", tempProductData: { supplierId: "", region: "" } });
        bot?.sendMessage(chatId, "⏳ Загружаю список сфер...");
        
        let spheresProps: string[] = ["Водоснабжение", "Электрика", "Вентиляция", "Отопление", "Канализация"];
        try {
           const dictDoc = await getDoc(doc(db, "settings", "dictionaries"));
           if (dictDoc.exists()) {
               const dictData = dictDoc.data();
               if (dictData.spheres && Array.isArray(dictData.spheres) && dictData.spheres.length > 0) {
                   spheresProps = dictData.spheres;
               }
           }
        } catch (e) {
           console.error("Error loading spheres", e);
        }
        
        const keyboardRows = spheresProps.map(s => [{ text: s }]);
        keyboardRows.push([{ text: "Общее (пропустить)" }]);
        keyboardRows.push([{ text: "❌ Отмена" }]);

        bot?.sendMessage(chatId, "Выберите сферу товара из списка ниже или введите своё название текстом:", {
           reply_markup: {
              keyboard: keyboardRows,
              resize_keyboard: true
           }
        });
      } else {
        userStates.set(chatId, { state: "WAITING_REGION", tempProductData: { supplierId } });
        bot?.sendMessage(chatId, "⏳ Загружаю список регионов...");
        
        let regionsProps: string[] = ["Душанбе"];
        try {
           const dictDoc = await getDoc(doc(db, "settings", "dictionaries"));
           if (dictDoc.exists()) {
               const dictData = dictDoc.data();
               if (dictData.regions && Array.isArray(dictData.regions) && dictData.regions.length > 0) {
                   regionsProps = dictData.regions;
               }
           }
        } catch (e) {
           console.error("Error loading regions", e);
        }
        
        const keyboardRows = regionsProps.map(r => [{ text: r }]);
        keyboardRows.push([{ text: "❌ Отмена" }]);

        bot?.sendMessage(chatId, "Выберите регион:", {
           reply_markup: {
              keyboard: keyboardRows,
              resize_keyboard: true
           }
        });
      }
      return;
    }

    if (userState.state === "WAITING_REGION") {
      if (!adminUsers.has(chatId) && !supplierUsers.has(chatId)) return;
      
      const region = text.trim();
      userState.tempProductData.region = region;
      userState.state = "WAITING_SPHERE";
      userStates.set(chatId, userState);
      
      bot?.sendMessage(chatId, "⏳ Загружаю список сфер...");
      
      let spheresProps: string[] = ["Водоснабжение", "Электрика", "Вентиляция", "Отопление", "Канализация"];
      try {
         const dictDoc = await getDoc(doc(db, "settings", "dictionaries"));
         if (dictDoc.exists()) {
             const dictData = dictDoc.data();
             if (dictData.spheres && Array.isArray(dictData.spheres) && dictData.spheres.length > 0) {
                 spheresProps = dictData.spheres;
             }
         }
      } catch (e) {
         console.error("Error loading spheres", e);
      }
      
      const keyboardRows = spheresProps.map(s => [{ text: s }]);
      keyboardRows.push([{ text: "Общее (пропустить)" }]);
      keyboardRows.push([{ text: "❌ Отмена" }]);

      bot?.sendMessage(chatId, "Выберите сферу товара из списка ниже или введите своё название текстом:", {
         reply_markup: {
            keyboard: keyboardRows,
            resize_keyboard: true
         }
      });
      return;
    }

    if (userState.state === "WAITING_SPHERE") {
      if (!adminUsers.has(chatId) && !supplierUsers.has(chatId)) return;
      const sphere = (text === "/skip" || text === "Общее (пропустить)") ? "Общее" : text.trim();
      userState.tempProductData.sphere = sphere;
      userState.tempProductData.photos = [];
      userState.state = "WAITING_PHOTO_PRODUCT";
      userStates.set(chatId, userState);
      bot?.sendMessage(chatId, `Сфера "${sphere}" сохранена.\n\nТеперь отправьте фото самого товара (оно будет отображаться в каталоге).`, {
        reply_markup: {
          keyboard: [[{ text: "Пропустить фото товара" }], [{ text: "❌ Отмена" }]],
          resize_keyboard: true
        }
      });
      return;
    }

    if (userState.state === "WAITING_PHOTO_PRODUCT" && text === "Пропустить фото товара") {
      if (!adminUsers.has(chatId) && !supplierUsers.has(chatId)) return;
      userState.state = "WAITING_PHOTO_SPEC";
      userStates.set(chatId, userState);
      bot?.sendMessage(chatId, `Теперь отправьте фото спецификации (коробку, характеристики, этикетку) для распознавания.\n*(Можно отправить несколько фото по очереди. Когда загрузите все фото, нажмите «🔍 Распознать»)*`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔍 Распознать", callback_data: "recognize" }], 
            [{ text: "❌ Отмена", callback_data: "cancel" }]
          ]
        }
      });
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
          bot?.sendMessage(chatId, "❌ Ошибка: API ключ Gemini не настроен на сервере.");
          return;
        }

        const inlineDataParts = [];
        for (const fileLink of photos) {
          const response = await axios.get(fileLink, { responseType: "arraybuffer" });
          const imageBuffer = Buffer.from(response.data, "binary");
          const base64Image = imageBuffer.toString("base64");
          inlineDataParts.push({ inlineData: { mimeType: "image/jpeg", data: base64Image } });
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
              parts: [
                { text: prompt },
                ...inlineDataParts
              ]
            }
          ],
          config: {
            systemInstruction: "You are an expert procurement and tender data extraction AI. Your job is to extract product equipment specs from images.\n\nCRITICAL RESTRICTIONS AND FORMATTING RULES FOR DESCRIPTION AND NAME:\n1. Focus ONLY on main technical parameters and specifications. STRICTLY EXCLUDE promotional text, package contents/inclusions (e.g., 'В комплекте...', 'Сумка', 'инструкция', etc.), and full sentences. DO NOT include what is included in the box.\n2. STRICTLY NO BRANDS OR MANUFACTURERS: Do NOT mention any brand, model, or manufacturer name anywhere in 'name' or 'description'.\n3. TENDER SPECIFICATION FORMAT (MATH SYMBOLS): You MUST transform parameters into a flexible format for procurement using mathematical symbols limits. For example:\n - Use '≤' for maximum limits (voltage, power, weight, dimensions that shouldn't be exceeded) -> 'Мощность: ≤ 2 кВт', 'Напряжение: ≤ 220 В', 'Вес: ≤ 1.5 кг'.\n - Use '≥' for minimum capacities (size, speed, volume, strength) -> 'Скорость: ≥ 1500 Об/мин', 'Зажим: ≥ 10мм'.\n - Append 'или аналог' to materials and specific component types -> 'Аккумулятор: Li-Ion или аналог'.\n\nEnsure ALL extracted parameters are formatted this way. Do not write 'Не более' or 'Не менее', use '≤' and '≥'.\n\nIMPORTANT: Each parameter in the 'description' field MUST be separated by a newline character (\\n). Do NOT use semicolons or commas to separate distinct parameters.",
            responseMimeType: "application/json",
          }
        });

        const textRes = genAIResponse.text || "{}";
        const parsed = JSON.parse(textRes);

        userState.tempProductData = {
          ...userState.tempProductData,
          name: parsed.name || "Без названия",
          description: parsed.description || "",
          unit: parsed.unit || "шт.",
          code: Math.random().toString(36).substring(2, 8).toUpperCase(), // Temporary random code
          prices: {} // will be populated
        };

        userState.state = "WAITING_PRICE";
        userStates.set(chatId, userState);

        const preview = adminUsers.has(chatId) 
          ? `✅ Распознано:\n\n*Название:* ${parsed.name}\n*Спецификация:* ${parsed.description}\n*Единица:* ${parsed.unit}\n\nТеперь отправьте базовую цену (Главный каталог) в виде числа (в сомони).`
          : `✅ Спецификация распознана!\n\nТеперь отправьте вашу цену для этого товара (в сомони).`;

        bot?.sendMessage(chatId, preview, { 
          parse_mode: "Markdown",
          reply_markup: {
             keyboard: [[{ text: "❌ Отмена" }]],
             resize_keyboard: true
          }
        });

      } catch (e) {
        console.error(e);
        bot?.sendMessage(chatId, "⚠️ Ошибка при распознавании. Попробуйте еще раз или напишите /cancel.");
      }
      return;
    }

    if (userState.state === "WAITING_PRICE") {
      if (!adminUsers.has(chatId) && !supplierUsers.has(chatId)) return;
      const price = parseFloat(text.replace(",", "."));
      if (isNaN(price) || price < 0) {
        bot?.sendMessage(chatId, "Пожалуйста, отправьте корректное число для цены (например: 100.50).");
        return;
      }
      
      const product = userState.tempProductData;
      
      try {
        const nextCode = await generateNextProductCode(db);
        
        const productId = "manual_" + Date.now().toString() + Math.random().toString(36).substr(2, 5);
        
        const finalPrices: any = {
             supplier1: {},
             supplier2: {},
             supplier3: {},
             supplier4: {}
        };
        
        const isSupplier = supplierUsers.has(chatId);
        if (isSupplier) {
           const supId = product.supplierId || "";
           const reg = product.region || "Душанбе";
           if (finalPrices[supId]) {
              finalPrices[supId][reg] = price;
           }
        }

        const finalProduct = {
          id: productId,
          name: product.name,
          description: product.description,
          unit: product.unit,
          sphere: product.sphere,
          code: nextCode,
          category: "Без категории",
          imageBase64: product.imageBase64 || "",
          price: isSupplier ? 0 : price, // Global catalog price
          prices: finalPrices,
          createdAt: Date.now()
        };

        if (product.imageBase64 && product.imageBase64.startsWith("data:image")) {
          const mime = product.imageBase64.split(";")[0].split(":")[1];
          (finalProduct as any).mimeType = mime;
        }

        await setDoc(doc(db, "products", productId), finalProduct);
        userStates.set(chatId, { state: "ADMIN_MENU" });
        bot?.sendMessage(chatId, `✅ Товар успешно добавлен!\nID товара: ${nextCode}`, {
          reply_markup: {
            keyboard: [[{ text: "➕ Добавить товар" }], [{ text: "❌ Отмена" }]],
            resize_keyboard: true
          }
        });
      } catch(e) {
         bot?.sendMessage(chatId, "⚠️ Ошибка при сохранении в базу данных.");
         console.error(e);
      }
      return;
    }

    // --- NORMAL USER LOGIC BELOW THIS LINE ---
    if (text === "/start") {
      bot?.sendMessage(
        chatId,
        "Привет! Я бот-каталог. Жмите СТАРТ чтобы открыть каталог и собрать заказ по минимальным ценам. Или просто отправьте мне коды товаров.",
        {
          reply_markup: {
            keyboard: [
              [{ text: "🛍 Открыть Каталог", web_app: { url: process.env.MINI_APP_URL || "https://ais-pre-6dg2jc6u5llox5aqwgbixu-461007728319.asia-east1.run.app/mini-app" } }],
              [{ text: "🛠 Панель администратора" }]
            ],
            resize_keyboard: true
          }
        }
      );
      return;
    }

    if (text === "🛠 Панель администратора") {
      userStates.set(chatId, { state: "WAITING_PASSWORD" });
      bot?.sendMessage(chatId, "Введите секретный код администратора или поставщика:", {
        reply_markup: {
          keyboard: [[{ text: "❌ Отмена" }]],
          resize_keyboard: true
        }
      });
      return;
    }

    if (userState.state !== "IDLE") {
      if (userState.state === "WAITING_PHOTO_SPEC" && text !== "🔍 Распознать" && text !== "❌ Отмена" && text !== "➕ Добавить товар") {
         if (!userState.tempProductData.textSpecs) {
           userState.tempProductData.textSpecs = "";
         }
         userState.tempProductData.textSpecs += "\n" + text;
         bot?.sendMessage(chatId, "✅ Текстовое описание добавлено. Если это всё, отправьте ещё или нажмите '🔍 Распознать'", {
           reply_markup: {
             inline_keyboard: [
               [{ text: "🔍 Распознать", callback_data: "recognize" }], 
               [{ text: "❌ Отмена", callback_data: "cancel" }]
             ]
           }
         });
         return;
      }

      let promptMessage = "Пожалуйста, используйте кнопки меню или нажмите '❌ Отмена', чтобы выйти.";
      if (userState.state === "ADMIN_MENU") promptMessage = "Вы находитесь в панели администратора. Нажмите '➕ Добавить товар', чтобы добавить новый товар, или '❌ Отмена', чтобы выйти в обычный режим.";
      if (userState.state === "WAITING_PHOTO_PRODUCT") promptMessage = "Вы добавляете товар. Пожалуйста, отправьте фото товара.";
      if (userState.state === "WAITING_PHOTO_SPEC") promptMessage = "Отправьте фото спецификации, введите спецификацию текстом, или нажмите '🔍 Распознать'.";
      
      bot?.sendMessage(chatId, promptMessage);
      return;
    }

    if (text === "➕ Добавить товар" || text === "🔍 Распознать") {
      bot?.sendMessage(chatId, "Ваша сессия истекла. Пожалуйста, зайдите в панель администратора заново: '🛠 Панель администратора'.", {
        reply_markup: {
          keyboard: [
            [{ text: "🛍 Открыть Каталог", web_app: { url: process.env.MINI_APP_URL || "https://ais-pre-6dg2jc6u5llox5aqwgbixu-461007728319.asia-east1.run.app/mini-app" } }],
            [{ text: "🛠 Панель администратора" }]
          ],
          resize_keyboard: true
        }
      });
      return;
    }

    const rawTokensText = (msg.web_app_data ? msg.web_app_data.data : text).trim();
    if (!rawTokensText) return;

    const tokens = rawTokensText.split(/[\s,;\n\t]+/).filter(Boolean);
    const isWebApp = !!msg.web_app_data;
    const isLikelySearch = isWebApp || (tokens.length > 0 && tokens.every(t => {
      return /^#?[A-Za-z0-9_\-]+([\.\-][0-9]+)?$/.test(t) && (t.startsWith('#') || /[0-9]/.test(t));
    }));

    if (!isLikelySearch) {
      // Just ignore normal text messages instead of complaining, or guide them.
      bot?.sendMessage(chatId, "Для формирования корзины введите коды товаров через пробел. (Например: 0001.1 0002.5).");
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
      const foundProducts = new Map<string, { product: any; quantity: number }>();
      const notFound = new Set<string>();

      for (const req of requestedItems) {
        try {
          // 1. By ID
          const docRef = doc(db, "products", req.code);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            foundProducts.set(snap.id, { product: { id: snap.id, ...snap.data() }, quantity: req.qty });
            continue;
          }

          // 2. By Code
          const q = query(
            collection(db, "products"),
            where("code", "==", req.code),
          );
          const qSnap = await getDocs(q);
          if (!qSnap.empty) {
            const d = qSnap.docs[0];
            foundProducts.set(d.id, { product: { id: d.id, ...d.data() }, quantity: req.qty });
            continue;
          }

          notFound.add(req.code);
        } catch (e) {}
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
        const userDoc = await getDoc(doc(db, "telegram_users", chatId.toString()));
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

      const drawHeader = () => {
        // Title
        docPdf.font(fontBoldPath).fontSize(20).text("ЛИСТ ВЫБОРКИ ТОВАРОВ", 40, 40);
        
        // Subtitle
        docPdf.font(fontPath).fontSize(10).fillColor("gray").text("Официальный каталог продукции", 40, 65);
        
        const dateStr = new Date().toLocaleDateString("ru-RU", { 
            day: "2-digit", month: "2-digit", year: "numeric" 
        });

        // Top right text
        docPdf.font(fontPath).fontSize(10).fillColor("#000000")
            .text("Дата формирования: " + dateStr, 250, 40, { width: 300, align: "right" });
            
        docPdf.font(fontPath).fontSize(10).fillColor("gray")
            .text("Документ сгенерирован автоматически", 250, 55, { width: 300, align: "right" });

        // Horizontal line
        docPdf.moveTo(40, 80).lineTo(550, 80).lineWidth(2).strokeColor("black").stroke();

        // Selected suppliers box
        const uniqueSuppliers = Array.from(new Set(cartItems.map(item => item.selectedSupplier))).map(sup => {
            return sup === "supplier2" ? "Поставщик 1" : 
                   sup === "supplier3" ? "Поставщик 2" :
                   sup === "supplier4" ? "Поставщик 3" : "Логистика";
        });
        
        docPdf.roundedRect(40, 95, 510, 50, 5).lineWidth(1).strokeColor("#cbd5e1").stroke();
        docPdf.font(fontBoldPath).fontSize(10).fillColor("#4f46e5").text("ВЫБРАННЫЕ ПОСТАВЩИКИ:", 50, 105);
        docPdf.font(fontBoldPath).fontSize(10).fillColor("black").text(uniqueSuppliers.join(", "), 60, 122);

        // Table Header
        docPdf.moveTo(40, 160).lineTo(550, 160).lineWidth(2).strokeColor("black").stroke();
        docPdf.font(fontBoldPath).fontSize(8).fillColor("black");
        
        docPdf.text("№", 45, 170, { width: 25, align: "center" });
        docPdf.text("ФОТО", 70, 170, { width: 50, align: "center" });
        docPdf.text("НАИМЕНОВАНИЕ И\nОПИСАНИЕ", 130, 170, { width: 170 });
        docPdf.text("РЕГИОН И\nПОСТАВЩИК", 310, 170, { width: 80 });
        docPdf.text("ЦЕНА", 400, 170, { width: 40, align: "center" });
        docPdf.text("КОЛ-\nВО", 450, 170, { width: 30, align: "center" });
        docPdf.text("СУММА", 490, 170, { width: 50, align: "center" });

        docPdf.moveTo(40, 195).lineTo(550, 195).lineWidth(2).strokeColor("black").stroke();
        
        return 205; // start Y for items
      }

      let currentY = drawHeader();
      let totalSum = 0;
      let i = 1;

      for (const item of cartItems) {
        if (currentY > 750) {
            docPdf.addPage();
            currentY = drawHeader();
        }

        const p = item.product;
        const supName = item.selectedSupplier === "supplier2" ? "Поставщик 1" : 
                        item.selectedSupplier === "supplier3" ? "Поставщик 2" :
                        item.selectedSupplier === "supplier4" ? "Поставщик 3" : "Логистика";
        const sum = item.selectedPrice * item.quantity;
        totalSum += sum;

        const startY = currentY;
        
        // Col 1: Index
        docPdf.font(fontBoldPath).fontSize(8).text(i.toString(), 45, currentY, { width: 25, align: "center" });
        
        // Col 2: Photo (placeholder text or just image if existing)
        let imageDrawn = false;
        if (p.imageBase64 && typeof p.imageBase64 === 'string') {
           try {
               const base64Data = p.imageBase64.replace(/^data:image\/\w+;base64,/, "");
               const imgBuffer = Buffer.from(base64Data, 'base64');
               const jpegBuffer = await sharp(imgBuffer).jpeg().toBuffer();
               docPdf.image(jpegBuffer, 75, currentY, { fit: [40, 40], align: 'center', valign: 'center' });
               imageDrawn = true;
           } catch(e) {
               console.warn("Could not parse image for PDF:", e);
           }
        }
        if (!imageDrawn && p.photoUrl && p.photoUrl.startsWith('http')) {
           try {
               const imgRes = await axios.get(p.photoUrl, { responseType: 'arraybuffer' });
               const jpegBuffer = await sharp(imgRes.data).jpeg().toBuffer();
               docPdf.image(jpegBuffer, 75, currentY, { fit: [40, 40], align: 'center', valign: 'center' });
               imageDrawn = true;
           } catch(e) {
               console.warn("Could not fetch image for PDF:", p.photoUrl);
           }
        }
        if (!imageDrawn) {
            docPdf.font(fontPath).fontSize(8).fillColor("#94a3b8").text("Нет фото", 70, currentY, { width: 50, align: "center" });
        }
        
        // Col 3: Title and Code
        docPdf.font(fontBoldPath).fontSize(9).fillColor("black")
            .text(p.name || "Без названия", 130, currentY, { width: 170 });
        docPdf.font(fontPath).fontSize(8).fillColor("gray")
            .text("Код: " + (p.code || p.id), 130, docPdf.y, { width: 170 });

        // Figure out row height based on how much text was written
        const textH = docPdf.y - startY;
        const finalRowH = Math.max(textH, imageDrawn ? 40 : 30);

        // Col 4: Region & Supplier
        docPdf.font(fontBoldPath).fontSize(8).fillColor("black").text(region, 310, currentY, { width: 80 });
        docPdf.font(fontPath).fontSize(7).fillColor("gray").text(supName, 310, currentY + 12, { width: 80 });
        
        // Col 5: Price
        if (item.selectedPrice > 0) {
            docPdf.font(fontBoldPath).fontSize(8).fillColor("black").text(item.selectedPrice.toFixed(2), 400, currentY, { width: 40, align: "center" });
        } else {
            docPdf.font(fontPath).fontSize(8).fillColor("gray").text("-", 400, currentY, { width: 40, align: "center" });
        }
        
        // Col 6: QTY
        docPdf.font(fontPath).fontSize(8).fillColor("black").text(item.quantity.toString(), 450, currentY, { width: 30, align: "center" });
        
        // Col 7: SUM
        if (item.selectedPrice > 0) {
            docPdf.font(fontBoldPath).fontSize(8).fillColor("black").text(sum.toFixed(2), 490, currentY, { width: 50, align: "center" });
        } else {
            docPdf.font(fontPath).fontSize(8).fillColor("gray").text("-", 490, currentY, { width: 50, align: "center" });
        }

        currentY += finalRowH + 15;
        i++;
      }

      if (logisticsCost > 0) {
        if (currentY > 750) {
           docPdf.addPage();
           currentY = drawHeader();
        }
        docPdf.moveTo(40, currentY).lineTo(550, currentY).lineWidth(1).strokeColor("#e2e8f0").stroke();
        currentY += 10;
        docPdf.font(fontBoldPath).fontSize(10).fillColor("black").text(`Логистика (до ${region})`, 130, currentY, { width: 170 });
        docPdf.text(logisticsCost.toFixed(2), 490, currentY, { width: 50, align: "center" });
        totalSum += logisticsCost;
        currentY += 25;
      }

      docPdf.moveTo(40, currentY).lineTo(550, currentY).lineWidth(2).strokeColor("black").stroke();
      currentY += 10;
      docPdf.font(fontBoldPath).fontSize(14).fillColor("black").text("ИТОГО:", 310, currentY, { width: 80, align: "right" });
      docPdf.text(`${totalSum.toFixed(2)} с.`, 400, currentY, { width: 140, align: "right" });

      docPdf.end();
      const pdfBuffer = await pdfPromise;

      // Excel generation
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Cart");

      ws.columns = [
        { key: "index", width: 8 },
        { key: "name", width: 55 },
        { key: "unit", width: 15 },
        { key: "qty", width: 12 },
        { key: "price", width: 18 },
        { key: "total", width: 20 }
      ];

      ws.mergeCells("A1:F1");
      const titleCell = ws.getCell("A1");
      titleCell.value = "Буҷети сармоягузорӣ";
      titleCell.font = { bold: true, size: 12 };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4BA0DC" } }; // Light blueish
      for (let c = 1; c <= 6; c++) {
         ws.getCell(1, c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      }

      const headerRow = ws.addRow(["#", "Ном ва хусусиятҳо", "Воҳид", "Миқдор", "Нархи як воҳид*", "Ҳамагӣ"]);
      headerRow.eachCell((cell) => {
          cell.font = { bold: true };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4BA0DC" } };
          cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });

      const spheresSet = new Set<string>();
      cartItems.forEach((i) => {
          let s = i.product.sphere;
          if (!s) s = "Общее";
          spheresSet.add(s);
      });

      let overallExcelTotal = 0;

      for (const sphere of Array.from(spheresSet)) {
          const itemsInSphere = cartItems.filter(i => (i.product.sphere || "Общее") === sphere);
          if (itemsInSphere.length === 0) continue;

          // Sphere row
          const sRow = ws.addRow(["", sphere, "", "", "", ""]);
          sRow.getCell(2).font = { bold: true, underline: true };
          sRow.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
          for (let c = 1; c <= 6; c++) {
              sRow.getCell(c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
          }
          
          let sphereTotal = 0;
          
          itemsInSphere.forEach((item, idx) => {
              const sum = item.quantity * item.selectedPrice;
              sphereTotal += sum;
              const r = ws.addRow([
                  idx + 1,
                  item.product.name + (item.product.description ? "\n" + item.product.description : ""),
                  item.product.unit || "шт.",
                  item.quantity,
                  item.selectedPrice > 0 ? item.selectedPrice : "-",
                  item.selectedPrice > 0 ? sum : "-"
              ]);
              r.eachCell((cell, colNumber) => {
                  let horz: "left" | "center" | "right" = "right";
                  if (colNumber === 1) horz = "center";
                  if (colNumber === 2) horz = "left";
                  if (colNumber === 3) horz = "center";

                  cell.alignment = { vertical: "middle", horizontal: horz, wrapText: true };
                  cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
              });
          });
          
          overallExcelTotal += sphereTotal;
          
          // Subtotal row
          const subRow = ws.addRow(["", "", "", "", "Ҷамъ", sphereTotal]);
          subRow.eachCell((cell) => {
              cell.alignment = { vertical: "middle", horizontal: "right" };
              cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
          });
          subRow.getCell(5).font = { bold: true };
      }

      if (logisticsCost > 0) {
          const logRow = ws.addRow(["", "Логистика", "", "", "", logisticsCost]);
          overallExcelTotal += logisticsCost;
          logRow.eachCell((cell) => {
              cell.alignment = { vertical: "middle", horizontal: "right" };
              cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
          });
      }

      const totalRow = ws.addRow(["", "", "", "", "Ҳамагӣ", overallExcelTotal]);
      totalRow.eachCell((cell) => {
          cell.alignment = { vertical: "middle", horizontal: "right" };
          cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });
      totalRow.getCell(5).font = { bold: true };
      totalRow.getCell(6).font = { bold: true };

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
        { filename: "Invoice.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
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
