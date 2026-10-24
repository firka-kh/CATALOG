/**
 * Hardware Device Fingerprint & Forensics Module
 * Generates an indelible technical snapshot of the physical equipment
 * used by an operator (screen, CPU, RAM, GPU renderer, canvas hash, IP, timezone).
 *
 * NOTE: Strict compliance with user instructions:
 * Does NOT label devices as "служебный" / "корпоративный",
 * because field operators may work on personal or varying equipment.
 * Focuses purely on factual technical hardware proof.
 */

export interface DeviceAuditInfo {
  fingerprintId: string; // Unique deterministic hash for this specific hardware & renderer
  deviceType: "Планшет" | "Смартфон" | "ПК / Ноутбук" | "Неизвестное устройство";
  os: string; // e.g. "Android 14", "Windows 11", "iOS 17.4", "macOS Sonoma"
  browser: string; // e.g. "Chrome 122.0.0", "Safari 17.2"
  screenResolution: string; // e.g. "2560x1600 (DPR 2.5x)"
  colorDepth: number; // e.g. 24 or 32
  cpuCores: number; // navigator.hardwareConcurrency (e.g. 8)
  memoryGb?: number; // navigator.deviceMemory (e.g. 8)
  gpuRenderer: string; // WebGL unmasked renderer (e.g. "Mali-G78", "Intel Iris Xe")
  gpuVendor: string; // WebGL unmasked vendor (e.g. "ARM", "Intel", "Google Inc.")
  canvasHash: string; // Cryptographic hash of canvas 2D subpixel rendering
  touchPoints: number; // navigator.maxTouchPoints
  timezone: string; // e.g. "Asia/Dushanbe"
  timezoneOffsetMinutes: number;
  language: string; // e.g. "ru-RU"
  ipAddress?: string; // e.g. "217.11.182.44"
  capturedAtTimestamp: number;
  capturedAtFormatted: string;
  summary: string; // Concise one-line audit trail
}

// Memory cache for the session so we don't re-run expensive checks or re-fetch IP constantly
let cachedDeviceAudit: DeviceAuditInfo | null = null;
let cachedIpAddress: string | null = null;

/**
 * Fast synchronous string hash (FNV-1a / Murmur hybrid) producing hex string
 */
function fastHash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return Math.abs(combined).toString(16).toUpperCase();
}

/**
 * Generate canvas rendering fingerprint hash
 */
function getCanvasFingerprint(): string {
  try {
    if (typeof document === "undefined") return "NO_CANVAS";
    const canvas = document.createElement("canvas");
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "NO_CTX";

    // Draw background with subtle gradient
    const grad = ctx.createLinearGradient(0, 0, 280, 0);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(0.5, "#4338ca");
    grad.addColorStop(1, "#065f46");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 280, 60);

    // Text rendering with subpixel anti-aliasing variations
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial', 'Segoe UI', 'Roboto', sans-serif";
    ctx.fillStyle = "#facc15";
    ctx.fillText("SPMEI-AUDIT-FP v2.0 ⚡", 10, 8);

    // Geometry with alpha blend
    ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(220, 28, 18, 0, Math.PI * 2);
    ctx.stroke();

    // Emoji rendering (highly unique per OS font engine)
    ctx.font = "16px sans-serif";
    ctx.fillText("🛡️📋✅", 140, 32);

    const dataUrl = canvas.toDataURL();
    return fastHash(dataUrl).padStart(12, "0").slice(0, 12);
  } catch (e) {
    return "CANVAS_ERR";
  }
}

/**
 * Query WebGL unmasked graphics renderer & vendor
 */
function getWebGLInfo(): { renderer: string; vendor: string } {
  try {
    if (typeof document === "undefined") return { renderer: "N/A", vendor: "N/A" };
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;

    if (!gl) {
      return { renderer: "Software / WebGL Not Supported", vendor: "N/A" };
    }

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "";
      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "";
      return {
        renderer: String(renderer).trim() || "Generic WebGL",
        vendor: String(vendor).trim() || "Generic Vendor",
      };
    }

    const basicRenderer = gl.getParameter(gl.RENDERER) || "";
    const basicVendor = gl.getParameter(gl.VENDOR) || "";
    return {
      renderer: String(basicRenderer).trim() || "Standard GPU",
      vendor: String(basicVendor).trim() || "Standard",
    };
  } catch (e) {
    return { renderer: "GPU Detection Error", vendor: "N/A" };
  }
}

