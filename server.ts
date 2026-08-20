import express from "express";
import path from "path";
import axios from "axios";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { bot } from "./bot.ts";
import { searchImages } from "./src/lib/imageSearch.ts";

dotenv.config();

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

const app = express();
const PORT = 3000;
const SERVER_BUILD_ID = Date.now().toString();

app.get("/api/version", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.json({ buildId: SERVER_BUILD_ID });
});

// Webhook endpoint for Telegram
app.post("/api/bot-webhook", express.json(), (req, res) => {
  if (bot) {
    bot.processUpdate(req.body);
  }
  res.sendStatus(200);
});

// Setup webhook URL (can be called manually when deploying to Cloud Run)
app.get("/api/set-bot-webhook", (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== "string") {
    res.status(400).send("Provide ?url=https://YOUR_DOMAIN/api/bot-webhook");
    return;
  }
  if (bot) {
    bot
      .setWebHook(url)
      .then(() => {
        res.send(`Webhook set successfully to ${url}`);
      })
      .catch((err) => res.status(500).send(String(err)));
  } else {
    res.status(500).send("Bot not initialized");
  }
});

// Increase limit to handle base64 images
app.use(express.json({ limit: "50mb" }));

app.post("/api/parse-product", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64 || !mimeType) {
      res.status(400).json({ error: "Missing imageBase64 or mimeType" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res
        .status(500)
        .json({ error: "GEMINI_API_KEY environment variable is missing." });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
              mimeType: mimeType,
            },
          },
          {
            text: "Analyze the uploaded image. The image may contain multiple products and texts. Extract EACH distinct product visible. For each product, extract its name, description, and category. Set the price to 0 (supplier price will be filled manually). Most importantly, provide the 'box_2d' bounding box for the visual depiction of the product's photo in [ymin, xmin, ymax, xmax] format normalized between 0 and 1000.\nReturn a JSON object with a 'products' array.",
          },
        ],
      },
      config: {
        systemInstruction:
          "You are an expert procurement and tender data extraction AI. Your job is to extract product equipment specs from images.\n\nCRITICAL RESTRICTIONS AND FORMATTING RULES FOR DESCRIPTION AND NAME:\n1. Focus ONLY on main technical parameters and specifications. STRICTLY EXCLUDE promotional text, package contents/inclusions (e.g., 'В комплекте...', 'Сумка', 'инструкция', etc.), and full sentences. DO NOT include what is included in the box.\n2. BRANDS, MODELS, AND IDENTIFIERS MUST BE PRESERVED: If the photo or text mentions a specific brand, model name, manufacturer, abbreviation, or serial number, you MUST include it in the product 'name', formatted as '<Product type> - <Brand/Model>' (e.g., 'Дрель - Total 2020', 'Перфоратор - Makita HR2470', 'Кабель - ГОСТ 3х2.5'). Do NOT strip or generalize these names; include them so users can identify the exact model in the catalog.\n3. TENDER SPECIFICATION FORMAT (MATH SYMBOLS): You MUST transform parameters into a flexible format for procurement using mathematical symbols limits. For example:\n - Use '≤' for maximum limits (voltage, power, weight, dimensions that shouldn't be exceeded) -> 'Мощность: ≤ 2 кВт', 'Напряжение: ≤ 220 В', 'Вес: ≤ 1.5 кг'.\n - Use '≥' for minimum capacities (size, speed, volume, strength) -> 'Скорость: ≥ 1500 Об/мин', 'Зажим: ≥ 10мм'.\n - Append 'или аналог' to materials and specific component types -> 'Аккумулятор: Li-Ion или аналог'.\n\nEnsure ALL extracted parameters are formatted this way. Do not write 'Не более' or 'Не менее', use '≤' and '≥'.\n\nIMPORTANT: Each parameter in the 'description' field MUST be separated by a newline character (\\n). Do NOT use semicolons or commas to separate distinct parameters.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            products: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Product name" },
                  description: {
                    type: Type.STRING,
                    description: "Product description extracted from text",
                  },
                  category: {
                    type: Type.STRING,
                    description: "Product category",
                  },
                  price: { type: Type.NUMBER, description: "Price as number" },
                  box_2d: {
                    type: Type.ARRAY,
                    description:
                      "[ymin, xmin, ymax, xmax] coordinates of the product photo, normalized from 0 to 1000",
                    items: { type: Type.NUMBER },
                  },
                },
                required: [
                  "name",
                  "description",
                  "category",
                  "price",
                  "box_2d",
                ],
              },
            },
          },
          required: ["products"],
        },
      },
    });

    const data = JSON.parse(response.text || "{}");
    res.json(data);
  } catch (error: any) {
    console.error("Error parsing product:", error);

    let errorMessage = error.message || "Неизвестная ошибка";
    const errorStr =
      typeof error === "object" ? JSON.stringify(error) : String(error);

    if (
      errorMessage.includes("RESOURCE_EXHAUSTED") ||
      errorMessage.includes("quota") ||
      errorMessage.includes("Quota exceeded") ||
      errorMessage.includes("429") ||
      errorStr.includes("RESOURCE_EXHAUSTED") ||
      errorStr.includes("Quota exceeded") ||
      errorStr.includes("429") ||
      errorStr.includes("RESOURCE_LIMIT")
    ) {
      errorMessage =
        "Превышен бесплатный лимит запросов к ИИ (Gemini API limit). Пожалуйста, подождите 1 минуту или введите товар вручную с помощью кнопки 'Новый товар'.";
    }

    res.status(500).json({ error: errorMessage });
  }
});