/**
 * Parse Operating System and Version accurately
 */
function detectOS(ua: string): string {
  if (/windows phone/i.test(ua)) return "Windows Phone";
  if (/win(dows )?nt 10\.0/i.test(ua)) {
    return "Windows 10/11";
  }
  if (/win(dows )?nt 6\.3/i.test(ua)) return "Windows 8.1";
  if (/win(dows )?nt 6\.1/i.test(ua)) return "Windows 7";
  if (/android/i.test(ua)) {
    const match = ua.match(/android\s+([0-9.]+)/i);
    return match ? `Android ${match[1]}` : "Android";
  }
  if (/ipad|iphone|ipod/i.test(ua)) {
    const match = ua.match(/os\s+([0-9_]+)/i);
    const ver = match ? match[1].replace(/_/g, ".") : "";
    return ver ? `iOS ${ver}` : "iOS";
  }
  // iPad on iOS 13+ reports as MacIntel with touch
  if (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) {
    return "iPadOS (Apple Silicon)";
  }
  if (/macintosh|mac os x/i.test(ua)) {
    const match = ua.match(/mac os x\s+([0-9_]+)/i);
    const ver = match ? match[1].replace(/_/g, ".") : "";
    return ver ? `macOS ${ver}` : "macOS";
  }
  if (/cros/i.test(ua)) return "ChromeOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Другая ОС";
}

/**
 * Detect Device Type (Планшет / Смартфон / ПК / Ноутбук)
 */
function detectDeviceType(ua: string): "Планшет" | "Смартфон" | "ПК / Ноутбук" | "Неизвестное устройство" {
  if (typeof window === "undefined") return "Неизвестное устройство";

  const touchPoints = typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0;
  const screenMin = Math.min(window.screen.width || 0, window.screen.height || 0);

  // iPad on iOS 13+
  const isIPad =
    /ipad/i.test(ua) ||
    (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && touchPoints > 1);

  // Android tablets usually have "Android" without "Mobile" or have larger screen
  const isAndroidTablet = /android/i.test(ua) && !/mobile/i.test(ua);
  const isGeneralTablet = /(tablet|playbook|silk)|(android(?!.*mobi))/i.test(ua);

  if (isIPad || isAndroidTablet || isGeneralTablet || (touchPoints > 0 && screenMin >= 600 && screenMin <= 1200)) {
    return "Планшет";
  }

  // Smartphones
  if (/(iphone|ipod|windows phone)/i.test(ua) || (/android/i.test(ua) && /mobile/i.test(ua)) || (touchPoints > 0 && screenMin < 600)) {
    return "Смартфон";
  }

  // Desktop or Laptop
  if (/windows|macintosh|linux|cros/i.test(ua) || touchPoints === 0) {
    return "ПК / Ноутбук";
  }

  return "Неизвестное устройство";
}

/**
 * Parse Browser name and version
 */
function detectBrowser(ua: string): string {
  if (/edg\//i.test(ua)) {
    const m = ua.match(/edg\/([0-9.]+)/i);
    return m ? `Edge ${m[1]}` : "Edge";
  }
  if (/opr\/|opera/i.test(ua)) {
    const m = ua.match(/(opr|opera)\/([0-9.]+)/i);
    return m ? `Opera ${m[2]}` : "Opera";
  }
  if (/chrome|crios/i.test(ua)) {
    const m = ua.match(/(chrome|crios)\/([0-9.]+)/i);
    return m ? `Chrome ${m[2]}` : "Chrome";
  }
  if (/firefox|fxios/i.test(ua)) {
    const m = ua.match(/(firefox|fxios)\/([0-9.]+)/i);
    return m ? `Firefox ${m[1]}` : "Firefox";
  }
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
    const m = ua.match(/version\/([0-9.]+)/i);
    return m ? `Safari ${m[1]}` : "Safari";
  }
  return "Браузер";
}

/**
 * Fetch public IP address with short timeout (non-blocking)
 */
async function fetchPublicIp(): Promise<string> {
  if (cachedIpAddress) return cachedIpAddress;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800);

    const res = await fetch("https://api.ipify.org?format=json", {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.ip) {
        cachedIpAddress = String(data.ip).trim();
        return cachedIpAddress;
      }
    }
  } catch (e) {
    // Graceful fallback if offline or blocked
  }

  return "IP не определен (локальная сеть)";
}

/**
 * Main function: capture full hardware & device forensic snapshot
 */
export async function captureDeviceAudit(options?: { forceRefresh?: boolean }): Promise<DeviceAuditInfo> {
  if (cachedDeviceAudit && !options?.forceRefresh) {
    return cachedDeviceAudit;
  }

  const now = new Date();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const os = detectOS(ua);
  const deviceType = detectDeviceType(ua);
  const browser = detectBrowser(ua);
  const touchPoints = typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0;
  const cpuCores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 0 : 0;
  const memoryGb = typeof navigator !== "undefined" && (navigator as any).deviceMemory ? (navigator as any).deviceMemory : undefined;

  const width = typeof window !== "undefined" ? window.screen.width : 0;
  const height = typeof window !== "undefined" ? window.screen.height : 0;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const screenResolution = `${width}x${height} (DPR ${dpr.toFixed(1)}x)`;
  const colorDepth = typeof window !== "undefined" ? window.screen.colorDepth || 24 : 24;

  const { renderer: gpuRenderer, vendor: gpuVendor } = getWebGLInfo();
  const canvasHash = getCanvasFingerprint();

  let timezone = "UTC";
  let tzOffset = 0;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Dushanbe";
    tzOffset = now.getTimezoneOffset();
  } catch (e) {
    timezone = "Asia/Dushanbe";
  }

  const language = typeof navigator !== "undefined" ? navigator.language || "ru-RU" : "ru-RU";

  // Async public IP fetch
  const ipAddress = await fetchPublicIp();

  // Deterministic Fingerprint ID combining core immutable hardware components
  const hardwareRaw = [
    os,
    cpuCores,
    memoryGb || 0,
    gpuRenderer,
    gpuVendor,
    screenResolution,
    colorDepth,
    canvasHash,
    touchPoints,
    timezone,
  ].join("::");

  const fpHash = fastHash(hardwareRaw).padStart(12, "0").toUpperCase();
  const fingerprintId = `DFP-${fpHash.slice(0, 4)}-${fpHash.slice(4, 8)}-${fpHash.slice(8, 12)}`;

  // Formatted Russian audit summary string (WITHOUT false "доверенный служебный" claim)
  const cpuPart = cpuCores > 0 ? `${cpuCores} ядер CPU` : "";
  const memPart = memoryGb ? `${memoryGb} ГБ RAM` : "";
  const gpuShort = gpuRenderer.length > 36 ? gpuRenderer.substring(0, 34) + "…" : gpuRenderer;
  const ipPart = ipAddress && !ipAddress.includes("не определен") ? `IP ${ipAddress}` : "";

  const hardwareSpecs = [cpuPart, memPart, screenResolution, gpuShort].filter(Boolean).join(", ");
  const summary = `${deviceType} (${os}, ${hardwareSpecs}${ipPart ? `, ${ipPart}` : ""}) • [ID: ${fingerprintId}]`;

  const auditInfo: DeviceAuditInfo = {
    fingerprintId,
    deviceType,
    os,
    browser,
    screenResolution,
    colorDepth,
    cpuCores,
    memoryGb,
    gpuRenderer,
    gpuVendor,
    canvasHash,
    touchPoints,
    timezone,
    timezoneOffsetMinutes: tzOffset,
    language,
    ipAddress,
    capturedAtTimestamp: now.getTime(),
    capturedAtFormatted: now.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    summary,
  };

  cachedDeviceAudit = auditInfo;
  return auditInfo;
}

/**
 * Synchronous quick getter if cached or quick fallback
 */
export function getQuickDeviceSnapshot(): { fingerprintId: string; summary: string; deviceType: string } {
  if (cachedDeviceAudit) {
    return {
      fingerprintId: cachedDeviceAudit.fingerprintId,
      summary: cachedDeviceAudit.summary,
      deviceType: cachedDeviceAudit.deviceType,
    };
  }

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const os = detectOS(ua);
  const type = detectDeviceType(ua);
  return {
    fingerprintId: "DFP-PENDING",
    summary: `${type} (${os})`,
    deviceType: type,
  };
}