app.post("/api/normalize-name", async (req, res) => {
  try {
    const { name, description, category, imageBase64, mimeType } = req.body;
    if (!name) {
      res.status(400).json({ error: "Missing name" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res
        .status(500)
        .json({ error: "GEMINI_API_KEY environment variable is missing." });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const parts: any[] = [];
    if (imageBase64 && mimeType) {
      parts.push({
        inlineData: {
          data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
          mimeType: mimeType,
        },
      });
    }
    parts.push({
      text: `Analyze the provided product information (and image if available).\n\nCurrent Name: ${name}\nDescription: ${description || "N/A"}\nCategory: ${category || "N/A"}\n\nYour task is to redefine the product's Name to be clear, professional, concise, and in Russian. If a brand name, model name, manufacturer, abbreviation, or serial number is present, you MUST preserve it and include it in the format '<Product Type> - <Brand/Model>' (e.g., 'Дрель - Total 2020', 'Перфоратор - Makita HR2470', 'Дрель ударная - Bosch GSB 13 RE'). Provide ONLY the new standardized name as a string.`,
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: parts,
      },
      config: {
        systemInstruction:
          "You are a data entry and naming expert. Given a product's current description and name, generate a clear, concise, professional name. If a brand, model, or identifying text is present, preserve it and format the name as '<Product Type> - <Brand/Model>' (e.g., 'Дрель - Total 2020', 'Перфоратор - Makita HR2470'). Output only the name string.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            normalizedName: {
              type: Type.STRING,
              description: "The newly generated concise and clear product name",
            },
          },
          required: ["normalizedName"],
        },
      },
    });

    const data = JSON.parse(response.text || "{}");
    res.json(data);
  } catch (error: any) {
    console.error("Error normalizing name:", error);
    let errorMessage = error.message || "Неизвестная ошибка";
    res.status(500).json({ error: errorMessage });
  }
});

app.post("/api/search-images", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      res.status(400).json({ error: "No query provided" });
      return;
    }
    const results = await searchImages(query);
    res.json({ results });
  } catch (error: any) {
    console.error("Error searching images:", error);
    res.status(500).json({ error: "Error searching images: " + error.message });
  }
});

app.post("/api/fetch-image", async (req, res) => {
  try {
    const { url, thumb } = req.body;
    if (!url && !thumb) {
      res.status(400).json({ error: "Missing url" });
      return;
    }

    const fetchSingleUrl = async (targetUrl: string, timeoutMs: number = 6000) => {
      try {
        let referer = "https://www.google.com/";
        if (targetUrl.includes("bing.net") || targetUrl.includes("bing.com")) referer = "https://www.bing.com/";
        if (targetUrl.includes("yandex.")) referer = "https://yandex.ru/";
        if (targetUrl.includes("ozone.ru") || targetUrl.includes("ozon.ru")) referer = "https://www.ozon.ru/";

        const response = await axios.get(targetUrl, {
          responseType: "arraybuffer",
          timeout: timeoutMs,
          maxRedirects: 5,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            Referer: referer,
          },
        });

        if (response.status === 200 && response.data) {
          const buffer = Buffer.from(response.data);
          let mimeType = String(response.headers["content-type"] || "image/jpeg");
          if (mimeType.includes(";")) {
            mimeType = mimeType.split(";")[0].trim();
          }
          if (!mimeType.startsWith("image/")) {
            mimeType = "image/jpeg";
          }
          const base64 = buffer.toString("base64");
          return { mimeType, base64: `data:${mimeType};base64,${base64}` };
        }
      } catch (e: any) {
        // Fall through
      }
      return null;
    };

    let result = url ? await fetchSingleUrl(url, 3000) : null;
    if (!result && thumb) {
      result = await fetchSingleUrl(thumb, 4000);
    }

    if (result) {
      res.json(result);
    } else {
      res.status(500).json({ error: "Не удалось загрузить изображение" });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html") || filePath.endsWith("sw.js")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      }
    }));
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
